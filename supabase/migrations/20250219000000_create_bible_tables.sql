-- Bible reading app: books, chapters, chunks (NIV)
-- Run this in Supabase SQL Editor or via Supabase CLI.

-- Books (id, name, testament)
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  testament text not null check (testament in ('OT', 'NT')),
  created_at timestamptz default now()
);

-- Chapters (id, book_id, chapter_number, full_text)
create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_number int not null,
  full_text text not null,
  created_at timestamptz default now(),
  unique(book_id, chapter_number)
);

-- Chunks (id, chapter_id, chunk_number, text) — ~1500 words, break at verse/subheading boundaries
create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  chunk_number int not null,
  text text not null,
  created_at timestamptz default now(),
  unique(chapter_id, chunk_number)
);

-- Indexes for common lookups
create index if not exists idx_chapters_book_id on public.chapters(book_id);
create index if not exists idx_chunks_chapter_id on public.chunks(chapter_id);

-- Optional: RLS (enable if you want row-level security later)
-- alter table public.books enable row level security;
-- alter table public.chapters enable row level security;
-- alter table public.chunks enable row level security;
