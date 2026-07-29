import rawAtlas from "../../../public/maps/atlas.json";
import { parseAtlas, type AtlasData, type RawAtlas } from "./places";

/**
 * Server-side copy of the whole-Bible atlas (the client fetches the same
 * file from /maps/atlas.json). Bundled via static import so it's available
 * to the map page's metadata/SEO content and the sitemap without a disk
 * read that Vercel's file tracing would have to be taught about.
 */
let cached: AtlasData | null = null;

export function loadAtlasData(): AtlasData {
  if (!cached) cached = parseAtlas(rawAtlas as unknown as RawAtlas);
  return cached;
}
