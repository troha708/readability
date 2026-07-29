/**
 * Shared Web Mercator projection for the Bible maps pipeline.
 *
 * Both build-basemap.mjs (Natural Earth geometry) and build-places.mjs
 * (OpenBible place coordinates) must project into the exact same grid, so the
 * constants live here rather than being duplicated. The grid covers the whole
 * biblical world: Tarshish/Spain in the west to India (Esther 1:1) in the
 * east, Sheba/Cush in the south to Ararat in the north.
 *
 * Grid units are integers; x grows east, y grows south (SVG convention).
 */

export const EXTENT = { west: -10, south: 12, east: 70, north: 47 };

export const GRID_WIDTH = 20000;

function mercatorY(latDeg) {
  const lat = (latDeg * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}

const MERC_NORTH = mercatorY(EXTENT.north);
const MERC_SOUTH = mercatorY(EXTENT.south);
const LON_SPAN_RAD = ((EXTENT.east - EXTENT.west) * Math.PI) / 180;

export const GRID_HEIGHT = Math.round(
  (GRID_WIDTH * (MERC_NORTH - MERC_SOUTH)) / LON_SPAN_RAD,
);

/** [lon, lat] in degrees → [x, y] in (unrounded) grid units. */
export function project(lon, lat) {
  const x = ((lon - EXTENT.west) / (EXTENT.east - EXTENT.west)) * GRID_WIDTH;
  const y =
    ((MERC_NORTH - mercatorY(lat)) / (MERC_NORTH - MERC_SOUTH)) * GRID_HEIGHT;
  return [x, y];
}
