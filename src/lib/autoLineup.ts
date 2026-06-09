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
  GameStatus,
} from "./types";
import { FIELD_POSITIONS } from "./types";
import { validateGame } from "./rules";

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
  /** The inning number of the player's most recent *actual* P assignment (not Bullpen-P). */
  lastActualPitchInning: number | null;
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

/**
 * Count consecutive bench innings for a player ending at (and including)
 * upToInning, stopping when an inning where the player is unavailable is found.
 * Reads directly from innings data — used by the post-solve repair pass.
 */
function benchConsecutiveCount(
  playerId: string,
  innings: InningAssignment[],
  upToInning: number,
  overrides: PlayerGameOverride[]
): number {
  const sorted = innings
    .filter((i) => i.inning <= upToInning)
    .sort((a, b) => b.inning - a.inning);
  let count = 0;
  for (const inn of sorted) {
    if (!playerAvailableInInning(playerId, inn.inning, overrides)) break;
    const slot = inn.slots.find((s) => s.playerId === playerId);
    if (!slot || slot.position === "Bench") count++;
    else break;
  }
  return count;
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

/**
 * Internal single-pass solver. Separated so the public buildAutoLineup can
 * run multiple attempts with different player orderings and pick the best.
 */
function _solveOnce(
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
      lastActualPitchInning: null,
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

    // ── Clear stale non-locked assignments ───────────────────────────────
    // When auto-fill is run on a game that was previously auto-filled, the
    // innings already contain playerIds in unlocked slots (from the prior run).
    // Extra bench slots added dynamically by a previous force-bench also persist
    // with their old IDs. Clearing them here ensures the solver assigns from a
    // clean slate on every run, preventing ghost assignments that would show as
    // PLAYER_MULTIPLE_POSITIONS or false BACK_TO_BACK_BENCH violations.
    for (const slot of inning.slots) {
      if (!slot.locked) slot.playerId = null;
    }

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
          if (slot.position === "P") ps.lastActualPitchInning = inningNumber;
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

        // Hard: RULE_009 — once removed from the actual pitcher (P) role,
        // a player cannot return to P. "Removed" means there was at least one
        // inning gap (not occupied by Bullpen-P warmup) since the last P slot.
        if (pos === "P" && ps.lastActualPitchInning != null) {
          // Use lastPitchInning (which includes Bullpen-P) so that an
          // inning-N-1 warmup before inning-N pitching doesn't look like a gap.
          const referenceInning = ps.lastPitchInning ?? ps.lastActualPitchInning;
          const gap = inningNumber - referenceInning - 1;
          if (gap > 0) return Infinity;
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
        if (slot.position === "P") ps.lastActualPitchInning = inningNumber;
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

  // ── Post-solve repair: back-to-back bench ────────────────────────────────
  // The greedy solver processes innings forward and can't backtrack. It may
  // leave a player in back-to-back bench if no eligible field slot was open at
  // the time. After the full solve, scan for those violations and fix them by
  // swapping the benched player into a field slot held by a player who can
  // safely bench instead. P and C slots are excluded from swaps so that
  // pitcher/catcher plans (locked or not) are never disturbed by auto-fill.
  // Each pass restarts from inning 1 after any swap; we cap at 30 passes to
  // prevent infinite loops in pathological eligibility configurations.
  if (rules.maxConsecutiveBench > 0) {
    const MAX_REPAIR_PASSES = 30;
    for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
      let swappedThisPass = false;

      for (const inn of resultInnings) {
        const benchViolators = inn.slots.filter(
          (s) => s.playerId && s.position === "Bench" && !s.locked
        );

        for (const bSlot of benchViolators) {
          const pid = bSlot.playerId!;
          const consecutive = benchConsecutiveCount(
            pid,
            resultInnings,
            inn.inning,
            overrides
          );
          if (consecutive <= rules.maxConsecutiveBench) continue;

          // Find a swap partner: an unlocked field slot (not P or C) whose
          // current occupant can safely move to bench without triggering their
          // own back-to-back violation.
          const benchedPlayer = players.find((p) => p.id === pid);
          if (!benchedPlayer) continue;

          const fieldCandidates = inn.slots.filter(
            (s) =>
              s.playerId &&
              !s.locked &&
              isFieldPos(s.position) &&
              s.position !== "P" &&
              s.position !== "C"
          );

          for (const fSlot of fieldCandidates) {
            const swapId = fSlot.playerId!;

            // Eligibility: benched player must be eligible for the field position
            if (
              rules.enforcePositionEligibility &&
              !benchedPlayer.eligiblePositions.includes(fSlot.position)
            ) continue;

            // Safety: would the swap candidate create a back-to-back by benching here?
            const swapConsec = benchConsecutiveCount(
              swapId,
              resultInnings,
              inn.inning - 1,
              overrides
            );
            if (swapConsec >= rules.maxConsecutiveBench) continue;

            // Perform the swap
            fSlot.playerId = pid;
            bSlot.playerId = swapId;
            swappedThisPass = true;
            break;
          }

          if (swappedThisPass) break; // restart inning scan after each swap
        }
        if (swappedThisPass) break;
      }

      if (!swappedThisPass) break; // no more violations fixable
    }
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

// ─── Public entry point: iterative solver ────────────────────────────────────

/**
 * Build a complete auto-lineup, retrying with different player orderings until
 * no error-severity rule violations remain (or the attempt budget is exhausted).
 *
 * The greedy solver is deterministic for a given player order but can produce
 * different — potentially violation-free — lineups when the order is varied.
 * We shuffle the player array using a seeded rotation on each attempt so that
 * every retry explores a meaningfully different search path.
 *
 * At most MAX_ATTEMPTS solves are run. The attempt with the fewest violations
 * (preferring zero) is committed. If any attempt produces zero violations it is
 * returned immediately.
 */
export function buildAutoLineup(
  players: Player[],
  existingInnings: InningAssignment[],
  overrides: PlayerGameOverride[],
  rules: LeagueRules,
  game: Pick<Game, "id">
): AutoLineupResult {
  const MAX_ATTEMPTS = 12;

  let bestResult: AutoLineupResult | null = null;
  let bestErrorCount = Infinity;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Rotate player array by `attempt` positions so each try has a different
    // ordering — this is cheap, deterministic, and produces diverse schedules.
    const rotatedPlayers =
      attempt === 0
        ? players
        : [...players.slice(attempt % players.length), ...players.slice(0, attempt % players.length)];

    const result = _solveOnce(rotatedPlayers, existingInnings, overrides, rules, game);

    // Count error-severity violations against the full-game result
    const tempGame: Game = {
      id: game.id,
      date: "",
      pitchCatchAssignments: [],
      innings: result.innings,
      battingOrder: [],
      playerOverrides: overrides,
      rosterSnapshot: [],
      status: "draft" as GameStatus,
      createdAt: "",
      updatedAt: "",
    };
    const violations = validateGame(tempGame, players, rules);
    const errorCount = violations.filter((v) => v.severity === "error").length;

    if (errorCount < bestErrorCount) {
      bestErrorCount = errorCount;
      bestResult = result;
    }

    // Zero violations — stop immediately
    if (bestErrorCount === 0) break;
  }

  return bestResult!;
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
