"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useDiamondDraftStore } from "@/lib/store";
import type { GameStats, HittingStats, PitchingGameStats } from "@/lib/types";
import { C, PageHeader } from "@/components/AppShell";

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cols: string[] = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      cols.push(cur.trim());
      return cols;
    });
}

function normalizeHeaders(row: string[]): string[] {
  return row.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "_"));
}

// ─── Template downloads ───────────────────────────────────────────────────────

const GAMES_TEMPLATE = "external_id,date,opponent\nG1,2024-05-15,Tigers\nG2,2024-05-22,Bears\n";
const HITTING_TEMPLATE =
  "game_id,jersey,pa,h,bb\n" +
  "G1,7,4,2,1\n" +
  "G1,12,3,1,0\n";

const PITCHING_TEMPLATE =
  "game_id,jersey,ip,pitches,k,hits_allowed,walks_allowed\n" +
  "G1,12,2.1,38,5,2,1\n" +
  "G1,5,1,22,2,1,0\n";

function downloadTemplate(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Shared section card ─────────────────────────────────────────────────────

function SectionCard({ title, description, children }: {
  title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 13, color: C.faint, marginTop: 3 }}>{description}</div>
      </div>
      {children}
    </div>
  );
}

function FormatHint({ cols }: { cols: { name: string; note?: string }[] }) {
  return (
    <div style={{
      background: C.sub, border: `1px solid ${C.line}`, borderRadius: 10,
      padding: "12px 16px", fontSize: 12.5, color: C.muted, marginBottom: 14,
      fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
    }}>
      <span style={{ fontWeight: 700, color: C.ink }}>Columns: </span>
      {cols.map((c, i) => (
        <span key={c.name}>
          <span style={{ color: C.ink }}>{c.name}</span>
          {c.note && <span style={{ color: C.faint }}> ({c.note})</span>}
          {i < cols.length - 1 && <span style={{ color: C.faint2 }}>, </span>}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ type, text }: { type: "ok" | "warn" | "err"; text: string }) {
  const colors = {
    ok:   { bg: C.greenBg, fg: C.green, bd: C.greenBd },
    warn: { bg: C.amberBg, fg: C.amber, bd: C.amberBd },
    err:  { bg: C.redBg,   fg: C.red,   bd: C.redBd },
  }[type];
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 5,
      fontSize: 11.5, fontWeight: 600,
      background: colors.bg, color: colors.fg, border: `1px solid ${colors.bd}`,
    }}>{text}</span>
  );
}

// ─── Shared file/paste input ─────────────────────────────────────────────────

function CSVInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange((ev.target?.result as string) ?? "");
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={6}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "10px 12px", borderRadius: 8,
          border: `1px solid ${C.line}`, background: C.card,
          fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)",
          fontSize: 12.5, color: C.ink, resize: "vertical",
          outline: "none",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = C.blue; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = C.line; }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="dd-btn sec sm" onClick={() => fileRef.current?.click()}>
          Upload CSV file
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleFile} />
      </div>
    </div>
  );
}

// ─── Games import ─────────────────────────────────────────────────────────────

type GameRow = { externalId: string; date: string; opponent: string; error?: string };

function parseGamesCSV(raw: string): GameRow[] {
  const rows = parseCSV(raw);
  if (rows.length < 2) return [];
  const headers = normalizeHeaders(rows[0]);
  const idIdx  = headers.indexOf("external_id");
  const dateIdx = headers.indexOf("date");
  const oppIdx  = headers.indexOf("opponent");

  return rows.slice(1).map((cols) => {
    const externalId = cols[idIdx]?.trim() ?? "";
    const date       = cols[dateIdx]?.trim() ?? "";
    const opponent   = cols[oppIdx]?.trim() ?? "";
    let error: string | undefined;
    if (!externalId) error = "Missing external_id";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) error = "Date must be YYYY-MM-DD";
    return { externalId, date, opponent, error };
  });
}

function GamesImport() {
  const createGame       = useDiamondDraftStore((s) => s.createGame);
  const setGameExternalId = useDiamondDraftStore((s) => s.setGameExternalId);
  const games            = useDiamondDraftStore((s) => s.games);

  const [csv, setCsv]         = useState("");
  const [preview, setPreview] = useState<GameRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult]   = useState<{ externalId: string; gameId: string }[]>([]);
  const [error, setError]     = useState("");

  function handlePreview() {
    setError(""); setResult([]);
    const rows = parseGamesCSV(csv);
    if (rows.length === 0) { setError("No data rows found. Check your CSV has headers and at least one data row."); return; }
    setPreview(rows);
  }

  async function handleImport() {
    const valid = preview.filter((r) => !r.error);
    if (valid.length === 0) return;
    setImporting(true);
    const created: { externalId: string; gameId: string }[] = [];
    try {
      for (const row of valid) {
        const existingExternal = games.find((g) => g.externalId === row.externalId);
        if (existingExternal) {
          created.push({ externalId: row.externalId, gameId: existingExternal.id });
          continue;
        }
        const game = await createGame({ date: row.date, opponent: row.opponent });
        await setGameExternalId(game.id, row.externalId);
        created.push({ externalId: row.externalId, gameId: game.id });
      }
      setResult(created);
      setPreview([]);
      setCsv("");
    } finally {
      setImporting(false);
    }
  }

  const validRows  = preview.filter((r) => !r.error);
  const errorRows  = preview.filter((r) => r.error);

  return (
    <SectionCard
      title="1 — Import Games"
      description="Create games from a CSV. Each game gets an external ID you'll reference in the stats import."
    >
      <FormatHint cols={[
        { name: "external_id", note: "your short ID, e.g. G1" },
        { name: "date", note: "YYYY-MM-DD" },
        { name: "opponent" },
      ]} />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="dd-btn sec sm" onClick={() => downloadTemplate(GAMES_TEMPLATE, "games-template.csv")}>
          Download template
        </button>
      </div>

      <CSVInput value={csv} onChange={setCsv} placeholder={"external_id,date,opponent\nG1,2024-05-15,Tigers\nG2,2024-05-22,Bears"} />

      {error && (
        <div style={{ marginTop: 10, fontSize: 13, color: C.red }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button className="dd-btn sec" onClick={handlePreview} disabled={!csv.trim()}>Preview</button>
        {preview.length > 0 && (
          <button className="dd-btn pri" onClick={handleImport} disabled={importing || validRows.length === 0}>
            {importing ? "Importing…" : `Import ${validRows.length} game${validRows.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {preview.length > 0 && (
        <div className="dd-card" style={{ padding: 0, overflow: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["External ID", "Date", "Opponent", "Status"].map((h) => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, background: C.sub, borderBottom: `2px solid ${C.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? C.card : C.sub }}>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700 }}>{row.externalId || <span style={{ color: C.faint }}>—</span>}</td>
                  <td style={{ padding: "9px 14px", fontSize: 13 }}>{row.date}</td>
                  <td style={{ padding: "9px 14px", fontSize: 13 }}>{row.opponent || <span style={{ color: C.faint }}>No opponent</span>}</td>
                  <td style={{ padding: "9px 14px" }}>
                    {row.error
                      ? <StatusBadge type="err" text={row.error} />
                      : games.find((g) => g.externalId === row.externalId)
                        ? <StatusBadge type="warn" text="Already exists — will skip" />
                        : <StatusBadge type="ok" text="Ready" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {errorRows.length > 0 && (
            <div style={{ padding: "10px 16px", background: C.redBg, borderTop: `1px solid ${C.redBd}`, fontSize: 12.5, color: C.red }}>
              {errorRows.length} row{errorRows.length > 1 ? "s" : ""} have errors and will be skipped.
            </div>
          )}
        </div>
      )}

      {result.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.green, marginBottom: 10 }}>
            ✓ {result.length} game{result.length > 1 ? "s" : ""} imported
          </div>
          <div className="dd-card" style={{ padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["External ID", "Internal Game ID"].map((h) => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, background: C.sub, borderBottom: `2px solid ${C.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? C.card : C.sub }}>
                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700 }}>{r.externalId}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 12, color: C.muted }}>{r.gameId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Shared stats row resolution ─────────────────────────────────────────────

type BaseRow = {
  gameId: string;
  jersey: string;
  resolvedGameId?: string;
  resolvedPlayerId?: string;
  playerName?: string;
  gameName?: string;
  warning?: string;
};

function resolveRow<T extends BaseRow>(
  row: T,
  games: { id: string; externalId?: string; date: string; opponent?: string }[],
  players: { id: string; jerseyNumber: string; firstName: string; lastInitial: string }[]
): T {
  const game   = games.find((g) => g.externalId === row.gameId);
  const player = players.find((p) => p.jerseyNumber === row.jersey);
  const warnings: string[] = [];
  if (!game)   warnings.push(`No game with external ID "${row.gameId}"`);
  if (!player) warnings.push(`No player with jersey #${row.jersey}`);
  return {
    ...row,
    resolvedGameId:   game?.id,
    resolvedPlayerId: player?.id,
    playerName: player ? `${player.firstName} ${player.lastInitial}` : undefined,
    gameName: game ? (game.opponent ? `vs ${game.opponent} (${game.date})` : game.date) : undefined,
    warning: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

function num(cols: string[], idx: number) {
  if (idx < 0) return 0;
  const v = parseFloat(cols[idx]?.trim() ?? "");
  return isNaN(v) ? 0 : v;
}

function PreviewControls({ csv, onPreview, onImport, importing, validCount }: {
  csv: string; onPreview: () => void; onImport: () => void;
  importing: boolean; validCount: number;
}) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
      <button className="dd-btn sec" onClick={onPreview} disabled={!csv.trim()}>Preview</button>
      {validCount >= 0 && (
        <button className="dd-btn pri" onClick={onImport} disabled={importing || validCount === 0}>
          {importing ? "Importing…" : `Import ${validCount} row${validCount === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}

function SuccessBanner({ count, label }: { count: number; label: string }) {
  return (
    <div style={{ marginTop: 14, padding: "12px 16px", background: C.greenBg, border: `1px solid ${C.greenBd}`, borderRadius: 10, fontSize: 13.5, fontWeight: 700, color: C.green }}>
      ✓ {count} {label}{count === 1 ? "" : "s"} imported successfully.
    </div>
  );
}

function WarnFooter({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div style={{ padding: "10px 16px", background: C.redBg, borderTop: `1px solid ${C.redBd}`, fontSize: 12.5, color: C.red }}>
      {count} row{count > 1 ? "s" : ""} could not be matched and will be skipped.
    </div>
  );
}

function GamePlayerCells({ row }: { row: BaseRow }) {
  return (
    <>
      <td style={{ padding: "8px 10px", fontSize: 13 }}>
        {row.gameName ?? <span style={{ color: C.red }}>{row.gameId}</span>}
      </td>
      <td style={{ padding: "8px 10px", fontSize: 13 }}>
        {row.playerName
          ? <span>{row.playerName} <span style={{ color: C.faint, fontSize: 11 }}>#{row.jersey}</span></span>
          : <span style={{ color: C.red }}>#{row.jersey}</span>}
      </td>
    </>
  );
}

// ─── Hitting import ───────────────────────────────────────────────────────────

type HittingRow = BaseRow & { pa: number; h: number; bb: number };

function parseHittingCSV(raw: string): HittingRow[] {
  const rows = parseCSV(raw);
  if (rows.length < 2) return [];
  const headers = normalizeHeaders(rows[0]);
  const col = (name: string) => headers.indexOf(name);
  return rows.slice(1).map((cols) => ({
    gameId: cols[col("game_id")]?.trim() ?? "",
    jersey: cols[col("jersey")]?.trim() ?? "",
    pa: num(cols, col("pa")),
    h:  num(cols, col("h")),
    bb: num(cols, col("bb")),
  }));
}

function HittingImport() {
  const games           = useDiamondDraftStore((s) => s.games);
  const players         = useDiamondDraftStore((s) => s.players);
  const updateGameStats = useDiamondDraftStore((s) => s.updateGameStats);

  const [csv, setCsv]       = useState("");
  const [preview, setPreview] = useState<HittingRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported]   = useState(-1);
  const [error, setError]         = useState("");

  function handlePreview() {
    setError(""); setImported(-1);
    const raw = parseHittingCSV(csv);
    if (raw.length === 0) { setError("No data rows found."); return; }
    setPreview(raw.map((r) => resolveRow(r, games, players)));
  }

  async function handleImport() {
    const valid = preview.filter((r) => !r.warning);
    if (valid.length === 0) return;
    setImporting(true);
    const byGame = new Map<string, HittingRow[]>();
    for (const row of valid) {
      if (!byGame.has(row.resolvedGameId!)) byGame.set(row.resolvedGameId!, []);
      byGame.get(row.resolvedGameId!)!.push(row);
    }
    try {
      for (const [gameId, rows] of byGame) {
        const game = games.find((g) => g.id === gameId);
        if (!game) continue;
        const existing = game.gameStats ?? { hitting: [], pitching: [] };
        const hitting: HittingStats[] = [...existing.hitting];
        for (const row of rows) {
          const entry: HittingStats = { playerId: row.resolvedPlayerId!, plateAppearances: row.pa, hits: row.h, walks: row.bb };
          const idx = hitting.findIndex((h) => h.playerId === entry.playerId);
          if (idx >= 0) hitting[idx] = entry; else hitting.push(entry);
        }
        await updateGameStats(gameId, { hitting, pitching: existing.pitching });
      }
      setImported(valid.length);
      setPreview([]); setCsv("");
    } finally {
      setImporting(false);
    }
  }

  const validRows = preview.filter((r) => !r.warning);
  const warnRows  = preview.filter((r) => r.warning);
  const mono: React.CSSProperties = { fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 12.5, textAlign: "center" };

  return (
    <SectionCard title="2 — Import Hitting Stats" description="One row per player per game. Players matched by jersey number.">
      <FormatHint cols={[
        { name: "game_id", note: "external_id from games import" },
        { name: "jersey" },
        { name: "pa", note: "plate appearances" },
        { name: "h", note: "hits" },
        { name: "bb", note: "walks" },
      ]} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="dd-btn sec sm" onClick={() => downloadTemplate(HITTING_TEMPLATE, "hitting-template.csv")}>
          Download template
        </button>
      </div>
      <CSVInput value={csv} onChange={setCsv} placeholder={"game_id,jersey,pa,h,bb\nG1,7,4,2,1\nG1,12,3,1,0"} />
      {error && <div style={{ marginTop: 10, fontSize: 13, color: C.red }}>{error}</div>}
      <PreviewControls csv={csv} onPreview={handlePreview} onImport={handleImport} importing={importing} validCount={preview.length > 0 ? validRows.length : -1} />
      {preview.length > 0 && (
        <div className="dd-card" style={{ padding: 0, overflow: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Game", "Player", "PA", "H", "BB", "Status"].map((h) => (
                  <th key={h} style={{ padding: "9px 10px", textAlign: h === "Game" || h === "Player" || h === "Status" ? "left" : "center", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, background: C.sub, borderBottom: `2px solid ${C.line}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? C.card : C.sub }}>
                  <GamePlayerCells row={row} />
                  <td style={{ padding: "8px 10px", ...mono }}>{row.pa}</td>
                  <td style={{ padding: "8px 10px", ...mono }}>{row.h}</td>
                  <td style={{ padding: "8px 10px", ...mono }}>{row.bb}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {row.warning ? <StatusBadge type="err" text={row.warning} /> : <StatusBadge type="ok" text="Ready" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <WarnFooter count={warnRows.length} />
        </div>
      )}
      {imported >= 0 && <SuccessBanner count={imported} label="hitting row" />}
    </SectionCard>
  );
}

// ─── Pitching import ──────────────────────────────────────────────────────────

type PitchingRow = BaseRow & { ip: number; pitches: number; k: number; hitsAllowed: number; walksAllowed: number };

function parsePitchingCSV(raw: string): PitchingRow[] {
  const rows = parseCSV(raw);
  if (rows.length < 2) return [];
  const headers = normalizeHeaders(rows[0]);
  const col = (name: string) => headers.indexOf(name);
  return rows.slice(1).map((cols) => ({
    gameId:       cols[col("game_id")]?.trim() ?? "",
    jersey:       cols[col("jersey")]?.trim() ?? "",
    ip:           num(cols, col("ip")),
    pitches:      num(cols, col("pitches")),
    k:            num(cols, col("k")),
    hitsAllowed:  num(cols, col("hits_allowed")),
    walksAllowed: num(cols, col("walks_allowed")),
  }));
}

function PitchingImport() {
  const games           = useDiamondDraftStore((s) => s.games);
  const players         = useDiamondDraftStore((s) => s.players);
  const updateGameStats = useDiamondDraftStore((s) => s.updateGameStats);

  const [csv, setCsv]       = useState("");
  const [preview, setPreview] = useState<PitchingRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported]   = useState(-1);
  const [error, setError]         = useState("");

  function handlePreview() {
    setError(""); setImported(-1);
    const raw = parsePitchingCSV(csv);
    if (raw.length === 0) { setError("No data rows found."); return; }
    setPreview(raw.map((r) => resolveRow(r, games, players)));
  }

  async function handleImport() {
    const valid = preview.filter((r) => !r.warning);
    if (valid.length === 0) return;
    setImporting(true);
    const byGame = new Map<string, PitchingRow[]>();
    for (const row of valid) {
      if (!byGame.has(row.resolvedGameId!)) byGame.set(row.resolvedGameId!, []);
      byGame.get(row.resolvedGameId!)!.push(row);
    }
    try {
      for (const [gameId, rows] of byGame) {
        const game = games.find((g) => g.id === gameId);
        if (!game) continue;
        const existing = game.gameStats ?? { hitting: [], pitching: [] };
        const pitching: PitchingGameStats[] = [...existing.pitching];
        for (const row of rows) {
          const entry: PitchingGameStats = {
            playerId: row.resolvedPlayerId!, inningsPitched: row.ip, pitches: row.pitches,
            strikeouts: row.k, hitsAllowed: row.hitsAllowed, walksAllowed: row.walksAllowed,
          };
          const idx = pitching.findIndex((p) => p.playerId === entry.playerId);
          if (idx >= 0) pitching[idx] = entry; else pitching.push(entry);
        }
        await updateGameStats(gameId, { hitting: existing.hitting, pitching });
      }
      setImported(valid.length);
      setPreview([]); setCsv("");
    } finally {
      setImporting(false);
    }
  }

  const validRows = preview.filter((r) => !r.warning);
  const warnRows  = preview.filter((r) => r.warning);
  const mono: React.CSSProperties = { fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 12.5, textAlign: "center" };

  return (
    <SectionCard title="3 — Import Pitching Stats" description="One row per pitcher per game. Players matched by jersey number.">
      <FormatHint cols={[
        { name: "game_id", note: "external_id from games import" },
        { name: "jersey" },
        { name: "ip", note: "innings pitched, e.g. 2.1" },
        { name: "pitches" },
        { name: "k", note: "strikeouts" },
        { name: "hits_allowed" },
        { name: "walks_allowed" },
      ]} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="dd-btn sec sm" onClick={() => downloadTemplate(PITCHING_TEMPLATE, "pitching-template.csv")}>
          Download template
        </button>
      </div>
      <CSVInput value={csv} onChange={setCsv} placeholder={"game_id,jersey,ip,pitches,k,hits_allowed,walks_allowed\nG1,12,2.1,38,5,2,1\nG1,5,1,22,2,1,0"} />
      {error && <div style={{ marginTop: 10, fontSize: 13, color: C.red }}>{error}</div>}
      <PreviewControls csv={csv} onPreview={handlePreview} onImport={handleImport} importing={importing} validCount={preview.length > 0 ? validRows.length : -1} />
      {preview.length > 0 && (
        <div className="dd-card" style={{ padding: 0, overflow: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Game", "Player", "IP", "Pitches", "K", "H Allow", "BB Allow", "Status"].map((h) => (
                  <th key={h} style={{ padding: "9px 10px", textAlign: h === "Game" || h === "Player" || h === "Status" ? "left" : "center", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, background: C.sub, borderBottom: `2px solid ${C.line}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? C.card : C.sub }}>
                  <GamePlayerCells row={row} />
                  <td style={{ padding: "8px 10px", ...mono }}>{row.ip || 0}</td>
                  <td style={{ padding: "8px 10px", ...mono }}>{row.pitches}</td>
                  <td style={{ padding: "8px 10px", ...mono }}>{row.k}</td>
                  <td style={{ padding: "8px 10px", ...mono }}>{row.hitsAllowed}</td>
                  <td style={{ padding: "8px 10px", ...mono }}>{row.walksAllowed}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {row.warning ? <StatusBadge type="err" text={row.warning} /> : <StatusBadge type="ok" text="Ready" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <WarnFooter count={warnRows.length} />
        </div>
      )}
      {imported >= 0 && <SuccessBanner count={imported} label="pitching row" />}
    </SectionCard>
  );
}

// ─── Existing games with external IDs ────────────────────────────────────────

function ExistingExternalIds() {
  const games = useDiamondDraftStore((s) => s.games);
  const tagged = games.filter((g) => g.externalId);
  if (tagged.length === 0) return null;

  return (
    <SectionCard title="Existing external IDs" description="Games that already have an external ID assigned.">
      <div className="dd-card" style={{ padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["External ID", "Date", "Opponent", ""].map((h) => (
                <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, background: C.sub, borderBottom: `2px solid ${C.line}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tagged.sort((a, b) => a.date.localeCompare(b.date)).map((g, i) => (
              <tr key={g.id} style={{ background: i % 2 === 0 ? C.card : C.sub }}>
                <td style={{ padding: "9px 14px", fontFamily: "var(--font-ibm-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700 }}>{g.externalId}</td>
                <td style={{ padding: "9px 14px", fontSize: 13 }}>{g.date}</td>
                <td style={{ padding: "9px 14px", fontSize: 13 }}>{g.opponent ?? <span style={{ color: C.faint }}>—</span>}</td>
                <td style={{ padding: "9px 14px" }}>
                  <Link href={`/games/${g.id}`} style={{ fontSize: 12.5, color: C.blue }}>View game →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  return (
    <div className="dd-wrap">
      <div style={{ marginBottom: 20 }}>
        <Link href="/settings" className="dd-crumb">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M11.5 4l-5 5 5 5"/>
          </svg>
          Settings
        </Link>
      </div>

      <PageHeader
        eyebrow="Data tools"
        title="Import"
        subtitle="Import historical games and stats from CSV files."
      />

      <GamesImport />
      <div style={{ borderTop: `1px solid ${C.line}`, marginBottom: 36 }} />
      <HittingImport />
      <div style={{ borderTop: `1px solid ${C.line}`, marginBottom: 36 }} />
      <PitchingImport />
      <div style={{ borderTop: `1px solid ${C.line}`, marginBottom: 36 }} />
      <ExistingExternalIds />
    </div>
  );
}
