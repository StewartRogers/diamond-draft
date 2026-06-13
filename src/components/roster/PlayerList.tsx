"use client";

import React, { useState } from "react";
import type { Player, FieldPosition } from "@/lib/types";
import { POSITION_TIER_CFG } from "@/lib/types";
import { useDiamondDraftStore } from "@/lib/store";
import PlayerForm from "./PlayerForm";

export default function PlayerList() {
  const players = useDiamondDraftStore((s) => s.players);
  const addPlayer = useDiamondDraftStore((s) => s.addPlayer);
  const updatePlayer = useDiamondDraftStore((s) => s.updatePlayer);
  const removePlayer = useDiamondDraftStore((s) => s.removePlayer);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const sorted = [...players].sort((a, b) =>
    Number(a.jerseyNumber) - Number(b.jerseyNumber)
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">
          Roster{" "}
          <span className="text-slate-500 font-normal text-sm">
            ({players.length} player{players.length !== 1 ? "s" : ""})
          </span>
        </h2>
        {!showForm && !editing && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors"
          >
            + Add Player
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">New Player</h3>
          <PlayerForm
            onSave={async (data) => {
              await addPlayer(data);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Player table */}
      {sorted.length === 0 && !showForm ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          No players yet. Add your first player to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm text-slate-200">
            <thead>
              <tr className="bg-slate-800 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium w-12">#</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Positions</th>
                <th className="px-4 py-3 font-medium text-center">Pitch Limit</th>
                <th className="px-4 py-3 font-medium text-center">Guest</th>
                <th className="px-4 py-3 font-medium w-28"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((player) => (
                <React.Fragment key={player.id}>
                  <tr className="border-t border-slate-800 hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 text-slate-300 font-mono font-semibold">
                      {player.jerseyNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-100 font-medium">
                      {player.firstName} {player.lastInitial}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {player.eligiblePositions.map((pos) => {
                          const rating = player.positionRatings?.[pos as FieldPosition];
                          const cfg = rating ? POSITION_TIER_CFG[rating] : null;
                          return (
                            <span
                              key={pos}
                              className="px-1.5 py-0.5 rounded text-xs font-medium border"
                              style={
                                cfg
                                  ? { background: cfg.bg, borderColor: cfg.border, color: cfg.text }
                                  : { background: "#334155", borderColor: "#475569", color: "#cbd5e1" }
                              }
                              title={cfg ? cfg.label : undefined}
                            >
                              {pos}
                              {cfg && (
                                <sup style={{ fontSize: "0.6em", marginLeft: 1, fontWeight: 700 }}>
                                  {cfg.sup}
                                </sup>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-center">
                      {player.pitchingLimitGame > 0
                        ? `${player.pitchingLimitGame}/game`
                        : "League default"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {player.isGuest && (
                        <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium">
                          Guest
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setEditing(player);
                            setShowForm(false);
                          }}
                          className="text-slate-400 hover:text-slate-100 text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(player.id)}
                          className="text-slate-400 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Inline edit form */}
                  {editing?.id === player.id && (
                    <tr key={`${player.id}-edit`} className="border-t border-slate-700">
                      <td colSpan={6} className="px-4 py-4 bg-slate-800/60">
                        <PlayerForm
                          initial={editing}
                          onSave={async (data) => {
                            await updatePlayer(player.id, data);
                            setEditing(null);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  )}

                  {/* Confirm delete */}
                  {confirmDelete === player.id && (
                    <tr key={`${player.id}-del`} className="border-t border-slate-700">
                      <td colSpan={6} className="px-4 py-3 bg-red-950/40">
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-red-300">
                            Remove {player.firstName} {player.lastInitial}? This cannot be undone.
                          </span>
                          <button
                            onClick={async () => {
                              await removePlayer(player.id);
                              setConfirmDelete(null);
                            }}
                            className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors"
                          >
                            Remove
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded hover:bg-slate-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
