"use client";

import Link from "next/link";
import { use } from "react";
import { useDiamondDraftStore } from "@/lib/store";

export default function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const games = useDiamondDraftStore((s) => s.games);
  const players = useDiamondDraftStore((s) => s.players);
  const game = games.find((g) => g.id === id);

  if (!game) {
    return (
      <div className="p-8 text-center">
        Game not found. <Link href="/games">Back</Link>
      </div>
    );
  }

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const order = game.battingOrder && game.battingOrder.length > 0
    ? game.battingOrder
    : game.rosterSnapshot.map((p) => p.id);

  return (
    <div className="p-6 bg-white text-slate-900">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">{game.teamName ?? "Team"} — {game.date}</h1>
          <div className="text-sm text-slate-600">{game.opponent}</div>
        </div>
        <div>
          <button onClick={() => window.print()} className="px-3 py-2 bg-blue-600 text-white rounded">Print</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border px-2 py-1">#</th>
              <th className="border px-2 py-1">Player</th>
              {game.innings.map((inn) => (
                <th key={inn.inning} className="border px-2 py-1 text-center">Inn {inn.inning}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((pid, idx) => {
              const p = playerMap.get(pid);
              return (
                <tr key={pid}>
                  <td className="border px-2 py-1 text-center">{idx + 1}</td>
                  <td className="border px-2 py-1">{p ? `${p.firstName} ${p.lastInitial}. (#${p.jerseyNumber})` : pid}</td>
                  {game.innings.map((inn) => {
                    const slot = inn.slots.find((s) => s.playerId === pid);
                    return <td key={inn.inning} className="border px-2 py-1 text-center">{slot ? slot.position : ""}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
