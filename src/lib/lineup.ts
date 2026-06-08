import { v4 as uuidv4 } from "uuid";
import type {
  Game,
  InningAssignment,
  InningSlot,
  GamePitchCatchAssignment,
  PlayerGameOverride,
  Player,
  Position,
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
  // Default batting order: roster sorted by jersey number
  const sorted = [...rosterSnapshot].sort((a, b) =>
    Number(a.jerseyNumber) - Number(b.jerseyNumber)
  );
  const battingOrder = sorted.map((p) => p.id);
  return {
    id: uuidv4(),
    ...params,
    pitchCatchAssignments: [],
    innings: Array.from({ length: totalInnings }, (_, i) =>
      createEmptyInning(i + 1)
    ),
    battingOrder,
    playerOverrides: [],
    rosterSnapshot,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertPitchCatchAssignment(
  assignments: GamePitchCatchAssignment[],
  inning: number,
  position: "P" | "C",
  playerId: string | null
): GamePitchCatchAssignment[] {
  const existing = assignments.find((a) => a.inning === inning);
  if (existing) {
    return assignments.map((a) =>
      a.inning === inning
        ? {
            ...a,
            pitcherId: position === "P" ? playerId : a.pitcherId,
            catcherId: position === "C" ? playerId : a.catcherId,
          }
        : a
    );
  }
  return [
    ...assignments,
    {
      inning,
      pitcherId: position === "P" ? playerId : null,
      catcherId: position === "C" ? playerId : null,
    },
  ].sort((a, b) => a.inning - b.inning);
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

// ─── Warm-up bullpen ─────────────────────────────────────────────────────────

/**
 * For every inning N that has a pitcher assigned to the "P" slot, place that
 * pitcher in "Bullpen - P" for inning N-1 (warm-up). Also try to place the
 * catcher from inning N into "Bullpen - C" for inning N-1.
 *
 * Rules:
 * - Only fills inning N-1 if it exists (no warm-up for inning 1).
 * - If the Bullpen-P/C slot in N-1 is already locked to a *different* player,
 *   it is left alone.
 * - The pitcher (and catcher) are removed from whichever other non-locked slot
 *   they occupied in N-1 before being placed in the bullpen.
 * - Warm-up slots are locked so subsequent auto-fill passes leave them in place.
 * - If pitcherId is null (pitcher cleared), the matching Bullpen-P in N-1 is
 *   unlocked and cleared so the slot reverts to open.
 */
export function applyWarmupBullpen(innings: InningAssignment[]): InningAssignment[] {
  let result: InningAssignment[] = innings.map((inn) => ({
    ...inn,
    slots: inn.slots.map((s) => ({ ...s })),
  }));

  // Build a quick lookup: inningNumber → index in result
  const idxOf = (n: number) => result.findIndex((x) => x.inning === n);

  for (const inn of result) {
    const pSlot = inn.slots.find((s) => s.position === "P");
    const pitcherId = pSlot?.playerId ?? null;
    const warmupNum = inn.inning - 1;
    if (warmupNum < 1) continue;

    const wi = idxOf(warmupNum);
    if (wi < 0) continue;

    const bpSlot = result[wi].slots.find((s) => s.position === "Bullpen - P");

    if (pitcherId) {
      // Don't override a bullpen slot locked to a different player
      if (bpSlot?.locked && bpSlot.playerId !== pitcherId) continue;

      // Remove pitcher from any other non-locked slot in the warmup inning
      result[wi] = {
        ...result[wi],
        slots: result[wi].slots.map((s) => {
          if (s.playerId === pitcherId && s.position !== "Bullpen - P" && !s.locked) {
            return { ...s, playerId: null };
          }
          if (s.position === "Bullpen - P") {
            return { ...s, playerId: pitcherId, locked: true };
          }
          return s;
        }),
      };

      // Try to place the catcher from inning N into Bullpen-C in N-1
      const cSlot = inn.slots.find((s) => s.position === "C");
      const catcherId = cSlot?.playerId ?? null;
      if (catcherId) {
        const bcSlot = result[wi].slots.find((s) => s.position === "Bullpen - C");
        if (!bcSlot?.locked || bcSlot.playerId === catcherId) {
          const catcherInLocked = result[wi].slots.find(
            (s) => s.playerId === catcherId && s.locked && s.position !== "Bullpen - C"
          );
          if (!catcherInLocked) {
            result[wi] = {
              ...result[wi],
              slots: result[wi].slots.map((s) => {
                if (s.playerId === catcherId && s.position !== "Bullpen - C" && !s.locked) {
                  return { ...s, playerId: null };
                }
                if (s.position === "Bullpen - C") {
                  return { ...s, playerId: catcherId, locked: true };
                }
                return s;
              }),
            };
          }
        }
      }
    } else {
      // Pitcher was cleared — release Bullpen-P in N-1 if it was set as warm-up
      if (bpSlot && bpSlot.locked) {
        result[wi] = {
          ...result[wi],
          slots: result[wi].slots.map((s) =>
            s.position === "Bullpen - P" ? { ...s, playerId: null, locked: false } : s
          ),
        };
        // Also release Bullpen-C if it was locked as warm-up partner
        result[wi] = {
          ...result[wi],
          slots: result[wi].slots.map((s) =>
            s.position === "Bullpen - C" && s.locked ? { ...s, playerId: null, locked: false } : s
          ),
        };
      }
    }
  }

  return result;
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
