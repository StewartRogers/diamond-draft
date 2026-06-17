"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDiamondDraftStore } from "@/lib/store";

const AUTH_PAGES = ["/login", "/setup"];

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const loadAll = useDiamondDraftStore((s) => s.loadAll);
  const status = useDiamondDraftStore((s) => s.status);
  const pathname = usePathname();
  const router = useRouter();

  const isAuthPage = AUTH_PAGES.includes(pathname);

  useEffect(() => {
    if (isAuthPage) return;
    if (status === "idle") {
      let cancelled = false;
      loadAll().catch((err: Error) => {
        if (cancelled) return;
        if (err?.message?.includes("401")) {
          router.replace("/login");
        }
      });
      return () => { cancelled = true; };
    }
  }, [status, loadAll, isAuthPage, router]);

  if (isAuthPage) return <>{children}</>;

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
