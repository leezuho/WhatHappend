"use client";

import { useState } from "react";
import clsx from "clsx";

/**
 * Article photo loaded by the browser straight from the outlet. Not next/image: its optimizer would
 * make the web server fetch remote URLs, and the web never calls outside services.
 * Decorative (the headline next to it is the text), so alt is empty; a broken image just disappears.
 */
export function Thumb({ src, className }: { src: string | null | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed || !src.startsWith("https://")) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={clsx("shrink-0 rounded-md bg-surface-2 object-cover", className)}
    />
  );
}
