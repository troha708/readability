# Readability

A study Bible — live at [readability.bible](https://readability.bible).

Read the whole Bible (BSB or KJV) with per-verse study tools: study notes and
book introductions adapted from Tyndale House resources, cross-references,
Greek/Hebrew word study, a Bible dictionary, chapter maps and a searchable
atlas (embeddable on any site), comprehension quizzes, reading progress, and a
seven-translation verse compare. Built with [Next.js](https://nextjs.org),
[Tailwind CSS](https://tailwindcss.com), and [Supabase](https://supabase.com).

All scripture and study content is served from the JSON datasets in `data/` —
the database is used only for accounts, reading progress, and highlights.

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Reading and all study tools work immediately — content loads from `data/` on
disk. For accounts, progress sync, and highlights you need a
[Supabase](https://database.new) project: put its URL and anon key in
`.env.local` (see `.env.example` for where each value comes from), then create
the tables with:

```bash
npm run db:migrate
```

Sign-in is passwordless (email code) at `/login`.

## Embedding the atlas

The [atlas](https://readability.bible/try/bible/map) can be embedded on any
site as an iframe — no API key or account:

```html
<iframe
  src="https://readability.bible/try/bible/map?embed=1"
  width="100%" height="400" style="border: 0" loading="lazy"
  title="Bible atlas"></iframe>
```

`?embed=1` renders the map alone; clicking anywhere on it opens the full
atlas. To embed a specific region, frame the view by hand on the live atlas
and copy the `x`, `y`, and `k` (center and zoom) values from the address bar
into the iframe URL. An optional `min=` of 3, 10, or 50 hides places the
Bible mentions fewer than that many times.

## Scripts

- `npm run dev` / `build` / `start` / `lint` – the usual Next.js set
- `npm run db:migrate` – apply `supabase/migrations/` to the configured database (idempotent)
- `npm run bible:fetch` / `bible:seed` – rebuild and seed the Bible text datasets
- `npm run offline:build` – generate the offline content bundle in `public/offline/`
- `npm run build:mobile` – static export for the Capacitor (native app) build

## Project structure

- `src/app/` – App Router pages (`/` landing, `/try/bible/read` reader,
  `/try/bible/start` library, quizzes, dictionary, atlas)
- `src/app/api/` – search, verse compare, cross-references, word study, and
  other JSON endpoints reading from `data/`
- `src/lib/content/` – server-side loaders for the on-disk datasets
- `src/lib/supabase/` – Supabase client utilities (auth, progress)
- `data/` – scripture texts, study datasets, and quiz questions
- `scripts/` – dataset build pipelines and maintenance tools
- `supabase/migrations/` – SQL migrations for the account/progress tables

## License

Readability's code is licensed under the [GNU Affero General Public License
v3.0](LICENSE) or any later version. If you run a modified copy of this
software as a network service, the AGPL requires you to publish your
modifications.

The **Readability name, logo, and the readability.bible domain are not part
of the license grant** — forks must use their own name and branding.

Third-party datasets under `data/` keep their own licenses and attributions
(see the `_attribution.json` file in each dataset directory). Bible texts are
public domain; the adapted Tyndale and Strong's datasets are CC BY-SA 4.0.
