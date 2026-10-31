"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BriefRefresh({ label, requestedLabel, pending }: { label: string; requestedLabel: string; pending: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(pending);
  if (busy) return <span className="text-[11px] text-muted">{requestedLabel}</span>;
  return (
    <button
      type="button"
      className="rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-2 hover:bg-surface-2"
      onClick={async () => {
        setBusy(true);
        await fetch("/api/brief", { method: "POST" });
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
