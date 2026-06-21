"use client";

import React, { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useDiamondDraftStore,
  selectActiveSeason,
  selectRosterPlayers,
} from "@/lib/store";
import type { Player } from "@/lib/types";
import { DEFENSE_TIER_CFG } from "@/lib/types";
import PlayerForm from "@/components/roster/PlayerForm";
import DepthChartView from "@/components/roster/DepthChartView";
import { C, Jersey, ZChips, Pill, PageHeader } from "@/components/AppShell";

const STATUS_PILL = {
  active:     { fg: C.green, bg: C.greenBg, bd: C.greenBd, t: "Active" },
  late:       { fg: C.amber, bg: C.amberBg, bd: C.amberBd, t: "Arriving late" },
  earlyLeave: { fg: C.amber, bg: C.amberBg, bd: C.amberBd, t: "Leaves early" },
  absent:     { fg: C.faint, bg: "#f1efe8",  bd: "#e3e0d8",  t: "Out today" },
};

export default function RosterPage() {
  const allPlayers = useDiamondDraftStore((s) => s.players);
  const players = useDiamondDraftStore(useShallow(selectRosterPlayers));
  const activeSeason = useDiamondDraftStore(selectActiveSeason);
  const addPlayer = useDiamondDraftStore((s) => s.addPlayer);
  const updatePlayer = useDiamondDraftStore((s) => s.updatePlayer);
  const removePlayer = useDiamondDraftStore((s) => s.removePlayer);
  const addToRoster = useDiamondDraftStore((s) => s.addPlayerToSeasonRoster);
  const removeFromRoster = useDiamondDraftStore((s) => s.removePlayerFromSeasonRoster);

  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "depth">("list");
  const [showAdd, setShowAdd] = useState(false);
  const [showExisting, setShowExisting] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Global players not already on this season's roster (for "add existing").
  const rosterIds = new Set(players.map((p) => p.id));
  const availablePlayers = allPlayers
    .filter((p) => !rosterIds.has(p.id))
    .sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber));

  const sorted = [...players].sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber));
  const filtered = sorted.filter((p) => {
    const s = q.toLowerCase();
    return (
      !s ||
      p.firstName.toLowerCase().includes(s) ||
      p.lastInitial.toLowerCase().includes(s) ||
      p.jerseyNumber.includes(s)
    );
  });

  const isPitcher = (p: Player) => p.eligiblePositions.some((pos) => pos === "P");

  if (!activeSeason) {
    return (
      <div className="dd-wrap">
        <PageHeader eyebrow="Season roster" title="Roster" subtitle="Select or create a season to manage its roster." />
        <div className="dd-card" style={{ padding: "40px 32px", textAlign: "center", color: C.faint }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No active season</div>
          <div style={{ fontSize: 13 }}>Use the team / season picker in the top bar to choose or create a season.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dd-wrap">
      <PageHeader
        eyebrow={`${activeSeason.teamName} · ${activeSeason.name}`}
        title="Roster"
        subtitle={`${players.length} player${players.length !== 1 ? "s" : ""} on this season's roster · tap a player to edit eligibility & status.`}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="dd-btn sec"
              onClick={() => { setView("list"); setShowExisting((v) => !v); setShowAdd(false); setEditing(null); }}
              disabled={availablePlayers.length === 0}
              title={availablePlayers.length === 0 ? "All players are already on this roster" : undefined}
            >
              Add existing
            </button>
            <button className="dd-btn pri" onClick={() => { setView("list"); setShowAdd(true); setShowExisting(false); setEditing(null); }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round">
                <path d="M8 3v10M3 8h10"/>
              </svg>
              Add player
            </button>
          </div>
        }
      />

      {/* Add existing global player to this season */}
      {showExisting && (
        <div className="dd-card" style={{ padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            Add a player from another team / season
          </div>
          {availablePlayers.length === 0 ? (
            <div style={{ fontSize: 13, color: C.faint }}>Every player is already on this roster.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {availablePlayers.map((p) => (
                <button
                  key={p.id}
                  className="dd-btn ghost sm"
                  onClick={async () => { await addToRoster(activeSeason.id, p.id); }}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: C.muted }}>#{p.jerseyNumber}</span>
                  {p.firstName} {p.lastInitial}
                  <span style={{ color: C.green, fontWeight: 700 }}>+</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View toggle: roster list vs depth chart */}
      <div className="dd-seg" style={{ marginBottom: 16 }}>
        <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>List</button>
        <button className={view === "depth" ? "on" : ""} onClick={() => setView("depth")}>Depth chart</button>
      </div>

      {view === "depth" ? (
        <DepthChartView seasonId={activeSeason.id} players={players} />
      ) : (
      <>
      {/* Search */}
      <div style={{ position: "relative", width: 320, marginBottom: 16 }}>
        <svg
          style={{ position: "absolute", left: 13, top: 13, pointerEvents: "none" }}
          width="17" height="17" viewBox="0 0 18 18" fill="none" stroke={C.faint} strokeWidth="1.6"
        >
          <circle cx="8" cy="8" r="5.5"/>
          <path d="M12.5 12.5l3 3" strokeLinecap="round"/>
        </svg>
        <input
          className="dd-input"
          style={{ paddingLeft: 38 }}
          placeholder="Search name or number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Add Player inline form */}
      {showAdd && (
        <div className="dd-card" style={{ padding: "22px 24px", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>New Player</div>
          <PlayerForm
            onSave={async (data) => {
              const player = await addPlayer(data);
              await addToRoster(activeSeason.id, player.id);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {/* Table */}
      <div className="dd-card" style={{ padding: "18px 8px 8px", overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: C.faint, fontSize: 14 }}>
            {players.length === 0
              ? "No players yet. Add your first player to get started."
              : "No players match your search."}
          </div>
        ) : (
          <table className="dd-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>#</th>
                <th>Player</th>
                <th>Eligible positions</th>
                <th style={{ width: 130 }}>Role</th>
                <th style={{ width: 150 }}>Status</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((player) => {
                const s = STATUS_PILL.active; // default — per-game status comes from overrides
                return (
                  <React.Fragment key={player.id}>
                    <tr style={{ cursor: "pointer" }}>
                      <td><Jersey num={player.jerseyNumber} /></td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>
                            {player.firstName} {player.lastInitial}
                          </span>
                          {player.isGuest && (
                            <span className="dd-zchip" style={{ background: C.amberBg, color: C.amber }}>
                              GUEST
                            </span>
                          )}
                          {player.defenseRating !== undefined && (() => {
                            const cfg = DEFENSE_TIER_CFG[player.defenseRating as 1|2|3|4];
                            if (!cfg) return null;
                            return (
                              <span
                                className="dd-zchip"
                                title={`Overall defense: ${cfg.label}`}
                                style={{ background: cfg.bg, color: cfg.text, fontSize: 11 }}
                              >
                                {cfg.label}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td><ZChips positions={player.eligiblePositions} ratings={player.positionRatings} /></td>
                      <td>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 13, fontWeight: 600,
                            color: isPitcher(player) ? C.green : C.muted,
                          }}
                        >
                          {isPitcher(player) ? "Pitcher" : "Position"}
                        </span>
                      </td>
                      <td><Pill fg={s.fg} bg={s.bg} bd={s.bd}>{s.t}</Pill></td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            className="dd-btn ghost sm"
                            style={{ padding: "0 8px" }}
                            onClick={() => { setEditing(player); setShowAdd(false); }}
                            title="Edit player"
                          >
                            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke={C.faint} strokeWidth="1.5">
                              <path d="M11.5 3.5l3 3L6 15l-3.5.5L3 12z" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            className="dd-btn ghost sm"
                            style={{ padding: "0 8px", color: C.red }}
                            onClick={() => setConfirmRemove(player.id)}
                            title="Remove from this season"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M3 4h10M6 4V2h4v2M5 4l.5 10h5L11 4"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline edit */}
                    {editing?.id === player.id && (
                      <tr>
                        <td colSpan={6} style={{ background: "#faf8f3", padding: "20px 24px" }}>
                          <PlayerForm
                            initial={editing}
                            onSave={async (data) => { await updatePlayer(player.id, data); setEditing(null); }}
                            onCancel={() => setEditing(null)}
                          />
                        </td>
                      </tr>
                    )}

                    {/* Confirm remove */}
                    {confirmRemove === player.id && (
                      <tr>
                        <td colSpan={6} style={{ background: "#fdf2f1", padding: "12px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, flexWrap: "wrap" }}>
                            <span style={{ color: C.red }}>
                              Remove {player.firstName} {player.lastInitial} from {activeSeason.name}?
                            </span>
                            <button
                              className="dd-btn pri sm"
                              style={{ background: C.red }}
                              onClick={async () => { await removeFromRoster(activeSeason.id, player.id); setConfirmRemove(null); }}
                            >
                              Remove from season
                            </button>
                            <button
                              className="dd-btn ghost sm"
                              style={{ color: C.red }}
                              onClick={async () => { await removePlayer(player.id); setConfirmRemove(null); }}
                              title="Delete this player from every team and season"
                            >
                              Delete player entirely
                            </button>
                            <button
                              className="dd-btn ghost sm"
                              onClick={() => setConfirmRemove(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
              </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}
    </div>
  );
}
