// MapLibre 6 locates its worker relative to import.meta.url, which does not
// survive bundling. Serve the (self-contained) worker from /public instead.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/vendor", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/vendor/maplibre-gl-worker.mjs");
