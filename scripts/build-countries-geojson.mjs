// Builds public/geo/countries-110m.json, the country shapes behind the macro page's
// world map, from Natural Earth's 1:110m admin-0 countries (public domain):
//   curl -L -o ne_110m.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
//   node scripts/build-countries-geojson.mjs ne_110m.geojson public/geo/countries-110m.json
// Keeps only what the map needs (code, English and Vietnamese names) and rounds
// coordinates to 0.01°, which is finer than the 1:110m outlines themselves.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node scripts/build-countries-geojson.mjs <ne_110m_admin_0_countries.geojson> <output.json>");
  process.exit(1);
}

/** Natural Earth code → the IMF DataMapper's, where they differ. */
const IMF_CODE = { KOS: "UVK", PSE: "WBG" };

const round = (c) => (typeof c === "number" ? Math.round(c * 100) / 100 : c.map(round));
const src = JSON.parse(readFileSync(input, "utf8"));
const features = src.features.map((f) => {
  const p = f.properties;
  const ne = p.ISO_A3_EH && p.ISO_A3_EH !== "-99" ? p.ISO_A3_EH : p.ADM0_A3;
  return {
    type: "Feature",
    properties: { code: IMF_CODE[ne] ?? ne, en: p.NAME, vi: p.NAME_VI || p.NAME },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  };
});
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ type: "FeatureCollection", features }));
console.log(`${features.length} countries → ${output}`);
