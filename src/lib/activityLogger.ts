import { activityApi } from './activityApi';

// Activity types enum for type safety
export enum ActivityType {
  // Equipment actions
  EQUIPMENT_CREATED = 'equipment_created',
  EQUIPMENT_UPDATED = 'equipment_updated',
  EQUIPMENT_DELETED = 'equipment_deleted',
  
  // Technical specifications
  TECHNICAL_SPECS_UPDATED = 'technical_specs_updated',
  TECHNICAL_SECTION_ADDED = 'technical_section_added',
  TECHNICAL_SECTION_REMOVED = 'technical_section_removed',
  TECHNICAL_SECTION_UPDATED = 'technical_section_updated',
  
  // Document actions
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_UPDATED = 'document_updated',
  DOCUMENT_DELETED = 'document_deleted',
  PROGRESS_IMAGE_UPLOADED = 'progress_image_uploaded',
  PROGRESS_IMAGE_DELETED = 'progress_image_deleted',
  
  // Status changes
  STATUS_CHANGED = 'status_changed',
  PRIORITY_CHANGED = 'priority_changed',
  LOCATION_CHANGED = 'location_changed',
  
  // Team management
  TEAM_MEMBER_ADDED = 'team_member_added',
  TEAM_MEMBER_REMOVED = 'team_member_removed',
  TEAM_MEMBER_ROLE_CHANGED = 'team_member_role_changed',
  
  // Project actions
  PROJECT_CREATED = 'project_created',
  PROJECT_UPDATED = 'project_updated',
  PROJECT_DELETED = 'project_deleted',
  
  // Equipment assignments
  EQUIPMENT_ASSIGNED = 'equipment_assigned',
  EQUIPMENT_UNASSIGNED = 'equipment_unassigned',
  
  // Other
  CUSTOM_FIELD_UPDATED = 'custom_field_updated',
  NOTES_UPDATED = 'notes_updated',
  PROGRESS_ENTRY_ADDED = 'progress_entry_added',
  PROGRESS_ENTRY_UPDATED = 'progress_entry_updated',
  PROGRESS_ENTRY_DELETED = 'progress_entry_deleted',
  
  // VDCR actions
  VDCR_CREATED = 'vdcr_created',
  VDCR_UPDATED = 'vdcr_updated',
  VDCR_DELETED = 'vdcr_deleted',
  VDCR_STATUS_CHANGED = 'vdcr_status_changed',
  VDCR_DOCUMENT_UPLOADED = 'vdcr_document_uploaded',
  VDCR_DOCUMENT_UPDATED = 'vdcr_document_updated',
  VDCR_FIELD_UPDATED = 'vdcr_field_updated'
}

// Helper function to get current user ID
const getCurrentUserId = (): string => {
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    // // console.log('🔍 User data from localStorage:', userData);
    return userData.id || userData.user_id || 'system';
  } catch (error) {
    console.error('❌ Error parsing user data:', error);
    return 'system';
  }
};

// Helper function to get current user name
const getCurrentUserName = (): string => {
  try {
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    // // console.log('🔍 User name from localStorage:', userData);
    return userData.full_name || userData.name || userData.user_name || userData.email || 'Unknown User';
  } catch (error) {
    console.error('❌ Error parsing user name:', error);
    return 'Unknown User';
  }
};

// Main activity logging function
export const logActivity = async (data: {
  projectId: string | null | undefined; // Nullable/undefined for standalone equipment (standalone equipment has no projectId)
  equipmentId?: string;
  activityType: ActivityType;
  actionDescription: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: any;
}) => {
  try {
    // // console.log('🔍 logActivity called with:', data);
    const userId = getCurrentUserId();
    // // console.log('🔍 Current user ID:', userId);
    
    // Use standalone equipment table if projectId is null, undefined, or 'standalone' (standalone equipment has no project)
    // Standalone equipment has no projectId - only equipmentId is available
    const isStandalone = data.projectId === null || data.projectId === undefined || data.projectId === 'standalone';
    
    if (isStandalone && data.equipmentId) {
      const result = await activityApi.logStandaloneEquipmentActivity({
        equipmentId: data.equipmentId,
        activityType: data.activityType,
        actionDescription: data.actionDescription,
        fieldName: data.fieldName,
        oldValue: data.oldValue,
        newValue: data.newValue,
        metadata: data.metadata,
        createdBy: userId
      });
      // // console.log('✅ Standalone equipment activity logged successfully:', result);
    } else if (data.projectId && data.equipmentId) {
      // Use regular equipment_activity_logs table for project equipment (projectId must be a valid UUID)
      const result = await activityApi.logEquipmentActivity({
        projectId: data.projectId,
        equipmentId: data.equipmentId,
        activityType: data.activityType,
        actionDescription: data.actionDescription,
        fieldName: data.fieldName,
        oldValue: data.oldValue,
        newValue: data.newValue,
        metadata: data.metadata,
        createdBy: userId
      });
      // // console.log('✅ Activity logged successfully:', result);
    }
  } catch (error) {
    console.error('❌ Failed to log activity:', error);
    // Don't throw error to prevent breaking the main action
  }
};

// Specific logging functions for common actions

// Equipment logging
export const logEquipmentCreated = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.EQUIPMENT_CREATED,
    actionDescription: `Equipment "${equipmentType}" (${tagNumber}) was created`,
    metadata: { equipmentType, tagNumber }
  });
};

export const logEquipmentUpdated = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string, changes: Record<string, { old: any; new: any }>) => {
  const changeDescriptions = Object.entries(changes).map(([field, { old, new: newVal }]) => {
    // Handle special cases for better readability
    if (field === 'technical_sections') {
      return `Technical sections updated`;
    } else if (field === 'custom_fields') {
      return `Custom fields updated`;
    } else if (field === 'team_custom_fields') {
      return `Team custom fields updated`;
    } else {
      return `${field}: "${old}" → "${newVal}"`;
    }
  }).join(', ');
  
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.EQUIPMENT_UPDATED,
    actionDescription: `Equipment "${equipmentType}" (${tagNumber}) was updated: ${changeDescriptions}`,
    metadata: { equipmentType, tagNumber, changes }
  });
};

export const logEquipmentDeleted = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.EQUIPMENT_DELETED,
    actionDescription: `Equipment "${equipmentType}" (${tagNumber}) was deleted`,
    metadata: { equipmentType, tagNumber }
  });
};

// Technical specifications logging
export const logTechnicalSpecsUpdated = async (projectId: string, equipmentId: string, equipmentType: string, tagNumber: string, fieldName: string, oldValue: any, newValue: any) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.TECHNICAL_SPECS_UPDATED,
    actionDescription: `Technical specifications updated for "${equipmentType}" (${tagNumber}): ${fieldName} changed from "${oldValue}" to "${newValue}"`,
    fieldName,
    oldValue: String(oldValue),
    newValue: String(newValue),
    metadata: { equipmentType, tagNumber }
  });
};

export const logTechnicalSectionAdded = async (projectId: string, equipmentId: string, equipmentType: string, tagNumber: string, sectionName: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.TECHNICAL_SECTION_ADDED,
    actionDescription: `Technical section "${sectionName}" added to "${equipmentType}" (${tagNumber})`,
    metadata: { equipmentType, tagNumber, sectionName }
  });
};

export const logTechnicalSectionRemoved = async (projectId: string, equipmentId: string, equipmentType: string, tagNumber: string, sectionName: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.TECHNICAL_SECTION_REMOVED,
    actionDescription: `Technical section "${sectionName}" removed from "${equipmentType}" (${tagNumber})`,
    metadata: { equipmentType, tagNumber, sectionName }
  });
};

// Log detailed technical section changes
export const logTechnicalSectionDetailedUpdate = async (projectId: string, equipmentId: string, equipmentType: string, tagNumber: string, sectionName: string, fieldChanges: Record<string, { old: any; new: any }>) => {
  const changeDescriptions = Object.entries(fieldChanges).map(([field, { old, new: newVal }]) => 
    `${field}: "${old}" → "${newVal}"`
  ).join(', ');
  
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.TECHNICAL_SECTION_UPDATED,
    actionDescription: `Technical section "${sectionName}" updated for "${equipmentType}" (${tagNumber}): ${changeDescriptions}`,
    metadata: { equipmentType, tagNumber, sectionName, fieldChanges }
  });
};

// Document logging
export const logDocumentUploaded = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string, documentType: string, fileName: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.DOCUMENT_UPLOADED,
    actionDescription: `${documentType} document "${fileName}" uploaded for "${equipmentType}" (${tagNumber})`,
    metadata: { equipmentType, tagNumber, documentType, fileName }
  });
};

export const logDocumentDeleted = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string, documentType: string, fileName: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.DOCUMENT_DELETED,
    actionDescription: `${documentType} document "${fileName}" deleted from "${equipmentType}" (${tagNumber})`,
    metadata: { equipmentType, tagNumber, documentType, fileName }
  });
};

export const logProgressImageUploaded = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string, imageDescription?: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.PROGRESS_IMAGE_UPLOADED,
    actionDescription: `Progress image uploaded for "${equipmentType}" (${tagNumber})${imageDescription ? `: ${imageDescription}` : ''}`,
    metadata: { equipmentType, tagNumber, imageDescription }
  });
};

// Status changes
export const logStatusChanged = async (projectId: string, equipmentId: string, equipmentType: string, tagNumber: string, oldStatus: string, newStatus: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.STATUS_CHANGED,
    actionDescription: `Status changed for "${equipmentType}" (${tagNumber}): ${oldStatus} → ${newStatus}`,
    fieldName: 'status',
    oldValue: oldStatus,
    newValue: newStatus,
    metadata: { equipmentType, tagNumber }
  });
};

// Project logging
export const logProjectCreated = async (projectId: string, projectName: string) => {
  await logActivity({
    projectId,
    activityType: ActivityType.PROJECT_CREATED,
    actionDescription: `Project "${projectName}" was created`,
    metadata: { projectName }
  });
};

export const logProjectUpdated = async (projectId: string, projectName: string, changes: Record<string, { old: any; new: any }>) => {
  const changeDescriptions = Object.entries(changes).map(([field, { old, new: newVal }]) => 
    `${field}: "${old}" → "${newVal}"`
  ).join(', ');
  
  await logActivity({
    projectId,
    activityType: ActivityType.PROJECT_UPDATED,
    actionDescription: `Project "${projectName}" was updated: ${changeDescriptions}`,
    metadata: { projectName, changes }
  });
};

export const logProjectDeleted = async (projectId: string, projectName: string) => {
  await logActivity({
    projectId,
    activityType: ActivityType.PROJECT_DELETED,
    actionDescription: `Project "${projectName}" was deleted`,
    metadata: { projectName }
  });
};

// Progress entry logging
export const logProgressEntryAdded = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string, entryType: string, entryText: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.PROGRESS_ENTRY_ADDED,
    actionDescription: `${entryType} progress entry added for "${equipmentType}" (${tagNumber}): ${entryText.substring(0, 100)}${entryText.length > 100 ? '...' : ''}`,
    metadata: { equipmentType, tagNumber, entryType, entryText }
  });
};

export const logProgressEntryUpdated = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string, entryType: string, entryText: string, hasAudio: boolean = false, hasImage: boolean = false) => {
  let description = `${entryType} progress entry updated for "${equipmentType}" (${tagNumber}): ${entryText.substring(0, 100)}${entryText.length > 100 ? '...' : ''}`;
  if (hasAudio || hasImage) {
    const attachments = [];
    if (hasAudio) attachments.push('audio');
    if (hasImage) attachments.push('image');
    description += ` [${attachments.join(', ')} ${attachments.length > 1 ? 'attached' : 'attached'}]`;
  }
  
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.PROGRESS_ENTRY_UPDATED,
    actionDescription: description,
    metadata: { equipmentType, tagNumber, entryType, entryText, hasAudio, hasImage }
  });
};

export const logProgressEntryDeleted = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string, entryType: string, entryText: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.PROGRESS_ENTRY_DELETED,
    actionDescription: `${entryType} progress entry deleted for "${equipmentType}" (${tagNumber}): ${entryText.substring(0, 100)}${entryText.length > 100 ? '...' : ''}`,
    metadata: { equipmentType, tagNumber, entryType, entryText }
  });
};

// Team member logging
export const logTeamMemberAdded = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string, memberName: string, role: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.TEAM_MEMBER_ADDED,
    actionDescription: `Team member "${memberName}" added as ${role} for "${equipmentType}" (${tagNumber})`,
    metadata: { equipmentType, tagNumber, memberName, role }
  });
};

// Batch team member logging - for adding same member to multiple equipment
export const logTeamMemberAddedBatch = async (
  projectId: string, 
  equipmentList: Array<{ id: string; type: string; tagNumber: string }>, 
  memberName: string, 
  role: string
) => {
  if (equipmentList.length === 0) return;
  
  // If only one equipment, use regular logging
  if (equipmentList.length === 1) {
    const eq = equipmentList[0];
    return await logTeamMemberAdded(
      projectId,
      eq.id,
      eq.type || 'Equipment',
      eq.tagNumber || 'Unknown',
      memberName,
      role
    );
  }
  
  // Multiple equipment - create single log entry
  // Don't include full tag list in summary since it's shown in detailed list below
  const equipmentCount = equipmentList.length;
  const equipmentTypes = [...new Set(equipmentList.map(eq => eq.type || 'Equipment').filter(Boolean))];
  
  const typeSummary = equipmentTypes.length === 1 
    ? equipmentTypes[0] 
    : `${equipmentTypes.length} equipment types`;
  
  // For display in header, just use count - detailed list is shown below
  const tagNumberDisplay = `${equipmentCount} equipment`;
  
  await logActivity({
    projectId,
    equipmentId: equipmentList[0].id, // Use first equipment ID as primary
    activityType: ActivityType.TEAM_MEMBER_ADDED,
    actionDescription: `Team member "${memberName}" added as ${role} to multiple equipment`,
    metadata: { 
      equipmentType: typeSummary,
      tagNumber: tagNumberDisplay, // Simplified for header
      equipmentCount: equipmentCount, // Add count for easier display
      equipmentList: equipmentList.map(eq => ({
        id: eq.id,
        type: eq.type || 'Equipment',
        tagNumber: eq.tagNumber || 'Unknown'
      })),
      memberName, 
      role,
      isBatch: true
    }
  });
};

export const logTeamMemberRemoved = async (projectId: string | null, equipmentId: string, equipmentType: string, tagNumber: string, memberName: string, role: string) => {
  await logActivity({
    projectId,
    equipmentId,
    activityType: ActivityType.TEAM_MEMBER_REMOVED,
    actionDescription: `Team member "${memberName}" removed from ${role} role for "${equipmentType}" (${tagNumber})`,
    metadata: { equipmentType, tagNumber, memberName, role }
  });
};

// ============================================================================
// VDCR LOGGING FUNCTIONS
// ============================================================================

export const logVDCRCreated = async (projectId: string, vdcrId: string, documentName: string) => {
  const userId = getCurrentUserId();
  await activityApi.logVDCRActivity({
    projectId,
    vdcrId,
    activityType: ActivityType.VDCR_CREATED,
    actionDescription: `VDCR record created: ${documentName}`,
    createdBy: userId,
    metadata: { documentName }
  });
};

export const logVDCRUpdated = async (projectId: string, vdcrId: string, documentName: string, changes: Record<string, { old: any; new: any }>) => {
  const userId = getCurrentUserId();
  const changeDescriptions = Object.entries(changes).map(([field, values]) => 
    `${field}: ${values.old} → ${values.new}`
  ).join(', ');
  
  await activityApi.logVDCRActivity({
    projectId,
    vdcrId,
    activityType: ActivityType.VDCR_UPDATED,
    actionDescription: `VDCR record updated: ${documentName} - ${changeDescriptions}`,
    createdBy: userId,
    metadata: { documentName, changes }
  });
};

// Log single field update (for individual field changes)
export const logVDCRFieldUpdated = async (projectId: string, vdcrId: string, documentName: string, fieldName: string, oldValue: string, newValue: string) => {
  const userId = getCurrentUserId();
  await activityApi.logVDCRActivity({
    projectId,
    vdcrId,
    activityType: ActivityType.VDCR_FIELD_UPDATED,
    actionDescription: `VDCR ${fieldName} updated: ${documentName} - ${oldValue} → ${newValue}`,
    fieldName: fieldName,
    oldValue: String(oldValue),
    newValue: String(newValue),
    createdBy: userId,
    metadata: { documentName, fieldName }
  });
};

export const logVDCRStatusChanged = async (projectId: string, vdcrId: string, documentName: string, oldStatus: string, newStatus: string) => {
  const userId = getCurrentUserId();
  await activityApi.logVDCRActivity({
    projectId,
    vdcrId,
    activityType: ActivityType.VDCR_STATUS_CHANGED,
    actionDescription: `VDCR status changed: ${documentName} - ${oldStatus} → ${newStatus}`,
    fieldName: 'status',
    oldValue: oldStatus,
    newValue: newStatus,
    createdBy: userId,
    metadata: { documentName }
  });
};

export const logVDCRDocumentUploaded = async (projectId: string, vdcrId: string, documentName: string, fileName: string) => {
  const userId = getCurrentUserId();
  await activityApi.logVDCRActivity({
    projectId,
    vdcrId,
    activityType: ActivityType.VDCR_DOCUMENT_UPLOADED,
    actionDescription: `Document uploaded to VDCR: ${documentName} - ${fileName}`,
    createdBy: userId,
    metadata: { documentName, fileName }
  });
};

export const logVDCRDeleted = async (projectId: string, vdcrId: string, documentName: string) => {
  const userId = getCurrentUserId();
  await activityApi.logVDCRActivity({
    projectId,
    vdcrId,
    activityType: ActivityType.VDCR_DELETED,
    actionDescription: `VDCR record deleted: ${documentName}`,
    createdBy: userId,
    metadata: { documentName }
  });
};
