"use client";

import { useMemo, useState } from "react";
import { useDiamondDraftStore } from "@/lib/store";
import type { Game, Player } from "@/lib/types";

export function PitchCatchPanel({
  game, batting, scratchedIds, byId,
}: {
  game: Game;
  batting: string[];
  scratchedIds: string[];
  byId: Record<string, Player>;
}) {
  const setPitchCatchAssignment = useDiamondDraftStore((s) => s.setPitchCatchAssignment);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  const pitchCatchMap = useMemo(
    () => new Map((game.pitchCatchAssignments ?? []).map((a) => [a.inning, a])),
    [game.pitchCatchAssignments]
  );

  const handleAiPlan = async () => {
    if (!aiPrompt.trim()) return;
    setAiPlanning(true);
    setAiStatus(null);
    try {
      const res = await fetch("/api/ai/pitch-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, prompt: aiPrompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        assignments: Array<{ inning: number; pitcherId: string | null; catcherId: string | null }>;
        notes: string[];
      };
      for (const entry of data.assignments) {
        await setPitchCatchAssignment(game.id, entry.inning, "P", entry.pitcherId);
        await setPitchCatchAssignment(game.id, entry.inning, "C", entry.catcherId);
      }
      setAiStatus(data.notes.length > 0 ? data.notes.join(" ") : "Plan applied.");
    } catch (err) {
      setAiStatus(err instanceof Error ? err.message : "Failed to generate plan.");
    } finally {
      setAiPlanning(false);
    }
  };

  return (
    <div style={{ marginTop: 16, background: "#fff", border: "1px solid #e7e4dc", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(40,35,25,.06)" }}>
      <div style={{ padding: "14px 22px", borderBottom: "1px solid #e7e4dc", display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.01em", color: "#211f1b" }}>Pitcher / Catcher Plan</span>
        <span style={{ fontSize: 12.5, color: "#a09a8e" }}>Lock P/C by inning, then auto-fill the rest of the lineup around them</span>
      </div>

      {/* Natural language AI prompt */}
      <div style={{ padding: "14px 22px", borderBottom: "1px solid #eeece5" }}>
        <textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          disabled={game.status === "finalized"}
          rows={2}
          placeholder='e.g. "Jake pitches innings 1 and 3, Mia catches every inning, never pitch the same player back-to-back"'
          style={{ width: "100%", fontSize: 13.5, borderRadius: 9, border: "1px solid #e3e0d8", background: "#faf8f3", padding: "9px 12px", color: "#211f1b", resize: "vertical", fontFamily: "var(--font-hanken),'Hanken Grotesk',sans-serif", boxSizing: "border-box" }}
        />
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleAiPlan}
            disabled={aiPlanning || game.status === "finalized" || aiPrompt.trim().length === 0}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 15px", borderRadius: 9, border: "none", background: aiPlanning || aiPrompt.trim().length === 0 ? "#c9d9b0" : "#3f6212", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: aiPlanning || aiPrompt.trim().length === 0 ? "default" : "pointer", fontFamily: "inherit" }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M7 1l1.5 4.5L13 7l-4.5 1.5L7 13l-1.5-4.5L1 7l4.5-1.5z" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round"/></svg>
            {aiPlanning ? "Thinking…" : "Use Gemini"}
          </button>
          <span style={{ fontSize: 12, color: "#a09a8e" }}>Gemini fills only the pitcher/catcher plan — auto-fill populates everyone else around it.</span>
        </div>
        {aiStatus && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: "#3f6212", background: "#eef1e3", border: "1px solid #dbe3c6", borderRadius: 7, padding: "6px 10px" }}>
            {aiStatus}
          </div>
        )}
      </div>

      {/* Per-inning P/C grid */}
      <div style={{ padding: "14px 22px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "8px 20px" }}>
        {game.innings.map((inn) => {
          const plan = pitchCatchMap.get(inn.inning);
          const isFinalized = game.status === "finalized";
          const allPlayers = [...batting, ...scratchedIds].map((id) => byId[id]).filter(Boolean) as Player[];
          return (
            <div key={inn.inning} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, border: "1px solid #eeece5", background: (plan?.pitcherId || plan?.catcherId) ? "#faf8f3" : "#fcfbf8" }}>
              <span style={{ fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, color: "#6f6a60", minWidth: 42 }}>INN {inn.inning}</span>
              {(["P", "C"] as const).map((pos) => {
                const currentId = pos === "P" ? plan?.pitcherId : plan?.catcherId;
                const pal = pos === "P" ? { fg: "#9a6712", bg: "#f7eed7", bd: "#e8d8a4" } : { fg: "#345d86", bg: "#eef2f6", bd: "#c8d8e8" };
                return (
                  <div key={pos} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 9.5, fontWeight: 600, letterSpacing: ".06em", color: pal.fg }}>{pos === "P" ? "PITCHER" : "CATCHER"}</span>
                    <select
                      value={currentId ?? ""}
                      disabled={isFinalized}
                      onChange={(e) => setPitchCatchAssignment(game.id, inn.inning, pos, e.target.value || null).catch(console.error)}
                      style={{ width: "100%", fontSize: 12.5, fontWeight: 600, color: currentId ? pal.fg : "#a09a8e", background: currentId ? pal.bg : "#fff", border: `1px solid ${currentId ? pal.bd : "#e3e0d8"}`, borderRadius: 7, padding: "4px 7px", cursor: isFinalized ? "default" : "pointer", fontFamily: "inherit" }}
                    >
                      <option value="">Unassigned</option>
                      {allPlayers.map((pl) => (
                        <option key={pl.id} value={pl.id}>{pl.firstName} {pl.lastInitial}. #{pl.jerseyNumber}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
