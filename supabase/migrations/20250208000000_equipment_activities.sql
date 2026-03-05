-- Equipment Activities: activity list per equipment (from Excel upload)
-- Supports "regular update" (feeds Updates tab) and "milestone" (feeds Progress Image section).
-- Commencement date on equipment is used to compute target_date from target_relative (e.g. "1st week", "2nd day").

-- Add optional commencement date to equipment (project and standalone)
ALTER TABLE public.equipment
ADD COLUMN IF NOT EXISTS commencement_date date;

ALTER TABLE public.standalone_equipment
ADD COLUMN IF NOT EXISTS commencement_date date;

COMMENT ON COLUMN public.equipment.commencement_date IS 'Date of commencement for this equipment; used to compute activity target dates from relative targets (e.g. 1st week, 2nd day).';
COMMENT ON COLUMN public.standalone_equipment.commencement_date IS 'Date of commencement for this equipment; used to compute activity target dates from relative targets.';

-- Project equipment: activities table
CREATE TABLE IF NOT EXISTS public.equipment_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  sr_no int NOT NULL DEFAULT 1,
  activity_name text NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('regular_update', 'milestone')),
  target_relative text,
  target_date date,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_activities_equipment_id ON public.equipment_activities(equipment_id);
COMMENT ON TABLE public.equipment_activities IS 'Activity list per project equipment (from Excel). activity_type: regular_update -> Updates tab, milestone -> Progress Image section.';

-- Standalone equipment: activities table
CREATE TABLE IF NOT EXISTS public.standalone_equipment_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.standalone_equipment(id) ON DELETE CASCADE,
  sr_no int NOT NULL DEFAULT 1,
  activity_name text NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('regular_update', 'milestone')),
  target_relative text,
  target_date date,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activities_equipment_id ON public.standalone_equipment_activities(equipment_id);

-- Project equipment: activity completions (when user marks an activity complete)
CREATE TABLE IF NOT EXISTS public.equipment_activity_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.equipment_activities(id) ON DELETE CASCADE,
  completed_on date NOT NULL,
  completed_by_user_id uuid REFERENCES public.users(id),
  completed_by_display_name text,
  notes text,
  image_url text,
  updated_on timestamptz DEFAULT now() NOT NULL,
  updated_by uuid REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_equipment_activity_completions_activity_id ON public.equipment_activity_completions(activity_id);
COMMENT ON TABLE public.equipment_activity_completions IS 'When an activity is marked complete: completed_on (user-entered), completed_by from team dropdown, updated_on/updated_by set by backend.';

-- Standalone equipment: activity completions
CREATE TABLE IF NOT EXISTS public.standalone_equipment_activity_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.standalone_equipment_activities(id) ON DELETE CASCADE,
  completed_on date NOT NULL,
  completed_by_user_id uuid REFERENCES public.users(id),
  completed_by_display_name text,
  notes text,
  image_url text,
  updated_on timestamptz DEFAULT now() NOT NULL,
  updated_by uuid REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activity_completions_activity_id ON public.standalone_equipment_activity_completions(activity_id);

-- RLS: allow same access as equipment (simplified - enable if your project uses RLS)
-- ALTER TABLE public.equipment_activities ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.equipment_activity_completions ENABLE ROW LEVEL SECURITY;
-- (Repeat for standalone tables as per your RLS policy pattern.)
