"use client";

import { useMemo } from "react";
import { useDiamondDraftStore } from "@/lib/store";
import type { Game, Player, PlayerGameOverride } from "@/lib/types";
import { fmtName } from "./shared";

export function AvailabilityPanel({ game, players }: { game: Game; players: Player[] }) {
  const setPlayerOverride = useDiamondDraftStore((s) => s.setPlayerOverride);
  const removePlayerOverride = useDiamondDraftStore((s) => s.removePlayerOverride);

  const numInnings = game.innings.length;
  const overrideMap = useMemo(
    () => new Map(game.playerOverrides.map((o) => [o.playerId, o])),
    [game.playerOverrides]
  );

  function handleStatusChange(playerId: string, value: string, currentOverride?: PlayerGameOverride) {
    if (value === "active") {
      removePlayerOverride(game.id, playerId).catch(console.error);
    } else {
      setPlayerOverride(game.id, {
        playerId,
        status: value as PlayerGameOverride["status"],
        inning: currentOverride?.inning,
      }).catch(console.error);
    }
  }

  function handleOverrideInning(playerId: string, status: PlayerGameOverride["status"], inningVal: number) {
    setPlayerOverride(game.id, { playerId, status, inning: inningVal }).catch(console.error);
  }

  return (
    <div style={{ marginTop: 16, background: "#fff", border: "1px solid #e7e4dc", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(40,35,25,.06)" }}>
      <div style={{ padding: "14px 22px", borderBottom: "1px solid #e7e4dc", display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.01em", color: "#211f1b" }}>Player Availability</span>
        <span style={{ fontSize: 12.5, color: "#a09a8e" }}>Mark who is absent, arriving late, or leaving early</span>
      </div>
      <div style={{ padding: "14px 22px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px 20px" }}>
        {players.map((p) => {
          const ov = overrideMap.get(p.id);
          const status = ov?.status ?? "active";
          const isFinalized = game.status === "finalized";
          const statusColor: Record<string, { fg: string; bg: string; bd: string }> = {
            active:      { fg: "#3f6212", bg: "#eef1e3", bd: "#dbe3c6" },
            absent:      { fg: "#9a3412", bg: "#f6e7df", bd: "#eccfc0" },
            late:        { fg: "#a16207", bg: "#f8f0db", bd: "#ecdcb6" },
            earlyLeave:  { fg: "#a16207", bg: "#f8f0db", bd: "#ecdcb6" },
          };
          const c = statusColor[status];
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 10, background: status !== "active" ? c.bg : "#faf8f3", border: `1px solid ${status !== "active" ? c.bd : "#eeece5"}` }}>
              <span style={{ fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 11.5, fontWeight: 600, minWidth: 26, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "#eef0e6", color: "#3f6212" }}>
                {p.jerseyNumber}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, flex: 1, color: "#211f1b" }}>
                {fmtName(p)}
              </span>
              <select
                value={status}
                disabled={isFinalized}
                onChange={(e) => handleStatusChange(p.id, e.target.value, ov)}
                style={{ fontSize: 12, fontWeight: 600, color: c.fg, background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 7, padding: "3px 7px", cursor: isFinalized ? "default" : "pointer", fontFamily: "inherit" }}
              >
                <option value="active">Active</option>
                <option value="absent">Absent</option>
                <option value="late">Late arrival</option>
                <option value="earlyLeave">Early departure</option>
              </select>
              {(status === "late" || status === "earlyLeave") && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, color: "#a09a8e" }}>{status === "late" ? "from inn" : "thru inn"}</span>
                  <input
                    type="number"
                    min={1}
                    max={numInnings}
                    value={ov?.inning ?? ""}
                    disabled={isFinalized}
                    onChange={(e) => handleOverrideInning(p.id, status as PlayerGameOverride["status"], Number(e.target.value))}
                    style={{ width: 42, fontSize: 13, fontWeight: 600, textAlign: "center", borderRadius: 6, border: `1px solid ${c.bd}`, background: "#fff", color: c.fg, padding: "2px 4px", fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace" }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
