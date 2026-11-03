"use client";

import { useMemo, useRef, useState } from "react";
import Map, { Layer, NavigationControl, Popup, Source, type LngLatBoundsLike, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// See scripts/copy-maplibre-worker.mjs.
if (typeof window !== "undefined") setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
import clsx from "clsx";
import { useTheme } from "@/lib/use-theme";
import type { MapEvent } from "@/lib/queries";

// Maps are an all-pairs color context: at most three categorical slots.
const GROUP_COLOR: Record<MapEvent["group"], string> = { quake: "--s1", hazard: "--s2", news: "--s3" };

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** Inhabited latitudes, fitted to whatever size the panel is. */
const WORLD: LngLatBoundsLike = [
  [-170, -50],
  [180, 72],
];
/** Below this zoom the news hotspots are a density layer; above it they are dots you can hover. */
const NEWS_POINTS_ZOOM = 3.5;
const ALERT_LIST_MAX = 6;

function cssVar(name: string): string {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : hex;
}

const alertRank = (e: MapEvent) => (e.level === "red" ? 0 : e.level === "orange" ? 1 : 2);

/** Orange/red alerts first, then quakes of magnitude 6+ (strongest first); GDELT hotspots are too noisy to rank. */
function topAlerts(events: MapEvent[], n = ALERT_LIST_MAX): MapEvent[] {
  return events
    .filter((e) => e.group !== "news" && (e.level === "red" || e.level === "orange" || (e.group === "quake" && (e.severity ?? 0) >= 6)))
    .sort((a, b) => alertRank(a) - alertRank(b) || (b.severity ?? 0) - (a.severity ?? 0) || b.ts - a.ts)
    .slice(0, n);
}

const toGeo = (list: MapEvent[]) => ({
  type: "FeatureCollection" as const,
  features: list.map((e) => ({
    type: "Feature" as const,
    id: e.id,
    properties: { id: e.id, group: e.group, sev: e.severity ?? 0, level: e.level ?? "" },
    geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] },
  })),
});

export function MapView({
  events,
  labels,
  locale,
}: {
  events: MapEvent[];
  labels: {
    groups: Record<MapEvent["group"], string>;
    alert: string;
    list: string;
    map: string;
    alerts: string;
    alertsHint: string;
    world: string;
    levels: { red: string; orange: string };
  };
  locale: "vi" | "en";
}) {
  const theme = useTheme();
  const mapRef = useRef<MapRef>(null);
  const [hidden, setHidden] = useState<Set<MapEvent["group"]>>(new Set());
  const [hover, setHover] = useState<MapEvent | null>(null);
  const [selected, setSelected] = useState<MapEvent | null>(null);
  const [showList, setShowList] = useState(false);
  // Re-read tokens whenever the theme flips: series slots have per-mode steps.
  // `theme` is not referenced inside, but the CSS variables it switches are.
  const colors = useMemo(
    () => ({
      quake: cssVar("--s1"),
      hazard: cssVar("--s2"),
      news: cssVar("--s3"),
      surface: cssVar("--surface"),
      critical: cssVar("--critical"),
      serious: cssVar("--serious"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );

  const visible = useMemo(() => events.filter((e) => !hidden.has(e.group)), [events, hidden]);
  const newsGeo = useMemo(() => toGeo(visible.filter((e) => e.group === "news")), [visible]);
  const hazardGeo = useMemo(() => toGeo(visible.filter((e) => e.group !== "news")), [visible]);
  const alerts = useMemo(() => topAlerts(visible), [visible]);
  const byId = useMemo(() => new globalThis.Map(events.map((e) => [e.id, e])), [events]);
  const fmt = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

  const counts = useMemo(() => {
    const c = { quake: 0, hazard: 0, news: 0 };
    for (const e of events) c[e.group]++;
    return c;
  }, [events]);

  const onMove = (ev: MapLayerMouseEvent) => {
    const f = ev.features?.[0];
    setHover(f ? (byId.get(String(f.properties?.id)) ?? null) : null);
  };

  const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const flyTo = (e: MapEvent) => {
    setSelected(e);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [e.lng, e.lat], zoom: Math.max(map.getZoom(), 4.5), duration: reducedMotion() ? 0 : 1200, essential: true });
  };
  const showWorld = () => {
    setSelected(null);
    mapRef.current?.fitBounds(WORLD, { padding: 8, duration: reducedMotion() ? 0 : 800 });
  };

  const popup = hover ?? selected;

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(Object.keys(GROUP_COLOR) as MapEvent["group"][]).map((g) =>
          counts[g] ? (
            <button
              key={g}
              type="button"
              aria-pressed={!hidden.has(g)}
              onClick={() =>
                setHidden((h) => {
                  const n = new Set(h);
                  if (n.has(g)) n.delete(g);
                  else n.add(g);
                  return n;
                })
              }
              className={clsx(
                "flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5",
                hidden.has(g) ? "text-muted line-through" : "text-ink-2",
              )}
            >
              <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: `var(${GROUP_COLOR[g]})` }} />
              {labels.groups[g]} <span className="tabular text-muted">{counts[g]}</span>
            </button>
          ) : null,
        )}
        <span className="flex items-center gap-1.5 text-ink-2">
          <span aria-hidden className="inline-block size-2.5 rounded-full border-2 border-critical" />
          {labels.alert}
        </span>
        <button type="button" onClick={() => setShowList((s) => !s)} className="ml-auto text-[11px] text-muted hover:text-ink hover:underline">
          {showList ? labels.map : labels.list}
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        {showList ? (
          <ul className="scroll-thin h-[360px] min-w-0 flex-1 overflow-auto text-xs md:h-[440px] xl:h-[520px]">
            {[...visible]
              .sort((a, b) => b.ts - a.ts)
              .map((e) => (
                <li key={e.id} className="flex items-baseline gap-2 border-t border-line py-1.5">
                  <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: `var(${GROUP_COLOR[e.group]})` }} />
                  <a href={e.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink hover:underline">
                    {e.title}
                  </a>
                  <span className="tabular shrink-0 text-muted">{fmt.format(e.ts)}</span>
                </li>
              ))}
          </ul>
        ) : (
          <div className="h-[360px] min-w-0 flex-1 overflow-hidden rounded-lg md:h-[440px] xl:h-[520px]">
            <Map
              ref={mapRef}
              initialViewState={{ bounds: WORLD, fitBoundsOptions: { padding: 8 } }}
              mapStyle={STYLE[theme]}
              style={{ width: "100%", height: "100%" }}
              interactiveLayerIds={["events", "news-points"]}
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
              onClick={(ev) => {
                const e = ev.features?.[0] && byId.get(String(ev.features[0].properties?.id));
                if (e?.url) window.open(e.url, "_blank", "noopener");
                else setSelected(null);
              }}
              cursor={hover ? "pointer" : "grab"}
              attributionControl={{ compact: true }}
              renderWorldCopies={false}
            >
              <NavigationControl position="top-left" showCompass={false} />
              <Source id="news" type="geojson" data={newsGeo}>
                {/* One hue, transparent → solid: density is a magnitude, not a new category. */}
                <Layer
                  id="news-heat"
                  type="heatmap"
                  maxzoom={NEWS_POINTS_ZOOM + 1.5}
                  paint={{
                    "heatmap-weight": ["interpolate", ["linear"], ["get", "sev"], 1, 0.5, 40, 1],
                    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1.4, NEWS_POINTS_ZOOM + 1, 2.4],
                    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 13, NEWS_POINTS_ZOOM + 1, 30],
                    "heatmap-color": [
                      "interpolate",
                      ["linear"],
                      ["heatmap-density"],
                      0,
                      withAlpha(colors.news, 0),
                      0.08,
                      withAlpha(colors.news, 0.3),
                      0.4,
                      withAlpha(colors.news, 0.55),
                      1,
                      withAlpha(colors.news, 0.8),
                    ],
                    "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], NEWS_POINTS_ZOOM, 1, NEWS_POINTS_ZOOM + 1.5, 0],
                  }}
                />
                <Layer
                  id="news-points"
                  type="circle"
                  minzoom={NEWS_POINTS_ZOOM}
                  paint={{
                    "circle-color": colors.news,
                    "circle-radius": 5,
                    "circle-opacity": ["interpolate", ["linear"], ["zoom"], NEWS_POINTS_ZOOM, 0, NEWS_POINTS_ZOOM + 1, 0.85],
                    "circle-stroke-color": colors.surface,
                    "circle-stroke-width": 1.5,
                  }}
                />
              </Source>
              <Source id="events" type="geojson" data={hazardGeo}>
                <Layer
                  id="events"
                  type="circle"
                  layout={{
                    // Alerts and strong quakes draw on top of the weak ones they would otherwise hide under.
                    "circle-sort-key": ["+", ["match", ["get", "level"], "red", 100, "orange", 50, 0], ["case", ["==", ["get", "group"], "quake"], ["get", "sev"], 0]],
                  }}
                  paint={{
                    "circle-color": ["match", ["get", "group"], "quake", colors.quake, colors.hazard],
                    "circle-radius": [
                      "case",
                      ["==", ["get", "group"], "quake"],
                      ["interpolate", ["linear"], ["get", "sev"], 4.5, 4, 6, 7, 8, 13],
                      ["==", ["get", "level"], "red"],
                      9,
                      ["==", ["get", "level"], "orange"],
                      7,
                      5,
                    ],
                    "circle-opacity": 0.85,
                    // Alert level rides on the ring, in the reserved status colors.
                    "circle-stroke-color": ["match", ["get", "level"], "red", colors.critical, "orange", colors.serious, colors.surface],
                    "circle-stroke-width": ["match", ["get", "level"], "red", 2.5, "orange", 2.5, 1.5],
                  }}
                />
              </Source>
              {popup && (
                <Popup longitude={popup.lng} latitude={popup.lat} closeButton={false} closeOnClick={false} offset={10} maxWidth="280px">
                  <div className="text-xs text-[#0b0b0b]">
                    <div className="font-semibold">{popup.title}</div>
                    <div className="text-[#52514e]">{fmt.format(popup.ts)}</div>
                  </div>
                </Popup>
              )}
            </Map>
          </div>
        )}

        {!showList && alerts.length > 0 && (
          <aside className="flex shrink-0 flex-col gap-1 lg:w-[280px]">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold text-ink-2">{labels.alerts}</h3>
              <button type="button" onClick={showWorld} className="text-[11px] text-muted hover:text-ink hover:underline">
                {labels.world}
              </button>
            </div>
            <p className="text-[11px] text-muted">{labels.alertsHint}</p>
            <ul className="scroll-thin flex flex-col overflow-auto lg:max-h-[400px] xl:max-h-[480px]">
              {alerts.map((e) => (
                <li key={e.id} className="border-t border-line first:border-t-0">
                  <button
                    type="button"
                    aria-pressed={selected?.id === e.id}
                    onClick={() => flyTo(e)}
                    className={clsx("flex w-full items-start gap-2 rounded-md px-1.5 py-2 text-left hover:bg-surface-2", selected?.id === e.id && "bg-surface-2")}
                  >
                    <span
                      aria-hidden
                      className={clsx(
                        "mt-1 inline-block size-2.5 shrink-0 rounded-full",
                        e.level === "red" ? "ring-2 ring-critical" : e.level === "orange" ? "ring-2 ring-serious" : "",
                      )}
                      style={{ background: `var(${GROUP_COLOR[e.group]})` }}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="line-clamp-2 text-xs leading-snug text-ink">{e.title}</span>
                      <span className="flex flex-wrap gap-x-2 text-[11px] text-muted">
                        {(e.level === "red" || e.level === "orange") && <span className="font-medium text-ink-2">{labels.levels[e.level]}</span>}
                        <span className="tabular">{fmt.format(e.ts)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
