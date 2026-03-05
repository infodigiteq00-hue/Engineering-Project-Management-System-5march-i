-- Add VDCR cycle time columns to projects table
-- Cycle time = days allowed for response/submission after receipt
-- Rev 00: Initial submission/review cycle time (e.g., 21 days)
-- Rev 01+: Subsequent revisions cycle time (e.g., 10 days)

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS vdcr_cycle_time_rev_00 integer,
ADD COLUMN IF NOT EXISTS vdcr_cycle_time_rev_01_plus integer;

COMMENT ON COLUMN public.projects.vdcr_cycle_time_rev_00 IS 'VDCR cycle time in days for Rev 00 - days to submit/receive for initial revision';
COMMENT ON COLUMN public.projects.vdcr_cycle_time_rev_01_plus IS 'VDCR cycle time in days for Rev 01 and beyond - days to submit/receive for subsequent revisions';
