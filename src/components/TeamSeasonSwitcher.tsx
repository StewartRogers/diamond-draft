"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";
import {
  useDiamondDraftStore,
  selectActiveTeam,
  selectActiveSeason,
  selectSeasonsByActiveTeam,
} from "@/lib/store";

/**
 * Compact Team ▸ Season picker for the nav. Switches the app-wide active
 * context that the roster, games, and stats pages follow. Creating and editing
 * teams/seasons lives in Settings — this is switch-only.
 */
export default function TeamSeasonSwitcher({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const teams = useDiamondDraftStore((s) => s.teams);
  const activeTeam = useDiamondDraftStore(selectActiveTeam);
  const activeSeason = useDiamondDraftStore(selectActiveSeason);
  const seasons = useDiamondDraftStore(useShallow(selectSeasonsByActiveTeam));
  const setActiveTeam = useDiamondDraftStore((s) => s.setActiveTeam);
  const setActiveSeason = useDiamondDraftStore((s) => s.setActiveSeason);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const label = activeTeam?.name ?? "No team";
  const sub = activeSeason?.name ?? "No season";

  return (
    <div ref={ref} style={{ position: "relative", ...(variant === "mobile" ? { width: "100%" } : {}) }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: variant === "mobile" ? "12px 20px" : "5px 12px",
          borderRadius: 9, border: "1px solid #e7e4dc", background: "#fff",
          cursor: "pointer", fontFamily: "inherit", width: variant === "mobile" ? "100%" : undefined,
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#211f1b" }}>{label}</span>
          <span style={{ fontSize: 11, color: "#8a857a" }}>{sub}</span>
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#8a857a" strokeWidth="1.6" style={{ marginLeft: "auto" }}>
          <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: variant === "mobile" ? "static" : "absolute",
            left: 0, top: 46, marginTop: variant === "mobile" ? 8 : 0,
            background: "#fff", borderRadius: 10, border: "1.5px solid #e7e4dc",
            boxShadow: variant === "mobile" ? "none" : "0 8px 24px rgba(0,0,0,.12)",
            minWidth: 260, padding: "8px 0", zIndex: 30,
          }}
        >
          {teams.length === 0 && (
            <div style={{ padding: "4px 16px 8px", fontSize: 12, color: "#9c9688" }}>
              No teams yet.
            </div>
          )}
          {teams.length > 0 && <Section title="Teams" />}
          {teams.map((t) => (
            <Row
              key={t.id}
              label={t.name}
              active={t.id === activeTeam?.id}
              onClick={async () => { await setActiveTeam(t.id); setOpen(false); }}
            />
          ))}

          {activeTeam && (
            <>
              <div style={{ height: 1, background: "#e7e4dc", margin: "6px 0" }} />
              <Section title={`Seasons · ${activeTeam.name}`} />
              {seasons.length === 0 && (
                <div style={{ padding: "4px 16px 8px", fontSize: 12, color: "#9c9688" }}>
                  No seasons yet.
                </div>
              )}
              {seasons.map((s) => (
                <Row
                  key={s.id}
                  label={s.name}
                  sub={`${s.year} · ${s.roster.length} player${s.roster.length === 1 ? "" : "s"}`}
                  active={s.id === activeSeason?.id}
                  onClick={async () => { await setActiveSeason(s.id); setOpen(false); }}
                />
              ))}
            </>
          )}

          <div style={{ height: 1, background: "#e7e4dc", margin: "6px 0" }} />
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
              fontSize: 12.5, fontWeight: 600, color: "#3f6212", textDecoration: "none",
            }}
          >
            Manage teams &amp; seasons
            <span aria-hidden style={{ opacity: 0.7 }}>→</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div style={{ padding: "4px 16px 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#9c9688" }}>
      {title}
    </div>
  );
}

function Row({ label, sub, active, onClick }: { label: string; sub?: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 1, width: "100%",
        padding: "8px 16px", border: "none", background: active ? "#eef1e3" : "none",
        textAlign: "left", cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 600, color: active ? "#3f6212" : "#3d3b36" }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: "#9c9688" }}>{sub}</span>}
    </button>
  );
}
