"use client";

import React, { useMemo, useState } from "react";
import {
  useDiamondDraftStore,
  selectActiveSeason,
} from "@/lib/store";
import type { Player } from "@/lib/types";
import { DEFENSE_TIER_CFG } from "@/lib/types";
import PlayerForm from "@/components/roster/PlayerForm";
import { C, Jersey, ZChips, PageHeader } from "@/components/AppShell";

export default function PlayersPage() {
  const players = useDiamondDraftStore((s) => s.players);
  const seasons = useDiamondDraftStore((s) => s.seasons);
  const teams = useDiamondDraftStore((s) => s.teams);
  const activeSeason = useDiamondDraftStore(selectActiveSeason);
  const addPlayer = useDiamondDraftStore((s) => s.addPlayer);
  const updatePlayer = useDiamondDraftStore((s) => s.updatePlayer);
  const removePlayer = useDiamondDraftStore((s) => s.removePlayer);
  const addToRoster = useDiamondDraftStore((s) => s.addPlayerToSeasonRoster);

  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const teamName = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t.name]));
    return (season: { teamId: string; teamName: string }) =>
      map.get(season.teamId) ?? season.teamName;
  }, [teams]);

  // Team-season memberships per player, derived from season rosters.
  const membershipsByPlayer = useMemo(() => {
    const m = new Map<string, { id: string; label: string }[]>();
    for (const season of seasons) {
      for (const pid of season.roster) {
        const list = m.get(pid) ?? [];
        list.push({ id: season.id, label: `${teamName(season)} · ${season.name}` });
        m.set(pid, list);
      }
    }
    return m;
  }, [seasons, teamName]);

  const activeRosterIds = useMemo(
    () => new Set(activeSeason?.roster ?? []),
    [activeSeason]
  );

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

  return (
    <div className="dd-wrap">
      <PageHeader
        eyebrow="All players"
        title="Players"
        subtitle={`${players.length} player${players.length !== 1 ? "s" : ""} across every team and season. Players here are the shared pool — add them to a season's roster from the Roster page or the + button below.`}
        action={
          <button className="dd-btn pri" onClick={() => { setShowAdd(true); setEditing(null); }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round">
              <path d="M8 3v10M3 8h10"/>
            </svg>
            Add player
          </button>
        }
      />

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

      {/* Add Player inline form (global — not tied to a season) */}
      {showAdd && (
        <div className="dd-card" style={{ padding: "22px 24px", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>New Player</div>
          <PlayerForm
            onSave={async (data) => { await addPlayer(data); setShowAdd(false); }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {/* Table */}
      <div className="dd-card" style={{ padding: "18px 8px 8px", overflowX: "auto" }}>
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
                <th>On rosters</th>
                <th style={{ width: 220 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((player) => {
                const memberships = membershipsByPlayer.get(player.id) ?? [];
                const onActive = activeRosterIds.has(player.id);
                return (
                  <React.Fragment key={player.id}>
                    <tr>
                      <td><Jersey num={player.jerseyNumber} /></td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>
                            {player.firstName} {player.lastInitial}
                          </span>
                          {player.isGuest && (
                            <span className="dd-zchip" style={{ background: C.amberBg, color: C.amber }}>GUEST</span>
                          )}
                          {player.defenseRating !== undefined && (() => {
                            const cfg = DEFENSE_TIER_CFG[player.defenseRating as 1|2|3|4];
                            if (!cfg) return null;
                            return (
                              <span className="dd-zchip" title={`Overall defense: ${cfg.label}`} style={{ background: cfg.bg, color: cfg.text, fontSize: 11 }}>
                                {cfg.label}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td><ZChips positions={player.eligiblePositions} ratings={player.positionRatings} /></td>
                      <td>
                        {memberships.length === 0 ? (
                          <span style={{ fontSize: 12.5, color: C.faint }}>Not on any roster</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {memberships.map((m) => (
                              <span key={m.id} className="dd-zchip" style={{ background: "#eef1e3", color: C.green, fontSize: 11 }}>
                                {m.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                          {activeSeason && (
                            onActive ? (
                              <span style={{ fontSize: 11.5, color: C.faint, fontStyle: "italic", whiteSpace: "nowrap" }}>
                                On {activeSeason.name}
                              </span>
                            ) : (
                              <button
                                className="dd-btn ghost sm"
                                style={{ color: C.green, whiteSpace: "nowrap" }}
                                title={`Add to ${activeSeason.teamName} · ${activeSeason.name}`}
                                onClick={() => addToRoster(activeSeason.id, player.id)}
                              >
                                + {activeSeason.name}
                              </button>
                            )
                          )}
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
                            onClick={() => setConfirmDelete(player.id)}
                            title="Delete player from everywhere"
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
                        <td colSpan={5} style={{ background: "#faf8f3", padding: "20px 24px" }}>
                          <PlayerForm
                            initial={editing}
                            onSave={async (data) => { await updatePlayer(player.id, data); setEditing(null); }}
                            onCancel={() => setEditing(null)}
                          />
                        </td>
                      </tr>
                    )}

                    {/* Confirm global delete */}
                    {confirmDelete === player.id && (
                      <tr>
                        <td colSpan={5} style={{ background: "#fdf2f1", padding: "12px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13, flexWrap: "wrap" }}>
                            <span style={{ color: C.red }}>
                              Delete {player.firstName} {player.lastInitial} from every team, season, and depth chart? This cannot be undone.
                            </span>
                            <button
                              className="dd-btn pri sm"
                              style={{ background: C.red }}
                              onClick={async () => { await removePlayer(player.id); setConfirmDelete(null); }}
                            >
                              Delete everywhere
                            </button>
                            <button className="dd-btn ghost sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
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
    </div>
  );
}
