"use client";

import { useState } from "react";
import { useDiamondDraftStore } from "@/lib/store";
import { C, GameRow, NewGameModal, PageHeader } from "@/components/AppShell";

export default function GamesPage() {
  const games = useDiamondDraftStore((s) => s.games);
  const players = useDiamondDraftStore((s) => s.players);
  const [showModal, setShowModal] = useState(false);
  const [filt, setFilt] = useState<"all" | "draft" | "finalized">("all");

  const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date));
  const shown = sorted.filter((g) => filt === "all" || g.status === filt);
  const draft = games.filter((g) => g.status === "draft").length;

  return (
    <div className="dd-wrap">
      <PageHeader
        eyebrow="Season schedule"
        title="Games"
        subtitle={`${games.length} games · ${draft} need a lineup before game day.`}
        action={
          <button
            className="dd-btn pri"
            onClick={() => setShowModal(true)}
            disabled={players.length === 0}
            title={players.length === 0 ? "Add players to your roster first" : undefined}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round">
              <path d="M8 3v10M3 8h10"/>
            </svg>
            New game
          </button>
        }
      />

      {players.length === 0 && (
        <div
          style={{
            background: C.amberBg, border: `1px solid ${C.amberBd}`,
            borderRadius: 12, padding: "13px 16px",
            fontSize: 13.5, color: C.amber, marginBottom: 20,
          }}
        >
          Add players to your roster before creating a game.
        </div>
      )}

      {/* Filter segmented control */}
      <div className="dd-seg" style={{ marginBottom: 16 }}>
        {(["all", "draft", "finalized"] as const).map((k) => (
          <button key={k} className={filt === k ? "on" : ""} onClick={() => setFilt(k)}>
            {k === "all" ? "All" : k === "draft" ? "Draft" : "Finalized"}
          </button>
        ))}
      </div>

      {/* Game list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {shown.map((game) => (
          <GameRow key={game.id} game={game} />
        ))}
        {shown.length === 0 && (
          <div className="dd-card" style={{ padding: 40, textAlign: "center", color: C.faint }}>
            No games in this filter.
          </div>
        )}
      </div>

      {showModal && <NewGameModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
