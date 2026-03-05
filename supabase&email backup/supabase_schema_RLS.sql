-- ============================================================================
-- RLS POLICIES BACKUP - ENGINEERING PROJECT MANAGEMENT SYSTEM
-- ============================================================================
-- Current RLS policies from Supabase database (exported via pg_policies query).
--
-- RESTORE ORDER:
--   1. supabase_schema_backup.sql (schema/tables)
--   2. supabase_schema_helper_function.sql (helper functions - run FIRST)
--   3. supabase_schema_RLS.sql (this file - RLS policies)
--
-- IMPORTANT: Run supabase_schema_helper_function.sql BEFORE this file
-- ============================================================================

-- CLIENT REFERENCE DOCUMENTS
ALTER TABLE public.client_reference_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm admin can create firm client reference documents" ON public.client_reference_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = client_reference_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin() AND ((uploaded_by = auth.uid()) OR (uploaded_by IS NULL))));

CREATE POLICY "Firm admin can delete firm client reference documents" ON public.client_reference_documents FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = client_reference_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can update firm client reference documents" ON public.client_reference_documents FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = client_reference_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = client_reference_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can view firm client reference documents" ON public.client_reference_documents FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = client_reference_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Super admin can create client reference documents" ON public.client_reference_documents FOR INSERT TO authenticated USING (true) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete client reference documents" ON public.client_reference_documents FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Super admin can update all client reference documents" ON public.client_reference_documents FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can view all client reference documents" ON public.client_reference_documents FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Users can create client reference documents" ON public.client_reference_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((project_id IS NOT NULL) AND is_assigned_to_project(project_id) AND ((uploaded_by = auth.uid()) OR (uploaded_by IS NULL))));

CREATE POLICY "Users can delete client reference documents" ON public.client_reference_documents FOR DELETE TO authenticated USING (((project_id IS NOT NULL) AND is_assigned_to_project(project_id)));

CREATE POLICY "Users can update client reference documents" ON public.client_reference_documents FOR UPDATE TO authenticated USING (((project_id IS NOT NULL) AND is_assigned_to_project(project_id))) WITH CHECK (((project_id IS NOT NULL) AND is_assigned_to_project(project_id)));

CREATE POLICY "Users can view assigned client reference documents" ON public.client_reference_documents FOR SELECT TO authenticated USING (((project_id IS NOT NULL) AND is_assigned_to_project(project_id)));

-- DESIGN INPUTS DOCUMENTS
ALTER TABLE public.design_inputs_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm admin can create firm design inputs documents" ON public.design_inputs_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = design_inputs_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin() AND ((uploaded_by = auth.uid()) OR (uploaded_by IS NULL))));

CREATE POLICY "Firm admin can delete firm design inputs documents" ON public.design_inputs_documents FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = design_inputs_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can update firm design inputs documents" ON public.design_inputs_documents FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = design_inputs_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = design_inputs_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can view firm design inputs documents" ON public.design_inputs_documents FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = design_inputs_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Super admin can create design inputs documents" ON public.design_inputs_documents FOR INSERT TO authenticated USING (true) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete design inputs documents" ON public.design_inputs_documents FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Super admin can update all design inputs documents" ON public.design_inputs_documents FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can view all design inputs documents" ON public.design_inputs_documents FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Users can create design inputs documents" ON public.design_inputs_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((project_id IS NOT NULL) AND is_assigned_to_project(project_id) AND ((uploaded_by = auth.uid()) OR (uploaded_by IS NULL))));

CREATE POLICY "Users can delete design inputs documents" ON public.design_inputs_documents FOR DELETE TO authenticated USING (((project_id IS NOT NULL) AND is_assigned_to_project(project_id)));

CREATE POLICY "Users can update design inputs documents" ON public.design_inputs_documents FOR UPDATE TO authenticated USING (((project_id IS NOT NULL) AND is_assigned_to_project(project_id))) WITH CHECK (((project_id IS NOT NULL) AND is_assigned_to_project(project_id)));

CREATE POLICY "Users can view assigned design inputs documents" ON public.design_inputs_documents FOR SELECT TO authenticated USING (((project_id IS NOT NULL) AND is_assigned_to_project(project_id)));

-- EQUIPMENT
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm admin can create firm equipment" ON public.equipment FOR INSERT TO authenticated USING (true) WITH CHECK (((project_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = equipment.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can delete firm equipment" ON public.equipment FOR DELETE TO authenticated USING (((project_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = equipment.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can update firm equipment" ON public.equipment FOR UPDATE TO authenticated USING (((project_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = equipment.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin())) WITH CHECK (((project_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = equipment.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can view firm equipment" ON public.equipment FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = equipment.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Super admin can create equipment" ON public.equipment FOR INSERT TO authenticated USING (true) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete equipment" ON public.equipment FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Super admin can update all equipment" ON public.equipment FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can view all equipment" ON public.equipment FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Users can create equipment in assigned projects" ON public.equipment FOR INSERT TO authenticated USING (true) WITH CHECK (((project_id IS NOT NULL) AND is_assigned_to_project(project_id)));

CREATE POLICY "Users can delete equipment in assigned projects" ON public.equipment FOR DELETE TO authenticated USING (((project_id IS NOT NULL) AND is_assigned_to_project(project_id)));

CREATE POLICY "Users can update equipment in assigned projects" ON public.equipment FOR UPDATE TO authenticated USING (((project_id IS NOT NULL) AND is_assigned_to_project(project_id))) WITH CHECK (((project_id IS NOT NULL) AND is_assigned_to_project(project_id)));

CREATE POLICY "Users can view assigned project equipment" ON public.equipment FOR SELECT TO authenticated USING (((project_id IS NOT NULL) AND is_assigned_to_project(project_id)));

-- EQUIPMENT ACTIVITY LOGS
ALTER TABLE public.equipment_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert equipment activity logs" ON public.equipment_activity_logs FOR INSERT TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view equipment activity logs" ON public.equipment_activity_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin can delete equipment activity logs" ON public.equipment_activity_logs FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Users can delete equipment activity logs" ON public.equipment_activity_logs FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_activity_logs.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))) OR is_assigned_to_project(project_id)));

-- EQUIPMENT DOCUMENTS
ALTER TABLE public.equipment_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm admin can create firm equipment documents" ON public.equipment_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_documents.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin() AND ((uploaded_by = auth.uid()) OR (uploaded_by IS NULL))));

CREATE POLICY "Firm admin can delete firm equipment documents" ON public.equipment_documents FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_documents.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can update firm equipment documents" ON public.equipment_documents FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_documents.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_documents.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can view firm equipment documents" ON public.equipment_documents FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_documents.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Super admin can create equipment documents" ON public.equipment_documents FOR INSERT TO authenticated USING (true) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete equipment documents" ON public.equipment_documents FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Super admin can update all equipment documents" ON public.equipment_documents FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can view all equipment documents" ON public.equipment_documents FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Users can create equipment documents" ON public.equipment_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_documents.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))) AND ((uploaded_by = auth.uid()) OR (uploaded_by IS NULL))));

CREATE POLICY "Users can delete equipment documents" ON public.equipment_documents FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_documents.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

CREATE POLICY "Users can update equipment documents" ON public.equipment_documents FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_documents.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_documents.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

CREATE POLICY "Users can view assigned equipment documents" ON public.equipment_documents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_documents.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

-- EQUIPMENT PROGRESS ENTRIES
ALTER TABLE public.equipment_progress_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm admin can create firm equipment progress entries" ON public.equipment_progress_entries FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin() AND ((created_by = auth.uid()) OR (created_by IS NULL))));

CREATE POLICY "Firm admin can delete firm equipment progress entries" ON public.equipment_progress_entries FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can update firm equipment progress entries" ON public.equipment_progress_entries FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can view firm equipment progress entries" ON public.equipment_progress_entries FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Super admin can create equipment progress entries" ON public.equipment_progress_entries FOR INSERT TO authenticated USING (true) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete equipment progress entries" ON public.equipment_progress_entries FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Super admin can update all equipment progress entries" ON public.equipment_progress_entries FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can view all equipment progress entries" ON public.equipment_progress_entries FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Users can create equipment progress entries" ON public.equipment_progress_entries FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))) AND ((created_by = auth.uid()) OR (created_by IS NULL))));

CREATE POLICY "Users can delete own equipment progress entries" ON public.equipment_progress_entries FOR DELETE TO authenticated USING (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id))))));

CREATE POLICY "Users can update own equipment progress entries" ON public.equipment_progress_entries FOR UPDATE TO authenticated USING (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))))) WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id))))));

CREATE POLICY "Users can view assigned equipment progress entries" ON public.equipment_progress_entries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

-- EQUIPMENT PROGRESS IMAGES
ALTER TABLE public.equipment_progress_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm admin can create firm equipment progress images" ON public.equipment_progress_images FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_images.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can delete firm equipment progress images" ON public.equipment_progress_images FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_images.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can update firm equipment progress images" ON public.equipment_progress_images FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_images.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_images.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can view firm equipment progress images" ON public.equipment_progress_images FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_images.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Super admin can create equipment progress images" ON public.equipment_progress_images FOR INSERT TO authenticated USING (true) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete equipment progress images" ON public.equipment_progress_images FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Super admin can update all equipment progress images" ON public.equipment_progress_images FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can view all equipment progress images" ON public.equipment_progress_images FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Users can create equipment progress images" ON public.equipment_progress_images FOR INSERT TO authenticated USING (true) WITH CHECK ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_images.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

CREATE POLICY "Users can delete equipment progress images" ON public.equipment_progress_images FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_images.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

CREATE POLICY "Users can update equipment progress images" ON public.equipment_progress_images FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_images.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_images.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

CREATE POLICY "Users can view assigned equipment progress images" ON public.equipment_progress_images FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_images.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

-- EQUIPMENT TEAM POSITIONS
ALTER TABLE public.equipment_team_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm admin can create firm equipment team positions" ON public.equipment_team_positions FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin() AND ((assigned_by = auth.uid()) OR (assigned_by IS NULL))));

CREATE POLICY "Firm admin can delete firm equipment team positions" ON public.equipment_team_positions FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can update firm equipment team positions" ON public.equipment_team_positions FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Firm admin can view firm equipment team positions" ON public.equipment_team_positions FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin()));

CREATE POLICY "Super admin can create equipment team positions" ON public.equipment_team_positions FOR INSERT TO authenticated USING (true) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete equipment team positions" ON public.equipment_team_positions FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Super admin can update all equipment team positions" ON public.equipment_team_positions FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can view all equipment team positions" ON public.equipment_team_positions FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Users can create equipment team positions" ON public.equipment_team_positions FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))) AND ((assigned_by = auth.uid()) OR (assigned_by IS NULL))));

CREATE POLICY "Users can delete equipment team positions" ON public.equipment_team_positions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

CREATE POLICY "Users can update equipment team positions" ON public.equipment_team_positions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

CREATE POLICY "Users can view assigned equipment team positions" ON public.equipment_team_positions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))));

-- FIRMS
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm admin can update own firm" ON public.firms FOR UPDATE TO authenticated USING (((id = get_user_firm_id()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = 'firm_admin'::text) AND (users.is_active = true)))))) WITH CHECK (((id = get_user_firm_id()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = 'firm_admin'::text) AND (users.is_active = true))))));

CREATE POLICY "Firm admin can view own firm" ON public.firms FOR SELECT TO authenticated USING (((id = get_user_firm_id()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = 'firm_admin'::text) AND (users.is_active = true))))));

CREATE POLICY "Super admin can create firms" ON public.firms FOR INSERT TO authenticated USING (true) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete firms" ON public.firms FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Super admin can update all firms" ON public.firms FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can view all firms" ON public.firms FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Users can view their own firm" ON public.firms FOR SELECT TO authenticated USING ((id = get_user_firm_id()));