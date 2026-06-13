"use client";

import Link from "next/link";
import { use, useEffect } from "react";
import { useDiamondDraftStore } from "@/lib/store";

const PRINT_INNINGS = 7;

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
  const absentIds = new Set(
    (game.playerOverrides ?? [])
      .filter((o) => o.status === "absent")
      .map((o) => o.playerId)
  );
  const rawOrder =
    game.battingOrder && game.battingOrder.length > 0
      ? game.battingOrder
      : game.rosterSnapshot.map((p) => p.id);
  const order = rawOrder.filter((pid) => !absentIds.has(pid));

  // Cap innings at PRINT_INNINGS; pad if fewer exist
  const inningNums = Array.from({ length: PRINT_INNINGS }, (_, i) => i + 1);
  const inningMap = new Map(game.innings.map((inn) => [inn.inning, inn]));

  return (
    <>
      <style>{`
        @page {
          size: letter landscape;
          margin: 12mm 10mm;
        }

        /* Hide the app nav on this page — both on screen and in print */
        body > div nav, nav { display: none !important; }

        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }

        .print-page {
          width: 100%;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11pt;
          color: #111;
          background: white;
        }

        .print-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 8px;
        }

        .print-title { font-size: 14pt; font-weight: bold; }
        .print-subtitle { font-size: 10pt; color: #555; font-weight: bold; }

        .lineup-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .lineup-table th,
        .lineup-table td {
          border: 2px solid #111;
          padding: 8px 6px;
          text-align: center;
          vertical-align: middle;
          font-weight: bold;
        }

        /* Player name column gets more space */
        .col-num  { width: 28px; }
        .col-name { text-align: left; }
        .col-inn  { width: calc((100% - 28px - 160px) / ${PRINT_INNINGS}); }

        .lineup-table thead th {
          background: #e2e8f0;
          font-weight: bold;
          font-size: 10pt;
        }

        .lineup-table tbody tr:nth-child(even) {
          background: #f8fafc;
        }
      `}</style>

      <div className="print-page p-6">
        {/* Preview header — hidden when printing */}
        <div className="no-print flex items-center gap-4 mb-6 p-4 bg-slate-100 rounded-lg">
          <Link href={`/games/${id}`} className="text-blue-600 underline text-sm">
            ← Back to lineup
          </Link>
          <span className="flex-1 text-slate-600 text-sm">
            Print preview — {PRINT_INNINGS} innings, landscape Letter
          </span>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
          >
            Print / Save PDF
          </button>
        </div>

        {/* Game header */}
        <div className="print-header">
          <div>
            <div className="print-title">
              {game.teamName ?? "Team"} vs {game.opponent || "—"}
            </div>
            <div className="print-subtitle">{game.date}</div>
          </div>
          <div className="print-subtitle no-print">Lineup sheet</div>
        </div>

        {/* Lineup table */}
        <table className="lineup-table">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th className="col-name">Player</th>
              {inningNums.map((n) => (
                <th key={n} className="col-inn">Inn {n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((pid, idx) => {
              const p = playerMap.get(pid);
              const name = p
                ? `${p.firstName} ${p.lastInitial}`
                : pid;
              return (
                <tr key={pid}>
                  <td className="col-num">{idx + 1}</td>
                  <td className="col-name">{name}</td>
                  {inningNums.map((n) => {
                    const inn = inningMap.get(n);
                    const slot = inn?.slots.find((s) => s.playerId === pid);
                    return (
                      <td key={n} className="col-inn">
                        {slot?.position ?? ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
