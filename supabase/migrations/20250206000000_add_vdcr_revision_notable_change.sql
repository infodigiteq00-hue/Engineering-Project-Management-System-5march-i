-- Add notable change fields to VDCR revision events
-- When a revision includes something notable (e.g. change order, scope change), user can mark it and add a title for quick reference in history.

ALTER TABLE public.vdcr_revision_events
ADD COLUMN IF NOT EXISTS has_notable_change boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS notable_change_title text;

COMMENT ON COLUMN public.vdcr_revision_events.has_notable_change IS 'True if this revision event includes a notable change (e.g. change order, scope change)';
COMMENT ON COLUMN public.vdcr_revision_events.notable_change_title IS 'Short title for the notable change, for display in revision history';
