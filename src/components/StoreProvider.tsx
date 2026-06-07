"use client";

import { useEffect } from "react";
import { useDiamondDraftStore } from "@/lib/store";

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const loadAll = useDiamondDraftStore((s) => s.loadAll);
  const status = useDiamondDraftStore((s) => s.status);

  useEffect(() => {
    if (status === "idle") loadAll();
  }, [status, loadAll]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <p className="text-slate-400 text-sm tracking-wide">Loading Diamond Draft…</p>
      </div>
    );
  }

  return <>{children}</>;
}
