-- Trigram index so /api/search's `ilike '%query%'` uses an index scan
-- instead of sequentially scanning every chunk of every translation.

create extension if not exists pg_trgm;

create index if not exists idx_chunks_text_trgm
  on public.chunks using gin (text gin_trgm_ops);
