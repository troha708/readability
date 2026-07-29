"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChunkReader } from "./chunk-reader";
import { LoadingScreen } from "@/components/loading-screen";
import { getReadPageData, type ReadPageData } from "@/lib/content/offline";

/**
 * Mobile (offline) variant of the read page. Reads the book/chapter/version
 * from the URL on the client and loads everything from the bundled content.
 * The web build uses the server component in page.tsx instead.
 */
export function OfflineRead() {
  const sp = useSearchParams();
  const bookName = sp.get("book") ?? "Genesis";
  const chapterNum = parseInt(sp.get("chapter") ?? "1", 10);
  const versionAbbr = sp.get("version") ?? "BSB";
  const scrollToOverview = sp.get("overview") === "1";

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
