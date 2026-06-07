"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useDiamondDraftStore } from "@/lib/store";
import LineupBuilder from "@/components/game/LineupBuilder";
import { C, FitCard, Pill } from "@/components/AppShell";

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
      <div style={{ textAlign: "center", padding: "96px 0", color: C.faint, fontFamily: "var(--font-sans)" }}>
        Game not found.{" "}
        <Link href="/games" style={{ color: C.green }}>Back to games</Link>
      </div>
    );
  }

  const gameRoster = game.rosterSnapshot.length > 0 ? game.rosterSnapshot : players;

  const statusPill =
    game.status === "finalized"
      ? { t: "Finalized", fg: C.green, bg: C.greenBg, bd: C.greenBd }
      : { t: "Draft · not finalized", fg: C.amber, bg: C.amberBg, bd: C.amberBd };

  return (
    <div className="dd-wrap-wide">
      {/* Breadcrumb + status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Link href="/games" className="dd-crumb">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 4l-5 5 5 5"/>
          </svg>
          Games
        </Link>
        <Pill fg={statusPill.fg} bg={statusPill.bg} bd={statusPill.bd}>
          {statusPill.t}
        </Pill>
      </div>

      {/* Builder — FitCard scales down to fit, never up */}
      <FitCard width={1320}>
        <LineupBuilder game={game} players={gameRoster} />
      </FitCard>
    </div>
  );
}
