"use client";

import { useState } from "react";
import Link from "next/link";
import { useDiamondDraftStore } from "@/lib/store";
import GameForm from "@/components/game/GameForm";

export default function GamesPage() {
  const games = useDiamondDraftStore((s) => s.games);
  const deleteGame = useDiamondDraftStore((s) => s.deleteGame);
  const players = useDiamondDraftStore((s) => s.players);

  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Games</h1>
          <p className="text-slate-400 text-sm mt-1">
            Create a game, then auto-fill the lineup in one click.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            disabled={players.length === 0}
            title={players.length === 0 ? "Add players to your roster first" : ""}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + New Game
          </button>
        )}
      </div>

      {players.length === 0 && (
        <div className="bg-yellow-950/40 border border-yellow-800 rounded-lg px-4 py-3 text-sm text-yellow-300">
          Add players to your{" "}
          <Link href="/roster" className="underline font-medium">
            roster
          </Link>{" "}
          before creating a game.
        </div>
      )}

      {showForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">New Game</h3>
          <GameForm onCancel={() => setShowForm(false)} />
        </div>
      )}

      {sorted.length === 0 && !showForm ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          No games yet. Create your first game above.
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((game) => (
            <div key={game.id}>
              <div className="flex items-center justify-between bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-lg px-4 py-3 transition-colors">
                <Link href={`/games/${game.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-white font-medium text-sm">
                        {game.date}
                        {game.opponent && (
                          <span className="text-slate-400 font-normal">
                            {" "}vs {game.opponent}
                          </span>
                        )}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {game.innings.length} innings · {game.rosterSnapshot.length} players
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ml-auto ${
                        game.status === "finalized"
                          ? "bg-green-900/50 text-green-400"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {game.status === "finalized" ? "Finalized" : "Draft"}
                    </span>
                  </div>
                </Link>
                <button
                  onClick={() => setConfirmDelete(game.id)}
                  className="ml-4 text-slate-500 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                >
                  Delete
                </button>
              </div>

              {confirmDelete === game.id && (
                <div className="bg-red-950/40 border border-red-800 rounded-lg px-4 py-3 flex items-center gap-4 text-sm">
                  <span className="text-red-300">Delete this game? This cannot be undone.</span>
                  <button
                    onClick={async () => {
                      await deleteGame(game.id);
                      setConfirmDelete(null);
                    }}
                    className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
