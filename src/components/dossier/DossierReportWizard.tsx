/**
 * Dossier Report Wizard – additive feature only.
 * Generates a merged dossier PDF for an equipment: cover, index, sub-covers, selected docs.
 * Reads from existing data (firm, equipment docs, VDCR, project docs); no changes to existing APIs.
 */

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  fastAPI,
  getEquipmentDocuments,
  getStandaloneEquipmentDocuments,
  getDocumentUrlById,
  getDocumentUrlsByIds,
} from '@/lib/api';
import { X, FileText, Upload, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Loader2, BookMarked, Eye, Zap, Image as ImageIcon, GripVertical, Pipette } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import html2canvas from 'html2canvas';

/** Theme color presets for cover/sub-cover (Canva-style, match logo) */
const THEME_COLORS = [
  { name: 'Navy', hex: '#1e3a5f' },
  { name: 'Slate', hex: '#475569' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Forest', hex: '#166534' },
  { name: 'Burgundy', hex: '#881337' },
  { name: 'Charcoal', hex: '#1f2937' },
  { name: 'Deep blue', hex: '#1e40af' },
];

/** Cover table fields (NAFTech/reference style) – all editable */
const COVER_TABLE_FIELDS = ['Client', 'PO No.', 'Equipment No.', 'Drawing No.', 'Job No.', 'Inspected By'] as const;

/** SVG path for rounded rectangle (0,0) to (w,h), radius r; PDF coords (y up). */
function roundedRectSvgPath(w: number, h: number, r: number): string {
  const s = Math.min(r, w / 2, h / 2);
  return `M ${s},0 L ${w - s},0 Q ${w},0 ${w},${s} L ${w},${h - s} Q ${w},${h} ${w - s},${h} L ${s},${h} Q 0,${h} 0,${h - s} L 0,${s} Q 0,0 ${s},0 Z`;
}

/** SVG path for rect (0,0) to (w,h) with only top-left and top-right corners rounded (radius r). */
function roundedTopRectSvgPath(w: number, h: number, r: number): string {
  const s = Math.min(r, w / 2, h);
  return `M ${s},${h} L ${w - s},${h} Q ${w},${h} ${w},${h - s} L ${w},0 L 0,0 L 0,${h - s} Q 0,${h} ${s},${h} Z`;
}

/** SVG path for rect (0,0) to (w,h) with only bottom-left and bottom-right corners rounded (path y=0). Use for index header so drawSvgPath y-flip shows rounded corners at top in PDF. */
function roundedBottomRectSvgPath(w: number, h: number, r: number): string {
  const s = Math.min(r, w / 2, h);
  return `M ${s},0 L ${w - s},0 Q ${w},0 ${w},${s} L ${w},${h} L 0,${h} L 0,${s} Q 0,0 ${s},0 Z`;
}

/** SVG path for one quarter-circle corner mask (bottom-left style): fills corner at origin, radius r. */
function cornerMaskSvgPath(r: number): string {
  return `M ${r},0 L 0,0 L 0,${r} Q ${r},${r} ${r},0 Z`;
}

/** Contrasting text color for a background (RGB 0–1). Returns white or black for readability. */
function contrastingTextColor(r: number, g: number, b: number): { type: 'RGB'; red: number; green: number; blue: number } {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.5
    ? { type: 'RGB', red: 1, green: 1, blue: 1 }
    : { type: 'RGB', red: 0, green: 0, blue: 0 };
}

/** Strip file extension from document name for sub-cover title (e.g. "Doc.pdf" → "Doc"). */
function stripFileExtension(name: string): string {
  if (!name || !name.includes('.')) return name;
  const lastDot = name.lastIndexOf('.');
  const ext = name.slice(lastDot + 1).toLowerCase();
  const knownExt = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'dwg', 'dxf', 'jpg', 'jpeg', 'png'];
  if (knownExt.includes(ext)) return name.slice(0, lastDot).trimEnd();
  return name;
}

/** Extract up to 6 dominant theme-suitable colors from an image URL (e.g. logo). Skips near-white and near-black. */
function extractColorsFromImageUrl(url: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const maxSize = 120;
        const w = Math.min(img.naturalWidth, maxSize);
        const h = Math.min(img.naturalHeight, maxSize);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve([]);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const step = 4;
        const q = 32;
        const bucket = new Map<string, number>();
        for (let i = 0; i < data.length; i += step) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          if (luminance > 0.92 || luminance < 0.12) continue;
          const kr = Math.min(Math.floor(r / 256 * q), q - 1);
          const kg = Math.min(Math.floor(g / 256 * q), q - 1);
          const kb = Math.min(Math.floor(b / 256 * q), q - 1);
          const key = `${kr},${kg},${kb}`;
          bucket.set(key, (bucket.get(key) || 0) + 1);
        }
        const sorted = [...bucket.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([k]) => {
            const [kr, kg, kb] = k.split(',').map(Number);
            const r = Math.round((kr + 0.5) / q * 255);
            const g = Math.round((kg + 0.5) / q * 255);
            const b = Math.round((kb + 0.5) / q * 255);
            return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
          });
        resolve(sorted);
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = url;
  });
}

/** Cover template styles from design inspiration */
const COVER_TEMPLATES = [
  { id: 'classic', name: 'Classic', desc: 'Clean border, logo, title, image, table' },
  { id: 'corporate', name: 'Corporate', desc: 'Header band, circular image, accent color' },
  { id: 'industrial', name: 'Industrial', desc: 'Bold dark + accent, circular image' },
  { id: 'brochure', name: 'Brochure', desc: 'Diagonal split, modern layout' },
] as const;
type CoverTemplateId = (typeof COVER_TEMPLATES)[number]['id'];

export interface DossierParams {
  projectId: string;
  equipmentId: string;
  projectName: string;
  equipment: { id: string; tagNumber?: string; name?: string; type?: string;[key: string]: unknown };
}

type DocSource = 'equipment' | 'project_documentation' | 'project_docs' | 'user_upload';

export interface DossierDocItem {
  id: string;
  source: DocSource;
  name: string;
  /** URL for PDF/content fetch; may be empty for user uploads (use file) */
  url?: string;
  /** User-uploaded file (object URL or File) */
  file?: File;
  /** Optional doc number / equipment doc number */
  docNumber?: string;
  /** For VDCR: internal_doc_no, client_doc_no, etc. */
  internalDocNo?: string;
  clientDocNo?: string;
  /** Sub-cover group id (user can group multiple docs under one sub-cover) */
  subCoverGroupId?: string;
  /** User-defined title for this doc (default: name) */
  subCoverTitle?: string;
  /** Optional notes for sub-cover */
  subCoverNotes?: string;
  /** Order within dossier */
  order?: number;
}

type PreloadStatus = 'idle' | 'loading' | 'done' | 'error';

interface DossierReportWizardProps {
  params: DossierParams;
  onClose: () => void;
}

const STEPS = ['Select documents', 'Structure & sub-covers', 'Export'] as const;
type StepId = (typeof STEPS)[number];

export default function DossierReportWizard({ params, onClose }: DossierReportWizardProps) {
  const { firmData } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<StepId>('Select documents');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Fetched data
  const [equipmentDocs, setEquipmentDocs] = useState<DossierDocItem[]>([]);
  const [projectDocDocs, setProjectDocDocs] = useState<DossierDocItem[]>([]);
  const [projectDocs, setProjectDocs] = useState<DossierDocItem[]>([]);
  const [userUploads, setUserUploads] = useState<DossierDocItem[]>([]);

  // Selection: which doc ids are included (id = item.id for all sources)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Structure: sub-cover groups. Key = groupId, value = { title, note, docIds[] }
  const [subCoverGroups, setSubCoverGroups] = useState<Record<string, { title: string; note: string; docIds: string[] }>>({});
  // Per-doc overrides (title, notes) when not in a group
  const [docOverrides, setDocOverrides] = useState<Record<string, { title: string; notes: string }>>({});
  // Pre-load cache for faster export: doc id -> PDF ArrayBuffer (Step 1 only)
  const [preloadedBlobs, setPreloadedBlobs] = useState<Record<string, ArrayBuffer>>({});
  const [preloadStatus, setPreloadStatus] = useState<Record<string, PreloadStatus>>({});
  const [preloadingAll, setPreloadingAll] = useState(false);
  // Export progress for visual loader (Step 3)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; phase: string } | null>(null);

  // Design state: cover, sub-cover, index (leave export logic untouched)
  const [progressImagesList, setProgressImagesList] = useState<Array<{ image_url: string; created_at?: string }>>([]);
  const [selectedCoverImageUrl, setSelectedCoverImageUrl] = useState<string | null>(null);
  const [coverThemeColor, setCoverThemeColor] = useState(THEME_COLORS[0].hex);
  const [coverBorderStyle, setCoverBorderStyle] = useState<'none' | 'thin' | 'bold'>('bold');
  const [coverDetails, setCoverDetails] = useState<Record<string, string>>({});
  const [subCoverThemeColor, setSubCoverThemeColor] = useState(THEME_COLORS[0].hex);
  const [subCoverBorderStyle, setSubCoverBorderStyle] = useState<'none' | 'thin' | 'bold'>('thin');
  /** Theme colors suggested from logo (extracted when company logo URL is set). */
  const [logoThemeColors, setLogoThemeColors] = useState<string[]>([]);
  /** Theme color UI: show advanced (other colors / picker) */
  const [themeColorExpanded, setThemeColorExpanded] = useState(false);
  /** Set theme color for both cover and sub-cover in one shot. */
  const setThemeColor = useCallback((hex: string) => {
    setCoverThemeColor(hex);
    setSubCoverThemeColor(hex);
  }, []);
  const [indexFontSize, setIndexFontSize] = useState(11);
  const [indexTitleColor, setIndexTitleColor] = useState('#1f2937');
  const [coverTemplate, setCoverTemplate] = useState<CoverTemplateId>('classic');
  const [projectData, setProjectData] = useState<Record<string, unknown> | null>(null);
  /** Doc order in dossier (for reorder; default = selection order). Export uses this order. */
  const [dossierDocOrder, setDossierDocOrder] = useState<string[]>([]);
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dragOverDocId, setDragOverDocId] = useState<string | null>(null);
  /** Watermark (company logo) on pages: enable, size %, opacity 0–1, placement */
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [watermarkSize, setWatermarkSize] = useState(80);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.18);
  const [watermarkPlacement, setWatermarkPlacement] = useState<'center' | 'top-center' | 'bottom-center'>('center');
  const [additionalSettingsExpanded, setAdditionalSettingsExpanded] = useState(false);
  /** Cover preview layout: grander title, logo size, alignment */
  const [coverLogoSize, setCoverLogoSize] = useState(48);
  const [coverDossierLineFontSize, setCoverDossierLineFontSize] = useState(18);
  /** Sub-cover preview layout */
  const [subCoverLogoSize, setSubCoverLogoSize] = useState(40);
  const [subCoverTitleFontSize, setSubCoverTitleFontSize] = useState(20);
  /** Cover page image: full-width in preview & export; height from preset (regular 180, medium 220, larger 280) */
  const [coverImageHeight, setCoverImageHeight] = useState(220);
  const COVER_IMAGE_HEIGHT_PRESETS = { regular: 180, medium: 220, larger: 280 } as const;
  const coverImageHeightPreset = coverImageHeight <= 200 ? 'regular' : coverImageHeight <= 250 ? 'medium' : 'larger';
  /** Cover editable lines: tagline under company name; dossier title line (defaults to "Dossier of tag – name"); extra line below */
  const [coverCompanyTagline, setCoverCompanyTagline] = useState('');
  const [coverDossierTitleLine, setCoverDossierTitleLine] = useState('');
  const [coverExtraLine, setCoverExtraLine] = useState('');
  /** Center-align cover content (logo, name, lines, image) – best for vertical/portrait cover images */
  const [coverLayoutCenter, setCoverLayoutCenter] = useState(false);
  /** Cover image zoom (scale) and pan for crop before export; export captures as-is */
  const [coverImageScale, setCoverImageScale] = useState(1);
  const [coverZoomPctInput, setCoverZoomPctInput] = useState('100');
  const [coverImagePanX, setCoverImagePanX] = useState(0);
  const [coverImagePanY, setCoverImagePanY] = useState(0);
  /** When true, cover preview renders without empty optional lines/placeholders for WYSIWYG capture */
  const [coverCapturingForExport, setCoverCapturingForExport] = useState(false);
  /** Ref to cover preview card – captured as image for WYSIWYG PDF cover */
  const coverPreviewRef = useRef<HTMLDivElement>(null);
  const coverImageDragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  /** Cover image natural size (for contain-box render during capture so html2canvas captures correctly) */
  const [coverImageNaturalSize, setCoverImageNaturalSize] = useState<{ w: number; h: number } | null>(null);
  /** Container width during capture (measured so we can render contain box for html2canvas) */
  const [captureContainerWidth, setCaptureContainerWidth] = useState<number | null>(null);
  const coverImageContainerRef = useRef<HTMLDivElement>(null);
  /** Object URL for manually uploaded cover image; revoke when changing image or unmounting */
  const uploadedCoverObjectUrlRef = useRef<string | null>(null);

  const isStandalone = params.projectId === 'standalone';
  const equipmentTag = params.equipment?.tagNumber || params.equipment?.id?.slice(0, 8) || 'Equipment';
  const equipmentDisplayName = params.equipment?.name || params.equipment?.type || equipmentTag;

  // Initialize editable cover details (NAFTech-style: Client, PO No., Equipment No., Drawing No., Job No., Inspected By)
  useEffect(() => {
    const eq = params.equipment as Record<string, unknown> | undefined;
    const proj = projectData as Record<string, unknown> | null;
    setCoverDetails((prev) => {
      const base: Record<string, string> = {};
      for (const key of COVER_TABLE_FIELDS) {
        const existing = prev[key];
        if (existing !== undefined && existing !== '') {
          base[key] = existing;
          continue;
        }
        if (key === 'Client') base[key] = (proj?.client as string) ?? '';
        else if (key === 'PO No.') base[key] = (proj?.po_number as string) ?? (proj?.poNumber as string) ?? '';
        else if (key === 'Equipment No.') base[key] = equipmentTag;
        else if (key === 'Drawing No.') base[key] = (eq?.drawing_no as string) ?? (eq?.drawingNo as string) ?? '';
        else if (key === 'Job No.') base[key] = (proj?.job_no as string) ?? (eq?.job_no as string) ?? '';
        else if (key === 'Inspected By') base[key] = (eq?.inspected_by as string) ?? '';
        else base[key] = existing ?? '';
      }
      return base;
    });
  }, [equipmentTag, projectData, params.equipment]);

  useEffect(() => {
    setCoverImageScale(1);
    setCoverImagePanX(0);
    setCoverImagePanY(0);
    setCoverImageNaturalSize(null);
    setCoverZoomPctInput('100');
  }, [selectedCoverImageUrl]);

  useEffect(() => {
    setCoverZoomPctInput(String(Math.round(coverImageScale * 100)));
  }, [coverImageScale]);

  useLayoutEffect(() => {
    if (coverCapturingForExport && selectedCoverImageUrl && coverImageContainerRef.current) {
      const rect = coverImageContainerRef.current.getBoundingClientRect();
      setCaptureContainerWidth(rect.width);
    } else if (!coverCapturingForExport) {
      setCaptureContainerWidth(null);
    }
  }, [coverCapturingForExport, selectedCoverImageUrl]);

  const handleCoverImageMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectedCoverImageUrl) return;
    e.preventDefault();
    coverImageDragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: coverImagePanX, startPanY: coverImagePanY };
  }, [coverImagePanX, coverImagePanY, selectedCoverImageUrl]);
  const handleCoverImageMouseMove = useCallback((e: MouseEvent) => {
    const d = coverImageDragRef.current;
    if (!d) return;
    setCoverImagePanX(d.startPanX + e.clientX - d.startX);
    setCoverImagePanY(d.startPanY + e.clientY - d.startY);
  }, []);
  const handleCoverImageMouseUp = useCallback(() => {
    coverImageDragRef.current = null;
  }, []);
  useEffect(() => {
    window.addEventListener('mousemove', handleCoverImageMouseMove);
    window.addEventListener('mouseup', handleCoverImageMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleCoverImageMouseMove);
      window.removeEventListener('mouseup', handleCoverImageMouseUp);
    };
  }, [handleCoverImageMouseMove, handleCoverImageMouseUp]);
  // Fetch progress images for this equipment (cover image picker; default to latest)
  const hasSetDefaultCoverImageRef = React.useRef(false);
  useEffect(() => {
    hasSetDefaultCoverImageRef.current = false;
  }, [params.equipmentId]);
  useEffect(() => {
    let cancelled = false;
    fastAPI.getProgressImagesForEquipment(params.equipmentId, isStandalone).then((list) => {
      if (cancelled) return;
      setProgressImagesList(list);
      if (list.length > 0 && !hasSetDefaultCoverImageRef.current) {
        hasSetDefaultCoverImageRef.current = true;
        if (uploadedCoverObjectUrlRef.current) {
          URL.revokeObjectURL(uploadedCoverObjectUrlRef.current);
          uploadedCoverObjectUrlRef.current = null;
        }
        setSelectedCoverImageUrl(list[0].image_url);
      }
    });
    return () => { cancelled = true; };
  }, [params.equipmentId, isStandalone]);
  // Ensure a cover image is selected whenever we have progress images but no selection (e.g. list loaded after mount)
  useEffect(() => {
    if (progressImagesList.length > 0 && !selectedCoverImageUrl) {
      setSelectedCoverImageUrl(progressImagesList[0].image_url);
    }
  }, [progressImagesList, selectedCoverImageUrl]);

  // Revoke uploaded cover object URL on unmount to avoid leaks
  useEffect(() => {
    return () => {
      if (uploadedCoverObjectUrlRef.current) {
        URL.revokeObjectURL(uploadedCoverObjectUrlRef.current);
        uploadedCoverObjectUrlRef.current = null;
      }
    };
  }, []);

  const coverImageFileInputRef = useRef<HTMLInputElement>(null);
  const handleCoverImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (uploadedCoverObjectUrlRef.current) {
      URL.revokeObjectURL(uploadedCoverObjectUrlRef.current);
      uploadedCoverObjectUrlRef.current = null;
    }
    const url = URL.createObjectURL(file);
    uploadedCoverObjectUrlRef.current = url;
    setSelectedCoverImageUrl(url);
  }, []);

  const selectProgressCoverImage = useCallback((imageUrl: string) => {
    if (uploadedCoverObjectUrlRef.current) {
      URL.revokeObjectURL(uploadedCoverObjectUrlRef.current);
      uploadedCoverObjectUrlRef.current = null;
    }
    setSelectedCoverImageUrl(imageUrl);
  }, []);

  const allDocs = useCallback(() => {
    return [...equipmentDocs, ...projectDocDocs, ...projectDocs, ...userUploads];
  }, [equipmentDocs, projectDocDocs, projectDocs, userUploads]);

  const selectedDocs = useCallback((): DossierDocItem[] => {
    const ids = selectedIds;
    return allDocs().filter((d) => ids.has(d.id));
  }, [selectedIds, allDocs]);

  /** Selected docs in dossier order (for export and Export-step list). */
  const selectedDocsOrdered = useCallback((): DossierDocItem[] => {
    const docs = selectedDocs();
    const order = dossierDocOrder.length > 0 ? dossierDocOrder : docs.map((d) => d.id);
    const byId = new Map(docs.map((d) => [d.id, d]));
    const result: DossierDocItem[] = [];
    for (const id of order) {
      if (byId.has(id)) result.push(byId.get(id)!);
    }
    for (const d of docs) {
      if (!order.includes(d.id)) result.push(d);
    }
    return result;
  }, [selectedDocs, dossierDocOrder]);

  // Keep dossier order in sync with selection when entering Structure or Export
  useEffect(() => {
    if (step !== 'Structure & sub-covers' && step !== 'Export') return;
    const docs = allDocs().filter((d) => selectedIds.has(d.id));
    const ids = docs.map((d) => d.id);
    setDossierDocOrder((prev) => {
      const keep = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !prev.includes(id));
      return keep.length || added.length ? [...keep, ...added] : ids;
    });
  }, [step, allDocs, selectedIds]);

  // Extract theme colors from company logo for "From logo" presets
  useEffect(() => {
    const url = firmData?.logo_url || (typeof localStorage !== 'undefined' ? localStorage.getItem('companyLogo') : null) || null;
    if (!url) {
      setLogoThemeColors([]);
      return;
    }
    let cancelled = false;
    extractColorsFromImageUrl(url).then((colors) => {
      if (!cancelled) setLogoThemeColors(colors);
    });
    return () => { cancelled = true; };
  }, [firmData?.logo_url]);

  // Fetch all doc sources
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { projectId, equipmentId } = params;
        const tagNumber = params.equipment?.tagNumber || (params.equipment as any)?.tag_number;

        const eqItems: DossierDocItem[] = [];
        const projDocItems: DossierDocItem[] = [];
        const projItems: DossierDocItem[] = [];

        if (isStandalone) {
          const docs = await getStandaloneEquipmentDocuments(equipmentId);
          const list = Array.isArray(docs) ? docs : [];
          list.forEach((d: any, i: number) => {
            eqItems.push({
              id: `eq-${d.id}`,
              source: 'equipment',
              name: d.document_name || d.name || 'Document',
              url: d.document_url,
              docNumber: d.document_type,
              order: i,
            });
          });
        } else {
          const [docs, vdcrRecords, projectResp] = await Promise.all([
            getEquipmentDocuments(equipmentId),
            fastAPI.getVDCRRecordsByProject(projectId),
            fastAPI.getProjectById(projectId),
          ]);
          const list = Array.isArray(docs) ? docs : [];
          // Only show docs that were manually uploaded to the equipment Docs tab.
          // Docs with vdcr_record_id are reflected from the Documentation tab and appear only under "From project documentation (tagged)".
          const manualOnly = list.filter((d: any) => !d.vdcr_record_id);
          manualOnly.forEach((d: any, i: number) => {
            eqItems.push({
              id: `eq-${d.id}`,
              source: 'equipment',
              name: d.document_name || d.name || 'Document',
              url: d.document_url,
              docNumber: d.document_type,
              order: i,
            });
          });

          const records = Array.isArray(vdcrRecords) ? vdcrRecords : [];
          const tagStr = (tagNumber || '').toString().trim();
          records.forEach((r: any) => {
            const tags: string[] = Array.isArray(r.equipment_tag_numbers) ? r.equipment_tag_numbers : [];
            if (!tagStr || tags.some((t: string) => String(t).trim() === tagStr)) {
              projDocItems.push({
                id: `vdcr-${r.id}`,
                source: 'project_documentation',
                name: r.document_name || 'VDCR Document',
                url: r.document_url,
                internalDocNo: r.internal_doc_no,
                clientDocNo: r.client_doc_no,
                docNumber: r.sr_no,
                order: projDocItems.length,
              });
            }
          });

          const project = Array.isArray(projectResp) ? projectResp[0] : null;
          if (!cancelled && project) setProjectData(project as Record<string, unknown>);
          if (project) {
            const addFrom = (arr: any[], type: string, key: string) => {
              const a = arr || [];
              a.forEach((d: any, i: number) => {
                const url = d.file_url || d.document_url || d.url;
                projItems.push({
                  id: `proj-${type}-${d.id || i}`,
                  source: 'project_docs',
                  name: d.document_name || d.name || 'Project document',
                  url,
                  order: projItems.length,
                });
              });
            };
            addFrom(project.unpriced_po_documents || [], 'po', 'unpriced_po_documents');
            addFrom(project.design_inputs_documents || [], 'design', 'design_inputs_documents');
            addFrom(project.client_reference_documents || [], 'ref', 'client_reference_documents');
            addFrom(project.other_documents || [], 'other', 'other_documents');
          }
        }

        if (!cancelled) {
          setEquipmentDocs(eqItems);
          setProjectDocDocs(projDocItems);
          setProjectDocs(projItems);
          const defaultSelected = new Set<string>([
            ...eqItems.map((d) => d.id),
            ...projDocItems.map((d) => d.id),
            ...projItems.map((d) => d.id),
          ]);
          setSelectedIds(defaultSelected);
        }
      } catch (e) {
        if (!cancelled) {
          toast({ title: 'Error loading documents', description: (e as Error).message, variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params.projectId, params.equipmentId, params.equipment, isStandalone, toast]);

  const toggleDoc = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const newItems: DossierDocItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = `user-${Date.now()}-${i}`;
      newItems.push({
        id,
        source: 'user_upload',
        name: file.name,
        file,
        order: userUploads.length + i,
      });
    }
    setUserUploads((prev) => [...prev, ...newItems]);
    setSelectedIds((prev) => new Set([...prev, ...newItems.map((d) => d.id)]));
    e.target.value = '';
  };

  const getDocPreviewUrl = (doc: DossierDocItem): string | null => {
    if (doc.file) return URL.createObjectURL(doc.file);
    if (doc.url) return doc.url;
    return null;
  };

  const handlePreview = (doc: DossierDocItem) => {
    const url = getDocPreviewUrl(doc);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const preloadOne = useCallback(
    async (
      doc: DossierDocItem,
      equipmentUrlMap?: Record<string, { document_url: string }>
    ): Promise<ArrayBuffer | null> => {
      setPreloadStatus((s) => ({ ...s, [doc.id]: 'loading' }));
      try {
        let buf: ArrayBuffer;
        if (doc.file) {
          buf = await doc.file.arrayBuffer();
        } else {
          let fetchUrl: string | null | undefined = doc.url;
          if (doc.source === 'equipment' && doc.id.startsWith('eq-')) {
            const rawId = doc.id.replace(/^eq-/, '');
            if (equipmentUrlMap?.[rawId]?.document_url) {
              fetchUrl = equipmentUrlMap[rawId].document_url;
            } else {
              const fresh = await getDocumentUrlById(rawId, isStandalone);
              fetchUrl = fresh?.document_url ?? doc.url;
            }
          }
          if (fetchUrl) {
            const res = await fetch(fetchUrl, { mode: 'cors' });
            buf = await res.arrayBuffer();
          } else {
            setPreloadStatus((s) => ({ ...s, [doc.id]: 'idle' }));
            return null;
          }
        }
        setPreloadedBlobs((prev) => ({ ...prev, [doc.id]: buf }));
        setPreloadStatus((s) => ({ ...s, [doc.id]: 'done' }));
        return buf;
      } catch {
        setPreloadStatus((s) => ({ ...s, [doc.id]: 'error' }));
        return null;
      }
    },
    [isStandalone]
  );

  const handleDocReorder = useCallback((fromId: string, toId: string) => {
    setDossierDocOrder((prev) => {
      const fromIdx = prev.indexOf(fromId);
      const toIdx = prev.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = [...prev];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, fromId);
      return next;
    });
  }, []);

  const handlePreloadAll = useCallback(async () => {
    const docs = selectedDocs();
    if (docs.length === 0) {
      toast({ title: 'No documents selected', description: 'Select at least one document to pre-load.', variant: 'destructive' });
      return;
    }
    setPreloadingAll(true);
    try {
      const equipmentIds = docs
        .filter((d) => d.source === 'equipment' && d.id.startsWith('eq-'))
        .map((d) => d.id.replace(/^eq-/, ''));
      const equipmentUrlMap =
        equipmentIds.length > 0 ? await getDocumentUrlsByIds(equipmentIds, isStandalone) : {};
      for (const doc of docs) {
        if (preloadStatus[doc.id] === 'done') continue;
        await preloadOne(doc, equipmentUrlMap);
      }
      toast({ title: 'Pre-load complete', description: 'Documents ready for faster export.' });
    } catch (e) {
      toast({ title: 'Pre-load failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setPreloadingAll(false);
    }
  }, [selectedDocs, preloadOne, preloadStatus, toast, isStandalone]);


  const stepIndex = STEPS.indexOf(step);
  const canNext = step === 'Select documents' ? selectedIds.size > 0 : true;
  const companyName = firmData?.name || localStorage.getItem('companyName') || 'Company';
  const companyLogoUrl = firmData?.logo_url || localStorage.getItem('companyLogo') || null;

  /** Fetch image bytes from URL (for logo/cover image). Returns null on failure. */
  const fetchImageBytes = useCallback(async (url: string): Promise<Uint8Array | null> => {
    try {
      if (url.startsWith('data:')) {
        const base64 = url.split(',')[1];
        if (!base64) return null;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }
      const res = await fetch(url, { mode: 'cors', cache: 'reload' });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }, []);

  /** Fallback when fetch fails (e.g. CORS): load image in img, draw to canvas, get PNG bytes. Works when server sends CORS for img. */
  const getImageBytesViaCanvas = useCallback((url: string): Promise<Uint8Array | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(
            (blob) => {
              if (!blob) { resolve(null); return; }
              blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(() => resolve(null));
            },
            'image/png',
            0.95
          );
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }, []);

  const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace(/^#/, '');
    if (h.length !== 6) return [0.2, 0.2, 0.2];
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  };

  /** Fetch PDF bytes for a doc: use preloaded cache, or batch-resolved equipment URLs + fetch (cache: reload so body is available). */
  const fetchDocPdfBytes = useCallback(
    async (
      doc: DossierDocItem,
      equipmentUrlMap?: Record<string, { document_url: string }>
    ): Promise<ArrayBuffer | null> => {
      if (preloadedBlobs[doc.id]) return preloadedBlobs[doc.id];
      if (doc.file) return doc.file.arrayBuffer();
      let url: string | null | undefined = doc.url;
      if (doc.source === 'equipment' && doc.id.startsWith('eq-')) {
        const rawId = doc.id.replace(/^eq-/, '');
        const row = equipmentUrlMap?.[rawId];
        if (row?.document_url) url = row.document_url;
        else {
          const fresh = await getDocumentUrlById(rawId, isStandalone);
          if (fresh?.document_url) url = fresh.document_url;
        }
      }
      if (!url) return null;
      try {
        const res = await fetch(url, { mode: 'cors', cache: 'reload' });
        if (!res.ok) return null;
        return res.arrayBuffer();
      } catch {
        return null;
      }
    },
    [preloadedBlobs, isStandalone]
  );

  const handleExport = async () => {
    const docs = selectedDocsOrdered();
    if (docs.length === 0) {
      toast({ title: 'No documents selected', variant: 'destructive' });
      return;
    }
    let capturedCoverDataUrl: string | null = null;
    setCoverCapturingForExport(true);
    await new Promise((r) => setTimeout(r, 200));
    if (coverPreviewRef.current) {
      try {
        const canvas = await html2canvas(coverPreviewRef.current, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });
        capturedCoverDataUrl = canvas.toDataURL('image/png');
      } catch {
        /* fallback to built cover */
      }
    }
    setCoverCapturingForExport(false);
    setExporting(true);
    const total = docs.length + 2;
    setExportProgress({ current: 0, total, phase: 'Preparing…' });
    const equipmentIdsForExport = docs
      .filter((d) => d.source === 'equipment' && d.id.startsWith('eq-'))
      .map((d) => d.id.replace(/^eq-/, ''));
    const equipmentUrlMapForExport =
      equipmentIdsForExport.length > 0
        ? await getDocumentUrlsByIds(equipmentIdsForExport, isStandalone)
        : {};
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedStandardFont('Helvetica');
      const fontBold = await pdfDoc.embedStandardFont('Helvetica-Bold');
      const rgb = hexToRgb(coverThemeColor);
      const subRgb = hexToRgb(subCoverThemeColor);

      type LogoDraw = { w: number; h: number; draw: (p: any, x: number, y: number, w: number, h: number, opacity?: number) => void };
      const embedImage = async (url: string): Promise<LogoDraw | null> => {
        const bytes = await fetchImageBytes(url);
        if (!bytes || bytes.length < 4) return null;
        try {
          const img = await pdfDoc.embedJpeg(bytes);
          return {
            w: img.width,
            h: img.height,
            draw: (p: any, x: number, y: number, w: number, h: number, opacity?: number) => {
              p.drawImage(img, { x, y, width: w, height: h, ...(opacity != null && { opacity }) });
            },
          };
        } catch {
          try {
            const img = await pdfDoc.embedPng(bytes);
            return {
              w: img.width,
              h: img.height,
              draw: (p: any, x: number, y: number, w: number, h: number, opacity?: number) => {
                p.drawImage(img, { x, y, width: w, height: h, ...(opacity != null && { opacity }) });
              },
            };
          } catch {
            return null;
          }
        }
      };

      const pageW = 595;
      const pageH = 842;
      let logoImg: LogoDraw | null = null;
      const resolveLogoUrl = (url: string | null): string | null => {
        if (!url) return null;
        if (url.startsWith('http') || url.startsWith('data:')) return url;
        return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
      };
      if (companyLogoUrl) {
        const urlToTry = resolveLogoUrl(companyLogoUrl) || companyLogoUrl;
        logoImg = await embedImage(urlToTry);
        if (!logoImg) {
          const canvasBytes = await getImageBytesViaCanvas(urlToTry);
          if (canvasBytes && canvasBytes.length > 0) {
            try {
              const img = await pdfDoc.embedPng(canvasBytes);
              logoImg = {
                w: img.width,
                h: img.height,
                draw: (p: any, x: number, y: number, w: number, h: number, opacity?: number) => {
                  p.drawImage(img, { x, y, width: w, height: h, ...(opacity != null && { opacity }) });
                },
              };
            } catch {
              /* logo still null */
            }
          }
        }
      }

      const drawLogoOnPage = (page: any, height = 36) => {
        if (!logoImg) return;
        const logoH = height;
        const logoW = (logoImg.w / logoImg.h) * logoH;
        logoImg.draw(page, 50, pageH - 50 - logoH, logoW, logoH);
      };

      /** Logo and company name on one line (for index and content pages; not cover/sub-cover). Returns y below the line. */
      const drawLogoAndCompanyOnPage = (page: any, logoH = 28) => {
        const topY = pageH - 45;
        if (logoImg) {
          const logoW = (logoImg.w / logoImg.h) * logoH;
          logoImg.draw(page, 50, topY - logoH, logoW, logoH);
          page.drawText(companyName, { x: 50 + logoW + 10, y: topY - logoH + logoH / 2 - 4, size: 10, font: fontBold });
          return topY - logoH - 12;
        }
        page.drawText(companyName, { x: 50, y: topY - 14, size: 10, font: fontBold });
        return topY - 28;
      };

      const drawWatermarkOnPage = (page: any) => {
        if (!watermarkEnabled || !logoImg) return;
        const size = (Math.min(pageW, pageH) * watermarkSize) / 100;
        const w = (logoImg.w / logoImg.h) * size;
        const h = size;
        let x = (pageW - w) / 2;
        let y = (pageH - h) / 2;
        if (watermarkPlacement === 'top-center') y = pageH * 0.65 - h / 2;
        else if (watermarkPlacement === 'bottom-center') y = pageH * 0.35 - h / 2;
        logoImg.draw(page, x, y, w, h, watermarkOpacity);
      };

      let pageNumber = 1;

      const addSubCoverPage = (title: string, note: string) => {
        const page = pdfDoc.addPage([pageW, pageH]);
        drawWatermarkOnPage(page);
        const borderW = subCoverBorderStyle === 'bold' ? 4 : subCoverBorderStyle === 'thin' ? 2 : 0;
        if (borderW > 0) {
          // Border starts above the logo; drawSvgPath uses SVG y-down so (x,y) is the path TOP in PDF
          const subBorderInsetSide = 32;
          const subBorderInsetTop = 28;
          const subBorderInsetBottom = 50;
          const subBorderW = pageW - subBorderInsetSide * 2;
          const subBorderH = pageH - subBorderInsetTop - subBorderInsetBottom;
          const subBorderTopY = pageH - subBorderInsetTop; // PDF y of frame top so path draws downward
          try {
            const subBorderRadius = 16;
            page.drawSvgPath(roundedRectSvgPath(subBorderW, subBorderH, subBorderRadius), {
              x: subBorderInsetSide,
              y: subBorderTopY,
              borderWidth: borderW,
              borderColor: { type: 'RGB', red: subRgb[0], green: subRgb[1], blue: subRgb[2] },
            });
          } catch {
            page.drawRectangle({ x: subBorderInsetSide, y: subBorderInsetBottom, width: subBorderW, height: subBorderH, borderWidth: borderW, borderColor: { type: 'RGB', red: subRgb[0], green: subRgb[1], blue: subRgb[2] } });
          }
        }
        const subCoverAccent = { type: 'RGB' as const, red: subRgb[0], green: subRgb[1], blue: subRgb[2] };
        // Header: logo, company name, dossier line (like cover page)
        let y = pageH - 50;
        if (logoImg) {
          const logoH = subCoverLogoSize;
          const logoW = (logoImg.w / logoImg.h) * logoH;
          logoImg.draw(page, 50, y - logoH, logoW, logoH);
          y -= logoH + 12;
        }
        page.drawText(companyName, { x: 50, y, size: 12, font: fontBold });
        y -= 16;
        const dossierLine = `Dossier of ${equipmentTag} – ${equipmentDisplayName}`;
        page.drawText(dossierLine.slice(0, 200), { x: 50, y, size: 10, font: fontBold, color: subCoverAccent });
        y -= 20;
        // Document title (core name only, no extension) – key title of the page
        const coreTitle = stripFileExtension(title);
        const subTitleSize = Math.min(Math.max(subCoverTitleFontSize, 12), 28);
        const titleY = 460;
        page.drawText(coreTitle.slice(0, 120), { x: 50, y: titleY, size: subTitleSize, font: fontBold });
        let noteY = titleY - subTitleSize - 10;
        if (note) {
          page.drawText(note.slice(0, 200), { x: 50, y: noteY, size: 11, font });
          noteY -= 20;
        }
        // Signature stamps: Submitted by, Inspected by (for sign & stamp)
        const sigLabelSize = 9;
        const sigLineWidth = 180;
        const sigLineYOffset = 8;
        const sigBlockGap = 52;
        const submittedY = 140;
        const sigLineColor = { type: 'RGB' as const, red: 0, green: 0, blue: 0 };
        page.drawText('Submitted by', { x: 50, y: submittedY, size: sigLabelSize, font: fontBold });
        page.drawLine({ start: { x: 50, y: submittedY - sigLineYOffset }, end: { x: 50 + sigLineWidth, y: submittedY - sigLineYOffset }, thickness: 0.8, color: sigLineColor });
        const inspectedY = submittedY - sigBlockGap;
        page.drawText('Inspected by', { x: 50, y: inspectedY, size: sigLabelSize, font: fontBold });
        page.drawLine({ start: { x: 50, y: inspectedY - sigLineYOffset }, end: { x: 50 + sigLineWidth, y: inspectedY - sigLineYOffset }, thickness: 0.8, color: sigLineColor });
        pageNumber++;
      };

      setExportProgress({ current: 1, total, phase: 'Building cover & index…' });

      if (capturedCoverDataUrl) {
        // WYSIWYG: use captured cover preview as PDF cover; scale to fit with equal top/bottom margin so border doesn't touch page ends
        const cover = pdfDoc.addPage([pageW, pageH]);
        const base64 = capturedCoverDataUrl.split(',')[1];
        const coverMarginV = 24; // small equal margin so border doesn't touch page ends
        const coverMarginH = 12;
        if (base64) {
          try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const img = await pdfDoc.embedPng(bytes);
            const maxW = pageW - 2 * coverMarginH;
            const maxH = pageH - 2 * coverMarginV;
            const scale = Math.min(maxW / img.width, maxH / img.height, 1);
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            cover.drawImage(img, { x: (pageW - drawW) / 2, y: (pageH - drawH) / 2, width: drawW, height: drawH });
          } catch { /* ignore */ }
        }
      pageNumber++;
      } else {
        // Fallback: build cover from primitives
        const cover = pdfDoc.addPage([pageW, pageH]);
        let y = 800;
        const accent = rgb;
        const accentColor = { type: 'RGB' as const, red: accent[0], green: accent[1], blue: accent[2] };
        const centerX = pageW / 2;
        const leftX = 50;
        const coverX = (text: string, size: number) => (coverLayoutCenter ? Math.max(20, centerX - (text.length * size * 0.5) / 2) : leftX);
        if (logoImg) {
          try {
            const logoH = coverLogoSize;
            const logoW = (logoImg.w / logoImg.h) * logoH;
            const logoX = coverLayoutCenter ? centerX - logoW / 2 : leftX;
            logoImg.draw(cover, logoX, y - logoH, logoW, logoH);
            y -= logoH + 12;
          } catch { /* fallback below */ }
        }
        cover.drawText(companyName.toUpperCase(), { x: coverX(companyName.toUpperCase(), 14), y, size: 14, font: fontBold });
        y -= 18;
        if (coverCompanyTagline.trim()) {
          const tagline = String(coverCompanyTagline).trim().slice(0, 120);
          cover.drawText(tagline, { x: coverX(tagline, 10), y, size: 10, font, color: { type: 'RGB' as const, red: 0.4, green: 0.4, blue: 0.4 } });
          y -= 10;
        }
        const dossierLine = coverDossierTitleLine.trim() || `Dossier of ${equipmentTag} – ${equipmentDisplayName}`;
        const dossierLineSize = Math.min(Math.max(coverDossierLineFontSize, 10), 24);
        const dossierLineX = coverX(dossierLine, dossierLineSize);
        cover.drawText(dossierLine.slice(0, 200), { x: dossierLineX, y, size: dossierLineSize, font: fontBold, color: accentColor });
        y -= dossierLineSize + 6;
        if (coverExtraLine.trim()) {
          const extra = String(coverExtraLine).trim().slice(0, 120);
          cover.drawText(extra, { x: coverX(extra, 11), y, size: 11, font });
          y -= 10;
        }
        cover.drawText('DOSSIER', { x: coverX('DOSSIER', 22), y, size: 22, font: fontBold, color: accentColor });
        y -= 28;
        if (selectedCoverImageUrl) {
          let progImg = await embedImage(selectedCoverImageUrl);
          if (!progImg) {
            const progBytes = await getImageBytesViaCanvas(selectedCoverImageUrl);
            if (progBytes && progBytes.length > 0) {
              try {
                const img = await pdfDoc.embedPng(progBytes);
                progImg = { w: img.width, h: img.height, draw: (p: any, x: number, y: number, w: number, h: number) => p.drawImage(img, { x, y, width: w, height: h }) };
              } catch { /* progImg stays null */ }
            }
          }
          if (progImg) {
            const marginX = 50;
            const fullWidth = pageW - marginX * 2;
            const maxH = Math.min(Math.max(coverImageHeight, 140), 320);
            const scale = Math.min(fullWidth / progImg.w, maxH / progImg.h, 1);
            const iw = progImg.w * scale;
            const ih = progImg.h * scale;
            const imgX = marginX + (fullWidth - iw) / 2;
            const imgY = y - ih;
            progImg.draw(cover, imgX, imgY, iw, ih);
            const imgRadius = 8;
            try {
              cover.drawSvgPath(roundedRectSvgPath(iw, ih, imgRadius), {
                x: imgX,
                y: imgY,
                borderWidth: 1,
                borderColor: { type: 'RGB', red: 0.85, green: 0.85, blue: 0.88 },
              });
              const white = { type: 'RGB' as const, red: 1, green: 1, blue: 1 };
              cover.drawSvgPath(cornerMaskSvgPath(imgRadius), { x: imgX, y: imgY, color: white });
              cover.drawSvgPath(`M 0,0 L ${imgRadius},0 Q ${imgRadius},${imgRadius} 0,${imgRadius} Z`, { x: imgX + iw - imgRadius, y: imgY, color: white });
              cover.drawSvgPath(`M ${imgRadius},0 L ${imgRadius},${imgRadius} L 0,${imgRadius} Q 0,0 ${imgRadius},0 Z`, { x: imgX + iw - imgRadius, y: imgY + ih - imgRadius, color: white });
              cover.drawSvgPath(`M 0,${imgRadius} L 0,0 L ${imgRadius},0 Q ${imgRadius},${imgRadius} 0,${imgRadius} Z`, { x: imgX, y: imgY + ih - imgRadius, color: white });
            } catch { /* non-fatal */ }
            y -= ih + 16;
          } else y -= 20;
        } else y -= 20;
        const tableLabelSize = 10; const tableValSize = 10;
        const rowHeight = 24;
        const footerReserved = 52;
        const tableStartY = Math.min(y, pageH - 220);
        const tableWidth = pageW - 100;
        const col1X = 50; const col2X = 200;
        let tableY = tableStartY;
        const tableRadius = 8;
        try {
          cover.drawSvgPath(roundedTopRectSvgPath(tableWidth + 8, rowHeight, tableRadius), {
            x: col1X - 4,
            y: tableY - rowHeight,
            color: accentColor,
          });
        } catch {
          cover.drawRectangle({
            x: col1X - 4,
            y: tableY - rowHeight,
            width: tableWidth + 8,
            height: rowHeight,
            color: accentColor,
          });
        }
        const headerTextColor = contrastingTextColor(accent[0], accent[1], accent[2]);
        cover.drawText('Field', { x: col1X, y: tableY - 16, size: tableLabelSize, font: fontBold, color: headerTextColor });
        cover.drawText('Value', { x: col2X, y: tableY - 16, size: tableLabelSize, font: fontBold, color: headerTextColor });
        tableY -= rowHeight;
        const rowGray = { type: 'RGB' as const, red: 0.97, green: 0.97, blue: 0.98 };
        COVER_TABLE_FIELDS.forEach((label, idx) => {
          if (tableY < footerReserved + rowHeight) return;
          if (idx % 2 === 1) {
            cover.drawRectangle({
              x: col1X - 4,
              y: tableY - rowHeight,
              width: tableWidth + 8,
              height: rowHeight,
              color: rowGray,
            });
          }
          const val = coverDetails[label] ?? '';
          cover.drawText(label, { x: col1X, y: tableY - 16, size: tableLabelSize, font: fontBold });
          cover.drawText(String(val).slice(0, 300) || '—', { x: col2X, y: tableY - 16, size: tableValSize, font });
          tableY -= rowHeight;
        });
        pageNumber++;
        try {
          if (coverBorderStyle !== 'none') {
            const bw = coverBorderStyle === 'bold' ? 6 : 2;
            const borderRadius = 16;
            cover.drawSvgPath(roundedRectSvgPath(pageW - 30, pageH - 30, borderRadius), {
              x: 15,
              y: 15,
              borderWidth: bw,
              borderColor: { type: 'RGB', red: accent[0], green: accent[1], blue: accent[2] },
            });
          }
        } catch { /* non-fatal */ }
      }

      const indexEntries: { name: string; startPage: number; endPage: number }[] = [];
      pdfDoc.addPage([595, 842]);
      const indexPageIndex = 1;
      pageNumber++;

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        setExportProgress({ current: 2 + i, total, phase: `Loading documents ${i + 1}-${Math.min(i + 4, docs.length)} of ${docs.length}…` });
        const title = docOverrides[doc.id]?.title || doc.name;
        const note = docOverrides[doc.id]?.notes || '';
        const startPage = pageNumber;
        addSubCoverPage(title, note);
        indexEntries.push({ name: title, startPage, endPage: startPage });
        const buf = await fetchDocPdfBytes(doc, equipmentUrlMapForExport);
        if (buf && buf.byteLength > 0) {
          try {
            const src = await PDFDocument.load(buf);
            const pages = src.getPages();
            for (let pi = 0; pi < pages.length; pi++) {
              const [copied] = await pdfDoc.copyPages(src, [pi]);
              pdfDoc.addPage(copied);
              const contentPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
              drawWatermarkOnPage(contentPage);
              pageNumber++;
            }
          } catch (err) {
            console.error('PDF load failed for', doc.name, err);
            addSubCoverPage(`[Document: ${doc.name}]`, '');
            pageNumber++;
          }
          indexEntries[indexEntries.length - 1].endPage = pageNumber - 1;
        } else {
          addSubCoverPage(`[Could not load: ${doc.name}]`, '');
          pageNumber++;
          indexEntries[indexEntries.length - 1].endPage = pageNumber - 1;
        }
      }

      setExportProgress({ current: total, total, phase: 'Finalizing PDF…' });
      const colNo = 50; const colTitle = 70; const colPage = 500;
      const indexTableWidth = colPage + 55 - colNo;
      const indexHeaderHeight = 22;
      const indexBottomMargin = 80;
      const indexAccent = rgb;
      const indexHeaderColor = { type: 'RGB' as const, red: indexAccent[0], green: indexAccent[1], blue: indexAccent[2] };
      const indexHeaderTextColor = { type: 'RGB' as const, red: 1, green: 1, blue: 1 };
      const indexRowGray = { type: 'RGB' as const, red: 0.97, green: 0.97, blue: 0.98 };
      const indexRowOpacity = 0.4;
      const maxCh = 58;

      const INDEX_TABLE_TOP = 722;
      const drawIndexPageHeader = (page: any) => {
        drawWatermarkOnPage(page);
        const yBelowHeader = drawLogoAndCompanyOnPage(page, 28);
        page.drawText(`Dossier of ${equipmentTag} – ${equipmentDisplayName}`, { x: 50, y: yBelowHeader + 8, size: 9, font });
        page.drawText('Index', { x: 50, y: INDEX_TABLE_TOP + 12, size: 16, font: fontBold, color: indexHeaderColor });
      };

      const drawIndexTableHeader = (page: any, atY: number) => {
        // Strip Y: drawSvgPath uses SVG y-down, so place at atY so the rect appears from (atY - indexHeaderHeight) to atY (behind header text).
        const stripY = atY;
        try {
          page.drawSvgPath(roundedBottomRectSvgPath(indexTableWidth, indexHeaderHeight, 6), {
            x: colNo - 4,
            y: stripY,
            color: indexHeaderColor,
          });
        } catch {
          page.drawRectangle({ x: colNo - 4, y: atY - indexHeaderHeight, width: indexTableWidth, height: indexHeaderHeight, color: indexHeaderColor });
        }
        page.drawText('No.', { x: colNo, y: atY - 16, size: indexFontSize, font: fontBold, color: indexHeaderTextColor });
        page.drawText('Document Title', { x: colTitle, y: atY - 16, size: indexFontSize, font: fontBold, color: indexHeaderTextColor });
        page.drawText('Page(s)', { x: colPage, y: atY - 16, size: indexFontSize, font: fontBold, color: indexHeaderTextColor });
      };

      const drawIndexTableBorder = (page: any, tableBottomY: number) => {
        const tableH = INDEX_TABLE_TOP - tableBottomY;
        const borderRadius = 6;
        try {
          // drawSvgPath y-down: place at INDEX_TABLE_TOP so path (0,0)-(w,h) maps to PDF top INDEX_TABLE_TOP, bottom tableBottomY
          page.drawSvgPath(roundedRectSvgPath(indexTableWidth, tableH, borderRadius), {
            x: colNo - 4,
            y: INDEX_TABLE_TOP,
            borderWidth: 1.5,
            borderColor: indexHeaderColor,
          });
        } catch {
          page.drawRectangle({
            x: colNo - 4,
            y: tableBottomY,
            width: indexTableWidth,
            height: tableH,
            borderWidth: 1.5,
            borderColor: indexHeaderColor,
          });
        }
      };

      let currentIndexPageIndex = indexPageIndex;
      let currentIndexPage = pdfDoc.getPage(currentIndexPageIndex);
      drawIndexPageHeader(currentIndexPage);
      drawIndexTableHeader(currentIndexPage, INDEX_TABLE_TOP);
      let rowY = INDEX_TABLE_TOP - 25;

      indexEntries.forEach((e, idx) => {
        const pageRange = e.startPage === e.endPage ? String(e.startPage) : `${e.startPage}–${e.endPage}`;
        const titleLines = e.name.length <= maxCh ? [e.name] : (() => {
          const lines: string[] = [];
          let s = e.name;
          while (s.length) { lines.push(s.slice(0, maxCh)); s = s.slice(maxCh); }
          return lines;
        })();
        const entryHeight = titleLines.length * 15 + 18;
        if (rowY - entryHeight < indexBottomMargin) {
          drawIndexTableBorder(currentIndexPage, rowY);
          pdfDoc.insertPage(currentIndexPageIndex + 1, [pageW, pageH]);
          currentIndexPageIndex += 1;
          currentIndexPage = pdfDoc.getPage(currentIndexPageIndex);
          drawIndexPageHeader(currentIndexPage);
          drawIndexTableHeader(currentIndexPage, INDEX_TABLE_TOP);
          rowY = INDEX_TABLE_TOP - 25;
        }
        if (idx % 2 === 1) {
          currentIndexPage.drawRectangle({
            x: colNo - 4,
            y: rowY - entryHeight,
            width: indexTableWidth,
            height: entryHeight,
            color: indexRowGray,
            opacity: indexRowOpacity,
          });
        }
        currentIndexPage.drawText(String(idx + 1), { x: colNo, y: rowY - 12, size: indexFontSize, font });
        titleLines.forEach((line, li) => {
          currentIndexPage.drawText(line, { x: colTitle, y: rowY - 12 - li * 15, size: indexFontSize, font });
        });
        currentIndexPage.drawText(pageRange, { x: colPage, y: rowY - 12 - (titleLines.length - 1) * 15, size: indexFontSize, font });
        rowY -= entryHeight;
      });
      drawIndexTableBorder(currentIndexPage, rowY);

      for (let i = 0; i < pdfDoc.getPageCount(); i++) {
        const p = pdfDoc.getPage(i);
        const footerY = i === 0 ? 44 : 30;
        p.drawText(`Page ${i + 1}`, { x: pageW - 72, y: footerY, size: 9, font });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Dossier-${equipmentTag}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: 'Dossier exported', description: 'PDF download started.' });
    } catch (e) {
      toast({ title: 'Export failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setCoverCapturingForExport(false);
      setExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <header className="flex items-start sm:items-center justify-between border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-50 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookMarked className="w-6 h-6 text-indigo-600" />
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate max-w-[56vw] sm:max-w-none">Dossier Report – {equipmentTag}</h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <span className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
            <span className="sm:hidden">Step {stepIndex + 1}/{STEPS.length}</span>
            <span className="hidden sm:inline">Step {stepIndex + 1} of {STEPS.length}: {step}</span>
          </span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-gray-600">
            <Loader2 className="w-6 h-6 animate-spin" />
            Loading documents…
          </div>
        ) : (
          <>
            {step === 'Select documents' && (
              <ScrollArea className="flex-1 p-3 sm:p-4">
                <div className="space-y-6 max-w-2xl mx-auto">
                  <p className="text-sm text-gray-600">
                    Select documents to include. You can add more files before export.
                  </p>
                  {equipmentDocs.length > 0 && (
                    <section>
                      <h3 className="font-medium text-gray-900 mb-2">From equipment Docs tab (manually uploaded only)</h3>
                      <p className="text-xs text-gray-500 mb-2">Docs reflected from the Documentation tab are listed under &quot;From project documentation&quot; below.</p>
                      <ul className="space-y-2">
                        {equipmentDocs.map((d) => (
                          <li key={d.id} className="flex items-center gap-2 flex-wrap">
                            <Checkbox
                              id={d.id}
                              checked={selectedIds.has(d.id)}
                              onCheckedChange={() => toggleDoc(d.id)}
                            />
                            <Label htmlFor={d.id} className="text-sm cursor-pointer flex-1 min-w-0 truncate">{d.name}</Label>
                            {getDocPreviewUrl(d) && (
                              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-indigo-600" onClick={() => handlePreview(d)}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                              </Button>
                            )}
                            {preloadStatus[d.id] === 'done' && <span className="text-xs text-green-600">Pre-loaded</span>}
                            {preloadStatus[d.id] === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {projectDocDocs.length > 0 && (
                    <section>
                      <h3 className="font-medium text-gray-900 mb-2">From project documentation (tagged)</h3>
                      <ul className="space-y-2">
                        {projectDocDocs.map((d) => (
                          <li key={d.id} className="flex items-center gap-2 flex-wrap">
                            <Checkbox
                              id={d.id}
                              checked={selectedIds.has(d.id)}
                              onCheckedChange={() => toggleDoc(d.id)}
                            />
                            <Label htmlFor={d.id} className="text-sm cursor-pointer flex-1 min-w-0 truncate">{d.name}</Label>
                            {getDocPreviewUrl(d) && (
                              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-indigo-600" onClick={() => handlePreview(d)}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                              </Button>
                            )}
                            {preloadStatus[d.id] === 'done' && <span className="text-xs text-green-600">Pre-loaded</span>}
                            {preloadStatus[d.id] === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {projectDocs.length > 0 && (
                    <section>
                      <h3 className="font-medium text-gray-900 mb-2">Project documents (PO, PIDs, reference)</h3>
                      <ul className="space-y-2">
                        {projectDocs.map((d) => (
                          <li key={d.id} className="flex items-center gap-2 flex-wrap">
                            <Checkbox
                              id={d.id}
                              checked={selectedIds.has(d.id)}
                              onCheckedChange={() => toggleDoc(d.id)}
                            />
                            <Label htmlFor={d.id} className="text-sm cursor-pointer flex-1 min-w-0 truncate">{d.name}</Label>
                            {getDocPreviewUrl(d) && (
                              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-indigo-600" onClick={() => handlePreview(d)}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                              </Button>
                            )}
                            {preloadStatus[d.id] === 'done' && <span className="text-xs text-green-600">Pre-loaded</span>}
                            {preloadStatus[d.id] === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {userUploads.length > 0 && (
                    <section>
                      <h3 className="font-medium text-gray-900 mb-2">Additional uploads</h3>
                      <ul className="space-y-2">
                        {userUploads.map((d) => (
                          <li key={d.id} className="flex items-center gap-2 flex-wrap">
                            <Checkbox
                              id={d.id}
                              checked={selectedIds.has(d.id)}
                              onCheckedChange={() => toggleDoc(d.id)}
                            />
                            <Label htmlFor={d.id} className="text-sm cursor-pointer flex-1 min-w-0 truncate">{d.name}</Label>
                            {getDocPreviewUrl(d) && (
                              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-indigo-600" onClick={() => handlePreview(d)}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                              </Button>
                            )}
                            {preloadStatus[d.id] === 'done' && <span className="text-xs text-green-600">Pre-loaded</span>}
                            {preloadStatus[d.id] === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <div className="pt-2">
                    <Label className="text-sm font-medium">Add more files</Label>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,application/pdf"
                      onChange={handleAddFiles}
                      className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-indigo-50 file:text-indigo-700"
                    />
                  </div>
                  <div className="border-t pt-4 mt-4">
                    <h3 className="font-medium text-gray-900 mb-1 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      Pre-load for faster export
                    </h3>
                    <p className="text-xs text-gray-600 mb-2">
                      Pre-load selected documents now so the final export in Step 3 is faster. Optional.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePreloadAll}
                      disabled={preloadingAll || selectedIds.size === 0}
                    >
                      {preloadingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                      {preloadingAll ? 'Pre-loading…' : 'Pre-load selected documents'}
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            )}

            {step === 'Structure & sub-covers' && (
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 max-w-2xl mx-auto">
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-900">Document order</h3>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>Drag to reorder. Each document has its sub-cover; order below is how they appear in the PDF.</p>
                      <p className="italic font-semibold">You can edit each document’s title and description in the rows below.</p>
                    </div>
                    <ul className="space-y-2">
                      {selectedDocsOrdered().map((doc) => {
                        const isDragging = draggedDocId === doc.id;
                        const isOver = dragOverDocId === doc.id;
                        return (
                          <li
                            key={doc.id}
                            draggable
                            onDragStart={() => setDraggedDocId(doc.id)}
                            onDragEnd={() => { setDraggedDocId(null); setDragOverDocId(null); }}
                            onDragOver={(e) => { e.preventDefault(); setDragOverDocId(doc.id); }}
                            onDragLeave={() => setDragOverDocId((id) => (id === doc.id ? null : id))}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedDocId && draggedDocId !== doc.id) handleDocReorder(draggedDocId, doc.id);
                              setDraggedDocId(null);
                              setDragOverDocId(null);
                            }}
                            className={`flex items-stretch gap-2 rounded-lg border-2 bg-white transition ${isDragging ? 'opacity-50' : ''} ${isOver ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200'}`}
                          >
                            <div className="flex items-center px-2 bg-gray-100 rounded-l-md cursor-grab active:cursor-grabbing" aria-label="Drag to reorder">
                              <GripVertical className="w-4 h-4 text-gray-500" />
                            </div>
                            <div className="flex-1 min-w-0 py-2 pr-3 flex flex-col gap-0.5">
                              <Input
                                placeholder={stripFileExtension(doc.name)}
                                value={docOverrides[doc.id]?.title ?? stripFileExtension(doc.name)}
                                onChange={(e) => setDocOverrides((prev) => ({ ...prev, [doc.id]: { ...prev[doc.id], title: e.target.value, notes: prev[doc.id]?.notes ?? '' } }))}
                                className="h-8 font-semibold text-sm text-gray-950 placeholder:text-gray-500 border-0 shadow-none focus-visible:ring-1 px-0"
                                title="Sub-cover title"
                              />
                              <Input
                                placeholder="Description (optional)"
                                value={docOverrides[doc.id]?.notes ?? ''}
                                onChange={(e) => setDocOverrides((prev) => ({ ...prev, [doc.id]: { title: prev[doc.id]?.title ?? '', notes: e.target.value } }))}
                                className="h-7 text-xs text-gray-500 border-0 shadow-none focus-visible:ring-1 px-0"
                                title="Sub-cover description"
                              />
                            </div>
                            <div className="w-12 shrink-0 flex items-center justify-center border-l bg-gray-50 rounded-r-lg">
                              <FileText className="w-6 h-6 text-gray-400" />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                </div>
              </ScrollArea>
            )}

            {step === 'Export' && (
              <ScrollArea className="flex-1 p-4">
                <div className="max-w-2xl mx-auto">
                  {exportProgress ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4">
                      <div className="w-20 h-20 rounded-2xl bg-indigo-100 flex items-center justify-center mb-6">
                        <FileText className="w-10 h-10 text-indigo-600" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-900 text-center mb-1">
                        Collecting documents & building your master dossier
                      </h2>
                      <p className="text-sm text-gray-500 text-center mb-6">
                        One smart PDF — this may take a moment for many files
                      </p>
                      <div className="w-full max-w-md">
                        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full bg-indigo-600 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${Math.round((exportProgress.current / exportProgress.total) * 100)}%` }}
                          />
                        </div>
                        <p className="text-center text-2xl font-semibold text-indigo-600 mb-1">
                          {Math.round((exportProgress.current / exportProgress.total) * 100)}%
                        </p>
                        <p className="text-center text-sm text-gray-600 mb-6">
                          {exportProgress.phase}
                        </p>
                      </div>
                      <div className="flex gap-1.5 justify-center">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" style={{ animationDelay: '0ms' }} />
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" style={{ animationDelay: '200ms' }} />
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" style={{ animationDelay: '400ms' }} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {/* Full cover preview – all editable, grander title, tabular data with alternate rows */}
                      <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">Cover preview</h3>
                        <p className="text-xs text-gray-500">Full preview with layout options. Resize or reposition using the options below the card.</p>
                        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 max-w-3xl mx-auto">
                        <div
                          ref={coverPreviewRef}
                          className="rounded-xl overflow-hidden bg-white shadow-lg flex-shrink-0 max-w-2xl w-full"
                          style={{
                            borderColor: coverBorderStyle === 'none' ? '#e5e7eb' : coverThemeColor,
                            borderWidth: coverBorderStyle === 'bold' ? 5 : coverBorderStyle === 'thin' ? 2.5 : 1,
                            borderStyle: 'solid',
                          }}
                        >
                          <div className="p-10 space-y-5">
                            <div className={coverLayoutCenter ? 'flex flex-col items-center text-center space-y-5' : 'space-y-5'}>
                            {companyLogoUrl && (
                              <div className={coverLayoutCenter ? 'flex justify-center' : 'flex justify-start'} style={{ height: coverLogoSize }}>
                                <img src={companyLogoUrl} alt="" className="h-full w-auto object-contain" style={{ maxHeight: coverLogoSize }} />
                              </div>
                            )}
                            <div className={coverLayoutCenter ? 'w-full' : ''}>
                              <p className="font-bold text-gray-900 uppercase text-sm tracking-wide">{companyName}</p>
                              {(!coverCapturingForExport || coverCompanyTagline.trim()) && (
                                <Input
                                  type="text"
                                  placeholder="e.g. ISO Certified company"
                                  value={coverCompanyTagline}
                                  onChange={(e) => setCoverCompanyTagline(e.target.value)}
                                  className={`mt-0.5 min-h-[2.75rem] py-0.5 px-0 leading-relaxed border-0 shadow-none bg-transparent text-sm font-medium text-gray-600 placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none ${coverLayoutCenter ? 'text-center' : 'text-left'}`}
                                  style={{ lineHeight: 1.5, textAlign: coverLayoutCenter ? 'center' : 'left' }}
                                />
                              )}
                              {coverCapturingForExport && !coverDossierTitleLine.trim() ? (
                                <p
                                  className="mt-0.5 min-h-[2.75rem] py-2 leading-relaxed font-semibold"
                                  style={{
                                    fontSize: coverDossierLineFontSize,
                                    color: coverThemeColor,
                                    textAlign: coverLayoutCenter ? 'center' : 'left',
                                    lineHeight: 1.5,
                                  }}
                                >
                                  Dossier of {equipmentTag} – {equipmentDisplayName}
                                </p>
                              ) : (
                                <Input
                                  type="text"
                                  placeholder={`Dossier of ${equipmentTag} – ${equipmentDisplayName}`}
                                  value={coverDossierTitleLine}
                                  onChange={(e) => setCoverDossierTitleLine(e.target.value)}
                                  className="mt-0.5 min-h-[2.75rem] py-0.5 px-0 leading-relaxed border-0 shadow-none bg-transparent font-semibold placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none text-left"
                                  style={{
                                    fontSize: coverDossierLineFontSize,
                                    color: coverThemeColor,
                                    textAlign: coverLayoutCenter ? 'center' : 'left',
                                    lineHeight: 1.5,
                                  }}
                                />
                              )}
                              {(!coverCapturingForExport || coverExtraLine.trim()) && (
                                <Input
                                  type="text"
                                  placeholder="Optional extra line (e.g. project ref, date)"
                                  value={coverExtraLine}
                                  onChange={(e) => setCoverExtraLine(e.target.value)}
                                  className={`mt-0.5 min-h-[2.75rem] py-0.5 px-0 leading-relaxed border-0 shadow-none bg-transparent text-sm text-gray-600 placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none ${coverLayoutCenter ? 'text-center' : 'text-left'}`}
                                  style={{ lineHeight: 1.5, textAlign: coverLayoutCenter ? 'center' : 'left' }}
                                />
                              )}
                            </div>
                            <p className={`font-bold uppercase tracking-wide ${coverLayoutCenter ? 'w-full' : ''}`} style={{ fontSize: 22, color: coverThemeColor }}>DOSSIER</p>
                            </div>
                            {selectedCoverImageUrl ? (
                              <div
                                ref={coverImageContainerRef}
                                className="rounded-lg overflow-hidden bg-gray-100 border border-gray-200 w-full cursor-grab active:cursor-grabbing select-none flex items-center justify-center"
                                style={{ height: coverImageHeight }}
                                onMouseDown={handleCoverImageMouseDown}
                                role="img"
                                aria-label="Cover image; drag to pan"
                              >
                                {coverCapturingForExport && coverImageNaturalSize && captureContainerWidth ? (
                                  (() => {
                                    const scale = Math.min(captureContainerWidth / coverImageNaturalSize.w, coverImageHeight / coverImageNaturalSize.h, 1);
                                    const w = coverImageNaturalSize.w * scale;
                                    const h = coverImageNaturalSize.h * scale;
                                    return (
                                      <div
                                        style={{
                                          width: w,
                                          height: h,
                                          transform: `scale(${coverImageScale}) translate(${coverImagePanX}px, ${coverImagePanY}px)`,
                                          transformOrigin: 'center center',
                                        }}
                                        className="flex-shrink-0"
                                      >
                                        <img
                                          src={selectedCoverImageUrl}
                                          alt=""
                                          className="w-full h-full block"
                                          draggable={false}
                                          onLoad={(e) => {
                                            const img = e.currentTarget;
                                            if (img.naturalWidth && img.naturalHeight) {
                                              setCoverImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                                            }
                                          }}
                                        />
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <img
                                    src={selectedCoverImageUrl}
                                    alt=""
                                    className="pointer-events-none w-full h-full object-contain origin-center"
                                    style={{
                                      transform: `scale(${coverImageScale}) translate(${coverImagePanX}px, ${coverImagePanY}px)`,
                                    }}
                                    draggable={false}
                                    onLoad={(e) => {
                                      const img = e.currentTarget;
                                      if (img.naturalWidth && img.naturalHeight) {
                                        setCoverImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                                      }
                                    }}
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="w-full rounded-lg bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm" style={{ height: coverImageHeight }}>No cover image selected</div>
                            )}
                            <div className="rounded-lg border border-gray-200 overflow-hidden">
                              <table className="w-full text-sm table-fixed">
                                <colgroup>
                                  <col style={{ width: '26%' }} />
                                  <col style={{ width: '74%' }} />
                                </colgroup>
                                <thead>
                                  <tr style={{ backgroundColor: coverThemeColor }}>
                                    <th className="text-left py-2.5 px-3 font-semibold text-white align-middle rounded-tl-lg">Field</th>
                                    <th className="text-left py-2.5 px-3 font-semibold text-white align-middle rounded-tr-lg">Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {COVER_TABLE_FIELDS.map((label, idx) => (
                                    <tr key={label} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                      <td className="py-2.5 px-3 font-medium text-gray-700 border-b border-gray-100 whitespace-nowrap align-middle">{label}</td>
                                      <td className="py-2.5 px-3 border-b border-gray-100 min-h-[2.75rem] align-middle">
                                        <div className="flex items-center min-h-[2.5rem]">
                                          <Input
                                            value={coverDetails[label] ?? ''}
                                            onChange={(e) => setCoverDetails((prev) => ({ ...prev, [label]: e.target.value }))}
                                            className="h-10 min-h-[2.5rem] text-sm leading-normal border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-offset-0 w-full min-w-0 overflow-x-auto py-2 px-3"
                                            placeholder="—"
                                            style={{ maxWidth: '100%', boxSizing: 'border-box' }}
                                          />
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-3 flex-shrink-0 pt-2">
                          <div className="flex flex-col gap-2" aria-label="Cover layout">
                            <span className="text-xs font-medium text-gray-600">Center layout</span>
                            <button
                              type="button"
                              onClick={() => setCoverLayoutCenter((c) => !c)}
                              className={`px-3 py-1.5 rounded text-xs font-medium shrink-0 ${coverLayoutCenter ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                              {coverLayoutCenter ? 'On' : 'Off'}
                            </button>
                          </div>
                          <div className="flex flex-col gap-2" aria-label="Theme color">
                            <span className="text-xs font-medium text-gray-600">Select theme color</span>
                            {logoThemeColors.length > 0 && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-gray-500">From logo</span>
                                <div className="flex flex-wrap gap-1">
                                  {logoThemeColors.map((hex) => (
                                    <button
                                      key={hex}
                                      type="button"
                                      onClick={() => setThemeColor(hex)}
                                      className={`h-7 w-7 rounded-full border-2 shrink-0 ${coverThemeColor === hex ? 'border-gray-900 ring-2 ring-offset-1 ring-gray-400' : 'border-gray-200'}`}
                                      style={{ backgroundColor: hex }}
                                      title={hex}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setThemeColorExpanded((v) => !v)}
                              className="self-start flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
                            >
                              {themeColorExpanded ? 'Hide' : 'More colors'}
                              {themeColorExpanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                            </button>
                            {themeColorExpanded && (
                              <>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] text-gray-500">Other colors</span>
                                  <div className="flex flex-wrap gap-1">
                                    {THEME_COLORS.map((c) => (
                                      <button
                                        key={c.hex}
                                        type="button"
                                        onClick={() => setThemeColor(c.hex)}
                                        className={`h-7 w-7 rounded-full border-2 shrink-0 ${coverThemeColor === c.hex ? 'border-gray-900 ring-2 ring-offset-1 ring-gray-400' : 'border-gray-200'}`}
                                        style={{ backgroundColor: c.hex }}
                                        title={c.name}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={coverThemeColor}
                                    onChange={(e) => setThemeColor(e.target.value)}
                                    className="h-8 w-8 rounded cursor-pointer shrink-0"
                                    title="Choose color"
                                  />
                                  {'EyeDropper' in window && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          const dropper = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
                                          const { sRGBHex } = await dropper.open();
                                          setThemeColor(sRGBHex);
                                        } catch {
                                          // User cancelled or not supported
                                        }
                                      }}
                                      className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 shrink-0"
                                      title="Pick color from screen (e.g. from logo)"
                                    >
                                      <Pipette className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                      Pick from screen
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          {selectedCoverImageUrl && (
                            <div className="flex flex-col gap-2" aria-label="Cover image zoom">
                              <span className="text-xs font-medium text-gray-600">Zoom</span>
                              <div className="flex flex-row gap-1.5 items-center">
                                <button
                                  type="button"
                                  onClick={() => setCoverImageScale((s) => Math.max(0.5, s - 0.25))}
                                  className="h-8 w-8 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center text-sm font-medium shrink-0"
                                  aria-label="Zoom out"
                                >
                                  −
                                </button>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    min={50}
                                    max={250}
                                    value={coverZoomPctInput}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setCoverZoomPctInput(v);
                                      const n = Number(v);
                                      if (!Number.isFinite(n)) return;
                                      const clamped = Math.min(250, Math.max(50, n));
                                      setCoverImageScale(clamped / 100);
                                    }}
                                    onBlur={() => {
                                      const n = Number(coverZoomPctInput);
                                      if (!Number.isFinite(n)) {
                                        setCoverZoomPctInput(String(Math.round(coverImageScale * 100)));
                                        return;
                                      }
                                      const clamped = Math.min(250, Math.max(50, n));
                                      setCoverZoomPctInput(String(clamped));
                                      setCoverImageScale(clamped / 100);
                                    }}
                                    className="h-8 w-16 text-xs text-center px-2"
                                    aria-label="Zoom percent"
                                  />
                                  <span className="text-xs text-gray-500 select-none">%</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setCoverImageScale((s) => Math.min(2.5, s + 0.25))}
                                  className="h-8 w-8 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center text-sm font-medium shrink-0"
                                  aria-label="Zoom in"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCoverImageScale(1)}
                                  className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 shrink-0"
                                >
                                  Reset
                                </button>
                              </div>
                            </div>
                          )}
                        <div className="flex flex-col gap-2" aria-label="Cover image height">
                          <span className="text-xs font-medium text-gray-600">Image height</span>
                          <div className="flex flex-row gap-1.5 flex-wrap">
                            {(['regular', 'medium', 'larger'] as const).map((key) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setCoverImageHeight(COVER_IMAGE_HEIGHT_PRESETS[key])}
                                className={`px-3 py-1.5 rounded text-xs font-medium capitalize shrink-0 ${coverImageHeightPreset === key ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                              >
                                {key === 'larger' ? 'large' : key}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2" aria-label="Additional settings">
                          <button
                            type="button"
                            onClick={() => setAdditionalSettingsExpanded((v) => !v)}
                            className="self-start flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 hover:underline"
                          >
                            Additional settings
                            {additionalSettingsExpanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                          </button>
                          {additionalSettingsExpanded && (
                            <div className="flex flex-col gap-2" aria-label="Watermark">
                              <span className="text-xs font-medium text-gray-600">Watermark</span>
                              <label className="flex items-center gap-2 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={watermarkEnabled}
                                  onChange={(e) => setWatermarkEnabled(e.target.checked)}
                                  className="rounded border-gray-300"
                                />
                                Include watermark
                              </label>
                              {watermarkEnabled && (
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-gray-500">Opacity</span>
                                    <Input
                                      type="number"
                                      min={0.05}
                                      max={0.5}
                                      step={0.01}
                                      value={watermarkOpacity}
                                      onChange={(e) => {
                                        const n = Number(e.target.value);
                                        if (!Number.isFinite(n)) return;
                                        setWatermarkOpacity(Math.min(0.5, Math.max(0.05, n)));
                                      }}
                                      className="h-7 w-16 text-xs text-center px-2"
                                      aria-label="Watermark opacity"
                                    />
                                  </div>
                                  <input
                                    type="range"
                                    min={0.05}
                                    max={0.5}
                                    step={0.01}
                                    value={watermarkOpacity}
                                    onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                                    className="w-full"
                                    aria-label="Watermark opacity slider"
                                  />
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-gray-500">Size (% of page)</span>
                                    <Input
                                      type="number"
                                      min={30}
                                      max={150}
                                      value={watermarkSize}
                                      onChange={(e) => {
                                        const n = Number(e.target.value);
                                        if (!Number.isFinite(n)) return;
                                        setWatermarkSize(Math.min(150, Math.max(30, n)));
                                      }}
                                      className="h-7 w-16 text-xs text-center px-2"
                                      aria-label="Watermark size percent"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        </div>
                        </div>
                        {selectedCoverImageUrl && (
                          <p className="text-xs text-gray-500 mt-1">Cover image: drag to pan — export uses this crop.</p>
                        )}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-gray-700">Change cover page image</h4>
                          <p className="text-xs text-gray-500">Pick an image from progress or upload your own — it appears full width on the cover and in the exported PDF.</p>
                          <div className="flex flex-wrap gap-2 items-center">
                            <input
                              ref={coverImageFileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleCoverImageUpload}
                              className="hidden"
                              aria-label="Upload cover image"
                            />
                            <button
                              type="button"
                              onClick={() => coverImageFileInputRef.current?.click()}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-600 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700 text-xs font-medium"
                            >
                              <Upload className="h-4 w-4 shrink-0" aria-hidden />
                              Upload image
                            </button>
                            {progressImagesList.length > 0 && (
                              <>
                                <span className="text-xs text-gray-400">or from progress:</span>
                                {progressImagesList.map((img, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => selectProgressCoverImage(img.image_url)}
                                    className={`h-16 w-24 rounded-lg border-2 overflow-hidden bg-gray-100 shrink-0 ${selectedCoverImageUrl === img.image_url ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-gray-200'}`}
                                  >
                                    <img src={img.image_url} alt="" className="h-full w-full object-cover" />
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                          {progressImagesList.length === 0 && !selectedCoverImageUrl && (
                            <p className="text-sm text-gray-500">No progress images for this equipment — upload an image above.</p>
                          )}
                        </div>
                      </section>
                      <div className="pt-4 border-t">
                        <p className="text-sm text-gray-600 mb-3">
                          Dossier includes: cover (logo, company name, image, details table), index with page ranges, sub-cover pages, and selected documents.
                      </p>
                      <Button onClick={handleExport} disabled={exporting} className="bg-indigo-600 hover:bg-indigo-700">
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                        {exporting ? 'Generating…' : 'Export PDF'}
                      </Button>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-gray-200 px-3 sm:px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 bg-gray-50">
        <Button variant="outline" onClick={onClose} className="h-9 px-4">
          Cancel
        </Button>
        <div className="flex gap-2 ml-auto">
          {stepIndex > 0 && (
            <Button variant="outline" onClick={() => setStep(STEPS[stepIndex - 1])} className="h-9 px-4">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          {stepIndex < STEPS.length - 1 ? (
            <Button onClick={() => setStep(STEPS[stepIndex + 1])} disabled={!canNext} className="h-9 px-4">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
