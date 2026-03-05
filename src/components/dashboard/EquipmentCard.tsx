import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eye, Calendar, User, MapPin, Edit, Check, X, Camera, Upload, Clock, Building, Trash2, Plus } from "lucide-react";
import AddTechnicalSectionModal from "@/components/forms/AddTechnicalSectionModal";

interface ProgressEntry {
  id: string;
  type: string;
  comment: string;
  image?: string;
  imageDescription?: string;
  uploadedBy?: string;
  uploadDate: string;
}

interface TechnicalSection {
  id: string;
  name: string;
  specifications: {
    status: string;
    material: string;
    pressure: string;
    temperature: string;
    dimensions: string;
    weight: string;
  };
  isNew?: boolean;
}

interface Equipment {
  id: string;
  name?: string;
  type: string;
  tagNumber: string;
  jobNumber: string;
  manufacturingSerial: string;
  poCdd: string;
  status: 'on-track' | 'delayed' | 'nearing-completion' | 'completed' | 'pending';
  progress: number;
  progressPhase: 'documentation' | 'manufacturing' | 'testing' | 'dispatched';
  location: string;
  supervisor: string;
  lastUpdate: string;
  images: string[];
  progressImages: string[];
  progressEntries: ProgressEntry[];
  nextMilestone: string;
  nextMilestoneDate?: string;
  priority: 'high' | 'medium' | 'low';
  documents: File[];
  isBasicInfo: boolean;
  size?: string;
  weight?: string;
  designCode?: string;
  material?: string;
  notes?: string;
  workingPressure?: string;
  designTemp?: string;
  welder?: string;
  welderEmail?: string;
  welderPhone?: string;
  qcInspector?: string;
  qcInspectorEmail?: string;
  qcInspectorPhone?: string;
  engineer?: string;
  projectManager?: string;
  projectManagerEmail?: string;
  projectManagerPhone?: string;
  supervisorEmail?: string;
  supervisorPhone?: string;
  supervisorRole?: 'editor' | 'viewer';
  welderRole?: 'editor' | 'viewer';
  qcInspectorRole?: 'editor' | 'viewer';
  projectManagerRole?: 'editor' | 'viewer';
  customFields?: Array<{
    id: string;
    name: string;
    value: string;
  }>;
  customTeamPositions?: Array<{
    id: string;
    position: string;
    name: string;
    email: string;
    phone: string;
    role: 'editor' | 'viewer';
  }>;
  technicalSections?: TechnicalSection[];
  certificationTitle?: string;
}

interface EquipmentCardProps {
  equipment: Equipment;
  editingEquipmentId: string | null;
  editFormData: Partial<Equipment>;
  setEditFormData: (data: Partial<Equipment>) => void;
  onEdit: (equipment: Equipment) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (equipment: Equipment) => void;
  onMarkComplete: (equipment: Equipment) => void;
  onProgressPhaseChange: (equipmentId: string, newPhase: 'documentation' | 'manufacturing' | 'testing' | 'dispatched') => void;
  onDocsTabClick: (equipmentId: string) => void;
}

// Individual equipment card component with all equipment details and actions
const EquipmentCard: React.FC<EquipmentCardProps> = ({
  equipment,
  editingEquipmentId,
  editFormData,
  setEditFormData,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onMarkComplete,
  onProgressPhaseChange,
  onDocsTabClick
}) => {
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string>('Coil');
  const [overviewLastUpdateRaw, setOverviewLastUpdateRaw] = useState<string>('');
  const [overviewNextMilestoneDate, setOverviewNextMilestoneDate] = useState<string>('');
  const [technicalSections, setTechnicalSections] = useState<TechnicalSection[]>(
    equipment.technicalSections || [
      {
        id: 'coil',
        name: 'Coil',
        specifications: {
          status: 'In Progress',
          material: 'SS316L',
          pressure: '150 PSI',
          temperature: '200°C',
          dimensions: '2.5m',
          weight: '3.2mm'
        }
      },
      {
        id: 'body',
        name: 'Body',
        specifications: {
          status: 'In Progress',
          material: 'To be specified',
          pressure: 'To be specified',
          temperature: 'To be specified',
          dimensions: 'To be specified',
          weight: 'To be specified'
        }
      },
      {
        id: 'head',
        name: 'Head',
        specifications: {
          status: 'In Progress',
          material: 'To be specified',
          pressure: 'To be specified',
          temperature: 'To be specified',
          dimensions: 'To be specified',
          weight: 'To be specified'
        }
      },
      {
        id: 'nozzles',
        name: 'Nozzles',
        specifications: {
          status: 'In Progress',
          material: 'To be specified',
          pressure: 'To be specified',
          temperature: 'To be specified',
          dimensions: 'To be specified',
          weight: 'To be specified'
        }
      }
    ]
  );

  const handleAddSection = (sectionName: string) => {
    const newSection: TechnicalSection = {
      id: sectionName.toLowerCase().replace(/\s+/g, '-'),
      name: sectionName,
      specifications: {
        status: 'In Progress',
        material: 'To be specified',
        pressure: 'To be specified',
        temperature: 'To be specified',
        dimensions: 'To be specified',
        weight: 'To be specified'
      },
      isNew: true
    };
    setTechnicalSections([...technicalSections, newSection]);
    setSelectedSection(sectionName);
  };
  // Get status color for equipment
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'on-track': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'delayed': return 'bg-red-100 text-red-800 border-red-200';
      case 'nearing-completion': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'pending': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get display status for equipment
  const getDisplayStatus = (equipment: Equipment) => {
    if (equipment.status === 'completed') return 'Completed';
    if (equipment.progressPhase === 'dispatched') return 'Dispatched';
    if (equipment.status === 'delayed') return 'Delayed';
    if (equipment.status === 'nearing-completion') return 'Nearing Completion';
    if (equipment.status === 'on-track') return 'On Track';
    return 'Pending';
  };

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

  // Get remaining days calculation
  const getRemainingDays = (poCdd: string) => {
    if (!poCdd || poCdd === 'To be scheduled') return null;
    try {
      const poCddDate = new Date(poCdd);
      const today = new Date();
      const timeDiff = poCddDate.getTime() - today.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
      return daysDiff;
    } catch (error) {
      return null;
    }
  };

  const daysRemaining = getRemainingDays(equipment.poCdd);

  return (
    <Card className="p-3 sm:p-4 md:p-5 lg:p-6 xl:p-6 bg-white border border-gray-200 hover:shadow-lg transition-all duration-300 relative">
      {/* Equipment Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 lg:gap-0 mb-3 sm:mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2 flex-wrap">
            <h3 className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-xl font-bold text-gray-900 truncate">
              {equipment.name || (equipment.type === 'Distillation Column' ? 'Column' : equipment.type)}
            </h3>
            <Badge className={`text-[9px] sm:text-[10px] md:text-xs px-1 sm:px-1.5 md:px-2 py-0.5 flex-shrink-0 ${getStatusColor(equipment.status)}`}>
              {getDisplayStatus(equipment)}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-600">
            <div className="flex items-center gap-1 min-w-0">
              <Building className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
              <span className="truncate">{equipment.tagNumber}</span>
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
              <span className="truncate">{equipment.supervisor}</span>
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
              <span className="truncate">{equipment.location}</span>
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 flex-shrink-0" />
              <span className="truncate">{equipment.lastUpdate}</span>
            </div>
          </div>
        </div>

        {/* Progress Phase Selector and Any Personal Title */}
        <div className="flex flex-col items-end gap-2 sm:gap-3 sm:ml-4">
          <select
            value={equipment.progressPhase}
            onChange={(e) => onProgressPhaseChange(equipment.id, e.target.value as any)}
            className="text-xs sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-1.5 sm:py-1 border border-gray-300 rounded-md bg-white w-full sm:w-auto min-w-[120px] sm:min-w-[140px]"
          >
            <option value="documentation">Documentation</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="testing">Testing</option>
            <option value="dispatched">Dispatched</option>
          </select>
          {equipment.certificationTitle && (
            <Badge className="text-[9px] sm:text-[10px] md:text-xs px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1 flex-shrink-0 bg-gray-100 text-gray-700 border border-gray-300 rounded-full">
              {equipment.certificationTitle}
            </Badge>
          )}
        </div>
      </div>

      {/* Days Counter */}
      <div className="mb-3 sm:mb-0 sm:absolute sm:top-3 sm:right-3 md:top-4 md:right-4 lg:top-5 lg:right-5 xl:top-6 xl:right-6 text-left sm:text-right max-w-full sm:max-w-[110px] md:max-w-[120px] lg:max-w-[140px] xl:max-w-[160px]">
        {equipment.progressPhase === 'dispatched' ? (
          <div className="text-right">
            <div className="text-[10px] sm:text-[11px] md:text-xs text-gray-500 font-medium truncate">Dispatched on</div>
            <div className="text-[11px] sm:text-xs md:text-sm font-bold text-green-700 truncate">{equipment.poCdd}</div>
          </div>
        ) : daysRemaining !== null ? (
          <div className="text-right">
            <div className="text-[10px] sm:text-[11px] md:text-xs text-gray-500 font-medium truncate">Days to Completion Date</div>
            <div className={`text-[11px] sm:text-xs md:text-sm font-bold truncate ${daysRemaining < 0 ? 'text-red-700' : 'text-blue-700'}`}>
              {daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days to go`}
            </div>
          </div>
        ) : (
          <div className="text-right">
            <div className="text-[10px] sm:text-[11px] md:text-xs text-gray-500 font-medium truncate">Days to Completion Date</div>
            <div className="text-[11px] sm:text-xs md:text-sm font-bold text-gray-600 truncate">No deadline set</div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-3 sm:mb-4">
        <div className="flex justify-between text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1">
          <span>Progress</span>
          <span className="font-medium">{equipment.progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2 md:h-2.5">
          <div 
            className="bg-blue-600 h-1.5 sm:h-2 md:h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${equipment.progress}%` }}
          ></div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 sm:flex sm:flex-row gap-1.5 sm:gap-2 mb-3 sm:mb-4">
        {editingEquipmentId === equipment.id ? (
          <>
            <Button size="sm" onClick={onSave} className="bg-green-600 hover:bg-green-700 text-[10px] sm:text-xs md:text-sm w-full sm:w-auto h-7 sm:h-8 px-2 sm:px-3">
              <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-1" />
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} className="text-[10px] sm:text-xs md:text-sm w-full sm:w-auto h-7 sm:h-8 px-2 sm:px-3">
              <X className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-1" />
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => onEdit(equipment)} className="text-[10px] sm:text-xs md:text-sm w-full sm:w-auto h-7 sm:h-8 px-2 sm:px-3">
              <Edit className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-1" />
              Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => onMarkComplete(equipment)} className="text-[10px] sm:text-xs md:text-sm w-full sm:w-auto h-7 sm:h-8 px-2 sm:px-3">
              <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-1" />
              Complete
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDelete(equipment)} className="col-span-2 sm:col-span-1 text-[10px] sm:text-xs md:text-sm w-full sm:w-auto h-7 sm:h-8 px-2 sm:px-3">
              <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-1" />
              Delete
            </Button>
          </>
        )}
      </div>

      {/* Tabs for detailed information */}
      <Tabs defaultValue="overview" className="w-full flex-1 flex flex-col">
        <div className="overflow-x-auto overflow-y-hidden lg:overflow-x-visible lg:overflow-y-visible xl:overflow-x-visible xl:overflow-y-visible scroll-smooth -mx-1 px-1 lg:mx-0 lg:px-0">
          <TabsList className="flex lg:grid lg:w-full lg:grid-cols-5 xl:grid xl:w-full xl:grid-cols-5 h-8 sm:h-9 md:h-10 min-w-max lg:min-w-0 gap-1 lg:gap-0">
            <TabsTrigger value="overview" className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 whitespace-nowrap flex-shrink-0">Overview</TabsTrigger>
            <TabsTrigger value="technical" className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 whitespace-nowrap flex-shrink-0">Technical</TabsTrigger>
            <TabsTrigger value="team" className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 whitespace-nowrap flex-shrink-0">Team</TabsTrigger>
            <TabsTrigger value="progress" className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 whitespace-nowrap flex-shrink-0">Progress</TabsTrigger>
          <TabsTrigger 
            value="documents" 
              className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 whitespace-nowrap flex-shrink-0"
            onClick={() => onDocsTabClick(equipment.id)}
          >
            Docs
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="overview" className="mt-3 sm:mt-4 space-y-3">
          {editingEquipmentId === equipment.id ? (
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
                  <p className="text-[11px] text-gray-400 mt-1">Dimensions (length × width × height)</p>
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
                    type="datetime-local"
                    value={overviewLastUpdateRaw}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setOverviewLastUpdateRaw(raw);
                      setEditFormData({
                        ...editFormData,
                        lastUpdate: raw ? formatDateTimeDisplay(raw) : ''
                      });
                    }}
                    className="text-xs h-8"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Reference timestamp shown to the team</p>
                  {overviewLastUpdateRaw && (
                    <p className="text-[11px] text-blue-500 mt-1">
                      {formatDateTimeDisplay(overviewLastUpdateRaw)}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Next Milestone Date</Label>
                  <Input
                    type="date"
                    value={overviewNextMilestoneDate}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setOverviewNextMilestoneDate(raw);
                      setEditFormData({
                        ...editFormData,
                        nextMilestoneDate: raw ? new Date(raw).toISOString() : undefined
                      });
                    }}
                    className="text-xs h-8"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Pick the milestone date from the calendar</p>
                  {overviewNextMilestoneDate && (
                    <p className="text-[11px] text-blue-500 mt-1">
                      {formatDateDisplay(overviewNextMilestoneDate)}
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
              const sizeValue = equipment.size && equipment.size.trim() !== '' ? equipment.size : '—';
              const materialValue = equipment.material && equipment.material.trim() !== '' ? equipment.material : '—';
              const designCodeValue = equipment.designCode && equipment.designCode.trim() !== '' ? equipment.designCode : '—';
              const equipmentEntries = equipment.progressEntries || [];
              const latestEntry = equipmentEntries.length > 0 ? equipmentEntries[equipmentEntries.length - 1] : null;
              const lastUpdatedValue = latestEntry?.uploadDate ? formatDateDisplay(latestEntry.uploadDate) : (equipment.lastUpdate || '—');
              const updateDescription =
                latestEntry?.comment ||
                (equipment.notes && equipment.notes.trim() !== '' ? equipment.notes : '') ||
                (equipment.nextMilestone && equipment.nextMilestone.trim() !== '' ? equipment.nextMilestone : '') ||
                'No recent update details shared yet.';

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Size</div>
                      <div className="text-sm font-semibold text-gray-900">{sizeValue}</div>
                      <div className="text-[11px] text-gray-400 mt-1">Dimensions (L × W × H)</div>
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
                        <div className="text-sm font-semibold text-gray-900 mt-1">{lastUpdatedValue}</div>
                      </div>
                      {(equipment.nextMilestone && equipment.nextMilestone.trim() !== '') || equipment.nextMilestoneDate || editFormData.nextMilestoneDate ? (
                        <div className="text-left sm:text-right">
                          <div className="text-[11px] uppercase tracking-wide text-blue-500">Next Milestone</div>
                          {equipment.nextMilestone && equipment.nextMilestone.trim() !== '' && (
                            <div className="text-xs font-medium text-blue-700 mt-1">{equipment.nextMilestone}</div>
                          )}
                          {(equipment.nextMilestoneDate || editFormData.nextMilestoneDate) && (
                            <div className="text-[11px] text-blue-500 mt-1">
                              {formatDateDisplay(equipment.nextMilestoneDate || editFormData.nextMilestoneDate || '')}
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

        <TabsContent value="technical" className="mt-2 sm:mt-3 md:mt-4 space-y-2 flex-1 flex flex-col">
          <div className="flex-1 flex flex-col max-h-[350px] sm:max-h-[400px] md:max-h-[450px] overflow-y-auto pr-1 sm:pr-2">
            {/* Technical Section Buttons */}
            <div className="overflow-x-auto overflow-y-hidden lg:overflow-x-visible lg:overflow-y-visible xl:overflow-x-visible xl:overflow-y-visible scroll-smooth mb-3 sm:mb-4 -mx-1 px-1 lg:mx-0 lg:px-0">
              <div className="flex flex-nowrap lg:flex-wrap gap-1.5 sm:gap-2 min-w-max lg:min-w-0">
              {technicalSections.map((section) => (
                <Button
                  key={section.id}
                  variant={selectedSection === section.name ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSection(section.name)}
                    className={`text-[10px] sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 md:py-1 h-7 sm:h-7 md:h-8 whitespace-nowrap flex-shrink-0 ${
                    selectedSection === section.name 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {section.name}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddSectionModalOpen(true)}
                  className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 md:py-1 h-7 sm:h-7 md:h-8 bg-green-600 text-white border-green-600 hover:bg-green-700 whitespace-nowrap flex-shrink-0"
              >
                  <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                Add Section
              </Button>
              </div>
            </div>

            {/* Selected Section Details */}
            {technicalSections.find(s => s.name === selectedSection) && (
              <div className="space-y-3">
              {(() => {
                const currentSection = technicalSections.find(s => s.name === selectedSection)!;
                return (
                  <>
                    <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                      <h4 className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 truncate">{currentSection.name}</h4>
                      <Button size="sm" variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 md:px-2.5 py-0.5 sm:py-1 h-6 sm:h-6 md:h-7 flex-shrink-0">
                        <Edit className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                        Edit
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 md:gap-3 text-[10px] sm:text-xs md:text-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                        <span className="font-medium text-gray-700">Status:</span>
                        <span className="text-gray-600 truncate">{currentSection.specifications.status}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                        <span className="font-medium text-gray-700">Material:</span>
                        <span className={`truncate ${currentSection.specifications.material === 'To be specified' ? 'text-gray-400' : 'text-gray-600'}`}>
                          {currentSection.specifications.material}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                        <span className="font-medium text-gray-700">Pressure:</span>
                        <span className={`truncate ${currentSection.specifications.pressure === 'To be specified' ? 'text-gray-400' : 'text-gray-600'}`}>
                          {currentSection.specifications.pressure}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                        <span className="font-medium text-gray-700">Temperature:</span>
                        <span className={`truncate ${currentSection.specifications.temperature === 'To be specified' ? 'text-gray-400' : 'text-gray-600'}`}>
                          {currentSection.specifications.temperature}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                        <span className="font-medium text-gray-700">Dimensions:</span>
                        <span className={`truncate ${currentSection.specifications.dimensions === 'To be specified' ? 'text-gray-400' : 'text-gray-600'}`}>
                          {currentSection.specifications.dimensions}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                        <span className="font-medium text-gray-700">Weight:</span>
                        <span className={`truncate ${currentSection.specifications.weight === 'To be specified' ? 'text-gray-400' : 'text-gray-600'}`}>
                          {currentSection.specifications.weight}
                        </span>
                      </div>
                    </div>

                    {currentSection.isNew && (
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-1.5 sm:p-2 md:p-3">
                        <p className="text-[10px] sm:text-xs md:text-sm text-blue-800 leading-relaxed">
                          This is a newly created section. Click "Edit" to add technical specifications and customize this section for your equipment.
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-1.5 sm:pt-2">
                      <Button size="sm" variant="outline" className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 md:py-1 h-7 sm:h-7 md:h-8 flex-1 sm:flex-initial">
                        <Edit className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 md:py-1 h-7 sm:h-7 md:h-8 bg-green-600 text-white hover:bg-green-700 flex-1 sm:flex-initial">
                        <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                        Complete
                      </Button>
                      <Button size="sm" variant="outline" className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 md:py-1 h-7 sm:h-7 md:h-8 text-red-600 border-red-300 hover:bg-red-50 flex-1 sm:flex-initial">
                        <X className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                        Delete
                      </Button>
                    </div>
                  </>
                );
              })()}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-2 sm:mt-3 md:mt-4 space-y-2 flex-1 flex flex-col">
          <div className="space-y-2 sm:space-y-2 text-[10px] sm:text-xs md:text-sm flex-1 flex flex-col max-h-[350px] sm:max-h-[400px] md:max-h-[450px] overflow-y-auto pr-1 sm:pr-2">
            <div className="grid grid-cols-1 gap-2 sm:gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                <span className="font-medium text-gray-700">Engineer:</span>
                <span className="text-gray-600 truncate">{equipment.engineer || 'N/A'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                <span className="font-medium text-gray-700">Welder:</span>
                <span className="text-gray-600 truncate">{equipment.welder || 'N/A'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                <span className="font-medium text-gray-700">QC Inspector:</span>
                <span className="text-gray-600 truncate">{equipment.qcInspector || 'N/A'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
                <span className="font-medium text-gray-700">Project Manager:</span>
                <span className="text-gray-600 truncate">{equipment.projectManager || 'N/A'}</span>
              </div>
            </div>
            
            {/* Team Management Buttons */}
            <div className="flex gap-1.5 sm:gap-2 pt-2 sm:pt-3 md:pt-4 mt-auto">
              {/* Manage Team button that redirects to user settings */}
              <Button 
                size="sm" 
                className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 py-1.5 sm:py-1 h-7 sm:h-8 bg-blue-600 text-white hover:bg-blue-700 w-full sm:w-auto"
                onClick={() => {
                  // Navigate to settings tab
                  const event = new CustomEvent('navigateToTab', { 
                    detail: { tab: 'settings' } 
                  });
                  window.dispatchEvent(event);
                }}
              >
                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                Manage Team
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="progress" className="mt-2 sm:mt-3 md:mt-4 space-y-2 flex-1 flex flex-col">
          <div className="space-y-2 sm:space-y-2 text-[10px] sm:text-xs md:text-sm flex-1 flex flex-col max-h-[350px] sm:max-h-[400px] md:max-h-[450px] overflow-y-auto pr-1 sm:pr-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
              <span className="font-medium text-gray-700">Next Milestone:</span>
              <span className="text-gray-600 truncate">{equipment.nextMilestone || 'N/A'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
              <span className="font-medium text-gray-700">Priority:</span>
              <span className="text-gray-600 capitalize truncate">{equipment.priority || 'N/A'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
              <span className="font-medium text-gray-700">Progress Entries:</span>
              <span className="text-gray-600">{equipment.progressEntries?.length || 0}</span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-2 sm:mt-3 md:mt-4 space-y-2 flex-1 flex flex-col">
          <div className="space-y-2 sm:space-y-2 text-[10px] sm:text-xs md:text-sm flex-1 flex flex-col max-h-[350px] sm:max-h-[400px] md:max-h-[450px] overflow-y-auto pr-1 sm:pr-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1 min-w-0">
              <span className="font-medium text-gray-700">Documents:</span>
              <span className="text-gray-600">{equipment.documents?.length || 0} files</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Technical Section Modal */}
      <AddTechnicalSectionModal
        isOpen={isAddSectionModalOpen}
        onClose={() => setIsAddSectionModalOpen(false)}
        onAddSection={handleAddSection}
      />
    </Card>
  );
};

export default EquipmentCard;
