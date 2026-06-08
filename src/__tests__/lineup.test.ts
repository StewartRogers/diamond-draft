/**
 * Tests for src/lib/lineup.ts
 * Covers: createEmptyInning, createEmptyGame, assignPlayerToSlot,
 *         clearPlayerFromInning, swapPlayersInInning, copyInning,
 *         toggleSlotLock, addInning, removeLastInning,
 *         upsertPlayerOverride, removePlayerOverride,
 *         applyWarmupBullpen, mergeRosterIntoSnapshot, formatPlayerName
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createEmptyInning,
  createEmptyGame,
  assignPlayerToSlot,
  clearPlayerFromInning,
  swapPlayersInInning,
  copyInning,
  toggleSlotLock,
  addInning,
  removeLastInning,
  upsertPlayerOverride,
  removePlayerOverride,
  applyWarmupBullpen,
  mergeRosterIntoSnapshot,
  formatPlayerName,
  formatPlayerShort,
  getPlayerPositionInInning,
  getPlayerGamePositions,
} from "@/lib/lineup";
import { FIELD_POSITIONS, SPECIAL_POSITIONS } from "@/lib/types";
import { makePlayer, makeRoster, resetPlayerSeq } from "./helpers";

beforeEach(() => resetPlayerSeq());

// ─── createEmptyInning ────────────────────────────────────────────────────────

describe("createEmptyInning", () => {
  it("creates the correct inning number", () => {
    const inning = createEmptyInning(3);
    expect(inning.inning).toBe(3);
  });

  it("creates slots for all 9 field positions", () => {
    const inning = createEmptyInning(1);
    for (const pos of FIELD_POSITIONS) {
      expect(inning.slots.some((s) => s.position === pos)).toBe(true);
    }
  });

  it("creates slots for all 3 special positions", () => {
    const inning = createEmptyInning(1);
    for (const pos of SPECIAL_POSITIONS) {
      expect(inning.slots.some((s) => s.position === pos)).toBe(true);
    }
  });

  it("all slots start with null playerId", () => {
    const inning = createEmptyInning(1);
    expect(inning.slots.every((s) => s.playerId === null)).toBe(true);
  });
});

// ─── createEmptyGame ─────────────────────────────────────────────────────────

describe("createEmptyGame", () => {
  it("creates the correct number of innings", () => {
    const players = makeRoster(9);
    const game = createEmptyGame(
      { date: "2026-01-01", opponent: "Tigers", teamName: "Eagles", notes: "" },
      players,
      6
    );
    expect(game.innings).toHaveLength(6);
    expect(game.innings[0].inning).toBe(1);
    expect(game.innings[5].inning).toBe(6);
  });

  it("initialises battingOrder sorted by jersey number", () => {
    const players = [
      makePlayer({ id: "a", jerseyNumber: "10" }),
      makePlayer({ id: "b", jerseyNumber: "3" }),
      makePlayer({ id: "c", jerseyNumber: "7" }),
    ];
    const game = createEmptyGame(
      { date: "2026-01-01", opponent: "", teamName: "", notes: "" },
      players,
      6
    );
    expect(game.battingOrder).toEqual(["b", "c", "a"]);
  });

  it("sets status to draft", () => {
    const game = createEmptyGame(
      { date: "2026-01-01", opponent: "", teamName: "", notes: "" },
      [],
      6
    );
    expect(game.status).toBe("draft");
  });

  it("stores the roster snapshot", () => {
    const players = makeRoster(3);
    const game = createEmptyGame(
      { date: "2026-01-01", opponent: "", teamName: "", notes: "" },
      players,
      6
    );
    expect(game.rosterSnapshot).toHaveLength(3);
  });
});

// ─── assignPlayerToSlot ───────────────────────────────────────────────────────

describe("assignPlayerToSlot", () => {
  it("assigns a player to the correct inning and position", () => {
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    const result = assignPlayerToSlot(innings, 1, "P", "player-1");
    const slot = result[0].slots.find((s) => s.position === "P");
    expect(slot?.playerId).toBe("player-1");
  });

  it("does not mutate other innings", () => {
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    const result = assignPlayerToSlot(innings, 1, "P", "player-1");
    const slot2 = result[1].slots.find((s) => s.position === "P");
    expect(slot2?.playerId).toBeNull();
  });

  it("returns a new array (immutable update)", () => {
    const innings = [createEmptyInning(1)];
    const result = assignPlayerToSlot(innings, 1, "P", "player-1");
    expect(result).not.toBe(innings);
  });

  it("can clear a player by passing null", () => {
    let innings = [createEmptyInning(1)];
    innings = assignPlayerToSlot(innings, 1, "P", "player-1");
    innings = assignPlayerToSlot(innings, 1, "P", null);
    expect(innings[0].slots.find((s) => s.position === "P")?.playerId).toBeNull();
  });
});

// ─── clearPlayerFromInning ────────────────────────────────────────────────────

describe("clearPlayerFromInning", () => {
  it("removes a player from all slots in an inning", () => {
    let innings = [createEmptyInning(1)];
    innings = assignPlayerToSlot(innings, 1, "P", "player-1");
    innings = assignPlayerToSlot(innings, 1, "Bench", "player-1"); // unusual but test the logic
    innings = clearPlayerFromInning(innings, 1, "player-1");
    expect(innings[0].slots.every((s) => s.playerId !== "player-1")).toBe(true);
  });

  it("leaves other innings untouched", () => {
    let innings = [createEmptyInning(1), createEmptyInning(2)];
    innings = assignPlayerToSlot(innings, 1, "P", "player-1");
    innings = assignPlayerToSlot(innings, 2, "P", "player-1");
    innings = clearPlayerFromInning(innings, 1, "player-1");
    expect(innings[1].slots.find((s) => s.position === "P")?.playerId).toBe("player-1");
  });
});

// ─── swapPlayersInInning ──────────────────────────────────────────────────────

describe("swapPlayersInInning", () => {
  it("swaps two players between positions", () => {
    let innings = [createEmptyInning(1)];
    innings = assignPlayerToSlot(innings, 1, "P", "pitcher");
    innings = assignPlayerToSlot(innings, 1, "C", "catcher");
    innings = swapPlayersInInning(innings, 1, "P", "C");
    expect(innings[0].slots.find((s) => s.position === "P")?.playerId).toBe("catcher");
    expect(innings[0].slots.find((s) => s.position === "C")?.playerId).toBe("pitcher");
  });

  it("is safe when one slot is empty", () => {
    let innings = [createEmptyInning(1)];
    innings = assignPlayerToSlot(innings, 1, "P", "pitcher");
    innings = swapPlayersInInning(innings, 1, "P", "C");
    expect(innings[0].slots.find((s) => s.position === "P")?.playerId).toBeNull();
    expect(innings[0].slots.find((s) => s.position === "C")?.playerId).toBe("pitcher");
  });
});

// ─── copyInning ───────────────────────────────────────────────────────────────

describe("copyInning", () => {
  it("copies assignments from source to target", () => {
    let innings = [createEmptyInning(1), createEmptyInning(2)];
    innings = assignPlayerToSlot(innings, 1, "P", "pitcher");
    innings = copyInning(innings, 1, 2);
    expect(innings[1].slots.find((s) => s.position === "P")?.playerId).toBe("pitcher");
  });

  it("respects locked slots in the target when respectLocks=true", () => {
    let innings = [createEmptyInning(1), createEmptyInning(2)];
    innings = assignPlayerToSlot(innings, 1, "P", "pitcher-A");
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-B");
    innings = toggleSlotLock(innings, 2, "P"); // lock inning-2 pitcher slot
    innings = copyInning(innings, 1, 2, true);
    // Locked slot should NOT be overwritten
    expect(innings[1].slots.find((s) => s.position === "P")?.playerId).toBe("pitcher-B");
  });

  it("overwrites locked slots when respectLocks=false", () => {
    let innings = [createEmptyInning(1), createEmptyInning(2)];
    innings = assignPlayerToSlot(innings, 1, "P", "pitcher-A");
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-B");
    innings = toggleSlotLock(innings, 2, "P");
    innings = copyInning(innings, 1, 2, false);
    expect(innings[1].slots.find((s) => s.position === "P")?.playerId).toBe("pitcher-A");
  });
});

// ─── toggleSlotLock ───────────────────────────────────────────────────────────

describe("toggleSlotLock", () => {
  it("locks an unlocked slot", () => {
    let innings = [createEmptyInning(1)];
    innings = toggleSlotLock(innings, 1, "P");
    expect(innings[0].slots.find((s) => s.position === "P")?.locked).toBe(true);
  });

  it("unlocks a locked slot", () => {
    let innings = [createEmptyInning(1)];
    innings = toggleSlotLock(innings, 1, "P");
    innings = toggleSlotLock(innings, 1, "P");
    expect(innings[0].slots.find((s) => s.position === "P")?.locked).toBe(false);
  });
});

// ─── addInning / removeLastInning ─────────────────────────────────────────────

describe("addInning", () => {
  it("appends an inning with correct number", () => {
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    const result = addInning(innings);
    expect(result).toHaveLength(3);
    expect(result[2].inning).toBe(3);
  });
});

describe("removeLastInning", () => {
  it("removes the last inning", () => {
    const innings = [createEmptyInning(1), createEmptyInning(2), createEmptyInning(3)];
    const result = removeLastInning(innings);
    expect(result).toHaveLength(2);
    expect(result[1].inning).toBe(2);
  });

  it("does not remove the only inning", () => {
    const innings = [createEmptyInning(1)];
    const result = removeLastInning(innings);
    expect(result).toHaveLength(1);
  });
});

// ─── upsertPlayerOverride ─────────────────────────────────────────────────────

describe("upsertPlayerOverride", () => {
  it("adds a new override", () => {
    const result = upsertPlayerOverride([], {
      playerId: "p1",
      status: "absent",
    });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("absent");
  });

  it("updates an existing override", () => {
    const initial = [{ playerId: "p1", status: "absent" as const }];
    const result = upsertPlayerOverride(initial, { playerId: "p1", status: "late", inning: 3 });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("late");
    expect(result[0].inning).toBe(3);
  });
});

// ─── removePlayerOverride ─────────────────────────────────────────────────────

describe("removePlayerOverride", () => {
  it("removes the matching override", () => {
    const overrides = [
      { playerId: "p1", status: "absent" as const },
      { playerId: "p2", status: "late" as const, inning: 2 },
    ];
    const result = removePlayerOverride(overrides, "p1");
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("p2");
  });

  it("is a no-op for unknown player", () => {
    const overrides = [{ playerId: "p1", status: "absent" as const }];
    const result = removePlayerOverride(overrides, "unknown");
    expect(result).toHaveLength(1);
  });
});

// ─── applyWarmupBullpen ───────────────────────────────────────────────────────

describe("applyWarmupBullpen", () => {
  /**
   * Build a two-inning setup where inning 2 has 'pitcher-X' in the P slot
   * and 'catcher-Y' in the C slot.
   */
  function setupTwoInnings(
    pitcher: string | null,
    catcher: string | null
  ) {
    let innings = [createEmptyInning(1), createEmptyInning(2)];
    if (pitcher) innings = assignPlayerToSlot(innings, 2, "P", pitcher);
    if (catcher) innings = assignPlayerToSlot(innings, 2, "C", catcher);
    return innings;
  }

  it("places inning-2 pitcher in Bullpen-P of inning 1", () => {
    const innings = setupTwoInnings("pitcher-X", null);
    const result = applyWarmupBullpen(innings);
    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBe("pitcher-X");
  });

  it("locks the Bullpen-P warm-up slot", () => {
    const innings = setupTwoInnings("pitcher-X", null);
    const result = applyWarmupBullpen(innings);
    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.locked).toBe(true);
  });

  it("places inning-2 catcher in Bullpen-C of inning 1", () => {
    const innings = setupTwoInnings("pitcher-X", "catcher-Y");
    const result = applyWarmupBullpen(innings);
    const bc = result[0].slots.find((s) => s.position === "Bullpen - C");
    expect(bc?.playerId).toBe("catcher-Y");
    expect(bc?.locked).toBe(true);
  });

  it("removes pitcher from any other non-locked slot in inning 1", () => {
    // Pitcher also assigned to LF in inning 1 (unlocked)
    let innings = setupTwoInnings("pitcher-X", null);
    innings = assignPlayerToSlot(innings, 1, "LF", "pitcher-X");
    const result = applyWarmupBullpen(innings);
    const lf = result[0].slots.find((s) => s.position === "LF");
    expect(lf?.playerId).toBeNull();
  });

  it("does NOT clear a locked conflicting slot in inning 1", () => {
    let innings = setupTwoInnings("pitcher-X", null);
    // Lock a DIFFERENT pitcher in inning-1's Bullpen-P
    innings = assignPlayerToSlot(innings, 1, "Bullpen - P", "other-pitcher");
    innings = toggleSlotLock(innings, 1, "Bullpen - P");
    const result = applyWarmupBullpen(innings);
    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    // The locked different player should remain
    expect(bp?.playerId).toBe("other-pitcher");
  });

  it("does NOT create a warm-up for inning 1 (no inning 0)", () => {
    let innings = [createEmptyInning(1)];
    innings = assignPlayerToSlot(innings, 1, "P", "pitcher-X");
    const result = applyWarmupBullpen(innings);
    // Only one inning — no warm-up possible; Bullpen-P should remain null
    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBeNull();
  });

  it("clearing the pitcher clears Bullpen-P and Bullpen-C in the warm-up inning", () => {
    // First apply warm-up, then clear the pitcher from inning 2
    let innings = setupTwoInnings("pitcher-X", "catcher-Y");
    innings = applyWarmupBullpen(innings);
    // Confirm warm-up was set
    expect(innings[0].slots.find((s) => s.position === "Bullpen - P")?.playerId).toBe("pitcher-X");
    // Now clear the pitcher in inning 2
    innings = assignPlayerToSlot(innings, 2, "P", null);
    const result = applyWarmupBullpen(innings);
    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBeNull();
    expect(bp?.locked).toBe(false);
  });

  it("handles three innings — warm-up for innings 2 and 3", () => {
    let innings = [createEmptyInning(1), createEmptyInning(2), createEmptyInning(3)];
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-A");
    innings = assignPlayerToSlot(innings, 3, "P", "pitcher-B");
    const result = applyWarmupBullpen(innings);
    // Inning 1: warm-up for inning-2 pitcher
    expect(result[0].slots.find((s) => s.position === "Bullpen - P")?.playerId).toBe("pitcher-A");
    // Inning 2: warm-up for inning-3 pitcher
    expect(result[1].slots.find((s) => s.position === "Bullpen - P")?.playerId).toBe("pitcher-B");
  });

  it("does not move pitcher if they are in a locked non-bullpen slot in warm-up inning", () => {
    let innings = [createEmptyInning(1), createEmptyInning(2)];
    // Assign pitcher-X to a locked P slot in inning 1 too
    innings = assignPlayerToSlot(innings, 1, "P", "pitcher-X");
    innings = toggleSlotLock(innings, 1, "P"); // locked in their inning-1 P spot
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-X");
    const result = applyWarmupBullpen(innings);
    // Bullpen-P should have pitcher-X as warm-up
    expect(result[0].slots.find((s) => s.position === "Bullpen - P")?.playerId).toBe("pitcher-X");
    // But the locked P slot in inning 1 should NOT be cleared
    expect(result[0].slots.find((s) => s.position === "P")?.playerId).toBe("pitcher-X");
  });
});

// ─── mergeRosterIntoSnapshot ──────────────────────────────────────────────────

describe("mergeRosterIntoSnapshot", () => {
  it("includes all live roster players", () => {
    const live = makeRoster(3);
    const result = mergeRosterIntoSnapshot(live, []);
    expect(result).toHaveLength(3);
  });

  it("keeps guest players from snapshot not in live roster", () => {
    const live = makeRoster(2);
    const guest = makePlayer({ id: "guest-1", isGuest: true });
    const result = mergeRosterIntoSnapshot(live, [guest]);
    expect(result.some((p) => p.id === "guest-1")).toBe(true);
  });

  it("does not duplicate players present in both live and snapshot", () => {
    const live = makeRoster(2);
    const snapshot = [live[0]]; // same player already in live
    const result = mergeRosterIntoSnapshot(live, snapshot);
    expect(result).toHaveLength(2);
  });
});

// ─── Display helpers ──────────────────────────────────────────────────────────

describe("formatPlayerName", () => {
  it("formats correctly", () => {
    const p = makePlayer({ firstName: "Alice", lastInitial: "S", jerseyNumber: "42" });
    expect(formatPlayerName(p)).toBe("Alice S. #42");
  });
});

describe("formatPlayerShort", () => {
  it("formats correctly", () => {
    const p = makePlayer({ firstName: "Bob", lastInitial: "K" });
    expect(formatPlayerShort(p)).toBe("Bob K.");
  });
});

describe("getPlayerPositionInInning", () => {
  it("returns the position when assigned", () => {
    let inning = createEmptyInning(1);
    inning = { ...inning, slots: inning.slots.map((s) => s.position === "P" ? { ...s, playerId: "p1" } : s) };
    expect(getPlayerPositionInInning("p1", inning)).toBe("P");
  });

  it("returns null when not assigned", () => {
    const inning = createEmptyInning(1);
    expect(getPlayerPositionInInning("p1", inning)).toBeNull();
  });
});

describe("getPlayerGamePositions", () => {
  it("returns all positions across innings", () => {
    let innings = [createEmptyInning(1), createEmptyInning(2)];
    innings = assignPlayerToSlot(innings, 1, "P", "p1");
    innings = assignPlayerToSlot(innings, 2, "C", "p1");
    const positions = getPlayerGamePositions("p1", innings);
    expect(positions).toHaveLength(2);
    expect(positions[0]).toEqual({ inning: 1, position: "P" });
    expect(positions[1]).toEqual({ inning: 2, position: "C" });
  });
});
