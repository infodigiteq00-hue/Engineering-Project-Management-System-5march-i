import { Equipment } from "@/types/equipment";

/**
 * Transforms database equipment data to frontend Equipment format
 * @param dbEquipment - Array of equipment objects from database
 * @returns Array of transformed Equipment objects
 */
export const transformEquipmentData = (dbEquipment: any[]): Equipment[] => {
  return dbEquipment.map((eq: any) => {
    return {
      id: eq.id,
      name: eq.name || '',
      type: eq.type || '',
      tagNumber: eq.tag_number || '',
      jobNumber: eq.job_number || '',
      manufacturingSerial: eq.manufacturing_serial || '',
      poCdd: eq.po_cdd || 'To be scheduled',
      status: eq.status || 'pending',
      progress: eq.progress || 0,
      progressPhase: eq.progress_phase || 'documentation',
      completionDate: eq.completion_date || 'No deadline set',
      location: eq.location || 'Not Assigned',
      supervisor: eq.supervisor || '',
      // For standalone equipment, prioritize last_update (DATE column) over updated_at (timestamp)
      // last_update is already a date string (YYYY-MM-DD), so use it directly
      lastUpdate: eq.last_update || (eq.updated_at ? new Date(eq.updated_at).toLocaleDateString() : new Date().toLocaleDateString()),
      last_update: eq.last_update || undefined, // Store raw date (DATE type) for standalone equipment
      updated_at: eq.updated_at || undefined, // Store raw timestamp for date inputs
      created_at: eq.created_at || undefined, // Store for fixed display order (first created = first in list)
      images: eq.images || [],
      progressImages: eq.progress_images || [], // Main progress images (top section)
      progressImagesMetadata: eq.progress_images_metadata || [], // Main progress images metadata
      // Normalize entries so UI always has entry_text and created_at for display (Updates tab)
      progressEntries: (eq.progress_entries || []).map((entry: any) => ({
        ...entry,
        entry_text: entry.entry_text ?? entry.text ?? entry.comment ?? '',
        text: entry.text ?? entry.entry_text ?? entry.comment ?? '',
        created_at: entry.created_at ?? entry.date,
      })),
      nextMilestone: eq.next_milestone || 'Initial Setup',
      nextMilestoneDate: eq.next_milestone_date,
      commencementDate: eq.commencement_date,
      notes: eq.notes,
      priority: eq.priority || 'medium',
      documents: eq.documents || [],
      isBasicInfo: eq.is_basic_info || true,
      // Technical specifications
      size: eq.size || '',
      weight: eq.weight || '',
      designCode: eq.design_code || '',
      material: eq.material || '',
      workingPressure: eq.working_pressure || '',
      designTemp: eq.design_temp || '',
      // Team positions
      welder: eq.welder || '',
      welderEmail: eq.welder_email || '',
      welderPhone: eq.welder_phone || '',
      qcInspector: eq.qc_inspector || '',
      qcInspectorEmail: eq.qc_inspector_email || '',
      qcInspectorPhone: eq.qc_inspector_phone || '',
      projectManager: eq.project_manager || '',
      projectManagerEmail: eq.project_manager_email || '',
      projectManagerPhone: eq.project_manager_phone || '',
      supervisorEmail: eq.supervisor_email || '',
      supervisorPhone: eq.supervisor_phone || '',
      supervisorRole: eq.supervisor_role || 'viewer',
      welderRole: eq.welder_role || 'viewer',
      qcInspectorRole: eq.qc_inspector_role || 'viewer',
      projectManagerRole: eq.project_manager_role || 'viewer',
      certificationTitle: eq.any_personal_title || '',
      // Dynamic team positions
      customTeamPositions: eq.custom_team_positions || [],
      // Custom fields
      custom_fields: eq.custom_fields || [],
      // Transform custom fields from database
      customFields: eq.custom_fields || [],
      // Technical sections
      technicalSections: eq.technical_sections || [],
      // Team custom fields
      teamCustomFields: eq.team_custom_fields || [],
      // Standalone equipment form fields (Step 2: Basic Information)
      clientName: eq.client_name || '',
      plantLocation: eq.plant_location || '',
      poNumber: eq.po_number || '',
      salesOrderDate: eq.sales_order_date || '',
      clientIndustry: eq.client_industry || '',
      equipmentManager: eq.equipment_manager || '',
      consultant: eq.consultant || '',
      tpiAgency: eq.tpi_agency || '',
      clientFocalPoint: eq.client_focal_point || '',
      // Standalone equipment form fields (Step 3: Scope & Documents)
      servicesIncluded: eq.services_included || {},
      scopeDescription: eq.scope_description || '',
      kickoffMeetingNotes: eq.kickoff_meeting_notes || '',
      specialProductionNotes: eq.special_production_notes || ''
    };
  });
};








