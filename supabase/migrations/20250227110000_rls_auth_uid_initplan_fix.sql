-- RLS Auth Initialization Plan fix: replace auth.uid() with (select auth.uid()) in policy expressions
-- so the planner evaluates once per query instead of per row. Logic unchanged.
--
-- This migration fixes only the policies present in the backup (client_reference_documents,
-- design_inputs_documents, equipment_documents, equipment_progress_entries, equipment_team_positions, firms).
-- For other tables (users, projects, project_members, invites, standalone_*, vdcr_*, other_documents,
-- unpriced_po_documents) run the same replacement in SQL Editor: auth.uid() -> (select auth.uid()).

-- ========== client_reference_documents ==========
DROP POLICY IF EXISTS "Firm admin can create firm client reference documents" ON public.client_reference_documents;
CREATE POLICY "Firm admin can create firm client reference documents" ON public.client_reference_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = client_reference_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin() AND ((uploaded_by = (select auth.uid())) OR (uploaded_by IS NULL))));

DROP POLICY IF EXISTS "Users can create client reference documents" ON public.client_reference_documents;
CREATE POLICY "Users can create client reference documents" ON public.client_reference_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((project_id IS NOT NULL) AND is_assigned_to_project(project_id) AND ((uploaded_by = (select auth.uid())) OR (uploaded_by IS NULL))));

-- ========== design_inputs_documents ==========
DROP POLICY IF EXISTS "Firm admin can create firm design inputs documents" ON public.design_inputs_documents;
CREATE POLICY "Firm admin can create firm design inputs documents" ON public.design_inputs_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = design_inputs_documents.project_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin() AND ((uploaded_by = (select auth.uid())) OR (uploaded_by IS NULL))));

DROP POLICY IF EXISTS "Users can create design inputs documents" ON public.design_inputs_documents;
CREATE POLICY "Users can create design inputs documents" ON public.design_inputs_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((project_id IS NOT NULL) AND is_assigned_to_project(project_id) AND ((uploaded_by = (select auth.uid())) OR (uploaded_by IS NULL))));

-- ========== equipment_documents ==========
DROP POLICY IF EXISTS "Firm admin can create firm equipment documents" ON public.equipment_documents;
CREATE POLICY "Firm admin can create firm equipment documents" ON public.equipment_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_documents.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin() AND ((uploaded_by = (select auth.uid())) OR (uploaded_by IS NULL))));

DROP POLICY IF EXISTS "Users can create equipment documents" ON public.equipment_documents;
CREATE POLICY "Users can create equipment documents" ON public.equipment_documents FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_documents.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))) AND ((uploaded_by = (select auth.uid())) OR (uploaded_by IS NULL))));

-- ========== equipment_progress_entries ==========
DROP POLICY IF EXISTS "Firm admin can create firm equipment progress entries" ON public.equipment_progress_entries;
CREATE POLICY "Firm admin can create firm equipment progress entries" ON public.equipment_progress_entries FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin() AND ((created_by = (select auth.uid())) OR (created_by IS NULL))));

DROP POLICY IF EXISTS "Users can create equipment progress entries" ON public.equipment_progress_entries;
CREATE POLICY "Users can create equipment progress entries" ON public.equipment_progress_entries FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))) AND ((created_by = (select auth.uid())) OR (created_by IS NULL))));

DROP POLICY IF EXISTS "Users can delete own equipment progress entries" ON public.equipment_progress_entries;
CREATE POLICY "Users can delete own equipment progress entries" ON public.equipment_progress_entries FOR DELETE TO authenticated USING (((created_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id))))));

DROP POLICY IF EXISTS "Users can update own equipment progress entries" ON public.equipment_progress_entries;
CREATE POLICY "Users can update own equipment progress entries" ON public.equipment_progress_entries FOR UPDATE TO authenticated USING (((created_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))))) WITH CHECK (((created_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_progress_entries.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id))))));

-- ========== equipment_team_positions ==========
DROP POLICY IF EXISTS "Firm admin can create firm equipment team positions" ON public.equipment_team_positions;
CREATE POLICY "Firm admin can create firm equipment team positions" ON public.equipment_team_positions FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM (equipment e
     JOIN projects p ON ((p.id = e.project_id)))
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (p.firm_id = get_user_firm_id())))) AND is_firm_admin() AND ((assigned_by = (select auth.uid())) OR (assigned_by IS NULL))));

DROP POLICY IF EXISTS "Users can create equipment team positions" ON public.equipment_team_positions;
CREATE POLICY "Users can create equipment team positions" ON public.equipment_team_positions FOR INSERT TO authenticated USING (true) WITH CHECK (((EXISTS ( SELECT 1
   FROM equipment e
  WHERE ((e.id = equipment_team_positions.equipment_id) AND (e.project_id IS NOT NULL) AND is_assigned_to_project(e.project_id)))) AND ((assigned_by = (select auth.uid())) OR (assigned_by IS NULL))));

-- ========== firms ==========
DROP POLICY IF EXISTS "Firm admin can update own firm" ON public.firms;
CREATE POLICY "Firm admin can update own firm" ON public.firms FOR UPDATE TO authenticated USING (((id = get_user_firm_id()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND ((users.role)::text = 'firm_admin'::text) AND (users.is_active = true)))))) WITH CHECK (((id = get_user_firm_id()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND ((users.role)::text = 'firm_admin'::text) AND (users.is_active = true))))));

DROP POLICY IF EXISTS "Firm admin can view own firm" ON public.firms;
CREATE POLICY "Firm admin can view own firm" ON public.firms FOR SELECT TO authenticated USING (((id = get_user_firm_id()) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (select auth.uid())) AND ((users.role)::text = 'firm_admin'::text) AND (users.is_active = true))))));
