-- A note without a highlight.
--
-- The colour was NOT NULL, so storing a note meant painting the verse: the
-- reader asked for a note and got a yellow highlight they never chose. Make
-- the colour optional — a row is now a colour, a note, or both. The default
-- stays so writers that don't mention the column are unaffected; the app
-- always sends the column explicitly, null included.
alter table public.user_highlights
  alter column color drop not null;
