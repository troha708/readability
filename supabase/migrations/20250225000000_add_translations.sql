-- Add multi-translation support.
-- translations table holds each Bible version (WEB, KJV, etc.)
-- chapters gains a translation_id FK so each version has its own text.

create table if not exists public.translations (
  id uuid primary key default gen_random_uuid(),
  abbreviation text not null unique,
  name text not null,
  api_bible_id text,
  created_at timestamptz default now()
);

-- Seed a placeholder for any existing chapter rows
insert into public.translations (abbreviation, name)
values ('LEGACY', 'Legacy (unformatted)')
on conflict (abbreviation) do nothing;

-- Add translation_id to chapters (nullable first so existing rows survive)
alter table public.chapters
  add column if not exists translation_id uuid references public.translations(id) on delete cascade;

-- Back-fill existing rows with the LEGACY translation
update public.chapters
set translation_id = (select id from public.translations where abbreviation = 'LEGACY')
where translation_id is null;

-- Now make it not null
alter table public.chapters
  alter column translation_id set not null;

-- Replace the old unique constraint with one that includes translation_id
alter table public.chapters
  drop constraint if exists chapters_book_id_chapter_number_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chapters_book_translation_chapter_key'
      and conrelid = 'public.chapters'::regclass
  ) then
    alter table public.chapters
      add constraint chapters_book_translation_chapter_key
      unique (book_id, translation_id, chapter_number);
  end if;
end $$;

create index if not exists idx_chapters_translation_id on public.chapters(translation_id);
