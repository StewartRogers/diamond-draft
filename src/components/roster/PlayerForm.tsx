"use client";

import { useState } from "react";
import type { Player, Position, FieldPosition, PositionRating, DefenseRating } from "@/lib/types";
import { FIELD_POSITIONS, ALL_POSITIONS, DEFENSE_TIER_CFG } from "@/lib/types";

// Tier display config — used in both the cycling buttons and the legend
const TIER_CFG = {
  1: { label: "Primary",   bg: "#fef3c7", border: "#f59e0b", text: "#92400e", sup: "¹" },
  2: { label: "Secondary", bg: "#dbeafe", border: "#3b82f6", text: "#1e40af", sup: "²" },
  3: { label: "Can play",  bg: "#dcfce7", border: "#22c55e", text: "#166534", sup: "³" },
} as const;

const FIELD_POS_SET = new Set<string>(FIELD_POSITIONS);

type Props = {
  initial?: Player;
  onSave: (data: {
    firstName: string;
    lastInitial: string;
    jerseyNumber: string;
    eligiblePositions: Position[];
    positionRatings: Partial<Record<FieldPosition, PositionRating>>;
    defenseRating?: DefenseRating;
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
  const [positionRatings, setPositionRatings] = useState<Partial<Record<FieldPosition, PositionRating>>>(
    initial?.positionRatings ?? {}
  );
  const [defenseRating, setDefenseRating] = useState<DefenseRating | undefined>(
    initial?.defenseRating
  );
  const [isGuest, setIsGuest] = useState(initial?.isGuest ?? false);
  const [pitchingLimitGame, setPitchingLimitGame] = useState(
    initial?.pitchingLimitGame ?? 3
  );
  const [pitchingLimitSeason, setPitchingLimitSeason] = useState(
    initial?.pitchingLimitSeason ?? 0
  );

  // Field positions cycle: Off → Tier 1 → Tier 2 → Tier 3 → Off
  // A position that is eligible but has no rating (e.g. loaded from legacy data
  // before tier ratings existed) is treated as "unrated" and bumped to Tier 1.
  function cycleFieldPosition(pos: FieldPosition) {
    const currentRating = positionRatings[pos];
    const isEligible = eligiblePositions.includes(pos);

    if (!isEligible || currentRating === undefined) {
      // Off or eligible-but-unrated → Tier 1
      if (!isEligible) {
        setEligiblePositions((prev) => [...prev, pos]);
      }
      setPositionRatings((prev) => ({ ...prev, [pos]: 1 as PositionRating }));
    } else if (currentRating === 1) {
      // Tier 1 → Tier 2
      setPositionRatings((prev) => ({ ...prev, [pos]: 2 as PositionRating }));
    } else if (currentRating === 2) {
      // Tier 2 → Tier 3
      setPositionRatings((prev) => ({ ...prev, [pos]: 3 as PositionRating }));
    } else {
      // Tier 3 → Off
      setEligiblePositions((prev) => prev.filter((p) => p !== pos));
      setPositionRatings((prev) => {
        const next = { ...prev };
        delete next[pos];
        return next;
      });
    }
  }

  // Non-field positions (Bench, Bullpen) remain simple toggles
  function toggleNonFieldPosition(pos: Position) {
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
      positionRatings,
      defenseRating,
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

      {/* Overall defense rating */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-slate-400">
            Overall Defense Rating
          </label>
          <span className="text-xs text-slate-500">click to set · click again to clear</span>
        </div>
        <div className="flex gap-2">
          {([1, 2, 3, 4] as DefenseRating[]).map((tier) => {
            const { label, bg, border, text } = DEFENSE_TIER_CFG[tier];
            const active = defenseRating === tier;
            return (
              <button
                key={tier}
                type="button"
                onClick={() => setDefenseRating(active ? undefined : tier)}
                className="flex-1 py-2 rounded-md text-xs font-semibold border transition-colors"
                style={
                  active
                    ? { background: bg, borderColor: border, color: text }
                    : { background: "#1e293b", borderColor: "#334155", color: "#64748b" }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Field positions with tier ratings */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-slate-400">
            Field Positions &amp; Skill Tier
          </label>
          <span className="text-xs text-slate-500">click to set tier · click again to cycle · 4th click removes</span>
        </div>

        {/* Tier legend */}
        <div className="flex gap-3 mb-3">
          {([1, 2, 3] as PositionRating[]).map((tier) => {
            const cfg = TIER_CFG[tier];
            return (
              <span
                key={tier}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border"
                style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.text }}
              >
                <sup style={{ fontSize: "0.65em", fontWeight: 700 }}>{cfg.sup}</sup>
                {cfg.label}
              </span>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {FIELD_POSITIONS.map((pos) => {
            const isEligible = eligiblePositions.includes(pos);
            const tier = isEligible ? (positionRatings[pos] ?? null) : null;
            const cfg = tier ? TIER_CFG[tier] : null;

            return (
              <button
                key={pos}
                type="button"
                onClick={() => cycleFieldPosition(pos)}
                title={tier ? `${pos} — ${TIER_CFG[tier].label} (click to advance tier)` : `${pos} — click to add`}
                className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
                style={
                  cfg
                    ? { background: cfg.bg, borderColor: cfg.border, color: cfg.text }
                    : { background: "#1e293b", borderColor: "#475569", color: "#94a3b8" }
                }
              >
                {pos}
                {tier && (
                  <sup style={{ fontSize: "0.65em", marginLeft: 2, fontWeight: 700 }}>
                    {TIER_CFG[tier].sup}
                  </sup>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Non-field positions (Bench, Bullpen) — simple toggles */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">
          Special Positions
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_POSITIONS.filter((pos) => !FIELD_POS_SET.has(pos)).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => toggleNonFieldPosition(pos)}
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
