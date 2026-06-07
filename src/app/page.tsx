"use client";

import { useState } from "react";
import Link from "next/link";
import { useDiamondDraftStore } from "@/lib/store";
import { C, Pill, GameRow, NewGameModal, PageHeader } from "@/components/AppShell";

export default function HomePage() {
  const players = useDiamondDraftStore((s) => s.players);
  const games = useDiamondDraftStore((s) => s.games);
  const teamName = useDiamondDraftStore((s) => s.settings.teamName);
  const [showModal, setShowModal] = useState(false);

  const sorted = [...games].sort((a, b) => b.date.localeCompare(a.date));
  const finalized = games.filter((g) => g.status === "finalized").length;
  const draft = games.filter((g) => g.status === "draft").length;

  const stats = [
    { n: players.length, label: "Players on roster", sub: `${players.length} on active roster` },
    { n: games.length, label: "Games planned", sub: `${draft} in draft` },
    { n: finalized, label: "Lineups finalized", sub: finalized === 0 ? "None locked yet" : "Ready to print" },
  ];

  return (
    <div className="dd-wrap">
      <PageHeader
        eyebrow={teamName ? teamName : "Diamond Draft"}
        title="Dugout"
        subtitle="Plan fair, rule-clean lineups for every game on the schedule."
        action={
          <>
            <Link href="/roster" className="dd-btn sec">Manage roster</Link>
            <button className="dd-btn pri" onClick={() => setShowModal(true)}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round">
                <path d="M8 3v10M3 8h10"/>
              </svg>
              New game
            </button>
          </>
        }
      />

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginBottom: 34 }}>
        {stats.map((s, i) => (
          <div key={i} className="dd-card" style={{ padding: "22px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1, color: C.green }}>
                {s.n}
              </span>
              <span
                style={{
                  width: 30, height: 30, transform: "rotate(45deg)",
                  background: C.greenBg, border: `1px solid ${C.greenBd}`, borderRadius: 7,
                }}
              />
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 16 }}>{s.label}</div>
            <div style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Game list */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span className="dd-eyebrow">Upcoming &amp; recent games</span>
        <Link href="/games" style={{ fontSize: 13, color: C.muted, fontWeight: 600, textDecoration: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.green)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
        >
          View all →
        </Link>
      </div>

      {sorted.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {sorted.slice(0, 5).map((game) => (
            <GameRow key={game.id} game={game} />
          ))}
        </div>
      ) : (
        <div
          className="dd-card"
          style={{ padding: 40, textAlign: "center", color: C.faint, fontSize: 14 }}
        >
          No games yet.{" "}
          <button
            onClick={() => setShowModal(true)}
            style={{ color: C.green, fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontSize: "inherit" }}
          >
            Create your first game →
          </button>
        </div>
      )}

      {players.length === 0 && (
        <div
          style={{
            marginTop: 24, background: C.greenBg, border: `1px solid ${C.greenBd}`,
            borderRadius: 12, padding: "16px 20px", fontSize: 13.5, color: C.green,
          }}
        >
          <strong>Get started —</strong> head to{" "}
          <Link href="/roster" style={{ color: C.green, fontWeight: 700 }}>Roster</Link>
          {" "}to add your players, then create a game and hit{" "}
          <strong>Auto-fill lineup</strong> to generate a compliant lineup instantly.
        </div>
      )}

      {showModal && <NewGameModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
