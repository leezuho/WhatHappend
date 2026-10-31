"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";

/** Client-side tabs over server-rendered panes. */
export function Tabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div role="tablist" className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={clsx(
              "-mb-px border-b-2 px-2 pb-1.5 text-xs",
              active === t.key ? "border-accent font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
