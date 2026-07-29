-- Backfill DDL for user_progress, which was originally created by hand in
-- the dashboard and never checked in. Matches the live schema exactly.
-- The unique constraint on (user_id, book, chapter) is required by the
-- client's upsert (onConflict: "user_id,book,chapter").

create table if not exists public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book text not null,
  chapter int not null,
  reading_complete boolean default false,
  quiz_complete boolean default false,
  completed_at timestamptz default now(),
  unique(user_id, book, chapter)
);

alter table public.user_progress enable row level security;

drop policy if exists "Users can read own progress" on public.user_progress;
create policy "Users can read own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own progress" on public.user_progress;
create policy "Users can insert own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own progress" on public.user_progress;
create policy "Users can update own progress"
  on public.user_progress for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own progress" on public.user_progress;
create policy "Users can delete own progress"
  on public.user_progress for delete
  using (auth.uid() = user_id);
