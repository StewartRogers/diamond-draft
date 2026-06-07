"use client";

import { useState } from "react";
import type { Game, Player, Position, RuleViolation } from "@/lib/types";
import { useDiamondDraftStore } from "@/lib/store";
import DiamondView from "./DiamondView";

// ─── Position colour coding ───────────────────────────────────────────────────

const POS_COLORS: Partial<Record<Position, string>> = {
  P: "bg-red-600 text-white",
  C: "bg-blue-600 text-white",
  "1B": "bg-amber-600 text-white",
  "2B": "bg-amber-500 text-white",
  "3B": "bg-amber-700 text-white",
  SS: "bg-orange-500 text-white",
  LF: "bg-emerald-600 text-white",
  CF: "bg-emerald-500 text-white",
  RF: "bg-emerald-700 text-white",
  Bench: "bg-slate-600 text-slate-300",
  "Bullpen - P": "bg-red-900 text-red-200",
  "Bullpen - C": "bg-blue-900 text-blue-200",
};

function posColor(pos: Position): string {
  return POS_COLORS[pos] ?? "bg-slate-700 text-slate-300";
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  game: Game;
  players: Player[];
  violations: RuleViolation[];
};

export default function LineupGrid({ game, players, violations }: Props) {
  const assignPlayer = useDiamondDraftStore((s) => s.assignPlayer);
  const autoFillGame = useDiamondDraftStore((s) => s.autoFillGame);
  const autoFillInning = useDiamondDraftStore((s) => s.autoFillInning);
  const setPlayerOverride = useDiamondDraftStore((s) => s.setPlayerOverride);
  const removePlayerOverride = useDiamondDraftStore((s) => s.removePlayerOverride);
  const setPitchCatchAssignment = useDiamondDraftStore((s) => s.setPitchCatchAssignment);
  const finalizeGame = useDiamondDraftStore((s) => s.finalizeGame);

  const [autoFilling, setAutoFilling] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [autoLog, setAutoLog] = useState<string[]>([]);
  const [autoWarnings, setAutoWarnings] = useState<string[]>([]);
  const [view, setView] = useState<"grid" | "diamond">("grid");

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const overrideMap = new Map(game.playerOverrides.map((o) => [o.playerId, o]));
  const pitchCatchMap = new Map((game.pitchCatchAssignments ?? []).map((a) => [a.inning, a]));

  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warningCount = violations.filter((v) => v.severity === "warning").length;

  async function handleAutoFillGame() {
    setAutoFilling(true);
    setAutoLog([]);
    setAutoWarnings([]);
    const result = await autoFillGame(game.id);
    setAutoLog(result.log);
    setAutoWarnings(result.warnings);
    setAutoFilling(false);
  }

  async function handleAiPlan() {
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
      setAiStatus(data.notes.length > 0 ? data.notes.join(" ") : "Pitch/catcher plan applied.");
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : "Failed to generate plan.");
    } finally {
      setAiPlanning(false);
    }
  }

  async function handleAutoFillInning(inning: number) {
    await autoFillInning(game.id, inning);
  }

  function handleAssign(inning: number, position: Position, playerId: string | null) {
    assignPlayer(game.id, inning, position, playerId);
  }

  function handlePitchCatchAssign(
    inning: number,
    position: "P" | "C",
    playerId: string | null
  ) {
    setPitchCatchAssignment(game.id, inning, position, playerId);
  }

  // Rows: all players in the roster snapshot, sorted by jersey number
  // Use battingOrder if present, fallback to jersey number sort
  const sortedPlayers = (game.battingOrder && game.battingOrder.length > 0
    ? game.battingOrder.map((id) => playerMap.get(id)).filter(Boolean) as Player[]
    : [...game.rosterSnapshot].sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber))
  );

  const setBattingOrder = useDiamondDraftStore((s) => s.setBattingOrder);

  function movePlayer(playerId: string, dir: "up" | "down") {
    const order = game.battingOrder && game.battingOrder.length > 0
      ? [...game.battingOrder]
      : [...game.rosterSnapshot].sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber)).map((p) => p.id);
    const idx = order.indexOf(playerId);
    if (idx === -1) return;
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
    setBattingOrder(game.id, order);
  }

  // Drag-and-drop handlers
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, playerId: string) {
    setDraggingId(playerId);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", playerId); } catch {}
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const srcId = draggingId ?? e.dataTransfer.getData("text/plain");
    if (!srcId || srcId === targetId) return;
    const order = game.battingOrder && game.battingOrder.length > 0
      ? [...game.battingOrder]
      : [...game.rosterSnapshot].sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber)).map((p) => p.id);
    const srcIdx = order.indexOf(srcId);
    const tgtIdx = order.indexOf(targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    order.splice(srcIdx, 1);
    order.splice(tgtIdx, 0, srcId);
    await setBattingOrder(game.id, order);
    setDraggingId(null);
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setView(view === "grid" ? "diamond" : "grid")}
            className="px-3 py-1 bg-slate-700 text-white rounded text-sm"
          >
            {view === "grid" ? "Diamond View" : "Grid View"}
          </button>
        </div>
        <button
          onClick={handleAutoFillGame}
          disabled={autoFilling || game.status === "finalized"}
          className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          {autoFilling ? (
            <>
              <span className="animate-spin">⚙</span> Building…
            </>
          ) : (
            <>⚡ Auto-Fill Lineup</>
          )}
        </button>

        {game.status !== "finalized" && (
          <button
            onClick={() => finalizeGame(game.id)}
            disabled={errorCount > 0}
            title={errorCount > 0 ? "Fix all errors before finalizing" : ""}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Finalize Game
          </button>
        )}

        {game.status === "finalized" && (
          <span className="px-3 py-1.5 bg-green-900/40 text-green-400 border border-green-800 rounded-lg text-xs font-semibold">
            ✓ Finalized
          </span>
        )}

        {/* Compliance badge */}
        {errorCount > 0 && (
          <span className="px-3 py-1.5 bg-red-900/40 text-red-400 border border-red-800 rounded-lg text-xs font-semibold">
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        )}
        {warningCount > 0 && (
          <span className="px-3 py-1.5 bg-yellow-900/40 text-yellow-400 border border-yellow-800 rounded-lg text-xs font-semibold">
            {warningCount} warning{warningCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {view === "diamond" ? (
        <div>
          <DiamondView game={game} players={players} onAssign={handleAssign} inning={1} />
        </div>
      ) : null}

      {/* Auto-fill result log */}
      {(autoLog.length > 0 || autoWarnings.length > 0) && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 text-xs space-y-1">
          {autoWarnings.map((w, i) => (
            <p key={i} className="text-yellow-400">⚠ {w}</p>
          ))}
          {autoLog.map((l, i) => (
            <p key={i} className="text-slate-400">{l}</p>
          ))}
        </div>
      )}

      {/* Player status overrides */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <p className="text-xs font-medium text-slate-400 mb-3">Player Availability</p>
        <div className="flex flex-wrap gap-2">
          {sortedPlayers.map((p) => {
            const override = overrideMap.get(p.id);
            const status = override?.status ?? "active";
            return (
              <div key={p.id} className="flex items-center gap-1.5">
                <span className="text-xs text-slate-300 font-medium">
                  {p.firstName} {p.lastInitial}.
                </span>
                <select
                  value={status}
                  disabled={game.status === "finalized"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "active") {
                      removePlayerOverride(game.id, p.id);
                    } else {
                      setPlayerOverride(game.id, {
                        playerId: p.id,
                        status: val as "absent" | "late" | "earlyLeave",
                      });
                    }
                  }}
                  className={`text-xs rounded px-2 py-0.5 border focus:outline-none ${
                    status === "absent"
                      ? "bg-red-900/60 border-red-700 text-red-300"
                      : status === "late"
                      ? "bg-yellow-900/60 border-yellow-700 text-yellow-300"
                      : status === "earlyLeave"
                      ? "bg-orange-900/60 border-orange-700 text-orange-300"
                      : "bg-slate-700 border-slate-600 text-slate-300"
                  }`}
                >
                  <option value="active">Active</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late Arrival</option>
                  <option value="earlyLeave">Early Departure</option>
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pitching / catching plan */}
      <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-400">Pitcher / Catcher Plan</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Lock these innings first, then auto-fill the rest around them.
            </p>
          </div>
        </div>
        <div className="mb-4 space-y-2">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            disabled={game.status === "finalized"}
            rows={3}
            placeholder='Example: "Use Jake for innings 1 and 3, Mia catches every inning, and avoid pitching the same player back-to-back."'
            className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleAiPlan}
              disabled={aiPlanning || game.status === "finalized" || aiPrompt.trim().length === 0}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {aiPlanning ? "Thinking..." : "Use Gemini"}
            </button>
            <span className="text-xs text-slate-500">
              Gemini reads your prompt and fills the pitcher/catcher plan only.
            </span>
          </div>
          {aiStatus && (
            <p className="text-xs text-slate-400">{aiStatus}</p>
          )}
        </div>
        <div className="grid gap-2">
          {game.innings.map((inn) => {
            const plan = pitchCatchMap.get(inn.inning);
            return (
              <div
                key={inn.inning}
                className="grid grid-cols-1 gap-2 rounded-md border border-slate-700 bg-slate-900/50 p-3 md:grid-cols-[80px_1fr_1fr]"
              >
                <div className="text-xs font-semibold text-slate-400 self-center">
                  Inn {inn.inning}
                </div>
                {(["P", "C"] as const).map((position) => {
                  const currentId = position === "P" ? plan?.pitcherId : plan?.catcherId;
                  return (
                    <div key={position} className="flex items-center gap-2">
                      <label className="text-[11px] uppercase tracking-wide text-slate-500 w-14">
                        {position}
                      </label>
                      <select
                        value={currentId ?? ""}
                        disabled={game.status === "finalized"}
                        onChange={(e) =>
                          handlePitchCatchAssign(
                            inn.inning,
                            position,
                            e.target.value || null
                          )
                        }
                        className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Unassigned</option>
                        {sortedPlayers.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.firstName} {player.lastInitial}.
                          </option>
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

      {/* Lineup grid */}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-800">
              <th className="sticky left-0 z-10 bg-slate-800 px-4 py-3 text-left text-xs font-semibold text-slate-400 w-32 border-r border-slate-700">
                Player
              </th>
              {game.innings.map((inn) => (
                <th
                  key={inn.inning}
                  className="px-3 py-3 text-center text-xs font-semibold text-slate-400 min-w-[80px] border-r border-slate-700 last:border-0"
                >
                  <div>Inn {inn.inning}</div>
                  {game.status !== "finalized" && (
                    <button
                      onClick={() => handleAutoFillInning(inn.inning)}
                      className="mt-1 text-slate-500 hover:text-blue-400 text-[10px] transition-colors"
                      title={`Auto-fill inning ${inn.inning}`}
                    >
                      ⚡ fill
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player) => {
              const override = overrideMap.get(player.id);
              const isAbsent = override?.status === "absent";
              const playerViolations = violations.filter(
                (v) => v.playerId === player.id
              );
              const hasError = playerViolations.some((v) => v.severity === "error");
              const hasWarning = playerViolations.some((v) => v.severity === "warning");

              return (
                <tr
                  key={player.id}
                  draggable={game.status !== "finalized"}
                  onDragStart={(e) => handleDragStart(e, player.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, player.id)}
                  className={`border-t border-slate-800 ${
                    isAbsent ? "opacity-40" : "hover:bg-slate-800/30"
                  }`}
                >
                  {/* Player name cell */}
                  <td className="sticky left-0 z-10 bg-slate-900 px-3 py-2.5 border-r border-slate-800">
                    <div className="flex items-center gap-2">
                      {hasError && (
                        <span className="text-red-500 text-xs" title="Rule violation">●</span>
                      )}
                      {!hasError && hasWarning && (
                        <span className="text-yellow-500 text-xs" title="Warning">●</span>
                      )}
                      {!hasError && !hasWarning && (
                        <span className="text-slate-700 text-xs">●</span>
                      )}
                      <div>
                        <span className="text-white font-medium text-xs block leading-tight">
                          {player.firstName} {player.lastInitial}.
                        </span>
                        <span className="text-slate-500 text-[11px] font-mono">
                          #{player.jerseyNumber}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Batting order controls */}
                  <td className="px-2 py-2 border-r border-slate-800 w-24">
                    {game.status !== "finalized" && (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => movePlayer(player.id, "up")}
                          className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded"
                          title="Move up in batting order"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => movePlayer(player.id, "down")}
                          className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded"
                          title="Move down in batting order"
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Inning cells */}
                  {game.innings.map((inn) => {
                    const slot = inn.slots.find((s) => s.playerId === player.id);
                    const cellViolations = violations.filter(
                      (v) => v.playerId === player.id && v.inning === inn.inning
                    );
                    const cellError = cellViolations.some((v) => v.severity === "error");

                    return (
                      <td
                        key={inn.inning}
                        className={`px-2 py-2 text-center border-r border-slate-800 last:border-0 ${
                          cellError ? "ring-1 ring-inset ring-red-500" : ""
                        }`}
                      >
                        {slot ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${posColor(
                              slot.position
                            )} ${slot.locked ? "ring-1 ring-white/30" : ""}`}
                            title={cellViolations.map((v) => v.message).join("\n")}
                          >
                            {slot.position}
                          </span>
                        ) : (
                          <span className="text-slate-700 text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Violations list */}
      {violations.length > 0 && (
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <div className="bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-400">
            Rule Violations
          </div>
          <ul className="divide-y divide-slate-800">
            {violations.map((v, i) => (
              <li
                key={i}
                className={`px-4 py-2.5 text-xs ${
                  v.severity === "error" ? "text-red-300" : "text-yellow-300"
                }`}
              >
                <span className="font-semibold mr-2">
                  {v.severity === "error" ? "✗" : "⚠"}
                </span>
                {v.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
