import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, FileText, Download, Edit, Plus, Eye, Check, X, ChevronDown, ChevronUp, ChevronRight, Users, Settings, Lock, Unlock, History, Send, Calendar, Clock, Tag, Pencil, CheckCircle, MessageSquare, LayoutList } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fastAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationReads, UnreadEntityDot } from "@/contexts/NotificationReadsContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { logVDCRCreated, logVDCRUpdated, logVDCRStatusChanged, logVDCRDocumentUploaded, logVDCRDeleted, logVDCRFieldUpdated } from "@/lib/activityLogger";
import VDCRSearchBar from "./VDCRSearchBar";
import VDCRRevisionHistory from "./VDCRRevisionHistory";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Declare XLSX for TypeScript
declare global {
  interface Window {
    XLSX: any;
  }
}

// Extend Window interface for XLSX
interface Window {
  XLSX: any;
}

interface DocumentFile {
  id: string;
  fileName: string;
  originalName: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'image' | 'other';
  fileSize: number;
  uploadDate: string;
  uploadedBy: string;
  filePath: string;
  thumbnail?: string;
}

interface VDCRRecord {
  id: string;
  srNo: string;
  equipmentTagNo: string[];
  mfgSerialNo: string[];
  jobNo: string[];
  clientDocNo: string;
  internalDocNo: string;
  documentName: string;
  revision: string;
  codeStatus: string;
  status: 'approved' | 'sent-for-approval' | 'received-for-comment' | 'pending' | 'rejected';
  department?: string;
  lastUpdate: string;
  updated_at?: string;
  remarks?: string;
  updatedBy?: string;
  documentFile?: DocumentFile;
  documentUrl?: string;
  revisionEvents?: any[];
  cycleTimeOverrideRev00?: number | null;
  cycleTimeOverrideRev01Plus?: number | null;
  /** When true, show this document in the Docs tab of respective equipment (default true). */
  showInEquipmentDocTab?: boolean;
}

interface Equipment {
  tagNo: string;
  mfgSerialNo: string;
  jobNo: string;
  type: string;
  location: string;
  status: string;
}

interface ProjectsVDCRProps {
  projectId: string;
  projectName: string;
  onBack?: () => void;
  onViewDetails?: () => void;
  onViewEquipment?: () => void;
}

const ProjectsVDCR = ({ projectId, projectName, onBack, onViewDetails, onViewEquipment }: ProjectsVDCRProps) => {
  const { user, userName } = useAuth();
  const { toast } = useToast();
  const { markAsSeen } = useNotificationReads();
  const currentUserRole = localStorage.getItem('userRole') || '';

  // Helper function to get correct user ID from database (only called if 409 error occurs)
  const fetchCorrectUserIdFromDB = async (): Promise<string | null> => {
    try {
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const userEmail = userData.email || localStorage.getItem('userEmail') || user?.email;
      
      if (!userEmail) {
        return null;
      }

      // Fast query with 3 second timeout
      const { data: userRecord, error } = await Promise.race([
        supabase
          .from('users')
          .select('id')
          .eq('email', userEmail)
          .single(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 3000)
        )
      ]) as any;

      if (!error && userRecord?.id) {
        return userRecord.id;
      }
    } catch (error) {
      console.error('❌ Error fetching user ID from database:', error);
    }
    return null;
  };
  const [selectedVDCR, setSelectedVDCR] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingVDCR, setEditingVDCR] = useState<VDCRRecord | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);
  const [expandedEquipmentTypes, setExpandedEquipmentTypes] = useState<string[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [docCycleTimeDrafts, setDocCycleTimeDrafts] = useState<Record<string, { rev00: string; rev01Plus: string }>>({});
  const [savingDocCycleTimeIds, setSavingDocCycleTimeIds] = useState<Set<string>>(new Set());

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state for editing
  const [formData, setFormData] = useState({
    srNo: '',
    revision: '',
    documentName: '',
    clientDocNo: '',
    internalDocNo: '',
    codeStatus: '',
    status: '',
    department: '',
    remarks: '',
    projectDocumentationStartDate: '', // Custom documentation start date
    targetedFinishDate: '', // Targeted finish date for this VDCR document
    showInEquipmentDocTab: true // Show this document in the Docs tab of respective equipment (default yes)
  });

  // Project data for getting default PO date
  const [projectData, setProjectData] = useState<{ 
    sales_order_date?: string; 
    vdcr_cycle_time_rev_00?: number | null; 
    vdcr_cycle_time_rev_01_plus?: number | null;
  } | null>(null);

  // State for available departments (for dropdown)
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  
  // State for department dropdown
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [departmentSearchQuery, setDepartmentSearchQuery] = useState('');
  const [editingDepartment, setEditingDepartment] = useState<{ index: number; value: string } | null>(null);
  const [showAddNewDepartment, setShowAddNewDepartment] = useState(false);
  const [newDepartmentValue, setNewDepartmentValue] = useState('');

   // Lock/unlock state for fields
   const [fieldLocks, setFieldLocks] = useState({
    srNo: true,           // Locked by default
    revision: true,       // Locked by default
    documentName: true,   // Locked by default
    clientDocNo: true,    // Locked by default
    internalDocNo: true,  // Locked by default
    department: true,     // Locked by default
    projectDocumentationStartDate: true, // Locked by default
    targetedFinishDate: true // Locked by default
  });

  // Get current user info for tracking who made updates
  const currentUser = userName || user?.email || 'Unknown User';

  // Debug: Log selectedEquipments changes (only when not empty)
  useEffect(() => {
    if (selectedEquipments.length > 0) {
      // // console.log('🔧 selectedEquipments changed:', selectedEquipments);
    }
  }, [selectedEquipments]);

  // Button enable/disable state for revision events
  const [revisionEventButtons, setRevisionEventButtons] = useState<{
    submittedEnabled: boolean;
    commentedEnabled: boolean;
  }>({
    submittedEnabled: true,
    commentedEnabled: true
  });
  
  // Button states for each record in the main table
  const [recordButtonStates, setRecordButtonStates] = useState<Map<string, {
    submittedEnabled: boolean;
    receivedEnabled: boolean;
  }>>(new Map());
  
  // Refresh trigger for button state check
  const [buttonStateRefresh, setButtonStateRefresh] = useState(0);

  // Check revision events to determine which button should be enabled
  useEffect(() => {
    // Only run if modal is open and we have the necessary data
    if (!isEditModalOpen || !editingVDCR?.id || !formData.revision) {
      // If modal is not open or no record selected, enable both buttons
      setRevisionEventButtons({
        submittedEnabled: true,
        commentedEnabled: true
      });
      return;
    }

    const checkRevisionEventButtons = async () => {
      try {
        // Get revision number (e.g., "Rev-00" -> 0, "Rev-01" -> 1)
        const revMatch = formData.revision.match(/Rev-?(\d+)/i) || formData.revision.match(/(\d+)/);
        const revNum = revMatch ? parseInt(revMatch[1], 10) : 0;

        // For Rev 00, check if there are any events
        if (revNum === 0) {
          // Check events for Rev 00
          const events = await fastAPI.getVDCRRevisionEvents(editingVDCR.id);
          if (Array.isArray(events)) {
            const rev00Events = events.filter((e: any) => e.revision_number === formData.revision);
            
            if (rev00Events.length === 0) {
              // No events for Rev 00 - enable Submitted only (start of cycle)
          setRevisionEventButtons({
            submittedEnabled: true,
                commentedEnabled: false
              });
              return;
            }

            // Sort by event_date descending to get most recent, then by created_at descending as tiebreaker
            const sortedEvents = [...rev00Events].sort((a: any, b: any) => {
              const dateDiff = new Date(b.event_date).getTime() - new Date(a.event_date).getTime();
              if (dateDiff !== 0) return dateDiff;
              // Tiebreaker: use created_at to get the most recently created event
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            
            const lastEvent = sortedEvents[0];
            
            if (lastEvent.event_type === 'submitted') {
              // Last event was submitted - enable Commented, disable Submitted
              setRevisionEventButtons({
                submittedEnabled: false,
            commentedEnabled: true
          });
            } else if (lastEvent.event_type === 'received') {
              // Last event was received/commented - enable Submitted for next revision (Rev-01), disable Commented
              // Same logic as Rev-01+ - next step is to submit the next revision
              setRevisionEventButtons({
                submittedEnabled: true,
                commentedEnabled: false
              });
            } else {
              // Unknown event type - enable both
              setRevisionEventButtons({
                submittedEnabled: true,
                commentedEnabled: true
              });
            }
          } else {
            // No events found - enable Submitted only (start of cycle)
            setRevisionEventButtons({
              submittedEnabled: true,
              commentedEnabled: false
            });
          }
          return;
        }

        // For Rev 01+, check the last event for the current revision
        const events = await fastAPI.getVDCRRevisionEvents(editingVDCR.id);
        if (Array.isArray(events)) {
          // Filter events for current revision
          const currentRevEvents = events.filter((e: any) => e.revision_number === formData.revision);
          
          if (currentRevEvents.length === 0) {
            // No events for current revision - enable Submitted (start of cycle)
            setRevisionEventButtons({
              submittedEnabled: true,
              commentedEnabled: false
            });
            return;
          }

          // Sort by event_date descending to get most recent, then by created_at descending as tiebreaker
          const sortedEvents = [...currentRevEvents].sort((a: any, b: any) => {
            const dateDiff = new Date(b.event_date).getTime() - new Date(a.event_date).getTime();
            if (dateDiff !== 0) return dateDiff;
            // Tiebreaker: use created_at to get the most recently created event
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          const lastEvent = sortedEvents[0];
          
          if (lastEvent.event_type === 'submitted') {
            // Last event was submitted - enable Commented, disable Submitted
            setRevisionEventButtons({
              submittedEnabled: false,
              commentedEnabled: true
            });
          } else if (lastEvent.event_type === 'received') {
            // Last event was received/commented - enable Submitted, disable Commented
            setRevisionEventButtons({
              submittedEnabled: true,
              commentedEnabled: false
            });
          } else {
            // Unknown event type - enable both
            setRevisionEventButtons({
              submittedEnabled: true,
              commentedEnabled: true
            });
          }
        } else {
          // No events found - enable Submitted (start of cycle)
          setRevisionEventButtons({
            submittedEnabled: true,
            commentedEnabled: false
          });
        }
      } catch (error) {
        console.error('Error checking revision events for button state:', error);
        // On error, enable both buttons to avoid blocking user
        setRevisionEventButtons({
          submittedEnabled: true,
          commentedEnabled: true
        });
      }
    };

    // Add small delay to ensure database is updated after event creation
    const timeoutId = setTimeout(() => {
      checkRevisionEventButtons();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [isEditModalOpen, editingVDCR?.id, formData.revision, buttonStateRefresh]);

  // Document management state
  const [uploadedFiles, setUploadedFiles] = useState<DocumentFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Document preview modal state
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    document: DocumentFile | null;
    documentName: string;
  }>({
    isOpen: false,
    document: null,
    documentName: ''
  });

  // PDF viewer state
  const [pdfViewerState, setPdfViewerState] = useState({
    currentPage: 1,
    totalPages: 1,
    zoomLevel: 100,
    searchText: '',
    isFullscreen: false,
    isAnnotating: false,
    searchResults: []
  });

  // Search modal state
  const [searchModal, setSearchModal] = useState({
    isOpen: false,
    searchText: '',
    isSearching: false
  });

  // Annotation tools state
  const [annotationTools, setAnnotationTools] = useState({
    isVisible: false,
    selectedTool: 'highlight',
    color: '#ffff00',
    size: 'medium',
    message: ''
  });

  // Text input modal state
  const [textInputModal, setTextInputModal] = useState({
    isOpen: false,
    text: '',
    position: { x: 0, y: 0 }
  });

  // PDF.js state
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  // Revision history state
  const [revisionHistoryModal, setRevisionHistoryModal] = useState<{
    isOpen: boolean;
    vdcrRecordId: string | null;
    documentName: string;
  }>({
    isOpen: false,
    vdcrRecordId: null,
    documentName: ''
  });

  // Revision event tracking state
  const [revisionEventModal, setRevisionEventModal] = useState<{
    isOpen: boolean;
    eventType: 'submitted' | 'received' | null;
    eventDate: string; // Date of sending (submitted) or Date of receipt (commented)
    estimatedReturnDate: string; // Expected return date (for submitted events)
    targetSubmissionDate: string; // Target date for next submission (for received/commented events)
    notes: string;
    documentFile: File | null;
    documentUrl: string | null;
    isUploadingDocument: boolean;
    uploadAbortController: AbortController | null;
    hasNotableChange: boolean;
    notableChangeTitle: string;
  }>({
    isOpen: false,
    eventType: null,
    eventDate: new Date().toISOString().split('T')[0], // Default to today's date (YYYY-MM-DD format)
    estimatedReturnDate: '',
    targetSubmissionDate: '',
    notes: '',
    documentFile: null,
    documentUrl: null,
    isUploadingDocument: false,
    uploadAbortController: null,
    hasNotableChange: false,
    notableChangeTitle: ''
  });

  // Bulk upload modal state
  const [bulkUploadModal, setBulkUploadModal] = useState<{
    isOpen: boolean;
    template: string;
    uploadedFile: File | null;
    previewData: any[];
    isProcessing: boolean;
  }>({
    isOpen: false,
    template: 'equipment',
    uploadedFile: null,
    previewData: [],
    isProcessing: false
  });

  // Export reports modal: which reports to export (2+ selected = one file with multiple sheets; 1 selected = one file)
  type ExportReportId = 'vdcr-records' | 'revision-history' | 'revision-remarks';
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSelected, setExportSelected] = useState<Record<ExportReportId, boolean>>({
    'vdcr-records': false,
    'revision-history': false,
    'revision-remarks': false
  });
  const [exporting, setExporting] = useState(false);

  // VDCR data state - will be loaded from Supabase
  const [vdcrData, setVdcrData] = useState<VDCRRecord[]>([]);

  // Equipment data state - will be loaded from Supabase
  const [equipmentData, setEquipmentData] = useState<Equipment[]>([]);

  // Search functionality state
  const [searchQuery, setSearchQuery] = useState<string>("");

  // VDCR cycle time state (days) - used for auto-calculating expected return/submission dates
  const [cycleTimeRev00, setCycleTimeRev00] = useState<number | ''>('');
  const [cycleTimeRev01Plus, setCycleTimeRev01Plus] = useState<number | ''>('');
  const [isSavingCycleTime, setIsSavingCycleTime] = useState(false);
  const [cycleTimeSaveSuccess, setCycleTimeSaveSuccess] = useState(false);

  // Load data on component mount (departments set inside loadVDCRData to avoid duplicate records fetch)
  useEffect(() => {
    loadVDCRData();
    loadEquipmentData();
    loadProjectData();
  }, [projectId]);

  // Set selected equipment when equipment data loads and we're editing
  useEffect(() => {
    if (editingVDCR && equipmentData.length > 0 && selectedEquipments.length === 0) {
      // // console.log('🔧 Equipment data loaded, setting selected equipment for edit:', editingVDCR.equipmentTagNo);
      setSelectedEquipments(editingVDCR.equipmentTagNo);
    }
  }, [equipmentData, editingVDCR]);

  // Sync cycle time from project data when loaded
  useEffect(() => {
    if (projectData) {
      const rev00 = projectData.vdcr_cycle_time_rev_00;
      const rev01Plus = projectData.vdcr_cycle_time_rev_01_plus;
      setCycleTimeRev00(rev00 != null && rev00 >= 0 ? rev00 : '');
      setCycleTimeRev01Plus(rev01Plus != null && rev01Plus >= 0 ? rev01Plus : '');
      // If project has cycle time saved, show edit icon (not Save button) on load/refresh
      const hasSavedCycleTime = (rev00 != null && rev00 >= 0) || (rev01Plus != null && rev01Plus >= 0);
      setCycleTimeSaveSuccess(hasSavedCycleTime);
    }
  }, [projectData?.vdcr_cycle_time_rev_00, projectData?.vdcr_cycle_time_rev_01_plus]);

  // Clean up AUTO-GENERATED values from database
  const cleanupAutoGeneratedValues = async (data: any[]) => {
    try {
      for (const record of data) {
        let needsUpdate = false;
        const updatedMfgSerial = (record.mfg_serial_numbers || []).filter((serial: string) => serial !== 'AUTO-GENERATED');
        const updatedJobNo = (record.job_numbers || []).filter((job: string) => job !== 'AUTO-GENERATED');

        if (updatedMfgSerial.length !== (record.mfg_serial_numbers || []).length ||
          updatedJobNo.length !== (record.job_numbers || []).length) {
          needsUpdate = true;
        }

        if (needsUpdate) {
          await fastAPI.updateVDCRRecord(record.id, {
            mfg_serial_numbers: updatedMfgSerial,
            job_numbers: updatedJobNo
          });
          // // console.log(`✅ Cleaned up AUTO-GENERATED values for record ${record.id}`);
        }
      }
    } catch (error) {
      // console.error('Error cleaning up AUTO-GENERATED values:', error);
    }
  };

  // Load project data
  const loadProjectData = async () => {
    try {
      const project = await fastAPI.getProjectSummaryById(projectId);
      if (project) {
        setProjectData(project as any);
      }
    } catch (error) {
      console.error('Error loading project data:', error);
    }
  };

  // Save VDCR cycle time to project
  const handleSaveCycleTime = async () => {
    const rev00 = cycleTimeRev00 === '' ? null : Number(cycleTimeRev00);
    const rev01Plus = cycleTimeRev01Plus === '' ? null : Number(cycleTimeRev01Plus);
    if ((rev00 != null && (rev00 < 0 || !Number.isInteger(rev00))) || 
        (rev01Plus != null && (rev01Plus < 0 || !Number.isInteger(rev01Plus)))) {
      toast({ title: 'Invalid cycle time', description: 'Cycle time must be a positive whole number (days).', variant: 'destructive' });
      return;
    }
    setIsSavingCycleTime(true);
    try {
      await fastAPI.updateProject(projectId, {
        vdcr_cycle_time_rev_00: rev00,
        vdcr_cycle_time_rev_01_plus: rev01Plus
      });
      setProjectData(prev => prev ? { ...prev, vdcr_cycle_time_rev_00: rev00 ?? undefined, vdcr_cycle_time_rev_01_plus: rev01Plus ?? undefined } : null);
      setCycleTimeSaveSuccess(true);
      toast({ title: 'Saved', description: 'Documentation cycle time settings saved successfully.' });
    } catch (error) {
      console.error('Error saving cycle time:', error);
      toast({ title: 'Error', description: 'Failed to save cycle time. Run the migration SQL if needed.', variant: 'destructive' });
    } finally {
      setIsSavingCycleTime(false);
    }
  };

  // Helper: get cycle time in days for a given revision number (0 = Rev-00, 1+ = Rev-01+)
  const getCycleTimeForRevision = (revNum: number): number | null => {
    if (revNum === 0) {
      return cycleTimeRev00 === '' ? (projectData?.vdcr_cycle_time_rev_00 ?? null) : Number(cycleTimeRev00);
    }
    return cycleTimeRev01Plus === '' ? (projectData?.vdcr_cycle_time_rev_01_plus ?? null) : Number(cycleTimeRev01Plus);
  };

  const getCycleTimeForRecordRevision = (record: VDCRRecord | null | undefined, revNum: number): number | null => {
    const override = revNum === 0 ? record?.cycleTimeOverrideRev00 : record?.cycleTimeOverrideRev01Plus;
    if (override != null && Number.isFinite(Number(override)) && Number(override) > 0) {
      return Number(override);
    }
    return getCycleTimeForRevision(revNum);
  };

  // For "Submitted" events: if current rev (e.g. Rev-00) has BOTH submitted AND received, we're about to submit Rev 01 → use Rev 01+ cycle time
  const getEffectiveRevNumForSubmitted = (revision: string, revisionEvents: any[] | undefined): number => {
    const revMatch = revision.match(/Rev-?(\d+)/i) || revision.match(/(\d+)/);
    const revNum = revMatch ? parseInt(revMatch[1], 10) : 0;
    if (!revisionEvents?.length) return revNum;
    const currentRevEvents = revisionEvents.filter((e: any) => e.revision_number === revision);
    const hasSubmitted = currentRevEvents.some((e: any) => e.event_type === 'submitted');
    const hasReceived = currentRevEvents.some((e: any) => e.event_type === 'received');
    if (hasSubmitted && hasReceived) return revNum + 1; // Next submission is Rev 01+
    return revNum;
  };

  // Helper: add days to a date string (YYYY-MM-DD) and return YYYY-MM-DD
  const addDaysToDate = (dateStr: string, days: number): string => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  // Load VDCR data from Supabase
  const loadVDCRData = async () => {
    try {
      setIsLoading(true);
      console.log('🔄 Loading VDCR data for project:', projectId);
      const data = await fastAPI.getVDCRRecordsByProject(projectId);
      console.log('📊 Raw VDCR data received:', data);

      if (!Array.isArray(data)) {
        console.error('❌ VDCR data is not an array:', data);
        setVdcrData([]);
        setIsLoading(false);
        return;
      }

      // Avoid auto-writing on tab open to reduce request spikes.
      // Cleanup can be handled during explicit edit/save flows if needed.

      // Set departments from records we already have (avoids second getVDCRRecordsByProject from loadAvailableDepartments)
      const departments = new Set<string>();
      (data as any[]).forEach((record: any) => {
        if (record.department && record.department.trim()) departments.add(record.department.trim());
      });
      setAvailableDepartments(Array.from(departments).sort());

      // Batch fetch revision events for all records (one or few requests instead of N)
      const recordIds = (data as any[]).map((r: any) => r.id);
      const eventsMap = await fastAPI.getVDCRRevisionEventsBatch(recordIds);

      // Transform Supabase data to match UI interface (sync; revision events already in eventsMap)
      const transformedData: VDCRRecord[] = (data as any[]).map((record: any) => {
         const events: any[] = eventsMap[record.id] || [];
         const revisionEvents = Array.isArray(events) ? events : [];
         let latestDocumentUrl: string | null = null;
         if (revisionEvents.length > 0) {
           const sortedEvents = [...revisionEvents].sort((a, b) => {
             const timeA = new Date(a.event_date).getTime();
             const timeB = new Date(b.event_date).getTime();
             const dateDiff = (Number.isNaN(timeB) ? new Date(b.created_at).getTime() : timeB) -
               (Number.isNaN(timeA) ? new Date(a.created_at).getTime() : timeA);
             if (dateDiff !== 0) return dateDiff;
             return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
           });
           const latestEvent = sortedEvents.find((e: any) => e.document_url);
           if (latestEvent?.document_url) latestDocumentUrl = latestEvent.document_url;
         }

        let documentFile = undefined;

        // Priority: Use latest document URL from revision events, then fallback to original document_url
        const documentUrlToUse = latestDocumentUrl || record.document_url;

        // Use document_url from latest revision event (if available) or from vdcr_records table
        if (documentUrlToUse) {
          // Extract filename from URL
          const urlParts = documentUrlToUse.split('/');
          const fileName = urlParts[urlParts.length - 1];

          // Determine file type from filename
          const fileType = fileName.toLowerCase().includes('.pdf') ? 'pdf' :
            fileName.toLowerCase().includes('.docx') ? 'docx' :
              fileName.toLowerCase().includes('.xlsx') ? 'xlsx' :
                fileName.toLowerCase().includes('.pptx') ? 'pptx' :
                  fileName.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) ? 'image' : 'other';

          // Get event date from latest revision event if available
          let eventDate = record.updated_at;
          if (latestDocumentUrl && revisionEvents.length > 0) {
            const sortedEvents = [...revisionEvents].sort((a, b) => {
              const timeA = new Date(a.event_date).getTime();
              const timeB = new Date(b.event_date).getTime();
              const dateDiff = (Number.isNaN(timeB) ? new Date(b.created_at).getTime() : timeB) - 
                (Number.isNaN(timeA) ? new Date(a.created_at).getTime() : timeA);
              if (dateDiff !== 0) return dateDiff;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            const latestEvent = sortedEvents.find((e: any) => e.document_url === latestDocumentUrl);
            if (latestEvent?.event_date) {
              eventDate = latestEvent.event_date;
            }
          }

          documentFile = {
            id: `doc-${record.id}`,
            fileName: fileName,
            originalName: record.document_name || fileName,
            fileType: fileType as any,
            fileSize: 1024 * 1024, // Default 1MB since we don't store file size in vdcr_records
            uploadDate: new Date(eventDate).toLocaleDateString('en-US', {
              month: 'short',
              day: '2-digit',
              year: 'numeric'
            }),
            uploadedBy: record.updated_by_user?.full_name || 'Unknown',
            filePath: documentUrlToUse
          };
        }

        // Fallback: Create document file from VDCR record data if no document_url
        if (!documentFile && record.document_name) {
          const documentUrl = latestDocumentUrl || record.document_url || null;

          documentFile = {
            id: `doc-${record.id}`,
            fileName: record.document_name,
            originalName: record.document_name,
            fileType: record.document_name.toLowerCase().includes('.pdf') ? 'pdf' :
              record.document_name.toLowerCase().includes('.docx') ? 'docx' :
                record.document_name.toLowerCase().includes('.xlsx') ? 'xlsx' :
                  record.document_name.toLowerCase().includes('.pptx') ? 'pptx' :
                    record.document_name.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) ? 'image' : 'other',
            fileSize: record.file_size || 1024 * 1024, // Default 1MB if no size
            uploadDate: new Date(record.updated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: '2-digit',
              year: 'numeric'
            }),
            uploadedBy: currentUser || 'Unknown', // Use current user name
            filePath: documentUrl
          };
        }

        return {
          id: record.id,
          srNo: record.sr_no,
          equipmentTagNo: record.equipment_tag_numbers || [],
          mfgSerialNo: (record.mfg_serial_numbers || []).filter(serial => serial !== 'AUTO-GENERATED'),
          jobNo: (record.job_numbers || []).filter(job => job !== 'AUTO-GENERATED'),
          clientDocNo: record.client_doc_no,
          internalDocNo: record.internal_doc_no,
          documentName: record.document_name,
          revision: record.revision,
          codeStatus: record.code_status,
          status: record.status,
          department: record.department || undefined,
          lastUpdate: new Date(record.updated_at).toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
          }),
          updated_at: record.updated_at,
          remarks: record.remarks,
          updatedBy: record.updated_by_user?.full_name || record.updated_by || 'Unknown User',
          // Use latest document URL from revision events, then original/documentFile URL; no fake fallback path.
          documentUrl: latestDocumentUrl || documentFile?.filePath || undefined,
          documentFile: documentFile,
          revisionEvents: revisionEvents,
          cycleTimeOverrideRev00: record.cycle_time_override_rev_00 ?? record.cycle_time_override_days ?? null,
          cycleTimeOverrideRev01Plus: record.cycle_time_override_rev_01_plus ?? record.cycle_time_override_days ?? null,
          projectDocumentationStartDate: record.project_documentation_start_date 
            ? (typeof record.project_documentation_start_date === 'string' 
                ? record.project_documentation_start_date.split('T')[0] 
                : new Date(record.project_documentation_start_date).toISOString().split('T')[0])
            : null,
          targetedFinishDate: record.targeted_finish_date 
            ? (typeof record.targeted_finish_date === 'string' 
                ? record.targeted_finish_date.split('T')[0] 
                : new Date(record.targeted_finish_date).toISOString().split('T')[0])
            : null,
          showInEquipmentDocTab: record.show_in_equipment_doc_tab !== false
        } as any;
      });

      // Helper function to normalize Sr. No. for sorting - extracts integer from various formats
      const normalizeSrNoForSort = (srNoInput: string | number | undefined): number => {
        if (!srNoInput) return 0;
        const srNoStr = String(srNoInput).trim();
        // Extract just the numeric part, handle formats like "1", "01", "001", "Rev-01", etc.
        const match = srNoStr.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      };

      // Sort by serial number in ascending order (1, 2, 3, ...) - Rule: Always show entries in ascending order
      const sortedData = transformedData.sort((a, b) => {
        const srNoA = normalizeSrNoForSort(a.srNo);
        const srNoB = normalizeSrNoForSort(b.srNo);
        return srNoA - srNoB;
      });
      
      console.log('✅ Transformed VDCR data (sorted ascending):', sortedData);
      setVdcrData(sortedData);
      
      // Check button states for all records (async, don't block)
      sortedData.forEach(record => {
        // Use setTimeout to avoid blocking the UI
        setTimeout(() => {
          checkRecordButtonState(record).catch(err => {
            console.error('Error checking button state:', err);
          });
        }, 0);
      });
    } catch (error) {
      console.error('❌ Error loading VDCR data:', error);
      toast({ 
        title: 'Error Loading Data', 
        description: `Failed to load documentation records: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive' 
      });
      setVdcrData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load equipment data from Supabase
  const loadEquipmentData = async () => {
    try {
      const data = await fastAPI.getEquipmentByProject(projectId);

      // Transform Supabase data to match UI interface
      const transformedData: Equipment[] = (data as any[]).map((equipment: any) => ({
        tagNo: equipment.tag_number,
        mfgSerialNo: equipment.manufacturing_serial,
        jobNo: equipment.job_number,
        type: equipment.type,
        location: equipment.location,
        status: equipment.status
      }));

      setEquipmentData(transformedData);
    } catch (error) {
      // console.error('Error loading equipment data:', error);
      setEquipmentData([]);
    }
  };

  // Load all departments from project VDCR records
  const loadAvailableDepartments = async () => {
    try {
      const data = await fastAPI.getVDCRRecordsByProject(projectId);
      const departments = new Set<string>();
      
      (data as any[]).forEach((record: any) => {
        if (record.department && record.department.trim()) {
          departments.add(record.department.trim());
        }
      });
      
      setAvailableDepartments(Array.from(departments).sort());
    } catch (error) {
      console.error('Error loading departments:', error);
      setAvailableDepartments([]);
    }
  };

   // Helper function to check button states for a record (uses record.revisionEvents when present to avoid N extra API calls)
   const checkRecordButtonState = async (record: VDCRRecord) => {
     try {
       const revMatch = record.revision.match(/Rev-?(\d+)/i) || record.revision.match(/(\d+)/);
       const revNum = revMatch ? parseInt(revMatch[1], 10) : 0;

       // Use already-loaded revision events when available; otherwise fetch for single-record contexts
       const events = record.revisionEvents != null && Array.isArray(record.revisionEvents)
         ? record.revisionEvents
         : await fastAPI.getVDCRRevisionEvents(record.id);

       // For Rev 00, check if there are any events
       if (revNum === 0) {
         if (Array.isArray(events)) {
           const rev00Events = events.filter((e: any) => e.revision_number === record.revision);
           
           if (rev00Events.length === 0) {
             // No events for Rev 00 - enable Submitted only (start of cycle)
             setRecordButtonStates(prev => {
               const newMap = new Map(prev);
               newMap.set(record.id, { submittedEnabled: true, receivedEnabled: false });
               return newMap;
             });
             return;
           }

           // Sort by event_date descending to get most recent, then by created_at descending as tiebreaker
           const sortedEvents = [...rev00Events].sort((a: any, b: any) => {
             const dateDiff = new Date(b.event_date).getTime() - new Date(a.event_date).getTime();
             if (dateDiff !== 0) return dateDiff;
             // Tiebreaker: use created_at to get the most recently created event
             return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
           });
           
           const lastEvent = sortedEvents[0];
           
           if (lastEvent.event_type === 'submitted') {
             // Last event was submitted - enable Received, disable Submitted
             setRecordButtonStates(prev => {
               const newMap = new Map(prev);
               newMap.set(record.id, { submittedEnabled: false, receivedEnabled: true });
               return newMap;
             });
          } else if (lastEvent.event_type === 'received') {
            // Last event was received/commented - enable Submitted for next revision (Rev-01), disable Commented
            // Same logic as Rev-01+ - next step is to submit the next revision
            setRecordButtonStates(prev => {
              const newMap = new Map(prev);
              newMap.set(record.id, { submittedEnabled: true, receivedEnabled: false });
              return newMap;
            });
          } else {
             // Unknown event type - enable both
             setRecordButtonStates(prev => {
               const newMap = new Map(prev);
               newMap.set(record.id, { submittedEnabled: true, receivedEnabled: true });
               return newMap;
             });
           }
         } else {
           // No events found - enable Submitted only (start of cycle)
           setRecordButtonStates(prev => {
             const newMap = new Map(prev);
             newMap.set(record.id, { submittedEnabled: true, receivedEnabled: false });
             return newMap;
           });
         }
         return;
       }

      // Check events for current revision (events already resolved above)
      if (Array.isArray(events)) {
        const currentRevEvents = events.filter((e: any) => e.revision_number === record.revision);
        
        if (currentRevEvents.length === 0) {
          // No events - enable Submitted
          setRecordButtonStates(prev => {
            const newMap = new Map(prev);
            newMap.set(record.id, { submittedEnabled: true, receivedEnabled: false });
            return newMap;
          });
          return;
        }

        const sortedEvents = [...currentRevEvents].sort((a: any, b: any) => {
          const dateDiff = new Date(b.event_date).getTime() - new Date(a.event_date).getTime();
          if (dateDiff !== 0) return dateDiff;
          // Tiebreaker: use created_at to get the most recently created event
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        
        const lastEvent = sortedEvents[0];
        
        if (lastEvent.event_type === 'submitted') {
          setRecordButtonStates(prev => {
            const newMap = new Map(prev);
            newMap.set(record.id, { submittedEnabled: false, receivedEnabled: true });
            return newMap;
          });
        } else if (lastEvent.event_type === 'received') {
          setRecordButtonStates(prev => {
            const newMap = new Map(prev);
            newMap.set(record.id, { submittedEnabled: true, receivedEnabled: false });
            return newMap;
          });
        } else {
          setRecordButtonStates(prev => {
            const newMap = new Map(prev);
            newMap.set(record.id, { submittedEnabled: true, receivedEnabled: true });
            return newMap;
          });
        }
      } else {
        setRecordButtonStates(prev => {
          const newMap = new Map(prev);
          newMap.set(record.id, { submittedEnabled: true, receivedEnabled: false });
          return newMap;
        });
      }
    } catch (error) {
      console.error('Error checking button state for record:', error);
      setRecordButtonStates(prev => {
        const newMap = new Map(prev);
        newMap.set(record.id, { submittedEnabled: true, receivedEnabled: true });
        return newMap;
      });
    }
  };

  // SIMPLE: Normalize ANY date input to YYYY-MM-DD format using LOCAL time (matches UI display)
  const normalizeDate = (dateInput: string | Date | null | undefined): string | null => {
    if (!dateInput) return null;
    
    // If already in YYYY-MM-DD format, return as is
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }
    
    // Parse the date and extract LOCAL date components (matches what user sees in UI)
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return null;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // SIMPLE: Calculate days between two YYYY-MM-DD date strings
  const calculateDaysBetween = (startDate: string, endDate: string): number => {
    if (!startDate || !endDate) return 0;
    
    const startParts = startDate.split('-');
    const endParts = endDate.split('-');
    
    if (startParts.length !== 3 || endParts.length !== 3) return 0;
    
    const start = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));
    const end = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));
    
    const diffTime = end.getTime() - start.getTime();
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, days);
  };

  // Helper function to calculate total statistics from revision events
  // Uses the SAME logic as VDCRRevisionHistory for consistency
  const calculateTotalStats = (record: VDCRRecord) => {
    if (!record.revisionEvents || record.revisionEvents.length === 0) {
      return {
        totalDaysWithUs: 0,
        totalDaysWithClient: 0,
        totalDays: 0,
        totalSubmissions: 0
      };
    }

    const sortedEvents = [...record.revisionEvents].sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );

    // Group by revision
    const revisionMap = new Map<string, { submitted?: any; received?: any }>();
    sortedEvents.forEach(event => {
      const rev = event.revision_number || '00';
      if (!revisionMap.has(rev)) {
        revisionMap.set(rev, {});
      }
      const revData = revisionMap.get(rev)!;
      if (event.event_type === 'submitted') {
        revData.submitted = event;
      } else if (event.event_type === 'received') {
        revData.received = event;
      }
    });

    const sortedRevisions = Array.from(revisionMap.entries()).sort((a, b) => {
      const aNum = parseInt(a[0].replace(/[^0-9]/g, '')) || 0;
      const bNum = parseInt(b[0].replace(/[^0-9]/g, '')) || 0;
      return aNum - bNum;
    });

    let totalDaysWithClient = 0;
    let totalDaysWithUs = 0;
    let previousReceivedDate: string | null = null;

    sortedRevisions.forEach(([rev, revEvents], index) => {
      const revNum = parseInt(rev.replace(/[^0-9]/g, '') || '0');
      const sentDate = revEvents.submitted?.event_date || null;
      const receivedDate = revEvents.received?.event_date || null;

      // SIMPLE: Calculate days with client (only if received)
      if (sentDate && receivedDate) {
        const sentDateOnly = normalizeDate(sentDate);
        const receivedDateOnly = normalizeDate(receivedDate);
        if (sentDateOnly && receivedDateOnly) {
          const days = calculateDaysBetween(sentDateOnly, receivedDateOnly);
          totalDaysWithClient += days;
        }
      }

      // SIMPLE: Calculate days with us
      if (revNum === 0 && sentDate) {
        // Rev-00: Start Date → Sent Date
        const startDate = normalizeDate((record as any).projectDocumentationStartDate) || normalizeDate(projectData?.sales_order_date);
        const sentDateOnly = normalizeDate(sentDate);
        if (startDate && sentDateOnly) {
          const days = calculateDaysBetween(startDate, sentDateOnly);
          totalDaysWithUs += days;
        }
      } else if (sentDate && previousReceivedDate) {
        // Other revisions: Previous Received Date → Current Sent Date
        const prevDateOnly = normalizeDate(previousReceivedDate);
        const sentDateOnly = normalizeDate(sentDate);
        if (prevDateOnly && sentDateOnly) {
          const days = calculateDaysBetween(prevDateOnly, sentDateOnly);
          totalDaysWithUs += days;
        }
      }

      if (receivedDate) {
        previousReceivedDate = receivedDate;
      }
    });

    // SIMPLE: No "remaining days" logic needed
    // We only calculate days when we have both: previous received date AND current sent date
    // If document is received but not sent again, we just don't calculate anything yet

    const totalSubmissions = sortedEvents.filter(e => e.event_type === 'submitted').length;
    const totalDays = totalDaysWithUs + totalDaysWithClient;

    return {
      totalDaysWithUs,
      totalDaysWithClient,
      totalDays,
      totalSubmissions
    };
  };

  // Helper function to get counter metrics for a record
  const getCounterMetrics = (record: VDCRRecord) => {
    if (!record.revisionEvents || record.revisionEvents.length === 0) {
      return {
        daysSinceLastSubmission: null,
        daysWithClient: null,
        currentStatus: 'No events',
        lastEventDate: null,
        daysSinceLastEvent: null,
        lastEventType: null,
        lastEventRevision: null
      };
    }

    const sortedEvents = [...record.revisionEvents].sort((a, b) => 
      new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );

    const lastEvent = sortedEvents[sortedEvents.length - 1];
    const lastSubmission = sortedEvents.filter(e => e.event_type === 'submitted').pop();
    const lastReceipt = sortedEvents.filter(e => e.event_type === 'received').pop();

    let daysSinceLastSubmission = null;
    let daysWithClient = null;
    let currentStatus = 'No events';

    // Last event information
    const lastEventDate = lastEvent ? new Date(lastEvent.event_date) : null;
    const daysSinceLastEvent = lastEventDate ? calculateDaysBetween(
      lastEvent.event_date,
      new Date().toISOString()
    ) : null;
    const lastEventType = lastEvent ? lastEvent.event_type : null;
    const lastEventRevision = lastEvent ? lastEvent.revision_number : null;

    if (lastSubmission) {
      daysSinceLastSubmission = calculateDaysBetween(
        lastSubmission.event_date,
        new Date().toISOString()
      );
    }

    if (lastSubmission && !lastReceipt) {
      // Submitted but not received back
      daysWithClient = calculateDaysBetween(
        lastSubmission.event_date,
        new Date().toISOString()
      );
      currentStatus = 'With Client';
    } else if (lastSubmission && lastReceipt) {
      // Check if there's a submission after the last receipt
      const submissionsAfterLastReceipt = sortedEvents.filter(e => 
        e.event_type === 'submitted' && 
        new Date(e.event_date) > new Date(lastReceipt.event_date)
      );
      
      if (submissionsAfterLastReceipt.length > 0) {
        const latestSubmission = submissionsAfterLastReceipt[submissionsAfterLastReceipt.length - 1];
        daysWithClient = calculateDaysBetween(
          latestSubmission.event_date,
          new Date().toISOString()
        );
        currentStatus = 'With Client';
      } else {
        currentStatus = 'Received';
      }
    }

    return {
      daysSinceLastSubmission,
      daysWithClient,
      currentStatus,
      lastEventDate,
      daysSinceLastEvent,
      lastEventType,
      lastEventRevision
    };
  };

  // Filter VDCR data based on search query
  const filteredVDCRData = useMemo(() => {
    // Sort data by serial number in ascending order (1, 2, 3, ...)
    // Helper function to normalize Sr. No. for sorting - extracts integer from various formats
    const normalizeSrNoForSort = (srNoInput: string | number | undefined): number => {
      if (!srNoInput) return 0;
      const srNoStr = String(srNoInput).trim();
      // Extract just the numeric part, handle formats like "1", "01", "001", "Rev-01", etc.
      const match = srNoStr.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };

    const sortedData = [...vdcrData].sort((a, b) => {
      const srNoA = normalizeSrNoForSort(a.srNo);
      const srNoB = normalizeSrNoForSort(b.srNo);
      return srNoA - srNoB;
    });

    if (!searchQuery.trim()) {
      return sortedData;
    }

    const query = searchQuery.toLowerCase().trim();
    
    return sortedData.filter((record) => {
      // Search in document name
      if (record.documentName?.toLowerCase().includes(query)) return true;
      
      // Search in equipment tag numbers
      if (record.equipmentTagNo.some(tag => tag.toLowerCase().includes(query))) return true;
      
      // Search in revision
      if (record.revision?.toLowerCase().includes(query)) return true;
      
      // Search in status
      if (record.status?.toLowerCase().includes(query)) return true;
      
      // Search in client doc number
      if (record.clientDocNo?.toLowerCase().includes(query)) return true;
      
      // Search in internal doc number
      if (record.internalDocNo?.toLowerCase().includes(query)) return true;
      
      // Search in serial numbers
      if (record.mfgSerialNo.some(serial => serial.toLowerCase().includes(query))) return true;
      
      // Search in job numbers
      if (record.jobNo.some(job => job.toLowerCase().includes(query))) return true;
      
      // Search in code status
      if (record.codeStatus?.toLowerCase().includes(query)) return true;
      
      // Search in department
      if (record.department?.toLowerCase().includes(query)) return true;
      
      // Search in remarks
      if (record.remarks?.toLowerCase().includes(query)) return true;
      
      // Search in updated by
      if (record.updatedBy?.toLowerCase().includes(query)) return true;
      
      // Search in serial number
      if (record.srNo?.toLowerCase().includes(query)) return true;
      
      return false;
    });
  }, [vdcrData, searchQuery]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-50 text-green-700 border border-green-200';
      case 'sent-for-approval':
        return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
      case 'received-for-comment':
        return 'bg-orange-50 text-orange-700 border border-orange-200';
      case 'pending':
        return 'bg-gray-50 text-gray-700 border border-gray-200';
      case 'rejected':
        return 'bg-red-50 text-red-700 border border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Approved';
      case 'sent-for-approval':
        return 'Submitted for Review';
      case 'received-for-comment':
        return 'Received Commented Doc';
      case 'pending':
        return 'Pending';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  };

  const getCodeStatusColor = (codeStatus: string) => {
    switch (codeStatus) {
      case 'Code 1':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'Code 2':
        return 'bg-green-50 text-green-700 border border-green-200';
      case 'Code 3':
        return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
      case 'Code 4':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  const handleEditVDCR = async (record: VDCRRecord) => {
    // // console.log('🔧 Opening edit form for VDCR record, equipment tags:', record.equipmentTagNo);

    setEditingVDCR(record);
    setIsAddingNew(false);
    setSelectedEquipments(record.equipmentTagNo);
    
    // Reset department dropdown state
    setDepartmentDropdownOpen(false);
    setDepartmentSearchQuery('');
    setEditingDepartment(null);
    setShowAddNewDepartment(false);
    setNewDepartmentValue('');
    
    // Load available departments when opening edit modal
    loadAvailableDepartments();

    // Load project data to get sales_order_date
    try {
      const project = await fastAPI.getProjectSummaryById(projectId);
      if (project) {
        setProjectData(project as any);
      }
    } catch (error) {
      console.error('Error loading project data:', error);
    }

    // Format date for input field (YYYY-MM-DD format)
    const formatDateForInput = (dateStr: string | null | undefined): string => {
      if (!dateStr) return '';
      // If it's already in YYYY-MM-DD format, return as is
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
      // Otherwise, parse and format
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    };

    const customDate = (record as any).projectDocumentationStartDate;
    const defaultDate = projectData?.sales_order_date ? formatDateForInput(projectData.sales_order_date) : '';
    const targetedDate = (record as any).targetedFinishDate ? formatDateForInput((record as any).targetedFinishDate) : '';

    setFormData({
      srNo: record.srNo,
      revision: record.revision,
      documentName: record.documentName,
      clientDocNo: record.clientDocNo,
      internalDocNo: record.internalDocNo,
      codeStatus: record.codeStatus,
      status: record.status,
      department: record.department || '',
      remarks: record.remarks || '',
      projectDocumentationStartDate: customDate ? formatDateForInput(customDate) : defaultDate,
      targetedFinishDate: targetedDate,
      showInEquipmentDocTab: record.showInEquipmentDocTab !== false
    });

    // Reset locks to default (all locked)
    setFieldLocks({
      srNo: true,
      revision: true,
      documentName: true,
      clientDocNo: true,
      internalDocNo: true,
      department: true,
      projectDocumentationStartDate: true,
      targetedFinishDate: true // Locked by default
    });

    // Set uploaded files if document exists
    if (record.documentFile) {
      setUploadedFiles([record.documentFile]);
    } else {
      setUploadedFiles([]);
    }

    setIsEditModalOpen(true);
  };

   // Helper function to toggle field lock
   const toggleFieldLock = (fieldName: 'srNo' | 'revision' | 'documentName' | 'clientDocNo' | 'internalDocNo' | 'department' | 'projectDocumentationStartDate' | 'targetedFinishDate') => {
    setFieldLocks(prev => ({
      ...prev,
      [fieldName]: !prev[fieldName]
    }));
  };

  const handleAddNewVDCR = async () => {
    setEditingVDCR(null);
    setIsAddingNew(true);
    setSelectedEquipments([]);
    
    // Load available departments when opening add modal
    loadAvailableDepartments();

    // Load project data to get sales_order_date for default
    try {
      const project = await fastAPI.getProjectSummaryById(projectId);
      if (project) {
        setProjectData(project as any);
      }
    } catch (error) {
      console.error('Error loading project data:', error);
    }

    // Helper function to normalize Sr. No. - extracts integer from various formats
    const normalizeSrNo = (srNoInput: string | number | undefined): number => {
      if (!srNoInput) return 0;
      const srNoStr = String(srNoInput).trim();
      // Extract just the numeric part, handle formats like "1", "01", "001", "Rev-01", etc.
      const match = srNoStr.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };

    // Auto-generate next Sr. No.
    const existingSrNos = vdcrData.map(record => {
      return normalizeSrNo(record.srNo);
    });
    const nextSrNo = Math.max(...existingSrNos, 0) + 1;
    const autoGeneratedSrNo = String(nextSrNo).padStart(3, '0');

    // Get default date from project (sales_order_date) or leave empty
    const defaultDate = projectData?.sales_order_date ? projectData.sales_order_date.split('T')[0] : '';

      setFormData({
        srNo: autoGeneratedSrNo,
        revision: 'Rev-00',
        documentName: '',
        clientDocNo: '',
        internalDocNo: '',
        codeStatus: 'Code 3',
        status: 'pending',
        department: '',
        remarks: '',
        projectDocumentationStartDate: defaultDate,
        targetedFinishDate: '',
        showInEquipmentDocTab: true
    });
 
    // Reset locks to default (all locked)
    setFieldLocks({
      srNo: true,
      revision: true,
      documentName: true,
      clientDocNo: true,
      internalDocNo: true,
      department: true,
      projectDocumentationStartDate: true,
      targetedFinishDate: true // Locked by default
    });

    setIsEditModalOpen(true);
  };

// Handle revision event creation
const handleCreateRevisionEvent = async () => {
  // Better validation with specific error messages
  if (!revisionEventModal.eventType) {
    console.error('❌ Validation failed: revisionEventModal.eventType is missing', revisionEventModal);
    toast({ 
      title: 'Error', 
      description: 'Event type is required. Please select an event type.', 
      variant: 'destructive' 
    });
    return;
  }

  if (!editingVDCR) {
    console.error('❌ Validation failed: editingVDCR is null', { editingVDCR, revisionEventModal });
    toast({ 
      title: 'Error', 
      description: 'No documentation record selected. Please select a documentation record first.', 
      variant: 'destructive' 
    });
    return;
  }

  if (!editingVDCR.id) {
    console.error('❌ Validation failed: editingVDCR.id is missing', editingVDCR);
    toast({ 
      title: 'Error', 
      description: 'Documentation record ID is missing. Please try refreshing the page.', 
      variant: 'destructive' 
    });
    return;
  }

  if (!user?.id) {
    console.error('❌ Validation failed: user.id is missing', user);
    toast({ 
      title: 'Error', 
      description: 'User not authenticated. Please login again.', 
      variant: 'destructive' 
    });
    return;
  }

  if (revisionEventModal.hasNotableChange && !revisionEventModal.notableChangeTitle?.trim()) {
    toast({
      title: 'Error',
      description: 'Please enter a title for this notable change.',
      variant: 'destructive'
    });
    return;
  }

  try {
    // Get current revision events to check for complete cycle
    let currentRevision = formData.revision;
    let revisionToUse = currentRevision;
    
    // If creating a "submitted" event, check if we need to increment revision
    if (revisionEventModal.eventType === 'submitted') {
      try {
        const existingEvents = await fastAPI.getVDCRRevisionEvents(editingVDCR.id);
        if (Array.isArray(existingEvents)) {
          // Check if current revision has a complete cycle (submitted + commented)
          const currentRevEvents = existingEvents.filter((e: any) => e.revision_number === currentRevision);
          const hasSubmitted = currentRevEvents.some((e: any) => e.event_type === 'submitted');
          const hasCommented = currentRevEvents.some((e: any) => e.event_type === 'received');
          
          // If current revision has both submitted and commented, increment for new submitted
          if (hasSubmitted && hasCommented) {
            // Extract revision number (e.g., "Rev-00" -> 0, "Rev-01" -> 1)
            const revMatch = currentRevision.match(/Rev-?(\d+)/i) || currentRevision.match(/(\d+)/);
            if (revMatch) {
              const revNum = parseInt(revMatch[1], 10);
              const nextRevNum = revNum + 1;
              // Format as "Rev-01", "Rev-02", etc.
              revisionToUse = `Rev-${String(nextRevNum).padStart(2, '0')}`;
              
              // Update the VDCR record's revision number
              await fastAPI.updateVDCRRecord(editingVDCR.id, { revision: revisionToUse });
              
              // Update formData and editingVDCR to reflect new revision
              setFormData(prev => ({ ...prev, revision: revisionToUse }));
              setEditingVDCR(prev => prev ? { ...prev, revision: revisionToUse } : null);
            }
          }
        }
      } catch (error) {
        console.error('Error checking revision events:', error);
        // Continue with current revision if check fails
      }
    }

    // Convert event date to ISO string (date only, set to start of day)
    let eventDateISO = new Date().toISOString(); // Default to now
    if (revisionEventModal.eventDate) {
      const date = new Date(revisionEventModal.eventDate);
      date.setHours(0, 0, 0, 0); // Set to start of day
      eventDateISO = date.toISOString();
    }

    // Convert estimated return date to ISO string if provided (date only, set to start of day)
    let estimatedReturnDateISO = null;
    if (revisionEventModal.estimatedReturnDate) {
      const date = new Date(revisionEventModal.estimatedReturnDate);
      date.setHours(0, 0, 0, 0); // Set to start of day
      estimatedReturnDateISO = date.toISOString();
    }

    // Convert target submission date to ISO string if provided (date only, set to start of day)
    let targetSubmissionDateISO = null;
    if (revisionEventModal.targetSubmissionDate) {
      const date = new Date(revisionEventModal.targetSubmissionDate);
      date.setHours(0, 0, 0, 0); // Set to start of day
      targetSubmissionDateISO = date.toISOString();
    }

    const eventData = {
      vdcr_record_id: editingVDCR.id,
      event_type: revisionEventModal.eventType,
      revision_number: revisionToUse,
      event_date: eventDateISO, // Use selected date instead of current date
      estimated_return_date: estimatedReturnDateISO,
      target_submission_date: targetSubmissionDateISO,
      notes: revisionEventModal.notes || null,
      document_url: revisionEventModal.documentUrl || null,
      has_notable_change: revisionEventModal.hasNotableChange || false,
      notable_change_title: revisionEventModal.hasNotableChange && revisionEventModal.notableChangeTitle?.trim() ? revisionEventModal.notableChangeTitle.trim() : null,
      // RLS policy allows created_by = auth.uid() OR created_by IS NULL
      // Set to user.id if available, otherwise NULL (RLS will allow it)
      created_by: user?.id || null
    };

    console.log('📤 Sending revision event data to API:', {
      ...eventData,
      document_url: eventData.document_url ? '✓ Document URL provided' : '✗ No document URL'
    });
    
    const result = await fastAPI.createVDCRRevisionEvent(eventData);
    console.log('✅ Revision event created successfully:', result);
    
    // Automatically update VDCR record status based on event type
    let statusUpdate: string | null = null;
    if (revisionEventModal.eventType === 'submitted') {
      statusUpdate = 'sent-for-approval';
    } else if (revisionEventModal.eventType === 'received') {
      statusUpdate = 'received-for-comment';
    }

    // Automatically update VDCR record status based on event type
    // Always update status when creating a revision event (regardless of current status)
    if (statusUpdate) {
      try {
        console.log(`🔄 Updating VDCR status from "${editingVDCR.status}" to "${statusUpdate}"`);
        const now = new Date().toISOString();
        await fastAPI.updateVDCRRecord(editingVDCR.id, { 
          status: statusUpdate,
          last_update: now,
          updated_at: now // Update updated_at so it shows in company highlights
        });
        console.log(`✅ VDCR status automatically updated to: ${statusUpdate}`);
        
        // Update local state immediately
        setEditingVDCR(prev => prev ? { ...prev, status: statusUpdate as any } : null);
        
        // Also update formData status if modal is still open
        setFormData(prev => ({ ...prev, status: statusUpdate as any }));
        
        // Update vdcrData state to reflect the change immediately
        setVdcrData(prev => prev.map(record => 
          record.id === editingVDCR.id 
            ? { ...record, status: statusUpdate as any }
            : record
        ));
      } catch (statusError) {
        console.error('⚠️ Error updating VDCR status (non-fatal):', statusError);
        // Don't fail the whole operation if status update fails
      }
    }
    
    const documentStatus = revisionEventModal.documentUrl 
      ? ' Document uploaded and linked to this event.' 
      : ' Note: No document was uploaded for this event.';
    
    const statusUpdateMessage = statusUpdate
      ? ` Status automatically updated to "${statusUpdate === 'sent-for-approval' ? 'Submitted for Review' : 'Received Commented Doc'}".`
      : '';
    
    toast({ 
      title: 'Success', 
      description: `Revision event ${revisionEventModal.eventType === 'submitted' ? 'submitted' : 'commented'} successfully for revision ${revisionToUse}.${statusUpdateMessage}${documentStatus}${revisionToUse !== currentRevision ? ` Revision updated to ${revisionToUse}.` : ''}` 
    });

    // Reload VDCR data to refresh revision events and status
    await loadVDCRData();
    
    // Update formData.revision if it changed (triggers useEffect to refresh button states)
    if (revisionToUse !== currentRevision) {
      setFormData(prev => ({ ...prev, revision: revisionToUse }));
    }
    
    // Trigger button state refresh by updating refresh counter
    // This ensures the useEffect runs and checks the latest events
    setButtonStateRefresh(prev => prev + 1);

      // Close modal
      setRevisionEventModal({
        isOpen: false,
        eventType: null,
        eventDate: new Date().toISOString().split('T')[0], // Reset to today
        estimatedReturnDate: '',
        targetSubmissionDate: '',
        notes: '',
        documentFile: null,
        documentUrl: null,
        isUploadingDocument: false,
        uploadAbortController: null,
        hasNotableChange: false,
        notableChangeTitle: ''
      });
  } catch (error: any) {
    console.error('❌ Error creating revision event:', error);
    console.error('❌ Error details:', {
      message: error?.message,
      response: error?.response?.data,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      config: error?.config
    });

    // Check if it's a 404 (table doesn't exist) or other error
    if (error?.response?.status === 404) {
      toast({ 
        title: 'Database Setup Required', 
        description: 'Revision events table not found. Please run the migration SQL file first: supabase_migration_vdcr_revision_events.sql', 
        variant: 'destructive' 
      });
    } else if (error?.response?.status === 401 || error?.response?.status === 403) {
      // RLS policy violation
      const errorMessage = error?.response?.data?.message || error?.response?.data?.hint || 'Access denied. You may not have permission to create revision events for this project.';
      toast({ 
        title: 'Access Denied', 
        description: errorMessage, 
        variant: 'destructive' 
      });
    } else {
      const errorMessage = error?.response?.data?.message || error?.response?.data?.hint || error?.message || 'Failed to create revision event';
      toast({ 
        title: 'Error', 
        description: errorMessage, 
        variant: 'destructive' 
      });
    }
  }
};

  const handleSaveChanges = async () => {
    // Validate required fields
    if (!formData.srNo || !formData.documentName || !formData.clientDocNo || !formData.internalDocNo || selectedEquipments.length === 0) {
      toast({ title: 'Notice', description: 'Please fill in all required fields and select at least one equipment.' });
      return;
    }

    try {
      setIsSaving(true);
      
        // Revision number is NEVER changed by regular edits (status, doc name, remarks, etc.)
        // Revision only changes when user clicks Submitted/Commented (revision event buttons)
        const finalRevision = formData.revision;

      // Get selected equipment details
      const selectedEquipmentDetails = getSelectedEquipmentDetails();
      const newMfgSerialNos = selectedEquipmentDetails.map(eq => eq.mfgSerialNo);
      const newJobNos = selectedEquipmentDetails.map(eq => eq.jobNo);

      // Get document file ID if document is uploaded
      let documentFileId = null;
      if (uploadedFiles.length > 0) {
        const latestFile = uploadedFiles[uploadedFiles.length - 1];
        // Only use UUID format IDs, skip local fallback IDs
        if (latestFile.id && !latestFile.id.startsWith('doc-')) {
          documentFileId = latestFile.id;
        }
      }

      // Get document URL from uploaded files
      const documentUrl = uploadedFiles.length > 0 ? uploadedFiles[uploadedFiles.length - 1].filePath : null;

      // Get firm_id from user data
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const firmId = userData.firm_id;

      // Use userData.id directly (fast, no database call)
      let userId = userData.id || user?.id;
      if (!userId) {
        toast({ title: 'Error', description: 'Unable to determine user ID. Please try logging in again.', variant: 'destructive' });
        setIsSaving(false);
        return;
      }

      // Prepare data for Supabase
      const vdcrData: any = {
        project_id: projectId,
        sr_no: formData.srNo,
        equipment_tag_numbers: selectedEquipments,
        mfg_serial_numbers: newMfgSerialNos,
        job_numbers: newJobNos,
        client_doc_no: formData.clientDocNo,
        internal_doc_no: formData.internalDocNo,
        document_name: formData.documentName,
        revision: finalRevision,
        code_status: formData.codeStatus,
        status: formData.status,
        department: formData.department && formData.department.trim() !== '' ? formData.department.trim() : null,
        remarks: formData.remarks,
        updated_by: userId,
        document_url: documentUrl, // Store document URL directly in vdcr_records
        firm_id: firmId, // Required field for vdcr_records table
        last_update: new Date().toISOString(), // Required field for vdcr_records table
        project_documentation_start_date: formData.projectDocumentationStartDate && formData.projectDocumentationStartDate.trim() !== '' 
          ? formData.projectDocumentationStartDate 
          : null, // Custom documentation start date (null = use project PO date)
        targeted_finish_date: formData.targetedFinishDate && formData.targetedFinishDate.trim() !== '' 
          ? formData.targetedFinishDate 
          : null, // Targeted finish date (null if not set)
        show_in_equipment_doc_tab: formData.showInEquipmentDocTab
      };

      if (isAddingNew) {
        // Create new VDCR record
        try {
          const newRecord = await fastAPI.createVDCRRecord(vdcrData);
          // console.log('✅ New VDCR record created:', newRecord);

          // Set the selectedVDCR to the newly created record ID
          // Supabase POST with return=representation usually returns an array
          let recordId = null;
          
          // Handle array response (most common)
          if (Array.isArray(newRecord) && newRecord.length > 0) {
            recordId = newRecord[0].id;
            // console.log('📝 Extracted recordId from array:', recordId);
          } 
          // Handle object response
          else if (newRecord && typeof newRecord === 'object' && (newRecord as any).id) {
            recordId = (newRecord as any).id;
            // console.log('📝 Extracted recordId from object:', recordId);
          }
          
          if (recordId) {
            setSelectedVDCR(recordId);
            // console.log('🎯 Set selectedVDCR to:', recordId);

            // Log VDCR creation (always log creation separately)
            try {
              // console.log('📝 Logging VDCR creation:', { projectId, recordId, documentName: formData.documentName });
              await logVDCRCreated(projectId, recordId, formData.documentName);
              // console.log('✅ VDCR creation logged successfully');
            } catch (logError) {
              console.error('⚠️ Error logging VDCR creation (non-fatal):', logError);
              console.error('⚠️ Log error details:', JSON.stringify(logError, null, 2));
            }
            
            // Log document upload separately if document was uploaded during creation
            if (documentUrl) {
              try {
                // console.log('📝 Logging document upload during creation:', { projectId, recordId, fileName: documentUrl.split('/').pop() });
                await logVDCRDocumentUploaded(projectId, recordId, formData.documentName, documentUrl.split('/').pop() || 'document');
                // console.log('✅ Document upload logged successfully during creation');
              } catch (logError) {
                console.error('⚠️ Error logging document upload (non-fatal):', logError);
              }
            }
            if (formData.showInEquipmentDocTab) {
              try {
                await fastAPI.syncVDCRToEquipment(recordId);
              } catch (syncError) {
                console.error('⚠️ Error syncing VDCR to equipment (non-fatal):', syncError);
              }
            }
          } else {
            console.error('❌ Failed to extract recordId from response:', newRecord);
            toast({ 
              title: 'Warning', 
              description: 'Documentation record created but activity log may not be recorded. Please refresh the page.', 
              variant: 'default' 
            });
          }
        } catch (error: any) {
          // 🔧 FIX: If 409 error (foreign key constraint), fetch correct ID and retry
          if (error?.response?.status === 409 && error?.response?.data?.code === '23503') {
            // console.log('⚠️ Foreign key error detected, fetching correct user ID...');
            const correctUserId = await fetchCorrectUserIdFromDB();
            if (correctUserId) {
              // Retry with correct user ID
              vdcrData.updated_by = correctUserId;
              const newRecord = await fastAPI.createVDCRRecord(vdcrData);
              // console.log('✅ New VDCR record created (retry):', newRecord);
              
              let recordId = null;
              // Handle array response
              if (Array.isArray(newRecord) && newRecord.length > 0) {
                recordId = newRecord[0].id;
              } 
              // Handle object response
              else if (newRecord && typeof newRecord === 'object' && (newRecord as any).id) {
                recordId = (newRecord as any).id;
              }
              
              if (recordId) {
                setSelectedVDCR(recordId);
                // console.log('🎯 Set selectedVDCR to (retry):', recordId);
                
                // Log VDCR creation after retry (always log creation separately)
                try {
                  // console.log('📝 Logging VDCR creation (retry):', { projectId, recordId, documentName: formData.documentName });
                  await logVDCRCreated(projectId, recordId, formData.documentName);
                  // console.log('✅ VDCR creation logged successfully (retry)');
                } catch (logError) {
                  console.error('⚠️ Error logging VDCR creation (non-fatal):', logError);
                  console.error('⚠️ Log error details:', JSON.stringify(logError, null, 2));
                }
                
                // Log document upload separately if document was uploaded during creation (retry)
                if (documentUrl) {
                  try {
                    // console.log('📝 Logging document upload during creation (retry):', { projectId, recordId, fileName: documentUrl.split('/').pop() });
                    await logVDCRDocumentUploaded(projectId, recordId, formData.documentName, documentUrl.split('/').pop() || 'document');
                    // console.log('✅ Document upload logged successfully during creation (retry)');
                  } catch (logError) {
                    console.error('⚠️ Error logging document upload (non-fatal):', logError);
                  }
                }
                if (formData.showInEquipmentDocTab) {
                  try {
                    await fastAPI.syncVDCRToEquipment(recordId);
                  } catch (syncError) {
                    console.error('⚠️ Error syncing VDCR to equipment (non-fatal):', syncError);
                  }
                }
              } else {
                console.error('❌ Failed to extract recordId from response (retry):', newRecord);
              }
            } else {
              throw new Error('Unable to fetch correct user ID. Please logout and login again.');
            }
          } else {
            throw error;
          }
        }
      } else {
        // Update existing VDCR record - only send updatable fields
        if (!editingVDCR) return;

        // Track changes for logging - EVERY change gets separate log entry
        const changes: Record<string, { old: any; new: any }> = {};
        
        if (editingVDCR.status !== formData.status) {
          changes.status = { old: editingVDCR.status, new: formData.status };
        }
        if (editingVDCR.documentName !== formData.documentName) {
          changes.documentName = { old: editingVDCR.documentName, new: formData.documentName };
        }
        if (editingVDCR.revision !== formData.revision) {
          changes.revision = { old: editingVDCR.revision, new: formData.revision };
        }
        if (editingVDCR.codeStatus !== formData.codeStatus) {
          changes.codeStatus = { old: editingVDCR.codeStatus, new: formData.codeStatus };
        }
        if (editingVDCR.clientDocNo !== formData.clientDocNo) {
          changes.clientDocNo = { old: editingVDCR.clientDocNo, new: formData.clientDocNo };
        }
        if (editingVDCR.internalDocNo !== formData.internalDocNo) {
          changes.internalDocNo = { old: editingVDCR.internalDocNo, new: formData.internalDocNo };
        }
        if ((editingVDCR.department || '') !== (formData.department || '')) {
          changes.department = { old: editingVDCR.department || '', new: formData.department || '' };
        }
        if (editingVDCR.srNo !== formData.srNo) {
          changes.srNo = { old: editingVDCR.srNo, new: formData.srNo };
        }
        if (editingVDCR.remarks !== formData.remarks) {
          changes.remarks = { old: editingVDCR.remarks || '', new: formData.remarks || '' };
        }
        
        // Check equipment changes
        const oldEquipmentTags = JSON.stringify(editingVDCR.equipmentTagNo?.sort() || []);
        const newEquipmentTags = JSON.stringify(selectedEquipments.sort());
        if (oldEquipmentTags !== newEquipmentTags) {
          changes.equipmentTagNumbers = { 
            old: editingVDCR.equipmentTagNo?.join(', ') || '', 
            new: selectedEquipments.join(', ') || '' 
          };
        }

        const updateData: any = {
          sr_no: formData.srNo,
          equipment_tag_numbers: selectedEquipments,
          mfg_serial_numbers: newMfgSerialNos,
          job_numbers: newJobNos,
          client_doc_no: formData.clientDocNo,
          internal_doc_no: formData.internalDocNo,
          document_name: formData.documentName,
          revision: finalRevision,
          code_status: formData.codeStatus,
          status: formData.status,
          department: formData.department && formData.department.trim() !== '' ? formData.department.trim() : null,
          remarks: formData.remarks,
          updated_by: userId,
          document_url: documentUrl, // Store document URL directly in vdcr_records
          last_update: new Date().toISOString(), // Update timestamp
          updated_at: new Date().toISOString(), // Update updated_at so it shows in company highlights
          project_documentation_start_date: formData.projectDocumentationStartDate && formData.projectDocumentationStartDate.trim() !== '' 
            ? formData.projectDocumentationStartDate 
            : null, // Custom documentation start date (null = use project PO date)
          targeted_finish_date: formData.targetedFinishDate && formData.targetedFinishDate.trim() !== '' 
            ? formData.targetedFinishDate 
            : null, // Targeted finish date (null if not set)
          show_in_equipment_doc_tab: formData.showInEquipmentDocTab
        };

        try {
          await fastAPI.updateVDCRRecord(editingVDCR.id, updateData);
          
          // Log document upload separately if document was uploaded (ALWAYS separate log entry)
          if (documentUrl && !editingVDCR.documentUrl) {
            try {
              // console.log('📝 Logging document upload during update:', { projectId, vdcrId: editingVDCR.id, fileName: documentUrl.split('/').pop() });
              await logVDCRDocumentUploaded(projectId, editingVDCR.id, formData.documentName, documentUrl.split('/').pop() || 'document');
              // console.log('✅ Document upload logged successfully during update');
            } catch (logError) {
              console.error('⚠️ Error logging document upload (non-fatal):', logError);
            }
          }
          
          // Log status change separately if status changed (ALWAYS separate log entry)
          if (changes.status) {
            try {
              // console.log('📝 Logging status change:', { projectId, vdcrId: editingVDCR.id, oldStatus: changes.status.old, newStatus: changes.status.new });
              await logVDCRStatusChanged(projectId, editingVDCR.id, formData.documentName, changes.status.old, changes.status.new);
              // console.log('✅ Status change logged successfully');
            } catch (logError) {
              console.error('⚠️ Error logging status change (non-fatal):', logError);
            }
          }
          // Sync or remove from equipment based on "Show in equipment doc tab"
          try {
            if (formData.showInEquipmentDocTab) {
              await fastAPI.syncVDCRToEquipment(editingVDCR.id);
            } else {
              await fastAPI.removeVDCRFromEquipment(editingVDCR.id);
            }
          } catch (syncError) {
            console.error('⚠️ Error syncing/removing VDCR from equipment (non-fatal):', syncError);
          }
          
          // Log each field update separately (EVERY field change gets its own log entry)
          const otherChanges = Object.fromEntries(
            Object.entries(changes).filter(([key]) => key !== 'status')
          );
          
          // Log each field change as a separate entry
          for (const [fieldName, fieldChange] of Object.entries(otherChanges)) {
            try {
              // console.log('📝 Logging field update:', { projectId, vdcrId: editingVDCR.id, fieldName, oldValue: fieldChange.old, newValue: fieldChange.new });
              await logVDCRFieldUpdated(
                projectId, 
                editingVDCR.id, 
                formData.documentName, 
                fieldName, 
                fieldChange.old || '', 
                fieldChange.new || ''
              );
              // console.log(`✅ Field update logged successfully: ${fieldName}`);
            } catch (logError) {
              console.error(`⚠️ Error logging field update for ${fieldName} (non-fatal):`, logError);
            }
          }
        } catch (error: any) {
          // 🔧 FIX: If 409 error (foreign key constraint), fetch correct ID and retry
          if (error?.response?.status === 409 && error?.response?.data?.code === '23503') {
            // console.log('⚠️ Foreign key error detected, fetching correct user ID...');
            const correctUserId = await fetchCorrectUserIdFromDB();
            if (correctUserId) {
              // Retry with correct user ID
              updateData.updated_by = correctUserId;
              await fastAPI.updateVDCRRecord(editingVDCR.id, updateData);
              
              // Log after successful retry
              if (documentUrl && !editingVDCR.documentUrl) {
                try {
                  await logVDCRDocumentUploaded(projectId, editingVDCR.id, formData.documentName, documentUrl.split('/').pop() || 'document');
                } catch (logError) {
                  console.error('⚠️ Error logging document upload (non-fatal):', logError);
                }
              }
              if (changes.status) {
                try {
                  await logVDCRStatusChanged(projectId, editingVDCR.id, formData.documentName, changes.status.old, changes.status.new);
                } catch (logError) {
                  console.error('⚠️ Error logging status change (non-fatal):', logError);
                }
              }
              try {
                if (formData.showInEquipmentDocTab) {
                  await fastAPI.syncVDCRToEquipment(editingVDCR.id);
                } else {
                  await fastAPI.removeVDCRFromEquipment(editingVDCR.id);
                }
              } catch (syncError) {
                console.error('⚠️ Error syncing/removing VDCR from equipment (non-fatal):', syncError);
              }
              const otherChanges = Object.fromEntries(
                Object.entries(changes).filter(([key]) => key !== 'status')
              );
              
              // Log each field change as a separate entry (retry case)
              for (const [fieldName, fieldChange] of Object.entries(otherChanges)) {
                try {
                  await logVDCRFieldUpdated(
                    projectId, 
                    editingVDCR.id, 
                    formData.documentName, 
                    fieldName, 
                    fieldChange.old || '', 
                    fieldChange.new || ''
                  );
                } catch (logError) {
                  console.error(`⚠️ Error logging field update for ${fieldName} (non-fatal):`, logError);
                }
              }
            } else {
              throw new Error('Unable to fetch correct user ID. Please logout and login again.');
            }
          } else {
            throw error;
          }
        }
      }

      // Reload data from Supabase
      await loadVDCRData();
      // Reload available departments to update dropdown
      await loadAvailableDepartments();

      // Close modal and reset
      setIsEditModalOpen(false);
      setEditingVDCR(null);
      setIsAddingNew(false);
      setSelectedEquipments([]);
      setUploadedFiles([]);
      setDepartmentDropdownOpen(false);
      setDepartmentSearchQuery('');
      setEditingDepartment(null);
      setShowAddNewDepartment(false);
      setNewDepartmentValue('');
      setFormData({
        srNo: '',
        revision: '',
        documentName: '',
        clientDocNo: '',
        internalDocNo: '',
        codeStatus: '',
        status: '',
        department: '',
        remarks: '',
        projectDocumentationStartDate: '',
        targetedFinishDate: '',
        showInEquipmentDocTab: true
      });

       // Reset locks
      setFieldLocks({
        srNo: true,
        revision: true,
        documentName: true,
        clientDocNo: true,
        internalDocNo: true,
        department: true,
        projectDocumentationStartDate: true,
        targetedFinishDate: true // Locked by default
      });

    } catch (error) {
      // console.error('Error saving VDCR record:', error);
      toast({ title: 'Error', description: 'Error saving documentation record. Please try again.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveRecordCycleTimeOverride = async (record: VDCRRecord) => {
    const currentDraft = docCycleTimeDrafts[record.id] ?? {
      rev00: record.cycleTimeOverrideRev00 != null ? String(record.cycleTimeOverrideRev00) : '',
      rev01Plus: record.cycleTimeOverrideRev01Plus != null ? String(record.cycleTimeOverrideRev01Plus) : '',
    };
    const rev00Parsed = currentDraft.rev00.trim() === '' ? null : Number(currentDraft.rev00.trim());
    const rev01PlusParsed = currentDraft.rev01Plus.trim() === '' ? null : Number(currentDraft.rev01Plus.trim());
    const invalidRev00 = rev00Parsed != null && (!Number.isInteger(rev00Parsed) || rev00Parsed <= 0);
    const invalidRev01Plus = rev01PlusParsed != null && (!Number.isInteger(rev01PlusParsed) || rev01PlusParsed <= 0);
    if (invalidRev00 || invalidRev01Plus) {
      toast({
        title: 'Invalid cycle time',
        description: 'Cycle time must be a positive whole number (days).',
        variant: 'destructive'
      });
      return;
    }

    setSavingDocCycleTimeIds((prev) => {
      const next = new Set(prev);
      next.add(record.id);
      return next;
    });
    try {
      await fastAPI.updateVDCRRecord(record.id, {
        cycle_time_override_rev_00: rev00Parsed,
        cycle_time_override_rev_01_plus: rev01PlusParsed
      });
      setVdcrData((prev) => prev.map((r) => (r.id === record.id ? { ...r, cycleTimeOverrideRev00: rev00Parsed, cycleTimeOverrideRev01Plus: rev01PlusParsed } : r)));
      setEditingVDCR((prev) => (prev && prev.id === record.id ? { ...prev, cycleTimeOverrideRev00: rev00Parsed, cycleTimeOverrideRev01Plus: rev01PlusParsed } : prev));
      setDocCycleTimeDrafts((prev) => ({
        ...prev,
        [record.id]: {
          rev00: rev00Parsed == null ? '' : String(rev00Parsed),
          rev01Plus: rev01PlusParsed == null ? '' : String(rev01PlusParsed)
        }
      }));
      toast({
        title: 'Saved',
        description: rev00Parsed == null && rev01PlusParsed == null
          ? 'Document-specific cycle time removed. Using common cycle time.'
          : 'Document-specific cycle time saved.'
      });
    } catch (error) {
      console.error('Error saving document cycle time override:', error);
      toast({
        title: 'Error',
        description: 'Failed to save document cycle time.',
        variant: 'destructive'
      });
    } finally {
      setSavingDocCycleTimeIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  const handleDeleteVDCR = async (recordId: string) => {
    if (window.confirm('Are you sure you want to delete this documentation record? This action cannot be undone.')) {
      try {
        // Get document name and status before deletion for logging and equipment cleanup
        const recordToDelete = vdcrData.find(r => r.id === recordId);
        const documentName = recordToDelete?.documentName || 'Unknown Document';
        const wasApproved = recordToDelete?.status === 'approved';
        const equipmentTagNumbers = recordToDelete?.equipmentTagNo || [];
        
        // Delete the VDCR record
        await fastAPI.deleteVDCRRecord(recordId);
        
        // Remove VDCR-synced documents from equipment (by vdcr_record_id)
        try {
          await fastAPI.removeVDCRFromEquipment(recordId);
        } catch (e) {
          console.warn('⚠️ removeVDCRFromEquipment (non-fatal):', e);
        }
        // Legacy: if it was approved, also delete by document name (for rows without vdcr_record_id)
        if (wasApproved && equipmentTagNumbers.length > 0) {
          try {
            await fastAPI.deleteApprovedVDCRFromEquipment(recordId, equipmentTagNumbers, documentName);
          } catch (equipmentError) {
            console.error('⚠️ Error deleting equipment documents (non-fatal):', equipmentError);
          }
        }
        
        // Log deletion
        try {
          await logVDCRDeleted(projectId, recordId, documentName);
        } catch (logError) {
          console.error('⚠️ Error logging VDCR deletion (non-fatal):', logError);
        }
        
        // Reload data from Supabase to get remaining records
        await loadVDCRData();
        
        // Renumber remaining VDCR records to have continuous SR numbers
        try {
          console.log('🔄 Renumbering VDCR records after deletion...');
          await fastAPI.renumberVDCRRecords(projectId);
          console.log('✅ Successfully renumbered VDCR records');
          
          // Reload again to show updated SR numbers
          await loadVDCRData();
        } catch (renumberError) {
          console.error('⚠️ Error renumbering VDCR records (non-fatal):', renumberError);
          // Don't fail the whole operation if renumbering fails
        }
      } catch (error) {
        // console.error('Error deleting VDCR record:', error);
        toast({ title: 'Error', description: 'Error deleting documentation record. Please try again.', variant: 'destructive' });
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    // Add this after: if (!files || files.length === 0) return;

    const uploadedFile = files[0];
    const maxFileSize = 50 * 1024 * 1024; // 2MB in bytes

    // Check file size
    if (uploadedFile.size > maxFileSize) {
      toast({ title: 'Error', description: `File size exceeds 50MB limit. Your file is ${(uploadedFile.size / 1024 / 1024).toFixed(2)}MB. Please choose a smaller file.`, variant: 'destructive' });
      return;
    }

    // Auto-populate document name field with the selected file name
    setFormData(prev => ({ ...prev, documentName: uploadedFile.name }));

    // File type detection
    const fileType = uploadedFile.name.toLowerCase().includes('.pdf') ? 'pdf' :
      uploadedFile.name.toLowerCase().includes('.docx') ? 'docx' :
        uploadedFile.name.toLowerCase().includes('.xlsx') ? 'xlsx' :
          uploadedFile.name.toLowerCase().includes('.pptx') ? 'pptx' :
            uploadedFile.name.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) ? 'image' : 'other';

    // Generate unique file name
    const fileExtension = uploadedFile.name.split('.').pop();
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;

    // // console.log('📤 Starting file upload:', uploadedFile.name);
    // // console.log('📁 File type:', fileType);
    // // console.log('📁 File size:', uploadedFile.size, 'bytes');

    try {
      // // console.log('🔄 Starting Supabase storage upload...');

      // Skip bucket check for faster upload

      // No timeout needed - let upload take as long as needed

      // Upload to Supabase Storage - Direct approach without timeout race
      // // console.log('🚀 Starting upload to VDCR-docs bucket...');
      // // console.log('📁 Upload path: documents/' + uniqueFileName);
      // // console.log('📊 File size:', (uploadedFile.size / 1024 / 1024).toFixed(2), 'MB');

      // Direct upload without timeout race - let it take as long as needed
      // // console.log('⏳ Starting direct upload (no timeout)...');

      // Show progress to user (simplified)
      // // console.log(`📤 Uploading ${uploadedFile.name}...`);

      let uploadData, uploadError;
      const bucketName = 'VDCR-docs';

      try {
        // // console.log('🔍 About to call supabase.storage.upload...');
        // // console.log('🔍 Bucket: VDCR-docs');
        // // console.log('🔍 Path: documents/' + uniqueFileName);
        // // console.log('🔍 File:', uploadedFile.name, uploadedFile.size, 'bytes');

        // Try VDCR-docs bucket first, fallback to project-documents if it fails
        // let bucketName = 'VDCR-docs';
        // let result;

        // try {
        //   // console.log('🔍 Trying VDCR-docs bucket first...');

        //   // Add timeout wrapper to prevent hanging
        //   const uploadPromise = supabase.storage
        //     .from(bucketName)
        //     .upload(`documents/${uniqueFileName}`, uploadedFile);

        //   const timeoutPromise = new Promise((_, reject) => 
        //     setTimeout(() => reject(new Error('Upload timeout after 60 seconds')), 60000)
        //   );

        //   result = await Promise.race([uploadPromise, timeoutPromise]);

        //   if (result.error && result.error.message.includes('Bucket not found')) {
        //     throw new Error('VDCR-docs bucket not found');
        //   }

        // } 
        // catch (bucketError) {
        //   console.warn('⚠️ VDCR-docs bucket failed, trying project-documents bucket:', bucketError);

        //   bucketName = 'project-documents';
        //   // console.log('🔍 Trying project-documents bucket as fallback...');

        //   const uploadPromise = supabase.storage
        //     .from(bucketName)
        //     .upload(`documents/${uniqueFileName}`, uploadedFile);

        //   const timeoutPromise = new Promise((_, reject) => 
        //     setTimeout(() => reject(new Error('Upload timeout after 60 seconds')), 60000)
        //   );

        //   result = await Promise.race([uploadPromise, timeoutPromise]);
        // }

        // Upload to VDCR-docs bucket only (no fallback to project-documents)
        let result;

        try {
          // // console.log('🔍 Uploading to VDCR-docs bucket using edge function...');

          // Use edge function for secure upload (service role key not exposed)
          const { uploadFileViaEdgeFunction } = await import('@/lib/edgeFunctions');
          const publicUrl = await uploadFileViaEdgeFunction({
            bucket: 'VDCR-docs',
            filePath: `documents/${uniqueFileName}`,
            file: uploadedFile
          });
          
          // Create result object similar to Supabase SDK response
          result = {
            data: {
              path: `documents/${uniqueFileName}`,
              id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
              fullPath: `documents/${uniqueFileName}`,
              publicUrl: publicUrl
            },
            error: null
          };

        } catch (bucketError) {
          // console.error('❌ VDCR-docs bucket upload failed:', bucketError);
          toast({ title: 'Error', description: 'Failed to upload to document storage. Please ensure the storage bucket exists and try again.', variant: 'destructive' });
          return;
        }

        // // console.log('🔍 Upload result:', result);
        uploadData = result.data;
        uploadError = result.error;

        // Upload completed

        // // console.log('📤 Upload completed!');

        if (uploadError) {
          // console.error('❌ Storage upload error:', uploadError);
          // console.error('❌ Error details:', uploadError.message);

          // Check for specific error types
          if (uploadError.message.includes('File size exceeds')) {
            toast({ title: 'Error', description: 'File is too large. Please upload a file smaller than 2MB.', variant: 'destructive' });
          } else if (uploadError.message.includes('Invalid file type')) {
            toast({ title: 'Error', description: 'Invalid file type. Please upload PDF, Word, Excel, PowerPoint, or image files.', variant: 'destructive' });
          } else if (uploadError.message.includes('Bucket not found')) {
            toast({ title: 'Error', description: 'Storage bucket not found. Please contact support.', variant: 'destructive' });
          } else {
            toast({ title: 'Error', description: `Upload failed: ${uploadError.message}. Please try again.`, variant: 'destructive' });
          }
          return;
        }

        // Upload successful - skip verification to avoid hanging
        // // console.log('✅ Upload completed successfully!');

        // Show success message
        // // console.log(`✅ ${uploadedFile.name} uploaded successfully!`);

      } catch (error) {
        // Upload failed

        // console.error('❌ Upload error:', error);

        // Handle timeout specifically
        if (error.message.includes('timeout')) {
          toast({ title: 'Error', description: 'Upload timed out. Please check your internet connection and try again.', variant: 'destructive' });
        } else {
          toast({ title: 'Error', description: `Upload failed: ${error.message}. Please try again.`, variant: 'destructive' });
        }

        throw error;
      }

      // // console.log('✅ File uploaded to storage:', uploadData);

      // Get public URL using direct API method
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/VDCR-docs/documents/${uniqueFileName}`;
      // // console.log('✅ Public URL generated:', publicUrl);

      // Store document info for later use when saving VDCR record
      const newDocument: DocumentFile = {
        id: `doc-${Date.now()}`,
        fileName: uniqueFileName,
        originalName: uploadedFile.name,
        fileType: fileType as any,
        fileSize: uploadedFile.size,
        uploadDate: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric'
        }),
        uploadedBy: currentUser,
        filePath: publicUrl
      };

      setUploadedFiles(prev => [...prev, newDocument]);
      
      // Revision is NOT changed by file upload - only by Submitted/Commented buttons

      // // console.log('✅ File uploaded to storage successfully');
      // // console.log('📄 Document URL will be saved to vdcr_records.document_url when form is submitted');

    } catch (error) {
      // console.error('❌ File upload failed:', error);
      toast({ title: 'Error', description: `File upload failed: ${error.message}. Please try again.`, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const openDocumentPreview = async (documentUrl: string, documentName: string, recordId?: string) => {
    // // console.log('🔍 Opening document preview:', { documentUrl, documentName, recordId });

    // Find the document file from multiple sources
    // Priority: Latest revision event document > VDCR data > uploaded files
    let document = null;
    let latestDocumentUrl = documentUrl;

    // First, try to find the VDCR record to get its ID
    let vdcrRecord = null;
    if (recordId) {
      // If recordId is provided, use it directly
      vdcrRecord = vdcrData.find(r => r.id === recordId);
    } else {
      // Otherwise, try to find by document name or URL
      vdcrRecord = vdcrData.find(r => r.documentName === documentName || r.documentUrl === documentUrl);
    }
    
    // Always fetch the latest revision events to get the most recent document URL
    const recordIdToUse = vdcrRecord?.id || recordId;
    if (recordIdToUse) {
      try {
        const events: any = await fastAPI.getVDCRRevisionEvents(recordIdToUse);
        if (Array.isArray(events) && events.length > 0) {
          // Sort by event_date descending (fallback to created_at when event_date is invalid)
          const sortedEvents = [...events].sort((a, b) => {
            const timeA = new Date(a.event_date).getTime();
            const timeB = new Date(b.event_date).getTime();
            const dateDiff = (Number.isNaN(timeB) ? new Date(b.created_at).getTime() : timeB) - 
              (Number.isNaN(timeA) ? new Date(a.created_at).getTime() : timeA);
            if (dateDiff !== 0) return dateDiff;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          // Get the most recent event with a document_url
          const latestEvent = sortedEvents.find((e: any) => e.document_url);
          if (latestEvent?.document_url) {
            latestDocumentUrl = latestEvent.document_url;
            console.log('✅ Found latest document URL from revision events:', latestDocumentUrl);
          } else {
            console.log('⚠️ No document_url found in latest revision events');
          }
        } else {
          console.log('⚠️ No revision events found for record:', recordIdToUse);
        }
      } catch (error) {
        // Silently fail - use the documentUrl passed in
        console.log('Could not fetch latest revision events, using provided documentUrl:', error);
      }
    } else {
      console.log('⚠️ No record ID found, cannot fetch latest revision events');
    }

    // Helper: derive file type from URL (actual filename has extension; display names often don't)
    const getFileTypeFromUrl = (url: string) => {
      const fileName = url.split('/').pop()?.split('?')[0] || '';
      return fileName.toLowerCase().includes('.pdf') ? 'pdf' :
        fileName.toLowerCase().includes('.docx') ? 'docx' :
          fileName.toLowerCase().includes('.xlsx') ? 'xlsx' :
            fileName.toLowerCase().includes('.pptx') ? 'pptx' :
              fileName.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) ? 'image' : 'other';
    };

    // Now find the document using the latest document URL
    // First, try to find in VDCR data (this contains the latest revision event documents)
      if (vdcrRecord?.documentFile) {
        document = vdcrRecord.documentFile;
      // Always use the latest document URL from revision events; derive fileType from URL
      const fileTypeFromUrl = getFileTypeFromUrl(latestDocumentUrl);
      document = {
        ...document,
        filePath: latestDocumentUrl,
        fileType: fileTypeFromUrl !== 'other' ? fileTypeFromUrl : (document?.fileType || 'other')
      };
      }

    // If not found in VDCR data, try to find in uploaded files (fallback)
    if (!document) {
      document = uploadedFiles.find(f => f.filePath === latestDocumentUrl || f.filePath === documentUrl);
    }

    // If still not found, create a mock document for preview using the latest document URL
    if (!document && latestDocumentUrl) {
      // Derive file type from the URL (actual filename) - NOT from documentName
      // documentName from revision history is a display label like "Purchase drawing - Rev-00 - Submitted"
      // which has no extension; the real filename is in the URL path
      const urlFileName = latestDocumentUrl.split('/').pop()?.split('?')[0] || '';
      const fileTypeFromUrl = getFileTypeFromUrl(latestDocumentUrl);
      const fileTypeFromName = documentName.toLowerCase().includes('.pdf') ? 'pdf' :
        documentName.toLowerCase().includes('.docx') ? 'docx' :
          documentName.toLowerCase().includes('.xlsx') ? 'xlsx' :
            documentName.toLowerCase().includes('.pptx') ? 'pptx' :
              documentName.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) ? 'image' : 'other';
      const resolvedFileType = fileTypeFromUrl !== 'other' ? fileTypeFromUrl : fileTypeFromName;

      document = {
        id: `mock-${Date.now()}`,
        fileName: urlFileName || documentName,
        originalName: documentName,
        fileType: resolvedFileType,
        fileSize: 1024 * 1024, // 1MB default
        uploadDate: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric'
        }),
        uploadedBy: currentUser,
        filePath: latestDocumentUrl
      };
    }

    // // console.log('📄 Document found/created:', document);

    setPreviewModal({
      isOpen: true,
      document: document,
      documentName: documentName
    });

    // Reset PDF viewer state
    setPdfViewerState({
      currentPage: 1,
      totalPages: 1,
      zoomLevel: 100,
      searchText: '',
      isFullscreen: false,
      isAnnotating: false,
      searchResults: []
    });

    // Reset annotation tools
    setAnnotationTools({
      isVisible: false,
      selectedTool: 'highlight',
      color: '#ffff00',
      size: 'medium',
      message: ''
    });

    // Load PDF if it's a PDF file - use resolved document URL (document.filePath / latestDocumentUrl)
    // NOT the parameter - it may be stale when revision events have different dates/invalid data
    const urlForPdf = document?.filePath || latestDocumentUrl || documentUrl;
    if (documentName.toLowerCase().endsWith('.pdf') || document?.fileType === 'pdf') {
      if (urlForPdf && !urlForPdf.startsWith('/documents/vdcr/')) {
        // Only load if we have a real URL (not fallback path)
        const pdfUrl = urlForPdf.startsWith('http') ? urlForPdf : `https://ypdlbqrcxnugrvllbmsi.supabase.co/storage/v1/object/public/VDCR-docs${urlForPdf}`;
        await loadPdfDocument(pdfUrl);
      }
    } else {
      // // console.log('📄 Not a PDF file, skipping PDF loading');
    }
  };

  // PDF Viewer Functions
  const handleZoomIn = () => {
    setPdfViewerState(prev => ({
      ...prev,
      zoomLevel: Math.min(prev.zoomLevel + 25, 300)
    }));
  };

  const handleZoomOut = () => {
    setPdfViewerState(prev => ({
      ...prev,
      zoomLevel: Math.max(prev.zoomLevel - 25, 50)
    }));
  };

  const handlePrevPage = () => {
    setPdfViewerState(prev => ({
      ...prev,
      currentPage: Math.max(prev.currentPage - 1, 1)
    }));
  };

  const handleNextPage = () => {
    setPdfViewerState(prev => ({
      ...prev,
      currentPage: Math.min(prev.currentPage + 1, prev.totalPages)
    }));
  };

  const handleSearch = () => {
    setSearchModal({
      isOpen: true,
      searchText: '',
      isSearching: false
    });

    // Force focus on input after modal opens
    setTimeout(() => {
      const input = document.querySelector('input[placeholder="Enter search term..."]') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  };

  const handleSearchSubmit = async () => {
    if (!searchModal.searchText.trim()) return;

    setSearchModal(prev => ({ ...prev, isSearching: true }));

    setPdfViewerState(prev => ({
      ...prev,
      searchText: searchModal.searchText
    }));

    // Real PDF search functionality
    if (pdfDocument) {
      await searchInPDF(searchModal.searchText);
    } else {
      // Fallback for non-PDF documents
      setPdfViewerState(prev => ({
        ...prev,
        searchResults: [{ page: 1, matches: 1, text: 'Search functionality available for PDF documents only.' }]
      }));
    }

    setSearchModal(prev => ({ ...prev, isSearching: false, isOpen: false }));
  };

  // Real PDF search function
  const searchInPDF = async (searchText: string) => {
    if (!pdfDocument) return;

    try {
      let totalMatches = 0;
      const searchResults = [];

      // Search through all pages
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const textItems = textContent.items;

        // Combine all text items for the page
        const pageText = textItems.map((item: any) => item.str).join(' ');

        // Search for the term (case insensitive)
        const regex = new RegExp(searchText, 'gi');
        const matches = pageText.match(regex);

        if (matches) {
          totalMatches += matches.length;
          searchResults.push({
            page: pageNum,
            matches: matches.length,
            text: pageText.substring(0, 100) + '...' // Preview of page content
          });
        }
      }


      if (totalMatches > 0) {
        // Jump to first result page
        setPdfViewerState(prev => ({
          ...prev,
          currentPage: searchResults[0].page,
          searchResults: searchResults
        }));

      } else {
        setPdfViewerState(prev => ({
          ...prev,
          searchResults: []
        }));
      }
    } catch (error) {
      setPdfViewerState(prev => ({
        ...prev,
        searchResults: []
      }));
    }
  };

  const handleAnnotate = () => {
    if (pdfDocument) {
      // Toggle annotation mode
      setPdfViewerState(prev => ({
        ...prev,
        isAnnotating: !prev.isAnnotating
      }));

      if (!pdfViewerState.isAnnotating) {
        // Show annotation tools UI
        setAnnotationTools({
          isVisible: true,
          selectedTool: 'highlight',
          color: '#ffff00',
          size: 'medium',
          message: ''
        });
      } else {
        // Hide annotation tools
        setAnnotationTools({
          isVisible: false,
          selectedTool: 'highlight',
          color: '#ffff00',
          size: 'medium',
          message: ''
        });
      }
    } else {
      // Show non-PDF message
      setAnnotationTools({
        isVisible: true,
        selectedTool: 'highlight',
        color: '#ffff00',
        size: 'medium',
        message: 'Annotation tools available for PDF documents only'
      });
    }
  };

  const handleFullscreen = () => {
    if (pdfDocument) {
      setPdfViewerState(prev => ({
        ...prev,
        isFullscreen: !prev.isFullscreen
      }));

      // Real fullscreen functionality
      if (!pdfViewerState.isFullscreen) {
        // Enter fullscreen
        const element = document.documentElement;
        if (element.requestFullscreen) {
          element.requestFullscreen().then(() => {
            // Successfully entered fullscreen
          }).catch(err => {
            toast({ title: 'Error', description: 'Unable to enter fullscreen mode. Please try again.', variant: 'destructive' });
          });
        } else {
          toast({ title: 'Notice', description: 'Fullscreen mode not supported in this browser.' });
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          document.exitFullscreen().then(() => {
            // Successfully exited fullscreen
          }).catch(err => {
            // Error exiting fullscreen
          });
        }
      }
    } else {
      toast({ title: 'Notice', description: `📱 Fullscreen mode available for PDF documents only.\n\nCurrent document: ${previewModal.documentName}\nFile type: ${previewModal.document?.fileType || 'Unknown'}` });
    }
  };

  const clearSearch = () => {
    setPdfViewerState(prev => ({
      ...prev,
      searchText: ''
    }));
  };

  // PDF.js Functions
  const loadPdfDocument = async (pdfUrl: string) => {
    try {
      setIsLoadingPdf(true);
      // // console.log('📄 Loading PDF document:', pdfUrl);
      // // console.log('📄 PDF.js available:', typeof window !== 'undefined' && (window as any).pdfjsLib);

      // Check if PDF.js is available
      if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
        const pdfjsLib = (window as any).pdfjsLib;
        // // console.log('📄 PDF.js library found:', pdfjsLib);

        // Configure PDF.js worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        // // console.log('📄 PDF.js worker configured');

        // Load the PDF document
        // // console.log('📄 Starting PDF document loading...');
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;

        // // console.log('✅ PDF loaded successfully:', pdf);
        setPdfDocument(pdf);
        setPdfViewerState(prev => ({
          ...prev,
          totalPages: pdf.numPages,
          currentPage: 1
        }));

        // // console.log('📄 PDF pages:', pdf.numPages);
      } else {
        // console.warn('⚠️ PDF.js not available, falling back to iframe');
      }
    } catch (error) {
      // console.error('❌ Error loading PDF:', error);
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const renderPdfPage = async (pageNum: number) => {
    if (!pdfDocument) return;

    try {
      const page = await pdfDocument.getPage(pageNum);
      const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      const viewport = page.getViewport({ scale: pdfViewerState.zoomLevel / 100 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      await page.render(renderContext).promise;
      // // console.log('✅ PDF page rendered:', pageNum);
    } catch (error) {
      // console.error('❌ Error rendering PDF page:', error);
    }
  };

  // Effect to render PDF page when document or page changes
  useEffect(() => {
    if (pdfDocument && pdfViewerState.currentPage > 0) {
      renderPdfPage(pdfViewerState.currentPage);
    }
  }, [pdfDocument, pdfViewerState.currentPage, pdfViewerState.zoomLevel]);

  // Download PDF function
  const downloadPDF = () => {
    if (previewModal.document?.filePath) {
      const link = document.createElement('a');
      link.href = previewModal.document.filePath;
      link.download = previewModal.documentName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Standard VDCR Template for bulk upload
  const vdcrTemplate = {
    name: 'Documentation Template',
    description: 'Standard template for Vendor Document Control Records',
    columns: ['Sr. No.', 'Equipment Tag No.', 'Document Name', 'Revision', 'Code Status', 'Status', 'Client Doc No.', 'Internal Doc No.', 'Department', 'Remarks'],
    sampleData: [
      ['001', 'HE-UNIT-001', 'General Assembly Drawing', 'Rev-01', 'Code 2', 'pending', 'REL-HE-001-GA-001', 'INT-GA-HE-001-2024', 'Equipment assembly drawing'],
      ['002', 'HE-UNIT-002', 'Installation Manual', 'Rev-00', 'Code 3', 'sent-for-approval', 'REL-HE-002-IM-001', 'INT-IM-HE-002-2024', 'Installation instructions'],
      ['003', 'ST-UNIT-001', 'Storage Tank Specification', 'Rev-01', 'Code 1', 'approved', 'REL-ST-001-SPEC-001', 'INT-SPEC-ST-001-2024', 'Storage tank specifications']
    ]
  };

  const handleBulkUpload = () => {
    setBulkUploadModal(prev => ({ ...prev, isOpen: true }));
  };

  const downloadTemplate = async () => {
    try {
      await generateTemplate();
    } catch (error) {
      console.error('Error downloading template:', error);
      toast({ title: 'Error', description: 'Error downloading template. Please try again or contact support.', variant: 'destructive' });
    }
  };

  const generateTemplate = async () => {
    try {
      const XLSX = await import('xlsx-js-style').then(m => m.default);

      // Define template headers with Department column
      const headers = [
        'Sr. No.',
        'Equipment Tag No.',
        'Document Name',
        'Revision',
        'Code Status',
        'Status',
        'Client Doc No.',
        'Internal Doc No.',
        'Department',
        'Remarks'
      ];

      // Create a sample row (empty data)
      const sampleData = [headers.map(() => '')];

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

      // Set column widths
      worksheet['!cols'] = [
        { wch: 10 }, // Sr. No.
        { wch: 25 }, // Equipment Tag No.
        { wch: 30 }, // Document Name
        { wch: 12 }, // Revision
        { wch: 12 }, // Code Status
        { wch: 20 }, // Status
        { wch: 20 }, // Client Doc No.
        { wch: 20 }, // Internal Doc No.
        { wch: 15 }, // Department
        { wch: 30 }  // Remarks
      ];

      // Add instruction row in the second row
      const instructionRow = [
        '1, 2, 3...',
        'Tag-001, Tag-002...',
        'Document name',
        'Rev-00, Rev-01, Rev-02',
        'Code 1, Code 2, Code 3',
        'pending, approved, etc.',
        'CLIENT-001',
        'INT-001',
        'Engineering, Quality, etc.',
        'Any remarks'
      ];
      XLSX.utils.sheet_add_aoa(worksheet, [instructionRow], { origin: 'A2' });

      // Example row: "all" in Equipment Tag No. applies VDCR to all equipment in the project
      const allEquipmentExampleRow = [
        '1',
        'all',
        'General Project Document',
        'Rev-00',
        'Code 1',
        'pending',
        'CLIENT-ALL',
        'INT-ALL',
        'Engineering',
        'Applies to all equipment in this project'
      ];
      XLSX.utils.sheet_add_aoa(worksheet, [allEquipmentExampleRow], { origin: 'A3' });

      // Style the header row (bold, gray background) using xlsx-js-style
      const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:J1');
      for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!worksheet[cellAddress]) continue;
        worksheet[cellAddress].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'E0E0E0' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      }

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Documentation Template');

      // Generate Excel file and download
      XLSX.writeFile(workbook, 'Documentation_Bulk_Upload_Template.xlsx');

      // Show success message
      toast({
        title: 'Success',
        description: 'VDCR Template downloaded successfully!\n\n📋 Instructions:\n• Fill in your data in each column\n• Department column is optional\n• The system will auto-normalize formats:\n  - Sr. No.: Any format (1, 01, 001) → 001\n  - Revision: Any format → Rev-00, Rev-01, etc.\n  - Code Status: Any format → Code 1, Code 2, etc.\n• Upload the completed file'
      });
    } catch (error) {
      console.error('Error generating template:', error);
      toast({ title: 'Error', description: 'Error generating template. Please try again.', variant: 'destructive' });
      throw error;
    }
  };


  const handleFileUploadForBulk = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkUploadModal(prev => ({ ...prev, uploadedFile: file }));

    // Check file type
    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
    const isCSV = file.name.toLowerCase().endsWith('.csv');

    if (isExcel) {
      processExcelFile(file);
    } else if (isCSV) {
      processCSVFile(file);
    } else {
      toast({ title: 'Notice', description: 'Please upload a CSV or Excel file (.csv, .xlsx, .xls)' });
      return;
    }
  };

  // Proper CSV parser that handles quoted values with commas
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote (double quote)
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Comma outside quotes - field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    result.push(current.trim());
    return result;
  };

  const processCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvContent = e.target?.result as string;
        
        // Normalize line endings and split into lines
        const lines = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        
        // Filter out empty lines
        const nonEmptyLines = lines.filter(line => line.trim() !== '');
        
        if (nonEmptyLines.length < 2) {
          toast({ 
            title: 'Error', 
            description: 'CSV file must have at least a header row and one data row.', 
            variant: 'destructive' 
          });
          return;
        }
        
        // Parse header row
        const headers = parseCSVLine(nonEmptyLines[0]).map(h => h.trim());
        
        // Parse data rows
        const data = nonEmptyLines.slice(1).map(line => {
          const values = parseCSVLine(line);
          return headers.reduce((obj, header, index) => {
            // Remove surrounding quotes if present
            let value = values[index] || '';
            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.slice(1, -1);
            }
            // Replace escaped quotes (double quotes) with single quotes
            value = value.replace(/""/g, '"');
            obj[header] = value.trim();
            return obj;
          }, {} as any);
        });

        setBulkUploadModal(prev => ({ ...prev, previewData: data }));
      } catch (error) {
        console.error('Error parsing CSV file:', error);
        toast({ 
          title: 'Error', 
          description: 'Error parsing CSV file. Please check the file format and ensure values with commas are properly quoted.', 
          variant: 'destructive' 
        });
      }
    };
    reader.readAsText(file);
  };


  const processExcelFile = async (file: File) => {
    try {
      // Use same xlsx-js-style as template download so .xlsx parses correctly (no CDN)
      const XLSX = await import('xlsx-js-style').then(m => m.default);
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });

      const fileData = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(fileData, { type: 'array' });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        toast({ title: 'Error', description: 'Excel file must have at least a header row and one data row.', variant: 'destructive' });
        return;
      }

      const headers = jsonData[0] as string[];

      const processedData = jsonData.slice(1).filter(row => {
        return row.some(cell => cell && String(cell).trim() !== '');
      }).map(row => {
        return headers.reduce((obj, header, index) => {
          obj[header.trim()] = row[index] ? String(row[index]).trim() : '';
          return obj;
        }, {} as any);
      });

      setBulkUploadModal(prev => ({ ...prev, previewData: processedData }));
    } catch (error) {
      toast({ title: 'Error', description: 'Error parsing Excel file. Please check the file format (.xlsx or .xls).', variant: 'destructive' });
    }
  };

  const processBulkUpload = async () => {
    console.log('🚀 Starting bulk upload process...');
    setBulkUploadModal(prev => ({ ...prev, isProcessing: true }));

    try {
      // Get userData from localStorage for updated_by field
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      console.log('👤 User data:', { userId: userData.id, user: user?.id });
      
      // Use userData.id directly (fast, no database call)
      let userId = userData.id || user?.id;
      if (!userId) {
        console.error('❌ No user ID found');
        toast({ title: 'Error', description: 'Unable to determine user ID. Please try logging in again.', variant: 'destructive' });
        setBulkUploadModal(prev => ({ ...prev, isProcessing: false }));
        return;
      }
      
      // Get firm_id from user data (required field)
      const firmId = userData.firm_id;
      if (!firmId) {
        console.error('❌ No firm ID found');
        toast({ title: 'Error', description: 'Unable to determine firm ID. Please try logging in again.', variant: 'destructive' });
        setBulkUploadModal(prev => ({ ...prev, isProcessing: false }));
        return;
      }
      
      console.log('✅ User ID:', userId);
      console.log('✅ Firm ID:', firmId);
      console.log('📊 Preview data rows:', bulkUploadModal.previewData.length);
      
      // Helper function to normalize Sr. No. - extracts integer and formats as "001", "002", etc.
      const normalizeSrNo = (srNoInput: string | number | undefined): number => {
        if (!srNoInput) return 0;
        const srNoStr = String(srNoInput).trim();
        // Extract just the numeric part, handle formats like "1", "01", "001", "Rev-01", etc.
        const match = srNoStr.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      };

      // Helper function to format Sr. No. as "001", "002", etc.
      const formatSrNo = (srNoInteger: number): string => {
        return String(srNoInteger).padStart(3, '0');
      };

      // Helper function to normalize Revision - extracts revision number from various formats
      const normalizeRevision = (revisionInput: string | number | undefined): number => {
        if (!revisionInput) return 0;
        const revisionStr = String(revisionInput).trim();
        
        // Handle common patterns:
        // "r1", "r2", "r3" -> extract number after 'r'
        // "rev-01", "rev 001", "revision 1" -> extract number
        // "1", "01", "001" -> extract number
        // "Rev-00", "Rev-01" -> extract number after dash
        
        // Pattern 1: Match "r" or "rev" or "revision" followed by optional dash/space and number
        // Examples: "r1", "r2", "rev-01", "rev 001", "revision 1", "Rev-00"
        const revPattern = /(?:^|\s|-)r(?:ev(?:ision)?)?[\s-]*(\d+)/i;
        const revMatch = revisionStr.match(revPattern);
        if (revMatch && revMatch[1]) {
          return parseInt(revMatch[1], 10);
        }
        
        // Pattern 2: Just extract the first number found (handles "1", "01", "001", etc.)
        const numberPattern = /(\d+)/;
        const numberMatch = revisionStr.match(numberPattern);
        if (numberMatch && numberMatch[1]) {
          return parseInt(numberMatch[1], 10);
        }
        
        return 0;
      };

      // Helper function to format Revision as "Rev-00", "Rev-01", etc.
      const formatRevision = (revisionInteger: number): string => {
        return `Rev-${String(revisionInteger).padStart(2, '0')}`;
      };

      // Helper function to normalize Code Status - extracts code number from various formats
      const normalizeCodeStatus = (codeStatusInput: string | number | undefined): number => {
        if (!codeStatusInput) return 3; // Default to Code 3
        const codeStatusStr = String(codeStatusInput).trim();
        
        // Handle common patterns:
        // "code 1", "Code 1", "CODE 1" -> extract number
        // "c1", "C1" -> extract number after 'c'
        // "1", "2", "3", "4" -> extract number
        // "Code-1", "code-1" -> extract number
        
        // Pattern 1: Match "c" or "code" followed by optional dash/space and number
        // Examples: "c1", "c2", "code 1", "Code 2", "code-3", "CODE 4"
        const codePattern = /(?:^|\s|-)c(?:ode)?[\s-]*(\d+)/i;
        const codeMatch = codeStatusStr.match(codePattern);
        if (codeMatch && codeMatch[1]) {
          const codeNum = parseInt(codeMatch[1], 10);
          // Ensure it's between 1-4 (valid code statuses)
          return Math.max(1, Math.min(4, codeNum));
        }
        
        // Pattern 2: Just extract the first number found (handles "1", "2", "3", "4", etc.)
        const numberPattern = /(\d+)/;
        const numberMatch = codeStatusStr.match(numberPattern);
        if (numberMatch && numberMatch[1]) {
          const codeNum = parseInt(numberMatch[1], 10);
          // Ensure it's between 1-4 (valid code statuses)
          return Math.max(1, Math.min(4, codeNum));
        }
        
        return 3; // Default to Code 3 if no number found
      };

      // Helper function to format Code Status as "Code 1", "Code 2", etc.
      const formatCodeStatus = (codeStatusInteger: number): string => {
        // Ensure it's between 1-4 (valid code statuses)
        const validCode = Math.max(1, Math.min(4, codeStatusInteger));
        return `Code ${validCode}`;
      };

      // Find the highest existing Sr. No. to continue from
      const existingSrNos = vdcrData.map(record => {
        return normalizeSrNo(record.srNo);
      });

      const highestSrNo = Math.max(...existingSrNos, 0);
      // // console.log('Highest existing Sr. No.:', highestSrNo);

      // Track used Sr. Nos from the upload to avoid conflicts
      const usedSrNos = new Set<number>();

      // Track new departments found in the upload
      const newDepartments = new Set<string>();

      const bulkRows: any[] = [];

      // Build one payload per row (same shape as createVDCRRecord); then one RPC or legacy per-row inserts
      for (let index = 0; index < bulkUploadModal.previewData.length; index++) {
        console.log(`\n📝 Processing row ${index + 1}/${bulkUploadModal.previewData.length}...`);
        const row = bulkUploadModal.previewData[index];
        console.log('📋 Row data:', row);
        const equipmentTagRaw = row['Equipment Tag No.']?.trim() || '';
        console.log('🏷️ Equipment Tag Raw:', equipmentTagRaw);

        // Check if user entered "all" to apply to all equipment
        const isAllEquipment = equipmentTagRaw.toLowerCase() === 'all';
        
        let equipmentTags: string[] = [];
        
        if (isAllEquipment) {
          // Get all equipment tag numbers from the project
          equipmentTags = equipmentData.map(eq => eq.tagNo);
          console.log('✅ "All" detected - applying to all equipment:', equipmentTags.length, 'equipment');
        } else {
          // Handle multiple equipment tags separated by commas
          // Split by comma, trim each tag, and filter out empty strings
          equipmentTags = equipmentTagRaw
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);
        }

        // Auto-fill equipment-related fields from database if equipment tags exist
        let autoFilledData = {
          mfgSerialNo: [] as string[],
          jobNo: [] as string[]
        };

        if (equipmentTags.length > 0) {
          // Find all matching equipment in our database
          const matchingEquipment = equipmentData.filter(eq => 
            equipmentTags.includes(eq.tagNo)
          );

          if (matchingEquipment.length > 0) {
            // Collect all mfg serial numbers and job numbers from matching equipment
            autoFilledData = {
              mfgSerialNo: matchingEquipment
                .map(eq => eq.mfgSerialNo)
                .filter(serial => serial && serial.trim() !== ''),
              jobNo: matchingEquipment
                .map(eq => eq.jobNo)
                .filter(job => job && job.trim() !== '')
            };
          }
        }

        // Normalize and format Sr. No.
        let srNo: string;
        if (row['Sr. No.']?.trim()) {
          // User provided Sr. No. - normalize it (extract integer) and format consistently
          const normalizedInteger = normalizeSrNo(row['Sr. No.']);
          if (normalizedInteger > 0) {
            // Check if this Sr. No. was already used in this upload
            if (usedSrNos.has(normalizedInteger)) {
              // If duplicate, use the next available number
              let nextAvailable = normalizedInteger;
              while (usedSrNos.has(nextAvailable) || existingSrNos.includes(nextAvailable)) {
                nextAvailable++;
              }
              srNo = formatSrNo(nextAvailable);
              usedSrNos.add(nextAvailable);
            } else {
              // Check if it conflicts with existing records
              if (existingSrNos.includes(normalizedInteger)) {
                // If conflicts with existing, use the next available number
                let nextAvailable = normalizedInteger;
                while (usedSrNos.has(nextAvailable) || existingSrNos.includes(nextAvailable)) {
                  nextAvailable++;
                }
                srNo = formatSrNo(nextAvailable);
                usedSrNos.add(nextAvailable);
              } else {
                srNo = formatSrNo(normalizedInteger);
                usedSrNos.add(normalizedInteger);
              }
            }
          } else {
            // Invalid Sr. No., auto-generate
            let nextAvailable = highestSrNo + 1;
            while (usedSrNos.has(nextAvailable) || existingSrNos.includes(nextAvailable)) {
              nextAvailable++;
            }
            srNo = formatSrNo(nextAvailable);
            usedSrNos.add(nextAvailable);
          }
        } else {
          // No Sr. No. provided - auto-generate from highest existing
          let nextAvailable = highestSrNo + 1;
          while (usedSrNos.has(nextAvailable) || existingSrNos.includes(nextAvailable)) {
            nextAvailable++;
          }
          srNo = formatSrNo(nextAvailable);
          usedSrNos.add(nextAvailable);
        }

        // // console.log(`Row ${index}: Sr. No. = ${srNo} (continuing from ${highestSrNo})`);

        // Prepare data for Supabase
        // Use the equipment tags array (or ['GENERIC'] if empty)
        const vdcrRecordData: Record<string, any> = {
          project_id: projectId,
          sr_no: srNo,
          equipment_tag_numbers: equipmentTags.length > 0 ? equipmentTags : ['GENERIC'],
          mfg_serial_numbers: autoFilledData.mfgSerialNo,
          job_numbers: autoFilledData.jobNo,
          client_doc_no: row['Client Doc No.'] || `CLIENT-${Date.now()}-${index}`,
          internal_doc_no: row['Internal Doc No.'] || `INT-${Date.now()}-${index}`,
          document_name: row['Document Name'] || `Document ${index + 1}`,
          revision: (() => {
            const revisionInput = row['Revision']?.trim();
            if (!revisionInput) {
              return 'Rev-00'; // Default if empty
            }
            // Normalize and format the revision
            const normalizedRev = normalizeRevision(revisionInput);
            return formatRevision(normalizedRev);
          })(),
          code_status: (() => {
            const codeStatusInput = row['Code Status']?.trim();
            if (!codeStatusInput) {
              return 'Code 3'; // Default if empty
            }
            // Normalize and format the code status
            const normalizedCode = normalizeCodeStatus(codeStatusInput);
            return formatCodeStatus(normalizedCode);
          })(),
          status: (() => {
            const statusInput = (row['Status'] as string)?.trim()?.toLowerCase();
            if (!statusInput) {
              return 'pending'; // Default if empty
            }
            // Normalize status to match database constraint values (all lowercase)
            // Valid values: 'pending', 'approved', 'sent-for-approval', 'received-for-comment', 'rejected'
            const validStatuses = [
              'pending',
              'approved',
              'sent-for-approval',
              'received-for-comment',
              'rejected'
            ];
            
            // Check if the input matches any valid status (case-insensitive)
            const normalizedStatus = validStatuses.find(
              valid => valid.toLowerCase() === statusInput.toLowerCase()
            );
            
            // If found, return the exact valid status (lowercase)
            // Otherwise, default to 'pending'
            return normalizedStatus || 'pending';
          })(),
          remarks: row['Remarks'] || '',
          department: (() => {
            const departmentInput = row['Department']?.trim();
            if (!departmentInput) {
              return null; // No department specified
            }
            
            // Check if department already exists (case-insensitive comparison)
            const departmentExists = availableDepartments.some(
              dept => dept.toLowerCase() === departmentInput.toLowerCase()
            );
            
            // If it doesn't exist, add it to the new departments set
            if (!departmentExists) {
              newDepartments.add(departmentInput);
            }
            
            // Return the department (use the existing one if found, or the new one)
            if (departmentExists) {
              // Find the exact match (preserve original casing from availableDepartments)
              const existingDept = availableDepartments.find(
                dept => dept.toLowerCase() === departmentInput.toLowerCase()
              );
              return existingDept || departmentInput;
            }
            
            return departmentInput;
          })(),
          updated_by: userId,
          firm_id: firmId, // Required field for vdcr_records table
          last_update: new Date().toISOString(), // Required field for vdcr_records table
          show_in_equipment_doc_tab: true // Default yes for bulk upload
        };

        console.log('💾 Prepared VDCR record data:', JSON.stringify(vdcrRecordData, null, 2));
        bulkRows.push(vdcrRecordData);
      }

      let usedBulkRpc = false;
      try {
        await fastAPI.bulkUploadVdcrDocumentation(bulkRows);
        usedBulkRpc = true;
      } catch (bulkErr: any) {
        const st = bulkErr?.response?.status;
        const msg = String(bulkErr?.response?.data?.message ?? bulkErr?.message ?? '');
        const code = bulkErr?.response?.data?.code;
        const isRpcMissing =
          st === 404 ||
          code === 'PGRST202' ||
          msg.includes('Could not find the function') ||
          msg.includes('does not exist');
        if (!isRpcMissing) {
          throw bulkErr;
        }
        console.warn('⚠️ bulk_upload_vdcr_documentation RPC not deployed; using per-row inserts + sync (legacy).');
        for (let index = 0; index < bulkRows.length; index++) {
          const vdcrRecordData = bulkRows[index];
          try {
            await fastAPI.createVDCRRecord(vdcrRecordData);
          } catch (error: any) {
            if (error?.response?.status === 409 && error?.response?.data?.code === '23503') {
              const correctUserId = await fetchCorrectUserIdFromDB();
              if (correctUserId) {
                vdcrRecordData.updated_by = correctUserId;
                userId = correctUserId;
                await fastAPI.createVDCRRecord(vdcrRecordData);
              } else {
                throw new Error('Unable to fetch correct user ID. Please logout and login again.');
              }
            } else {
              throw error;
            }
          }
        }
      }

      // Add new departments to the available departments list
      if (newDepartments.size > 0) {
        const departmentsToAdd = Array.from(newDepartments);
        setAvailableDepartments(prev => {
          const updated = [...prev, ...departmentsToAdd];
          // Remove duplicates (case-insensitive) and sort
          const unique = Array.from(
            new Map(updated.map(dept => [dept.toLowerCase(), dept])).values()
          );
          return unique.sort();
        });
        console.log('✅ Added new departments to dropdown:', departmentsToAdd);
      }

      // Reload data from Supabase
      await loadVDCRData();

      // Legacy path only: RPC already synced equipment_documents inside the transaction
      if (!usedBulkRpc) {
        try {
          const allRecords = await fastAPI.getVDCRRecordsByProject(projectId);
          const toSync = (Array.isArray(allRecords) ? allRecords : []).filter(
            (r: any) => r.show_in_equipment_doc_tab !== false
          );
          toSync.forEach((record: any) => {
            fastAPI.syncVDCRToEquipment(record.id).catch(error => {
              console.error('❌ Background sync failed for record:', record.id, error);
            });
          });
        } catch (error) {
          console.warn('⚠️ Could not sync records to equipment after bulk upload:', error);
        }
      }

      setBulkUploadModal(prev => ({
        ...prev,
        isOpen: false,
        isProcessing: false,
        uploadedFile: null,
        previewData: []
      }));

    } catch (error: any) {
      console.error('❌ CRITICAL ERROR in bulk upload process:', error);
      console.error('❌ Error stack:', error?.stack);
      console.error('❌ Error message:', error?.message);
      console.error('❌ Error response:', error?.response?.data);
      console.error('❌ Error status:', error?.response?.status);
      console.error('❌ Full error object:', error);
      
      const errorMessage = error?.response?.data?.message || 
                          error?.response?.data?.error || 
                          error?.message || 
                          'Unknown error occurred. Check console for details.';
      
      toast({ 
        title: 'Error', 
        description: `Error processing bulk upload: ${errorMessage}`, 
        variant: 'destructive' 
      });
      setBulkUploadModal(prev => ({
        ...prev,
        isProcessing: false
      }));
    }
  };

  const handleEquipmentSelection = (equipmentTag: string, checked: boolean) => {
    if (checked) {
      setSelectedEquipments(prev => {
        const updated = [...prev, equipmentTag];
        // If all equipment are now selected, ensure we have all of them
        if (updated.length === equipmentData.length) {
          return equipmentData.map(eq => eq.tagNo);
        }
        return updated;
      });
    } else {
      setSelectedEquipments(prev => prev.filter(tag => tag !== equipmentTag));
    }
  };

  const getSelectedEquipmentDetails = () => {
    return equipmentData.filter(eq => selectedEquipments.includes(eq.tagNo));
  };

  const autoGenerateMfgSerialNos = () => {
    return getSelectedEquipmentDetails().map(eq => eq.mfgSerialNo);
  };

  const autoGenerateJobNos = () => {
    return getSelectedEquipmentDetails().map(eq => eq.jobNo);
  };

  const toggleEquipmentType = (type: string) => {
    setExpandedEquipmentTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  // Department dropdown handlers
  const handleDepartmentSelect = (dept: string) => {
    setFormData(prev => ({ ...prev, department: dept }));
    setDepartmentDropdownOpen(false);
    setDepartmentSearchQuery('');
  };

  const startEditingDepartment = (index: number, value: string) => {
    setEditingDepartment({ index, value });
    setShowAddNewDepartment(false);
  };

  const saveEditedDepartment = () => {
    if (editingDepartment && editingDepartment.value.trim()) {
      const newDepartments = [...availableDepartments];
      newDepartments[editingDepartment.index] = editingDepartment.value.trim();
      setAvailableDepartments(newDepartments);
      // Update formData if the edited department was selected
      if (formData.department === availableDepartments[editingDepartment.index]) {
        setFormData(prev => ({ ...prev, department: editingDepartment.value.trim() }));
      }
      setEditingDepartment(null);
      // Reload departments from database to sync
      loadAvailableDepartments();
    }
  };

  const cancelEditingDepartment = () => {
    setEditingDepartment(null);
  };

  const deleteDepartment = (index: number) => {
    const deptToDelete = availableDepartments[index];
    const newDepartments = availableDepartments.filter((_, i) => i !== index);
    setAvailableDepartments(newDepartments);
    // Clear formData if deleted department was selected
    if (formData.department === deptToDelete) {
      setFormData(prev => ({ ...prev, department: '' }));
    }
    // Reload departments from database to sync
    loadAvailableDepartments();
  };

  const handleAddNewDepartment = () => {
    if (newDepartmentValue.trim()) {
      const trimmedValue = newDepartmentValue.trim();
      if (!availableDepartments.includes(trimmedValue)) {
        const newDepartments = [...availableDepartments, trimmedValue].sort();
        setAvailableDepartments(newDepartments);
        setFormData(prev => ({ ...prev, department: trimmedValue }));
      } else {
        // If already exists, just select it
        setFormData(prev => ({ ...prev, department: trimmedValue }));
      }
      setNewDepartmentValue('');
      setShowAddNewDepartment(false);
      setDepartmentDropdownOpen(false);
      // Reload departments from database to sync
      loadAvailableDepartments();
    }
  };

  const groupedEquipments = equipmentData.reduce((acc, equipment) => {
    if (!acc[equipment.type]) {
      acc[equipment.type] = [];
    }
    acc[equipment.type].push(equipment);
    return acc;
  }, {} as Record<string, Equipment[]>);

  // Format date as dd-mm-yyyy for Excel
  const formatDDMMYYYY = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Normalize date to YYYY-MM-DD for day calculations (same logic as VDCRRevisionHistory)
  const normalizeDateToYYYYMMDD = (dateInput: string | Date | null | undefined): string | null => {
    if (!dateInput) return null;
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Display date for Excel e.g. "15-Dec-2025"
  const formatDateDisplayForExcel = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Revision tracking for export: days with us, days with client, dates (matches VDCRRevisionHistory logic)
  const getRevisionTrackingForExport = (
    events: any[],
    docStartDate: string | null | undefined,
    projectSalesOrderDate: string | null | undefined
  ): {
    revisionMap: Map<string, { daysWithUs: number; daysWithClient: number; sentDate: string | null; receivedDate: string | null }>;
    totalDaysWithUs: number;
    totalDaysWithClient: number;
    totalDays: number;
  } => {
    const revisionMap = new Map<string, { daysWithUs: number; daysWithClient: number; sentDate: string | null; receivedDate: string | null }>();
    let totalDaysWithUs = 0;
    let totalDaysWithClient = 0;
    if (!events || events.length === 0) return { revisionMap, totalDaysWithUs, totalDaysWithClient, totalDays: 0 };

    const sorted = [...events].sort((a, b) => {
      const t1 = new Date(a.event_date).getTime();
      const t2 = new Date(b.event_date).getTime();
      if (t1 !== t2) return t1 - t2;
      const aTie = (a as any).created_at || a.event_date;
      const bTie = (b as any).created_at || b.event_date;
      return new Date(aTie).getTime() - new Date(bTie).getTime();
    });
    const byRev = new Map<string, { submitted?: any; received?: any }>();
    sorted.forEach((e: any) => {
      const rev = e.revision_number || '00';
      if (!byRev.has(rev)) byRev.set(rev, {});
      const d = byRev.get(rev)!;
      if (e.event_type === 'submitted') d.submitted = e;
      else if (e.event_type === 'received') d.received = e;
    });
    const startDate = normalizeDateToYYYYMMDD(docStartDate) || normalizeDateToYYYYMMDD(projectSalesOrderDate);
    const sortedRevisions = Array.from(byRev.entries()).sort((a, b) => {
      const an = parseInt((a[0] || '0').replace(/\D/g, '')) || 0;
      const bn = parseInt((b[0] || '0').replace(/\D/g, '')) || 0;
      return an - bn;
    });
    let previousReceivedDate: string | null = null;

    sortedRevisions.forEach(([rev, revEvents]) => {
      const revNum = parseInt((rev || '0').replace(/\D/g, '')) || 0;
      const sentDate = revEvents.submitted?.event_date || null;
      const receivedDate = revEvents.received?.event_date || null;
      const sentDateOnly = normalizeDateToYYYYMMDD(sentDate);
      const receivedDateOnly = normalizeDateToYYYYMMDD(receivedDate);

      let daysWithClient = 0;
      if (sentDateOnly && receivedDateOnly) {
        daysWithClient = calculateDaysBetween(sentDateOnly, receivedDateOnly);
        totalDaysWithClient += daysWithClient;
      }

      let daysWithUs = 0;
      if (revNum === 0 && sentDateOnly && startDate) {
        daysWithUs = calculateDaysBetween(startDate, sentDateOnly);
        totalDaysWithUs += daysWithUs;
      } else if (sentDateOnly && previousReceivedDate) {
        const prevOnly = normalizeDateToYYYYMMDD(previousReceivedDate);
        if (prevOnly) {
          daysWithUs = calculateDaysBetween(prevOnly, sentDateOnly);
          totalDaysWithUs += daysWithUs;
        }
      }
      revisionMap.set(rev, { daysWithUs, daysWithClient, sentDate, receivedDate });
      if (receivedDate) previousReceivedDate = receivedDate;
    });

    const totalDays = totalDaysWithUs + totalDaysWithClient;
    return { revisionMap, totalDaysWithUs, totalDaysWithClient, totalDays };
  };

  // Ordered list of revision numbers from all records
  const getOrderedRevisionList = (revisionEventsByRecordId: Record<string, any[]>): string[] => {
    const allRevs = new Set<string>();
    Object.values(revisionEventsByRecordId).forEach(events => {
      (events || []).forEach((e: any) => allRevs.add(e.revision_number || '00'));
    });
    return Array.from(allRevs).sort((a, b) => {
      const an = parseInt((a || '0').replace(/\D/g, '')) || 0;
      const bn = parseInt((b || '0').replace(/\D/g, '')) || 0;
      return an - bn;
    });
  };

  const defaultRemarksEntry = { notes: '', hasNotable: false, notableTitle: null as string | null };

  // Build per-revision remarks (notes + notable change) for Sheet 3
  const getRevisionRemarksFromEvents = (events: any[]): Map<string, {
    submitted: { notes: string; hasNotable: boolean; notableTitle: string | null };
    received: { notes: string; hasNotable: boolean; notableTitle: string | null };
  }> => {
    const map = new Map<string, { submitted: typeof defaultRemarksEntry; received: typeof defaultRemarksEntry }>();
    if (!events || events.length === 0) return map as any;
    const sorted = [...events].sort((a, b) => {
      const t1 = new Date(a.event_date).getTime();
      const t2 = new Date(b.event_date).getTime();
      if (t1 !== t2) return t1 - t2;
      const aTie = (a as any).created_at || a.event_date;
      const bTie = (b as any).created_at || b.event_date;
      return new Date(aTie).getTime() - new Date(bTie).getTime();
    });
    sorted.forEach((e: any) => {
      const rev = e.revision_number || '00';
      if (!map.has(rev)) map.set(rev, { submitted: { ...defaultRemarksEntry }, received: { ...defaultRemarksEntry } });
      const d = map.get(rev)!;
      const entry = {
        notes: e.notes || '',
        hasNotable: !!e.has_notable_change,
        notableTitle: e.notable_change_title?.trim() || null
      };
      if (e.event_type === 'submitted') d.submitted = entry;
      else if (e.event_type === 'received') d.received = entry;
    });
    return map as any;
  };

  // Format remarks cell: "Notable: [title]\n[notes]" when notable (bold), else notes. Returns cell object { t, v, s? }.
  const formatRemarksCell = (entry: { notes: string; hasNotable: boolean; notableTitle: string | null } | undefined): { t: string; v: string; s?: any } => {
    if (!entry) return { t: 's', v: '' };
    const title = entry.notableTitle || 'Notable change';
    const text = entry.hasNotable
      ? `Notable: ${title}${entry.notes ? '\n' + entry.notes : ''}`
      : entry.notes || '';
    const s = entry.hasNotable ? { font: { bold: true } } : undefined;
    return { t: 's', v: text, ...(s ? { s } : {}) };
  };

  // VDCR blue theme for Excel headers (blue-600 bg, white bold text)
  const EXCEL_HEADER_STYLE = {
    fill: { fgColor: { rgb: 'FF2563EB' } },
    font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 }
  };
  const EXCEL_SUBHEADER_STYLE = {
    fill: { fgColor: { rgb: 'FFDBEAFE' } },
    font: { bold: true, color: { rgb: 'FF1D4ED8' }, sz: 10 }
  };

  // Open export modal (user picks which reports to download as separate files)
  const openExportModal = () => setExportModalOpen(true);

  const runExportSelected = async () => {
    const selected: ExportReportId[] = (['vdcr-records', 'revision-history', 'revision-remarks'] as ExportReportId[]).filter(id => exportSelected[id]);
    if (selected.length === 0) {
      toast({ title: 'Select at least one report', description: 'Choose one or more reports to export.', variant: 'destructive' });
      return;
    }
    setExporting(true);
    try {
      await processExcelExport(selected);
      setExportModalOpen(false);
      const fileCount = selected.length >= 2 ? 1 : selected.length;
      toast({ title: 'Export complete', description: selected.length >= 2 ? 'Reports exported in one Excel file (multiple sheets).' : 'Report downloaded.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Error exporting. Please try again.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const processExcelExport = async (selectedReports: ExportReportId[]) => {
    try {
    const XLSX = await import('xlsx-js-style').then(m => m.default);

    // Ensure we have project data for documentation start date fallback (Sheet 2 & 3)
    let projectForExport = projectData;
    if (!projectForExport) {
      try {
        const project = await fastAPI.getProjectById(projectId);
        projectForExport = project && project.length > 0 ? project[0] : null;
      } catch {
        projectForExport = null;
      }
    }
    const projectSalesOrderDate = projectForExport?.sales_order_date ?? null;

    // Fetch revision events for all VDCR records (for Sheet 2 & 3)
    const revisionEventsByRecordId: Record<string, any[]> = {};
    await Promise.all(vdcrData.map(async (record) => {
      try {
        const events = await fastAPI.getVDCRRevisionEvents(record.id);
        revisionEventsByRecordId[record.id] = Array.isArray(events) ? events : [];
      } catch {
        revisionEventsByRecordId[record.id] = [];
      }
    }));

    const currentDate = new Date().toISOString().split('T')[0];
    const allEquipmentTagNos = equipmentData.map(eq => eq.tagNo);

    // Sheet 1: VDCR Records (column "Equipment Title" instead of "Mfg Serial No.")
    const excelData = vdcrData.map((record) => {
        const isAllSelected = record.equipmentTagNo.length > 0 &&
          allEquipmentTagNos.length > 0 &&
          record.equipmentTagNo.length === allEquipmentTagNos.length &&
          allEquipmentTagNos.every(tag => record.equipmentTagNo.includes(tag));

        return {
          'Sr. No.': record.srNo,
          'Equipment Tag': isAllSelected ? 'All Equipments' : record.equipmentTagNo.join(', '),
          'Equipment Title': isAllSelected ? 'All Equipments' : record.mfgSerialNo.join(', '),
          'Job No.': isAllSelected ? 'All Equipments' : record.jobNo.join(', '),
          'Client Doc No.': record.clientDocNo,
          'Internal Doc No.': record.internalDocNo,
          'Document Name': record.documentName,
          'Revision': record.revision,
          'Code Status': record.codeStatus,
          'Status': getStatusText(record.status),
          'Department': record.department || '',
          'Remarks': record.remarks || '',
          'Updated On': record.lastUpdate,
          'Updated By': record.updatedBy || 'Unknown'
        };
      });

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    const columnWidths = [
        { wch: 10 }, // Sr. No.
        { wch: 20 }, // Equipment Tag
        { wch: 20 }, // Equipment Title
        { wch: 15 }, // Job No.
        { wch: 20 }, // Client Doc No.
        { wch: 20 }, // Internal Doc No.
        { wch: 30 }, // Document Name
        { wch: 10 }, // Revision
        { wch: 12 }, // Code Status
        { wch: 20 }, // Status
        { wch: 15 }, // Department
        { wch: 30 }, // Remarks
        { wch: 15 }, // Updated On
        { wch: 20 }  // Updated By
      ];
    worksheet['!cols'] = columnWidths;
    // Style Sheet 1 header row (VDCR blue theme)
    const sheet1Range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let col = sheet1Range.s.c; col <= sheet1Range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      if (worksheet[cellRef]) worksheet[cellRef].s = EXCEL_HEADER_STYLE;
    }

    // Sheet 2: Revision History — Documentation Start Date, then per-revision "Submitted In" / "Received In" (X days (date)), then Total days columns
      const revisionList = getOrderedRevisionList(revisionEventsByRecordId);
      const revColCount = revisionList.length * 2;
      const baseCols = 5; // Sr. No., Doc Name, Equipment Tag No., Documentation Start Date, Total Revisions
      const totalCols = baseCols + revColCount + 3; // + Total days with us, Total days with client, Total days
      const encodeCell = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

      const worksheet2: any = {};
      const headerS = EXCEL_HEADER_STYLE;
      const subheadS = EXCEL_SUBHEADER_STYLE;
      // Row 0: Sr. No., Doc Name, Equipment Tag No., Documentation Start Date, Total Revisions, then Rev-00 (merged), Rev-01 (merged), ..., then 3 total cols (no merge)
      worksheet2[encodeCell(0, 0)] = { t: 's', v: 'Sr. No.', s: headerS };
      worksheet2[encodeCell(0, 1)] = { t: 's', v: 'Doc Name', s: headerS };
      worksheet2[encodeCell(0, 2)] = { t: 's', v: 'Equipment Tag No.', s: headerS };
      worksheet2[encodeCell(0, 3)] = { t: 's', v: 'Documentation Start Date', s: headerS };
      worksheet2[encodeCell(0, 4)] = { t: 's', v: 'Total Revisions', s: headerS };
      revisionList.forEach((rev, i) => {
        const c = baseCols + i * 2;
        const revDisplay = (rev || '00').replace(/^Rev-?/i, '') || '00';
        worksheet2[encodeCell(0, c)] = { t: 's', v: `Rev-${revDisplay}`, s: headerS };
        worksheet2[encodeCell(0, c + 1)] = { t: 's', v: '', s: headerS };
      });
      worksheet2[encodeCell(0, baseCols + revColCount)] = { t: 's', v: 'Total days with us', s: headerS };
      worksheet2[encodeCell(0, baseCols + revColCount + 1)] = { t: 's', v: 'Total days with client', s: headerS };
      worksheet2[encodeCell(0, baseCols + revColCount + 2)] = { t: 's', v: 'Total days', s: headerS };
      // Row 1: empty for first 5 cols, then "Submitted In", "Received In" for each revision, then empty for last 3
      for (let c = 0; c < baseCols; c++) worksheet2[encodeCell(1, c)] = { t: 's', v: '', s: subheadS };
      revisionList.forEach((_, i) => {
        const c = baseCols + i * 2;
        worksheet2[encodeCell(1, c)] = { t: 's', v: 'Submitted In', s: subheadS };
        worksheet2[encodeCell(1, c + 1)] = { t: 's', v: 'Received In', s: subheadS };
      });
      worksheet2[encodeCell(1, baseCols + revColCount)] = { t: 's', v: '', s: subheadS };
      worksheet2[encodeCell(1, baseCols + revColCount + 1)] = { t: 's', v: '', s: subheadS };
      worksheet2[encodeCell(1, baseCols + revColCount + 2)] = { t: 's', v: '', s: subheadS };
      // Data rows (starting row 2)
      vdcrData.forEach((record, rowIndex) => {
        const events = revisionEventsByRecordId[record.id] || [];
        const docStartDate = (record as any).projectDocumentationStartDate ?? null;
        const tracking = getRevisionTrackingForExport(events, docStartDate, projectSalesOrderDate);
        const uniqueRevisions = new Set(events.map((e: any) => e.revision_number || '00'));
        const isAllEquipments = record.equipmentTagNo.length > 0 && allEquipmentTagNos.length > 0 &&
          record.equipmentTagNo.length === allEquipmentTagNos.length &&
          allEquipmentTagNos.every(tag => record.equipmentTagNo.includes(tag));
        const equipmentTagDisplay = isAllEquipments ? 'All Equipments' : record.equipmentTagNo.join(', ');
        const docStartDisplay = docStartDate || projectSalesOrderDate
          ? formatDDMMYYYY(docStartDate || projectSalesOrderDate)
          : '';
        const r = 2 + rowIndex;
        worksheet2[encodeCell(r, 0)] = { t: 's', v: String(record.srNo) };
        worksheet2[encodeCell(r, 1)] = { t: 's', v: record.documentName };
        worksheet2[encodeCell(r, 2)] = { t: 's', v: equipmentTagDisplay };
        worksheet2[encodeCell(r, 3)] = { t: 's', v: docStartDisplay };
        worksheet2[encodeCell(r, 4)] = { t: 'n', v: uniqueRevisions.size };
        revisionList.forEach((rev, i) => {
          const raw = tracking.revisionMap.get(rev);
          const normalized = (rev || '').replace(/^Rev-?/i, '') || '00';
          const d = raw ?? tracking.revisionMap.get(normalized) ?? tracking.revisionMap.get('Rev-' + normalized);
          const submittedIn = d
            ? (d.daysWithUs >= 0 && d.sentDate
              ? `${d.daysWithUs} days (${formatDateDisplayForExcel(d.sentDate)})`
              : d.sentDate ? formatDateDisplayForExcel(d.sentDate) : '')
            : '';
          const receivedIn = d
            ? (d.daysWithClient >= 0 && d.receivedDate
              ? `${d.daysWithClient} days (${formatDateDisplayForExcel(d.receivedDate)})`
              : d.receivedDate ? formatDateDisplayForExcel(d.receivedDate) : '')
            : '';
          const c = baseCols + i * 2;
          worksheet2[encodeCell(r, c)] = { t: 's', v: submittedIn };
          worksheet2[encodeCell(r, c + 1)] = { t: 's', v: receivedIn };
        });
        worksheet2[encodeCell(r, baseCols + revColCount)] = { t: 'n', v: tracking.totalDaysWithUs };
        worksheet2[encodeCell(r, baseCols + revColCount + 1)] = { t: 'n', v: tracking.totalDaysWithClient };
        worksheet2[encodeCell(r, baseCols + revColCount + 2)] = { t: 'n', v: tracking.totalDays };
      });

      const lastRow = vdcrData.length > 0 ? 2 + vdcrData.length - 1 : 1;
      worksheet2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: totalCols - 1 } });
      worksheet2['!merges'] = revisionList.map((_, i) => ({
        s: { r: 0, c: baseCols + i * 2 },
        e: { r: 0, c: baseCols + i * 2 + 1 }
      }));
      worksheet2['!cols'] = [
        { wch: 8 },
        { wch: 40 },
        { wch: 28 },
        { wch: 22 },
        { wch: 16 },
        ...revisionList.flatMap(() => [{ wch: 28 }, { wch: 28 }]),
        { wch: 18 },
        { wch: 22 },
        { wch: 14 }
      ];
    // Sheet 3: Revision Remarks — same layout as Sheet 2 but with Submitted (Remarks) / Commented (Remarks); notable change title in bold
      const totalColsSheet3 = baseCols + revColCount;
      const worksheet3: any = {};
      worksheet3[encodeCell(0, 0)] = { t: 's', v: 'Sr. No.', s: headerS };
      worksheet3[encodeCell(0, 1)] = { t: 's', v: 'Doc Name', s: headerS };
      worksheet3[encodeCell(0, 2)] = { t: 's', v: 'Equipment Tag No.', s: headerS };
      worksheet3[encodeCell(0, 3)] = { t: 's', v: 'Documentation Start Date', s: headerS };
      worksheet3[encodeCell(0, 4)] = { t: 's', v: 'Total Revisions', s: headerS };
      revisionList.forEach((rev, i) => {
        const c = baseCols + i * 2;
        const revDisplay = (rev || '00').replace(/^Rev-?/i, '') || '00';
        worksheet3[encodeCell(0, c)] = { t: 's', v: `Rev-${revDisplay}`, s: headerS };
        worksheet3[encodeCell(0, c + 1)] = { t: 's', v: '', s: headerS };
      });
      for (let c = 0; c < baseCols; c++) worksheet3[encodeCell(1, c)] = { t: 's', v: '', s: subheadS };
      revisionList.forEach((_, i) => {
        const c = baseCols + i * 2;
        worksheet3[encodeCell(1, c)] = { t: 's', v: 'Submitted (Remarks)', s: subheadS };
        worksheet3[encodeCell(1, c + 1)] = { t: 's', v: 'Commented (Remarks)', s: subheadS };
      });
      vdcrData.forEach((record, rowIndex) => {
        const events = revisionEventsByRecordId[record.id] || [];
        const remarksMap = getRevisionRemarksFromEvents(events);
        const uniqueRevisions = new Set(events.map((e: any) => e.revision_number || '00'));
        const isAllEquipments = record.equipmentTagNo.length > 0 && allEquipmentTagNos.length > 0 &&
          record.equipmentTagNo.length === allEquipmentTagNos.length &&
          allEquipmentTagNos.every(tag => record.equipmentTagNo.includes(tag));
        const equipmentTagDisplay = isAllEquipments ? 'All Equipments' : record.equipmentTagNo.join(', ');
        const docStartDisplay = (record as any).projectDocumentationStartDate || projectSalesOrderDate
          ? formatDDMMYYYY((record as any).projectDocumentationStartDate || projectSalesOrderDate)
          : '';
        const r = 2 + rowIndex;
        worksheet3[encodeCell(r, 0)] = { t: 's', v: String(record.srNo) };
        worksheet3[encodeCell(r, 1)] = { t: 's', v: record.documentName };
        worksheet3[encodeCell(r, 2)] = { t: 's', v: equipmentTagDisplay };
        worksheet3[encodeCell(r, 3)] = { t: 's', v: docStartDisplay };
        worksheet3[encodeCell(r, 4)] = { t: 'n', v: uniqueRevisions.size };
        revisionList.forEach((rev, i) => {
          const raw = remarksMap.get(rev);
          const normalized = (rev || '').replace(/^Rev-?/i, '') || '00';
          const d = raw ?? remarksMap.get(normalized) ?? remarksMap.get('Rev-' + normalized);
          const subCell = formatRemarksCell(d?.submitted);
          const recCell = formatRemarksCell(d?.received);
          const c = baseCols + i * 2;
          worksheet3[encodeCell(r, c)] = subCell;
          worksheet3[encodeCell(r, c + 1)] = recCell;
        });
      });
      const lastRowSheet3 = vdcrData.length > 0 ? 2 + vdcrData.length - 1 : 1;
      worksheet3['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRowSheet3, c: totalColsSheet3 - 1 } });
      worksheet3['!merges'] = revisionList.map((_, i) => ({
        s: { r: 0, c: baseCols + i * 2 },
        e: { r: 0, c: baseCols + i * 2 + 1 }
      }));
      worksheet3['!cols'] = [
        { wch: 8 },
        { wch: 40 },
        { wch: 28 },
        { wch: 22 },
        { wch: 16 },
        ...revisionList.flatMap(() => [{ wch: 36 }, { wch: 36 }])
      ];
    // Export: 2+ selected = one Excel file with multiple sheets; 1 selected = one file
    const safeName = (s: string) => s.replace(/[/\\?*:[\]"]/g, '-').replace(/\s+/g, '_');
    const baseName = safeName(projectName);

    if (selectedReports.length >= 2) {
      const wb = XLSX.utils.book_new();
      if (selectedReports.includes('vdcr-records')) XLSX.utils.book_append_sheet(wb, worksheet, 'VDCR Records');
      if (selectedReports.includes('revision-history')) XLSX.utils.book_append_sheet(wb, worksheet2, 'Revision History');
      if (selectedReports.includes('revision-remarks')) XLSX.utils.book_append_sheet(wb, worksheet3, 'Revision Remarks');
      XLSX.writeFile(wb, `${baseName}_VDCR_Reports_${currentDate}.xlsx`);
    } else {
      const id = selectedReports[0];
      const wb = XLSX.utils.book_new();
      if (id === 'vdcr-records') {
        XLSX.utils.book_append_sheet(wb, worksheet, 'VDCR Records');
        XLSX.writeFile(wb, `${baseName}_VDCR_Records_${currentDate}.xlsx`);
      } else if (id === 'revision-history') {
        XLSX.utils.book_append_sheet(wb, worksheet2, 'Revision History');
        XLSX.writeFile(wb, `${baseName}_Revision_History_${currentDate}.xlsx`);
      } else if (id === 'revision-remarks') {
        XLSX.utils.book_append_sheet(wb, worksheet3, 'Revision Remarks');
        XLSX.writeFile(wb, `${baseName}_Revision_Remarks_${currentDate}.xlsx`);
      }
    }
  } catch (error) {
    toast({ title: 'Error', description: 'Error processing Excel export. Please try again.', variant: 'destructive' });
    throw error;
  }
  };

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4 mb-6">
        <div className="flex items-start lg:items-center min-w-0 flex-1">
          <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-foreground leading-snug break-words">
            {projectName} - Documentation Management
          </h2>
        </div>
        <div className="flex flex-col lg:flex-row flex-wrap lg:flex-nowrap items-stretch lg:items-center gap-2 flex-shrink-0">
          {currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
            <Button
              size="sm"
              className="w-full lg:w-auto bg-green-600 hover:bg-green-700 text-white px-3 sm:px-4 py-2 shadow-md hover:shadow-lg transition-all duration-200"
              onClick={handleBulkUpload}
            >
              <FileText size={14} className="mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Bulk Upload Documents</span>
              <span className="sm:hidden">Bulk Upload</span>
            </Button>
          )}

          <div className="flex gap-2 w-full lg:w-auto lg:contents">
            {currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 lg:flex-initial bg-white hover:bg-gray-50 text-gray-700 border-gray-300 hover:border-gray-400 hover:text-gray-800 px-3 sm:px-4"
                onClick={handleAddNewVDCR}
              >
                <Edit size={14} className="mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Add New Document</span>
                <span className="sm:hidden">Add New</span>
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={openExportModal}
              className="flex-1 lg:flex-initial bg-white hover:bg-gray-50 text-gray-700 border-gray-300 hover:border-gray-400 hover:text-gray-800"
            >
              <Download size={14} className="mr-2" />
              Export Excel Reports
            </Button>
          </div>

          {/* Export reports modal: choose which reports to download as separate Excel files */}
          <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
            <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-xl border border-gray-200 shadow-xl">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 px-6 pt-6 pb-4 border-b border-blue-100">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                    <Download className="h-5 w-5 text-blue-600" />
                    Export documentation reports
                  </DialogTitle>
                  <DialogDescription className="text-sm text-gray-600 mt-1">
                    Choose one or more reports to download as separate Excel files.
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {/* VDCR Records */}
                <label className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${exportSelected['vdcr-records'] ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50/50'}`}>
                  <Checkbox
                    checked={exportSelected['vdcr-records']}
                    onCheckedChange={(c) => setExportSelected(prev => ({ ...prev, 'vdcr-records': !!c }))}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0 flex gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <LayoutList className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">VDCR Records</div>
                      <p className="text-sm text-gray-600 mt-0.5">All documentation records: equipment, doc numbers, revision, status, department, and last updated.</p>
                    </div>
                  </div>
                </label>
                {/* Revision History */}
                <label className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${exportSelected['revision-history'] ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50/50'}`}>
                  <Checkbox
                    checked={exportSelected['revision-history']}
                    onCheckedChange={(c) => setExportSelected(prev => ({ ...prev, 'revision-history': !!c }))}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0 flex gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <History className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Revision History</div>
                      <p className="text-sm text-gray-600 mt-0.5">Per-revision submission and receipt dates, days with us and with client, and total days.</p>
                    </div>
                  </div>
                </label>
                {/* Revision Remarks */}
                <label className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${exportSelected['revision-remarks'] ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50/50'}`}>
                  <Checkbox
                    checked={exportSelected['revision-remarks']}
                    onCheckedChange={(c) => setExportSelected(prev => ({ ...prev, 'revision-remarks': !!c }))}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0 flex gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Revision Remarks</div>
                      <p className="text-sm text-gray-600 mt-0.5">Submitted and commented remarks for each revision, with notable changes highlighted in bold.</p>
                    </div>
                  </div>
                </label>
              </div>
              <p className="text-xs text-gray-500 px-4 pb-2 leading-relaxed border-t pt-3 mx-4 bg-amber-50/60 rounded-lg p-3 border border-amber-200/80">
                <strong className="text-amber-800">Tip:</strong> To have 2 or more reports in the same Excel file (as different sheets), select them together and export. If you want them individually, select and download one at a time.
              </p>
              <DialogFooter className="p-4 pt-2 border-t bg-gray-50/50 flex-row gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setExportModalOpen(false)} disabled={exporting}>
                  Cancel
                </Button>
                <Button onClick={runExportSelected} disabled={exporting}>
                  {exporting ? (
                    <>
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent inline-block mr-2" />
                      Exporting…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Export selected
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogContent className="w-[95vw] max-w-6xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle className="text-lg sm:text-2xl font-bold text-gray-800 break-words pr-8">
                  {isAddingNew ? 'Add New Documentation Record' : 'Edit Documentation Record'}
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-4 sm:mt-6">
                {/* Equipment Selection Accordion */}
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">Select Equipment</h3>
                  <div className="space-y-3">
                    {/* ALL Option */}
                    <div className="border border-gray-200 rounded-lg p-3 bg-blue-50/30">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="select-all-equipment"
                          checked={equipmentData.length > 0 && selectedEquipments.length === equipmentData.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              // Select all equipment
                              const allTagNos = equipmentData.map(eq => eq.tagNo);
                              setSelectedEquipments(allTagNos);
                            } else {
                              // Deselect all
                              setSelectedEquipments([]);
                            }
                          }}
                        />
                        <Label htmlFor="select-all-equipment" className="flex-1 cursor-pointer">
                          <div className="font-semibold text-gray-800">ALL</div>
                          <div className="text-xs text-gray-600 mt-0.5">Select all equipment at once</div>
                        </Label>
                      </div>
                    </div>
                    
                    {Object.entries(groupedEquipments).map(([type, equipments]) => (
                      <div key={type} className="border border-gray-200 rounded-lg">
                        <button
                          onClick={() => toggleEquipmentType(type)}
                          className="w-full p-3 sm:p-4 text-left bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg flex items-center justify-between"
                        >
                          <span className="font-medium text-gray-800">{type}</span>
                          {expandedEquipmentTypes.includes(type) ? (
                            <ChevronDown size={20} className="text-gray-600" />
                          ) : (
                            <ChevronRight size={20} className="text-gray-600" />
                          )}
                        </button>

                        {expandedEquipmentTypes.includes(type) && (
                          <div className="p-3 sm:p-4 space-y-2 border-t border-gray-200">
                            {equipments.map((equipment) => {
                              const isSelected = selectedEquipments.includes(equipment.tagNo);
                              return (
                                <div key={equipment.tagNo} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                                  <Checkbox
                                    id={equipment.tagNo}
                                    checked={isSelected}
                                    onCheckedChange={(checked) => handleEquipmentSelection(equipment.tagNo, checked as boolean)}
                                  />
                                  <Label htmlFor={equipment.tagNo} className="flex-1 cursor-pointer min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium text-gray-800 truncate">{equipment.tagNo}</span>
                                    </div>
                                    <div className="text-xs sm:text-sm text-gray-600 mt-1 break-words">
                                      {equipment.location} • {equipment.mfgSerialNo}
                                    </div>
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Revision Event Tracking */}
                <div className="space-y-3 sm:space-y-4">
                  <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
                    <h4 className="text-sm sm:text-base font-semibold text-blue-800 mb-3 sm:mb-4 flex items-center gap-2">
                      <History className="w-5 h-5" />
                      Track Revision Events
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                              <Button
                        type="button"
                                variant="outline"
                        disabled={!revisionEventButtons.submittedEnabled}
                        className={`${
                          revisionEventButtons.submittedEnabled
                            ? 'bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700 hover:text-blue-800 cursor-pointer'
                            : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-60'
                        }`}
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          const effectiveRevNum = getEffectiveRevNumForSubmitted(formData.revision, editingVDCR?.revisionEvents);
                          const cycleTime = getCycleTimeForRecordRevision(editingVDCR, effectiveRevNum);
                          const autoReturn = cycleTime != null ? addDaysToDate(today, cycleTime) : '';
                          setRevisionEventModal({
                            isOpen: true,
                            eventType: 'submitted',
                            eventDate: today,
                            estimatedReturnDate: autoReturn,
                            targetSubmissionDate: '',
                            notes: '',
                            documentFile: null,
                            documentUrl: null,
                            isUploadingDocument: false,
                            uploadAbortController: null,
                            hasNotableChange: false,
                            notableChangeTitle: ''
                          });
                        }}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Submitted
                              </Button>
                              <Button
                        type="button"
                                variant="outline"
                        disabled={!revisionEventButtons.commentedEnabled}
                        className={`${
                          revisionEventButtons.commentedEnabled
                            ? 'bg-green-50 hover:bg-green-100 border-green-300 text-green-700 hover:text-green-800 cursor-pointer'
                            : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-60'
                        }`}
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          const revMatch = formData.revision.match(/Rev-?(\d+)/i) || formData.revision.match(/(\d+)/);
                          const revNum = revMatch ? parseInt(revMatch[1], 10) : 0;
                          const cycleTime = getCycleTimeForRecordRevision(editingVDCR, revNum + 1); // Next submission = next rev
                          const autoTarget = cycleTime != null ? addDaysToDate(today, cycleTime) : '';
                          setRevisionEventModal({
                            isOpen: true,
                            eventType: 'received',
                            eventDate: today,
                            estimatedReturnDate: '',
                            targetSubmissionDate: autoTarget,
                            notes: '',
                            documentFile: null,
                            documentUrl: null,
                            isUploadingDocument: false,
                            uploadAbortController: null,
                            hasNotableChange: false,
                            notableChangeTitle: ''
                          });
                        }}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Commented
                              </Button>
                            </div>
                    {(!revisionEventButtons.submittedEnabled || !revisionEventButtons.commentedEnabled) && (
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        {!revisionEventButtons.submittedEnabled 
                          ? 'Please complete the "Commented" step first.' 
                          : 'Please complete the "Submitted" step first.'}
                      </p>
                    )}
                    <p className="text-xs text-gray-600 mt-2">
                      Track when documents are submitted to client or received back to calculate turnaround times
                                </p>
                              </div>
                            </div>

                {/* Project Documentation Start Date and Targeted Finish Date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  {/* Project Documentation Start Date */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                      <Label htmlFor="projectDocumentationStartDate">Project Documentation Start Date</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleFieldLock('projectDocumentationStartDate')}
                        className="h-6 px-2 text-xs"
                        title={fieldLocks.projectDocumentationStartDate ? 'Click to unlock and edit' : 'Click to lock'}
                      >
                        {fieldLocks.projectDocumentationStartDate ? (
                          <Lock className="w-3 h-3 text-gray-500" />
                        ) : (
                          <Unlock className="w-3 h-3 text-blue-600" />
                        )}
                      </Button>
                    </div>
                    <Input
                      id="projectDocumentationStartDate"
                      type="date"
                      value={formData.projectDocumentationStartDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, projectDocumentationStartDate: e.target.value }))}
                      disabled={fieldLocks.projectDocumentationStartDate}
                      className="mt-1 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:invert-0 [&::-webkit-calendar-picker-indicator]:brightness-0"
                      style={{
                        colorScheme: 'light'
                      }}
                    />
                    {fieldLocks.projectDocumentationStartDate && (
                      <p className="text-xs text-gray-500 mt-1">
                        {formData.projectDocumentationStartDate 
                          ? 'Locked - click unlock to edit' 
                          : `Default: ${projectData?.sales_order_date ? new Date(projectData.sales_order_date).toLocaleDateString() : 'Project PO Date'} (click unlock to set custom date)`}
                      </p>
                    )}
                    {!formData.projectDocumentationStartDate && projectData?.sales_order_date && (
                      <p className="text-xs text-blue-600 mt-1">
                        💡 Using project PO date as default. Unlock to set a custom date for this document.
                      </p>
                    )}
                  </div>

                  {/* Targeted Finish Date */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                      <Label htmlFor="targetedFinishDate">Targeted Finish Date</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleFieldLock('targetedFinishDate')}
                        className="h-6 px-2 text-xs"
                        title={fieldLocks.targetedFinishDate ? 'Click to unlock and edit' : 'Click to lock'}
                      >
                        {fieldLocks.targetedFinishDate ? (
                          <Lock className="w-3 h-3 text-gray-500" />
                        ) : (
                          <Unlock className="w-3 h-3 text-orange-600" />
                        )}
                      </Button>
                    </div>
                    <Input
                      id="targetedFinishDate"
                      type="date"
                      value={formData.targetedFinishDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, targetedFinishDate: e.target.value }))}
                      disabled={fieldLocks.targetedFinishDate}
                      className="mt-1 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:invert-0 [&::-webkit-calendar-picker-indicator]:brightness-0"
                      style={{
                        colorScheme: 'light'
                      }}
                    />
                    {fieldLocks.targetedFinishDate && (
                      <p className="text-xs text-gray-500 mt-1">
                        Locked - click unlock to edit
                      </p>
                    )}
                    {!formData.targetedFinishDate && (
                      <p className="text-xs text-gray-500 mt-1">
                        Optional - set target completion date for this document
                      </p>
                    )}
                  </div>
                </div>

                {/* VDCR Form */}
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">VDCR Details</h3>

                  <div className="space-y-3 sm:space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                        <Label htmlFor="srNo">Serial Number</Label>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFieldLock('srNo')}
                            className="h-6 px-2 text-xs"
                            title={fieldLocks.srNo ? 'Click to unlock and edit' : 'Click to lock'}
                          >
                            {fieldLocks.srNo ? (
                              <Lock className="w-3 h-3 text-gray-500" />
                            ) : (
                              <Unlock className="w-3 h-3 text-blue-600" />
                            )}
                          </Button>
                          </div>
                        <Input
                          id="srNo"
                          value={formData.srNo}
                          onChange={(e) => setFormData(prev => ({ ...prev, srNo: e.target.value }))}
                          disabled={fieldLocks.srNo}
                          className="mt-1"
                          placeholder="Auto-generated"
                        />
                      </div>
                      <div>
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                          <Label htmlFor="revision">Revision</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFieldLock('revision')}
                            className="h-6 px-2 text-xs"
                            title={fieldLocks.revision ? 'Click to unlock and edit. Revision only changes when you click Submitted or Commented.' : 'Click to lock. Revision only changes when you click Submitted or Commented.'}
                          >
                            {fieldLocks.revision ? (
                              <Lock className="w-3 h-3 text-gray-500" />
                            ) : (
                              <Unlock className="w-3 h-3 text-blue-600" />
                            )}
                          </Button>
                        </div>
                        <Input
                          id="revision"
                          value={formData.revision}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            
                            // If locked, don't allow changes
                            if (fieldLocks.revision) {
                              return;
                            }
                            
                            // Extract current prefix (e.g., "Rev-")
                            const currentRevision = formData.revision;
                            const prefixMatch = currentRevision.match(/^([^0-9]+)/i);
                            const prefix = prefixMatch ? prefixMatch[1] : 'Rev-';
                            
                            // If user is trying to change the prefix, preserve it
                            if (inputValue.toLowerCase().startsWith(prefix.toLowerCase())) {
                              // Extract only the number part from input
                              const numberMatch = inputValue.match(/(\d+)/);
                              if (numberMatch) {
                                const num = numberMatch[1];
                                const paddedNum = String(parseInt(num, 10)).padStart(2, '0');
                                setFormData(prev => ({ ...prev, revision: `${prefix}${paddedNum}` }));
                              } else if (inputValue === prefix || inputValue === prefix.toLowerCase()) {
                                // If only prefix entered, add default "00"
                                setFormData(prev => ({ ...prev, revision: `${prefix}00` }));
                              }
                            } else {
                              // If prefix is missing or changed, extract numbers and reconstruct with original prefix
                              const numberMatch = inputValue.match(/(\d+)/);
                              if (numberMatch) {
                                const num = numberMatch[1];
                                const paddedNum = String(parseInt(num, 10)).padStart(2, '0');
                                setFormData(prev => ({ ...prev, revision: `${prefix}${paddedNum}` }));
                              } else {
                                // If no numbers found, keep original value
                                setFormData(prev => ({ ...prev, revision: currentRevision }));
                              }
                            }
                          }}
                          onBlur={(e) => {
                            // Ensure proper formatting on blur
                            const currentRevision = formData.revision;
                            const prefixMatch = currentRevision.match(/^([^0-9]+)/i);
                            const prefix = prefixMatch ? prefixMatch[1] : 'Rev-';
                            const numberMatch = currentRevision.match(/(\d+)/);
                            
                            if (numberMatch) {
                              const num = numberMatch[1];
                              const paddedNum = String(parseInt(num, 10)).padStart(2, '0');
                              setFormData(prev => ({ ...prev, revision: `${prefix}${paddedNum}` }));
                            } else {
                              // If no number found, set to default
                              setFormData(prev => ({ ...prev, revision: `${prefix}00` }));
                            }
                          }}
                          disabled={fieldLocks.revision}
                          className="mt-1"
                          placeholder="Rev-00 (changes only via Submitted/Commented)"
                        />
                        {fieldLocks.revision && (
                          <p className="text-xs text-gray-500 mt-1">Changes only when you click Submitted or Commented</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                        <Label htmlFor="documentName">Document Name</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleFieldLock('documentName')}
                          className="h-6 px-2 text-xs"
                          title={fieldLocks.documentName ? 'Click to unlock and edit' : 'Click to lock'}
                        >
                          {fieldLocks.documentName ? (
                            <Lock className="w-3 h-3 text-gray-500" />
                          ) : (
                            <Unlock className="w-3 h-3 text-blue-600" />
                          )}
                        </Button>
                      </div>
                      <Input
                        id="documentName"
                        value={formData.documentName}
                        onChange={(e) => setFormData(prev => ({ ...prev, documentName: e.target.value }))}
                        disabled={fieldLocks.documentName}
                        className="mt-1"
                        placeholder="Enter document name (not auto-filled from file)"
                      />
                      {fieldLocks.documentName && (
                        <p className="text-xs text-gray-500 mt-1">Locked - click unlock to edit</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                          <Label htmlFor="clientDocNo">Client Document No.</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFieldLock('clientDocNo')}
                            className="h-6 px-2 text-xs"
                            title={fieldLocks.clientDocNo ? 'Click to unlock and edit' : 'Click to lock'}
                          >
                            {fieldLocks.clientDocNo ? (
                              <Lock className="w-3 h-3 text-gray-500" />
                            ) : (
                              <Unlock className="w-3 h-3 text-blue-600" />
                            )}
                          </Button>
                        </div>
                        <Input
                          id="clientDocNo"
                          value={formData.clientDocNo}
                          onChange={(e) => setFormData(prev => ({ ...prev, clientDocNo: e.target.value }))}
                          disabled={fieldLocks.clientDocNo}
                          className="mt-1"
                          placeholder="Enter client document number"
                        />
                        {fieldLocks.clientDocNo && (
                          <p className="text-xs text-gray-500 mt-1">Locked - click unlock to edit</p>
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                          <Label htmlFor="internalDocNo">Internal Document No.</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFieldLock('internalDocNo')}
                            className="h-6 px-2 text-xs"
                            title={fieldLocks.internalDocNo ? 'Click to unlock and edit' : 'Click to lock'}
                          >
                            {fieldLocks.internalDocNo ? (
                              <Lock className="w-3 h-3 text-gray-500" />
                            ) : (
                              <Unlock className="w-3 h-3 text-blue-600" />
                            )}
                          </Button>
                        </div>
                        <Input
                          id="internalDocNo"
                          value={formData.internalDocNo}
                          onChange={(e) => setFormData(prev => ({ ...prev, internalDocNo: e.target.value }))}
                          disabled={fieldLocks.internalDocNo}
                          className="mt-1"
                          placeholder="Enter internal document number"
                        />
                        {fieldLocks.internalDocNo && (
                          <p className="text-xs text-gray-500 mt-1">Locked - click unlock to edit</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <Label htmlFor="codeStatus">Code Status</Label>
                        <Select
                          value={formData.codeStatus}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, codeStatus: value }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select Code Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Code 1">Code 1</SelectItem>
                            <SelectItem value="Code 2">Code 2</SelectItem>
                            <SelectItem value="Code 3">Code 3</SelectItem>
                            <SelectItem value="Code 4">Code 4</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="status">Status</Label>
                        <Select
                          value={formData.status}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="sent-for-approval">Submitted for Review</SelectItem>
                            <SelectItem value="received-for-comment">Received Commented Doc</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Show in equipment doc tab */}
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="showInEquipmentDocTab"
                        checked={formData.showInEquipmentDocTab}
                        onChange={(e) => setFormData(prev => ({ ...prev, showInEquipmentDocTab: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Label htmlFor="showInEquipmentDocTab" className="text-sm font-normal cursor-pointer">
                        Show this document in the Docs tab of respective equipment
                      </Label>
                    </div>

                    {/* Department Field */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                        <Label htmlFor="department">Department</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleFieldLock('department')}
                          className="h-6 px-2 text-xs"
                          title={fieldLocks.department ? 'Click to unlock and edit' : 'Click to lock'}
                        >
                          {fieldLocks.department ? (
                            <Lock className="w-3 h-3 text-gray-500" />
                          ) : (
                            <Unlock className="w-3 h-3 text-blue-600" />
                          )}
                        </Button>
                      </div>
                      <div className="border border-gray-300 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => !fieldLocks.department && setDepartmentDropdownOpen(!departmentDropdownOpen)}
                          disabled={fieldLocks.department}
                          className="w-full px-3 py-2 text-left bg-white hover:bg-gray-50 transition-colors flex items-center justify-between text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                          <span className={`truncate ${formData.department ? 'text-gray-900' : 'text-gray-500'}`}>
                            {formData.department || 'Select or enter department'}
                          </span>
                          {departmentDropdownOpen ? <ChevronUp size={16} className="flex-shrink-0" /> : <ChevronDown size={16} className="flex-shrink-0" />}
                        </button>
                        
                        {departmentDropdownOpen && !fieldLocks.department && (
                          <div className="border-t border-gray-200 bg-gray-50">
                            {/* Search Bar */}
                            <div className="p-2 border-b border-gray-200 bg-white">
                              <Input
                                placeholder="Search options..."
                                value={departmentSearchQuery}
                                onChange={(e) => setDepartmentSearchQuery(e.target.value)}
                                className="text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500 h-8"
                              />
                            </div>
                            
                            {/* Options List */}
                            <div className="max-h-48 overflow-y-auto">
                              {(() => {
                                const filtered = availableDepartments.filter(dept =>
                                  dept.toLowerCase().includes(departmentSearchQuery.toLowerCase())
                                );
                                return filtered.length > 0 ? (
                                  filtered.map((dept, index) => {
                                    const originalIndex = availableDepartments.indexOf(dept);
                                    const isEditing = editingDepartment?.index === originalIndex;
                                    
                                    return (
                                      <div key={dept} className="flex items-center justify-between px-3 py-2 hover:bg-gray-100 transition-colors">
                                        {isEditing ? (
                                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 min-w-0 bg-blue-50 border border-blue-300 rounded-lg p-2">
                                            <Input
                                              type="text"
                                              value={editingDepartment.value}
                                              onChange={(e) => setEditingDepartment(prev => prev ? { ...prev, value: e.target.value } : null)}
                                              className="flex-1 text-sm bg-white border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                              autoFocus
                                              placeholder="Edit department name..."
                                            />
                                            <Button
                                              type="button"
                                              size="sm"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                saveEditedDepartment();
                                              }}
                                              className="bg-green-600 hover:bg-green-700 text-white px-2 py-1.5 rounded text-sm"
                                            >
                                              <CheckCircle size={14} className="mr-1" />
                                              Save
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                cancelEditingDepartment();
                                              }}
                                              className="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1.5 rounded text-sm"
                                            >
                                              <X size={14} />
                                            </Button>
                                          </div>
                                        ) : (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleDepartmentSelect(dept)}
                                              className="flex-1 text-left text-sm hover:text-blue-600 transition-colors truncate min-w-0"
                                            >
                                              {dept}
                                            </button>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  startEditingDepartment(originalIndex, dept);
                                                }}
                                                className="h-6 w-6 p-0 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                                title="Edit"
                                              >
                                                <Pencil size={12} />
                                              </Button>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  deleteDepartment(originalIndex);
                                                }}
                                                className="h-6 w-6 p-0 text-gray-500 hover:text-red-600 hover:bg-red-50"
                                                title="Delete"
                                              >
                                                <X size={12} />
                                              </Button>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="px-3 py-2 text-sm text-gray-500">
                                    No departments found
                                  </div>
                                );
                              })()}
                            </div>
                            
                            {/* Add New Button */}
                            <div className="border-t border-gray-200 p-2 bg-white">
                              {!showAddNewDepartment ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setShowAddNewDepartment(true);
                                    setEditingDepartment(null);
                                  }}
                                  className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-sm h-8"
                                >
                                  <Plus size={14} className="mr-2" />
                                  Add New Department
                                </Button>
                              ) : (
                                <div className="space-y-2">
                                  <Input
                                    value={newDepartmentValue}
                                    onChange={(e) => setNewDepartmentValue(e.target.value)}
                                    placeholder="Enter new department name"
                                    className="text-sm h-8 min-w-0"
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter') {
                                        handleAddNewDepartment();
                                      }
                                    }}
                                  />
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={handleAddNewDepartment}
                                      className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm h-8"
                                    >
                                      <CheckCircle size={14} className="mr-1" />
                                      Add
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setShowAddNewDepartment(false);
                                        setNewDepartmentValue('');
                                      }}
                                      className="bg-gray-500 hover:bg-gray-600 text-white text-sm h-8"
                                    >
                                      <X size={14} />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {fieldLocks.department && (
                        <p className="text-xs text-gray-500 mt-1">Locked - click unlock to edit</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="remarks">Remarks</Label>
                      <Textarea
                        id="remarks"
                        value={formData.remarks}
                        onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                        placeholder="Add any additional remarks..."
                        className="mt-1"
                        rows={3}
                      />
                    </div>

                    
                    {/* Document Upload Section - Hidden for now as documents are handled in submitted/commented sections */}
                    {false && (
                    <div className="mt-6 space-y-4">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">Document Management</h3>

                      <div className="space-y-4">
                        {/* Upload New Document Section */}
                        <div>
                          <Label htmlFor="documentUpload">Upload New Document</Label>
                          <div className="mt-2">
                            <Input
                              id="documentUpload"
                              type="file"
                              accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.gif"
                              onChange={handleFileUpload}
                              className="cursor-pointer"
                              disabled={isUploading}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              {/* Supported formats: PDF, Word, Excel, PowerPoint, Images (max 50MB each) */}
                              "Supported formats: PDF, Word, Excel, PowerPoint, Images (max 2MB each)"
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                              💡 You can upload multiple documents - each will be listed below
                            </p>
                          </div>

                          {isUploading && (
                            <div className="flex items-center space-x-2 text-blue-600 mt-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                              <span className="text-sm">Uploading document...</span>
                            </div>
                          )}
                        </div>

                        {/* Uploaded Documents List */}
                        {(uploadedFiles.length > 0 || (!isAddingNew && editingVDCR?.documentFile)) && (
                          <div className="space-y-3">
                            <Label className="text-sm font-medium text-gray-800">Uploaded Documents</Label>

                            {/* Show newly uploaded files */}
                            {uploadedFiles.map((file, index) => (
                              <div key={file.id || index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                    <FileText size={16} className="text-blue-600" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">{file.originalName}</p>
                                    <p className="text-xs text-gray-500">
                                      {file.fileType.toUpperCase()} • {file.uploadDate} • {(file.fileSize / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                        <Button
                                    size="sm"
                          variant="outline"
                                    onClick={() => openDocumentPreview(file.filePath, file.originalName)}
                                    className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                                  >
                                    View
                        </Button>
                        <Button
                                    size="sm"
                          variant="outline"
                                    onClick={() => {
                                      setUploadedFiles(prev => prev.filter(f => f.id !== file.id));
                                    }}
                                    className="text-xs border-red-300 text-red-700 hover:bg-red-50"
                                  >
                                    Remove
                        </Button>
                      </div>
                              </div>
                            ))}

                            {/* Show existing document from editing VDCR */}
                            {!isAddingNew && editingVDCR?.documentFile && !uploadedFiles.some(f => f.originalName === editingVDCR.documentFile?.originalName) && (
                              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                    <FileText size={16} className="text-green-600" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">{editingVDCR.documentFile.originalName}</p>
                                    <p className="text-xs text-gray-500">
                                      {editingVDCR.documentFile.fileType.toUpperCase()} • {editingVDCR.documentFile.uploadDate}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openDocumentPreview(editingVDCR.documentFile!.filePath, editingVDCR.documentFile!.originalName, editingVDCR.id)}
                                  className="text-xs border-green-300 text-green-700 hover:bg-green-50"
                                >
                                  View
                                </Button>
                              </div>
                            )}
                    </div>
                        )}

                      </div>
                    </div>
                    )}

                  </div>

                  {/* Auto-generated Equipment Details */}
                  {selectedEquipments.length > 0 && (
                    <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="text-sm sm:text-base font-medium text-blue-800 mb-2 sm:mb-3">Selected Equipment Details</h4>
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs sm:text-sm">
                          <span className="text-blue-700">Equipment Tags:</span>
                          <span className="font-medium break-words">{selectedEquipments.join(', ')}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs sm:text-sm">
                          <span className="text-blue-700">Job Nos:</span>
                          <span className="font-medium break-words">{autoGenerateJobNos().join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-4 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSaving}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} className="mr-2" />
                      {isAddingNew ? 'Add VDCR Record' : 'Save Changes'}
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Bulk Upload Modal */}
          <Dialog open={bulkUploadModal.isOpen} onOpenChange={(open) => setBulkUploadModal(prev => ({ ...prev, isOpen: open }))}>
            <DialogContent className="w-[95vw] max-w-5xl max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden p-0">
              <DialogHeader className="flex-shrink-0 px-4 pt-4 sm:px-6 sm:pt-6 pb-2">
                <DialogTitle className="text-lg sm:text-2xl font-bold text-gray-800 break-words pr-8">
                  Bulk Upload Documentation Records
                </DialogTitle>
                <p className="text-sm sm:text-base text-gray-600 mt-2">
                  Upload multiple documentation records using predefined templates
                </p>
              </DialogHeader>

              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 space-y-4 sm:space-y-6 mt-2 pb-4">
                {/* Template Information */}
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800">VDCR Template</h3>
                  <div className="p-3 sm:p-4 border border-gray-200 rounded-lg bg-gray-50 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                      <h4 className="font-semibold text-gray-800 text-sm sm:text-base break-words">{vdcrTemplate.name}</h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={downloadTemplate}
                        className="w-full sm:w-auto flex-shrink-0 bg-blue-50 hover:bg-blue-100 border-blue-200 hover:border-blue-300 text-blue-700"
                      >
                        <Download size={14} className="mr-2" />
                        Download Sample Template
                      </Button>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-3 break-words">{vdcrTemplate.description}</p>
                    <div className="text-xs text-gray-500 min-w-0 break-words">
                      <p><strong>Columns:</strong> {vdcrTemplate.columns.join(', ')}</p>
                      <p><strong>Features:</strong></p>
                      <ul className="list-disc list-inside ml-2 space-y-1">
                        <li>Sr. No. → Use your own numbers or leave blank to continue from last entry</li>
                        <li>Equipment Tag No. → Auto-fills Mfg Serial No. & Job No. from database</li>
                        <li>Excel Format → Professional template with dropdowns and validation</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* File Upload */}
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800">Upload Excel/CSV File</h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="bulkFileUpload">Select Excel or CSV File</Label>
                      <div className="mt-2">
                        <Input
                          id="bulkFileUpload"
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={handleFileUploadForBulk}
                          className="cursor-pointer"
                          disabled={bulkUploadModal.isProcessing}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Upload Excel file (.xlsx recommended) or CSV file (.csv) matching the template format
                        </p>
                      </div>
                    </div>

                    {bulkUploadModal.uploadedFile && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-green-700">
                          <FileText size={16} />
                          <span className="text-sm font-medium">
                            File uploaded: {bulkUploadModal.uploadedFile.name}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Data Preview */}
                {bulkUploadModal.previewData.length > 0 && (
                  <div className="space-y-3 sm:space-y-4">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-800">Data Preview</h3>
                    <div className="border rounded-lg overflow-hidden min-w-0">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              {Object.keys(bulkUploadModal.previewData[0]).map((header) => (
                                <th key={header} className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-700 border-b whitespace-nowrap">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {bulkUploadModal.previewData.slice(0, 5).map((row, index) => (
                              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                {Object.values(row).map((value, cellIndex) => (
                                  <td key={cellIndex} className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-600 border-b break-words max-w-[120px] sm:max-w-none">
                                    {String(value) || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {bulkUploadModal.previewData.length > 5 && (
                        <div className="p-3 bg-gray-50 text-center text-sm text-gray-600 border-t">
                          Showing first 5 rows of {bulkUploadModal.previewData.length} total rows
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Processing Status */}
                {bulkUploadModal.isProcessing && (
                  <div className="text-center py-4 sm:py-6">
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-blue-600">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="text-lg font-medium">Processing bulk upload...</span>
                    </div>
                    <p className="text-gray-600 mt-2">Please wait while we import your documentation records</p>
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 bg-white">
                <Button
                  variant="outline"
                  onClick={() => setBulkUploadModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={bulkUploadModal.isProcessing}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                {bulkUploadModal.previewData.length > 0 && !bulkUploadModal.isProcessing && (
                  <Button
                    onClick={processBulkUpload}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                  >
                    <FileText size={16} className="mr-2" />
                    Import {bulkUploadModal.previewData.length} Records
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Document Preview Modal */}
          <Dialog open={previewModal.isOpen} onOpenChange={(open) => setPreviewModal(prev => ({ ...prev, isOpen: open }))}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <FileText size={20} className="text-blue-600" />
                  <span>Document Preview: {previewModal.documentName}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="flex-1 overflow-hidden">
                {previewModal.document ? (
                  <div className="space-y-4">
                    {/* Document Info */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">File Name:</span>
                          <p className="text-gray-600">{previewModal.document.originalName}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">File Type:</span>
                          <p className="text-gray-600">{previewModal.document.fileType.toUpperCase()}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">File Size:</span>
                          <p className="text-gray-600">{(previewModal.document.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Uploaded By:</span>
                          <p className="text-gray-600">{previewModal.document.uploadedBy}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Upload Date:</span>
                          <p className="text-gray-600">{previewModal.document.uploadDate}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Document ID:</span>
                          <p className="text-gray-600">{previewModal.document.id}</p>
                        </div>
                      </div>
                    </div>

                    {/* Mock Document Content */}
                    <div className="bg-white border rounded-lg p-6 min-h-[400px]">
                      <div className="text-center space-y-4">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                          <FileText size={32} className="text-blue-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800">{previewModal.documentName}</h3>
                        <p className="text-gray-600">
                          This is a preview of the document "{previewModal.document.originalName}"
                        </p>
                        <div className="text-sm text-gray-500">
                          <p>File Type: {previewModal.document.fileType.toUpperCase()}</p>
                          <p>Size: {(previewModal.document.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                        </div>

                        {/* PDF Preview with actual functionality */}
                        {previewModal.document.fileType === 'pdf' && (
                          <div className="bg-white border rounded-lg overflow-hidden">
                            {/* PDF Viewer Header */}
                            <div className="bg-gray-100 px-4 py-3 border-b flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <h4 className="font-medium text-gray-800">PDF Document Preview</h4>
                                <div className="flex items-center space-x-2">
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleZoomOut}>
                                    <span className="mr-1">-</span> Zoom Out
                                  </Button>
                                  <span className="text-sm text-gray-600 px-2">{pdfViewerState.zoomLevel}%</span>
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleZoomIn}>
                                    <span className="mr-1">+</span> Zoom In
                                  </Button>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handlePrevPage}>
                                  ← Prev
                                </Button>
                                <span className="text-sm text-gray-600 px-2">Page {pdfViewerState.currentPage} of {pdfViewerState.totalPages}</span>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleNextPage}>
                                  Next →
                                </Button>
                              </div>
                            </div>

                            {/* PDF Content Area - Real PDF Viewer */}
                            <div 
                              className="bg-gray-100 min-h-[500px] flex items-center justify-center relative overflow-hidden"
                              onWheel={(e) => {
                                // Horizontal scroll navigation for PDF pages
                                if (e.deltaX > 0) {
                                  // Scroll right - next page
                                  // // console.log('PDF Scroll right detected');
                                  handleNextPage();
                                } else if (e.deltaX < 0) {
                                  // Scroll left - previous page  
                                  // // console.log('PDF Scroll left detected');
                                  handlePrevPage();
                                }
                              }}
                              onKeyDown={(e) => {
                                // Keyboard navigation
                                if (e.key === 'ArrowRight') {
                                  // // console.log('PDF Right arrow - next page');
                                  handleNextPage();
                                } else if (e.key === 'ArrowLeft') {
                                  // // console.log('PDF Left arrow - previous page');
                                  handlePrevPage();
                                }
                              }}
                              tabIndex={0}
                            >
                              {isLoadingPdf ? (
                                <div className="flex items-center justify-center">
                                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                  <span className="ml-2 text-gray-600">Loading PDF...</span>
                                </div>
                              ) : pdfDocument ? (
                                <div className="w-full h-full flex items-center justify-center">
                                  <canvas
                                    id="pdf-canvas"
                                    className={`border shadow-lg ${pdfViewerState.isAnnotating ? 'cursor-crosshair' : 'cursor-default'}`}
                                    style={{
                                      transform: `scale(${pdfViewerState.zoomLevel / 100})`,
                                      transformOrigin: 'center center',
                                      transition: 'transform 0.3s ease',
                                      maxWidth: '100%',
                                      maxHeight: '100%'
                                    }}
                                    onClick={(e) => {
                                      if (pdfViewerState.isAnnotating) {
                                        // Get click position
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const x = e.clientX - rect.left;
                                        const y = e.clientY - rect.top;

                                        // Handle different annotation types
                                        if (annotationTools.selectedTool === 'text') {
                                          // Open text input modal
                                          setTextInputModal({
                                            isOpen: true,
                                            text: '',
                                            position: { x, y }
                                          });
                                        } else {
                                          // Show annotation feedback for other tools
                                          const feedback = document.createElement('div');
                                          feedback.className = 'absolute pointer-events-none z-50';
                                          feedback.style.left = `${x}px`;
                                          feedback.style.top = `${y}px`;
                                          feedback.style.color = annotationTools.color;
                                          feedback.style.fontSize = annotationTools.size === 'small' ? '12px' : annotationTools.size === 'medium' ? '16px' : '20px';
                                          feedback.style.fontWeight = 'bold';
                                          feedback.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
                                          feedback.style.animation = 'annotationPulse 0.5s ease-in-out';

                                          // Add CSS animation
                                          if (!document.getElementById('annotation-styles')) {
                                            const style = document.createElement('style');
                                            style.id = 'annotation-styles';
                                            style.textContent = `
                                              @keyframes annotationPulse {
                                                0% { transform: scale(0.5); opacity: 0; }
                                                50% { transform: scale(1.2); opacity: 1; }
                                                100% { transform: scale(1); opacity: 0.8; }
                                              }
                                            `;
                                            document.head.appendChild(style);
                                          }

                                          feedback.textContent = annotationTools.selectedTool === 'highlight' ? '🖍️' :
                                            annotationTools.selectedTool === 'pen' ? '✏️' :
                                              annotationTools.selectedTool === 'arrow' ? '➡️' : '⬜';

                                          e.currentTarget.parentElement?.appendChild(feedback);

                                          // Remove feedback after animation
                                          setTimeout(() => {
                                            feedback.remove();
                                          }, 2000);
                                        }
                                      }
                                    }}
                                  />
                                </div>
                              ) : previewModal.document?.fileType === 'pdf' ? (
                                <div className="text-center text-gray-500">
                                  <p>PDF not loaded</p>
                                </div>
                              ) : (
                                <div className="bg-white border-2 border-gray-400 shadow-2xl rounded-lg p-8">
                                  <div className="text-center">
                                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                      <FileText size={40} className="text-gray-600" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-gray-800 mb-2">{previewModal.documentName}</h2>
                                    <p className="text-gray-600 text-lg mb-4">Document Preview</p>
                                    <div className="bg-gray-50 p-4 rounded-lg border">
                                      <p className="text-gray-700">
                                        <strong>File Type:</strong> {(previewModal.document?.fileType as string)?.toUpperCase() || 'OTHER'}
                                      </p>
                                      <p className="text-gray-600 text-sm mt-2">
                                        <strong>File Size:</strong> {((previewModal.document?.fileSize || 0) / 1024 / 1024).toFixed(2)} MB
                                      </p>
                                      <p className="text-gray-600 text-sm mt-2">
                                        <strong>Uploaded By:</strong> {previewModal.document?.uploadedBy || 'Unknown'}
                                      </p>
                                      <p className="text-gray-600 text-sm mt-2">
                                        <strong>Upload Date:</strong> {previewModal.document?.uploadDate || 'N/A'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Search Results Display */}
                              {pdfViewerState.searchText && (
                                <div className="absolute top-4 left-4 bg-blue-100 border border-blue-300 rounded-lg px-4 py-2 text-sm z-10 max-w-xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <span>🔍</span>
                                      <span className="font-medium">Search: "{pdfViewerState.searchText}"</span>
                                    </div>
                                    <button
                                      onClick={clearSearch}
                                      className="text-blue-700 hover:text-blue-900 font-bold ml-2"
                                      title="Clear search"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  {pdfViewerState.searchResults.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      <div className="text-xs text-blue-600">
                                        Found {pdfViewerState.searchResults.reduce((sum, result) => sum + result.matches, 0)} results on {pdfViewerState.searchResults.length} pages
                                      </div>
                                      <div className="flex flex-wrap gap-1">
                                        {pdfViewerState.searchResults.slice(0, 5).map((result, index) => (
                                          <button
                                            key={index}
                                            onClick={() => {
                                              setPdfViewerState(prev => ({
                                                ...prev,
                                                currentPage: result.page
                                              }));
                                            }}
                                            className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded transition-colors"
                                          >
                                            Page {result.page} ({result.matches})
                                          </button>
                                        ))}
                                        {pdfViewerState.searchResults.length > 5 && (
                                          <span className="text-xs text-gray-500">
                                            +{pdfViewerState.searchResults.length - 5} more
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Zoom Indicator */}
                              <div className="absolute top-4 right-4 bg-blue-100 border border-blue-300 rounded px-3 py-1 text-sm font-medium z-10">
                                Zoom: {pdfViewerState.zoomLevel}%
                              </div>

                              {/* Annotation Mode Indicator */}
                              {pdfViewerState.isAnnotating && (
                                <div className="absolute top-4 left-4 bg-yellow-100 border border-yellow-300 rounded px-3 py-1 text-sm font-medium z-10">
                                  📝 Annotation Mode Active
                                </div>
                              )}

                              {/* Annotation Tools Panel */}
                              {annotationTools.isVisible && (
                                <div className="absolute top-16 left-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-20 max-w-xs">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-medium text-gray-800">Annotation Tools</h4>
                                    <button
                                      onClick={() => setAnnotationTools(prev => ({ ...prev, isVisible: false }))}
                                      className="text-gray-500 hover:text-gray-700"
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  {annotationTools.message ? (
                                    <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                      {annotationTools.message}
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      {/* Tool Selection */}
                                      <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Tool</label>
                                        <div className="flex space-x-2">
                                          {['highlight', 'pen', 'arrow', 'text', 'rectangle'].map((tool) => (
                                            <button
                                              key={tool}
                                              onClick={() => setAnnotationTools(prev => ({ ...prev, selectedTool: tool }))}
                                              className={`px-2 py-1 text-xs rounded ${annotationTools.selectedTool === tool
                                                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                              {tool === 'highlight' && '🖍️'}
                                              {tool === 'pen' && '✏️'}
                                              {tool === 'arrow' && '➡️'}
                                              {tool === 'text' && '📝'}
                                              {tool === 'rectangle' && '⬜'}
                                            </button>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Color Selection */}
                                      <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Color</label>
                                        <div className="flex space-x-2">
                                          {['#ffff00', '#ff0000', '#00ff00', '#0000ff', '#ff00ff'].map((color) => (
                                            <button
                                              key={color}
                                              onClick={() => setAnnotationTools(prev => ({ ...prev, color }))}
                                              className={`w-6 h-6 rounded border-2 ${annotationTools.color === color
                                                  ? 'border-gray-400'
                                                  : 'border-gray-200'
                                                }`}
                                              style={{ backgroundColor: color }}
                                            />
                                          ))}
                                        </div>
                                      </div>

                                      {/* Size Selection */}
                                      <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Size</label>
                                        <div className="flex space-x-2">
                                          {['small', 'medium', 'large'].map((size) => (
                                            <button
                                              key={size}
                                              onClick={() => setAnnotationTools(prev => ({ ...prev, size }))}
                                              className={`px-2 py-1 text-xs rounded ${annotationTools.size === size
                                                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                              {size}
                                            </button>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Instructions */}
                                      <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
                                        <strong>Instructions:</strong><br />
                                        • Click and drag to {annotationTools.selectedTool}<br />
                                        • Use different colors for organization<br />
                                        • Click outside to finish annotation
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* PDF Footer */}
                            <div className="bg-gray-100 px-4 py-2 border-t flex items-center justify-between text-sm text-gray-600">
                              <div className="flex items-center space-x-4">
                                <span>📄 PDF Document</span>
                                <span>📏 {previewModal.document.fileSize} bytes</span>
                                <span>📅 {previewModal.document.uploadDate}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleSearch}>
                                  🔍 Search
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleAnnotate}>
                                  📝 Annotate
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleFullscreen}>
                                  📱 Fullscreen
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {previewModal.document.fileType === 'docx' && (
                          <div className="bg-gray-50 p-4 rounded-lg text-left">
                            <h4 className="font-medium text-gray-800 mb-2">Word Document Preview</h4>
                            <p className="text-sm text-gray-600 mb-2">This would show the actual Word document content with editing capabilities.</p>
                            <p className="text-sm text-gray-600">Features: Text editing, Formatting, Comments, Track changes, Download</p>
                          </div>
                        )}

                        {previewModal.document.fileType === 'image' && (
                          <div className="bg-gray-50 p-4 rounded-lg text-left">
                            <h4 className="font-medium text-gray-800 mb-2">Image Preview</h4>
                            <p className="text-sm text-gray-600 mb-2">This would show the actual image with zoom and pan capabilities.</p>
                            <p className="text-sm text-gray-600">Features: Zoom in/out, Pan, Rotate, Download, Full screen</p>
                          </div>
                        )}

                        {previewModal.document.fileType === 'other' && (
                          <div className="bg-gray-50 p-4 rounded-lg text-left">
                            <h4 className="font-medium text-gray-800 mb-2">Document Preview</h4>
                            <p className="text-sm text-gray-600 mb-2">This document type requires a compatible viewer.</p>
                            <p className="text-sm text-gray-600">Features: Download, File info, Compatibility check</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText size={32} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Document Preview Not Available</h3>
                    <p className="text-gray-600 mb-4">The document "{previewModal.documentName}" exists but preview is not available.</p>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-blue-800 text-sm">
                        <strong>Document Name:</strong> {previewModal.documentName}
                      </p>
                      <p className="text-blue-700 text-sm mt-2">
                        This document is part of the VDCR record but the actual file may not be uploaded yet or the preview feature is not available for this file type.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={downloadPDF}
                  className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                >
                  <Download size={16} className="mr-2" />
                  Download Document
                </Button>
                <Button onClick={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}>
                  Close Preview
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Search Modal */}
          <Dialog open={searchModal.isOpen} onOpenChange={(open) => setSearchModal(prev => ({ ...prev, isOpen: open }))}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <span>🔍</span>
                  <span>Search in PDF</span>
                </DialogTitle>
                <DialogDescription>
                  Enter text to search in "{previewModal.documentName}"
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Input
                    placeholder="Enter search term..."
                    value={searchModal.searchText}
                    onChange={(e) => {
                      setSearchModal(prev => ({ ...prev, searchText: e.target.value }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearchSubmit();
                      }
                    }}
                    onFocus={(e) => {
                      e.target.select();
                    }}
                    className="w-full"
                    autoFocus
                    tabIndex={0}
                    style={{ zIndex: 1000 }}
                  />
                </div>

                {pdfViewerState.searchResults.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2 text-blue-800">
                      <span>✅</span>
                      <span className="font-medium">
                        Found {pdfViewerState.searchResults.reduce((sum, result) => sum + result.matches, 0)} results
                      </span>
                    </div>
                    <div className="text-sm text-blue-600 mt-1">
                      Results found on {pdfViewerState.searchResults.length} pages
                    </div>

                    {/* Clickable page results */}
                    <div className="mt-3 space-y-2 max-h-32 overflow-y-auto">
                      {pdfViewerState.searchResults.map((result, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-white rounded border cursor-pointer hover:bg-blue-50 transition-colors"
                          onClick={() => {
                            setPdfViewerState(prev => ({
                              ...prev,
                              currentPage: result.page
                            }));
                          }}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-blue-600 font-medium">Page {result.page}</span>
                            <span className="text-gray-500 text-sm">({result.matches} matches)</span>
                          </div>
                          <div className="text-xs text-gray-400 max-w-32 truncate">
                            {result.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pdfViewerState.searchText && pdfViewerState.searchResults.length === 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2 text-yellow-800">
                      <span>⚠️</span>
                      <span className="font-medium">No results found</span>
                    </div>
                    <div className="text-sm text-yellow-600 mt-1">
                      Try a different search term
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => setSearchModal(prev => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSearchSubmit}
                  disabled={!searchModal.searchText.trim() || searchModal.isSearching}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {searchModal.isSearching ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Searching...
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      <span className="ml-2">Search</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Text Input Modal for Annotations */}
          <Dialog open={textInputModal.isOpen} onOpenChange={(open) => setTextInputModal(prev => ({ ...prev, isOpen: open }))}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <span>📝</span>
                  <span>Add Text Annotation</span>
                </DialogTitle>
                <DialogDescription>
                  Enter text to add as annotation on the PDF
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="annotation-text">Annotation Text</Label>
                  <Textarea
                    id="annotation-text"
                    placeholder="Enter your annotation text here..."
                    value={textInputModal.text}
                    onChange={(e) => setTextInputModal(prev => ({ ...prev, text: e.target.value }))}
                    className="w-full min-h-[100px]"
                    autoFocus
                  />
                </div>

                <div className="flex items-center space-x-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Color</Label>
                    <div className="flex space-x-2 mt-1">
                      {['#ffff00', '#ff0000', '#00ff00', '#0000ff', '#ff00ff'].map((color) => (
                        <button
                          key={color}
                          onClick={() => setAnnotationTools(prev => ({ ...prev, color }))}
                          className={`w-6 h-6 rounded border-2 ${annotationTools.color === color
                              ? 'border-gray-400'
                              : 'border-gray-200'
                            }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Size</Label>
                    <div className="flex space-x-2 mt-1">
                      {['small', 'medium', 'large'].map((size) => (
                        <button
                          key={size}
                          onClick={() => setAnnotationTools(prev => ({ ...prev, size }))}
                          className={`px-2 py-1 text-xs rounded ${annotationTools.size === size
                              ? 'bg-blue-100 text-blue-700 border border-blue-300'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {textInputModal.text && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-sm text-blue-800 font-medium mb-1">Preview:</div>
                    <div
                      className="text-sm"
                      style={{
                        color: annotationTools.color,
                        fontSize: annotationTools.size === 'small' ? '12px' : annotationTools.size === 'medium' ? '16px' : '20px'
                      }}
                    >
                      {textInputModal.text}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => setTextInputModal(prev => ({ ...prev, isOpen: false, text: '' }))}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (textInputModal.text.trim()) {
                      // Create text annotation element with enhanced styling
                      const textElement = document.createElement('div');
                      textElement.className = 'absolute pointer-events-none z-40';
                      textElement.style.left = `${textInputModal.position.x}px`;
                      textElement.style.top = `${textInputModal.position.y}px`;
                      textElement.style.color = annotationTools.color;
                      textElement.style.fontSize = annotationTools.size === 'small' ? '12px' : annotationTools.size === 'medium' ? '16px' : '20px';
                      textElement.style.fontWeight = 'bold';
                      textElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                      textElement.style.padding = '4px 8px';
                      textElement.style.borderRadius = '6px';
                      textElement.style.border = `2px solid ${annotationTools.color}`;
                      textElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                      textElement.style.textShadow = '1px 1px 2px rgba(0,0,0,0.3)';
                      textElement.style.maxWidth = '200px';
                      textElement.style.wordWrap = 'break-word';
                      textElement.style.animation = 'textAnnotationFadeIn 0.3s ease-in-out';
                      textElement.textContent = textInputModal.text;

                      // Add CSS animation for text annotations
                      if (!document.getElementById('text-annotation-styles')) {
                        const style = document.createElement('style');
                        style.id = 'text-annotation-styles';
                        style.textContent = `
                          @keyframes textAnnotationFadeIn {
                            0% { 
                              transform: scale(0.8) translateY(-10px); 
                              opacity: 0; 
                            }
                            100% { 
                              transform: scale(1) translateY(0); 
                              opacity: 1; 
                            }
                          }
                        `;
                        document.head.appendChild(style);
                      }

                      // Add to PDF canvas container
                      const canvasContainer = document.querySelector('#pdf-canvas')?.parentElement;
                      if (canvasContainer) {
                        canvasContainer.appendChild(textElement);

                        // Show success feedback
                        const successFeedback = document.createElement('div');
                        successFeedback.className = 'absolute pointer-events-none z-50';
                        successFeedback.style.left = `${textInputModal.position.x + 10}px`;
                        successFeedback.style.top = `${textInputModal.position.y - 30}px`;
                        successFeedback.style.color = '#10b981';
                        successFeedback.style.fontSize = '14px';
                        successFeedback.style.fontWeight = 'bold';
                        successFeedback.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
                        successFeedback.style.animation = 'annotationPulse 0.5s ease-in-out';
                        successFeedback.textContent = '✅ Text Added';

                        canvasContainer.appendChild(successFeedback);

                        // Remove success feedback
                        setTimeout(() => {
                          successFeedback.remove();
                        }, 1500);
                      }

                      // Close modal
                      setTextInputModal(prev => ({ ...prev, isOpen: false, text: '' }));
                    }
                  }}
                  disabled={!textInputModal.text.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Add Annotation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-white to-gray-50/50">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-lg font-medium text-gray-600">Loading documentation records...</span>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-200">
              <VDCRSearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                resultCount={filteredVDCRData.length}
                totalCount={vdcrData.length}
              />
            </div>

            {/* VDCR Cycle Time Configuration */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="cycleTimeRev00" className="text-sm font-medium text-gray-700 whitespace-nowrap">Rev 00 cycle time (days):</Label>
                  <Input
                    id="cycleTimeRev00"
                    type="number"
                    min={1}
                    max={365}
                    placeholder="e.g. 21"
                    value={cycleTimeRev00}
                    onChange={(e) => {
                      setCycleTimeSaveSuccess(false);
                      setCycleTimeRev00(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0));
                    }}
                    className="w-20 h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="cycleTimeRev01Plus" className="text-sm font-medium text-gray-700 whitespace-nowrap">Rev 01 & further (days):</Label>
                  <Input
                    id="cycleTimeRev01Plus"
                    type="number"
                    min={1}
                    max={365}
                    placeholder="e.g. 10"
                    value={cycleTimeRev01Plus}
                    onChange={(e) => {
                      setCycleTimeSaveSuccess(false);
                      setCycleTimeRev01Plus(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0));
                    }}
                    className="w-20 h-8 text-sm"
                  />
                </div>
                {cycleTimeSaveSuccess ? (
                  <button
                    type="button"
                    onClick={() => setCycleTimeSaveSuccess(false)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="Edit cycle time"
                  >
                    <Pencil size={14} />
                  </button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveCycleTime}
                    disabled={isSavingCycleTime}
                    className="h-8 bg-white hover:bg-gray-50 border-gray-300 text-gray-700"
                  >
                    {isSavingCycleTime ? 'Saving...' : 'Save Cycle Time'}
                  </Button>
                )}
                <p className="text-xs text-gray-600 max-w-md">
                  Cycle time = days allowed for response after receipt/submission. Used to auto-calculate expected return &amp; next submission dates.
                </p>
              </div>
            </div>

            <div className="h-px bg-gray-200 mt-2" aria-hidden="true" />

          <div className="p-0 overflow-x-auto">
                {filteredVDCRData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4 px-6">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                          <FileText className="w-8 h-8 text-gray-400" />
                        </div>
                <div className="text-center">
                  <p className="text-lg font-medium text-gray-900">No Documentation Records Found</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {searchQuery.trim() 
                              ? `No records match your search "${searchQuery}"` 
                              : 'Start by adding a new VDCR record or uploading data from Excel'}
                          </p>
                        </div>
                        {!searchQuery.trim() && (
                          <Button
                            onClick={() => setIsAddingNew(true)}
                    variant="outline"
                    className="mt-4 border-gray-300"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add New Documentation Record
                          </Button>
                        )}
                      </div>
            ) : (
              <div className="divide-y divide-gray-100 min-w-[1200px]">
                {/* Table Header */}
                <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-4 px-6 py-3 bg-blue-600 border-b border-blue-700 text-xs font-medium text-white uppercase tracking-wider">
                  <div className="col-span-1">Sr. No</div>
                  <div className="col-span-3">Document Name</div>
                  <div className="col-span-1">Rev</div>
                  <div className="col-span-1">Code</div>
                  <div className="col-span-1">Status</div>
                  <div className="col-span-1">Department</div>
                  <div className="col-span-1 pl-12">Updated</div>
                  <div className="col-span-3 pl-20 text-left">Actions</div>
                  <div className="col-span-1 text-left">Options</div>
                </div>

                {/* Table Rows */}
                {filteredVDCRData.map((record) => {
                  const isExpanded = expandedCards.has(record.id);
                  const recordCycleTimeDraft = docCycleTimeDrafts[record.id] ?? {
                    rev00: record.cycleTimeOverrideRev00 != null ? String(record.cycleTimeOverrideRev00) : '',
                    rev01Plus: record.cycleTimeOverrideRev01Plus != null ? String(record.cycleTimeOverrideRev01Plus) : '',
                  };
                  const isSavingRecordCycleTime = savingDocCycleTimeIds.has(record.id);
                  const metrics = getCounterMetrics(record);
                  const toggleExpand = () => {
                    const newExpanded = new Set(expandedCards);
                    if (isExpanded) {
                      newExpanded.delete(record.id);
                    } else {
                      newExpanded.add(record.id);
                    }
                    setExpandedCards(newExpanded);
                  };

                  return (
                    <div key={record.id} className="bg-white hover:bg-gray-50/30 transition-colors">
                      {/* Main Row */}
                      <div 
                        className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-4 px-6 py-3 items-center border-b border-gray-100 cursor-pointer"
                        onClick={toggleExpand}
                      >
                        {/* Serial Number */}
                        <div className="col-span-1">
                          <span className="text-xs font-medium text-gray-500">#{record.srNo}</span>
                        </div>

                        {/* Document Name */}
                        <div className="col-span-3">
                          {record.documentUrl ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsSeen(`vdcr_${record.id}`);
                                openDocumentPreview(record.documentUrl!, record.documentName, record.id);
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-400 rounded text-sm font-medium text-gray-700 hover:text-gray-900 transition-all duration-150 group w-full text-left shadow-sm hover:shadow"
                            >
                              <FileText size={14} className="text-gray-500 flex-shrink-0" />
                              <span className="truncate flex-1">
                                {record.documentName}
                              </span>
                              <UnreadEntityDot entityKey={`vdcr_${record.id}`} updatedAt={record.updated_at} className="flex-shrink-0" />
                              <Eye size={12} className="text-gray-400 flex-shrink-0" />
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5 px-2 py-1">
                              <FileText size={14} className="text-gray-300 flex-shrink-0" />
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {record.documentName}
                              </span>
                              <UnreadEntityDot entityKey={`vdcr_${record.id}`} updatedAt={record.updated_at} className="flex-shrink-0" />
                            </div>
                          )}
                        </div>

                        {/* Revision */}
                        <div className="col-span-1">
                          <span className="text-xs font-mono text-gray-600">{record.revision}</span>
                        </div>

                        {/* Code Status */}
                        <div className="col-span-1">
                          <span className={`text-xs font-medium ${
                            record.codeStatus === 'Code 1' ? 'text-blue-600' :
                            record.codeStatus === 'Code 2' ? 'text-green-600' :
                            record.codeStatus === 'Code 3' ? 'text-yellow-600' :
                            record.codeStatus === 'Code 4' ? 'text-blue-600' :
                            'text-gray-600'
                          }`}>
                        {record.codeStatus}
                        </span>
                      </div>

                        {/* Status */}
                        <div className="col-span-1">
                          <span className={`text-xs font-medium ${
                            record.status === 'approved' ? 'text-green-700' :
                            record.status === 'sent-for-approval' ? 'text-yellow-700' :
                            record.status === 'received-for-comment' ? 'text-orange-700' :
                            record.status === 'rejected' ? 'text-red-700' :
                            'text-gray-600'
                          }`}>
                            {getStatusText(record.status)}
                                </span>
                              </div>

                        {/* Department */}
                        <div className="col-span-1">
                          <span className="text-xs font-medium text-gray-700">
                            {record.department || '—'}
                          </span>
                        </div>

                        {/* Updated */}
                        <div className="col-span-1 pl-12">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 whitespace-nowrap">{record.lastUpdate}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="col-span-3 flex flex-col items-start gap-1 pl-20">
                          <div className="flex items-center gap-1">
                          {currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (() => {
                            const buttonState = recordButtonStates.get(record.id) || { submittedEnabled: true, receivedEnabled: false };
                            return (
                              <>
                                {buttonState.submittedEnabled && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const today = new Date().toISOString().split('T')[0];
                                      const effectiveRevNum = getEffectiveRevNumForSubmitted(record.revision, record.revisionEvents);
                                      const cycleTime = getCycleTimeForRecordRevision(record, effectiveRevNum);
                                      const autoReturn = cycleTime != null ? addDaysToDate(today, cycleTime) : '';
                                      setRevisionEventModal({
                                        isOpen: true,
                                        eventType: 'submitted',
                                        eventDate: today,
                                        estimatedReturnDate: autoReturn,
                                        targetSubmissionDate: '',
                                        notes: '',
                                        documentFile: null,
                                        documentUrl: null,
                                        isUploadingDocument: false,
                                        uploadAbortController: null,
                                        hasNotableChange: false,
                                        notableChangeTitle: ''
                                      });
                                      setEditingVDCR(record);
                                      setFormData({
                                        srNo: record.srNo,
                                        revision: record.revision,
                                        documentName: record.documentName,
                                        clientDocNo: record.clientDocNo,
                                        internalDocNo: record.internalDocNo,
                                        codeStatus: record.codeStatus,
                                        status: record.status,
                                        remarks: record.remarks || ''
                                      });
                                    }}
                                    className="px-2 py-1 text-xs font-medium text-blue-600 bg-white border border-blue-300 rounded hover:bg-blue-50 transition-colors flex items-center gap-1"
                                    title="Mark as Submitted"
                                  >
                                    <Send size={11} />
                                    <span>Submitted</span>
                                  </button>
                                )}
                                {buttonState.receivedEnabled && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const today = new Date().toISOString().split('T')[0];
                                      const revMatch = record.revision.match(/Rev-?(\d+)/i) || record.revision.match(/(\d+)/);
                                      const revNum = revMatch ? parseInt(revMatch[1], 10) : 0;
                                      const cycleTime = getCycleTimeForRecordRevision(record, revNum + 1);
                                      const autoTarget = cycleTime != null ? addDaysToDate(today, cycleTime) : '';
                                      setRevisionEventModal({
                                        isOpen: true,
                                        eventType: 'received',
                                        eventDate: today,
                                        estimatedReturnDate: '',
                                        targetSubmissionDate: autoTarget,
                                        notes: '',
                                        documentFile: null,
                                        documentUrl: null,
                                        isUploadingDocument: false,
                                        uploadAbortController: null,
                                        hasNotableChange: false,
                                        notableChangeTitle: ''
                                      });
                                      setEditingVDCR(record);
                                      setFormData({
                                        srNo: record.srNo,
                                        revision: record.revision,
                                        documentName: record.documentName,
                                        clientDocNo: record.clientDocNo,
                                        internalDocNo: record.internalDocNo,
                                        codeStatus: record.codeStatus,
                                        status: record.status,
                                        remarks: record.remarks || ''
                                      });
                                    }}
                                    className="px-2 py-1 text-xs font-medium text-green-600 bg-white border border-green-300 rounded hover:bg-green-50 transition-colors flex items-center gap-1"
                                    title="Mark as Received"
                                  >
                                    <Download size={11} />
                                    <span>Commented</span>
                                  </button>
                                )}
                              </>
                            );
                          })()}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRevisionHistoryModal({
                                isOpen: true,
                                vdcrRecordId: record.id,
                                documentName: record.documentName
                              });
                            }}
                            className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 hover:border-gray-400 transition-colors flex items-center gap-1"
                          >
                            <History size={11} />
                            <span>History</span>
                          </button>
                          </div>
                        </div>

                        {/* Options Column - Edit, Delete, Expand */}
                        <div className="col-span-1 flex items-center gap-1">
                          {currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsSeen(`vdcr_${record.id}`);
                                  handleEditVDCR(record);
                                }}
                                className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                                title="Edit"
                              >
                                <Edit size={14} className="text-gray-500" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteVDCR(record.id);
                                }}
                                className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                                title="Delete"
                              >
                                <X size={14} className="text-gray-500" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand();
                            }}
                            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                            title={isExpanded ? "Collapse" : "Expand"}
                          >
                            {isExpanded ? (
                              <ChevronUp size={14} className="text-gray-500" />
                            ) : (
                              <ChevronDown size={14} className="text-gray-500" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Details Row */}
                      {isExpanded && (
                        <div className="bg-gray-50/30 border-b border-gray-100 px-6 py-5">
                          {/* Top Section: Equipment & Document Details */}
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            {/* Equipment Details */}
                            <div className="bg-white rounded border border-gray-200 p-3">
                              <div className="flex items-center gap-1.5 mb-2.5 pb-2 border-b border-gray-100">
                                <Tag size={12} className="text-gray-400" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Equipment Details</span>
                              </div>
                              <div className="space-y-2">
                                {(() => {
                                  // Check if all equipment are selected
                                  const allEquipmentTagNos = equipmentData.map(eq => eq.tagNo);
                                  const isAllSelected = record.equipmentTagNo.length > 0 && 
                                    allEquipmentTagNos.length > 0 &&
                                    record.equipmentTagNo.length === allEquipmentTagNos.length &&
                                    allEquipmentTagNos.every(tag => record.equipmentTagNo.includes(tag));
                                  
                                  if (isAllSelected) {
                                    return (
                                      <>
                                        <div>
                                          <span className="text-xs text-gray-500 font-medium block mb-0.5">Equipment</span>
                                          <span className="text-xs text-gray-900 font-medium">All Equipments</span>
                                        </div>
                                      </>
                                    );
                                  } else {
                                    return (
                                      <>
                                {record.equipmentTagNo.length > 0 && (
                                  <div>
                                    <span className="text-xs text-gray-500 font-medium block mb-0.5">Equipment Tags</span>
                                    <span className="text-xs text-gray-900 font-mono">
                                      {record.equipmentTagNo.join(', ')}
                            </span>
                          </div>
                                )}
                                {record.jobNo.length > 0 && (
                                  <div>
                                    <span className="text-xs text-gray-500 font-medium block mb-0.5">Job No</span>
                                    <span className="text-xs text-gray-900 font-mono">
                                      {record.jobNo.join(', ')}
                          </span>
                        </div>
                                )}
                                      </>
                                    );
                                  }
                                })()}
                      </div>
                            </div>

                            {/* Document Numbers */}
                            <div className="bg-white rounded border border-gray-200 p-3">
                              <div className="flex items-center gap-1.5 mb-2.5 pb-2 border-b border-gray-100">
                                <FileText size={12} className="text-gray-400" />
                                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Doc Numbers</span>
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <span className="text-xs text-gray-500 font-medium block mb-0.5">Client</span>
                                  <span className="text-xs text-gray-900 font-mono">{record.clientDocNo}</span>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-500 font-medium block mb-0.5">Internal</span>
                                  <span className="text-xs text-gray-900 font-mono">{record.internalDocNo}</span>
                                </div>
                                <div className="pt-1">
                                  <span className="text-xs text-gray-500 font-medium block mb-1">Cycle Time Override (days)</span>
                                  <div className="grid grid-cols-[auto_auto] gap-2 items-center">
                                    <span className="text-[11px] text-gray-600">Rev 00</span>
                                    <Input
                                      type="number"
                                      min={1}
                                      max={365}
                                      placeholder="Use common"
                                      value={recordCycleTimeDraft.rev00}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const nextValue = e.target.value;
                                        setDocCycleTimeDrafts((prev) => ({
                                          ...prev,
                                          [record.id]: {
                                            rev00: nextValue,
                                            rev01Plus: prev[record.id]?.rev01Plus ?? (record.cycleTimeOverrideRev01Plus != null ? String(record.cycleTimeOverrideRev01Plus) : ''),
                                          }
                                        }));
                                      }}
                                      className="h-7 w-24 text-xs"
                                      disabled={currentUserRole === 'editor' || currentUserRole === 'viewer' || isSavingRecordCycleTime}
                                    />
                                    <span className="text-[11px] text-gray-600">Rev 01 &amp; further</span>
                                    <Input
                                      type="number"
                                      min={1}
                                      max={365}
                                      placeholder="Use common"
                                      value={recordCycleTimeDraft.rev01Plus}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const nextValue = e.target.value;
                                        setDocCycleTimeDrafts((prev) => ({
                                          ...prev,
                                          [record.id]: {
                                            rev00: prev[record.id]?.rev00 ?? (record.cycleTimeOverrideRev00 != null ? String(record.cycleTimeOverrideRev00) : ''),
                                            rev01Plus: nextValue,
                                          }
                                        }));
                                      }}
                                      className="h-7 w-24 text-xs"
                                      disabled={currentUserRole === 'editor' || currentUserRole === 'viewer' || isSavingRecordCycleTime}
                                    />
                                  </div>
                                  <div className="mt-2">
                                    {currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          saveRecordCycleTimeOverride(record);
                                        }}
                                        disabled={isSavingRecordCycleTime}
                                      >
                                        {isSavingRecordCycleTime ? 'Saving...' : 'Save'}
                                      </Button>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-500 mt-1">Leave empty to use project common cycle time.</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Bottom Section: Remarks & Timeline */}
                          <div className="grid grid-cols-2 gap-4">
                            {record.remarks && (
                              <div className="bg-white rounded border border-gray-200 p-3">
                                <div className="flex items-center gap-1.5 mb-2.5 pb-2 border-b border-gray-100">
                                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Remarks</span>
                                </div>
                                <p className="text-xs text-gray-700 leading-relaxed">{record.remarks}</p>
                              </div>
                            )}
                            <div className="bg-white rounded border border-gray-200 p-3">
                              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                                <div className="flex items-center gap-1.5">
                                  <FileText size={12} className="text-gray-400" />
                                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Document History</span>
                              </div>
                                {(() => {
                                  const docStartDate = (record as any).projectDocumentationStartDate || projectData?.sales_order_date;
                                  const formattedStartDate = docStartDate 
                                    ? new Date(docStartDate).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                      })
                                    : null;
                                  
                                  return formattedStartDate ? (
                                    <div className="flex items-center gap-1.5 text-xs">
                                      <Calendar size={11} className="text-gray-400" />
                                      <span className="text-gray-500">Start:</span>
                                      <span className="text-gray-700 font-medium">{formattedStartDate}</span>
                                  </div>
                                  ) : null;
                                })()}
                                  </div>
                              {record.revisionEvents && record.revisionEvents.length > 0 ? (
                                (() => {
                                  const stats = calculateTotalStats(record);
                                  return (
                                    <div className="grid grid-cols-4 gap-3">
                                      <div className="text-center">
                                        <div className="text-lg font-semibold text-gray-800">{stats.totalDaysWithUs}</div>
                                        <div className="text-xs text-gray-600 mt-0.5">Days with Us</div>
                              </div>
                                      <div className="text-center">
                                        <div className="text-lg font-semibold text-gray-800">{stats.totalDaysWithClient}</div>
                                        <div className="text-xs text-gray-600 mt-0.5">Days with Client</div>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-lg font-semibold text-gray-800">{stats.totalDays}</div>
                                        <div className="text-xs text-gray-600 mt-0.5">Total Days</div>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-lg font-semibold text-gray-800">{stats.totalSubmissions}</div>
                                        <div className="text-xs text-gray-600 mt-0.5">Submissions</div>
                                      </div>
                                    </div>
                                  );
                                })()
                              ) : (
                                <span className="text-xs text-gray-400">No revision events recorded</span>
                              )}
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-200">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center">
                                <span className="text-gray-600 text-xs font-medium">
                                  {record.updatedBy ? record.updatedBy.split(' ').map(n => n[0]).join('') : 'U'}
                                </span>
                              </div>
                              <span className="text-xs text-gray-600">{record.updatedBy || 'Unknown'}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRevisionHistoryModal({
                                  isOpen: true,
                                  vdcrRecordId: record.id,
                                  documentName: record.documentName
                                });
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center gap-2 shadow-sm hover:shadow"
                            >
                              <History size={14} />
                              <span>View Full History</span>
                            </button>
                          </div>
                          </div>
)}
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </>
        )}
      </Card>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 md:gap-8">
          <div className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <div className="w-3 h-3 bg-blue-500 rounded-sm flex-shrink-0"></div>
            <span className="text-xs sm:text-sm text-gray-600">Code 1</span>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <div className="w-3 h-3 bg-green-500 rounded-sm flex-shrink-0"></div>
            <span className="text-xs sm:text-sm text-gray-600">Code 2</span>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <div className="w-3 h-3 bg-yellow-500 rounded-sm flex-shrink-0"></div>
            <span className="text-xs sm:text-sm text-gray-600">Code 3</span>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <div className="w-3 h-3 bg-blue-500 rounded-sm flex-shrink-0"></div>
            <span className="text-xs sm:text-sm text-gray-600">Code 4</span>
          </div>
        </div>
      </div>

      {/* Revision History Modal - preloaded props avoid 7 requests when opening */}
      {revisionHistoryModal.vdcrRecordId && (() => {
        const record = vdcrData.find(r => r.id === revisionHistoryModal.vdcrRecordId);
        return (
          <VDCRRevisionHistory
            vdcrRecordId={revisionHistoryModal.vdcrRecordId}
            documentName={revisionHistoryModal.documentName}
            currentRevision={record?.revision}
            documentUrl={record?.documentUrl}
            projectId={projectId}
            projectDocumentationStartDate={(record as any)?.projectDocumentationStartDate}
            targetedFinishDate={(record as any)?.targetedFinishDate}
            isOpen={revisionHistoryModal.isOpen}
            onClose={() => setRevisionHistoryModal({ isOpen: false, vdcrRecordId: null, documentName: '' })}
            onDocumentClick={openDocumentPreview}
            preloadedRevisionEvents={record?.revisionEvents ?? undefined}
            preloadedProjectData={projectData ? { sales_order_date: projectData.sales_order_date, vdcr_cycle_time_rev_00: projectData.vdcr_cycle_time_rev_00 } : undefined}
          />
        );
      })()}

      {/* Revision Event Modal */}
      <Dialog open={revisionEventModal.isOpen} onOpenChange={(open) => {
        if (!open) {
          setRevisionEventModal({
            isOpen: false,
            eventType: null,
            eventDate: new Date().toISOString().split('T')[0],
            estimatedReturnDate: '',
            targetSubmissionDate: '',
            notes: '',
            documentFile: null,
            documentUrl: null,
            isUploadingDocument: false,
            uploadAbortController: null,
            hasNotableChange: false,
            notableChangeTitle: ''
          });
        }
      }}>
        <DialogContent className="max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden p-4 sm:p-6">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {revisionEventModal.eventType === 'submitted' ? 'Submitted' : 'Commented'}
            </DialogTitle>
            <DialogDescription>
              Track this revision event to calculate turnaround times
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 -mx-1 px-1">
          <div className="space-y-4">
            <div>
              <Label>Revision Number</Label>
              <Input value={formData.revision} disabled className="mt-1" />
            </div>

            {/* Event Date - Date of Sending (submitted) or Date of Receipt (commented) */}
            <div>
              <Label htmlFor="eventDate">
                {revisionEventModal.eventType === 'submitted' ? 'Date of Sending' : 'Date of Receipt'}
              </Label>
              <Input
                id="eventDate"
                type="date"
                value={revisionEventModal.eventDate}
                onChange={(e) => {
                  const newEventDate = e.target.value;
                  const effectiveRevNum = revisionEventModal.eventType === 'submitted'
                    ? getEffectiveRevNumForSubmitted(formData.revision, editingVDCR?.revisionEvents)
                    : (() => { const m = formData.revision.match(/Rev-?(\d+)/i) || formData.revision.match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; })() + 1; // For received: next submission = next rev
                  const cycleTime = getCycleTimeForRecordRevision(editingVDCR, effectiveRevNum);
                  const autoDate = cycleTime != null && newEventDate ? addDaysToDate(newEventDate, cycleTime) : '';
                  setRevisionEventModal(prev => ({
                    ...prev,
                    eventDate: newEventDate,
                    ...(revisionEventModal.eventType === 'submitted'
                      ? { estimatedReturnDate: autoDate || prev.estimatedReturnDate }
                      : { targetSubmissionDate: autoDate || prev.targetSubmissionDate })
                  }));
                }}
                className="mt-1 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:invert-0 [&::-webkit-calendar-picker-indicator]:brightness-0"
                style={{
                  colorScheme: 'light'
                }}
                max={new Date().toISOString().split('T')[0]} // Don't allow future dates
              />
              <p className="text-xs text-gray-500 mt-1">
                {revisionEventModal.eventType === 'submitted' 
                  ? 'Date when the document was sent to the client' 
                  : 'Date when the document was received from the client'}
              </p>
            </div>

            {/* Estimated Return Date - Only show for 'submitted' events */}
            {revisionEventModal.eventType === 'submitted' && (
              <div>
                <Label htmlFor="estimatedReturnDate">Expected Return Date (auto from cycle time if set)</Label>
                <Input
                  id="estimatedReturnDate"
                  type="date"
                  value={revisionEventModal.estimatedReturnDate}
                  onChange={(e) => setRevisionEventModal(prev => ({ ...prev, estimatedReturnDate: e.target.value }))}
                  className="mt-1 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:invert-0 [&::-webkit-calendar-picker-indicator]:brightness-0"
                  style={{
                    colorScheme: 'light'
                  }}
                  min={revisionEventModal.eventDate} // Can't be before event date
                />
                <p className="text-xs text-gray-500 mt-1">
                  Expected date when the document will be returned from the client
                </p>
              </div>
            )}

            {/* Target Submission Date - Only show for 'received/commented' events */}
            {revisionEventModal.eventType === 'received' && (
              <div>
                <Label htmlFor="targetSubmissionDate">Target Date for Next Submission (auto from cycle time if set)</Label>
                <Input
                  id="targetSubmissionDate"
                  type="date"
                  value={revisionEventModal.targetSubmissionDate}
                  onChange={(e) => setRevisionEventModal(prev => ({ ...prev, targetSubmissionDate: e.target.value }))}
                  className="mt-1 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:invert-0 [&::-webkit-calendar-picker-indicator]:brightness-0"
                  style={{
                    colorScheme: 'light'
                  }}
                  min={revisionEventModal.eventDate} // Can't be before event date
                />
                <p className="text-xs text-gray-500 mt-1">
                  Target date when the next revision should be submitted to the client
                </p>
              </div>
            )}
            
            {/* Document Upload Section */}
            <div>
              <Label htmlFor="revisionEventDocument">Document File (Optional)</Label>
              <div className="mt-2">
                <Input
                  id="revisionEventDocument"
                  type="file"
                  accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.gif"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    // Create abort controller for cancellation
                    const abortController = new AbortController();
                    setRevisionEventModal(prev => ({ 
                      ...prev, 
                      documentFile: file, 
                      isUploadingDocument: true,
                      uploadAbortController: abortController
                    }));
                    
                    try {
                      // Upload document - handle both small and large files
                      const maxFileSize = 50 * 1024 * 1024; // 50MB max
                      const edgeFunctionMaxSize = 5 * 1024 * 1024; // 5MB (edge function limit)
                      
                      if (file.size > maxFileSize) {
                        toast({ 
                          title: 'Error', 
                          description: `File size exceeds 50MB limit. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB. Please choose a smaller file.`, 
                          variant: 'destructive' 
                        });
                        setRevisionEventModal(prev => ({ 
                          ...prev, 
                          documentFile: null, 
                          isUploadingDocument: false,
                          uploadAbortController: null
                        }));
                        return;
                      }

                      const fileExtension = file.name.split('.').pop();
                      const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
                      const filePath = `vdcr-revision-events/${editingVDCR?.id || 'temp'}/${uniqueFileName}`;

                      let publicUrl: string;

                      // Check if upload was aborted before starting
                      if (abortController.signal.aborted) {
                        throw new Error('Upload was cancelled.');
                      }

                      // Use edge function for files <= 5MB (more reliable, no timeout issues)
                      if (file.size <= edgeFunctionMaxSize) {
                        try {
                          const { uploadFileViaEdgeFunction } = await import('@/lib/edgeFunctions');
                          publicUrl = await uploadFileViaEdgeFunction({
                            bucket: 'VDCR-docs',
                            filePath: filePath,
                            file: file
                          });
                        } catch (edgeError: any) {
                          console.warn('Edge function upload failed, trying direct upload:', edgeError);
                          // Fall through to direct upload below
                          throw edgeError;
                        }
                      } else {
                        // For files > 5MB, use direct Supabase storage upload
                        // NO timeout race condition - let it take as long as needed (like main upload)
                        console.log(`Uploading ${(file.size / 1024 / 1024).toFixed(2)}MB file via direct storage...`);
                        
                        const result = await supabase.storage
                          .from('VDCR-docs')
                          .upload(filePath, file, {
                            cacheControl: '3600',
                            upsert: false
                          });

                        if (result.error) {
                          throw result.error;
                        }

                        // Get public URL
                        const { data: urlData } = supabase.storage
                          .from('VDCR-docs')
                          .getPublicUrl(filePath);
                        publicUrl = urlData.publicUrl;
                      }

                      // Check if upload was aborted after completion
                      if (abortController.signal.aborted) {
                        throw new Error('Upload was cancelled.');
                      }

                      setRevisionEventModal(prev => ({ 
                        ...prev, 
                        documentUrl: publicUrl, 
                        isUploadingDocument: false,
                        uploadAbortController: null
                      }));
                      
                      toast({ 
                        title: 'Success', 
                        description: 'Document uploaded successfully' 
                      });
                    } catch (error: any) {
                      // Don't show error if upload was intentionally cancelled
                      if (error?.message?.includes('cancelled') || error?.message?.includes('aborted')) {
                        setRevisionEventModal(prev => ({ 
                          ...prev, 
                          documentFile: null, 
                          documentUrl: null, 
                          isUploadingDocument: false,
                          uploadAbortController: null
                        }));
                        return;
                      }
                      
                      console.error('Error uploading document:', error);
                      
                      const errorMessage = error?.message || 'Failed to upload document. Please try again.';
                      
                      toast({ 
                        title: 'Upload Failed', 
                        description: errorMessage, 
                        variant: 'destructive',
                        duration: 5000
                      });
                      
                      setRevisionEventModal(prev => ({ 
                        ...prev, 
                        documentFile: null, 
                        documentUrl: null, 
                        isUploadingDocument: false,
                        uploadAbortController: null
                      }));
                      
                      // Reset file input
                      const fileInput = document.getElementById('revisionEventDocument') as HTMLInputElement;
                      if (fileInput) {
                        fileInput.value = '';
                      }
                    }
                  }}
                  disabled={revisionEventModal.isUploadingDocument}
                  className="cursor-pointer"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload the document file for this revision event (max 2MB)
                </p>
                {revisionEventModal.isUploadingDocument && (
                  <div className="flex flex-col items-start space-y-2 text-blue-600 mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="text-sm font-medium">Uploading document...</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (revisionEventModal.uploadAbortController) {
                            revisionEventModal.uploadAbortController.abort();
                          }
                          setRevisionEventModal(prev => ({ 
                            ...prev, 
                            documentFile: null, 
                            documentUrl: null, 
                            isUploadingDocument: false,
                            uploadAbortController: null
                          }));
                          const fileInput = document.getElementById('revisionEventDocument') as HTMLInputElement;
                          if (fileInput) {
                            fileInput.value = '';
                          }
                          toast({ 
                            title: 'Upload Cancelled', 
                            description: 'Document upload was cancelled.' 
                          });
                        }}
                        className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="text-xs text-blue-500 ml-6">
                      This may take a few moments. Please don't close this window.
                    </p>
                  </div>
                )}
                {revisionEventModal.documentFile && revisionEventModal.documentUrl && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                    ✓ {revisionEventModal.documentFile.name} uploaded
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="eventNotes">Notes (Optional)</Label>
              <Textarea
                id="eventNotes"
                value={revisionEventModal.notes}
                onChange={(e) => setRevisionEventModal(prev => ({ ...prev, notes: e.target.value }))}
                className="mt-1"
                rows={3}
                placeholder="Add any notes about this event..."
              />
            </div>

            {/* Notable change (e.g. change order, scope change) - grey box */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="hasNotableChange"
                  checked={revisionEventModal.hasNotableChange}
                  onCheckedChange={(checked) => setRevisionEventModal(prev => ({
                    ...prev,
                    hasNotableChange: !!checked,
                    ...(checked ? {} : { notableChangeTitle: '' })
                  }))}
                  className="mt-0.5"
                />
                <Label htmlFor="hasNotableChange" className="text-sm font-normal text-gray-700 cursor-pointer leading-snug">
                  Does this revision include something notable? (e.g. change order or other notable change in scope of work)
                </Label>
              </div>
              {revisionEventModal.hasNotableChange && (
                <div className="pl-6">
                  <Label htmlFor="notableChangeTitle" className="text-sm text-gray-700">Title for this notable change (required)</Label>
                  <Input
                    id="notableChangeTitle"
                    value={revisionEventModal.notableChangeTitle}
                    onChange={(e) => setRevisionEventModal(prev => ({ ...prev, notableChangeTitle: e.target.value }))}
                    className="mt-1 bg-white border-gray-300"
                    placeholder="e.g. Change order #5, Scope increase"
                  />
                </div>
              )}
            </div>
          </div>
          </div>
          <DialogFooter className="flex-shrink-0 border-t border-gray-200 pt-4 mt-4">
            <Button
              variant="outline"
              onClick={() => setRevisionEventModal({
                isOpen: false,
                eventType: null,
                eventDate: new Date().toISOString().split('T')[0],
                estimatedReturnDate: '',
                targetSubmissionDate: '',
                notes: '',
                documentFile: null,
                documentUrl: null,
                isUploadingDocument: false,
                uploadAbortController: null,
                hasNotableChange: false,
                notableChangeTitle: ''
              })}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateRevisionEvent}>
              {revisionEventModal.eventType === 'submitted' ? 'Submitted' : 'Commented'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
};

export default ProjectsVDCR; 