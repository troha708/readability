-- Lock down the Bible content tables. The anon role has full CRUD grants on
-- the public schema by default, so without RLS anyone holding the (public)
-- anon key could modify or delete the Bible text. Content is read-only for
-- clients; all writes go through seed scripts using the service-role key,
-- which bypasses RLS.
--
-- This backfills what was previously configured by hand in the dashboard,
-- so a rebuilt database is secure from the migrations alone.

alter table public.books enable row level security;
alter table public.chapters enable row level security;
alter table public.chunks enable row level security;
alter table public.translations enable row level security;

drop policy if exists "Public can read books" on public.books;
create policy "Public can read books"
  on public.books for select
  using (true);

drop policy if exists "Public can read chapters" on public.chapters;
create policy "Public can read chapters"
  on public.chapters for select
  using (true);

drop policy if exists "Public can read chunks" on public.chunks;
create policy "Public can read chunks"
  on public.chunks for select
  using (true);

drop policy if exists "Public can read translations" on public.translations;
create policy "Public can read translations"
  on public.translations for select
  using (true);
