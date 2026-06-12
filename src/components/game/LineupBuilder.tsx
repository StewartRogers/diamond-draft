"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDiamondDraftStore } from "@/lib/store";
import type { Game, Player, RuleViolation } from "@/lib/types";
import type { CellValue, EditDescriptor, FieldPos, Schedule, SortMode, ViewMode } from "./lineup/shared";
import { CSS, PAL, isField, fmtName, gameToSchedule, scheduleToInnings } from "./lineup/shared";
import { GridView, SortSeg, ViewToggle, InningStepper } from "./lineup/GridView";
import { FieldView } from "./lineup/FieldView";
import { CellPopover, PositionPopover } from "./lineup/Popovers";
import { AvailabilityPanel } from "./lineup/AvailabilityPanel";
import { PitchCatchPanel } from "./lineup/PitchCatchPanel";
import { AutoFillLogModal } from "./lineup/AutoFillLogModal";
import { ViolationsModal } from "./lineup/ViolationsModal";
import { validateGame } from "@/lib/rules";

export interface LineupBuilderProps {
  game: Game;
  players: Player[];
}

export default function LineupBuilder({ game, players }: LineupBuilderProps) {
  const router = useRouter();
  const updateGameInnings = useDiamondDraftStore((s) => s.updateGameInnings);
  const setBattingOrder = useDiamondDraftStore((s) => s.setBattingOrder);
  const autoFillGame = useDiamondDraftStore((s) => s.autoFillGame);
  const finalizeGame = useDiamondDraftStore((s) => s.finalizeGame);
  const reopenGame = useDiamondDraftStore((s) => s.reopenGame);
  const leagueRules = useDiamondDraftStore((s) => s.settings.leagueRules);

  const [mounted, setMounted] = useState(false);
  const [sort, setSort] = useState<SortMode>("bat");
  const [view, setView] = useState<ViewMode>("grid");
  const [inning, setInning] = useState(0);
  const [edit, setEdit] = useState<EditDescriptor | null>(null);
  const [filling, setFilling] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [autoLog, setAutoLog] = useState<string[]>([]);
  const [autoWarnings, setAutoWarnings] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [checkResults, setCheckResults] = useState<RuleViolation[] | null>(null);

  // Local schedule state — initialized from game, re-synced on game.updatedAt change
  const [schedule, setSchedule] = useState<Schedule>(() => gameToSchedule(game, players));
  // Ref always tracks the latest schedule so assign/onCell can read current state
  // without capturing a stale closure (fixes rapid double-click overwrite).
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;
  const [batting, setBatting] = useState<string[]>(() => {
    const absentIds = new Set(game.playerOverrides.filter((o) => o.status === "absent").map((o) => o.playerId));
    return game.battingOrder.filter((id) => !absentIds.has(id));
  });

  // Hydration gate: must flip after first client render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  // Re-sync when game is updated externally (e.g., auto-fill)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSchedule(gameToSchedule(game, players));
    const absentIds = new Set(game.playerOverrides.filter((o) => o.status === "absent").map((o) => o.playerId));
    setBatting(game.battingOrder.filter((id) => !absentIds.has(id)));
  }, [game.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const numInnings = game.innings.length;
  const INN = useMemo(() => Array.from({ length: numInnings }, (_, i) => i), [numInnings]);

  // Scratched (absent) players
  const scratchedIds = useMemo(() => {
    const absentIds = new Set(game.playerOverrides.filter((o) => o.status === "absent").map((o) => o.playerId));
    return players.filter((p) => absentIds.has(p.id)).map((p) => p.id);
  }, [game.playerOverrides, players]);

  // Player lookup by id
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  // ── Assignment logic (with swap) ──────────────────────────────────────────
  const assign = useCallback(
    (id: string, inn: number, pos: CellValue) => {
      const prev = scheduleRef.current;
      const nextSchedule: Schedule = {};
      for (const k of Object.keys(prev)) nextSchedule[k] = [...prev[k]];

      const curV = nextSchedule[id]?.[inn];
      if (isField(pos)) {
        const occ = batting.find((x) => x !== id && nextSchedule[x]?.[inn] === pos);
        if (occ) {
          nextSchedule[occ][inn] = isField(curV) || curV === "BENCH" ? curV : "BENCH";
        }
      }
      if (nextSchedule[id]) nextSchedule[id][inn] = pos;
      scheduleRef.current = nextSchedule;
      setSchedule(nextSchedule);
      setEdit(null);

      // Persist
      const newInnings = scheduleToInnings(nextSchedule, game.innings);
      updateGameInnings(game.id, newInnings).catch(console.error);
    },
    [batting, game, updateGameInnings]
  );

  // ── Live validation ───────────────────────────────────────────────────────
  const onFieldPerInning = useMemo(
    () => INN.map((i) => batting.filter((id) => isField(schedule[id]?.[i] ?? "BENCH")).length),
    [batting, schedule, INN]
  );

  const fieldIssues = onFieldPerInning.map((n, i) => ({ inn: i + 1, n })).filter((x) => x.n !== 9);

  const benchIssues = useMemo(
    () => batting.filter((id) => {
      const s = schedule[id];
      if (!s) return false;
      const isSitting = (v: CellValue) => v === "BENCH" || v === "BULLPEN";
      for (let i = 0; i < s.length - 1; i++) if (isSitting(s[i]) && isSitting(s[i + 1])) return true;
      return false;
    }),
    [batting, schedule]
  );

  const shortPlay = useMemo(
    () => batting.filter((id) => (schedule[id] ?? []).filter(isField).length < 2),
    [batting, schedule]
  );

  const violations = fieldIssues.length + benchIssues.length + shortPlay.length;

  let banner: { tone: "ok" | "err"; main: string; hint: string };
  if (fieldIssues.length) {
    const f = fieldIssues[0];
    banner = { tone: "err", main: `Inning ${f.inn} has ${f.n} on the field`, hint: f.n < 9 ? `Assign ${9 - f.n} more player${9 - f.n > 1 ? "s" : ""} a position.` : `Bench ${f.n - 9} — only 9 may field.` };
  } else if (benchIssues.length) {
    const p = byId[benchIssues[0]];
    banner = { tone: "err", main: p ? `${fmtName(p)} #${p.jerseyNumber} sits back-to-back` : "Back-to-back bench violation", hint: "League rule: no two bench innings in a row." };
  } else if (shortPlay.length) {
    const p = byId[shortPlay[0]];
    banner = { tone: "err", main: p ? `${fmtName(p)} #${p.jerseyNumber} plays under 2 innings` : "Fair-play minimum not met", hint: "Fair-play minimum is 2 innings on the field." };
  } else {
    banner = { tone: "ok", main: "Lineup is clean", hint: "All fielding 9-deep, no back-to-back bench, everyone clears the 2-inning minimum." };
  }

  // ── Row sort ──────────────────────────────────────────────────────────────
  const battingSlot = (id: string) => { const i = batting.indexOf(id); return i < 0 ? 0 : i + 1; };
  const present = players.filter((p) => batting.includes(p.id)).map((p) => p.id);
  let rows: string[];
  if (sort === "bat") rows = [...batting];
  else if (sort === "jersey") rows = [...present].sort((a, b) => Number(byId[a]?.jerseyNumber) - Number(byId[b]?.jerseyNumber));
  else rows = [...present].sort((a, b) => (byId[a]?.firstName ?? "").localeCompare(byId[b]?.firstName ?? ""));
  rows = rows.concat(scratchedIds);

  // ── Cell / position edit open ──────────────────────────────────────────────
  // Clicking a field-assigned cell immediately benches the player (1-click bench).
  // Clicking a bench/bullpen cell opens the position picker popover.
  const onCell = useCallback((e: React.MouseEvent, id: string, inn: number) => {
    const cur = scheduleRef.current[id]?.[inn];
    if (isField(cur)) {
      assign(id, inn, "BENCH");
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEdit({ kind: "cell", id, inn, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } });
  }, [assign]);

  // Direct bench for FieldView filled-chip clicks (no MouseEvent needed).
  const onDirectBench = useCallback((id: string, inn: number) => {
    assign(id, inn, "BENCH");
  }, [assign]);

  const onPos = (e: React.MouseEvent, pos: FieldPos, inn: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEdit({ kind: "pos", pos, inn, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } });
  };

  // ── Check violations (read-only) ──────────────────────────────────────────
  // Use game directly — assign() persists optimistically so game.innings is
  // always current, and unlike scheduleToInnings, the real data includes bench
  // slot assignments needed for BACK_TO_BACK_BENCH detection.
  const handleCheckViolations = useCallback(() => {
    const results = validateGame(game, players, leagueRules);
    setCheckResults(results);
  }, [game, players, leagueRules]);

  // ── Drag to reorder batting ───────────────────────────────────────────────
  const onGrip = (e: React.PointerEvent, id: string) => {
    if (sort !== "bat") return;
    e.preventDefault();
    setEdit(null);
    const rowEls = batting.map((pid) => document.querySelector<HTMLElement>(`.ddg tr[data-rid="${pid}"]`)).filter(Boolean) as HTMLElement[];
    if (!rowEls.length) return;
    const scale = rowEls[0].getBoundingClientRect().height / rowEls[0].offsetHeight || 1;
    const homes = rowEls.map((el) => ({ el, id: el.dataset.rid!, y: el.getBoundingClientRect().top }));
    const slotYs = homes.map((h) => h.y);
    const meIdx = batting.indexOf(id);
    const me = homes[meIdx].el;
    const startY = e.clientY;
    let live = batting.slice();
    me.classList.add("dragging");

    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = live.indexOf(h.id);
        h.el.style.transform = `translateY(${(slotYs[slot] - h.y) / scale}px)`;
      }
    };
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      me.style.transform = `translateY(${dy / scale}px)`;
      const cur = homes[meIdx].y + dy;
      let nearest = 0, best = Infinity;
      for (let i = 0; i < slotYs.length; i++) { const d = Math.abs(slotYs[i] - cur); if (d < best) { best = d; nearest = i; } }
      if (live.indexOf(id) !== nearest) { live = batting.filter((k) => k !== id); live.splice(nearest, 0, id); layout(); }
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      const finalSlot = live.indexOf(id);
      me.style.transform = `translateY(${(slotYs[finalSlot] - homes[meIdx].y) / scale}px)`;
      setTimeout(() => {
        for (const h of homes) { h.el.style.transition = "none"; h.el.style.transform = ""; h.el.classList.remove("dragging"); }
        if (live.join("|") !== batting.join("|")) {
          setBatting(live);
          // Persist: include scratched players at the end of the order
          setBattingOrder(game.id, [...live, ...scratchedIds]).catch(console.error);
        }
        requestAnimationFrame(() => requestAnimationFrame(() => { for (const h of homes) h.el.style.transition = ""; }));
      }, 190);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  // ── Auto-fill ─────────────────────────────────────────────────────────────
  const handleAutoFill = async () => {
    setFilling(true);
    setAutoLog([]);
    setAutoWarnings([]);
    setShowLog(false);
    try {
      const result = await autoFillGame(game.id);
      setAutoLog(result.log);
      setAutoWarnings(result.warnings);
    } finally {
      setFilling(false);
    }
  };

  const handleFinalize = async () => {
    setStatusBusy(true);
    try { await finalizeGame(game.id); } finally { setStatusBusy(false); }
  };

  const handleReopen = async () => {
    setStatusBusy(true);
    try { await reopenGame(game.id); } finally { setStatusBusy(false); }
  };

  const editKey = edit && edit.kind === "cell" ? edit.id + ":" + edit.inn : null;

  const game_date = new Date(game.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  // FitCard in the game page handles scale-to-fit. LineupBuilder renders the
  // raw 1320px card with no transform — keeping it transform-free prevents
  // double-scaling and header text overlap.
  return (
    <div>
      <PitchCatchPanel game={game} batting={batting} scratchedIds={scratchedIds} byId={byId} />

      <div className="ddg" style={{ width: 1320, background: "#fff", border: "1px solid #e7e4dc", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(40,35,25,.06), 0 18px 50px rgba(40,35,25,.07)" }}>
          <style>{CSS}</style>

          {/* ── Header ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", borderBottom: "1px solid #e7e4dc" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 24, height: 24, transform: "rotate(45deg)", background: "#3f6212", borderRadius: 5, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.01em", whiteSpace: "nowrap" }}>Diamond Draft</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 14, whiteSpace: "nowrap" }}>
              {game.teamName && <span style={{ fontWeight: 700 }}>{game.teamName}</span>}
              {game.opponent && <>
                <span style={{ color: "#a09a8e" }}>vs</span>
                <span style={{ fontWeight: 600 }}>{game.opponent}</span>
              </>}
              <span style={{ color: "#6f6a60", fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 12.5, marginLeft: 4 }}>
                · {game_date} · {numInnings} inn
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={handleAutoFill}
                disabled={filling}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 16px", borderRadius: 9, border: "none", background: filling ? "#a8c47a" : "#3f6212", color: "#fff", fontWeight: 700, fontSize: 13, cursor: filling ? "wait" : "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M3.3 12.7l1.4-1.4M11.3 4.7l1.4-1.4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="8" r="3" fill="#fff"/></svg>
                {filling ? "Filling…" : "Auto-fill lineup"}
              </button>
              <button
                onClick={handleCheckViolations}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 14px", borderRadius: 9, border: "1px solid #d6d2c8", background: "#fff", color: "#57534a", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="5.5"/><path d="M7 4.5v3M7 9.5v.5"/></svg>
                Check lineup
              </button>
              {(autoLog.length > 0 || autoWarnings.length > 0) && (
                <button
                  onClick={() => setShowLog(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 14px", borderRadius: 9, border: "1px solid #d6d2c8", background: "#fff", color: "#57534a", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
                >
                  📋 Auto-fill log
                  {autoWarnings.length > 0 && (
                    <span style={{ color: "#b45309", fontSize: 11.5, fontWeight: 600 }}>({autoWarnings.length} ⚠)</span>
                  )}
                </button>
              )}
              <button
                onClick={() => router.push(`/games/${game.id}/export`)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 16px", borderRadius: 9, border: "none", background: "#3f6212", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6V2.5h8V6M4 12h8v2.5H4zM3 6h10a1 1 0 011 1v4H2V7a1 1 0 011-1z" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                Print · 1 page
              </button>
              <span style={{ width: 1, height: 24, background: "#e7e4dc", flexShrink: 0 }} />
              {game.status === "draft" ? (
                <button
                  onClick={handleFinalize}
                  disabled={statusBusy}
                  title="Mark this lineup as final"
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 16px", borderRadius: 9, border: "none", background: statusBusy ? "#a8c47a" : "#3f6212", color: "#fff", fontWeight: 700, fontSize: 13, cursor: statusBusy ? "wait" : "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7.5l3.5 3.5 6.5-7"/></svg>
                  {statusBusy ? "Saving…" : "Finalize"}
                </button>
              ) : (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 13px", borderRadius: 9, background: "#eef1e3", border: "1px solid #dbe3c6", color: "#3f6212", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#3f6212" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7.5l3.5 3.5 6.5-7"/></svg>
                    Finalized
                  </span>
                  <button
                    onClick={handleReopen}
                    disabled={statusBusy}
                    title="Revert to draft to make changes"
                    style={{ height: 36, padding: "0 12px", borderRadius: 9, border: "1px solid #d6d2c8", background: "#fff", color: "#57534a", fontWeight: 600, fontSize: 12.5, cursor: statusBusy ? "wait" : "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
                  >
                    {statusBusy ? "…" : "Re-open"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 22px", borderBottom: "1px solid #e7e4dc", background: "#fcfbf8" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ViewToggle view={view} setView={setView} />
              <span style={{ width: 1, height: 20, background: "#e3e0d8" }} />
              {view === "grid" ? (
                <>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "#6f6a60" }}>Order by</span>
                  <SortSeg sort={sort} setSort={setSort} />
                  {sort === "bat" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a09a8e" }}>
                      <span className="grip" style={{ opacity: 0.5 }}><i /><i /><i /></span>
                      drag a row · click any cell to assign
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "#6f6a60" }}>Inning</span>
                  <InningStepper inning={inning} numInnings={numInnings} setInning={setInning} />
                  <span style={{ fontSize: 12, color: "#a09a8e" }}>· step through all {numInnings} innings</span>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              {violations > 0 ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#9a3412", background: "#f6e7df", border: "1px solid #eccfc0", borderRadius: 999, padding: "5px 11px" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 9, background: "#9a3412" }} />
                  {violations} rule violation{violations > 1 ? "s" : ""}
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#3f6212", background: "#eef1e3", border: "1px solid #dbe3c6", borderRadius: 999, padding: "5px 11px" }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.3l2.2 2.2 4.8-5" stroke="#3f6212" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Fair play on track
                </span>
              )}
            </div>
          </div>

          {/* ── Body: Grid or Field ── */}
          {view === "grid" ? (
            <GridView
              rows={rows} byId={byId} battingSlot={battingSlot}
              schedule={schedule} numInnings={numInnings}
              scratchedIds={scratchedIds} sort={sort}
              onGrip={onGrip} editKey={editKey} onCell={onCell}
              onFieldPerInning={onFieldPerInning}
            />
          ) : (
            <FieldView
              schedule={schedule} batting={batting} players={players}
              inning={inning}
              onCellEdit={onCell}
              onPosEdit={onPos}
              onDirectBench={onDirectBench}
            />
          )}

          {/* ── Footer ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 22px", background: "#fcfbf8", borderTop: "1px solid #e7e4dc", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {(["inf", "out", "bat"] as const).map((k) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "#6f6a60" }}>
                  <span style={{ width: 22, height: 16, borderRadius: 4, background: PAL[k].bg, border: `1px solid ${PAL[k].fg}22`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 8.5, fontWeight: 600, color: PAL[k].fg }}>
                    {k === "inf" ? "SS" : k === "out" ? "CF" : "P"}
                  </span>
                  {k === "inf" ? "Infield" : k === "out" ? "Outfield" : "Battery (P/C)"}
                </span>
              ))}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "#6f6a60" }}><span style={{ width: 22, height: 16, borderRadius: 4, background: "#f1efe8", border: "1px solid #e3e0d8" }} />Bench</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "#6f6a60" }}><span style={{ width: 22, height: 16, borderRadius: 4, background: "#f8f0db", border: "1px solid #ecdcb6" }} />Late / Out</span>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 12.5, color: banner.tone === "ok" ? "#3f6212" : "#9a3412", background: banner.tone === "ok" ? "#eef1e3" : "#f8ece6", border: `1px solid ${banner.tone === "ok" ? "#dbe3c6" : "#eccfc0"}`, borderRadius: 8, padding: "7px 12px", maxWidth: 560 }}>
              <span style={{ flex: "0 0 auto", width: 16, height: 16, borderRadius: 999, background: banner.tone === "ok" ? "#3f6212" : "#9a3412", color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {banner.tone === "ok" ? "✓" : "!"}
              </span>
              <span><strong style={{ fontWeight: 700 }}>{banner.main}</strong> — <span style={{ color: banner.tone === "ok" ? "#5b7a2e" : "#b06a4a" }}>{banner.hint}</span></span>
            </div>
          </div>

          {/* ── Popovers ── */}
          {mounted && edit && edit.kind === "cell" && (
            <CellPopover target={edit} schedule={schedule} batting={batting} players={players} onAssign={assign} onClose={() => setEdit(null)} />
          )}
          {mounted && edit && edit.kind === "pos" && (
            <PositionPopover target={edit} schedule={schedule} batting={batting} players={players} onAssign={assign} onClose={() => setEdit(null)} />
          )}
        </div>

        <AvailabilityPanel game={game} players={players} />

        {mounted && showLog && (
          <AutoFillLogModal
            autoLog={autoLog}
            autoWarnings={autoWarnings}
            gameDate={game.date}
            onClose={() => setShowLog(false)}
          />
        )}
        {mounted && checkResults !== null && (
          <ViolationsModal violations={checkResults} onClose={() => setCheckResults(null)} />
        )}
    </div>
  );
}
