"use client";

import { useEffect, useState } from "react";
import { ChunkReader } from "./chunk-reader";
import { LoadingScreen } from "@/components/loading-screen";
import { getReadPageData, type ReadPageData } from "@/lib/content/offline";

/**
 * Mobile (offline) variant of the read page. Reads the book/chapter/version
 * from the URL on the client and loads everything from the bundled content.
 * The web build uses the server component in page.tsx instead.
 *
 * The URL itself — not useSearchParams — is the source of truth here. In the
 * static export the router can update the address bar on a chapter-strip
 * Link tap without ever re-rendering this tree, and useSearchParams also
 * hydrates a beat late on cold starts (letting a ?chapter= deep link be read
 * as chapter 1). Watching location.search directly (popstate + a light poll)
 * covers every way the URL can change, however the router feels about it.
 */
export function OfflineRead() {
  const [params, setParams] = useState(
    () => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search),
  );
  useEffect(() => {
    const sync = () => {
      setParams((prev) =>
        prev.toString() === new URLSearchParams(window.location.search).toString()
          ? prev
          : new URLSearchParams(window.location.search),
      );
    };
    window.addEventListener("popstate", sync);
    const poll = window.setInterval(sync, 300);
    return () => {
      window.removeEventListener("popstate", sync);
      window.clearInterval(poll);
    };
  }, []);

  const bookName = params.get("book") ?? "Genesis";
  const chapterNum = parseInt(params.get("chapter") ?? "1", 10);
  const versionAbbr = params.get("version") ?? "BSB";
  const scrollToOverview = params.get("overview") === "1";

  const [data, setData] = useState<ReadPageData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setMissing(false);
    getReadPageData(bookName, chapterNum, versionAbbr).then((d) => {
      if (!active) return;
      if (!d || !d.text) setMissing(true);
      else setData(d);
    });
    return () => {
      active = false;
    };
  }, [bookName, chapterNum, versionAbbr]);

  if (missing) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-neutral-500">
        <p className="text-lg font-semibold">Chapter unavailable offline</p>
        <p className="text-sm">{bookName} {chapterNum} isn’t in this download.</p>
      </div>
    );
  }

  if (!data) return <LoadingScreen label="Loading chapter…" />;

  return (
    <ChunkReader
      key={`${bookName}-${chapterNum}`}
      bookName={bookName}
      initialChapterNumber={chapterNum}
      initialText={data.text}
      initialQuestions={data.questions}
      initialHeadings={data.headings}
      bookSummary={data.bookSummary}
      scrollToOverview={scrollToOverview}
      versionAbbr={versionAbbr}
      versionName={data.versionName}
      availableVersions={data.availableVersions}
      chapterNumbers={data.chapterNumbers}
      allBookNames={data.allBookNames}
    />
  );
}
