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
import {
  validateGame,
  consecutiveBenchInnings,
  lastActualPitchingInningBefore,
  lastInningPitchedBefore,
  totalFieldInnings,
  totalInningsPitchedInGame,
  isFieldPosition,
} from "./rules";

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

/** All positions a player has occupied across the given innings. */
function positionsPlayedSet(
  playerId: string,
  innings: InningAssignment[]
): Set<Position> {
  const result = new Set<Position>();
  for (const inn of innings) {
    const slot = inn.slots.find((s) => s.playerId === playerId);
    if (slot) result.add(slot.position);
  }
  return result;
}

/** The position the player held in the most recent inning before beforeInning, or null. */
function lastPositionBefore(
  playerId: string,
  innings: InningAssignment[],
  beforeInning: number
): Position | null {
  const prior = innings
    .filter((i) => i.inning < beforeInning)
    .sort((a, b) => b.inning - a.inning);
  for (const inn of prior) {
    const slot = inn.slots.find((s) => s.playerId === playerId);
    if (slot) return slot.position;
  }
  return null;
}

/**
 * Derive the complete PlayerState for every player from committed innings data.
 *
 * This is the single function that produces PlayerState. It uses the same
 * helper functions that validateGame() uses, so score() and validateGame()
 * are guaranteed to read from an identical logical model.
 *
 * @param priorInnings   All fully-committed innings before the current one.
 * @param lockedCurrentSlots  Locked slots in the inning being solved. These
 *   are included because they are already committed — they affect consecutive-
 *   bench streaks, pitch counts, etc. for decisions in the same inning.
 * @param currentInningNumber  1-based inning number being solved.
 */
export function buildStateFromInnings(
  players: Player[],
  priorInnings: InningAssignment[],
  lockedCurrentSlots: InningSlot[],
  currentInningNumber: number,
  overrides: PlayerGameOverride[],
  game: Pick<Game, "id">
): Map<string, PlayerState> {
  // Treat locked current slots as a synthetic committed inning so that state
  // reflects them when scoring open slots in the same inning.
  const allForState: InningAssignment[] = [
    ...priorInnings,
    { inning: currentInningNumber, slots: lockedCurrentSlots },
  ];

  return new Map(
    players.map((p) => [
      p.id,
      {
        id: p.id,
        fieldInnings: totalFieldInnings(p.id, allForState),
        pitchInnings: totalInningsPitchedInGame(p.id, allForState),
        // consecutiveBench must use only prior innings so that unassigned slots
        // in the current inning are not mistakenly treated as bench innings
        // (consecutiveBenchInnings counts "no slot found" as bench).
        // We then manually extend or reset the streak based on any locked slot
        // the player already has in the current inning.
        consecutiveBench: (() => {
          const priorStreak = consecutiveBenchInnings(
            p.id,
            priorInnings,
            currentInningNumber - 1,
            overrides
          );
          const lockedSlot = lockedCurrentSlots.find((s) => s.playerId === p.id);
          if (!lockedSlot) return priorStreak;
          if (lockedSlot.position === "Bench") return priorStreak + 1;
          return 0; // locked to a field position — streak breaks
        })(),
        positionsPlayed: positionsPlayedSet(p.id, allForState),
        lastPosition: lastPositionBefore(p.id, allForState, currentInningNumber + 1),
        lastPitchInning: lastInningPitchedBefore(
          p.id,
          allForState,
          currentInningNumber + 1
        ),
        lastActualPitchInning: lastActualPitchingInningBefore(
          p.id,
          allForState,
          currentInningNumber + 1
        ),
      },
    ])
  );
}

// ─── Solver ───────────────────────────────────────────────────────────────────

/**
 * Internal single-pass solver. Separated so the public buildAutoLineup can
 * run multiple attempts with different player orderings and pick the best.
 *
 * Uses a three-phase strategy per inning:
 *   1. Assign pitcher (P) and catcher (C) — most constrained positions first.
 *   2. Bench-first: select who sits from the remaining players, excluding anyone
 *      at the consecutive-bench limit (they are guaranteed a field slot).
 *   3. Fill the remaining field positions from non-bench candidates.
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

  // Pre-compute season pitching innings per player (constant for this game run)
  const seasonPitchMap = new Map(
    players.map((p) => [p.id, seasonPitchingInnings(p, game.id)])
  );

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
    // Extra bench slots added dynamically by a previous run also persist
    // with their old IDs. Clearing them here ensures the solver assigns from a
    // clean slate on every run.
    for (const slot of inning.slots) {
      if (!slot.locked) slot.playerId = null;
    }

    // ── Rebuild per-player state from committed innings ───────────────────
    const lockedCurrentSlots = inning.slots.filter(
      (s) => s.locked && s.playerId != null
    );
    const state = buildStateFromInnings(
      players,
      resultInnings.slice(0, inningIdx),
      lockedCurrentSlots,
      inningNumber,
      overrides,
      game
    );

    // ── Collect locked player IDs ─────────────────────────────────────────
    const lockedPlayerIds = new Set<string>(
      lockedCurrentSlots.map((s) => s.playerId!)
    );

    // ── Available players for this inning (not absent, not locked) ─────────
    const available = players.filter(
      (p) =>
        !lockedPlayerIds.has(p.id) &&
        playerAvailableInInning(p.id, inningNumber, overrides)
    );

    // ── Categorise open slots ─────────────────────────────────────────────
    const openSlots = inning.slots.filter((s) => !s.locked);
    const fieldSlots = openSlots.filter((s) => isFieldPosition(s.position));
    const benchSlots = openSlots.filter((s) => isBenchPos(s.position));
    const bullpenSlots = openSlots.filter(
      (s) => s.position === "Bullpen - P" || s.position === "Bullpen - C"
    );

    const lockedFieldCount = inning.slots.filter(
      (s) => s.locked && s.playerId != null && isFieldPosition(s.position)
    ).length;
    const fieldSpotsNeeded = Math.min(
      fieldSlots.length,
      rules.maxFieldPlayers - lockedFieldCount
    );

    const assignedThisInning = new Set<string>(lockedPlayerIds);

    // ── Score function for field/bullpen positions ────────────────────────
    // Returns Infinity for hard violations; lower = more desirable.
    function score(player: Player, pos: Position): number {
      const ps = state.get(player.id)!;

      // Hard: position eligibility
      if (
        rules.enforcePositionEligibility &&
        isFieldPosition(pos) &&
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
          const seasonTotal = seasonPitchMap.get(player.id) ?? 0;
          if (seasonTotal + ps.pitchInnings + 1 > player.pitchingLimitSeason)
            return Infinity;
        }

        if (rules.enforceNoPitchingAfterCatching) {
          const caughtBefore = [...ps.positionsPlayed].some(isCatchingPos);
          if (caughtBefore) return Infinity;
        }

        // Hard: RULE_009 — once removed from pitcher (P), cannot return.
        if (pos === "P" && ps.lastActualPitchInning != null) {
          const referenceInning = ps.lastPitchInning ?? ps.lastActualPitchInning;
          const gap = inningNumber - referenceInning - 1;
          if (gap > 0) return Infinity;
        }

        if (rules.pitchingRestInnings && ps.lastPitchInning != null) {
          const gap = inningNumber - ps.lastPitchInning - 1;
          if (gap < rules.pitchingRestInnings) return Infinity;
        }
      }

      // ── Soft scoring (lower = more desirable) ────────────────────────────
      let s = 0;

      if (isFieldPosition(pos)) {
        // Position tier rating: prefer players rated higher at this position.
        // Tier 1 (Primary) = 0 penalty, Tier 2 (Secondary) = +40, Tier 3 (Can play) = +80,
        // Unrated = +60 (between Secondary and Can play — eligible but no preference set).
        const tier = (player.positionRatings as Partial<Record<string, number>> | undefined)?.[pos];
        if (tier === 2) s += 40;
        else if (tier === 3) s += 80;
        else if (tier !== 1) s += 60; // eligible but unrated (tier 1 = 0 penalty)

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
          s -= (gameLimit - ps.pitchInnings) * 5;
        }
        // Urgency: player needs field time and is running out of innings
        const remaining = remainingInnings(player.id, inningNumber + 1, totalInnings, overrides);
        const fieldDeficit = rules.minFieldInningsPerPlayer - ps.fieldInnings - 1;
        if (fieldDeficit > 0 && remaining <= fieldDeficit) s -= 500;
        else if (fieldDeficit > 0) s -= fieldDeficit * 20;
      }

      // Prefer not to repeat the exact same position back-to-back (variety)
      if (ps.lastPosition === pos && !isBenchPos(pos)) s += 15;

      return s;
    }

    const tryAssign = (
      slots: InningSlot[],
      candidatePlayers: Player[]
    ): void => {
      for (const slot of slots) {
        const unassigned = candidatePlayers.filter(
          (p) => !assignedThisInning.has(p.id)
        );

        const scored = unassigned
          .map((p) => ({ player: p, s: score(p, slot.position) }))
          .filter((x) => x.s < Infinity)
          .sort((a, b) => a.s - b.s);

        if (scored.length === 0) {
          warnings.push(
            `Inning ${inningNumber}: no eligible player found for ${slot.position}.`
          );
          feasible = false;
          continue;
        }

        const best = scored[0].player;
        slot.playerId = best.id;
        assignedThisInning.add(best.id);
      }
    };

    // ── PHASE 1: Assign pitcher (P) and catcher (C) first ────────────────
    // P and C are the most constrained positions (pitch limits, no-pitch-
    // after-catching). Locking them in first ensures that bench selection
    // never inadvertently benches the only eligible pitcher or catcher.
    // P is sorted before C because pitching constraints are stricter.
    const pitchCatchSlots = fieldSlots
      .filter((s) => s.position === "P" || s.position === "C")
      .sort((a) => (a.position === "P" ? -1 : 1));

    tryAssign(pitchCatchSlots.slice(0, fieldSpotsNeeded), available);

    const filledPCCount = pitchCatchSlots.filter((s) => s.playerId !== null).length;
    const remainingFieldSpotsNeeded = Math.max(0, fieldSpotsNeeded - filledPCCount);

    // Players still available after P/C assignment
    const postPCAvailable = available.filter((p) => !assignedThisInning.has(p.id));

    // ── PHASE 2: Bench-first selection from remaining players ─────────────
    // Decide who sits BEFORE filling the remaining field positions. This
    // guarantees that players at the consecutive-bench limit are excluded
    // from bench selection and always receive a field slot.
    //
    // Bench score (higher = more likely to sit):
    //   +100 per field inning already played     → bench those who've played most
    //   -10  per consecutive bench inning        → avoid re-benching recent sitters
    //   +(defRating-2.5)×(1-2×progress)×80      → stronger defenders bench early,
    //                                               weaker defenders bench late
    // Tier constraint: for defenseRating >= 3, keep at least 1 player of that
    // tier on the field — don't bench all top-tier defenders at once.
    // Players who cannot afford to sit (would miss the minimum-field-innings
    // guarantee given remaining innings) are filtered out entirely.

    // progress: 0.0 at inning 1, 1.0 at last inning
    const progress = totalInnings > 1 ? (inningNumber - 1) / (totalInnings - 1) : 0;
    const DEFENSE_WEIGHT = 80;

    const benchCount = Math.max(
      0,
      postPCAvailable.length - remainingFieldSpotsNeeded - bullpenSlots.length
    );

    // Players who MUST get a field slot (hit the consecutive-bench limit)
    const mustFieldIds = new Set<string>(
      rules.maxConsecutiveBench > 0
        ? postPCAvailable
            .filter(
              (p) => state.get(p.id)!.consecutiveBench >= rules.maxConsecutiveBench
            )
            .map((p) => p.id)
        : []
    );

    // Bench candidates: everyone NOT at the consecutive-bench limit.
    const benchCandidates = postPCAvailable
      .filter((p) => !mustFieldIds.has(p.id))
      .map((p) => {
        const ps = state.get(p.id)!;
        if (rules.enforceFairPlayTime) {
          const remaining = remainingInnings(p.id, inningNumber + 1, totalInnings, overrides);
          const fieldDeficit = rules.minFieldInningsPerPlayer - ps.fieldInnings;
          if (fieldDeficit > 0 && remaining <= fieldDeficit) {
            return { player: p, benchScore: -Infinity };
          }
        }
        const defRating = p.defenseRating ?? 2.5;
        const defContrib = (defRating - 2.5) * (1 - 2 * progress) * DEFENSE_WEIGHT;
        return {
          player: p,
          benchScore: ps.fieldInnings * 100 - ps.consecutiveBench * 10 + defContrib,
        };
      })
      .filter((x) => x.benchScore !== -Infinity)
      .sort((a, b) => b.benchScore - a.benchScore);

    // Tier constraint: count how many of each top-tier (defenseRating >= 3) are
    // available. Never bench all of them — keep at least 1 per tier on the field.
    const tierAvailableCount = new Map<number, number>();
    for (const p of postPCAvailable) {
      const tier = p.defenseRating;
      if (tier && tier >= 3) {
        tierAvailableCount.set(tier, (tierAvailableCount.get(tier) ?? 0) + 1);
      }
    }
    const tierBenchedCount = new Map<number, number>();
    const selectedBench: Player[] = [];
    const skipped: typeof benchCandidates = [];

    for (const candidate of benchCandidates) {
      if (selectedBench.length >= benchCount) break;
      const tier = candidate.player.defenseRating;
      if (tier && tier >= 3) {
        const avail = tierAvailableCount.get(tier) ?? 0;
        const alreadyBenched = tierBenchedCount.get(tier) ?? 0;
        if (alreadyBenched >= avail - 1) {
          skipped.push(candidate);
          continue;
        }
        tierBenchedCount.set(tier, alreadyBenched + 1);
      }
      selectedBench.push(candidate.player);
    }
    // If bench isn't full yet, fill from skipped candidates (tier constraint
    // relaxed — no other options remain). Emit a warning so the user knows.
    for (const candidate of skipped) {
      if (selectedBench.length >= benchCount) break;
      const tier = candidate.player.defenseRating;
      if (tier && tier >= 3) {
        const avail = tierAvailableCount.get(tier) ?? 0;
        const alreadyBenched = tierBenchedCount.get(tier) ?? 0;
        if (alreadyBenched >= avail - 1) {
          warnings.push(
            `Inning ${inningNumber}: all defenseRating=${tier} defenders benched — no lower-rated players available.`
          );
        }
        tierBenchedCount.set(tier, alreadyBenched + 1);
      }
      selectedBench.push(candidate.player);
    }

    // Ensure enough bench slots exist (share the same object reference so the
    // direct assignment below propagates into inning.slots)
    while (benchSlots.length < selectedBench.length) {
      const newSlot: InningSlot = { position: "Bench", playerId: null };
      benchSlots.push(newSlot);
      inning.slots.push(newSlot);
    }

    for (let i = 0; i < selectedBench.length; i++) {
      benchSlots[i].playerId = selectedBench[i].id;
      assignedThisInning.add(selectedBench[i].id);
    }

    // ── PHASE 3: Fill remaining field positions ───────────────────────────
    const fieldCandidates = postPCAvailable.filter(
      (p) => !assignedThisInning.has(p.id)
    );

    const otherFieldSlots = fieldSlots.filter(
      (s) => s.position !== "P" && s.position !== "C"
    );

    // Sort hardest-to-fill first (fewest eligible candidates).
    // Pre-compute counts to avoid O(N·M·log N) filter calls inside the comparator.
    const eligibleCountByPos = new Map(
      otherFieldSlots.map((s) => [
        s.position,
        fieldCandidates.filter(
          (p) =>
            !rules.enforcePositionEligibility ||
            p.eligiblePositions.includes(s.position)
        ).length,
      ])
    );
    const sortedOtherFieldSlots = [...otherFieldSlots].sort(
      (a, b) => (eligibleCountByPos.get(a.position) ?? 0) - (eligibleCountByPos.get(b.position) ?? 0)
    );

    tryAssign(sortedOtherFieldSlots.slice(0, remainingFieldSpotsNeeded), fieldCandidates);
    tryAssign(bullpenSlots, available);

    // Force-bench any players still without a slot. This should only happen
    // when there are genuinely more must-field players than field slots (an
    // infeasible configuration). A warning is emitted for consecutive-bench
    // violations so the user is informed.
    const stillUnassigned = available.filter(
      (p) => !assignedThisInning.has(p.id)
    );
    for (const player of stillUnassigned) {
      const ps = state.get(player.id)!;
      const wouldViolateBench =
        rules.maxConsecutiveBench > 0 &&
        ps.consecutiveBench >= rules.maxConsecutiveBench;
      inning.slots.push({ position: "Bench", playerId: player.id });
      assignedThisInning.add(player.id);
      if (wouldViolateBench) {
        warnings.push(
          `Inning ${inningNumber}: ${player.firstName} ${player.lastInitial}. ` +
          `force-benched — no eligible field slot available to avoid back-to-back bench.`
        );
      }
    }

    log.push(
      `Inning ${inningNumber}: assigned ${assignedThisInning.size - lockedPlayerIds.size} player(s).`
    );
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
