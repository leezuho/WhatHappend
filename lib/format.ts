import { intlLocale, type Locale } from "@/lib/i18n";
import type { Freq, SeriesDef } from "@/config/series";
import type { TileData } from "@/lib/data/series";

// Pure formatting helpers, safe on server and client.

export function fmtNumber(value: number, locale: Locale, digits = 2): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** 1,284 · 12.9K · 4.2M — for big standalone values. */
export function fmtCompact(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function fmtSigned(value: number, locale: Locale, digits = 2, suffix = ""): string {
  const s = fmtNumber(Math.abs(value), locale, digits);
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${s}${suffix}`;
}

export function fmtPct(value: number, locale: Locale, digits = 2): string {
  return fmtSigned(value, locale, digits, "%");
}

/** Axis tick in %: no plus sign, a true minus, plain 0. */
export function fmtAxisPct(value: number, locale: Locale, digits = 0): string {
  return value < 0 ? `−${fmtNumber(-value, locale, digits)}%` : `${fmtNumber(value, locale, digits)}%`;
}

export function fmtTime(ts: number, locale: Locale, timeZone = "Asia/Ho_Chi_Minh"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(ts);
}

export function fmtDate(ts: number, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Asia/Ho_Chi_Minh", ...opts }).format(ts);
}

export function fmtDateTime(ts: number, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(ts);
}

export function fmtRelative(ts: number, now: number, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const diff = ts - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

/** A series value with its unit, e.g. $113.43, 4.93%, 194K. */
export function fmtValue(def: SeriesDef, value: number, locale: Locale): string {
  const n = fmtNumber(value, locale, def.digits);
  switch (def.unit) {
    case "$":
      return `$${n}`;
    case "%":
      return `${n}%`;
    case "pp":
      return `${value > 0 ? "+" : ""}${n}`;
    case "bp":
      return fmtSigned(value, locale, def.digits, " bp");
    case "₫":
      return `${n} ₫`;
    case "K":
      return `${fmtNumber(value / 1000, locale, 0)}K`;
    case "$T":
      // FRED reports the Fed balance sheet in millions of dollars.
      return `$${fmtNumber(value / 1_000_000, locale, def.digits)}T`;
    case "$B":
      // Compact in the reader's language: $2.59T / $2,59 NT, so it matches fmtCompact elsewhere on the page.
      return `$${new Intl.NumberFormat(intlLocale(locale), { notation: "compact", maximumSignificantDigits: 3 }).format(value * 1e9)}`;
    default:
      return n;
  }
}

/** Signed delta text: percent for prices, basis points for yields and spreads. */
export function fmtDelta(def: SeriesDef, d: TileData, locale: Locale): string | null {
  if (def.delta === "abs") {
    if (d.change === null) return null;
    if (def.deltaUnit === "pp") return fmtSigned(d.change, locale, 2, " pp");
    if (def.unit === "%" || def.unit === "pp") return fmtSigned(d.change * 100, locale, 0, " bp");
    if (def.unit === "K") return fmtSigned(d.change / 1000, locale, 0, "K");
    if (def.unit === "bp") return fmtSigned(d.change, locale, 0, " bp");
    return fmtSigned(d.change, locale, def.digits);
  }
  return d.changePct === null ? null : fmtPct(d.changePct, locale);
}

/**
 * The period a low-frequency reading covers: "T9/2026" / "Sep 2026", "Q2/2026",
 * "2026", or the week's date. `compact` shortens the year for table cells.
 * Points are stamped at the period's first day, midnight UTC.
 */
export function fmtPeriod(ts: number, freq: Freq, locale: Locale, compact = false): string {
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const yy = compact ? String(year).slice(2) : String(year);
  switch (freq) {
    case "y":
      return String(year);
    case "q": {
      const q = Math.floor(d.getUTCMonth() / 3) + 1;
      return locale === "vi" ? `Q${q}/${yy}` : compact ? `Q${q} '${yy}` : `Q${q} ${year}`;
    }
    case "m": {
      if (locale === "vi") return `T${d.getUTCMonth() + 1}/${yy}`;
      const mon = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d);
      return compact ? `${mon} '${yy}` : `${mon} ${year}`;
    }
    case "w":
      return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  }
}
