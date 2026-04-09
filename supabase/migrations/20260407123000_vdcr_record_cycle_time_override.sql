-- Per-document cycle-time override for Documentation tab.
-- NULL means use project-level common cycle-time configuration.
alter table public.vdcr_records
  add column if not exists cycle_time_override_days integer;

alter table public.vdcr_records
  drop constraint if exists vdcr_records_cycle_time_override_days_check;

alter table public.vdcr_records
  add constraint vdcr_records_cycle_time_override_days_check
  check (cycle_time_override_days is null or cycle_time_override_days > 0);
