"use client";

import { useSyncExternalStore } from "react";

// The theme lives on <html data-theme>, stamped before paint by the layout's
// inline script and switched by ThemeToggle. Components subscribe to it here.

export const THEMES = ["light", "dark", "anthropic"] as const;
export type ThemeName = (typeof THEMES)[number];

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

const read = (): ThemeName => {
  const t = document.documentElement.dataset.theme;
  return (THEMES as readonly string[]).includes(t ?? "") ? (t as ThemeName) : "light";
};

export function useThemeName(): ThemeName {
  return useSyncExternalStore(subscribe, read, () => "light");
}

/** Light or dark: what mode-specific assets (basemaps) follow. Anthropic is a light theme. */
export function useTheme(): "light" | "dark" {
  return useThemeName() === "dark" ? "dark" : "light";
}
