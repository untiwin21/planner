-- Run once in Supabase SQL Editor before using the expanded routine planner.
-- Existing routines and logs remain compatible.

alter table routines
  add column if not exists config jsonb default '{}';

alter table routine_logs
  add column if not exists completion text;

update routines
set config = '{}'
where config is null;
