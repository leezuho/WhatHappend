"use client";

import { useEffect, useMemo, useState } from "react";
import Map, { Layer, NavigationControl, Source, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import { setWorkerUrl, type ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import clsx from "clsx";
import { useTheme } from "@/lib/use-theme";
import { mapBin } from "@/lib/signals/macro";
import { firstSymbolLayer, STYLE, tuneLabels, WORLD } from "@/components/panels/map-style";

// See scripts/copy-maplibre-worker.mjs.
if (typeof window !== "undefined") setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

// World map of one IMF indicator for this year, one color per class. Growth is
// diverging (blue up, red down, gray "about zero", three steps a side); inflation
// is one-hue sequential (orange, the next slot after blue). Both ramps share the
// blue ramp's lightness steps (OKLCH), and dark mode is its own selection: the
// classes near zero recede toward the dark surface instead of the light one.
// Economies without a number keep the basemap. Vietnam is outlined.

export interface ChoroplethMetric {
  ind: string;
  name: string;
  kind: "diverging" | "sequential";
  thresholds: number[];
  signed?: boolean;
  /** IMF DataMapper code → value this year. */
  values: Record<string, number>;
}

interface Shape {
  type: "Feature";
  properties: { code: string; en: string; vi: string };
  geometry: GeoJSON.Geometry;
}

const GEO_URL = "/geo/countries-110m.json";
const HIGHLIGHT = "VNM";

const BLUE = { 200: "#9ec5f4", 300: "#6da7ec", 400: "#3987e5", 450: "#2a78d6", 600: "#184f95" };
const RED = { 200: "#f8aaa3", 300: "#ee7e77", 400: "#e24a48", 450: "#d2383a", 600: "#911e22" };
const ORANGE = { 150: "#f5c4b2", 250: "#eb9c7f", 350: "#df7249", 450: "#c94908", 550: "#9f3600", 650: "#752600" };

/** Class colors, lowest class first, per mode. */
const PALETTE: Record<ChoroplethMetric["kind"], Record<"light" | "dark", string[]>> = {
  diverging: {
    light: [RED[600], RED[400], RED[200], "#dcdbd6", BLUE[200], BLUE[400], BLUE[600]],
    dark: [RED[300], RED[450], RED[600], "#46463f", BLUE[600], BLUE[450], BLUE[300]],
  },
  sequential: {
    light: [ORANGE[150], ORANGE[250], ORANGE[350], ORANGE[450], ORANGE[550], ORANGE[650]],
    dark: [ORANGE[650], ORANGE[550], ORANGE[450], ORANGE[350], ORANGE[250], ORANGE[150]],
  },
};

function fmt(v: number, locale: "vi" | "en", signed?: boolean): string {
  const s = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.abs(v));
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  return `${sign}${s}%`;
}

/** Legend text of class i: "< −5%", "−5 – −2.5%", "≥ 20%". */
function classLabel(i: number, t: number[], locale: "vi" | "en", signed?: boolean): string {
  const n = (v: number) => fmt(v, locale, signed).replace(/\.0%|,0%/, "%");
  if (i === 0) return `< ${n(t[0])}`;
  if (i === t.length) return `≥ ${n(t[t.length - 1])}`;
  return `${n(t[i - 1]).replace("%", "")} – ${n(t[i])}`;
}

export function WorldChoropleth({
  metrics,
  year,
  locale,
  labels,
}: {
  metrics: ChoroplethMetric[];
  year: number;
  locale: "vi" | "en";
  labels: { table: string; chart: string; noData: string; country: string; hint: string };
}) {
  const theme = useTheme();
  const [active, setActive] = useState(0);
  const [view, setView] = useState<"map" | "table">("map");
  const [shapes, setShapes] = useState<Shape[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [below, setBelow] = useState<string | undefined>();
  const [hover, setHover] = useState<{ x: number; y: number; width: number; code: string; name: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(GEO_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((g: { features: Shape[] }) => live && setShapes(g.features))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const metric = metrics[active];
  const colors = PALETTE[metric.kind][theme];

  const geo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (shapes ?? []).map((s) => {
        const v = metric.values[s.properties.code];
        return { ...s, properties: { ...s.properties, bin: v === undefined ? -1 : mapBin(v, metric.thresholds) } };
      }),
    }),
    [shapes, metric],
  );

  // Class i → its color; -1 (no number) → transparent, so the basemap shows through.
  const fill = ["match", ["get", "bin"], ...colors.flatMap((c, i) => [i, c]), "rgba(0,0,0,0)"] as unknown as ExpressionSpecification;
  const rows = useMemo(
    () =>
      (shapes ?? [])
        .flatMap((s) => {
          const v = metric.values[s.properties.code];
          return v === undefined ? [] : [{ code: s.properties.code, name: locale === "vi" ? s.properties.vi : s.properties.en, value: v }];
        })
        .sort((a, b) => b.value - a.value),
    [shapes, metric, locale],
  );
  const hoverValue = hover ? metric.values[hover.code] : undefined;

  const onMove = (ev: MapLayerMouseEvent) => {
    const f = ev.features?.[0];
    if (!f) return setHover(null);
    const p = f.properties as Shape["properties"];
    setHover({ x: ev.point.x, y: ev.point.y, width: ev.target.getContainer().clientWidth, code: p.code, name: locale === "vi" ? p.vi : p.en });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex gap-1 border-b border-line">
          {metrics.map((m, i) => (
            <button
              key={m.ind}
              role="tab"
              type="button"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className={clsx("-mb-px border-b-2 px-2 pb-1.5 text-xs", active === i ? "border-accent font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink")}
            >
              {m.name} {year}
            </button>
          ))}
        </div>
        <div className="flex gap-1 text-[11px]">
          {(["map", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={clsx("rounded px-1.5 py-px", view === v ? "bg-accent text-on-accent" : "text-muted hover:text-ink")}
            >
              {v === "map" ? labels.chart : labels.table}
            </button>
          ))}
        </div>
      </div>

      {view === "map" ? (
        <div className="wh-map relative h-[340px] overflow-hidden rounded-lg md:h-[420px]">
          {failed ? (
            <p className="p-4 text-xs text-muted">{labels.noData}</p>
          ) : (
            <Map
              initialViewState={{ bounds: WORLD, fitBoundsOptions: { padding: 8 } }}
              mapStyle={STYLE[theme]}
              styleDiffing={false}
              style={{ width: "100%", height: "100%" }}
              renderWorldCopies={false}
              dragRotate={false}
              touchPitch={false}
              scrollZoom={false}
              interactiveLayerIds={["choro-fill"]}
              onLoad={(ev) => {
                const map = ev.target;
                const restyle = () => {
                  tuneLabels(map, locale);
                  setBelow(firstSymbolLayer(map));
                };
                restyle();
                // A theme switch reloads the whole style (styleDiffing off), which drops the label tweaks.
                map.on("style.load", restyle);
              }}
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
              attributionControl={{ compact: true, customAttribution: "IMF WEO · Natural Earth" }}
            >
              <NavigationControl position="top-left" showCompass={false} />
              {shapes && (
                <Source id="choro" type="geojson" data={geo}>
                  <Layer id="choro-fill" type="fill" beforeId={below} paint={{ "fill-color": fill, "fill-opacity": 0.9 }} />
                  <Layer id="choro-edge" type="line" beforeId={below} paint={{ "line-color": theme === "dark" ? "#1a1a19" : "#fcfcfb", "line-width": 0.6 }} />
                  <Layer
                    id="choro-highlight"
                    type="line"
                    beforeId={below}
                    filter={["==", ["get", "code"], HIGHLIGHT]}
                    paint={{ "line-color": theme === "dark" ? "#f0efec" : "#0b0b0b", "line-width": 1.5 }}
                  />
                </Source>
              )}
            </Map>
          )}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm"
              // Flip to the pointer's left near the right edge so the tooltip stays inside the map.
              style={hover.x > hover.width - 180 ? { right: hover.width - hover.x + 12, top: hover.y + 12 } : { left: hover.x + 12, top: hover.y + 12 }}
            >
              <span className="text-ink-2">{hover.name}: </span>
              <span className="font-semibold text-ink">{hoverValue === undefined ? labels.noData : fmt(hoverValue, locale, metric.signed)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          <table className="tabular w-full text-xs">
            <thead className="sticky top-0 bg-surface text-muted">
              <tr>
                <th scope="col" className="py-1 text-left font-normal">
                  {labels.country}
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  {metric.name} {year}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className={clsx("border-t border-line", r.code === HIGHLIGHT && "font-semibold")}>
                  <td className="py-1 text-ink-2">{r.name}</td>
                  <td className="py-1 text-right text-ink">{fmt(r.value, locale, metric.signed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-2" aria-label={metric.name}>
        {colors.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-2.5 w-4 rounded-sm" style={{ background: c }} />
            {classLabel(i, metric.thresholds, locale, metric.signed)}
          </li>
        ))}
        <li className="flex items-center gap-1 text-muted">
          <span aria-hidden className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-axis" />
          {labels.noData}
        </li>
      </ul>
      <p className="text-[11px] text-muted">{labels.hint}</p>
    </div>
  );
}
