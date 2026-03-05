import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Building, Wrench, AlertTriangle, Image, FileCheck, UserPlus, TrendingUp, FileText, ArrowRight } from "lucide-react";

interface StandaloneEquipmentLogsTabProps {
  equipmentId: string;
  projectId: string;
  onActivityUpdate?: () => void;
  viewingEquipment?: any; // Equipment data for context
}

const StandaloneEquipmentLogsTab: React.FC<StandaloneEquipmentLogsTabProps> = ({
  equipmentId,
  projectId,
  onActivityUpdate,
  viewingEquipment
}) => {
  const [equipmentActivityLogs, setEquipmentActivityLogs] = useState<any[]>([]);
  const [isLoadingEquipmentLogs, setIsLoadingEquipmentLogs] = useState(false);
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState('');

  const isLoadingRef = useRef(false);
  const loadEquipmentActivityLogsRef = useRef<(() => Promise<void>) | null>(null);

  const loadEquipmentActivityLogs = useCallback(async () => {
    if (!equipmentId || projectId !== 'standalone') return;
    
    // Prevent concurrent loads - if already loading, skip this call
    if (isLoadingRef.current) {
      return;
    }
    
    try {
      isLoadingRef.current = true;
      setIsLoadingEquipmentLogs(true);
      const { activityApi } = await import('@/lib/activityApi');
      // Use standalone equipment activity logs API
      const entries = await activityApi.getStandaloneEquipmentActivityLogsByEquipment(equipmentId);
      setEquipmentActivityLogs(Array.isArray(entries) ? entries : []);
    } catch (error) {
      console.error('Error loading standalone equipment activity logs:', error);
      setEquipmentActivityLogs([]);
    } finally {
      isLoadingRef.current = false;
      setIsLoadingEquipmentLogs(false);
    }
  }, [equipmentId, projectId]);

  // Keep ref in sync with the callback
  useEffect(() => {
    loadEquipmentActivityLogsRef.current = loadEquipmentActivityLogs;
  }, [loadEquipmentActivityLogs]);

  const lastEquipmentIdRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);

  // Load logs when component mounts or equipmentId changes (only once per change)
  useEffect(() => {
    if (equipmentId && projectId === 'standalone' && lastEquipmentIdRef.current !== equipmentId) {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      lastEquipmentIdRef.current = equipmentId;
      hasInitializedRef.current = false;
      
      // Load initial data
      loadEquipmentActivityLogs();
      
      // Set up auto-refresh after initial load completes (wait 3 seconds to ensure initial load is done)
      const initTimeout = setTimeout(() => {
        hasInitializedRef.current = true;
        
        // Clear any existing interval before creating new one
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        
        // Set up 60-second auto-refresh
        intervalRef.current = setInterval(() => {
          loadEquipmentActivityLogs();
        }, 60000); // 60 seconds
      }, 3000);
      
      return () => {
        clearTimeout(initTimeout);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else if (!equipmentId || projectId !== 'standalone') {
      // Clear interval when equipmentId is cleared
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      lastEquipmentIdRef.current = null;
      hasInitializedRef.current = false;
    }
    // Intentionally exclude loadEquipmentActivityLogs to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentId, projectId]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Listen for equipment changes to refresh logs (event-based, not prop-based)
  useEffect(() => {
    if (projectId === 'standalone' && equipmentId) {
      const handleEquipmentChanged = (event: any) => {
        // Only refresh if this event is for the current equipment and not already loading
        const eventEquipmentId = event.detail?.equipmentId || event.detail?.id;
        if (eventEquipmentId === equipmentId && !isLoadingRef.current && loadEquipmentActivityLogsRef.current) {
          loadEquipmentActivityLogsRef.current();
        }
      };

      window.addEventListener('equipmentChanged', handleEquipmentChanged);

      return () => {
        window.removeEventListener('equipmentChanged', handleEquipmentChanged);
      };
    }
  }, [projectId, equipmentId]);

  // Handle activity updates via ref to avoid dependency issues
  const onActivityUpdateRef = useRef(onActivityUpdate);
  useEffect(() => {
    onActivityUpdateRef.current = onActivityUpdate;
  }, [onActivityUpdate]);

  // Don't create a useEffect for onActivityUpdate - it causes infinite loops
  // Instead, parent should call loadEquipmentActivityLogs directly or use events

  // Helper function to format date
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown date';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Helper function to get time ago
  const getTimeAgo = (dateString: string) => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (diffInSeconds < 60) return 'Just now';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
      if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
      return formatDate(dateString);
    } catch (error) {
      return 'Unknown';
    }
  };

  // Helper function to format values
  const formatValue = (value: any, fieldName?: string): string => {
    if (value === null || value === undefined) {
      return 'Not set';
    }
    
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) return 'None';
      return `${value.length} item${value.length !== 1 ? 's' : ''}`;
    }
    
    if (typeof value === 'object') {
      try {
        const str = JSON.stringify(value);
        if (str.length > 100) {
          return str.substring(0, 100) + '...';
        }
        return str;
      } catch (e) {
        return 'Object';
      }
    }
    
    const str = String(value);
    if (str.trim() === '') {
      return 'Not set';
    }
    
    return str;
  };

  // Helper function to parse changes from metadata or action description
  const parseChanges = (log: any) => {
    const changes: Array<{ field: string; old: string; new: string }> = [];
    
    // Try to get changes from metadata
    if (log.metadata?.changes && typeof log.metadata.changes === 'object') {
      Object.entries(log.metadata.changes).forEach(([field, change]: [string, any]) => {
        if (change && typeof change === 'object' && ('old' in change || 'new' in change)) {
          const formattedOld = formatValue(change.old, field);
          const formattedNew = formatValue(change.new, field);
          
          if (formattedOld !== formattedNew && 
              formattedOld !== 'Not set' && formattedNew !== 'Not set') {
            changes.push({
              field: field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              old: formattedOld,
              new: formattedNew
            });
          }
        }
      });
    }
    
    // Fallback to old_value and new_value if available
    if (changes.length === 0 && (log.old_value !== undefined || log.new_value !== undefined)) {
      const formattedOld = formatValue(log.old_value, log.field_name);
      const formattedNew = formatValue(log.new_value, log.field_name);
      
      if (formattedOld !== formattedNew && 
          formattedOld !== 'Not set' && formattedNew !== 'Not set') {
        changes.push({
          field: log.field_name ? log.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Field',
          old: formattedOld,
          new: formattedNew
        });
      }
    }
    
    return changes;
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
      'document_deleted': { label: 'Document Deleted', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-200', icon: FileCheck },
      'team_member_added': { label: 'Team Member', color: 'text-teal-800', bgColor: 'bg-teal-100', borderColor: 'border-teal-200', icon: UserPlus },
      'team_member_removed': { label: 'Team Member', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-200', icon: UserPlus },
      'progress_entry_added': { label: 'Progress Entry', color: 'text-blue-800', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: TrendingUp },
      'progress_entry_updated': { label: 'Progress Entry', color: 'text-blue-800', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: TrendingUp },
      'progress_entry_deleted': { label: 'Progress Entry', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-200', icon: TrendingUp },
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

  // Process activity logs
  const entries = equipmentActivityLogs || [];
  const equipmentLogs = entries.map((log: any, index: number) => {
    const changes = parseChanges(log);
    const activityInfo = getActivityTypeInfo(log.activity_type || '');
    const tagNumber = log.metadata?.tagNumber || log.metadata?.tag_number || viewingEquipment?.tagNumber || 'Unknown';
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

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search equipment logs by unit, status, or user..."
            value={equipmentSearchQuery}
            onChange={(e) => setEquipmentSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Activity Logs */}
      {isLoadingEquipmentLogs ? (
        <div className="flex items-center justify-center p-8">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredLogs.length > 0 ? (
        <div className="max-h-96 overflow-y-auto space-y-3 pr-1.5 sm:pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
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
                    {log.equipmentType !== 'Equipment' && (
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

                  {/* Progress Entry Added/Updated */}
                  {(log.activityType === 'progress_entry_added' || log.activityType === 'progress_entry_updated') && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-700 flex-wrap">
                      <TrendingUp size={12} className="sm:w-[14px] sm:h-[14px] text-blue-600 flex-shrink-0" />
                      <span className="text-gray-900">{log.description || 'Progress entry updated'}</span>
                    </div>
                  )}

                  {/* Fallback: Show description if no specific format */}
                  {log.changes.length === 0 && 
                   !['progress_image_uploaded', 'technical_specs_updated', 'technical_section_added', 'document_uploaded', 'document_updated', 'team_member_added', 'progress_entry_added', 'progress_entry_updated'].includes(log.activityType) && (
                    <p className="text-xs sm:text-sm text-gray-600">{log.description}</p>
                  )}
                </div>

                {/* Footer: Date and User */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pt-2 border-t border-gray-100 text-[10px] sm:text-xs text-gray-500">
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                    <Clock size={10} className="sm:w-3 sm:h-3 flex-shrink-0" />
                    <span>{log.updated}</span>
                    <span className="text-gray-400">({log.timeAgo})</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                    <span className="text-gray-400">By:</span>
                    <span className="font-medium text-gray-600 truncate">{log.updatedBy}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center p-8 text-gray-500">
          <Clock size={32} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm font-medium">No equipment logs match the search criteria.</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your search terms.</p>
        </div>
      )}
    </div>
  );
};

export default StandaloneEquipmentLogsTab;

