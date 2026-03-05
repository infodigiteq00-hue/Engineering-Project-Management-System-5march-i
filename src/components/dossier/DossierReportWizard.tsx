/**
 * Dossier Report Wizard – additive feature only.
 * Generates a merged dossier PDF for an equipment: cover, index, sub-covers, selected docs.
 * Reads from existing data (firm, equipment docs, VDCR, project docs); no changes to existing APIs.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
} from '@/lib/api';
import { X, FileText, Upload, ChevronRight, ChevronLeft, Loader2, BookMarked, Eye, Zap } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';

export interface DossierParams {
  projectId: string;
  equipmentId: string;
  projectName: string;
  equipment: { id: string; tagNumber?: string; name?: string; type?: string; [key: string]: unknown };
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

  const isStandalone = params.projectId === 'standalone';
  const equipmentTag = params.equipment?.tagNumber || params.equipment?.id?.slice(0, 8) || 'Equipment';
  const equipmentDisplayName = params.equipment?.name || params.equipment?.type || equipmentTag;

  const allDocs = useCallback(() => {
    return [...equipmentDocs, ...projectDocDocs, ...projectDocs, ...userUploads];
  }, [equipmentDocs, projectDocDocs, projectDocs, userUploads]);

  const selectedDocs = useCallback((): DossierDocItem[] => {
    const ids = selectedIds;
    return allDocs().filter((d) => ids.has(d.id));
  }, [selectedIds, allDocs]);

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
          const docs = await getEquipmentDocuments(equipmentId);
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

          const vdcrRecords = await fastAPI.getVDCRRecordsByProject(projectId);
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

          const projectData = await fastAPI.getProjectById(projectId);
          const project = Array.isArray(projectData) ? projectData[0] : null;
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

  const preloadOne = useCallback(async (doc: DossierDocItem): Promise<ArrayBuffer | null> => {
    setPreloadStatus((s) => ({ ...s, [doc.id]: 'loading' }));
    try {
      let buf: ArrayBuffer;
      if (doc.file) {
        buf = await doc.file.arrayBuffer();
      } else if (doc.url) {
        const res = await fetch(doc.url, { mode: 'cors' });
        buf = await res.arrayBuffer();
      } else {
        setPreloadStatus((s) => ({ ...s, [doc.id]: 'idle' }));
        return null;
      }
      setPreloadedBlobs((prev) => ({ ...prev, [doc.id]: buf }));
      setPreloadStatus((s) => ({ ...s, [doc.id]: 'done' }));
      return buf;
    } catch {
      setPreloadStatus((s) => ({ ...s, [doc.id]: 'error' }));
      return null;
    }
  }, []);

  const handlePreloadAll = useCallback(async () => {
    const docs = selectedDocs();
    if (docs.length === 0) {
      toast({ title: 'No documents selected', description: 'Select at least one document to pre-load.', variant: 'destructive' });
      return;
    }
    setPreloadingAll(true);
    try {
      for (const doc of docs) {
        if (preloadStatus[doc.id] === 'done') continue;
        await preloadOne(doc);
      }
      toast({ title: 'Pre-load complete', description: 'Documents ready for faster export.' });
    } catch (e) {
      toast({ title: 'Pre-load failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setPreloadingAll(false);
    }
  }, [selectedDocs, preloadOne, preloadStatus, toast]);


  const stepIndex = STEPS.indexOf(step);
  const canNext = step === 'Select documents' ? selectedIds.size > 0 : true;
  const companyName = firmData?.name || localStorage.getItem('companyName') || 'Company';
  const companyLogoUrl = firmData?.logo_url || localStorage.getItem('companyLogo') || null;

  /** Fetch PDF bytes for a doc: use preloaded cache, or get URL (with getDocumentUrlById for equipment docs) then fetch (cache: reload so body is available). */
  const fetchDocPdfBytes = useCallback(
    async (doc: DossierDocItem): Promise<ArrayBuffer | null> => {
      if (preloadedBlobs[doc.id]) return preloadedBlobs[doc.id];
      if (doc.file) return doc.file.arrayBuffer();
      let url = doc.url;
      if (doc.source === 'equipment' && doc.id.startsWith('eq-')) {
        const rawId = doc.id.replace(/^eq-/, '');
        const fresh = await getDocumentUrlById(rawId, isStandalone);
        if (fresh?.document_url) url = fresh.document_url;
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
    const docs = selectedDocs();
    if (docs.length === 0) {
      toast({ title: 'No documents selected', variant: 'destructive' });
      return;
    }
    setExporting(true);
    const total = docs.length + 2;
    setExportProgress({ current: 0, total, phase: 'Preparing…' });
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedStandardFont('Helvetica');
      const fontBold = await pdfDoc.embedStandardFont('Helvetica-Bold');
      let pageNumber = 1;

      const addTextPage = (lines: { text: string; y: number; size?: number; bold?: boolean }[], opts?: { fullBranding?: boolean }) => {
        const page = pdfDoc.addPage([595, 842]);
        const fullBranding = opts?.fullBranding !== false;
        if (fullBranding) {
          page.drawText(companyName, { x: 50, y: 800, size: 10, font: fontBold });
          page.drawText(`Dossier of ${equipmentTag} – ${equipmentDisplayName}`, { x: 50, y: 785, size: 9, font });
          page.drawText(`Page ${pageNumber}`, { x: 520, y: 30, size: 9, font });
        } else {
          page.drawText(`Page ${pageNumber}`, { x: 520, y: 30, size: 9, font });
        }
        lines.forEach((l) => {
          page.drawText(l.text, { x: 50, y: l.y, size: l.size ?? 11, font: l.bold ? fontBold : font });
        });
        pageNumber++;
      };

      setExportProgress({ current: 1, total, phase: 'Building cover & index…' });
      // Cover page
      const cover = pdfDoc.addPage([595, 842]);
      cover.drawText(companyName, { x: 50, y: 750, size: 18, font: fontBold });
      cover.drawText(`Equipment Dossier`, { x: 50, y: 700, size: 16, font });
      cover.drawText(`${equipmentTag} – ${equipmentDisplayName}`, { x: 50, y: 660, size: 14, font });
      cover.drawText(`Page ${pageNumber}`, { x: 520, y: 30, size: 9, font });
      pageNumber++;

      const indexEntries: { name: string; startPage: number }[] = [];
      pdfDoc.addPage([595, 842]);
      const indexPageIndex = 1;
      pageNumber++;

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        setExportProgress({ current: 2 + i, total, phase: `Loading documents ${i + 1}-${Math.min(i + 4, docs.length)} of ${docs.length}…` });
        const title = docOverrides[doc.id]?.title || doc.name;
        const note = docOverrides[doc.id]?.notes || '';
        addTextPage(
          [
            { text: title, y: 400, size: 14, bold: true },
            ...(note ? [{ text: note, y: 380, bold: false }] as { text: string; y: number; size?: number; bold?: boolean }[] : []),
          ],
          { fullBranding: true }
        );
        indexEntries.push({ name: title, startPage: pageNumber - 1 });
        const buf = await fetchDocPdfBytes(doc);
        if (buf && buf.byteLength > 0) {
          try {
            const src = await PDFDocument.load(buf);
            const pages = src.getPages();
            for (let i = 0; i < pages.length; i++) {
              const [copied] = await pdfDoc.copyPages(src, [i]);
              pdfDoc.addPage(copied);
              const contentPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
              contentPage.drawText(companyName, { x: 50, y: 800, size: 8, font });
              contentPage.drawText(`Page ${pageNumber}`, { x: 520, y: 30, size: 8, font });
              pageNumber++;
            }
          } catch (err) {
            console.error('PDF load failed for', doc.name, err);
            addTextPage([{ text: `[Document: ${doc.name}]`, y: 400 }], { fullBranding: false });
            pageNumber++;
          }
        } else {
          addTextPage([{ text: `[Could not load: ${doc.name}]`, y: 400 }], { fullBranding: false });
          pageNumber++;
        }
      }

      setExportProgress({ current: total, total, phase: 'Finalizing PDF…' });
      const indexPage = pdfDoc.getPage(indexPageIndex);
      indexPage.drawText(companyName, { x: 50, y: 800, size: 10, font: fontBold });
      indexPage.drawText(`Dossier of ${equipmentTag} – ${equipmentDisplayName}`, { x: 50, y: 785, size: 9, font });
      indexPage.drawText('Index', { x: 50, y: 720, size: 14, font: fontBold });
      indexEntries.forEach((e, idx) => {
        indexPage.drawText(`${idx + 1}. ${e.name} ... ${e.startPage}`, { x: 50, y: 690 - idx * 18, size: 10, font });
      });
      indexPage.drawText(`Page 2`, { x: 520, y: 30, size: 9, font });

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
      setExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-gray-50">
        <div className="flex items-center gap-2">
          <BookMarked className="w-6 h-6 text-indigo-600" />
          <h1 className="text-lg font-semibold text-gray-900">Dossier Report – {equipmentTag}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            Step {stepIndex + 1} of {STEPS.length}: {step}
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
              <ScrollArea className="flex-1 p-4">
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
                  <p className="text-sm text-gray-600">
                    Optionally set a title and notes per document. Sub-cover grouping can be added in a future update.
                  </p>
                  {selectedDocs().map((d) => (
                    <div key={d.id} className="border rounded-lg p-3 space-y-2">
                      <Label className="text-sm font-medium">{d.name}</Label>
                      <Input
                        placeholder="Sub-cover title (default: doc name)"
                        value={docOverrides[d.id]?.title ?? ''}
                        onChange={(e) =>
                          setDocOverrides((prev) => ({
                            ...prev,
                            [d.id]: { ...prev[d.id], title: e.target.value },
                          }))
                        }
                      />
                      <Textarea
                        placeholder="Optional notes"
                        value={docOverrides[d.id]?.notes ?? ''}
                        onChange={(e) =>
                          setDocOverrides((prev) => ({
                            ...prev,
                            [d.id]: { ...prev[d.id], notes: e.target.value },
                          }))
                        }
                        rows={2}
                      />
                    </div>
                  ))}
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
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600">
                        Dossier will include: cover (company name & logo), index, sub-cover pages, and selected documents.
                        Content pages show page number and company logo.
                      </p>
                      <Button onClick={handleExport} disabled={exporting} className="bg-indigo-600 hover:bg-indigo-700">
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                        {exporting ? 'Generating…' : 'Export PDF'}
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-gray-200 px-4 py-3 flex justify-between bg-gray-50">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <div className="flex gap-2">
          {stepIndex > 0 && (
            <Button variant="outline" onClick={() => setStep(STEPS[stepIndex - 1])}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          {stepIndex < STEPS.length - 1 ? (
            <Button onClick={() => setStep(STEPS[stepIndex + 1])} disabled={!canNext}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
