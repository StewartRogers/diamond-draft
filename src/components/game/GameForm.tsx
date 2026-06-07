"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDiamondDraftStore } from "@/lib/store";

export default function GameForm({ onCancel }: { onCancel: () => void }) {
  const createGame = useDiamondDraftStore((s) => s.createGame);
  const defaultTeamName = useDiamondDraftStore((s) => s.settings.teamName);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [opponent, setOpponent] = useState("");
  const [teamName, setTeamName] = useState(defaultTeamName);
  const [innings, setInnings] = useState(7);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const game = await createGame({ date, opponent, teamName, notes: "" }, innings);
    router.push(`/games/${game.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Game Date
          </label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Innings
          </label>
          <input
            type="number"
            min={1}
            max={12}
            value={innings}
            onChange={(e) => setInnings(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Opponent (optional)
        </label>
        <input
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="e.g. Blue Jays"
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Your Team Name (optional)
        </label>
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="e.g. Cardinals"
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold py-2 rounded-md transition-colors"
        >
          {loading ? "Creating…" : "Create Game"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-md transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
