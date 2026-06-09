/**
 * Auto-lineup solver for Diamond Draft.
 *
 * Generates a complete, rules-compliant game lineup in one pass.
 * Uses a two-phase greedy approach:
 *   Phase 1 — Hard constraints: eligibility, pitch limits, availability, locked slots.
 *   Phase 2 — Soft scoring: fair play time, bench distribution, position variety,
 *              back-to-back bench avoidance, pitching rest.
 *
 * The solver works inning-by-inning but carries forward cumulative state so that
 * decisions in early innings account for fairness obligations in later innings.
 */

import type {
  Player,
  Game,
  InningAssignment,
  InningSlot,
  PlayerGameOverride,
  Position,
  FieldPosition,
  LeagueRules,
} from "./types";
import { FIELD_POSITIONS } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AutoLineupResult = {
  innings: InningAssignment[];
  /** Human-readable notes about decisions made (for UI display). */
  log: string[];
  /** True if all hard constraints are satisfied. */
  feasible: boolean;
  /** Violations that couldn't be resolved (soft failures). */
  warnings: string[];
};

type PlayerState = {
  id: string;
  /** Field innings assigned so far in this game. */
  fieldInnings: number;
  /** Bench innings assigned so far in this game. */
  benchInnings: number;
  /** Pitching innings assigned so far in this game. */
  pitchInnings: number;
  /** How many consecutive bench innings ending at the last assigned inning. */
  consecutiveBench: number;
  /** Which positions have been played this game (for variety scoring). */
  positionsPlayed: Set<Position>;
  /** The position assigned in the last inning (for back-to-back detection). */
  lastPosition: Position | null;
  /** The inning number when the player last pitched (or null). */
  lastPitchInning: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFieldPos(pos: Position): pos is FieldPosition {
  return (FIELD_POSITIONS as readonly string[]).includes(pos);
}

function isPitchingPos(pos: Position): boolean {
  return pos === "P" || pos === "Bullpen - P";
}

function isCatchingPos(pos: Position): boolean {
  return pos === "C" || pos === "Bullpen - C";
}

function isBenchPos(pos: Position): boolean {
  return pos === "Bench";
}

function playerAvailableInInning(
  playerId: string,
  inning: number,
  overrides: PlayerGameOverride[]
): boolean {
  const o = overrides.find((x) => x.playerId === playerId);
  if (!o) return true;
  if (o.status === "absent") return false;
  if (o.status === "late" && o.inning != null) return inning >= o.inning;
  if (o.status === "earlyLeave" && o.inning != null) return inning <= o.inning;
  return true;
}

function seasonPitchingInnings(player: Player, currentGameId: string): number {
  return player.pitchingLog
    .filter((e) => e.gameId !== currentGameId)
    .reduce((s, e) => s + e.innings, 0);
}

/** How many innings remain (including this one) for a player based on overrides. */
function remainingInnings(
  playerId: string,
  fromInning: number,
  totalInnings: number,
  overrides: PlayerGameOverride[]
): number {
  let count = 0;
  for (let i = fromInning; i <= totalInnings; i++) {
    if (playerAvailableInInning(playerId, i, overrides)) count++;
  }
  return count;
}

// ─── Solver ───────────────────────────────────────────────────────────────────

export function buildAutoLineup(
  players: Player[],
  existingInnings: InningAssignment[],
  overrides: PlayerGameOverride[],
  rules: LeagueRules,
  game: Pick<Game, "id">
): AutoLineupResult {
  const log: string[] = [];
  const warnings: string[] = [];
  let feasible = true;

  const totalInnings = existingInnings.length;

  // Initialise per-player mutable state
  const state = new Map<string, PlayerState>();
  for (const p of players) {
    state.set(p.id, {
      id: p.id,
      fieldInnings: 0,
      benchInnings: 0,
      pitchInnings: 0,
      consecutiveBench: 0,
      positionsPlayed: new Set(),
      lastPosition: null,
      lastPitchInning: null,
    });
  }

  // Build result innings, respecting locked slots
  const resultInnings: InningAssignment[] = existingInnings.map((inn) => ({
    ...inn,
    slots: inn.slots.map((s) => ({ ...s })),
  }));

  for (let inningIdx = 0; inningIdx < totalInnings; inningIdx++) {
    const inningNumber = inningIdx + 1;
    const inning = resultInnings[inningIdx];

    // ── Collect locked assignments first ──────────────────────────────────
    const lockedPlayerIds = new Set<string>();
    for (const slot of inning.slots) {
      if (slot.locked && slot.playerId) {
        lockedPlayerIds.add(slot.playerId);
        const ps = state.get(slot.playerId);
        if (ps) {
          if (isFieldPos(slot.position)) ps.fieldInnings++;
          else if (isBenchPos(slot.position)) {
            ps.benchInnings++;
            ps.consecutiveBench++;
          } else {
            // bullpen counts as field for fair-play purposes
            ps.fieldInnings++;
            ps.consecutiveBench = 0;
          }
          if (isPitchingPos(slot.position)) ps.pitchInnings++;
          if (isPitchingPos(slot.position)) ps.lastPitchInning = inningNumber;
          ps.positionsPlayed.add(slot.position);
          ps.lastPosition = slot.position;
        }
      }
    }

    // ── Available players for this inning (not absent, not locked) ─────────
    const available = players.filter(
      (p) =>
        !lockedPlayerIds.has(p.id) &&
        playerAvailableInInning(p.id, inningNumber, overrides)
    );

    // ── Positions that still need filling (not locked) ─────────────────────
    const openSlots = inning.slots.filter((s) => !s.locked);
    const fieldSlots = openSlots.filter((s) => isFieldPos(s.position));
    const benchSlots = openSlots.filter((s) => isBenchPos(s.position));
    const bullpenSlots = openSlots.filter(
      (s) => s.position === "Bullpen - P" || s.position === "Bullpen - C"
    );

    // How many field spots need filling.
    // Only locked *field* slots count against maxFieldPlayers — bench and bullpen
    // locks should not reduce the number of open field positions we fill.
    const lockedFieldCount = inning.slots.filter(
      (s) => s.locked && s.playerId != null && isFieldPos(s.position)
    ).length;
    const fieldSpotsNeeded = Math.min(
      fieldSlots.length,
      rules.maxFieldPlayers - lockedFieldCount
    );

    // ── Score each (player, position) pair ────────────────────────────────
    // Returns Infinity for hard violations, otherwise a lower score = better.
    function score(player: Player, pos: Position): number {
      const ps = state.get(player.id)!;

      // Hard: position eligibility
      if (
        rules.enforcePositionEligibility &&
        isFieldPos(pos) &&
        !player.eligiblePositions.includes(pos)
      ) {
        return Infinity;
      }

      // Hard: pitching limits
      if (isPitchingPos(pos)) {
        const gameLimit =
          player.pitchingLimitGame > 0
            ? player.pitchingLimitGame
            : rules.globalPitchingLimitGame > 0
            ? rules.globalPitchingLimitGame
            : Infinity;
        if (ps.pitchInnings + 1 > gameLimit) return Infinity;

        if (player.pitchingLimitSeason > 0) {
          const seasonTotal = seasonPitchingInnings(player, game.id);
          if (seasonTotal + ps.pitchInnings + 1 > player.pitchingLimitSeason)
            return Infinity;
        }

        // Hard: no pitching after catching (if rule enabled)
        if (rules.enforceNoPitchingAfterCatching) {
          const caughtBefore = [...ps.positionsPlayed].some(isCatchingPos);
          if (caughtBefore) return Infinity;
        }

        // Hard: enforce pitching rest between appearances
        if (rules.pitchingRestInnings && ps.lastPitchInning != null) {
          const gap = inningNumber - ps.lastPitchInning - 1;
          if (gap < rules.pitchingRestInnings) return Infinity;
        }
      }

      // Hard: back-to-back bench beyond limit (0 = rule disabled / no limit)
      if (isBenchPos(pos) && rules.maxConsecutiveBench > 0 && ps.consecutiveBench + 1 > rules.maxConsecutiveBench) {
        return Infinity;
      }

      // ── Soft scoring (lower = more desirable) ────────────────────────────
      let s = 0;

      // Fair play time — players with fewer field innings get priority
      const remaining = remainingInnings(
        player.id,
        inningNumber + 1,
        totalInnings,
        overrides
      );
      const fieldDeficit =
        rules.minFieldInningsPerPlayer -
        ps.fieldInnings -
        (isFieldPos(pos) ? 1 : 0);

      if (isBenchPos(pos)) {
        // Penalise benching a player who still needs field time and has few innings left
        if (fieldDeficit > 0 && remaining <= fieldDeficit) s += 1000;
        else if (fieldDeficit > 0) s += fieldDeficit * 50;
        // Penalise consecutive bench (softer than hard limit)
        s += ps.consecutiveBench * 80;
      }

      if (isFieldPos(pos)) {
        // Prefer players who have played fewer field innings (fairness)
        s += ps.fieldInnings * 30;
        // Prefer position variety (don't always play the same spot)
        if (ps.positionsPlayed.has(pos)) s += 10;
        // Prefer pitching for players with more remaining capacity
        if (pos === "P") {
          const gameLimit =
            player.pitchingLimitGame > 0
              ? player.pitchingLimitGame
              : rules.globalPitchingLimitGame > 0
              ? rules.globalPitchingLimitGame
              : totalInnings;
          s -= (gameLimit - ps.pitchInnings) * 5; // more capacity = slight preference
        }
      }

      // Prefer not to repeat the exact same position back-to-back (variety)
      if (ps.lastPosition === pos && !isBenchPos(pos)) s += 15;

      return s;
    }

    // ── Greedy assignment: fill field positions first ─────────────────────
    // Sort field positions by "hardest to fill" (fewest eligible players first)
    const sortedFieldSlots = [...fieldSlots].sort((a, b) => {
      const aEligible = available.filter(
        (p) =>
          !rules.enforcePositionEligibility ||
          p.eligiblePositions.includes(a.position)
      ).length;
      const bEligible = available.filter(
        (p) =>
          !rules.enforcePositionEligibility ||
          p.eligiblePositions.includes(b.position)
      ).length;
      return aEligible - bEligible;
    });

    const assignedThisInning = new Set<string>(lockedPlayerIds);

    const tryAssign = (
      slots: InningSlot[],
      candidatePlayers: Player[]
    ): void => {
      for (const slot of slots) {
        const unassigned = candidatePlayers.filter(
          (p) => !assignedThisInning.has(p.id)
        );

        // Score and sort candidates for this position
        const scored = unassigned
          .map((p) => ({ player: p, s: score(p, slot.position) }))
          .filter((x) => x.s < Infinity)
          .sort((a, b) => a.s - b.s);

        if (scored.length === 0) {
          // No eligible player — leave empty and flag
          warnings.push(
            `Inning ${inningNumber}: no eligible player found for ${slot.position}.`
          );
          feasible = false;
          continue;
        }

        const best = scored[0].player;
        slot.playerId = best.id;
        assignedThisInning.add(best.id);

        const ps = state.get(best.id)!;
        if (isFieldPos(slot.position)) {
          ps.fieldInnings++;
          ps.consecutiveBench = 0;
        } else if (isBenchPos(slot.position)) {
          ps.benchInnings++;
          ps.consecutiveBench++;
        } else {
          ps.fieldInnings++; // bullpen = active
          ps.consecutiveBench = 0;
        }
        if (isPitchingPos(slot.position)) {
          ps.pitchInnings++;
          ps.lastPitchInning = inningNumber;
        }
        ps.positionsPlayed.add(slot.position);
        ps.lastPosition = slot.position;
      }
    };

    // Assign field (hardest constraints first), then bullpen, then bench
    tryAssign(sortedFieldSlots.slice(0, fieldSpotsNeeded), available);
    tryAssign(bullpenSlots, available);

    // Remaining available players go to bench
    const unassignedPlayers = available.filter(
      (p) => !assignedThisInning.has(p.id)
    );

    // If more players than bench slots, add overflow bench slots dynamically
    while (benchSlots.length < unassignedPlayers.length) {
      benchSlots.push({ position: "Bench", playerId: null });
      inning.slots.push({ position: "Bench", playerId: null });
    }

    tryAssign(benchSlots.slice(0, unassignedPlayers.length), unassignedPlayers);

    // Force-bench anyone still without a slot (back-to-back constraint couldn't be
    // satisfied). Better to have a complete lineup with a logged warning than a
    // silent gap that renders as an implicit BENCH and triggers false violations.
    const stillUnassigned = available.filter((p) => !assignedThisInning.has(p.id));
    for (const player of stillUnassigned) {
      const slot: InningSlot = { position: "Bench", playerId: player.id };
      inning.slots.push(slot);
      assignedThisInning.add(player.id);
      const ps = state.get(player.id)!;
      ps.benchInnings++;
      ps.consecutiveBench++;
      ps.positionsPlayed.add("Bench");
      ps.lastPosition = "Bench";
      warnings.push(
        `Inning ${inningNumber}: ${player.firstName} ${player.lastInitial}. ` +
        `force-benched — not enough field spots to avoid back-to-back bench.`
      );
    }

    log.push(
      `Inning ${inningNumber}: assigned ${assignedThisInning.size - lockedPlayerIds.size} player(s).`
    );
  }

  // ── Post-solve fair-play check ─────────────────────────────────────────
  for (const player of players) {
    const override = overrides.find((o) => o.playerId === player.id);
    if (override?.status === "absent") continue;
    const ps = state.get(player.id)!;
    if (
      rules.enforceFairPlayTime &&
      ps.fieldInnings < rules.minFieldInningsPerPlayer
    ) {
      warnings.push(
        `${player.firstName} ${player.lastInitial}. only received ${ps.fieldInnings} field inning(s) — minimum is ${rules.minFieldInningsPerPlayer}. Consider adjusting eligibility or adding innings.`
      );
    }
  }

  return { innings: resultInnings, log, feasible, warnings };
}

// ─── Single-inning fill ───────────────────────────────────────────────────────

/**
 * Fill only the open (non-locked) slots in a single inning, given the
 * already-committed assignments in all prior innings.
 * Useful for mid-game adjustments without regenerating the whole lineup.
 */
export function fillSingleInning(
  inningNumber: number,
  players: Player[],
  game: Game,
  rules: LeagueRules
): InningAssignment {
  // Rebuild state from prior innings
  const priorInnings = game.innings.filter((i) => i.inning < inningNumber);
  const partialGame: Game = {
    ...game,
    innings: [
      ...priorInnings,
      game.innings.find((i) => i.inning === inningNumber)!,
    ],
  };

  const result = buildAutoLineup(
    players,
    partialGame.innings,
    game.playerOverrides,
    rules,
    game
  );

  return (
    result.innings.find((i) => i.inning === inningNumber) ??
    game.innings.find((i) => i.inning === inningNumber)!
  );
}
