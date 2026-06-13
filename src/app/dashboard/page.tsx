"use client";

import { useMemo, useState } from "react";
import { useDiamondDraftStore } from "@/lib/store";
import { FIELD_POSITIONS } from "@/lib/types";
import type { FieldPosition, Game, Player } from "@/lib/types";
import { C, PageHeader } from "@/components/AppShell";

// ─── Zone colours (match lineup builder palette) ──────────────────────────────

const ZONE_COL: Record<string, { bg: string; fg: string; bd: string }> = {
  P:   { bg: "#f7eed7", fg: "#9a6712", bd: "#ecdcb6" },
  C:   { bg: "#f7eed7", fg: "#9a6712", bd: "#ecdcb6" },
  "1B":{ bg: "#eef1e3", fg: "#3f6212", bd: "#dbe3c6" },
  "2B":{ bg: "#eef1e3", fg: "#3f6212", bd: "#dbe3c6" },
  "3B":{ bg: "#eef1e3", fg: "#3f6212", bd: "#dbe3c6" },
  SS:  { bg: "#eef1e3", fg: "#3f6212", bd: "#dbe3c6" },
  LF:  { bg: "#eef2f6", fg: "#345d86", bd: "#dbe4ec" },
  CF:  { bg: "#eef2f6", fg: "#345d86", bd: "#dbe4ec" },
  RF:  { bg: "#eef2f6", fg: "#345d86", bd: "#dbe4ec" },
};

// ─── Stats computation ────────────────────────────────────────────────────────

type PlayerStats = {
  player: Player;
  gamesPlayed: number;
  fieldInnings: number;
  benchInnings: number;
  bullpenInnings: number;
  posInnings: Partial<Record<FieldPosition, number>>;
};

function computeStats(players: Player[], games: Game[]): PlayerStats[] {
  return players.map((player) => {
    let gamesPlayed = 0;
    let benchInnings = 0;
    let bullpenInnings = 0;
    const posInnings: Partial<Record<FieldPosition, number>> = {};

    for (const game of games) {
      if (!game.battingOrder.includes(player.id)) continue;
      gamesPlayed++;

      for (const inn of game.innings) {
        const innNum = inn.inning; // 1-based

        // Determine availability for this inning
        const ov = game.playerOverrides.find((o) => o.playerId === player.id);
        if (ov?.status === "absent") continue;
        if (ov?.status === "late" && ov.inning != null && innNum < ov.inning) continue;
        if (ov?.status === "earlyLeave" && ov.inning != null && innNum > ov.inning) continue;

        const slot = inn.slots.find((s) => s.playerId === player.id);
        if (slot) {
          if ((FIELD_POSITIONS as readonly string[]).includes(slot.position)) {
            const pos = slot.position as FieldPosition;
            posInnings[pos] = (posInnings[pos] ?? 0) + 1;
          } else if (slot.position === "Bullpen - P" || slot.position === "Bullpen - C") {
            bullpenInnings++;
          }
          // "Bench" slot with explicit playerId — treated as bench below
        } else {
          benchInnings++;
        }
      }
    }

    const fieldInnings = (Object.values(posInnings) as number[]).reduce((s, n) => s + n, 0);
    return { player, gamesPlayed, fieldInnings, benchInnings, bullpenInnings, posInnings };
  });
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortKey = "jersey" | "name" | "games" | "field" | "bench" | FieldPosition;

function sortStats(rows: PlayerStats[], key: SortKey, dir: "asc" | "desc"): PlayerStats[] {
  return [...rows].sort((a, b) => {
    let v = 0;
    if (key === "jersey") v = Number(a.player.jerseyNumber) - Number(b.player.jerseyNumber);
    else if (key === "name") v = a.player.firstName.localeCompare(b.player.firstName);
    else if (key === "games") v = a.gamesPlayed - b.gamesPlayed;
    else if (key === "field") v = a.fieldInnings - b.fieldInnings;
    else if (key === "bench") v = a.benchInnings - b.benchInnings;
    else v = (a.posInnings[key as FieldPosition] ?? 0) - (b.posInnings[key as FieldPosition] ?? 0);
    return dir === "asc" ? v : -v;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Th({
  label, sortKey, current, dir, onSort, title, style,
}: {
  label: React.ReactNode;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  title?: string;
  style?: React.CSSProperties;
}) {
  const active = current === sortKey;
  return (
    <th
      title={title}
      onClick={() => onSort(sortKey)}
      style={{
        padding: "10px 8px",
        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: active ? C.green : C.muted,
        background: active ? C.greenBg : C.sub,
        borderBottom: `2px solid ${active ? C.greenBd : C.line}`,
        cursor: "pointer",
        whiteSpace: "nowrap",
        userSelect: "none",
        textAlign: "center",
        ...style,
      }}
    >
      {label}
      {active && (
        <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.7 }}>
          {dir === "asc" ? "↑" : "↓"}
        </span>
      )}
    </th>
  );
}

function Num({
  n, pos, highlight,
}: {
  n: number;
  pos?: FieldPosition;
  highlight?: "bench";
}) {
  if (n === 0) {
    return <span style={{ color: C.faint2, fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 13 }}>—</span>;
  }
  if (pos) {
    const z = ZONE_COL[pos];
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 26, height: 22, borderRadius: 5,
        background: z.bg, color: z.fg, border: `1px solid ${z.bd}`,
        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 12.5, fontWeight: 700,
      }}>
        {n}
      </span>
    );
  }
  if (highlight === "bench") {
    const tone = n >= 4 ? { bg: C.amberBg, fg: C.amber, bd: C.amberBd }
               : n >= 2 ? { bg: "#f8f5ee", fg: "#7c776c", bd: C.line }
               : { bg: "#f8f5ee", fg: "#7c776c", bd: C.line };
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 26, height: 22, borderRadius: 5,
        background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`,
        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 12.5, fontWeight: 700,
      }}>
        {n}
      </span>
    );
  }
  return (
    <span style={{ fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700, color: C.ink }}>
      {n}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const players = useDiamondDraftStore((s) => s.players);
  const games = useDiamondDraftStore((s) => s.games);
  const [sort, setSort] = useState<SortKey>("jersey");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const today = new Date().toISOString().slice(0, 10);

  const eligibleGames = useMemo(
    () => games.filter((g) => g.status === "finalized" && g.date <= today),
    [games, today]
  );

  const stats = useMemo(() => computeStats(players, eligibleGames), [players, eligibleGames]);

  const sorted = useMemo(() => sortStats(stats, sort, sortDir), [stats, sort, sortDir]);

  // Only show position columns that have innings recorded
  const activePosColumns = FIELD_POSITIONS.filter((pos) =>
    stats.some((s) => (s.posInnings[pos] ?? 0) > 0)
  );

  const hasBullpen = stats.some((s) => s.bullpenInnings > 0);

  function handleSort(key: SortKey) {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setSortDir("desc"); }
  }

  const gameLabel = eligibleGames.length === 1 ? "1 finalized game" : `${eligibleGames.length} finalized games`;
  const dateLabel = new Date(today + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="dd-wrap">
      <PageHeader
        eyebrow="Season overview"
        title="Player Stats"
        subtitle={
          eligibleGames.length === 0
            ? "No finalized games yet."
            : `${gameLabel} through ${dateLabel} · ${players.length} players`
        }
      />

      {eligibleGames.length === 0 ? (
        <div className="dd-card" style={{ padding: "40px 32px", textAlign: "center", color: C.faint }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No data yet</div>
          <div style={{ fontSize: 13 }}>Stats appear once you finalize at least one past game.</div>
        </div>
      ) : (
        <div className="dd-card" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
            <thead>
              <tr>
                <Th label="#" sortKey="jersey" current={sort} dir={sortDir} onSort={handleSort}
                  title="Sort by jersey number"
                  style={{ textAlign: "left", paddingLeft: 20, width: 48 }} />
                <Th label="Player" sortKey="name" current={sort} dir={sortDir} onSort={handleSort}
                  title="Sort by first name"
                  style={{ textAlign: "left", paddingLeft: 12 }} />
                <Th label="Games" sortKey="games" current={sort} dir={sortDir} onSort={handleSort}
                  title="Games played (finalized, not absent)" />
                <Th label="Field" sortKey="field" current={sort} dir={sortDir} onSort={handleSort}
                  title="Total innings on the field (any position)" />
                <Th label="Bench" sortKey="bench" current={sort} dir={sortDir} onSort={handleSort}
                  title="Total bench innings" />
                {hasBullpen && (
                  <th style={{
                    padding: "10px 8px", fontSize: 10.5, fontWeight: 700,
                    letterSpacing: ".06em", textTransform: "uppercase",
                    color: C.muted, background: C.sub, borderBottom: `2px solid ${C.line}`,
                    fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
                    whiteSpace: "nowrap", textAlign: "center",
                  }}>
                    Bullpen
                  </th>
                )}
                {/* Divider before per-position columns */}
                <th style={{ width: 1, padding: 0, background: C.line, borderBottom: `2px solid ${C.line}` }} />
                {activePosColumns.map((pos) => (
                  <Th key={pos} label={pos} sortKey={pos} current={sort} dir={sortDir} onSort={handleSort}
                    title={`Sort by innings at ${pos}`} />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const { player, gamesPlayed, fieldInnings, benchInnings, bullpenInnings, posInnings } = row;
                const totalActive = fieldInnings + benchInnings + bullpenInnings;
                const isEven = i % 2 === 0;
                return (
                  <tr key={player.id} style={{ background: isEven ? C.card : C.sub }}>
                    {/* Jersey */}
                    <td style={{ padding: "10px 8px 10px 20px", verticalAlign: "middle" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        minWidth: 28, height: 28, borderRadius: 6,
                        background: "#2b2a26", color: "#f3f1ec",
                        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {player.jerseyNumber}
                      </span>
                    </td>
                    {/* Name */}
                    <td style={{ padding: "10px 12px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                        {player.firstName} {player.lastInitial}
                      </span>
                    </td>
                    {/* Games */}
                    <td style={{ padding: "10px 8px", verticalAlign: "middle", textAlign: "center" }}>
                      <Num n={gamesPlayed} />
                    </td>
                    {/* Field total */}
                    <td style={{ padding: "10px 8px", verticalAlign: "middle", textAlign: "center" }}>
                      <span style={{
                        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
                        fontSize: 13, fontWeight: 700,
                        color: fieldInnings === 0 ? C.red : fieldInnings < 2 * gamesPlayed ? C.amber : C.green,
                      }}>
                        {fieldInnings === 0 ? "0" : fieldInnings}
                      </span>
                      {totalActive > 0 && (
                        <span style={{ color: C.faint2, fontSize: 11, marginLeft: 3 }}>
                          /{totalActive}
                        </span>
                      )}
                    </td>
                    {/* Bench */}
                    <td style={{ padding: "10px 8px", verticalAlign: "middle", textAlign: "center" }}>
                      <Num n={benchInnings} highlight="bench" />
                    </td>
                    {/* Bullpen */}
                    {hasBullpen && (
                      <td style={{ padding: "10px 8px", verticalAlign: "middle", textAlign: "center" }}>
                        <Num n={bullpenInnings} />
                      </td>
                    )}
                    {/* Divider */}
                    <td style={{ width: 1, padding: 0, background: C.line }} />
                    {/* Per-position */}
                    {activePosColumns.map((pos) => (
                      <td key={pos} style={{ padding: "10px 8px", verticalAlign: "middle", textAlign: "center" }}>
                        <Num n={posInnings[pos] ?? 0} pos={pos} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Legend */}
          <div style={{
            display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
            padding: "12px 20px", borderTop: `1px solid ${C.line}`,
            background: C.sub, fontSize: 11.5, color: C.faint,
          }}>
            <span style={{ fontWeight: 600, color: C.muted }}>Field total:</span>
            <span><span style={{ color: C.green, fontWeight: 700 }}>green</span> = ≥ 2 inn/game avg</span>
            <span><span style={{ color: C.amber, fontWeight: 700 }}>amber</span> = below avg</span>
            <span><span style={{ color: C.red, fontWeight: 700 }}>red</span> = 0 field innings</span>
            <span style={{ marginLeft: "auto", color: C.faint2 }}>Field/Total shows field innings out of all available innings</span>
          </div>
        </div>
      )}
    </div>
  );
}
