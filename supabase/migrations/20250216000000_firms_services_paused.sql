-- Add services_paused to firms so super admin can temporarily pause all users of a company.
ALTER TABLE public.firms
ADD COLUMN IF NOT EXISTS services_paused boolean DEFAULT false;

COMMENT ON COLUMN public.firms.services_paused IS 'When true, all users of this firm see a blocking modal and cannot perform actions.';
