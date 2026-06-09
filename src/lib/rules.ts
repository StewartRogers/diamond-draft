import type {
  Game,
  Player,
  LeagueRules,
  RuleViolation,
  InningAssignment,
  PlayerGameOverride,
  Position,
  FieldPosition,
} from "./types";
import { FIELD_POSITIONS } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isFieldPosition(pos: Position): pos is FieldPosition {
  return (FIELD_POSITIONS as readonly string[]).includes(pos);
}

function isBullpen(pos: Position): boolean {
  return pos === "Bullpen - P" || pos === "Bullpen - C";
}

function isPitchingPosition(pos: Position): boolean {
  return pos === "P" || pos === "Bullpen - P";
}

function isCatchingPosition(pos: Position): boolean {
  return pos === "C" || pos === "Bullpen - C";
}

/** Returns the player's override for this game, or null. */
function getOverride(
  playerId: string,
  overrides: PlayerGameOverride[]
): PlayerGameOverride | null {
  return overrides.find((o) => o.playerId === playerId) ?? null;
}

/** Returns true if the player is expected to be available in the given inning. */
function isPlayerAvailableInInning(
  playerId: string,
  inning: number,
  overrides: PlayerGameOverride[]
): boolean {
  const override = getOverride(playerId, overrides);
  if (!override) return true;
  if (override.status === "absent") return false;
  if (override.status === "late" && override.inning != null) {
    return inning >= override.inning;
  }
  if (override.status === "earlyLeave" && override.inning != null) {
    return inning <= override.inning;
  }
  return true;
}

/** Count how many innings pitched by a player in this game up to (not including) the given inning. */
export function inningsPitchedInGameBefore(
  playerId: string,
  innings: InningAssignment[],
  beforeInning: number
): number {
  return innings
    .filter((inn) => inn.inning < beforeInning)
    .reduce((sum, inn) => {
      const slot = inn.slots.find(
        (s) => s.playerId === playerId && isPitchingPosition(s.position)
      );
      return sum + (slot ? 1 : 0);
    }, 0);
}

/** Total innings pitched by a player in a game. */
export function totalInningsPitchedInGame(
  playerId: string,
  innings: InningAssignment[]
): number {
  return innings.reduce((sum, inn) => {
    const slot = inn.slots.find(
      (s) => s.playerId === playerId && isPitchingPosition(s.position)
    );
    return sum + (slot ? 1 : 0);
  }, 0);
}

/** Total season innings pitched by a player from their pitching log (excluding current game). */
function seasonInningsPitched(player: Player, currentGameId: string): number {
  return player.pitchingLog
    .filter((entry) => entry.gameId !== currentGameId)
    .reduce((sum, entry) => sum + entry.innings, 0);
}

/** Count consecutive bench innings ending at (and including) the given inning.
 *  Stops counting at the first inning the player was not yet available (late arrival)
 *  or is no longer available (early departure) — those innings don't count against them. */
export function consecutiveBenchInnings(
  playerId: string,
  innings: InningAssignment[],
  upToInning: number,
  overrides: PlayerGameOverride[] = []
): number {
  const sorted = innings
    .filter((inn) => inn.inning <= upToInning)
    .sort((a, b) => b.inning - a.inning);

  let count = 0;
  for (const inn of sorted) {
    // Stop if the player wasn't available this inning — don't penalise absences
    if (!isPlayerAvailableInInning(playerId, inn.inning, overrides)) break;
    const slot = inn.slots.find((s) => s.playerId === playerId);
    if (!slot || slot.position === "Bench") {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Returns the last inning number ( < beforeInning) when the player was the
 * *actual* pitcher (P position only — excludes Bullpen warm-up).
 * Used by RULE_009 to detect removal from the pitcher role.
 */
export function lastActualPitchingInningBefore(
  playerId: string,
  innings: InningAssignment[],
  beforeInning: number
): number | null {
  const filtered = innings
    .filter((inn) => inn.inning < beforeInning)
    .sort((a, b) => b.inning - a.inning);
  for (const inn of filtered) {
    const slot = inn.slots.find(
      (s) => s.playerId === playerId && s.position === "P"
    );
    if (slot) return inn.inning;
  }
  return null;
}

/** Returns the last inning number ( < beforeInning) when the player pitched, or null. */
export function lastInningPitchedBefore(
  playerId: string,
  innings: InningAssignment[],
  beforeInning: number
): number | null {
  const filtered = innings
    .filter((inn) => inn.inning < beforeInning)
    .sort((a, b) => b.inning - a.inning);
  for (const inn of filtered) {
    const slot = inn.slots.find(
      (s) => s.playerId === playerId && isPitchingPosition(s.position)
    );
    if (slot) return inn.inning;
  }
  return null;
}

/** Count total field innings for a player across all innings. */
export function totalFieldInnings(
  playerId: string,
  innings: InningAssignment[]
): number {
  return innings.reduce((sum, inn) => {
    const slot = inn.slots.find((s) => s.playerId === playerId);
    return sum + (slot && isFieldPosition(slot.position) ? 1 : 0);
  }, 0);
}

// ─── Per-inning validation ────────────────────────────────────────────────────

export function validateInning(
  inningAssignment: InningAssignment,
  allInnings: InningAssignment[],
  players: Player[],
  overrides: PlayerGameOverride[],
  rules: LeagueRules,
  game: Pick<Game, "id">
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { inning, slots } = inningAssignment;
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const assignedSlots = slots.filter((s) => s.playerId !== null);
  const fieldSlots = assignedSlots.filter((s) => isFieldPosition(s.position));
  const fieldPlayerIds = new Set(fieldSlots.map((s) => s.playerId!));

  // ── Detect a player assigned multiple positions in the same inning ───────
  const playerCounts = new Map<string, number>();
  for (const s of assignedSlots) {
    const id = s.playerId!;
    playerCounts.set(id, (playerCounts.get(id) ?? 0) + 1);
  }
  for (const [playerId, count] of playerCounts) {
    if (count > 1) {
      const p = playerMap.get(playerId);
      violations.push({
        code: "PLAYER_MULTIPLE_POSITIONS",
        severity: "error",
        message: `Inning ${inning}: ${p?.firstName ?? "Player"} ${p?.lastInitial ?? ""}. assigned to ${count} positions at once.`,
        playerId,
        inning,
      });
    }
  }

  // ── Too few / too many field players ────────────────────────────────────────
  if (fieldSlots.length < rules.minFieldPlayers) {
    violations.push({
      code: "TOO_FEW_FIELD_PLAYERS",
      severity: "error",
      message: `Inning ${inning}: only ${fieldSlots.length} field player(s) assigned (minimum ${rules.minFieldPlayers}).`,
      inning,
    });
  }
  if (fieldSlots.length > rules.maxFieldPlayers) {
    violations.push({
      code: "TOO_MANY_FIELD_PLAYERS",
      severity: "error",
      message: `Inning ${inning}: ${fieldSlots.length} field players assigned (maximum ${rules.maxFieldPlayers}).`,
      inning,
    });
  }

  // ── Duplicate field positions ────────────────────────────────────────────────
  const positionCounts = new Map<Position, number>();
  for (const slot of fieldSlots) {
    positionCounts.set(slot.position, (positionCounts.get(slot.position) ?? 0) + 1);
  }
  for (const [pos, count] of positionCounts) {
    if (count > 1) {
      violations.push({
        code: "DUPLICATE_POSITION",
        severity: "error",
        message: `Inning ${inning}: position ${pos} assigned to ${count} players.`,
        inning,
        position: pos,
      });
    }
  }

  for (const slot of assignedSlots) {
    const playerId = slot.playerId!;
    const player = playerMap.get(playerId);
    if (!player) continue;

    // ── Player availability ──────────────────────────────────────────────────
    if (!isPlayerAvailableInInning(playerId, inning, overrides)) {
      const override = getOverride(playerId, overrides);
      const statusLabel =
        override?.status === "absent"
          ? "absent"
          : override?.status === "late"
          ? "not yet arrived"
          : "already departed";
      violations.push({
        code:
          override?.status === "absent"
            ? "PLAYER_ABSENT_ASSIGNED"
            : override?.status === "late"
            ? "PLAYER_NOT_YET_ARRIVED"
            : "PLAYER_ALREADY_DEPARTED",
        severity: "error",
        message: `Inning ${inning}: ${player.firstName} ${player.lastInitial}. is ${statusLabel} but has an assignment.`,
        playerId,
        inning,
      });
    }

    // ── Position eligibility ─────────────────────────────────────────────────
    if (
      rules.enforcePositionEligibility &&
      isFieldPosition(slot.position) &&
      !player.eligiblePositions.includes(slot.position)
    ) {
      violations.push({
        code: "INELIGIBLE_POSITION",
        severity: "error",
        message: `Inning ${inning}: ${player.firstName} ${player.lastInitial}. is not eligible for ${slot.position}.`,
        playerId,
        inning,
        position: slot.position,
      });
    }

    // ── Pitching limits ──────────────────────────────────────────────────────
    if (isPitchingPosition(slot.position)) {
      const gameLimit =
        player.pitchingLimitGame > 0
          ? player.pitchingLimitGame
          : rules.globalPitchingLimitGame > 0
          ? rules.globalPitchingLimitGame
          : Infinity;

      const pitchedSoFar = inningsPitchedInGameBefore(playerId, allInnings, inning);
      if (pitchedSoFar + 1 > gameLimit) {
        violations.push({
          code: "EXCEEDS_GAME_PITCH_LIMIT",
          severity: "error",
          message: `Inning ${inning}: ${player.firstName} ${player.lastInitial}. would exceed game pitching limit (${gameLimit} innings).`,
          playerId,
          inning,
          position: slot.position,
        });
      }

      if (player.pitchingLimitSeason > 0) {
        const seasonTotal = seasonInningsPitched(player, game.id);
        if (seasonTotal + pitchedSoFar + 1 > player.pitchingLimitSeason) {
          violations.push({
            code: "EXCEEDS_SEASON_PITCH_LIMIT",
            severity: "error",
            message: `Inning ${inning}: ${player.firstName} ${player.lastInitial}. would exceed season pitching limit (${player.pitchingLimitSeason} innings).`,
            playerId,
            inning,
            position: slot.position,
          });
        }
      }

      // ── Enforce pitching rest between appearances (no pitching, sitting, then pitching)
      if (rules.pitchingRestInnings && rules.pitchingRestInnings > 0) {
        const last = lastInningPitchedBefore(playerId, allInnings, inning);
        if (last != null) {
          const gap = inning - last - 1; // number of intervening innings not pitched
          if (gap < rules.pitchingRestInnings) {
            violations.push({
              code: "PITCHING_TOO_SOON",
              severity: "error",
              message: `Inning ${inning}: ${player.firstName} ${player.lastInitial}. cannot pitch again so soon after inning ${last}. Required rest: ${rules.pitchingRestInnings} inning(s).`,
              playerId,
              inning,
              position: slot.position,
            });
          }
        }
      }
    }

    // ── No pitching after catching ────────────────────────────────────────────
    if (rules.enforceNoPitchingAfterCatching && isPitchingPosition(slot.position)) {
      const caughtPreviously = allInnings
        .filter((inn) => inn.inning < inning)
        .some((inn) =>
          inn.slots.some(
            (s) => s.playerId === playerId && isCatchingPosition(s.position)
          )
        );
      if (caughtPreviously) {
        violations.push({
          code: "PITCHING_AFTER_CATCHING",
          severity: "error",
          message: `Inning ${inning}: ${player.firstName} ${player.lastInitial}. cannot pitch after catching.`,
          playerId,
          inning,
          position: slot.position,
        });
      }
    }

    // ── RULE_009: once removed from pitcher, may not return ──────────────────
    // A player is "removed" when they were the actual pitcher (P) in some
    // prior inning AND there is a subsequent inning (before the current one)
    // where they were available but NOT in any pitching role (P or Bullpen-P).
    // Bullpen-P counts as pitching activity so a warmup → pitch pattern is
    // treated as a continuous stint, not a removal.
    if (slot.position === "P") {
      const lastActual = lastActualPitchingInningBefore(playerId, allInnings, inning);
      if (lastActual != null) {
        // lastAnyPitching is the most recent P or Bullpen-P before this inning
        const lastAnyPitching = lastInningPitchedBefore(playerId, allInnings, inning);
        const referenceInning = lastAnyPitching ?? lastActual;
        if (inning - referenceInning - 1 > 0) {
          violations.push({
            code: "PITCHER_RETURNED_AFTER_REMOVAL",
            severity: "error",
            message: `Inning ${inning}: ${player.firstName} ${player.lastInitial}. was removed from the pitcher role and may not return.`,
            playerId,
            inning,
            position: slot.position,
          });
        }
      }
    }

    // ── Back-to-back bench ────────────────────────────────────────────────────
    if (slot.position === "Bench" && !isBullpen(slot.position)) {
      const consecutive = consecutiveBenchInnings(playerId, allInnings, inning, overrides);
      if (rules.maxConsecutiveBench > 0 && consecutive > rules.maxConsecutiveBench) {
        violations.push({
          code: "BACK_TO_BACK_BENCH",
          severity: "error",
          message: `Inning ${inning}: ${player.firstName} ${player.lastInitial}. has been on bench ${consecutive} inning(s) in a row (max ${rules.maxConsecutiveBench}).`,
          playerId,
          inning,
        });
      }
    }
  }

  // ── Players with no slot in this inning (check availability) ─────────────
  const assignedPlayerIds = new Set(assignedSlots.map((s) => s.playerId));
  for (const player of players) {
    if (assignedPlayerIds.has(player.id)) continue;
    if (!isPlayerAvailableInInning(player.id, inning, overrides)) continue;
    // Active player has no slot — not an error if bench is intentional, but
    // flag missing field position if they should be in the field.
    // (Fair play time is checked at the full-game level below.)
  }

  // Suppress unused variable warning
  void fieldPlayerIds;

  return violations;
}

// ─── Full-game validation ─────────────────────────────────────────────────────

export function validateGame(
  game: Game,
  players: Player[],
  rules: LeagueRules
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Per-inning checks
  for (const inningAssignment of game.innings) {
    violations.push(
      ...validateInning(
        inningAssignment,
        game.innings,
        players,
        game.playerOverrides,
        rules,
        game
      )
    );
  }

  // ── Fair play time ────────────────────────────────────────────────────────
  if (rules.enforceFairPlayTime) {
    for (const player of players) {
      const override = getOverride(player.id, game.playerOverrides);
      if (override?.status === "absent") continue;

      const availableInnings = game.innings.filter((inn) =>
        isPlayerAvailableInInning(player.id, inn.inning, game.playerOverrides)
      );
      if (availableInnings.length === 0) continue;

      const fieldInnings = totalFieldInnings(player.id, availableInnings);
      // Cap the minimum against how many innings the player was actually available —
      // a player who leaves after inning 1 can't be expected to meet a 2-inning minimum.
      const effectiveMin = Math.min(rules.minFieldInningsPerPlayer, availableInnings.length);
      if (fieldInnings < effectiveMin) {
        violations.push({
          code: "INSUFFICIENT_FIELD_TIME",
          severity: "warning",
          message: `${player.firstName} ${player.lastInitial}. only has ${fieldInnings} field inning(s) (minimum ${rules.minFieldInningsPerPlayer}).`,
          playerId: player.id,
        });
      }
    }
  }

  // ── RULE_010: field innings balanced among fully-available players ─────────
  // "Fully available" means no override at all (not late, not leaving early,
  // not absent). Players with availability restrictions may legitimately have
  // fewer field innings, so they are excluded from the balance check.
  if (rules.enforceFairPlayTime) {
    const fullyAvailable = players.filter(
      (p) => getOverride(p.id, game.playerOverrides) == null
    );
    if (fullyAvailable.length > 1) {
      const fieldCounts = fullyAvailable.map((p) =>
        totalFieldInnings(p.id, game.innings)
      );
      const maxCount = Math.max(...fieldCounts);
      const minCount = Math.min(...fieldCounts);
      if (maxCount - minCount > 1) {
        // Flag players who are 2+ innings below the maximum — they are
        // the under-served players that a coach should correct.
        fullyAvailable.forEach((player, idx) => {
          if (fieldCounts[idx] < maxCount - 1) {
            violations.push({
              code: "UNBALANCED_FIELD_TIME",
              severity: "warning",
              message: `${player.firstName} ${player.lastInitial}. has ${fieldCounts[idx]} field inning(s) vs ${maxCount} maximum — difference exceeds 1 (RULE_010).`,
              playerId: player.id,
            });
          }
        });
      }
    }
  }

  // ── Season pitch limit cross-check ────────────────────────────────────────
  for (const player of players) {
    if (player.pitchingLimitSeason <= 0) continue;
    const gamePitched = totalInningsPitchedInGame(player.id, game.innings);
    const seasonPitched = seasonInningsPitched(player, game.id);
    if (seasonPitched + gamePitched > player.pitchingLimitSeason) {
      violations.push({
        code: "EXCEEDS_SEASON_PITCH_LIMIT",
        severity: "error",
        message: `${player.firstName} ${player.lastInitial}. exceeds season pitching limit: ${seasonPitched + gamePitched}/${player.pitchingLimitSeason} innings.`,
        playerId: player.id,
      });
    }
  }

  return violations;
}

// ─── Quick compliance summary ─────────────────────────────────────────────────

export type ComplianceSummary = {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  violations: RuleViolation[];
};

export function getComplianceSummary(
  game: Game,
  players: Player[],
  rules: LeagueRules
): ComplianceSummary {
  const violations = validateGame(game, players, rules);
  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warningCount = violations.filter((v) => v.severity === "warning").length;
  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    violations,
  };
}
