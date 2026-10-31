"use client";

import { useMemo, useState } from "react";
import Map, { Layer, Popup, Source, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// See scripts/copy-maplibre-worker.mjs.
if (typeof window !== "undefined") setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
import clsx from "clsx";
import { useTheme } from "@/lib/use-theme";

export interface MapEvent {
  id: string;
  group: "quake" | "hazard" | "news";
  title: string;
  lat: number;
  lng: number;
  severity: number | null;
  level: string | null;
  url: string | null;
  ts: number;
}

// Maps are an all-pairs color context: at most three categorical slots.
const GROUP_COLOR: Record<MapEvent["group"], string> = { quake: "--s1", hazard: "--s2", news: "--s3" };

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

function cssVar(name: string): string {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export function MapView({
  events,
  labels,
  locale,
}: {
  events: MapEvent[];
  labels: { groups: Record<MapEvent["group"], string>; alert: string; list: string; map: string };
  locale: "vi" | "en";
}) {
  const theme = useTheme();
  const [hidden, setHidden] = useState<Set<MapEvent["group"]>>(new Set());
  const [hover, setHover] = useState<MapEvent | null>(null);
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
  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: visible.map((e) => ({
        type: "Feature" as const,
        id: e.id,
        properties: { id: e.id, group: e.group, sev: e.severity ?? 0, level: e.level ?? "" },
        geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] },
      })),
    }),
    [visible],
  );
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

      {showList ? (
        <ul className="scroll-thin h-[340px] overflow-auto text-xs xl:h-0 xl:min-h-[240px] xl:flex-1">
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
        <div className="h-[340px] overflow-hidden rounded-lg xl:h-0 xl:min-h-[240px] xl:flex-1">
          <Map
            initialViewState={{ longitude: 40, latitude: 20, zoom: 0.9 }}
            mapStyle={STYLE[theme]}
            style={{ width: "100%", height: "100%" }}
            interactiveLayerIds={["events"]}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            onClick={(ev) => {
              const e = ev.features?.[0] && byId.get(String(ev.features[0].properties?.id));
              if (e?.url) window.open(e.url, "_blank", "noopener");
            }}
            cursor={hover ? "pointer" : "grab"}
            attributionControl={{ compact: true }}
            renderWorldCopies={false}
          >
            <Source id="events" type="geojson" data={geojson}>
              <Layer
                id="events"
                type="circle"
                paint={{
                  "circle-color": ["match", ["get", "group"], "quake", colors.quake, "hazard", colors.hazard, colors.news],
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
            {hover && (
              <Popup longitude={hover.lng} latitude={hover.lat} closeButton={false} closeOnClick={false} offset={10} maxWidth="280px">
                <div className="text-xs text-[#0b0b0b]">
                  <div className="font-semibold">{hover.title}</div>
                  <div className="text-[#52514e]">{fmt.format(hover.ts)}</div>
                </div>
              </Popup>
            )}
          </Map>
        </div>
      )}
    </div>
  );
}
