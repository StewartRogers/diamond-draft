import { v4 as uuidv4 } from "uuid";
import type {
  Game,
  Player,
  InningAssignment,
  InningSlot,
  PlayerGameOverride,
  Position,
  LeagueRules,
} from "./types";
import { FIELD_POSITIONS, SPECIAL_POSITIONS } from "./types";

// ─── Factory helpers ──────────────────────────────────────────────────────────

/** Build an empty inning with the standard 9 field positions + Bench + 2 Bullpen slots */
export function createEmptyInning(inningNumber: number): InningAssignment {
  const fieldSlots: InningSlot[] = FIELD_POSITIONS.map((pos) => ({
    position: pos,
    playerId: null,
  }));
  const specialSlots: InningSlot[] = SPECIAL_POSITIONS.map((pos) => ({
    position: pos,
    playerId: null,
  }));
  return {
    inning: inningNumber,
    slots: [...fieldSlots, ...specialSlots],
  };
}

/** Initialise a full game with empty innings */
export function createEmptyGame(
  params: Pick<Game, "date" | "opponent" | "teamName" | "notes">,
  rosterSnapshot: Player[],
  totalInnings: number
): Game {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    ...params,
    innings: Array.from({ length: totalInnings }, (_, i) =>
      createEmptyInning(i + 1)
    ),
    playerOverrides: [],
    rosterSnapshot,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Inning manipulation ──────────────────────────────────────────────────────

/** Assign a player to a position in a specific inning. Returns a new innings array. */
export function assignPlayerToSlot(
  innings: InningAssignment[],
  inningNumber: number,
  position: Position,
  playerId: string | null
): InningAssignment[] {
  return innings.map((inn) => {
    if (inn.inning !== inningNumber) return inn;
    return {
      ...inn,
      slots: inn.slots.map((slot) =>
        slot.position === position ? { ...slot, playerId } : slot
      ),
    };
  });
}

/** Remove a player from all slots in a specific inning. */
export function clearPlayerFromInning(
  innings: InningAssignment[],
  inningNumber: number,
  playerId: string
): InningAssignment[] {
  return innings.map((inn) => {
    if (inn.inning !== inningNumber) return inn;
    return {
      ...inn,
      slots: inn.slots.map((slot) =>
        slot.playerId === playerId ? { ...slot, playerId: null } : slot
      ),
    };
  });
}

/** Swap two player assignments within the same inning. */
export function swapPlayersInInning(
  innings: InningAssignment[],
  inningNumber: number,
  positionA: Position,
  positionB: Position
): InningAssignment[] {
  return innings.map((inn) => {
    if (inn.inning !== inningNumber) return inn;
    const slotA = inn.slots.find((s) => s.position === positionA);
    const slotB = inn.slots.find((s) => s.position === positionB);
    if (!slotA || !slotB) return inn;
    return {
      ...inn,
      slots: inn.slots.map((slot) => {
        if (slot.position === positionA) return { ...slot, playerId: slotB.playerId };
        if (slot.position === positionB) return { ...slot, playerId: slotA.playerId };
        return slot;
      }),
    };
  });
}

/** Copy all assignments from one inning to another (respects locked slots in target). */
export function copyInning(
  innings: InningAssignment[],
  fromInning: number,
  toInning: number,
  respectLocks = true
): InningAssignment[] {
  const source = innings.find((inn) => inn.inning === fromInning);
  if (!source) return innings;

  return innings.map((inn) => {
    if (inn.inning !== toInning) return inn;
    return {
      ...inn,
      slots: inn.slots.map((targetSlot) => {
        if (respectLocks && targetSlot.locked) return targetSlot;
        const sourceSlot = source.slots.find(
          (s) => s.position === targetSlot.position
        );
        return sourceSlot
          ? { ...targetSlot, playerId: sourceSlot.playerId }
          : targetSlot;
      }),
    };
  });
}

/** Toggle the locked state of a slot. */
export function toggleSlotLock(
  innings: InningAssignment[],
  inningNumber: number,
  position: Position
): InningAssignment[] {
  return innings.map((inn) => {
    if (inn.inning !== inningNumber) return inn;
    return {
      ...inn,
      slots: inn.slots.map((slot) =>
        slot.position === position ? { ...slot, locked: !slot.locked } : slot
      ),
    };
  });
}

/** Add a new inning at the end. */
export function addInning(innings: InningAssignment[]): InningAssignment[] {
  const next = innings.length + 1;
  return [...innings, createEmptyInning(next)];
}

/** Remove the last inning. */
export function removeLastInning(innings: InningAssignment[]): InningAssignment[] {
  if (innings.length <= 1) return innings;
  return innings.slice(0, -1);
}

// ─── Player overrides ─────────────────────────────────────────────────────────

export function upsertPlayerOverride(
  overrides: PlayerGameOverride[],
  override: PlayerGameOverride
): PlayerGameOverride[] {
  const existing = overrides.findIndex((o) => o.playerId === override.playerId);
  if (existing >= 0) {
    return overrides.map((o, i) => (i === existing ? override : o));
  }
  return [...overrides, override];
}

export function removePlayerOverride(
  overrides: PlayerGameOverride[],
  playerId: string
): PlayerGameOverride[] {
  return overrides.filter((o) => o.playerId !== playerId);
}

// ─── Roster snapshot helpers ──────────────────────────────────────────────────

/**
 * Merge a live roster into a game's roster snapshot:
 * - Updates existing player records by id.
 * - Keeps guest players from the snapshot who are no longer in the live roster.
 * - Adds new players from the live roster.
 */
export function mergeRosterIntoSnapshot(
  liveRoster: Player[],
  snapshot: Player[]
): Player[] {
  const liveMap = new Map(liveRoster.map((p) => [p.id, p]));
  const merged: Player[] = liveRoster.map((p) => p);
  for (const p of snapshot) {
    if (!liveMap.has(p.id)) {
      merged.push(p); // Keep guest/removed players already in the snapshot
    }
  }
  return merged;
}

// ─── Auto-suggest lineup ──────────────────────────────────────────────────────

/**
 * For a given inning, suggest a player assignment based on:
 * 1. Position eligibility
 * 2. Who hasn't played the most innings yet
 * 3. Avoiding back-to-back bench
 *
 * Returns a map of position → playerId (only for positions that can be filled).
 */
export function suggestInningAssignment(
  inningNumber: number,
  previousInnings: InningAssignment[],
  availablePlayers: Player[],
  overrides: PlayerGameOverride[],
  rules: LeagueRules
): Map<Position, string> {
  const result = new Map<Position, string>();
  const assigned = new Set<string>();

  // Count field innings played so far per player
  const fieldInningCount = new Map<string, number>();
  for (const player of availablePlayers) {
    const count = previousInnings.reduce((sum, inn) => {
      const slot = inn.slots.find(
        (s) => s.playerId === player.id && s.position !== "Bench"
      );
      return sum + (slot ? 1 : 0);
    }, 0);
    fieldInningCount.set(player.id, count);
  }

  // Determine who was on bench last inning (back-to-back check)
  const lastInning = previousInnings
    .filter((inn) => inn.inning < inningNumber)
    .sort((a, b) => b.inning - a.inning)[0];

  const benchedLastInning = new Set<string>(
    lastInning?.slots
      .filter((s) => s.position === "Bench" && s.playerId)
      .map((s) => s.playerId!) ?? []
  );

  // Filter truly available players
  const presentPlayers = availablePlayers.filter((p) => {
    const override = overrides.find((o) => o.playerId === p.id);
    if (!override) return true;
    if (override.status === "absent") return false;
    if (override.status === "late" && override.inning != null)
      return inningNumber >= override.inning;
    if (override.status === "earlyLeave" && override.inning != null)
      return inningNumber <= override.inning;
    return true;
  });

  // Sort: prioritise those who've played fewer innings, penalise back-to-back bench candidates
  const sorted = [...presentPlayers].sort((a, b) => {
    const aCount = fieldInningCount.get(a.id) ?? 0;
    const bCount = fieldInningCount.get(b.id) ?? 0;
    const aBench = benchedLastInning.has(a.id) ? -10 : 0; // strong preference to play
    const bBench = benchedLastInning.has(b.id) ? -10 : 0;
    return aCount + aBench - (bCount + bBench);
  });

  // Assign field positions
  for (const pos of FIELD_POSITIONS) {
    const candidate = sorted.find(
      (p) =>
        !assigned.has(p.id) &&
        (!rules.enforcePositionEligibility || p.eligiblePositions.includes(pos))
    );
    if (candidate) {
      result.set(pos, candidate.id);
      assigned.add(candidate.id);
    }
  }

  // Remaining players go to Bench
  for (const player of sorted) {
    if (!assigned.has(player.id)) {
      result.set("Bench", player.id);
    }
  }

  return result;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function formatPlayerName(player: Player): string {
  return `${player.firstName} ${player.lastInitial}. #${player.jerseyNumber}`;
}

export function formatPlayerShort(player: Player): string {
  return `${player.firstName} ${player.lastInitial}.`;
}

/** Get the position assigned to a player in a specific inning, or null. */
export function getPlayerPositionInInning(
  playerId: string,
  inning: InningAssignment
): Position | null {
  return inning.slots.find((s) => s.playerId === playerId)?.position ?? null;
}

/** Get all positions a player has played across all innings in a game. */
export function getPlayerGamePositions(
  playerId: string,
  innings: InningAssignment[]
): Array<{ inning: number; position: Position }> {
  return innings
    .map((inn) => {
      const pos = getPlayerPositionInInning(playerId, inn);
      return pos ? { inning: inn.inning, position: pos } : null;
    })
    .filter(Boolean) as Array<{ inning: number; position: Position }>;
}
