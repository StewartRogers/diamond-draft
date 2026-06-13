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

  const game = games.find((g) => g.id === id);

  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editOpponent, setEditOpponent] = useState("");
  const [editTeamName, setEditTeamName] = useState("");
  const [editNotes, setEditNotes] = useState("");

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>
            {game.teamName ?? "Team"} vs {game.opponent || "—"}
          </div>
          <div style={{ fontSize: 13, color: C.faint }}>{game.date}</div>
          {game.notes && <div style={{ fontSize: 13, color: C.faint, fontStyle: "italic" }}>{game.notes}</div>}
          <button className="dd-btn" style={{ marginLeft: "auto" }} onClick={() => {
            setEditDate(game.date);
            setEditOpponent(game.opponent ?? "");
            setEditTeamName(game.teamName ?? "");
            setEditNotes(game.notes ?? "");
            setEditing(true);
          }}>Edit details</button>
        </div>
      )}

      {/* Builder — FitCard scales down to fit, never up */}
      <FitCard width={1320}>
        <LineupBuilder game={game} players={gameRoster} />
      </FitCard>
    </div>
  );
}
