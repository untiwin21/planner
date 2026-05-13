-- Enable RLS on all tables
-- All tables include user_id referencing auth.users

create table if not exists day_entries (
  id text primary key,
  user_id uuid references auth.users not null,
  date text not null,
  note text default '',
  meta jsonb default '{"sleep":null,"condition":null,"focus":null,"top3":[]}',
  unique(user_id, date)
);

create table if not exists tasks (
  id text primary key,
  user_id uuid references auth.users not null,
  day_id text not null,
  goal_id text,
  text text not null,
  done boolean default false,
  category_id text not null,
  category_name text not null,
  category_color text not null,
  time text,
  subtasks jsonb default '[]'
);

create table if not exists routines (
  id text primary key,
  user_id uuid references auth.users not null,
  name text not null,
  status text default 'active',
  created_at text not null
);

create table if not exists routine_logs (
  id text primary key,
  user_id uuid references auth.users not null,
  routine_id text not null,
  date text not null,
  done boolean default false,
  unique(user_id, routine_id, date)
);

create table if not exists short_goals (
  id text primary key,
  user_id uuid references auth.users not null,
  title text not null,
  date_from text not null,
  date_to text not null,
  note text default '',
  long_goal_id text,
  routines jsonb default '[]',
  categories jsonb default '[]',
  notes jsonb default '[]'
);

create table if not exists long_goals (
  id text primary key,
  user_id uuid references auth.users not null,
  title text not null,
  description text default '',
  date_from text not null,
  date_to text not null,
  color text not null
);

create table if not exists weekly_reviews (
  id text primary key,
  user_id uuid references auth.users not null,
  week_key text not null,
  content text default '',
  unique(user_id, week_key)
);

-- RLS policies
alter table day_entries enable row level security;
alter table tasks enable row level security;
alter table routines enable row level security;
alter table routine_logs enable row level security;
alter table short_goals enable row level security;
alter table long_goals enable row level security;
alter table weekly_reviews enable row level security;

create policy "users own their data" on day_entries for all using (auth.uid() = user_id);
create policy "users own their data" on tasks for all using (auth.uid() = user_id);
create policy "users own their data" on routines for all using (auth.uid() = user_id);
create policy "users own their data" on routine_logs for all using (auth.uid() = user_id);
create policy "users own their data" on short_goals for all using (auth.uid() = user_id);
create policy "users own their data" on long_goals for all using (auth.uid() = user_id);
create policy "users own their data" on weekly_reviews for all using (auth.uid() = user_id);

-- Migration: add time, order, period to routines
alter table routines add column if not exists time text;
alter table routines add column if not exists "order" integer default 0;
alter table routines add column if not exists period text default 'anytime';

-- Migration: embed tasks inside short_goals row so goal task done states
-- sync reliably across devices (REQUIRED for cross-device task completion).
alter table short_goals add column if not exists tasks jsonb default '[]';
