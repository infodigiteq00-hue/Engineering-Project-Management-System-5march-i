-- Add equipment_unlock_days to firms for gradual onboarding (Equipment dashboard locked for N days after firm creation).
ALTER TABLE public.firms
ADD COLUMN IF NOT EXISTS equipment_unlock_days integer DEFAULT 90;

COMMENT ON COLUMN public.firms.equipment_unlock_days IS 'Number of days after firm creation before Equipment dashboard becomes available. Set by super admin when creating/editing firm.';
