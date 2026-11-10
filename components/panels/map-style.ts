import type { ExpressionSpecification, LngLatBoundsLike, Map as MaplibreMap } from "maplibre-gl";

// Basemap pieces shared by the event map (MapView) and the macro page's world map (WorldChoropleth).

export const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** Inhabited latitudes, fitted to whatever size the panel is (flat map). */
export const WORLD: LngLatBoundsLike = [
  [-170, -50],
  [180, 72],
];

/** Place labels (cities, seas, roads) only show from here; country names show at every zoom. */
const LABEL_MIN_ZOOM = 3;

/** One language per label instead of "Latin\nnative", and only country names at world scale. */
export function tuneLabels(map: MaplibreMap, locale: "vi" | "en") {
  const name: ExpressionSpecification =
    locale === "vi"
      ? ["coalesce", ["get", "name:vi"], ["get", "name:en"], ["get", "name_en"], ["get", "name"]]
      : ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name"]];
  for (const l of map.getStyle()?.layers ?? []) {
    if (l.type !== "symbol") continue;
    const field = JSON.stringify(map.getLayoutProperty(l.id, "text-field") ?? "");
    if (field.includes("name")) map.setLayoutProperty(l.id, "text-field", name);
    if (!l.id.includes("country")) map.setLayerZoomRange(l.id, Math.max(l.minzoom ?? 0, LABEL_MIN_ZOOM), l.maxzoom ?? 24);
  }
}

/** The first label layer of the basemap, so data layers can go under the names. */
export function firstSymbolLayer(map: MaplibreMap): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
}
