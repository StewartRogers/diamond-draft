"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useDiamondDraftStore } from "@/lib/store";
import LineupGrid from "@/components/game/LineupGrid";

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const games = useDiamondDraftStore((s) => s.games);
  const players = useDiamondDraftStore((s) => s.players);
  const violations = useDiamondDraftStore((s) => s.violations);
  const setActiveGame = useDiamondDraftStore((s) => s.setActiveGame);
  const activeGameId = useDiamondDraftStore((s) => s.activeGameId);

  const game = games.find((g) => g.id === id);

  // Set as active game after render to avoid setState during render
  useEffect(() => {
    if (game && activeGameId !== id) {
      setActiveGame(id);
    }
  }, [game, activeGameId, id, setActiveGame]);

  if (!game) {
    return (
      <div className="text-center py-24 text-slate-500">
        Game not found.{" "}
        <Link href="/games" className="text-blue-400 underline">
          Back to games
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Link href="/games" className="hover:text-white transition-colors">
              Games
            </Link>
            <span>/</span>
            <span className="text-white">{game.date}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            {game.teamName ? `${game.teamName} ` : ""}
            {game.opponent ? `vs ${game.opponent}` : game.date}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {game.innings.length} innings · {game.rosterSnapshot.length} players ·{" "}
            <span
              className={
                game.status === "finalized" ? "text-green-400" : "text-slate-500"
              }
            >
              {game.status === "finalized" ? "Finalized" : "Draft"}
            </span>
          </p>
        </div>
      </div>

      <LineupGrid game={game} players={players} violations={violations} />
    </div>
  );
}
