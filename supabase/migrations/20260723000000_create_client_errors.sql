-- Client-side crash reports, posted by the app through /api/client-error.
-- Write-only for clients: anon/authenticated may insert, nothing may read or
-- modify rows through the API — reading happens in the dashboard/SQL editor,
-- where the service role bypasses RLS. db:migrate replays every file, so
-- everything here is idempotent.

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message text not null,
  stack text,
  digest text,
  url text,
  user_agent text,
  source text
);

alter table public.client_errors enable row level security;

drop policy if exists "Clients can report errors" on public.client_errors;
create policy "Clients can report errors"
  on public.client_errors for insert
  to anon, authenticated
  with check (true);
