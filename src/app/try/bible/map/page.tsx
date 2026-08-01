import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Atlas } from "./atlas";
import { IS_MOBILE } from "@/lib/build-target";
import { MAX_K } from "@/lib/map-view";
import { SITE_URL } from "@/lib/site";
import { chapterReference } from "@/lib/bible-book-order";
import { loadAtlasData } from "@/lib/content/atlas-server";
import {
  openBiblePlaceUrl,
  placeSlug,
  type AtlasPlace,
  type AtlasRef,
  type AtlasUnlocated,
} from "@/lib/content/places";

/**
 * Full-screen Bible atlas: every locatable place in the Bible on the
 * self-hosted vector map, searchable by name, with each place's verse
 * references linking back into the reader. ?book=&chapter= focuses the map
 * on one chapter's places (the reader's map sheet expands to this).
 *
 * The map itself is client-rendered from static files under public/maps/.
 * For search engines, each deep link — ?place= (every located + unlocated
 * place), ?journey= (Paul's routes), ?book=&chapter= (chapter focus) — gets
 * its own metadata
 * and a server-rendered text equivalent of what the map shows there, since
 * crawlers see none of the client-side map. The text mirrors visible map
 * content (names, identifications, verse refs) rather than adding to it.
 * All of this is web-only: the mobile static export can't read searchParams,
 * so it keeps the base page.
 */

type SearchParams = {
  place?: string;
  journey?: string;
  book?: string;
  chapter?: string;
  /** "1" renders the map alone as an iframe embed (atlas.tsx handles it). */
  embed?: string;
  /** Shared view: world-space center + zoom, mirrored by the client. */
  x?: string;
  y?: string;
  k?: string;
  /** Mentions filter (3/10/50), mirrored by the client. */
  min?: string;
};
type Props = { searchParams: Promise<SearchParams> };

// No description on the base page: platforms fall back from og:description to
// the meta description, so the only way to get a title-only preview card is to
// carry neither. Search engines snippet from the sr-only BaseContent instead.
// The null is load-bearing — leaving the field absent would inherit the root
// layout's site-wide description, and link cards would show it under the title.
const BASE_METADATA: Metadata = {
  title: "Bible Atlas — every place mentioned in the Bible",
  description: null,
  alternates: { canonical: "/try/bible/map" },
  openGraph: {
    title: "Bible Atlas — every place mentioned in the Bible",
    url: "/try/bible/map",
  },
};

const KIND_LABELS = ["settlement", "body of water", "region", "natural feature"];

/** How many verse-reference links a place page renders before eliding. */
const MAX_REF_LINKS = 60;
/** How many place links the base page's crawl index carries. */
const INDEX_PLACES = 100;

type SeoTarget =
  | { kind: "place"; place: AtlasPlace; located: true }
  | { kind: "place"; place: AtlasUnlocated; located: false }
  | { kind: "journey"; index: number }
  | { kind: "focus"; book: string; chapter: number; places: AtlasPlace[] };

function mentionsOf(p: { refs: AtlasRef[] }): number {
  return p.refs.reduce((n, [, , verses]) => n + verses.length, 0);
}

function distinctBooks(refs: AtlasRef[]): string[] {
  const { books } = loadAtlasData();
  const seen: number[] = [];
  for (const [b] of refs) if (!seen.includes(b)) seen.push(b);
  return seen.sort((a, b) => a - b).map((i) => books[i]);
}

/** Match a URL's params to the atlas entity they name, using only canonical
 *  values from the dataset from here on (raw params never reach the output). */
function resolveTarget(params: SearchParams): SeoTarget | null {
  const atlas = loadAtlasData();
  if (params.place) {
    const located = atlas.places.find((p) => placeSlug(p.link) === params.place);
    if (located) return { kind: "place", place: located, located: true };
    const unlocated = atlas.unlocated.find(
      (p) => placeSlug(p.link) === params.place,
    );
    if (unlocated) return { kind: "place", place: unlocated, located: false };
    return null;
  }
  if (params.journey && /^\d+$/.test(params.journey)) {
    const index = Number(params.journey);
    if (atlas.journeys[index]) return { kind: "journey", index };
  }
  if (params.book && params.chapter) {
    const chapter = parseInt(params.chapter, 10);
    const bIdx = atlas.books.indexOf(params.book);
    if (bIdx !== -1 && Number.isFinite(chapter)) {
      // Chapter presence spans all three tiers, like the map itself.
      const places = atlas.places.filter((p) =>
        [...p.refs, ...p.softRefs, ...p.gentilicRefs].some(
          ([b, ch]) => b === bIdx && ch === chapter,
        ),
      );
      if (places.length > 0)
        return { kind: "focus", book: atlas.books[bIdx], chapter, places };
    }
  }
  return null;
}

function verseCount(n: number): string {
  return n === 1 ? "1 verse" : `${n} verses`;
}

/** Located-place count, for crawler copy — kept computed so a dataset
 *  refresh can't leave a stale literal behind. */
function placeCountLabel(): string {
  return loadAtlasData().places.length.toLocaleString("en-US");
}

// Like the base page, deep-link cards are title-only: no meta description and
// no og:description (platforms fall back from one to the other, so both must
// be absent — the null is load-bearing against inheriting the site-wide
// description). Search engines snippet from each target's sr-only content.
function targetMetadata(target: SeoTarget): Metadata {
  if (target.kind === "place") {
    const { place } = target;
    const url = `/try/bible/map?place=${encodeURIComponent(placeSlug(place.link))}`;
    const title = target.located
      ? `${place.name} — Bible map & verses`
      : `${place.name} in the Bible — verses & location`;
    return {
      title,
      description: null,
      alternates: { canonical: url },
      openGraph: { title, url },
    };
  }
  if (target.kind === "journey") {
    const journey = loadAtlasData().journeys[target.index];
    const url = `/try/bible/map?journey=${target.index}`;
    const title = `${journey.name} — Bible route map`;
    return {
      title,
      description: null,
      alternates: { canonical: url },
      openGraph: { title, url },
    };
  }
  const ref = chapterReference(target.book, target.chapter);
  const url = `/try/bible/map?book=${encodeURIComponent(target.book)}&chapter=${target.chapter}`;
  const title = `${ref} map — places in the chapter`;
  return {
    title,
    description: null,
    alternates: { canonical: url },
    openGraph: { title, url },
  };
}

/** The dynamic share image (/api/map-og) mirroring this URL's map view —
 *  what Discord/Slack/iMessage render when an atlas link is pasted. Carries
 *  the same place/journey/chapter/view params so the preview shows the
 *  selected places at the selected zoom. */
function ogImage(target: SeoTarget | null, params: SearchParams, alt: string) {
  const q = new URLSearchParams();
  if (target?.kind === "place") q.set("place", placeSlug(target.place.link));
  else if (target?.kind === "journey") q.set("journey", String(target.index));
  else if (target?.kind === "focus") {
    q.set("book", target.book);
    q.set("chapter", String(target.chapter));
  }
  const x = Number(params.x);
  const y = Number(params.y);
  const k = Number(params.k);
  if (Number.isFinite(x) && Number.isFinite(y) && k > 0 && k <= MAX_K) {
    q.set("x", String(Math.round(x)));
    q.set("y", String(Math.round(y)));
    q.set("k", String(k));
  }
  const min = Number(params.min);
  if (min === 3 || min === 10 || min === 50) q.set("min", String(min));
  const qs = q.toString();
  return { url: `/api/map-og${qs ? `?${qs}` : ""}`, width: 1200, height: 630, alt };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  if (IS_MOBILE) return BASE_METADATA;
  const params = await searchParams;
  const target = resolveTarget(params);
  const md = target ? targetMetadata(target) : BASE_METADATA;
  const title = typeof md.title === "string" ? md.title : "Bible Atlas";
  const image = ogImage(target, params, title);
  return {
    ...md,
    openGraph: { ...md.openGraph, images: [image] },
    twitter: { card: "summary_large_image", images: [image.url] },
    // The embed view is a frame for other sites, not a page of its own.
    ...(params.embed === "1" ? { robots: { index: false } } : {}),
  };
}

function breadcrumbJsonLd(leafName: string, leafUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Bible", item: `${SITE_URL}/try/bible/start` },
      { "@type": "ListItem", position: 2, name: "Bible Atlas", item: `${SITE_URL}/try/bible/map` },
      { "@type": "ListItem", position: 3, name: leafName, item: `${SITE_URL}${leafUrl}` },
    ],
  };
}

function refHref(book: string, chapter: number, verse?: number): string {
  return `/try/bible/read?book=${encodeURIComponent(book)}&chapter=${chapter}${verse ? `&verse=${verse}` : ""}`;
}

function PlaceContent({ target }: { target: SeoTarget & { kind: "place" } }) {
  const { books } = loadAtlasData();
  const { place } = target;
  const slug = placeSlug(place.link);
  const url = `/try/bible/map?place=${encodeURIComponent(slug)}`;
  const mentions = mentionsOf(place);
  // Soft/gentilic tiers exist on located places only; unlocated ref lists
  // already carry every tier merged.
  const softRefs = target.located ? target.place.softRefs : [];
  const gentilicRefs = target.located ? target.place.gentilicRefs : [];
  const totalMentions =
    mentions + mentionsOf({ refs: softRefs }) + mentionsOf({ refs: gentilicRefs });
  const span = distinctBooks([...place.refs, ...softRefs, ...gentilicRefs]);

  const jsonLd: object[] = [breadcrumbJsonLd(place.name, url)];
  if (target.located) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "Place",
      name: place.name,
      ...(target.place.modern ? { alternateName: target.place.modern } : {}),
      description: `${place.name}, a ${KIND_LABELS[target.place.kind]} named in ${verseCount(totalMentions)} of the Bible.`,
      sameAs: openBiblePlaceUrl(place.link),
      url: `${SITE_URL}${url}`,
    });
  }

  const shownRefs = place.refs.slice(0, MAX_REF_LINKS);
  const elided = place.refs.length - shownRefs.length;
  const refList = (refs: AtlasRef[]) => (
    <ul>
      {refs.map(([b, ch, verses]) => (
        <li key={`${b}-${ch}`}>
          <Link href={refHref(books[b], ch, verses[0])}>
            {books[b]} {ch}:{verses.join(", ")}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="sr-only">
        <h1>{place.name} — Bible Atlas</h1>
        <p>
          {target.located ? (
            <>
              {place.name} is a {KIND_LABELS[target.place.kind]} named in{" "}
              {verseCount(totalMentions)} of the Bible ({span.join(", ")}), shown
              here on an interactive map.
              {mentions === 0 &&
                gentilicRefs.length > 0 &&
                " The text names it through its people rather than by its own name."}
              {mentions === 0 &&
                gentilicRefs.length === 0 &&
                softRefs.length > 0 &&
                " Only some translations render the name."}
              {target.place.modern && ` It is identified with ${target.place.modern}.`}
              {target.place.uncertain &&
                " The identification is uncertain: scholars split it across candidate sites."}
            </>
          ) : (
            <>
              {place.name} is mentioned in {verseCount(mentions)} of the Bible (
              {span.join(", ")}). Its location has not been identified, so it has
              no point on the map.
            </>
          )}
        </p>
        {shownRefs.length > 0 && (
          <>
            <h2>Verses that mention {place.name}</h2>
            {refList(shownRefs)}
          </>
        )}
        {elided > 0 && <p>…and {elided} more chapters on the map itself.</p>}
        {softRefs.length > 0 && (
          <>
            <h2>Verses where some translations read {place.name}</h2>
            {refList(softRefs)}
          </>
        )}
        {gentilicRefs.length > 0 && (
          <>
            <h2>Verses that name {place.name} through its people</h2>
            {refList(gentilicRefs)}
          </>
        )}
        <p>
          <a href={openBiblePlaceUrl(place.link)} rel="noopener">
            Scholarly sources for {place.name} (OpenBible.info)
          </a>
        </p>
        <p>
          <Link href="/try/bible/map">All {placeCountLabel()} places on the Bible Atlas</Link>
        </p>
      </div>
    </>
  );
}

function JourneyContent({ index }: { index: number }) {
  const atlas = loadAtlasData();
  const journey = atlas.journeys[index];
  const url = `/try/bible/map?journey=${index}`;
  // Match stops back to their atlas records so stop names can link to place
  // pages; return legs revisit cities, so list each stop once.
  const byKey = new Map(atlas.places.map((p) => [`${p.name}|${p.x}|${p.y}`, p]));
  const seen = new Set<string>();
  const stops = journey.stops.filter((s) => {
    const key = `${s.name}|${s.x}|${s.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd(journey.name, url)),
        }}
      />
      <div className="sr-only">
        <h1>{journey.name} — route map</h1>
        <p>
          Every stop on {journey.name} from the book of Acts, drawn in order on
          an interactive Bible map. Each stop links to the verse that names it.
        </p>
        <ol>
          {stops.map((s) => {
            const place = byKey.get(`${s.name}|${s.x}|${s.y}`);
            const [ch, verse] = s.ref.split(":").map(Number);
            return (
              <li key={`${s.name}-${s.ref}`}>
                {place ? (
                  <Link
                    href={`/try/bible/map?place=${encodeURIComponent(placeSlug(place.link))}`}
                  >
                    {s.name}
                  </Link>
                ) : (
                  s.name
                )}{" "}
                — <Link href={refHref("Acts", ch, verse)}>Acts {s.ref}</Link>
              </li>
            );
          })}
        </ol>
        <p>
          <Link href="/try/bible/map">All {placeCountLabel()} places on the Bible Atlas</Link>
        </p>
      </div>
    </>
  );
}

function FocusContent({
  target,
}: {
  target: SeoTarget & { kind: "focus" };
}) {
  const { books } = loadAtlasData();
  const bIdx = books.indexOf(target.book);
  const ref = chapterReference(target.book, target.chapter);
  const url = `/try/bible/map?book=${encodeURIComponent(target.book)}&chapter=${target.chapter}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd(`${ref} map`, url)),
        }}
      />
      <div className="sr-only">
        <h1>Places in {ref} — Bible map</h1>
        <p>
          The {target.places.length === 1 ? "place" : `${target.places.length} places`}{" "}
          named in {ref}, located on an interactive Bible map.
        </p>
        <ul>
          {target.places.map((p) => {
            const chRef = [...p.refs, ...p.softRefs, ...p.gentilicRefs].find(
              ([b, ch]) => b === bIdx && ch === target.chapter,
            );
            return (
              <li key={placeSlug(p.link)}>
                <Link href={`/try/bible/map?place=${encodeURIComponent(placeSlug(p.link))}`}>
                  {p.name}
                </Link>
                {p.modern && ` (${p.modern})`} — verse{chRef && chRef[2].length > 1 ? "s" : ""}{" "}
                {chRef?.[2].join(", ")}
              </li>
            );
          })}
        </ul>
        <p>
          <Link href={refHref(target.book, target.chapter)}>Read {ref}</Link>
        </p>
        <p>
          <Link href="/try/bible/map">All {placeCountLabel()} places on the Bible Atlas</Link>
        </p>
      </div>
    </>
  );
}

/** Base-page crawl index: the most-mentioned places and the journey routes,
 *  mirroring the names the map itself labels most prominently. */
function BaseContent() {
  const atlas = loadAtlasData();
  const top = [...atlas.places]
    .sort((a, b) => mentionsOf(b) - mentionsOf(a))
    .slice(0, INDEX_PLACES);

  return (
    <div className="sr-only">
      <h1>Bible Atlas — every place mentioned in the Bible</h1>
      <p>
        An interactive map of {placeCountLabel()} biblical places from the OpenBible.info
        geocoding dataset: search any place, filter by type, book, or how often
        the Bible mentions it, and open every verse reference in the reader.
        Each location links to the scholarly sources behind its identification.
      </p>
      <h2>Journey routes</h2>
      <ul>
        {atlas.journeys.map((j, i) => (
          <li key={j.name}>
            <Link href={`/try/bible/map?journey=${i}`}>{j.name}</Link>
          </li>
        ))}
      </ul>
      <h2>Most-mentioned places</h2>
      <ul>
        {top.map((p) => (
          <li key={placeSlug(p.link)}>
            <Link href={`/try/bible/map?place=${encodeURIComponent(placeSlug(p.link))}`}>
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function BibleMapPage({ searchParams }: Props) {
  // The static mobile export can't read searchParams; it always renders the
  // base page (the client Atlas still handles its own params from the URL).
  const target = IS_MOBILE ? null : resolveTarget(await searchParams);

  return (
    <>
      {target === null ? (
        <BaseContent />
      ) : target.kind === "place" ? (
        <PlaceContent target={target} />
      ) : target.kind === "journey" ? (
        <JourneyContent index={target.index} />
      ) : (
        <FocusContent target={target} />
      )}
      <Suspense fallback={null}>
        <Atlas />
      </Suspense>
    </>
  );
}
