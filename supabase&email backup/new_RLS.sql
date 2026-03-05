-- ========== EQUIPMENT PROGRESS ENTRIES & IMAGES - READY TO RUN ==========
-- Drop existing policies (safe to run even if they don't exist)

DROP POLICY IF EXISTS "Firm admin can create firm equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Firm admin can delete firm equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Firm admin can update firm equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Firm admin can view firm equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Super admin can create equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Super admin can delete equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Super admin can update all equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Super admin can view all equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Users can create equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Users can delete own equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Users can update own equipment progress entries" ON public.equipment_progress_entries;
DROP POLICY IF EXISTS "Users can view assigned equipment progress entries" ON public.equipment_progress_entries;

DROP POLICY IF EXISTS "Firm admin can create firm equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Firm admin can delete firm equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Firm admin can update firm equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Firm admin can view firm equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Super admin can create equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Super admin can delete equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Super admin can update all equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Super admin can view all equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Users can create equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Users can delete equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Users can update equipment progress images" ON public.equipment_progress_images;
DROP POLICY IF EXISTS "Users can view assigned equipment progress images" ON public.equipment_progress_images;

-- EQUIPMENT PROGRESS ENTRIES
ALTER TABLE public.equipment_progress_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm admin can create firm equipment progress entries" ON public.equipment_progress_entries FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
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

CREATE POLICY "Super admin can create equipment progress entries" ON public.equipment_progress_entries FOR INSERT TO authenticated WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete equipment progress entries" ON public.equipment_progress_entries FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Super admin can update all equipment progress entries" ON public.equipment_progress_entries FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can view all equipment progress entries" ON public.equipment_progress_entries FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Users can create equipment progress entries" ON public.equipment_progress_entries FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
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

CREATE POLICY "Firm admin can create firm equipment progress images" ON public.equipment_progress_images FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
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

CREATE POLICY "Super admin can create equipment progress images" ON public.equipment_progress_images FOR INSERT TO authenticated WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can delete equipment progress images" ON public.equipment_progress_images FOR DELETE TO authenticated USING (is_super_admin());

CREATE POLICY "Super admin can update all equipment progress images" ON public.equipment_progress_images FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Super admin can view all equipment progress images" ON public.equipment_progress_images FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Users can create equipment progress images" ON public.equipment_progress_images FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
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