"use client";

import { useEffect, useState } from "react";
import { BibleRoadmap, type BookInfo } from "./bible-roadmap";
import { LoadingScreen } from "@/components/loading-screen";
import { getRoadmapData, type RoadmapData } from "@/lib/content/offline";

/**
 * Mobile (offline) variant of the roadmap. Builds the same props the server
 * component passes to BibleRoadmap, but from the bundled manifest.
 */
export function OfflineRoadmap() {
  const [data, setData] = useState<RoadmapData | null>(null);

  useEffect(() => {
    let active = true;
    getRoadmapData().then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!data) return <LoadingScreen label="Loading roadmap…" />;

  return (
    <BibleRoadmap
      books={data.books as BookInfo[]}
      versionAbbr={data.versionAbbr}
      booksWithSummary={new Set(data.booksWithSummary)}
    />
  );
}
