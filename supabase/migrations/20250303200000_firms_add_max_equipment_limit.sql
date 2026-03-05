-- Max equipment limit per firm (project + standalone). Null = unlimited.
-- Super admin sets this in company create/edit; firm users cannot create more than this total.
ALTER TABLE public.firms
ADD COLUMN IF NOT EXISTS max_equipment_limit integer DEFAULT NULL;

COMMENT ON COLUMN public.firms.max_equipment_limit IS 'Max total equipment (project + standalone) for this firm. Null = unlimited.';
