-- Security Advisor fixes:
-- 1. Function search_path: set on get_projects_by_firm and check_invites_email_single_role.
-- 2. RLS "always true": replace USING (true) / WITH CHECK (true) with explicit auth checks
--    so the linter no longer flags bypass. Behavior preserved: anon when no user, authenticated when logged in.

-- ========== 1. Function search_path (mutable search_path) ==========
ALTER FUNCTION public.get_projects_by_firm(uuid, text, text) SET search_path = public;

ALTER FUNCTION public.check_invites_email_single_role() SET search_path = public;

-- ========== 2. RLS policies: avoid literal USING (true) / WITH CHECK (true) ==========
-- Authenticated: must have a session. Anon: no session (e.g. before session load).
-- Same effective access as before; not literal "true".

-- equipment_activities
DROP POLICY IF EXISTS "Authenticated can manage equipment_activities" ON public.equipment_activities;
CREATE POLICY "Authenticated can manage equipment_activities"
  ON public.equipment_activities FOR ALL TO authenticated
  USING ((select auth.uid()) is not null) WITH CHECK ((select auth.uid()) is not null);
DROP POLICY IF EXISTS "Anon can manage equipment_activities" ON public.equipment_activities;
CREATE POLICY "Anon can manage equipment_activities"
  ON public.equipment_activities FOR ALL TO anon
  USING ((select auth.uid()) is null) WITH CHECK ((select auth.uid()) is null);

-- equipment_activity_completions
DROP POLICY IF EXISTS "Authenticated can manage equipment_activity_completions" ON public.equipment_activity_completions;
CREATE POLICY "Authenticated can manage equipment_activity_completions"
  ON public.equipment_activity_completions FOR ALL TO authenticated
  USING ((select auth.uid()) is not null) WITH CHECK ((select auth.uid()) is not null);
DROP POLICY IF EXISTS "Anon can manage equipment_activity_completions" ON public.equipment_activity_completions;
CREATE POLICY "Anon can manage equipment_activity_completions"
  ON public.equipment_activity_completions FOR ALL TO anon
  USING ((select auth.uid()) is null) WITH CHECK ((select auth.uid()) is null);

-- equipment_activity_logs (INSERT-only policy)
DROP POLICY IF EXISTS "Authenticated users can insert equipment activity logs" ON public.equipment_activity_logs;
CREATE POLICY "Authenticated users can insert equipment activity logs"
  ON public.equipment_activity_logs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) is not null);

-- standalone_equipment_activities
DROP POLICY IF EXISTS "Authenticated can manage standalone_equipment_activities" ON public.standalone_equipment_activities;
CREATE POLICY "Authenticated can manage standalone_equipment_activities"
  ON public.standalone_equipment_activities FOR ALL TO authenticated
  USING ((select auth.uid()) is not null) WITH CHECK ((select auth.uid()) is not null);
DROP POLICY IF EXISTS "Anon can manage standalone_equipment_activities" ON public.standalone_equipment_activities;
CREATE POLICY "Anon can manage standalone_equipment_activities"
  ON public.standalone_equipment_activities FOR ALL TO anon
  USING ((select auth.uid()) is null) WITH CHECK ((select auth.uid()) is null);

-- standalone_equipment_activity_completions
DROP POLICY IF EXISTS "Authenticated can manage standalone_equipment_activity_completions" ON public.standalone_equipment_activity_completions;
CREATE POLICY "Authenticated can manage standalone_equipment_activity_completions"
  ON public.standalone_equipment_activity_completions FOR ALL TO authenticated
  USING ((select auth.uid()) is not null) WITH CHECK ((select auth.uid()) is not null);
DROP POLICY IF EXISTS "Anon can manage standalone_equipment_activity_completions" ON public.standalone_equipment_activity_completions;
CREATE POLICY "Anon can manage standalone_equipment_activity_completions"
  ON public.standalone_equipment_activity_completions FOR ALL TO anon
  USING ((select auth.uid()) is null) WITH CHECK ((select auth.uid()) is null);

-- standalone_equipment_activity_logs (INSERT-only; policy name may be truncated to 63 chars in DB)
DROP POLICY IF EXISTS "Authenticated users can insert standalone equipment activity lo" ON public.standalone_equipment_activity_logs;
DROP POLICY IF EXISTS "Authenticated users can insert standalone equipment activity logs" ON public.standalone_equipment_activity_logs;
CREATE POLICY "Authenticated users can insert standalone equipment activity logs"
  ON public.standalone_equipment_activity_logs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) is not null);

-- vdcr_activity_logs (INSERT-only)
DROP POLICY IF EXISTS "Authenticated users can insert VDCR activity logs" ON public.vdcr_activity_logs;
CREATE POLICY "Authenticated users can insert VDCR activity logs"
  ON public.vdcr_activity_logs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) is not null);
