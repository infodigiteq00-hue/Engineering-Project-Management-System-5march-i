import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Eye, Calendar, User, MapPin, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, FileText, Users, Settings, TrendingUp, AlertTriangle, ClipboardCheck, Shield, Plus, Edit, Check, X, Camera, Upload, Clock, Building, Trash2, Mic, MicOff, Play, Pause, Search, ArrowLeft, Target, Wrench, BarChart3, Download, ArrowRight, Image, UserPlus, FileCheck, History, Loader2, BookMarked, GripVertical, Circle, MoreVertical, FileStack, ClipboardList } from "lucide-react";
import AddEquipmentForm from "@/components/forms/AddEquipmentForm";
import AddStandaloneEquipmentFormNew from "@/components/forms/AddStandaloneEquipmentFormNew";
import AddTechnicalSectionModal from "@/components/forms/AddTechnicalSectionModal";
import { ProductionChecklistModal } from "@/components/dashboard/ProductionChecklistModal";
import { fastAPI, getEquipmentDocuments, getEquipmentDocumentsMetadata, getStandaloneEquipmentDocumentsMetadata, getDocumentUrlById, deleteEquipmentDocument, uploadEquipmentDocument, uploadStandaloneEquipmentDocument, uploadStandaloneEquipmentDocumentsBulk, getStandaloneEquipmentDocuments, deleteStandaloneEquipmentDocument, getEquipmentVdcrRecordIds } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { updateEquipment } from "@/lib/database";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationReads, UnreadEntityDot, UnreadTabDot } from "@/contexts/NotificationReadsContext";
import { logProgressEntryAdded, logProgressEntryUpdated, logProgressEntryDeleted, logDocumentUploaded, logDocumentDeleted, logProgressImageUploaded, logTeamMemberAdded, logActivityCompleted } from "@/lib/activityLogger";
import { sendProjectTeamEmailNotification, getDashboardUrl } from "@/lib/notifications";
import { Equipment, ProgressEntry, EquipmentActivity } from "@/types/equipment";
import { parseActivitiesExcel, ParsedActivitiesResult } from "@/utils/parseActivitiesExcel";
import { transformEquipmentData } from "@/utils/equipmentTransform";
import { getCache, setCache, prefetchWithCache, CACHE_KEYS, getCacheEvenIfExpired } from "@/utils/cache";
import axios from "axios";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Performance optimization: Only log in development mode
const isDev = import.meta.env.DEV;
const devLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};
const devError = (...args: any[]) => {
  if (isDev) console.error(...args);
};
const devWarn = (...args: any[]) => {
  if (isDev) console.warn(...args);
};

// Placeholder used when marking milestone complete with no image; treat as "no image" so we show previous latest or gray box instead of blank white
const PROGRESS_IMAGE_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==';

function formatActivityTime(createdAt: string): string {
  try {
    const d = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  } catch {
    return createdAt || '—';
  }
}

function getActivityIconType(activityType: string): 'orange' | 'blue' | 'teal' {
  if (!activityType) return 'blue';
  if (activityType.startsWith('progress_') || activityType.includes('image')) return 'orange';
  if (activityType.startsWith('team_member_')) return 'teal';
  if (activityType === 'activity_completed') return 'teal';
  if (activityType.startsWith('vdcr_')) return 'blue';
  return 'blue';
}

/** Recent activity: doc updates, QAP, manual upload, inspection report, task completion. Exclude vdcr_created (no "new doc created"). */
const RECENT_ACTIVITY_TYPES = [
  'document_uploaded', 'document_updated', 'activity_completed',
  'vdcr_status_changed', 'vdcr_field_updated', 'vdcr_document_uploaded', 'vdcr_document_updated', 'vdcr_updated'
] as const;

type UpdateTypeLabel = 'Documentation update' | 'QAP update' | 'Audit, TPI & other docs' | 'Inspection report update' | 'Task completion update';

function getUpdateTypeLabel(log: any): UpdateTypeLabel {
  const t = log.activity_type || '';
  if (t.startsWith('vdcr_')) return 'Documentation update';
  if (t === 'activity_completed') {
    const count = log.metadata?.inspection_report_count;
    if (typeof count === 'number' && count > 0) return 'Inspection report update';
    return 'QAP update'; // Task completion from checklist; "Task completion update" can be used when we add pending-tasks source
  }
  if (t === 'document_uploaded' || t === 'document_updated') return 'Audit, TPI & other docs';
  return 'QAP update';
}

/** Title of update for list row (e.g. "GA Drawing Rev 3 - send for comments") */
function getRecentActivityRowTitle(log: any): string {
  const t = log.activity_type || '';
  const dateStr = log.created_at ? (() => {
    try {
      return new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return log.created_at; }
  })() : '';
  const docName = log.metadata?.documentName || log.vdcr_record?.document_name || 'Document';
  if (t === 'activity_completed') {
    const name = log.metadata?.activityName || 'Task';
    return `${name} completed on ${dateStr}`;
  }
  if (t === 'document_uploaded' || t === 'document_updated') {
    const fileName = log.metadata?.fileName || log.metadata?.documentName || 'Document';
    const rawType = log.metadata?.documentType || 'Documents';
    const docType = (rawType === 'Manual Upload' || rawType === 'Manual upload') ? 'TPI, Audits & other doc' : rawType;
    const verb = t === 'document_uploaded' ? 'added to' : 'updated in';
    return `${fileName} ${verb} ${docType} on ${dateStr}`;
  }
  if (t === 'vdcr_status_changed') {
    const newStatus = (log.new_value || log.metadata?.newStatus || '').trim();
    return newStatus ? `${docName} – ${newStatus} on ${dateStr}` : `${docName} – status changed on ${dateStr}`;
  }
  if (t === 'vdcr_field_updated') {
    const field = log.field_name || log.metadata?.fieldName || 'Field';
    const oldV = log.old_value ?? '';
    const newV = log.new_value ?? '';
    return newV || oldV ? `${docName} – ${field}: ${oldV} → ${newV} on ${dateStr}` : `${docName} – ${field} updated on ${dateStr}`;
  }
  if (t === 'vdcr_document_uploaded' || t === 'vdcr_document_updated' || t === 'vdcr_updated') {
    const verb = t === 'vdcr_document_uploaded' ? 'document uploaded' : t === 'vdcr_document_updated' ? 'document updated' : 'updated';
    return `${docName} – ${verb} on ${dateStr}`;
  }
  return log.action_description || 'Activity';
}

function getRecentActivityLabel(log: any): { title: string; subtitle?: string } {
  const title = getRecentActivityRowTitle(log);
  const t = log.activity_type || '';
  if (t === 'activity_completed') {
    return { title, subtitle: log.metadata?.completedByDisplayName ? `Completed by ${log.metadata.completedByDisplayName}` : undefined };
  }
  if (t === 'document_uploaded' || t === 'document_updated') {
    return { title, subtitle: log.created_by_user?.full_name || log.created_by_user?.email ? `Uploaded by ${log.created_by_user.full_name || log.created_by_user.email}` : undefined };
  }
  if (t.startsWith('vdcr_')) {
    return { title, subtitle: log.created_by_user?.full_name || log.created_by_user?.email ? `By ${log.created_by_user.full_name || log.created_by_user.email}` : undefined };
  }
  return { title, subtitle: undefined };
}

interface EquipmentGridProps {
  equipment: Equipment[];
  projectName: string;
  projectId: string;
  onBack?: () => void;
  onViewDetails?: () => void;
  onViewVDCR?: () => void;
  onUserAdded?: () => void; // Callback to refresh Settings tab
  onActivityUpdate?: () => void; // Callback to refresh Activity Logs
  onViewingDetailsChange?: (isViewing: boolean) => void; // Callback to notify parent when viewing details
  // Optional summary callback (used by StandaloneEquipmentTab to keep header counters in sync)
  onSummaryChange?: (summary: {
    total: number;
    active: number;
    dispatched: number;
    completed: number;
  }) => void;
  /** Open dossier report wizard for this equipment (additive feature – no change to existing flow) */
  onOpenDossierReport?: (params: { projectId: string; equipmentId: string; projectName: string; equipment: Equipment }) => void;
  /** Open detailed QAP view for this equipment */
  onViewDetailedQAP?: (params: { projectId: string; equipmentId: string; equipment: Equipment }) => void;
}    

const EquipmentGrid = ({ equipment, projectName, projectId, onBack, onViewDetails, onViewVDCR, onUserAdded, onActivityUpdate, onViewingDetailsChange, onSummaryChange, onOpenDossierReport, onViewDetailedQAP }: EquipmentGridProps) => {
  /** After get_project_equipment_bundle seeds team positions, skip one duplicate batch fetch. */
  const projectBundleTeamAppliedRef = useRef(false);
  /** Stable when parent passes a new array reference with the same equipment rows (avoids effect storms + duplicate API batches). */
  const equipmentPropIdsKey = useMemo(() => {
    if (!equipment?.length) return '';
    return equipment.map((e) => e.id).filter(Boolean).sort().join(',');
  }, [equipment]);

  useEffect(() => {
    projectBundleTeamAppliedRef.current = false;
  }, [projectId, equipmentPropIdsKey]);

  const { toast } = useToast();
  const { user } = useAuth();
  const { markAsSeen } = useNotificationReads();
  const currentUserRole = localStorage.getItem('userRole') || '';
  const canViewAllDepartmentDocuments =
    currentUserRole === 'firm_admin' ||
    currentUserRole === 'project_manager' ||
    currentUserRole === 'vdcr_manager' ||
    currentUserRole === 'super_admin';
  const [currentUserDepartment, setCurrentUserDepartment] = useState<string>('');
  const [imageIndices, setImageIndices] = useState<Record<string, number>>({});
  const [showAddEquipmentForm, setShowAddEquipmentForm] = useState(false);
  const [editingStandaloneEquipment, setEditingStandaloneEquipment] = useState<Equipment | null>(null);
  const [showMiniForm, setShowMiniForm] = useState(false);
  const [miniFormData, setMiniFormData] = useState({
    equipmentName: '',
    customEquipmentName: '',
    tagNumber: '',
    jobNumber: '',
    msnNumber: '',
    size: '',
    material: '',
    designCode: ''
  });
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Equipment>>({});
  const [showImagePreview, setShowImagePreview] = useState<{ url: string, equipmentId: string, currentIndex: number } | null>(null);
  const [currentProgressImageIndex, setCurrentProgressImageIndex] = useState<Record<string, number>>({});
  const [newProgressImage, setNewProgressImage] = useState<File | null>(null);
  const [imageDescription, setImageDescription] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<'all' | 'documentation' | 'manufacturing' | 'testing' | 'dispatched'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Pagination state for equipment cards
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 8;
  const [progressEntries, setProgressEntries] = useState<Record<string, Array<{ id: string, text: string, date: string, type: string }>>>({});
  const [projectMembers, setProjectMembers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserData, setNewUserData] = useState({ name: '', email: '' });
  const [currentProject, setCurrentProject] = useState<any>(null);
  const [newProgressEntry, setNewProgressEntry] = useState('');
  const [newProgressType, setNewProgressType] = useState('general');
  // New progress entry state
  const [editingProgressEntryId, setEditingProgressEntryId] = useState<string | null>(null);
  const [showProgressImageModal, setShowProgressImageModal] = useState<{ url: string, description?: string, uploadedBy?: string, uploadDate?: string } | null>(null);
  // Request dedupe/cache for project members to prevent 3-5 duplicate calls on "View Equipment" open
  const projectMembersFetchPromiseRef = useRef<Promise<any[]> | null>(null);
  const projectMembersFetchedForRef = useRef<string | null>(null);
  const [addingProgressEntryForEquipment, setAddingProgressEntryForEquipment] = useState<string | null>(null);
  const [editingProgressEntryForEquipment, setEditingProgressEntryForEquipment] = useState<string | null>(null);
  // Updates tab: load entry image only when user clicks preview (metadata loaded first)
  const [progressEntryImageUrls, setProgressEntryImageUrls] = useState<Record<string, string>>({});
  const [progressEntryImageLoading, setProgressEntryImageLoading] = useState<Record<string, boolean>>({});
  
  // Custom progress type state
  const [isAddingCustomProgressType, setIsAddingCustomProgressType] = useState(false);
  const [customProgressTypeName, setCustomProgressTypeName] = useState('');
  const [customProgressTypes, setCustomProgressTypes] = useState<string[]>([]);

  // Equipment details view state
  const [viewingEquipmentId, setViewingEquipmentId] = useState<string | null>(null);
  
  // Tab state for equipment details view
  const [equipmentDetailsTab, setEquipmentDetailsTab] = useState("equipment-details");

  // Equipment Logs and Settings states (for standalone equipment details view)
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState("");
  const [equipmentProgressEntries, setEquipmentProgressEntries] = useState<any[]>([]);
  const [isLoadingEquipmentLogs, setIsLoadingEquipmentLogs] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  // Store team members for all equipment (for equipment card team tab)
  const [allEquipmentTeamMembers, setAllEquipmentTeamMembers] = useState<Record<string, any[]>>({});
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditMember, setShowEditMember] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [newMember, setNewMember] = useState({
    name: "",
    email: "",
    phone: "",
    position: "",
    department: "",
    role: "",
    permissions: [] as string[],
    equipmentAssignments: [] as string[],
    dataAccess: [] as string[],
    accessLevel: "viewer"
  });
  const [addMemberAvailableDepartments, setAddMemberAvailableDepartments] = useState<string[]>([]);
  const [addMemberNewDepartmentInput, setAddMemberNewDepartmentInput] = useState('');
  const [existingFirmMembers, setExistingFirmMembers] = useState<any[]>([]);
  const [isLoadingExistingMembers, setIsLoadingExistingMembers] = useState(false);
  const [selectedExistingMemberEmail, setSelectedExistingMemberEmail] = useState<string>("");
  const [isExistingMemberMode, setIsExistingMemberMode] = useState(false);

  // Equipment activities (QAP only): progress bar + mark complete – not connected to Production & Pre-Dispatch Checklist
  const [equipmentActivities, setEquipmentActivities] = useState<Record<string, EquipmentActivity[]>>({});
  const [loadingActivities, setLoadingActivities] = useState<Record<string, boolean>>({});
  // Production & Pre-Dispatch Checklist tasks (separate from QAP; own tables)
  const [productionChecklistByEquipment, setProductionChecklistByEquipment] = useState<Record<string, any[]>>({});
  const [uploadingActivitiesForEquipment, setUploadingActivitiesForEquipment] = useState<string | null>(null);
  const [markCompleteModalOpen, setMarkCompleteModalOpen] = useState(false);
  const [markCompleteSubmitting, setMarkCompleteSubmitting] = useState(false);
  const [editActivitiesModalOpen, setEditActivitiesModalOpen] = useState(false);
  const [editActivitiesModalEquipmentId, setEditActivitiesModalEquipmentId] = useState<string | null>(null);
  const [editActivitiesDraft, setEditActivitiesDraft] = useState<Array<{ id: string; sr_no: number; activity_name: string; activity_type: 'regular_update' | 'milestone'; target_relative: string; target_date: string; sort_order: number; inspection_tpi_involved?: boolean; progress_weight?: number | null }>>([]);
  const [activitiesHistoryOpen, setActivitiesHistoryOpen] = useState(false);
  const [activitiesHistoryEquipmentId, setActivitiesHistoryEquipmentId] = useState<string | null>(null);
  const [qapExpandedEquipmentId, setQapExpandedEquipmentId] = useState<string | null>(null);
  const [qapPopupEquipmentId, setQapPopupEquipmentId] = useState<string | null>(null);
  const qapPopupScrollRef = useRef<HTMLDivElement>(null);
  const [qapStepDetails, setQapStepDetails] = useState<{ equipmentId: string; activityId: string } | null>(null);
  const [qapShowVarianceDays, setQapShowVarianceDays] = useState(false);
  // View step image: which completion is showing viewer, current index, and session cache (completionId_index -> url)
  const [stepImageViewer, setStepImageViewer] = useState<{ completionId: string; currentIndex: number } | null>(null);
  const [stepImageCache, setStepImageCache] = useState<Record<string, string>>({});
  const [stepImageLoading, setStepImageLoading] = useState<Record<string, boolean>>({});
  const [stepImagePreview, setStepImagePreview] = useState<{ completionId: string; currentIndex: number; imageCount: number } | null>(null);
  /** Progress section (card): current image index per equipment when showing QAP latest-step images; session cache reused via stepImageCache. */
  const [progressSectionImageIndex, setProgressSectionImageIndex] = useState<Record<string, number>>({});
  /** Fallback image count per completion id when API image_count is 0 or 1 but completion_images has more (so nav arrows show). */
  const [completionImageCountFallback, setCompletionImageCountFallback] = useState<Record<string, number>>({});
  const [markCompleteModalData, setMarkCompleteModalData] = useState<{
    activityId: string;
    activityName: string;
    activityType: 'regular_update' | 'milestone';
    equipmentId: string;
    completedOn: string;
    completedByUserId: string;
    completedByDisplayName: string;
    completedBySelectValue: string; // for Select value (member.id || member.email)
    department: string; // for docs dashboard / inspection reports by department
    notes: string;
    imageFiles: File[];
    reportFiles: File[]; // inspection reports (PDFs, if applicable)
    percentageCompleted: number; // progress % when marking step complete (must be >= currentProgress)
    currentProgress: number; // equipment progress at open (min allowed for percentageCompleted)
    progressWeight: number | null; // when set, this step adds this fixed % (no manual slider)
  }>({ activityId: '', activityName: '', activityType: 'regular_update', equipmentId: '', completedOn: '', completedByUserId: '', completedByDisplayName: '', completedBySelectValue: '', department: '', notes: '', imageFiles: [], reportFiles: [], percentageCompleted: 0, currentProgress: 0, progressWeight: null });
  const [markCompleteAvailableDepartments, setMarkCompleteAvailableDepartments] = useState<string[]>([]);
  const [markCompleteNewDepartmentInput, setMarkCompleteNewDepartmentInput] = useState('');
  const [inspectionReportListModal, setInspectionReportListModal] = useState<{ completionId: string; reports: Array<{ id: string; report_url: string | null; file_name: string | null; sort_order: number }> } | null>(null);
  const [inspectionReportListLoading, setInspectionReportListLoading] = useState(false);
  const [inspectionReportPreview, setInspectionReportPreview] = useState<{ reportUrl: string; fileName: string } | null>(null);
  /** Inspection report PDF preview: PDF.js canvas (iframes often blank for storage/signed URLs; avoid blob: URLs) */
  const [inspectionReportPdfDoc, setInspectionReportPdfDoc] = useState<any>(null);
  const [inspectionReportPdfPage, setInspectionReportPdfPage] = useState(1);
  const [inspectionReportPdfTotalPages, setInspectionReportPdfTotalPages] = useState(0);
  const [inspectionReportPdfLoading, setInspectionReportPdfLoading] = useState(false);
  const [inspectionReportPdfError, setInspectionReportPdfError] = useState<string | null>(null);
  /** Clients Documentations: pick which activity's inspection reports to open (when equipment has multiple completions with reports) */
  const [inspectionReportPickerModal, setInspectionReportPickerModal] = useState<{ equipmentId: string; activities: Array<{ activityId: string; activityName: string; completionId: string; reportCount: number; department?: string | null }> } | null>(null);
  /** Clients Documentations: "Other reference / internal drawings & documents" list modal */
  const [clientsDocsOtherRefsModal, setClientsDocsOtherRefsModal] = useState<{ equipmentId: string; departmentFilter?: string } | null>(null);
  /** Clients Documentations: "Production & pre-dispatch checklist" placeholder modal */
  const [clientsDocsChecklistModal, setClientsDocsChecklistModal] = useState<{ equipmentId: string } | null>(null);
  /** Clients Documentations: Code 1 / Code 2 / Code 3 / Code 4 docs list modal */
  const [clientsDocsCodeModal, setClientsDocsCodeModal] = useState<{ equipmentId: string; code: string; departmentFilter?: string } | null>(null);
  /** QA Document Dashboard: department subtabs – departments from project VDCR (Documentation tab); map vdcr_record_id → department */
  const [qaDashboardDepartments, setQaDashboardDepartments] = useState<string[]>([]);
  const [vdcrRecordIdToDepartment, setVdcrRecordIdToDepartment] = useState<Record<string, string>>({});
  /** QA Document Dashboard: selected department subtab per equipment ('All' | department name | 'Other') */
  const [qaDashboardDepartmentByEquipment, setQaDashboardDepartmentByEquipment] = useState<Record<string, string>>({});
  /** QA Document Dashboard: sliding window start index for department tabs (max 5 visible at a time) */
  const [qaDashboardDeptWindowStart, setQaDashboardDeptWindowStart] = useState<Record<string, number>>({});
  /** QA Document Dashboard: expanded state per equipment (collapsed by default) */
  const [qaDashboardExpandedByEquipment, setQADashboardExpandedByEquipment] = useState<Record<string, boolean>>({});
  /** Recent Activity: logs per equipment (fetched when QA dashboard is expanded or when opening updates modal) */
  const [recentActivityLogsByEquipment, setRecentActivityLogsByEquipment] = useState<Record<string, any[]>>({});
  const [recentActivityLoadingByEquipment, setRecentActivityLoadingByEquipment] = useState<Record<string, boolean>>({});
  /** Recent Activity: detail modal (log + equipment tag for display) */
  const [recentActivityDetailModal, setRecentActivityDetailModal] = useState<{ log: any; equipmentId?: string; equipmentTag?: string; equipmentName?: string } | null>(null);
  /** Recent Activity updates list modal (carousel) – which equipment is open */
  const [recentActivityUpdatesModalEquipment, setRecentActivityUpdatesModalEquipment] = useState<{ equipmentId: string; equipmentName?: string; tagNumber?: string } | null>(null);
  /** Current page (0-based) for recent activity updates modal carousel */
  const [recentActivityUpdatesModalPage, setRecentActivityUpdatesModalPage] = useState(0);
  /** Expanded row in recent activity list (log.id) – expand inline instead of opening detail modal */
  const [recentActivityExpandedLogId, setRecentActivityExpandedLogId] = useState<string | null>(null);
  /** Recent Activity updates modal: search text (matches title, department, remarks, etc.) */
  const [recentActivitySearch, setRecentActivitySearch] = useState('');
  /** Recent Activity updates modal: department filter ('All' or specific department) */
  const [recentActivityDeptFilter, setRecentActivityDeptFilter] = useState('All');

  const requestedRecentActivityRef = useRef<Set<string>>(new Set());
  /** Call this when user opens the recent activity modal so we refetch and show latest QAP/Documentation updates. */
  const invalidateRecentActivityCache = useCallback((equipmentId: string) => {
    requestedRecentActivityRef.current.delete(equipmentId);
  }, []);
  const loadRecentActivityForEquipment = useCallback(async (equipmentId: string, forceRefetch = false) => {
    if (!forceRefetch && requestedRecentActivityRef.current.has(equipmentId)) return;
    if (!forceRefetch) requestedRecentActivityRef.current.add(equipmentId);
    setRecentActivityLoadingByEquipment(prev => ({ ...prev, [equipmentId]: true }));
    try {
      const { activityApi } = await import('@/lib/activityApi');
      const equipmentLogs = projectId === 'standalone'
        ? await activityApi.getStandaloneEquipmentActivityLogsByEquipment(equipmentId, { limit: 50 })
        : await activityApi.getEquipmentActivityLogs(projectId, { equipmentId, limit: 50 });
      let list: any[] = Array.isArray(equipmentLogs) ? equipmentLogs : [];
      if (projectId !== 'standalone') {
        const vdcrIds = await getEquipmentVdcrRecordIds(equipmentId);
        if (vdcrIds.length > 0) {
          const vdcrLogs = await activityApi.getVDCRActivityLogs(projectId, { vdcrIds, limit: 30 });
          const normalized = (Array.isArray(vdcrLogs) ? vdcrLogs : []).map((log: any) => ({
            ...log,
            _source: 'vdcr' as const,
            id: log.id,
            created_at: log.created_at,
            action_description: log.action_description,
            activity_type: log.activity_type,
            created_by_user: log.created_by_user,
            vdcr_record: log.vdcr_record,
            vdcr_id: log.vdcr_id,
            metadata: { ...(log.metadata || {}), documentName: log.vdcr_record?.document_name || log.metadata?.documentName, department: log.vdcr_record?.department ?? log.metadata?.department }
          }));
          list = [...list, ...normalized].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        }
      }
      setRecentActivityLogsByEquipment(prev => ({ ...prev, [equipmentId]: list }));
    } catch (e) {
      devError('Error loading recent activity for equipment:', e);
      setRecentActivityLogsByEquipment(prev => ({ ...prev, [equipmentId]: [] }));
    } finally {
      setRecentActivityLoadingByEquipment(prev => ({ ...prev, [equipmentId]: false }));
    }
  }, [projectId]);

  useEffect(() => {
    Object.entries(qaDashboardExpandedByEquipment).forEach(([eid, expanded]) => {
      if (expanded) loadRecentActivityForEquipment(eid);
    });
  }, [qaDashboardExpandedByEquipment, loadRecentActivityForEquipment]);

  // When QAP popup opens, scroll to the current (ongoing) step
  useEffect(() => {
    if (!qapPopupEquipmentId) return;
    const t = setTimeout(() => {
      const scrollEl = qapPopupScrollRef.current;
      if (!scrollEl) return;
      const currentRow = scrollEl.querySelector('[data-qap-current="true"]');
      if (currentRow) currentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => clearTimeout(t);
  }, [qapPopupEquipmentId]);

  // Load equipment activity logs for the viewing equipment
  const loadEquipmentActivityLogs = useCallback(async () => {
    if (!viewingEquipmentId || projectId !== 'standalone') return;
    
    try {
      setIsLoadingEquipmentLogs(true);
      const { activityApi } = await import('@/lib/activityApi');
      // Use standalone equipment activity logs API
      const entries = await activityApi.getStandaloneEquipmentActivityLogsByEquipment(viewingEquipmentId);
      setEquipmentProgressEntries(entries as any[]);
    } catch (error) {
      devError('Error loading standalone equipment activity logs:', error);
      setEquipmentProgressEntries([]);
    } finally {
      setIsLoadingEquipmentLogs(false);
    }
  }, [viewingEquipmentId, projectId]);

  // Refs to prevent infinite loops and concurrent calls
  const isFetchingTeamMembersRef = useRef(false);
  const lastFetchedEquipmentIdRef = useRef<string | null>(null);
  const lastFetchTimestampRef = useRef<number>(0);
  const allEquipmentTeamMembersCacheRef = useRef<Record<string, any[]>>({});
  const markCompleteCameraInputRef = useRef<HTMLInputElement>(null);
  const markCompleteGalleryInputRef = useRef<HTMLInputElement>(null);
  const entryImgCameraRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const entryImgGalleryRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Sync cache ref with state
  useEffect(() => {
    allEquipmentTeamMembersCacheRef.current = allEquipmentTeamMembers;
  }, [allEquipmentTeamMembers]);

  // Fetch team members for the viewing equipment (standalone: standalone_equipment_team_positions, project: equipment_team_positions)
  const fetchEquipmentTeamMembers = useCallback(async () => {
    if (!viewingEquipmentId) {
      devLog('⏭️ Skipping fetchEquipmentTeamMembers: no viewingEquipmentId');
      return;
    }
    
    // Prevent concurrent calls - if already fetching, skip
    if (isFetchingTeamMembersRef.current) {
      devLog('⏭️ Already fetching team members, skipping duplicate call');
      return;
    }
    
    // Prevent rapid successive calls for the same equipment
    if (lastFetchedEquipmentIdRef.current === viewingEquipmentId) {
      const timeSinceLastFetch = Date.now() - lastFetchTimestampRef.current;
      if (timeSinceLastFetch < 1000) { // Wait at least 1 second between fetches for same equipment
        devLog('⏭️ Too soon to refetch team members, skipping');
        return;
      }
    }
    
    // Check cache first using ref to avoid dependency
    const cachedData = allEquipmentTeamMembersCacheRef.current[viewingEquipmentId];
    const hasCachedData = cachedData && cachedData.length > 0;
    if (hasCachedData) {
      devLog('⚡ Using cached team members for equipment:', viewingEquipmentId);
      setTeamMembers(cachedData);
      setTeamMembersLoading(false);
      // Still fetch in background to ensure data is fresh, but don't show loading
    } else {
      setTeamMembersLoading(true);
    }
    
    try {
      isFetchingTeamMembersRef.current = true;
      devLog('🔄 Fetching team members for equipment:', viewingEquipmentId);
      let teamData: any[] = [];
      if (projectId === 'standalone') {
        // Standalone equipment: standalone_equipment_team_positions table
        const { DatabaseService } = await import('@/lib/database');
        teamData = await DatabaseService.getStandaloneTeamPositions(viewingEquipmentId);
      } else {
        // Project equipment: equipment_team_positions table (who works on this equipment at what position)
        const { fastAPI: apiFast } = await import('@/lib/api');
        teamData = await apiFast.getProjectEquipmentTeamPositions(viewingEquipmentId);
      }
      devLog('📥 Raw team data received:', teamData);
      
      const transformedMembers = (teamData as any[]).map((member, index) => ({
        id: member.id || `member-${index}`,
        name: member.person_name || 'Unknown',
        email: member.email || '',
        phone: member.phone || '',
        position: member.position_name || '',
        department: member.department || '',
        role: member.role || 'viewer',
        permissions: getPermissionsByRole(member.role || 'viewer'),
        status: 'active',
        avatar: (member.person_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
        lastActive: 'Unknown',
        equipmentAssignments: [viewingEquipmentId],
        dataAccess: getDataAccessByRole(member.role || 'viewer'),
        accessLevel: member.role || 'viewer'
      }));
      
      devLog('✅ Transformed team members:', transformedMembers);
      setTeamMembers(transformedMembers);
      // Also update allEquipmentTeamMembers state for this equipment (for equipment card team tab)
      if (viewingEquipmentId) {
        setAllEquipmentTeamMembers(prev => ({
          ...prev,
          [viewingEquipmentId]: transformedMembers
        }));
      }
      devLog('✅ Team members state updated, count:', transformedMembers.length);
      // Update timestamp
      lastFetchedEquipmentIdRef.current = viewingEquipmentId;
      lastFetchTimestampRef.current = Date.now();
    } catch (error) {
      devError('❌ Error fetching equipment team members:', error);
      // Check cache on error using ref
      const cachedData = allEquipmentTeamMembersCacheRef.current[viewingEquipmentId];
      if (cachedData && cachedData.length > 0) {
        devLog('⚡ Using cached team members due to fetch error');
        setTeamMembers(cachedData);
      } else {
        setTeamMembers([]);
      }
    } finally {
      isFetchingTeamMembersRef.current = false;
      setTeamMembersLoading(false);
    }
  }, [viewingEquipmentId, projectId]);

  // Pre-fetch team members for all project equipment when equipment list loads (batched: one API call for all IDs)
  const fetchAllProjectEquipmentTeamMembers = useCallback(async (equipmentList: any[]) => {
    if (projectId === 'standalone' || !equipmentList?.length) return;
    if (projectBundleTeamAppliedRef.current) {
      projectBundleTeamAppliedRef.current = false;
      return;
    }
    try {
      const equipmentIds = equipmentList.map((eq: any) => eq.id);
      const batchMap = await fastAPI.getProjectEquipmentTeamPositionsBatch(equipmentIds);
      const updates: Record<string, any[]> = {};
      for (const eq of equipmentList) {
        const teamData = batchMap[eq.id] ?? [];
        const transformed = (teamData as any[]).map((m: any, i: number) => ({
          id: m.id || `member-${i}`,
          name: m.person_name || 'Unknown',
          position: m.position_name || '',
          position_name: m.position_name,
          person_name: m.person_name
        }));
        if (transformed.length > 0) updates[eq.id] = transformed;
      }
      if (Object.keys(updates).length > 0) {
        setAllEquipmentTeamMembers(prev => ({ ...prev, ...updates }));
      }
    } catch (e) { /* silent */ }
  }, [projectId]);

  // Helper function for permissions
  const getPermissionsByRole = (role: string) => {
    const rolePermissions: Record<string, string[]> = {
      'firm_admin': ['view', 'edit', 'delete', 'manage_team', 'approve_vdcr', 'manage_equipment'],
      'project_manager': ['view', 'edit', 'delete', 'manage_team', 'approve_vdcr', 'manage_equipment'],
      'vdcr_manager': ['view', 'edit', 'approve_vdcr', 'manage_vdcr'],
      'design_engineer': ['view', 'edit', 'manage_equipment'],
      'quality_inspector': ['view', 'comment'],
      'welder': ['view'],
      'editor': ['view', 'edit', 'manage_equipment'],
      'viewer': ['view']
    };
    return rolePermissions[role] || ['view'];
  };

  // Helper function for data access by role
  const getDataAccessByRole = (role: string) => {
    const roleAccess: Record<string, string[]> = {
      'firm_admin': ['Full Company Access', 'Can Edit All Data', 'Manage All Projects'],
      'project_manager': ['Full Equipment Access', 'Can Manage All Equipment', 'Can Approve VDCR', 'Can Manage Team Members', 'Access to All Tabs'],
      'vdcr_manager': ['Documentation Management Access', 'Can Approve Documentation', 'Can View All Equipment', 'Access to Documentation & Equipment Tabs', 'No Access to Settings'],
      'design_engineer': ['Assigned Equipment Only', 'Can Add Progress Images', 'Can Add Progress Entries', 'Access to VDCR & Other Tabs', 'No Access to Settings & Project Details'],
      'quality_inspector': ['Assigned Equipment Only', 'Read-Only Access', 'Cannot Edit Data', 'Access to VDCR & Other Tabs', 'No Access to Settings & Project Details'],
      'welder': ['Assigned Equipment Only', 'Read-Only Access', 'Cannot Edit Data'],
      'editor': ['Assigned Equipment Only', 'Can Add Progress Images', 'Can Add Progress Entries', 'Access to VDCR & Other Tabs', 'No Access to Settings'],
      'viewer': ['Read-Only Access', 'Can View Assigned Equipment', 'Can View Progress & VDCR', 'No Edit Permissions', 'No Access to Settings']
    };
    return roleAccess[role] || ['Read-Only Access'];
  };

  // Fetch existing firm members for dropdown
  const fetchExistingFirmMembers = useCallback(async () => {
    try {
      setIsLoadingExistingMembers(true);
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const firmId = userData.firm_id;
      
      if (!firmId) {
        setExistingFirmMembers([]);
        return;
      }

      const members = await fastAPI.getAllFirmTeamMembers(firmId);
      setExistingFirmMembers(members || []);
    } catch (error) {
      devError('Error fetching existing firm members:', error);
      setExistingFirmMembers([]);
    } finally {
      setIsLoadingExistingMembers(false);
    }
  }, []);

  // Helper functions
  const mapRoleToDisplay = (dbRole: string): string => {
    const roleMap: Record<string, string> = {
      'project_manager': 'Project Manager',
      'vdcr_manager': 'Documentation Manager',
      'editor': 'Editor',
      'viewer': 'Viewer'
    };
    return roleMap[dbRole] || dbRole;
  };

  const getRoleColor = (role: string) => {
    const roleColors: Record<string, string> = {
      'project_manager': 'bg-blue-100 text-blue-800',
      'vdcr_manager': 'bg-teal-100 text-teal-800',
      'editor': 'bg-blue-100 text-blue-800',
      'viewer': 'bg-gray-100 text-gray-800',
      'design_engineer': 'bg-blue-100 text-blue-800',
      'quality_engineer': 'bg-green-100 text-green-800',
      'client_representative': 'bg-orange-100 text-orange-800',
      'firm_admin': 'bg-red-100 text-red-800'
    };
    return roleColors[role] || 'bg-gray-100 text-gray-800';
  };

  const getPermissionLabel = (permission: string) => {
    const labels: Record<string, string> = {
      view: "View",
      edit: "Edit",
      delete: "Delete",
      manage_team: "Manage Team",
      approve_vdcr: "Approve VDCR",
      manage_equipment: "Manage Equipment",
      comment: "Comment"
    };
    return labels[permission] || permission;
  };

  // Load logs and team members when viewing equipment details
  useEffect(() => {
    if (viewingEquipmentId && projectId === 'standalone') {
      // Only fetch if equipment ID actually changed
      if (lastFetchedEquipmentIdRef.current !== viewingEquipmentId) {
        loadEquipmentActivityLogs();
        fetchEquipmentTeamMembers();
      }
    }
    // Intentionally exclude fetchEquipmentTeamMembers to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingEquipmentId, projectId, loadEquipmentActivityLogs]);

  // Fetch existing firm members when add member modal or mark complete modal opens
  useEffect(() => {
    if (showAddMember || markCompleteModalOpen) {
      fetchExistingFirmMembers();
    }
  }, [showAddMember, markCompleteModalOpen, fetchExistingFirmMembers]);

  // For non-admin/non-project-manager users, restrict document visibility to their own department.
  useEffect(() => {
    let cancelled = false;
    const loadCurrentUserDepartment = async () => {
      if (canViewAllDepartmentDocuments) {
        setCurrentUserDepartment('');
        return;
      }
      if (!projectId || projectId === 'standalone') {
        setCurrentUserDepartment('');
        return;
      }
      try {
        const userDataRaw = localStorage.getItem('userData');
        const userData = userDataRaw ? JSON.parse(userDataRaw) : {};
        const currentEmail = String(user?.email || userData?.email || '').trim().toLowerCase();
        const members = await fastAPI.getProjectMembers(projectId);
        const rows = Array.isArray(members) ? members : [];
        const mine = rows.find((m: any) => {
          const memberEmail = String(m?.email || '').trim().toLowerCase();
          return !!currentEmail && memberEmail === currentEmail;
        });
        if (!cancelled) setCurrentUserDepartment(String(mine?.department || '').trim());
      } catch {
        if (!cancelled) setCurrentUserDepartment('');
      }
    };
    loadCurrentUserDepartment();
    return () => { cancelled = true; };
  }, [projectId, user?.email, canViewAllDepartmentDocuments]);

  // Load department choices for Add Member modal from project VDCR (same source as Mark Complete)
  useEffect(() => {
    if (!showAddMember) return;
    setAddMemberNewDepartmentInput('');
    if (projectId && projectId !== 'standalone') {
      fastAPI.getProjectDepartments(projectId).then(setAddMemberAvailableDepartments);
    } else {
      setAddMemberAvailableDepartments([]);
    }
  }, [showAddMember, projectId]);

  const [roles] = useState([
    {
      name: "project_manager",
      displayName: "Project Manager",
      permissions: ["view", "edit", "delete", "manage_team", "approve_vdcr", "manage_equipment"],
      color: "bg-blue-100 text-blue-800"
    },
    {
      name: "vdcr_manager",
      displayName: "Documentation Manager",
      permissions: ["view", "edit", "approve_vdcr", "manage_vdcr"],
      color: "bg-teal-100 text-teal-800"
    },
    {
      name: "editor",
      displayName: "Editor",
      permissions: ["view", "edit", "manage_equipment"],
      color: "bg-blue-100 text-blue-800"
    },
    {
      name: "viewer",
      displayName: "Viewer",
      permissions: ["view"],
      color: "bg-gray-100 text-gray-800"
    }
  ]);

  // Load equipment activity logs for the viewing equipment
  const loadEquipmentProgressEntries = useCallback(async () => {
    if (!viewingEquipmentId || projectId !== 'standalone') return;
    try {
      setIsLoadingEquipmentLogs(true);
      const { activityApi } = await import('@/lib/activityApi');
      // Use standalone equipment activity logs API
      const entries = await activityApi.getStandaloneEquipmentActivityLogsByEquipment(viewingEquipmentId);
      setEquipmentProgressEntries(entries as any[]);
    } catch (error) {
      console.error('Error loading standalone equipment activity logs:', error);
    } finally {
      setIsLoadingEquipmentLogs(false);
    }
  }, [viewingEquipmentId, projectId]);


  // Notify parent when viewing details changes
  useEffect(() => {
    if (onViewingDetailsChange) {
      const isViewing = viewingEquipmentId !== null && projectId === 'standalone';
      onViewingDetailsChange(isViewing);
    }
  }, [viewingEquipmentId, projectId, onViewingDetailsChange]);

  // Load equipment activities when viewing details (standalone) or when grid is shown.
  // Preserve existing data on error; retry once after delay so session can be ready.
  useEffect(() => {
    if (!viewingEquipmentId) return;
    if (equipmentActivities[viewingEquipmentId] !== undefined) return;

    const isStandalone = projectId === 'standalone';
    const fetchActivities = (isRetry = false) => {
      setLoadingActivities(prev => ({ ...prev, [viewingEquipmentId]: true }));
      const apiCall = isStandalone ? fastAPI.getStandaloneEquipmentActivities(viewingEquipmentId) : fastAPI.getEquipmentActivities(viewingEquipmentId);
      apiCall
        .then((data: any[]) => setEquipmentActivities(prev => ({ ...prev, [viewingEquipmentId]: data })))
        .catch((err: any) => {
          if (!isRetry) {
            setTimeout(() => fetchActivities(true), 1500);
            return;
          }
          toast({ title: 'Could not load activities', description: err?.response?.data?.message || err?.message || 'Ensure the equipment_activities migration has been applied to your Supabase project.', variant: 'destructive' });
        })
        .finally(() => setLoadingActivities(prev => ({ ...prev, [viewingEquipmentId]: false })));
    };
    fetchActivities(false);
  }, [viewingEquipmentId, projectId]);

  // Load equipment logs when viewing equipment details - OPTIMIZED: Team members already fetched above
  useEffect(() => {
    if (viewingEquipmentId) {
      if (projectId === 'standalone' && equipmentDetailsTab === 'equipment-logs') {
        loadEquipmentProgressEntries();
      }
      // Team members: fetch when viewing equipment details (Equipment Details tab shows Team Members section) if not cached
      const cachedData = allEquipmentTeamMembersCacheRef.current[viewingEquipmentId];
      const hasCachedData = cachedData && cachedData.length > 0;
      if (!hasCachedData && !isFetchingTeamMembersRef.current) {
        fetchEquipmentTeamMembers();
      }
    }
    // Intentionally exclude fetchEquipmentTeamMembers and allEquipmentTeamMembers to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingEquipmentId, projectId, equipmentDetailsTab, loadEquipmentProgressEntries]);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTimer, setRecordingTimer] = useState<NodeJS.Timeout | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  // Image audio recording state
  const [isImageRecording, setIsImageRecording] = useState(false);

  // Custom fields state
  const [customFields, setCustomFields] = useState<Record<string, Array<{ name: string, value: string }>>>({});
  const [newFieldName, setNewFieldName] = useState('');
  
  // Overview tab state
  const [overviewLastUpdateRaw, setOverviewLastUpdateRaw] = useState<Record<string, string>>({});
  const [overviewNextMilestoneDate, setOverviewNextMilestoneDate] = useState<Record<string, string>>({});
  const [newFieldValue, setNewFieldValue] = useState('');
  const [showAddFieldInputs, setShowAddFieldInputs] = useState<Record<string, boolean>>({});
  const [isEditMode, setIsEditMode] = useState<Record<string, boolean>>({});

  // Team custom fields state
  const [teamCustomFields, setTeamCustomFields] = useState<Record<string, Array<{ name: string, value: string }>>>({});
  const [newTeamFieldName, setNewTeamFieldName] = useState('');
  const [newTeamFieldValue, setNewTeamFieldValue] = useState('');
  const [showAddTeamFieldInputs, setShowAddTeamFieldInputs] = useState<Record<string, boolean>>({});
  const [isEditTeamMode, setIsEditTeamMode] = useState<Record<string, boolean>>({});
  const [imageMediaRecorder, setImageMediaRecorder] = useState<MediaRecorder | null>(null);
  const [imageAudioChunks, setImageAudioChunks] = useState<Blob[]>([]);
  const [imageRecordingDuration, setImageRecordingDuration] = useState(0);
  const [imageRecordingTimer, setImageRecordingTimer] = useState<NodeJS.Timeout | null>(null);

  // Custom fields state
  const [newCustomFieldName, setNewCustomFieldName] = useState('');
  const [newCustomFieldValue, setNewCustomFieldValue] = useState('');
  const [editingCustomFieldId, setEditingCustomFieldId] = useState<string | null>(null);
  const [showAddCustomFieldForm, setShowAddCustomFieldForm] = useState<Record<string, boolean>>({});
  const [teamPositions, setTeamPositions] = useState<Record<string, Array<{ id: string, position: string, name: string, email: string, phone: string, role: 'editor' | 'viewer' }>>>({
    // Sample custom team positions - only a few additional members
    "eq1": [
      { id: "t1", position: "Fabricator", name: "Sanjay Kumar", email: "sanjay.kumar@company.com", phone: "9876543210", role: "editor" },
      { id: "t2", position: "Engineer", name: "Neha Patel", email: "neha.patel@company.com", phone: "9876543211", role: "viewer" }
    ],
    "eq2": [
      { id: "t3", position: "Technician", name: "Ramesh Singh", email: "ramesh.singh@company.com", phone: "9876543212", role: "viewer" }
    ],
    "eq3": [
      { id: "t4", position: "Fabricator", name: "Ajay Verma", email: "ajay.verma@company.com", phone: "9876543213", role: "editor" }
    ]
  });
  const [newTeamPosition, setNewTeamPosition] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [newTeamPhone, setNewTeamPhone] = useState('');
  const [newTeamRole, setNewTeamRole] = useState<'editor' | 'viewer'>('viewer');
  const [defaultTeamContacts, setDefaultTeamContacts] = useState<Record<string, { email: string, phone: string }>>({});
  
  // Certification title state
  const [allCertificationTitles, setAllCertificationTitles] = useState<string[]>([]);
  const [showNewCertificationInput, setShowNewCertificationInput] = useState<Record<string, boolean>>({});
  const [newCertificationTitle, setNewCertificationTitle] = useState<string>('');

  // Technical sections state
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [isEditSectionModalOpen, setIsEditSectionModalOpen] = useState(false);
  const [editingSectionName, setEditingSectionName] = useState('');
  const [editingSectionOldName, setEditingSectionOldName] = useState('');
  const [selectedSection, setSelectedSection] = useState<Record<string, string>>({});
  const [technicalSections, setTechnicalSections] = useState<Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>>>({});
  const [availableTeamMembers, setAvailableTeamMembers] = useState<any[]>([]);
  const [showTeamSuggestions, setShowTeamSuggestions] = useState(false);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | undefined>(undefined);
  const [selectedWelderId, setSelectedWelderId] = useState<string | undefined>(undefined);
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | undefined>(undefined);
  const [selectedQcInspectorId, setSelectedQcInspectorId] = useState<string | undefined>(undefined);
  const [selectedProjectManagerId, setSelectedProjectManagerId] = useState<string | undefined>(undefined);
  // Helper function to format date-time for display
  const formatDateTimeDisplay = (dateTimeString: string) => {
    try {
      const date = new Date(dateTimeString);
      const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      const formattedTime = date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true
      });
      return `${formattedDate} at ${formattedTime}`;
    } catch {
      return dateTimeString;
    }
  };

  // Helper function to format date only (no time) for display
  const formatDateOnly = (dateString: string) => {
    try {
      if (!dateString || dateString === '—' || dateString.trim() === '') {
        return '—';
      }
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString; // Return original if invalid
      }
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  // Helper function to format date for display
  const formatDateDisplay = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  // Function to determine if equipment is active
  const isEquipmentActive = (equipment: Equipment): boolean => {
    // Check if there's any activity/progress data
    const hasProgressImages = equipment.progressImages && equipment.progressImages.length > 0;
    const hasProgressEntries = equipment.progressEntries && equipment.progressEntries.length > 0;
    const hasTechnicalSections = equipment.technicalSections && equipment.technicalSections.length > 0;
    const hasCustomFields = equipment.custom_fields && equipment.custom_fields.length > 0;
    const hasTeamCustomFields = equipment.teamCustomFields && equipment.teamCustomFields.length > 0;
    
    // Equipment is active if it has ANY type of activity/data
    return hasProgressImages || hasProgressEntries || hasTechnicalSections || hasCustomFields || hasTeamCustomFields;
  };

  // Transform database fields to frontend fields - using shared utility
  const transformEquipmentDataCallback = useCallback((dbEquipment: any[]): Equipment[] => {
    return transformEquipmentData(dbEquipment);
  }, []); // Memoized with empty dependencies (pure function)

  const syncStandaloneEquipmentItem = useCallback(async (equipmentId: string) => {
    try {
      const freshItem = await (fastAPI as any).getStandaloneEquipmentById(equipmentId, { progressImagesLatestOnly: true });
      if (!freshItem) return;
      const transformed = transformEquipmentDataCallback([freshItem]);
      const nextItem = transformed[0];
      if (!nextItem) return;
      setLocalEquipment(prev => prev.map(eq => (eq.id === equipmentId ? { ...eq, ...nextItem } : eq)));
    } catch (error) {
      console.warn('Standalone single-item sync failed (non-fatal):', error);
    }
  }, [transformEquipmentDataCallback]);

  // Initialize with empty array - will be updated by useEffect when filtered equipment arrives
  // This ensures we don't show unfiltered equipment before filtering is applied
  const [localEquipment, setLocalEquipment] = useState<Equipment[]>([]);
  /** Latest local rows for prop-sync effect (avoids stale closure when merging optimistic creates). */
  const localEquipmentForOptimisticSyncRef = useRef<Equipment[]>([]);
  localEquipmentForOptimisticSyncRef.current = localEquipment;
  /** Saved display order (equipment ids) from Arrange Order modal; applied when syncing from props and when sorting grid. Frontend-only. */
  const [equipmentOrderIds, setEquipmentOrderIds] = useState<string[] | null>(null);
  const [showArrangeOrderModal, setShowArrangeOrderModal] = useState(false);
  /** Draft order (ids) while Arrange Order modal is open */
  const [arrangeOrderDraft, setArrangeOrderDraft] = useState<string[]>([]);
  const [imageMetadata, setImageMetadata] = useState<Record<string, Array<{ id: string, description: string, uploadedBy: string, uploadDate: string }>>>({});
  const [isLoadingProgressImages, setIsLoadingProgressImages] = useState(false);
  
  // Performance optimization: Debouncing and request cancellation for refreshEquipmentData
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshAbortControllerRef = useRef<AbortController | null>(null);
  // Dedupe overlapping refreshes for the same project (prevents request storms on "View Equipment")
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshInFlightProjectIdRef = useRef<string | null>(null);
  // Standalone: prevent request storms from overlapping/rapid refresh triggers.
  const standaloneRefreshInFlightRef = useRef(false);
  const standaloneLastRefreshAtRef = useRef(0);
  const standaloneLastSuccessRefreshAtRef = useRef(0);
  // Ref for the projectId of the in-flight refresh (so we only abort when switching to a different project)
  const refreshProjectIdRef = useRef<string | null>(null);
  // Ref for current projectId so we can apply equipment response when it's still the selected project (fix: data returned but not shown)
  const currentProjectIdRef = useRef(projectId);
  currentProjectIdRef.current = projectId;
  // Ref to read current localEquipment length inside refreshEquipmentData without adding it to deps (avoids overwriting good data with lightweight cache)
  const localEquipmentLengthRef = useRef(0);
  localEquipmentLengthRef.current = localEquipment.length;
  // Avoid duplicate progress-image batch requests when effect re-runs (e.g. re-renders)
  const progressImageBatchIdsRef = useRef<string[] | null>(null);
  /** Avoid repeating docs + project-members fetches when `equipment` prop reference churns with the same row ids. */
  const lastEquipmentDocsMembersLoadKeyRef = useRef<string | null>(null);
  const shouldLoadDocsMembersForEquipment = useCallback((equipmentList: Equipment[]) => {
    const idsKey = equipmentList.map((e) => e.id).sort().join(',');
    const docsMembersKey = `${projectId || ''}:${idsKey}`;
    if (lastEquipmentDocsMembersLoadKeyRef.current === docsMembersKey) {
      return false;
    }
    lastEquipmentDocsMembersLoadKeyRef.current = docsMembersKey;
    return true;
  }, [projectId]);

  // Restore eager image payloads (pre-batching behavior): include progress image URLs in the initial equipment load.
  const progressImagesApiOptions = { progressImagesLatestOnly: false as const };

  // One slot only for the latest progress image (no multi-image navigation)
  const expandProgressImagesForOnDemand = useCallback((list: Equipment[]): Equipment[] => {
    return list.map(eq => {
      const meta = eq.progressImagesMetadata;
      if (meta?.length && (!eq.progressImages || eq.progressImages.length === 0)) {
        return { ...eq, progressImages: Array.from({ length: 1 }) as string[] };
      }
      return eq;
    });
  }, []);

  // Same filter+sort as grid uses - so we fill latest for the *visible* page, not raw list order
  const getFilteredAndSortedEquipment = useCallback((
    list: Equipment[],
    phase: typeof selectedPhase,
    search: string
  ): Equipment[] => {
    return list
      .filter(eq => {
        const phaseMatch = phase === 'all' ? true : eq.progressPhase === phase;
        if (!phaseMatch) return false;
        if (search.trim()) {
          const searchLower = search.toLowerCase();
          return (
            (eq.type || '').toLowerCase().includes(searchLower) ||
            (eq.name || '').toLowerCase().includes(searchLower) ||
            (eq.tagNumber || '').toLowerCase().includes(searchLower) ||
            (eq.jobNumber || '').toLowerCase().includes(searchLower) ||
            (eq.manufacturingSerial || '').toLowerCase().includes(searchLower) ||
            (eq.poCdd || '').toLowerCase().includes(searchLower) ||
            ((eq as any).poNumber || (eq as any).po_number || '').toLowerCase().includes(searchLower) ||
            ((eq.custom_fields?.find((f: any) => f.name === 'PO Number')?.value) || '').toLowerCase().includes(searchLower)
          );
        }
        return true;
      })
      // Fixed sequence: first created = first in list; updates/adds/deletes inside equipment do not change order
      .sort((a, b) => {
        const createdA = (a as { created_at?: string }).created_at ? new Date((a as { created_at?: string }).created_at).getTime() : 0;
        const createdB = (b as { created_at?: string }).created_at ? new Date((b as { created_at?: string }).created_at).getTime() : 0;
        if (createdA !== createdB) return createdA - createdB; // ascending: oldest first
        return a.id.localeCompare(b.id); // stable tiebreaker
      });
  }, []);

  // Keep one deterministic fallback order so grid and arrange modal never diverge.
  const getCreatedOrderIds = useCallback((list: Equipment[]): string[] => {
    return [...list]
      .sort((a, b) => {
        const createdA = (a as { created_at?: string }).created_at ? new Date((a as { created_at?: string }).created_at).getTime() : 0;
        const createdB = (b as { created_at?: string }).created_at ? new Date((b as { created_at?: string }).created_at).getTime() : 0;
        if (createdA !== createdB) return createdA - createdB;
        return a.id.localeCompare(b.id);
      })
      .map((eq) => eq.id);
  }, []);

  // Fill latest progress image (index 0) for the given equipment (batched: one API call for all visible cards)
  const fillLatestProgressImagesForPage = useCallback(async (
    list: Equipment[],
    equipmentToFill: Equipment[],
    isStandalone: boolean
  ): Promise<Equipment[]> => {
    if (list.length === 0 || equipmentToFill.length === 0) return list;
    const idsNeedingUrl = equipmentToFill
      .filter((eq) => {
        const item = list.find((e) => e.id === eq.id);
        return !item?.progressImages?.[0];
      })
      .map((eq) => eq.id);
    if (idsNeedingUrl.length === 0) return list;
    const urlMap = await fastAPI.getLatestProgressImageUrlsBatch(idsNeedingUrl, isStandalone);
    return list.map(eq => {
      const url = urlMap[eq.id];
      if (!url) return eq;
      const next = [...(eq.progressImages || [])];
      if (next.length > 0) next[0] = url;
      return { ...eq, progressImages: next };
    });
  }, []);

  // Fetch one progress image by index (kept for any future use; main grid now shows only latest)
  const fetchProgressImageForIndex = useCallback((equipmentId: string, index: number) => {
    fastAPI.getProgressImageByEquipmentAndIndex(equipmentId, index, projectId === 'standalone').then(url => {
      if (!url) return;
      setLocalEquipment(prev => prev.map(eq => {
        if (eq.id !== equipmentId) return eq;
        const next = [...(eq.progressImages || [])];
        if (next.length > index) next[index] = url;
        return { ...eq, progressImages: next };
      }));
    });
  }, [projectId]);

  // Load custom progress types from existing entries
  useEffect(() => {
    const standardTypes = ['welding', 'material', 'inspection', 'assembly', 'testing', 'general', 'comment', 'image'];
    const customTypes = new Set<string>();
    
    localEquipment.forEach(equipment => {
      if (equipment.progressEntries) {
        equipment.progressEntries.forEach((entry: any) => {
          const entryType = entry.entry_type || entry.type;
          if (entryType && !standardTypes.includes(entryType)) {
            customTypes.add(entryType);
          }
        });
      }
    });
    
    setCustomProgressTypes(Array.from(customTypes));
  }, [localEquipment]);

  // Collect all certification titles from equipment for suggestions
  useEffect(() => {
    const titles = new Set<string>();
    localEquipment.forEach(eq => {
      if (eq.certificationTitle && eq.certificationTitle.trim() !== '') {
        titles.add(eq.certificationTitle.trim());
      }
    });
    setAllCertificationTitles(Array.from(titles).sort());
  }, [localEquipment]);

  // Load activities for visible page equipment first (lazy pagination).
  // Avoids request growth with total equipment count when entering View Equipment.
  useEffect(() => {
    if (!localEquipment?.length || !projectId) return;
    const visibleList = getFilteredAndSortedEquipment(localEquipment, selectedPhase, searchQuery);
    const start = (currentPage - 1) * itemsPerPage;
    const visiblePage = visibleList.slice(start, start + itemsPerPage);
    const missingIds = visiblePage
      .map((eq: Equipment) => eq.id)
      .filter((id: string) => equipmentActivities[id] === undefined);
    if (missingIds.length === 0) return;

    const fetchAll = async () => {
      missingIds.forEach((id: string) => setLoadingActivities(prev => ({ ...prev, [id]: true })));
      try {
        const batchMap = projectId === 'standalone'
          ? await fastAPI.getStandaloneEquipmentActivitiesBatch(missingIds)
          : await fastAPI.getEquipmentActivitiesBatch(missingIds);
        const updates: Record<string, any[]> = {};
        for (const id of missingIds) {
          const list = batchMap[id];
          if (Array.isArray(list)) updates[id] = list;
        }
        if (Object.keys(updates).length > 0) {
          setEquipmentActivities(prev => ({ ...prev, ...updates }));
        }
      } finally {
        missingIds.forEach((id: string) => setLoadingActivities(prev => ({ ...prev, [id]: false })));
      }
    };
    fetchAll();
    // Do not depend on `equipmentActivities` — it caused extra effect runs (same visible ids re-fetching).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localEquipment, projectId, currentPage, selectedPhase, searchQuery, getFilteredAndSortedEquipment]);

  // Load Production & Pre-Dispatch Checklist tasks for visible page equipment first (lazy pagination)
  useEffect(() => {
    if (!localEquipment?.length || !projectId) return;
    const visibleList = getFilteredAndSortedEquipment(localEquipment, selectedPhase, searchQuery);
    const start = (currentPage - 1) * itemsPerPage;
    const visiblePage = visibleList.slice(start, start + itemsPerPage);
    const missingIds = visiblePage
      .map((eq: Equipment) => eq.id)
      .filter((id: string) => productionChecklistByEquipment[id] === undefined);
    if (missingIds.length === 0) return;

    const fetchChecklist = async () => {
      try {
        const batchMap = await fastAPI.getEquipmentProductionChecklistTasksBatch(missingIds, projectId === 'standalone');
        setProductionChecklistByEquipment(prev => ({ ...prev, ...batchMap }));
      } catch {
        setProductionChecklistByEquipment(prev => {
          const next = { ...prev };
          missingIds.forEach((id: string) => { next[id] = []; });
          return next;
        });
      }
    };
    fetchChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localEquipment, projectId, currentPage, selectedPhase, searchQuery, getFilteredAndSortedEquipment]);

  // Initialize date fields and notes when entering edit mode or when equipment data is refreshed
  useEffect(() => {
    if (editingEquipmentId) {
      const equipment = localEquipment.find(eq => eq.id === editingEquipmentId);
      if (equipment) {
        // Initialize Last Updated On (date only)
        // For standalone equipment, prioritize last_update (DATE column) over updated_at (timestamp)
        // last_update is already in YYYY-MM-DD format from the database
        let dateOnly = '';
        
        // First priority: last_update field (raw DATE from database)
        if ((equipment as any).last_update) {
          // Use last_update directly if available (already in YYYY-MM-DD format)
          const rawDate = String((equipment as any).last_update);
          dateOnly = rawDate.split('T')[0].split(' ')[0]; // Handle both datetime and date strings
          devLog('📅 useEffect - Using last_update:', dateOnly, 'from raw:', rawDate);
        } 
        // Second priority: updated_at timestamp
        else if (equipment.updated_at) {
          try {
            const updatedDate = new Date(equipment.updated_at);
            if (!isNaN(updatedDate.getTime())) {
              const year = updatedDate.getFullYear();
              const month = String(updatedDate.getMonth() + 1).padStart(2, '0');
              const day = String(updatedDate.getDate()).padStart(2, '0');
              dateOnly = `${year}-${month}-${day}`;
              devLog('📅 useEffect - Using updated_at:', dateOnly);
            }
          } catch (error) {
            devError('Error parsing updated_at in useEffect:', error);
          }
        } 
        // Third priority: lastUpdate formatted string
        else if (equipment.lastUpdate) {
          try {
            const parsedDate = new Date(equipment.lastUpdate);
            if (!isNaN(parsedDate.getTime())) {
              const year = parsedDate.getFullYear();
              const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
              const day = String(parsedDate.getDate()).padStart(2, '0');
              dateOnly = `${year}-${month}-${day}`;
              devLog('📅 useEffect - Using lastUpdate:', dateOnly);
            }
          } catch (error) {
            devError('Error parsing lastUpdate in useEffect:', error);
          }
        }
        
        // Always set the date if we found one (even if it matches current value, to ensure it's set)
        // This ensures the date picker shows the saved value when entering edit mode
        if (dateOnly) {
          devLog('📅 useEffect - Setting overviewLastUpdateRaw for', editingEquipmentId, ':', dateOnly);
          setOverviewLastUpdateRaw(prev => {
            const currentValue = prev[editingEquipmentId];
            // Always update to ensure the date is set (even if it's the same)
            // This is important when entering edit mode for the first time
            if (currentValue !== dateOnly) {
              devLog('📅 useEffect - Updating date from', currentValue || '(empty)', 'to', dateOnly);
            } else {
              devLog('📅 useEffect - Date already set correctly:', dateOnly);
            }
            return { ...prev, [editingEquipmentId]: dateOnly };
          });
        } else {
          // If no date found, only clear if there's a value (don't create unnecessary state updates)
          setOverviewLastUpdateRaw(prev => {
            if (prev[editingEquipmentId]) {
              devLog('📅 useEffect - Clearing date for', editingEquipmentId, '(no date found in equipment)');
              const updated = { ...prev };
              delete updated[editingEquipmentId];
              return updated;
            }
            return prev;
          });
        }

        // Initialize Next Milestone Date
        const nextMilestoneDateValue = equipment.nextMilestoneDate || (equipment as any).next_milestone_date;
        if (nextMilestoneDateValue && nextMilestoneDateValue !== 'To be scheduled' && nextMilestoneDateValue !== 'Not specified') {
          try {
            const milestoneDate = new Date(nextMilestoneDateValue);
            if (!isNaN(milestoneDate.getTime())) {
              const year = milestoneDate.getFullYear();
              const month = String(milestoneDate.getMonth() + 1).padStart(2, '0');
              const day = String(milestoneDate.getDate()).padStart(2, '0');
              const dateLocal = `${year}-${month}-${day}`;
              setOverviewNextMilestoneDate(prev => {
                if (prev[editingEquipmentId] !== dateLocal) {
                  return { ...prev, [editingEquipmentId]: dateLocal };
                }
                return prev;
              });
            }
          } catch (error) {
            devError('Error parsing nextMilestoneDate in useEffect:', error);
          }
        }

        // Initialize Notes field
        const notesValue = equipment.notes;
        const notesString = (notesValue !== null && notesValue !== undefined) ? String(notesValue) : '';
        setEditFormData(prev => {
          // Only update if the value is different
          if (prev.notes !== notesString) {
            // // console.log('🔧 useEffect: Setting notes in editFormData:', notesString);
            return { ...prev, notes: notesString };
          }
          return prev;
        });
      }
    }
  }, [editingEquipmentId, localEquipment]);

  // Load documents for all equipment (legacy behavior): per-equipment metadata fetch in parallel.
  const loadDocumentsForEquipment = async (equipmentList: Equipment[]) => {
    try {
      if (!equipmentList.length) {
        setDocuments({});
        return;
      }
      const isProject = projectId && projectId !== 'standalone';
      const [docsRowsByEquipment, vdcrRecords] = await Promise.all([
        Promise.all(
          equipmentList.map(async (eq) => ({
            equipmentId: eq.id,
            docs: projectId === 'standalone'
              ? await getStandaloneEquipmentDocumentsMetadata(eq.id)
              : await getEquipmentDocumentsMetadata(eq.id),
          }))
        ),
        isProject ? fastAPI.getVDCRRecordsByProject(projectId) : Promise.resolve(null),
      ]);

      let vdcrMap: Record<string, string> = {};
      let departmentsList: string[] = [];
      if (vdcrRecords && Array.isArray(vdcrRecords)) {
        const deptSet = new Set<string>();
        vdcrRecords.forEach((r: any) => {
          if (r.id && r.department != null && String(r.department).trim()) {
            vdcrMap[r.id] = String(r.department).trim();
            deptSet.add(String(r.department).trim());
          }
        });
        departmentsList = Array.from(deptSet).sort();
        setVdcrRecordIdToDepartment(vdcrMap);
        setQaDashboardDepartments(departmentsList);
      }

      const transformDoc = (doc: any) => {
        const department = doc.vdcr_record_id ? (vdcrMap[doc.vdcr_record_id] ?? null) : null;
        return {
        id: doc.id,
        name: doc.document_name || doc.name,
        document_name: doc.document_name || doc.name,
        document_url: undefined as string | undefined,
        uploadedBy: doc.uploaded_by_user?.full_name || doc.uploaded_by || 'Unknown',
        uploadDate: doc.upload_date || doc.created_at,
        document_type: doc.document_type || 'Equipment Document',
        vdcr_code_status: doc.vdcr_code_status,
          vdcr_document_status: doc.vdcr_document_status,
          department: department ?? undefined
        };
      };

      const documentsMap: Record<string, any[]> = {};
      for (const row of docsRowsByEquipment) {
        documentsMap[row.equipmentId] = Array.isArray(row.docs) ? row.docs.map(transformDoc) : [];
      }
      setDocuments(documentsMap);
    } catch (error) {
      devError('❌ Error loading documents:', error);
    }
  };

  // Update local equipment when equipment prop changes
  useEffect(() => {
    // Always update localEquipment when equipment prop changes, even if empty
    // This ensures filtered equipment (including empty arrays) is properly reflected
    // console.log('🔄 EquipmentGrid useEffect: equipment prop changed, length:', equipment?.length || 0);
    
    // Handle both array and undefined/null cases
    if (equipment && Array.isArray(equipment)) {
      // PERFORMANCE: Console logs commented out - uncomment if needed for debugging
      // // console.log('🔄 Equipment data received:', equipment.length, 'items');
      const transformedEquipment = transformEquipmentDataCallback(equipment);
      
      // FIX: Don't overwrite local state if we already have enriched data (progress images / updates filled)
      // and the prop looks like the same list but without them (parent re-rendered with cache/lightweight data).
      // This prevents "loaded then disappeared after a few seconds" when parent passes stale prop.
      const sameList = localEquipment.length === transformedEquipment.length && localEquipment.length > 0
        && localEquipment[0]?.id === transformedEquipment[0]?.id;
      const weHaveEnrichedData = localEquipment.some(eq => eq.progressImages?.[0] || (eq.progressEntries && eq.progressEntries.length > 0));
      const propIsLightweight = !transformedEquipment.some((eq: Equipment) => (eq as any).progressImages?.[0]);
      if (sameList && weHaveEnrichedData && propIsLightweight) {
        return; // Keep our enriched local state; skip overwrite
      }
      
      // Post-process: For standalone equipment, ensure status is 'active' (not 'pending')
      // This handles both new equipment (which should already be 'active') and old equipment
      if (projectId === 'standalone') {
        transformedEquipment.forEach((eq: Equipment) => {
          if (eq.status === 'pending' || !eq.status) {
            eq.status = 'active';
          }
        });
      }
      
      // Apply saved equipment display order (frontend-only, from Arrange Order) when available
      if (projectId && projectId !== 'standalone') {
        const createdOrderIds = getCreatedOrderIds(transformedEquipment);
        try {
          const saved = localStorage.getItem(`equipment_order_${projectId}`);
          const order: string[] = saved ? JSON.parse(saved) : [];
          if (order.length > 0) {
            const inOrder = transformedEquipment.filter((e: Equipment) => order.includes(e.id));
            const notInOrder = transformedEquipment.filter((e: Equipment) => !order.includes(e.id));
            const createdSort = (a: Equipment, b: Equipment) => {
              const ca = (a as { created_at?: string }).created_at ? new Date((a as { created_at?: string }).created_at).getTime() : 0;
              const cb = (b as { created_at?: string }).created_at ? new Date((b as { created_at?: string }).created_at).getTime() : 0;
              return ca !== cb ? ca - cb : a.id.localeCompare(b.id);
            };
            notInOrder.sort(createdSort);
            const sorted = [
              ...inOrder.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
              ...notInOrder
            ];
            transformedEquipment.length = 0;
            transformedEquipment.push(...sorted);
            setEquipmentOrderIds(sorted.map((e: Equipment) => e.id));
          } else {
            setEquipmentOrderIds(createdOrderIds);
          }
        } catch (_) {
          setEquipmentOrderIds(createdOrderIds);
        }
      } else {
        setEquipmentOrderIds(null);
      }

      // Keep rows added locally before the parent prop includes them (e.g. Create Equipment merged without full refresh).
      const propIdsOptimistic = new Set(transformedEquipment.map((e: Equipment) => e.id));
      const optimisticExtras = localEquipmentForOptimisticSyncRef.current.filter((e: Equipment) => !propIdsOptimistic.has(e.id));
      if (optimisticExtras.length > 0) {
        transformedEquipment.push(...optimisticExtras);
      }
      
      // // console.log('🔄 Transformed equipment:', transformedEquipment);
      // console.log('🔄 EquipmentGrid: Updating localEquipment with', transformedEquipment.length, 'items');
      // console.log('🔄 EquipmentGrid: Equipment IDs:', transformedEquipment.map(eq => eq.id));
      setLocalEquipment(transformedEquipment);

      // OPTIMIZATION: Pre-fetch team members for all standalone equipment in background (batched: one API call for all IDs)
      if (projectId === 'standalone' && transformedEquipment && transformedEquipment.length > 0) {
        devLog('🔄 Pre-fetching team members for all equipment in background...');
        const idsToFetch = transformedEquipment
          .filter((eq: Equipment) => !allEquipmentTeamMembers[eq.id] || allEquipmentTeamMembers[eq.id].length === 0)
          .map((eq: Equipment) => eq.id);
        if (idsToFetch.length > 0) {
          fastAPI.getStandaloneTeamPositionsBatch(idsToFetch).then((batchMap) => {
            const updates: Record<string, any[]> = {};
            for (const eq of transformedEquipment) {
              const teamData = batchMap[eq.id] ?? [];
              if (teamData.length > 0) {
                const transformedMembers = (teamData as any[]).map((member: any, index: number) => ({
                  id: member.id || `member-${index}`,
                  name: member.person_name || 'Unknown',
                  email: member.email || '',
                  phone: member.phone || '',
                  position: member.position_name || '',
                  role: member.role || 'viewer',
                  permissions: getPermissionsByRole(member.role || 'viewer'),
                  status: 'active',
                  avatar: (member.person_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
                  lastActive: 'Unknown',
                  equipmentAssignments: [eq.id],
                  dataAccess: getDataAccessByRole(member.role || 'viewer'),
                  accessLevel: member.role || 'viewer'
                }));
                updates[eq.id] = transformedMembers;
              }
            }
            if (Object.keys(updates).length > 0) {
              setAllEquipmentTeamMembers(prev => ({ ...prev, ...updates }));
            }
            devLog('✅ Finished pre-fetching team members for all equipment');
          }).catch((error) => {
            devError('❌ Error pre-fetching team members (non-fatal):', error);
          });
        }
      }

      // Initialize technical sections for each equipment
      const initialTechnicalSections: Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>> = {};
      const initialSelectedSections: Record<string, string> = {};

      transformedEquipment.forEach((item) => {
        initialTechnicalSections[item.id] = item.technicalSections || [];
        initialSelectedSections[item.id] = '';
      });

      setTechnicalSections(initialTechnicalSections);
      setSelectedSection(initialSelectedSections);

      // Initialize custom fields for each equipment
      const initialCustomFields: Record<string, Array<{ name: string, value: string }>> = {};
      transformedEquipment.forEach((item) => {
        // // console.log('Equipment:', item.id, 'Custom Fields:', item.customFields);
        initialCustomFields[item.id] = item.customFields || [];
      });
      // // console.log('Initial Custom Fields:', initialCustomFields);
      setCustomFields(initialCustomFields);

      // Initialize team custom fields for each equipment
      const initialTeamCustomFields: Record<string, Array<{ name: string, value: string }>> = {};
      transformedEquipment.forEach((item) => {
        // // console.log('Equipment:', item.id, 'Team Custom Fields:', item.teamCustomFields);
        initialTeamCustomFields[item.id] = item.teamCustomFields || [];
      });
      // // console.log('Initial Team Custom Fields:', initialTeamCustomFields);
      setTeamCustomFields(initialTeamCustomFields);

      // Load documents + project members once per (project, equipment id set); parent often passes a new array ref each render.
      if (shouldLoadDocsMembersForEquipment(transformedEquipment)) {
        loadDocumentsForEquipment(transformedEquipment);
        loadProjectMembers();
      }
    } else {
      lastEquipmentDocsMembersLoadKeyRef.current = null;
      // If equipment is empty or undefined: only clear when standalone or no projectId.
      // For project view, do NOT clear here so that refreshEquipmentData can populate localEquipment
      // (parent often passes [] because getProjectsByFirm doesn't include full equipment; clearing would wipe data we just fetched).
      if (projectId === 'standalone' || !projectId) {
        setLocalEquipment([]);
      }
    }
  }, [equipment, projectId, getCreatedOrderIds, equipmentPropIdsKey]);

  // Keep optional summary (total/active/dispatched/completed) in sync for standalone equipment
  useEffect(() => {
    if (!onSummaryChange || projectId !== 'standalone') return;

    const total = localEquipment.length;
    const completed = localEquipment.filter((eq: any) => eq.status === 'completed').length;
    // Dispatched is tracked via progressPhase, not status
    const dispatched = localEquipment.filter((eq: any) => eq.progressPhase === 'dispatched').length;
    // Active = Total - Dispatched (progressPhase !== 'dispatched')
    const active = localEquipment.filter((eq: any) => eq.progressPhase !== 'dispatched').length;

    onSummaryChange({
      total,
      active,
      dispatched,
      completed,
    });
  }, [localEquipment, projectId, onSummaryChange]);

  const getProjectMembersCached = useCallback(async (force: boolean = false): Promise<any[]> => {
    if (!projectId || projectId === 'standalone') return [];
    if (!force && projectMembersFetchedForRef.current === projectId && projectMembers.length > 0) {
      return projectMembers;
    }
    if (!force && projectMembersFetchPromiseRef.current) {
      return projectMembersFetchPromiseRef.current;
    }

    const request = (async () => {
      try {
        const members = await fastAPI.getProjectMembers(projectId);
        const rows = Array.isArray(members) ? members : [];
        setProjectMembers(rows);
        projectMembersFetchedForRef.current = projectId;
        return rows;
      } catch (error) {
        console.error('❌ Error loading project members:', error);
        setProjectMembers([]);
        return [];
      } finally {
        projectMembersFetchPromiseRef.current = null;
      }
    })();

    projectMembersFetchPromiseRef.current = request;
    return request;
  }, [projectId, projectMembers]);

  // Load project members for team assignment
  const loadProjectMembers = async (force: boolean = false) => {
    await getProjectMembersCached(force);
  };

  // Load project members when projectId is set (e.g. after project create) so PM/VDCR show in EQU Team tab even before equipment loads
  useEffect(() => {
    if (projectId && projectId !== 'standalone') {
      loadProjectMembers();
    }
  }, [projectId, getProjectMembersCached]);

  // Listen for team member changes from Settings tab
  useEffect(() => {
    const handleTeamMemberChange = () => {
      // // console.log('🔄 EQUIPMENT GRID: Team member change detected, refreshing project members...');
      loadProjectMembers(true);
    };

    // Listen for team member changes
    window.addEventListener('teamMemberCreated', handleTeamMemberChange);
    window.addEventListener('teamMemberUpdated', handleTeamMemberChange);
    window.addEventListener('teamMemberDeleted', handleTeamMemberChange);

    return () => {
      window.removeEventListener('teamMemberCreated', handleTeamMemberChange);
      window.removeEventListener('teamMemberUpdated', handleTeamMemberChange);
      window.removeEventListener('teamMemberDeleted', handleTeamMemberChange);
    };
  }, [projectId]);

  // Auto-populate engineer field when project members change
  useEffect(() => {
    if (projectMembers.length > 0 && localEquipment.length > 0) {

      const engineerMembers = projectMembers.filter(member =>
        member.position && member.position.toLowerCase().includes('engineer')
      );

      if (engineerMembers.length > 0) {

        setLocalEquipment(prevEquipment =>
          prevEquipment.map(equipment => {
            const assignedEngineer = engineerMembers.find(eng => {
              if (!eng.equipment_assignments) return false;

              // Check for "All Equipment" assignment
              if (eng.equipment_assignments.includes("All Equipment")) {
                return true;
              }

              // Check for specific equipment name match
              if (equipment.name && eng.equipment_assignments.includes(equipment.name)) {
                return true;
              }

              // Check for equipment type match
              if (equipment.type && eng.equipment_assignments.includes(equipment.type)) {
                return true;
              }

              return false;
            });

            if (assignedEngineer) {
              return {
                ...equipment,
                engineer: assignedEngineer.name
              };
            }
            return equipment;
          })
        );
      }
    }
  }, [projectMembers, localEquipment.length]);

  // Auto-remove team members when they're deleted from Settings
  useEffect(() => {
    if (projectMembers.length > 0 && localEquipment.length > 0) {
      // // console.log('🔄 Checking for removed project members...');

      setLocalEquipment(prevEquipment =>
        prevEquipment.map(equipment => {
          let updatedEquipment = { ...equipment };

          // Check if supervisor is still in project members
          if (equipment.supervisor) {
            const supervisorExists = projectMembers.find(member =>
              member.name === equipment.supervisor
            );
            if (!supervisorExists) {
              // // console.log('❌ Supervisor removed from project:', equipment.supervisor);
              updatedEquipment.supervisor = '';
              updatedEquipment.supervisorEmail = '';
              updatedEquipment.supervisorPhone = '';
            }
          }

          // Check if welder is still in project members
          if (equipment.welder) {
            const welderExists = projectMembers.find(member =>
              member.name === equipment.welder
            );
            if (!welderExists) {
              // // console.log('❌ Welder removed from project:', equipment.welder);
              updatedEquipment.welder = '';
              updatedEquipment.welderEmail = '';
              updatedEquipment.welderPhone = '';
            }
          }

          // Check if engineer is still in project members
          if (equipment.engineer) {
            const engineerExists = projectMembers.find(member =>
              member.name === equipment.engineer
            );
            if (!engineerExists) {
              // // console.log('❌ Engineer removed from project:', equipment.engineer);
              updatedEquipment.engineer = '';
            }
          }

          // Check if QC Inspector is still in project members
          if (equipment.qcInspector) {
            const qcExists = projectMembers.find(member =>
              member.name === equipment.qcInspector
            );
            if (!qcExists) {
              // // console.log('❌ QC Inspector removed from project:', equipment.qcInspector);
              updatedEquipment.qcInspector = '';
              updatedEquipment.qcInspectorEmail = '';
              updatedEquipment.qcInspectorPhone = '';
            }
          }

          // Check if Project Manager is still in project members
          if (equipment.projectManager) {
            const pmExists = projectMembers.find(member =>
              member.name === equipment.projectManager
            );
            if (!pmExists) {
              // // console.log('❌ Project Manager removed from project:', equipment.projectManager);
              updatedEquipment.projectManager = '';
              updatedEquipment.projectManagerEmail = '';
              updatedEquipment.projectManagerPhone = '';
            }
          }

          return updatedEquipment;
        })
      );
    }
  }, [projectMembers]);

  // Initialize technical sections for each equipment
  useEffect(() => {
    if (localEquipment.length > 0) {
      const newTechnicalSections: Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>> = {};
      const newSelectedSections: Record<string, string> = {};

      localEquipment.forEach(item => {
        if (!technicalSections[item.id]) {
          const defaultSections: Array<{ name: string, customFields: Array<{ name: string, value: string }> }> = item.technicalSections || [];

          newTechnicalSections[item.id] = defaultSections;
          newSelectedSections[item.id] = '';
        }
      });

      if (Object.keys(newTechnicalSections).length > 0) {
        setTechnicalSections(prev => ({ ...prev, ...newTechnicalSections }));
        setSelectedSection(prev => ({ ...prev, ...newSelectedSections }));
      }
    }
  }, [localEquipment]);

  // Fetch available team members for suggestions
  const fetchAvailableTeamMembers = async () => {
    try {
      const currentUserRole = localStorage.getItem('userRole');
      const currentUserFirmId = localStorage.getItem('firmId');

      let members = [];

      if (currentUserRole === 'super_admin') {
        const users = await fastAPI.getUsers();
        members = Array.isArray(users) ? users : [];
      } else if (currentUserRole === 'firm_admin' && currentUserFirmId) {
        const firmMembers = await fastAPI.getTeamMembersByFirm(currentUserFirmId);
        members = Array.isArray(firmMembers) ? firmMembers : [];
      } else if (currentUserRole === 'project_manager' && projectId && projectId !== 'standalone') {
        // Same data as getProjectMembers / fetchProjectUsers — avoid a second /project_members HTTP call.
        const rows = await getProjectMembersCached();
        members = Array.isArray(rows)
          ? (rows as any[]).map((member: any) => ({
              id: member.id,
              name: member.name || member.users?.full_name || member.users?.name || 'Unknown',
              email: member.email || member.users?.email || '',
              role: member.role,
              position: member.position || member.role,
              user_id: member.user_id,
              project_id: member.project_id,
              equipment_assignments: member.equipment_assignments || [],
            }))
          : [];
      }

      // // console.log('👥 Available team members fetched:', members);
      setAvailableTeamMembers(members);
    } catch (error) {
      console.error('❌ Error fetching team members for suggestions:', error);
    }
  };

  // Fetch project-specific users for team custom fields dropdown
  const fetchProjectUsers = async () => {
    try {
      // // console.log('👥 Fetching project users for team custom fields...', projectId);
      const users = await getProjectMembersCached();
      // // console.log('👥 Project users fetched:', users);
      setAllUsers(Array.isArray(users) ? users : []);
    } catch (error) {
      console.error('❌ Error fetching project users:', error);
    }
  };

  // Handle add new user option
  const handleAddNewUser = (value: string) => {
    if (value === 'add_new_user') {
      setShowAddUserModal(true);
      setNewUserData({ name: '', email: '' });
    } else {
      setNewTeamFieldValue(value);
    }
  };

  // Handle add new user option in edit mode
  const handleEditAddNewUser = (value: string, fieldIndex: number, teamFields: any[]) => {
    if (value === 'add_new_user') {
      setShowAddUserModal(true);
      setNewUserData({ name: '', email: '' });
    } else {
      const updatedFields = [...teamFields];
      updatedFields[fieldIndex] = { ...updatedFields[fieldIndex], value: value };

      setTeamCustomFields(prev => ({
        ...prev,
        [editingEquipmentId!]: updatedFields
      }));

      // w to database immediately
      updateEquipment(editingEquipmentId!, {
        team_custom_fields: updatedFields
      }).then(() => {
        refreshEquipmentData();
      }).catch((error) => {
        console.error('Error saving team field value change:', error);
      });
    }
  };

  // Load team members when component mounts (sequential so project_manager shares one getProjectMembersCached round-trip)
  useEffect(() => {
    void (async () => {
      await fetchProjectUsers();
      await fetchAvailableTeamMembers();
    })();
    // Removed fetchCurrentProject() from mount path: it wasn't used for initial equipment view rendering.
  }, [projectId]);

  // Fetch current project data
  const fetchCurrentProject = async () => {
    try {
      // // console.log('🏢 Fetching current project data...', projectId);
      const project = await fastAPI.getProjectById(projectId);
      // // console.log('🏢 Current project fetched:', project);
      setCurrentProject(project[0] || null);
    } catch (error) {
      console.error('❌ Error fetching current project:', error);
    }
  };

  // Auto-fill dropdowns when team members are loaded and equipment is being edited
  useEffect(() => {
    if (editingEquipmentId && availableTeamMembers.length > 0) {
      const equipment = localEquipment.find(eq => eq.id === editingEquipmentId);
      if (equipment) {
        // // console.log('🔄 Auto-filling dropdowns for equipment:', equipment.id);

        // Set selected IDs for dropdowns based on existing data
        if (equipment.supervisor) {
          const supervisorMember = projectMembers.find(member => member.name === equipment.supervisor);
          if (supervisorMember) {
            // // console.log('👤 Found supervisor member:', supervisorMember);
            setSelectedSupervisorId(supervisorMember.id);
          }
        }
        if (equipment.welder) {
          const welderMember = projectMembers.find(member => member.name === equipment.welder);
          if (welderMember) {
            // // console.log('👤 Found welder member:', welderMember);
            setSelectedWelderId(welderMember.id);
          }
        }
        if (equipment.engineer) {
          const engineerMember = projectMembers.find(member => member.name === equipment.engineer);
          if (engineerMember) {
            // // console.log('👤 Found engineer member:', engineerMember);
            setSelectedEngineerId(engineerMember.id);
          }
        }
        if (equipment.qcInspector) {
          const qcMember = projectMembers.find(member => member.name === equipment.qcInspector);
          if (qcMember) {
            // // console.log('👤 Found QC Inspector member:', qcMember);
            setSelectedQcInspectorId(qcMember.id);
          }
        }
        if (equipment.projectManager) {
          const pmMember = projectMembers.find(member => member.name === equipment.projectManager);
          if (pmMember) {
            // // console.log('👤 Found Project Manager member:', pmMember);
            setSelectedProjectManagerId(pmMember.id);
          }
        }
      }
    }
  }, [editingEquipmentId, projectMembers, localEquipment]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showTeamSuggestions) {
        setShowTeamSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTeamSuggestions]);

  // Select team member from suggestions
  const selectTeamMember = (member: any) => {
    // // console.log('👤 Selected team member:', member);
    setNewTeamName(member.full_name);
    setNewTeamEmail(member.email);
    setNewTeamPhone(member.phone || '');
    setShowTeamSuggestions(false);
    // // console.log('✅ Auto-filled fields:', {
    //   name: member.full_name,
    //   email: member.email,
    //   phone: member.phone || ''
    // });
  };

  // Function to refresh equipment data from database (memoized with useCallback)
  // PERFORMANCE: Added debouncing and request cancellation to prevent race conditions
  const refreshEquipmentData = useCallback(async (
    immediate: boolean = false,
    options?: { skipDocuments?: boolean }
  ) => {
    const skipDocuments = options?.skipDocuments === true;
    // Cancel any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    
    // Only abort in-flight request when switching to a different project (avoids discarding valid response for current project)
    if (refreshAbortControllerRef.current && refreshProjectIdRef.current !== projectId) {
      refreshAbortControllerRef.current.abort();
    }

    const performRefresh = async () => {
      // Standalone-specific guard: skip overlapping and overly-frequent refreshes.
      if (projectId === 'standalone') {
        if (standaloneRefreshInFlightRef.current) return;
        const now = Date.now();
        // Keep UI responsive while preventing burst fetch loops from multiple effects/events.
        if (!immediate && now - standaloneLastRefreshAtRef.current < 2500) return;
        // Additional cooldown for non-critical/background standalone refreshes.
        // User actions that require fresh data already call refreshEquipmentData(true).
        if (!immediate && now - standaloneLastSuccessRefreshAtRef.current < 30000) return;
        standaloneRefreshInFlightRef.current = true;
        standaloneLastRefreshAtRef.current = now;
      }

      // Create new abort controller for this request
      const abortController = new AbortController();
      refreshAbortControllerRef.current = abortController;
      refreshProjectIdRef.current = projectId;

      try {
        devLog('🔄 refreshEquipmentData: Starting refresh for project:', projectId);
        
        // Set loading state for progress images
        setIsLoadingProgressImages(true);
        
        // Create cache key for this project's equipment
        const cacheKey = projectId === 'standalone' 
          ? `${CACHE_KEYS.EQUIPMENT}_standalone`
          : `${CACHE_KEYS.EQUIPMENT}_${projectId}`;
        
        // Helper function to create lightweight equipment metadata (no heavy blobs).
        // Preserve created_by_user and entry_text so Updates tab shows "Uploaded by" and description correctly from cache.
        // Preserve first progress image URL so at least one image shows from cache.
        const createLightweightEquipment = (equipment: any[]) => {
          return equipment.map((eq: any) => ({
            ...eq,
            progress_images: (eq.progress_images?.length && eq.progress_images[0]) ? [eq.progress_images[0]] : [],
            progress_images_metadata: eq.progress_images_metadata?.map((img: any) => ({
              id: img.id,
              description: img.description,
              uploaded_by: img.uploaded_by,
              upload_date: img.upload_date,
            })) || [],
            progress_entries: eq.progress_entries?.map((entry: any) => ({
              id: entry.id,
              text: entry.text || entry.entry_text,
              date: entry.date || entry.created_at,
              type: entry.type,
              created_at: entry.created_at,
              entry_text: entry.entry_text,
              created_by_user: entry.created_by_user,
              users: entry.users,
              uploadedBy: entry.uploadedBy,
            })) || [],
            documents: [],
            images: [],
          }));
        };
        
        // Check cache first for lightweight metadata
        const cachedEquipment = getCache<any[]>(cacheKey);
        if (cachedEquipment !== null && Array.isArray(cachedEquipment) && cachedEquipment.length > 0) {
          const transformedCached = transformEquipmentDataCallback(cachedEquipment);
          // Only use cache when it has display-ready data (entries have created_by_user/entry_text, images when metadata exists)
          const cacheHasDisplayReadyEntries = transformedCached.every((eq: Equipment) =>
            !eq.progressEntries?.length || (eq.progressEntries as any[]).every((e: any) => e.created_by_user || e.entry_text || e.text)
          );
          const cacheHasImagesWhenMeta = transformedCached.every((eq: Equipment) =>
            !eq.progressImagesMetadata?.length || (eq.progressImages?.length ?? 0) > 0
          );
          if (currentProjectIdRef.current === projectId && localEquipmentLengthRef.current === 0 && cacheHasDisplayReadyEntries && cacheHasImagesWhenMeta) {
            setLocalEquipment(transformedCached);
          }

          // Fetch fresh data in background (with images/audio/documents)
          try {
            const freshEquipment = projectId === 'standalone' 
              ? await fastAPI.getStandaloneEquipment(undefined, undefined, progressImagesApiOptions) 
              : await fastAPI.getEquipmentByProject(projectId, progressImagesApiOptions);
            
            const equipmentArray = Array.isArray(freshEquipment) ? freshEquipment : [];
            let toSet = transformEquipmentDataCallback(equipmentArray);
            toSet = expandProgressImagesForOnDemand(toSet);
            const visiblePage = getFilteredAndSortedEquipment(toSet, selectedPhase, searchQuery).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
            toSet = await fillLatestProgressImagesForPage(toSet, visiblePage, projectId === 'standalone');
            
            // Cache lightweight version
            const lightweight = createLightweightEquipment(equipmentArray);
            setCache(cacheKey, lightweight, { 
              ttl: 24 * 60 * 60 * 1000, // 24 hours TTL (much longer)
              maxSize: 4 * 1024 * 1024 // 4MB — full equipment + progress payloads can exceed 2MB
            });
            
            // Update with fresh data when response is still for the current project (fix: data returned but not shown when request was aborted)
            if (currentProjectIdRef.current === projectId) {
              setLocalEquipment(toSet);
              if (!skipDocuments && shouldLoadDocsMembersForEquipment(toSet)) {
                await loadDocumentsForEquipment(toSet);
              }
            }
            setIsLoadingProgressImages(false);
          } catch (error) {
            // FIX: Don't clear state on error - preserve existing cached data
            console.warn('Background refresh failed for equipment:', error);
            setIsLoadingProgressImages(false);
            // Keep existing cached data visible
          }
          if (projectId === 'standalone') standaloneLastSuccessRefreshAtRef.current = Date.now();
          return;
        }
        
        // No valid cache, check for expired cache as fallback
        const expiredCache = getCacheEvenIfExpired<any[]>(cacheKey);
        
        // If we have existing state, preserve it while fetching
        // Otherwise, use expired cache as fallback
        if (localEquipment.length > 0) {
          // Preserve existing state, fetch fresh data in background
          setIsLoadingProgressImages(false);
          try {
            const freshEquipment = projectId === 'standalone' 
              ? await fastAPI.getStandaloneEquipment(undefined, undefined, progressImagesApiOptions) 
              : await fastAPI.getEquipmentByProject(projectId, progressImagesApiOptions);
            
            const equipmentArray = Array.isArray(freshEquipment) ? freshEquipment : [];
            if (equipmentArray.length > 0) {
              let toSet = transformEquipmentDataCallback(equipmentArray);
              toSet = expandProgressImagesForOnDemand(toSet);
              const visiblePage = getFilteredAndSortedEquipment(toSet, selectedPhase, searchQuery).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
              toSet = await fillLatestProgressImagesForPage(toSet, visiblePage, projectId === 'standalone');
              const lightweight = createLightweightEquipment(equipmentArray);
              setCache(cacheKey, lightweight, { 
                ttl: 24 * 60 * 60 * 1000, // 24 hours TTL
                maxSize: 4 * 1024 * 1024
              });
              if (currentProjectIdRef.current === projectId) {
                setLocalEquipment(toSet);
                if (!skipDocuments && shouldLoadDocsMembersForEquipment(toSet)) {
                  await loadDocumentsForEquipment(toSet);
                }
              }
            }
            // FIX: Don't clear state if fetch fails - preserve existing data
          } catch (error) {
            console.warn('Background refresh failed for equipment:', error);
            // FIX: Don't clear state on error - preserve existing data
          }
          if (projectId === 'standalone') standaloneLastSuccessRefreshAtRef.current = Date.now();
          return;
        } else if (expiredCache !== null && Array.isArray(expiredCache) && expiredCache.length > 0) {
          const transformedExpired = transformEquipmentDataCallback(expiredCache);
          const expiredHasDisplayReadyEntries = transformedExpired.every((eq: Equipment) =>
            !eq.progressEntries?.length || (eq.progressEntries as any[]).every((e: any) => e.created_by_user || e.entry_text || e.text)
          );
          const expiredHasImagesWhenMeta = transformedExpired.every((eq: Equipment) =>
            !eq.progressImagesMetadata?.length || (eq.progressImages?.length ?? 0) > 0
          );
          if (currentProjectIdRef.current === projectId && localEquipmentLengthRef.current === 0 && expiredHasDisplayReadyEntries && expiredHasImagesWhenMeta) {
            setLocalEquipment(transformedExpired);
          }
          setIsLoadingProgressImages(false);
          
          // Fetch fresh data in background
          try {
            const freshEquipment = projectId === 'standalone' 
              ? await fastAPI.getStandaloneEquipment(undefined, undefined, progressImagesApiOptions) 
              : await fastAPI.getEquipmentByProject(projectId, progressImagesApiOptions);
            
            const equipmentArray = Array.isArray(freshEquipment) ? freshEquipment : [];
            if (equipmentArray.length > 0) {
              let toSet = transformEquipmentDataCallback(equipmentArray);
              toSet = expandProgressImagesForOnDemand(toSet);
              const visiblePage = getFilteredAndSortedEquipment(toSet, selectedPhase, searchQuery).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
              toSet = await fillLatestProgressImagesForPage(toSet, visiblePage, projectId === 'standalone');
              const lightweight = createLightweightEquipment(equipmentArray);
              setCache(cacheKey, lightweight, { 
                ttl: 24 * 60 * 60 * 1000, // 24 hours TTL
                maxSize: 4 * 1024 * 1024
              });
              if (currentProjectIdRef.current === projectId) {
                setLocalEquipment(toSet);
                if (!skipDocuments && shouldLoadDocsMembersForEquipment(toSet)) {
                  await loadDocumentsForEquipment(toSet);
                }
              }
            }
            // FIX: Don't clear state if fetch fails - preserve existing expired cache
          } catch (error) {
            console.warn('Background refresh failed for equipment:', error);
            // FIX: Don't clear state on error - preserve existing expired cache
          }
          if (projectId === 'standalone') standaloneLastSuccessRefreshAtRef.current = Date.now();
          return;
        }
        
        // No cache at all, fetch fresh data
        const freshEquipment = projectId === 'standalone' 
          ? await fastAPI.getStandaloneEquipment(undefined, undefined, progressImagesApiOptions) 
          : await fastAPI.getEquipmentByProject(projectId, progressImagesApiOptions);
        
        devLog('🔄 refreshEquipmentData: Fresh equipment data received, type:', typeof freshEquipment, 'isArray:', Array.isArray(freshEquipment));

        // Ensure freshEquipment is an array
        const equipmentArray = Array.isArray(freshEquipment) ? freshEquipment : [];
        devLog('🔄 refreshEquipmentData: Equipment array length:', equipmentArray.length);
        
        // Only update if we have data and response is still for the current project (fix: data returned but not shown when request was aborted)
        if (equipmentArray.length > 0 && currentProjectIdRef.current === projectId) {
          // Cache lightweight version (metadata only, no images/audio/documents)
          const lightweight = createLightweightEquipment(equipmentArray);
          setCache(cacheKey, lightweight, { 
            ttl: 24 * 60 * 60 * 1000, // 24 hours TTL (much longer)
            maxSize: 4 * 1024 * 1024 // 4MB — full equipment + progress payloads can exceed 2MB
          });
          
          let toSet = transformEquipmentDataCallback(equipmentArray);
          toSet = expandProgressImagesForOnDemand(toSet);
          const visiblePage = getFilteredAndSortedEquipment(toSet, selectedPhase, searchQuery).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
          toSet = await fillLatestProgressImagesForPage(toSet, visiblePage, projectId === 'standalone');
          const transformedEquipment = toSet;
          devLog('🔄 refreshEquipmentData: Transformed equipment count:', transformedEquipment.length);
      
          // Post-process: For standalone equipment, ensure status is 'active' (not 'pending')
          // This handles both new equipment (which should already be 'active') and old equipment
          if (projectId === 'standalone') {
            transformedEquipment.forEach((eq: Equipment) => {
              if (eq.status === 'pending' || !eq.status) {
                eq.status = 'active';
              }
            });
          }

          // Update the local equipment state - THIS IS CRITICAL FOR UI UPDATE
          devLog('🔄 refreshEquipmentData: Updating localEquipment state with', transformedEquipment.length, 'items');
          
          // Debug: Log progress images for first equipment item
          if (transformedEquipment.length > 0) {
            const firstEq = transformedEquipment[0];
            devLog('🔄 refreshEquipmentData: First equipment progress images:', firstEq.progressImages?.length || 0, 'images');
          }

          setLocalEquipment(transformedEquipment);
          if (!skipDocuments && shouldLoadDocsMembersForEquipment(transformedEquipment)) {
            await loadDocumentsForEquipment(transformedEquipment);
          }
          devLog('✅ refreshEquipmentData: localEquipment state updated');
          if (projectId === 'standalone') standaloneLastSuccessRefreshAtRef.current = Date.now();

          // Update custom fields state with fresh data
          const updatedCustomFields: Record<string, Array<{ name: string, value: string }>> = {};
          transformedEquipment.forEach((item) => {
            // // console.log('🔄 Refreshing custom fields for equipment:', item.id, 'Fields:', item.customFields);
            updatedCustomFields[item.id] = item.customFields || [];
          });
          // // console.log('🔄 Updated Custom Fields:', updatedCustomFields);
          setCustomFields(updatedCustomFields);

          // Update technical sections state with fresh data
          const updatedTechnicalSections: Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>> = {};
          transformedEquipment.forEach((item) => {
            // // console.log('🔄 Refreshing technical sections for equipment:', item.id, 'Sections:', item.technicalSections);
            // // console.log('🔄 Raw technical_sections from DB:', item.technicalSections);
            // // console.log('🔄 Type of technicalSections:', typeof item.technicalSections);
            // // console.log('🔄 Length of technicalSections:', item.technicalSections?.length);
            // // console.log('🔄 Detailed technical_sections:', JSON.stringify(item.technicalSections, null, 2));
            updatedTechnicalSections[item.id] = item.technicalSections || [];
          });
          // // console.log('🔄 Updated Technical Sections:', updatedTechnicalSections);
          // // console.log('🔄 Updated Technical Sections JSON:', JSON.stringify(updatedTechnicalSections, null, 2));
          setTechnicalSections(updatedTechnicalSections);

          // Update selected sections state with fresh data
          const updatedSelectedSections: Record<string, string> = {};
          transformedEquipment.forEach((item) => {
            if (item.technicalSections && item.technicalSections.length > 0) {
              updatedSelectedSections[item.id] = item.technicalSections[0].name;
            }
          });
          // // console.log('🔄 Updated Selected Sections:', updatedSelectedSections);
          setSelectedSection(updatedSelectedSections);

          // Update team custom fields state with fresh data
          const updatedTeamCustomFields: Record<string, Array<{ name: string, value: string }>> = {};
          transformedEquipment.forEach((item) => {
            // // console.log('🔄 Refreshing team custom fields for equipment:', item.id, 'Fields:', item.teamCustomFields);
            updatedTeamCustomFields[item.id] = item.teamCustomFields || [];
          });
          // // console.log('🔄 Updated Team Custom Fields:', updatedTeamCustomFields);
          setTeamCustomFields(updatedTeamCustomFields);

          devLog('✅ refreshEquipmentData: Completed successfully');
        } else if (equipmentArray.length === 0 && currentProjectIdRef.current === projectId) {
          // Fetch returned empty for current project - show empty (e.g. switched to project with no equipment)
          setLocalEquipment([]);
          if (projectId === 'standalone') standaloneLastSuccessRefreshAtRef.current = Date.now();
        }
        
        // Clear loading state for progress images
        setIsLoadingProgressImages(false);
      
      // Clear abort controller reference
      if (refreshAbortControllerRef.current === abortController) {
        refreshAbortControllerRef.current = null;
      }

      } catch (error: any) {
        // Don't log aborted requests as errors
        if (error?.name !== 'AbortError' && !abortController.signal.aborted) {
          devError('❌ Error refreshing equipment data:', error);
        }
        // FIX: Don't clear state on error - preserve existing data
        // Try to use expired cache as fallback if we have no current state
        if (localEquipment.length === 0) {
          const cacheKey = projectId === 'standalone' 
            ? `${CACHE_KEYS.EQUIPMENT}_standalone`
            : `${CACHE_KEYS.EQUIPMENT}_${projectId}`;
          const expiredCache = getCacheEvenIfExpired<any[]>(cacheKey);
          if (expiredCache !== null && Array.isArray(expiredCache) && expiredCache.length > 0) {
            const transformedExpired = transformEquipmentDataCallback(expiredCache);
            if (currentProjectIdRef.current === projectId) {
              setLocalEquipment(transformedExpired);
            }
          }
        }
        // Clear loading state on error
        setIsLoadingProgressImages(false);
        // Clear abort controller reference on error
        if (refreshAbortControllerRef.current === abortController) {
          refreshAbortControllerRef.current = null;
        }
      } finally {
        if (projectId === 'standalone') {
          standaloneRefreshInFlightRef.current = false;
        }
      }
    };

    // Debounce: Wait 300ms before refreshing (unless immediate is true)
    // This prevents multiple rapid calls from causing race conditions
    if (immediate) {
      if (refreshInFlightRef.current && refreshInFlightProjectIdRef.current === projectId) {
        // Reuse in-flight refresh for same project instead of issuing duplicate API batches
        await refreshInFlightRef.current;
        return;
      }
      const p = performRefresh();
      refreshInFlightRef.current = p;
      refreshInFlightProjectIdRef.current = projectId;
      await p.finally(() => {
        if (refreshInFlightRef.current === p) {
          refreshInFlightRef.current = null;
          refreshInFlightProjectIdRef.current = null;
        }
      });
    } else {
      refreshTimeoutRef.current = setTimeout(() => {
        if (refreshInFlightRef.current && refreshInFlightProjectIdRef.current === projectId) {
          return;
        }
        const p = performRefresh();
        refreshInFlightRef.current = p;
        refreshInFlightProjectIdRef.current = projectId;
        p.finally(() => {
          if (refreshInFlightRef.current === p) {
            refreshInFlightRef.current = null;
            refreshInFlightProjectIdRef.current = null;
          }
        });
        refreshTimeoutRef.current = null;
      }, 300);
    }
  }, [projectId, transformEquipmentDataCallback, shouldLoadDocsMembersForEquipment]); // Memoized with projectId dependency

  // CRITICAL FIX: Refresh equipment data on mount to ensure progress images are loaded
  // The initial equipment prop might be stale and missing progress images
  // This must be AFTER refreshEquipmentData is defined
  // NOTE: For project_manager, vdcr_manager, editors/viewers with filtered equipment, we should NOT refresh from database
  // as it would override the filtered equipment. Instead, we rely on the filtered equipment prop.
  // NOTE: For standalone equipment, the parent (Index) loads data when user clicks the tab; do not duplicate fetch here.
  useEffect(() => {
    // Standalone: parent owns the data and fetches only when user opens the tab – skip to avoid duplicate requests
    if (projectId === 'standalone') return;

    // When parent already passed full equipment with progress data, skip duplicate fetch
    if (equipment && Array.isArray(equipment) && equipment.length > 0) {
      const first = equipment[0] as any;
      const hasProgressData = (first.progress_entries && first.progress_entries.length > 0) ||
        (first.progress_images_metadata && first.progress_images_metadata.length > 0) ||
        (first.progress_images && first.progress_images.length > 0);
      if (hasProgressData) return;
    }

    // Always refresh from API when parent didn't pass equipment (empty or missing).
    // This fixes "No Equipment Added Yet" when getProjectsByFirm doesn't include equipment and for filtered users who were previously skipped.
    refreshEquipmentData(true);
    // equipment: use equipmentPropIdsKey so parent re-renders with same rows don't re-trigger full refresh storms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshEquipmentData, equipmentPropIdsKey]);
  
  // Reset pagination to page 1 when filters change or when switching between project and standalone
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPhase, searchQuery, projectId]);

  // Fill latest progress image for the *visible* page (batched: one API call for all needLatest)
  useEffect(() => {
    if (!localEquipment.length) return;
    const visibleList = getFilteredAndSortedEquipment(localEquipment, selectedPhase, searchQuery);
    const start = (currentPage - 1) * itemsPerPage;
    const visiblePage = visibleList.slice(start, start + itemsPerPage);
    const needLatest = visiblePage.filter(eq => eq.progressImagesMetadata?.length && !eq.progressImages?.[0]);
    if (needLatest.length === 0) return;
    const isStandalone = projectId === 'standalone';
    const ids = needLatest.map((eq) => eq.id);
    const idsKey = ids.slice().sort().join(',');
    if (progressImageBatchIdsRef.current && progressImageBatchIdsRef.current.join(',') === idsKey) return;
    progressImageBatchIdsRef.current = ids;
    fastAPI.getLatestProgressImageUrlsBatch(ids, isStandalone).then((urlMap) => {
      progressImageBatchIdsRef.current = null;
      const updates = new Map<string, string>();
      for (const id of ids) {
        const url = urlMap[id];
        if (url) updates.set(id, url);
      }
      if (updates.size === 0) return;
      setLocalEquipment(prev => prev.map(e => {
        const url = updates.get(e.id);
        if (!url) return e;
        const next = [...(e.progressImages || [])];
        if (next.length > 0) next[0] = url;
        return { ...e, progressImages: next };
      }));
    }).catch(() => {
      progressImageBatchIdsRef.current = null;
    });
  }, [currentPage, localEquipment.length, projectId, itemsPerPage, selectedPhase, searchQuery, getFilteredAndSortedEquipment]);

  // Pre-cache next page equipment metadata when user navigates pages
  useEffect(() => {
    const preCacheNextPage = async () => {
      // Project: get_project_equipment_bundle returns the full list; pagination is client-side only — never re-fetch here.
      // Standalone: optional cache warm for paged views (parent may cap rows).
      if (projectId !== 'standalone') return;
      if (!localEquipment || localEquipment.length === 0) return;
      
      const totalPages = Math.ceil(localEquipment.length / itemsPerPage);
      const nextPage = currentPage + 1;
      
      // Only pre-cache if next page exists and we haven't cached it yet
      if (nextPage <= totalPages) {
        const nextPageEndExclusive = (currentPage + 1) * itemsPerPage;
        if (localEquipment.length >= nextPageEndExclusive) {
          return;
        }

        const cacheKey = `${CACHE_KEYS.EQUIPMENT}_standalone`;
        
        // Check current cache
        const cached = getCache<any[]>(cacheKey);
        if (cached && Array.isArray(cached)) {
          const nextPageStartIndex = nextPage * itemsPerPage;
          const nextPageEndIndex = nextPageStartIndex + itemsPerPage;
          
          // Check if we already have next page data in cache
          if (cached.length >= nextPageEndIndex) {
            // Already cached, skip
            return;
          }
        }
        
        // Pre-cache next page in background (non-blocking)
        try {
          const freshEquipment = await fastAPI.getStandaloneEquipment(undefined, undefined, progressImagesApiOptions);
          
          if (freshEquipment && Array.isArray(freshEquipment)) {
            const equipmentToCache = freshEquipment.slice(0, 24); // Limit to 24 for standalone
            
            // Create lightweight version (preserve created_by_user/entry_text for Updates tab, first image for display)
            const lightweight = equipmentToCache.map((eq: any) => ({
              ...eq,
              progress_images: (eq.progress_images?.length && eq.progress_images[0]) ? [eq.progress_images[0]] : [],
              progress_images_metadata: eq.progress_images_metadata?.map((img: any) => ({
                id: img.id,
                description: img.description,
                uploaded_by: img.uploaded_by,
                upload_date: img.upload_date,
              })) || [],
              progress_entries: eq.progress_entries?.map((entry: any) => ({
                id: entry.id,
                text: entry.text || entry.entry_text,
                date: entry.date || entry.created_at,
                type: entry.type,
                created_at: entry.created_at,
                entry_text: entry.entry_text,
                created_by_user: entry.created_by_user,
                users: entry.users,
                uploadedBy: entry.uploadedBy,
              })) || [],
              documents: [],
              images: [],
            }));
            
            // Update cache with lightweight version
            setCache(cacheKey, lightweight, {
              ttl: 10 * 60 * 1000,
              maxSize: 4 * 1024 * 1024
            });
          }
        } catch (error) {
          // Silently fail - pre-caching shouldn't break the app
          console.warn(`Failed to pre-cache next page for ${projectId}:`, error);
        }
      }
    };
    
    // Pre-cache next page when current page or list length changes (not when only progress image URL is updated)
    preCacheNextPage();
  }, [currentPage, localEquipment.length, projectId, itemsPerPage]);

  const [documents, setDocuments] = useState<Record<string, Array<{ id: string, file?: File, name: string, uploadedBy: string, uploadDate: string, document_url?: string, document_name?: string }>>>({});
  const [newDocumentName, setNewDocumentName] = useState('');
  const [documentPreview, setDocumentPreview] = useState<{ file: File, name: string } | null>(null);
  const [documentUrlModal, setDocumentUrlModal] = useState<{ url?: string, blobUrl?: string, name: string, uploadedBy?: string, uploadDate?: string, loading?: boolean, previewLoading?: boolean, documentId?: string } | null>(null);
  const [documentPreviewNonce, setDocumentPreviewNonce] = useState<number>(Date.now());
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [documentsLoading, setDocumentsLoading] = useState<Record<string, boolean>>({});
  const [docsSearchByEquipmentId, setDocsSearchByEquipmentId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!documentUrlModal) return;
    // Force a fresh PDF viewer state each time modal opens/changes document.
    setDocumentPreviewNonce(Date.now());
  }, [documentUrlModal?.documentId, documentUrlModal?.url, documentUrlModal?.name]);

  const buildFreshPdfPreviewUrl = useCallback((url: string) => {
    const [baseUrl, existingHash = ''] = url.split('#');
    const hashParams = new URLSearchParams(existingHash);
    hashParams.set('page', '1');
    hashParams.set('zoom', 'page-fit');
    hashParams.set('view', 'Fit');

    try {
      const parsed = new URL(baseUrl);
      parsed.searchParams.set('_preview', String(documentPreviewNonce));
      return `${parsed.toString()}#${hashParams.toString()}`;
    } catch {
      const joinChar = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${joinChar}_preview=${documentPreviewNonce}#${hashParams.toString()}`;
    }
  }, [documentPreviewNonce]);

  useEffect(() => {
    if (!documentUrlModal || documentUrlModal.loading || !documentUrlModal.url) return;
    const isPdf = documentUrlModal.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return;

    // Route PDF documents through the existing PDF.js modal to avoid browser PDF viewer
    // restoring stale zoom/scroll state inside iframe/object embeds.
    setInspectionReportPreview({
      reportUrl: documentUrlModal.url,
      fileName: documentUrlModal.name,
    });
    if (documentUrlModal.blobUrl) URL.revokeObjectURL(documentUrlModal.blobUrl);
    setDocumentUrlModal(null);
  }, [documentUrlModal]);

  // Fetch equipment documents metadata only (no document_url) - document URL loaded on-demand when user clicks View
  const fetchEquipmentDocuments = async (equipmentId: string) => {
    try {
      setDocumentsLoading(prev => ({ ...prev, [equipmentId]: true }));

      const equipmentDocs = projectId === 'standalone'
        ? await getStandaloneEquipmentDocumentsMetadata(equipmentId)
        : await getEquipmentDocumentsMetadata(equipmentId);

      if (equipmentDocs && Array.isArray(equipmentDocs) && equipmentDocs.length > 0) {
        const map = vdcrRecordIdToDepartment;
        const transformedDocs = equipmentDocs.map((doc: any) => {
          const department = doc.vdcr_record_id ? (map[doc.vdcr_record_id] ?? undefined) : undefined;
          return {
          id: doc.id,
          name: doc.document_name,
          document_name: doc.document_name,
          document_url: undefined as string | undefined, // Load on-demand when View is clicked
          uploadedBy: doc.uploaded_by_user?.full_name || doc.uploaded_by || 'Unknown',
          uploadDate: doc.upload_date || doc.created_at,
          document_type: doc.document_type || 'Equipment Document',
          vdcr_code_status: doc.vdcr_code_status,
            vdcr_document_status: doc.vdcr_document_status,
            department
          };
        });

        setDocuments(prev => ({ ...prev, [equipmentId]: transformedDocs }));
      } else {
        setDocuments(prev => ({ ...prev, [equipmentId]: [] }));
      }
    } catch (error) {
      console.error('❌ Error fetching equipment documents:', error);
      setDocuments(prev => ({ ...prev, [equipmentId]: [] }));
    } finally {
      setDocumentsLoading(prev => ({ ...prev, [equipmentId]: false }));
    }
  };

  // Fetch URL as blob and create blob URL so iframe preview works (storage URLs often block embedding)
  const fetchAndSetBlobUrl = useCallback((url: string) => {
    setDocumentUrlModal((prev) => (prev ? { ...prev, previewLoading: true } : null));
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        setDocumentUrlModal((prev) => (prev ? { ...prev, blobUrl, previewLoading: false } : null));
      })
      .catch(() => {
        setDocumentUrlModal((prev) => (prev ? { ...prev, previewLoading: false } : null));
      });
  }, []);

  const openInNewTabReliable = useCallback(async (url: string) => {
    const newTab = window.open('', '_blank');
    if (!newTab) {
      window.open(url, '_blank');
      return;
    }
    newTab.opener = null;
    try {
      newTab.document.write('<title>Loading document...</title><p style="font-family:sans-serif;padding:16px;">Loading document preview...</p>');
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch document');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      newTab.location.href = blobUrl;
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      newTab.location.href = url;
    }
  }, []);

  // Open document preview: if URL already loaded use it; else fetch document URL on-demand and show loader. Use blob URL for iframe so preview works.
  // Resolves doc id from the same document list (by name) so preview always fetches the same doc as the document name column.
  const handleDocumentPreviewClick = useCallback((doc: { id?: string; document_name?: string; name?: string; document_url?: string; uploadedBy?: string; uploadDate?: string }, equipmentId: string) => {
    const name = doc.document_name || doc.name || 'Document';
    if (doc.document_url) {
      setDocumentUrlModal({ url: doc.document_url, name, uploadedBy: doc.uploadedBy, uploadDate: doc.uploadDate, previewLoading: true });
      fetchAndSetBlobUrl(doc.document_url);
      return;
    }
    // Use doc.id; if missing, resolve same document from list by name (same doc as document name column)
    let documentId = doc.id;
    if (!documentId && equipmentId) {
      const list = documents[equipmentId] || [];
      const sameDoc = list.find((d: any) => (d.document_name || d.name || '') === (doc.document_name || doc.name || ''));
      if (sameDoc?.id) documentId = sameDoc.id;
    }
    if (!documentId) {
      toast({ title: 'Error', description: 'Could not load document.', variant: 'destructive' });
      return;
    }
    setDocumentUrlModal({ name, uploadedBy: doc.uploadedBy, uploadDate: doc.uploadDate, loading: true, documentId });

    const applyDocUrl = (data: { document_url: string; document_name?: string; upload_date?: string; uploaded_by?: string; uploaded_by_user?: { full_name?: string } }) => {
      if (!data?.document_url) return;
      setDocumentUrlModal({
        url: data.document_url,
        name: data.document_name || name,
        uploadedBy: (data as any).uploaded_by_user?.full_name || data.uploaded_by || doc.uploadedBy,
        uploadDate: data.upload_date || doc.uploadDate,
        previewLoading: true
      });
      fetchAndSetBlobUrl(data.document_url);
      setDocuments(prev => ({
        ...prev,
        [equipmentId]: (prev[equipmentId] || []).map((d: any) => d.id === documentId ? { ...d, document_url: data.document_url } : d)
      }));
    };

    const tryFallback = () => {
      const fetchFull = projectId === 'standalone' ? getStandaloneEquipmentDocuments(equipmentId) : getEquipmentDocuments(equipmentId);
      fetchFull.then((list) => {
        const full = Array.isArray(list) ? list : [];
        const match = full.find((d: any) => d.id === documentId);
        if (match?.document_url) {
          applyDocUrl({
            document_url: match.document_url,
            document_name: match.document_name,
            upload_date: match.upload_date,
            uploaded_by: match.uploaded_by,
            uploaded_by_user: match.uploaded_by_user
          });
        } else {
          setDocumentUrlModal(null);
          toast({ title: 'Error', description: 'Could not load document.', variant: 'destructive' });
        }
      }).catch(() => {
        setDocumentUrlModal(null);
        toast({ title: 'Error', description: 'Could not load document.', variant: 'destructive' });
      });
    };

    getDocumentUrlById(documentId, projectId === 'standalone').then((data) => {
      if (data?.document_url) {
        applyDocUrl(data);
        return;
      }
      tryFallback();
    }).catch(() => {
      tryFallback();
    });
  }, [projectId, toast, fetchAndSetBlobUrl, documents]);

  // Inspection report modal: load PDF with PDF.js (iframe src often blank for Supabase/storage URLs; no blob: URLs)
  useEffect(() => {
    if (!inspectionReportPreview?.reportUrl) {
      setInspectionReportPdfDoc((prev: any) => {
        if (prev?.destroy) prev.destroy();
        return null;
      });
      setInspectionReportPdfPage(1);
      setInspectionReportPdfTotalPages(0);
      setInspectionReportPdfLoading(false);
      setInspectionReportPdfError(null);
      return;
    }

    let cancelled = false;
    const url = inspectionReportPreview.reportUrl;

    (async () => {
      setInspectionReportPdfLoading(true);
      setInspectionReportPdfError(null);
      setInspectionReportPdfDoc((prev: any) => {
        if (prev?.destroy) prev.destroy();
        return null;
      });
      setInspectionReportPdfPage(1);

      try {
        const pdfjsLib = typeof window !== 'undefined' ? (window as any).pdfjsLib : null;
        if (!pdfjsLib) {
          if (!cancelled) setInspectionReportPdfError('PDF viewer is not available.');
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        let pdf: any;
        try {
          pdf = await pdfjsLib.getDocument(url).promise;
        } catch {
          const res = await fetch(url);
          if (!res.ok) throw new Error('fetch failed');
          const buf = await res.arrayBuffer();
          pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        }

        if (cancelled) {
          pdf.destroy();
          return;
        }
        setInspectionReportPdfDoc(pdf);
        setInspectionReportPdfTotalPages(pdf.numPages || 0);
      } catch {
        if (!cancelled) {
          setInspectionReportPdfError('Could not load PDF preview. Use Download or open in a new tab.');
        }
      } finally {
        if (!cancelled) setInspectionReportPdfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inspectionReportPreview?.reportUrl]);

  useEffect(() => {
    if (!inspectionReportPdfDoc || inspectionReportPdfLoading) return;
    const canvas = document.getElementById('inspection-report-pdf-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    let cancelled = false;
    (async () => {
      try {
        const page = await inspectionReportPdfDoc.getPage(inspectionReportPdfPage);
        if (cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const containerWidth = canvas.parentElement?.clientWidth || 800;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1, Math.max(0.5, (containerWidth - 24) / baseViewport.width));
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch {
        // non-fatal
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inspectionReportPdfDoc, inspectionReportPdfPage, inspectionReportPdfLoading]);

  // Initial document load for all equipment is done in the main equipment useEffect via loadDocumentsForEquipment(transformedEquipment).
  // Do NOT add a second effect that loops equipment and calls fetchEquipmentDocuments(item.id) — that caused 2N duplicate API calls.

  // Pre-fetch team members for all project equipment when equipment list loads (equipment_team_positions)
  useEffect(() => {
    if (equipment && equipment.length > 0 && projectId !== 'standalone') {
      fetchAllProjectEquipmentTeamMembers(equipment);
    }
    // equipment: intentionally omitted from deps — parent often passes new [] reference each render; equipmentPropIdsKey is stable per row set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentPropIdsKey, projectId, fetchAllProjectEquipmentTeamMembers]);

  // Fetch documents when viewing equipment details
  useEffect(() => {
    if (viewingEquipmentId && projectId === 'standalone') {
      fetchEquipmentDocuments(viewingEquipmentId);
    }
  }, [viewingEquipmentId, projectId]);

  // Function to handle docs tab click and fetch documents
  const handleDocsTabClick = (equipmentId: string) => {
    // // console.log('📄 Docs tab clicked for equipment:', equipmentId);
    // Fetch documents if not already loaded
    if (!documents[equipmentId] || documents[equipmentId].length === 0) {
      fetchEquipmentDocuments(equipmentId);
    }
  };

  const formatDateToDDMMYYYY = (dateStr: string | undefined): string => {
    if (!dateStr || dateStr === 'Not specified') return 'Not specified';
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'delayed':
        return 'bg-red-100 text-red-800 border border-red-200';
      case 'on-track':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'nearing-completion':
        return 'bg-orange-100 text-orange-800 border border-orange-200';
      case 'pending':
        return 'bg-gray-100 text-gray-800 border border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const getDisplayStatus = (equipment: Equipment) => {
    if (equipment.status === 'completed') return 'completed';
    if (equipment.status === 'delayed') return 'delayed';
    if (equipment.status === 'pending') return 'pending';

    if (equipment.poCdd !== 'To be scheduled') {
      try {
        const poCddDate = new Date(equipment.poCdd);
        const today = new Date();
        const timeDiff = poCddDate.getTime() - today.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

        // If equipment is 4+ days past PO-CDD, always show as delayed
        if (daysDiff <= -4) {
          return 'delayed';
        }

        // If within 21 days of upcoming PO-CDD (including today), show as nearing completion
        if (daysDiff <= 21 && daysDiff >= 0) {
          return 'nearing-completion';
        }
      } catch (error) {
        // console.log('Error parsing PO-CDD date:', error);
      }
    }

    return 'on-track';
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'delayed':
        return 'Delayed';
      case 'on-track':
        return 'On Track';
      case 'nearing-completion':
        return 'Nearing Completion';
      case 'pending':
        return 'Pending';
      default:
        return 'On Track';
    }
  };

  const getRemainingDays = (poCdd: string) => {
    if (!poCdd || poCdd === 'To be scheduled') {
      return null;
    }

    try {
      const poCddDate = new Date(poCdd);
      const today = new Date();
      const timeDiff = poCddDate.getTime() - today.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      if (daysDiff < 0) {
        return `${Math.abs(daysDiff)} days overdue`;
      } else if (daysDiff === 0) {
        return 'Due today';
      } else if (daysDiff === 1) {
        return 'Due tomorrow';
      } else {
        return `${daysDiff} days remaining`;
      }
    } catch (error) {
      // // console.log('Error parsing PO-CDD date:', error);
      return null;
    }
  };

  const handleEditEquipment = (equipment: Equipment) => {
    setEditingEquipmentId(equipment.id);
    // PERFORMANCE: Console logs commented out for production
    // Debug: Log equipment data to see what we're working with
    // // console.log('🔧 handleEditEquipment - Equipment data:', {
    //   id: equipment.id,
    //   updated_at: equipment.updated_at,
    //   nextMilestoneDate: equipment.nextMilestoneDate,
    //   notes: equipment.notes,
    //   notesType: typeof equipment.notes,
    //   notesValue: equipment.notes,
    //   certificationTitle: equipment.certificationTitle,
    //   fullEquipment: equipment
    // });
    const formData = {
      name: equipment.name || '',
      type: equipment.type || '',
      location: equipment.location || '',
      supervisor: equipment.supervisor || '',
      nextMilestone: equipment.nextMilestone || '',
      nextMilestoneDate: equipment.nextMilestoneDate || '',
      size: equipment.size || '',
      weight: equipment.weight || '',
      designCode: equipment.designCode || '',
      material: equipment.material || '',
      workingPressure: equipment.workingPressure || '',
      designTemp: equipment.designTemp || '',
      welder: equipment.welder || '',
      qcInspector: equipment.qcInspector || '',
      projectManager: equipment.projectManager || '',
      poCdd: equipment.poCdd || '',
      completionDate: equipment.completionDate || '',
      status: equipment.status || 'on-track',
      customFields: equipment.customFields || [],
      certificationTitle: equipment.certificationTitle || '',
      notes: (equipment.notes !== null && equipment.notes !== undefined) ? String(equipment.notes) : ''
    };
    // PERFORMANCE: Console logs commented out for production
    // // console.log('🔧 Setting editFormData:', formData);
    // // console.log('🔧 Notes in formData:', formData.notes);
    // // console.log('🔧 Notes type:', typeof formData.notes);
    // // console.log('🔧 equipment.customFields:', equipment.customFields);

    // Reset progress entry form fields for new entries
    setNewProgressType('general');
    setNewProgressEntry('');
    setNewProgressImage(null);
    setImageDescription('');
    setEditingProgressEntryId(null);
    setIsAddingCustomProgressType(false);
    setCustomProgressTypeName('');
    // Reset audio recording state
    setAudioChunks([]);
    setRecordingDuration(0);
    setIsRecording(false);
    // Reset image audio recording state
    setImageAudioChunks([]);
    setImageRecordingDuration(0);
    setIsImageRecording(false);
    setEditFormData(formData);

    // Initialize overview state variables for date inputs
    // For standalone equipment, prioritize last_update (DATE column) over updated_at (timestamp)
    // last_update is already in YYYY-MM-DD format from the database
    // console.log('🔧 handleEditEquipment - Initializing date for equipment:', {
    //   id: equipment.id,
    //   last_update: (equipment as any).last_update,
    //   updated_at: equipment.updated_at,
    //   lastUpdate: equipment.lastUpdate,
    //   equipmentKeys: Object.keys(equipment)
    // });
    
    let dateOnly = '';
    // First priority: last_update field (raw DATE from database)
    if ((equipment as any).last_update) {
      // Use last_update directly if available (already in YYYY-MM-DD format)
      const rawDate = String((equipment as any).last_update);
      dateOnly = rawDate.split('T')[0].split(' ')[0]; // Handle both datetime and date strings
      // console.log('✅ Using last_update:', dateOnly, 'from raw:', rawDate);
    } 
    // Second priority: updated_at timestamp
    else if (equipment.updated_at) {
      try {
        const updatedDate = new Date(equipment.updated_at);
        if (!isNaN(updatedDate.getTime())) {
          const year = updatedDate.getFullYear();
          const month = String(updatedDate.getMonth() + 1).padStart(2, '0');
          const day = String(updatedDate.getDate()).padStart(2, '0');
          dateOnly = `${year}-${month}-${day}`;
          // console.log('✅ Using updated_at:', dateOnly);
        }
      } catch (error) {
        console.error('Error parsing updated_at:', error, 'Value:', equipment.updated_at);
      }
    } 
    // Third priority: lastUpdate formatted string
    else if (equipment.lastUpdate) {
      try {
        const parsedDate = new Date(equipment.lastUpdate);
        if (!isNaN(parsedDate.getTime())) {
          const year = parsedDate.getFullYear();
          const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
          const day = String(parsedDate.getDate()).padStart(2, '0');
          dateOnly = `${year}-${month}-${day}`;
          // console.log('✅ Using lastUpdate:', dateOnly);
        }
      } catch (error) {
        console.error('Error parsing lastUpdate:', error, 'Value:', equipment.lastUpdate);
      }
    }
    
    // Always set the date if we found one, or clear it if we didn't
    if (dateOnly) {
      // console.log('📅 handleEditEquipment - Setting overviewLastUpdateRaw for', equipment.id, ':', dateOnly);
      setOverviewLastUpdateRaw(prev => {
        // Force update to ensure the date is set
        return { ...prev, [equipment.id]: dateOnly };
      });
    } else {
      console.warn('⚠️ handleEditEquipment - No date value found for equipment:', equipment.id);
      // Clear any existing value to show empty picker
      setOverviewLastUpdateRaw(prev => {
        const updated = { ...prev };
        delete updated[equipment.id];
        return updated;
      });
    }

    // Convert nextMilestoneDate to date format (YYYY-MM-DD)
    // Try multiple possible field names
    const nextMilestoneDateValue = equipment.nextMilestoneDate || (equipment as any).next_milestone_date;
    if (nextMilestoneDateValue && nextMilestoneDateValue !== 'To be scheduled' && nextMilestoneDateValue !== 'Not specified') {
      try {
        const milestoneDate = new Date(nextMilestoneDateValue);
        if (!isNaN(milestoneDate.getTime())) {
          const year = milestoneDate.getFullYear();
          const month = String(milestoneDate.getMonth() + 1).padStart(2, '0');
          const day = String(milestoneDate.getDate()).padStart(2, '0');
          const dateLocal = `${year}-${month}-${day}`;
          setOverviewNextMilestoneDate(prev => ({ ...prev, [equipment.id]: dateLocal }));
        }
      } catch (error) {
        console.error('Error parsing nextMilestoneDate:', error, 'Value:', nextMilestoneDateValue);
      }
    }

    // Fetch documents for this equipment when entering edit mode
    // // console.log('📄 Fetching documents for equipment in edit mode:', equipment.id);
    fetchEquipmentDocuments(equipment.id);
  };

  const handleMarkComplete = async (equipment: Equipment) => {
    if (window.confirm(`Mark ${equipment.type === 'Distillation Column' ? 'Column' : equipment.type} ${equipment.tagNumber} as completed and dispatched?`)) {
      setLoadingStates(prev => ({ ...prev, [`complete-${equipment.id}`]: true }));

      try {
        // // console.log('✅ Marking equipment as completed:', equipment.id);

        // Prepare completion data with proper field mapping
        const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const completionData: any = {
          status: 'completed',
          progress_phase: 'dispatched',
          progress: 100,
          completion_date: todayDate // Set dispatch date to today
        };

        // Call backend API to update equipment status
        if (projectId === 'standalone') {
          await fastAPI.updateStandaloneEquipment(equipment.id, completionData);
        } else {
          await fastAPI.updateEquipment(equipment.id, completionData);
        }

        // Update the local equipment data
        const dispatchDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        setLocalEquipment(prev => prev.map(eq =>
          eq.id === equipment.id
            ? {
              ...eq,
              status: 'completed' as const,
              progressPhase: 'dispatched' as const,
              progress: 100,
              completionDate: dispatchDate, // Set dispatch date to today
              lastUpdate: dispatchDate, // Store as date only (YYYY-MM-DD)
              poCdd: new Date().toLocaleDateString()
            }
            : eq
        ));


        // Standalone tab: keep a lightweight single-item sync after complete.
        // Other views keep the existing delayed list refresh behavior.
        if (projectId === 'standalone') {
          setTimeout(() => {
            void syncStandaloneEquipmentItem(equipment.id);
          }, 1200);
        } else {
          setTimeout(() => {
            refreshEquipmentData(true, { skipDocuments: true });
          }, 1200);
        }

        toast({
          title: "Equipment Completed",
          description: `${equipment.type === 'Distillation Column' ? 'Column' : equipment.type} ${equipment.tagNumber} marked as completed and dispatched!`,
          variant: "default"
        });
      } catch (error) {
        console.error('❌ Error marking equipment as complete:', error);
        toast({
          title: "Error",
          description: "Failed to mark equipment as complete. Please try again.",
          variant: "destructive"
        });
      } finally {
        setLoadingStates(prev => ({ ...prev, [`complete-${equipment.id}`]: false }));
      }
    }
  };

  const handleProgressPhaseChange = async (equipmentId: string, newPhase: 'documentation' | 'manufacturing' | 'testing' | 'dispatched') => {
    setLoadingStates(prev => ({ ...prev, [`phase-${equipmentId}`]: true }));

    try {
      // Update progress based on phase
      let newProgress = 0;
      switch (newPhase) {
        case 'documentation':
          newProgress = 25;
          break;
        case 'manufacturing':
          newProgress = 50;
          break;
        case 'testing':
          newProgress = 75;
          break;
        case 'dispatched':
          newProgress = 100;
          break;
      }

      // Prepare phase change data with proper field mapping
      const phaseData: any = {
        progress_phase: newPhase,
        progress: newProgress
      };

      // If marking as dispatched, set completion_date to today's date (YYYY-MM-DD format)
      if (newPhase === 'dispatched') {
        const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        phaseData.completion_date = todayDate;
      }

      // Call backend API to update equipment phase
      // // console.log('🔄 Sending phase data to API:', phaseData);
      if (projectId === 'standalone') {
        await fastAPI.updateStandaloneEquipment(equipmentId, phaseData);
      } else {
        await fastAPI.updateEquipment(equipmentId, phaseData);
      }

      // Update local state
      setLocalEquipment(prev => prev.map(eq =>
        eq.id === equipmentId
          ? {
            ...eq,
            progressPhase: newPhase,
            progress: newProgress,
            lastUpdate: new Date().toLocaleString(),
            // If dispatched, set completionDate to today
            ...(newPhase === 'dispatched' ? { completionDate: new Date().toISOString().split('T')[0] } : {})
          }
          : eq
      ));

      // // console.log(`✅ Equipment ${equipmentId} moved to ${newPhase} phase with ${newProgress}% progress`);

      // Refresh activity logs if callback provided
      if (onActivityUpdate) {
        onActivityUpdate();
      }

      // Refresh equipment data from database (immediate for phase changes)
      await refreshEquipmentData(true);
    } catch (error) {
      console.error('❌ Error updating equipment phase:', error);
      toast({
        title: "Error",
        description: "Failed to update equipment phase. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [`phase-${equipmentId}`]: false }));
    }
  };

  const handleDeleteEquipment = async (equipment: Equipment) => {
    if (window.confirm(`Are you sure you want to delete ${equipment.type === 'Distillation Column' ? 'Column' : equipment.type} ${equipment.tagNumber}? This action cannot be undone.`)) {
      setLoadingStates(prev => ({ ...prev, [`delete-${equipment.id}`]: true }));

      try {
        // Decide which API to call based on whether this is standalone equipment or project equipment
        const isStandalone = projectId === 'standalone';

        // Call backend API to delete equipment (standalone vs project)
        if (isStandalone) {
          await fastAPI.deleteStandaloneEquipment(equipment.id, {
            type: equipment.type,
            tagNumber: equipment.tagNumber,
          });
        } else {
          await fastAPI.deleteEquipment(equipment.id, {
            projectId,
            type: equipment.type,
            tagNumber: equipment.tagNumber,
          });
        }

        // Remove the equipment from the local array
        setLocalEquipment(prev => prev.filter(eq => eq.id !== equipment.id));

        // Also remove any associated metadata
        setImageMetadata(prev => {
          const newMetadata = { ...prev };
          delete newMetadata[equipment.id];
          return newMetadata;
        });

        setProgressEntries(prev => {
          const newProgress = { ...prev };
          delete newProgress[equipment.id];
          return newProgress;
        });

        setTeamPositions(prev => {
          const newTeam = { ...prev };
          delete newTeam[equipment.id];
          return newTeam;
        });

        setDocuments(prev => {
          const newDocs = { ...prev };
          delete newDocs[equipment.id];
          return newDocs;
        });

        // No post-delete refresh: backend delete is authoritative; local state already updated above.

        toast({
          title: "Equipment Deleted",
          description: `${equipment.type === 'Distillation Column' ? 'Column' : equipment.type} ${equipment.tagNumber} deleted successfully!`,
          variant: "default"
        });
        if (projectId === 'standalone' && viewingEquipmentId === equipment.id) {
          setViewingEquipmentId(null);
        }
      } catch (error) {
        console.error('❌ Error deleting equipment:', error);
        toast({
          title: "Error",
          description: "Failed to delete equipment. Please try again.",
          variant: "destructive"
        });
      } finally {
        setLoadingStates(prev => ({ ...prev, [`delete-${equipment.id}`]: false }));
      }
    }
  };

  // for updating equipment part -starting 
  const handleSaveEquipment = async () => {
    if (!editingEquipmentId) return;

    setLoadingStates(prev => ({ ...prev, [`save-${editingEquipmentId}`]: true }));

    try {
      // Save progress image if uploaded (description is REQUIRED)
      if (newProgressImage && imageDescription?.trim()) {
        // // console.log('📸 Saving progress image with equipment data...');

        // Convert image to base64 for storage
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64Image = e.target?.result as string;

          // Create a data URL for immediate display
          const imageUrl = URL.createObjectURL(newProgressImage);

          // Update local state immediately for UI
          setLocalEquipment(prev => prev.map(eq =>
            eq.id === editingEquipmentId
              ? { ...eq, progressImages: [...(eq.progressImages || []), imageUrl] }
              : eq
          ));

          // Description is required and validated above
          const finalDescription = imageDescription.trim();

          // Store the image metadata
          const imageMetadata = {
            id: `img-${Date.now()}`,
            description: finalDescription,
              uploadedBy: (user as any)?.full_name || user?.email || localStorage.getItem('userName') || 'Unknown User',
            uploadDate: new Date().toISOString()
          };

          setImageMetadata(prev => ({
            ...prev,
            [editingEquipmentId]: [...(prev[editingEquipmentId] || []), imageMetadata]
          }));

          // Save progress image to database with base64 data
          const progressImageData = {
            equipment_id: editingEquipmentId,
            image_url: base64Image, // Store base64 instead of blob URL
            description: finalDescription,
            audio_data: imageAudioChunks.length > 0 ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(imageAudioChunks[0]);
            }) : null,
            audio_duration: imageRecordingDuration,
              uploaded_by: (user as any)?.full_name || user?.email || localStorage.getItem('userName') || 'Unknown User', // Use actual user name
            upload_date: new Date().toISOString()
          };

          try {
            // Create in DB and get the new row back (no full refetch)
            const created = projectId === 'standalone'
              ? await fastAPI.createStandaloneProgressImage(progressImageData)
              : await fastAPI.createProgressImage(progressImageData);
            const newRow = created && (Array.isArray(created) ? created[0] : created);
            if (newRow) {
              setLocalEquipment(prev => prev.map(eq =>
                eq.id === editingEquipmentId
                  ? {
                      ...eq,
                      progressImagesMetadata: [...(eq.progressImagesMetadata || []), newRow],
                      // progressImages already updated optimistically above with object URL
                    }
                  : eq
              ));
            }
            // Get equipment info for logging (include progress_image_id so activity detail can open this image)
            const currentEquipment = localEquipment.find(eq => eq.id === editingEquipmentId);
            const progressImageId = newRow?.id;
            if (currentEquipment) {
              try {
                await logProgressImageUploaded(
                  projectId,
                  editingEquipmentId,
                  currentEquipment.type || 'Equipment',
                  currentEquipment.tagNumber || 'Unknown',
                  finalDescription || undefined,
                  progressImageId
                );
                if (onActivityUpdate) {
                  onActivityUpdate();
                }
              } catch (logError) {
                console.error('⚠️ Error logging progress image activity (non-fatal):', logError);
              }
            }
            toast({ title: 'Success', description: 'Progress image uploaded successfully!' });
          } catch (error) {
            console.error('❌ Error saving progress image to database:', error);
            toast({ title: 'Error', description: 'Failed to save progress image. Please try again.', variant: 'destructive' });
          }
        };

        reader.readAsDataURL(newProgressImage);

        // Clear progress image state after upload flow (no full refetch - new image already appended above in onload)
        setNewProgressImage(null);
        setImageDescription('');
      } else if (newProgressImage && !imageDescription?.trim()) {
        // Show error if image is selected but description is missing
        toast({ 
          title: 'Description Required', 
          description: 'Please add a description for the progress image before saving.', 
          variant: 'destructive' 
        });
      }
      // // console.log('💾 Saving equipment updates:', editFormData);
      // // console.log('💾 editFormData.customFields:', editFormData.customFields);
      // // console.log('💾 technicalSections[editingEquipmentId]:', technicalSections[editingEquipmentId]);

      // Prepare equipment data for API call with proper field mapping
      // Only include fields that exist in the database schema
      const equipmentData: any = {
        // Map frontend fields to backend fields (using exact database column names)
        type: editFormData.type,
        tag_number: editFormData.tagNumber,
        name: editFormData.name,
        po_cdd: editFormData.poCdd,
        location: editFormData.location,
        next_milestone: editFormData.nextMilestone,
        next_milestone_date: editFormData.nextMilestoneDate,
        // notes will be set explicitly below if editFormData.notes is defined
        is_basic_info: false,
        // User tracking fields
        updated_by: user?.id, // Add current user as updater
        // Technical specifications
        size: editFormData.size,
        material: editFormData.material,
        design_code: editFormData.designCode,
        // Include custom fields from state
        custom_fields: customFields[editingEquipmentId] || [],
        // Include technical sections from state
        technical_sections: technicalSections[editingEquipmentId] || [],
        // Include team custom fields from state
        team_custom_fields: teamCustomFields[editingEquipmentId] || []
      };

      // Add lastUpdate if it was modified (from date input)
      // The database column is DATE type (date only, no time), so send YYYY-MM-DD format
      // Always check overviewLastUpdateRaw first as it's the source of truth for the date input
      const lastUpdateValue = overviewLastUpdateRaw[editingEquipmentId];
      if (lastUpdateValue && lastUpdateValue.trim() !== '') {
        // Extract just the date part (YYYY-MM-DD) if it includes time
        const dateOnly = lastUpdateValue.split('T')[0];
        if (dateOnly && dateOnly.trim() !== '') {
          equipmentData.last_update = dateOnly;
          // console.log('💾 Saving last_update:', dateOnly);
        }
      } else if (editFormData.lastUpdate && editFormData.lastUpdate.trim() !== '') {
        // Fallback to editFormData.lastUpdate if overviewLastUpdateRaw is not set
        // Extract just the date part if it's a formatted string
        const dateValue = editFormData.lastUpdate;
        try {
          const parsedDate = new Date(dateValue);
          if (!isNaN(parsedDate.getTime())) {
            const year = parsedDate.getFullYear();
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const day = String(parsedDate.getDate()).padStart(2, '0');
            equipmentData.last_update = `${year}-${month}-${day}`;
            // console.log('💾 Saving last_update (from editFormData):', equipmentData.last_update);
          } else {
            // If it's already in YYYY-MM-DD format, use it directly
            equipmentData.last_update = dateValue.split('T')[0];
          }
        } catch {
          // If parsing fails, try to extract date part
          equipmentData.last_update = dateValue.split('T')[0];
        }
      }

      // Add certification title
      if (editFormData.certificationTitle !== undefined) {
        equipmentData.any_personal_title = editFormData.certificationTitle || null;
      }

      // Only include team member fields if they have actual values (not empty/undefined)
      // This prevents logging "Not set → Not set" when user didn't modify these fields
      if (editFormData.supervisor && editFormData.supervisor.trim() !== '') {
        equipmentData.supervisor = editFormData.supervisor.trim();
      }
      if (editFormData.welder && editFormData.welder.trim() !== '') {
        equipmentData.welder = editFormData.welder.trim();
      }
      if (editFormData.qcInspector && editFormData.qcInspector.trim() !== '') {
        equipmentData.qc_inspector = editFormData.qcInspector.trim();
      }
      if (editFormData.projectManager && editFormData.projectManager.trim() !== '') {
        equipmentData.project_manager = editFormData.projectManager.trim();
      }

      // Always include notes field if we're in edit mode (even if empty string)
      // This ensures the field is updated in the database
      if (editFormData.notes !== undefined) {
        equipmentData.notes = String(editFormData.notes || '');
      }

      // Remove undefined values
      Object.keys(equipmentData).forEach(key => {
        if (equipmentData[key] === undefined) {
          delete equipmentData[key];
        }
      });

      // CRITICAL FIX: Before saving, fetch current equipment data to ensure we don't overwrite technical sections
      // This prevents data loss when technical sections were added from a different device/session
      let currentEquipmentData: any = null;
      try {
        if (projectId === 'standalone') {
          const currentResponse = await fastAPI.getStandaloneEquipment(undefined, undefined, progressImagesApiOptions);
          currentEquipmentData = currentResponse.find((eq: any) => eq.id === editingEquipmentId);
        } else {
          const currentResponse = await fastAPI.getEquipmentByProject(projectId, progressImagesApiOptions);
          currentEquipmentData = currentResponse.find((eq: any) => eq.id === editingEquipmentId);
        }
      } catch (error) {
        devError('⚠️ Error fetching current equipment data before save (non-fatal):', error);
      }
      
      // Merge technical sections: Keep existing sections from database, add/update from local state
      if (currentEquipmentData && currentEquipmentData.technical_sections) {
        const existingSections = Array.isArray(currentEquipmentData.technical_sections) 
          ? currentEquipmentData.technical_sections 
          : [];
        const localSections = technicalSections[editingEquipmentId] || [];
        
        // Create a map of existing sections by name for quick lookup
        const existingSectionsMap = new Map(
          existingSections.map((section: any) => [section.name, section])
        );
        
        // Update or add sections from local state
        localSections.forEach((localSection: any) => {
          existingSectionsMap.set(localSection.name, localSection);
        });
        
        // Convert map back to array
        equipmentData.technical_sections = Array.from(existingSectionsMap.values());
        
        devLog('🔧 Merged technical sections:', {
          existing: existingSections.length,
          local: localSections.length,
          merged: equipmentData.technical_sections.length
        });
      } else {
        // If we couldn't fetch current data, use local state (fallback)
        equipmentData.technical_sections = technicalSections[editingEquipmentId] || [];
        devWarn('⚠️ Using local technical sections only (could not fetch current data)');
      }

      // Call backend API to update equipment
      // // console.log('🔧 Sending equipment data to API:', equipmentData);
      // // console.log('🔧 Custom fields in data:', equipmentData.custom_fields);
      // // console.log('🔧 Technical sections in data:', equipmentData.technical_sections);
      // Check if this is standalone equipment
      if (projectId === 'standalone') {
        await fastAPI.updateStandaloneEquipment(editingEquipmentId, equipmentData, user?.id);
      } else {
        await fastAPI.updateEquipment(editingEquipmentId, equipmentData, user?.id);
      }
      
      // Refresh activity logs if callback provided
      if (onActivityUpdate) {
        onActivityUpdate();
      }
      
      // Refresh equipment data from database to ensure consistency (immediate for save operations)
      await refreshEquipmentData(true);

      // Preserve the saved date in overviewLastUpdateRaw so it displays correctly
      // The date was saved as last_update, so we keep it in state for display
      const savedDate = lastUpdateValue ? lastUpdateValue.split('T')[0] : 
                       (equipmentData.last_update ? equipmentData.last_update.split('T')[0] : null);
      if (savedDate) {
        setOverviewLastUpdateRaw(prev => ({ ...prev, [editingEquipmentId]: savedDate }));
      }

      // Reset edit mode
      setEditingEquipmentId(null);
      setEditFormData({});
      
      // Clear custom field inputs
      setNewFieldName('');
      setNewFieldValue('');
      setShowAddFieldInputs({});

      toast({
        title: "Success",
        description: "Equipment updated successfully!",
        variant: "default"
      });
    } catch (error: any) {
      console.error('❌ Error updating equipment:', error);
      
      // Handle uniqueness validation errors with clear messages
      const errorMessage = error?.message || 'Failed to update equipment. Please try again.';
      
      if (errorMessage.includes('already exists') || errorMessage.includes('unique')) {
        toast({
          title: "Validation Error",
          description: errorMessage,
          variant: "destructive",
          duration: 5000
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, [`save-${editingEquipmentId}`]: false }));
    }
  };

  // Add this function to actually update the equipment array
  const updateEquipmentData = (equipmentId: string, updates: Partial<Equipment>) => {
    // This would typically update the parent state
    // For now, we'll just log the update
    // // console.log(`Updating equipment ${equipmentId}:`, updates);

    // In a real implementation, you would call a prop function like:
    // onEquipmentUpdate(equipmentId, updates);
  };

  const handleAddNewEquipment = () => {
    // Open the proper AddEquipmentForm modal instead of using the old method
    setShowAddEquipmentForm(true);
  };

  // Upload activities Excel for an equipment (retry once on 401 after session refresh)
  const handleUploadActivitiesExcel = useCallback(async (equipmentId: string, file: File, isRetry = false) => {
    try {
      setUploadingActivitiesForEquipment(equipmentId);
      const XLSX = await import('xlsx-js-style').then((m: any) => m.default);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const parsed: ParsedActivitiesResult = parseActivitiesExcel(rows);
      if (parsed.error) {
        toast({ title: 'Parse error', description: parsed.error, variant: 'destructive' });
        return;
      }
      const isStandalone = projectId === 'standalone';
      const payload = {
        commencement_date: parsed.commencement_date || null,
        activities: parsed.activities.map(a => ({
          sr_no: a.sr_no,
          activity_name: a.activity_name,
          activity_type: a.activity_type,
          target_relative: a.target_relative,
          target_date: a.target_date || undefined,
          sort_order: a.sort_order,
          inspection_tpi_involved: a.inspection_tpi_involved ?? false,
          progress_weight: a.progress_weight ?? undefined,
        })),
      };
      const inserted = isStandalone
        ? await fastAPI.setStandaloneEquipmentActivities(equipmentId, payload)
        : await fastAPI.setEquipmentActivities(equipmentId, payload);
      // Use POST return=representation (same rows DB just wrote). Bulk replace clears completions — merge null completion like get*Activities.
      const refreshed = (Array.isArray(inserted) ? inserted : [])
        .slice()
        .sort((a: any, b: any) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.sr_no ?? 0) - (b.sr_no ?? 0)
        )
        .map((a: any) => ({ ...a, completion: null }));
      setEquipmentActivities(prev => ({ ...prev, [equipmentId]: refreshed }));
      // Sync commencement on this equipment only (set* already PATCHed DB). Avoid full refreshEquipmentData — that duplicated get* + project equipment + docs/VDCR.
      const cd = payload.commencement_date;
      if (cd !== undefined) {
        setLocalEquipment(prev =>
          prev.map(eq =>
            eq.id === equipmentId
              ? ({ ...eq, commencementDate: cd, commencement_date: cd } as Equipment)
              : eq
          )
        );
      }
      toast({ title: 'Success', description: 'Activities uploaded successfully.' });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 && !isRetry) {
        setUploadingActivitiesForEquipment(null);
        await new Promise(r => setTimeout(r, 800));
        return handleUploadActivitiesExcel(equipmentId, file, true);
      }
      console.error('Upload activities error:', err);
      const message = status === 401
        ? 'Session expired or unauthorized. Please refresh the page and try again.'
        : (err?.response?.data?.message || err?.message || 'Failed to upload activities.');
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setUploadingActivitiesForEquipment(null);
    }
  }, [projectId, toast]);

  // Download sample activities Excel template (Commencement Date in dd-mm-yyyy)
  const downloadActivitiesTemplate = useCallback(async () => {
    try {
      const XLSX = await import('xlsx-js-style').then((m: any) => m.default);
      const d = new Date();
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const todayDDMMYYYY = `${day}-${month}-${year}`;
      const rows = [
        ['Commencement Date', todayDDMMYYYY],
        ['Sr. No.', 'Activity Name', 'Activity Type', 'Target', 'Inspection/TPI involved?', 'Weightage (%)'],
        [1, 'Shell welding', 'Minor', '1st week', 'No', 25],
        [2, 'Nozzle marking', 'Minor', '2nd week', 'No', 25],
        [3, 'Shell fabrication complete', 'Major', '3rd week', 'Yes', 25],
        [4, 'Radiography tests', 'Major', '1st month', 'Yes', 25],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Activities');
      XLSX.writeFile(wb, 'Activities_Template.xlsx');
      toast({ title: 'Downloaded', description: 'Activities_Template.xlsx' });
    } catch (err: any) {
      console.error('Download template error:', err);
      toast({ title: 'Error', description: err?.message || 'Failed to download template.', variant: 'destructive' });
    }
  }, [toast]);

  // Helper: parse string as explicit date (yyyy-mm-dd, dd-mm-yyyy, or dd/mm/yyyy). Returns yyyy-mm-dd or null. If it's a date, use as-is; if week/days/month, compute from commencement.
  const parseExplicitTargetDate = useCallback((val: string | undefined): string | null => {
    if (!val || typeof val !== 'string') return null;
    const t = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const ddmmyyyy = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1], 10);
      const month = parseInt(ddmmyyyy[2], 10) - 1;
      const year = parseInt(ddmmyyyy[3], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dayStr}`;
      }
    }
    return null;
  }, []);

  // Helper: compute target_date from commencement_date + target_relative (e.g. "1st week")
  const computeTargetDate = useCallback((commencementDate: string, targetRelative: string): string | null => {
    if (!targetRelative?.trim()) return null;
    const t = targetRelative.trim().toLowerCase();
    let days: number | null = null;
    const dayMatch = t.match(/^(\d+)(?:st|nd|rd|th)?\s*day$/);
    if (dayMatch) days = Math.max(0, parseInt(dayMatch[1], 10) - 1);
    else {
      const weekMatch = t.match(/^(\d+)(?:st|nd|rd|th)?\s*week$/);
      if (weekMatch) days = Math.max(0, parseInt(weekMatch[1], 10)) * 7;
      else {
        const monthMatch = t.match(/^(\d+)(?:st|nd|rd|th)?\s*month$/);
        if (monthMatch) days = Math.max(0, parseInt(monthMatch[1], 10)) * 30;
        else {
          const num = parseInt(t, 10);
          if (!isNaN(num) && num >= 0) days = num;
        }
      }
    }
    if (days === null) return null;
    const d = new Date(commencementDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }, []);

  // Progress bar segments: completed (last one for display), current (first incomplete), next
  const getActivitiesProgressSegments = useCallback((activities: any[]) => {
    if (!activities?.length) return { completed: [], current: null, next: null };
    const currentIdx = activities.findIndex((a: any) => !a.completion);
    const current = currentIdx >= 0 ? activities[currentIdx] : activities[activities.length - 1];
    const completed = currentIdx > 0 ? activities.slice(0, currentIdx) : (currentIdx < 0 ? activities : []);
    const next = currentIdx >= 0 && currentIdx < activities.length - 1 ? activities[currentIdx + 1] : null;
    const lastCompleted = completed.length ? completed[completed.length - 1] : null;
    return { completed: lastCompleted ? [lastCompleted] : [], current: currentIdx >= 0 ? current : null, next };
  }, []);

  const openEditActivitiesModal = useCallback((equipmentId: string) => {
    const list = equipmentActivities[equipmentId] || [];
    setEditActivitiesDraft(list.map((a: any, i: number) => ({
      id: a.id,
      sr_no: a.sr_no ?? i + 1,
      activity_name: a.activity_name || '',
      activity_type: a.activity_type === 'milestone' ? 'milestone' : 'regular_update',
      // Only target_relative is edited in the modal; keep target_date empty so save does not prefer a stale copy over the input field.
      target_relative: a.target_relative || a.target_date || '',
      target_date: '',
      sort_order: a.sort_order ?? i,
      inspection_tpi_involved: a.inspection_tpi_involved ?? false,
      progress_weight: a.progress_weight != null ? Number(a.progress_weight) : null,
    })));
    setEditActivitiesModalEquipmentId(equipmentId);
    setEditActivitiesModalOpen(true);
  }, [equipmentActivities]);

  const saveEditActivitiesModal = useCallback(async () => {
    if (!editActivitiesModalEquipmentId) return;
    const equipment = localEquipment.find(eq => eq.id === editActivitiesModalEquipmentId);
    const commencementDate = (equipment as any)?.commencementDate ?? (equipment as any)?.commencement_date ?? null;
    try {
      const isStandalone = projectId === 'standalone';
      // Do not send commencement_date — this modal never edits it; avoids an extra PATCH on equipment every save.
      const payload = {
        activities: editActivitiesDraft.map((a, i) => {
          // Prefer target_relative: the modal only binds that field for targets; a duplicate target_date in draft would otherwise win and ignore edits.
          const explicitDate = parseExplicitTargetDate(a.target_relative) ?? parseExplicitTargetDate(a.target_date);
          const targetDate = explicitDate ?? (commencementDate && a.target_relative ? computeTargetDate(commencementDate, a.target_relative) : (a.target_date || undefined));
          return {
            id: a.id,
            sr_no: i + 1,
            activity_name: a.activity_name,
            activity_type: a.activity_type,
            target_relative: a.target_relative || undefined,
            target_date: targetDate,
            sort_order: i,
            inspection_tpi_involved: a.inspection_tpi_involved ?? false,
            progress_weight: a.progress_weight ?? null,
          };
        }),
      };
      const prevActs = equipmentActivities[editActivitiesModalEquipmentId];
      const hasActivitySnapshot = Array.isArray(prevActs) && prevActs.length > 0;
      const refreshed = isStandalone
        ? await fastAPI.updateStandaloneEquipmentActivitiesMerge(
            editActivitiesModalEquipmentId,
            payload,
            hasActivitySnapshot ? { previousActivities: prevActs } : undefined
          )
        : await fastAPI.updateEquipmentActivitiesMerge(
            editActivitiesModalEquipmentId,
            payload,
            hasActivitySnapshot ? { previousActivities: prevActs } : undefined
          );
      setEquipmentActivities(prev => ({ ...prev, [editActivitiesModalEquipmentId]: refreshed }));
      setEditActivitiesModalOpen(false);
      setEditActivitiesModalEquipmentId(null);
      // Avoid full refreshEquipmentData — merge API already returned activities; commencement unchanged from this modal.
      toast({ title: 'Success', description: 'Activities updated.' });
    } catch (err: any) {
      console.error('Save edit activities error:', err);
      toast({ title: 'Error', description: err?.message || 'Failed to save.', variant: 'destructive' });
    }
  }, [editActivitiesModalEquipmentId, editActivitiesDraft, projectId, localEquipment, equipmentActivities, parseExplicitTargetDate, computeTargetDate, toast]);

  // Export activities report (Excel with variance column)
  const exportActivitiesReport = useCallback(async (equipmentId: string) => {
    try {
      const isStandalone = projectId === 'standalone';
      const activities = isStandalone
        ? await fastAPI.getStandaloneEquipmentActivities(equipmentId)
        : await fastAPI.getEquipmentActivities(equipmentId);
      if (!activities?.length) {
        toast({ title: 'No data', description: 'No activities to export.', variant: 'destructive' });
        return;
      }
      const equipment = localEquipment.find(eq => eq.id === equipmentId);
      const commencementDateRaw = (equipment as any)?.commencementDate ?? (equipment as any)?.commencement_date ?? '';
      const commencementDateDisplay = commencementDateRaw
        ? (() => { const d = new Date(commencementDateRaw); const day = String(d.getDate()).padStart(2, '0'); const month = String(d.getMonth() + 1).padStart(2, '0'); const year = d.getFullYear(); return `${day}-${month}-${year}`; })()
        : 'Not set';
      const XLSX = await import('xlsx-js-style').then((m: any) => m.default);
      const headerStyle = { fill: { fgColor: { rgb: 'FF2563EB' } }, font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 } };
      const headers = ['Sr. No.', 'Activity Name', 'Activity Type', 'Target Date', 'Completed On', 'Completed By', 'Notes', 'Updated On', 'Updated By', 'Variance (Days vs Target)'];
      const rows = activities.map((act: any) => {
        const comp = act.completion;
        const targetDate = act.target_date || '';
        const completedOn = comp?.completed_on || '';
        const completedBy = comp?.completed_by_display_name || comp?.completed_by_user_id || '';
        const notes = comp?.notes || '';
        const updatedOn = comp?.updated_on ? new Date(comp.updated_on).toISOString().slice(0, 10) : '';
        const updatedBy = comp?.updated_by_user?.full_name || comp?.updated_by || '';
        let variance = '';
        if (completedOn && targetDate) {
          const completed = new Date(completedOn).getTime();
          const target = new Date(targetDate).getTime();
          const daysDiff = Math.round((completed - target) / (1000 * 60 * 60 * 24));
          variance = daysDiff > 0 ? `${daysDiff} days late` : daysDiff < 0 ? `${Math.abs(daysDiff)} days early` : 'On time';
        }
        // For user-facing export: show "Major" for milestones and "Minor" for regular updates
        const activityTypeLabel = act.activity_type === 'milestone' ? 'Major' : 'Minor';
        return [act.sr_no, act.activity_name || '', activityTypeLabel, targetDate, completedOn, completedBy, notes, updatedOn, updatedBy, variance];
      });
      const commencementRow = ['Commencement Date', commencementDateDisplay];
      const ws = XLSX.utils.aoa_to_sheet([commencementRow, headers, ...rows]);
      const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
      for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: 1, c: col });
        if (ws[cellRef]) ws[cellRef].s = headerStyle;
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Activities Report');
      XLSX.writeFile(wb, `Activities_Report_${equipmentId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: 'Exported', description: 'Activities report downloaded.' });
    } catch (err: any) {
      console.error('Export report error:', err);
      toast({ title: 'Error', description: err?.message || 'Failed to export report.', variant: 'destructive' });
    }
  }, [projectId, localEquipment, toast]);

  // Open Mark complete modal (pass current equipment progress so percentage can only increase)
  const openMarkCompleteModal = useCallback((activity: any, equipmentId: string) => {
    const eq = localEquipment.find((e: Equipment) => e.id === equipmentId);
    const currentProgress = typeof eq?.progress === 'number' ? Math.min(100, Math.max(0, eq.progress)) : 0;
    const progressWeight = activity.progress_weight != null ? Math.min(100, Math.max(0, Number(activity.progress_weight))) : null;
    const list = equipmentActivities[equipmentId] || [];
    const completedWeightSoFar = list
      .filter((a: any) => a.completion && a.progress_weight != null)
      .reduce((sum: number, a: any) => sum + (Number(a.progress_weight) || 0), 0);
    const newTotalIfWeighted = progressWeight != null ? Math.min(100, completedWeightSoFar + progressWeight) : currentProgress;
    setMarkCompleteModalData({
      activityId: activity.id,
      activityName: activity.activity_name || '',
      activityType: activity.activity_type === 'milestone' ? 'milestone' : 'regular_update',
      equipmentId,
      completedOn: new Date().toISOString().slice(0, 10),
      completedByUserId: '',
      completedByDisplayName: '',
      completedBySelectValue: '',
      department: '',
      notes: '',
      imageFiles: [],
      reportFiles: [],
      percentageCompleted: progressWeight != null ? newTotalIfWeighted : currentProgress,
      currentProgress,
      progressWeight: progressWeight ?? null,
    });
    setMarkCompleteNewDepartmentInput('');
    if (projectId && projectId !== 'standalone') {
      fastAPI.getProjectDepartments(projectId).then(setMarkCompleteAvailableDepartments);
    } else {
      setMarkCompleteAvailableDepartments([]);
    }
    setMarkCompleteModalOpen(true);
  }, [localEquipment, projectId, equipmentActivities]);

  // Render the "remaining" segment of the percentage slider (currentProgress to 100) so we avoid IIFE in JSX
  const renderPercentageRemainingSlider = useCallback(() => {
    const current = markCompleteModalData.currentProgress;
    const pctCompleted = markCompleteModalData.percentageCompleted;
    const remaining = 100 - current;
    if (remaining <= 0) return null;
    const sliderPct = Math.round(((pctCompleted - current) / remaining) * 100);
    return (
      <div className="flex-1 min-w-0 flex items-center" style={{ width: `${remaining}%` }}>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[sliderPct]}
          onValueChange={([v]) => {
            const pct = v ?? 0;
            const newTotal = current + Math.round((pct / 100) * remaining);
            setMarkCompleteModalData(prev => ({ ...prev, percentageCompleted: Math.min(100, newTotal) }));
          }}
          className="w-full [&>.relative]:!bg-emerald-200 [&>.relative]:!rounded-l-none [&>.relative]:!rounded-r-full [&>.relative>.absolute]:!bg-emerald-500 [&>button]:!border-emerald-500 [&>button]:!bg-white"
        />
      </div>
    );
  }, [markCompleteModalData.currentProgress, markCompleteModalData.percentageCompleted]);

  /** Clients Documentations row 2: same card style as Code 1–4 (title, number, docs, icon) */
  const renderClientsDocsRow2 = useCallback((equipmentItem: { id: string }) => {
    const activities = equipmentActivities[equipmentItem.id] || [];
    const inspectionTotal = activities.reduce((sum: number, a: any) => sum + (a.completion?.inspection_report_count ?? 0), 0);
    const completionsWithReports = activities.filter((a: any) => (a.completion?.inspection_report_count ?? 0) > 0);
    const otherRefsCount = (documents[equipmentItem.id] || []).filter((d: any) => {
      const code = d.vdcr_code_status || '';
      return !['Code 1', 'Code 2', 'Code 3', 'Code 4'].includes(code);
    }).length;
    const cardClass = 'rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-gray-300 transition-shadow p-4 min-h-[100px] flex flex-col text-left w-full';
    const labelClass = 'text-blue-600 text-xs font-medium mb-0.5 leading-tight';
    const numberClass = 'text-blue-700 text-2xl sm:text-3xl font-bold tabular-nums';
    const docsClass = 'text-gray-500 text-xs mt-0.5';
    const iconWrap = 'w-9 h-9 sm:w-10 sm:h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0';
    const iconInner = 'w-5 h-5 sm:w-6 sm:h-6 bg-blue-200 rounded-full flex items-center justify-center';
    return (
      <>
        <button
          type="button"
          onClick={() => {
            if (inspectionTotal === 0) {
              setInspectionReportListModal({ completionId: '', reports: [] });
              return;
            }
            if (completionsWithReports.length === 1) {
              setInspectionReportListLoading(true);
              fastAPI.getEquipmentActivityCompletionInspectionReports(completionsWithReports[0].completion.id, projectId === 'standalone')
                .then((reports) => setInspectionReportListModal({ completionId: completionsWithReports[0].completion.id, reports }))
                .finally(() => setInspectionReportListLoading(false));
            } else {
              setInspectionReportPickerModal({
                equipmentId: equipmentItem.id,
                activities: completionsWithReports.map((a: any) => ({
                  activityId: a.id,
                  activityName: a.activity_name || 'Activity',
                  completionId: a.completion.id,
                  reportCount: a.completion?.inspection_report_count ?? 0,
                  department: (a.completion?.department ?? '').trim() || null
                }))
              });
            }
          }}
          className={cardClass}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className={labelClass}>Inspection Reports</p>
              <p className={numberClass}>{inspectionTotal}</p>
              <p className={docsClass}>docs</p>
            </div>
            <div className={iconWrap} aria-hidden>
              <div className={iconInner}>
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
              </div>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setClientsDocsOtherRefsModal({ equipmentId: equipmentItem.id })}
          className={cardClass}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className={labelClass}>Audit, Internal Reviews & Others Docs</p>
              <p className={numberClass}>{otherRefsCount}</p>
              <p className={docsClass}>docs</p>
            </div>
            <div className={iconWrap} aria-hidden>
              <div className={iconInner}>
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
              </div>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setClientsDocsChecklistModal({ equipmentId: equipmentItem.id })}
          className={cardClass}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className={labelClass}>Production & Pre-Dispatch Checklist</p>
              <p className={numberClass}>{(() => {
                const list = productionChecklistByEquipment[equipmentItem.id] ?? [];
                const pending = list.filter((t: any) => !t.completion).length;
                return pending;
              })()}</p>
              <p className={docsClass}>pending tasks</p>
            </div>
            <div className={iconWrap} aria-hidden>
              <div className={iconInner}>
                <ClipboardCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
              </div>
            </div>
          </div>
        </button>
      </>
    );
  }, [equipmentActivities, documents, projectId]);

  /** Document visibility rules:
   * - firm_admin/project_manager/vdcr_manager/super_admin: all docs
   * - others: own department docs + docs without department
   */
  const filterDocsByUserDepartmentAccess = useCallback((docs: any[]) => {
    if (canViewAllDepartmentDocuments) return docs;
    const userDept = (currentUserDepartment || '').trim().toLowerCase();
    return docs.filter((d: any) => {
      const docDept = (d?.department || '').trim().toLowerCase();
      if (!docDept) return true; // unassigned docs are visible to all users
      if (!userDept) return false;
      return docDept === userDept;
    });
  }, [canViewAllDepartmentDocuments, currentUserDepartment]);

  /** Filter docs by department (All = no filter, Other = no department) */
  const filterDocsByDepartment = useCallback((docs: any[], departmentFilter: string | undefined) => {
    const roleFilteredDocs = filterDocsByUserDepartmentAccess(docs);
    if (!departmentFilter || departmentFilter === 'All') return roleFilteredDocs;
    if (departmentFilter === 'Other') return roleFilteredDocs.filter((d: any) => !d.department);
    return roleFilteredDocs.filter((d: any) => d.department === departmentFilter);
  }, [filterDocsByUserDepartmentAccess]);

  /** Clients Documentations: "Other refs" modal content (avoids IIFE in JSX) */
  const renderClientsDocsOtherRefsContent = useCallback((equipmentId: string, departmentFilter?: string) => {
    let docs = (documents[equipmentId] || []).filter((d: any) => {
      const code = d.vdcr_code_status || '';
      return !['Code 1', 'Code 2', 'Code 3', 'Code 4'].includes(code);
    });
    docs = filterDocsByDepartment(docs, departmentFilter);
    if (docs.length === 0) return <p className="text-sm text-gray-500">No documents in this category.</p>;
    return (
      <ul className="space-y-2">
        {docs.map((doc: any) => (
          <li key={doc.id}>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start text-left h-auto py-2 min-w-0"
              onClick={() => { setClientsDocsOtherRefsModal(null); handleOpenDocument(doc, equipmentId); }}
            >
              <FileText className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="block min-w-0 truncate">
                {doc.document_name || doc.name || 'Document'}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    );
  }, [documents, filterDocsByDepartment]);

  /** Clients Documentations: Code 1–4 modal content — list docs for this equipment + code */
  const renderClientsDocsCodeContent = useCallback((equipmentId: string, code: string, departmentFilter?: string) => {
    let docs = (documents[equipmentId] || []).filter((d: any) => (d.vdcr_code_status || '') === code);
    docs = filterDocsByDepartment(docs, departmentFilter);
    if (docs.length === 0) return <p className="text-sm text-gray-500">No documents in this category.</p>;
    return (
      <ul className="space-y-2">
        {docs.map((doc: any) => (
          <li key={doc.id}>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start text-left h-auto py-2"
              onClick={() => { setClientsDocsCodeModal(null); handleOpenDocument(doc, equipmentId); }}
            >
              <FileText className="w-4 h-4 mr-2 flex-shrink-0" />
              {doc.document_name || doc.name || 'Document'}
            </Button>
          </li>
        ))}
      </ul>
    );
  }, [documents, filterDocsByDepartment]);

  // Load step image into session cache when viewer is open or index changes (on-demand fetch)
  useEffect(() => {
    const source = stepImageViewer ?? stepImagePreview;
    if (!source) return;
    const { completionId, currentIndex } = source;
    const cacheKey = `${completionId}_${currentIndex}`;
    if (stepImageCache[cacheKey] != null) return;
    let cancelled = false;
    setStepImageLoading(prev => ({ ...prev, [cacheKey]: true }));
    fastAPI.getEquipmentActivityCompletionImageUrl(completionId, currentIndex, projectId === 'standalone')
      .then((url) => {
        if (!cancelled && url) setStepImageCache(prev => ({ ...prev, [cacheKey]: url }));
      })
      .finally(() => {
        if (!cancelled) setStepImageLoading(prev => ({ ...prev, [cacheKey]: false }));
      });
    return () => { cancelled = true; };
  }, [stepImageViewer?.completionId, stepImageViewer?.currentIndex, stepImagePreview?.completionId, stepImagePreview?.currentIndex, projectId, stepImageCache]);

  // Load progress-section image (last completed milestone that has images) into session cache
  useEffect(() => {
    const isStandalone = projectId === 'standalone';
    const toLoad: { cacheKey: string; completionId: string; currentIndex: number }[] = [];
    for (const eq of localEquipment) {
      const list = equipmentActivities[eq.id] || [];
      const sorted = [...list].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const completedMilestones = sorted.filter((a: any) => a.completion && a.activity_type === 'milestone');
      let displayComp: { id: string } | undefined;
      let displayCount = 0;
      for (let i = completedMilestones.length - 1; i >= 0; i--) {
        const comp = completedMilestones[i]?.completion;
        const fromApi = comp ? (Number(comp.image_count) ?? 0) : 0;
        const fallbackCount = comp?.id ? (completionImageCountFallback[comp.id] ?? 0) : 0;
        const imageCount = Math.max(fromApi, fallbackCount);
        if (imageCount >= 1) {
          displayComp = comp;
          displayCount = imageCount;
          break;
        }
      }
      if (!displayComp?.id || displayCount < 1) continue;
      const currentIndex = Math.min(Math.max(0, progressSectionImageIndex[eq.id] ?? 0), displayCount - 1);
      const cacheKey = `${displayComp.id}_${currentIndex}`;
      if (stepImageCache[cacheKey] != null || stepImageLoading[cacheKey]) continue;
      toLoad.push({ cacheKey, completionId: displayComp.id, currentIndex });
    }
    if (toLoad.length > 0) {
      const loadingPatch: Record<string, boolean> = {};
      for (const item of toLoad) loadingPatch[item.cacheKey] = true;
      setStepImageLoading(prev => ({ ...prev, ...loadingPatch }));

      fastAPI
        .getEquipmentActivityCompletionImageUrlBatch(
          toLoad.map((x) => ({ completionId: x.completionId, index: x.currentIndex })),
          isStandalone
        )
        .then((urlMap) => {
          if (!urlMap || Object.keys(urlMap).length === 0) return;
          const cachePatch: Record<string, string> = {};
          for (const item of toLoad) {
            const url = urlMap[`${item.completionId}_${item.currentIndex}`];
            if (url) cachePatch[item.cacheKey] = url;
          }
          if (Object.keys(cachePatch).length > 0) {
            setStepImageCache(prev => ({ ...prev, ...cachePatch }));
          }
        })
        .finally(() => {
          const clearPatch: Record<string, boolean> = {};
          for (const item of toLoad) clearPatch[item.cacheKey] = false;
          setStepImageLoading(prev => ({ ...prev, ...clearPatch }));
        });
    }
  }, [localEquipment, equipmentActivities, progressSectionImageIndex, projectId, stepImageCache, stepImageLoading, completionImageCountFallback, getActivitiesProgressSegments]);

  // Fetch real image count for every completed milestone completion so we can pick "last milestone with images" and show arrows
  useEffect(() => {
    const isStandalone = projectId === 'standalone';
    const toFetch: { completionId: string }[] = [];
    const seen = new Set<string>();
    for (const eq of localEquipment) {
      const list = equipmentActivities[eq.id] || [];
      const sorted = [...list].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const completedMilestones = sorted.filter((a: any) => a.completion && a.activity_type === 'milestone');
      for (const act of completedMilestones) {
        const comp = act?.completion;
        if (!comp?.id || seen.has(comp.id) || completionImageCountFallback[comp.id] != null) continue;
        seen.add(comp.id);
        toFetch.push({ completionId: comp.id });
      }
    }
    if (toFetch.length > 0) {
      const ids = toFetch.map((x) => x.completionId);
      fastAPI.getEquipmentActivityCompletionImageCountBatch(ids, isStandalone).then((countMap) => {
        if (!countMap || Object.keys(countMap).length === 0) return;
        setCompletionImageCountFallback((prev) => ({ ...prev, ...countMap }));
      });
    }
  }, [localEquipment, equipmentActivities, projectId, completionImageCountFallback]);

  // Submit Mark complete (create completion, auto-feed Updates tab or Progress Image, refresh activities)
  const handleMarkActivityComplete = useCallback(async () => {
    const { activityId, equipmentId, activityName, activityType, completedOn, completedByUserId, completedByDisplayName, department: departmentRaw, notes, imageFiles, reportFiles, percentageCompleted, currentProgress } = markCompleteModalData;
    const department = (departmentRaw && departmentRaw !== '__add_new__' ? departmentRaw.trim() : null) || null;
    if (!completedOn?.trim()) {
      toast({ title: 'Required', description: 'Please enter when it was completed.', variant: 'destructive' });
      return;
    }
    const pct = typeof percentageCompleted === 'number' ? Math.min(100, Math.max(0, percentageCompleted)) : currentProgress;
    if (pct < currentProgress) {
      toast({ title: 'Invalid percentage', description: `Percentage completed must be at least ${currentProgress}% (current progress). It can only move forward.`, variant: 'destructive' });
      return;
    }
    setMarkCompleteSubmitting(true);
    try {
      const imageUrls: string[] = [];
      for (const file of imageFiles || []) {
        const url = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(String(reader.result));
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        imageUrls.push(url);
      }
      const reportUrls: string[] = [];
      const reportNames: (string | null)[] = [];
      for (const file of reportFiles || []) {
        const url = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(String(reader.result));
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        reportUrls.push(url);
        reportNames.push(file.name || null);
      }
      const firstImageUrl = imageUrls.length > 0 ? imageUrls[0] : null;
      const isStandalone = projectId === 'standalone';
      const currentUserId = user?.id || localStorage.getItem('userId') || null;
      const currentUserFullName = localStorage.getItem('userName') || (user as any)?.full_name || user?.email || null;
      let completionId: string | undefined;
      if (isStandalone) {
        const completionResponse = await fastAPI.createStandaloneEquipmentActivityCompletion(activityId, {
          completed_on: completedOn,
          completed_by_user_id: completedByUserId || null,
          completed_by_display_name: completedByDisplayName || null,
          notes: notes || null,
          department,
          image_url: firstImageUrl,
          image_urls: imageUrls.length > 0 ? imageUrls : undefined,
          inspection_report_urls: reportUrls.length > 0 ? reportUrls : undefined,
          inspection_report_names: reportNames.length > 0 ? reportNames : undefined,
          updated_by: currentUserId,
        });
        const created = Array.isArray(completionResponse) ? completionResponse[0] : completionResponse;
        completionId = created?.id;
      } else {
        const completionResponse = await fastAPI.createEquipmentActivityCompletion(activityId, {
          completed_on: completedOn,
          completed_by_user_id: completedByUserId || null,
          completed_by_display_name: completedByDisplayName || null,
          notes: notes || null,
          department,
          image_url: firstImageUrl,
          image_urls: imageUrls.length > 0 ? imageUrls : undefined,
          inspection_report_urls: reportUrls.length > 0 ? reportUrls : undefined,
          inspection_report_names: reportNames.length > 0 ? reportNames : undefined,
          updated_by: currentUserId,
        });
        const created = Array.isArray(completionResponse) ? completionResponse[0] : completionResponse;
        completionId = created?.id;
      }
      // Log for Recent activity (QAP / Inspection report / Task completion)
      const currentEquipment = localEquipment.find((eq: Equipment) => eq.id === equipmentId);
      if (currentEquipment) {
        try {
          await logActivityCompleted(
            projectId,
            equipmentId,
            currentEquipment.type || 'Equipment',
            currentEquipment.tagNumber || 'Unknown',
            activityName,
            completedOn,
            completedByDisplayName || null,
            department,
            currentUserFullName || null,
            completionId,
            notes || null,
            reportUrls.length,
            imageUrls.length
          );
          // Skip onActivityUpdate() here — it duplicated a full GET of equipment_activity_logs right after insert. Activity list refreshes on tab open / navigation.
        } catch (logErr) {
          console.warn('Activity completed log (non-fatal):', logErr);
        }
      }
      // Step 4: Auto-feed Updates tab (regular_update) or Progress Image section (milestone)
      // Date in dd mm yyyy; "by X" on a new line
      const formatDDMMYYYY = (iso: string) => {
        try {
          const d = new Date(iso);
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day} ${month} ${year}`;
        } catch {
          return iso;
        }
      };
      const dateStr = formatDDMMYYYY(completedOn);
      const byLine = completedByDisplayName ? `\nby ${completedByDisplayName}` : '';
      const notesPart = notes ? `. ${notes}` : '';
      const descText = `${activityName} completed on ${dateStr}.${byLine}${notesPart}`;
      try {
        if (activityType === 'regular_update') {
          const entryData = {
            equipment_id: equipmentId,
            entry_text: descText,
            entry_type: 'general',
            image_url: firstImageUrl || undefined,
            image_description: notes || undefined,
            created_by: currentUserId || undefined,
          };
          const createdRaw = isStandalone
            ? await fastAPI.createStandaloneProgressEntry(entryData)
            : await fastAPI.createProgressEntry(entryData);
          const row = Array.isArray(createdRaw) ? createdRaw[0] : createdRaw;
          const uName = currentUserFullName || currentUserId || 'Unknown';
          const newEntry: any = row?.id
            ? {
                id: row.id,
                type: row.entry_type || 'general',
                comment: row.entry_text,
                entry_text: row.entry_text,
                image: row.image_url,
                image_url: row.image_url,
                imageDescription: row.image_description,
                image_description: row.image_description,
                uploadDate: row.created_at,
                created_at: row.created_at,
                created_by_user: { full_name: uName, email: (user as any)?.email || '' },
              }
            : {
                id: `progress-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                type: 'general',
                comment: descText,
                entry_text: descText,
                image: firstImageUrl,
                image_url: firstImageUrl,
                imageDescription: notes,
                image_description: notes,
                uploadDate: new Date().toISOString(),
                created_at: new Date().toISOString(),
                created_by_user: { full_name: uName, email: (user as any)?.email || '' },
              };
          setLocalEquipment(prev =>
            prev.map(eq =>
              eq.id === equipmentId
                ? { ...eq, progressEntries: [newEntry, ...(eq.progressEntries || [])] }
                : eq
            )
          );
        } else {
          // Only add a progress image row when user actually uploaded an image; otherwise keep showing the previous latest image (no blank white)
          if (firstImageUrl && imageUrls.length > 0) {
            const imageData = {
              equipment_id: equipmentId,
              image_url: firstImageUrl,
              description: descText,
              uploaded_by: currentUserFullName || completedByDisplayName || currentUserId || undefined,
            };
            await (isStandalone
              ? fastAPI.createStandaloneProgressImage(imageData)
              : fastAPI.createProgressImage(imageData));
            setLocalEquipment(prev =>
              prev.map(eq => (eq.id === equipmentId ? { ...eq, progressImages: [firstImageUrl] } : eq))
            );
          }
        }
      } catch (feedErr: any) {
        console.warn('Auto-feed to Updates/Progress Image (non-fatal):', feedErr);
        toast({ title: 'Note', description: 'Activity marked complete, but the image could not be saved. You can add it again from the Progress Image section.', variant: 'destructive' });
      }
      // Local activity + progress state updated below; avoid full refreshEquipmentData (was duplicating project equipment + progress-image batch fetches).
      const completionPatch = {
        id: completionId || undefined,
        completed_on: completedOn,
        completed_by_user_id: completedByUserId || null,
        completed_by_display_name: completedByDisplayName || null,
        notes: notes || null,
        department,
        image_url: firstImageUrl || null,
        image_count: imageUrls.length,
        inspection_report_count: reportUrls.length,
      };
      let patchedActivities: any[] = [];
      setEquipmentActivities(prev => {
        const current = Array.isArray(prev[equipmentId]) ? prev[equipmentId] : [];
        patchedActivities = current.map((a: any) => (
          a?.id === activityId
            ? { ...a, completion: completionPatch }
            : a
        ));
        return { ...prev, [equipmentId]: patchedActivities };
      });
      // Update equipment progress: fixed weight (if step has progress_weight) or manual %
      const progressWeight = markCompleteModalData.progressWeight;
      const newProgress = progressWeight != null
        ? Math.min(100, (patchedActivities as any[]).filter((a: any) => a.completion && a.progress_weight != null).reduce((sum: number, a: any) => sum + (Number(a.progress_weight) || 0), 0))
        : pct;
      if (newProgress !== currentProgress) {
        try {
          if (isStandalone) {
            await fastAPI.updateStandaloneEquipment(equipmentId, { progress: newProgress }, currentUserId);
          } else {
            await fastAPI.updateEquipment(equipmentId, { progress: newProgress }, currentUserId);
          }
          setLocalEquipment(prev => prev.map(eq => eq.id === equipmentId ? { ...eq, progress: newProgress } : eq));
        } catch (progressErr: any) {
          console.warn('Progress percentage update (non-fatal):', progressErr);
          toast({ title: 'Note', description: 'Activity marked complete, but progress percentage could not be updated.', variant: 'destructive' });
        }
      }
      setMarkCompleteModalOpen(false);
      setMarkCompleteModalData({ activityId: '', activityName: '', activityType: 'regular_update', equipmentId: '', completedOn: '', completedByUserId: '', completedByDisplayName: '', completedBySelectValue: '', department: '', notes: '', imageFiles: [], reportFiles: [], percentageCompleted: 0, currentProgress: 0, progressWeight: null });
      toast({ title: 'Success', description: 'Activity marked complete.' });
    } catch (err: any) {
      console.error('Mark complete error:', err);
      toast({ title: 'Error', description: err?.message || 'Failed to save.', variant: 'destructive' });
    } finally {
      setMarkCompleteSubmitting(false);
    }
  }, [markCompleteModalData, projectId, user?.id, user, toast]);

  const addProgressEntry = async (equipmentId: string) => {
    if (!newProgressEntry?.trim()) {
      toast({ title: 'Notice', description: 'Please enter a comment for the progress entry' });
      return;
    }

    // // console.log('🚀 Starting addProgressEntry for equipment:', equipmentId);
    // // console.log('📝 Current form data:', {
    //   type: newProgressType,
    //   comment: newProgressEntry,
    //   hasImage: !!newProgressImage,
    //   description: imageDescription,
    //   editingId: editingProgressEntryId
    // });

    let imageBase64 = '';
    if (newProgressImage) {
      try {
        // Check if newProgressImage is already a base64 string (from existing image) or a File object (new upload)
        if (typeof newProgressImage === 'string') {
          // It's already a base64 string (existing image)
          imageBase64 = newProgressImage;
          // // console.log('🖼️ Using existing base64 image, length:', imageBase64.length);
        } else {
          // It's a File object (new upload), convert to base64
          imageBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              resolve(e.target?.result as string);
            };
            reader.onerror = reject;
            reader.readAsDataURL(newProgressImage);
          });
          // // console.log('🖼️ New image converted to base64, length:', imageBase64.length);
        }
      } catch (error) {
        console.error('❌ Error converting image:', error);
        toast({ title: 'Error', description: 'Error processing image', variant: 'destructive' });
        return;
      }
    }

    // Process audio data
    let audioBase64 = '';
    let audioDuration = 0;
    if (audioChunks.length > 0) {
      try {
        const audioBlob = audioChunks[0];
        audioBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve(e.target?.result as string);
          };
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
        audioDuration = recordingDuration;
        // // console.log('🎵 Audio converted to base64, length:', audioBase64.length, 'duration:', audioDuration);
      } catch (error) {
        console.error('❌ Error converting audio:', error);
        toast({ title: 'Error', description: 'Error processing audio', variant: 'destructive' });
        return;
      }
    }

    // Find the equipment in localEquipment
    const currentEquipment = localEquipment.find(eq => eq.id === equipmentId);
    if (!currentEquipment) {
      console.error('❌ Equipment not found:', equipmentId);
      toast({ title: 'Error', description: 'Equipment not found', variant: 'destructive' });
      return;
    }

    // // console.log('🔍 Found equipment:', currentEquipment.name || currentEquipment.type);
    // // console.log('📋 Current progress entries:', currentEquipment.progressEntries?.length || 0);

    let newProgressEntries;
    let newEntry: ProgressEntry | null = null;

    if (editingProgressEntryId) {
      // Update existing entry
      // // console.log('🔄 Updating existing entry:', editingProgressEntryId);
      newProgressEntries = (currentEquipment.progressEntries || []).map(entry =>
        entry.id === editingProgressEntryId
          ? {
              ...entry,
              type: newProgressType,
              entry_type: newProgressType,
              comment: newProgressEntry,
              entry_text: newProgressEntry,
              // Preserve existing image if no new image uploaded, otherwise use new image
              image: imageBase64 ? imageBase64 : (entry.image || (entry as any).image_url),
              image_url: imageBase64 ? imageBase64 : (entry.image || (entry as any).image_url),
              imageDescription: imageDescription,
              image_description: imageDescription,
              // Preserve existing audio if no new audio recorded, otherwise use new audio
              audio: audioBase64 ? audioBase64 : (entry.audio || (entry as any).audio_data),
              audio_data: audioBase64 ? audioBase64 : (entry.audio || (entry as any).audio_data),
              audioDuration: audioBase64 ? audioDuration : (entry.audioDuration || (entry as any).audio_duration || 0),
              audio_duration: audioBase64 ? audioDuration : (entry.audioDuration || (entry as any).audio_duration || 0),
              uploadDate: new Date().toISOString()
            }
          : entry
      );
    } else {
      // Add new entry (include created_by_user and entry_text so UI shows "Uploaded by" and description without refetch)
      const userName = (user as any)?.full_name || user?.email || localStorage.getItem('userName') || 'Unknown';
      newEntry = {
        id: `progress-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: newProgressType,
        comment: newProgressEntry,
        entry_text: newProgressEntry,
        image: imageBase64,
        imageDescription: imageDescription,
        audio: audioBase64,
        audioDuration: audioDuration,
        uploadedBy: userName,
        uploadDate: new Date().toISOString(),
        created_at: new Date().toISOString(),
        created_by_user: { full_name: userName, email: (user as any)?.email || '' },
      } as ProgressEntry & { created_by_user?: { full_name: string; email: string }; entry_text?: string; created_at?: string };

      // // console.log('📝 New entry created:', newEntry);
      newProgressEntries = [...(currentEquipment.progressEntries || []), newEntry];
    }

    // // console.log('📋 Final progress entries array:', newProgressEntries);
    // // console.log('📊 Total entries:', newProgressEntries.length);

    // Update local state first
    setLocalEquipment(prev => {
      const updated = prev.map(eq =>
        eq.id === equipmentId
          ? { ...eq, progressEntries: newProgressEntries }
          : eq
      );
      // // console.log('🔄 Updated localEquipment state');
      return updated;
    });

    // Update database - save to equipment_progress_entries table
    try {
      // // console.log('💾 Saving progress entry to database...');
      
      if (!editingProgressEntryId) {
        // Create new progress entry - use appropriate table based on equipment type
        const entryData = {
          equipment_id: equipmentId,
          entry_text: newProgressEntry,
          entry_type: newProgressType,
          audio_data: audioBase64,
          audio_duration: audioDuration,
          image_url: imageBase64,
          image_description: imageDescription,
          created_by: user?.id
        };
        
        const createdEntry = projectId === 'standalone'
          ? await fastAPI.createStandaloneProgressEntry(entryData)
          : await fastAPI.createProgressEntry(entryData);
        // // console.log('✅ Progress entry created in database:', createdEntry);
        
        // Log activity - Progress Entry Added
        try {
          await logProgressEntryAdded(
            projectId,
            equipmentId,
            currentEquipment.type || 'Equipment',
            currentEquipment.tagNumber || 'Unknown',
            newProgressType,
            newProgressEntry
          );
          // // console.log('✅ Activity logged: Progress entry added');
          
          // Refresh activity logs if callback provided
          if (onActivityUpdate) {
            onActivityUpdate();
          }
        } catch (logError) {
          console.error('⚠️ Error logging activity (non-fatal):', logError);
        }
        
        // Update the local entry with the real database ID (no full refetch - append only)
        if (createdEntry && createdEntry[0] && createdEntry[0].id && newEntry) {
          const row = createdEntry[0];
          const realId = row.id;
          setLocalEquipment(prev =>
            prev.map(eq =>
              eq.id === equipmentId
                ? {
                    ...eq,
                    progressEntries: eq.progressEntries.map(entry =>
                      entry.id === newEntry!.id
                        ? { ...entry, id: realId, created_at: row.created_at, entry_text: row.entry_text ?? entry.entry_text ?? entry.comment }
                        : entry
                    ),
                  }
                : eq
            )
          );
        }
      } else {
        // Update existing progress entry - use appropriate table based on equipment type
        const updateData = {
          entry_text: newProgressEntry,
          entry_type: newProgressType,
          audio_data: audioBase64,
          audio_duration: audioDuration,
          image_url: imageBase64,
          image_description: imageDescription
        };
        
        if (projectId === 'standalone') {
          await fastAPI.updateStandaloneProgressEntry(editingProgressEntryId, updateData);
        } else {
          await fastAPI.updateProgressEntry(editingProgressEntryId, updateData);
        }
        // // console.log('✅ Progress entry updated in database');
        
        // Log activity - Progress Entry Updated
        try {
          await logProgressEntryUpdated(
            projectId,
            equipmentId,
            currentEquipment.type || 'Equipment',
            currentEquipment.tagNumber || 'Unknown',
            newProgressType,
            newProgressEntry,
            !!audioBase64, // hasAudio
            !!imageBase64  // hasImage
          );
          // // console.log('✅ Activity logged: Progress entry updated');
          
          // Refresh activity logs if callback provided
          if (onActivityUpdate) {
            onActivityUpdate();
          }
        } catch (logError) {
          console.error('⚠️ Error logging activity (non-fatal):', logError);
        }
      }

      // Reset form
      setNewProgressEntry('');
      setNewProgressType('general');
      setNewProgressImage(null);
      setImageDescription('');
      setEditingProgressEntryId(null);
      setAddingProgressEntryForEquipment(null);
      setEditingProgressEntryForEquipment(null);
      setIsAddingCustomProgressType(false);
      setCustomProgressTypeName('');
      // Reset audio recording state
      setAudioChunks([]);
      setRecordingDuration(0);
      setIsRecording(false);
      // Reset image audio recording state
      setImageAudioChunks([]);
      setImageRecordingDuration(0);
      setIsImageRecording(false);

      if (editingProgressEntryId) {
        toast({ title: 'Success', description: 'Progress entry updated successfully!' });
      } else {
        toast({ title: 'Success', description: 'Progress entry added successfully!' });
      }

      // Dispatch event to refresh equipment activity logs
      window.dispatchEvent(new CustomEvent('equipmentChanged', { detail: { equipmentId, action: editingProgressEntryId ? 'update' : 'add' } }));

    } catch (error) {
      console.error('❌ Database error:', error);
      toast({ title: 'Error', description: 'Error saving to database. Please try again.', variant: 'destructive' });

      // Revert local state on error
      setLocalEquipment(prev => prev.map(eq =>
        eq.id === equipmentId
          ? { ...eq, progressEntries: currentEquipment.progressEntries }
          : eq
      ));
    }
  };

  const removeProgressEntry = (equipmentId: string, entryId: string) => {
    setProgressEntries(prev => ({
      ...prev,
      [equipmentId]: prev[equipmentId]?.filter(entry => entry.id !== entryId) || []
    }));
  };

  const editProgressEntry = (equipmentId: string, entryId: string) => {
    // // console.log('✏️ Edit progress entry clicked:', entryId, 'for equipment:', equipmentId);

    const targetEquipment = localEquipment.find(eq => eq.id === equipmentId);
    if (!targetEquipment) {
      console.error('❌ Equipment not found for editing');
      toast({ title: 'Error', description: 'Equipment not found', variant: 'destructive' });
      return;
    }

    const entry = targetEquipment.progressEntries?.find(entry => entry.id === entryId);
    if (!entry) {
      console.error('❌ Progress entry not found:', entryId);
      toast({ title: 'Error', description: 'Progress entry not found', variant: 'destructive' });
      return;
    }

    // // console.log('📝 Found entry to edit:', entry);

    // Switch to edit mode for this equipment's progress entry only
    setEditingProgressEntryForEquipment(equipmentId);

    // Auto-fill the form with existing entry data
    setEditingProgressEntryId(entryId);
    setNewProgressType((entry as any).entry_type || entry.type || 'general');
    setNewProgressEntry((entry as any).entry_text || entry.comment || '');
    setImageDescription((entry as any).image_description || entry.imageDescription || '');
    
    // Preload existing image (from entry or from on-demand cache)
    const existingImageUrl = (entry as any).image_url || entry.image || progressEntryImageUrls[entryId];
    if (existingImageUrl) {
      setNewProgressImage(existingImageUrl as any);
    } else {
      setNewProgressImage(null);
      // Load entry image on demand for edit form
      fastAPI.getProgressEntryImageUrl(entryId, projectId === 'standalone').then(url => {
        if (url) setNewProgressImage(url as any);
      });
    }

    // Preload existing audio
    const existingAudio = (entry as any).audio_data || entry.audio;
    const existingAudioDuration = (entry as any).audio_duration || entry.audioDuration || 0;
    
    if (existingAudio) {
      try {
        // Convert base64 audio back to Blob
        const base64Data = existingAudio.split(',')[1] || existingAudio; // Remove data URL prefix if present
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: 'audio/webm' });
        
        // Set audio chunks and duration
        setAudioChunks([audioBlob]);
        setRecordingDuration(existingAudioDuration);
        // // console.log('🔊 Preloaded existing audio, duration:', existingAudioDuration);
      } catch (error) {
        console.error('❌ Error loading existing audio:', error);
        // If loading fails, just reset audio
        setAudioChunks([]);
        setRecordingDuration(0);
      }
    } else {
      // No existing audio, reset
      setAudioChunks([]);
      setRecordingDuration(0);
    }

    // // console.log('🔄 Form auto-filled with entry data:', {
    //   type: (entry as any).entry_type || entry.type,
    //   comment: (entry as any).entry_text || entry.comment,
    //   description: (entry as any).image_description || entry.imageDescription,
    //   hasImage: !!existingImageUrl,
    //   hasAudio: !!existingAudio,
    //   audioDuration: existingAudioDuration
    // });
  };

  const deleteProgressEntry = async (equipmentId: string, entryId: string) => {
    // // console.log('🗑️ Deleting progress entry:', entryId, 'from equipment:', equipmentId);

    const currentEquipment = localEquipment.find(eq => eq.id === equipmentId);
    if (!currentEquipment) {
      console.error('❌ Equipment not found for deletion');
      toast({ title: 'Error', description: 'Equipment not found', variant: 'destructive' });
      return;
    }

    // Get entry data before deletion for logging
    const entryToDelete = (currentEquipment.progressEntries || []).find(entry => entry.id === entryId);
    const entryType = entryToDelete ? ((entryToDelete as any).entry_type || entryToDelete.type || 'general') : 'general';
    const entryText = entryToDelete ? ((entryToDelete as any).entry_text || entryToDelete.comment || '') : '';

    const updatedProgressEntries = (currentEquipment.progressEntries || []).filter(entry => entry.id !== entryId);
    // // console.log('📋 Progress entries after deletion:', updatedProgressEntries.length);

    // Update local state first
    setLocalEquipment(prev => prev.map(eq =>
      eq.id === equipmentId
        ? { ...eq, progressEntries: updatedProgressEntries }
        : eq
    ));

    // Update database - use appropriate table based on equipment type
    try {
      // // console.log('🔄 Deleting progress entry from database...');
      const result = projectId === 'standalone'
        ? await fastAPI.deleteStandaloneProgressEntry(entryId)
        : await fastAPI.deleteProgressEntry(entryId);
      // // console.log('✅ Progress entry deleted successfully:', result);

      // Log activity - Progress Entry Deleted
      try {
        await logProgressEntryDeleted(
          projectId,
          equipmentId,
          currentEquipment.type || 'Equipment',
          currentEquipment.tagNumber || 'Unknown',
          entryType,
          entryText
        );
        // // console.log('✅ Activity logged: Progress entry deleted');
        
        // Refresh activity logs if callback provided
        if (onActivityUpdate) {
          onActivityUpdate();
        }
      } catch (logError) {
        console.error('⚠️ Error logging activity (non-fatal):', logError);
      }

      // Show success message
      toast({
        title: "Success",
        description: "Progress entry deleted successfully!",
        variant: "default"
      });
    } catch (error: any) {
      console.error('❌ Error deleting progress entry:', error);

      // Check if it's a timeout error
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        // // console.log('⏰ Request timed out, but local state updated');
        // Don't revert local state for timeout - user sees the change
        toast({
          title: "Warning",
          description: "Entry deleted locally. Please refresh if needed.",
          variant: "default"
        });
      } else {
        console.error('❌ Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        });

        // Revert local state on error
        setLocalEquipment(prev => prev.map(eq =>
          eq.id === equipmentId
            ? { ...eq, progressEntries: currentEquipment.progressEntries }
            : eq
        ));

        // Show error message
        toast({
          title: "Error",
          description: "Failed to delete progress entry. Please try again.",
          variant: "destructive"
        });
      }
    }
  };

  const addTeamPosition = async (equipmentId: string) => {
    if (!newTeamPosition?.trim() || !newTeamName?.trim()) return;

    try {
      // // console.log('👥 Adding team member to project_members table...');

      // Create member data for project_members table
        const memberData = {
          project_id: projectId,
          name: newTeamName?.trim(),
          email: newTeamEmail?.trim() || null,
          phone: newTeamPhone?.trim() || null,
          position: newTeamPosition?.trim(),
          role: newTeamRole,
          permissions: ['view', 'edit'],
          status: 'active',
          equipment_assignments: [equipmentId], // Assign to this equipment
          data_access: ['equipment', 'documents', 'progress'],
          access_level: newTeamRole
        };

      // Save to project_members table
        const createdMember = await fastAPI.createProjectMember(memberData);
        // // console.log('✅ Team member created in project_members table:', createdMember);

      // Get equipment info for logging
      const currentEquipment = localEquipment.find(eq => eq.id === equipmentId);
      if (currentEquipment) {
        // Log team member addition activity
        try {
          // // console.log('📝 Logging team member addition activity...', {
          //   projectId,
          //   equipmentId,
          //   equipmentType: currentEquipment.type || 'Equipment',
          //   tagNumber: currentEquipment.tagNumber || 'Unknown',
          //   memberName: newTeamName?.trim() || 'Unknown',
          //   role: newTeamPosition?.trim() || newTeamRole || 'viewer'
          // });
          
          await logTeamMemberAdded(
            projectId,
            equipmentId,
            currentEquipment.type || 'Equipment',
            currentEquipment.tagNumber || 'Unknown',
            newTeamName?.trim() || 'Unknown',
            newTeamPosition?.trim() || newTeamRole || 'viewer'
          );
          // // console.log('✅ Activity logged: Team member added');
          
          // Refresh activity logs if callback provided
          if (onActivityUpdate) {
            // // console.log('🔄 Refreshing activity logs via callback...');
            onActivityUpdate();
          }
        } catch (logError) {
          console.error('⚠️ Error logging team member addition activity (non-fatal):', logError);
        }
      } else {
        console.warn(`⚠️ Equipment ${equipmentId} not found in localEquipment for logging team member addition`);
      }

      // 🆕 Create invite for the new team member
      if (newTeamEmail && newTeamEmail?.trim()) {
        try {
          const firmId = localStorage.getItem('firmId');
          const currentUserId = user?.id || localStorage.getItem('userId');

          // // console.log('📧 Creating invite for equipment team member...');
          await fastAPI.createInvite({
            email: newTeamEmail?.trim(),
            full_name: newTeamName?.trim(),
            role: newTeamRole,
            firm_id: firmId || '',
            project_id: projectId,
            invited_by: currentUserId || 'system'
          });
          // // console.log('✅ Invite created for equipment team member');
        } catch (inviteError) {
          console.error('❌ Error creating invite (member still created):', inviteError);
        }
      }

      // Show success message
      toast({
        title: "Success",
        description: "Team member added successfully to project",
      });

      // Refresh project members list
      await loadProjectMembers();

      // Notify parent component to refresh Settings tab
      if (onUserAdded) {
        // // console.log('🔄 Calling onUserAdded callback to refresh Settings tab...');
        onUserAdded();
      } else {
        // console.log('⚠️ onUserAdded callback not provided');
      }

      // Clear form
      setNewTeamPosition('');
      setNewTeamName('');
      setNewTeamEmail('');
      setNewTeamPhone('');
      setNewTeamRole('viewer');

      // Close the form
      setShowAddCustomFieldForm(prev => ({
        ...prev,
        [`team-${equipmentId}`]: false
      }));

      toast({ title: 'Success', description: 'Team member added successfully! Check Settings tab to see the new member.' });

    } catch (error) {
      console.error('❌ Error creating team member:', error);
      toast({ title: 'Error', description: 'Error creating team member. Please try again.', variant: 'destructive' });
    }
  };

  const removeTeamPosition = (equipmentId: string, positionId: string) => {
      setTeamPositions(prev => ({
        ...prev,
        [equipmentId]: prev[equipmentId]?.filter(pos => pos.id !== positionId) || []
      }));
  };

  // Custom fields functions
  const addCustomField = (equipmentId: string) => {
    if (!newCustomFieldName?.trim() || !newCustomFieldValue?.trim()) {
      toast({ title: 'Notice', description: 'Please enter both field name and value' });
      return;
    }

    const newField = {
      id: `custom_${Date.now()}`,
      name: newCustomFieldName?.trim(),
      value: newCustomFieldValue?.trim()
    };

    // // console.log('🔧 Adding custom field:', newField);

    // Update editFormData directly
    setEditFormData(prev => {
      const currentCustomFields = prev.customFields || [];
      const updatedCustomFields = [...currentCustomFields, newField];
      const newData = {
        ...prev,
        customFields: updatedCustomFields
      };
      // // console.log('🔧 Updated editFormData:', newData);
      return newData;
    });

    // Clear form
    setNewCustomFieldName('');
    setNewCustomFieldValue('');
  };

  const updateCustomField = (equipmentId: string, fieldId: string, newValue: string) => {
    // Update editFormData directly
    setEditFormData(prev => {
      const updatedCustomFields = prev.customFields?.map(field =>
        field.id === fieldId ? { ...field, value: newValue } : field
      ) || [];
      return {
        ...prev,
        customFields: updatedCustomFields
      };
    });
  };

  const deleteCustomField = (equipmentId: string, fieldId: string) => {
    // Update editFormData directly
    setEditFormData(prev => {
      const updatedCustomFields = prev.customFields?.filter(field => field.id !== fieldId) || [];
      return {
        ...prev,
        customFields: updatedCustomFields
      };
    });
  };

  const handleCancelEdit = () => {
    setEditingEquipmentId(null);
    setEditFormData({});
    // Reset selected IDs
    setSelectedSupervisorId(undefined);
    setSelectedWelderId(undefined);
    setSelectedQcInspectorId(undefined);
    setSelectedProjectManagerId(undefined);
    // Reset progress entry form fields
    setNewProgressType('general');
    setNewProgressEntry('');
    setNewProgressImage(null);
    setImageDescription('');
    setEditingProgressEntryId(null);
    setIsAddingCustomProgressType(false);
    setCustomProgressTypeName('');
    // Reset audio recording state
    setAudioChunks([]);
    setRecordingDuration(0);
    setIsRecording(false);
    // Reset image audio recording state
    setImageAudioChunks([]);
    setImageRecordingDuration(0);
    setIsImageRecording(false);
  };

  const handleAddSection = async (sectionName: string) => {
    if (!editingEquipmentId) return;

    const newSection = {
      name: sectionName,
      customFields: []
    };

    // Update local state
    setTechnicalSections(prev => ({
      ...prev,
      [editingEquipmentId]: [...(prev[editingEquipmentId] || []), newSection]
    }));

    setSelectedSection(prev => ({
      ...prev,
      [editingEquipmentId]: sectionName
    }));

    // Save to database
    try {
      const currentSections = technicalSections[editingEquipmentId] || [];
      const updatedSections = [...currentSections, newSection];

      // // console.log('💾 Saving new section to database:', editingEquipmentId, sectionName);
      // 🔧 FIX: Use correct API based on equipment type
      if (projectId === 'standalone') {
        await fastAPI.updateStandaloneEquipment(editingEquipmentId, {
          technical_sections: updatedSections
        }, user?.id);
      } else {
        await updateEquipment(editingEquipmentId, {
          technical_sections: updatedSections
        });
      }
      // // console.log('✅ Section saved successfully');

      toast({
        title: "Success",
        description: "Technical section added successfully",
      });
    } catch (error) {
      console.error('Error saving section:', error);
      toast({
        title: "Error",
        description: "Failed to save technical section",
        variant: "destructive",
      });
    }
  };

  const handleEditSection = async (newSectionName: string) => {
    if (!editingEquipmentId || !editingSectionOldName) return;

    // // console.log('🔄 handleEditSection: Starting section name update:', editingSectionOldName, '->', newSectionName);

    // Update local state
    setTechnicalSections(prev => ({
      ...prev,
      [editingEquipmentId]: (prev[editingEquipmentId] || []).map(section =>
        section.name === editingSectionOldName
          ? { ...section, name: newSectionName }
          : section
      )
    }));

    // Update selected section if it was the edited one
    if (selectedSection[editingEquipmentId] === editingSectionOldName) {
      setSelectedSection(prev => ({
        ...prev,
        [editingEquipmentId]: newSectionName
      }));
    }

    // Save to database
    try {
      const updatedSections = (technicalSections[editingEquipmentId] || []).map(section =>
        section.name === editingSectionOldName
          ? { ...section, name: newSectionName }
          : section
      );

      // // console.log('💾 Updating section name in database:', editingEquipmentId, editingSectionOldName, '->', newSectionName);
      // 🔧 FIX: Use correct API based on equipment type
      if (projectId === 'standalone') {
        await fastAPI.updateStandaloneEquipment(editingEquipmentId, {
          technical_sections: updatedSections
        }, user?.id);
      } else {
        await updateEquipment(editingEquipmentId, {
          technical_sections: updatedSections
        });
      }
      // // console.log('✅ Section name updated successfully');

      // Refresh equipment data to ensure consistency
      // // console.log('🔄 Calling refreshEquipmentData after section name update');
      await refreshEquipmentData();
      // // console.log('✅ refreshEquipmentData completed');

      toast({
        title: "Success",
        description: "Section name updated successfully",
      });

      // // console.log('✅ handleEditSection: Section name update completed successfully');
    } catch (error) {
      console.error('❌ handleEditSection: Error updating section name:', error);
      toast({
        title: "Error",
        description: "Failed to update section name",
        variant: "destructive",
      });
    }

    // Close modal and reset state
    setIsEditSectionModalOpen(false);
    setEditingSectionName('');
    setEditingSectionOldName('');
  };

  const handleDeleteSection = async (sectionName: string) => {
    if (!editingEquipmentId || !sectionName) return;

    // // console.log('🔄 handleDeleteSection: Starting section deletion:', sectionName);
    // // console.log('📊 Current technicalSections before deletion:', technicalSections[editingEquipmentId]);

    // Update local state - remove the section
    const updatedSections = (technicalSections[editingEquipmentId] || []).filter(section =>
      section.name !== sectionName
    );

    // // console.log('📊 Updated sections after filtering:', updatedSections);

    setTechnicalSections(prev => ({
      ...prev,
      [editingEquipmentId]: updatedSections
    }));

    // Clear selected section if it was the deleted one
    if (selectedSection[editingEquipmentId] === sectionName) {
      setSelectedSection(prev => ({
        ...prev,
        [editingEquipmentId]: ''
      }));
    }

    try {
      // Update in database - use the already filtered sections
      // // console.log('💾 Deleting section in database:', editingEquipmentId, sectionName);
      // // console.log('📊 Sections to save to database:', updatedSections);

      // 🔧 FIX: Use correct API based on equipment type
      if (projectId === 'standalone') {
        await fastAPI.updateStandaloneEquipment(editingEquipmentId, {
          technical_sections: updatedSections
        }, user?.id);
      } else {
        await updateEquipment(editingEquipmentId, {
          technical_sections: updatedSections
        });
      }
      // // console.log('✅ Section deleted successfully from database');

      // Refresh equipment data to ensure consistency
      // // console.log('🔄 Calling refreshEquipmentData after section deletion');
      await refreshEquipmentData();
      // // console.log('✅ refreshEquipmentData completed');

      toast({
        title: "Success",
        description: "Section deleted successfully",
      });

      // // console.log('✅ handleDeleteSection: Section deletion completed successfully');
    } catch (error) {
      console.error('❌ handleDeleteSection: Error deleting section:', error);
      toast({
        title: "Error",
        description: "Failed to delete section",
        variant: "destructive",
      });
    }

    // Close modal and reset state
    setIsEditSectionModalOpen(false);
    setEditingSectionName('');
    setEditingSectionOldName('');
  };

  const handleImageUpload = (file: File) => {
    setNewProgressImage(file);
  };

  // Audio recording functions
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const audioBase64 = reader.result as string;
          // Store the audio data temporarily
          setAudioChunks([audioBlob]);
          // You can add this to progress entry later
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      setMediaRecorder(recorder);
      setAudioChunks([]);
      setRecordingDuration(0);
      
      // Use timeslice to capture data more frequently (every 100ms) to avoid missing start/end
      recorder.start(100);
      setIsRecording(true);

      // Start timer - slightly offset to account for recorder initialization
      setTimeout(() => {
        const timer = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
        setRecordingTimer(timer);
      }, 50);

    } catch (error) {
      console.error('Error starting audio recording:', error);
      toast({
        title: "Recording Error",
        description: "Could not start audio recording. Please check microphone permissions.",
        variant: "destructive"
      });
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (recordingTimer) {
        clearInterval(recordingTimer);
        setRecordingTimer(null);
      }
    }
  };

  const playAudio = (audioBase64: string, entryId: string) => {
    if (playingAudioId === entryId) {
      setPlayingAudioId(null);
      return;
    }

    setPlayingAudioId(entryId);
    const audio = new Audio(audioBase64);
    audio.onended = () => setPlayingAudioId(null);
    audio.play();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Image audio recording functions
  const startImageAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setImageAudioChunks([audioBlob]);
        stream.getTracks().forEach(track => track.stop());
      };

      setImageMediaRecorder(recorder);
      setImageAudioChunks([]);
      setImageRecordingDuration(0);
      
      // Use timeslice to capture data more frequently (every 100ms) to avoid missing start/end
      recorder.start(100);
      setIsImageRecording(true);

      // Start timer - slightly offset to account for recorder initialization
      setTimeout(() => {
        const timer = setInterval(() => {
          setImageRecordingDuration(prev => prev + 1);
        }, 1000);
        setImageRecordingTimer(timer);
      }, 50);

    } catch (error) {
      console.error('Error starting image audio recording:', error);
      toast({
        title: "Recording Error",
        description: "Could not start audio recording. Please check microphone permissions.",
        variant: "destructive"
      });
    }
  };

  const stopImageAudioRecording = () => {
    if (imageMediaRecorder && isImageRecording) {
      imageMediaRecorder.stop();
      setIsImageRecording(false);
      if (imageRecordingTimer) {
        clearInterval(imageRecordingTimer);
        setImageRecordingTimer(null);
      }
    }
  };

  const playImageAudio = (audioBase64: string) => {
    const audio = new Audio(audioBase64);
    audio.play();
  };

  const removeImageAudio = () => {
    setImageAudioChunks([]);
    setImageRecordingDuration(0);
  };

  const handleDocumentUpload = async (equipmentId: string, files: File[]) => {
    try {
      // // console.log('🚀 MANUAL: Starting document upload for equipment:', equipmentId);
      // // console.log('🚀 MANUAL: Files to upload:', files);

      // Get user data
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const user = userData;

      // Upload files to storage and database
      let anyUploaded = false;
      for (const file of files) {
        try {
          // // console.log('🚀 MANUAL: Processing file:', file.name);
          // // console.log('🚀 MANUAL: File size:', file.size, 'bytes');
          // // console.log('🚀 MANUAL: File type:', file.type);

          // Upload to Supabase storage - use different paths for standalone vs project equipment
          const isStandalone = projectId === 'standalone';
          const filePath = isStandalone 
            ? `standalone-equipment/${equipmentId}/${Date.now()}_${file.name}`
            : `equipment/${equipmentId}/${Date.now()}_${file.name}`;
          const storageBucket = isStandalone ? 'standalone-equipment-documents' : 'project-documents';
          
          // // console.log('🚀 MANUAL: Uploading to storage path:', filePath);
          // // console.log('🚀 MANUAL: Storage bucket:', storageBucket);
          // // console.log('🚀 MANUAL: Is standalone:', isStandalone);

          // Use edge function for secure upload (service role key not exposed)
          const { uploadFileViaEdgeFunction } = await import('@/lib/edgeFunctions');
          const publicUrl = await uploadFileViaEdgeFunction({
            bucket: storageBucket,
            filePath,
            file
          });
          // // console.log('🚀 MANUAL: Got public URL:', publicUrl);

          // Create document entry in database
          const documentData = {
            name: file.name,
            url: publicUrl,
            uploadedBy: user.id || 'current-user',
            size: file.size,
            mimeType: file.type,
            equipmentType: 'Manual Upload',
            equipmentTagNumber: 'Manual'
          };

          // // console.log('🚀 MANUAL: Creating document entry:', documentData);
          // Use correct upload function based on equipment type
          const uploadedDoc = isStandalone 
            ? await uploadStandaloneEquipmentDocument(equipmentId, documentData)
            : await uploadEquipmentDocument(equipmentId, documentData);
          // // console.log('🚀 MANUAL: Document created:', uploadedDoc);

          // Get equipment info for logging
          const currentEquipment = localEquipment.find(eq => eq.id === equipmentId);
          const docId = (uploadedDoc as any)?.id ?? (uploadedDoc as any)?.[0]?.id;
          if (currentEquipment) {
            // Log document upload activity (include document_id so activity detail can open this doc)
            try {
              await logDocumentUploaded(
                projectId,
                equipmentId,
                currentEquipment.type || 'Equipment',
                currentEquipment.tagNumber || 'Unknown',
                documentData.equipmentType || 'Manual Upload',
                documentData.name,
                docId
              );
              // // console.log('✅ Activity logged: Document uploaded');
            } catch (logError) {
              console.error('⚠️ Error logging document activity (non-fatal):', logError);
            }
          }

          anyUploaded = true;

          // Immediately update local state with new document
          const newDocument = {
            id: (uploadedDoc as any)?.id || (uploadedDoc as any)?.[0]?.id || Date.now().toString(),
            name: documentData.name,
            document_name: documentData.name,
            document_url: documentData.url,
            uploadedBy: documentData.uploadedBy,
            uploadDate: new Date().toISOString()
          };

          // // console.log('🚀 MANUAL: Adding new document to state:', newDocument);
          setDocuments(prev => {
            const currentDocs = prev[equipmentId] || [];
            const updatedDocs = [...currentDocs, newDocument];
            // // console.log('🚀 MANUAL: Updated documents array:', updatedDocs);
            return {
              ...prev,
              [equipmentId]: updatedDocs
            };
          });

          // // console.log('🚀 MANUAL: Local state updated with new document');

        } catch (fileError: any) {
          console.error(`❌ MANUAL: Error uploading document ${file.name}:`, fileError);
          console.error(`❌ MANUAL: Error details:`, {
            message: fileError.message,
            response: fileError.response?.data,
            status: fileError.response?.status
          });
          throw fileError;
        }
      }

      // One activity-log refresh for the whole batch (was per file — duplicated parent fetches)
      if (anyUploaded && onActivityUpdate) {
        onActivityUpdate();
      }

      toast({ title: 'Success', description: 'MANUAL: Documents uploaded successfully!' });

    } catch (error: any) {
      console.error('❌ MANUAL: Error uploading documents:', error);
      console.error('❌ MANUAL: Full error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      let errorMessage = 'Failed to upload documents. Please try again.';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({ title: 'Error', description: `MANUAL: ${errorMessage}`, variant: 'destructive' });
    }
  };

  const handleDocumentNameChange = (equipmentId: string, documentId: string, newName: string) => {
    setDocuments(prev => ({
      ...prev,
      [equipmentId]: prev[equipmentId]?.map(doc =>
        doc.id === documentId ? { ...doc, name: newName } : doc
      ) || []
    }));
  };

  const handleDeleteDocument = async (equipmentId: string, documentId: string) => {
    if (confirm('Sure you want to delete file?')) {
      try {
        // Get document info before deleting for logging
        const currentEquipment = localEquipment.find(eq => eq.id === equipmentId);
        const isStandalone = projectId === 'standalone';
        
        // Use correct function based on equipment type
        const documentsResponse = isStandalone
          ? await getStandaloneEquipmentDocuments(equipmentId)
          : await getEquipmentDocuments(equipmentId);
        const documents = Array.isArray(documentsResponse) ? documentsResponse : [];
        const documentToDelete = documents.find((doc: any) => doc.id === documentId);
        
        // // console.log('🗑️ Deleting document:', documentId);
        // Use correct delete function based on equipment type
        if (isStandalone) {
          await deleteStandaloneEquipmentDocument(documentId);
        } else {
        await deleteEquipmentDocument(documentId);
        }

        // Log document deletion activity
        if (currentEquipment && documentToDelete) {
          try {
            await logDocumentDeleted(
              projectId,
              equipmentId,
              currentEquipment.type || 'Equipment',
              currentEquipment.tagNumber || 'Unknown',
              documentToDelete.document_type || 'Document',
              documentToDelete.document_name || documentToDelete.name || 'Unknown'
            );
            // // console.log('✅ Activity logged: Document deleted');
            
            // Refresh activity logs if callback provided
            if (onActivityUpdate) {
              onActivityUpdate();
            }
          } catch (logError) {
            console.error('⚠️ Error logging document deletion activity (non-fatal):', logError);
          }
        }

        // Reload documents from database
        await fetchEquipmentDocuments(equipmentId);

        // // console.log('✅ Document deleted successfully');
        toast({ title: 'Success', description: 'Document deleted successfully!' });
      } catch (error) {
        console.error('❌ Error deleting document:', error);
        toast({ title: 'Error', description: 'Failed to delete document. Please try again.', variant: 'destructive' });
      }
    }
  };

  const handleOpenDocument = async (document: any, equipmentId?: string) => {
    if (document.file) {
      setDocumentPreview(document);
      return;
    }
    if (document.document_url) {
      setDocumentUrlModal({
        url: document.document_url,
        name: document.document_name || document.name,
        uploadedBy: document.uploadedBy || document.uploaded_by_user?.full_name,
        uploadDate: document.uploadDate || document.upload_date
      });
      return;
    }
    // Use same doc as document name column: if this doc has no id, resolve from list by name
    let docToOpen = document;
    if ((!document.id || !equipmentId) && equipmentId) {
      const list = documents[equipmentId] || [];
      const sameDoc = list.find((d: any) => (d.document_name || d.name || '') === (document.document_name || document.name || ''));
      if (sameDoc) docToOpen = sameDoc;
    }
    if (docToOpen.id && equipmentId) {
      handleDocumentPreviewClick(docToOpen, equipmentId);
      return;
    }
    toast({ title: 'Error', description: 'Document URL not found. Please contact support.', variant: 'destructive' });
  };

  const handleMiniFormSubmit = async () => {
    if (!miniFormData.equipmentName || !miniFormData.tagNumber || !miniFormData.jobNumber || !miniFormData.msnNumber) {
      toast({
        title: "Error",
        description: "Please fill all required fields (Equipment Name, Tag Number, Job Number, and Equipment Title)",
        variant: "destructive"
      });
      return;
    }

    // If custom equipment is selected, check if custom name is provided
    if (miniFormData.equipmentName === 'Custom' && !miniFormData.customEquipmentName) {
      toast({
        title: "Error",
        description: "Please enter a custom equipment name",
        variant: "destructive"
      });
      return;
    }

    try {
      // Create basic equipment data from mini form
      const equipmentType = miniFormData.equipmentName === 'Custom' 
        ? miniFormData.customEquipmentName 
        : miniFormData.equipmentName;
        
      const newEquipment = {
        name: equipmentType, // Use equipment type as the name for display
        type: equipmentType,
        tagNumber: miniFormData.tagNumber,
        jobNumber: miniFormData.jobNumber,
        manufacturingSerial: miniFormData.msnNumber,
        size: miniFormData.size,
        material: miniFormData.material,
        designCode: miniFormData.designCode,
        projectId: projectId,
        status: 'design',
        priority: 'medium'
      };

      await handleAddEquipment(newEquipment);
      
      // Only reset form and show success if no error was thrown
      // (handleAddEquipment will show its own success/error toast)
      setMiniFormData({ 
        equipmentName: '', 
        customEquipmentName: '', 
        tagNumber: '', 
        jobNumber: '', 
        msnNumber: '',
        size: '',
        material: '',
        designCode: ''
      });
      setShowMiniForm(false);
      
    } catch (error: any) {
      console.error('Error adding equipment:', error);
      // handleAddEquipment already shows the error toast, but if it somehow doesn't,
      // show a fallback error message
      const errorMessage = error?.message || 'Failed to add equipment';
      if (errorMessage.includes('already exists') || errorMessage.includes('unique')) {
        toast({
          title: 'Validation Error',
          description: errorMessage,
          variant: 'destructive',
          duration: 5000
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
    }
  };

  const handleAddStandaloneEquipment = async (formData: any) => {
    try {
      const { equipmentDetails, equipmentManagerContacts, isEditMode, equipmentId, ...baseFormData } = formData;

      // Edit mode: update existing standalone equipment (from details page "Edit Equipment")
      if (isEditMode && equipmentId && equipmentDetails && Object.keys(equipmentDetails).length > 0) {
        const firstType = Object.keys(equipmentDetails)[0];
        const units = equipmentDetails[firstType];
        const unit = Array.isArray(units) ? units[0] : null;
        if (!unit) throw new Error('No equipment unit to update.');
        const equipmentData: any = {
          type: firstType,
          tag_number: unit.tagNumber || '',
          name: firstType,
          job_number: unit.jobNumber || '',
          manufacturing_serial: unit.manufacturingSerial || '',
          size: unit.size || baseFormData.size || '',
          material: unit.material || baseFormData.material || '',
          design_code: unit.designCode || baseFormData.designCode || '',
          client_name: baseFormData.clientName || '',
          plant_location: baseFormData.plantLocation || '',
          po_number: baseFormData.poNumber || '',
          sales_order_date: baseFormData.salesOrderDate || null,
          completion_date: baseFormData.completionDate || null,
          client_industry: baseFormData.clientIndustry || '',
          equipment_manager: baseFormData.equipmentManager || '',
          consultant: baseFormData.consultant || '',
          tpi_agency: baseFormData.tpiAgency || '',
          client_focal_point: baseFormData.clientFocalPoint || '',
          services_included: baseFormData.servicesIncluded || {},
          scope_description: baseFormData.scopeDescription || '',
          kickoff_meeting_notes: baseFormData.kickoffMeetingNotes || '',
          special_production_notes: baseFormData.specialProductionNotes || '',
          location: baseFormData.plantLocation || 'Not Assigned',
          po_cdd: baseFormData.poNumber || 'To be scheduled',
          custom_fields: [
            { name: 'Client Name', value: baseFormData.clientName || '' },
            { name: 'Plant Location', value: baseFormData.plantLocation || '' },
            { name: 'PO Number', value: baseFormData.poNumber || '' },
            { name: 'Sales Order Date', value: baseFormData.salesOrderDate || '' },
            { name: 'Completion Date', value: baseFormData.completionDate || '' },
            { name: 'Client Industry', value: baseFormData.clientIndustry || '' },
            { name: 'Equipment Manager', value: baseFormData.equipmentManager || '' },
            { name: 'Consultant', value: baseFormData.consultant || '' },
            { name: 'TPI Agency', value: baseFormData.tpiAgency || '' },
            { name: 'Client Focal Point', value: baseFormData.clientFocalPoint || '' },
            { name: 'Scope Description', value: baseFormData.scopeDescription || '' },
            { name: 'Kickoff Meeting Notes', value: baseFormData.kickoffMeetingNotes || '' },
            { name: 'Special Production Notes', value: baseFormData.specialProductionNotes || '' }
          ]
        };
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        await fastAPI.updateStandaloneEquipment(equipmentId, equipmentData, userData?.id);
        // Upload any new documents added in edit mode (core & additional docs)
        const toFileArray = (v: File | File[] | null | undefined): File[] => (!v ? [] : Array.isArray(v) ? v : [v]);
        const uploadCoreDoc = async (file: File, documentType: string) => {
          try {
            const { uploadFileViaEdgeFunction } = await import('@/lib/edgeFunctions');
            const fileName = `standalone-equipment/${equipmentId}/Core Documents/${documentType}/${Date.now()}_${file.name}`;
            const publicUrl = await uploadFileViaEdgeFunction({ bucket: 'standalone-equipment-documents', filePath: fileName, file });
            await uploadStandaloneEquipmentDocument(equipmentId, { name: file.name, url: publicUrl, uploadedBy: user?.id || null, size: file.size, mimeType: file.type, equipmentType: documentType });
          } catch (err: any) {
            console.error(`Error uploading ${documentType} (${file.name}):`, err);
          }
        };
        const unpricedFiles = toFileArray(baseFormData.unpricedPOFile);
        const designFiles = toFileArray(baseFormData.designInputsPID);
        const clientRefFiles = toFileArray(baseFormData.clientReferenceDoc);
        const otherFiles = toFileArray(baseFormData.otherDocuments);
        for (const f of unpricedFiles) await uploadCoreDoc(f, 'Unpriced PO File');
        for (const f of designFiles) await uploadCoreDoc(f, 'Design Inputs PID');
        for (const f of clientRefFiles) await uploadCoreDoc(f, 'Client Reference Doc');
        for (const f of otherFiles) await uploadCoreDoc(f, 'Other Documents');
        await refreshEquipmentData(true);
        await fetchEquipmentDocuments(equipmentId);
        toast({ title: 'Success', description: 'Equipment updated successfully!' });
        setShowAddEquipmentForm(false);
        setEditingStandaloneEquipment(null);
        return;
      }

      const createdEquipmentIds: string[] = [];
      const uploadErrors: string[] = [];
      const teamErrors: string[] = [];
      const pendingDocumentsByEquipment: Record<string, any[]> = {};

      // 🔧 FIX: Validate that equipmentDetails exists and has equipment
      if (!equipmentDetails || Object.keys(equipmentDetails).length === 0) {
        throw new Error('Please add at least one equipment unit in Step 1 before submitting.');
      }

      // Process each equipment unit from equipmentDetails
      if (equipmentDetails && Object.keys(equipmentDetails).length > 0) {
        for (const [equipmentType, equipmentUnits] of Object.entries(equipmentDetails)) {
          const units = equipmentUnits as Array<{
            id: string;
            tagNumber: string;
            jobNumber: string;
            manufacturingSerial: string;
            size: string;
            material: string;
            designCode: string;
            documents: File[];
          }>;

          for (const unit of units) {
            // Prepare equipment data with all form fields
            const equipmentData: any = {
              type: equipmentType,
              tag_number: unit.tagNumber || '',
              name: equipmentType,
              job_number: unit.jobNumber || '',
              manufacturing_serial: unit.manufacturingSerial || '',
              // Step 1: Equipment Information
              size: unit.size || baseFormData.size || '',
              material: unit.material || baseFormData.material || '',
              design_code: unit.designCode || baseFormData.designCode || '',
              // Step 2: Basic Information
              client_name: baseFormData.clientName || '',
              plant_location: baseFormData.plantLocation || '',
              po_number: baseFormData.poNumber || '',
              sales_order_date: baseFormData.salesOrderDate || '',
              completion_date: baseFormData.completionDate || '',
              client_industry: baseFormData.clientIndustry || '',
              equipment_manager: baseFormData.equipmentManager || '',
              consultant: baseFormData.consultant || '',
              tpi_agency: baseFormData.tpiAgency || '',
              client_focal_point: baseFormData.clientFocalPoint || '',
              // Step 3: Scope & Documents
              services_included: baseFormData.servicesIncluded || {},
              scope_description: baseFormData.scopeDescription || '',
              kickoff_meeting_notes: baseFormData.kickoffMeetingNotes || '',
              special_production_notes: baseFormData.specialProductionNotes || '',
              // Default values
              status: 'active',
              progress: 0,
              progress_phase: 'documentation',
              location: baseFormData.plantLocation || 'Not Assigned',
              next_milestone: 'Initial Setup',
              priority: 'medium',
              is_basic_info: false,
              progress_images: [],
              po_cdd: baseFormData.poNumber || 'To be scheduled',
              // Store additional data in custom_fields
              custom_fields: [
                { name: 'Client Name', value: baseFormData.clientName || '' },
                { name: 'Plant Location', value: baseFormData.plantLocation || '' },
                { name: 'PO Number', value: baseFormData.poNumber || '' },
                { name: 'Sales Order Date', value: baseFormData.salesOrderDate || '' },
                { name: 'Completion Date', value: baseFormData.completionDate || '' },
                { name: 'Client Industry', value: baseFormData.clientIndustry || '' },
                { name: 'Equipment Manager', value: baseFormData.equipmentManager || '' },
                { name: 'Consultant', value: baseFormData.consultant || '' },
                { name: 'TPI Agency', value: baseFormData.tpiAgency || '' },
                { name: 'Client Focal Point', value: baseFormData.clientFocalPoint || '' },
                { name: 'Scope Description', value: baseFormData.scopeDescription || '' },
                { name: 'Kickoff Meeting Notes', value: baseFormData.kickoffMeetingNotes || '' },
                { name: 'Special Production Notes', value: baseFormData.specialProductionNotes || '' }
              ]
            };

            // Remove undefined values and project-specific fields that don't exist in standalone_equipment table
            const invalidFields = ['project_manager', 'supervisor', 'welder', 'qc_inspector', 'project_id', 'firm_id'];
            Object.keys(equipmentData).forEach(key => {
              if (equipmentData[key] === undefined || invalidFields.includes(key)) {
                delete equipmentData[key];
              }
            });

            // Create the equipment (pass firmId for max equipment limit check)
            const firmId = localStorage.getItem('firmId');
            const createdEquipmentResponse = await fastAPI.createStandaloneEquipment(equipmentData, firmId || undefined);
            const createdEquipment = Array.isArray(createdEquipmentResponse) ? createdEquipmentResponse[0] : createdEquipmentResponse;
            const equipmentId = createdEquipment?.id;
            
            if (equipmentId) {
              createdEquipmentIds.push(equipmentId);
            }

            // Upload equipment documents if any
            if (equipmentId && unit.documents && unit.documents.length > 0) {
              // console.log(`📄 Uploading ${unit.documents.length} equipment document(s) for equipment: ${equipmentType} - ${unit.tagNumber}`);
              
              for (let i = 0; i < unit.documents.length; i++) {
                const file = unit.documents[i];
                try {
                  // Upload file to Supabase Storage with proper folder structure
                  // Path: standalone-equipment/{equipment_id}/{file_name}
                  const fileName = `standalone-equipment/${equipmentId}/${Date.now()}_${file.name}`;
                  
                  // Use edge function for secure upload (service role key not exposed)
                  const { uploadFileViaEdgeFunction } = await import('@/lib/edgeFunctions');
                  const publicUrl = await uploadFileViaEdgeFunction({
                    bucket: 'standalone-equipment-documents',
                    filePath: fileName,
                    file
                  });
                    
                    // Create document record in database
                    const documentData = {
                      name: file.name,
                      url: publicUrl,
                      uploadedBy: user?.id || null,
                      size: file.size,
                      mimeType: file.type,
                      equipmentType: 'Equipment Document'
                    };
                    
                    pendingDocumentsByEquipment[equipmentId] = [
                      ...(pendingDocumentsByEquipment[equipmentId] || []),
                      documentData
                    ];
                    // console.log(`✅ Equipment document ${i + 1} uploaded successfully: ${file.name}`);
                } catch (docError: any) {
                  console.error(`❌ Error uploading equipment document ${i + 1} (${file.name}):`, docError);
                  uploadErrors.push(`Failed to upload ${file.name}: ${docError?.message || 'Unknown error'}`);
                  // Continue with other documents even if one fails
                }
              }
            }

          }
        }
      }

      // 🔧 FIX: Validate that at least one equipment was created
      if (createdEquipmentIds.length === 0) {
        throw new Error('Failed to create equipment. Please ensure all required fields are filled and try again.');
      }

      // Upload Core Documents (Unpriced PO, Design Inputs, Client Reference, Other Documents)
      // Upload these documents to all created equipment items
      if (createdEquipmentIds.length > 0 && baseFormData) {
        // Helper function to upload a single document to a specific equipment
        const uploadCoreDocument = async (file: File, documentType: string, equipmentId: string) => {
          try {
            const fileName = `standalone-equipment/${equipmentId}/Core Documents/${documentType}/${Date.now()}_${file.name}`;
            
            // Use edge function for secure upload (service role key not exposed)
            const { uploadFileViaEdgeFunction } = await import('@/lib/edgeFunctions');
            const publicUrl = await uploadFileViaEdgeFunction({
              bucket: 'standalone-equipment-documents',
              filePath: fileName,
              file
            });
              
              const documentData = {
                name: file.name,
                url: publicUrl,
                uploadedBy: user?.id || null,
                size: file.size,
                mimeType: file.type,
                equipmentType: documentType
              };
              
              pendingDocumentsByEquipment[equipmentId] = [
                ...(pendingDocumentsByEquipment[equipmentId] || []),
                documentData
              ];
              // console.log(`✅ ${documentType} uploaded successfully for equipment ${equipmentId}: ${file.name}`);
              return true;
          } catch (error: any) {
            console.error(`❌ Error uploading ${documentType} (${file.name}) for equipment ${equipmentId}:`, error);
            uploadErrors.push(`Failed to upload ${documentType} (${file.name}): ${error?.message || 'Unknown error'}`);
            return false;
          }
        };

        // Helper: normalize to File[] (form may send File[] or legacy single File)
        const toFileArray = (v: File | File[] | null | undefined): File[] => {
          if (!v) return [];
          return Array.isArray(v) ? v : [v];
        };

        // Upload core documents to all created equipment items
        for (const equipmentId of createdEquipmentIds) {
          // Upload Unpriced PO Files (multiple)
          const unpricedPOFiles = toFileArray(baseFormData.unpricedPOFile);
          for (const file of unpricedPOFiles) {
            await uploadCoreDocument(file, 'Unpriced PO File', equipmentId);
          }

          // Upload Design Inputs/PID (multiple)
          const designInputsFiles = toFileArray(baseFormData.designInputsPID);
          for (const file of designInputsFiles) {
            await uploadCoreDocument(file, 'Design Inputs PID', equipmentId);
          }

          // Upload Client Reference Documents (multiple)
          const clientRefFiles = toFileArray(baseFormData.clientReferenceDoc);
          for (const file of clientRefFiles) {
            await uploadCoreDocument(file, 'Client Reference Doc', equipmentId);
          }

          // Upload Other Documents (multiple files)
          const otherFiles = toFileArray(baseFormData.otherDocuments);
          for (const file of otherFiles) {
            await uploadCoreDocument(file, 'Other Documents', equipmentId);
          }
        }
      }

      // Persist all uploaded document metadata in bulk per equipment (reduces many POST calls).
      for (const equipmentId of Object.keys(pendingDocumentsByEquipment)) {
        const docs = pendingDocumentsByEquipment[equipmentId] || [];
        if (!docs.length) continue;
        try {
          await uploadStandaloneEquipmentDocumentsBulk(equipmentId, docs);
        } catch (bulkDocError: any) {
          console.error(`❌ Error bulk saving docs for equipment ${equipmentId}:`, bulkDocError);
          uploadErrors.push(`Failed to save document metadata for equipment ${equipmentId}`);
        }
      }

      // Cache firm members once per submit to avoid repeated network calls.
      const getFirmMembersOnce = (() => {
        let cache: any[] | null = null;
        return async () => {
          if (cache) return cache;
          const firmId = localStorage.getItem('firmId');
          if (!firmId) {
            cache = [];
            return cache;
          }
          try {
            cache = await fastAPI.getAllFirmTeamMembers(firmId);
          } catch {
            cache = [];
          }
          return cache;
        };
      })();

      // Resolve Equipment Manager email from contacts, firm team, or standalone_equipment_team_positions (never use @company.com)
      const resolveEquipmentManagerEmail = async (name: string): Promise<{ email: string | null; phone: string }> => {
        const contact = equipmentManagerContacts?.[name];
        let phone = contact?.phone || '';
        if (contact?.email && contact.email.includes('@') && !contact.email.toLowerCase().includes('@company')) return { email: contact.email, phone };
        if (name.includes('@')) return { email: name, phone };
        const members = await getFirmMembersOnce();
        if (members.length > 0) {
          try {
            const member = (members || []).find((m: any) => m.name === name && (m.role === 'project_manager' || m.access_level === 'project_manager'));
            if (member?.email && member.email.includes('@') && !member.email.toLowerCase().includes('@company')) {
              return { email: member.email, phone: member?.phone || phone };
            }
          } catch {
            // fall through to team_positions lookup
          }
        }
        // Fallback: look up previously added equipment manager from standalone_equipment_team_positions (e.g. when selected from recommendations)
        try {
          const fromTeam = await fastAPI.getStandaloneEquipmentManagerContact(name);
          if (fromTeam) return { email: fromTeam.email, phone: fromTeam.phone };
        } catch {
          // ignore
        }
        return { email: null, phone };
      };

      // Add Equipment Manager to standalone_equipment_team_positions table (only with resolved email – no @company.com)
      if (baseFormData.equipmentManager && baseFormData.equipmentManager.trim() !== '' && createdEquipmentIds.length > 0) {
        try {
          const equipmentManagerName = baseFormData.equipmentManager;
          const { email: equipmentManagerEmail, phone: equipmentManagerPhone } = await resolveEquipmentManagerEmail(equipmentManagerName);
          
          if (!equipmentManagerEmail) {
            console.warn('⚠️ Equipment Manager email not found (skipping team add). Use the email saved when the team member was first added.');
          } else {
          let equipmentManagerRole: 'editor' | 'viewer' = 'editor';
          if (equipmentManagerContacts?.[equipmentManagerName]?.role === 'project_manager') equipmentManagerRole = 'editor';
          try {
            const allMembers = await getFirmMembersOnce();
            const existingMember = allMembers.find((m: any) => m.email?.toLowerCase() === equipmentManagerEmail.toLowerCase());
            if (existingMember) {
              if (existingMember.role === 'project_manager' || existingMember.access_level === 'project_manager') equipmentManagerRole = 'editor';
              else if (existingMember.role === 'vdcr_manager' || existingMember.access_level === 'vdcr_manager') equipmentManagerRole = 'editor';
              else if (existingMember.role === 'editor' || existingMember.access_level === 'editor') equipmentManagerRole = 'editor';
              else equipmentManagerRole = 'viewer';
            }
          } catch (error) {
            console.error('Error fetching user role (non-fatal):', error);
          }
          
          // Add equipment manager to each created equipment
          for (const equipmentId of createdEquipmentIds) {
            const teamPositionData = {
              equipment_id: equipmentId,
              position_name: 'Equipment Manager',
              person_name: equipmentManagerName,
              email: equipmentManagerEmail,
              phone: equipmentManagerPhone,
              role: equipmentManagerRole, // Use determined role (editor for project managers)
              assigned_by: user?.id || null
            };
            
            // console.log('👥 Adding Equipment Manager to standalone equipment:', { equipmentId, data: teamPositionData });
            
            // 🔧 FIX: Use fastAPI.createStandaloneTeamPosition instead of direct fetch
            // This ensures proper JWT authentication for RLS policies
            try {
              const createdData = await fastAPI.createStandaloneTeamPosition(teamPositionData);
              // console.log('✅ Equipment Manager added to standalone equipment team:', equipmentManagerName, createdData);
            } catch (fetchError: any) {
              console.error('❌ Error creating standalone team position (non-fatal):', fetchError);
              teamErrors.push(`Failed to add Equipment Manager (${equipmentManagerName}): ${fetchError?.message || 'Unknown error'}`);
              // Don't throw - equipment was created successfully, team member addition failed
            }
            
            // 🆕 Determine actual role from user record (project_manager) vs stored role (editor)
            // The stored role in DB is 'editor' but actual role is 'project_manager'
            const actualRole = equipmentManagerContacts[equipmentManagerName]?.role === 'project_manager' 
              ? 'project_manager' 
              : equipmentManagerRole;
            
            // Try to fetch actual role from user record if email is available
            let finalRole = actualRole;
            if (equipmentManagerEmail) {
              try {
                const allMembers = await getFirmMembersOnce();
                const existingMember = allMembers.find((m: any) =>
                  m.email?.toLowerCase() === equipmentManagerEmail.toLowerCase()
                );
                if (existingMember) {
                  finalRole = existingMember.role || existingMember.access_level || actualRole;
                }
              } catch (error) {
                console.error('Error fetching user role (non-fatal):', error);
              }
            }
            
            const transformedMember = {
              id: teamPositionData.equipment_id + '-temp', // Temporary ID, will be updated on refresh
              name: equipmentManagerName,
              email: equipmentManagerEmail,
              phone: equipmentManagerPhone,
              position: 'Equipment Manager', // Position is dynamic
              role: finalRole, // Store actual role (project_manager) for display
              permissions: getPermissionsByRole(finalRole), // Get permissions based on actual role
              status: 'active',
              avatar: equipmentManagerName.split(' ').map((n: string) => n[0]).join('').toUpperCase(),
              lastActive: 'Unknown',
              equipmentAssignments: [equipmentId],
              dataAccess: getDataAccessByRole(finalRole), // Get data access based on actual role
              accessLevel: finalRole // Store actual role as access level
            };
            
            setAllEquipmentTeamMembers(prev => ({
              ...prev,
              [equipmentId]: [...(prev[equipmentId] || []), transformedMember]
            }));
          }
          
          // If we're viewing one of the newly created equipment, refresh team members for settings tab
          if (viewingEquipmentId && createdEquipmentIds.includes(viewingEquipmentId)) {
            try {
              // console.log('🔄 Refreshing team members for viewed equipment (settings tab)...');
              await fetchEquipmentTeamMembers();
            } catch (fetchError) {
              console.error('❌ Error fetching team members (non-fatal):', fetchError);
              // Don't throw - this is just a refresh
            }
          }
          
          // Notify parent component to refresh Settings tab (similar to project add form)
          if (onUserAdded) {
            try {
              onUserAdded();
            } catch (callbackError) {
              console.error('❌ Error in onUserAdded callback (non-fatal):', callbackError);
            }
          }
          }
        } catch (teamError: any) {
          console.error('❌ Error adding Equipment Manager to team (equipment still created):', teamError);
          teamErrors.push(`Failed to add Equipment Manager: ${teamError?.message || 'Unknown error'}`);
        }
      }

      // 🆕 Send email invitation to Equipment Manager (only for standalone equipment)
      // 🔧 FIX: Wrap in try-catch and add timeout to prevent hanging
      try {
        if (baseFormData.equipmentManager && baseFormData.equipmentManager.trim() !== '') {
          const equipmentManagerName = baseFormData.equipmentManager;
          const { email: equipmentManagerEmail } = await resolveEquipmentManagerEmail(equipmentManagerName);
          if (equipmentManagerEmail) {
            const firmMembers = await getFirmMembersOnce();
            const existingFirmMember = (firmMembers || []).find(
              (m: any) => m.email?.toLowerCase() === equipmentManagerEmail.toLowerCase()
            );
            const firmId = localStorage.getItem('firmId');
            const currentUserId = user?.id || localStorage.getItem('userId');
            const companyName = localStorage.getItem('companyName') || 'Your Company';
            const equipmentName = createdEquipmentIds.length > 0 ? `Equipment ${createdEquipmentIds[0]}` : (baseFormData.equipmentType || 'Standalone Equipment');
            // Skip invitation email/invite for existing firm members to avoid redundant requests.
            if (!existingFirmMember) {
              try {
                const emailPromise = sendProjectTeamEmailNotification({
                  project_name: equipmentName,
                  team_member_name: equipmentManagerName,
                  team_member_email: equipmentManagerEmail,
                  role: 'Equipment Manager',
                  company_name: companyName,
                  dashboard_url: getDashboardUrl('editor'),
                  equipment_name: equipmentName
                });
                const emailTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Email timeout')), 5000));
                await Promise.race([emailPromise, emailTimeout]).catch(() => ({ success: false, message: 'Timeout' }));
              } catch (emailError) {
                console.error('❌ Error sending email invitation (non-fatal):', emailError);
              }
              if (firmId) {
                try {
                  const invitePromise = fastAPI.createInvite({
                    email: equipmentManagerEmail,
                    full_name: equipmentManagerName,
                    role: 'project_manager',
                    firm_id: firmId,
                    project_id: null,
                    invited_by: currentUserId || 'system'
                  });
                  const inviteTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Invite timeout')), 5000));
                  await Promise.race([invitePromise, inviteTimeout]).catch((error) => {
                    if (error.message !== 'Invite timeout') throw error;
                    console.warn('⚠️ Invite creation timed out (non-fatal)');
                  });
                } catch (inviteError) {
                  console.error('❌ Error creating invite (equipment still created):', inviteError);
                }
              }
            }
          } else {
            console.warn('⚠️ Equipment Manager email not found (skipping notification). Use the email saved when the team member was first added.');
          }
        }
      } catch (emailInviteError) {
        console.error('❌ Error in email/invite operations (non-fatal):', emailInviteError);
      }
      
      // console.log('✅ All operations completed');
      
      // Refresh once after submit. Avoid per-equipment document fetches to prevent API burst.
      if (projectId === 'standalone' && createdEquipmentIds.length > 0) {
        try {
          await refreshEquipmentData(true, { skipDocuments: true });
        } catch (refreshErr) {
          console.warn('⚠️ Post-create refresh failed (non-fatal):', refreshErr);
        }
      }
      
      // Report any errors that occurred during document/team operations (non-blocking)
      if (uploadErrors.length > 0 || teamErrors.length > 0) {
        const allErrors = [...uploadErrors, ...teamErrors];
        console.warn('⚠️ Some operations completed with errors:', allErrors);
        
        // Show warning toast about partial success
        toast({
          title: 'Equipment Created with Warnings',
          description: `Equipment created successfully, but ${allErrors.length} operation(s) had issues. Check console for details.`,
          variant: 'default',
          duration: 5000
        });
      } else {
        // Show success toast
        toast({ 
          title: 'Success', 
          description: 'Standalone equipment added successfully!' 
        });
      }
      
      // Don't close the form here - let the form component handle closing after showing success
      // The form will close itself after displaying the success screen
      
      // Function completed successfully - form will handle closing
      return;
    } catch (error: any) {
      console.error('❌ Error creating standalone equipment:', error);
      console.error('❌ Error stack:', error?.stack);
      const errorMessage = error?.message || 'Failed to add equipment. Please try again.';
      
      // Close form even on error
      setShowAddEquipmentForm(false);
      
      if (errorMessage.includes('already exists') || errorMessage.includes('unique') || errorMessage.includes('Cannot create')) {
        toast({ 
          title: 'Validation Error', 
          description: errorMessage,
          variant: 'destructive',
          duration: 5000
        });
      } else {
        toast({ 
          title: 'Error', 
          description: errorMessage,
          variant: 'destructive' 
        });
      }
      
      // Re-throw error so form can catch it and stop "Creating..." state
      throw error;
    }
  };

  const handleAddEquipment = async (newEquipment: any) => {
    // // console.log('New equipment added:', newEquipment);

    try {
      // Note: Global uniqueness check is now handled in the API (fastAPI.createEquipment)
      // This ensures uniqueness across ALL projects, not just current project

      // Map field names - AddEquipmentForm uses serialNumber, mini form uses manufacturingSerial
      const tagNumber = newEquipment.tagNumber || '';
      const jobNumber = newEquipment.jobNumber || '';
      const manufacturingSerial = newEquipment.manufacturingSerial || newEquipment.serialNumber || '';

      // Check if this is standalone equipment
      const isStandalone = projectId === 'standalone';

      // Prepare equipment data for API call with proper field mapping
      const equipmentData: any = {
        type: newEquipment.type,
        tag_number: tagNumber,
        name: newEquipment.name,
        job_number: jobNumber,
        manufacturing_serial: manufacturingSerial,
        po_cdd: 'To be scheduled',
        // Standalone equipment should be 'active' when created, project equipment should be 'pending'
        status: isStandalone ? 'active' : 'pending',
        progress: 0,
        progress_phase: 'documentation',
        location: 'Not Assigned',
        supervisor: '',
        next_milestone: 'Initial Setup',
        priority: newEquipment.priority || 'medium',
        is_basic_info: true,
        welder: '',
        qc_inspector: '',
        project_manager: '',
        // Initialize progress images as empty array
        progress_images: [],
        // Technical specifications - store in dedicated columns
        size: newEquipment.size || '',
        material: newEquipment.material || '',
        design_code: newEquipment.designCode || '',
        // Store other technical specifications in custom_fields JSONB
        custom_fields: [
          { name: 'Dimensions', value: newEquipment.dimensions || '' },
          { name: 'Weight', value: newEquipment.weight || '' },
          { name: 'Pressure', value: newEquipment.pressure || '' },
          { name: 'Temperature', value: newEquipment.temperature || '' },
          { name: 'Capacity', value: newEquipment.capacity || '' },
          { name: 'Manufacturer', value: newEquipment.manufacturer || '' },
          { name: 'Model Number', value: newEquipment.modelNumber || '' },
          { name: 'Country of Origin', value: newEquipment.countryOfOrigin || '' }
        ]
      };

      // Only add project_id for non-standalone equipment
      if (!isStandalone) {
        equipmentData.project_id = projectId;
      }

      // Remove undefined values
      Object.keys(equipmentData).forEach(key => {
        if (equipmentData[key] === undefined) {
          delete equipmentData[key];
        }
      });

      // // console.log('🔧 Creating equipment with data:', equipmentData);
      // // console.log('🔍 Unique identifiers being validated:', {
      //   tag_number: tagNumber,
      //   job_number: jobNumber,
      //   manufacturing_serial: manufacturingSerial
      // });

      // Call appropriate API based on equipment type
      // Standalone equipment uses createStandaloneEquipment, project equipment uses createEquipment (pass firmId for limit check)
      const firmId = localStorage.getItem('firmId');
      const createdEquipment = isStandalone 
        ? await fastAPI.createStandaloneEquipment(equipmentData, firmId || undefined)
        : await fastAPI.createEquipment(equipmentData);
      // // console.log('✅ Equipment created successfully:', createdEquipment);

      // Merge created row into grid + cache instead of full refreshEquipmentData (avoids project-wide GET + per-equipment docs + progress-image batch).
      const rawRow = Array.isArray(createdEquipment) ? createdEquipment[0] : createdEquipment;
      let mergedIntoGrid = false;
      if (rawRow?.id) {
        try {
          const transformed = transformEquipmentDataCallback([rawRow]);
          let item = transformed[0];
          if (item) {
            item = expandProgressImagesForOnDemand([item])[0];
            setLocalEquipment((prev) => {
              if (prev.some((e) => e.id === item.id)) {
                return prev.map((e) => (e.id === item.id ? { ...e, ...item } : e));
              }
              return [...prev, item];
            });
            setCustomFields((prev) => ({ ...prev, [item.id]: item.customFields || [] }));
            setTechnicalSections((prev) => ({ ...prev, [item.id]: item.technicalSections || [] }));
            setTeamCustomFields((prev) => ({ ...prev, [item.id]: item.teamCustomFields || [] }));
            const ts = item.technicalSections;
            if (ts && ts.length > 0) {
              setSelectedSection((prev) => ({ ...prev, [item.id]: ts[0].name }));
            }
            // New row has no activities or production checklist yet; seed so lazy-load effects do not fire batch fetches for this id.
            setEquipmentActivities((prev) => ({ ...prev, [item.id]: [] }));
            setProductionChecklistByEquipment((prev) => ({ ...prev, [item.id]: [] }));
            const cacheKey =
              projectId === 'standalone'
                ? `${CACHE_KEYS.EQUIPMENT}_standalone`
                : `${CACHE_KEYS.EQUIPMENT}_${projectId}`;
            const cached = getCache<any[]>(cacheKey);
            if (cached !== null && Array.isArray(cached)) {
              const exists = cached.some((r: any) => r.id === rawRow.id);
              const nextCache = exists
                ? cached.map((r: any) => (r.id === rawRow.id ? { ...r, ...rawRow } : r))
                : [...cached, rawRow];
              setCache(cacheKey, nextCache, {
                ttl: 24 * 60 * 60 * 1000,
                maxSize: 4 * 1024 * 1024,
              });
            }
            mergedIntoGrid = true;
          }
        } catch (mergeErr) {
          console.warn('Incremental equipment merge failed, falling back to refresh:', mergeErr);
        }
      }
      if (!mergedIntoGrid) {
        await refreshEquipmentData(true, { skipDocuments: true });
      }

      setShowAddEquipmentForm(false);

      toast({ title: 'Success', description: `${newEquipment.type} ${newEquipment.tagNumber} added successfully!` });

    } catch (error: any) {
      console.error('❌ Error creating equipment:', error);
      
      // Don't close the form if there's an error - let user correct it
      // setShowAddEquipmentForm(false); // Removed - keep form open on error
      
      // Handle uniqueness validation errors with clear messages
      const errorMessage = error?.message || 'Failed to add equipment. Please try again.';
      
      if (errorMessage.includes('already exists') || errorMessage.includes('unique') || errorMessage.includes('Cannot create')) {
        toast({ 
          title: 'Validation Error', 
          description: errorMessage,
          variant: 'destructive',
          duration: 5000
        });
      } else {
        toast({ 
          title: 'Error', 
          description: errorMessage,
          variant: 'destructive' 
        });
      }
      
      // Re-throw error so calling function knows it failed
      throw error;
    }
  };

  const totalEquipment = localEquipment.length;

  // Categorize equipment based on completion level
  // Categorize equipment based on completion level (memoized to prevent infinite loops)
  const equipmentCategories = useMemo(() => {
    return localEquipment.map(equipment => {
      // Check if equipment has substantial data beyond basic info
      const hasPO = equipment.poCdd && equipment.poCdd !== 'To be scheduled';
      const hasTechnical = equipment.size || equipment.weight || equipment.designCode || equipment.material || equipment.workingPressure || equipment.designTemp;
      const hasTeam = equipment.supervisor || equipment.welder || equipment.qcInspector || equipment.projectManager;
      const hasProgress = equipment.images && equipment.images.length > 0;
      const hasDocuments = equipment.documents && equipment.documents.length > 0;

      // Complete: Has PO-CDD, technical specs, team assignments, and progress
      if (hasPO && hasTechnical && hasTeam && (hasProgress || hasDocuments)) {
        return 'complete';
      }

      // Partial: Has some data but not complete
      if (hasPO || hasTechnical || hasTeam || hasProgress || hasDocuments) {
        return 'partial';
      }

      // Basic: Only basic identification info
      return 'basic';
    });
  }, [localEquipment]);

  // Memoize equipment counts to avoid recalculating on every render
  const { completeEquipment, partialEquipment, basicInfoEquipment } = useMemo(() => ({
    completeEquipment: equipmentCategories.filter(cat => cat === 'complete').length,
    partialEquipment: equipmentCategories.filter(cat => cat === 'partial').length,
    basicInfoEquipment: equipmentCategories.filter(cat => cat === 'basic').length
  }), [equipmentCategories]);

  // Get the equipment being viewed
  const viewingEquipment = viewingEquipmentId ? localEquipment.find(eq => eq.id === viewingEquipmentId) : null;


  // Export equipment logs to Excel
  const exportEquipmentLogsToExcel = () => {
    const entries = equipmentProgressEntries || [];
    const equipmentData = entries.map((entry: any, index: number) => {
      const formatDate = (dateString: string) => {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
      };

      const getTimeAgo = (dateString: string) => {
        if (!dateString) return 'Unknown';
        const days = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
        if (days === 0) return 'Today';
        if (days === 1) return '1 day ago';
        return `${days} days ago`;
      };

      return {
        'Activity Type': entry.activity_type || 'Activity',
        'Equipment': entry.metadata?.tagNumber || entry.metadata?.tag_number || 'Unknown',
        'Description': entry.action_description || '',
        'Updated': formatDate(entry.created_at),
        'Time Ago': getTimeAgo(entry.created_at),
        'Updated By': entry.created_by_user?.full_name || entry.created_by || 'Unknown User'
      };
    });

    // Convert to CSV
    const headers = Object.keys(equipmentData[0] || {});
    const csvContent = [
      headers.join(','),
      ...equipmentData.map((row: any) => headers.map(header => `"${String(row[header] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Equipment_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Team member management functions
  const handleCloseAddMember = () => {
    setShowAddMember(false);
    setNewMember({ name: "", email: "", phone: "", position: "", department: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
    setSelectedExistingMemberEmail("");
    setIsExistingMemberMode(false);
    setAddMemberNewDepartmentInput('');
  };

  const handleExistingMemberSelect = async (email: string) => {
    if (email === "" || email === "new") {
      setIsExistingMemberMode(false);
      setSelectedExistingMemberEmail("");
      setNewMember({
        name: "",
        email: "",
        phone: "",
        position: "",
        department: "",
        role: "",
        permissions: [],
        equipmentAssignments: [],
        dataAccess: [],
        accessLevel: "viewer"
      });
    } else {
      const member = existingFirmMembers.find(m => m.email === email);
      if (member) {
        setIsExistingMemberMode(true);
        setSelectedExistingMemberEmail(email);
        const roleObj = roles.find(r => r.name === (member.role || member.access_level || 'viewer'));

        // Try to prefill department from firm member, then project member record.
        let prefillDepartment = (member.department || '').trim();
        if (!prefillDepartment && projectId && projectId !== 'standalone') {
          try {
            const projectMembers = await fastAPI.getProjectMembers(projectId);
            const projectMember = (Array.isArray(projectMembers) ? projectMembers : []).find(
              (m: any) => (m.email || '').toLowerCase() === email.toLowerCase()
            );
            prefillDepartment = (projectMember?.department || '').trim();
          } catch {
            // Keep fallback empty if lookup fails.
          }
        }

        setNewMember({
          name: member.name || "",
          email: member.email || "",
          phone: member.phone || "",
          position: "",
          department: prefillDepartment,
          role: mapRoleToDisplay(member.role || member.access_level || 'viewer'),
          permissions: roleObj ? roleObj.permissions : getPermissionsByRole(member.role || 'viewer'),
          equipmentAssignments: [viewingEquipmentId || ""].filter(Boolean),
          dataAccess: member.data_access || [],
          accessLevel: member.access_level || 'viewer'
        });
      }
    }
  };

  const addTeamMember = async () => {
    // console.log('addTeamMember called', { 
    //   newMember, 
    //   viewingEquipmentId,
    //   allFieldsValid: !!(newMember.name && newMember.email && newMember.position && newMember.role && viewingEquipmentId)
    // });
    
    if (!newMember.name || !newMember.email || !newMember.position || !newMember.role || !viewingEquipmentId) {
      console.error('Missing required fields:', {
        name: !!newMember.name,
        email: !!newMember.email,
        position: !!newMember.position,
        role: !!newMember.role,
        viewingEquipmentId: !!viewingEquipmentId
      });
      toast({ 
        title: 'Validation Error', 
        description: 'Please fill in all required fields.', 
        variant: 'destructive' 
      });
      return;
    }
    
    try {
        const role = roles.find(r => r.name === newMember.role);
        
        const roleMapping: Record<string, string> = {
          'Project Manager': 'project_manager', 
          'Documentation Manager': 'vdcr_manager', 
          'Editor': 'editor',
          'Viewer': 'viewer'
        };
        
        // 🆕 Check if this is an existing team member - preserve their role from user record
        let dbRole = roleMapping[newMember.role] || 'viewer';
        let actualUserRole = dbRole;
        
        try {
          const firmId = localStorage.getItem('firmId');
          if (firmId && newMember.email) {
            const allMembers = await fastAPI.getAllFirmTeamMembers(firmId);
            const existingMember = allMembers.find((m: any) => 
              m.email?.toLowerCase() === newMember.email.toLowerCase()
            );
            
            if (existingMember) {
              // 🆕 Preserve existing user's role from their user record
              actualUserRole = existingMember.role || existingMember.access_level || dbRole;
              // console.log('✅ Found existing member, preserving role:', actualUserRole);
            }
          }
        } catch (error) {
          console.error('Error checking existing member (non-fatal):', error);
          // Continue with selected role
        }
        
        // For standalone equipment, we'll create equipment team members
        // This assumes there's an equipment_members table or we use team_positions
        const memberData = {
          equipment_id: viewingEquipmentId,
          name: newMember.name,
          email: newMember.email,
          phone: newMember.phone || "",
          position: newMember.position,
          department: (newMember.department && newMember.department !== '__add_new__') ? newMember.department.trim() : null,
          role: actualUserRole, // Use actual role from user record
          status: "active",
          permissions: getPermissionsByRole(actualUserRole), // Get permissions based on actual role
          equipment_assignments: [viewingEquipmentId],
          data_access: getDataAccessByRole(actualUserRole), // Get data access based on actual role
          access_level: actualUserRole, // Use actual role
          avatar: newMember.name.split(' ').map(n => n[0]).join('').toUpperCase(),
          last_active: new Date().toISOString()
        };

        // 🚨 ONLY FOR STANDALONE EQUIPMENT - Do not touch project equipment!
        if (projectId === 'standalone') {
        // For standalone equipment, use standalone_equipment_team_positions table
          // 🆕 Map actual role to database role (table only accepts 'editor' or 'viewer')
          // But we'll store the actual role info separately if needed
          const dbStoredRole: 'editor' | 'viewer' = 
            (actualUserRole === 'project_manager' || actualUserRole === 'vdcr_manager' || actualUserRole === 'editor') 
              ? 'editor' 
              : 'viewer';
          
        const teamPositionData = {
          equipment_id: viewingEquipmentId,
            position_name: newMember.position, // Dynamic position (Equipment Manager, Supervisor, etc.)
          person_name: newMember.name,
          email: (newMember.email || '').trim().toLowerCase(), // 🔧 FIX: Normalize email when storing
          phone: newMember.phone || "",
          department: (newMember.department && newMember.department !== '__add_new__') ? newMember.department.trim() : null,
            role: dbStoredRole, // Store as editor/viewer for DB, but actual role is in user record
          assigned_by: user?.id || null // 🔧 FIX: Add assigned_by for RLS policy compliance
        };

        // console.log('📤 Creating standalone team position with data:', teamPositionData);
          // console.log('🔍 Equipment ID being used:', viewingEquipmentId);
          // console.log('🔍 Equipment ID type:', typeof viewingEquipmentId);
        const result = await fastAPI.createStandaloneTeamPosition(teamPositionData);
        // console.log('✅ Team position created successfully:', result);
        } else {
          // For project equipment, use the existing project team member logic (DO NOT MODIFY)
          // This section should remain untouched for projects
          // console.log('⏭️ Skipping standalone team position creation - this is project equipment');
        }
        
        // 🆕 Send email invitation only for NEW members (not when assigning existing firm member to equipment)
        if (projectId === 'standalone' && newMember.email && newMember.email.trim() && !isExistingMemberMode) {
          // Get company name and IDs from localStorage or user data
          const firmId = localStorage.getItem('firmId');
          const currentUserId = user?.id || localStorage.getItem('userId');
          const companyName = localStorage.getItem('companyName') || 'Your Company';
          
          // Get equipment name for email
          const equipmentName = viewingEquipment?.name || viewingEquipment?.type || 'Standalone Equipment';
          
          // 🆕 Create invite for the new team member FIRST (before sending email)
          try {
            // console.log('📧 Creating invite for standalone equipment team member...');
            await fastAPI.createInvite({
              email: newMember.email.trim(),
              full_name: newMember.name,
              role: dbRole,
              firm_id: firmId || '',
              project_id: null, // No project_id for standalone equipment
              invited_by: currentUserId || 'system'
            });
            // console.log('✅ Invite created for standalone equipment team member');
          } catch (inviteError) {
            console.error('❌ Error creating invite (member still created):', inviteError);
            // Don't fail the whole operation if invite creation fails
          }
          
          // Send email notification AFTER invite is created
          try {
            // console.log('📧 Sending email invitation to:', newMember.email.trim());
            const emailResult = await sendProjectTeamEmailNotification({
              project_name: equipmentName,
              team_member_name: newMember.name,
              team_member_email: newMember.email.trim(),
              role: newMember.role || dbRole,
              company_name: companyName,
              dashboard_url: getDashboardUrl(dbRole),
              equipment_name: equipmentName
            });
            
            if (emailResult.success) {
              // console.log('✅ Email invitation sent successfully');
            } else {
              // console.log('⚠️ Email invitation failed:', emailResult.message);
            }
          } catch (emailError) {
            console.error('❌ Error sending email invitation (non-fatal):', emailError);
            // Don't fail the whole operation if email fails
          }
        }
        
        // Small delay to ensure database is updated
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Log activity (only for standalone equipment)
        if (projectId === 'standalone' && viewingEquipmentId && viewingEquipment) {
          try {
            await logTeamMemberAdded(
              null, // No project_id for standalone
              viewingEquipmentId, // equipmentId as string, not array
              viewingEquipment.type || 'Equipment', // equipmentType
              viewingEquipment.tagNumber || 'Unknown', // tagNumber
              newMember.name, // memberName
              newMember.position || newMember.role || 'viewer' // role
            );
            // console.log('✅ Activity logged successfully');
          } catch (logError) {
            console.error('⚠️ Error logging activity (non-fatal):', logError);
            // Don't fail the whole operation if logging fails
          }
        }

        // Only refresh team members for standalone equipment
        if (projectId === 'standalone') {
          // Add a small delay to ensure database transaction is committed
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // console.log('🔄 Refreshing team members list...');
          await fetchEquipmentTeamMembers();
          // console.log('✅ Team members list refreshed');
          
          // Double-check: fetch again after a short delay to ensure we have the latest data
          setTimeout(async () => {
            // console.log('🔄 Second refresh of team members list...');
            await fetchEquipmentTeamMembers();
          }, 1000);
        }
        
        if (onActivityUpdate) {
          onActivityUpdate();
        }
        
        setNewMember({ name: "", email: "", phone: "", position: "", department: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
        setShowAddMember(false);
        setSelectedExistingMemberEmail("");
        setIsExistingMemberMode(false);
        
        // console.log('✅ Showing success toast');
        toast({ title: 'Success', description: 'Team member added successfully!' });
      } catch (error: any) {
        console.error('❌ Error adding team member:', error);
        console.error('❌ Error details:', {
          message: error?.message,
          response: error?.response?.data,
          status: error?.response?.status,
          stack: error?.stack
        });
        toast({ 
          title: 'Error', 
          description: error?.response?.data?.message || error?.message || 'Error adding team member. Please try again.', 
          variant: 'destructive' 
        });
      }
  };

  const editTeamMember = (member: any) => {
    setSelectedMember(member);
    
    const roleDisplayMapping: Record<string, string> = {
      'project_manager': 'Project Manager',
      'vdcr_manager': 'Documentation Manager', 
      'editor': 'Editor',
      'viewer': 'Viewer'
    };
    
    const displayRole = roleDisplayMapping[member.role] || 'Viewer';
    
    setNewMember({
      name: member.name || "",
      email: member.email || "",
      phone: member.phone || "",
      position: member.position || "",
      department: member.department || "",
      role: displayRole,
      permissions: member.permissions || [],
      equipmentAssignments: member.equipmentAssignments || member.equipment_assignments || [viewingEquipmentId || ""].filter(Boolean),
      dataAccess: member.dataAccess || member.data_access || [],
      accessLevel: member.accessLevel || member.access_level || "viewer"
    });
    
    setShowEditMember(true);
  };

  const updateTeamMember = async () => {
    // console.log('🔄 updateTeamMember called', { 
    //   selectedMember: selectedMember?.id, 
    //   newMember: { name: newMember.name, email: newMember.email, role: newMember.role },
    //   viewingEquipmentId,
    //   projectId
    // });
    
    if (!selectedMember) {
      console.error('❌ No selected member');
      toast({ title: 'Error', description: 'No member selected for editing.', variant: 'destructive' });
      return;
    }
    
    if (!newMember.name || !newMember.email || !newMember.role) {
      console.error('❌ Missing required fields:', { name: !!newMember.name, email: !!newMember.email, role: !!newMember.role });
      toast({ title: 'Error', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }
    
    if (!viewingEquipmentId) {
      console.error('❌ No viewing equipment ID');
      toast({ title: 'Error', description: 'Equipment ID is missing.', variant: 'destructive' });
      return;
    }
    
      try {
        const role = roles.find(r => r.name === newMember.role);
        
        const roleMapping: Record<string, string> = {
          'Project Manager': 'project_manager',
          'Documentation Manager': 'vdcr_manager', 
          'Editor': 'editor',
          'Viewer': 'viewer'
        };
        
        const dbRole = roleMapping[newMember.role] || 'viewer';
      // console.log('🔍 Role mapping:', { displayRole: newMember.role, dbRole });
      
      // For standalone equipment, update standalone_equipment_team_positions table
      if (projectId === 'standalone' && selectedMember.id) {
        const equipmentRole: 'editor' | 'viewer' = (dbRole === 'project_manager' || dbRole === 'vdcr_manager' || dbRole === 'editor') ? 'editor' : 'viewer';
        const teamPositionData = {
          position_name: newMember.position,
          person_name: newMember.name,
          email: newMember.email,
          phone: newMember.phone || "",
          department: (newMember.department && newMember.department !== '__add_new__') ? newMember.department.trim() : null,
          role: equipmentRole,
          updated_at: new Date().toISOString()
        };
        
        // console.log('📤 Updating standalone team position:', { id: selectedMember.id, data: teamPositionData });
        
        // Use fastAPI.updateStandaloneTeamPosition (uses api instance with JWT interceptor for RLS)
        const updatedData = await fastAPI.updateStandaloneTeamPosition(selectedMember.id, teamPositionData);
        // console.log('✅ Standalone team position updated successfully:', updatedData);
      } else {
        // For project equipment, use the existing update logic
        const memberData = {
          name: newMember.name,
          email: newMember.email,
          phone: newMember.phone || "",
          position: newMember.position || "",
          department: (newMember.department && newMember.department !== '__add_new__') ? newMember.department.trim() : null,
          role: dbRole,
          permissions: role ? role.permissions : selectedMember.permissions,
          equipment_assignments: newMember.equipmentAssignments || [viewingEquipmentId].filter(Boolean),
          data_access: newMember.dataAccess || selectedMember.dataAccess || [],
          access_level: newMember.accessLevel || selectedMember.accessLevel || "viewer",
          avatar: newMember.name.split(' ').map(n => n[0]).join('').toUpperCase(),
          updated_at: new Date().toISOString()
        };

        // Update in project_members table (existing logic)
        await fastAPI.updateProjectMember(selectedMember.id, memberData);
      }
      
      // console.log('🔄 Refreshing team members list after update...');
        await fetchEquipmentTeamMembers();
      // console.log('✅ Team members list refreshed');
        
      // console.log('🔄 Closing edit modal and resetting form...');
        setShowEditMember(false);
        setSelectedMember(null);
        setNewMember({ name: "", email: "", phone: "", position: "", department: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
        
      // console.log('✅ Showing success toast');
        toast({ title: 'Success', description: 'Team member updated successfully!' });
      } catch (error) {
      console.error('❌ Error updating team member:', error);
        toast({ title: 'Error', description: 'Error updating team member. Please try again.', variant: 'destructive' });
    }
  };

  const removeTeamMember = async (memberId: string) => {
    if (window.confirm("Are you sure you want to remove this team member?")) {
      try {
        // console.log('🗑️ Removing team member:', memberId);
        
        // For standalone equipment, delete from standalone_equipment_team_positions table
        if (projectId === 'standalone' && memberId) {
          // console.log('🗑️ Deleting from standalone_equipment_team_positions table');
          
          // 🔧 FIX: Use fastAPI.deleteStandaloneTeamPosition instead of direct fetch
          // This ensures proper JWT authentication for RLS policies
          await fastAPI.deleteStandaloneTeamPosition(memberId);
          // console.log('✅ Team member removed successfully');
        } else if (memberId) {
          // For project equipment, use the existing delete logic
          // console.log('🗑️ Deleting from project_members table');
          await fastAPI.deleteProjectMember(memberId);
        }
        
        // console.log('🔄 Refreshing team members list...');
        await fetchEquipmentTeamMembers();
        // console.log('✅ Team members list refreshed');
        
        toast({ title: 'Success', description: 'Team member removed successfully!' });
      } catch (error: any) {
        console.error('❌ Error removing team member:', error);
        const errorMessage = error?.message || 'Error removing team member. Please try again.';
        toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
      }
    }
  };

  // If viewing equipment details (standalone only), show details view
  if (viewingEquipmentId && viewingEquipment && projectId === 'standalone') {
  return (
    <>
      <div className="min-h-screen bg-gray-50 py-2 sm:py-8">
        <div className="container mx-auto px-1">
          {/* Header with Back Button */}
          <div className="mb-4 sm:mb-6">
            <Button
              onClick={() => setViewingEquipmentId(null)}
              variant="outline"
              className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-semibold text-gray-700 hover:text-white hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-600 border-2 border-gray-300 hover:border-blue-600 transition-all duration-300 rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              <ArrowLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
              Back to Equipment
            </Button>
          </div>

          {/* Main Overview Card - Common for All Tabs */}
          <div className="mb-4 sm:mb-6 bg-gradient-to-r from-blue-50 via-blue-100 to-blue-50 rounded-2xl p-4 sm:p-6 lg:p-8 border border-blue-100 shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4 sm:mb-6 space-y-4 lg:space-y-0">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
                  <Wrench size={20} className="text-white sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl sm:text-2xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent mb-1 sm:mb-2 break-words">
                    {viewingEquipment.type || viewingEquipment.name || 'Standalone Equipment'}
                  </h1>
                  <p className="text-sm sm:text-base lg:text-xl text-gray-600 font-medium break-words">
                    Team & Equipment Information
                  </p>
                </div>
              </div>
            </div>
            
            {/* Quick Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-blue-600 mb-1">Equipment Status</p>
                    <div className="flex items-center gap-2">
                      <div className="text-lg sm:text-xl lg:text-2xl font-bold text-blue-800 capitalize truncate">{viewingEquipment.status || 'Active'}</div>
                    </div>
                  </div>
                  <Target size={20} className="text-blue-500 flex-shrink-0 sm:w-6 sm:h-6" />
                </div>
              </div>
              
              <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-green-600 mb-1">Progress Phase</p>
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-green-800 capitalize">
                      {viewingEquipment.progressPhase || 'Not Started'}
                    </div>
                  </div>
                  <BarChart3 size={20} className="text-green-500 flex-shrink-0 sm:w-6 sm:h-6" />
                </div>
              </div>
              
              <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-blue-600 mb-1">Tag Number</p>
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-blue-800 truncate">{viewingEquipment.tagNumber || 'N/A'}</div>
                  </div>
                  <FileText size={20} className="text-blue-500 flex-shrink-0 sm:w-6 sm:h-6" />
                </div>
              </div>
              
              <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-orange-600 mb-1">Location</p>
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-orange-800 truncate">{viewingEquipment.location || 'TBD'}</div>
                  </div>
                  <MapPin size={20} className="text-orange-500 flex-shrink-0 sm:w-6 sm:h-6" />
                </div>
              </div>
            </div>
          </div>

          {/* Unified Tabbed Interface */}
          <Tabs value={equipmentDetailsTab} onValueChange={setEquipmentDetailsTab} className="w-full">
            <div className="overflow-x-auto overflow-y-hidden xl:overflow-x-visible xl:overflow-y-visible mb-16 scroll-smooth p-1">
              <TabsList className={`flex xl:grid min-w-max xl:w-full bg-transparent rounded-2xl p-2 ${(currentUserRole === 'vdcr_manager' || currentUserRole === 'editor' || currentUserRole === 'viewer') ? 'xl:grid-cols-2' : 'xl:grid-cols-3'} gap-2 flex-nowrap`}>
                <TabsTrigger 
                  value="equipment-details" 
                  className="flex items-center gap-3 px-4 py-4 text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-blue-600 data-[state=active]:hover:to-blue-700 flex-shrink-0"
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                    <Building size={20} className="text-blue-600 data-[state=active]:text-white" />
                  </div>
                  <span>Equipment Details</span>
                </TabsTrigger>
                
                <TabsTrigger 
                  value="equipment-logs" 
                  className="flex items-center gap-3 px-4 py-4 text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-blue-600 data-[state=active]:hover:to-blue-700 flex-shrink-0"
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                    <FileText size={20} className="text-blue-600 data-[state=active]:text-white" />
                  </div>
                  <span>Equipment Logs</span>
                </TabsTrigger>

                {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
                  <TabsTrigger 
                    value="settings" 
                    className="flex items-center gap-3 px-4 py-4 text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-gray-500 data-[state=active]:to-gray-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-gray-600 data-[state=active]:hover:to-gray-700 flex-shrink-0"
                  >
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                      <Settings size={20} className="text-gray-600 data-[state=active]:text-white" />
                    </div>
                    <span>Settings</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Equipment Details Tab */}
            <TabsContent value="equipment-details" className="space-y-6 mt-8">
              {/* Activities (from Excel) - Progress bar + Upload / Mark complete */}
              {viewingEquipmentId && (
              <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden p-3 sm:p-4">
                <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <BarChart3 size={20} className="text-indigo-600" />
                  Activities
                </h3>
                {loadingActivities[viewingEquipmentId] ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent"></div>
                  </div>
                ) : !(equipmentActivities[viewingEquipmentId]?.length) ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">Upload an Excel sheet with activities (Sr. No., Activity Name, Activity Type, Target). First row: Commencement Date.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={downloadActivitiesTemplate}>
                        <Download size={14} className="mr-1" />
                        Download sample template
                      </Button>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="text-sm"
                        id="activities-upload-details"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadActivitiesExcel(viewingEquipmentId, f);
                          e.target.value = '';
                        }}
                        disabled={!!uploadingActivitiesForEquipment}
                      />
                      {uploadingActivitiesForEquipment === viewingEquipmentId && (
                        <span className="text-sm text-indigo-600">Uploading...</span>
                      )}
                    </div>
                  </div>
                ) : (() => {
                  const list = equipmentActivities[viewingEquipmentId] || [];
                  const { completed: completedSeg, current, next } = getActivitiesProgressSegments(list);
                  const lastCompleted = completedSeg[0];
                  const total = list.length;
                  const doneCount = list.filter((a: any) => a.completion).length;
                  const hasCurrent = current && !current.completion;
                  const pct = total
                    ? (doneCount >= total ? 100 : hasCurrent ? Math.min(100, Math.round(((doneCount + 0.55) / total) * 100)) : Math.round((doneCount / total) * 100))
                    : 0;
                  return (
                  <div className="space-y-3 sm:space-y-4">
                    {/* Progress bar row: bar (left) + icon actions (top right) */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0 rounded-full h-3 sm:h-5 bg-gray-200 overflow-hidden shadow-inner">
                        <div className="h-full rounded-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-300" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 sm:h-8 sm:w-8" onClick={() => openEditActivitiesModal(viewingEquipmentId)} title="Edit activity">
                          <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 sm:h-8 sm:w-8" onClick={() => { setActivitiesHistoryEquipmentId(viewingEquipmentId); setActivitiesHistoryOpen(true); }} title="History">
                          <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
                        </Button>
                        <label htmlFor="activities-replace-details" className="cursor-pointer" title="Replace activities">
                          <span className="inline-flex items-center justify-center h-6 w-6 sm:h-8 sm:w-8 rounded-md hover:bg-gray-100 text-gray-600"><Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></span>
                        </label>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          className="hidden"
                          id="activities-replace-details"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUploadActivitiesExcel(viewingEquipmentId, f);
                            e.target.value = '';
                          }}
                          disabled={!!uploadingActivitiesForEquipment}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:gap-4 min-w-0">
                      <div className="min-w-0">
                        <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-gray-400 font-medium mb-0.5 sm:mb-1">Completed</p>
                        {lastCompleted ? (
                          <>
                            <p className="text-xs sm:text-sm text-gray-800 truncate" title={lastCompleted.activity_name}>{lastCompleted.activity_name}</p>
                            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">Completed on {lastCompleted.completion?.completed_on ? formatDateOnly(lastCompleted.completion.completed_on) : '—'}</p>
                          </>
                        ) : <p className="text-xs sm:text-sm text-gray-400">—</p>}
                      </div>
                      <div className="min-w-0 border-l border-gray-100 pl-2 sm:pl-4">
                        <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-indigo-500 font-medium mb-0.5 sm:mb-1">Current</p>
                        {current && !current.completion ? (
                          <>
                            <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate" title={current.activity_name}>{current.activity_name}</p>
                            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">Target completion: {current.target_date ? formatDateOnly(current.target_date) : (current.target_relative || '—')}</p>
                          </>
                        ) : current?.completion ? (
                          <>
                            <p className="text-xs sm:text-sm text-gray-800 truncate">{current.activity_name}</p>
                            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">Completed on {current.completion?.completed_on ? formatDateOnly(current.completion.completed_on) : '—'}</p>
                          </>
                        ) : <p className="text-xs sm:text-sm text-gray-400">All done</p>}
                      </div>
                      <div className="min-w-0 border-l border-gray-100 pl-2 sm:pl-4">
                        <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-gray-400 font-medium mb-0.5 sm:mb-1">Next</p>
                        {next ? (
                          <>
                            <p className="text-xs sm:text-sm text-gray-700 truncate" title={next.activity_name}>{next.activity_name}</p>
                            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">Target completion: {next.target_date ? formatDateOnly(next.target_date) : (next.target_relative || '—')}</p>
                          </>
                        ) : <p className="text-xs sm:text-sm text-gray-400">—</p>}
                      </div>
                    </div>
                    <div className="flex justify-start gap-1.5 sm:gap-2 flex-wrap">
                      <Button type="button" size="sm" variant="outline" className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3" onClick={() => exportActivitiesReport(viewingEquipmentId)}>
                        <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                        Export report
                      </Button>
                      {current && !current.completion && currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && (
                        <Button type="button" size="sm" variant="default" className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3" onClick={() => openMarkCompleteModal(current, viewingEquipmentId)}>
                          Mark complete
                        </Button>
                      )}
                    </div>
                  </div>
                  );
                })()}
              </div>
              )}

              <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-3 sm:px-4 py-3 sm:py-4 border-b border-blue-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-blue-800 flex items-center gap-2">
                      <Building size={24} className="text-blue-600" />
                      Equipment Information
                    </h2>
                    <p className="text-blue-600 text-sm mt-1">View and manage equipment details</p>
                  </div>
                  {/* Action Buttons - same row as Equipment Information header; compact on mobile */}
                  {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
                    <div className="flex flex-wrap items-center justify-end sm:justify-end gap-2 flex-shrink-0 w-full sm:w-auto">
                      <Button
                        onClick={() => { setEditingStandaloneEquipment(viewingEquipment); setShowAddEquipmentForm(true); }}
                        variant="outline"
                        className="flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 hover:text-blue-800 text-xs sm:text-sm min-w-0 flex-1 sm:flex-initial"
                      >
                        <Edit size={14} className="flex-shrink-0 sm:w-4 sm:h-4" />
                        <span>Edit</span>
                      </Button>
                      {viewingEquipment.status !== 'completed' && (
                        <Button
                          onClick={() => handleMarkComplete(viewingEquipment)}
                          variant="outline"
                          className="flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-green-50 hover:bg-green-100 border-green-200 text-green-700 hover:text-green-800 text-xs sm:text-sm min-w-0 flex-1 sm:flex-initial"
                        >
                          <Check size={14} className="flex-shrink-0 sm:w-4 sm:h-4" />
                          <span>Complete</span>
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDeleteEquipment(viewingEquipment)}
                        variant="outline"
                        className="flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-red-50 hover:bg-red-100 border-red-200 text-red-700 hover:text-red-800 text-xs sm:text-sm min-w-0 flex-1 sm:flex-initial"
                      >
                        <Trash2 size={14} className="flex-shrink-0 sm:w-4 sm:h-4" />
                        <span>Delete</span>
                      </Button>
                    </div>
                  )}
                </div>
                <div className="p-3 sm:p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                    {/* Left Column - Basic Information */}
                    <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Basic Information</h4>
                      <div className="space-y-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Equipment Type</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.type || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Tag Number</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.tagNumber || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Job Number</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.jobNumber || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Equipment Title</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.manufacturingSerial || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Location</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.location || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Consultant</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.consultant || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Consultant')?.value) || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">TPI Agency</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.tpiAgency || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'TPI Agency')?.value) || 'Not specified'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column - Technical Specifications */}
                    <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Technical Specifications</h4>
                      <div className="space-y-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Size</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.size || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Material</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.material || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Design Code</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.designCode || 'Not specified'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Client & Project Information */}
                  <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                    {/* Left Column - Client Information */}
                    <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Client Information</h4>
                      <div className="space-y-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Client Name</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.clientName || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Client Name')?.value) || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Client Industry</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.clientIndustry || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Client Industry')?.value) || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Client Focal Point</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.clientFocalPoint || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Client Focal Point')?.value) || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Plant Location</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.plantLocation || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Plant Location')?.value) || viewingEquipment.location || 'Not specified'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column - Project Details */}
                    <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Project Details</h4>
                      <div className="space-y-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">PO Number</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.poNumber || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'PO Number')?.value) || viewingEquipment.poCdd || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Sales Order Date</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">
                            {formatDateToDDMMYYYY(viewingEquipment.salesOrderDate || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Sales Order Date')?.value) || '')}
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Completion Date</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">
                            {formatDateToDDMMYYYY(viewingEquipment.completionDate || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Completion Date')?.value) || '')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Team & Management */}
                  <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                    {/* Left Column - Team Members */}
                    <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Team Members</h4>
                      <div className="space-y-0">
                        {(() => {
                          // Get team members: equipment_team_positions (project) or standalone_equipment_team_positions (standalone)
                          let displayMembers: any[] = [];
                          if (viewingEquipmentId) {
                            // Use teamMembers state if available (fetched when viewing), otherwise use allEquipmentTeamMembers cache (pre-fetched for grid)
                            displayMembers = teamMembers.length > 0 
                              ? teamMembers 
                              : (allEquipmentTeamMembers[viewingEquipmentId] || []);
                          }
                          // Fallback for project equipment: Equipment Manager from equipment data if no team positions
                          if (displayMembers.length === 0) {
                            const equipmentManager = viewingEquipment.equipmentManager || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Equipment Manager')?.value);
                            if (equipmentManager) {
                              displayMembers = [{ position: 'Equipment Manager', name: equipmentManager }];
                            }
                          }
                          
                          // If no team members found, show fallback
                          if (displayMembers.length === 0) {
                            const fallbackManager = viewingEquipment.equipmentManager || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Equipment Manager')?.value);
                            return (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Equipment Manager</span>
                                <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{fallbackManager || 'Not specified'}</span>
                        </div>
                            );
                          }
                          
                          // Display all team members
                          return displayMembers.map((member, index) => (
                            <div key={member.id || index} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 ${index < displayMembers.length - 1 ? 'border-b border-gray-100' : ''}`}>
                              <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">{member.position || member.position_name || 'Team Member'}</span>
                              <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{member.name || member.person_name || 'Not specified'}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    {/* Right Column - Status & Progress */}
                    <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Status & Progress</h4>
                      <div className="space-y-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Status</span>
                          <Badge className={`w-fit ${
                            viewingEquipment.status === 'on-track' ? 'bg-green-100 text-green-800 border-green-200' :
                            viewingEquipment.status === 'delayed' ? 'bg-red-100 text-red-800 border-red-200' :
                            viewingEquipment.status === 'completed' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                            'bg-gray-100 text-gray-800 border-gray-200'
                          }`}>
                            {viewingEquipment.status || 'Not specified'}
                          </Badge>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Progress Phase</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.progressPhase || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Next Milestone</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.nextMilestone || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">PO-CDD</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.poCdd || 'Not specified'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Scope of Work */}
                  <div className="mt-6 bg-gray-50 rounded-lg p-3 sm:p-4 border-0 shadow-sm">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center">
                      <Target size={18} className="sm:w-5 sm:h-5 mr-2 text-indigo-600" />
                      Equipment Specifications
                    </h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                      {/* Left Column - Services Included */}
                      <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-100">
                        <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Services Included</h4>
                        <div className="space-y-0">
                          {(() => {
                            const services = viewingEquipment.servicesIncluded || {};
                            const serviceList = typeof services === 'object' && !Array.isArray(services) 
                              ? Object.entries(services).filter(([_, included]: [string, any]) => included).map(([service]) => service)
                              : Array.isArray(services) ? services : [];
                            
                            return serviceList.length > 0 ? (
                              serviceList.map((service: string, index: number) => (
                                <div key={index} className="flex items-center py-2 sm:py-3 border-b border-gray-100 last:border-b-0">
                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full mr-2 sm:mr-3"></div>
                                  <span className="text-xs sm:text-sm text-gray-700 capitalize">{service}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-gray-500 text-xs sm:text-sm">No services specified</p>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Right Column - Scope Description */}
                      <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-100">
                        <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Scope Description</h4>
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border">
                          <p className="text-xs sm:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {viewingEquipment.scopeDescription || viewingEquipment.custom_fields?.find((f: any) => f.name === 'Scope Description')?.value || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Documents Uploaded */}
                  <div className="mt-6 bg-gray-50 rounded-lg p-3 sm:p-4 border-0 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 space-y-3 sm:space-y-0">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center">
                        <FileText size={18} className="sm:w-5 sm:h-5 mr-2 text-amber-600" />
                        Documents Uploaded
                      </h3>
                    </div>

                    <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm border border-gray-100">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                        {/* Left Column - Core Documents */}
                        <div className="space-y-3 sm:space-y-4">
                          <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Core Documents</h4>

                          {/* Unpriced PO File - list each doc separately */}
                          <div className="p-3 sm:p-4 rounded-lg border border-emerald-200 bg-emerald-25">
                            <h5 className="font-medium text-gray-800 text-sm sm:text-base mb-2">Unpriced PO File</h5>
                            {(filterDocsByUserDepartmentAccess(documents[viewingEquipmentId] || []).filter((doc: any) => doc.document_type === 'Unpriced PO File') || []).length > 0 ? (
                              <div className="space-y-2">
                                {(filterDocsByUserDepartmentAccess(documents[viewingEquipmentId] || []).filter((doc: any) => doc.document_type === 'Unpriced PO File') || []).map((doc: any, index: number) => (
                                  <div key={doc.id || `unpriced-${index}`} className="flex items-center justify-between p-2 bg-white rounded border border-emerald-100 gap-2">
                                    <span className="text-emerald-700 truncate flex-1 min-w-0 text-xs sm:text-sm">{doc.document_name || doc.name}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() => handleDocumentPreviewClick(doc, viewingEquipmentId!)}
                                        className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 px-2 py-1 rounded text-xs sm:text-sm transition-colors flex items-center gap-1"
                                      >
                                        <Eye className="w-3.5 h-3.5" /> View
                                      </button>
                                      {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
                                        <button
                                          onClick={() => handleDeleteDocument(viewingEquipmentId!, doc.id)}
                                          className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                                          title="Delete document"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs sm:text-sm text-gray-500">No files uploaded</p>
                            )}
                          </div>

                          {/* Design Inputs PID - list each doc separately */}
                          <div className="p-3 sm:p-4 rounded-lg border border-emerald-200 bg-emerald-25">
                            <h5 className="font-medium text-gray-800 text-sm sm:text-base mb-2">Design Inputs PID</h5>
                            {(filterDocsByUserDepartmentAccess(documents[viewingEquipmentId] || []).filter((doc: any) => doc.document_type === 'Design Inputs PID') || []).length > 0 ? (
                              <div className="space-y-2">
                                {(filterDocsByUserDepartmentAccess(documents[viewingEquipmentId] || []).filter((doc: any) => doc.document_type === 'Design Inputs PID') || []).map((doc: any, index: number) => (
                                  <div key={doc.id || `design-${index}`} className="flex items-center justify-between p-2 bg-white rounded border border-emerald-100 gap-2">
                                    <span className="text-emerald-700 truncate flex-1 min-w-0 text-xs sm:text-sm">{doc.document_name || doc.name}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() => handleDocumentPreviewClick(doc, viewingEquipmentId!)}
                                        className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 px-2 py-1 rounded text-xs sm:text-sm transition-colors flex items-center gap-1"
                                      >
                                        <Eye className="w-3.5 h-3.5" /> View
                                      </button>
                                      {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
                                        <button
                                          onClick={() => handleDeleteDocument(viewingEquipmentId!, doc.id)}
                                          className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                                          title="Delete document"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs sm:text-sm text-gray-500">No file uploaded</p>
                            )}
                          </div>
                        </div>

                        {/* Right Column - Additional Documents */}
                        <div className="space-y-3 sm:space-y-4">
                          <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Additional Documents</h4>

                          {/* Client Reference Doc - list each doc separately */}
                          <div className="p-3 sm:p-4 rounded-lg border border-emerald-200 bg-emerald-25">
                            <h5 className="font-medium text-gray-800 text-sm sm:text-base mb-2">Client Reference Doc</h5>
                            {(filterDocsByUserDepartmentAccess(documents[viewingEquipmentId] || []).filter((doc: any) => doc.document_type === 'Client Reference Doc') || []).length > 0 ? (
                              <div className="space-y-2">
                                {(filterDocsByUserDepartmentAccess(documents[viewingEquipmentId] || []).filter((doc: any) => doc.document_type === 'Client Reference Doc') || []).map((doc: any, index: number) => (
                                  <div key={doc.id || `client-${index}`} className="flex items-center justify-between p-2 bg-white rounded border border-emerald-100 gap-2">
                                    <span className="text-emerald-700 truncate flex-1 min-w-0 text-xs sm:text-sm">{doc.document_name || doc.name}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() => handleDocumentPreviewClick(doc, viewingEquipmentId!)}
                                        className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 px-2 py-1 rounded text-xs sm:text-sm transition-colors flex items-center gap-1"
                                      >
                                        <Eye className="w-3.5 h-3.5" /> View
                                      </button>
                                      {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
                                        <button
                                          onClick={() => handleDeleteDocument(viewingEquipmentId!, doc.id)}
                                          className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                                          title="Delete document"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs sm:text-sm text-gray-500">No file uploaded</p>
                            )}
                          </div>

                          {/* Other Documents - list each doc separately */}
                          <div className="p-3 sm:p-4 rounded-lg border border-emerald-200 bg-emerald-25">
                            <h5 className="font-medium text-gray-800 text-sm sm:text-base mb-2">Other Documents</h5>
                            {(filterDocsByUserDepartmentAccess(documents[viewingEquipmentId] || []).filter((doc: any) => doc.document_type === 'Other Documents') || []).length > 0 ? (
                              <div className="space-y-2">
                                {(filterDocsByUserDepartmentAccess(documents[viewingEquipmentId] || []).filter((doc: any) => doc.document_type === 'Other Documents') || []).map((doc: any, index: number) => (
                                  <div key={doc.id || `other-${index}`} className="flex items-center justify-between p-2 bg-white rounded border border-emerald-100 gap-2">
                                    <span className="text-emerald-700 truncate flex-1 min-w-0 text-xs sm:text-sm">{doc.document_name || doc.name}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <button
                                        onClick={() => handleDocumentPreviewClick(doc, viewingEquipmentId!)}
                                        className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 px-2 py-1 rounded text-xs sm:text-sm transition-colors flex items-center gap-1"
                                      >
                                        <Eye className="w-3.5 h-3.5" /> View
                                      </button>
                                      {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
                                        <button
                                          onClick={() => handleDeleteDocument(viewingEquipmentId!, doc.id)}
                                          className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                                          title="Delete document"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs sm:text-sm text-gray-500">No files uploaded</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes & Additional Information */}
                  <div className="mt-6 bg-white rounded-lg p-3 sm:p-4">
                    <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-800 mb-3 sm:mb-4 flex items-center">
                      <FileText size={16} className="sm:w-4 sm:h-4 lg:w-5 lg:h-5 mr-2 text-teal-600 flex-shrink-0" />
                      <span className="whitespace-nowrap">Notes & Additional Information</span>
                    </h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                      {/* Left Column - Kickoff Meeting Notes */}
                      <div className="space-y-3 sm:space-y-4">
                        <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Kickoff Meeting Notes</h4>
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border">
                          <p className="text-xs sm:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {viewingEquipment.kickoffMeetingNotes || viewingEquipment.custom_fields?.find((f: any) => f.name === 'Kickoff Meeting Notes')?.value || '-'}
                          </p>
                        </div>
                      </div>

                      {/* Right Column - Special Production Notes */}
                      <div className="space-y-3 sm:space-y-4">
                        <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Special Production Notes</h4>
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border">
                          <p className="text-xs sm:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {viewingEquipment.specialProductionNotes || viewingEquipment.custom_fields?.find((f: any) => f.name === 'Special Production Notes')?.value || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Equipment Logs Tab */}
            <TabsContent value="equipment-logs" className="space-y-4 sm:space-y-6 mt-6 sm:mt-8">
              <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-3 sm:px-4 py-3 sm:py-4 border-b border-blue-200">
                  <h2 className="text-lg sm:text-xl font-semibold text-blue-800 flex items-center gap-2">
                    <TrendingUp size={20} className="text-blue-600 sm:w-6 sm:h-6" />
                    Equipment Logs
                  </h2>
                  <p className="text-blue-600 text-xs sm:text-sm mt-1">Track equipment progress updates and milestones</p>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="space-y-4 sm:space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h3 className="text-base sm:text-xl font-semibold text-gray-800 flex items-center gap-2">
                        <Building size={18} className="text-blue-600 sm:w-5 sm:h-5" />
                        Equipment Activity Log
                      </h3>
                      <Button
                        onClick={exportEquipmentLogsToExcel}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1 sm:gap-2 bg-white hover:bg-blue-50 border-blue-200 text-blue-700 hover:text-blue-800 hover:border-blue-300 transition-all duration-200 text-xs sm:text-sm px-3"
                      >
                        <Download size={14} className="sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Export to Excel</span>
                        <span className="sm:hidden">Export</span>
                      </Button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search equipment logs by unit, status, or user..."
                        value={equipmentSearchQuery}
                        onChange={(e) => setEquipmentSearchQuery(e.target.value)}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pl-9 sm:pl-10 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      />
                      <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      {equipmentSearchQuery && (
                        <button
                          onClick={() => setEquipmentSearchQuery("")}
                          className="absolute inset-y-0 right-0 pr-2.5 sm:pr-3 flex items-center"
                        >
                          <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    
                    {/* Equipment Logs List - Fixed height container */}
                    <div className="h-96">
                      {/* Filtered Equipment Logs */}
                      {(() => {
                        // Helper function to format date
                        const formatDate = (dateString: string) => {
                          if (!dateString) return 'Unknown';
                          const date = new Date(dateString);
                          return date.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          });
                        };

                        // Helper function to calculate time ago
                        const getTimeAgo = (dateString: string) => {
                          if (!dateString) return 'Unknown';
                          const days = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
                          if (days === 0) return 'Today';
                          if (days === 1) return '1 day ago';
                          return `${days} days ago`;
                        };

                        // Helper function to format values properly (handle objects, arrays, null, etc.)
                        const formatValue = (value: any, fieldName?: string): string => {
                          // Handle null/undefined
                          if (value === null || value === undefined || value === '') {
                            return 'Not set';
                          }
                          
                          // Handle progress field - add % if it's a number or numeric string
                          if (fieldName?.toLowerCase().includes('progress')) {
                            const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                            if (!isNaN(numValue) && isFinite(numValue)) {
                              return `${numValue}%`;
                            }
                          }
                          
                          // Handle arrays
                          if (Array.isArray(value)) {
                            if (value.length === 0) return 'Empty';
                            // For technical sections array, show summary
                            if (fieldName?.toLowerCase().includes('technical') && value.length > 0) {
                              const sectionNames = value.map((s: any) => s?.name || s?.section_name || 'Unnamed').filter(Boolean);
                              if (sectionNames.length > 0) {
                                return `${value.length} section${value.length > 1 ? 's' : ''} (${sectionNames.slice(0, 3).join(', ')}${sectionNames.length > 3 ? '...' : ''})`;
                              }
                            }
                            // For other arrays, show count or first few items
                            if (value.length <= 3) {
                              return value.map((v: any) => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
                            }
                            return `${value.length} items`;
                          }
                          
                          // Handle objects
                          if (typeof value === 'object') {
                            // For technical sections object/array, try to extract meaningful info
                            if (fieldName?.toLowerCase().includes('technical')) {
                              try {
                                // If it's an array of sections
                                if (Array.isArray(value)) {
                                  const sections = value.filter(Boolean);
                                  if (sections.length > 0) {
                                    const names = sections.map((s: any) => s?.name || s?.section_name || 'Section').slice(0, 3);
                                    return `${sections.length} section${sections.length > 1 ? 's' : ''}: ${names.join(', ')}${sections.length > 3 ? '...' : ''}`;
                                  }
                                }
                                // If it's a single section object
                                if (value.name || value.section_name) {
                                  return `Section: ${value.name || value.section_name}`;
                                }
                              } catch (e) {
                                // Fall through to JSON stringify
                              }
                            }
                            
                            // For custom fields, show field count
                            if (fieldName?.toLowerCase().includes('custom') && Array.isArray(value)) {
                              return `${value.length} field${value.length !== 1 ? 's' : ''}`;
                            }
                            
                            // Try to stringify objects meaningfully
                            try {
                              const str = JSON.stringify(value);
                              // If too long, truncate
                              if (str.length > 100) {
                                return str.substring(0, 100) + '...';
                              }
                              return str;
                            } catch (e) {
                              return 'Object';
                            }
                          }
                          
                          // Handle boolean
                          if (typeof value === 'boolean') {
                            return value ? 'Yes' : 'No';
                          }
                          
                          // Default: convert to string
                          const str = String(value);
                          
                          // Handle empty strings
                          if (str.trim() === '') {
                            return 'Not set';
                          }
                          
                          return str;
                        };

                        // Helper function to parse changes from metadata or action description
                        const parseChanges = (log: any) => {
                          const changes: Array<{ field: string; old: string; new: string }> = [];
                          
                          // Special handling for technical_sections
                          if (log.metadata?.changes?.technical_sections) {
                            const techChange = log.metadata.changes.technical_sections;
                            if (techChange && typeof techChange === 'object' && ('old' in techChange || 'new' in techChange)) {
                              // Parse technical sections to show what actually changed
                              const oldSections = techChange.old;
                              const newSections = techChange.new;
                              
                              if (Array.isArray(oldSections) && Array.isArray(newSections)) {
                                const oldNames = oldSections.map((s: any) => s?.name || s?.section_name).filter(Boolean);
                                const newNames = newSections.map((s: any) => s?.name || s?.section_name).filter(Boolean);
                                
                                if (JSON.stringify(oldNames.sort()) !== JSON.stringify(newNames.sort())) {
                                  changes.push({
                                    field: 'Technical Sections',
                                    old: formatValue(oldSections, 'technical_sections'),
                                    new: formatValue(newSections, 'technical_sections')
                                  });
                                } else {
                                  // Same sections, but might have field changes - check individual section fields
                                  newSections.forEach((newSec: any, idx: number) => {
                                    const oldSec = oldSections.find((s: any) => 
                                      (s?.name || s?.section_name) === (newSec?.name || newSec?.section_name)
                                    );
                                    
                                    if (oldSec && newSec.customFields) {
                                      const sectionName = newSec.name || newSec.section_name || `Section ${idx + 1}`;
                                      
                                      // Check for field changes in this section
                                      const oldFields = oldSec.customFields || [];
                                      const newFields = newSec.customFields || [];
                                      
                                      oldFields.forEach((oldField: any) => {
                                        const newField = newFields.find((f: any) => f.name === oldField.name);
                                        if (newField && newField.value !== oldField.value) {
                                          changes.push({
                                            field: `${sectionName} - ${oldField.name}`,
                                            old: formatValue(oldField.value),
                                            new: formatValue(newField.value)
                                          });
                                        }
                                      });
                                      
                                      // Check for new fields
                                      newFields.forEach((newField: any) => {
                                        if (!oldFields.find((f: any) => f.name === newField.name)) {
                                          changes.push({
                                            field: `${sectionName} - ${newField.name}`,
                                            old: 'Not set',
                                            new: formatValue(newField.value)
                                          });
                                        }
                                      });
                                    }
                                  });
                                }
                              } else {
                                changes.push({
                                  field: 'Technical Sections',
                                  old: formatValue(oldSections, 'technical_sections'),
                                  new: formatValue(newSections, 'technical_sections')
                                });
                              }
                            }
                          }
                          
                          // Try to get other changes from metadata (excluding technical_sections which we handled above)
                          if (log.metadata?.changes && typeof log.metadata.changes === 'object') {
                            Object.entries(log.metadata.changes).forEach(([field, change]: [string, any]) => {
                              // Skip technical_sections as we already handled it
                              if (field === 'technical_sections') return;
                              
                              if (change && typeof change === 'object' && ('old' in change || 'new' in change)) {
                                const formattedOld = formatValue(change.old, field);
                                const formattedNew = formatValue(change.new, field);
                                
                                // Skip futile changes: "Not set" → "Not set" or identical values
                                if (formattedOld === formattedNew) return;
                                if (formattedOld === 'Not set' && formattedNew === 'Not set') return;
                                if (formattedOld === 'Not-set' && formattedNew === 'Not-set') return;
                                
                                // Normalize both values to check if they're effectively the same (empty/not assigned)
                                const normalizeForEmpty = (val: string): string => {
                                  const lower = val.toLowerCase().trim();
                                  if (lower === 'not set' || lower === 'not-set' || lower === 'not assigned' || 
                                      lower === 'null' || lower === 'undefined' || lower === '') {
                                    return 'empty';
                                  }
                                  return lower;
                                };
                                
                                const oldNormalized = normalizeForEmpty(formattedOld);
                                const newNormalized = normalizeForEmpty(formattedNew);
                                
                                // Skip if both are effectively empty/not assigned
                                if (oldNormalized === 'empty' && newNormalized === 'empty') {
                                  return;
                                }
                                
                                const formattedField = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                changes.push({
                                  field: formattedField,
                                  old: formattedOld,
                                  new: formattedNew
                                });
                              }
                            });
                          }
                          
                          // Fallback to old_value and new_value if available
                          if (changes.length === 0 && (log.old_value !== undefined || log.new_value !== undefined)) {
                            const formattedOld = formatValue(log.old_value, log.field_name);
                            const formattedNew = formatValue(log.new_value, log.field_name);
                            
                            // Skip futile changes here too
                            if (formattedOld !== formattedNew && 
                                !(formattedOld === 'Not set' && formattedNew === 'Not set') &&
                                !(formattedOld === 'Not-set' && formattedNew === 'Not-set')) {
                              changes.push({
                                field: log.field_name ? log.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Field',
                                old: formattedOld,
                                new: formattedNew
                              });
                            }
                          }
                          
                          // Final filter: remove any remaining futile entries
                          return changes.filter(change => {
                            const oldNorm = String(change.old).trim().toLowerCase();
                            const newNorm = String(change.new).trim().toLowerCase();
                            
                            // Skip if identical
                            if (oldNorm === newNorm) return false;
                            
                            // Skip if both are "not set"/"not assigned" variations (equivalent empty states)
                            const emptyVariants = ['not set', 'not-set', 'not assigned', 'null', 'undefined', ''];
                            if (emptyVariants.includes(oldNorm) && emptyVariants.includes(newNorm)) return false;
                            
                            return true;
                          });
                        };

                        // Helper function to get activity type badge info
                        const getActivityTypeInfo = (activityType: string) => {
                          const types: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: any }> = {
                            'equipment_created': { label: 'Created', color: 'text-green-800', bgColor: 'bg-green-100', borderColor: 'border-green-200', icon: Building },
                            'equipment_updated': { label: 'Updated', color: 'text-blue-800', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: Wrench },
                            'equipment_deleted': { label: 'Deleted', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-200', icon: AlertTriangle },
                            'progress_image_uploaded': { label: 'Progress Image', color: 'text-blue-800', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: Image },
                            'technical_specs_updated': { label: 'Technical Specs', color: 'text-orange-800', bgColor: 'bg-orange-100', borderColor: 'border-orange-200', icon: Wrench },
                            'technical_section_added': { label: 'Tech Section Added', color: 'text-orange-800', bgColor: 'bg-orange-100', borderColor: 'border-orange-200', icon: Wrench },
                            'document_uploaded': { label: 'Document Added', color: 'text-indigo-800', bgColor: 'bg-indigo-100', borderColor: 'border-indigo-200', icon: FileCheck },
                            'document_updated': { label: 'Document Updated', color: 'text-indigo-800', bgColor: 'bg-indigo-100', borderColor: 'border-indigo-200', icon: FileCheck },
                            'team_member_added': { label: 'Team Member', color: 'text-teal-800', bgColor: 'bg-teal-100', borderColor: 'border-teal-200', icon: UserPlus },
                            'team_member_removed': { label: 'Team Member', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-200', icon: UserPlus },
                            'progress_updated': { label: 'Progress', color: 'text-blue-800', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: TrendingUp }
                          };
                          
                          return types[activityType] || { 
                            label: 'Activity', 
                            color: 'text-gray-800', 
                            bgColor: 'bg-gray-100', 
                            borderColor: 'border-gray-200', 
                            icon: FileText 
                          };
                        };

                        // Use real equipment activity logs from equipment_activity_logs table
                        const entries = equipmentProgressEntries || [];
                        const equipmentLogs = entries.map((log: any, index: number) => {
                          const changes = parseChanges(log);
                          const activityInfo = getActivityTypeInfo(log.activity_type || '');
                          // For batch entries, show simplified count; otherwise single tag number
                          let tagNumber = 'Unknown';
                          if (log.metadata?.isBatch && log.metadata?.equipmentList) {
                            // Just show count in header - detailed list shown below
                            const count = log.metadata.equipmentCount || log.metadata.equipmentList.length || 0;
                            tagNumber = `${count} equipment`;
                          } else {
                            tagNumber = log.metadata?.tagNumber || log.metadata?.tag_number || viewingEquipment?.tagNumber || 'Unknown';
                          }
                          const equipmentType = log.metadata?.equipmentType || log.metadata?.equipment_type || viewingEquipment?.type || 'Equipment';
                          
                          return {
                            id: log.id || index + 1,
                            activityType: log.activity_type,
                            activityInfo,
                            equipmentType,
                            tagNumber,
                            changes,
                            description: log.action_description || '',
                            metadata: log.metadata || {},
                            updated: formatDate(log.created_at),
                            timeAgo: getTimeAgo(log.created_at),
                            updatedBy: log.created_by_user?.full_name || log.created_by || 'Unknown User',
                            oldValue: log.old_value,
                            newValue: log.new_value,
                            fieldName: log.field_name
                          };
                        });

                        const filteredLogs = equipmentSearchQuery
                          ? equipmentLogs.filter(log =>
                              log.equipmentType.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                              log.tagNumber.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                              log.activityInfo.label.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                              log.updatedBy.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                              log.description.toLowerCase().includes(equipmentSearchQuery.toLowerCase())
                            )
                          : equipmentLogs;

                        if (isLoadingEquipmentLogs) {
                          return (
                            <div className="h-full flex items-center justify-center text-gray-500">
                              <div className="text-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                              <p>Loading equipment logs...</p>
                              </div>
                            </div>
                          );
                        }

                        if (filteredLogs.length === 0) {
                          return (
                            <div className="h-full flex items-center justify-center text-gray-500">
                              <div className="text-center">
                              <Building size={32} className="mx-auto mb-2 text-gray-300" />
                              <p>No equipment logs match the search criteria.</p>
                              <p className="text-sm text-gray-400 mt-1">Try adjusting your search terms.</p>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="h-full overflow-y-auto space-y-3 pr-1.5 sm:pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                            {filteredLogs.map((log) => {
                              const ActivityIcon = log.activityInfo.icon;
                              
                              return (
                                <div key={log.id} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all p-3 sm:p-4">
                                  {/* Header: Equipment Tag + Activity Type Badge */}
                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-3">
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                      <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-[10px] sm:text-xs md:text-sm font-semibold rounded-lg shadow-sm whitespace-nowrap flex-shrink-0">
                                        <Building size={12} className="sm:w-[14px] sm:h-[14px] flex-shrink-0" />
                                        <span className="truncate max-w-[80px] sm:max-w-none">{log.tagNumber}</span>
                                      </span>
                                      {!log.metadata?.isBatch && log.equipmentType !== 'Equipment' && (
                                        <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate">({log.equipmentType})</span>
                                      )}
                                    </div>
                                    <span className={`inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold rounded-full border w-fit ${log.activityInfo.bgColor} ${log.activityInfo.color} ${log.activityInfo.borderColor}`}>
                                      <ActivityIcon size={10} className="sm:w-3 sm:h-3 flex-shrink-0" />
                                      <span className="whitespace-nowrap">{log.activityInfo.label}</span>
                                    </span>
                                  </div>

                                  {/* Activity-Specific Content */}
                                  <div className="space-y-2 mb-3">
                                    {/* Equipment Updates - Show Changes */}
                                    {(log.activityType === 'equipment_updated' || log.changes.length > 0) && log.changes.length > 0 && (
                                      <div className="space-y-1.5">
                                        {log.changes
                                          .filter(change => {
                                            // Filter out progress percentage changes if progress_phase is also changing
                                            // (progress is automatically set based on phase, so it's redundant)
                                            if (change.field.toLowerCase() === 'progress' || change.field.toLowerCase() === 'progress %') {
                                              const hasPhaseChange = log.changes.some(c => 
                                                c.field.toLowerCase() === 'progress phase' || 
                                                c.field.toLowerCase() === 'progress_phase'
                                              );
                                              if (hasPhaseChange) {
                                                return false; // Hide progress % when phase is changing
                                              }
                                            }
                                            return true;
                                          })
                                          .map((change, idx) => (
                                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm">
                                              <span className="font-medium text-gray-700 flex-shrink-0">{change.field}:</span>
                                              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                                                <span className="px-1.5 sm:px-2 py-0.5 bg-red-50 text-red-700 rounded border border-red-200 line-through text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.old}</span>
                                                <ArrowRight size={10} className="sm:w-3 sm:h-3 text-gray-400 flex-shrink-0" />
                                                <span className="px-1.5 sm:px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-medium text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.new}</span>
                                              </div>
                                            </div>
                                          ))}
                                      </div>
                                    )}

                                    {/* Progress Image Added */}
                                    {log.activityType === 'progress_image_uploaded' && (
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-700 flex-wrap">
                                        <Image size={12} className="sm:w-[14px] sm:h-[14px] text-blue-600 flex-shrink-0" />
                                        <span className="flex-shrink-0">New progress image added</span>
                                        {log.metadata?.imageDescription && (
                                          <span className="text-gray-500 truncate">- {log.metadata.imageDescription}</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Technical Specs Updates */}
                                    {(log.activityType === 'technical_specs_updated' || log.activityType === 'technical_section_added') && (
                                      <div className="space-y-1.5">
                                        {log.metadata?.sectionName && (
                                          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm mb-2 flex-wrap">
                                            <Wrench size={12} className="sm:w-[14px] sm:h-[14px] text-orange-600 flex-shrink-0" />
                                            <span className="font-medium text-gray-700">Section: <span className="text-gray-900 truncate">{log.metadata.sectionName}</span></span>
                                          </div>
                                        )}
                                        {log.changes.length > 0 ? (
                                          <div className={log.metadata?.sectionName ? "ml-0 sm:ml-5 space-y-1.5" : "space-y-1.5"}>
                                            {log.changes.map((change, idx) => (
                                              <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm">
                                                <span className="font-medium text-gray-700 flex-shrink-0">{change.field}:</span>
                                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                                                  <span className="px-1.5 sm:px-2 py-0.5 bg-red-50 text-red-700 rounded border border-red-200 line-through text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.old}</span>
                                                  <ArrowRight size={10} className="sm:w-3 sm:h-3 text-gray-400 flex-shrink-0" />
                                                  <span className="px-1.5 sm:px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-medium text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.new}</span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-xs text-gray-600">Technical sections updated</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Document Added/Updated */}
                                    {(log.activityType === 'document_uploaded' || log.activityType === 'document_updated') && (
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-700 flex-wrap">
                                        <FileCheck size={12} className="sm:w-[14px] sm:h-[14px] text-indigo-600 flex-shrink-0" />
                                        <span className="font-medium flex-shrink-0">Document:</span>
                                        <span className="text-gray-900 truncate">{log.metadata?.fileName || log.metadata?.documentName || 'Unknown'}</span>
                                        {log.metadata?.documentType && (
                                          <span className="text-gray-500 truncate">({log.metadata.documentType})</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Team Member Added */}
                                    {log.activityType === 'team_member_added' && (
                                      <div className="space-y-2">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-700 flex-wrap">
                                          <UserPlus size={12} className="sm:w-[14px] sm:h-[14px] text-teal-600 flex-shrink-0" />
                                          <span className="font-medium truncate">{log.metadata?.memberName || 'Team member'}</span>
                                          <span className="text-gray-600 flex-shrink-0">added as</span>
                                          <span className="px-1.5 sm:px-2 py-0.5 bg-teal-50 text-teal-700 rounded border border-teal-200 font-medium whitespace-nowrap flex-shrink-0">
                                            {log.metadata?.role || 'Member'}
                                          </span>
                                        </div>
                                        {/* Show equipment list for batch entries */}
                                        {log.metadata?.isBatch && log.metadata?.equipmentList && (
                                          <div className="ml-0 sm:ml-5 space-y-1">
                                            <span className="text-[10px] sm:text-xs font-medium text-gray-600">Equipment:</span>
                                            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                              {log.metadata.equipmentList.map((eq: any, idx: number) => (
                                                <span key={idx} className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-blue-50 text-blue-700 rounded border border-blue-200 truncate max-w-[150px] sm:max-w-none">
                                                  {eq.tagNumber} ({eq.type})
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Fallback: Show description if no specific format */}
                                    {log.changes.length === 0 && 
                                     !['progress_image_uploaded', 'technical_specs_updated', 'technical_section_added', 'document_uploaded', 'document_updated', 'team_member_added'].includes(log.activityType) && (
                                      <p className="text-xs sm:text-sm text-gray-600">{log.description}</p>
                                    )}
                                  </div>

                                  {/* Footer: Date and User */}
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pt-2 border-t border-gray-100 text-[10px] sm:text-xs text-gray-500">
                                    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                                      <Clock size={10} className="sm:w-3 sm:h-3 flex-shrink-0" />
                                      <span className="truncate">{log.updated}</span>
                                      <span className="text-gray-400 hidden sm:inline">|</span>
                                      <span className="truncate">{log.timeAgo}</span>
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                                      <User size={10} className="sm:w-3 sm:h-3 flex-shrink-0" />
                                      <span className="text-blue-600 font-medium truncate">{log.updatedBy}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Settings Tab */}
            {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
              <TabsContent value="settings" className="space-y-6 mt-8">
              <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-200">
                  <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <Settings size={20} className="text-gray-600 sm:w-6 sm:h-6" />
                    Team & Permissions Settings
                  </h2>
                  <p className="text-gray-600 text-xs sm:text-sm mt-1">Manage team members and control access permissions</p>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="space-y-6">
                    {/* Team Management Header */}
                    <div className="flex items-center justify-between mb-6 sm:mb-8">
                      <div className="flex-1">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-800">Team Members</h3>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">Manage who has access to this equipment and their permissions</p>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 ml-4">
                        <button
                          onClick={() => setShowAddMember(true)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                        >
                          <Users size={16} className="sm:w-4 sm:h-4" />
                          Add Member
                        </button>
                      </div>
                    </div>

                    {/* Team Members List */}
                    <div className="space-y-4">
                      {teamMembersLoading ? (
                        <div className="text-center py-6 sm:py-8">
                          <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mx-auto"></div>
                          <p className="text-gray-500 mt-2 text-xs sm:text-sm">Loading team members...</p>
                        </div>
                      ) : teamMembers.length === 0 ? (
                        <div className="text-center py-6 sm:py-8">
                          <Users size={36} className="mx-auto text-gray-300 mb-3 sm:mb-4 sm:w-12 sm:h-12" />
                          <p className="text-gray-500 text-sm sm:text-base">No team members found</p>
                          <p className="text-xs sm:text-sm text-gray-400 mt-1">Add team members to get started</p>
                        </div>
                      ) : (
                        teamMembers.map((member) => (
                          <div key={member.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                              <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <span className="text-blue-600 font-semibold text-xs sm:text-sm lg:text-lg">{member.avatar}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-gray-800 text-xs sm:text-sm lg:text-base truncate">{member.name}</h4>
                                  <p className="text-xs sm:text-sm text-gray-600 truncate">{member.email}</p>
                                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1">
                                    <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800`}>
                                      {member.position || 'No Position'}
                                    </span>
                                    <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                      {member.status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 sm:gap-2">
                                <button
                                  onClick={() => editTeamMember(member)}
                                  className="px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex-shrink-0"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => removeTeamMember(member.id)}
                                  className="px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors flex-shrink-0"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>

                            {/* Equipment Assignments */}
                            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
                              <h5 className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Equipment Assignments:</h5>
                              <div className="flex flex-wrap gap-1 sm:gap-2">
                                {member.equipmentAssignments && member.equipmentAssignments.length > 0 ? (
                                  member.equipmentAssignments.map((equipmentId: string, index: number) => {
                                    // For standalone equipment, show the equipment being viewed
                                    let displayName = 'This Equipment';
                                    if (equipmentId === viewingEquipmentId && viewingEquipment) {
                                      displayName = viewingEquipment.tagNumber || viewingEquipment.type || viewingEquipment.name || 'This Equipment';
                                    } else if (equipment && equipment.length > 0) {
                                      // Try to find equipment in the list
                                      const assignedEquipment = equipment.find(eq => eq.id === equipmentId);
                                      if (assignedEquipment) {
                                        displayName = assignedEquipment.manufacturingSerial || assignedEquipment.tagNumber || assignedEquipment.type || equipmentId;
                                      }
                                    }
                                    
                                    return (
                                      <span
                                        key={index}
                                        className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"
                                      >
                                        {displayName}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-xs text-gray-500">No equipment assigned</span>
                                )}
                              </div>
                            </div>

                            {/* Data Access Levels */}
                            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
                              <h5 className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Data Access:</h5>
                              <div className="space-y-1 sm:space-y-2">
                                {member.role === 'project_manager' && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Full Equipment Access</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Manage All Equipment</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Approve VDCR</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Manage Team Members</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Access to All Tabs</span>
                                    </div>
                                  </>
                                )}
                                {member.role === 'vdcr_manager' && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Documentation Management Access</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Approve VDCR</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can View All Equipment</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Access to VDCR & Equipment Tabs</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">No Access to Settings</span>
                                    </div>
                                  </>
                                )}
                                {member.role === 'editor' && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Assigned Equipment Only</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Add Progress Images</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Add Progress Entries</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Access to VDCR & Other Tabs</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">No Access to Settings</span>
                                    </div>
                                  </>
                                )}
                                {member.role === 'viewer' && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Read-Only Access</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can View Assigned Equipment</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can View Progress & VDCR</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">No Edit Permissions</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">No Access to Settings</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Role Badge - Shows actual role from user record */}
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Role:</h5>
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getRoleColor(member.role)} border`}>
                                {mapRoleToDisplay(member.role)}
                              </span>
                            </div>
                            
                            {/* Position Badge - Shows dynamic position for this equipment */}
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Position:</h5>
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                {member.position || 'No Position'}
                              </span>
                            </div>

                            {/* Department Badge */}
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Department:</h5>
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                                {member.department || 'No Department'}
                              </span>
                            </div>

                            {/* Permissions Display */}
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Permissions:</h5>
                              <div className="flex flex-wrap gap-2">
                                {(() => {
                                  const role = roles.find(r => r.name === member.role);
                                  const rolePermissions = role ? role.permissions : [];
                                  return rolePermissions.map((permission, index) => (
                                    <span
                                      key={index}
                                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                                    >
                                      {getPermissionLabel(permission)}
                                    </span>
                                  ));
                                })()}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            )}
          </Tabs>

          {/* Add Member Modal */}
          {showAddMember && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-t-xl">
                  <div className="flex items-start sm:items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-xl font-semibold text-gray-900">Add New Team Member</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">Fill in the details to add a new team member</p>
                    </div>
                    <button
                      onClick={handleCloseAddMember}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 flex-shrink-0"
                    >
                      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-3 sm:p-6 space-y-4 sm:space-y-8">
                  {/* Select Existing Member or Add New */}
                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center gap-2 sm:gap-3 mb-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-indigo-500 rounded-full flex-shrink-0"></div>
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Select Team Member</h4>
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                        Choose Existing Member or Add New *
                      </label>
                      <Select
                        value={selectedExistingMemberEmail}
                        onValueChange={(value) => handleExistingMemberSelect(value)}
                        disabled={isLoadingExistingMembers}
                        required
                      >
                        <SelectTrigger className="w-full h-auto px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white hover:bg-gray-50">
                          <SelectValue placeholder={isLoadingExistingMembers ? "Loading members..." : "Select or Add New Member..."} />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 sm:max-h-96">
                          {existingFirmMembers.length > 0 && (
                            <>
                              {existingFirmMembers.map((member, index) => (
                                <React.Fragment key={member.email}>
                                  {index > 0 && (
                                    <div className="border-t border-gray-200 my-1"></div>
                                  )}
                                  <SelectItem 
                                    value={member.email} 
                                    className="py-2.5 sm:py-3 px-3 sm:px-4 focus:bg-indigo-50"
                                  >
                                    <div className="flex flex-col gap-0.5 sm:gap-1 w-full">
                                      <div className="text-xs sm:text-sm font-medium text-gray-900">
                                        {member.name}
                                      </div>
                                      <div className="text-[10px] sm:text-xs text-gray-600">
                                        {member.email}
                                      </div>
                                      <div className="text-[10px] sm:text-xs text-gray-500">
                                        {mapRoleToDisplay(member.role || member.access_level || 'viewer')}
                                      </div>
                                    </div>
                                  </SelectItem>
                                </React.Fragment>
                              ))}
                            </>
                          )}
                          {existingFirmMembers.length > 0 && (
                            <div className="border-t border-gray-200 my-1"></div>
                          )}
                          <SelectItem value="new" className="text-xs sm:text-sm py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-indigo-600 focus:bg-indigo-50">
                            ➕ Add New Team Member
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {isExistingMemberMode && (
                        <p className="mt-2 text-[10px] sm:text-xs text-blue-600 flex items-start gap-1.5">
                          <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="flex-1">Existing member selected. Name, email, phone, and access level are locked. Only position can be edited.</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Basic Information Section */}
                  <div className="space-y-3 sm:space-y-5">
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Basic Information</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                        <input
                          type="text"
                          value={newMember.name}
                          onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                          disabled={isExistingMemberMode}
                          className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                            isExistingMemberMode 
                              ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                              : 'bg-gray-50 hover:bg-white'
                          }`}
                          placeholder="Enter full name"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                        <input
                          type="email"
                          value={newMember.email}
                          onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                          disabled={isExistingMemberMode}
                          className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                            isExistingMemberMode 
                              ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                              : 'bg-gray-50 hover:bg-white'
                          }`}
                          placeholder="Enter email address"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                        <input
                          type="tel"
                          value={newMember.phone || ''}
                          onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                          disabled={isExistingMemberMode}
                          className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                            isExistingMemberMode 
                              ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                              : 'bg-gray-50 hover:bg-white'
                          }`}
                          placeholder="Enter phone number"
                          pattern="[0-9]{10}"
                          title="Please enter a 10-digit phone number"
                          maxLength={10}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Position/Title *</label>
                        <input
                          type="text"
                          value={newMember.position || ''}
                          onChange={(e) => setNewMember({ ...newMember, position: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white hover:bg-blue-50"
                          placeholder="e.g., Engineer, Inspector, Manager"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Department (optional)</label>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 mb-2">From Documentation tab or add new.</p>
                      <Select
                        value={newMember.department || '__none__'}
                        onValueChange={(value) => {
                          if (value === '__add_new__') {
                            setNewMember(prev => ({ ...prev, department: '__add_new__' }));
                            return;
                          }
                          setNewMember(prev => ({ ...prev, department: value === '__none__' ? '' : value }));
                        }}
                        disabled={isExistingMemberMode}
                      >
                        <SelectTrigger className={`w-full h-auto px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                          isExistingMemberMode
                            ? 'bg-gray-100 cursor-not-allowed text-gray-600'
                            : 'bg-gray-50 hover:bg-white'
                        }`}>
                          <SelectValue placeholder="Select department..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No department</SelectItem>
                          {addMemberAvailableDepartments.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                          <SelectItem value="__add_new__">+ Add new department...</SelectItem>
                        </SelectContent>
                      </Select>
                      {(newMember.department === '__add_new__' || (newMember.department && !addMemberAvailableDepartments.includes(newMember.department))) && !isExistingMemberMode && (
                        <div className="mt-2 flex gap-2">
                          <Input
                            value={addMemberNewDepartmentInput}
                            onChange={e => setAddMemberNewDepartmentInput(e.target.value)}
                            placeholder="New department name"
                            className="h-9"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const v = addMemberNewDepartmentInput.trim();
                                if (v) {
                                  setAddMemberAvailableDepartments(prev => [...prev, v].sort());
                                  setNewMember(prev => ({ ...prev, department: v }));
                                  setAddMemberNewDepartmentInput('');
                                }
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9"
                            onClick={() => {
                              const v = addMemberNewDepartmentInput.trim();
                              if (v) {
                                setAddMemberAvailableDepartments(prev => [...prev, v].sort());
                                setNewMember(prev => ({ ...prev, department: v }));
                                setAddMemberNewDepartmentInput('');
                              }
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Role & Access Section */}
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Role & Access Level</h4>
                    </div>
                    
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Select Role *</label>
                      <Select
                        value={newMember.role}
                        onValueChange={(value) => {
                          const role = value;
                          setNewMember({
                            ...newMember, 
                            role: role,
                            accessLevel: role === 'Project Manager' ? 'project_manager' : 
                                        role === 'Documentation Manager' ? 'vdcr_manager' : 
                                        role === 'Editor' ? 'editor' : 'viewer',
                            permissions: role === 'Project Manager' ? ['view', 'edit', 'delete', 'manage_team', 'approve_vdcr', 'manage_equipment'] :
                                       role === 'Documentation Manager' ? ['view', 'edit', 'approve_vdcr', 'manage_vdcr'] :
                                       role === 'Editor' ? ['view', 'edit', 'manage_equipment'] : ['view', 'comment']
                          });
                        }}
                        disabled={isExistingMemberMode}
                        required
                      >
                        <SelectTrigger className={`w-full h-auto px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                          isExistingMemberMode 
                            ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                            : 'bg-gray-50 hover:bg-white'
                        }`}>
                          <SelectValue placeholder="Choose a role..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 sm:max-h-96">
                          <SelectItem value="Project Manager" className="text-xs sm:text-sm py-2">
                            Project Manager (Full Access)
                          </SelectItem>
                          <SelectItem value="Documentation Manager" className="text-xs sm:text-sm py-2">
                            Documentation Manager (Documentation Management)
                          </SelectItem>
                          <SelectItem value="Editor" className="text-xs sm:text-sm py-2">
                            Editor (Can Add Progress)
                          </SelectItem>
                          <SelectItem value="Viewer" className="text-xs sm:text-sm py-2">
                            Viewer (Read Only)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {/* Role Description with Data Access */}
                      {newMember.role && (
                        <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-[10px] sm:text-xs text-blue-700 font-medium mb-2 sm:mb-3">Default Data Access for Selected Role:</p>
                          <div className="text-[10px] sm:text-xs text-blue-700 space-y-1 sm:space-y-2">
                            {(() => {
                              // Map display role to database role
                              const roleMapping: Record<string, string> = {
                                'Project Manager': 'project_manager',
                                'Documentation Manager': 'vdcr_manager',
                                'Editor': 'editor',
                                'Viewer': 'viewer'
                              };
                              const dbRole = roleMapping[newMember.role] || 'viewer';
                              const dataAccess = getDataAccessByRole(dbRole);
                              
                              return (
                              <div className="space-y-1">
                                  {dataAccess.map((access, index) => (
                                    <div key={index}>• {access}</div>
                                  ))}
                              </div>
                              );
                            })()}
                              </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="sticky bottom-0 bg-white border-t border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-b-xl">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // console.log('Add Team Member button clicked', { 
                        //   newMember, 
                        //   viewingEquipmentId,
                        //   allFieldsValid: !!(newMember.name && newMember.email && newMember.position && newMember.role && viewingEquipmentId)
                        // });
                        addTeamMember();
                      }}
                      disabled={!newMember.name || !newMember.email || !newMember.position || !newMember.role || !viewingEquipmentId}
                      className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 text-sm sm:text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                    >
                      Add Team Member
                    </button>
                    <button
                      onClick={handleCloseAddMember}
                      className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 text-sm sm:text-base font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit Member Modal */}
          {showEditMember && selectedMember && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-t-xl">
                  <div className="flex items-start sm:items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-xl font-semibold text-gray-900">Edit Team Member</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">Update the team member's information and permissions</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowEditMember(false);
                        setSelectedMember(null);
                        setNewMember({ name: "", email: "", phone: "", position: "", department: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 flex-shrink-0"
                    >
                      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-3 sm:p-6 space-y-4 sm:space-y-8">
                  {/* Basic Information Section */}
                  <div className="space-y-3 sm:space-y-5">
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Basic Information</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                        <input
                          type="text"
                          value={newMember.name}
                          onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                          placeholder="Enter full name"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                        <input
                          type="email"
                          value={newMember.email}
                          onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                          placeholder="Enter email address"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                        <input
                          type="tel"
                          value={newMember.phone || ''}
                          onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                          placeholder="Enter phone number"
                          pattern="[0-9]{10}"
                          title="Please enter a 10-digit phone number"
                          maxLength={10}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Position/Title *</label>
                        <input
                          type="text"
                          value={newMember.position || ''}
                          onChange={(e) => setNewMember({ ...newMember, position: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                          placeholder="e.g., Engineer, Inspector, Manager"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Department (optional)</label>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 mb-2">From Documentation tab or add new.</p>
                      <Select
                        value={newMember.department || '__none__'}
                        onValueChange={() => {}}
                        disabled
                      >
                        <SelectTrigger className="w-full h-auto px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed">
                          <SelectValue placeholder="Select department..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No department</SelectItem>
                          {newMember.department &&
                            !addMemberAvailableDepartments.includes(newMember.department) && (
                              <SelectItem value={newMember.department}>{newMember.department}</SelectItem>
                            )}
                          {addMemberAvailableDepartments.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Role & Access Section - DISABLED */}
                  <div className="space-y-3 sm:space-y-4 opacity-60">
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wide">Role & Access Level (Read Only)</h4>
                    </div>
                    
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-500 mb-2">Current Role</label>
                      <div className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed">
                        {newMember.role || 'No role assigned'}
                      </div>
                      
                      {/* Disabled Notice */}
                      <div className="mt-3 p-2.5 sm:p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          <p className="text-[10px] sm:text-xs text-yellow-700 font-medium">Role & Access Level cannot be modified. Contact administrator to change user roles.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="sticky bottom-0 bg-white border-t border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-b-xl">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <button
                      onClick={updateTeamMember}
                      className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 text-sm sm:text-base font-medium shadow-sm hover:shadow-md"
                    >
                      Edit Team Member
                    </button>
                    <button
                      onClick={() => {
                        setShowEditMember(false);
                        setSelectedMember(null);
                        setNewMember({ name: "", email: "", phone: "", position: "", department: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
                      }}
                      className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 text-sm sm:text-base font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document URL Modal - Always rendered via portal outside conditional returns. Blob URL used for iframe so preview works (storage URLs block embedding). */}
      {documentUrlModal && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-start sm:items-center justify-center overflow-y-auto p-2 sm:p-4" style={{ zIndex: 99999 }} onClick={() => {
          if (documentUrlModal.blobUrl) URL.revokeObjectURL(documentUrlModal.blobUrl);
          setDocumentUrlModal(null);
        }}>
          <div className="bg-white rounded-lg p-3 sm:p-4 md:p-6 max-w-4xl w-full my-2 sm:my-0 max-h-[calc(100vh-1rem)] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2 mb-4">
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 truncate pr-2">Document: {documentUrlModal.name}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!documentUrlModal.loading && documentUrlModal.url && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { openInNewTabReliable(documentUrlModal.url!); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-8"
                    >
                      <FileText size={14} className="sm:mr-1 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Open in New Tab</span>
                      <span className="sm:hidden">Open</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const response = await fetch(documentUrlModal.url!);
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = documentUrlModal.name;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        } catch (error) {
                          console.error('Error downloading file:', error);
                          openInNewTabReliable(documentUrlModal.url!);
                        }
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-8"
                    >
                      <FileText size={14} className="sm:mr-1 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Download</span>
                      <span className="sm:hidden">Down</span>
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (documentUrlModal.blobUrl) URL.revokeObjectURL(documentUrlModal.blobUrl);
                    setDocumentUrlModal(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 h-7 sm:h-8 w-7 sm:w-8 p-0"
                >
                  <X size={16} className="sm:w-5 sm:h-5" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {documentUrlModal.loading ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent mb-4" />
                  <p className="text-sm font-medium text-gray-700">Document fetching...</p>
                  <p className="text-xs text-gray-500 mt-1">Loading the document for preview</p>
                </div>
              ) : documentUrlModal.previewLoading && documentUrlModal.url ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent mb-4" />
                  <p className="text-sm font-medium text-gray-700">Loading the document for preview</p>
                </div>
              ) : (() => {
                const previewUrl = documentUrlModal.blobUrl || documentUrlModal.url;
                if (!previewUrl) return null;
                const fileName = documentUrlModal.name.toLowerCase();
                const isPDF = fileName.endsWith('.pdf');
                const isImage = fileName.match(/\.(jpg|jpeg|png|gif|webp)$/);
                const hasKnownExtension = isPDF || !!isImage;
                const tryIframe = isPDF || hasKnownExtension === false;
                if (isPDF || tryIframe) {
                  const pdfUrl = documentUrlModal.url || previewUrl;
                  const freshPdfUrl = buildFreshPdfPreviewUrl(pdfUrl);
                  return (
                    <div className="text-center">
                      {isPDF ? (
                        <object
                          key={freshPdfUrl}
                          data={freshPdfUrl}
                          type="application/pdf"
                          className="w-full h-[60vh] sm:h-[65vh] md:h-[70vh] border border-gray-200 rounded-lg"
                          aria-label={documentUrlModal.name}
                        >
                          <iframe
                            src={freshPdfUrl}
                            className="w-full h-[60vh] sm:h-[65vh] md:h-[70vh] border border-gray-200 rounded-lg"
                            title={documentUrlModal.name}
                          />
                        </object>
                      ) : (
                        <iframe
                          key={previewUrl}
                          src={previewUrl}
                          className="w-full h-[400px] sm:h-[500px] md:h-[600px] border border-gray-200 rounded-lg"
                          title={documentUrlModal.name}
                        />
                      )}
                    </div>
                  );
                } else if (isImage) {
                  return (
                    <div className="text-center">
                      <img
                        src={previewUrl}
                        alt={documentUrlModal.name}
                        className="max-w-full h-auto max-h-[400px] sm:max-h-[500px] md:max-h-[600px] rounded-lg border border-gray-200 object-contain mx-auto"
                      />
                    </div>
                  );
                } else {
                  return (
                    <div className="text-center p-4 sm:p-6 md:p-8 bg-gray-50 rounded border border-gray-200">
                      <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-400 mb-3 sm:mb-4" />
                      <div className="text-sm sm:text-base md:text-lg font-medium text-gray-600 mb-2 break-words">{documentUrlModal.name}</div>
                      <div className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 px-2">
                        This file type cannot be previewed. Please download or open in a new tab to view.
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <Button
                          variant="outline"
                          onClick={() => openInNewTabReliable(documentUrlModal.url!)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9"
                        >
                          <FileText size={14} className="mr-1 sm:w-4 sm:h-4" />
                          Open in New Tab
                        </Button>
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              const response = await fetch(documentUrlModal.url!);
                              const blob = await response.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = documentUrlModal.name;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error('Error downloading file:', error);
                              openInNewTabReliable(documentUrlModal.url!);
                            }
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9"
                        >
                          <FileText size={14} className="mr-1 sm:w-4 sm:h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                  );
                }
              })() }

              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                  <div>
                    <span className="font-medium text-gray-700 block mb-1">File Name:</span>
                    <div className="text-gray-600 break-words">{documentUrlModal.name}</div>
                  </div>
                  {!documentUrlModal.loading && documentUrlModal.uploadedBy && (
                    <div>
                      <span className="font-medium text-gray-700 block mb-1">Uploaded By:</span>
                      <div className="text-gray-600 break-words">{documentUrlModal.uploadedBy}</div>
                    </div>
                  )}
                  {!documentUrlModal.loading && documentUrlModal.uploadDate && (
                    <div className="sm:col-span-2">
                      <span className="font-medium text-gray-700 block mb-1">Upload Date:</span>
                      <div className="text-gray-600">
                        {new Date(documentUrlModal.uploadDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Equipment modal - render inside details view so it appears on top (standalone only) */}
      {showAddEquipmentForm && editingStandaloneEquipment && (
        <AddStandaloneEquipmentFormNew
          onClose={() => { setShowAddEquipmentForm(false); setEditingStandaloneEquipment(null); }}
          onSubmit={handleAddStandaloneEquipment}
          editData={editingStandaloneEquipment}
          isEditMode={true}
        />
      )}

      {/* Mark activity complete modal - details view */}
      {markCompleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4" onClick={() => setMarkCompleteModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Mark activity complete</h3>
              <button type="button" onClick={() => setMarkCompleteModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-1">{markCompleteModalData.activityName}</p>
            <p className="text-xs text-blue-600 mb-3">
              {markCompleteModalData.activityType === 'milestone'
                ? 'This activity will appear in the Progress Image section.'
                : 'This activity will appear in the Updates tab.'}
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-700">When was it completed? *</Label>
                <Input
                  type="date"
                  value={markCompleteModalData.completedOn}
                  onChange={e => setMarkCompleteModalData(prev => ({ ...prev, completedOn: e.target.value }))}
                  className="mt-1 text-sm h-9"
                />
              </div>
              {/* Percentage completed: fixed weight (from QAP) or manual slider */}
              <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/60 p-3 space-y-2">
                {markCompleteModalData.progressWeight != null ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        Progress (fixed from QAP)
                      </Label>
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">{markCompleteModalData.percentageCompleted}%</span>
                    </div>
                    <p className="text-[11px] text-gray-500">This step adds {markCompleteModalData.progressWeight}% (defined in QAP). Total progress will be {markCompleteModalData.percentageCompleted}%.</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        Percentage completed
                      </Label>
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">{markCompleteModalData.percentageCompleted}%</span>
                    </div>
                    <p className="text-[11px] text-gray-500">Progress can only move forward (min {markCompleteModalData.currentProgress}%)</p>
                    <div className="flex w-full items-center py-2" style={{ minHeight: 28 }}>
                      {markCompleteModalData.currentProgress > 0 && (
                        <div
                          className={`h-2 flex-shrink-0 bg-emerald-500 transition-[width] duration-200 ${markCompleteModalData.currentProgress >= 100 ? 'rounded-full' : 'rounded-l-full rounded-r-none'}`}
                          style={{ width: `${markCompleteModalData.currentProgress}%` }}
                        />
                      )}
                      {markCompleteModalData.currentProgress < 100 && renderPercentageRemainingSlider()}
                      {markCompleteModalData.currentProgress === 100 && (
                        <div className="h-2 flex-1 rounded-r-full bg-emerald-500" />
                      )}
                    </div>
                    <div className="grid grid-cols-10 gap-1 pt-0.5 min-w-0">
                      {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setMarkCompleteModalData(prev => ({ ...prev, percentageCompleted: Math.max(n, prev.currentProgress) }))}
                          className={`min-w-0 px-1 py-0.5 rounded text-[10px] font-medium transition-all ${markCompleteModalData.percentageCompleted >= n ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}
                        >
                          {n}%
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div>
                <Label className="text-xs text-gray-700">Completed by (team)</Label>
                <Select
                  value={markCompleteModalData.completedBySelectValue || ''}
                  onValueChange={value => {
                    const member = existingFirmMembers.find((m: any) => m.id === value || m.email === value);
                    setMarkCompleteModalData(prev => ({
                      ...prev,
                      completedBySelectValue: value,
                      completedByUserId: member?.id || '',
                      completedByDisplayName: member ? (member.name || member.full_name || member.email) : value,
                    }));
                  }}
                >
                  <SelectTrigger className="mt-1 text-sm h-9">
                    <SelectValue placeholder="Select team member..." />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {existingFirmMembers.map((member: any) => (
                      <SelectItem key={member.id || member.email} value={member.id || member.email}>
                        {member.name || member.full_name || member.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-700">Department (optional)</Label>
                <p className="text-[11px] text-gray-500 mt-0.5 mb-1">From Documentation tab or add new. Used for inspection reports by department.</p>
                <Select
                  value={markCompleteModalData.department || '__none__'}
                  onValueChange={value => {
                    if (value === '__add_new__') {
                      setMarkCompleteModalData(prev => ({ ...prev, department: '__add_new__' }));
                      return;
                    }
                    setMarkCompleteModalData(prev => ({ ...prev, department: value === '__none__' ? '' : value }));
                  }}
                >
                  <SelectTrigger className="mt-1 text-sm h-9">
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    <SelectItem value="__none__">— None —</SelectItem>
                    {markCompleteAvailableDepartments.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                    <SelectItem value="__add_new__">+ Add new department...</SelectItem>
                  </SelectContent>
                </Select>
                {(markCompleteModalData.department === '__add_new__' || (markCompleteModalData.department && !markCompleteAvailableDepartments.includes(markCompleteModalData.department))) && (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={markCompleteNewDepartmentInput}
                      onChange={e => setMarkCompleteNewDepartmentInput(e.target.value)}
                      placeholder="New department name"
                      className="text-sm h-9"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = markCompleteNewDepartmentInput.trim(); if (v) { setMarkCompleteAvailableDepartments(prev => [...prev, v].sort()); setMarkCompleteModalData(prev => ({ ...prev, department: v })); setMarkCompleteNewDepartmentInput(''); } } }}
                    />
                    <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => { const v = markCompleteNewDepartmentInput.trim(); if (v) { setMarkCompleteAvailableDepartments(prev => [...prev, v].sort()); setMarkCompleteModalData(prev => ({ ...prev, department: v })); setMarkCompleteNewDepartmentInput(''); } }}>Add</Button>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs text-gray-700">Notes (optional)</Label>
                <Textarea
                  value={markCompleteModalData.notes}
                  onChange={e => setMarkCompleteModalData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes"
                  className="mt-1 text-sm min-h-[60px]"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Upload image(s) (optional)</Label>
                <div className="flex flex-row items-center gap-2 mt-1.5 flex-wrap" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
                  <input
                    ref={markCompleteCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) setMarkCompleteModalData(prev => ({ ...prev, imageFiles: [...prev.imageFiles, f] }));
                      e.target.value = '';
                    }}
                    className="hidden"
                    id="mark-complete-camera-details"
                  />
                  <input
                    ref={markCompleteGalleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={e => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      if (files.length) setMarkCompleteModalData(prev => ({ ...prev, imageFiles: [...prev.imageFiles, ...files] }));
                      e.target.value = '';
                    }}
                    className="hidden"
                    id="mark-complete-gallery-details"
                  />
                  <label
                    htmlFor="mark-complete-camera-details"
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
                    onClick={e => e.stopPropagation()}
                  >
                    <Camera className="w-4 h-4" />
                    Camera
                  </label>
                  <label
                    htmlFor="mark-complete-gallery-details"
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
                    onClick={e => e.stopPropagation()}
                  >
                    <Upload className="w-4 h-4" />
                    Choose file(s)
                  </label>
                  <span className="text-sm text-gray-500">
                    {markCompleteModalData.imageFiles?.length ? `${markCompleteModalData.imageFiles.length} file(s) chosen` : 'No file chosen'}
                  </span>
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-700">Upload inspection reports (if applicable)</Label>
                <div className="flex flex-row items-center gap-2 mt-1.5 flex-wrap" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    onChange={e => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      if (files.length) setMarkCompleteModalData(prev => ({ ...prev, reportFiles: [...(prev.reportFiles ?? []), ...files] }));
                      e.target.value = '';
                    }}
                    className="hidden"
                    id="mark-complete-reports-details"
                  />
                  <label
                    htmlFor="mark-complete-reports-details"
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
                    onClick={e => e.stopPropagation()}
                  >
                    <FileText className="w-4 h-4" />
                    Choose PDF(s)
                  </label>
                  <span className="text-sm text-gray-500">
                    {markCompleteModalData.reportFiles?.length ? `${markCompleteModalData.reportFiles.length} report(s)` : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button type="button" variant="outline" onClick={() => setMarkCompleteModalOpen(false)} disabled={markCompleteSubmitting}>Cancel</Button>
              <Button type="button" onClick={() => handleMarkActivityComplete()} disabled={markCompleteSubmitting}>
                {markCompleteSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Mark complete'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit activity list modal - details view */}
      {editActivitiesModalOpen && editActivitiesModalEquipmentId && (() => {
        const editModalEquipment = localEquipment.find(eq => eq.id === editActivitiesModalEquipmentId);
        const startDate = (editModalEquipment as any)?.commencementDate ?? (editModalEquipment as any)?.commencement_date;
        const startDateLabel = startDate ? new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
        return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4" onClick={() => setEditActivitiesModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Edit activity list</h3>
                <button type="button" onClick={() => setEditActivitiesModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-500">Marked start date: {startDateLabel ?? 'Not set'}. Tick &quot;Inspection/TPI&quot; if this step involves inspection or third party.</p>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {editActivitiesDraft.map((row, idx) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2 p-2 border rounded-lg bg-gray-50/50">
                  <span className="w-8 h-8 flex items-center justify-center rounded border bg-white text-xs font-medium text-gray-700 shrink-0">{idx + 1}</span>
                  <Input className="flex-1 min-w-[100px] h-8 text-xs" placeholder="Activity name" value={row.activity_name} onChange={e => setEditActivitiesDraft(prev => prev.map((r, i) => i === idx ? { ...r, activity_name: e.target.value } : r))} />
                  <Select value={row.activity_type} onValueChange={v => setEditActivitiesDraft(prev => prev.map((r, i) => i === idx ? { ...r, activity_type: v as 'regular_update' | 'milestone' } : r))}>
                    <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[200]">
                      <SelectItem value="regular_update">Minor</SelectItem>
                      <SelectItem value="milestone">Major</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="w-24 h-8 text-xs" placeholder="e.g. 1st week" value={row.target_relative} onChange={e => setEditActivitiesDraft(prev => prev.map((r, i) => i === idx ? { ...r, target_relative: e.target.value } : r))} />
                  <label className="flex items-center gap-1.5 shrink-0 text-xs text-gray-600 whitespace-nowrap">
                    <input type="checkbox" checked={row.inspection_tpi_involved ?? false} onChange={e => setEditActivitiesDraft(prev => prev.map((r, i) => i === idx ? { ...r, inspection_tpi_involved: e.target.checked } : r))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5" />
                    Inspection/TPI
                  </label>
                  <div className="flex items-center gap-0.5">
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === 0} onClick={() => setEditActivitiesDraft(prev => { const a = [...prev]; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; return a.map((r, i) => ({ ...r, sort_order: i })); })}><ChevronUp className="w-4 h-4" /></Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === editActivitiesDraft.length - 1} onClick={() => setEditActivitiesDraft(prev => { const a = [...prev]; [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]; return a.map((r, i) => ({ ...r, sort_order: i })); })}><ChevronDown className="w-4 h-4" /></Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700" onClick={() => setEditActivitiesDraft(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sort_order: i })))}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t">
              <Button type="button" size="sm" variant="outline" className="text-indigo-600 border-indigo-200" onClick={() => setEditActivitiesDraft(prev => [...prev, { id: `new-${Date.now()}`, sr_no: prev.length + 1, activity_name: '', activity_type: 'regular_update' as const, target_relative: '', target_date: '', sort_order: prev.length, inspection_tpi_involved: false, progress_weight: null }])}>
                <Plus size={14} className="mr-1" />
                Add activity
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditActivitiesModalOpen(false)}>Cancel</Button>
                <Button onClick={saveEditActivitiesModal}>Save</Button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Activities History modal - details view */}
      {activitiesHistoryOpen && activitiesHistoryEquipmentId && (() => {
        const list = equipmentActivities[activitiesHistoryEquipmentId] || [];
        const equipment = localEquipment.find((eq: Equipment) => eq.id === activitiesHistoryEquipmentId);
        const commencementDate = (equipment as any)?.commencementDate ?? (equipment as any)?.commencement_date ?? null;
        const getDisplayTargetDate = (act: any) => {
          const raw = act.target_date ?? act.targetDate;
          if (raw) return raw;
          const fromRelative = parseExplicitTargetDate(act.target_relative ?? act.targetRelative);
          if (fromRelative) return fromRelative;
          if (commencementDate && (act.target_relative ?? act.targetRelative))
            return computeTargetDate(commencementDate, act.target_relative ?? act.targetRelative) ?? undefined;
          return undefined;
        };
        const formatDate = (d: string | undefined) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
        const getVarianceDays = (target: string | undefined, completedOn: string | undefined) => {
          if (!target || !completedOn) return null;
          const t = new Date(target); const c = new Date(completedOn);
          return Math.round((c.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
        };
        const getTrackStatus = (act: any, displayTargetDate: string | undefined) => {
          if (!act.completion) return { text: 'Pending', className: 'text-gray-500' };
          const v = getVarianceDays(displayTargetDate, act.completion?.completed_on);
          if (v === null) return { text: '—', className: 'text-gray-500' };
          if (v <= 0) return { text: v === 0 ? 'On track' : `${Math.abs(v)} days early`, className: 'text-green-600' };
          return { text: `${v} days delay`, className: 'text-amber-600' };
        };
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4" onClick={() => { setActivitiesHistoryOpen(false); setActivitiesHistoryEquipmentId(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                Activity history
              </h3>
              <button type="button" onClick={() => { setActivitiesHistoryOpen(false); setActivitiesHistoryEquipmentId(null); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Sr.</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Activity</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Remarks</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Completed by</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Completed on</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Updated on</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Target date</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Variance (days)</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Track status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((act: any) => {
                    const displayTargetDate = getDisplayTargetDate(act);
                    const variance = act.completion && displayTargetDate ? getVarianceDays(displayTargetDate, act.completion.completed_on) : null;
                    const track = getTrackStatus(act, displayTargetDate);
                    return (
                      <tr key={act.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-2 px-2">{act.sr_no}</td>
                        <td className="py-2 px-2 font-medium text-gray-900">{act.activity_name}</td>
                        <td className="py-2 px-2 text-gray-600 max-w-[140px] truncate" title={act.completion?.notes ?? ''}>{act.completion?.notes ?? '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{act.completion?.completed_by_display_name ?? '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{formatDate(act.completion?.completed_on)}</td>
                        <td className="py-2 px-2 text-gray-600">{act.completion?.updated_on ? formatDate(act.completion.updated_on) : '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{formatDate(displayTargetDate)}</td>
                        <td className="py-2 px-2">{variance !== null ? (variance > 0 ? `+${variance}` : variance) : '—'}</td>
                        <td className={`py-2 px-2 font-medium ${track.className}`}>{track.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        );
      })()}
    </>
    );
  }

  return (
    <>
    <div className="space-y-6">

      {/* Add New Equipment Section */}
      {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="w-7 h-7 sm:w-10 sm:h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Plus size={14} className="sm:w-5 sm:h-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 truncate">Add New Equipment</h3>
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 truncate hidden sm:block">Add new equipment to this project</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button 
              onClick={() => {
                if (projectId === 'standalone') {
                  // For standalone equipment, open the modal form
                  setShowAddEquipmentForm(true);
                } else {
                  // For regular projects, toggle the inline mini form
                  setShowMiniForm(!showMiniForm);
                }
              }}
              className={`h-auto px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap ${
                projectId === 'standalone' 
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : showMiniForm 
                  ? 'bg-gray-400 text-gray-600' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Plus size={12} className="sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
              Add Equipment
            </Button>
            {projectId !== 'standalone' && (
            <button 
              onClick={() => setShowMiniForm(!showMiniForm)}
              className={`p-1 sm:p-1.5 text-gray-500 hover:text-gray-700 transition-transform flex-shrink-0 ${showMiniForm ? 'rotate-180' : ''}`}
            >
              <ChevronDown size={12} className="sm:w-4 sm:h-4" />
            </button>
            )}
          </div>
        </div>
        
        {/* Equipment Filters Section - Same div, below header */}
        {showMiniForm && projectId !== 'standalone' && (
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
              <div>
                <Label htmlFor="inline-equipment-name" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Equipment Name</Label>
                <Select 
                  value={miniFormData.equipmentName} 
                  onValueChange={(value) => setMiniFormData(prev => ({ ...prev, equipmentName: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select equipment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Heat Exchanger">Heat Exchanger</SelectItem>
                    <SelectItem value="Pressure Vessel">Pressure Vessel</SelectItem>
                    <SelectItem value="Reactor">Reactor</SelectItem>
                    <SelectItem value="Storage Tank">Storage Tank</SelectItem>
                    <SelectItem value="Distillation Column">Column</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {miniFormData.equipmentName === 'Custom' && (
                <div>
                  <Label htmlFor="inline-custom-equipment" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Custom Equipment Name</Label>
                  <Input
                    id="inline-custom-equipment"
                    value={miniFormData.customEquipmentName}
                    onChange={(e) => setMiniFormData(prev => ({ ...prev, customEquipmentName: e.target.value }))}
                    placeholder="Enter custom equipment name"
                    className="w-full"
                  />
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="inline-tag" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Tag Number</Label>
                <Input
                  id="inline-tag"
                  value={miniFormData.tagNumber}
                  onChange={(e) => setMiniFormData(prev => ({ ...prev, tagNumber: e.target.value }))}
                  placeholder="Enter tag number"
                  className="w-full"
                />
              </div>
              
              <div>
                <Label htmlFor="inline-job" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Job Number</Label>
                <Input
                  id="inline-job"
                  value={miniFormData.jobNumber}
                  onChange={(e) => setMiniFormData(prev => ({ ...prev, jobNumber: e.target.value }))}
                  placeholder="Enter job number"
                  className="w-full"
                />
              </div>
              
              <div>
                <Label htmlFor="inline-msn" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Equipment Title</Label>
                <Input
                  id="inline-msn"
                  value={miniFormData.msnNumber}
                  onChange={(e) => setMiniFormData(prev => ({ ...prev, msnNumber: e.target.value }))}
                  placeholder="Enter equipment title"
                  className="w-full"
                />
              </div>
            </div>

            {/* Technical Specifications Section */}
            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
              <Label className="text-sm sm:text-base font-semibold text-gray-800 mb-3 sm:mb-4 block">Technical Specifications</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="inline-size" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Size</Label>
                  <Input
                    id="inline-size"
                    value={miniFormData.size}
                    onChange={(e) => setMiniFormData(prev => ({ ...prev, size: e.target.value }))}
                    placeholder="e.g., 4.2m x 1.6m"
                    className="w-full"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Dimensions (length × width × height)</p>
                </div>
                
                <div>
                  <Label htmlFor="inline-material" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Material</Label>
                  <Input
                    id="inline-material"
                    value={miniFormData.material}
                    onChange={(e) => setMiniFormData(prev => ({ ...prev, material: e.target.value }))}
                    placeholder="e.g., SS 304, Carbon Steel"
                    className="w-full"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Primary material specification</p>
                </div>
                
                <div>
                  <Label htmlFor="inline-design-code" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Design Code</Label>
                  <Input
                    id="inline-design-code"
                    value={miniFormData.designCode}
                    onChange={(e) => setMiniFormData(prev => ({ ...prev, designCode: e.target.value }))}
                    placeholder="e.g., ASME VIII Div 1, TEMA Class R"
                    className="w-full"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Applicable design standard</p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-3 sm:pt-4">
              <Button 
                onClick={handleMiniFormSubmit}
                disabled={
                  !miniFormData.equipmentName || 
                  !miniFormData.tagNumber || 
                  !miniFormData.jobNumber || 
                  !miniFormData.msnNumber ||
                  (miniFormData.equipmentName === 'Custom' && !miniFormData.customEquipmentName)
                }
                className={`${
                  miniFormData.equipmentName && 
                  miniFormData.tagNumber && 
                  miniFormData.jobNumber && 
                  miniFormData.msnNumber &&
                  (miniFormData.equipmentName !== 'Custom' || miniFormData.customEquipmentName)
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                }`}
              >
                <Plus size={14} className="sm:w-4 sm:h-4 mr-2" />
                Create Equipment
              </Button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Search Equipment */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="relative">
          <Input
            type="text"
            placeholder="Search by equipment name, tag number, job number,MSN, or PO number..."
            className="h-9 sm:h-10 text-xs sm:text-sm pr-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Phase Tabs + Arrange Equipment Order */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="border-b border-gray-200 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <div className="flex items-center justify-between gap-2 px-2 sm:px-4">
            <nav className="flex min-w-max space-x-6 sm:space-x-8 px-2 sm:px-4 whitespace-nowrap pb-0.5" aria-label="Equipment Phase Tabs">
              <button
                onClick={() => setSelectedPhase('all')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${selectedPhase === 'all'
                  ? 'border-gray-500 text-gray-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Show All
                <span className="ml-2 bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {localEquipment.length}
                </span>
              </button>
              <button
                onClick={() => setSelectedPhase('documentation')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${selectedPhase === 'documentation'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Documentation
                <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {localEquipment.filter(eq => eq.progressPhase === 'documentation').length}
                </span>
              </button>
              <button
                onClick={() => setSelectedPhase('manufacturing')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${selectedPhase === 'manufacturing'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Manufacturing
                <span className="ml-2 bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {localEquipment.filter(eq => eq.progressPhase === 'manufacturing').length}
                </span>
              </button>
              <button
                onClick={() => setSelectedPhase('testing')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${selectedPhase === 'testing'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Testing
                <span className="ml-2 bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {localEquipment.filter(eq => eq.progressPhase === 'testing').length}
                </span>
              </button>
              <button
                onClick={() => setSelectedPhase('dispatched')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${selectedPhase === 'dispatched'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Dispatched
                <span className="ml-2 bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {localEquipment.filter(eq => eq.progressPhase === 'dispatched').length}
                </span>
              </button>
            </nav>
            {projectId && projectId !== 'standalone' && localEquipment.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 text-green-700 border-green-300 hover:bg-green-50 hover:border-green-400"
                onClick={() => {
                  const displayOrder = (equipmentOrderIds && equipmentOrderIds.length > 0)
                    ? equipmentOrderIds.filter(id => localEquipment.some(e => e.id === id))
                    : getCreatedOrderIds(localEquipment);
                  const allIds = localEquipment.map(e => e.id);
                  const inDisplay = new Set(displayOrder);
                  const appended = allIds.filter(id => !inDisplay.has(id));
                  setArrangeOrderDraft([...displayOrder, ...appended]);
                  setShowArrangeOrderModal(true);
                }}
              >
                <GripVertical className="w-4 h-4 mr-1.5" />
                Arrange Equipment Order
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Arrange Equipment Order modal */}
      {showArrangeOrderModal && localEquipment.length > 0 && arrangeOrderDraft.length > 0 && (() => {
        const byId = new Map(localEquipment.map(eq => [eq.id, eq]));
        const ordered = arrangeOrderDraft.map(id => byId.get(id)).filter(Boolean) as Equipment[];
        const move = (from: number, delta: number) => {
          const to = Math.max(0, Math.min(arrangeOrderDraft.length - 1, from + delta));
          if (to === from) return;
          setArrangeOrderDraft(prev => {
            const next = [...prev];
            const [removed] = next.splice(from, 1);
            next.splice(to, 0, removed);
            return next;
          });
        };
        const onSave = () => {
          const newOrder = arrangeOrderDraft;
          setLocalEquipment(prev => {
            const byIdMap = new Map(prev.map(e => [e.id, e]));
            return newOrder.map(id => byIdMap.get(id)).filter(Boolean) as Equipment[];
          });
          try {
            localStorage.setItem(`equipment_order_${projectId}`, JSON.stringify(newOrder));
          } catch (_) {}
          setEquipmentOrderIds(newOrder);
          setShowArrangeOrderModal(false);
          setArrangeOrderDraft([]);
          toast({ title: 'Order saved', description: 'Equipment display order updated.' });
        };
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={() => { setShowArrangeOrderModal(false); setArrangeOrderDraft([]); }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Arrange Equipment Order</h3>
                <button type="button" onClick={() => { setShowArrangeOrderModal(false); setArrangeOrderDraft([]); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
              </div>
              <div className="overflow-auto flex-1 p-4 space-y-1">
                {ordered.map((eq, idx) => (
                  <div key={eq.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-2">
                    <span className="w-6 h-6 flex items-center justify-center rounded bg-white border text-xs font-medium text-gray-600 shrink-0">{idx + 1}</span>
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-800">{eq.tagNumber || eq.type || eq.id}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === 0} onClick={() => move(idx, -1)}><ChevronUp className="w-4 h-4" /></Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === arrangeOrderDraft.length - 1} onClick={() => move(idx, 1)}><ChevronDown className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => { setShowArrangeOrderModal(false); setArrangeOrderDraft([]); }}>Cancel</Button>
                <Button onClick={onSave}>Save order</Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Equipment Grid */}
      {localEquipment.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building size={32} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">No Equipment Added Yet</h3>
          <p className="text-gray-600 mb-6">
            This project doesn't have any equipment added yet. Use the form above to add equipment to this project.
          </p>
          <div className="text-sm text-gray-500">
            Equipment will appear here once added to the project.
          </div>
        </div>
      ) : (
        <>
        <div className="px-2 sm:px-4 lg:px-6 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 text-[0.97rem]">
            {(() => {
              // Filter and sort equipment (same logic as before)
              const fallbackOrderIds = getCreatedOrderIds(localEquipment);
              const filteredAndSorted = localEquipment
            .filter(eq => {
              // Phase filter
              const phaseMatch = selectedPhase === 'all' ? true : eq.progressPhase === selectedPhase;
              
              // Search filter
              if (!phaseMatch) return false;
              
              if (searchQuery.trim()) {
                const searchLower = searchQuery.toLowerCase();
                const matchesSearch = 
                  (eq.type || '').toLowerCase().includes(searchLower) ||
                  (eq.name || '').toLowerCase().includes(searchLower) ||
                  (eq.tagNumber || '').toLowerCase().includes(searchLower) ||
                  (eq.jobNumber || '').toLowerCase().includes(searchLower) ||
                  (eq.manufacturingSerial || '').toLowerCase().includes(searchLower);
                  (eq.poCdd || '').toLowerCase().includes(searchLower) ||
                  (eq.poNumber || (eq as any).po_number || '').toLowerCase().includes(searchLower) ||
                  ((eq.custom_fields?.find((f: any) => f.name === 'PO Number')?.value) || '').toLowerCase().includes(searchLower);
                return matchesSearch;
              }
              
              return true;
            })
            .sort((a, b) => {
              // Use saved display order (Arrange Equipment Order) when present; otherwise created_at
              if (equipmentOrderIds && equipmentOrderIds.length > 0) {
                const idxA = equipmentOrderIds.indexOf(a.id);
                const idxB = equipmentOrderIds.indexOf(b.id);
                const orderA = idxA === -1 ? 1e9 : idxA;
                const orderB = idxB === -1 ? 1e9 : idxB;
                if (orderA !== orderB) return orderA - orderB;
                return a.id.localeCompare(b.id);
              }
              return fallbackOrderIds.indexOf(a.id) - fallbackOrderIds.indexOf(b.id);
                });
              
              // Pagination: Calculate total pages and slice data
              const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
              const startIndex = (currentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const paginatedEquipment = filteredAndSorted.slice(startIndex, endIndex);
              
              // Reset to page 1 if current page is out of bounds
              if (currentPage > totalPages && totalPages > 0) {
                setCurrentPage(1);
              }
              
              return paginatedEquipment.map((item) => (
              <Card key={item.id} id={`equipment-card-${item.id}`} className="overflow-hidden hover:shadow-lg transition-shadow relative bg-gray-50 border border-gray-200 h-auto sm:min-h-[420px] flex flex-col">
                <div className="p-3 sm:p-4 flex-1 flex flex-col">
                  {/* Progress Image Section (hidden in edit mode; view-only here) */}
                  <div className="mb-4">
                    {editingEquipmentId !== item.id && (
                      // View Mode - Status card + progress image in one continuous container
                      <div className="rounded-lg overflow-hidden">
                        {/* Current manufacturing stage – from activities (current & date) */}
                        {(() => {
                          const list = equipmentActivities[item.id] || [];
                          const { completed: completedSeg, current } = getActivitiesProgressSegments(list);
                          const lastCompleted = completedSeg[0];
                          const sortedByOrder = list.length ? [...list].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : [];
                          const lastActivity = sortedByOrder.length ? sortedByOrder[sortedByOrder.length - 1] : null;
                          const qapDeadlineRaw = lastActivity?.target_date || null;
                          const qapDeadlineDate = qapDeadlineRaw ? (() => { try { const d = new Date(qapDeadlineRaw); return isNaN(d.getTime()) ? null : d; } catch { return null; } })() : null;
                          const stageLabel = current
                            ? current.activity_name
                            : (lastCompleted ? lastCompleted.activity_name : null);
                          const stageDate = current
                            ? (current.target_date ? formatDateOnly(current.target_date) : (current.target_relative || null))
                            : (lastCompleted?.completion?.completed_on ? formatDateOnly(lastCompleted.completion.completed_on) : null);
                          const isComplete = !!lastCompleted;
                          const daysVariance = lastCompleted?.completion?.completed_on && lastCompleted?.target_date
                            ? (() => {
                                try {
                                  const completed = new Date(lastCompleted.completion.completed_on).getTime();
                                  const target = new Date(lastCompleted.target_date).getTime();
                                  if (isNaN(completed) || isNaN(target)) return null;
                                  return Math.round((completed - target) / (24 * 60 * 60 * 1000));
                                } catch { return null; }
                              })()
                            : null;
                          const hasNoActivities = !stageLabel && !list.length;
                          // Only show progress % when user has at least one QAP completion; otherwise DB/seed values (e.g. 22%) show as "random"
                          const hasAnyCompletion = list.some((a: any) => a.completion);
                          const displayProgress = hasAnyCompletion
                            ? (typeof item.progress === 'number' ? Math.min(100, Math.max(0, item.progress)) : 0)
                            : 0;
                            return (
                            <div className="rounded-t-lg bg-indigo-50 border border-indigo-100 border-b-0 px-3 py-2 sm:px-4 sm:py-2.5">
                              <div className="group flex flex-col gap-0.5 -mx-1 px-2 py-1 rounded mb-2 sm:-mx-2 sm:px-3 bg-blue-600 min-w-0">
                                {/* Row 1: title | days to go */}
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <div className="text-xs sm:text-sm font-semibold text-white truncate min-w-0">{item.manufacturingSerial || item.name || (item.type === 'Distillation Column' ? 'Column' : item.type)}</div>
                                  {item.progressPhase === 'dispatched' ? (
                                    <div className="text-xs sm:text-sm font-bold text-white truncate flex-shrink-0">
                                      {(() => {
                                        let dispatchDate: Date | null = null;
                                        if (item.completionDate && item.completionDate !== 'No deadline set' && item.completionDate !== 'Not specified') {
                                          try { const d = new Date(item.completionDate); if (!isNaN(d.getTime())) dispatchDate = d; } catch { }
                                        }
                                        if (!dispatchDate && item.updated_at) {
                                          try { const d = new Date(item.updated_at); if (!isNaN(d.getTime())) dispatchDate = d; } catch { }
                                        }
                                        if (!dispatchDate) dispatchDate = new Date();
                                        return dispatchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                      })()}
                                      </div>
                                  ) : qapDeadlineDate ? (
                                    (() => {
                                      try {
                                        const daysDiff = Math.ceil((qapDeadlineDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                                        if (daysDiff < 0) return <div className="text-xs sm:text-sm font-bold text-white flex-shrink-0">{Math.abs(daysDiff)} days overdue</div>;
                                        return <div className="text-xs sm:text-sm font-bold text-white flex-shrink-0">{daysDiff} days to go</div>;
                                      } catch { return <div className="text-xs sm:text-sm font-bold text-white/90 flex-shrink-0">No deadline set</div>; }
                                    })()
                                  ) : (
                                    <div className="text-xs sm:text-sm font-bold text-white/90 flex-shrink-0">No deadline set</div>
                                              )}
                                            </div>
                                {/* Row 2: On track / Tag·Job (hover) | date — aligned */}
                                <div className="flex items-baseline justify-between gap-2 min-w-0">
                                  <div className="relative min-h-[14px] flex items-baseline min-w-0">
                                    <div className="text-[9px] sm:text-[10px] text-white/90 truncate transition-opacity duration-150 group-hover:opacity-0">
                                      {(() => {
                                        if (hasNoActivities) return 'Yet to begin';
                                        if (item.progressPhase === 'dispatched') return 'On track';

                                        // Interpret status ONLY from the latest completed QAP step:
                                        // variance = completed_on - target_date (in days).
                                        // If > 4 days late, show as delayed; otherwise on track.
                                        if (isComplete && daysVariance !== null) {
                                          if (daysVariance > 4) return `Late by ${daysVariance} days`;
                                          return 'On track';
                                        }

                                        // If no completed steps with valid dates yet, just treat as On track.
                                        return 'On track';
                                      })()}
                                    </div>
                                    <div className="text-[9px] sm:text-[10px] text-white/90 truncate absolute left-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                      Tag: {item.tagNumber || '—'} · Job: {item.jobNumber || '—'}
                                    </div>
                                  </div>
                                  {(() => {
                                    if (hasNoActivities) return null;
                                    const raw = qapDeadlineRaw;
                                    if (!raw) return null;
                                    try {
                                      const d = new Date(raw);
                                      if (isNaN(d.getTime())) return null;
                                      const day = d.getDate();
                                      const ord =
                                        day % 10 === 1 && day % 100 !== 11 ? 'st' :
                                        day % 10 === 2 && day % 100 !== 12 ? 'nd' :
                                        day % 10 === 3 && day % 100 !== 13 ? 'rd' : 'th';
                                      return (
                                        <div className="text-[9px] sm:text-[10px] text-white/80 whitespace-nowrap flex-shrink-0">
                                          {day}{ord} {d.toLocaleDateString('en-GB', { month: 'long' })} {d.getFullYear()}
                                        </div>
                                      );
                                    } catch {
                                      return null;
                                    }
                                  })()}
                                </div>
                                              </div>
                        {/* Current step & date with percentage – above image */}
                        <div className="text-[9px] sm:text-[10px] text-gray-500 font-medium mb-1">Ongoing activity</div>
                        <div className="flex items-start justify-between gap-3 mt-0.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{stageLabel || '—'}</div>
                            {stageDate && (
                              <div className="text-[9px] sm:text-[10px] text-gray-600 mt-0.5">
                                {isComplete ? (
                                  <>
                                    <span className="font-semibold">Target date of completion</span> {stageDate}
                                  </>
                                ) : `Target ${stageDate}`}
                                    </div>
                                  )}
                                </div>
                          <div className="flex-shrink-0 text-right flex flex-col items-end gap-0 leading-none">
                            <span className="text-lg sm:text-xl font-bold text-emerald-600 tabular-nums">{displayProgress}%</span>
                            <span className="text-[9px] text-gray-500 -mt-0.5">completed</span>
                              </div>
                        </div>
                        {/* Progress image: QAP latest completed step images (navigable) or fallback to single progress image */}
                        <div className="relative mt-4">
                          {(isLoadingProgressImages && !(item.progressImages?.[0] || item.progressImagesMetadata?.length)) ? (
                          <div className="w-full h-40 sm:h-52 md:h-64 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-200 rounded-md border border-indigo-100 flex items-center justify-center min-h-0">
                            <div className="text-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                              <p className="text-sm font-medium text-gray-700 mb-1">
                                Fetching latest images of your equipment, straight from your plant...
                              </p>
                              <p className="text-xs text-gray-500">
                                This may take a few moments
                              </p>
                            </div>
                          </div>
                        ) : (() => {
                          const sortedByOrder = [...list].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                          const completedMilestones = sortedByOrder.filter((a: any) => a.completion && a.activity_type === 'milestone');
                          let lastMilestoneWithImages: { comp: any; imageCount: number } | null = null;
                          for (let i = completedMilestones.length - 1; i >= 0; i--) {
                            const act = completedMilestones[i];
                            const comp = act?.completion;
                            const fromApi = comp ? (Number(comp.image_count) ?? 0) : 0;
                            const fallbackCount = comp?.id ? (completionImageCountFallback[comp.id] ?? 0) : 0;
                            const imageCount = Math.max(fromApi, fallbackCount);
                            if (imageCount >= 1) {
                              lastMilestoneWithImages = { comp, imageCount };
                              break;
                            }
                          }
                          const latestQapWithImages = lastMilestoneWithImages?.comp?.id
                            ? { completionId: lastMilestoneWithImages.comp.id, imageCount: lastMilestoneWithImages.imageCount }
                            : null;
                          if (latestQapWithImages) {
                            const { completionId, imageCount } = latestQapWithImages;
                            const currentIndex = Math.min(Math.max(0, progressSectionImageIndex[item.id] ?? 0), imageCount - 1);
                            const cacheKey = `${completionId}_${currentIndex}`;
                            const imageUrl = stepImageCache[cacheKey];
                            const loading = stepImageLoading[cacheKey];
                            return (
                              <div className="space-y-2 rounded-md border border-indigo-100 border-t bg-white">
                                <div className="relative">
                                  {imageUrl ? (
                                    <div
                                      className="relative cursor-pointer group"
                                      onClick={() => {
                                        setStepImagePreview({ completionId, currentIndex, imageCount });
                                      }}
                                    >
                                      <img
                                        src={imageUrl}
                                        alt="Progress"
                                        className="w-full max-w-full h-40 sm:h-52 md:h-64 object-cover rounded-md border border-gray-200 pointer-events-none"
                                      />
                                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded-md flex items-center justify-center pointer-events-none">
                                        <Eye size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </div>
                                  </div>
                                  ) : (
                                    <div className="w-full h-40 sm:h-52 md:h-64 bg-gray-100 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center min-h-0">
                                      <div className="text-center text-gray-500">
                                        {loading ? (
                                          <>
                                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-400 border-t-transparent mx-auto mb-2" />
                                            <div className="text-sm">Loading image...</div>
                                          </>
                                        ) : (
                                          <>
                                            <Camera size={24} className="mx-auto mb-2" />
                                            <div className="text-sm">No image</div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {imageCount > 1 && (
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-black/50 rounded-md px-2 py-1">
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-white hover:bg-white/20"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const prevIndex = currentIndex > 0 ? currentIndex - 1 : imageCount - 1;
                                          setProgressSectionImageIndex(prev => ({ ...prev, [item.id]: prevIndex }));
                                        }}
                                      >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                      </Button>
                                      <span className="text-xs text-white tabular-nums px-1">{currentIndex + 1} / {imageCount}</span>
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-white hover:bg-white/20"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const nextIndex = currentIndex < imageCount - 1 ? currentIndex + 1 : 0;
                                          setProgressSectionImageIndex(prev => ({ ...prev, [item.id]: nextIndex }));
                                        }}
                                      >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          if (item.progressImages && item.progressImages.length > 0) {
                            const rawLatest = item.progressImages[0];
                            const isPlaceholderOrEmpty = !rawLatest || rawLatest === PROGRESS_IMAGE_PLACEHOLDER || (rawLatest.startsWith('data:image/svg') && rawLatest.length < 200);
                            const latestImage = isPlaceholderOrEmpty ? null : rawLatest;
                            if (!latestImage) {
                              const isOnDemandLoading = item.progressImagesMetadata?.length && !item.progressImages?.[0] && !isPlaceholderOrEmpty;
                              if (isOnDemandLoading) {
                                return (
                                  <div className="w-full h-40 sm:h-52 md:h-64 bg-gray-100 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center min-h-0">
                                    <div className="text-center text-gray-500">
                                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-400 border-t-transparent mx-auto mb-2" />
                                      <div className="text-sm">Loading image...</div>
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <div className="w-full h-40 sm:h-52 md:h-64 bg-gray-100 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center min-h-0">
                                  <div className="text-center text-gray-500">
                                    <Camera size={24} className="mx-auto mb-2" />
                                    <div className="text-sm">{isPlaceholderOrEmpty ? 'No progress image' : 'Image not found'}</div>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div className="space-y-2 rounded-md border border-indigo-100 border-t bg-white">
                                <div className="relative">
                                  <div
                                    className="relative cursor-pointer group"
                                    onClick={() => {
                                      setShowImagePreview({ url: latestImage, equipmentId: item.id, currentIndex: 0 });
                                    }}
                                  >
                                    <img
                                      src={latestImage}
                                      alt="Progress"
                                      className="w-full max-w-full h-40 sm:h-52 md:h-64 object-cover rounded-md border border-gray-200 pointer-events-none"
                                    />
                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded-md flex items-center justify-center pointer-events-none">
                                      <Eye size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="w-full h-40 sm:h-52 md:h-64 bg-gray-100 border-2 border-dashed border-gray-300 rounded-md border border-indigo-100 flex items-center justify-center min-h-0">
                              <div className="text-center text-gray-500">
                                <Camera size={24} className="mx-auto mb-2" />
                                <div className="text-sm">No progress image</div>
                              </div>
                            </div>
                          );
                        })()}
                        </div>
                        {/* Progress bar & caption below image (direction for image) */}
                        <div className="mt-2 pt-2 border-t border-indigo-100/80">
                              <div className="text-[9px] sm:text-[10px] text-gray-500 font-medium mb-1">Overall progress</div>
                              <div className="mt-1">
                                <div className="h-2.5 w-full rounded-full overflow-hidden bg-gray-200">
                                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-300" style={{ width: `${displayProgress}%` }} />
                      </div>
                  </div>
                              <div className="mt-2 pt-2 border-t border-indigo-100/50">
                                <div className="text-[9px] sm:text-[10px] text-gray-500 font-medium mb-1">Recently completed</div>
                              <div className="flex items-center justify-between gap-2 mt-0.5">
                                {lastCompleted?.activity_name && lastCompleted?.completion?.completed_on ? (
                                  <p className="text-[9px] sm:text-[10px] text-gray-500 min-w-0 flex-1">
                                    {lastCompleted.activity_name}, completed on {formatDateOnly(lastCompleted.completion.completed_on)}
                                  </p>
                                ) : (
                                  <span className="flex-1" />
                                )}
                                  <Button
                                    type="button"
                                    size="sm"
                                    className={`flex-shrink-0 h-7 px-3 text-[10px] sm:text-xs font-semibold text-white border-0 transform -translate-y-0.5 ${
                                      (equipmentActivities[item.id] && equipmentActivities[item.id].length)
                                        ? 'bg-blue-600 hover:bg-blue-700'
                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setQapPopupEquipmentId(item.id);
                                    }}
                                  >
                                    {(equipmentActivities[item.id] && equipmentActivities[item.id].length)
                                      ? 'Track QAP Status'
                                      : 'Start QAP Tracking'}
                                  </Button>
                          </div>
                        </div>
                                          </div>
                                      </div>
                                  );
                                })()}
                          </div>
                        )}
                      </div>





                  <div className="mt-1 sm:mt-2 space-y-2 flex-1 flex flex-col">
                      <div className="space-y-2 text-xs sm:text-sm flex-1 flex flex-col">
                        {editingEquipmentId === item.id ? (
                          // Edit Mode - Upload Documents (click or drag & drop)
                          <div className="space-y-3">
                            <div
                              className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center"
                              onClick={e => e.stopPropagation()}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const files = Array.from(e.dataTransfer.files || []);
                                if (files.length > 0) handleDocumentUpload(item.id, files);
                              }}
                            >
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || []);
                                  if (files.length > 0) handleDocumentUpload(item.id, files);
                                  e.target.value = '';
                                }}
                                className="hidden"
                                id={`doc-camera-${item.id}`}
                              />
                              <input
                                type="file"
                                multiple
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.jpg,.jpeg,.png,image/*"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || []);
                                  if (files.length > 0) handleDocumentUpload(item.id, files);
                                  e.target.value = '';
                                }}
                                className="hidden"
                                id={`doc-gallery-${item.id}`}
                              />
                              <label
                                htmlFor={`doc-gallery-${item.id}`}
                                className="cursor-pointer flex flex-col items-center justify-center gap-1.5 py-3 text-gray-600 hover:text-gray-800"
                                onClick={e => e.stopPropagation()}
                              >
                                <FileText size={28} className="mx-auto text-gray-400" strokeWidth={1.5} />
                                <div className="text-sm font-medium text-gray-600">Click or drag to upload documents</div>
                                <div className="text-xs text-gray-500">PDF, DOC, XLS, DWG, Images supported</div>
                              </label>
                            </div>
                            {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && (
                              <div className="flex flex-row items-center gap-2" onClick={e => e.stopPropagation()}>
                                <label
                                  htmlFor={`doc-gallery-${item.id}`}
                                  className="cursor-pointer inline-block rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
                                  onClick={e => e.stopPropagation()}
                                >
                                  Choose Files
                                </label>
                                <span className="text-sm text-gray-500">No file chosen</span>
                              </div>
                            )}

                            {/* Existing Equipment Documents Display */}
                            {documents[item.id] && filterDocsByUserDepartmentAccess(documents[item.id] || [])
                              .filter((doc) => {
                                // Filter out Core Documents - they should only appear in Details tab
                                const coreDocumentTypes = ['Unpriced PO File', 'Design Inputs PID', 'Client Reference Doc', 'Other Documents'];
                                return !coreDocumentTypes.includes(doc.document_type || '');
                              })
                              .length > 0 && (
                              <div className="mt-2 p-3 bg-green-50 border border-green-200 border-t-2 border-t-green-300 rounded-md">
                                <p className="text-sm font-medium text-green-800 mb-2">Existing Equipment Documents:</p>
                                <div className="space-y-1">
                                  {filterDocsByUserDepartmentAccess(documents[item.id] || [])
                                    .filter((doc) => {
                                      // Filter out Core Documents - they should only appear in Details tab
                                      const coreDocumentTypes = ['Unpriced PO File', 'Design Inputs PID', 'Client Reference Doc', 'Other Documents'];
                                      return !coreDocumentTypes.includes(doc.document_type || '');
                                    })
                                    .map((doc) => (
                                    <div key={doc.id} className="flex items-center justify-between text-sm">
                                      <div className="flex items-center space-x-2">
                                        <FileText size={14} className="text-green-600" />
                                        <span className="text-green-700">{doc.name}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleOpenDocument(doc, item.id)}
                                          className="text-green-600 hover:text-green-800 p-1 h-6 w-6"
                                        >
                                          <Eye size={12} />
                                        </Button>

                                        {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && (
                                          <>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => {
                                                const newName = prompt('Enter document name:', doc.name);
                                                if (newName && newName.trim()) {
                                                  handleDocumentNameChange(item.id, doc.id, newName.trim());
                                                }
                                              }}
                                              className="text-green-600 hover:text-green-800 p-1 h-6 w-6"
                                            >
                                              <Edit size={12} />
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => handleDeleteDocument(item.id, doc.id)}
                                              className="text-red-600 hover:text-red-700 p-1 h-6 w-6"
                                            >
                                              <X size={12} />
                                            </Button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Uploaded Documents List */}
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-700">Upload New Documents:</div>
                              <div className="h-36 overflow-y-auto border border-gray-200 rounded bg-gray-50 p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {(() => {
                                  // // console.log('📄 EDIT MODE: Checking documents for equipment:', item.id);
                                  // // console.log('📄 EDIT MODE: Documents state:', documents);
                                  // // console.log('📄 EDIT MODE: Documents for this equipment:', documents[item.id]);
                                  // // console.log('📄 EDIT MODE: Documents length:', documents[item.id]?.length || 0);
                                  // // console.log('📄 EDIT MODE: Documents loading:', documentsLoading[item.id]);
                                  return null;
                                })()}
                                {documentsLoading[item.id] ? (
                                  <div className="p-4 space-y-3">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-500 italic">Upload new documents using the file input above</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          // View Mode - Show Documents
                          <>
                            {/* QA Document Dashboard – design from screenshot (collapsed/expanded) + department subtabs */}
                              {(() => {
                              const docsList = filterDocsByUserDepartmentAccess(documents[item.id] || []);
                              const selectedDept = qaDashboardDepartmentByEquipment[item.id] ?? 'All';
                              const docsListFiltered = filterDocsByDepartment(docsList, selectedDept);
                              const hasOtherDocs = docsList.some((d: any) => !d.department);
                              const deptTabs = ['All', ...qaDashboardDepartments, ...(hasOtherDocs ? ['Other'] : [])];
                              const activities = equipmentActivities[item.id] || [];
                              const totalDocuments = docsListFiltered.length;
                              const completionsWithReports = activities.filter((a: any) => (a.completion?.inspection_report_count ?? 0) > 0);
                              const completionsWithReportsFiltered = selectedDept === 'All' ? completionsWithReports : selectedDept === 'Other' ? completionsWithReports.filter((a: any) => !(a.completion?.department ?? '').trim()) : completionsWithReports.filter((a: any) => (a.completion?.department ?? '').trim() === selectedDept);
                              const inspectionReportsCount = completionsWithReportsFiltered.reduce((sum: number, a: any) => sum + (a.completion?.inspection_report_count ?? 0), 0);
                              const checklistTasks = productionChecklistByEquipment[item.id] ?? [];
                              const completedChecklist = checklistTasks.filter((t: any) => !!t.completion).length;
                              const totalChecklist = checklistTasks.length;
                              const checklistPct = totalChecklist > 0 ? Math.round((completedChecklist / totalChecklist) * 100) : 0;
                              const pendingTasksCount = Math.max(0, totalChecklist - completedChecklist);
                              const isQADashboardExpanded = qaDashboardExpandedByEquipment[item.id] ?? false;
                              const toggleQADashboard = () => setQADashboardExpandedByEquipment(prev => ({ ...prev, [item.id]: !(prev[item.id] ?? false) }));
                              const handleViewLess = () => toggleQADashboard();
                              const codeLabels = ['Code 1', 'Code 2', 'Code 3', 'Code 4'] as const;
                              const getCodeCount = (code: string) => docsListFiltered.filter((d: any) => (d.vdcr_code_status || '') === code).length;
                              const getCodeLastUpdated = (code: string) => {
                                const codeDocs = docsListFiltered.filter((d: any) => (d.vdcr_code_status || '') === code);
                                if (codeDocs.length === 0) return null;
                                const withDate = codeDocs.map((d: any) => d.updated_at || d.created_at).filter(Boolean);
                                if (withDate.length === 0) return null;
                                const latest = new Date(Math.max(...withDate.map((d: string) => new Date(d).getTime())));
                                const diffMs = Date.now() - latest.getTime();
                                const hours = Math.floor(diffMs / (1000 * 60 * 60));
                                if (hours < 1) return 'Updated just now';
                                if (hours < 24) return `Updated ${hours}h ago`;
                                const days = Math.floor(hours / 24);
                                return days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`;
                              };
                              const otherRefsCount = docsListFiltered.filter((d: any) => !codeLabels.includes((d.vdcr_code_status || '') as any)).length;
                              const setSelectedDept = (dept: string) => setQaDashboardDepartmentByEquipment(prev => ({ ...prev, [item.id]: dept }));
                                  return (
                                <div className="mt-1.5 pt-2 border-t border-gray-200">
                                  <div className="flex items-center justify-between gap-2 px-0 py-1 mb-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
                                        <FileStack className="w-3.5 h-3.5 text-gray-600" />
                                      </div>
                                      <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Documentation Control</h3>
                                    </div>
                                    <button type="button" className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" aria-label="Options">
                                      <MoreVertical className="w-4 h-4" />
                                    </button>
                                  </div>
                                  {/* Department subtabs – max 5 visible, bar length fixed, more breathing room; arrows when more than 5 */}
                                  {deptTabs.length > 1 && (() => {
                                    const MAX_VISIBLE = 5;
                                    const totalTabs = deptTabs.length;
                                    const selectedIndex = deptTabs.indexOf(selectedDept);
                                    let rawStart = qaDashboardDeptWindowStart[item.id] ?? 0;
                                    rawStart = Math.max(0, Math.min(rawStart, Math.max(0, totalTabs - MAX_VISIBLE)));
                                    const effectiveStart = selectedIndex >= 0 && (selectedIndex < rawStart || selectedIndex >= rawStart + MAX_VISIBLE)
                                      ? Math.max(0, Math.min(selectedIndex, Math.max(0, totalTabs - MAX_VISIBLE)))
                                      : rawStart;
                                    const visibleTabs = totalTabs <= MAX_VISIBLE ? deptTabs : deptTabs.slice(effectiveStart, effectiveStart + MAX_VISIBLE);
                                    const n = visibleTabs.length;
                                    const activeIdxInWindow = visibleTabs.indexOf(selectedDept);
                                    const showArrows = totalTabs > MAX_VISIBLE;
                                    const canGoLeft = effectiveStart > 0;
                                    const canGoRight = effectiveStart + MAX_VISIBLE < totalTabs;
                                    const goLeft = () => setQaDashboardDeptWindowStart(prev => ({ ...prev, [item.id]: Math.max(0, effectiveStart - 1) }));
                                    const goRight = () => setQaDashboardDeptWindowStart(prev => ({ ...prev, [item.id]: Math.min(totalTabs - MAX_VISIBLE, effectiveStart + 1) }));
                                    return (
                                      <div className="mb-4 flex w-full items-center gap-1">
                                        {showArrows && (
                                          <button
                                            type="button"
                                            onClick={goLeft}
                                            disabled={!canGoLeft}
                                            className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                            aria-label="Previous departments"
                                          >
                                            <ChevronLeft className="w-4 h-4" />
                                          </button>
                                        )}
                                        <nav
                                          className="relative flex flex-1 min-w-0 overflow-hidden rounded-full bg-gray-100/90 p-1"
                                          aria-label="Department tabs"
                                        >
                                          <div
                                            className="absolute top-0.5 bottom-0.5 rounded-full bg-white shadow-sm transition-[left,width] duration-300 ease-out"
                                            style={{
                                              left: `calc(2px + (100% - 4px) * ${activeIdxInWindow} / ${n})`,
                                              width: `calc((100% - 4px) / ${n} - 2px)`
                                            }}
                                            aria-hidden
                                          />
                                          {visibleTabs.map((dept) => {
                                            const isActive = selectedDept === dept;
                                            const docCount = dept === 'All' ? docsList.length : dept === 'Other' ? docsList.filter((d: any) => !d.department).length : docsList.filter((d: any) => d.department === dept).length;
                                            const inspectionCountForDept = dept === 'All' ? completionsWithReports.reduce((s: number, a: any) => s + (a.completion?.inspection_report_count ?? 0), 0) : dept === 'Other' ? completionsWithReports.filter((a: any) => !(a.completion?.department ?? '').trim()).reduce((s: number, a: any) => s + (a.completion?.inspection_report_count ?? 0), 0) : completionsWithReports.filter((a: any) => (a.completion?.department ?? '').trim() === dept).reduce((s: number, a: any) => s + (a.completion?.inspection_report_count ?? 0), 0);
                                            const count = docCount + inspectionCountForDept;
                                            return (
                                              <button
                                                key={dept}
                                                type="button"
                                                onClick={() => setSelectedDept(dept)}
                                                className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 py-2.5 px-2 text-[11px] font-medium transition-colors whitespace-nowrap min-w-0 overflow-hidden ${
                                                  isActive ? 'text-[#2B62FF]' : 'text-gray-500 hover:text-gray-800'
                                                }`}
                                                title={dept}
                                              >
                                                <span className="truncate">{dept}</span>
                                                {count > 0 && (
                                                  <span className={`shrink-0 tabular-nums text-[10px] ${isActive ? 'text-[#2B62FF]/80' : 'text-gray-400'}`}>{count}</span>
                                                )}
                                              </button>
                                            );
                                          })}
                                        </nav>
                                        {showArrows && (
                                          <button
                                            type="button"
                                            onClick={goRight}
                                            disabled={!canGoRight}
                                            className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                            aria-label="Next departments"
                                          >
                                            <ChevronRight className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <div className="space-y-5">
                                    {/* Summary row: invert-on-hover like Code 1–4 */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      <button
                                        type="button"
                                        onClick={toggleQADashboard}
                                        className="group rounded-lg bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-[#2B62FF] hover:bg-[#2B62FF] transition-all p-3 flex flex-col gap-2 text-left min-h-[100px] w-full cursor-pointer"
                                      >
                                        <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 group-hover:bg-white/20 flex items-center justify-center flex-shrink-0 p-1 transition-colors">
                                          <div className="w-7 h-7 rounded-full bg-[#2B62FF] group-hover:bg-white flex items-center justify-center transition-colors">
                                            <FileText className="w-3.5 h-3.5 text-white group-hover:text-[#2B62FF] transition-colors" />
                            </div>
                            </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-semibold text-gray-800 group-hover:text-white leading-tight transition-colors">Total<br />Documents</p>
                                          <p className="text-xl font-bold text-gray-900 group-hover:text-white tabular-nums leading-none mt-0.5 transition-colors">{totalDocuments}</p>
                                          <p className="text-[11px] text-gray-500 group-hover:text-white/90 mt-1 leading-tight transition-colors">Across all codes</p>
                                </div>
                                        </div>
                                        <div className="mt-auto pt-1">
                                          <div className="h-1.5 w-full rounded-full overflow-hidden bg-gray-200 group-hover:bg-white/30 transition-colors">
                                            <div className="h-full rounded-full bg-[#2B62FF] group-hover:bg-white transition-all duration-300" style={{ width: `${totalDocuments > 0 ? 100 : 0}%` }} />
                                          </div>
                                        </div>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={toggleQADashboard}
                                        className="group rounded-lg bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-orange-500 hover:bg-orange-500 transition-all p-3 flex flex-col gap-2 text-left min-h-[100px] w-full cursor-pointer"
                                      >
                                        <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-full bg-orange-100 group-hover:bg-white/20 flex items-center justify-center flex-shrink-0 p-1 transition-colors">
                                          <div className="w-7 h-7 rounded-full bg-orange-500 group-hover:bg-white flex items-center justify-center transition-colors">
                                            <FileText className="w-3.5 h-3.5 text-white group-hover:text-orange-500 transition-colors" />
                                          </div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-semibold text-gray-800 group-hover:text-white leading-tight transition-colors">Inspection Reports</p>
                                          <p className="text-xl font-bold text-gray-900 group-hover:text-white tabular-nums leading-none mt-0.5 transition-colors">{inspectionReportsCount}</p>
                                          <p className="text-[11px] text-gray-500 group-hover:text-white/90 mt-1 leading-tight transition-colors">In total</p>
                                        </div>
                                        </div>
                                        <div className="mt-auto pt-1">
                                          <div className="h-1.5 w-full rounded-full overflow-hidden bg-gray-200 group-hover:bg-white/30 transition-colors">
                                            <div className="h-full rounded-full bg-orange-500 group-hover:bg-white transition-all duration-300" style={{ width: `${inspectionReportsCount > 0 ? 100 : 0}%` }} />
                                          </div>
                                        </div>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={toggleQADashboard}
                                        className="group rounded-lg bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-teal-600 hover:bg-teal-600 transition-all p-3 flex flex-col gap-2 text-left min-h-[100px] w-full cursor-pointer"
                                      >
                                        <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-full bg-teal-100 group-hover:bg-white/20 flex items-center justify-center flex-shrink-0 p-1 transition-colors">
                                          <div className="w-7 h-7 rounded-full bg-teal-600 group-hover:bg-white flex items-center justify-center transition-colors">
                                            <ClipboardList className="w-3.5 h-3.5 text-white group-hover:text-teal-600 transition-colors" />
                                          </div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-semibold text-gray-800 group-hover:text-white leading-tight transition-colors">Pending Tasks</p>
                                          <p className="text-xl font-bold text-gray-900 group-hover:text-white tabular-nums leading-none mt-0.5 transition-colors">{pendingTasksCount}</p>
                                          <p className="text-[11px] text-gray-500 group-hover:text-white/90 mt-1 leading-tight transition-colors">In production checklist</p>
                                        </div>
                                        </div>
                                        <div className="mt-auto pt-1">
                                          <div className="h-1.5 w-full rounded-full overflow-hidden bg-gray-200 group-hover:bg-white/30 transition-colors">
                                            <div className="h-full rounded-full bg-teal-600 group-hover:bg-white transition-all duration-300" style={{ width: `${pendingTasksCount > 0 ? checklistPct : 0}%` }} />
                                          </div>
                                        </div>
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 w-full whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={isQADashboardExpanded ? handleViewLess : toggleQADashboard}
                                        className="flex items-center gap-1 text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline min-w-0"
                                      >
                                        {isQADashboardExpanded ? 'View less' : 'Expand to view all'}
                                        {isQADashboardExpanded ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          invalidateRecentActivityCache(item.id);
                                          loadRecentActivityForEquipment(item.id, true);
                                          setRecentActivityUpdatesModalPage(0);
                                          setRecentActivityUpdatesModalEquipment({ equipmentId: item.id, equipmentName: item.name, tagNumber: item.tag_number });
                                        }}
                                        className="flex items-center gap-1 text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline ml-auto min-w-0"
                                      >
                                        View recent activity
                                        <ChevronDown className="w-4 h-4 flex-shrink-0" />
                                      </button>
                                    </div>
                                    {isQADashboardExpanded && (
                                      <>
                                        <div>
                                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Document Control</p>
                                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            {codeLabels.map((code) => {
                                              const count = getCodeCount(code);
                                              const lastUpdated = getCodeLastUpdated(code);
                                  return (
                                                <button
                                                  key={code}
                                                  type="button"
                                                  onClick={() => setClientsDocsCodeModal({ equipmentId: item.id, code, departmentFilter: selectedDept })}
                                                  className="group rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-blue-500 hover:bg-blue-600 transition-all p-4 flex flex-col text-left w-full h-[124px]"
                                                >
                                                  <div className="flex flex-nowrap items-center justify-between gap-2 w-full -mx-4 -mt-4 px-4 pt-4">
                                                    <span className="inline-flex items-center shrink-0 pl-4 pr-3 py-1 -ml-4 rounded-l-none rounded-r-md bg-blue-600 text-white group-hover:bg-white group-hover:text-blue-600 text-[11px] font-bold leading-none whitespace-nowrap transition-colors">
                                                      {code}
                                          </span>
                                                    <div className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center bg-blue-100 border border-gray-200/80 group-hover:bg-white/20 group-hover:border-white/40 transition-colors">
                                                      <FileText className="w-3 h-3 text-blue-600 group-hover:text-white transition-colors" />
                                                    </div>
                                                  </div>
                                                  <p className="text-2xl font-bold text-gray-900 group-hover:text-white leading-none mt-0.5 transition-colors">{count}</p>
                                                  <p className="text-xs text-gray-600 group-hover:text-white mt-1.5 leading-none transition-colors">Documents</p>
                                                  {lastUpdated && (
                                                    <p className="text-[10px] text-gray-500 group-hover:text-white/90 mt-1 leading-tight transition-colors">Manufacturing Procedure Docs<br />{lastUpdated}</p>
                                                  )}
                                                  <div className="mt-auto pt-1.5 self-start">
                                                    <span className="inline-flex items-center gap-0.5 whitespace-nowrap pl-1.5 pr-2 py-px rounded-sm border border-gray-200 bg-white text-gray-600 group-hover:bg-white group-hover:text-blue-600 group-hover:border-white text-[10px] font-normal leading-tight -ml-0.5 transition-colors">
                                                      View Docs
                                                      <ArrowRight className="w-2.5 h-2.5 text-gray-600 group-hover:text-blue-600 flex-shrink-0 transition-colors" />
                                          </span>
                                        </div>
                                                </button>
                                              );
                                            })}
                                        </div>
                                      </div>
                                        <div>
                                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Operations Tracking</p>
                                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (inspectionReportsCount === 0) {
                                                  setInspectionReportListModal({ completionId: '', reports: [] });
                                                  return;
                                                }
                                                if (completionsWithReportsFiltered.length === 1) {
                                                  setInspectionReportListLoading(true);
                                                  fastAPI.getEquipmentActivityCompletionInspectionReports(completionsWithReportsFiltered[0].completion.id, projectId === 'standalone')
                                                    .then((reports) => setInspectionReportListModal({ completionId: completionsWithReportsFiltered[0].completion.id, reports }))
                                                    .finally(() => setInspectionReportListLoading(false));
                                                } else {
                                                  setInspectionReportPickerModal({
                                                    equipmentId: item.id,
                                                    activities: completionsWithReportsFiltered.map((a: any) => ({
                                                      activityId: a.id,
                                                      activityName: a.activity_name || 'Activity',
                                                      completionId: a.completion.id,
                                                      reportCount: a.completion?.inspection_report_count ?? 0,
                                                      department: (a.completion?.department ?? '').trim() || null
                                                    }))
                                                  });
                                                }
                                              }}
                                              className="group rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-orange-500 hover:bg-orange-500 transition-all p-3 flex items-start gap-2.5 text-left w-full h-[108px]"
                                            >
                                              <div className="w-10 h-10 rounded-full bg-orange-100 group-hover:bg-white/20 flex items-center justify-center flex-shrink-0 p-1 transition-colors">
                                                <div className="w-7 h-7 rounded-full bg-orange-500 group-hover:bg-white flex items-center justify-center transition-colors">
                                                  <FileText className="w-3.5 h-3.5 text-white group-hover:text-orange-500 transition-colors" />
                                                </div>
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold text-gray-900 group-hover:text-white leading-tight transition-colors">Inspection Reports</p>
                                                <p className="text-xs text-gray-700 group-hover:text-white mt-0.5 leading-tight transition-colors">{inspectionReportsCount} Reports</p>
                                                <p className="text-[11px] font-medium text-blue-600 group-hover:text-white mt-1 flex items-center gap-0.5 transition-colors">View documents <ArrowRight className="w-3 h-3 group-hover:text-white" /></p>
                                              </div>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setClientsDocsOtherRefsModal({ equipmentId: item.id, departmentFilter: selectedDept })}
                                              className="group rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-[#2B62FF] hover:bg-[#2B62FF] transition-all p-3 flex items-start gap-2.5 text-left w-full h-[108px]"
                                            >
                                              <div className="w-10 h-10 rounded-full bg-blue-100 group-hover:bg-white/20 flex items-center justify-center flex-shrink-0 p-1 transition-colors">
                                                <div className="w-7 h-7 rounded-full bg-[#2B62FF] group-hover:bg-white flex items-center justify-center transition-colors">
                                                  <FileText className="w-3.5 h-3.5 text-white group-hover:text-[#2B62FF] transition-colors" />
                                      </div>
                                    </div>
                                              <div className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold text-gray-900 group-hover:text-white leading-tight transition-colors">TPI, Audits & other doc</p>
                                                <p className="text-xs text-gray-700 group-hover:text-white mt-0.5 leading-tight transition-colors">{otherRefsCount} Documents</p>
                                                <p className="text-[11px] font-medium text-blue-600 group-hover:text-white mt-1 flex items-center gap-0.5 transition-colors">View Documents <ArrowRight className="w-3 h-3 group-hover:text-white" /></p>
                                              </div>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setClientsDocsChecklistModal({ equipmentId: item.id })}
                                              className="group rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-teal-600 hover:bg-teal-600 transition-all p-3 flex items-start gap-2.5 text-left w-full h-[108px]"
                                            >
                                              <div className="w-10 h-10 rounded-full bg-teal-100 group-hover:bg-white/20 flex items-center justify-center flex-shrink-0 p-1 transition-colors">
                                                <div className="w-7 h-7 rounded-full bg-teal-600 group-hover:bg-white flex items-center justify-center transition-colors">
                                                  <ClipboardCheck className="w-3.5 h-3.5 text-white group-hover:text-teal-600 transition-colors" />
                                                </div>
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold text-gray-900 group-hover:text-white leading-tight transition-colors">Production & Pre-Dispatch Checklist</p>
                                                <p className="text-xs font-semibold text-teal-600 group-hover:text-white mt-0.5 transition-colors">{checklistPct}%</p>
                                                <p className="text-[11px] font-medium text-blue-600 group-hover:text-white mt-1 flex items-center gap-0.5 transition-colors">Continue <ArrowRight className="w-3 h-3 group-hover:text-white" /></p>
                                              </div>
                                            </button>
                                          </div>
                                        </div>
                                      </>
                              )}
                            </div>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                  </div>

                  {/* Dossier Report – below tabs, above edit/view action buttons (hidden while editing) */}
                  {onOpenDossierReport && editingEquipmentId !== item.id && (
                    <div className="mt-3 mb-2">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDossierReport({ projectId, equipmentId: item.id, projectName, equipment: item });
                        }}
                        className="w-full font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg transition-all py-2 text-xs sm:text-sm"
                      >
                        <BookMarked className="w-4 h-4 mr-2 flex-shrink-0" />
                        Dossier Report
                      </Button>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-row flex-wrap gap-2 mt-5 mt-auto">
                    {editingEquipmentId === item.id ? (
                      // Edit Mode - Show Save/Cancel
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 text-xs sm:text-sm"
                          onClick={handleCancelEdit}
                        >
                          <X size={14} className="mr-1" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm"
                          onClick={handleSaveEquipment}
                          disabled={loadingStates[`save-${editingEquipmentId}`]}
                        >
                          {loadingStates[`save-${editingEquipmentId}`] ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></div>
                              Saving...
                            </>
                          ) : (
                            <>
                              <Check size={14} className="mr-1" />
                              Save
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      // View Mode - Show View (standalone only)/Edit/Complete/Delete
                      <>
                        {/* View button - only for standalone equipment */}
                        {projectId === 'standalone' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 bg-white hover:bg-blue-50 border-blue-200 hover:border-blue-300 text-blue-700 text-xs sm:text-sm"
                            onClick={() => {
                              markAsSeen(`equipment_${item.id}`);
                              markAsSeen(`equipment_${item.id}_overview`);
                              if (onViewDetails) {
                                onViewDetails();
                              } else {
                                // Set viewing equipment ID to show details view
                                setViewingEquipmentId(item.id);
                              }
                            }}
                          >
                            <Eye size={14} className="mr-1" />
                            View
                          </Button>
                        )}

                        {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 bg-white hover:bg-blue-50 border-blue-200 hover:border-blue-300 text-blue-700 text-xs sm:text-sm"
                              onClick={() => {
                                setEditingEquipmentId(item.id);
                                const formData = {
                                  location: item.location || '',
                                  supervisor: item.supervisor || '',
                                  nextMilestone: item.nextMilestone || '',
                                  size: item.size || '',
                                  weight: item.weight || '',
                                  designCode: item.designCode || '',
                                  material: item.material || '',
                                  workingPressure: item.workingPressure || '',
                                  designTemp: item.designTemp || '',
                                  welder: item.welder || '',
                                  engineer: item.engineer || '',
                                  qcInspector: item.qcInspector || '',
                                  projectManager: item.projectManager || '',
                                  poCdd: item.poCdd || '',
                                  status: item.status || 'on-track',
                                  customFields: item.customFields || [],
                                  certificationTitle: item.certificationTitle || ''
                                };
                                // // console.log('🔧 Setting editFormData with custom fields:', formData);
                                setEditFormData(formData);
                              }}
                            >
                              <Edit size={14} className="mr-1" />
                              Edit
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 bg-white hover:bg-green-50 border-green-200 hover:border-green-300 text-green-700 text-xs sm:text-sm"
                              onClick={() => handleMarkComplete(item)}
                              disabled={loadingStates[`complete-${item.id}`]}
                            >
                              {loadingStates[`complete-${item.id}`] ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin mr-1"></div>
                                  Completing...
                                </>
                              ) : (
                                <>
                                  <Check size={14} className="mr-1" />
                                  Complete
                                </>
                              )}
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 bg-white hover:bg-red-50 border-red-200 hover:border-red-300 text-red-700 text-xs sm:text-sm"
                              onClick={() => handleDeleteEquipment(item)}
                              disabled={loadingStates[`delete-${item.id}`]}
                            >
                              {loadingStates[`delete-${item.id}`] ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin mr-1"></div>
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <X size={14} className="mr-1" />
                                  Delete
                                </>
                              )}
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Card>
              ));
            })()}
        </div>
          
          {/* Pagination Controls */}
          {(() => {
            const filteredAndSorted = localEquipment
              .filter(eq => {
                const phaseMatch = selectedPhase === 'all' ? true : eq.progressPhase === selectedPhase;
                if (!phaseMatch) return false;
                if (searchQuery.trim()) {
                  const searchLower = searchQuery.toLowerCase();
                  return (eq.type || '').toLowerCase().includes(searchLower) ||
                    (eq.name || '').toLowerCase().includes(searchLower) ||
                    (eq.tagNumber || '').toLowerCase().includes(searchLower) ||
                    (eq.jobNumber || '').toLowerCase().includes(searchLower) ||
                    (eq.manufacturingSerial || '').toLowerCase().includes(searchLower);
                    (eq.poCdd || '').toLowerCase().includes(searchLower) ||
                    (eq.poNumber || (eq as any).po_number || '').toLowerCase().includes(searchLower) ||
                    ((eq.custom_fields?.find((f: any) => f.name === 'PO Number')?.value) || '').toLowerCase().includes(searchLower);
                }
                return true;
              })
              .sort((a, b) => {
                if (a.lastUpdate && b.lastUpdate) {
                  const dateA = new Date(a.lastUpdate);
                  const dateB = new Date(b.lastUpdate);
                  return dateB.getTime() - dateA.getTime();
                }
                return b.id.localeCompare(a.id);
              });
            
            const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
            const totalItems = filteredAndSorted.length;
            
            if (totalPages <= 1) return null;
            
            return (
              <div className="flex flex-col gap-3 mt-6 pt-4 border-t border-gray-200 md:flex-row md:items-center md:justify-between md:gap-0">
                <div className="text-sm text-gray-600 text-center md:text-left order-2 md:order-1">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} equipment
                </div>
                <div className="flex items-center justify-center gap-1.5 flex-wrap md:justify-end md:gap-2 order-1 md:order-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed sm:px-3 sm:text-sm"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`min-w-[2rem] px-2 py-1.5 text-xs font-medium rounded-md sm:min-w-0 sm:px-3 sm:text-sm ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed sm:px-3 sm:text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
        </>
      )}

      {/* Image Preview Modal */}
      {showImagePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[120]" onClick={() => {
          setShowImagePreview(null);
        }}>
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Progress Image</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowImagePreview(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </Button>
            </div>
            <div className="relative">
              {/* Single latest progress image (no navigation) */}
              <img
                src={showImagePreview.url}
                alt="Progress"
                className="w-full h-auto rounded-lg border border-gray-200"
              />

              <div className="space-y-2 mt-4">
                <div className="text-sm text-gray-600">
                  <strong>Description:</strong> {(() => {
                    const currentEquipment = localEquipment.find(eq => eq.id === showImagePreview.equipmentId);
                    const metadata = currentEquipment?.progressImagesMetadata || [];
                    const currentMetadata = metadata[0];

                    return currentMetadata?.description || "Progress image";
                  })()}
                </div>
                <div className="text-sm text-gray-600">
                  <strong>Uploaded by:</strong> {(() => {
                    const currentEquipment = localEquipment.find(eq => eq.id === showImagePreview.equipmentId);
                    const metadata = currentEquipment?.progressImagesMetadata || [];
                    const currentMetadata = metadata[0] as { created_by_user?: { full_name?: string }; uploaded_by?: string } | undefined;
                    return currentMetadata?.created_by_user?.full_name || currentMetadata?.uploaded_by || "Team Member";
                  })()}
                </div>
                <div className="text-sm text-gray-600">
                  <strong>Date:</strong> {(() => {
                    const currentEquipment = localEquipment.find(eq => eq.id === showImagePreview.equipmentId);
                    const metadata = currentEquipment?.progressImagesMetadata || [];
                    const currentMetadata = metadata[0];

                    if (currentMetadata?.upload_date) {
                      const date = new Date(currentMetadata.upload_date);
                      return date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true,
                        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                      });
                    }
                    return new Date().toLocaleString('en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true,
                      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step image larger preview (QAP step image click) with left/right navigation */}
      {stepImagePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[110]" onClick={() => setStepImagePreview(null)}>
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Step image</h3>
              <Button variant="ghost" size="sm" onClick={() => setStepImagePreview(null)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </Button>
            </div>
            <div className="relative">
              {stepImagePreview.imageCount > 1 && (
                <div className="text-center text-sm text-gray-600 mb-3">
                  {stepImagePreview.currentIndex + 1} of {stepImagePreview.imageCount}
                </div>
              )}
              {(() => {
                const { completionId, currentIndex, imageCount } = stepImagePreview;
                const cacheKey = `${completionId}_${currentIndex}`;
                const imageUrl = stepImageCache[cacheKey];
                const loading = stepImageLoading[cacheKey];
                if (!imageUrl) {
                  return (
                    <div className="w-full min-h-[300px] bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                      <div className="text-center text-gray-500 py-12">
                        {loading ? (
                          <>
                            <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-400 border-t-transparent mx-auto mb-3" />
                            <div className="text-sm">Loading image...</div>
                          </>
                        ) : (
                          <div className="text-sm">No image</div>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <img src={imageUrl} alt="Step" className="w-full h-auto rounded-lg border border-gray-200" />
                );
              })()}
              {/* Left/Right arrows when step has multiple images */}
              {stepImagePreview.imageCount > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const prevIndex = stepImagePreview.currentIndex > 0 ? stepImagePreview.currentIndex - 1 : stepImagePreview.imageCount - 1;
                      setStepImagePreview({ ...stepImagePreview, currentIndex: prevIndex });

                      // Ensure the new index image is fetched if not already in cache
                      const cacheKey = `${stepImagePreview.completionId}_${prevIndex}`;
                      if (!stepImageCache[cacheKey]) {
                        setStepImageLoading(prev => ({ ...prev, [cacheKey]: true }));
                        fastAPI
                          .getEquipmentActivityCompletionImageUrl(
                            stepImagePreview.completionId,
                            prevIndex,
                            projectId === 'standalone'
                          )
                          .then((url) => {
                            if (url) {
                              setStepImageCache(prev => ({ ...prev, [cacheKey]: url }));
                            }
                          })
                          .finally(() => {
                            setStepImageLoading(prev => ({ ...prev, [cacheKey]: false }));
                          });
                      }
                    }}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white border-gray-300 shadow-lg z-20"
                  >
                    <ChevronLeft size={24} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const nextIndex = stepImagePreview.currentIndex < stepImagePreview.imageCount - 1 ? stepImagePreview.currentIndex + 1 : 0;
                      setStepImagePreview({ ...stepImagePreview, currentIndex: nextIndex });

                      // Ensure the new index image is fetched if not already in cache
                      const cacheKey = `${stepImagePreview.completionId}_${nextIndex}`;
                      if (!stepImageCache[cacheKey]) {
                        setStepImageLoading(prev => ({ ...prev, [cacheKey]: true }));
                        fastAPI
                          .getEquipmentActivityCompletionImageUrl(
                            stepImagePreview.completionId,
                            nextIndex,
                            projectId === 'standalone'
                          )
                          .then((url) => {
                            if (url) {
                              setStepImageCache(prev => ({ ...prev, [cacheKey]: url }));
                            }
                          })
                          .finally(() => {
                            setStepImageLoading(prev => ({ ...prev, [cacheKey]: false }));
                          });
                      }
                    }}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white border-gray-300 shadow-lg z-20"
                  >
                    <ChevronRight size={24} />
                  </Button>
                </>
              )}
                  </div>
          </div>
        </div>
      )}

      {/* Clients Documentations: pick which activity's inspection reports to open */}
      {inspectionReportPickerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[110]" onClick={() => setInspectionReportPickerModal(null)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Inspection reports – choose activity</h3>
              <Button variant="ghost" size="sm" onClick={() => setInspectionReportPickerModal(null)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </Button>
            </div>
            {(() => {
              const activities = inspectionReportPickerModal.activities;
              const byDept = activities.reduce((acc: Record<string, typeof activities>, act) => {
                const dept = (act.department && act.department.trim()) || 'Other';
                if (!acc[dept]) acc[dept] = [];
                acc[dept].push(act);
                return acc;
              }, {});
              const deptOrder = Object.keys(byDept).sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
              return (
                <div className="space-y-4">
                  {deptOrder.map((dept) => (
                    <div key={dept}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{dept}</p>
                      <ul className="space-y-2">
                        {byDept[dept].map((act) => (
                          <li key={act.activityId}>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-start text-left h-auto py-2"
                              onClick={() => {
                                setInspectionReportListLoading(true);
                                setInspectionReportPickerModal(null);
                                fastAPI.getEquipmentActivityCompletionInspectionReports(act.completionId, projectId === 'standalone')
                                  .then((reports) => setInspectionReportListModal({ completionId: act.completionId, reports }))
                                  .finally(() => setInspectionReportListLoading(false));
                              }}
                            >
                              <FileText className="w-4 h-4 mr-2 flex-shrink-0" />
                              {act.activityName} <span className="text-gray-500 ml-1">({act.reportCount})</span>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Inspection report list modal (choose which report to open) */}
      {inspectionReportListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[110]" onClick={() => setInspectionReportListModal(null)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Inspection reports</h3>
              <Button variant="ghost" size="sm" onClick={() => setInspectionReportListModal(null)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </Button>
            </div>
            {inspectionReportListModal.reports.length === 0 ? (
              <p className="text-sm text-gray-500">No documents in this category.</p>
            ) : (
            <ul className="space-y-2">
              {inspectionReportListModal.reports.map((r, idx) => (
                <li key={r.id}>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left h-auto py-2"
                    disabled={!r.report_url}
                    onClick={() => {
                      if (r.report_url) {
                        setInspectionReportPreview({ reportUrl: r.report_url, fileName: r.file_name || `Inspection report ${idx + 1}.pdf` });
                        setInspectionReportListModal(null);
                      }
                    }}
                  >
                    <FileText className="w-4 h-4 mr-2 flex-shrink-0" />
                    {r.file_name || `Inspection report ${idx + 1}`}
                  </Button>
                </li>
              ))}
            </ul>
            )}
          </div>
        </div>
      )}

      {/* Inspection report PDF preview modal — PDF.js canvas (iframe often blank for storage URLs) */}
      {inspectionReportPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[110]" onClick={() => setInspectionReportPreview(null)}>
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-gray-800 truncate min-w-0 flex-1">{inspectionReportPreview.fileName}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openInNewTabReliable(inspectionReportPreview.reportUrl)}
                  className="text-gray-700"
                >
                  Open in new tab
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = inspectionReportPreview.reportUrl;
                    a.download = inspectionReportPreview.fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white border-0"
                >
                  <Download size={16} className="mr-2" />
                  Download
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setInspectionReportPreview(null)} className="text-gray-500 hover:text-gray-700">
                  <X size={20} />
                </Button>
              </div>
            </div>
            {inspectionReportPdfTotalPages > 1 && !inspectionReportPdfLoading && !inspectionReportPdfError && (
              <div className="flex items-center justify-center gap-3 mb-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={inspectionReportPdfPage <= 1}
                  onClick={() => setInspectionReportPdfPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600 tabular-nums">
                  Page {inspectionReportPdfPage} / {inspectionReportPdfTotalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={inspectionReportPdfPage >= inspectionReportPdfTotalPages}
                  onClick={() => setInspectionReportPdfPage((p) => Math.min(inspectionReportPdfTotalPages, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
            <div className="border border-gray-200 rounded-lg overflow-auto bg-gray-100 flex flex-col items-center justify-start min-h-[400px] max-h-[70vh] p-2 sm:p-3">
              {inspectionReportPdfLoading && (
                <div className="flex flex-col items-center gap-2 py-16 text-gray-600">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <span className="text-sm">Loading PDF…</span>
                </div>
              )}
              {!inspectionReportPdfLoading && inspectionReportPdfError && (
                <div className="p-8 text-center text-sm text-gray-700 max-w-md">
                  {inspectionReportPdfError}
                </div>
              )}
              {!inspectionReportPdfLoading && !inspectionReportPdfError && inspectionReportPdfDoc && (
                <canvas id="inspection-report-pdf-canvas" className="max-w-full h-auto block" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clients Documentations: Code 1 / Code 2 / Code 3 / Code 4 docs list */}
      {clientsDocsCodeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setClientsDocsCodeModal(null)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">{clientsDocsCodeModal.code} docs</h3>
              <Button variant="ghost" size="sm" onClick={() => setClientsDocsCodeModal(null)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </Button>
            </div>
            {renderClientsDocsCodeContent(clientsDocsCodeModal.equipmentId, clientsDocsCodeModal.code, clientsDocsCodeModal.departmentFilter)}
          </div>
        </div>
      )}

      {/* Clients Documentations: Other reference / internal drawings & documents */}
      {clientsDocsOtherRefsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setClientsDocsOtherRefsModal(null)}>
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full mx-2 sm:mx-4 max-h-[85vh] sm:max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-800 pr-2">Other reference / internal drawings & documents</h3>
              <Button variant="ghost" size="sm" onClick={() => setClientsDocsOtherRefsModal(null)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </Button>
            </div>
            {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && (
              <div className="mb-4">
                <Button
                  size="sm"
                  onClick={() => {
                    setClientsDocsOtherRefsModal(null);
                    setEditingEquipmentId(clientsDocsOtherRefsModal.equipmentId);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-3 rounded-md"
                >
                  <Plus size={14} className="mr-1.5" />
                  Add Document
                </Button>
              </div>
            )}
            {renderClientsDocsOtherRefsContent(clientsDocsOtherRefsModal.equipmentId, clientsDocsOtherRefsModal.departmentFilter)}
          </div>
        </div>
      )}

      {/* Clients Documentations: Production & pre-dispatch checklist */}
      {clientsDocsChecklistModal && (
        <ProductionChecklistModal
          equipmentId={clientsDocsChecklistModal.equipmentId}
          equipmentTag={localEquipment.find((e: Equipment) => e.id === clientsDocsChecklistModal.equipmentId)?.tagNumber}
          equipmentName={localEquipment.find((e: Equipment) => e.id === clientsDocsChecklistModal.equipmentId)?.name}
          projectId={projectId ?? ''}
          isStandalone={projectId === 'standalone'}
          tasks={productionChecklistByEquipment[clientsDocsChecklistModal.equipmentId] ?? []}
          currentUserId={user?.id ?? null}
          currentUserDisplayName={(localStorage.getItem('userName') || (user as any)?.full_name || user?.email) ?? null}
          onClose={() => setClientsDocsChecklistModal(null)}
          onRefresh={async (prefetchedTasks) => {
            const id = clientsDocsChecklistModal.equipmentId;
            const list =
              prefetchedTasks ??
              (projectId === 'standalone'
                ? await fastAPI.getStandaloneEquipmentProductionChecklistTasks(id)
                : await fastAPI.getEquipmentProductionChecklistTasks(id));
            setProductionChecklistByEquipment((prev) => ({ ...prev, [id]: list }));
          }}
        />
      )}

      {/* Recent Activity detail modal (z-[60]) – Documentation: Uploaded By, Department, View doc; QAP: Completed by, Department, Update by */}
      {recentActivityDetailModal && (() => {
        const log = recentActivityDetailModal.log;
        const t = log.activity_type || '';
        const isDoc = t === 'document_uploaded' || t === 'document_updated';
        const isQAP = t === 'activity_completed';
        const isVDCR = (t || '').startsWith('vdcr_');
        const dateStr = log.created_at ? new Date(log.created_at).toLocaleString() : '—';
        const vdcrDocName = log.metadata?.documentName || log.vdcr_record?.document_name || 'Document';
        return (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60]" onClick={() => setRecentActivityDetailModal(null)}>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{isDoc ? 'Documentation update' : isQAP ? 'QAP update' : isVDCR ? 'Documentation phase' : 'Activity detail'}</h3>
                <Button variant="ghost" size="sm" onClick={() => setRecentActivityDetailModal(null)} className="text-gray-500 hover:text-gray-700">
                  <X size={20} />
                </Button>
              </div>
              {recentActivityDetailModal.equipmentTag && (
                <p className="text-sm text-gray-500 mb-3">Equipment: {recentActivityDetailModal.equipmentName || recentActivityDetailModal.equipmentTag} ({recentActivityDetailModal.equipmentTag})</p>
              )}
              <p className="text-sm text-gray-700 mb-4">{log.action_description || '—'}</p>
              <p className="text-xs text-gray-500 mb-1">Date & time</p>
              <p className="text-sm text-gray-700 mb-4">{dateStr}</p>

              {isDoc && (
                <>
                  <p className="text-xs text-gray-500 mb-1">Uploaded by</p>
                  <p className="text-sm text-gray-700 mb-3">{log.created_by_user?.full_name || log.created_by_user?.email || '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Department</p>
                  <p className="text-sm text-gray-700 mb-3">{log.metadata?.department ?? '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Remarks</p>
                  <p className="text-sm text-gray-700 mb-3">{log.metadata?.remarks ?? '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Notable remarks</p>
                  <p className="text-sm text-gray-700 mb-4">{log.metadata?.notable_change_title ?? log.metadata?.notableRemarks ?? '—'}</p>
                  <div className="pt-4 border-t border-gray-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const equipmentId = recentActivityDetailModal.equipmentId;
                        const docId = log.metadata?.document_id;
                        setRecentActivityDetailModal(null);
                        if (docId) {
                          const name = log.metadata?.fileName || log.metadata?.documentName || 'Document';
                          setDocumentUrlModal({ name, loading: true, documentId: docId });
                          try {
                            const data = await getDocumentUrlById(docId, projectId === 'standalone');
                            if (!data?.document_url) {
                              setDocumentUrlModal(null);
                              toast({ title: 'Error', description: 'Could not load document.', variant: 'destructive' });
                              return;
                            }
                            setDocumentUrlModal({ url: data.document_url, name: data.document_name || name, uploadedBy: (data as any).uploaded_by_user?.full_name || data.uploaded_by, uploadDate: data.upload_date, previewLoading: true });
                            fetchAndSetBlobUrl(data.document_url);
                          } catch {
                            setDocumentUrlModal(null);
                            toast({ title: 'Error', description: 'Could not load document.', variant: 'destructive' });
                          }
                        } else if (equipmentId) {
                          setViewingEquipmentId(equipmentId);
                          setEquipmentDetailsTab('equipment-details');
                        }
                      }}
                      className="border-blue-500 text-blue-600 hover:bg-blue-500 hover:text-white hover:border-blue-600"
                    >
                      View doc
                    </Button>
                  </div>
                </>
              )}

              {isQAP && (
                <>
                  <p className="text-xs text-gray-500 mb-1">Activity completed</p>
                  <p className="text-sm text-gray-700 mb-3">{log.metadata?.activityName ?? '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Completed by</p>
                  <p className="text-sm text-gray-700 mb-3">{log.metadata?.completedByDisplayName ?? '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Department</p>
                  <p className="text-sm text-gray-700 mb-3">{log.metadata?.department ?? '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Update by</p>
                  <p className="text-sm text-gray-700 mb-3">{log.metadata?.updatedByDisplayName ?? (log.created_by_user?.full_name || log.created_by_user?.email) ?? '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Completed on</p>
                  <p className="text-sm text-gray-700 mb-3">{dateStr}</p>
                  <p className="text-xs text-gray-500 mb-1">Remarks</p>
                  <p className="text-sm text-gray-700 mb-4">{log.metadata?.remarks ?? '—'}</p>
                  <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (recentActivityDetailModal.equipmentId) {
                          setRecentActivityDetailModal(null);
                          setViewingEquipmentId(recentActivityDetailModal.equipmentId);
                          setEquipmentDetailsTab('equipment-details');
                        }
                      }}
                      className="border-teal-600 text-teal-600 hover:bg-teal-600 hover:text-white"
                    >
                      View in checklist
                    </Button>
                    {log.metadata?.document_id && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-blue-500 text-blue-600 hover:bg-blue-500 hover:text-white"
                        onClick={async () => {
                          const docId = log.metadata.document_id;
                          setRecentActivityDetailModal(null);
                          const data = await getDocumentUrlById(docId, projectId === 'standalone');
                          if (data?.document_url) {
                            setDocumentUrlModal({ name: log.metadata?.fileName || 'Document', url: data.document_url, uploadedBy: (data as any).uploaded_by_user?.full_name, uploadDate: data.upload_date, previewLoading: true });
                            fetchAndSetBlobUrl(data.document_url);
                          }
                        }}
                      >
                        View doc
                      </Button>
                    )}
                    {log.metadata?.progress_image_id && recentActivityDetailModal.equipmentId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white"
                        onClick={async () => {
                          setRecentActivityDetailModal(null);
                          const url = await fastAPI.getProgressImageUrlById(log.metadata.progress_image_id, projectId === 'standalone');
                          if (url) setShowImagePreview({ url, equipmentId: recentActivityDetailModal.equipmentId!, currentIndex: 0 });
                        }}
                      >
                        View image
                      </Button>
                    )}
                  </div>
                </>
              )}

              {isVDCR && (
                <>
                  <p className="text-xs text-gray-500 mb-1">Document</p>
                  <p className="text-sm text-gray-700 mb-3">{vdcrDocName}</p>
                  {(log.old_value != null || log.new_value != null) && (
                    <>
                      <p className="text-xs text-gray-500 mb-1">Change</p>
                      <p className="text-sm text-gray-700 mb-3">{[log.old_value, log.new_value].filter(Boolean).join(' → ')}</p>
                    </>
                  )}
                  <p className="text-xs text-gray-500 mb-1">Department</p>
                  <p className="text-sm text-gray-700 mb-3">{log.metadata?.department ?? '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Completed by</p>
                  <p className="text-sm text-gray-700 mb-3">{log.created_by_user?.full_name || log.created_by_user?.email || '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Completed on</p>
                  <p className="text-sm text-gray-700 mb-3">{dateStr}</p>
                  <p className="text-xs text-gray-500 mb-1">Remarks</p>
                  <p className="text-sm text-gray-700 mb-3">{log.metadata?.remarks ?? '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Notable remarks</p>
                  <p className="text-sm text-gray-700 mb-4">{log.metadata?.notable_change_title ?? log.metadata?.notableRemarks ?? '—'}</p>
                  <div className="pt-4 border-t border-gray-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (recentActivityDetailModal.equipmentId) {
                          setRecentActivityDetailModal(null);
                          setViewingEquipmentId(recentActivityDetailModal.equipmentId);
                          setEquipmentDetailsTab('equipment-details');
                        }
                      }}
                      className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
                    >
                      View in Documentation
                    </Button>
                  </div>
                </>
              )}

              {!isDoc && !isQAP && !isVDCR && (
                <div className="pt-4 border-t border-gray-100 mt-4">
                  <p className="text-xs text-gray-500 mb-2">View update</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const equipmentId = recentActivityDetailModal.equipmentId;
                        const docId = log.metadata?.document_id;
                        setRecentActivityDetailModal(null);
                        if (docId) {
                          const name = log.metadata?.fileName || log.metadata?.documentName || 'Document';
                          setDocumentUrlModal({ name, loading: true, documentId: docId });
                          try {
                            const data = await getDocumentUrlById(docId, projectId === 'standalone');
                            if (!data?.document_url) { setDocumentUrlModal(null); toast({ title: 'Error', description: 'Could not load document.', variant: 'destructive' }); return; }
                            setDocumentUrlModal({ url: data.document_url, name: data.document_name || name, uploadedBy: (data as any).uploaded_by_user?.full_name || data.uploaded_by, uploadDate: data.upload_date, previewLoading: true });
                            fetchAndSetBlobUrl(data.document_url);
                          } catch { setDocumentUrlModal(null); toast({ title: 'Error', description: 'Could not load document.', variant: 'destructive' }); }
                        } else if (equipmentId) { setViewingEquipmentId(equipmentId); setEquipmentDetailsTab('equipment-details'); }
                      }}
                      className="border-blue-500 text-blue-600 hover:bg-blue-500 hover:text-white hover:border-blue-600"
                    >
                      View document
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const equipmentId = recentActivityDetailModal.equipmentId;
                        const progressImageId = log.metadata?.progress_image_id;
                        setRecentActivityDetailModal(null);
                        if (progressImageId && equipmentId) {
                          const url = await fastAPI.getProgressImageUrlById(progressImageId, projectId === 'standalone');
                          if (url) setShowImagePreview({ url, equipmentId, currentIndex: 0 });
                          else { toast({ title: 'Error', description: 'Could not load image.', variant: 'destructive' }); setViewingEquipmentId(equipmentId); setEquipmentDetailsTab('equipment-details'); }
                        } else if (equipmentId) { setViewingEquipmentId(equipmentId); setEquipmentDetailsTab('equipment-details'); }
                      }}
                      className="border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white hover:border-orange-600"
                    >
                      View image
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Recent Activity updates list modal (carousel: 4 per page, Prev/Next, dots) */}
      {recentActivityUpdatesModalEquipment && (() => {
        const eqId = recentActivityUpdatesModalEquipment.equipmentId;
        const allLogs = recentActivityLogsByEquipment[eqId] ?? [];
        const logs = allLogs.filter((l: any) => RECENT_ACTIVITY_TYPES.includes(l.activity_type as any));
        const loading = recentActivityLoadingByEquipment[eqId];

        const search = recentActivitySearch.trim().toLowerCase();
        const allDepartments = Array.from(
          new Set(
            logs
              .map((l: any) => (l.metadata?.department ?? '').trim())
              .filter((d: string) => d.length > 0)
          )
        ).sort((a, b) => a.localeCompare(b));

        const filteredLogs = logs.filter((log: any) => {
          const dept = (log.metadata?.department ?? '—').trim() || '—';
          if (recentActivityDeptFilter !== 'All' && dept !== recentActivityDeptFilter) return false;
          if (!search) return true;

          const updateType = getUpdateTypeLabel(log);
          const title = getRecentActivityRowTitle(log);
          const remarks = log.metadata?.remarks ?? '';
          const notableRemarks = (log.metadata?.notable_change_title ?? log.metadata?.notableRemarks ?? '').trim();
          const isDocUpload = log.activity_type === 'document_uploaded' || log.activity_type === 'document_updated';
          const byValue = isDocUpload
            ? (log.created_by_user?.full_name ?? log.created_by_user?.email ?? '')
            : (log.metadata?.completedByDisplayName ?? log.created_by_user?.full_name ?? log.created_by_user?.email ?? '');

          const haystack = [updateType, title, dept, remarks, notableRemarks, byValue].join(' ').toLowerCase();
          return haystack.includes(search);
        });

        const ITEMS_PER_PAGE = 4;
        const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
        const page = Math.min(recentActivityUpdatesModalPage, totalPages - 1);
        const pageLogs = filteredLogs.slice(page * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE + ITEMS_PER_PAGE);
        const canPrev = page > 0;
        const canNext = page < totalPages - 1;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setRecentActivityUpdatesModalEquipment(null); setRecentActivityExpandedLogId(null); }}>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900">
                  Recent activity updates
                  {recentActivityUpdatesModalEquipment.tagNumber && (
                    <span className="text-sm font-normal text-gray-500 ml-2">({recentActivityUpdatesModalEquipment.tagNumber})</span>
                  )}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => { setRecentActivityUpdatesModalEquipment(null); setRecentActivityExpandedLogId(null); }} className="text-gray-500 hover:text-gray-700">
                  <X size={20} />
                </Button>
              </div>
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <Input
                  value={recentActivitySearch}
                  onChange={(e) => {
                    setRecentActivitySearch(e.target.value);
                    setRecentActivityUpdatesModalPage(0);
                  }}
                  placeholder="Search updates, department, remarks..."
                  className="w-full md:w-64"
                  aria-label="Search recent activity updates"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Department:</span>
                  <Select
                    value={recentActivityDeptFilter}
                    onValueChange={(value) => {
                      setRecentActivityDeptFilter(value);
                      setRecentActivityUpdatesModalPage(0);
                    }}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder="All departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All departments</SelectItem>
                      {allDepartments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {loading || logs === undefined ? (
                <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Loading activity...
                </div>
              ) : !logs.length ? (
                <p className="py-8 text-center text-sm text-gray-500">No documentation or QAP updates for this equipment yet.</p>
              ) : (
                <>
                  <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
                    {pageLogs.map((log: any, idx: number) => {
                      const logKey = log.id || `log-${idx}`;
                      const isExpanded = recentActivityExpandedLogId === logKey;
                      const updateType = getUpdateTypeLabel(log);
                      const title = getRecentActivityRowTitle(log);
                      const dateStr = log.created_at ? new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                      const isDocUpload = log.activity_type === 'document_uploaded' || log.activity_type === 'document_updated';
                      const byLabel = isDocUpload ? 'Uploaded by' : 'Completed by';
                      const byValue = isDocUpload ? (log.created_by_user?.full_name ?? log.created_by_user?.email ?? '—') : (log.metadata?.completedByDisplayName ?? log.created_by_user?.full_name ?? log.created_by_user?.email ?? '—');
                      const dateLabel = isDocUpload ? 'Uploaded on' : 'Completed on';
                      const dept = log.metadata?.department ?? '—';
                      const remarks = log.metadata?.remarks ?? '';
                      const notableRemarks = (log.metadata?.notable_change_title ?? log.metadata?.notableRemarks ?? '').trim();
                      const isDocPhase = updateType === 'Documentation update';
                      const isQAP = log.activity_type === 'activity_completed';
                      const completionId = typeof log.metadata?.completion_id === 'string' ? log.metadata.completion_id : '';
                      const inspectionReportCount = Number(log.metadata?.inspection_report_count ?? 0);
                      const completionImageCount = Number(log.metadata?.image_count ?? 0);
                      const hasDoc = !!log.metadata?.document_id;
                      const hasCompletionReports = isQAP && !!completionId && inspectionReportCount > 0;
                      const hasProgressImage = isQAP && !!log.metadata?.progress_image_id;
                      const hasCompletionImage = isQAP && !!completionId && completionImageCount > 0;
                      const hasImage = hasProgressImage || hasCompletionImage;
                      const badgeClass = updateType === 'Documentation update' ? 'bg-blue-100 text-blue-800 border-blue-200' : updateType === 'QAP update' ? 'bg-teal-100 text-teal-800 border-teal-200' : updateType === 'Inspection report update' ? 'bg-orange-100 text-orange-800 border-orange-200' : updateType === 'Task completion update' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : updateType === 'Audit, TPI & other docs' ? 'bg-gray-100 text-gray-800 border-gray-200' : 'bg-gray-100 text-gray-800 border-gray-200';
                      return (
                        <div
                          key={logKey}
                          className={`rounded-xl border bg-white shadow-sm transition-all p-4 text-left flex flex-col gap-2 ${isExpanded ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-200 hover:shadow-md'}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded border ${badgeClass}`}>
                              {updateType}
                            </span>
                            <span className="text-sm font-semibold text-gray-900 break-words">{title}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                            <span>Department: {dept}</span>
                            <span>{byLabel}: {byValue}</span>
                            <span>{dateLabel}: <span className="font-semibold text-blue-600 bg-blue-50/80 px-1.5 py-0.5 rounded">{dateStr}</span></span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={`text-xs h-7 ${isExpanded ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-blue-500 text-blue-600 hover:bg-blue-500 hover:text-white'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRecentActivityExpandedLogId(isExpanded ? null : logKey);
                              }}
                            >
                              {isExpanded ? 'Collapse' : 'View details'}
                            </Button>
                          </div>
                          {isExpanded && (
                            <div className="pt-3 mt-2 border-t border-gray-100 flex flex-col gap-2">
                              <div className="text-xs text-gray-600">
                                <span className="font-medium text-gray-700">Remarks: </span>
                                <span>{remarks || '—'}</span>
                              </div>
                              {isDocPhase && (
                                <div className="text-xs text-gray-600">
                                  <span className="font-medium text-gray-700">Notable remarks: </span>
                                  <span>{notableRemarks || '—'}</span>
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                {hasDoc && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7 border-blue-500 text-blue-600 hover:bg-blue-500 hover:text-white"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (log.metadata?.document_id) {
                                        setDocumentUrlModal({ name: log.metadata?.fileName || log.metadata?.documentName || 'Document', loading: true, documentId: log.metadata.document_id });
                                        getDocumentUrlById(log.metadata.document_id, projectId === 'standalone').then((data) => {
                                          if (!data?.document_url) { setDocumentUrlModal(null); return; }
                                          setDocumentUrlModal({ url: data.document_url, name: data.document_name || '', uploadedBy: (data as any).uploaded_by_user?.full_name, uploadDate: data.upload_date, previewLoading: true });
                                          fetchAndSetBlobUrl(data.document_url);
                                        }).catch(() => setDocumentUrlModal(null));
                                      } else {
                                        setViewingEquipmentId(eqId);
                                        setEquipmentDetailsTab('equipment-details');
                                      }
                                    }}
                                  >
                                    View doc
                                  </Button>
                                )}
                                {hasImage && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7 border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const url = hasProgressImage
                                        ? await fastAPI.getProgressImageUrlById(log.metadata.progress_image_id, projectId === 'standalone')
                                        : await fastAPI.getEquipmentActivityCompletionImageUrl(completionId, 0, projectId === 'standalone');
                                      if (url) setShowImagePreview({ url, equipmentId: eqId, currentIndex: 0 });
                                    }}
                                  >
                                    View image
                                  </Button>
                                )}
                                {hasCompletionReports && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7 border-indigo-500 text-indigo-600 hover:bg-indigo-500 hover:text-white"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setInspectionReportListLoading(true);
                                      try {
                                        const reports = await fastAPI.getEquipmentActivityCompletionInspectionReports(completionId, projectId === 'standalone');
                                        setInspectionReportListModal({ completionId, reports });
                                      } finally {
                                        setInspectionReportListLoading(false);
                                      }
                                    }}
                                  >
                                    View report{inspectionReportCount > 1 ? 's' : ''}
                                  </Button>
                                )}
                                {!hasDoc && !hasImage && !hasCompletionReports && (
                                  <span className="text-xs text-gray-400">No doc or image linked to this update.</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-gray-100 flex-shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canPrev}
                        onClick={() => setRecentActivityUpdatesModalPage(p => Math.max(0, p - 1))}
                        className="shrink-0"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                      </Button>
                      <div className="flex items-center gap-1.5" aria-label="Page navigation">
                        {Array.from({ length: totalPages }, (_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setRecentActivityUpdatesModalPage(i)}
                            className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${i === page ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            aria-label={`Page ${i + 1}`}
                            aria-current={i === page ? 'page' : undefined}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canNext}
                        onClick={() => setRecentActivityUpdatesModalPage(p => Math.min(totalPages - 1, p + 1))}
                        className="shrink-0"
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Document Preview Modal */}
      {documentPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Document: {documentPreview.name}</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Create a download link for the file
                    const url = URL.createObjectURL(documentPreview.file);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = documentPreview.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <FileText size={16} className="mr-2" />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDocumentPreview(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={20} />
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {/* File Type Preview */}
              {documentPreview.file.type.startsWith('image/') ? (
                <div className="text-center">
                  <img
                    src={URL.createObjectURL(documentPreview.file)}
                    alt={documentPreview.name}
                    className="max-w-full h-auto rounded-lg border border-gray-200"
                  />
                </div>
              ) : documentPreview.file.type === 'application/pdf' ? (
                <div className="text-center">
                  <iframe
                    key={`${documentPreview.name}-${documentPreview.file.lastModified}`}
                    src={`${URL.createObjectURL(documentPreview.file)}#page=1&view=FitH`}
                    className="w-full h-96 border border-gray-200 rounded-lg"
                    title={documentPreview.name}
                  />
                </div>
              ) : (
                <div className="text-center p-8 bg-gray-50 rounded border border-gray-200">
                  <FileText size={64} className="mx-auto text-gray-400 mb-4" />
                  <div className="text-lg font-medium text-gray-600 mb-2">{documentPreview.name}</div>
                  <div className="text-sm text-gray-500 mb-4">
                    File type: {documentPreview.file.type || 'Unknown'}
                  </div>
                  <div className="text-sm text-gray-500">
                    Size: {(documentPreview.file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              )}

              {/* File Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">File Name:</span>
                    <div className="text-gray-600">{documentPreview.name}</div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">File Type:</span>
                    <div className="text-gray-600">{documentPreview.file.type || 'Unknown'}</div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">File Size:</span>
                    <div className="text-gray-600">{(documentPreview.file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Upload Date:</span>
                    <div className="text-gray-600">{new Date().toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Equipment Form Modal */}
      {showAddEquipmentForm && (
        projectId === 'standalone' ? (
          <AddStandaloneEquipmentFormNew
            onClose={() => { setShowAddEquipmentForm(false); setEditingStandaloneEquipment(null); }}
            onSubmit={handleAddStandaloneEquipment}
            editData={editingStandaloneEquipment ?? undefined}
            isEditMode={!!editingStandaloneEquipment}
          />
        ) : (
        <AddEquipmentForm
          onClose={() => setShowAddEquipmentForm(false)}
          onSubmit={handleAddEquipment}
          projectId={projectId}
        />
        )
      )}

      {/* Progress Image Modal */}
      {showProgressImageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg overflow-hidden">
            {/* Close Button */}
            <button
              onClick={() => setShowProgressImageModal(null)}
              className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-opacity-75"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Image */}
            <div className="flex items-center justify-center p-4">
              <img
                src={showProgressImageModal.url}
                alt="Progress Image"
                className="max-w-full max-h-[80vh] object-contain"
              />
            </div>

            {/* Description and Details */}
            {(showProgressImageModal.description || showProgressImageModal.uploadedBy || showProgressImageModal.uploadDate) && (
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-4">
                {showProgressImageModal.description && (
                  <div className="text-sm mb-2">{showProgressImageModal.description}</div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-gray-300">
                  {showProgressImageModal.uploadedBy && (
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span className="text-white font-medium">Uploaded by: {showProgressImageModal.uploadedBy}</span>
                    </div>
                  )}
                  {showProgressImageModal.uploadDate && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {(() => {
                          try {
                            const date = new Date(showProgressImageModal.uploadDate);
                            const formattedDate = date.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            });
                            const formattedTime = date.toLocaleTimeString('en-US', { 
                              hour: 'numeric', 
                              minute: '2-digit',
                              hour12: true
                            });
                            return `${formattedDate} at ${formattedTime}`;
                          } catch (error) {
                            return showProgressImageModal.uploadDate;
                          }
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QAP full popup – opens when View QAP is clicked; auto-scrolls to current step */}
      {qapPopupEquipmentId && (() => {
        const popupItem = localEquipment.find((e: any) => e.id === qapPopupEquipmentId);
        const list = equipmentActivities[qapPopupEquipmentId] || [];
        const commencementRaw = popupItem ? (popupItem as any).commencementDate ?? (popupItem as any).commencement_date ?? null : null;
        const commencementStr = commencementRaw ? (() => {
          try {
            const d = new Date(commencementRaw);
            return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          } catch { return null; }
        })() : null;
        return createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-2 sm:p-4" onClick={() => setQapPopupEquipmentId(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="p-3 sm:p-4 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">QAP / Activities</h4>
                      {commencementStr && <p className="text-[11px] sm:text-xs text-gray-500 truncate">Equipment started on <span className="font-semibold text-gray-700">{commencementStr}</span></p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap flex-shrink-0">
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => { openEditActivitiesModal(qapPopupEquipmentId); }} title="Edit activity list"><Edit className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setActivitiesHistoryEquipmentId(qapPopupEquipmentId); setActivitiesHistoryOpen(true); }} title="History"><History className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600" /></Button>
                    <label className="cursor-pointer inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-gray-100 text-gray-600" title="Replace activities">
                      <Upload className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadActivitiesExcel(qapPopupEquipmentId, f); e.target.value = ''; }} disabled={!!uploadingActivitiesForEquipment} />
                    </label>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] sm:text-xs px-2" onClick={() => exportActivitiesReport(qapPopupEquipmentId)}>Export</Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] sm:text-xs px-2 gap-1" onClick={() => setQapPopupEquipmentId(null)} title="Close"><X className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Close</Button>
                  </div>
                </div>
              </div>
              <div ref={qapPopupScrollRef} className="p-3 sm:p-4 flex-1 min-h-0 overflow-y-auto">
                {!list.length ? (
                  <div className="space-y-3 py-4">
                    <p className="text-xs text-gray-600 text-center">Upload an Excel sheet with activities (Sr. No., Activity Name, Activity Type, Target). First row: Commencement Date.</p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={downloadActivitiesTemplate}>
                        <Download size={14} className="mr-1" />
                        Download sample template
                      </Button>
                      <label className="cursor-pointer inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                        <Upload className="w-3.5 h-3.5 mr-1" />
                        Upload Excel
                        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadActivitiesExcel(qapPopupEquipmentId, f); e.target.value = ''; }} disabled={!!uploadingActivitiesForEquipment} />
                      </label>
                      {uploadingActivitiesForEquipment === qapPopupEquipmentId && (
                        <span className="text-xs text-indigo-600">Uploading...</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 mb-3">
                      <Label htmlFor="qap-variance-toggle" className="text-xs font-medium text-gray-600 cursor-pointer">Show variance days calculator</Label>
                      <Switch
                        id="qap-variance-toggle"
                        checked={qapShowVarianceDays}
                        onCheckedChange={setQapShowVarianceDays}
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute left-[11px] top-2 bottom-2 w-1 bg-green-500" />
                      {(() => {
                      const dayMs = 24 * 60 * 60 * 1000;
                      const resolveTarget = (a: any): string | null => {
                        const explicit = parseExplicitTargetDate(a.target_relative) ?? parseExplicitTargetDate(a.target_date);
                        return explicit ?? (commencementRaw && a.target_relative ? computeTargetDate(commencementRaw, a.target_relative) : a.target_date || null);
                      };
                      const resolvedTargetDates = list.map((a: any) => resolveTarget(a));
                      return list.map((activity: any, idx: number) => {
                      const isCompleted = !!activity.completion;
                      const isCurrent = !isCompleted && list.slice(0, idx).every((a: any) => !!a.completion);
                      const myTarget = resolvedTargetDates[idx];
                      const rawDate = isCompleted && activity.completion?.completed_on
                        ? activity.completion.completed_on
                        : (myTarget || activity.target_date || activity.target_relative);
                      const dateStr = rawDate && rawDate !== activity.target_relative
                        ? (() => {
                            try {
                              const d = new Date(rawDate);
                              return isNaN(d.getTime()) ? rawDate : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            } catch { return rawDate; }
                          })()
                        : (rawDate || '—');
                      const effectiveTargetForVariance = activity.target_date || myTarget;
                      const daysVariance = activity.completion?.completed_on && effectiveTargetForVariance
                        ? (() => {
                            try {
                              const completed = new Date(activity.completion.completed_on);
                              const target = new Date(effectiveTargetForVariance);
                              if (isNaN(completed.getTime()) || isNaN(target.getTime())) return null;
                              const diffMs = completed.getTime() - target.getTime();
                              return Math.round(diffMs / (24 * 60 * 60 * 1000));
                            } catch { return null; }
                          })()
                        : null;
                      const varianceLabel = isCompleted && daysVariance !== null
                        ? daysVariance === 0
                          ? 'On time'
                          : daysVariance < 0
                            ? `${Math.abs(daysVariance)} days early`
                            : `${daysVariance} days late`
                        : null;
                      let predIdx: number | null = null;
                      if (myTarget) {
                        const myMs = new Date(myTarget).getTime();
                        if (!isNaN(myMs)) {
                          let bestMs = -Infinity;
                          for (let j = 0; j < idx; j++) {
                            const tj = resolvedTargetDates[j];
                            if (!tj) continue;
                            const mj = new Date(tj).getTime();
                            if (isNaN(mj) || mj >= myMs) continue;
                            if (mj > bestMs) { bestMs = mj; predIdx = j; }
                          }
                        }
                      }
                      const refTargetDate = predIdx !== null ? resolvedTargetDates[predIdx] : commencementRaw;
                      const refActualDate = predIdx !== null && list[predIdx].completion?.completed_on
                        ? list[predIdx].completion.completed_on
                        : commencementRaw;
                      const daysAssigned = (refTargetDate && myTarget) ? (() => {
                        try {
                          const refMs = new Date(refTargetDate).getTime();
                          const tMs = new Date(myTarget).getTime();
                          if (isNaN(refMs) || isNaN(tMs)) return null;
                          return Math.round((tMs - refMs) / dayMs);
                        } catch { return null; }
                      })() : null;
                      const daysTaken = (isCompleted && activity.completion?.completed_on && refActualDate) ? (() => {
                        try {
                          const refMs = new Date(refActualDate).getTime();
                          const doneMs = new Date(activity.completion.completed_on).getTime();
                          if (isNaN(refMs) || isNaN(doneMs)) return null;
                          return Math.round((doneMs - refMs) / dayMs);
                        } catch { return null; }
                      })() : null;
                      const hasPreview = isCompleted && daysAssigned !== null && daysTaken !== null;
                      const previewCapsule = hasPreview
                        ? (() => {
                            const diff = daysTaken! - daysAssigned!;
                            if (diff > 0) return { label: `${diff} days late`, className: 'bg-red-500 text-white' };
                            if (diff < 0) return { label: `${Math.abs(diff)} days early`, className: 'bg-green-600 text-white' };
                            return { label: 'On time', className: 'bg-gray-500 text-white' };
                          })()
                        : null;
                      const targetDateStr = myTarget
                        ? (() => {
                            try {
                              const d = new Date(myTarget);
                              return isNaN(d.getTime()) ? myTarget : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            } catch { return myTarget; }
                          })()
                        : (activity.target_relative || activity.target_date || '—');
                      const completedOnStr = activity.completion?.completed_on
                        ? (() => {
                            try {
                              const d = new Date(activity.completion.completed_on);
                              return isNaN(d.getTime()) ? activity.completion.completed_on : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            } catch { return activity.completion.completed_on; }
                          })()
                        : null;
                      const isStepDetailsOpen = qapStepDetails?.equipmentId === qapPopupEquipmentId && qapStepDetails?.activityId === (activity.id || String(idx));
                      const isMilestone = activity.activity_type === 'milestone';
                      const milestoneRingClass = isMilestone ? 'rounded-full ring-2 ring-green-500 ring-offset-2 ring-offset-white inline-flex' : 'inline-flex';
                      return (
                        <div
                          key={activity.id || idx}
                          className="relative flex gap-3 pb-4 last:pb-0"
                          {...(isCurrent ? { 'data-qap-current': 'true' } : {})}
                        >
                          <div className="relative z-10 flex-shrink-0 mt-0.5">
                            {isCompleted ? (
                              <span className={milestoneRingClass}>
                                <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center"><Check className="w-3.5 h-3.5 text-white" /></div>
                              </span>
                            ) : isCurrent ? (
                              <span className={milestoneRingClass}>
                                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center" />
                              </span>
                            ) : (
                              <span className={milestoneRingClass}>
                                <div className="w-6 h-6 rounded-full border-2 border-gray-300 bg-white" />
                              </span>
                            )}
                          </div>
                          <div
                            className="group flex-1 min-w-0 pt-0 cursor-pointer flex items-start justify-between gap-2 flex-wrap rounded-lg px-2 -mx-2 py-1 -my-0.5 transition-colors hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQapStepDetails((prev) =>
                                prev?.equipmentId === qapPopupEquipmentId && prev?.activityId === (activity.id || String(idx))
                                  ? null
                                  : { equipmentId: qapPopupEquipmentId, activityId: activity.id || String(idx) }
                              );
                            }}
                            title="Click to view details"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900">{activity.activity_name || '—'}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {isCompleted ? `Completed ${dateStr}` : isCurrent ? `Current - ${dateStr}` : `Target - ${dateStr}`}
                              </p>
                              {isCurrent && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="default"
                                  className="mt-2 h-7 text-xs px-2 sm:px-3 bg-emerald-600 hover:bg-emerald-700"
                                  onClick={(e) => { e.stopPropagation(); openMarkCompleteModal(activity, qapPopupEquipmentId); }}
                                >
                                  <Check className="w-3 h-3 mr-1" />
                                  Mark complete
                                </Button>
                              )}
                              {isStepDetailsOpen && (
                                <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200 text-left space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                      <span className="text-gray-700">Expected date of completion: <span className="font-medium text-gray-900">{targetDateStr}</span></span>
                                    </div>
                                    {completedOnStr && (
                                      <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                        <span className="text-gray-700">Actual date of completion: <span className="font-medium text-gray-900">{completedOnStr}</span></span>
                                      </div>
                                    )}
                                    {isCompleted && (activity.completion?.completed_by_display_name ?? activity.completion?.completed_by_user_id) && (
                                      <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                        <span className="text-gray-700">Completed by: <span className="font-medium text-gray-900">{activity.completion?.completed_by_display_name || activity.completion?.completed_by_user_id || '—'}</span></span>
                                      </div>
                                    )}
                                    {daysVariance !== null && (
                                      <div className="space-y-1">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${daysVariance <= 0 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                                          <Check className="w-3.5 h-3.5" />
                                          {daysVariance === 0 ? 'On time' : daysVariance < 0 ? `${Math.abs(daysVariance)} days early` : `${daysVariance} days late`}
                                        </span>
                                        <p className="text-xs text-gray-500">from targeted timeline</p>
                                      </div>
                                    )}
                                  </div>
                                  {activity.completion?.notes && (
                                    <>
                                      <div className="border-t border-gray-200 mt-2 pt-2" />
                                      <div>
                                        <span className="text-gray-500 block mb-0.5">Remark (notes when marked complete):</span>
                                        <div className="text-gray-800 bg-white p-2 rounded border border-gray-100 text-xs break-words whitespace-normal max-h-[7.5rem] overflow-y-auto">{activity.completion.notes}</div>
                                      </div>
                                    </>
                                  )}
                                  {(() => {
                                    const completionId = activity.completion?.id;
                                    const imageCount = completionId
                                      ? (activity.completion?.image_count != null ? activity.completion.image_count : 1)
                                      : 0;
                                    if (!completionId || imageCount === 0) return null;
                                    const isViewing = stepImageViewer?.completionId === completionId;
                                    const currentIndex = isViewing ? (stepImageViewer?.currentIndex ?? 0) : 0;
                                    const cacheKey = `${completionId}_${currentIndex}`;
                                    const imageUrl = stepImageCache[cacheKey];
                                    const loading = stepImageLoading[cacheKey];
                                    return (
                                      <div className="pt-1 space-y-2">
                                        {!isViewing ? (
                                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStepImageViewer({ completionId, currentIndex: 0 })}>
                                            <Image className="w-3 h-3 mr-1" />
                                            View step image
                                          </Button>
                                        ) : (
                                          <div className="space-y-2">
                                            {imageCount > 1 && (
                                              <div className="flex items-center justify-center gap-2">
                                                <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setStepImageViewer({ completionId, currentIndex: (currentIndex - 1 + imageCount) % imageCount }); }}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                                                <span className="text-xs text-gray-600">{currentIndex + 1} / {imageCount}</span>
                                                <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setStepImageViewer({ completionId, currentIndex: (currentIndex + 1) % imageCount }); }}><ChevronRight className="w-3.5 h-3.5" /></Button>
                                              </div>
                                            )}
                                            {loading && !imageUrl ? (
                                              <div className="h-32 rounded border border-gray-200 flex items-center justify-center text-gray-500 text-xs">Loading…</div>
                                            ) : imageUrl ? (
                                              <div
                                                className="relative rounded border border-gray-200 max-h-48 bg-gray-50 cursor-pointer group/img overflow-hidden"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setStepImagePreview({ completionId, currentIndex, imageCount });
                                                }}
                                                title="Click to view full size and navigate"
                                              >
                                                <img
                                                  src={imageUrl}
                                                  alt="Step"
                                                  className="max-w-full w-full rounded max-h-48 object-contain transition-shadow group-hover/img:ring-2 group-hover/img:ring-indigo-300"
                                                />
                                                <div className="absolute inset-0 rounded bg-black/0 group-hover/img:bg-black/30 flex items-center justify-center transition-colors">
                                                  <Eye className="w-10 h-10 text-white opacity-0 group-hover/img:opacity-100 drop-shadow transition-opacity" />
                                                </div>
                                              </div>
                                            ) : null}
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setStepImagePreview({ completionId, currentIndex, imageCount }); }} title="Open full size with navigation">
                                                <Image className="w-3 h-3 mr-1" />
                                                View full size
                                              </Button>
                                              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setStepImageViewer(null); }}>Close image</Button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  {(() => {
                                    const completionId = activity.completion?.id;
                                    const reportCount = activity.completion?.inspection_report_count ?? 0;
                                    if (!completionId || reportCount === 0) return null;
                                    return (
                                      <div className="pt-1">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs"
                                          disabled={inspectionReportListLoading}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setInspectionReportListLoading(true);
                                            fastAPI.getEquipmentActivityCompletionInspectionReports(completionId, projectId === 'standalone')
                                              .then((reports) => setInspectionReportListModal({ completionId, reports }))
                                              .finally(() => setInspectionReportListLoading(false));
                                          }}
                                        >
                                          <FileText className="w-3 h-3 mr-1" />
                                          {inspectionReportListLoading ? 'Loading…' : `View uploaded documents (${reportCount})`}
                                        </Button>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {qapShowVarianceDays && hasPreview && !isStepDetailsOpen && previewCapsule && (
                                <div className="text-right">
                                  <div className="text-xs font-medium text-gray-600">
                                    <div>{daysAssigned} days assigned</div>
                                    <div>{daysTaken} days taken</div>
                                  </div>
                                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium text-white ${previewCapsule.className}`}>
                                    {previewCapsule.label}
                                  </span>
                                </div>
                              )}
                              <span className="text-gray-400 group-hover:text-gray-600 transition-colors flex-shrink-0" aria-hidden>
                                {isStepDetailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    });
                    })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Add Technical Section Modal */}
      <AddTechnicalSectionModal
        isOpen={isAddSectionModalOpen}
        onClose={() => setIsAddSectionModalOpen(false)}
        onAddSection={handleAddSection}
      />

      {/* Edit Section Modal */}
      <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${isEditSectionModalOpen ? 'block' : 'hidden'}`}>
        <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Edit Technical Section</h2>
            <button
              onClick={() => {
                setIsEditSectionModalOpen(false);
                setEditingSectionName('');
                setEditingSectionOldName('');
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Section Name
              </label>
              <Input
                value={editingSectionName}
                onChange={(e) => setEditingSectionName(e.target.value)}
                placeholder="e.g., Heat Exchanger, Pump, Motor"
                className="w-full"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm text-blue-800">
                This will update the section name and all associated custom fields will be preserved.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this section? This action cannot be undone.')) {
                  handleDeleteSection(editingSectionOldName);
                }
              }}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              Delete Section
            </Button>
            <Button
              onClick={() => {
                if (editingSectionName?.trim()) {
                  handleEditSection(editingSectionName?.trim());
                }
              }}
              disabled={!editingSectionName?.trim()}
            >
              Update Section
            </Button>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Add New User</h2>
              <button
                onClick={() => {
                  setShowAddUserModal(false);
                  setNewUserData({ name: '', email: '' });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <Input
                  value={newUserData.name}
                  onChange={(e) => setNewUserData({ ...newUserData, name: e.target.value })}
                  placeholder="Enter full name"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <Input
                  value={newUserData.email}
                  onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                  placeholder="Enter email address"
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddUserModal(false);
                  setNewUserData({ name: '', email: '' });
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!newUserData.name?.trim() || !newUserData.email?.trim()) {
                    toast({
                      title: "Error",
                      description: "Please fill in all fields",
                      variant: "destructive",
                    });
                    return;
                  }

                  try {
                    // Add user to database
                    const newUserDataForDB = {
                      name: newUserData.name,
                      email: newUserData.email,
                      role: 'viewer',
                      project_id: projectId,
                      position: 'Team Member',
                      phone: '',
                      permissions: ['view'],
                      status: 'active',
                      access_level: 'viewer'
                    };

                    // // console.log('👥 Adding new user to database:', newUserDataForDB);
                    const createdUser = await fastAPI.createProjectMember(newUserDataForDB);
                    // // console.log('👥 User created successfully:', createdUser);

                    // Refresh the users list to include the new user
                    await fetchProjectUsers();

                    // Notify parent component to refresh Settings tab
                    if (onUserAdded) {
                      onUserAdded();
                    }

                    // Set the new user as selected value
                    setNewTeamFieldValue(newUserData.name);

                    toast({
                      title: "Success",
                      description: "User added successfully to project",
                    });

                    setShowAddUserModal(false);
                    setNewUserData({ name: '', email: '' });
                  } catch (error) {
                    console.error('Error adding user:', error);
                    toast({
                      title: "Error",
                      description: "Failed to add user",
                      variant: "destructive",
                    });
                  }
                }}
                className="flex-1"
              >
                Add User
              </Button>
              
            </div>
          </div>
        </div>
      )}

      {/* Document URL Modal - for database documents - Blob URL used for iframe so preview works */}
      {documentUrlModal && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-start sm:items-center justify-center overflow-y-auto p-2 sm:p-4" style={{ zIndex: 99999 }} onClick={() => { if (documentUrlModal.blobUrl) URL.revokeObjectURL(documentUrlModal.blobUrl); setDocumentUrlModal(null); }}>
          <div className="bg-white rounded-lg p-3 sm:p-4 md:p-6 max-w-4xl w-full my-2 sm:my-0 max-h-[calc(100vh-1rem)] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2 mb-4">
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 truncate pr-2">Document: {documentUrlModal.name}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!documentUrlModal.loading && documentUrlModal.url && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { openInNewTabReliable(documentUrlModal.url!); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-8"
                    >
                      <FileText size={14} className="sm:mr-1 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Open in New Tab</span>
                      <span className="sm:hidden">Open</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const response = await fetch(documentUrlModal.url!);
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = documentUrlModal.name;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        } catch (error) {
                          console.error('Error downloading file:', error);
                          openInNewTabReliable(documentUrlModal.url!);
                        }
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-8"
                    >
                      <FileText size={14} className="sm:mr-1 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Download</span>
                      <span className="sm:hidden">Down</span>
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (documentUrlModal.blobUrl) URL.revokeObjectURL(documentUrlModal.blobUrl);
                    setDocumentUrlModal(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 h-7 sm:h-8 w-7 sm:w-8 p-0"
                >
                  <X size={16} className="sm:w-5 sm:h-5" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {documentUrlModal.loading ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent mb-4" />
                  <p className="text-sm font-medium text-gray-700">Document fetching...</p>
                  <p className="text-xs text-gray-500 mt-1">Loading the document for preview</p>
                </div>
              ) : documentUrlModal.previewLoading && documentUrlModal.url ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent mb-4" />
                  <p className="text-sm font-medium text-gray-700">Loading the document for preview</p>
                </div>
              ) : (() => {
                const previewUrl = documentUrlModal.blobUrl || documentUrlModal.url;
                if (!previewUrl) return null;
                const fileName = documentUrlModal.name.toLowerCase();
                const isPDF = fileName.endsWith('.pdf');
                const isImage = fileName.match(/\.(jpg|jpeg|png|gif|webp)$/);
                const hasKnownExtension = isPDF || !!isImage;
                const tryIframe = isPDF || hasKnownExtension === false;
                if (isPDF || tryIframe) {
                  const pdfUrl = documentUrlModal.url || previewUrl;
                  const freshPdfUrl = buildFreshPdfPreviewUrl(pdfUrl);
                  return (
                    <div className="text-center">
                      {isPDF ? (
                        <object
                          key={freshPdfUrl}
                          data={freshPdfUrl}
                          type="application/pdf"
                          className="w-full h-[60vh] sm:h-[65vh] md:h-[70vh] border border-gray-200 rounded-lg"
                          aria-label={documentUrlModal.name}
                        >
                          <iframe
                            src={freshPdfUrl}
                            className="w-full h-[60vh] sm:h-[65vh] md:h-[70vh] border border-gray-200 rounded-lg"
                            title={documentUrlModal.name}
                          />
                        </object>
                      ) : (
                        <iframe
                          key={previewUrl}
                          src={previewUrl}
                          className="w-full h-[400px] sm:h-[500px] md:h-[600px] border border-gray-200 rounded-lg"
                          title={documentUrlModal.name}
                        />
                      )}
                    </div>
                  );
                } else if (isImage) {
                  return (
                    <div className="text-center">
                      <img
                        src={previewUrl}
                        alt={documentUrlModal.name}
                        className="max-w-full h-auto max-h-[400px] sm:max-h-[500px] md:max-h-[600px] rounded-lg border border-gray-200 object-contain mx-auto"
                      />
                    </div>
                  );
                } else {
                  return (
                    <div className="text-center p-4 sm:p-6 md:p-8 bg-gray-50 rounded border border-gray-200">
                      <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-400 mb-3 sm:mb-4" />
                      <div className="text-sm sm:text-base md:text-lg font-medium text-gray-600 mb-2 break-words">{documentUrlModal.name}</div>
                      <div className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 px-2">
                        This file type cannot be previewed. Please download or open in a new tab to view.
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <Button
                          variant="outline"
                          onClick={() => openInNewTabReliable(documentUrlModal.url!)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9"
                        >
                          <FileText size={14} className="mr-1 sm:w-4 sm:h-4" />
                          Open in New Tab
                        </Button>
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              const response = await fetch(documentUrlModal.url!);
                              const blob = await response.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = documentUrlModal.name;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error('Error downloading file:', error);
                              openInNewTabReliable(documentUrlModal.url!);
                            }
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9"
                        >
                          <FileText size={14} className="mr-1 sm:w-4 sm:h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                  );
                }
              })() }

              {/* Document Information */}
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                  <div>
                    <span className="font-medium text-gray-700 block mb-1">File Name:</span>
                    <div className="text-gray-600 break-words">{documentUrlModal.name}</div>
                  </div>
                  {documentUrlModal.uploadedBy && (
                    <div>
                      <span className="font-medium text-gray-700 block mb-1">Uploaded By:</span>
                      <div className="text-gray-600 break-words">{documentUrlModal.uploadedBy}</div>
                    </div>
                  )}
                  {documentUrlModal.uploadDate && (
                    <div className="sm:col-span-2">
                      <span className="font-medium text-gray-700 block mb-1">Upload Date:</span>
                      <div className="text-gray-600">
                        {new Date(documentUrlModal.uploadDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Mark activity complete modal */}
      {markCompleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4" onClick={() => setMarkCompleteModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Mark activity complete</h3>
              <button type="button" onClick={() => setMarkCompleteModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-1">{markCompleteModalData.activityName}</p>
            <p className="text-xs text-blue-600 mb-3">
              {markCompleteModalData.activityType === 'milestone'
                ? 'This activity will appear in the Progress Image section.'
                : 'This activity will appear in the Updates tab.'}
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-700">When was it completed? *</Label>
                <Input
                  type="date"
                  value={markCompleteModalData.completedOn}
                  onChange={e => setMarkCompleteModalData(prev => ({ ...prev, completedOn: e.target.value }))}
                  className="mt-1 text-sm h-9"
                />
              </div>
              {/* Percentage completed: fixed weight (from QAP) or manual slider */}
              <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/60 p-3 space-y-2">
                {markCompleteModalData.progressWeight != null ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        Progress (fixed from QAP)
                      </Label>
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">{markCompleteModalData.percentageCompleted}%</span>
                    </div>
                    <p className="text-[11px] text-gray-500">This step adds {markCompleteModalData.progressWeight}% (defined in QAP). Total progress will be {markCompleteModalData.percentageCompleted}%.</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        Percentage completed
                      </Label>
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">{markCompleteModalData.percentageCompleted}%</span>
                    </div>
                    <p className="text-[11px] text-gray-500">Progress can only move forward (min {markCompleteModalData.currentProgress}%)</p>
                    <div className="flex w-full items-center py-2" style={{ minHeight: 28 }}>
                      {markCompleteModalData.currentProgress > 0 && (
                        <div
                          className={`h-2 flex-shrink-0 bg-emerald-500 transition-[width] duration-200 ${markCompleteModalData.currentProgress >= 100 ? 'rounded-full' : 'rounded-l-full rounded-r-none'}`}
                          style={{ width: `${markCompleteModalData.currentProgress}%` }}
                        />
                      )}
                      {markCompleteModalData.currentProgress < 100 && renderPercentageRemainingSlider()}
                      {markCompleteModalData.currentProgress === 100 && (
                        <div className="h-2 flex-1 rounded-r-full bg-emerald-500" />
                      )}
                    </div>
                    <div className="grid grid-cols-10 gap-1 pt-0.5 min-w-0">
                      {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setMarkCompleteModalData(prev => ({ ...prev, percentageCompleted: Math.max(n, prev.currentProgress) }))}
                          className={`min-w-0 px-1 py-0.5 rounded text-[10px] font-medium transition-all ${markCompleteModalData.percentageCompleted >= n ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}
                        >
                          {n}%
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div>
                <Label className="text-xs text-gray-700">Completed by (team)</Label>
                <Select
                  value={markCompleteModalData.completedBySelectValue || ''}
                  onValueChange={value => {
                    const member = existingFirmMembers.find((m: any) => m.id === value || m.email === value);
                    setMarkCompleteModalData(prev => ({
                      ...prev,
                      completedBySelectValue: value,
                      completedByUserId: member?.id || '',
                      completedByDisplayName: member ? (member.name || member.full_name || member.email) : value,
                    }));
                  }}
                >
                  <SelectTrigger className="mt-1 text-sm h-9">
                    <SelectValue placeholder="Select team member..." />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {existingFirmMembers.map((member: any) => (
                      <SelectItem key={member.id || member.email} value={member.id || member.email}>
                        {member.name || member.full_name || member.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-700">Department (optional)</Label>
                <p className="text-[11px] text-gray-500 mt-0.5 mb-1">From Documentation tab or add new. Used for inspection reports by department.</p>
                <Select
                  value={markCompleteModalData.department || '__none__'}
                  onValueChange={value => {
                    if (value === '__add_new__') {
                      setMarkCompleteModalData(prev => ({ ...prev, department: '__add_new__' }));
                      return;
                    }
                    setMarkCompleteModalData(prev => ({ ...prev, department: value === '__none__' ? '' : value }));
                  }}
                >
                  <SelectTrigger className="mt-1 text-sm h-9">
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    <SelectItem value="__none__">— None —</SelectItem>
                    {markCompleteAvailableDepartments.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                    <SelectItem value="__add_new__">+ Add new department...</SelectItem>
                  </SelectContent>
                </Select>
                {(markCompleteModalData.department === '__add_new__' || (markCompleteModalData.department && !markCompleteAvailableDepartments.includes(markCompleteModalData.department))) && (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={markCompleteNewDepartmentInput}
                      onChange={e => setMarkCompleteNewDepartmentInput(e.target.value)}
                      placeholder="New department name"
                      className="text-sm h-9"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = markCompleteNewDepartmentInput.trim(); if (v) { setMarkCompleteAvailableDepartments(prev => [...prev, v].sort()); setMarkCompleteModalData(prev => ({ ...prev, department: v })); setMarkCompleteNewDepartmentInput(''); } } }}
                    />
                    <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => { const v = markCompleteNewDepartmentInput.trim(); if (v) { setMarkCompleteAvailableDepartments(prev => [...prev, v].sort()); setMarkCompleteModalData(prev => ({ ...prev, department: v })); setMarkCompleteNewDepartmentInput(''); } }}>Add</Button>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs text-gray-700">Notes (optional)</Label>
                <Textarea
                  value={markCompleteModalData.notes}
                  onChange={e => setMarkCompleteModalData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes"
                  className="mt-1 text-sm min-h-[60px]"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Upload image(s) (optional)</Label>
                <div className="flex flex-row items-center gap-2 mt-1.5 flex-wrap" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
                  <input
                    ref={markCompleteCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) setMarkCompleteModalData(prev => ({ ...prev, imageFiles: [...prev.imageFiles, f] }));
                      e.target.value = '';
                    }}
                    className="hidden"
                    id="mark-complete-camera-grid"
                  />
                  <input
                    ref={markCompleteGalleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={e => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      if (files.length) setMarkCompleteModalData(prev => ({ ...prev, imageFiles: [...prev.imageFiles, ...files] }));
                      e.target.value = '';
                    }}
                    className="hidden"
                    id="mark-complete-gallery-grid"
                  />
                  <label
                    htmlFor="mark-complete-camera-grid"
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
                    onClick={e => e.stopPropagation()}
                  >
                    <Camera className="w-4 h-4" />
                    Camera
                  </label>
                  <label
                    htmlFor="mark-complete-gallery-grid"
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
                    onClick={e => e.stopPropagation()}
                  >
                    <Upload className="w-4 h-4" />
                    Choose file(s)
                  </label>
                  <span className="text-sm text-gray-500">
                    {markCompleteModalData.imageFiles?.length ? `${markCompleteModalData.imageFiles.length} file(s) chosen` : 'No file chosen'}
                  </span>
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-700">Upload inspection reports (if applicable)</Label>
                <div className="flex flex-row items-center gap-2 mt-1.5 flex-wrap" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    onChange={e => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      if (files.length) setMarkCompleteModalData(prev => ({ ...prev, reportFiles: [...(prev.reportFiles ?? []), ...files] }));
                      e.target.value = '';
                    }}
                    className="hidden"
                    id="mark-complete-reports-grid"
                  />
                  <label
                    htmlFor="mark-complete-reports-grid"
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
                    onClick={e => e.stopPropagation()}
                  >
                    <FileText className="w-4 h-4" />
                    Choose PDF(s)
                  </label>
                  <span className="text-sm text-gray-500">
                    {markCompleteModalData.reportFiles?.length ? `${markCompleteModalData.reportFiles.length} report(s)` : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button type="button" variant="outline" onClick={() => setMarkCompleteModalOpen(false)} disabled={markCompleteSubmitting}>Cancel</Button>
              <Button type="button" onClick={() => handleMarkActivityComplete()} disabled={markCompleteSubmitting}>
                {markCompleteSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Mark complete'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit activity list modal - grid */}
      {editActivitiesModalOpen && editActivitiesModalEquipmentId && (() => {
        const editModalEquipment = localEquipment.find(eq => eq.id === editActivitiesModalEquipmentId);
        const startDate = (editModalEquipment as any)?.commencementDate ?? (editModalEquipment as any)?.commencement_date;
        const startDateLabel = startDate ? new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
        return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4" onClick={() => setEditActivitiesModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Edit activity list</h3>
                <button type="button" onClick={() => setEditActivitiesModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-500">Marked start date: {startDateLabel ?? 'Not set'}. Tick &quot;Inspection/TPI&quot; if this step involves inspection or third party.</p>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {editActivitiesDraft.map((row, idx) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2 p-2 border rounded-lg bg-gray-50/50">
                  <span className="w-8 h-8 flex items-center justify-center rounded border bg-white text-xs font-medium text-gray-700 shrink-0">{idx + 1}</span>
                  <Input className="flex-1 min-w-[100px] h-8 text-xs" placeholder="Activity name" value={row.activity_name} onChange={e => setEditActivitiesDraft(prev => prev.map((r, i) => i === idx ? { ...r, activity_name: e.target.value } : r))} />
                  <Select value={row.activity_type} onValueChange={v => setEditActivitiesDraft(prev => prev.map((r, i) => i === idx ? { ...r, activity_type: v as 'regular_update' | 'milestone' } : r))}>
                    <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[200]">
                      <SelectItem value="regular_update">Minor</SelectItem>
                      <SelectItem value="milestone">Major</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="w-24 h-8 text-xs" placeholder="e.g. 1st week" value={row.target_relative} onChange={e => setEditActivitiesDraft(prev => prev.map((r, i) => i === idx ? { ...r, target_relative: e.target.value } : r))} />
                  <label className="flex items-center gap-1.5 shrink-0 text-xs text-gray-600 whitespace-nowrap">
                    <input type="checkbox" checked={row.inspection_tpi_involved ?? false} onChange={e => setEditActivitiesDraft(prev => prev.map((r, i) => i === idx ? { ...r, inspection_tpi_involved: e.target.checked } : r))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5" />
                    Inspection/TPI
                  </label>
                  <div className="flex items-center gap-0.5">
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === 0} onClick={() => setEditActivitiesDraft(prev => { const a = [...prev]; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; return a.map((r, i) => ({ ...r, sort_order: i })); })}><ChevronUp className="w-4 h-4" /></Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === editActivitiesDraft.length - 1} onClick={() => setEditActivitiesDraft(prev => { const a = [...prev]; [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]; return a.map((r, i) => ({ ...r, sort_order: i })); })}><ChevronDown className="w-4 h-4" /></Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700" onClick={() => setEditActivitiesDraft(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sort_order: i })))}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t">
              <Button type="button" size="sm" variant="outline" className="text-indigo-600 border-indigo-200" onClick={() => setEditActivitiesDraft(prev => [...prev, { id: `new-${Date.now()}`, sr_no: prev.length + 1, activity_name: '', activity_type: 'regular_update' as const, target_relative: '', target_date: '', sort_order: prev.length, inspection_tpi_involved: false, progress_weight: null }])}>
                <Plus size={14} className="mr-1" />
                Add activity
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditActivitiesModalOpen(false)}>Cancel</Button>
                <Button onClick={saveEditActivitiesModal}>Save</Button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Activities History modal */}
      {activitiesHistoryOpen && activitiesHistoryEquipmentId && (() => {
        const list = equipmentActivities[activitiesHistoryEquipmentId] || [];
        const equipment = localEquipment.find((eq: Equipment) => eq.id === activitiesHistoryEquipmentId);
        const commencementDate = (equipment as any)?.commencementDate ?? (equipment as any)?.commencement_date ?? null;
        const getDisplayTargetDate = (act: any) => {
          const raw = act.target_date ?? act.targetDate;
          if (raw) return raw;
          const fromRelative = parseExplicitTargetDate(act.target_relative ?? act.targetRelative);
          if (fromRelative) return fromRelative;
          if (commencementDate && (act.target_relative ?? act.targetRelative))
            return computeTargetDate(commencementDate, act.target_relative ?? act.targetRelative) ?? undefined;
          return undefined;
        };
        const formatDate = (d: string | undefined) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
        const getVarianceDays = (target: string | undefined, completedOn: string | undefined) => {
          if (!target || !completedOn) return null;
          const t = new Date(target); const c = new Date(completedOn);
          return Math.round((c.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
        };
        const getTrackStatus = (act: any, displayTargetDate: string | undefined) => {
          if (!act.completion) return { text: 'Pending', className: 'text-gray-500' };
          const v = getVarianceDays(displayTargetDate, act.completion?.completed_on);
          if (v === null) return { text: '—', className: 'text-gray-500' };
          if (v <= 0) return { text: v === 0 ? 'On track' : `${Math.abs(v)} days early`, className: 'text-green-600' };
          return { text: `${v} days delay`, className: 'text-amber-600' };
        };
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4" onClick={() => { setActivitiesHistoryOpen(false); setActivitiesHistoryEquipmentId(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                Activity history
              </h3>
              <button type="button" onClick={() => { setActivitiesHistoryOpen(false); setActivitiesHistoryEquipmentId(null); }} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Sr.</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Activity</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Remarks</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Completed by</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Completed on</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Updated on</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Target date</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Variance (days)</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Track status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((act: any) => {
                    const displayTargetDate = getDisplayTargetDate(act);
                    const variance = act.completion && displayTargetDate ? getVarianceDays(displayTargetDate, act.completion.completed_on) : null;
                    const track = getTrackStatus(act, displayTargetDate);
                    return (
                      <tr key={act.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-2 px-2">{act.sr_no}</td>
                        <td className="py-2 px-2 font-medium text-gray-900">{act.activity_name}</td>
                        <td className="py-2 px-2 text-gray-600 max-w-[140px] truncate" title={act.completion?.notes ?? ''}>{act.completion?.notes ?? '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{act.completion?.completed_by_display_name ?? '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{formatDate(act.completion?.completed_on)}</td>
                        <td className="py-2 px-2 text-gray-600">{act.completion?.updated_on ? formatDate(act.completion.updated_on) : '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{formatDate(displayTargetDate)}</td>
                        <td className="py-2 px-2">{variance !== null ? (variance > 0 ? `+${variance}` : variance) : '—'}</td>
                        <td className={`py-2 px-2 font-medium ${track.className}`}>{track.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
    </>
  );
};

export default EquipmentGrid;





