-- ============================================================================
-- SCHEMA BACKUP - ENGINEERING PROJECT MANAGEMENT SYSTEM
-- ============================================================================
-- Complete schema backup: tables, constraints, relationships.
--
-- RESTORE ORDER:
--   1. supabase_schema_backup.sql (this file - schema/tables)
--   2. supabase_schema_helper_function.sql (helper functions)
--   3. supabase_schema_RLS.sql (RLS policies)
--
-- WARNING: Table order and constraints may need adjustment for execution.
-- ============================================================================

-- ============================================================================
-- 1. FIRMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.firms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL UNIQUE,
  subscription_plan character varying DEFAULT 'basic'::character varying,
  is_active boolean DEFAULT true,
  max_users integer DEFAULT 5,
  admin_name character varying,
  admin_email character varying UNIQUE,
  admin_phone character varying,
  admin_whatsapp character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  logo_url character varying,
  CONSTRAINT firms_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 2. USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email character varying NOT NULL UNIQUE,
  full_name character varying NOT NULL,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['super_admin'::character varying::text, 'firm_admin'::character varying::text, 'project_manager'::character varying::text, 'vdcr_manager'::character varying::text, 'editor'::character varying::text, 'viewer'::character varying::text])),
  firm_id uuid,
  project_id uuid,
  assigned_by uuid,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  phone text,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id),
  CONSTRAINT users_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 3. PROJECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  client character varying,
  location character varying,
  manager character varying,
  deadline date,
  po_number character varying,
  firm_id uuid,
  created_by uuid,
  project_manager_id uuid,
  vdcr_manager_id uuid,
  scope_of_work text,
  completed_date date,
  equipment_count integer DEFAULT 0,
  active_equipment integer DEFAULT 0,
  progress integer DEFAULT 0,
  status character varying DEFAULT 'active'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  unpriced_po_documents jsonb DEFAULT '[]'::jsonb,
  design_inputs_documents jsonb DEFAULT '[]'::jsonb,
  client_reference_documents jsonb DEFAULT '[]'::jsonb,
  other_documents jsonb DEFAULT '[]'::jsonb,
  services_included jsonb DEFAULT '{"design": false, "testing": false, "commissioning": false, "documentation": false, "manufacturing": false, "installationSupport": false}'::jsonb,
  kickoff_meeting_notes text DEFAULT ''::text,
  special_production_notes text DEFAULT ''::text,
  equipment_documents jsonb DEFAULT '[]'::jsonb,
  vdcr_manager character varying,
  consultant character varying,
  tpi_agency character varying,
  client_industry character varying,
  sales_order_date date,
  client_focal_point character varying,
  recommendation_letter jsonb DEFAULT '{"status": "not-requested", "clientEmail": null, "requestDate": null, "reminderCount": 0, "lastReminderDate": null, "receivedDocument": null, "clientContactPerson": null, "lastReminderDateTime": null}'::jsonb,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_project_manager_id_fkey FOREIGN KEY (project_manager_id) REFERENCES public.users(id),
  CONSTRAINT projects_vdcr_manager_id_fkey FOREIGN KEY (vdcr_manager_id) REFERENCES public.users(id),
  CONSTRAINT projects_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id),
  CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 4. PROJECT_MEMBERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name character varying NOT NULL,
  email character varying NOT NULL,
  phone character varying,
  position character varying,
  role character varying NOT NULL DEFAULT 'viewer'::character varying CHECK (role::text = ANY (ARRAY['project_manager'::character varying, 'vdcr_manager'::character varying, 'editor'::character varying, 'viewer'::character varying]::text[])),
  status character varying NOT NULL DEFAULT 'active'::character varying,
  permissions jsonb DEFAULT '[]'::jsonb,
  equipment_assignments jsonb DEFAULT '[]'::jsonb,
  data_access jsonb DEFAULT '[]'::jsonb,
  access_level character varying NOT NULL DEFAULT 'viewer'::character varying,
  avatar character varying,
  last_active timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  CONSTRAINT project_members_pkey PRIMARY KEY (id),
  CONSTRAINT fk_project_members_user_id FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);

-- ============================================================================
-- 5. EQUIPMENT TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  type character varying,
  tag_number character varying,
  job_number character varying,
  manufacturing_serial character varying,
  status character varying DEFAULT 'pending'::character varying,
  progress integer DEFAULT 0,
  progress_phase character varying DEFAULT 'documentation'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  supervisor character varying,
  welder character varying,
  qc_inspector character varying,
  project_manager character varying,
  location character varying,
  next_milestone character varying,
  po_cdd character varying,
  name character varying,
  priority character varying DEFAULT 'medium'::character varying,
  is_basic_info boolean DEFAULT true,
  notes text,
  progress_images text[] DEFAULT '{}'::text[],
  custom_team_positions jsonb DEFAULT '[]'::jsonb,
  welder_role character varying DEFAULT 'viewer'::character varying,
  qc_inspector_role character varying DEFAULT 'viewer'::character varying,
  project_manager_role character varying DEFAULT 'viewer'::character varying,
  supervisor_role character varying DEFAULT 'viewer'::character varying,
  custom_fields jsonb DEFAULT '[]'::jsonb,
  progress_entries jsonb DEFAULT '[]'::jsonb,
  custom_field_1_name character varying,
  custom_field_1_value character varying,
  custom_field_2_name character varying,
  custom_field_2_value character varying,
  custom_field_3_name character varying,
  custom_field_3_value character varying,
  custom_field_4_name character varying,
  custom_field_4_value character varying,
  custom_field_5_name character varying,
  custom_field_5_value character varying,
  custom_field_6_name character varying,
  custom_field_6_value character varying,
  custom_field_7_name character varying,
  custom_field_7_value character varying,
  custom_field_8_name character varying,
  custom_field_8_value character varying,
  custom_field_9_name character varying,
  custom_field_9_value character varying,
  custom_field_10_name character varying,
  custom_field_10_value character varying,
  custom_field_11_name character varying,
  custom_field_11_value character varying,
  custom_field_12_name character varying,
  custom_field_12_value character varying,
  custom_field_13_name character varying,
  custom_field_13_value character varying,
  custom_field_14_name character varying,
  custom_field_14_value character varying,
  custom_field_15_name character varying,
  custom_field_15_value character varying,
  custom_field_16_name character varying,
  custom_field_16_value character varying,
  custom_field_17_name character varying,
  custom_field_17_value character varying,
  custom_field_18_name character varying,
  custom_field_18_value character varying,
  custom_field_19_name character varying,
  custom_field_19_value character varying,
  custom_field_20_name character varying,
  custom_field_20_value character varying,
  technical_sections jsonb DEFAULT '[]'::jsonb,
  team_custom_fields jsonb DEFAULT '[]'::jsonb,
  created_by uuid,
  updated_by uuid,
  completion_date date,
  any_personal_title character varying,
  size character varying,
  material character varying,
  design_code character varying,
  last_update date,
  next_milestone_date date,
  CONSTRAINT equipment_pkey PRIMARY KEY (id),
  CONSTRAINT fk_equipment_created_by FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT fk_equipment_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(id),
  CONSTRAINT fk_equipment_project FOREIGN KEY (project_id) REFERENCES public.projects(id)
);

-- ============================================================================
-- 6. EQUIPMENT_DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  document_name character varying NOT NULL,
  document_url text NOT NULL,
  document_type character varying,
  file_size bigint,
  uploaded_by uuid,
  upload_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT equipment_documents_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_documents_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
  CONSTRAINT equipment_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);

-- ============================================================================
-- 7. EQUIPMENT_PROGRESS_ENTRIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_progress_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  entry_text text NOT NULL,
  entry_type character varying DEFAULT 'general'::character varying,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  audio_data text,
  audio_duration integer,
  image_url text,
  image_description text,
  CONSTRAINT equipment_progress_entries_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_progress_entries_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
  CONSTRAINT equipment_progress_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

-- ============================================================================
-- 8. EQUIPMENT_PROGRESS_IMAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_progress_images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  image_url text NOT NULL,
  description text,
  uploaded_by text,
  upload_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  audio_data text,
  audio_duration integer,
  CONSTRAINT equipment_progress_images_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_progress_images_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id)
);

-- ============================================================================
-- 9. EQUIPMENT_TEAM_POSITIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_team_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  position_name character varying NOT NULL,
  person_name character varying NOT NULL,
  email character varying,
  phone character varying,
  role character varying DEFAULT 'viewer'::character varying CHECK (role::text = ANY (ARRAY['editor'::character varying::text, 'viewer'::character varying::text])),
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT equipment_team_positions_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_team_positions_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
  CONSTRAINT equipment_team_positions_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id)
);

-- ============================================================================
-- 10. EQUIPMENT_ACTIVITY_LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.equipment_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  equipment_id uuid,
  activity_type character varying NOT NULL,
  action_description text NOT NULL,
  field_name character varying,
  old_value text,
  new_value text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT equipment_activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_activity_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT equipment_activity_logs_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
  CONSTRAINT equipment_activity_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 11. STANDALONE_EQUIPMENT TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.standalone_equipment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type character varying,
  tag_number character varying,
  job_number character varying,
  manufacturing_serial character varying,
  status character varying DEFAULT 'pending'::character varying,
  progress integer DEFAULT 0,
  progress_phase character varying DEFAULT 'documentation'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  location character varying,
  next_milestone character varying,
  next_milestone_date timestamp with time zone,
  po_cdd character varying,
  name character varying,
  priority character varying DEFAULT 'medium'::character varying,
  is_basic_info boolean DEFAULT true,
  notes text,
  completion_date timestamp with time zone,
  size character varying,
  weight character varying,
  design_code character varying,
  material character varying,
  working_pressure character varying,
  design_temp character varying,
  progress_images text[] DEFAULT '{}'::text[],
  custom_team_positions jsonb DEFAULT '[]'::jsonb,
  custom_fields jsonb DEFAULT '[]'::jsonb,
  progress_entries jsonb DEFAULT '[]'::jsonb,
  technical_sections jsonb DEFAULT '[]'::jsonb,
  team_custom_fields jsonb DEFAULT '[]'::jsonb,
  field_names jsonb DEFAULT '{"status": "Status", "weight": "Weight", "welder": "Welder", "engineer": "Engineer", "material": "Material", "pressure": "Pressure", "dimensions": "Dimensions", "supervisor": "Supervisor", "qcInspector": "QC Inspector", "temperature": "Temperature", "projectManager": "Project Manager"}'::jsonb,
  custom_field_1_name character varying,
  custom_field_1_value character varying,
  custom_field_2_name character varying,
  custom_field_2_value character varying,
  custom_field_3_name character varying,
  custom_field_3_value character varying,
  custom_field_4_name character varying,
  custom_field_4_value character varying,
  custom_field_5_name character varying,
  custom_field_5_value character varying,
  custom_field_6_name character varying,
  custom_field_6_value character varying,
  custom_field_7_name character varying,
  custom_field_7_value character varying,
  custom_field_8_name character varying,
  custom_field_8_value character varying,
  custom_field_9_name character varying,
  custom_field_9_value character varying,
  custom_field_10_name character varying,
  custom_field_10_value character varying,
  custom_field_11_name character varying,
  custom_field_11_value character varying,
  custom_field_12_name character varying,
  custom_field_12_value character varying,
  custom_field_13_name character varying,
  custom_field_13_value character varying,
  custom_field_14_name character varying,
  custom_field_14_value character varying,
  custom_field_15_name character varying,
  custom_field_15_value character varying,
  custom_field_16_name character varying,
  custom_field_16_value character varying,
  custom_field_17_name character varying,
  custom_field_17_value character varying,
  custom_field_18_name character varying,
  custom_field_18_value character varying,
  custom_field_19_name character varying,
  custom_field_19_value character varying,
  custom_field_20_name character varying,
  custom_field_20_value character varying,
  any_personal_title character varying,
  created_by uuid,
  client_name character varying,
  plant_location character varying,
  po_number character varying,
  sales_order_date timestamp with time zone,
  client_industry character varying,
  equipment_manager character varying,
  consultant character varying,
  tpi_agency character varying,
  client_focal_point character varying,
  services_included jsonb DEFAULT '{}'::jsonb,
  scope_description text,
  kickoff_meeting_notes text,
  special_production_notes text,
  last_update date,
  CONSTRAINT standalone_equipment_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id),
  CONSTRAINT standalone_equipment_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 12. STANDALONE_EQUIPMENT_DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.standalone_equipment_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  document_name character varying NOT NULL,
  document_url text NOT NULL,
  document_type character varying,
  file_size bigint,
  uploaded_by uuid,
  upload_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT standalone_equipment_documents_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_documents_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.standalone_equipment(id),
  CONSTRAINT standalone_equipment_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 13. STANDALONE_EQUIPMENT_PROGRESS_ENTRIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.standalone_equipment_progress_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  entry_text text NOT NULL,
  entry_type character varying DEFAULT 'general'::character varying,
  image_url text,
  image_description text,
  audio_data text,
  audio_duration integer,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT standalone_equipment_progress_entries_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_progress_entries_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.standalone_equipment(id),
  CONSTRAINT standalone_equipment_progress_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 14. STANDALONE_EQUIPMENT_PROGRESS_IMAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.standalone_equipment_progress_images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  image_url text NOT NULL,
  description text,
  audio_data text,
  audio_duration integer,
  uploaded_by text,
  upload_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT standalone_equipment_progress_images_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_progress_images_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.standalone_equipment(id)
);

-- ============================================================================
-- 15. STANDALONE_EQUIPMENT_TEAM_POSITIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.standalone_equipment_team_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  position_name character varying NOT NULL,
  person_name character varying NOT NULL,
  email character varying,
  phone character varying,
  role character varying DEFAULT 'viewer'::character varying CHECK (role::text = ANY (ARRAY['editor'::character varying::text, 'viewer'::character varying::text])),
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT standalone_equipment_team_positions_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_team_positions_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.standalone_equipment(id),
  CONSTRAINT standalone_equipment_team_positions_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 16. STANDALONE_EQUIPMENT_ACTIVITY_LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.standalone_equipment_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  activity_type character varying NOT NULL,
  action_description text NOT NULL,
  field_name character varying,
  old_value text,
  new_value text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT standalone_equipment_activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_activity_logs_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.standalone_equipment(id),
  CONSTRAINT standalone_equipment_activity_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 17. VDCR_RECORDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vdcr_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  sr_no character varying NOT NULL,
  equipment_tag_numbers text[] NOT NULL,
  mfg_serial_numbers text[] NOT NULL,
  job_numbers text[] NOT NULL,
  client_doc_no character varying NOT NULL,
  internal_doc_no character varying NOT NULL,
  document_name character varying NOT NULL,
  revision character varying NOT NULL,
  code_status character varying NOT NULL CHECK (code_status::text = ANY (ARRAY['Code 1'::character varying, 'Code 2'::character varying, 'Code 3'::character varying, 'Code 4'::character varying]::text[])),
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'sent-for-approval'::character varying, 'received-for-comment'::character varying, 'approved'::character varying, 'rejected'::character varying]::text[])),
  remarks text,
  updated_by uuid,
  document_file_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_update timestamp with time zone DEFAULT now(),
  firm_id uuid,
  document_url text,
  CONSTRAINT vdcr_records_pkey PRIMARY KEY (id),
  CONSTRAINT vdcr_records_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT vdcr_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id),
  CONSTRAINT vdcr_records_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id)
);

-- ============================================================================
-- 18. VDCR_DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vdcr_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vdcr_record_id uuid,
  file_name character varying NOT NULL,
  original_name character varying NOT NULL,
  file_type character varying NOT NULL,
  file_size bigint NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vdcr_documents_pkey PRIMARY KEY (id),
  CONSTRAINT vdcr_documents_vdcr_record_id_fkey FOREIGN KEY (vdcr_record_id) REFERENCES public.vdcr_records(id),
  CONSTRAINT vdcr_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 19. VDCR_DOCUMENT_HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vdcr_document_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vdcr_record_id uuid NOT NULL,
  version_number character varying,
  action character varying NOT NULL CHECK (action::text = ANY (ARRAY['created'::character varying::text, 'updated'::character varying::text, 'sent-for-review'::character varying::text, 'received-for-comment'::character varying::text, 'approved'::character varying::text, 'rejected'::character varying::text, 'pending-for-approval'::character varying::text])),
  previous_status character varying,
  new_status character varying NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamp with time zone DEFAULT now(),
  remarks text,
  document_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vdcr_document_history_pkey PRIMARY KEY (id),
  CONSTRAINT vdcr_document_history_vdcr_record_id_fkey FOREIGN KEY (vdcr_record_id) REFERENCES public.vdcr_records(id),
  CONSTRAINT vdcr_document_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 20. VDCR_ACTIVITY_LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vdcr_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  vdcr_id uuid,
  activity_type character varying NOT NULL,
  action_description text NOT NULL,
  field_name character varying,
  old_value text,
  new_value text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vdcr_activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT vdcr_activity_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT vdcr_activity_logs_vdcr_id_fkey FOREIGN KEY (vdcr_id) REFERENCES public.vdcr_records(id),
  CONSTRAINT vdcr_activity_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 21. VDCR_REVISION_EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vdcr_revision_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vdcr_record_id uuid NOT NULL,
  event_type character varying NOT NULL CHECK (event_type::text = ANY (ARRAY['submitted'::character varying, 'received'::character varying]::text[])),
  revision_number character varying NOT NULL,
  event_date timestamp with time zone NOT NULL DEFAULT now(),
  estimated_return_date timestamp with time zone,
  actual_return_date timestamp with time zone,
  days_elapsed integer,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vdcr_revision_events_pkey PRIMARY KEY (id),
  CONSTRAINT vdcr_revision_events_vdcr_record_id_fkey FOREIGN KEY (vdcr_record_id) REFERENCES public.vdcr_records(id),
  CONSTRAINT vdcr_revision_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 22-25. PROJECT DOCUMENT TABLES
-- ============================================================================

-- UNPRICED_PO_DOCUMENTS
CREATE TABLE IF NOT EXISTS public.unpriced_po_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  document_name character varying NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid,
  file_size bigint,
  mime_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unpriced_po_documents_pkey PRIMARY KEY (id),
  CONSTRAINT unpriced_po_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT unpriced_po_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

-- DESIGN_INPUTS_DOCUMENTS
CREATE TABLE IF NOT EXISTS public.design_inputs_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  document_name character varying NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid,
  file_size bigint,
  mime_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT design_inputs_documents_pkey PRIMARY KEY (id),
  CONSTRAINT design_inputs_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT design_inputs_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

-- CLIENT_REFERENCE_DOCUMENTS
CREATE TABLE IF NOT EXISTS public.client_reference_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  document_name character varying NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid,
  file_size bigint,
  mime_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT client_reference_documents_pkey PRIMARY KEY (id),
  CONSTRAINT client_reference_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT client_reference_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

-- OTHER_DOCUMENTS
CREATE TABLE IF NOT EXISTS public.other_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  document_name character varying NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid,
  file_size bigint,
  mime_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT other_documents_pkey PRIMARY KEY (id),
  CONSTRAINT other_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT other_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 26. INVITES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email character varying NOT NULL,
  full_name character varying,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['super_admin'::character varying::text, 'firm_admin'::character varying::text, 'project_manager'::character varying::text, 'vdcr_manager'::character varying::text, 'editor'::character varying::text, 'viewer'::character varying::text])),
  project_id uuid,
  firm_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying::text, 'accepted'::character varying::text, 'expired'::character varying::text])),
  invitation_token character varying,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT invites_pkey PRIMARY KEY (id),
  CONSTRAINT invites_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id),
  CONSTRAINT invites_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id)
);

-- ============================================================================
-- STORAGE BUCKETS CONFIGURATION
-- ============================================================================

-- Note: Storage buckets are created via Supabase Storage API or Dashboard
-- Below are the bucket configurations that should be set up:

-- 1. standalone-equipment-documents
--    - Public: true
--    - File Size Limit: 50 MB
--    - Allowed MIME Types: 
--      application/pdf, application/msword, 
--      application/vnd.openxmlformats-officedocument.wordprocessingml.document,
--      image/jpeg, image/png, image/gif,
--      application/vnd.ms-excel,
--      application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

-- 2. standalone-equipment-progress-images
--    - Public: true
--    - File Size Limit: 10 MB
--    - Allowed MIME Types: image/jpeg, image/png, image/gif, image/webp

-- 3. VDCR-docs
--    - Public: true
--    - File Size Limit: 50 MB (default)
--    - Allowed MIME Types: Any

-- 4. project-documents
--    - Public: true
--    - File Size Limit: 50 MB (default)
--    - Allowed MIME Types: Any

-- ============================================================================
-- CREATE STORAGE BUCKETS (if they don't exist)
-- ============================================================================

-- Bucket 1: standalone-equipment-documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'standalone-equipment-documents',
  'standalone-equipment-documents',
  true,
  52428800, -- 50 MB in bytes
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Bucket 2: standalone-equipment-progress-images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'standalone-equipment-progress-images',
  'standalone-equipment-progress-images',
  true,
  10485760, -- 10 MB in bytes
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Bucket 3: VDCR-docs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'VDCR-docs',
  'VDCR-docs',
  true,
  52428800, -- 50 MB in bytes
  NULL -- Any MIME type
)
ON CONFLICT (id) DO NOTHING;

-- Bucket 4: project-documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  true,
  52428800, -- 50 MB in bytes
  NULL -- Any MIME type
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE BUCKET POLICIES
-- ============================================================================

-- ============================================================================
-- 1. STANDALONE-EQUIPMENT-DOCUMENTS BUCKET POLICIES
-- ============================================================================

-- Allow authenticated users to view standalone equipment documents
CREATE POLICY "Allow authenticated users to view standalone equipment documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'standalone-equipment-documents');

-- Allow authenticated users to upload standalone equipment documents
CREATE POLICY "Allow authenticated users to upload standalone equipment documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'standalone-equipment-documents');

-- Allow authenticated uploads to standalone-equipment-documents
CREATE POLICY "Allow authenticated uploads to standalone-equipment-documents"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'standalone-equipment-documents');

-- Allow public downloads from standalone-equipment-documents
CREATE POLICY "Allow public downloads from standalone-equipment-documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'standalone-equipment-documents');

-- ============================================================================
-- 2. STANDALONE-EQUIPMENT-PROGRESS-IMAGES BUCKET POLICIES
-- ============================================================================

-- Allow authenticated users to upload standalone equipment progress images
CREATE POLICY "Allow authenticated users to upload standalone equipment progress images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'standalone-equipment-progress-images');

-- Allow authenticated users to view standalone equipment progress images
CREATE POLICY "Allow authenticated users to view standalone equipment progress images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'standalone-equipment-progress-images');

-- Allow authenticated users to update standalone equipment progress images
CREATE POLICY "Allow authenticated users to update standalone equipment progress images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'standalone-equipment-progress-images')
WITH CHECK (bucket_id = 'standalone-equipment-progress-images');

-- Allow authenticated users to delete standalone equipment progress images
CREATE POLICY "Allow authenticated users to delete standalone equipment progress images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'standalone-equipment-progress-images');

-- Allow authenticated uploads to standalone-equipment-progress-images
CREATE POLICY "Allow authenticated uploads to standalone-equipment-progress-images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'standalone-equipment-progress-images');

-- Allow public downloads from standalone-equipment-progress-images
CREATE POLICY "Allow public downloads from standalone-equipment-progress-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'standalone-equipment-progress-images');

-- ============================================================================
-- 3. VDCR-DOCS BUCKET POLICIES
-- ============================================================================

-- Allow public downloads from VDCR-docs
CREATE POLICY "Allow public downloads from VDCR-docs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'VDCR-docs');

-- Allow authenticated uploads to VDCR-docs
CREATE POLICY "Allow authenticated uploads to VDCR-docs"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'VDCR-docs');

-- ============================================================================
-- 4. PROJECT-DOCUMENTS BUCKET POLICIES
-- ============================================================================

-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated users to upload files"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'project-documents');

-- Allow authenticated users to view files
CREATE POLICY "Allow authenticated users to view files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'project-documents');

-- ============================================================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_firm_id ON public.users(firm_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_firm_id ON public.projects(firm_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- Project members table indexes
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_email ON public.project_members(email);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);

-- Equipment table indexes
CREATE INDEX IF NOT EXISTS idx_equipment_project_id ON public.equipment(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON public.equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_created_by ON public.equipment(created_by);

-- Standalone equipment table indexes
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_created_by ON public.standalone_equipment(created_by);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_status ON public.standalone_equipment(status);

-- VDCR records table indexes
CREATE INDEX IF NOT EXISTS idx_vdcr_records_project_id ON public.vdcr_records(project_id);
CREATE INDEX IF NOT EXISTS idx_vdcr_records_firm_id ON public.vdcr_records(firm_id);
CREATE INDEX IF NOT EXISTS idx_vdcr_records_status ON public.vdcr_records(status);

-- Activity logs indexes
CREATE INDEX IF NOT EXISTS idx_equipment_activity_logs_project_id ON public.equipment_activity_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_activity_logs_equipment_id ON public.equipment_activity_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_vdcr_activity_logs_project_id ON public.vdcr_activity_logs(project_id);

-- Invites table indexes
CREATE INDEX IF NOT EXISTS idx_invites_email ON public.invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_firm_id ON public.invites(firm_id);
CREATE INDEX IF NOT EXISTS idx_invites_status ON public.invites(status);

-- ============================================================================
-- ADD FOREIGN KEY CONSTRAINTS (after all tables are created)
-- ============================================================================

-- Add foreign key constraint for users.project_id -> projects.id
-- (This was removed from table creation to avoid circular dependency)
ALTER TABLE public.users 
ADD CONSTRAINT fk_users_project 
FOREIGN KEY (project_id) REFERENCES public.projects(id);

-- ============================================================================
-- END OF COMPLETE SCHEMA BACKUP
-- ============================================================================
-- Total: 26 Tables + 4 Storage Buckets
-- All foreign key relationships preserved
-- All constraints and defaults included
-- ============================================================================