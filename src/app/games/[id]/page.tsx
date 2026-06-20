"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useDiamondDraftStore } from "@/lib/store";
import LineupBuilder from "@/components/game/LineupBuilder";
import { C, FitCard, Pill } from "@/components/AppShell";

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const games = useDiamondDraftStore((s) => s.games);
  const players = useDiamondDraftStore((s) => s.players);
  const setActiveGame = useDiamondDraftStore((s) => s.setActiveGame);
  const activeGameId = useDiamondDraftStore((s) => s.activeGameId);

  const updateGameMeta = useDiamondDraftStore((s) => s.updateGameMeta);
  const setGameExternalId = useDiamondDraftStore((s) => s.setGameExternalId);

  const game = games.find((g) => g.id === id);

  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editOpponent, setEditOpponent] = useState("");
  const [editTeamName, setEditTeamName] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [editingExtId, setEditingExtId] = useState(false);
  const [editExtId, setEditExtId] = useState("");

  useEffect(() => {
    if (game && activeGameId !== id) {
      setActiveGame(id);
    }
  }, [game, activeGameId, id, setActiveGame]);

  if (!game) {
    return (
      <div style={{ textAlign: "center", padding: "96px 0", color: C.faint, fontFamily: "var(--font-sans)" }}>
        Game not found.{" "}
        <Link href="/games" style={{ color: C.green }}>Back to games</Link>
      </div>
    );
  }

  // Prefer live player data so name/attribute edits are reflected immediately.
  // Fall back to snapshot entry only for players removed from the roster.
  const liveById = new Map(players.map((p) => [p.id, p]));
  const gameRoster = game.rosterSnapshot.length > 0
    ? game.rosterSnapshot.map((p) => liveById.get(p.id) ?? p)
    : players;

  const statusPill =
    game.status === "finalized"
      ? { t: "Finalized", fg: C.green, bg: C.greenBg, bd: C.greenBd }
      : { t: "Draft · not finalized", fg: C.amber, bg: C.amberBg, bd: C.amberBd };

  return (
    <div className="dd-wrap-wide">
      {/* Breadcrumb + status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Link href="/games" className="dd-crumb">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 4l-5 5 5 5"/>
          </svg>
          Games
        </Link>
        <Pill fg={statusPill.fg} bg={statusPill.bg} bd={statusPill.bd}>
          {statusPill.t}
        </Pill>
      </div>

      {/* Game details / edit */}
      {editing ? (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 22px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.faint, letterSpacing: ".04em", marginBottom: 14 }}>EDIT GAME DETAILS</div>
          <div className="dd-grid-2col" style={{ marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.faint, marginBottom: 4 }}>Date</label>
              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                style={{ width: "100%", background: "#faf8f3", border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 13.5, color: C.ink, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.faint, marginBottom: 4 }}>Opponent</label>
              <input value={editOpponent} onChange={(e) => setEditOpponent(e.target.value)} placeholder="e.g. Blue Jays"
                style={{ width: "100%", background: "#faf8f3", border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 13.5, color: C.ink, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.faint, marginBottom: 4 }}>Your Team Name</label>
              <input value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} placeholder="e.g. Cardinals"
                style={{ width: "100%", background: "#faf8f3", border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 13.5, color: C.ink, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.faint, marginBottom: 4 }}>Notes</label>
              <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional notes"
                style={{ width: "100%", background: "#faf8f3", border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 13.5, color: C.ink, boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="dd-btn pri" onClick={() => {
              updateGameMeta(id, { date: editDate, opponent: editOpponent, teamName: editTeamName, notes: editNotes });
              setEditing(false);
            }}>Save</button>
            <button className="dd-btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="dd-game-detail-info">
          <div className="dd-game-detail-title">
            {game.teamName ?? "Team"} vs {game.opponent || "—"}
          </div>
          <div style={{ fontSize: 13, color: C.faint }}>{game.date}</div>
          {game.notes && <div style={{ fontSize: 13, color: C.faint, fontStyle: "italic" }}>{game.notes}</div>}

          {/* External ID badge / inline edit */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            {editingExtId ? (
              <>
                <input
                  value={editExtId}
                  onChange={(e) => setEditExtId(e.target.value)}
                  placeholder="e.g. G22"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { setGameExternalId(id, editExtId.trim()); setEditingExtId(false); }
                    if (e.key === "Escape") setEditingExtId(false);
                  }}
                  style={{
                    width: 90, padding: "4px 8px", borderRadius: 6, fontSize: 13,
                    border: `1px solid ${C.blue}`, fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
                    background: C.blueBg, color: C.ink, outline: "none",
                  }}
                />
                <button className="dd-btn pri sm" onClick={() => { setGameExternalId(id, editExtId.trim()); setEditingExtId(false); }}>Save</button>
                <button className="dd-btn ghost sm" onClick={() => setEditingExtId(false)}>Cancel</button>
              </>
            ) : (
              <button
                onClick={() => { setEditExtId(game.externalId ?? ""); setEditingExtId(true); }}
                title="Set external ID for CSV imports"
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
                  borderRadius: 6, border: `1px solid ${game.externalId ? C.blueBd : C.line}`,
                  background: game.externalId ? C.blueBg : "transparent",
                  cursor: "pointer", fontSize: 12.5,
                  color: game.externalId ? C.blue : C.faint,
                  fontFamily: game.externalId ? "var(--font-ibm-mono,'IBM Plex Mono',monospace)" : "inherit",
                }}
              >
                {game.externalId ?? "Set external ID"}
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M11 2l3 3-8 8H3v-3L11 2z"/>
                </svg>
              </button>
            )}
            <button className="dd-btn" onClick={() => {
              setEditDate(game.date);
              setEditOpponent(game.opponent ?? "");
              setEditTeamName(game.teamName ?? "");
              setEditNotes(game.notes ?? "");
              setEditing(true);
            }}>Edit details</button>
          </div>
        </div>
      )}

      {/* Builder — FitCard scales on desktop; native scroll on mobile */}
      <div className="dd-lineup-desktop">
        <FitCard width={1320}>
          <LineupBuilder game={game} players={gameRoster} />
        </FitCard>
      </div>
      <div className="dd-lineup-mobile">
        <LineupBuilder game={game} players={gameRoster} />
      </div>
    </div>
  );
}
