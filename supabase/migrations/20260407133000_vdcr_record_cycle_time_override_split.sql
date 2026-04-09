-- Split per-document cycle-time override into two buckets:
-- 1) Rev-00
-- 2) Rev-01 and further
alter table public.vdcr_records
  add column if not exists cycle_time_override_rev_00 integer,
  add column if not exists cycle_time_override_rev_01_plus integer;

-- Backfill from legacy single override column (if present).
update public.vdcr_records
set
  cycle_time_override_rev_00 = coalesce(cycle_time_override_rev_00, cycle_time_override_days),
  cycle_time_override_rev_01_plus = coalesce(cycle_time_override_rev_01_plus, cycle_time_override_days)
where cycle_time_override_days is not null;

alter table public.vdcr_records
  drop constraint if exists vdcr_records_cycle_time_override_rev_00_check;

alter table public.vdcr_records
  add constraint vdcr_records_cycle_time_override_rev_00_check
  check (cycle_time_override_rev_00 is null or cycle_time_override_rev_00 > 0);

alter table public.vdcr_records
  drop constraint if exists vdcr_records_cycle_time_override_rev_01_plus_check;

alter table public.vdcr_records
  add constraint vdcr_records_cycle_time_override_rev_01_plus_check
  check (cycle_time_override_rev_01_plus is null or cycle_time_override_rev_01_plus > 0);
