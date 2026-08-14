-- Serving-side support for licensed translations (API.Bible / American Bible
-- Society) in the verse sheet: a short-lived verse cache and a monthly call
-- counter. Both are server-only — the service role reads and writes them, no
-- client policy grants access. db:migrate replays every file, so everything
-- here is idempotent.
--
-- The cache is deliberately keyed per VERSE, never per chapter or range:
-- API.Bible permits caching "fewer than 500 consecutive verses" cleared every
-- 14 days, and verse-keyed rows can't accumulate into a continuous copy of
-- the text. purge_licensed_verse_cache() enforces the 14-day half of that.

create table if not exists public.licensed_verse_cache (
  version text not null,
  ref text not null,            -- USFM verse id, e.g. "JHN.3.16"
  text text not null,
  fetched_at timestamptz not null default now(),
  primary key (version, ref)
);

create index if not exists licensed_verse_cache_fetched_at_idx
  on public.licensed_verse_cache (fetched_at);

alter table public.licensed_verse_cache enable row level security;
-- No policies: RLS with none defined means only the service role reaches it.

create table if not exists public.api_quota (
  provider text not null,
  period text not null,         -- "2026-08"
  calls integer not null default 0,
  primary key (provider, period)
);

alter table public.api_quota enable row level security;

-- Atomically claim up to p_requested calls from the month's budget and return
-- how many were granted. The insert-then-update runs inside one statement, so
-- concurrent readers can't both spend the last call.
create or replace function public.reserve_api_quota(
  p_provider text,
  p_period text,
  p_requested integer,
  p_budget integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_granted integer;
begin
  insert into public.api_quota (provider, period, calls)
  values (p_provider, p_period, 0)
  on conflict (provider, period) do nothing;

  select calls into v_used
  from public.api_quota
  where provider = p_provider and period = p_period
  for update;

  v_granted := greatest(0, least(p_requested, p_budget - v_used));

  if v_granted > 0 then
    update public.api_quota
    set calls = calls + v_granted
    where provider = p_provider and period = p_period;
  end if;

  return v_granted;
end;
$$;

revoke all on function public.reserve_api_quota(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_api_quota(text, text, integer, integer) to service_role;

-- Drops cache rows past the licence's 14-day ceiling. Call it from a cron job
-- (or a scheduled Supabase function); the app also ignores rows older than
-- seven days when reading, so a lapsed purge shows stale text to nobody.
create or replace function public.purge_licensed_verse_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.licensed_verse_cache
  where fetched_at < now() - interval '14 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_licensed_verse_cache() from public, anon, authenticated;
grant execute on function public.purge_licensed_verse_cache() to service_role;

-- The service role bypasses RLS, but be explicit: these two tables are the
-- server's alone.
grant all on table public.licensed_verse_cache to service_role;
grant all on table public.api_quota to service_role;
