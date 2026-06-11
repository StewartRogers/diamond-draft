"use client";

import { useEffect } from "react";
import { useDiamondDraftStore } from "@/lib/store";

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const loadAll = useDiamondDraftStore((s) => s.loadAll);
  const status = useDiamondDraftStore((s) => s.status);

  useEffect(() => {
    if (status === "idle") loadAll();
  }, [status, loadAll]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 min-h-screen bg-slate-950">
        <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-sky-400 animate-spin" />
        <p className="text-slate-400 text-sm tracking-wide">Loading Diamond Draft…</p>
      </div>
    );
  }

  return <>{children}</>;
}
