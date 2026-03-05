-- Enable RLS on equipment activity tables and add policies so the app can read/write.
-- Allow both 'authenticated' and 'anon': after refresh the app may use anon key until
-- session is ready, so anon must be able to read/write or data appears "lost".

ALTER TABLE public.equipment_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_activity_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_activity_completions ENABLE ROW LEVEL SECURITY;

-- equipment_activities: authenticated
DROP POLICY IF EXISTS "Authenticated can manage equipment_activities" ON public.equipment_activities;
CREATE POLICY "Authenticated can manage equipment_activities"
  ON public.equipment_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- anon (used when session not yet loaded, e.g. right after refresh)
DROP POLICY IF EXISTS "Anon can manage equipment_activities" ON public.equipment_activities;
CREATE POLICY "Anon can manage equipment_activities"
  ON public.equipment_activities FOR ALL TO anon USING (true) WITH CHECK (true);

-- equipment_activity_completions
DROP POLICY IF EXISTS "Authenticated can manage equipment_activity_completions" ON public.equipment_activity_completions;
CREATE POLICY "Authenticated can manage equipment_activity_completions"
  ON public.equipment_activity_completions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon can manage equipment_activity_completions" ON public.equipment_activity_completions;
CREATE POLICY "Anon can manage equipment_activity_completions"
  ON public.equipment_activity_completions FOR ALL TO anon USING (true) WITH CHECK (true);

-- standalone_equipment_activities
DROP POLICY IF EXISTS "Authenticated can manage standalone_equipment_activities" ON public.standalone_equipment_activities;
CREATE POLICY "Authenticated can manage standalone_equipment_activities"
  ON public.standalone_equipment_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon can manage standalone_equipment_activities" ON public.standalone_equipment_activities;
CREATE POLICY "Anon can manage standalone_equipment_activities"
  ON public.standalone_equipment_activities FOR ALL TO anon USING (true) WITH CHECK (true);

-- standalone_equipment_activity_completions
DROP POLICY IF EXISTS "Authenticated can manage standalone_equipment_activity_completions" ON public.standalone_equipment_activity_completions;
CREATE POLICY "Authenticated can manage standalone_equipment_activity_completions"
  ON public.standalone_equipment_activity_completions FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon can manage standalone_equipment_activity_completions" ON public.standalone_equipment_activity_completions;
CREATE POLICY "Anon can manage standalone_equipment_activity_completions"
  ON public.standalone_equipment_activity_completions FOR ALL TO anon USING (true) WITH CHECK (true);

-- Table-level GRANTs: anon and authenticated must be allowed to use the table (RLS only controls rows).
-- Without these, the Supabase REST API returns empty or 403 for these tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_activities TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_activity_completions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.standalone_equipment_activities TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.standalone_equipment_activity_completions TO anon, authenticated;
