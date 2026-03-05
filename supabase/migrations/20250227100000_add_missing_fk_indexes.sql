-- Add indexes on foreign key columns (Performance Advisor: unindexed foreign keys).
-- Uses IF NOT EXISTS so existing indexes are skipped. No logic/behavior change.

-- client_reference_documents
CREATE INDEX IF NOT EXISTS idx_client_reference_documents_project_id ON public.client_reference_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_client_reference_documents_uploaded_by ON public.client_reference_documents(uploaded_by);

-- design_inputs_documents
CREATE INDEX IF NOT EXISTS idx_design_inputs_documents_project_id ON public.design_inputs_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_design_inputs_documents_uploaded_by ON public.design_inputs_documents(uploaded_by);

-- equipment
CREATE INDEX IF NOT EXISTS idx_equipment_updated_by ON public.equipment(updated_by);

-- equipment_activity_completions
CREATE INDEX IF NOT EXISTS idx_equipment_activity_completions_completed_by_user_id ON public.equipment_activity_completions(completed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_activity_completions_updated_by ON public.equipment_activity_completions(updated_by);

-- equipment_activity_logs
CREATE INDEX IF NOT EXISTS idx_equipment_activity_logs_created_by ON public.equipment_activity_logs(created_by);

-- equipment_documents
CREATE INDEX IF NOT EXISTS idx_equipment_documents_equipment_id ON public.equipment_documents(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_documents_uploaded_by ON public.equipment_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_equipment_documents_vdcr_record_id ON public.equipment_documents(vdcr_record_id);

-- equipment_progress_entries
CREATE INDEX IF NOT EXISTS idx_equipment_progress_entries_created_by ON public.equipment_progress_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_equipment_progress_entries_equipment_id ON public.equipment_progress_entries(equipment_id);

-- equipment_progress_images
CREATE INDEX IF NOT EXISTS idx_equipment_progress_images_equipment_id ON public.equipment_progress_images(equipment_id);

-- equipment_team_positions
CREATE INDEX IF NOT EXISTS idx_equipment_team_positions_assigned_by ON public.equipment_team_positions(assigned_by);
CREATE INDEX IF NOT EXISTS idx_equipment_team_positions_equipment_id ON public.equipment_team_positions(equipment_id);

-- invites
CREATE INDEX IF NOT EXISTS idx_invites_invited_by ON public.invites(invited_by);
CREATE INDEX IF NOT EXISTS idx_invites_project_id ON public.invites(project_id);

-- other_documents
CREATE INDEX IF NOT EXISTS idx_other_documents_project_id ON public.other_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_other_documents_uploaded_by ON public.other_documents(uploaded_by);

-- projects
CREATE INDEX IF NOT EXISTS idx_projects_project_manager_id ON public.projects(project_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_vdcr_manager_id ON public.projects(vdcr_manager_id);

-- standalone_equipment
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_updated_by ON public.standalone_equipment(updated_by);

-- standalone_equipment_activity_completions
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activity_completions_completed_by_user_id ON public.standalone_equipment_activity_completions(completed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activity_completions_updated_by ON public.standalone_equipment_activity_completions(updated_by);

-- standalone_equipment_activity_logs
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activity_logs_created_by ON public.standalone_equipment_activity_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activity_logs_equipment_id ON public.standalone_equipment_activity_logs(equipment_id);

-- standalone_equipment_documents
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_documents_equipment_id ON public.standalone_equipment_documents(equipment_id);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_documents_uploaded_by ON public.standalone_equipment_documents(uploaded_by);

-- standalone_equipment_progress_entries
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_progress_entries_created_by ON public.standalone_equipment_progress_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_progress_entries_equipment_id ON public.standalone_equipment_progress_entries(equipment_id);

-- standalone_equipment_progress_images
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_progress_images_equipment_id ON public.standalone_equipment_progress_images(equipment_id);

-- standalone_equipment_team_positions
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_team_positions_assigned_by ON public.standalone_equipment_team_positions(assigned_by);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_team_positions_equipment_id ON public.standalone_equipment_team_positions(equipment_id);

-- unpriced_po_documents
CREATE INDEX IF NOT EXISTS idx_unpriced_po_documents_project_id ON public.unpriced_po_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_unpriced_po_documents_uploaded_by ON public.unpriced_po_documents(uploaded_by);

-- users (fk_users_project -> project_id, users_assigned_by_fkey -> assigned_by)
CREATE INDEX IF NOT EXISTS idx_users_project_id ON public.users(project_id);
CREATE INDEX IF NOT EXISTS idx_users_assigned_by ON public.users(assigned_by);

-- vdcr_activity_logs
CREATE INDEX IF NOT EXISTS idx_vdcr_activity_logs_created_by ON public.vdcr_activity_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_vdcr_activity_logs_vdcr_id ON public.vdcr_activity_logs(vdcr_id);

-- vdcr_document_history
CREATE INDEX IF NOT EXISTS idx_vdcr_document_history_changed_by ON public.vdcr_document_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_vdcr_document_history_vdcr_record_id ON public.vdcr_document_history(vdcr_record_id);

-- vdcr_records
CREATE INDEX IF NOT EXISTS idx_vdcr_records_updated_by ON public.vdcr_records(updated_by);

-- vdcr_revision_events
CREATE INDEX IF NOT EXISTS idx_vdcr_revision_events_created_by ON public.vdcr_revision_events(created_by);
CREATE INDEX IF NOT EXISTS idx_vdcr_revision_events_vdcr_record_id ON public.vdcr_revision_events(vdcr_record_id);
