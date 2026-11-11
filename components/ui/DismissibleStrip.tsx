"use client";

import { useState, type ReactNode } from "react";

/**
 * A notice strip with a close button. Closing stores `value` in the cookie `name`
 * so the server stops rendering the strip (no flash on reload, and AutoRefresh does
 * not bring it back). The caller derives `value` from what the strip reports, so a
 * different situation shows again; it should also pass `key={value}` so a new
 * notice remounts instead of inheriting the closed state.
 */
export function DismissibleStrip({ name, value, label, children }: { name: string; value: string; label: string; children: ReactNode }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <div role="status" className="border-t border-line bg-warning/10">
      <div className="mx-auto flex max-w-[1600px] items-start gap-2 px-4 py-1.5 text-xs text-ink-2">
        {children}
        <button
          type="button"
          onClick={() => {
            document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=2592000; samesite=lax`;
            setClosed(true);
          }}
          aria-label={label}
          title={label}
          className="-my-0.5 ml-auto grid size-5 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
