-- Verse highlights and notes
create table if not exists public.user_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book text not null,
  chapter int not null,
  verse int not null,
  color text not null default 'yellow',
  note text,
  created_at timestamptz default now(),
  unique(user_id, book, chapter, verse)
);

create index if not exists idx_user_highlights_user_id on public.user_highlights(user_id);
create index if not exists idx_user_highlights_lookup on public.user_highlights(user_id, book, chapter);

alter table public.user_highlights enable row level security;

drop policy if exists "Users can read own highlights" on public.user_highlights;
create policy "Users can read own highlights"
  on public.user_highlights for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own highlights" on public.user_highlights;
create policy "Users can insert own highlights"
  on public.user_highlights for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own highlights" on public.user_highlights;
create policy "Users can update own highlights"
  on public.user_highlights for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own highlights" on public.user_highlights;
create policy "Users can delete own highlights"
  on public.user_highlights for delete
  using (auth.uid() = user_id);
