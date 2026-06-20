"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useDiamondDraftStore } from "@/lib/store";
import type { HittingStats, PitchingGameStats, GameStats, Player } from "@/lib/types";
import { C } from "@/components/AppShell";

// ─── Baseball IP helpers ──────────────────────────────────────────────────────

/** Parse a baseball "2.1" / "2.2" / "3" string into a stored notation number. */
function parseIP(raw: string): number | null {
  const s = raw.trim();
  if (s === "" || s === "0") return 0;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  const frac = Math.round((n - Math.floor(n)) * 10);
  if (frac > 2) return null; // .3+ is invalid in baseball notation
  return n;
}

function formatIP(n: number): string {
  if (n === 0) return "";
  return String(n);
}

// ─── Editable number cell ────────────────────────────────────────────────────

function NumInput({
  value,
  onChange,
  placeholder = "0",
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(value === 0 ? "" : String(value));

  function commit(s: string) {
    const n = parseInt(s, 10);
    if (!isNaN(n) && n >= 0) onChange(n);
    else if (s === "") onChange(0);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      placeholder={placeholder}
      onChange={(e) => {
        setRaw(e.target.value);
        commit(e.target.value);
      }}
      onBlur={() => {
        if (raw === "" || raw === "0") setRaw("");
        else setRaw(String(value));
      }}
      style={{
        width: 52, textAlign: "center", padding: "5px 4px",
        border: `1px solid ${C.line}`, borderRadius: 6,
        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
        fontSize: 13, color: C.ink, background: C.card,
        outline: "none",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = C.blue; }}
    />
  );
}

function IPInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [raw, setRaw] = useState(value === 0 ? "" : formatIP(value));
  const [err, setErr] = useState(false);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder="0"
      onChange={(e) => {
        setRaw(e.target.value);
        const parsed = parseIP(e.target.value);
        if (parsed !== null) { onChange(parsed); setErr(false); }
        else setErr(true);
      }}
      onBlur={() => {
        const parsed = parseIP(raw);
        if (parsed === null) { setRaw(formatIP(value)); setErr(false); }
        else if (parsed === 0) setRaw("");
        else setRaw(formatIP(parsed));
      }}
      style={{
        width: 52, textAlign: "center", padding: "5px 4px",
        border: `1px solid ${err ? C.red : C.line}`, borderRadius: 6,
        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
        fontSize: 13, color: err ? C.red : C.ink, background: C.card,
        outline: "none",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = err ? C.red : C.blue; }}
    />
  );
}

// ─── Column header ────────────────────────────────────────────────────────────

function ColHeader({ label, title }: { label: string; title?: string }) {
  return (
    <th
      title={title}
      style={{
        padding: "9px 10px",
        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
        fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em",
        textTransform: "uppercase", color: C.muted, background: C.sub,
        borderBottom: `2px solid ${C.line}`, textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </th>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GameStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const games = useDiamondDraftStore((s) => s.games);
  const players = useDiamondDraftStore((s) => s.players);
  const updateGameStats = useDiamondDraftStore((s) => s.updateGameStats);

  const game = games.find((g) => g.id === id);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Build roster: prefer live player data, fall back to snapshot
  const liveById = new Map(players.map((p) => [p.id, p]));
  const gameRoster: Player[] = game
    ? (game.rosterSnapshot.length > 0
        ? game.rosterSnapshot.map((p) => liveById.get(p.id) ?? p)
        : players)
    : [];

  // ── Hitting state ─────────────────────────────────────────────────────────
  const [hitting, setHitting] = useState<Record<string, HittingStats>>(() => {
    const init: Record<string, HittingStats> = {};
    const existing = game?.gameStats?.hitting ?? [];
    for (const p of gameRoster) {
      const found = existing.find((h) => h.playerId === p.id);
      // Backward compat: old records stored atBats instead of plateAppearances
      const legacyAB = found ? (found as unknown as Record<string, number>).atBats : undefined;
      init[p.id] = found
        ? { ...found, plateAppearances: found.plateAppearances ?? legacyAB ?? 0 }
        : { playerId: p.id, plateAppearances: 0, hits: 0, walks: 0 };
    }
    return init;
  });

  // ── Pitching state ────────────────────────────────────────────────────────
  const [pitching, setPitching] = useState<Record<string, PitchingGameStats>>(() => {
    const init: Record<string, PitchingGameStats> = {};
    const existing = game?.gameStats?.pitching ?? [];
    for (const p of gameRoster) {
      const found = existing.find((pc) => pc.playerId === p.id);
      init[p.id] = found ?? {
        playerId: p.id, inningsPitched: 0, pitches: 0,
        strikeouts: 0, hitsAllowed: 0, walksAllowed: 0,
      };
    }
    return init;
  });

  const updateHit = (playerId: string, field: keyof Omit<HittingStats, "playerId">, val: number) => {
    setHitting((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: val } }));
    setSaved(false);
  };

  const updatePitch = (playerId: string, field: keyof Omit<PitchingGameStats, "playerId">, val: number) => {
    setPitching((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: val } }));
    setSaved(false);
  };

  async function handleSave() {
    if (!game) return;
    setSaving(true);
    try {
      const stats: GameStats = {
        hitting: Object.values(hitting),
        pitching: Object.values(pitching),
      };
      await updateGameStats(game.id, stats);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!game) {
    return (
      <div style={{ textAlign: "center", padding: "96px 0", color: C.faint }}>
        Game not found.{" "}
        <Link href="/games" style={{ color: C.green }}>Back to games</Link>
      </div>
    );
  }

  const gameLabel = game.opponent ? `vs ${game.opponent}` : game.date;

  const nameCellStyle: React.CSSProperties = {
    padding: "10px 14px", verticalAlign: "middle", whiteSpace: "nowrap",
    fontSize: 14, fontWeight: 600, color: C.ink,
  };

  return (
    <div className="dd-wrap">
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <Link href="/games" className="dd-crumb">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M11.5 4l-5 5 5 5"/>
          </svg>
          Games
        </Link>
        <span style={{ color: C.faint2, fontSize: 13 }}>/</span>
        <Link href={`/games/${game.id}`} className="dd-crumb">{gameLabel}</Link>
        <span style={{ color: C.faint2, fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, color: C.muted }}>Stats</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="dd-eyebrow">Game stats</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", margin: "4px 0 0", color: C.ink }}>
            {gameLabel}
          </h1>
          <p style={{ fontSize: 13.5, color: C.muted, margin: "4px 0 0" }}>
            {new Date(game.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
            {" · "}{gameRoster.length} players
          </p>
        </div>
        <button
          className="dd-btn pri"
          onClick={handleSave}
          disabled={saving}
          style={saved ? { background: C.green, borderColor: C.green } : {}}
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save stats"}
        </button>
      </div>

      {/* ── Hitting ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>
          Hitting
        </div>
        <div className="dd-card" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{
                  padding: "9px 14px", textAlign: "left", fontSize: 10.5, fontWeight: 700,
                  letterSpacing: ".06em", textTransform: "uppercase", color: C.muted,
                  background: C.sub, borderBottom: `2px solid ${C.line}`, whiteSpace: "nowrap",
                }}>
                  Player
                </th>
                <ColHeader label="PA" title="Plate appearances (AB + BB)" />
                <ColHeader label="H" title="Hits" />
                <ColHeader label="BB" title="Walks (base on balls)" />
                <ColHeader label="AB" title="At bats — calculated as PA − BB" />
                <ColHeader label="AVG" title="Batting average (H / AB)" />
              </tr>
            </thead>
            <tbody>
              {gameRoster.map((player, i) => {
                const h = hitting[player.id];
                if (!h) return null;
                const ab = Math.max(0, h.plateAppearances - h.walks);
                const avg = ab > 0 ? (h.hits / ab).toFixed(3).replace(/^0/, "") : ".000";
                return (
                  <tr key={player.id} style={{ background: i % 2 === 0 ? C.card : C.sub }}>
                    <td style={nameCellStyle}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        minWidth: 24, height: 24, borderRadius: 5, marginRight: 8,
                        background: "#2b2a26", color: "#f3f1ec",
                        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {player.jerseyNumber}
                      </span>
                      {player.firstName} {player.lastInitial}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle" }}>
                      <NumInput value={h.plateAppearances} onChange={(v) => updateHit(player.id, "plateAppearances", v)} />
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle" }}>
                      <NumInput value={h.hits} onChange={(v) => updateHit(player.id, "hits", v)} />
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle" }}>
                      <NumInput value={h.walks} onChange={(v) => updateHit(player.id, "walks", v)} />
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle",
                      fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700, color: C.muted }}>
                      {ab}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle",
                      fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700, color: C.muted }}>
                      {avg}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pitching ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>
          Pitching
        </div>
        <div className="dd-card" style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{
                  padding: "9px 14px", textAlign: "left", fontSize: 10.5, fontWeight: 700,
                  letterSpacing: ".06em", textTransform: "uppercase", color: C.muted,
                  background: C.sub, borderBottom: `2px solid ${C.line}`, whiteSpace: "nowrap",
                }}>
                  Player
                </th>
                <ColHeader label="IP" title="Innings pitched (baseball notation: 2.1 = 2⅓ innings)" />
                <ColHeader label="P" title="Pitches thrown" />
                <ColHeader label="K" title="Strikeouts" />
                <ColHeader label="H" title="Hits allowed" />
                <ColHeader label="BB" title="Walks allowed" />
              </tr>
            </thead>
            <tbody>
              {gameRoster.map((player, i) => {
                const p = pitching[player.id];
                if (!p) return null;
                return (
                  <tr key={player.id} style={{ background: i % 2 === 0 ? C.card : C.sub }}>
                    <td style={nameCellStyle}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        minWidth: 24, height: 24, borderRadius: 5, marginRight: 8,
                        background: "#2b2a26", color: "#f3f1ec",
                        fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {player.jerseyNumber}
                      </span>
                      {player.firstName} {player.lastInitial}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle" }}>
                      <IPInput value={p.inningsPitched} onChange={(v) => updatePitch(player.id, "inningsPitched", v)} />
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle" }}>
                      <NumInput value={p.pitches} onChange={(v) => updatePitch(player.id, "pitches", v)} />
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle" }}>
                      <NumInput value={p.strikeouts} onChange={(v) => updatePitch(player.id, "strikeouts", v)} />
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle" }}>
                      <NumInput value={p.hitsAllowed} onChange={(v) => updatePitch(player.id, "hitsAllowed", v)} />
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle" }}>
                      <NumInput value={p.walksAllowed} onChange={(v) => updatePitch(player.id, "walksAllowed", v)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
          IP uses baseball notation: 2.1 = 2⅓ innings, 2.2 = 2⅔ innings
        </div>
      </div>

      {/* Save footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 8 }}>
        <Link href={`/games/${game.id}`} className="dd-btn sec">
          Back to lineup
        </Link>
        <button
          className="dd-btn pri"
          onClick={handleSave}
          disabled={saving}
          style={saved ? { background: C.green, borderColor: C.green } : {}}
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save stats"}
        </button>
      </div>
    </div>
  );
}
