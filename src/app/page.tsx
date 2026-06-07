"use client";

import Link from "next/link";
import { useDiamondDraftStore } from "@/lib/store";

export default function HomePage() {
  const players = useDiamondDraftStore((s) => s.players);
  const games = useDiamondDraftStore((s) => s.games);

  const recentGames = [...games]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Diamond Draft</h1>
        <p className="text-slate-400 mt-1">Youth baseball lineup manager</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Players", value: players.length, href: "/roster" },
          { label: "Games", value: games.length, href: "/games" },
          {
            label: "Finalized",
            value: games.filter((g) => g.status === "finalized").length,
            href: "/games",
          },
        ].map(({ label, value, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-500 transition-colors"
          >
            <p className="text-3xl font-bold text-white">{value}</p>
            <p className="text-slate-400 text-sm mt-1">{label}</p>
          </Link>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href="/games"
          className="bg-green-600 hover:bg-green-500 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          + New Game
        </Link>
        <Link
          href="/roster"
          className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          Manage Roster
        </Link>
      </div>

      {/* Recent games */}
      {recentGames.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Recent Games
          </h2>
          <div className="space-y-2">
            {recentGames.map((game) => (
              <Link
                key={game.id}
                href={`/games/${game.id}`}
                className="flex items-center justify-between bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg px-4 py-3 transition-colors"
              >
                <div>
                  <span className="text-white font-medium text-sm">
                    {game.date}
                    {game.opponent && (
                      <span className="text-slate-400 font-normal">
                        {" "}vs {game.opponent}
                      </span>
                    )}
                  </span>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {game.innings.length} innings · {game.rosterSnapshot.length} players
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    game.status === "finalized"
                      ? "bg-green-900/50 text-green-400"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {game.status === "finalized" ? "Finalized" : "Draft"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {players.length === 0 && (
        <div className="bg-blue-950/40 border border-blue-800 rounded-xl p-6 text-sm text-blue-300">
          <p className="font-semibold mb-1">Get started</p>
          <p>
            Head to{" "}
            <Link href="/roster" className="underline">
              Roster
            </Link>{" "}
            to add your players first, then create a game and hit{" "}
            <strong>⚡ Auto-Fill Lineup</strong> to generate a compliant lineup
            instantly.
          </p>
        </div>
      )}
    </div>
  );
}
