import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Building,
  FileText,
  MapPin,
  Calendar,
  Users,
  Target,
  BarChart3,
  FileSpreadsheet,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Settings,
  PieChart,
  Activity,
  Eye,
  Pencil,
  Save,
  X,
  Trash2
} from "lucide-react";
import { designSystem } from "@/lib/design-system";
import { useToast } from "@/hooks/use-toast";
import { deleteProjectDocument } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  equipmentCount: number;
  progress: number;
  status: 'active' | 'delayed' | 'on-track' | 'completed';
  manager: string;
  deadline: string;
  poNumber: string;
  salesOrderDate?: string;
  clientIndustry?: string;
  consultant?: string;
  tpiAgency?: string;
  clientFocalPoint?: string;
  vdcrManager?: string;
  equipmentBreakdown: {
    heatExchanger?: number;
    pressureVessel?: number;
    storageTank?: number;
    reactor?: number;
    other?: number;
  };
  servicesIncluded?: string[];
  scopeOfWork?: string;
  unpricedPOFile?: { name: string; uploaded: boolean; type: string } | null;
  designInputsPID?: { name: string; uploaded: boolean; type: string } | null;
  clientReferenceDoc?: { name: string; uploaded: boolean; type: string } | null;
  otherDocuments?: { name: string; uploaded: boolean; type: string }[] | null;
  kickoffMeetingNotes?: string;
  specialProductionNotes?: string;
  documents?: Array<{
    id?: string;
    name: string;
    type: string;
    description?: string;
    fileUrl?: string;
    uploadedAt?: string;
  }>;
  // Additional document properties
  unpricedPODocuments?: Array<{ file_url: string; name: string; type: string }>;
  designInputsDocuments?: Array<{ file_url: string; name: string; type: string }>;
  clientReferenceDocuments?: Array<{ file_url: string; name: string; type: string }>;
  otherDocumentsLinks?: Array<{ file_url: string; name: string; type: string }>;
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
  lastUpdate: string;
  remarks?: string;
  updatedBy?: string;
  documentFile?: any;
  documentUrl?: string;
}

type ProjectDocumentType = 'unpriced_po_documents' | 'design_inputs_documents' | 'client_reference_documents' | 'other_documents';

interface ProjectDetailsProps {
  project: Project;
  onBack: () => void;
  onViewEquipment: () => void;
  onViewVDCR: () => void;
  vdcrData?: VDCRRecord[]; // Add VDCR data prop
  onEditProject?: (projectId: string) => void;
  onDeleteProject?: (projectId: string) => void;
  onCompleteProject?: (projectId: string) => void;
  onDocumentDeleted?: (projectId: string, documentId: string, documentType: ProjectDocumentType) => void;
}

const ProjectDetails = ({ project, onBack, onViewEquipment, onViewVDCR, vdcrData = [], onEditProject, onDeleteProject, onCompleteProject, onDocumentDeleted }: ProjectDetailsProps) => {
  const [activeTab, setActiveTab] = useState("team-details");
  const { toast } = useToast();
  const currentUserRole = localStorage.getItem('userRole') || '';

  // Safety check: if project is undefined, navigate back
  if (!project) {
    // // console.log('⚠️ Project data is undefined, navigating back...');
    onBack();
    return null;
  }

  const formatDateToDDMMYYYY = (dateStr: string | undefined): string => {
    if (!dateStr || dateStr === 'Not specified') return 'Not specified';
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  // Debug: Log project data
  // // console.log('🔍 ProjectDetails received project:', project);
  // // console.log('📊 Project ID:', project?.id);
  // // console.log('📊 Project Name:', project?.name);
  // // console.log('📊 Project Client:', project?.client);
  // // console.log('📊 Project Location:', project?.location);
  // // console.log('📊 Project Manager:', project?.manager);
  // // console.log('📊 Project Status:', project?.status);
  // // console.log('🔧 Equipment Breakdown:', project?.equipmentBreakdown);
  const [documentPreview, setDocumentPreview] = useState<{ url: string; name: string; type: string; description: string } | null>(null);
  const [selectedVDCR, setSelectedVDCR] = useState<string | null>(null);
  const [selectedVDCRStatus, setSelectedVDCRStatus] = useState<'approved' | 'sent-for-approval' | 'received-for-comment' | 'rejected'>('approved');
  const [showEditForm, setShowEditForm] = useState(false);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editData, setEditData] = useState({
    name: project?.name || '',
        client: project?.client || '',
        location: project?.location || '',
        equipmentCount: project?.equipmentCount || 0,
        status: project?.status || 'active',
    manager: project?.manager || '',
    deadline: project?.deadline || '',
    poNumber: project?.poNumber || '',
    salesOrderDate: project?.salesOrderDate || '',
    clientIndustry: project?.clientIndustry || '',
    consultant: project?.consultant || '',
    tpiAgency: project?.tpiAgency || '',
    clientFocalPoint: project?.clientFocalPoint || '',
    vdcrManager: project?.vdcrManager || '',
    scopeOfWork: project?.scopeOfWork || '',
    servicesIncluded: project?.servicesIncluded || [],
    equipmentBreakdown: project?.equipmentBreakdown || {},
    kickoffMeetingNotes: project?.kickoffMeetingNotes || '',
    specialProductionNotes: project?.specialProductionNotes || ''
  });

  // Sync editData with project prop when project updates (only when NOT in edit mode)
  // This ensures that when the project is saved and updated, editData reflects the latest values
  // Use project.id and specific fields to detect changes
  useEffect(() => {
    if (!isEditMode && project) {
      setEditData(prev => {
        // Only update if values actually changed to avoid unnecessary re-renders
        const newData = {
          name: project.name || '',
          client: project.client || '',
          location: project.location || '',
          equipmentCount: project.equipmentCount || 0,
          status: project.status || 'active',
          manager: project.manager || '',
          deadline: project.deadline || '',
          poNumber: project.poNumber || '',
          salesOrderDate: project.salesOrderDate || '',
          clientIndustry: project.clientIndustry || '',
          consultant: project.consultant || '',
          tpiAgency: project.tpiAgency || '',
          clientFocalPoint: project.clientFocalPoint || '',
          vdcrManager: project.vdcrManager || '',
          scopeOfWork: project.scopeOfWork || '',
          servicesIncluded: project.servicesIncluded || [],
          equipmentBreakdown: project.equipmentBreakdown || {},
          kickoffMeetingNotes: project.kickoffMeetingNotes || '',
          specialProductionNotes: project.specialProductionNotes || ''
        };
        
        // Check if values actually changed
        const hasChanges = 
          prev.clientIndustry !== newData.clientIndustry ||
          prev.consultant !== newData.consultant ||
          prev.tpiAgency !== newData.tpiAgency ||
          prev.vdcrManager !== newData.vdcrManager ||
          prev.name !== newData.name ||
          prev.client !== newData.client ||
          prev.location !== newData.location;
        
        return hasChanges ? newData : prev;
      });
    }
  }, [project?.id, project?.clientIndustry, project?.consultant, project?.tpiAgency, project?.vdcrManager, project?.name, project?.client, project?.location, isEditMode]); // Watch specific fields that might change

  // Document management state
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [newDocument, setNewDocument] = useState({
    type: 'unpricedPOFile',
    name: '',
    description: ''
  });





  const handleDocumentClick = (documentUrl: string, documentName: string, type: string, description: string) => {
    setDocumentPreview({
      url: documentUrl,
      name: documentName,
      type: type,
      description: description
    });
  };

  // Helper function to normalize documents (handles both {document_name, file_url} from tables and {name, url} from JSONB)
  const normalizeDocument = (doc: any) => {
    return {
      ...doc,
      name: doc.document_name || doc.name || 'Document',
      url: doc.file_url || doc.url || doc.document_url || ''
    };
  };

  // Helper function to sync editData from project
  const syncEditDataFromProject = () => {
    if (project) {
      setEditData({
        name: project.name || '',
        client: project.client || '',
        location: project.location || '',
        equipmentCount: project.equipmentCount || 0,
        status: project.status || 'active',
        poNumber: project.poNumber || '',
        salesOrderDate: project.salesOrderDate || '',
        deadline: project.deadline || '',
        clientIndustry: project.clientIndustry || '',
        manager: project.manager || '',
        consultant: project.consultant || '',
        tpiAgency: project.tpiAgency || '',
        clientFocalPoint: project.clientFocalPoint || '',
        vdcrManager: project.vdcrManager || '',
        scopeOfWork: project.scopeOfWork || '',
        servicesIncluded: project.servicesIncluded || [],
        equipmentBreakdown: project.equipmentBreakdown || {},
        kickoffMeetingNotes: project.kickoffMeetingNotes || '',
        specialProductionNotes: project.specialProductionNotes || ''
      });
    }
  };

  // Edit mode functions
  const toggleEditMode = () => {
    if (isEditMode) {
      // Save changes - we're exiting edit mode
      // // console.log('Saving changes:', editData);
    } else {
      // Entering edit mode - ALWAYS sync with latest project values
      syncEditDataFromProject();
    }
    setIsEditMode(!isEditMode);
  };

  const handleEditFieldChange = (field: string, value: string | string[]) => {
    setEditData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEquipmentBreakdownChange = (equipmentType: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setEditData(prev => ({
      ...prev,
      equipmentBreakdown: {
        ...prev.equipmentBreakdown,
        [equipmentType]: numValue
      }
    }));
  };

  const handleSaveChanges = () => {
    // Here you would typically save to your backend
    // // console.log('Saving changes:', editData);
    setIsEditMode(false);
    // You could also call a prop function to update the parent component
  };

  const handleMarkAsComplete = () => {
    // Here you would typically update the project status in your backend
    // // console.log('Marking project as complete:', project.id);
    // You could also call a prop function to update the parent component
    toast({ title: 'Success', description: 'Project marked as complete!' });
  };



  const handleCancelEdit = () => {
    setEditData({
      name: project.name || '',
      client: project.client || '',
      location: project.location || '',
      equipmentCount: project.equipmentCount,
      status: project.status,
      poNumber: project.poNumber || '',
      salesOrderDate: project.salesOrderDate || '',
      deadline: project.deadline || '',
      clientIndustry: project.clientIndustry || '',
      manager: project.manager || '',
      consultant: project.consultant || '',
      tpiAgency: project.tpiAgency || '',
      clientFocalPoint: project.clientFocalPoint || '',
      vdcrManager: project.vdcrManager || '',
      scopeOfWork: project.scopeOfWork || '',
      servicesIncluded: project.servicesIncluded || [],
      equipmentBreakdown: project.equipmentBreakdown || {},
      kickoffMeetingNotes: project.kickoffMeetingNotes || '',
      specialProductionNotes: project.specialProductionNotes || ''
    });
    setIsEditMode(false);
  };

  // Document management functions
  const handleAddDocument = () => {
    setShowDocumentUpload(true);
  };

  const handleDocumentUpload = () => {
    // Here you would typically upload the document to your backend
    // // console.log('Uploading document:', newDocument);

    // For now, we'll just close the modal
    setShowDocumentUpload(false);
    setNewDocument({
      type: 'unpricedPOFile',
      name: '',
      description: ''
    });
  };

  const handleRemoveDocument = (documentType: string) => {
    if (confirm('Are you sure you want to remove this document?')) {
      // // console.log('Removing document:', documentType);
      // Here you would typically remove the document from your backend
    }
  };

  const handleDeleteProjectDocument = async (documentId: string, documentType: ProjectDocumentType) => {
    if (!confirm('Sure you want to delete file?')) return;
    try {
      await deleteProjectDocument(documentId, documentType, project.id);
      toast({ title: 'Success', description: 'Document deleted successfully!' });
      onDocumentDeleted?.(project.id, documentId, documentType);
    } catch (error) {
      console.error('Error deleting project document:', error);
      toast({ title: 'Error', description: 'Failed to delete document. Please try again.', variant: 'destructive' });
    }
  };

  const handleEditProject = () => {
    // TODO: Implement edit project functionality
    // // console.log('Edit project:', project.id);
    toast({ title: 'Notice', description: 'Edit project functionality will be implemented here' });
  };

  const handleMarkComplete = () => {
    const confirmed = window.confirm(`Are you sure you want to mark the project "${project.name}" as complete?`);
    if (confirmed) {
      // Here you would typically update the project status in your backend
      // // console.log('Marking project as complete:', project.id);
      // You could also call a prop function to update the parent component
      toast({ title: 'Success', description: 'Project marked as complete successfully!' });
    }
  };

  const handleDeleteProject = () => {
    if (confirm(`Are you sure you want to delete project "${project.name}"? This action cannot be undone.`)) {
      // TODO: Implement delete project functionality
      // // console.log('Delete project:', project.id);
      toast({ title: 'Notice', description: 'Delete project functionality will be implemented here' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'delayed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'on-track':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'delayed':
        return <AlertCircle size={16} className="text-red-600" />;
      case 'on-track':
        return <TrendingUp size={16} className="text-blue-600" />;
      default:
        return <Clock size={16} className="text-gray-600" />;
    }
  };



  // VDCR Overview calculation functions
  const calculateVDCRStats = () => {
    if (!vdcrData || vdcrData.length === 0) {
      return {
        approved: 0,
        underReview: 0,
        sentForApproval: 0,
        rejected: 0,
        total: 0
      };
    }

    return {
      approved: vdcrData.filter(v => v.status === 'approved').length,
      underReview: vdcrData.filter(v => v.status === 'received-for-comment' || v.status === 'pending').length,
      sentForApproval: vdcrData.filter(v => v.status === 'sent-for-approval').length,
      rejected: vdcrData.filter(v => v.status === 'rejected').length,
      total: vdcrData.length
    };
  };

  const calculateTimeline = (lastUpdate: string) => {
    const lastDate = new Date(lastUpdate);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return `${Math.ceil(diffDays / 30)} months ago`;
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'approved': return { color: 'green', icon: '✓', label: 'Complete' };
      case 'sent-for-approval': return { color: 'blue', icon: '📤', label: 'Sent' };
      case 'received-for-comment': return { color: 'yellow', icon: '⏱️', label: 'In Progress' };
      case 'pending': return { color: 'yellow', icon: '⏱️', label: 'Pending' };
      case 'rejected': return { color: 'red', icon: '✗', label: 'Needs Revision' };
      default: return { color: 'gray', icon: '❓', label: 'Unknown' };
    }
  };

  const getDocumentTypeStats = () => {
    if (!vdcrData || vdcrData.length === 0) return [];

    const typeStats = vdcrData.reduce((acc, v) => {
      const type = v.documentName.split(' ')[0] + ' ' + v.documentName.split(' ')[1]; // First two words as type
      if (!acc[type]) {
        acc[type] = { approved: 0, pending: 0, rejected: 0, total: 0 };
      }

      if (v.status === 'approved') acc[type].approved++;
      else if (v.status === 'rejected') acc[type].rejected++;
      else acc[type].pending++;

      acc[type].total++;
      return acc;
    }, {} as Record<string, any>);

    return Object.entries(typeStats).map(([type, stats]) => ({
      type,
      ...stats
    }));
  };

  const getRecentUpdates = () => {
    if (!vdcrData || vdcrData.length === 0) return [];

    return vdcrData.slice(0, 5).map(v => ({
      documentName: v.documentName,
      status: v.status,
      timeline: calculateTimeline(v.lastUpdate),
      statusInfo: getStatusInfo(v.status)
    }));
  };

  const getVDCRDocumentsByStatus = (status: 'approved' | 'sent-for-approval' | 'received-for-comment' | 'rejected') => {
    if (!vdcrData || vdcrData.length === 0) return [];

    const filteredDocs = vdcrData.filter(doc => doc.status === status);

    return filteredDocs.map(doc => {
      const updateDate = new Date(doc.lastUpdate);
      const today = new Date();
      const diffTime = today.getTime() - updateDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let daysAgo = '';
      if (diffDays === 0) {
        daysAgo = 'Today';
      } else if (diffDays === 1) {
        daysAgo = '1 day ago';
      } else {
        daysAgo = `${diffDays} days ago`;
      }

      return {
        ...doc,
        daysAgo,
        latestUpdate: doc.lastUpdate,
        updateDate: updateDate
      };
    }).sort((a, b) => new Date(b.updateDate).getTime() - new Date(a.updateDate).getTime()); // Sort by most recent first
  };

  return (
    <div className="min-h-screen lg:bg-gray-50 py-8">
      <div className="container-fluid lg:mx-auto lg:px-4">

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Team Details Tab */}
          <TabsContent value="team-details" className="space-y-6">
            <div className="space-y-3">

              {/* Project Header with Action Buttons */}
              <Card className="p-4 sm:p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 space-y-4 lg:space-y-0">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <Building size={24} className="sm:w-8 sm:h-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">
                        {project.name}
                      </h2>
                      <p className="text-sm sm:text-base lg:text-lg text-gray-600 mt-1">Team & Project Information</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                      <Button
                        onClick={() => onEditProject?.(project.id)}
                        variant="outline"
                        className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 hover:text-blue-800 text-sm sm:text-base"
                      >
                        <Pencil size={14} className="sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Edit Project</span>
                        <span className="sm:hidden">Edit</span>
                      </Button>

                      {project.status !== 'completed' && (
                        <Button
                          onClick={() => onCompleteProject?.(project.id)}
                          variant="outline"
                          className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-green-50 hover:bg-green-100 border-green-200 text-green-700 hover:text-green-800 text-sm sm:text-base"
                        >
                          <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="hidden sm:inline">Mark Complete</span>
                          <span className="sm:hidden">Complete</span>
                        </Button>
                      )}

                      <Button
                        onClick={() => onDeleteProject?.(project.id)}
                        variant="outline"
                        className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-red-50 hover:bg-red-100 border-red-200 text-red-700 hover:text-red-800 text-sm sm:text-base"
                      >
                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span className="hidden sm:inline">Delete Project</span>
                        <span className="sm:hidden">Delete</span>
                      </Button>
                    </div>
                  )}
                </div>
              </Card>

              {/* Basic Project Information */}
              <Card className="lg:p-4 p-4 bg-gray-50 border-0 shadow-sm">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center">
                  <Building size={18} className="sm:w-5 sm:h-5 mr-2 text-blue-600" />
                  Project Information
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                  {/* Left Column - Project Information */}
                  <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                    <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Project Information</h4>
                    <div className="space-y-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Project Name</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{project.name}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Client</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{project.client}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Location</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{project.location}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">PO Number</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{project.poNumber}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">PO Date</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{formatDateToDDMMYYYY(project.salesOrderDate)}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Deadline</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{formatDateToDDMMYYYY(project.deadline)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Project Status */}
                  <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                    <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Project Status</h4>
                    <div className="space-y-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Status</span>
                        <Badge className={`w-fit ${project.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' :
                            project.status === 'delayed' ? 'bg-red-100 text-red-800 border-red-200' :
                              project.status === 'on-track' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                'bg-gray-100 text-gray-800 border-gray-200'
                          }`}>
                          {project.status}
                        </Badge>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Equipment Count</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800">{project.equipmentCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Project Team & Management */}
              <Card className="p-4 sm:p-6 bg-gray-50 border-0 shadow-sm">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center">
                  <Users size={18} className="sm:w-5 sm:h-5 mr-2 text-green-600" />
                  Project Team & Management
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                  {/* Left Column - Team Members */}
                  <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                    <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Team Members</h4>
                    <div className="space-y-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Project Manager</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{project.manager}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Client Focal Point</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{project.clientFocalPoint || 'Not specified'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Documentation Manager</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{project.vdcrManager || 'Not specified'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - External Partners */}
                  <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                    <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">External Partners</h4>
                    <div className="space-y-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Consultant</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{project.consultant || 'Not specified'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">TPI Agency</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{project.tpiAgency || 'Not specified'}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                        <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Client Industry</span>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{project.clientIndustry || 'Not specified'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Equipment Breakdown */}
              <Card className="p-4 sm:p-6 bg-gray-50 border-0 shadow-sm">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center">
                  <Target size={18} className="sm:w-5 sm:h-5 mr-2 text-blue-600" />
                  Equipment Breakdown
                </h3>

                <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {isEditMode ? (
                      <>
                        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                          <input
                            type="number"
                            value={editData.equipmentBreakdown.heatExchanger || 0}
                            onChange={(e) => handleEquipmentBreakdownChange('heatExchanger', e.target.value)}
                            className="w-12 sm:w-16 text-center text-lg sm:text-2xl font-bold text-blue-800 bg-transparent border-none focus:outline-none"
                            min="0"
                          />
                          <div className="text-xs sm:text-sm text-blue-600 font-medium">Heat Exchangers</div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                          <input
                            type="number"
                            value={editData.equipmentBreakdown.pressureVessel || 0}
                            onChange={(e) => handleEquipmentBreakdownChange('pressureVessel', e.target.value)}
                            className="w-12 sm:w-16 text-center text-lg sm:text-2xl font-bold text-slate-700 bg-transparent border-none focus:outline-none"
                            min="0"
                          />
                          <div className="text-xs sm:text-sm text-slate-600 font-medium">Pressure Vessels</div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                          <input
                            type="number"
                            value={editData.equipmentBreakdown.storageTank || 0}
                            onChange={(e) => handleEquipmentBreakdownChange('storageTank', e.target.value)}
                            className="w-12 sm:w-16 text-center text-lg sm:text-2xl font-bold text-teal-800 bg-transparent border-none focus:outline-none"
                            min="0"
                          />
                          <div className="text-xs sm:text-sm text-teal-600 font-medium">Storage Tanks</div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                          <input
                            type="number"
                            value={editData.equipmentBreakdown.reactor || 0}
                            onChange={(e) => handleEquipmentBreakdownChange('reactor', e.target.value)}
                            className="w-12 sm:w-16 text-center text-lg sm:text-2xl font-bold text-indigo-800 bg-transparent border-none focus:outline-none"
                            min="0"
                          />
                          <div className="text-xs sm:text-sm text-indigo-600 font-medium">Reactors</div>
                        </div>

                        {/* Custom Equipment Types - Individual Cards in Edit Mode */}
                        {Object.keys(editData.equipmentBreakdown || {})
                          .filter(key => {
                            const standardKeys = ['heatExchanger', 'pressureVessel', 'storageTank', 'reactor', 'other'];
                            return !standardKeys.includes(key) && (editData.equipmentBreakdown[key] || 0) > 0;
                          })
                          .map((customKey, index) => {
                            const count = editData.equipmentBreakdown[customKey] || 0;
                            let displayName = customKey
                              .replace(/([A-Z])/g, ' $1')
                              .replace(/^./, str => str.toUpperCase())
                              .trim();
                            if (customKey === 'distillationcolumn' || displayName === 'Distillationcolumn') displayName = 'Column';
                            
                            const textColors = [
                              { text: 'text-blue-800', textLight: 'text-blue-600' },
                              { text: 'text-slate-700', textLight: 'text-slate-600' },
                              { text: 'text-teal-800', textLight: 'text-teal-600' },
                              { text: 'text-indigo-800', textLight: 'text-indigo-600' }
                            ];
                            const colorClass = textColors[index % textColors.length];
                            return (
                              <div key={customKey} className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                                <input
                                  type="number"
                                  value={count}
                                  onChange={(e) => handleEquipmentBreakdownChange(customKey, e.target.value)}
                                  className={`w-12 sm:w-16 text-center text-lg sm:text-2xl font-bold ${colorClass.text} bg-transparent border-none focus:outline-none`}
                                  min="0"
                                />
                                <div className={`text-xs sm:text-sm ${colorClass.textLight} font-medium`}>{displayName}</div>
                              </div>
                            );
                          })}
                      </>
                    ) : (
                      <>
                        {/* Always show all equipment types */}
                        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                          <div className="text-lg sm:text-2xl font-bold text-blue-800">{project.equipmentBreakdown?.heatExchanger || 0}</div>
                          <div className="text-xs sm:text-sm text-blue-600 font-medium">Heat Exchangers</div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                          <div className="text-lg sm:text-2xl font-bold text-slate-700">{project.equipmentBreakdown?.pressureVessel || 0}</div>
                          <div className="text-xs sm:text-sm text-slate-600 font-medium">Pressure Vessels</div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                          <div className="text-lg sm:text-2xl font-bold text-teal-800">{project.equipmentBreakdown?.storageTank || 0}</div>
                          <div className="text-xs sm:text-sm text-teal-600 font-medium">Storage Tanks</div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                          <div className="text-lg sm:text-2xl font-bold text-indigo-800">{project.equipmentBreakdown?.reactor || 0}</div>
                          <div className="text-xs sm:text-sm text-indigo-600 font-medium">Reactors</div>
                        </div>

                        {/* Custom Equipment Types - Individual Cards */}
                            {Object.keys(project.equipmentBreakdown || {})
                          .filter(key => {
                            const standardKeys = ['heatExchanger', 'pressureVessel', 'storageTank', 'reactor', 'other'];
                            return !standardKeys.includes(key) && (project.equipmentBreakdown[key] || 0) > 0;
                          })
                          .map((customKey, index) => {
                            const count = project.equipmentBreakdown[customKey] || 0;
                            let displayName = customKey
                              .replace(/([A-Z])/g, ' $1')
                              .replace(/^./, str => str.toUpperCase())
                              .trim();
                            if (customKey === 'distillationcolumn' || displayName === 'Distillationcolumn') displayName = 'Column';
                            
                            const textColors = [
                              { text: 'text-blue-800', textLight: 'text-blue-600' },
                              { text: 'text-slate-700', textLight: 'text-slate-600' },
                              { text: 'text-teal-800', textLight: 'text-teal-600' },
                              { text: 'text-indigo-800', textLight: 'text-indigo-600' }
                            ];
                            const colorClass = textColors[index % textColors.length];
                            return (
                              <div key={customKey} className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 text-center shadow-sm">
                                <div className={`text-lg sm:text-2xl font-bold ${colorClass.text}`}>{count}</div>
                                <div className={`text-xs sm:text-sm ${colorClass.textLight} font-medium`}>{displayName}</div>
                              </div>
                            );
                          })}
                      </>
                    )}
                  </div>
                </div>
              </Card>

              {/* Scope of Work */}
              <Card className="p-4 sm:p-6 bg-gray-50 border-0 shadow-sm">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center">
                  <Target size={18} className="sm:w-5 sm:h-5 mr-2 text-indigo-600" />
                  Project Specifications
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                  {/* Left Column - Services Included */}
                  <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                    <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Services Included</h4>
                    {isEditMode ? (
                      <div className="space-y-3">
                        {['Design & Engineering', 'Manufacturing & Fabrication', 'Quality Testing & Inspection', 'Documentation & Certification', 'Installation Support', 'Commissioning & Startup'].map((service) => (
                          <label key={service} className="flex items-center p-2 sm:p-3 bg-gray-50 rounded-lg border cursor-pointer hover:bg-gray-100">
                            <input
                              type="checkbox"
                              checked={editData.servicesIncluded.includes(service)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  handleEditFieldChange('servicesIncluded', [...editData.servicesIncluded, service]);
                                } else {
                                  handleEditFieldChange('servicesIncluded', editData.servicesIncluded.filter(s => s !== service));
                                }
                              }}
                              className="mr-2 h-3 w-3 sm:h-4 sm:w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="text-xs sm:text-sm font-medium text-gray-700">{service}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-0">
                        {project.servicesIncluded && project.servicesIncluded.length > 0 ? (
                          project.servicesIncluded.map((service, index) => (
                            <div key={index} className="flex items-center py-2 sm:py-3 border-b border-gray-100 last:border-b-0">
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full mr-2 sm:mr-3"></div>
                              <span className="text-xs sm:text-sm text-gray-700">{service}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-500 text-xs sm:text-sm">No services specified</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column - Scope Description */}
                  <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                    <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Scope Description</h4>
                    {isEditMode ? (
                      <textarea
                        value={editData.scopeOfWork || ''}
                        onChange={(e) => handleEditFieldChange('scopeOfWork', e.target.value)}
                        placeholder="Enter detailed scope description..."
                        rows={6}
                        className="w-full px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border">
                        <p className="text-xs sm:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                          {project.scopeOfWork || '-'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Documents Uploaded */}
              <Card className="p-4 sm:p-6 bg-gray-50 border-0 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 space-y-3 sm:space-y-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center">
                    <FileText size={18} className="sm:w-5 sm:h-5 mr-2 text-amber-600" />
                    Documents Uploaded
                  </h3>
                  {isEditMode && (
                    <Button
                      onClick={handleAddDocument}
                      variant="outline"
                      size="sm"
                      className="bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700 hover:text-emerald-800 text-xs sm:text-sm"
                    >
                      <FileText size={14} className="sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Add Document</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  )}
                </div>

                <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    {/* Left Column - Core Documents */}
                    <div className="space-y-3 sm:space-y-4">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Core Documents</h4>

                      {/* Unpriced PO File */}
                      <div className="p-3 sm:p-4 rounded-lg border border-blue-200 bg-blue-50">
                        <h5 className="font-medium text-gray-800 text-sm sm:text-base mb-2">Unpriced PO File</h5>
                        {project.unpricedPODocuments && project.unpricedPODocuments.length > 0 ? (
                          <div className="space-y-2">
                            {project.unpricedPODocuments.map((doc: any, index: number) => {
                              const normalized = normalizeDocument(doc);
                              return (
                                <div key={doc.id || `unpriced-${index}`} className="flex items-center justify-between p-2 bg-white rounded border border-blue-100 gap-2">
                                  <span className="text-blue-700 truncate flex-1 min-w-0 text-xs sm:text-sm">{normalized.name}</span>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => handleDocumentClick(normalized.url, normalized.name, 'PDF', 'Purchase order file for the project')}
                                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded text-xs sm:text-sm transition-colors"
                                    >
                                      View
                                    </button>
                                    {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && doc.id && (
                                      <button
                                        onClick={() => handleDeleteProjectDocument(doc.id, 'unpriced_po_documents')}
                                        className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                                        title="Delete document"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-gray-500">No files uploaded</p>
                        )}
                      </div>

                      {/* Design Inputs PID */}
                      <div className="p-3 sm:p-4 rounded-lg border border-green-200 bg-green-50">
                        <h5 className="font-medium text-gray-800 text-sm sm:text-base mb-2">Design Inputs PID</h5>
                        {project.designInputsDocuments && project.designInputsDocuments.length > 0 ? (
                          <div className="space-y-2">
                            {project.designInputsDocuments.map((doc: any, index: number) => {
                              const normalized = normalizeDocument(doc);
                              return (
                                <div key={doc.id || `design-${index}`} className="flex items-center justify-between p-2 bg-white rounded border border-green-100 gap-2">
                                  <span className="text-green-700 truncate flex-1 min-w-0 text-xs sm:text-sm">{normalized.name}</span>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => handleDocumentClick(normalized.url, normalized.name, 'PDF', 'Process and instrumentation diagram')}
                                      className="text-green-600 hover:text-green-800 hover:bg-green-50 px-2 py-1 rounded text-xs sm:text-sm transition-colors"
                                    >
                                      View
                                    </button>
                                    {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && doc.id && (
                                      <button
                                        onClick={() => handleDeleteProjectDocument(doc.id, 'design_inputs_documents')}
                                        className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                                        title="Delete document"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-gray-500">No files uploaded</p>
                        )}
                      </div>
                    </div>

                    {/* Right Column - Additional Documents */}
                    <div className="space-y-3 sm:space-y-4">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Additional Documents</h4>

                      {/* Client Reference Doc */}
                      <div className="p-3 sm:p-4 rounded-lg border border-blue-200 bg-blue-50">
                        <h5 className="font-medium text-gray-800 text-sm sm:text-base mb-2">Client Reference Doc</h5>
                        {project.clientReferenceDocuments && project.clientReferenceDocuments.length > 0 ? (
                          <div className="space-y-2">
                            {project.clientReferenceDocuments.map((doc: any, index: number) => {
                              const normalized = normalizeDocument(doc);
                              return (
                                <div key={doc.id || `client-${index}`} className="flex items-center justify-between p-2 bg-white rounded border border-blue-100 gap-2">
                                  <span className="text-blue-700 truncate flex-1 min-w-0 text-xs sm:text-sm">{normalized.name}</span>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => handleDocumentClick(normalized.url, normalized.name, 'PDF', 'Client reference documentation')}
                                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded text-xs sm:text-sm transition-colors"
                                    >
                                      View
                                    </button>
                                    {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && doc.id && (
                                      <button
                                        onClick={() => handleDeleteProjectDocument(doc.id, 'client_reference_documents')}
                                        className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                                        title="Delete document"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-gray-500">No files uploaded</p>
                        )}
                      </div>

                      {/* Other Documents */}
                      <div className="p-3 sm:p-4 rounded-lg border border-orange-200 bg-orange-50">
                        <h5 className="font-medium text-gray-800 text-sm sm:text-base mb-2">Other Documents</h5>
                        {project.otherDocumentsLinks && project.otherDocumentsLinks.length > 0 ? (
                          <div className="space-y-2">
                            {project.otherDocumentsLinks.map((doc: any, index: number) => {
                              const normalized = normalizeDocument(doc);
                              return (
                                <div key={doc.id || `other-${index}`} className="flex items-center justify-between p-2 bg-white rounded border border-orange-100 gap-2">
                                  <span className="text-orange-700 truncate flex-1 min-w-0 text-xs sm:text-sm">{normalized.name}</span>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => handleDocumentClick(normalized.url, normalized.name, 'Multiple', 'Additional project documents')}
                                      className="text-orange-600 hover:text-orange-800 hover:bg-orange-50 px-2 py-1 rounded text-xs sm:text-sm transition-colors"
                                    >
                                      View
                                    </button>
                                    {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'editor' && currentUserRole !== 'viewer' && doc.id && (
                                      <button
                                        onClick={() => handleDeleteProjectDocument(doc.id, 'other_documents')}
                                        className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                                        title="Delete document"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-gray-500">No files uploaded</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Notes & Additional Information */}
              <Card className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-800 mb-3 sm:mb-4 flex items-center">
                  <FileText size={16} className="sm:w-4 sm:h-4 lg:w-5 lg:h-5 mr-2 text-teal-600 flex-shrink-0" />
                  <span className="whitespace-nowrap">Notes & Additional Information</span>
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  {/* Left Column - Kickoff Meeting Notes */}
                  <div className="space-y-3 sm:space-y-4">
                    <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Kickoff Meeting Notes</h4>
                    {isEditMode ? (
                      <textarea
                        value={editData.kickoffMeetingNotes || ''}
                        onChange={(e) => handleEditFieldChange('kickoffMeetingNotes', e.target.value)}
                        placeholder="Enter kickoff meeting notes..."
                        rows={6}
                        className="w-full px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border">
                        <p className="text-xs sm:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                          {project.kickoffMeetingNotes || '-'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right Column - Special Production Notes */}
                  <div className="space-y-3 sm:space-y-4">
                    <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Special Production Notes</h4>
                    {isEditMode ? (
                      <textarea
                        value={editData.specialProductionNotes || ''}
                        onChange={(e) => handleEditFieldChange('specialProductionNotes', e.target.value)}
                        placeholder="Enter special production notes..."
                        rows={6}
                        className="w-full px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border">
                        <p className="text-xs sm:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                          {project.specialProductionNotes || '-'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>


            </div>
          </TabsContent>

        </Tabs>
      </div>

      {/* Document Preview Modal */}
      {documentPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center">
                  <FileText size={18} className="sm:w-5 sm:h-5 mr-2 text-blue-600" />
                  <span className="truncate">{documentPreview.name}</span>
                </h3>
                <button
                  onClick={() => setDocumentPreview(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-2"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Badge className="bg-blue-100 text-blue-800 border-blue-200 w-fit">
                  {documentPreview.type}
                </Badge>
                <span className="text-xs sm:text-sm text-gray-600">Description: {documentPreview.description}</span>
              </div>
            </div>

            {/* Document Content */}
            <div className="p-4 sm:p-6">
              {documentPreview.url && documentPreview.url.trim() !== '' ? (
                <div className="w-full">
                  {documentPreview.type === 'PDF' && (
                    <div className="w-full h-full">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 sm:mb-4 gap-2">
                        <h4 className="text-base sm:text-lg font-semibold text-gray-800">PDF Document</h4>
                        <a
                          href={documentPreview.url}
                          download
                          className="inline-flex items-center px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm"
                        >
                          <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download
                        </a>
                      </div>
                      <div className="w-full h-[400px] sm:h-[600px] border border-gray-200 rounded-lg overflow-hidden">
                        <iframe
                          src={documentPreview.url}
                          className="w-full h-full"
                          title="PDF Document"
                        />
                      </div>
                    </div>
                  )}
                  {(documentPreview.type === 'JPG' || documentPreview.type === 'PNG' || documentPreview.type === 'GIF') && (
                    <img
                      src={documentPreview.url}
                      alt={documentPreview.name}
                      className="w-full h-auto max-h-64 sm:max-h-96 object-contain border border-gray-200 rounded-lg"
                    />
                  )}
                  {(documentPreview.type === 'DOCX' || documentPreview.type === 'DOC') && (
                    <div className="text-center py-8 sm:py-12">
                      <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-base sm:text-lg font-medium text-gray-600 mb-1 sm:mb-2">Document Preview</p>
                      <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">This document type requires download to view</p>
                      <a
                        href={documentPreview.url}
                        download
                        className="inline-flex items-center px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm"
                      >
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download Document
                      </a>
                    </div>
                  )}
                  {!['PDF', 'JPG', 'PNG', 'GIF', 'DOCX', 'DOC'].includes(documentPreview.type) && (
                    <div className="text-center py-12">
                      <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-lg font-medium text-gray-600 mb-2">Document Preview</p>
                      <p className="text-sm text-gray-500 mb-4">This document type requires download to view</p>
                      <a
                        href={documentPreview.url}
                        download
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download Document
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg font-medium text-gray-600 mb-2">No Document Available</p>
                  <p className="text-sm text-gray-500">This document hasn't been uploaded yet</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 sm:gap-3 pt-3 sm:pt-4 border-t p-4 sm:p-6">
              <button
                onClick={() => setDocumentPreview(null)}
                className="px-3 sm:px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-xs sm:text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Upload Modal */}
      {showDocumentUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">Add New Document</h3>
                <button
                  onClick={() => setShowDocumentUpload(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} className="sm:w-6 sm:h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Document Type</label>
                  <select
                    value={newDocument.type}
                    onChange={(e) => setNewDocument(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="unpricedPOFile">Unpriced PO File</option>
                    <option value="designInputsPID">Design Inputs PID</option>
                    <option value="clientReferenceDoc">Client Reference Doc</option>
                    <option value="otherDocuments">Other Documents</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Document Name</label>
                  <input
                    type="text"
                    value={newDocument.name}
                    onChange={(e) => setNewDocument(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter document name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
                  <textarea
                    value={newDocument.description}
                    onChange={(e) => setNewDocument(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter document description"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <Button
                    onClick={handleDocumentUpload}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    Upload Document
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowDocumentUpload(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetails;
