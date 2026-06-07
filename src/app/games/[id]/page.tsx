"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useDiamondDraftStore } from "@/lib/store";
import LineupBuilder from "@/components/game/LineupBuilder";

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const games = useDiamondDraftStore((s) => s.games);
  const players = useDiamondDraftStore((s) => s.players);
  const setActiveGame = useDiamondDraftStore((s) => s.setActiveGame);
  const activeGameId = useDiamondDraftStore((s) => s.activeGameId);

  const game = games.find((g) => g.id === id);

  useEffect(() => {
    if (game && activeGameId !== id) {
      setActiveGame(id);
    }
  }, [game, activeGameId, id, setActiveGame]);

  if (!game) {
    return (
      <div style={{ textAlign: "center", padding: "96px 0", color: "#a09a8e", fontFamily: "var(--font-hanken),'Hanken Grotesk',sans-serif" }}>
        Game not found.{" "}
        <Link href="/games" style={{ color: "#3f6212" }}>
          Back to games
        </Link>
      </div>
    );
  }

  // Use the roster snapshot (players at game creation time) merged with current players
  // Prefer rosterSnapshot if available, fall back to current players
  const gameRoster = game.rosterSnapshot.length > 0 ? game.rosterSnapshot : players;

  return <LineupBuilder game={game} players={gameRoster} />;
}
