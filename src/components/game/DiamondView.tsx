"use client";

import React, { useState } from "react";
import type { Game, Player, Position } from "@/lib/types";
import { FIELD_POSITIONS } from "@/lib/types";

type Props = {
  game: Game;
  players: Player[];
  onAssign: (inning: number, position: Position, playerId: string | null) => void;
  inning?: number;
};

export default function DiamondView({ game, players, onAssign, inning = 1 }: Props) {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const slots = game.innings.find((i) => i.inning === inning)?.slots ?? [];
  const [dragging, setDragging] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, playerId: string) {
    setDragging(playerId);
    try { e.dataTransfer.setData("text/plain", playerId); } catch {}
  }

  function handleDrop(e: React.DragEvent, position: Position) {
    e.preventDefault();
    const pid = dragging ?? e.dataTransfer.getData("text/plain");
    onAssign(inning, position, pid || null);
    setDragging(null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Diamond — Inning {inning}</h3>
        <div className="text-xs text-slate-500">Drag a player onto a position to assign</div>
      </div>

      <div className="grid grid-cols-3 gap-4 items-center justify-items-center">
        {FIELD_POSITIONS.map((pos) => {
          const slot = slots.find((s) => s.position === pos);
          const player = slot?.playerId ? playerMap.get(slot.playerId) : null;
          return (
            <div
              key={pos}
              onDrop={(e) => handleDrop(e, pos)}
              onDragOver={handleDragOver}
              className="w-36 h-16 flex flex-col items-center justify-center border border-slate-700 rounded bg-slate-800"
            >
              <div className="text-xs text-slate-400">{pos}</div>
              <div className="mt-1">
                {player ? (
                  <div className="px-2 py-1 bg-slate-700 text-white rounded text-sm">{player.firstName} {player.lastInitial}.</div>
                ) : (
                  <div className="px-2 py-1 bg-slate-600 text-slate-200 rounded text-sm">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <h4 className="text-xs text-slate-400 mb-2">Players (drag from here)</h4>
        <div className="flex flex-wrap gap-2">
          {game.battingOrder && game.battingOrder.length > 0
            ? game.battingOrder.map((id) => {
                const p = playerMap.get(id);
                if (!p) return null;
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, id)}
                    className="px-2 py-1 bg-slate-700 text-white rounded text-sm cursor-grab"
                  >
                    {p.firstName} {p.lastInitial}.
                  </div>
                );
              })
            : players.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, p.id)}
                  className="px-2 py-1 bg-slate-700 text-white rounded text-sm cursor-grab"
                >
                  {p.firstName} {p.lastInitial}.
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
