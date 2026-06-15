"use client";

import { useMemo, useState } from "react";
import { useDiamondDraftStore } from "@/lib/store";
import { FIELD_POSITIONS } from "@/lib/types";
import type { FieldPosition, Game, Player, HittingStats, PitchingGameStats } from "@/lib/types";
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

// ─── Baseball IP helpers ──────────────────────────────────────────────────────

/** Add two baseball-notation IP values (e.g. 2.2 + 1.1 = 4.0). */
function addIP(a: number, b: number): number {
  const aI = Math.floor(a), aO = Math.round((a - aI) * 10);
  const bI = Math.floor(b), bO = Math.round((b - bI) * 10);
  const totalOuts = aO + bO;
  return aI + bI + Math.floor(totalOuts / 3) + (totalOuts % 3) * 0.1;
}

function formatIP(n: number): string {
  if (n === 0) return "0";
  return String(Math.round(n * 10) / 10);
}

/** Convert baseball-notation IP to true decimal (2.1 → 2.333…). */
function ipToDecimal(ip: number): number {
  const innings = Math.floor(ip);
  const outs = Math.round((ip - innings) * 10);
  return innings + outs / 3;
}

// ─── Playing-time stats ───────────────────────────────────────────────────────

type PlayerPlayStats = {
  player: Player;
  gamesPlayed: number;
  fieldInnings: number;
  benchInnings: number;
  bullpenInnings: number;
  posInnings: Partial<Record<FieldPosition, number>>;
};

function computePlayStats(players: Player[], games: Game[]): PlayerPlayStats[] {
  return players.map((player) => {
    let gamesPlayed = 0, benchInnings = 0, bullpenInnings = 0;
    const posInnings: Partial<Record<FieldPosition, number>> = {};

    for (const game of games) {
      if (!game.battingOrder.includes(player.id)) continue;
      gamesPlayed++;
      for (const inn of game.innings) {
        const innNum = inn.inning;
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
        } else {
          benchInnings++;
        }
      }
    }

    const fieldInnings = (Object.values(posInnings) as number[]).reduce((s, n) => s + n, 0);
    return { player, gamesPlayed, fieldInnings, benchInnings, bullpenInnings, posInnings };
  });
}

// ─── Batting stats ────────────────────────────────────────────────────────────

type PlayerBatStats = {
  player: Player;
  gamesPlayed: number;
  plateAppearances: number;
  hits: number;
  walks: number;
};

function computeBatStats(players: Player[], games: Game[]): PlayerBatStats[] {
  return players.map((player) => {
    let gamesPlayed = 0, plateAppearances = 0, hits = 0, walks = 0;
    for (const game of games) {
      const gs = game.gameStats;
      if (!gs) continue;
      const entry = gs.hitting.find((h: HittingStats) => h.playerId === player.id);
      if (!entry) continue;
      // Backward compat: old records stored atBats instead of plateAppearances
      const pa = entry.plateAppearances ?? (entry as unknown as Record<string, number>).atBats ?? 0;
      if (pa > 0 || entry.hits > 0 || entry.walks > 0) {
        gamesPlayed++;
        plateAppearances += pa;
        hits += entry.hits;
        walks += entry.walks;
      }
    }
    return { player, gamesPlayed, plateAppearances, hits, walks };
  });
}

// ─── Pitching stats ───────────────────────────────────────────────────────────

type PlayerPitchStats = {
  player: Player;
  gamesPlayed: number;
  inningsPitched: number;
  pitches: number;
  strikeouts: number;
  hitsAllowed: number;
  walksAllowed: number;
};

function computePitchStats(players: Player[], games: Game[]): PlayerPitchStats[] {
  return players.map((player) => {
    let gamesPlayed = 0, inningsPitched = 0, pitches = 0, strikeouts = 0, hitsAllowed = 0, walksAllowed = 0;
    for (const game of games) {
      const gs = game.gameStats;
      if (!gs) continue;
      const entry = gs.pitching.find((p: PitchingGameStats) => p.playerId === player.id);
      if (!entry) continue;
      if (entry.inningsPitched > 0 || entry.pitches > 0) {
        gamesPlayed++;
        inningsPitched = addIP(inningsPitched, entry.inningsPitched);
        pitches += entry.pitches;
        strikeouts += entry.strikeouts;
        hitsAllowed += entry.hitsAllowed;
        walksAllowed += entry.walksAllowed;
      }
    }
    return { player, gamesPlayed, inningsPitched, pitches, strikeouts, hitsAllowed, walksAllowed };
  });
}

// ─── Shared primitives ────────────────────────────────────────────────────────

type PlaySortKey = "jersey" | "name" | "games" | "field" | "bench" | FieldPosition;
type BatSortKey = "jersey" | "name" | "games" | "ab" | "h" | "bb" | "avg" | "obp";
type PitchSortKey = "jersey" | "name" | "games" | "ip" | "pitches" | "k" | "h" | "bb" | "whip";

function sortPlay(rows: PlayerPlayStats[], key: PlaySortKey, dir: "asc" | "desc") {
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

function sortBat(rows: PlayerBatStats[], key: BatSortKey, dir: "asc" | "desc") {
  return [...rows].sort((a, b) => {
    let v = 0;
    if (key === "jersey") v = Number(a.player.jerseyNumber) - Number(b.player.jerseyNumber);
    else if (key === "name") v = a.player.firstName.localeCompare(b.player.firstName);
    else if (key === "games") v = a.gamesPlayed - b.gamesPlayed;
    else if (key === "ab") v = (a.plateAppearances - a.walks) - (b.plateAppearances - b.walks);
    else if (key === "h") v = a.hits - b.hits;
    else if (key === "bb") v = a.walks - b.walks;
    else if (key === "avg") {
      const abA = a.plateAppearances - a.walks;
      const abB = b.plateAppearances - b.walks;
      v = (abA > 0 ? a.hits / abA : 0) - (abB > 0 ? b.hits / abB : 0);
    } else if (key === "obp") {
      v = (a.plateAppearances > 0 ? (a.hits + a.walks) / a.plateAppearances : 0)
        - (b.plateAppearances > 0 ? (b.hits + b.walks) / b.plateAppearances : 0);
    }
    return dir === "asc" ? v : -v;
  });
}

function sortPitch(rows: PlayerPitchStats[], key: PitchSortKey, dir: "asc" | "desc") {
  return [...rows].sort((a, b) => {
    let v = 0;
    if (key === "jersey") v = Number(a.player.jerseyNumber) - Number(b.player.jerseyNumber);
    else if (key === "name") v = a.player.firstName.localeCompare(b.player.firstName);
    else if (key === "games") v = a.gamesPlayed - b.gamesPlayed;
    else if (key === "ip") v = a.inningsPitched - b.inningsPitched;
    else if (key === "pitches") v = a.pitches - b.pitches;
    else if (key === "k") v = a.strikeouts - b.strikeouts;
    else if (key === "h") v = a.hitsAllowed - b.hitsAllowed;
    else if (key === "bb") v = a.walksAllowed - b.walksAllowed;
    else if (key === "whip") {
      const wA = ipToDecimal(a.inningsPitched) > 0 ? (a.hitsAllowed + a.walksAllowed) / ipToDecimal(a.inningsPitched) : 0;
      const wB = ipToDecimal(b.inningsPitched) > 0 ? (b.hitsAllowed + b.walksAllowed) / ipToDecimal(b.inningsPitched) : 0;
      v = wA - wB;
    }
    return dir === "asc" ? v : -v;
  });
}

function Th<K extends string>({
  label, sortKey, current, dir, onSort, title, style,
}: {
  label: React.ReactNode;
  sortKey: K;
  current: K;
  dir: "asc" | "desc";
  onSort: (k: K) => void;
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
        fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em",
        textTransform: "uppercase",
        color: active ? C.green : C.muted,
        background: active ? C.greenBg : C.sub,
        borderBottom: `2px solid ${active ? C.greenBd : C.line}`,
        cursor: "pointer", whiteSpace: "nowrap", userSelect: "none", textAlign: "center",
        ...style,
      }}
    >
      {label}
      {active && <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.7 }}>{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

function Num({ n, pos, highlight }: { n: number; pos?: FieldPosition; highlight?: "bench" }) {
  if (n === 0) return <span style={{ color: C.faint2, fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 13 }}>0</span>;
  if (pos) {
    const z = ZONE_COL[pos];
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 26, height: 22, borderRadius: 5,
        background: z.bg, color: z.fg, border: `1px solid ${z.bd}`,
        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 12.5, fontWeight: 700,
      }}>{n}</span>
    );
  }
  if (highlight === "bench") {
    const tone = n >= 4 ? { bg: C.amberBg, fg: C.amber, bd: C.amberBd } : { bg: "#f8f5ee", fg: "#7c776c", bd: C.line };
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 26, height: 22, borderRadius: 5,
        background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`,
        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 12.5, fontWeight: 700,
      }}>{n}</span>
    );
  }
  return <span style={{ fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700, color: C.ink }}>{n}</span>;
}

function MonoNum({ val, faint }: { val: string | number; faint?: boolean }) {
  const s = String(val);
  return (
    <span style={{
      fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
      fontSize: 13, fontWeight: faint ? 400 : 700,
      color: C.ink,
    }}>
      {s}
    </span>
  );
}

function PlayerNameCell({ player }: { player: Player }) {
  return (
    <td style={{ padding: "10px 12px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 24, height: 24, borderRadius: 5, marginRight: 8,
        background: "#2b2a26", color: "#f3f1ec",
        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 11, fontWeight: 700,
      }}>
        {player.jerseyNumber}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
        {player.firstName} {player.lastInitial}
      </span>
    </td>
  );
}

// ─── Tab views ────────────────────────────────────────────────────────────────

function PlayingTimeView({ players, games }: { players: Player[]; games: Game[] }) {
  const [sort, setSort] = useState<PlaySortKey>("jersey");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const stats = useMemo(() => computePlayStats(players, games), [players, games]);
  const sorted = useMemo(() => sortPlay(stats, sort, sortDir), [stats, sort, sortDir]);
  const activePosColumns = FIELD_POSITIONS.filter((pos) => stats.some((s) => (s.posInnings[pos] ?? 0) > 0));
  const hasBullpen = stats.some((s) => s.bullpenInnings > 0);

  function handleSort(key: PlaySortKey) {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setSortDir("desc"); }
  }

  if (games.length === 0) return <EmptyState msg="Stats appear once you finalize at least one past game." />;

  return (
    <div className="dd-card" style={{ padding: 0, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
        <thead>
          <tr>
            <Th label="#" sortKey="jersey" current={sort} dir={sortDir} onSort={handleSort} title="Sort by jersey number" style={{ textAlign: "left", paddingLeft: 20, width: 48 }} />
            <Th label="Player" sortKey="name" current={sort} dir={sortDir} onSort={handleSort} title="Sort by first name" style={{ textAlign: "left", paddingLeft: 12 }} />
            <Th label="Games" sortKey="games" current={sort} dir={sortDir} onSort={handleSort} title="Games played" />
            <Th label="Field" sortKey="field" current={sort} dir={sortDir} onSort={handleSort} title="Total innings on the field" />
            <Th label="Bench" sortKey="bench" current={sort} dir={sortDir} onSort={handleSort} title="Total bench innings" />
            {hasBullpen && <th style={{ padding: "10px 8px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: C.muted, background: C.sub, borderBottom: `2px solid ${C.line}`, fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", whiteSpace: "nowrap", textAlign: "center" }}>Bullpen</th>}
            <th style={{ width: 1, padding: 0, background: C.line, borderBottom: `2px solid ${C.line}` }} />
            {activePosColumns.map((pos) => (
              <Th key={pos} label={pos} sortKey={pos} current={sort} dir={sortDir} onSort={handleSort} title={`Sort by innings at ${pos}`} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const { player, gamesPlayed, fieldInnings, benchInnings, bullpenInnings, posInnings } = row;
            const totalActive = fieldInnings + benchInnings + bullpenInnings;
            return (
              <tr key={player.id} style={{ background: i % 2 === 0 ? C.card : C.sub }}>
                <td style={{ padding: "10px 8px 10px 20px", verticalAlign: "middle" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, height: 28, borderRadius: 6, background: "#2b2a26", color: "#f3f1ec", fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 12, fontWeight: 700 }}>
                    {player.jerseyNumber}
                  </span>
                </td>
                <td style={{ padding: "10px 12px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{player.firstName} {player.lastInitial}</span>
                </td>
                <td style={{ padding: "10px 8px", verticalAlign: "middle", textAlign: "center" }}><Num n={gamesPlayed} /></td>
                <td style={{ padding: "10px 8px", verticalAlign: "middle", textAlign: "center" }}>
                  <span style={{ fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700, color: fieldInnings === 0 ? C.red : fieldInnings < 2 * gamesPlayed ? C.amber : C.green }}>
                    {fieldInnings === 0 ? "0" : fieldInnings}
                  </span>
                  {totalActive > 0 && <span style={{ color: C.faint2, fontSize: 11, marginLeft: 3 }}>/{totalActive}</span>}
                </td>
                <td style={{ padding: "10px 8px", verticalAlign: "middle", textAlign: "center" }}><Num n={benchInnings} highlight="bench" /></td>
                {hasBullpen && <td style={{ padding: "10px 8px", verticalAlign: "middle", textAlign: "center" }}><Num n={bullpenInnings} /></td>}
                <td style={{ width: 1, padding: 0, background: C.line }} />
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
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", padding: "12px 20px", borderTop: `1px solid ${C.line}`, background: C.sub, fontSize: 11.5, color: C.faint }}>
        <span style={{ fontWeight: 600, color: C.muted }}>Field total:</span>
        <span><span style={{ color: C.green, fontWeight: 700 }}>green</span> = ≥ 2 inn/game avg</span>
        <span><span style={{ color: C.amber, fontWeight: 700 }}>amber</span> = below avg</span>
        <span><span style={{ color: C.red, fontWeight: 700 }}>red</span> = 0 field innings</span>
        <span style={{ marginLeft: "auto", color: C.faint2 }}>Field/Total shows field innings out of all available innings</span>
      </div>
    </div>
  );
}

function BattingView({ players, games }: { players: Player[]; games: Game[] }) {
  const [sort, setSort] = useState<BatSortKey>("jersey");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const stats = useMemo(() => computeBatStats(players, games), [players, games]);
  const hasAny = stats.some((s) => s.plateAppearances > 0 || s.hits > 0 || s.walks > 0);
  const sorted = useMemo(() => sortBat(stats, sort, sortDir), [stats, sort, sortDir]);

  function handleSort(key: BatSortKey) {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setSortDir("desc"); }
  }

  if (!hasAny) return <EmptyState msg="No batting stats logged yet. Open a game and tap the stats icon to add stats." />;

  return (
    <div className="dd-card" style={{ padding: 0, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th label="Player" sortKey="name" current={sort} dir={sortDir} onSort={handleSort} style={{ textAlign: "left", paddingLeft: 16 }} />
            <Th label="G" sortKey="games" current={sort} dir={sortDir} onSort={handleSort} title="Games with stats logged" />
            <Th label="AB" sortKey="ab" current={sort} dir={sortDir} onSort={handleSort} title="At bats (PA − BB)" />
            <Th label="H" sortKey="h" current={sort} dir={sortDir} onSort={handleSort} title="Hits" />
            <Th label="BB" sortKey="bb" current={sort} dir={sortDir} onSort={handleSort} title="Walks (base on balls)" />
            <Th label="AVG" sortKey="avg" current={sort} dir={sortDir} onSort={handleSort} title="Batting average (H / AB)" />
            <Th label="OBP" sortKey="obp" current={sort} dir={sortDir} onSort={handleSort} title="On-base percentage ((H + BB) / PA)" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const ab = Math.max(0, row.plateAppearances - row.walks);
            const avg = ab > 0 ? (row.hits / ab).toFixed(3).replace(/^0/, "") : ".000";
            const obp = row.plateAppearances > 0 ? ((row.hits + row.walks) / row.plateAppearances).toFixed(3).replace(/^0/, "") : ".000";
            return (
              <tr key={row.player.id} style={{ background: i % 2 === 0 ? C.card : C.sub }}>
                <PlayerNameCell player={row.player} />
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={row.gamesPlayed} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={ab} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={row.hits} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={row.walks} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={avg} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={obp} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PitchingView({ players, games }: { players: Player[]; games: Game[] }) {
  const [sort, setSort] = useState<PitchSortKey>("jersey");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const stats = useMemo(() => computePitchStats(players, games), [players, games]);
  const active = useMemo(() => stats.filter((s) => s.pitches > 0), [stats]);
  const hasAny = active.length > 0;
  const sorted = useMemo(() => sortPitch(active, sort, sortDir), [active, sort, sortDir]);

  function handleSort(key: PitchSortKey) {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setSortDir("desc"); }
  }

  if (!hasAny) return <EmptyState msg="No pitching stats logged yet. Open a game and tap the stats icon to add stats." />;

  return (
    <div className="dd-card" style={{ padding: 0, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th label="Player" sortKey="name" current={sort} dir={sortDir} onSort={handleSort} style={{ textAlign: "left", paddingLeft: 16 }} />
            <Th label="G" sortKey="games" current={sort} dir={sortDir} onSort={handleSort} title="Games pitched" />
            <Th label="IP" sortKey="ip" current={sort} dir={sortDir} onSort={handleSort} title="Innings pitched" />
            <Th label="P" sortKey="pitches" current={sort} dir={sortDir} onSort={handleSort} title="Total pitches" />
            <Th label="K" sortKey="k" current={sort} dir={sortDir} onSort={handleSort} title="Strikeouts" />
            <Th label="H" sortKey="h" current={sort} dir={sortDir} onSort={handleSort} title="Hits allowed" />
            <Th label="BB" sortKey="bb" current={sort} dir={sortDir} onSort={handleSort} title="Walks allowed" />
            <Th label="WHIP" sortKey="whip" current={sort} dir={sortDir} onSort={handleSort} title="Walks + hits per inning pitched ((BB + H) / IP)" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const ipDec = ipToDecimal(row.inningsPitched);
            const whip = ipDec > 0 ? ((row.hitsAllowed + row.walksAllowed) / ipDec).toFixed(2) : "0.00";
            return (
              <tr key={row.player.id} style={{ background: i % 2 === 0 ? C.card : C.sub }}>
                <PlayerNameCell player={row.player} />
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={row.gamesPlayed} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={formatIP(row.inningsPitched)} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={row.pitches} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={row.strikeouts} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={row.hitsAllowed} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={row.walksAllowed} /></td>
                <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><MonoNum val={whip} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.line}`, background: C.sub, fontSize: 11.5, color: C.faint }}>
        IP uses baseball notation: 2.1 = 2⅓ innings, 2.2 = 2⅔ innings
      </div>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="dd-card" style={{ padding: "40px 32px", textAlign: "center", color: C.faint }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No data yet</div>
      <div style={{ fontSize: 13 }}>{msg}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "playing-time" | "batting" | "pitching";

export default function DashboardPage() {
  const players = useDiamondDraftStore((s) => s.players);
  const games = useDiamondDraftStore((s) => s.games);
  const [tab, setTab] = useState<Tab>("playing-time");

  const today = new Date().toISOString().slice(0, 10);

  const eligibleGames = useMemo(
    () => games.filter((g) => g.status === "finalized" && g.date <= today),
    [games, today]
  );

  const allGamesWithStats = useMemo(
    () => games.filter((g) => g.gameStats),
    [games]
  );

  const gameLabel = eligibleGames.length === 1 ? "1 finalized game" : `${eligibleGames.length} finalized games`;
  const dateLabel = new Date(today + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const subtitle =
    tab === "playing-time"
      ? eligibleGames.length === 0
        ? "No finalized games yet."
        : `${gameLabel} through ${dateLabel} · ${players.length} players`
      : allGamesWithStats.length === 0
        ? "No stats logged yet."
        : `${allGamesWithStats.length} game${allGamesWithStats.length === 1 ? "" : "s"} with stats · ${players.length} players`;

  return (
    <div className="dd-wrap">
      <PageHeader eyebrow="Season overview" title="Player Stats" subtitle={subtitle} />

      {/* Tab selector */}
      <div className="dd-seg" style={{ marginBottom: 20 }}>
        {([
          ["playing-time", "Playing Time"],
          ["batting", "Batting"],
          ["pitching", "Pitching"],
        ] as const).map(([key, label]) => (
          <button key={key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "playing-time" && <PlayingTimeView players={players} games={eligibleGames} />}
      {tab === "batting" && <BattingView players={players} games={allGamesWithStats} />}
      {tab === "pitching" && <PitchingView players={players} games={allGamesWithStats} />}
    </div>
  );
}
