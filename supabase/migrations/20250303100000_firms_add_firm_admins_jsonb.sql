-- Store all firm admins (name, email, phone, whatsapp) in firms table without overwriting.
-- Super admin create/edit saves the full array here; load uses it for the edit form and cards.
ALTER TABLE public.firms
ADD COLUMN IF NOT EXISTS firm_admins jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.firms.firm_admins IS 'Array of firm admin entries: { id?, full_name, email, phone?, whatsapp? }. All admins stored; no overwrite.';
