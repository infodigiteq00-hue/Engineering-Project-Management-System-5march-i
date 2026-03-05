import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getCache, setCache, CACHE_KEYS } from "@/utils/cache";

interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  equipmentCount: number;
  activeEquipment: number;
  progress: number;
  status: 'active' | 'delayed' | 'on-track' | 'completed';
  manager: string;
  deadline: string;
  completedDate?: string;
  poNumber: string;
  equipmentBreakdown: {
    heatExchanger?: number;
    pressureVessel?: number;
    storageTank?: number;
    reactor?: number;
    other?: number;
    [key: string]: number | undefined;
  };
  servicesIncluded?: string[];
  scopeOfWork?: string;
  recommendationLetter?: {
    status: 'not-requested' | 'requested' | 'received';
    requestDate?: string;
    lastReminderDate?: string;
    lastReminderDateTime?: string;
    reminderCount?: number;
    clientEmail?: string;
    clientContactPerson?: string;
    receivedDocument?: {
      name: string;
      uploaded: boolean;
      type: string;
      size?: number;
      uploadDate?: string;
      file?: File;
      url?: string;
    };
  };
}

interface CertificateTemplate {
  id: string;
  name: string;
  description: string;
  fileName: string;
  category: string;
}

interface CompletionCertificatesTabProps {
  projects: Project[];
  certificateTemplates: CertificateTemplate[];
  equipmentCarouselIndex: Record<string, number>;
  userRole: string;
  equipmentLock?: { isLocked: boolean; daysRemaining: number; totalDays: number } | null;
  onShowEquipmentLockModal?: () => void;
  onDownloadTemplate: (template: CertificateTemplate) => void;
  onSelectProject: (projectId: string, tab: string) => void;
  onEditProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onRequestRecommendationLetter: (project: Project) => void;
  onSendRecommendationReminder: (project: Project) => void;
  onUploadRecommendationLetter: (project: Project) => void;
  onViewRecommendationLetter: (project: Project) => void;
  onSetEquipmentCarouselIndex: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
}

const CompletionCertificatesTab = ({
  projects,
  certificateTemplates,
  equipmentCarouselIndex,
  userRole,
  equipmentLock,
  onShowEquipmentLockModal,
  onDownloadTemplate,
  onSelectProject,
  onEditProject,
  onDeleteProject,
  onRequestRecommendationLetter,
  onSendRecommendationReminder,
  onUploadRecommendationLetter,
  onViewRecommendationLetter,
  onSetEquipmentCarouselIndex,
}: CompletionCertificatesTabProps) => {
  const [certificateTab, setCertificateTab] = useState<'all' | 'pending' | 'received'>('all');
  const [templatesDropdownExpanded, setTemplatesDropdownExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 8;

  // Compute statistics
  const completedProjectsCount = useMemo(() => {
    return projects.filter(p => p.status === 'completed').length;
  }, [projects]);
  
  const recommendationLettersCollected = useMemo(() => {
    return projects.filter(p => {
      if (p.status === 'completed') {
        return p.recommendationLetter?.status === 'received';
      }
      return false;
    }).length;
  }, [projects]);
  
  const recommendationLettersPending = useMemo(() => {
    const completedProjects = projects.filter(p => p.status === 'completed');
    return completedProjects.length - recommendationLettersCollected;
  }, [projects, recommendationLettersCollected]);

  // Filter completed projects based on certificate tab
  const filteredCompletedProjects = useMemo(() => {
    const completed = projects.filter(p => p.status === 'completed');
    
    if (certificateTab === 'pending') {
      return completed.filter(p => {
        const recStatus = p.recommendationLetter?.status || 'not-requested';
        return recStatus === 'not-requested' || recStatus === 'requested';
      });
    } else if (certificateTab === 'received') {
      return completed.filter(p => p.recommendationLetter?.status === 'received');
    }
    return completed;
  }, [projects, certificateTab]);

  // Pagination: Calculate total pages and slice projects
  const totalPages = Math.ceil(filteredCompletedProjects.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCompletedProjects = filteredCompletedProjects.slice(startIndex, endIndex);

  // Reset to page 1 when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [certificateTab]);

  // Cache completed projects metadata (first 24, metadata only)
  useEffect(() => {
    const completed = projects.filter(p => p.status === 'completed');
    const first24 = completed.slice(0, 24);
    
    // Create lightweight version (metadata only, no equipment arrays)
    const lightweight = first24.map((p: any) => ({
      id: p.id,
      name: p.name,
      client: p.client,
      location: p.location,
      equipmentCount: p.equipmentCount,
      activeEquipment: p.activeEquipment,
      progress: p.progress,
      status: p.status,
      manager: p.manager,
      deadline: p.deadline,
      completedDate: p.completedDate,
      poNumber: p.poNumber,
      equipmentBreakdown: p.equipmentBreakdown,
      recommendationLetter: p.recommendationLetter,
      // Don't include equipment array - load on-demand
      equipment: []
    }));
    
    const cacheKey = `${CACHE_KEYS.PROJECT_CARDS}_completed`;
    setCache(cacheKey, lightweight, { 
      ttl: 10 * 60 * 1000, // 10 minutes TTL
      maxSize: 1 * 1024 * 1024 // 1MB max
    });
  }, [projects]);

  return (
    <div className="mt-8">
      {/* Preview Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-xl hover:shadow-2xl transition-shadow transition-transform duration-300 transform hover:-translate-y-1 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium mb-1">Projects Completed</p>
              <p className="text-4xl font-bold">{completedProjectsCount}</p>
              <p className="text-blue-100 text-xs mt-2">Total completed engineering projects</p>
            </div>
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <div className="w-11 h-11 bg-white/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-xl hover:shadow-2xl transition-shadow transition-transform duration-300 transform hover:-translate-y-1 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium mb-1">Recommendation Letters</p>
              <p className="text-4xl font-bold">{recommendationLettersCollected}</p>
              <p className="text-green-100 text-xs mt-2">Collected from clients</p>
            </div>
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <div className="w-11 h-11 bg-white/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-xl hover:shadow-2xl transition-shadow transition-transform duration-300 transform hover:-translate-y-1 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium mb-1">Recommendation Letters</p>
              <p className="text-4xl font-bold">{recommendationLettersPending}</p>
              <p className="text-orange-100 text-xs mt-2">Pending from clients</p>
            </div>
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <div className="w-11 h-11 bg-white/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Template Download Section - Collapsible Dropdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div 
          className="flex items-center justify-between p-4 sm:p-6 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setTemplatesDropdownExpanded(!templatesDropdownExpanded)}
        >
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-800">Download Sample Templates</h3>
          </div>
          <svg 
            className={`w-5 h-5 text-gray-600 transition-transform duration-200 ${templatesDropdownExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        
        {templatesDropdownExpanded && (
          <div className="border-t border-gray-200 p-4 sm:p-6 bg-gray-50">
            <p className="text-sm text-gray-500 mb-4">Pre-loaded templates ready to download and share</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {certificateTemplates.map((template) => (
                <div
                  key={template.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-800 text-sm mb-1">{template.name}</h4>
                      <p className="text-xs text-gray-500 mb-3">{template.description}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <button
                    onClick={() => onDownloadTemplate(template)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Template
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setCertificateTab('all')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                certificateTab === 'all'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              All ({projects.filter(p => p.status === 'completed').length})
            </button>
            <button
              onClick={() => setCertificateTab('pending')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                certificateTab === 'pending'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pending ({projects.filter(p => {
                if (p.status !== 'completed') return false;
                const recStatus = p.recommendationLetter?.status || 'not-requested';
                return recStatus === 'not-requested' || recStatus === 'requested';
              }).length})
            </button>
            <button
              onClick={() => setCertificateTab('received')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                certificateTab === 'received'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Received ({projects.filter(p => p.status === 'completed' && p.recommendationLetter?.status === 'received').length})
            </button>
          </nav>
        </div>
      </div>

      {/* Completed Projects List */}
      <div>
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-1">
            {certificateTab === 'all' && 'All Certificates'}
            {certificateTab === 'pending' && 'Pending Certificates'}
            {certificateTab === 'received' && 'Received Certificates'}
          </h3>
          <p className="text-sm text-gray-500">
            Showing {paginatedCompletedProjects.length} of {filteredCompletedProjects.length} completed projects
            {filteredCompletedProjects.length > itemsPerPage && (
              <span className="ml-2">(Page {currentPage} of {totalPages})</span>
            )}
          </p>
        </div>
        
        {filteredCompletedProjects.length > 0 ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {paginatedCompletedProjects.map((project) => {
              // Check if deadline is valid
              const hasValidDeadline = project.deadline && !isNaN(new Date(project.deadline).getTime());
              
              let diffDays = 0;
              let isOverdue = false;
              
              if (hasValidDeadline) {
                const deadline = new Date(project.deadline);
                const today = new Date();
                const diffTime = deadline.getTime() - today.getTime();
                diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                isOverdue = diffDays < 0 && project.status !== 'completed';
              }

              return (
                <div 
                  key={project.id} 
                  onClick={() => onSelectProject(project.id, "equipment")}
                  className={`bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] border transition-all duration-300 overflow-hidden group cursor-pointer flex flex-col ${
                    project.status === 'completed' ? 'h-[750px]' : 'h-[650px]'
                  } ${
                  isOverdue 
                    ? 'border-red-200 hover:border-red-300 hover:shadow-[0_4px_16px_rgba(239,68,68,0.15),0_2px_8px_rgba(239,68,68,0.1)]' 
                    : 'border-gray-100 hover:border-gray-200 hover:shadow-[0_8px_25px_rgba(0,0,0,0.12),0_4px_10px_rgba(0,0,0,0.08)]'
                  }`}
                >
                  {/* Premium White Header with Neumorphic Effect */}
                  <div className="h-auto sm:h-24 bg-white p-4 pb-4 sm:pb-4 text-gray-800 border-b border-gray-100 relative group-hover:shadow-inner transition-all duration-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8),inset_0_-1px_0_0_rgba(0,0,0,0.05)]">
                    {/* Click Indicator */}
                    <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-0">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-1 sm:mb-1 truncate">{project.name}</h3>
                        <p className="hidden sm:block text-xs text-blue-600 font-medium mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          Click to view details →
                        </p>
                        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-4 text-xs sm:text-sm text-gray-600 mb-1 sm:mb-0">
                          <span className="flex items-center gap-1 min-w-0">
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span className="truncate max-w-[140px] sm:max-w-none">{project.client}</span>
                          </span>
                          <span className="flex items-center gap-1 min-w-0">
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="truncate max-w-[140px] sm:max-w-none">{project.location}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-start sm:items-end gap-1 sm:gap-1 mt-1 sm:mt-0">
                        {/* Days Counter / Completion Status */}
                        <div className="text-left sm:text-right min-w-[140px]">
                          {project.status === 'completed' ? (
                            <>
                              <div className="text-xs text-gray-500 mb-1">Completed on</div>
                              <div className="text-lg font-bold text-green-600">
                                {project.completedDate 
                                  ? new Date(project.completedDate).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      year: 'numeric' 
                                    })
                                  : new Date().toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      year: 'numeric' 
                                    })}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1 leading-none">Days to Completion Date</div>
                              <div className={`text-base sm:text-lg font-bold whitespace-nowrap leading-none ${
                                isOverdue ? 'text-red-600' : 'text-blue-600'
                              }`}>
                                {(() => {
                                  if (!hasValidDeadline) {
                                    return <span className="text-gray-500">No deadline set</span>;
                                  } else if (diffDays < 0) {
                                    return <span className="text-red-600">{Math.abs(diffDays)} days overdue</span>;
                                  } else if (diffDays === 0) {
                                    return <span className="text-orange-600">Due today</span>;
                                  } else {
                                    return <span>{diffDays} days to go</span>;
                                  }
                                })()}
                              </div>
                            </>
                          )}
                        </div>
                        
                        {/* Edit & Delete Buttons */}
                        {userRole !== 'vdcr_manager' && userRole !== 'editor' && userRole !== 'viewer' && (
                          <div className="flex items-center gap-1 pb-0 sm:pb-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditProject(project.id);
                              }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              title="Edit Project"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteProject(project.id);
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Delete Project"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Recommendation Letter Actions - Only for Completed Projects */}
                  {project.status === 'completed' && (
                    <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-green-50">
                      <div className="text-sm font-medium text-gray-700 mb-3">Recommendation Letter</div>
                      <div className="flex gap-2">
                        {project.recommendationLetter?.status === 'received' ? (
                          <>
                            <div className="flex items-center gap-2 text-green-600 text-sm">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span>Received</span>
                            </div>
                            {project.recommendationLetter.receivedDocument && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewRecommendationLetter(project);
                                }}
                                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 border-blue-300"
                              >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                View Letter
                              </Button>
                            )}
                          </>
                        ) : project.recommendationLetter?.status === 'requested' ? (
                          <>
                            <div className="flex items-center gap-2 text-yellow-600 text-sm mb-3">
                              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                              <span>Requested</span>
                            </div>
                            <div className="flex gap-2">
                              {project.recommendationLetter.reminderCount && project.recommendationLetter.reminderCount > 0 ? (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-xs flex-shrink-0">
                                  <div className="flex items-center gap-1 text-orange-700 font-medium mb-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 0115 0v5z" />
                                    </svg>
                                    {project.recommendationLetter.reminderCount} sent
                                  </div>
                                  {project.recommendationLetter.lastReminderDateTime && (
                                    <div className="text-orange-600 text-xs">Last: {project.recommendationLetter.lastReminderDateTime}</div>
                                  )}
                                </div>
                              ) : null}
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSendRecommendationReminder(project);
                                }}
                                className="flex-1 text-orange-600 hover:text-orange-800 hover:bg-orange-50 border-orange-300"
                              >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 0115 0v5z" />
                                </svg>
                                {project.recommendationLetter.reminderCount && project.recommendationLetter.reminderCount > 0 ? 'Send Another' : 'Send Reminder'}
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUploadRecommendationLetter(project);
                                }}
                                className="flex-1 bg-green-600 text-white hover:bg-green-700 border-green-600"
                              >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                Upload Letter
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRequestRecommendationLetter(project);
                              }}
                              className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              Request Letter
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUploadRecommendationLetter(project);
                              }}
                              className="flex-1 bg-green-600 text-white hover:bg-green-700 border-green-600"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              Upload Letter
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Project Details Grid */}
                  <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Project Manager</span>
                        <p className="font-semibold text-gray-800 mt-1">{project.manager}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">PO Number</span>
                        <p className="font-semibold text-gray-800 mt-1">{project.poNumber}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Completion Date</span>
                        <p className="font-semibold text-gray-800 mt-1">
                          {project.status === 'completed' && project.completedDate
                            ? new Date(project.completedDate).toISOString().split('T')[0]
                            : project.deadline}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Equipment</span>
                        <p className="font-semibold text-gray-800 mt-1">{project.equipmentCount} units</p>
                      </div>
                    </div>
                  </div>

                  {/* Equipment Breakdown Section */}
                  <div className="p-6 bg-gradient-to-r from-slate-50 to-blue-50 border-l-4 border-blue-200 flex-1 flex flex-col min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Equipment Breakdown
                      </span>
                      <span className="text-sm font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                        {project.equipmentCount} units
                      </span>
                    </div>
                    
                    {/* Equipment Type Breakdown with Carousel */}
                    <div className="relative flex-1 flex flex-col">
                      <div className="grid grid-cols-2 gap-3">
                        {(() => {
                          const equipmentBreakdown = project.equipmentBreakdown || {};
                          const hasEquipment = Object.values(equipmentBreakdown).some(count => (count as number) > 0);
                          
                          if (!hasEquipment) {
                            return (
                              <div className="col-span-2 text-center py-8">
                                <div className="text-gray-400 mb-2">
                                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                </div>
                                <p className="text-sm text-gray-500">No equipment added yet</p>
                                <p className="text-xs text-gray-400 mt-1">Project Manager will add equipment details</p>
                              </div>
                            );
                          }
                          
                          const equipmentTypes: Array<{ name: string; count: number; color: string }> = [];
                          
                          if (equipmentBreakdown.pressureVessel && equipmentBreakdown.pressureVessel > 0) {
                            equipmentTypes.push({ name: 'Pressure Vessels', count: equipmentBreakdown.pressureVessel, color: 'blue' });
                          }
                          if (equipmentBreakdown.heatExchanger && equipmentBreakdown.heatExchanger > 0) {
                            equipmentTypes.push({ name: 'Heat Exchangers', count: equipmentBreakdown.heatExchanger, color: 'green' });
                          }
                          if (equipmentBreakdown.reactor && equipmentBreakdown.reactor > 0) {
                            equipmentTypes.push({ name: 'Reactors', count: equipmentBreakdown.reactor, color: 'blue' });
                          }
                          if (equipmentBreakdown.storageTank && equipmentBreakdown.storageTank > 0) {
                            equipmentTypes.push({ name: 'Storage Tanks', count: equipmentBreakdown.storageTank, color: 'orange' });
                          }
                          
                          const standardKeys = ['pressureVessel', 'heatExchanger', 'reactor', 'storageTank'];
                          Object.entries(equipmentBreakdown).forEach(([key, count]) => {
                            if (!standardKeys.includes(key) && count && count > 0) {
                              let readableName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                              if (key === 'distillationcolumn' || readableName === 'Distillationcolumn') readableName = 'Column';
                              const colors = ['indigo', 'pink', 'red', 'yellow', 'teal', 'cyan'];
                              const colorIndex = equipmentTypes.length % colors.length;
                              equipmentTypes.push({ 
                                name: readableName, 
                                count: count, 
                                color: colors[colorIndex] 
                              });
                            }
                          });
                          
                          const currentIndex = equipmentCarouselIndex[project.id] || 0;
                          const itemsPerPage = 4;
                          const startIndex = currentIndex * itemsPerPage;
                          const endIndex = startIndex + itemsPerPage;
                          const visibleEquipment = equipmentTypes.slice(startIndex, endIndex);
                          
                          return visibleEquipment.map((equipment, index) => (
                            <div key={index} className="bg-white/70 rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-gray-600">{equipment.name}</span>
                                <span className={`text-xs font-bold ${
                                  equipment.color === 'blue' ? 'text-blue-800' :
                                  equipment.color === 'green' ? 'text-green-800' :
                                  equipment.color === 'blue' ? 'text-blue-800' :
                                  equipment.color === 'orange' ? 'text-orange-800' :
                                  equipment.color === 'indigo' ? 'text-indigo-800' :
                                  equipment.color === 'pink' ? 'text-pink-800' :
                                  equipment.color === 'teal' ? 'text-teal-800' :
                                  equipment.color === 'amber' ? 'text-amber-800' :
                                  equipment.color === 'red' ? 'text-red-800' :
                                  equipment.color === 'yellow' ? 'text-yellow-800' :
                                  equipment.color === 'cyan' ? 'text-cyan-800' :
                                  'text-gray-800'
                                }`}>{equipment.count}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {equipment.color === 'blue' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-blue-300"></div>
                                  </>
                                )}
                                {equipment.color === 'green' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-green-300"></div>
                                  </>
                                )}
                                {equipment.color === 'blue' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-blue-300"></div>
                                  </>
                                )}
                                {equipment.color === 'orange' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-orange-300"></div>
                                  </>
                                )}
                                {equipment.color === 'indigo' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-indigo-300"></div>
                                  </>
                                )}
                                {equipment.color === 'pink' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-pink-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-pink-300"></div>
                                  </>
                                )}
                                {equipment.color === 'teal' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-teal-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-teal-300"></div>
                                  </>
                                )}
                                {equipment.color === 'amber' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-amber-300"></div>
                                  </>
                                )}
                                {equipment.color === 'red' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-red-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-red-300"></div>
                                  </>
                                )}
                                {equipment.color === 'yellow' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-yellow-300"></div>
                                  </>
                                )}
                                {equipment.color === 'cyan' && (
                                  <>
                                    <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                                    <div className="w-2 h-2 rounded-full bg-cyan-300"></div>
                                  </>
                                )}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                      
                      {/* Carousel Navigation */}
                      <div className="mt-auto">
                        {(() => {
                          const equipmentBreakdown = project.equipmentBreakdown || {};
                          const hasEquipment = Object.values(equipmentBreakdown).some(count => (count as number) > 0);
                          
                          if (!hasEquipment) return null;
                          
                          const equipmentTypes: Array<{ name: string; count: number; color: string }> = [];
                          
                          if (equipmentBreakdown.pressureVessel && equipmentBreakdown.pressureVessel > 0) {
                            equipmentTypes.push({ name: 'Pressure Vessels', count: equipmentBreakdown.pressureVessel, color: 'blue' });
                          }
                          if (equipmentBreakdown.heatExchanger && equipmentBreakdown.heatExchanger > 0) {
                            equipmentTypes.push({ name: 'Heat Exchangers', count: equipmentBreakdown.heatExchanger, color: 'green' });
                          }
                          if (equipmentBreakdown.reactor && equipmentBreakdown.reactor > 0) {
                            equipmentTypes.push({ name: 'Reactors', count: equipmentBreakdown.reactor, color: 'blue' });
                          }
                          if (equipmentBreakdown.storageTank && equipmentBreakdown.storageTank > 0) {
                            equipmentTypes.push({ name: 'Storage Tanks', count: equipmentBreakdown.storageTank, color: 'orange' });
                          }
                          
                          const standardKeys = ['pressureVessel', 'heatExchanger', 'reactor', 'storageTank'];
                          Object.entries(equipmentBreakdown).forEach(([key, count]) => {
                            if (!standardKeys.includes(key) && count && count > 0) {
                              let readableName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                              if (key === 'distillationcolumn' || readableName === 'Distillationcolumn') readableName = 'Column';
                              const colors = ['indigo', 'pink', 'red', 'yellow', 'teal', 'cyan'];
                              const colorIndex = equipmentTypes.length % colors.length;
                              equipmentTypes.push({ 
                                name: readableName, 
                                count: count, 
                                color: colors[colorIndex] 
                              });
                            }
                          });
                          
                          const totalEquipmentTypes = equipmentTypes.length;
                          const currentIndex = equipmentCarouselIndex[project.id] || 0;
                          const itemsPerPage = 4;
                          const totalPages = Math.ceil(totalEquipmentTypes / itemsPerPage);
                          const hasMorePages = totalPages > 1;
                          
                          if (!hasMorePages) return null;
                          
                          return (
                            <div className="flex items-center justify-center gap-2 mt-4">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newIndex = Math.max(0, (equipmentCarouselIndex[project.id] || 0) - 1);
                                  onSetEquipmentCarouselIndex(prev => ({
                                    ...prev,
                                    [project.id]: newIndex
                                  }));
                                }}
                                disabled={currentIndex === 0}
                                className={`p-1 rounded-full transition-colors ${
                                  currentIndex === 0 
                                    ? 'text-gray-300 cursor-not-allowed' 
                                    : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                                }`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                              </button>
                              
                              <div className="flex gap-1">
                                {Array.from({ length: totalPages }, (_, i) => (
                                  <div
                                    key={i}
                                    className={`w-2 h-2 rounded-full transition-colors ${
                                      i === currentIndex 
                                        ? 'bg-blue-500' 
                                        : 'bg-gray-300'
                                    }`}
                                  ></div>
                                ))}
                              </div>
                              
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newIndex = Math.min(
                                    totalPages - 1,
                                    (equipmentCarouselIndex[project.id] || 0) + 1
                                  );
                                  onSetEquipmentCarouselIndex(prev => ({
                                    ...prev,
                                    [project.id]: newIndex
                                  }));
                                }}
                                disabled={currentIndex >= totalPages - 1}
                                className={`p-1 rounded-full transition-colors ${
                                  currentIndex >= totalPages - 1 
                                    ? 'text-gray-300 cursor-not-allowed' 
                                    : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                                }`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="p-4 sm:p-6 border-t border-gray-100 bg-white mt-auto">
                    <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 sm:gap-3 overflow-visible">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (equipmentLock?.isLocked && onShowEquipmentLockModal) {
                            onShowEquipmentLockModal();
                            return;
                          }
                          onSelectProject(project.id, "equipment");
                        }}
                        className={`w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center font-medium transition-all duration-200 ${
                          equipmentLock?.isLocked
                            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-80'
                            : 'bg-white hover:bg-blue-50 border-gray-300 text-gray-700 hover:text-blue-700 hover:border-blue-300'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="sm:hidden">Equip</span>
                        <span className="hidden sm:inline">View Equipment</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectProject(project.id, "vdcr");
                        }}
                        className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-green-50 border-gray-300 text-gray-700 hover:text-green-700 hover:border-green-300 font-medium transition-all duration-200"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="sm:hidden">VDCR</span>
                        <span className="hidden sm:inline">View VDCR</span>
                      </Button>
                      {userRole !== 'vdcr_manager' && userRole !== 'editor' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectProject(project.id, "project-details");
                          }}
                          className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-blue-50 border-gray-300 text-gray-700 hover:text-blue-700 hover:border-blue-300 font-medium transition-all duration-200"
                        >
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span className="sm:hidden">Details</span>
                          <span className="hidden sm:inline">Details</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="text-sm text-gray-600">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredCompletedProjects.length)} of {filteredCompletedProjects.length} projects
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
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
                          className={`px-3 py-1.5 text-sm font-medium rounded-md ${
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
                    disabled={currentPage >= totalPages}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500">No completed projects found in this category</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompletionCertificatesTab;

