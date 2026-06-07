"use client";

import { useState } from "react";
import type { Player, Position } from "@/lib/types";
import { ALL_POSITIONS, FIELD_POSITIONS } from "@/lib/types";

type Props = {
  initial?: Player;
  onSave: (data: {
    firstName: string;
    lastInitial: string;
    jerseyNumber: string;
    eligiblePositions: Position[];
    isGuest: boolean;
    pitchingLimitGame: number;
    pitchingLimitSeason: number;
  }) => void;
  onCancel: () => void;
};

export default function PlayerForm({ initial, onSave, onCancel }: Props) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastInitial, setLastInitial] = useState(initial?.lastInitial ?? "");
  const [jerseyNumber, setJerseyNumber] = useState(initial?.jerseyNumber ?? "");
  const [eligiblePositions, setEligiblePositions] = useState<Position[]>(
    initial?.eligiblePositions ?? [...FIELD_POSITIONS]
  );
  const [isGuest, setIsGuest] = useState(initial?.isGuest ?? false);
  const [pitchingLimitGame, setPitchingLimitGame] = useState(
    initial?.pitchingLimitGame ?? 3
  );
  const [pitchingLimitSeason, setPitchingLimitSeason] = useState(
    initial?.pitchingLimitSeason ?? 0
  );

  function togglePosition(pos: Position) {
    setEligiblePositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastInitial.trim() || !jerseyNumber.trim()) return;
    onSave({
      firstName: firstName.trim(),
      lastInitial: lastInitial.trim().charAt(0).toUpperCase(),
      jerseyNumber: jerseyNumber.trim(),
      eligiblePositions,
      isGuest,
      pitchingLimitGame,
      pitchingLimitSeason,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-400 mb-1">
            First Name
          </label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Jamie"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Last Initial
          </label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={lastInitial}
            maxLength={1}
            onChange={(e) => setLastInitial(e.target.value)}
            placeholder="R"
            required
          />
        </div>
      </div>

      {/* Jersey + Guest */}
      <div className="grid grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Jersey #
          </label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={jerseyNumber}
            onChange={(e) => setJerseyNumber(e.target.value)}
            placeholder="12"
            required
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input
            id="isGuest"
            type="checkbox"
            checked={isGuest}
            onChange={(e) => setIsGuest(e.target.checked)}
            className="w-4 h-4 accent-yellow-400"
          />
          <label htmlFor="isGuest" className="text-sm text-slate-300">
            Guest player
          </label>
        </div>
      </div>

      {/* Eligible positions */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">
          Eligible Positions
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_POSITIONS.map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => togglePosition(pos)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                eligiblePositions.includes(pos)
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Pitching limits */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Pitch Limit / Game (innings, 0 = use league default)
          </label>
          <input
            type="number"
            min={0}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={pitchingLimitGame}
            onChange={(e) => setPitchingLimitGame(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Pitch Limit / Season (innings, 0 = unlimited)
          </label>
          <input
            type="number"
            min={0}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={pitchingLimitSeason}
            onChange={(e) => setPitchingLimitSeason(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-md transition-colors"
        >
          {initial ? "Save Changes" : "Add Player"}
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
