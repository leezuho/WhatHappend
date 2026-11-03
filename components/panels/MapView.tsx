"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Map, { Layer, Marker, NavigationControl, Popup, Source, type LngLatBoundsLike, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl, type ExpressionSpecification, type Map as MaplibreMap } from "maplibre-gl";
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

/** Inhabited latitudes, fitted to whatever size the panel is (flat map). */
const WORLD: LngLatBoundsLike = [
  [-170, -50],
  [180, 72],
];
/** The globe opens over Southeast Asia. */
const HOME = { lng: 105, lat: 14 };
/** Below this zoom the news hotspots are soft lights; above it they are dots you can hover. */
const NEWS_POINTS_ZOOM = 3.5;
/** Place labels (cities, seas, roads) only show from here; country names show at every zoom. */
const LABEL_MIN_ZOOM = 3;
const ALERT_LIST_MAX = 6;
/** Idle spin of the globe, and how long it waits after the pointer leaves before resuming. */
const SPIN_DEG_PER_SEC = 2;
const SPIN_RESUME_MS = 3000;
const HOUR = 3600_000;

type Projection = "globe" | "mercator";

// The projection choice is a per-viewer convenience, kept in localStorage.
const PROJ_KEY = "map-projection";
const projListeners = new Set<() => void>();
function readProjection(): Projection {
  try {
    return localStorage.getItem(PROJ_KEY) === "mercator" ? "mercator" : "globe";
  } catch {
    return "globe";
  }
}
function writeProjection(p: Projection) {
  try {
    localStorage.setItem(PROJ_KEY, p);
  } catch {
    /* private mode: the choice just doesn't stick */
  }
  projListeners.forEach((f) => f());
}
function subscribeProjection(f: () => void) {
  projListeners.add(f);
  return () => void projListeners.delete(f);
}

function cssVar(name: string): string {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function rgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

/** The same hue, stepped toward white (t > 0) or black (t < 0): the hot core of the density glow. */
function step(hex: string, t: number, a: number): string {
  const c = rgb(hex);
  if (!c) return hex;
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const [r, g, b] = c.map((v) => Math.round(v + (to - v) * k));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const alertRank = (e: MapEvent) => (e.level === "red" ? 0 : e.level === "orange" ? 1 : 2);

/** Orange/red alerts first, then quakes of magnitude 6+ (strongest first); GDELT hotspots are too noisy to rank. */
function topAlerts(events: MapEvent[], n = ALERT_LIST_MAX): MapEvent[] {
  return events
    .filter((e) => e.group !== "news" && (e.level === "red" || e.level === "orange" || (e.group === "quake" && (e.severity ?? 0) >= 6)))
    .sort((a, b) => alertRank(a) - alertRank(b) || (b.severity ?? 0) - (a.severity ?? 0) || b.ts - a.ts)
    .slice(0, n);
}

/** `age` is hours before the newest event, so the fade needs no clock. */
const toGeo = (list: MapEvent[], newest: number) => ({
  type: "FeatureCollection" as const,
  features: list.map((e) => ({
    type: "Feature" as const,
    id: e.id,
    properties: { id: e.id, group: e.group, sev: e.severity ?? 0, level: e.level ?? "", age: (newest - e.ts) / HOUR },
    geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] },
  })),
});

/** Zoom at which the globe fills ~90% of the shorter side of the panel (0.52 is measured, not derived). */
function globeZoom(el: HTMLElement | null): number {
  const side = el ? Math.min(el.clientWidth, el.clientHeight) : 480;
  const radius = side * 0.52;
  return Math.max(0.5, Math.log2((2 * Math.PI * radius) / 512 / Math.cos((HOME.lat * Math.PI) / 180)));
}

/** One language per label instead of "Latin\nnative", and only country names at world scale. */
function tuneLabels(map: MaplibreMap, locale: "vi" | "en") {
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

/**
 * setProjection throws while a style is loading (the first load, or a theme switch in flight), so it is
 * applied here rather than through react-map-gl's `projection` prop, which calls it the moment the prop
 * changes. Returns false when the style is not ready; the caller retries on "style.load".
 */
function trySetProjection(map: MaplibreMap, p: Projection): boolean {
  try {
    if (map.getProjection()?.type !== p) map.setProjection({ type: p });
    return true;
  } catch (err) {
    if (err instanceof Error && /not done loading/i.test(err.message)) return false;
    throw err;
  }
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    globe: string;
    flat: string;
    fade: string;
    pulse: string;
    levels: { red: string; orange: string };
  };
  locale: "vi" | "en";
}) {
  const theme = useTheme();
  const projection = useSyncExternalStore(subscribeProjection, readProjection, () => "globe" as const);
  const mapRef = useRef<MapRef>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<Set<MapEvent["group"]>>(new Set());
  const [hover, setHover] = useState<MapEvent | null>(null);
  const [selected, setSelected] = useState<MapEvent | null>(null);
  const [showList, setShowList] = useState(false);
  // Read by the spin loop without restarting it.
  const pointerIn = useRef(false);
  const lastTouch = useRef(0);
  const selectedRef = useRef<MapEvent | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

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
  const newest = useMemo(() => events.reduce((m, e) => Math.max(m, e.ts), 0), [events]);
  const newsGeo = useMemo(() => toGeo(visible.filter((e) => e.group === "news"), newest), [visible, newest]);
  const hazardGeo = useMemo(() => toGeo(visible.filter((e) => e.group !== "news"), newest), [visible, newest]);
  const alerts = useMemo(() => topAlerts(visible), [visible]);
  const byId = useMemo(() => new globalThis.Map(events.map((e) => [e.id, e])), [events]);
  const fmt = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

  const counts = useMemo(() => {
    const c = { quake: 0, hazard: 0, news: 0 };
    for (const e of events) c[e.group]++;
    return c;
  }, [events]);

  // Idle spin: only on the globe, only while nobody is looking at it closely
  // (pointer inside, an event selected, zoomed in), and only while on screen.
  useEffect(() => {
    if (projection !== "globe" || showList || reducedMotion()) return;
    let raf = 0;
    let last = 0;
    let onScreen = true;
    const io = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting));
    if (boxRef.current) io.observe(boxRef.current);
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(t - last, 64) : 0;
      last = t;
      const map = mapRef.current;
      if (!map || !onScreen || document.hidden || pointerIn.current || selectedRef.current) return;
      if (performance.now() - lastTouch.current < SPIN_RESUME_MS || map.isMoving() || map.getZoom() > 3) return;
      const c = map.getCenter();
      // Like the real Earth seen from space: the surface slides west → east, so the center longitude falls.
      map.jumpTo({ center: [c.lng - (dt / 1000) * SPIN_DEG_PER_SEC, c.lat] });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [projection, showList]);

  const onMove = (ev: MapLayerMouseEvent) => {
    const f = ev.features?.[0];
    setHover(f ? (byId.get(String(f.properties?.id)) ?? null) : null);
  };

  const frame = (p: Projection, animate: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const duration = animate && !reducedMotion() ? 1000 : 0;
    if (p === "globe") map.flyTo({ center: [selectedRef.current?.lng ?? map.getCenter().lng, HOME.lat], zoom: globeZoom(boxRef.current), duration, essential: true });
    else map.fitBounds(WORLD, { padding: 8, duration });
  };

  const flyTo = (e: MapEvent) => {
    setSelected(e);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [e.lng, e.lat], zoom: Math.max(map.getZoom(), 4.5), duration: reducedMotion() ? 0 : 1600, essential: true });
  };
  const showWorld = () => {
    setSelected(null);
    selectedRef.current = null;
    frame(projection, true);
  };
  const switchProjection = (p: Projection) => {
    if (p === projection) return;
    writeProjection(p);
    setSelected(null);
    selectedRef.current = null;
  };
  // Apply and re-frame after the projection changed: a click on the toggle, or a stored "flat" winning over
  // the server's "globe" right after hydration, when the first style may still be loading.
  const projectionRef = useRef(projection);
  const framedFor = useRef<Projection | null>(null);
  useEffect(() => {
    projectionRef.current = projection;
    const map = mapRef.current?.getMap();
    // Before the map has loaded, onLoad applies and frames it.
    if (!map || framedFor.current === null || framedFor.current === projection) return;
    framedFor.current = projection;
    if (trySetProjection(map, projection)) frame(projection, true);
    else
      map.once("style.load", () => {
        trySetProjection(map, projectionRef.current);
        frame(projectionRef.current, false);
      });
  }, [projection]);

  const popup = hover ?? selected;
  const ringOf = (e: MapEvent) => (e.level === "red" ? "var(--critical)" : e.level === "orange" ? "var(--serious)" : `var(${GROUP_COLOR[e.group]})`);

  // Newer events are solid, older ones fade; alerts never fade.
  const ageOpacity: ExpressionSpecification = [
    "case",
    ["any", ["==", ["get", "level"], "red"], ["==", ["get", "level"], "orange"]],
    0.95,
    ["interpolate", ["linear"], ["get", "age"], 0, 0.95, 24, 0.85, 7 * 24, 0.5, 14 * 24, 0.3],
  ];

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
        <span className="flex items-center gap-1.5 text-ink-2" title={labels.pulse}>
          <span aria-hidden className="inline-block size-2.5 rounded-full border-2 border-critical" />
          {labels.alert}
        </span>
        <span className="hidden text-[11px] text-muted md:inline">· {labels.fade}</span>
        <div className="ml-auto flex items-center gap-2">
          {!showList && (
            <div className="flex rounded-md border border-line p-0.5 text-[11px]" role="group">
              {(["globe", "mercator"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={projection === p}
                  onClick={() => switchProjection(p)}
                  className={clsx("rounded px-1.5 py-px", projection === p ? "bg-accent text-on-accent" : "text-muted hover:text-ink")}
                >
                  {p === "globe" ? labels.globe : labels.flat}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setShowList((s) => !s)} className="text-[11px] text-muted hover:text-ink hover:underline">
            {showList ? labels.map : labels.list}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        {showList ? (
          <ul className="scroll-thin h-[360px] min-w-0 overflow-auto text-xs md:h-[440px] lg:flex-1 xl:h-[520px]">
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
          // Not flex-1 below lg: in a column, flex-basis 0 would override the height and collapse the map.
          <div
            ref={boxRef}
            className={clsx("wh-map h-[360px] min-w-0 overflow-hidden rounded-lg md:h-[440px] lg:flex-1 xl:h-[520px]", projection === "globe" && "wh-space")}
            onPointerEnter={() => (pointerIn.current = true)}
            onPointerLeave={() => {
              pointerIn.current = false;
              lastTouch.current = performance.now();
            }}
          >
            <Map
              ref={mapRef}
              initialViewState={projection === "globe" ? { longitude: HOME.lng, latitude: HOME.lat, zoom: 1.3 } : { bounds: WORLD, fitBoundsOptions: { padding: 8 } }}
              sky={{ "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 1, 6, 0] }}
              mapStyle={STYLE[theme]}
              styleDiffing={false}
              style={{ width: "100%", height: "100%" }}
              interactiveLayerIds={["events", "news-points"]}
              onLoad={(ev) => {
                const map = ev.target;
                const restyle = () => {
                  tuneLabels(map, locale);
                  trySetProjection(map, projectionRef.current);
                };
                restyle();
                // A theme switch reloads the whole style (styleDiffing off), which resets labels and projection.
                map.on("style.load", restyle);
                framedFor.current = projectionRef.current;
                frame(projectionRef.current, false);
              }}
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
              onClick={(ev) => {
                const e = ev.features?.[0] && byId.get(String(ev.features[0].properties?.id));
                if (e?.url) window.open(e.url, "_blank", "noopener");
                else setSelected(null);
              }}
              cursor={hover ? "pointer" : "grab"}
              attributionControl={{ compact: true }}
              // Off on the flat map only: at construction it also clamps the globe's opening center to one world width.
              renderWorldCopies={projection === "globe"}
            >
              <NavigationControl position="top-left" showCompass={false} />
              <Source id="news" type="geojson" data={newsGeo}>
                {/* Hotspots as soft lights: a blurred halo sized by article count, and a small core in a
                    lighter (dark mode) or deeper (light mode) step of the same hue. Overlaps brighten, so
                    density still reads as magnitude. (A heatmap layer squares off strong points on the globe.) */}
                <Layer
                  id="news-glow"
                  type="circle"
                  maxzoom={NEWS_POINTS_ZOOM + 1.5}
                  paint={{
                    "circle-color": colors.news,
                    "circle-radius": [
                      "interpolate",
                      ["linear"],
                      ["zoom"],
                      0,
                      ["interpolate", ["linear"], ["get", "sev"], 1, 8, 40, 20],
                      NEWS_POINTS_ZOOM + 1,
                      ["interpolate", ["linear"], ["get", "sev"], 1, 20, 40, 44],
                    ],
                    "circle-blur": 1,
                    "circle-opacity": ["interpolate", ["linear"], ["zoom"], NEWS_POINTS_ZOOM, theme === "dark" ? 0.6 : 0.5, NEWS_POINTS_ZOOM + 1.5, 0],
                    "circle-pitch-alignment": "map",
                  }}
                />
                <Layer
                  id="news-core"
                  type="circle"
                  maxzoom={NEWS_POINTS_ZOOM + 1}
                  paint={{
                    "circle-color": step(colors.news, theme === "dark" ? 0.5 : -0.3, 1),
                    "circle-radius": ["interpolate", ["linear"], ["get", "sev"], 1, 1.2, 40, 2.5],
                    "circle-opacity": ["interpolate", ["linear"], ["zoom"], NEWS_POINTS_ZOOM, 0.8, NEWS_POINTS_ZOOM + 1, 0],
                    "circle-pitch-alignment": "map",
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
                    "circle-opacity": ageOpacity,
                    "circle-stroke-opacity": ageOpacity,
                    // Alert level rides on the ring, in the reserved status colors.
                    "circle-stroke-color": ["match", ["get", "level"], "red", colors.critical, "orange", colors.serious, colors.surface],
                    "circle-stroke-width": ["match", ["get", "level"], "red", 2.5, "orange", 2.5, 1.5],
                  }}
                />
              </Source>
              {/* The few events worth a glance pulse; hidden on the far side of the globe. */}
              {alerts.map((e) => (
                <Marker key={e.id} longitude={e.lng} latitude={e.lat} anchor="center" opacityWhenCovered={0} style={{ pointerEvents: "none" }}>
                  <span aria-hidden className={clsx("map-pulse", selected?.id === e.id && "is-selected")} style={{ ["--pulse" as string]: ringOf(e) }} />
                </Marker>
              ))}
              {popup && (
                <Popup longitude={popup.lng} latitude={popup.lat} closeButton={false} closeOnClick={false} offset={12} maxWidth="280px">
                  <div className="flex items-start gap-2 text-xs">
                    <span
                      aria-hidden
                      className="mt-1 inline-block size-2 shrink-0 rounded-full"
                      style={{ background: `var(${GROUP_COLOR[popup.group]})` }}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink">{popup.title}</div>
                      <div className="flex flex-wrap gap-x-2 text-muted">
                        {(popup.level === "red" || popup.level === "orange") && <span className="font-medium text-ink-2">{labels.levels[popup.level]}</span>}
                        <span className="tabular">{fmt.format(popup.ts)}</span>
                      </div>
                    </div>
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
