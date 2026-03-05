import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Calendar, User, MapPin, ChevronLeft, ChevronRight, FileText, Users, Settings, TrendingUp, AlertTriangle, ClipboardCheck, Shield, Plus, Edit, Check, X, Camera, Upload, Clock, Building, Trash2, Mic, MicOff, Play, Pause, ChevronDown, Search, ArrowLeft, Target, Wrench, BarChart3, Download, ArrowRight, Image, UserPlus, FileCheck, Loader2 } from "lucide-react";
import { Equipment } from "@/types/equipment";
import { fastAPI } from "@/lib/api";
// 🔧 FIX: Removed updateEquipment import - using fastAPI.updateStandaloneEquipment instead
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface StandaloneEquipmentCardProps {
  item: Equipment;
  // State props
  editingEquipmentId: string | null;
  editFormData: Partial<Equipment>;
  setEditFormData: (data: Partial<Equipment> | ((prev: Partial<Equipment>) => Partial<Equipment>)) => void;
  showNewCertificationInput: Record<string, boolean>;
  setShowNewCertificationInput: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  newCertificationTitle: string;
  setNewCertificationTitle: (value: string) => void;
  allCertificationTitles: string[];
  setAllCertificationTitles: (value: string[] | ((prev: string[]) => string[])) => void;
  newProgressImage: File | null;
  setNewProgressImage: (value: File | null) => void;
  imageDescription: string;
  setImageDescription: (value: string) => void;
  currentProgressImageIndex: Record<string, number>;
  setCurrentProgressImageIndex: (value: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  showImagePreview: { url: string, equipmentId: string, currentIndex: number } | null;
  setShowImagePreview: (value: { url: string, equipmentId: string, currentIndex: number } | null) => void;
  overviewLastUpdateRaw: Record<string, string>;
  setOverviewLastUpdateRaw: (value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  overviewNextMilestoneDate: Record<string, string>;
  setOverviewNextMilestoneDate: (value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  technicalSections: Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>>;
  setTechnicalSections: (value: Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>> | ((prev: Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>>) => Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>>)) => void;
  selectedSection: Record<string, string>;
  setSelectedSection: (value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  customFields: Record<string, Array<{ name: string, value: string }>>;
  setCustomFields: (value: Record<string, Array<{ name: string, value: string }>> | ((prev: Record<string, Array<{ name: string, value: string }>>) => Record<string, Array<{ name: string, value: string }>>)) => void;
  teamCustomFields: Record<string, Array<{ name: string, value: string }>>;
  setTeamCustomFields: (value: Record<string, Array<{ name: string, value: string }>> | ((prev: Record<string, Array<{ name: string, value: string }>>) => Record<string, Array<{ name: string, value: string }>>)) => void;
  isEditTeamMode: Record<string, boolean>;
  setIsEditTeamMode: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  isEditCustomFieldMode: Record<string, boolean>;
  setIsEditCustomFieldMode: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  editingCustomFieldId: string | null;
  setEditingCustomFieldId: (value: string | null) => void;
  showAddCustomFieldForm: Record<string, boolean>;
  setShowAddCustomFieldForm: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  teamPositions: Record<string, Array<{ id: string, position: string, name: string, email: string, phone: string, role: 'editor' | 'viewer' }>>;
  setTeamPositions: (value: Record<string, Array<{ id: string, position: string, name: string, email: string, phone: string, role: 'editor' | 'viewer' }>> | ((prev: Record<string, Array<{ id: string, position: string, name: string, email: string, phone: string, role: 'editor' | 'viewer' }>>) => Record<string, Array<{ id: string, position: string, name: string, email: string, phone: string, role: 'editor' | 'viewer' }>>)) => void;
  progressEntries: Record<string, Array<{ id: string, text: string, date: string, type: string }>>;
  setProgressEntries: (value: Record<string, Array<{ id: string, text: string, date: string, type: string }>> | ((prev: Record<string, Array<{ id: string, text: string, date: string, type: string }>>) => Record<string, Array<{ id: string, text: string, date: string, type: string }>>)) => void;
  newProgressEntry: string;
  setNewProgressEntry: (value: string) => void;
  newProgressType: string;
  setNewProgressType: (value: string) => void;
  editingProgressEntryId: string | null;
  setEditingProgressEntryId: (value: string | null) => void;
  addingProgressEntryForEquipment: string | null;
  setAddingProgressEntryForEquipment: (value: string | null) => void;
  editingProgressEntryForEquipment: string | null;
  setEditingProgressEntryForEquipment: (value: string | null) => void;
  isAddingCustomProgressType: boolean;
  setIsAddingCustomProgressType: (value: boolean) => void;
  customProgressTypeName: string;
  setCustomProgressTypeName: (value: string) => void;
  customProgressTypes: string[];
  setCustomProgressTypes: (value: string[] | ((prev: string[]) => string[])) => void;
  documents: Record<string, any[]>;
  setDocuments: (value: Record<string, any[]> | ((prev: Record<string, any[]>) => Record<string, any[]>)) => void;
  loadingStates: Record<string, boolean>;
  setLoadingStates: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  projectMembers: any[];
  allUsers: any[];
  // Handler props
  handleImageUpload: (file: File) => void;
  handleProgressPhaseChange: (equipmentId: string, newPhase: 'documentation' | 'manufacturing' | 'testing' | 'dispatched') => void;
  handleDocsTabClick: (equipmentId: string) => void;
  handleMarkComplete: (equipment: Equipment) => void;
  handleDeleteEquipment: (equipment: Equipment) => void;
  handleSaveEquipment: () => void;
  setEditingEquipmentId: (value: string | null) => void;
  setViewingEquipmentId: (value: string | null) => void;
  onViewDetails?: () => void;
  setEquipmentDetailsTab?: (value: string) => void;
  // Helper functions
  formatDateTimeDisplay: (dateTimeString: string) => string;
  getStatusColor: (status: string) => string;
  // Audio recording props
  isImageRecording: boolean;
  isRecording: boolean;
  imageRecordingDuration: number;
  imageAudioChunks: Blob[];
  startImageAudioRecording: () => void;
  stopImageAudioRecording: () => void;
  playImageAudio: (audioUrl: string) => void;
  removeImageAudio: () => void;
  formatDuration: (seconds: number) => string;
  // Other props
  isAddSectionModalOpen: Record<string, boolean>;
  setIsAddSectionModalOpen: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  newFieldName: string;
  setNewFieldName: (value: string) => void;
  newFieldValue: string;
  setNewFieldValue: (value: string) => void;
  showAddFieldInputs: Record<string, boolean>;
  setShowAddFieldInputs: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  newTeamFieldName: string;
  setNewTeamFieldName: (value: string) => void;
  newTeamFieldValue: string;
  setNewTeamFieldValue: (value: string) => void;
  showAddTeamFieldInputs: Record<string, boolean>;
  setShowAddTeamFieldInputs: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  newTeamPosition: string;
  setNewTeamPosition: (value: string) => void;
  newTeamName: string;
  setNewTeamName: (value: string) => void;
  newTeamEmail: string;
  setNewTeamEmail: (value: string) => void;
  newTeamPhone: string;
  setNewTeamPhone: (value: string) => void;
  newTeamRole: 'editor' | 'viewer';
  setNewTeamRole: (value: 'editor' | 'viewer') => void;
  addTeamPosition: (equipmentId: string) => void;
  removeTeamPosition: (equipmentId: string, positionId: string) => void;
  fetchEquipmentDocuments: (equipmentId: string) => void;
  uploadDocument: (equipmentId: string, file: File, category: string) => void;
  deleteDocument: (equipmentId: string, documentId: string) => void;
  addProgressEntry: (equipmentId: string) => void;
  updateProgressEntry: (equipmentId: string, entryId: string, newText: string, newType: string) => void;
  deleteProgressEntry: (equipmentId: string, entryId: string) => void;
  uploadProgressImage: (equipmentId: string, file: File, description: string) => void;
  addCustomField: (equipmentId: string) => void;
  updateCustomField: (equipmentId: string, fieldIndex: number, newName: string, newValue: string) => void;
  deleteCustomField: (equipmentId: string, fieldIndex: number) => void;
  addTeamCustomField: (equipmentId: string) => void;
  updateTeamCustomField: (equipmentId: string, fieldIndex: number, newName: string, newValue: string) => void;
  deleteTeamCustomField: (equipmentId: string, fieldIndex: number) => void;
  addTechnicalSection: (equipmentId: string, sectionName: string) => void;
  updateTechnicalSection: (equipmentId: string, sectionIndex: number, fieldName: string, fieldValue: string) => void;
  deleteTechnicalSection: (equipmentId: string, sectionIndex: number) => void;
  // Additional dependencies
  projectId: string;
  handleCancelEdit: () => void;
  handleDocumentUpload: (equipmentId: string, files: File[]) => void;
  handleOpenDocument: (doc: any) => void;
  handleDeleteDocument: (equipmentId: string, documentId: string) => void;
  handleDocumentNameChange: (equipmentId: string, documentId: string, newName: string) => void;
  editProgressEntry: (equipmentId: string, entryId: string) => void;
  playAudio: (audioUrl: string | Blob, entryId: string) => void;
  playingAudioId: string | null;
  isEditMode: Record<string, boolean>;
  setIsEditMode: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  setEditingSectionName: (value: string) => void;
  setEditingSectionOldName: (value: string) => void;
  setIsEditSectionModalOpen: (value: boolean) => void;
  showTeamSuggestions: boolean;
  setShowTeamSuggestions: (value: boolean) => void;
  availableTeamMembers: any[];
  selectTeamMember: (member: any) => void;
  handleAddNewUser: (value: string) => void;
  handleEditAddNewUser: (value: string, fieldIndex: number, teamFields: Array<{ name: string, value: string }>) => void;
  documentsLoading: Record<string, boolean>;
  setDocumentsLoading: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  audioChunks: Blob[];
  setAudioChunks: (value: Blob[]) => void;
  recordingDuration: number;
  setRecordingDuration: (value: number) => void;
  stopAudioRecording: () => void;
  startAudioRecording: () => void;
  formatDateDisplay: (dateString: string) => string;
  setLocalEquipment: (value: Equipment[] | ((prev: Equipment[]) => Equipment[])) => void;
  refreshEquipmentData: () => Promise<void>;
  showProgressImageModal: { url: string, description?: string, uploadedBy?: string, uploadDate?: string } | null;
  setShowProgressImageModal: (value: { url: string, description?: string, uploadedBy?: string, uploadDate?: string } | null) => void;
}

const StandaloneEquipmentCard: React.FC<StandaloneEquipmentCardProps> = (props) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const currentUserRole = localStorage.getItem('userRole') || '';
  // Updates tab: load entry image only when user clicks preview (metadata first)
  const [progressEntryImageUrls, setProgressEntryImageUrls] = React.useState<Record<string, string>>({});
  const [progressEntryImageLoading, setProgressEntryImageLoading] = React.useState<Record<string, boolean>>({});
  const [docsSearchQuery, setDocsSearchQuery] = React.useState('');

  const {
    item,
    editingEquipmentId,
    editFormData,
    setEditFormData,
    showNewCertificationInput,
    setShowNewCertificationInput,
    newCertificationTitle,
    setNewCertificationTitle,
    allCertificationTitles,
    setAllCertificationTitles,
    newProgressImage,
    setNewProgressImage,
    imageDescription,
    setImageDescription,
    currentProgressImageIndex,
    setCurrentProgressImageIndex,
    showImagePreview,
    setShowImagePreview,
    overviewLastUpdateRaw,
    setOverviewLastUpdateRaw,
    overviewNextMilestoneDate,
    setOverviewNextMilestoneDate,
    technicalSections,
    setTechnicalSections,
    selectedSection,
    setSelectedSection,
    customFields,
    setCustomFields,
    teamCustomFields,
    setTeamCustomFields,
    isEditTeamMode,
    setIsEditTeamMode,
    isEditCustomFieldMode,
    setIsEditCustomFieldMode,
    editingCustomFieldId,
    setEditingCustomFieldId,
    showAddCustomFieldForm,
    setShowAddCustomFieldForm,
    teamPositions,
    setTeamPositions,
    progressEntries,
    setProgressEntries,
    newProgressEntry,
    setNewProgressEntry,
    newProgressType,
    setNewProgressType,
    editingProgressEntryId,
    setEditingProgressEntryId,
    addingProgressEntryForEquipment,
    setAddingProgressEntryForEquipment,
    editingProgressEntryForEquipment,
    setEditingProgressEntryForEquipment,
    isAddingCustomProgressType,
    setIsAddingCustomProgressType,
    customProgressTypeName,
    setCustomProgressTypeName,
    customProgressTypes,
    setCustomProgressTypes,
    documents,
    setDocuments,
    loadingStates,
    setLoadingStates,
    projectMembers,
    allUsers,
    handleImageUpload,
    handleProgressPhaseChange,
    handleDocsTabClick,
    handleMarkComplete,
    handleDeleteEquipment,
    handleSaveEquipment,
    setEditingEquipmentId,
    setViewingEquipmentId,
    onViewDetails,
    setEquipmentDetailsTab,
    formatDateTimeDisplay,
    getStatusColor,
    isImageRecording,
    isRecording,
    imageRecordingDuration,
    imageAudioChunks,
    startImageAudioRecording,
    stopImageAudioRecording,
    playImageAudio,
    removeImageAudio,
    formatDuration,
    isAddSectionModalOpen,
    setIsAddSectionModalOpen,
    newFieldName,
    setNewFieldName,
    newFieldValue,
    setNewFieldValue,
    showAddFieldInputs,
    setShowAddFieldInputs,
    newTeamFieldName,
    setNewTeamFieldName,
    newTeamFieldValue,
    setNewTeamFieldValue,
    showAddTeamFieldInputs,
    setShowAddTeamFieldInputs,
    newTeamPosition,
    setNewTeamPosition,
    newTeamName,
    setNewTeamName,
    newTeamEmail,
    setNewTeamEmail,
    newTeamPhone,
    setNewTeamPhone,
    newTeamRole,
    setNewTeamRole,
    addTeamPosition,
    removeTeamPosition,
    fetchEquipmentDocuments,
    uploadDocument,
    deleteDocument,
    addProgressEntry,
    updateProgressEntry,
    deleteProgressEntry,
    uploadProgressImage,
    addCustomField,
    updateCustomField,
    deleteCustomField,
    addTeamCustomField,
    updateTeamCustomField,
    deleteTeamCustomField,
    addTechnicalSection,
    updateTechnicalSection,
    deleteTechnicalSection,
    projectId,
    handleCancelEdit,
    handleDocumentUpload,
    handleOpenDocument,
    handleDeleteDocument,
    handleDocumentNameChange,
    editProgressEntry,
    playAudio,
    playingAudioId,
    isEditMode,
    setIsEditMode,
    setEditingSectionName,
    setEditingSectionOldName,
    setIsEditSectionModalOpen,
    showTeamSuggestions,
    setShowTeamSuggestions,
    availableTeamMembers,
    selectTeamMember,
    handleAddNewUser,
    handleEditAddNewUser,
    documentsLoading,
    setDocumentsLoading,
    audioChunks,
    setAudioChunks,
    recordingDuration,
    setRecordingDuration,
    stopAudioRecording,
    startAudioRecording,
    formatDateDisplay,
    setLocalEquipment,
    refreshEquipmentData,
    showProgressImageModal,
    setShowProgressImageModal
  } = props;

  // The full card JSX code (2318 lines) from card_extract.txt needs to be inserted here
  // Starting from line 2 of card_extract.txt (removing the .map((item) => ( part)
  // and ending at line 2400 (removing the closing )))
  
  // The card JSX is extracted from EquipmentGrid.tsx lines 5845-8241
  // This is the complete card component with all tabs, forms, and functionality
  return (
    <Card key={item.id} id={`equipment-card-${item.id}`} className="overflow-hidden hover:shadow-lg transition-shadow relative bg-gray-50 border border-gray-200 h-auto sm:min-h-[420px] flex flex-col">
      <div className="p-3 sm:p-4 flex-1 flex flex-col">
                  {/* PO-CDD Timer Section */}
                  <div className="mb-3 sm:mb-4 p-2 sm:p-2.5 bg-gray-50 border border-gray-200 rounded-md">
                    {editingEquipmentId === item.id ? (
                      // Edit Mode
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                          <span className="text-xs font-medium text-gray-600">PO-CDD</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-gray-600">PO-CDD Date</Label>
                            <Input
                              type="date"
                              value={editFormData.poCdd || item.poCdd}
                              onChange={(e) => setEditFormData({ ...editFormData, poCdd: e.target.value })}
                              className="text-xs h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-600">Any Personal Title</Label>
                            {!showNewCertificationInput[item.id] ? (
                              <Select
                                value={editFormData.certificationTitle || undefined}
                                onValueChange={(value) => {
                                  if (value === '+new') {
                                    setShowNewCertificationInput(prev => ({ ...prev, [item.id]: true }));
                                    setNewCertificationTitle('');
                                  } else {
                                    setEditFormData({ ...editFormData, certificationTitle: value || undefined });
                                  }
                                }}
                              >
                                <SelectTrigger className="text-xs h-8">
                                  <SelectValue placeholder="Select Any Personal Title" />
                                </SelectTrigger>
                                <SelectContent>
                                  {allCertificationTitles.length > 0 && (
                                    allCertificationTitles.map((title) => (
                                      <SelectItem key={title} value={title}>
                                        {title}
                                      </SelectItem>
                                    ))
                                  )}
                                  <SelectItem value="+new" className="text-blue-600 font-medium">
                                    <Plus className="w-3 h-3 inline mr-1" />
                                    New
                                  </SelectItem>
                                  {editFormData.certificationTitle && !allCertificationTitles.includes(editFormData.certificationTitle) && (
                                    <SelectItem value={editFormData.certificationTitle}>
                                      {editFormData.certificationTitle}
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex gap-1">
                                <Input
                                  placeholder="Enter Any Personal Title"
                                  value={newCertificationTitle}
                                  onChange={(e) => setNewCertificationTitle(e.target.value)}
                                  className="text-xs h-8 flex-1"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newCertificationTitle.trim()) {
                                      const title = newCertificationTitle.trim();
                                      setEditFormData({ ...editFormData, certificationTitle: title });
                                      if (!allCertificationTitles.includes(title)) {
                                        setAllCertificationTitles(prev => [...prev, title].sort());
                                      }
                                      setShowNewCertificationInput(prev => ({ ...prev, [item.id]: false }));
                                      setNewCertificationTitle('');
                                    } else if (e.key === 'Escape') {
                                      setShowNewCertificationInput(prev => ({ ...prev, [item.id]: false }));
                                      setNewCertificationTitle('');
                                    }
                                  }}
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() => {
                                    if (newCertificationTitle.trim()) {
                                      const title = newCertificationTitle.trim();
                                      setEditFormData({ ...editFormData, certificationTitle: title });
                                      if (!allCertificationTitles.includes(title)) {
                                        setAllCertificationTitles(prev => [...prev, title].sort());
                                      }
                                    }
                                    setShowNewCertificationInput(prev => ({ ...prev, [item.id]: false }));
                                    setNewCertificationTitle('');
                                  }}
                                >
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() => {
                                    setShowNewCertificationInput(prev => ({ ...prev, [item.id]: false }));
                                    setNewCertificationTitle('');
                                  }}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-nowrap min-w-0">
                          <div className="flex items-center gap-2 min-w-0 flex-shrink">
                            <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                            <span className="text-[11px] sm:text-xs font-medium text-gray-600 whitespace-nowrap">PO-CDD</span>
                            <div className="text-[11px] sm:text-xs font-medium text-gray-800 truncate min-w-0 md:overflow-visible md:whitespace-normal">
                              {item.poCdd}
                            </div>
                          </div>
                          {/* Days Counter / Dispatched Date - Inline with PO-CDD */}
                          {(() => {
                            if (item.progressPhase === 'dispatched') {
                              return (
                                <div className="text-left whitespace-nowrap flex-shrink-0">
                                  <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Dispatched on</div>
                                  <div className="text-xs sm:text-sm font-bold text-green-700 truncate">{item.poCdd}</div>
                                </div>
                              );
                            } else if ((item.poCdd && item.poCdd !== 'To be scheduled') || (item.completionDate && item.completionDate !== 'No deadline set')) {
                              try {
                                const deadlineDate = item.completionDate && item.completionDate !== 'No deadline set' 
                                  ? new Date(item.completionDate) 
                                  : new Date(item.poCdd);
                                const today = new Date();
                                const timeDiff = deadlineDate.getTime() - today.getTime();
                                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

                                if (daysDiff < 0) {
                                  return (
                                    <div className="text-left whitespace-nowrap flex-shrink-0">
                                      <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Days to Completion</div>
                                      <div className="text-xs sm:text-sm font-bold text-red-700">{Math.abs(daysDiff)} days overdue</div>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="text-left whitespace-nowrap flex-shrink-0">
                                      <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Days to Completion</div>
                                      <div className="text-xs sm:text-sm font-bold text-blue-700">{daysDiff} days to go</div>
                                    </div>
                                  );
                                }
                              } catch (error) {
                                return (
                                  <div className="text-left whitespace-nowrap flex-shrink-0">
                                    <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Days to Completion</div>
                                    <div className="text-xs sm:text-sm font-bold text-gray-600">No deadline set</div>
                                  </div>
                                );
                              }
                            } else {
                              return (
                                <div className="text-left whitespace-nowrap flex-shrink-0">
                                  <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Days to Completion</div>
                                  <div className="text-xs sm:text-sm font-bold text-gray-600">No deadline set</div>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Progress Image Section */}
                  <div className="mb-4">
                    {editingEquipmentId === item.id ? (
                      // Edit Mode - Upload new progress image
                      <div className="space-y-3">
                        <div className="text-xs font-medium text-gray-700">Progress Image</div>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(file);
                              e.target.value = '';
                            }}
                            className="hidden"
                            id={`standalone-progress-img-camera-${item.id}`}
                          />
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(file);
                              e.target.value = '';
                            }}
                            className="hidden"
                            id={`standalone-progress-img-gallery-${item.id}`}
                          />
                          <div className="flex flex-row gap-2 justify-center flex-wrap">
                            <label htmlFor={`standalone-progress-img-camera-${item.id}`} className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50" onClick={e => e.stopPropagation()}>
                              <Camera size={16} />
                              Camera
                            </label>
                            <label htmlFor={`standalone-progress-img-gallery-${item.id}`} className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50" onClick={e => e.stopPropagation()}>
                              <Image size={16} />
                              Gallery
                            </label>
                          </div>
                          {newProgressImage && (
                            <div className="text-xs text-green-600 mt-2">
                              Selected: {newProgressImage.name}
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            placeholder="Describe what this image shows..."
                            value={imageDescription}
                            onChange={(e) => setImageDescription(e.target.value)}
                            className="text-sm pr-10"
                          />
                          <button
                            type="button"
                            onClick={isImageRecording ? stopImageAudioRecording : startImageAudioRecording}
                            className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded transition-colors ${isImageRecording
                                ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                                : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                              }`}
                            title={isImageRecording ? "Stop recording" : "Add audio description"}
                          >
                            {isImageRecording ? (
                              <MicOff className="w-4 h-4" />
                            ) : (
                              <Mic className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {/* Recording Status */}
                        {isImageRecording && (
                          <div className="flex items-center gap-2 mt-2 px-2 py-1 bg-red-50 rounded-md border border-red-200">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-red-600 font-medium">
                              Recording... {formatDuration(imageRecordingDuration)}
                            </span>
                          </div>
                        )}

                        {imageAudioChunks.length > 0 && !isImageRecording && (
                          <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-green-50 rounded-md border border-green-200">
                            <button
                              onClick={() => {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  playImageAudio(reader.result as string);
                                };
                                reader.readAsDataURL(imageAudioChunks[0]);
                              }}
                              className="flex items-center justify-center w-6 h-6 bg-green-500 hover:bg-green-600 rounded-full text-white transition-colors"
                              title="Play audio"
                            >
                              <Play className="w-3 h-3 ml-0.5" />
                            </button>
                            <div className="flex-1">
                              <span className="text-xs text-green-600 font-medium">
                                Audio recorded ({formatDuration(imageRecordingDuration)})
                              </span>
                            </div>
                            <button
                              onClick={removeImageAudio}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                              title="Remove audio"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      // View Mode - Show progress image
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-gray-700">Progress Image</div>
                        {item.progressImages && item.progressImages.length > 0 ? (
                          <div className="space-y-2">
                            {/* Progress Image Display with Navigation */}
                            <div className="relative">
                              {(() => {
                                const currentIndex = currentProgressImageIndex[item.id] || 0;
                                const currentImage = item.progressImages[currentIndex];


                                if (!currentImage) {
                                  return (
                                    <div className="w-full h-40 sm:h-52 md:h-64 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center min-h-0">
                                      <div className="text-center text-gray-500">
                                        <Camera size={24} className="mx-auto mb-2" />
                                        <div className="text-sm">Image not found</div>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div 
                                    className="relative cursor-pointer group"
                                    onClick={() => {
                                      setShowImagePreview({ url: currentImage, equipmentId: item.id, currentIndex: currentIndex });
                                    }}
                                  >
                                    <img
                                      src={currentImage}
                                      alt="Progress"
                                      className="w-full max-w-full h-40 sm:h-52 md:h-64 object-cover rounded-lg border border-gray-200 pointer-events-none"
                                    />

                                    {/* Eye Button */}
                                    <button
                                      className="absolute top-2 right-2 bg-white text-gray-800 p-1 rounded text-xs z-20 border border-gray-300 shadow-sm hover:bg-gray-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowImagePreview({ url: currentImage, equipmentId: item.id, currentIndex: currentIndex });
                                      }}
                                      title="View larger image"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>

                                    {/* Navigation arrows for multiple images */}
                                    {item.progressImages.length > 1 && (
                                      <>
                                        <button
                                          className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all z-10"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const prevIndex = currentIndex > 0 ? currentIndex - 1 : item.progressImages.length - 1;
                                            setCurrentProgressImageIndex(prev => ({
                                              ...prev,
                                              [item.id]: prevIndex
                                            }));
                                          }}
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                          </svg>
                                        </button>
                                        <button
                                          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all z-10"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const nextIndex = currentIndex < item.progressImages.length - 1 ? currentIndex + 1 : 0;
                                            setCurrentProgressImageIndex(prev => ({
                                              ...prev,
                                              [item.id]: nextIndex
                                            }));
                                          }}
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                          </svg>
                                        </button>
                                      </>
                                    )}

                                    {/* Image counter */}
                                    <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded z-10 pointer-events-none">
                                      {currentIndex + 1} of {item.progressImages.length}
                                    </div>

                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded-lg flex items-center justify-center pointer-events-none">
                                      <Eye size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>


                          </div>
                        ) : (
                          <div className="w-full h-40 sm:h-52 md:h-64 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center min-h-0">
                            <div className="text-center text-gray-500">
                              <Camera size={24} className="mx-auto mb-2" />
                              <div className="text-sm">No progress image</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className="flex-1 min-w-0 pr-2">
                      <h3 className="font-semibold text-foreground truncate text-xs sm:text-sm md:overflow-visible md:whitespace-normal min-w-0">
                        {item.manufacturingSerial || item.name || (item.type === 'Distillation Column' ? 'Column' : item.type)}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-muted-foreground min-w-0 truncate md:overflow-visible md:whitespace-normal">Tag: {item.tagNumber || 'â€"'}</p>
                      <div className="flex flex-col gap-1 mt-1 text-[11px] sm:text-xs text-gray-500 min-w-0">
                        <span className="truncate md:overflow-visible md:whitespace-normal">Job: {item.jobNumber || 'â€"'}</span>
                        <span className="truncate md:overflow-visible md:whitespace-normal">Type: {item.type === 'Distillation Column' ? 'Column' : (item.type || '—')}</span>
                      </div>
                    </div>

                    {/* Phase Status Dropdown */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <Select
                        value={item.progressPhase}
                        onValueChange={(value) => handleProgressPhaseChange(item.id, value as 'documentation' | 'manufacturing' | 'testing' | 'dispatched')}
                        disabled={loadingStates[`phase-${item.id}`] || currentUserRole === 'vdcr_manager' || currentUserRole === 'viewer' || currentUserRole === 'editor'}
                      >
                        <SelectTrigger className="w-28 sm:w-32 md:w-36 h-7 text-xs">
                          <SelectValue />
                          {loadingStates[`phase-${item.id}`] && (
                            <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="documentation">Documentation</SelectItem>
                          <SelectItem value="manufacturing">Manufacturing</SelectItem>
                          <SelectItem value="testing">Testing</SelectItem>
                          <SelectItem value="dispatched">Dispatched</SelectItem>
                        </SelectContent>
                      </Select>
                      {/* Any Personal Title- Capsule UI below status dropdown */}
                      {item.certificationTitle && (
                        <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                          {item.certificationTitle}
                        </span>
                      )}
                    </div>
                  </div>






                  <Tabs defaultValue="overview" className="w-full flex-1 flex flex-col">
                    <div className="overflow-x-auto overflow-y-hidden scroll-smooth -mx-1 px-1 md:mx-0 md:px-0 scrollbar-hide md:overflow-visible">
                      <TabsList className="flex md:grid md:w-full md:grid-cols-5 h-8 sm:h-9 min-w-max md:min-w-0 gap-1 md:gap-0 flex-nowrap md:flex-none justify-start md:justify-stretch">
                        <TabsTrigger value="overview" className="text-xs px-2 sm:px-3 whitespace-nowrap flex-shrink-0">Overview</TabsTrigger>
                        <TabsTrigger value="technical" className="text-xs px-2 sm:px-3 whitespace-nowrap flex-shrink-0">Technical</TabsTrigger>
                        <TabsTrigger value="team" className="text-xs px-2 sm:px-3 whitespace-nowrap flex-shrink-0">Team</TabsTrigger>
                        <TabsTrigger value="progress" className="text-xs px-2 sm:px-3 whitespace-nowrap flex-shrink-0">Updates</TabsTrigger>
                        <TabsTrigger
                          value="documents"
                          className="text-xs px-2 sm:px-3 whitespace-nowrap flex-shrink-0"
                          onClick={() => handleDocsTabClick(item.id)}
                        >
                          Docs
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="overview" className="mt-3 sm:mt-4 space-y-3">
                      {editingEquipmentId === item.id ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <Label className="text-xs text-gray-600">Size</Label>
                              <Input
                                placeholder="e.g., 4.2m x 1.6m"
                                value={editFormData.size ?? ''}
                                onChange={(e) => setEditFormData({...editFormData, size: e.target.value})}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Dimensions (length Ã— width Ã— height)</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-600">Material</Label>
                              <Input
                                placeholder="e.g., SS 304, Carbon Steel"
                                value={editFormData.material ?? ''}
                                onChange={(e) => setEditFormData({...editFormData, material: e.target.value})}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Primary material specification</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-600">Design Code</Label>
                              <Input
                                placeholder="e.g., ASME VIII Div 1, TEMA Class R"
                                value={editFormData.designCode ?? ''}
                                onChange={(e) => setEditFormData({...editFormData, designCode: e.target.value})}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Applicable design standard</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-gray-600">Last Updated On</Label>
                              <Input
                                type="date"
                                value={overviewLastUpdateRaw[item.id] || ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setOverviewLastUpdateRaw(prev => ({ ...prev, [item.id]: raw }));
                                  setEditFormData({
                                    ...editFormData,
                                    lastUpdate: raw ? formatDateDisplay(raw) : ''
                                  });
                                }}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Reference date shown to the team</p>
                              {overviewLastUpdateRaw[item.id] && (
                                <p className="text-[11px] text-blue-500 mt-1">
                                  {formatDateDisplay(overviewLastUpdateRaw[item.id])}
                                </p>
                              )}
                            </div>
                            <div>
                              <Label className="text-xs text-gray-600">Next Milestone Date</Label>
                              <Input
                                type="date"
                                value={overviewNextMilestoneDate[item.id] || ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setOverviewNextMilestoneDate(prev => ({ ...prev, [item.id]: raw }));
                                  setEditFormData({
                                    ...editFormData,
                                    nextMilestoneDate: raw ? new Date(raw).toISOString() : undefined
                                  });
                                }}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Pick the milestone date from the calendar</p>
                              {overviewNextMilestoneDate[item.id] && (
                                <p className="text-[11px] text-blue-500 mt-1">
                                  {formatDateDisplay(overviewNextMilestoneDate[item.id])}
                                </p>
                              )}
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-gray-600">Next Milestone Title / Summary</Label>
                            <Input
                              placeholder="e.g., Hydro Test"
                              value={editFormData.nextMilestone ?? ''}
                              onChange={(e) => setEditFormData({...editFormData, nextMilestone: e.target.value})}
                              className="text-xs h-8"
                            />
                            <p className="text-[11px] text-gray-400 mt-1">Short description that appears with the milestone date</p>
                          </div>
                          <div>
                            <Label className="text-xs text-gray-600">Update Description / Notes</Label>
                            <Textarea
                              placeholder="Share the latest progress, issues, or any client-facing summary"
                              value={editFormData.notes ?? ''}
                              onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                              className="text-xs min-h-[88px]"
                            />
                            <p className="text-[11px] text-gray-400 mt-1">This summary will surface in the overview snapshot</p>
                          </div>
                        </div>
                      ) : (
                        (() => {
                          const sizeValue = item.size && item.size.trim() !== '' ? item.size : 'â€”';
                          const materialValue = item.material && item.material.trim() !== '' ? item.material : 'â€”';
                          const designCodeValue = item.designCode && item.designCode.trim() !== '' ? item.designCode : 'â€”';
                          const equipmentEntries = progressEntries[item.id] || item.progressEntries || [];
                          const latestEntry = equipmentEntries.length > 0 ? equipmentEntries[equipmentEntries.length - 1] : null;
                          // Get lastUpdate value - prioritize last_update (DATE column) over other fields
                          // For standalone equipment, we want to show only date, so prioritize last_update field
                          // Check both last_update (database column) and lastUpdate (transformed field)
                          const lastUpdateRaw = (item as any).last_update || item.lastUpdate || null;
                          const updatedAtRaw = (item as any).updated_at || null;
                          
                          // Format to show only date (no time) - always extract date part from timestamp
                          let lastUpdatedValue = 'â€"';
                          
                          // Helper function to extract date only from any date/timestamp string
                          const extractDateOnly = (dateValue: any): string => {
                            if (!dateValue) return '';
                            const dateStr = String(dateValue);
                            // Remove time part - handle both ISO format (T separator) and space separator
                            let dateOnly = dateStr.split('T')[0].split(' ')[0];
                            // Ensure it's in YYYY-MM-DD format (should be 10 characters)
                            if (dateOnly.length >= 10) {
                              dateOnly = dateOnly.substring(0, 10);
                            }
                            return dateOnly;
                          };
                          
                          // Helper function to format date for display
                          const formatDateForDisplay = (dateValue: any): string => {
                            if (!dateValue) return 'â€"';
                            try {
                              const dateOnly = extractDateOnly(dateValue);
                              if (dateOnly && dateOnly.length === 10) {
                                return formatDateDisplay(dateOnly);
                              }
                            } catch (error) {
                              console.error('Error formatting date:', error, dateValue);
                            }
                            return 'â€"';
                          };
                          
                          // Priority: last_update (DATE column) > lastUpdate (transformed) > updated_at (timestamp) > latestEntry
                          if (lastUpdateRaw) {
                            // lastUpdateRaw could be a date string (YYYY-MM-DD) or already formatted date
                            // Check if it's already formatted (contains month name like "Dec")
                            if (String(lastUpdateRaw).match(/[A-Za-z]{3}/)) {
                              // Already formatted, use as is
                              lastUpdatedValue = String(lastUpdateRaw);
                            } else {
                              // Extract date and format
                              lastUpdatedValue = formatDateForDisplay(lastUpdateRaw);
                            }
                          } else if (updatedAtRaw) {
                            // Fallback to updated_at, but extract date only
                            lastUpdatedValue = formatDateForDisplay(updatedAtRaw);
                          } else if (latestEntry?.date || latestEntry?.created_at) {
                            // Fallback to latest entry date, but format to show only date
                            const fallbackDate = latestEntry.date || latestEntry.created_at;
                            lastUpdatedValue = formatDateForDisplay(fallbackDate);
                          }
                          const updateDescription =
  (item.notes && item.notes.trim() !== '' ? item.notes : '') ||
  latestEntry?.text || latestEntry?.comment || latestEntry?.entry_text ||
  (item.nextMilestone && item.nextMilestone.trim() !== '' ? item.nextMilestone : '') ||
  'No recent update details shared yet.';

                          return (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Size</div>
                                  <div className="text-sm font-semibold text-gray-900">{sizeValue}</div>
                                  <div className="text-[11px] text-gray-400 mt-1">Dimensions (L Ã— W Ã— H)</div>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Material</div>
                                  <div className="text-sm font-semibold text-gray-900">{materialValue}</div>
                                  <div className="text-[11px] text-gray-400 mt-1">Primary specification</div>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Design Code</div>
                                  <div className="text-sm font-semibold text-gray-900">{designCodeValue}</div>
                                  <div className="text-[11px] text-gray-400 mt-1">Applicable standard</div>
                                </div>
                              </div>
                              {/* Front display: Last Updated / Next Milestone / update message — commented out
                              <div className="p-4 rounded-lg border border-blue-100 bg-blue-50">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                  <div>
                                    <div className="text-[11px] uppercase tracking-wide text-blue-600">Last Updated</div>
                                    <div className="text-sm font-semibold text-gray-900 mt-1">
                                      {(() => {
                                        // Final safeguard: ensure we never display raw timestamps
                                        if (!lastUpdatedValue || lastUpdatedValue === 'â€"' || lastUpdatedValue === '—') return '—';
                                        
                                        const valueStr = String(lastUpdatedValue);
                                        
                                        // Check if it's a raw timestamp (contains T, +, or multiple colons)
                                        const isTimestamp = valueStr.includes('T') || 
                                                           (valueStr.includes('+') && valueStr.length > 15) || 
                                                           (valueStr.match(/:/g) && valueStr.match(/:/g)!.length >= 2);
                                        
                                        if (isTimestamp) {
                                          try {
                                            // Extract date part from timestamp
                                            let dateOnly = valueStr.split('T')[0].split(' ')[0];
                                            // Remove timezone info if present
                                            dateOnly = dateOnly.split('+')[0].split('-').slice(0, 3).join('-');
                                            // Ensure it's YYYY-MM-DD format
                                            if (dateOnly.length >= 10) {
                                              dateOnly = dateOnly.substring(0, 10);
                                            }
                                            if (dateOnly && dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                              return formatDateDisplay(dateOnly);
                                            }
                                          } catch (error) {
                                            console.error('Error extracting date from timestamp:', error, valueStr);
                                          }
                                          return '—';
                                        }
                                        
                                        // If it's already a formatted date (contains month name), use as is
                                        if (valueStr.match(/[A-Za-z]{3}/)) {
                                          return lastUpdatedValue;
                                        }
                                        
                                        // If it's a date string in YYYY-MM-DD format, format it
                                        if (valueStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                                          try {
                                            return formatDateDisplay(valueStr.substring(0, 10));
                                          } catch {
                                            return lastUpdatedValue;
                                          }
                                        }
                                        
                                        // Default: return as is (should already be formatted)
                                        return lastUpdatedValue;
                                      })()}
                                    </div>
                                  </div>
                                  {(item.nextMilestone && item.nextMilestone.trim() !== '') || item.nextMilestoneDate ? (
                                    <div className="text-left sm:text-right">
                                      <div className="text-[11px] uppercase tracking-wide text-blue-500">Next Milestone</div>
                                      {item.nextMilestone && item.nextMilestone.trim() !== '' && (
                                        <div className="text-xs font-medium text-blue-700 mt-1">{item.nextMilestone}</div>
                                      )}
                                      {item.nextMilestoneDate && (
                                        <div className="text-[11px] text-blue-500 mt-1">
                                          {formatDateDisplay(item.nextMilestoneDate)}
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="mt-3 p-3 rounded-md bg-white/70 border border-blue-100 text-xs text-blue-700 leading-relaxed">
                                  {updateDescription}
                                </div>
                              </div>
                              */}
                            </>
                          );
                        })()
                      )}
                    </TabsContent>

                    <TabsContent value="technical" className="mt-3 sm:mt-4 space-y-2 flex-1 flex flex-col">
                      <div className="space-y-2 text-xs sm:text-sm flex-1 flex flex-col">
                        {/* Technical Section Buttons */}
                        <div className="overflow-x-auto overflow-y-hidden scroll-smooth mb-4 -mx-1 px-1">
                          <div className="flex flex-nowrap sm:flex-wrap gap-2 min-w-max sm:min-w-0">
                            {technicalSections[item.id] && technicalSections[item.id].length > 0 && (
                              <>
                                {technicalSections[item.id].map((section) => (
                                  <Button
                                    key={section.name}
                                    variant={selectedSection[item.id] === section.name ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setSelectedSection(prev => ({ ...prev, [item.id]: section.name }))}
                                    onDoubleClick={() => {
                                      setEditingEquipmentId(item.id);
                                      setEditingSectionName(section.name);
                                      setEditingSectionOldName(section.name);
                                      setIsEditSectionModalOpen(true);
                                    }}
                                    className={`text-xs sm:text-sm px-3 py-1.5 sm:py-1 h-8 sm:h-7 whitespace-nowrap flex-shrink-0 ${selectedSection[item.id] === section.name
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white text-gray-700 border-gray-300'
                                      }`}
                                  >
                                    {section.name}
                                  </Button>
                                ))}
                              </>
                            )}
                            {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && currentUserRole !== 'editor' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingEquipmentId(item.id);
                                  setIsAddSectionModalOpen(true);
                                }}
                                className="text-xs sm:text-sm px-3 py-1.5 sm:py-1 h-8 sm:h-7 bg-green-100 text-green-700 border-green-300 hover:bg-green-200 whitespace-nowrap flex-shrink-0"
                              >
                                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                                Add Section
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Selected Section Details */}
                        {technicalSections[item.id] && technicalSections[item.id].length > 0 ? (
                          (() => {
                            // Auto-select first section if no section is selected
                            const currentSectionName = selectedSection[item.id] || technicalSections[item.id][0]?.name;
                            const currentSection = technicalSections[item.id].find(s => s.name === currentSectionName);

                            // Update selected section if not set
                            if (!selectedSection[item.id] && technicalSections[item.id].length > 0) {
                              setSelectedSection(prev => ({ ...prev, [item.id]: technicalSections[item.id][0].name }));
                            }

                            return currentSection ? (
                              <div className="space-y-3">
                                {(() => {
                                  const currentSection = technicalSections[item.id]?.find(s => s.name === selectedSection[item.id]);
                                  if (!currentSection) return null;
                                  return (
                                    <>
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3">
                                        <h4 className="text-sm font-semibold text-gray-900">{currentSection.name}</h4>
                                        {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && currentUserRole !== 'editor' && (
                                          <div className="flex flex-row gap-2 flex-nowrap">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => {
                                                setShowAddFieldInputs(prev => ({ ...prev, [item.id]: true }));
                                                setNewFieldName('');
                                                setNewFieldValue('');
                                              }}
                                              className="text-xs px-2 sm:px-3 py-1 h-7 bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap flex-shrink-0"
                                            >
                                              <Plus className="w-3 h-3 sm:mr-1" />
                                              <span className="hidden sm:inline">Add Custom Field</span>
                                              <span className="sm:hidden">Add Custom Field</span>
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={async () => {
                                                if (isEditMode[item.id]) {
                                                  // Done Editing - Save changes directly to database
                                                  try {
                                                    // 🔧 FIX: Use updateStandaloneEquipment for standalone equipment
                                                    await fastAPI.updateStandaloneEquipment(item.id, {
                                                      technical_sections: technicalSections[item.id] || []
                                                    }, user?.id);

                                                    toast({
                                                      title: "Success",
                                                      description: "Custom fields updated successfully",
                                                    });
                                                  } catch (error) {
                                                    console.error('Error saving custom fields:', error);
                                                    toast({
                                                      title: "Error",
                                                      description: "Failed to save custom fields",
                                                      variant: "destructive",
                                                    });
                                                  }
                                                }
                                                
                                                setIsEditMode(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                                setShowAddFieldInputs(prev => ({ ...prev, [item.id]: false }));
                                              }}
                                              className="text-xs px-2 sm:px-3 py-1 h-7 bg-green-600 text-white hover:bg-green-700 whitespace-nowrap flex-shrink-0"
                                            >
                                              <Edit className="w-3 h-3 sm:mr-1" />
                                              <span className="hidden sm:inline">{isEditMode[item.id] ? 'Done Editing' : 'Edit Custom Field'}</span>
                                              <span className="sm:hidden">{isEditMode[item.id] ? 'Done Editing' : 'Edit Custom Field'}</span>
                                            </Button>
                                          </div>
                                        )}
                                      </div>

                                      {/* Add Field Inputs */}
                                      {showAddFieldInputs[item.id] && (
                                        <div className="space-y-2 p-3 bg-gray-50 rounded-md border">
                                          <div className="flex gap-2">
                                            <Input
                                              placeholder="Field name (e.g., Pressure)"
                                              value={newFieldName}
                                              onChange={(e) => setNewFieldName(e.target.value)}
                                              className="text-xs h-7"
                                            />
                                            <Input
                                              placeholder="Field value (e.g., 150 PSI)"
                                              value={newFieldValue}
                                              onChange={(e) => setNewFieldValue(e.target.value)}
                                              className="text-xs h-7"
                                            />
                                          </div>
                                          {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && currentUserRole !== 'editor' && (
                                            <div className="flex gap-2">
                                              <Button
                                                size="sm"
                                                onClick={async () => {
                                                  // Capture field values before clearing
                                                  const fieldNameToSave = newFieldName.trim();
                                                  const fieldValueToSave = newFieldValue.trim();
                                                  
                                                  // Clear fields immediately but keep form open for next entry
                                                  setNewFieldName('');
                                                  setNewFieldValue('');

                                                  if (fieldNameToSave) {
                                                    const newField = { name: fieldNameToSave, value: fieldValueToSave };
                                                    const currentSection = selectedSection[item.id];

                                                    if (currentSection) {
                                                      // Update technical sections with new custom field
                                                      const updatedSections = (technicalSections[item.id] || []).map(section =>
                                                        section.name === currentSection
                                                          ? { ...section, customFields: [...section.customFields, newField] }
                                                          : section
                                                      );

                                                      // Update local state
                                                      setTechnicalSections(prev => ({
                                                        ...prev,
                                                        [item.id]: updatedSections
                                                      }));

                                                      // Save to database using the same API as main save
                                                      try {
                                                        // 🔧 FIX: Use updateStandaloneEquipment for standalone equipment
                                                        await fastAPI.updateStandaloneEquipment(item.id, {
                                                          technical_sections: updatedSections
                                                        }, user?.id);

                                                        // Refresh data to ensure UI reflects saved changes
                                                        await refreshEquipmentData();

                                                        toast({
                                                          title: "Success",
                                                          description: "Custom field added successfully",
                                                        });
                                                      } catch (error) {
                                                        console.error('Error saving custom field:', error);
                                                        toast({
                                                          title: "Error",
                                                          description: "Failed to save custom field",
                                                          variant: "destructive",
                                                        });
                                                      }
                                                    }
                                                  }
                                                }}
                                                className="text-xs px-3 py-1 h-6 bg-green-600 text-white hover:bg-green-700"
                                              >
                                                <Check className="w-3 h-3 mr-1" />
                                                Save
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                  setShowAddFieldInputs(prev => ({ ...prev, [item.id]: false }));
                                                  setNewFieldName('');
                                                  setNewFieldValue('');
                                                }}
                                                className="text-xs px-3 py-1 h-6"
                                              >
                                                <X className="w-3 h-3 mr-1" />
                                                Cancel
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Display Custom Fields */}
                                      {(() => {
                                        const currentSection = technicalSections[item.id]?.find(s => s.name === selectedSection[item.id]);
                                        const sectionFields = currentSection?.customFields || [];

                                        return sectionFields.length > 0 ? (
                                          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 max-h-[200px] sm:max-h-64 overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]`}>
                                            {sectionFields.map((field, index) => (
                                              <div key={index} className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 gap-2">
                                                {isEditMode[item.id] ? (
                                                  <div className="flex-1 flex gap-2">
                                                    <Input
                                                      value={field.name}
                                                      onChange={async (e) => {
                                                        const updatedSections = (technicalSections[item.id] || []).map(section =>
                                                          section.name === selectedSection[item.id]
                                                            ? {
                                                              ...section,
                                                              customFields: section.customFields.map((f, i) =>
                                                                i === index ? { ...f, name: e.target.value } : f
                                                              )
                                                            }
                                                            : section
                                                        );
                                                        setTechnicalSections(prev => ({
                                                          ...prev,
                                                          [item.id]: updatedSections
                                                        }));

                                                        // Save to database immediately
                                                        try {
                                                          await fastAPI.updateStandaloneEquipment(item.id, {
                                                            technical_sections: updatedSections
                                                          }, user?.id);
                                                          // // console.log('âœ… Field name saved to database, refreshing data...');
                                                          await refreshEquipmentData();
                                                        } catch (error) {
                                                          console.error('Error saving field name change:', error);
                                                        }
                                                      }}
                                                      className="text-xs h-7"
                                                    />
                                                    <Input
                                                      value={field.value}
                                                      onChange={async (e) => {
                                                        const updatedSections = (technicalSections[item.id] || []).map(section =>
                                                          section.name === selectedSection[item.id]
                                                            ? {
                                                              ...section,
                                                              customFields: section.customFields.map((f, i) =>
                                                                i === index ? { ...f, value: e.target.value } : f
                                                              )
                                                            }
                                                            : section
                                                        );
                                                        setTechnicalSections(prev => ({
                                                          ...prev,
                                                          [item.id]: updatedSections
                                                        }));

                                                        // Save to database immediately
                                                        try {
                                                          await fastAPI.updateStandaloneEquipment(item.id, {
                                                            technical_sections: updatedSections
                                                          }, user?.id);
                                                          // // console.log('âœ… Field value saved to database, refreshing data...');
                                                          await refreshEquipmentData();
                                                        } catch (error) {
                                                          console.error('Error saving field value change:', error);
                                                        }
                                                      }}
                                                      className="text-xs h-7"
                                                    />
                                                  </div>
                                                ) : (
                                                  <span className="text-gray-800 font-medium text-xs sm:text-sm break-words">{field.name}: <span className="text-gray-600 font-normal">{field.value}</span></span>
                                                )}
                                                {isEditMode[item.id] && currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && currentUserRole !== 'editor' && (
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={async () => {
                                                      const updatedSections = (technicalSections[item.id] || []).map(section =>
                                                        section.name === selectedSection[item.id]
                                                          ? { ...section, customFields: section.customFields.filter((_, i) => i !== index) }
                                                          : section
                                                      );

                                                      // Update local state
                                                      setTechnicalSections(prev => ({
                                                        ...prev,
                                                        [item.id]: updatedSections
                                                      }));

                                                      // Save to database
                                                      try {
                                                        // // console.log('ðŸ—‘ï¸ Deleting custom field from database:', item.id, updatedSections);
                                                        await fastAPI.updateStandaloneEquipment(item.id, {
                                                          technical_sections: updatedSections
                                                        }, user?.id);
                                                        // // console.log('âœ… Custom field deleted successfully');
                                                        toast({
                                                          title: "Success",
                                                          description: "Custom field deleted successfully",
                                                        });
                                                      } catch (error) {
                                                        console.error('Error deleting custom field:', error);
                                                        toast({
                                                          title: "Error",
                                                          description: "Failed to delete custom field",
                                                          variant: "destructive",
                                                        });
                                                      }
                                                    }}
                                                    className="text-xs p-1 h-6 w-6 hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors duration-200"
                                                  >
                                                    <X className="w-4 h-4" />
                                                  </Button>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-center py-8 text-gray-500 text-sm bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                            <div className="flex flex-col items-center gap-2">
                                              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                                                <Plus className="w-6 h-6 text-gray-400" />
                                              </div>
                                              <p>No technical specifications added yet.</p>
                                              <p className="text-xs text-gray-400">Click "Add Custom Field" to add specifications.</p>
                                            </div>
                                          </div>
                                        );
                                      })()}

                                      {/* New section info removed - using new structure */}

                                    </>
                                  );
                                })()}
                              </div>
                            ) : null;
                          })()
                        ) : (
                          <div className="text-center py-8 text-gray-500 text-sm">
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                                <Plus className="w-6 h-6 text-gray-400" />
                              </div>
                              <p>Please add section first</p>
                              <p className="text-xs text-gray-400">Click "+ Add Section" to create a new technical section.</p>
                            </div>
                          </div>
                        )}

                      </div>
                    </TabsContent>

                    <TabsContent value="team" className="mt-3 sm:mt-4 space-y-2 flex-1 flex flex-col">
                      <div className="space-y-2 text-xs sm:text-sm flex-1 flex flex-col">
                        {editingEquipmentId === item.id ? (
                          // Edit Mode
                          <div className="space-y-3">
                            {false && item.customTeamPositions && item.customTeamPositions.length > 0 && (
                              <div className="space-y-4">
                                <h4 className="text-sm font-medium text-gray-700">Custom Team Positions</h4>
                                {item.customTeamPositions.map((pos, index) => (
                                  <div key={pos.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <Label className="text-xs text-gray-600">Position</Label>
                                        <Input
                                          value={pos.position}
                                          onChange={(e) => {
                                            const updatedPositions = [...(item.customTeamPositions || [])];
                                            updatedPositions[index] = { ...updatedPositions[index], position: e.target.value };
                                            setLocalEquipment(prev => prev.map(eq =>
                                              eq.id === item.id
                                                ? { ...eq, customTeamPositions: updatedPositions }
                                                : eq
                                            ));
                                          }}
                                          className="text-xs h-8"
                                          placeholder="Position name"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-gray-600">Name</Label>
                                        <Input
                                          value={pos.name}
                                          onChange={(e) => {
                                            const updatedPositions = [...(item.customTeamPositions || [])];
                                            updatedPositions[index] = { ...updatedPositions[index], name: e.target.value };
                                            setLocalEquipment(prev => prev.map(eq =>
                                              eq.id === item.id
                                                ? { ...eq, customTeamPositions: updatedPositions }
                                                : eq
                                            ));
                                          }}
                                          className="text-xs h-8"
                                          placeholder="Person name"
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 mt-2">
                                      <div>
                                        <Label className="text-xs text-gray-600">Email</Label>
                                        <Input
                                          value={pos.email || ''}
                                          onChange={(e) => {
                                            const updatedPositions = [...(item.customTeamPositions || [])];
                                            updatedPositions[index] = { ...updatedPositions[index], email: e.target.value };
                                            setLocalEquipment(prev => prev.map(eq =>
                                              eq.id === item.id
                                                ? { ...eq, customTeamPositions: updatedPositions }
                                                : eq
                                            ));
                                          }}
                                          className="text-xs h-8"
                                          placeholder="Email"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-gray-600">Phone</Label>
                                        <Input
                                          value={pos.phone || ''}
                                          onChange={(e) => {
                                            const updatedPositions = [...(item.customTeamPositions || [])];
                                            updatedPositions[index] = { ...updatedPositions[index], phone: e.target.value };
                                            setLocalEquipment(prev => prev.map(eq =>
                                              eq.id === item.id
                                                ? { ...eq, customTeamPositions: updatedPositions }
                                                : eq
                                            ));
                                          }}
                                          className="text-xs h-8"
                                          placeholder="Phone"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            

                            {/* Custom Team Positions List */}
                            {teamPositions[item.id] && teamPositions[item.id].length > 0 && (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-gray-700">Custom Team Positions:</div>
                                {teamPositions[item.id].map((pos) => (
                                  <div key={pos.id} className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-200">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <div className="text-xs font-medium text-green-800">{pos.position}</div>
                                        <Badge variant={pos.role === 'editor' ? 'default' : 'secondary'} className="text-xs">
                                          {pos.role}
                                        </Badge>
                                      </div>
                                      <div className="text-xs text-green-700">{pos.name}</div>
                                      {pos.email && (
                                        <div className="text-xs text-green-600">{pos.email}</div>
                                      )}
                                      {pos.phone && (
                                        <div className="text-xs text-green-600">{pos.phone}</div>
                                      )}
                                    </div>
                                    {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && currentUserRole !== 'editor' && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removeTeamPosition(item.id, pos.id)}
                                        className="text-red-600 hover:text-red-700 p-1 h-6 w-6"
                                      >
                                        <X size={12} />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          // View Mode - Show empty (team members will be shown in Team Custom Fields section)
                          null
                        )}

                        {/* Team Custom Fields Section */}
                        <div>
                          <div className="flex flex-row items-center justify-between gap-2 mb-2">
                            <div className="text-sm font-semibold text-gray-900">Team Custom Fields</div>
                            <div className="flex gap-2">
                              {/* Commented out buttons as requested */}
                              {/* <Button
                               size="sm"
                               variant="outline"
                               onClick={() => {
                              setShowAddTeamFieldInputs(prev => ({ ...prev, [item.id]: true }));
                              setNewTeamFieldName('');
                              setNewTeamFieldValue('');
                            }}
                            className="text-xs px-3 py-1 h-7 bg-blue-600 text-white hover:bg-blue-700"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add Custom Field
                             </Button>
                             <Button
                               size="sm"
                               variant="outline"
                               onClick={() => {
                              setIsEditTeamMode(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                              setShowAddTeamFieldInputs(prev => ({ ...prev, [item.id]: false }));
                            }}
                            className="text-xs px-3 py-1 h-7 bg-green-600 text-white hover:bg-green-700"
                          >
                            Edit Custom Field
                             </Button> */}

                              {/* Manage Team button that redirects to user settings */}
                              {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && currentUserRole !== 'editor' && (
                                <Button
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-7 sm:h-6 px-2 sm:px-3 whitespace-nowrap"
                                  onClick={() => {
                                    // Navigate to Settings tab in equipment details view
                                    setViewingEquipmentId(item.id);
                                    if (setEquipmentDetailsTab) {
                                      // Use setTimeout to ensure viewingEquipmentId is set first
                                      setTimeout(() => {
                                        setEquipmentDetailsTab('settings');
                                      }, 100);
                                    }
                                  }}
                                >
                                  <Plus size={12} className="w-3 h-3 mr-1" />
                                  Manage Team
                                </Button>
                              )}
                              {/* <Button
                               size="sm"
                               variant="outline"
                               onClick={() => {
                              setIsEditTeamMode(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                              setShowAddTeamFieldInputs(prev => ({ ...prev, [item.id]: false }));
                            }}
                            className="text-xs px-3 py-1 h-7 bg-green-600 text-white hover:bg-green-700"
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            {isEditTeamMode[item.id] ? 'Done Editing' : 'Edit Custom Field'}
                             </Button> */}
                            </div>
                          </div>

                          {/* Add Field Inputs */}
                          {showAddTeamFieldInputs[item.id] && (
                            <div className="space-y-2 p-3 bg-gray-50 rounded-md border mb-3">
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Field name (e.g., Team Lead)"
                                  value={newTeamFieldName}
                                  onChange={(e) => setNewTeamFieldName(e.target.value)}
                                  className="text-xs h-7"
                                />
                                <Select
                                  value={newTeamFieldValue}
                                  onValueChange={handleAddNewUser}
                                >
                                  <SelectTrigger className="text-xs h-7">
                                    <SelectValue placeholder="Select user" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allUsers.map((user) => (
                                      <SelectItem key={user.id} value={user.name || user.email}>
                                        {user.name || user.email}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="add_new_user" className="text-blue-600 font-medium">
                                      + Add New User
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    if (newTeamFieldName?.trim()) {
                                      const newField = { name: newTeamFieldName?.trim(), value: newTeamFieldValue?.trim() };

                                      // Update team custom fields
                                      const currentTeamFields = (teamCustomFields[item.id] || []);
                                      const updatedTeamFields = [...currentTeamFields, newField];

                                      // Update local state
                                      setTeamCustomFields(prev => ({
                                        ...prev,
                                        [item.id]: updatedTeamFields
                                      }));

                                      // Save to database
                                      try {
                                        // // console.log('ðŸ’¾ Saving team custom field to database:', item.id, updatedTeamFields);
                                        await fastAPI.updateStandaloneEquipment(item.id, {
                                          team_custom_fields: updatedTeamFields
                                        }, user?.id);
                                        // // console.log('âœ… Team custom field saved successfully');
                                        toast({
                                          title: "Success",
                                          description: "Team custom field added successfully",
                                        });
                                      } catch (error) {
                                        console.error('Error saving team custom field:', error);
                                        toast({
                                          title: "Error",
                                          description: "Failed to save team custom field",
                                          variant: "destructive",
                                        });
                                      }

                                      setNewTeamFieldName('');
                                      setNewTeamFieldValue('');
                                      setShowAddTeamFieldInputs(prev => ({ ...prev, [item.id]: false }));
                                    }
                                  }}
                                  className="text-xs px-3 py-1 h-6 bg-green-600 text-white hover:bg-green-700"
                                >
                                  <Check className="w-3 h-3 mr-1" />
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setShowAddTeamFieldInputs(prev => ({ ...prev, [item.id]: false }));
                                    setNewTeamFieldName('');
                                    setNewTeamFieldValue('');
                                  }}
                                  className="text-xs px-3 py-1 h-6"
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Display Team Custom Fields + Project Members */}
                          {(() => {
                            const teamFields = teamCustomFields[item.id] || [];
                            
                            // // console.log('ðŸ” Team tab - projectMembers:', projectMembers);
                            // // console.log('ðŸ” Team tab - equipment ID:', item.id);

                            // Find team members assigned to this equipment
                            const assignedMembers = projectMembers.filter(member => {
                              // // console.log('ðŸ” Checking member:', member.name, 'equipment_assignments:', member.equipment_assignments);
                              return member.equipment_assignments &&
                                (member.equipment_assignments.includes(item.id) ||
                                 member.equipment_assignments.includes("All Equipment"));
                            });
                            
                            // // console.log('ðŸ” Team tab - assignedMembers:', assignedMembers);

                            // Create combined list of custom fields and project members
                            const allTeamItems = [
                              // Add project members as team items
                              ...assignedMembers.map(member => ({
                                id: `member-${member.id}`,
                                name: member.position || 'Team Member',
                                value: member.name,
                                isProjectMember: true,
                                memberData: member
                              })),
                              // Add custom fields
                              ...teamFields.map((field, index) => ({
                                id: `custom-${index}`,
                                name: field.name,
                                value: field.value,
                                isProjectMember: false,
                                fieldIndex: index
                              }))
                            ];

                            return allTeamItems.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] sm:max-h-64 overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {allTeamItems.map((teamItem, index) => (
                                  <div key={teamItem.id} className="flex items-center justify-between px-4 py-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
                                    {isEditTeamMode[item.id] && !teamItem.isProjectMember ? (
                                      <div className="flex-1 flex gap-2">
                                        <Input
                                          value={teamItem.name}
                                          onChange={async (e) => {
                                            const updatedFields = [...teamFields];
                                            updatedFields[(teamItem as any).fieldIndex] = { ...updatedFields[(teamItem as any).fieldIndex], name: e.target.value };

                                            setTeamCustomFields(prev => ({
                                              ...prev,
                                              [item.id]: updatedFields
                                            }));

                                            // Save to database immediately
                                            try {
                                              // 🔧 FIX: Use updateStandaloneEquipment for standalone equipment
                                              await fastAPI.updateStandaloneEquipment(item.id, {
                                                team_custom_fields: updatedFields
                                              }, user?.id);
                                              await refreshEquipmentData();
                                            } catch (error) {
                                              console.error('Error saving team field name change:', error);
                                            }
                                          }}
                                          className="text-xs h-7"
                                        />
                                        <Select
                                          value={teamItem.value}
                                          onValueChange={(value) => handleEditAddNewUser(value, (teamItem as any).fieldIndex, teamFields)}
                                        >
                                          <SelectTrigger className="text-xs h-7">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {allUsers.map((user) => (
                                              <SelectItem key={user.id} value={user.name || user.email}>
                                                {user.name || user.email}
                                              </SelectItem>
                                            ))}
                                            <SelectItem value="add_new_user" className="text-blue-600 font-medium">
                                              + Add New User
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    ) : (
                                      <span className="text-gray-800 font-medium text-xs sm:text-sm break-words">{teamItem.name}: <span className="text-gray-600 font-normal">{teamItem.value}</span></span>
                                    )}
                                    {!teamItem.isProjectMember && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={async () => {
                                          const updatedFields = teamFields.filter((_, i) => i !== (teamItem as any).fieldIndex);

                                          // Update local state
                                          setTeamCustomFields(prev => ({
                                            ...prev,
                                            [item.id]: updatedFields
                                          }));

                                          // Save to database
                                          try {
                                            // // console.log('ðŸ—‘ï¸ Deleting team custom field from database:', item.id, updatedFields);
                                            await fastAPI.updateStandaloneEquipment(item.id, {
                                              team_custom_fields: updatedFields
                                            }, user?.id);
                                            // // console.log('âœ… Team custom field deleted successfully');
                                            toast({
                                              title: "Success",
                                              description: "Team custom field deleted successfully",
                                            });
                                          } catch (error) {
                                            console.error('Error deleting team custom field:', error);
                                            toast({
                                              title: "Error",
                                              description: "Failed to delete team custom field",
                                              variant: "destructive",
                                            });
                                          }
                                        }}
                                        className="text-xs p-1 h-6 w-6 hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors duration-200"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-gray-500 text-sm bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                <div className="flex flex-col items-center gap-2">
                                  <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                                    <Plus className="w-6 h-6 text-gray-400" />
                                  </div>
                                  <p>No team members or custom fields added yet.</p>
                                  <p className="text-xs text-gray-400">Add team members from Settings tab or click "Add Custom Field" to add fields.</p>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="progress" className="mt-3 sm:mt-4 space-y-2 flex-1 flex flex-col">
                      <div className="space-y-2 text-xs sm:text-sm flex-1 flex flex-col">
                        {(editingEquipmentId === item.id || addingProgressEntryForEquipment === item.id || editingProgressEntryForEquipment === item.id) ? (
                          // Edit Mode - Add/Edit Progress Entries
                          <div className="space-y-3">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium text-gray-700">
                                {editingProgressEntryId ? 'Edit Progress Entry' : 'Add Progress Entry'}
                              </h4>
                              {(editingProgressEntryId || addingProgressEntryForEquipment === item.id || editingProgressEntryForEquipment === item.id) && (
                                <button
                                  onClick={() => {
                                    setEditingProgressEntryId(null);
                                    setAddingProgressEntryForEquipment(null);
                                    setEditingProgressEntryForEquipment(null);
                                    setNewProgressType('general');
                                    setNewProgressEntry('');
                                    setNewProgressImage(null);
                                    setImageDescription('');
                                    setIsAddingCustomProgressType(false);
                                    setCustomProgressTypeName('');
                                    // Reset audio recording state
                                    setAudioChunks([]);
                                    setRecordingDuration(0);
                                    setIsRecording(false);
                                  }}
                                  className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                  {editingProgressEntryId ? 'Cancel Edit' : 'Cancel Add'}
                                </button>
                              )}
                            </div>

                            {/* 3 Inputs in a Row */}
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <Label className="text-xs text-gray-600">Progress Type</Label>
                                <Select
                                  value={newProgressType}
                                  onValueChange={(value) => {
                                    if (value === 'add-custom') {
                                      setIsAddingCustomProgressType(true);
                                      setNewProgressType('general'); // Temporary default
                                    } else {
                                      setIsAddingCustomProgressType(false);
                                      setCustomProgressTypeName('');
                                      setNewProgressType(value);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="text-xs h-8">
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="welding">Welding</SelectItem>
                                    <SelectItem value="material">Material</SelectItem>
                                    <SelectItem value="inspection">Inspection</SelectItem>
                                    <SelectItem value="assembly">Assembly</SelectItem>
                                    <SelectItem value="testing">Testing</SelectItem>
                                    <SelectItem value="general">General</SelectItem>
                                    <SelectItem value="comment">Comment</SelectItem>
                                    <SelectItem value="image">Image</SelectItem>
                                    {customProgressTypes.map((customType) => (
                                      <SelectItem key={customType} value={customType}>
                                        {customType}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="add-custom">+ Add Custom</SelectItem>
                                  </SelectContent>
                                </Select>
                                
                                {/* Custom Progress Type Input */}
                                {isAddingCustomProgressType && (
                                  <div className="mt-2 flex items-center space-x-2">
                                    <Input
                                      type="text"
                                      placeholder="Enter custom type name"
                                      value={customProgressTypeName}
                                      onChange={(e) => setCustomProgressTypeName(e.target.value)}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter' && customProgressTypeName.trim()) {
                                          const trimmedName = customProgressTypeName.trim();
                                          setNewProgressType(trimmedName);
                                          setCustomProgressTypes(prev => {
                                            if (!prev.includes(trimmedName)) {
                                              return [...prev, trimmedName];
                                            }
                                            return prev;
                                          });
                                          setIsAddingCustomProgressType(false);
                                          setCustomProgressTypeName('');
                                        }
                                      }}
                                      className="flex-1 min-w-[200px] text-xs h-8"
                                    />
                                    {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && (
                                      <>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            if (customProgressTypeName.trim()) {
                                              const trimmedName = customProgressTypeName.trim();
                                              setNewProgressType(trimmedName);
                                              setCustomProgressTypes(prev => {
                                                if (!prev.includes(trimmedName)) {
                                                  return [...prev, trimmedName];
                                                }
                                                return prev;
                                              });
                                              setIsAddingCustomProgressType(false);
                                              setCustomProgressTypeName('');
                                            }
                                          }}
                                          disabled={!customProgressTypeName.trim()}
                                          className="text-xs h-8 px-2"
                                        >
                                          Add
                                        </Button>
                                        {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setIsAddingCustomProgressType(false);
                                              setCustomProgressTypeName('');
                                              setNewProgressType('general');
                                            }}
                                            className="text-xs h-8 px-2"
                                          >
                                            Cancel
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">Comment</Label>
                                <Input
                                  placeholder="Enter progress details"
                                  value={newProgressEntry}
                                  onChange={(e) => setNewProgressEntry(e.target.value)}
                                  className="text-xs h-8"
                                />
                              </div>

                              {/* Audio Recording Section */}
                              {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && (
                                <div>
                                  <Label className="text-xs text-gray-600">Voice Message</Label>
                                  <div className="flex items-center gap-2 mt-1">
                                    {!isRecording ? (
                                      <button
                                        onClick={startAudioRecording}
                                        className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md border border-blue-200 text-xs font-medium transition-colors"
                                        title="Start voice recording"
                                      >
                                        <Mic className="w-4 h-4" />
                                        Record Voice
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={stopAudioRecording}
                                          className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-xs font-medium transition-colors"
                                          title="Stop recording"
                                        >
                                          <MicOff className="w-4 h-4" />
                                          Stop Recording
                                        </button>
                                        <div className="flex items-center gap-2 px-2 py-1 bg-red-50 rounded-md border border-red-200">
                                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                          <span className="text-xs text-red-600 font-medium">
                                            {formatDuration(recordingDuration)}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                    {audioChunks.length > 0 && (
                                      <div className="flex items-center gap-2 px-2 py-1 bg-green-50 rounded-md border border-green-200">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span className="text-xs text-green-600 font-medium">
                                          Voice recorded ({formatDuration(recordingDuration)})
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              <div>
                                <Label className="text-xs text-gray-600">Image</Label>
                                <div className="space-y-2">
                                  {/* Show existing image preview when editing */}
                                  {editingProgressEntryId && typeof newProgressImage === 'string' && newProgressImage && (
                                    <div className="relative">
                                      <img
                                        src={newProgressImage}
                                        alt="Existing progress image"
                                        className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                                      />
                                      {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && (
                                        <button
                                          onClick={() => setNewProgressImage(null)}
                                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs"
                                          title="Remove image"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                      <p className="text-xs text-gray-500 mt-1">Current image (click below to replace)</p>
                                    </div>
                                  )}
                                  {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' ? (
                                    <div className="flex flex-row gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) setNewProgressImage(file);
                                          e.target.value = '';
                                        }}
                                        className="hidden"
                                        id={`standalone-entry-img-camera-${item.id}`}
                                      />
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) setNewProgressImage(file);
                                          e.target.value = '';
                                        }}
                                        className="hidden"
                                        id={`standalone-entry-img-gallery-${item.id}`}
                                      />
                                      <label htmlFor={`standalone-entry-img-camera-${item.id}`} className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50" onClick={e => e.stopPropagation()}>
                                        <Camera size={16} />
                                        Camera
                                      </label>
                                      <label htmlFor={`standalone-entry-img-gallery-${item.id}`} className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50" onClick={e => e.stopPropagation()}>
                                        <Image size={16} />
                                        Gallery
                                      </label>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-500 italic">Image upload not available</div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Image Description */}
                            {(newProgressImage || imageDescription) && (
                              <div>
                                <Label className="text-xs text-gray-600">Image Description</Label>
                                <Input
                                  placeholder="Describe the image (optional)"
                                  value={imageDescription}
                                  onChange={(e) => setImageDescription(e.target.value)}
                                  className="text-xs h-8"
                                />
                              </div>
                            )}

                            {/* Action Buttons */}
                            {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => addProgressEntry(item.id)}
                                  disabled={!newProgressEntry?.trim()}
                                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs"
                                >
                                  {editingProgressEntryId ? (
                                    <>
                                      <Check size={14} className="mr-2" />
                                      Update
                                    </>
                                  ) : (
                                    <>
                                      <Plus size={14} className="mr-2" />
                                      Add
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
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
                                  }}
                                  className="flex-1 bg-white hover:bg-gray-50 border-gray-300 text-gray-700 text-xs"
                                >
                                  <X size={14} className="mr-2" />
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          // View Mode - Show Progress Entries
                          <>
                            {/* Progress Entries List */}
                            <div className="flex flex-row items-center justify-between gap-2 mb-2">
                              <div className="text-sm font-semibold text-gray-900">Progress Entries</div>
                              {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    // // console.log('âž• Add Entry button clicked for equipment:', item.id);
                                    setAddingProgressEntryForEquipment(item.id);
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
                                    // // console.log('ðŸ"„ Form reset for new entry');
                                  }}
                                  className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-7 sm:h-6 px-2 sm:px-3 whitespace-nowrap"
                                >
                                  <Plus size={12} className="w-3 h-3 mr-1" />
                                  Add Entry
                                </Button>
                              )}
                            </div>
                            <div className="space-y-3 max-h-[280px] sm:max-h-80 overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {/* New Consolidated Progress Entries */}
                                {item.progressEntries && item.progressEntries.length > 0 ? (
                                  item.progressEntries.map((entry, index) => (
                                    <div key={entry.id} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all p-3 sm:p-4">
                                      {/* Header: Type Badge */}
                                      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
                                        <span className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold rounded-full border bg-blue-100 text-blue-800 border-blue-200">
                                          {(entry as any).entry_type || entry.type || 'General'}
                                        </span>
                                        
                                        {/* Right Side: Image + Action Buttons - image loaded on click (metadata first) */}
                                        <div className="flex items-center gap-1.5 sm:gap-2">
                                          <div 
                                            className={`relative group w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-lg border border-gray-200 ${(entry.image || (entry as any).image_url || progressEntryImageUrls[entry.id]) ? 'cursor-pointer' : 'cursor-pointer bg-gray-50 hover:bg-gray-100'}`}
                                            onClick={async () => {
                                              const url = entry.image || (entry as any).image_url || progressEntryImageUrls[entry.id];
                                              if (url) {
                                                let userName = (entry as any).users?.full_name || (entry as any).uploadedBy;
                                                if (!userName) userName = (user as any)?.full_name;
                                                if (!userName) {
                                                  try {
                                                    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                                                    userName = userData?.full_name || userData?.name;
                                                  } catch (_) {}
                                                }
                                                if (!userName) userName = localStorage.getItem('userName');
                                                if (!userName) userName = user?.email || 'Unknown User';
                                                setShowProgressImageModal({
                                                  url,
                                                  description: entry.imageDescription || (entry as any).image_description,
                                                  uploadedBy: userName,
                                                  uploadDate: entry.uploadDate || (entry as any).created_at
                                                });
                                                return;
                                              }
                                              setProgressEntryImageLoading(prev => ({ ...prev, [entry.id]: true }));
                                              const loadedUrl = await fastAPI.getProgressEntryImageUrl(entry.id, true);
                                              setProgressEntryImageLoading(prev => ({ ...prev, [entry.id]: false }));
                                              if (loadedUrl) {
                                                setProgressEntryImageUrls(prev => ({ ...prev, [entry.id]: loadedUrl }));
                                                let userName = (entry as any).users?.full_name || (entry as any).uploadedBy;
                                                if (!userName) userName = (user as any)?.full_name;
                                                if (!userName) {
                                                  try {
                                                    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                                                    userName = userData?.full_name || userData?.name;
                                                  } catch (_) {}
                                                }
                                                if (!userName) userName = user?.email || 'Unknown User';
                                                setShowProgressImageModal({
                                                  url: loadedUrl,
                                                  description: entry.imageDescription || (entry as any).image_description,
                                                  uploadedBy: userName,
                                                  uploadDate: entry.uploadDate || (entry as any).created_at
                                                });
                                              }
                                            }}
                                            title={(entry.image || (entry as any).image_url || progressEntryImageUrls[entry.id]) ? 'Click to view larger image' : 'Click to load image'}
                                          >
                                            {(entry.image || (entry as any).image_url || progressEntryImageUrls[entry.id]) ? (
                                              <>
                                                <img
                                                  src={entry.image || (entry as any).image_url || progressEntryImageUrls[entry.id]}
                                                  alt={`Progress ${index + 1}`}
                                                  className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-lg border-0 shadow-sm transition-all hover:shadow-md hover:border-blue-300"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-all opacity-0 group-hover:opacity-100 pointer-events-none">
                                                  <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                                                </div>
                                              </>
                                            ) : progressEntryImageLoading[entry.id] ? (
                                              <div className="w-full h-full flex items-center justify-center rounded-lg bg-gray-100">
                                                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                              </div>
                                            ) : (
                                              <div className="w-full h-full flex items-center justify-center rounded-lg text-gray-400">
                                                <Eye className="w-4 h-4" />
                                              </div>
                                            )}
                                          </div>
                                          
                                          {/* Action Buttons */}
                                          {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && currentUserRole !== 'editor' && (
                                            <div className="flex items-center gap-0.5 sm:gap-1">
                                              <button
                                                onClick={() => editProgressEntry(item.id, entry.id)}
                                                className="p-1 sm:p-1.5 hover:bg-blue-50 rounded-md text-blue-600 transition-colors"
                                                title="Edit entry"
                                              >
                                                <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                              </button>
                                              <button
                                                onClick={() => {
                                                  if (confirm('Are you sure you want to delete this progress entry?')) {
                                                    deleteProgressEntry(item.id, entry.id);
                                                  }
                                                }}
                                                className="p-1 sm:p-1.5 hover:bg-red-50 rounded-md text-red-600 transition-colors"
                                                title="Delete entry"
                                              >
                                                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Description */}
                                      <div className="mb-2 sm:mb-3">
                                        <p className="text-xs sm:text-sm text-gray-800 leading-relaxed break-words whitespace-pre-line">
                                          {entry.comment || (entry as any).entry_text || 'No comment'}
                                        </p>
                                      </div>

                                      {/* Audio Section - Only if audio exists */}
                                      {(entry.audio || (entry as any).audio_data) && (
                                        <div className="mb-2 sm:mb-3 pb-2 sm:pb-3 border-b border-gray-100">
                                          <div className="flex items-center gap-2 bg-green-50 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-green-200 w-fit">
                                            <button
                                              onClick={() => playAudio(entry.audio || (entry as any).audio_data, entry.id)}
                                              className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 bg-green-500 hover:bg-green-600 rounded-full text-white transition-all hover:shadow-md"
                                              title={playingAudioId === entry.id ? "Pause audio" : "Play audio"}
                                            >
                                              {playingAudioId === entry.id ? (
                                                <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                              ) : (
                                                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5" />
                                              )}
                                            </button>
                                            <div className="flex flex-col">
                                              <span className="text-[10px] sm:text-xs font-semibold text-green-800">
                                                Voice
                                              </span>
                                              <span className="text-[10px] sm:text-xs text-green-600">
                                                {(entry.audioDuration || (entry as any).audio_duration) ? formatDuration(entry.audioDuration || (entry as any).audio_duration) : '0:00'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* Footer: Metadata */}
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pt-2 border-t border-gray-100 text-[10px] sm:text-xs text-gray-500">
                                        <div className="flex items-center gap-1 sm:gap-1.5">
                                          <User className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                          <span className="text-blue-600 font-medium truncate">
                                            {(() => {
                                              // Get user name from the entry's creator - priority: users (joined) > created_by_user > uploadedBy
                                              // DO NOT fall back to current user - always show the actual creator
                                              let userName = (entry as any).users?.full_name || 
                                                           (entry as any).created_by_user?.full_name || 
                                                           (entry as any).uploadedBy;
                                              
                                              // If still no name, try to fetch it (but don't use current user as fallback)
                                              if (!userName && (entry as any).created_by) {
                                                // Could fetch user data here, but for now show "Unknown User"
                                                userName = 'Unknown User';
                                              }
                                              
                                              // Last resort: show "Unknown User" instead of current user's name
                                              return userName || 'Unknown User';
                                            })()}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1 sm:gap-1.5">
                                          <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                          <span>
                                            {(() => {
                                              const dateValue = entry.uploadDate || (entry as any).created_at;
                                              if (!dateValue) return 'Unknown date';
                                              try {
                                                const date = new Date(dateValue);
                                                return date.toLocaleDateString('en-US', { 
                                                  month: 'short', 
                                                  day: 'numeric', 
                                                  year: 'numeric' 
                                                });
                                              } catch (error) {
                                                return 'Invalid date';
                                              }
                                            })()}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-300">
                                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                                      <FileText className="w-6 h-6 text-gray-400" />
                                    </div>
                                    <span className="text-sm text-gray-500 font-medium">No progress entries yet</span>
                                    <span className="text-xs text-gray-400 mt-1">Add your first entry to get started</span>
                                  </div>
                                )}
                              </div>
                          </>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="documents" className="mt-3 sm:mt-4 space-y-2 flex-1 flex flex-col">
                      <div className="space-y-2 text-xs sm:text-sm flex-1 flex flex-col">
                        {editingEquipmentId === item.id ? (
                          // Edit Mode - Upload Documents
                          <div className="space-y-3">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center" onClick={e => e.stopPropagation()}>
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
                                id={`doc-upload-${item.id}`}
                              />
                              <label
                                htmlFor={`doc-upload-${item.id}`}
                                className="cursor-pointer flex flex-col items-center justify-center gap-1.5 py-3 text-gray-600 hover:text-gray-800"
                                onClick={e => e.stopPropagation()}
                              >
                                <FileText size={28} className="mx-auto text-gray-400" strokeWidth={1.5} />
                                <div className="text-sm font-medium text-gray-600">Click to upload documents</div>
                                <div className="text-xs text-gray-500">PDF, DOC, XLS, DWG, Images supported</div>
                              </label>
                            </div>
                            {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && currentUserRole !== 'editor' && (
                              <div className="flex flex-row items-center gap-2" onClick={e => e.stopPropagation()}>
                                <label
                                  htmlFor={`doc-upload-${item.id}`}
                                  className="cursor-pointer inline-block rounded border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
                                  onClick={e => e.stopPropagation()}
                                >
                                  Choose Files
                                </label>
                                <span className="text-sm text-gray-500">No file chosen</span>
                              </div>
                            )}

                            {/* Existing Equipment Documents Display */}
                            {(() => {
                              const equipmentDocs = documents[item.id]?.filter((doc: any) => 
                                doc.document_type === 'Equipment Document' || doc.document_type === 'VDCR Approved Document'
                              ) || [];
                              if (equipmentDocs.length === 0) return null;
                              return (
                                <div className="mt-2 p-3 bg-green-50 border border-green-200 border-t-2 border-t-green-300 rounded-md">
                                  <p className="text-sm font-medium text-green-800 mb-2">Existing Equipment Documents:</p>
                                  <div className="space-y-1">
                                    {equipmentDocs.map((doc) => (
                                    <div key={doc.id} className="flex items-center justify-between text-sm">
                                      <div className="flex items-center space-x-2">
                                        <FileText size={14} className="text-green-600" />
                                        <span className="text-green-700">{doc.name}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleOpenDocument(doc)}
                                          className="text-green-600 hover:text-green-800 p-1 h-6 w-6"
                                        >
                                          <Eye size={12} />
                                        </Button>

                                        {currentUserRole !== 'vdcr_manager' && currentUserRole !== 'viewer' && currentUserRole !== 'editor' && (
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
                              );
                            })()}

                            {/* Uploaded Documents List */}
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-700">Upload New Documents:</div>
                              <div className="h-36 overflow-y-auto border border-gray-200 rounded bg-gray-50 p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {(() => {
                                  // // console.log('ðŸ“„ EDIT MODE: Checking documents for equipment:', item.id);
                                  // // console.log('ðŸ“„ EDIT MODE: Documents state:', documents);
                                  // // console.log('ðŸ“„ EDIT MODE: Documents for this equipment:', documents[item.id]);
                                  // // console.log('ðŸ“„ EDIT MODE: Documents length:', documents[item.id]?.length || 0);
                                  // // console.log('ðŸ“„ EDIT MODE: Documents loading:', documentsLoading[item.id]);
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
                            <div className="flex flex-row items-center justify-between gap-2 mb-2">
                              <div className="text-sm font-semibold text-gray-900">Equipment Documents</div>
                              <Button
                                size="sm"
                                onClick={() => {
                                  // // console.log('âž• Add Document button clicked for equipment:', item.id);
                                  setEditingEquipmentId(item.id);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-7 sm:h-6 px-2 sm:px-3 whitespace-nowrap"
                              >
                                <Plus size={12} className="w-3 h-3 mr-1" />
                                Add Document
                              </Button>
                            </div>
                            <div className="relative mb-2">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="text"
                                placeholder="Search documents..."
                                value={docsSearchQuery}
                                onChange={(e) => setDocsSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div className="max-h-[200px] sm:h-36 overflow-y-auto border border-gray-200 rounded bg-gray-50 p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                              {(() => {
                                // // console.log('ðŸ“„ PERFECT: Rendering documents for equipment:', item.id);
                                // // console.log('ðŸ“„ PERFECT: Documents state:', documents);
                                // // console.log('ðŸ“„ PERFECT: Documents for this equipment:', documents[item.id]);
                                // // console.log('ðŸ“„ PERFECT: Documents length:', documents[item.id]?.length || 0);
                                // // console.log('ðŸ“„ PERFECT: Documents loading:', documentsLoading[item.id]);
                                return null;
                              })()}
                              {documentsLoading[item.id] ? (
                                <div className="p-4 space-y-3">
                                  <Skeleton className="h-4 w-full" />
                                  <Skeleton className="h-4 w-3/4" />
                                  <Skeleton className="h-4 w-1/2" />
                                </div>
                              ) : (() => {
                                // Filter to show Equipment Documents and VDCR Approved Documents in the Docs tab; then by search
                                const equipmentDocs = (documents[item.id]?.filter((doc: any) =>
                                  doc.document_type === 'Equipment Document' || doc.document_type === 'VDCR Approved Document'
                                ) || [])
                                  .filter((doc: any) => {
                                    const q = docsSearchQuery.trim().toLowerCase();
                                    if (!q) return true;
                                    const name = (doc.document_name || doc.name || '').toLowerCase();
                                    const type = (doc.document_type || '').toLowerCase();
                                    return name.includes(q) || type.includes(q);
                                  });
                                
                                if (equipmentDocs.length === 0) {
                                  return (
                                    <div className="flex items-center justify-center p-4 bg-white rounded border border-gray-200">
                                      <div className="text-center">
                                        <FileText size={24} className="text-gray-400 mx-auto mb-2" />
                                        <span className="text-xs text-gray-500">No documents uploaded</span>
                                      </div>
                                    </div>
                                  );
                                }
                                
                                return equipmentDocs.map((doc) => {
                                  const getDocumentCategory = (fileName: string) => {
                                    const ext = fileName.split('.').pop()?.toLowerCase();
                                    if (['pdf'].includes(ext || '')) return 'PDF';
                                    if (['dwg', 'dxf'].includes(ext || '')) return 'CAD';
                                    if (['doc', 'docx'].includes(ext || '')) return 'Document';
                                    if (['xls', 'xlsx'].includes(ext || '')) return 'Spreadsheet';
                                    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) return 'Image';
                                    return 'Other';
                                  };

                                  const getCategoryColor = (category: string) => {
                                    const colors: Record<string, string> = {
                                      'PDF': 'bg-red-100 text-red-800',
                                      'CAD': 'bg-blue-100 text-blue-800',
                                      'Document': 'bg-green-100 text-green-800',
                                      'Spreadsheet': 'bg-yellow-100 text-yellow-800',
                                      'Image': 'bg-blue-100 text-blue-800',
                                      'Other': 'bg-gray-100 text-gray-800'
                                    };
                                    return colors[category] || colors['Other'];
                                  };

                                  const getFileIcon = (fileName: string) => {
                                    const ext = fileName.split('.').pop()?.toLowerCase();
                                    if (['pdf'].includes(ext || '')) return 'ðŸ“„';
                                    if (['dwg', 'dxf'].includes(ext || '')) return 'ðŸ“';
                                    if (['doc', 'docx'].includes(ext || '')) return 'ðŸ“';
                                    if (['xls', 'xlsx'].includes(ext || '')) return 'ðŸ“Š';
                                    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) return 'ðŸ–¼ï¸';
                                    return 'ðŸ“Ž';
                                  };

                                  const category = getDocumentCategory(doc.document_name || doc.name);
                                  const categoryColor = getCategoryColor(category);
                                  const fileIcon = getFileIcon(doc.document_name || doc.name);
                                  const isVDCRDoc = doc.document_type === 'VDCR Approved Document' || doc.vdcr_code_status || doc.vdcr_document_status;
                                  const codeStatus = doc.vdcr_code_status || '';
                                  const codeCapsuleColors: Record<string, string> = {
                                    'Code 1': 'bg-green-100 text-green-800 border-green-200',
                                    'Code 2': 'bg-blue-100 text-blue-800 border-blue-200',
                                    'Code 3': 'bg-yellow-100 text-yellow-800 border-yellow-200',
                                    'Code 4': 'bg-red-100 text-red-800 border-red-200'
                                  };
                                  const codeCapsuleClass = codeCapsuleColors[codeStatus] || 'bg-gray-100 text-gray-800 border-gray-200';
                                  const docStatusLabels: Record<string, string> = {
                                    'pending': 'Pending',
                                    'sent-for-approval': 'Submitted for Review',
                                    'received-for-comment': 'Received with Comments',
                                    'approved': 'Approved',
                                    'rejected': 'Rejected'
                                  };
                                  const docStatusLabel = doc.vdcr_document_status ? (docStatusLabels[doc.vdcr_document_status] || doc.vdcr_document_status) : '';

                                  return (
                                    <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 p-2 sm:p-2 bg-white rounded border border-gray-200 mb-2 last:mb-0 hover:shadow-sm transition-shadow">
                                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpenDocument(doc)}>
                                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                                          <span className="text-sm flex-shrink-0">{fileIcon}</span>
                                          <span className="text-xs sm:text-sm font-medium text-gray-800 hover:text-gray-900 break-words min-w-0 flex-1">
                                            {doc.document_name || doc.name}
                                          </span>
                                          {isVDCRDoc && codeStatus && (
                                            <span className={`px-1.5 py-0.5 text-[10px] sm:text-xs rounded-full flex-shrink-0 font-medium border ${codeCapsuleClass}`}>
                                              {codeStatus}
                                            </span>
                                          )}
                                          {isVDCRDoc && docStatusLabel && (
                                            <span className="px-1.5 py-0.5 text-[10px] sm:text-xs rounded-full flex-shrink-0 bg-gray-100 text-gray-700 border border-gray-200">
                                              {docStatusLabel}
                                            </span>
                                          )}
                                          {isVDCRDoc && !codeStatus && !docStatusLabel && (
                                            <span className="px-1.5 py-0.5 text-[10px] sm:text-xs rounded-full flex-shrink-0 bg-blue-100 text-blue-800 font-medium border border-blue-200">
                                              Approved VDCR Doc
                                            </span>
                                          )}
                                          <span className={`px-1.5 py-0.5 text-[10px] sm:text-xs rounded-full flex-shrink-0 ${categoryColor}`}>
                                            {category}
                                          </span>
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-gray-500 truncate">
                                          By: {doc.uploaded_by_user?.full_name || doc.uploadedBy || 'Unknown'} • {new Date(doc.uploadDate).toLocaleDateString()}
                                        </div>
                                      </div>
                                      <div className="flex gap-2 sm:gap-1 justify-end sm:justify-start flex-shrink-0">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 w-7 sm:h-6 sm:w-6 p-0 flex-shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenDocument(doc);
                                          }}
                                        >
                                          <Eye size={14} className="sm:w-3 sm:h-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 w-7 sm:h-6 sm:w-6 p-0 text-red-600 hover:text-red-700 flex-shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteDocument(item.id, doc.id);
                                          }}
                                        >
                                          <Trash2 size={14} className="sm:w-3 sm:h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>

                  {/* Action Buttons */}
                  <div className="flex flex-row flex-wrap gap-2 mt-3 mt-auto">
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
                                // // console.log('ðŸ"§ Setting editFormData with custom fields:', formData);
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
      </div>
    </Card>
  );
};

export default StandaloneEquipmentCard;
           