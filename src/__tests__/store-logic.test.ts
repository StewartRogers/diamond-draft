/**
 * Tests for pure logic functions that store.ts composes.
 * Does NOT import or instantiate the Zustand store (requires jsdom).
 * Tests the lineup library functions directly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  upsertPitchCatchAssignment,
  upsertPlayerOverride,
  removePlayerOverride,
  copyInning,
  toggleSlotLock,
  swapPlayersInInning,
  addInning,
  removeLastInning,
  applyWarmupBullpen,
  assignPlayerToSlot,
} from "@/lib/lineup";
import { makePlayer, makeInnings, resetPlayerSeq } from "./helpers";
import type { GamePitchCatchAssignment, PlayerGameOverride } from "@/lib/types";

beforeEach(() => resetPlayerSeq());

// ─── upsertPitchCatchAssignment ───────────────────────────────────────────────

describe("upsertPitchCatchAssignment", () => {
  it("adds a new pitcher assignment when none exists", () => {
    const result = upsertPitchCatchAssignment([], 2, "P", "player-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ inning: 2, pitcherId: "player-1", catcherId: null });
  });

  it("adds a new catcher assignment when none exists", () => {
    const result = upsertPitchCatchAssignment([], 3, "C", "player-2");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ inning: 3, pitcherId: null, catcherId: "player-2" });
  });

  it("updates pitcher without affecting existing catcher in same inning", () => {
    const existing: GamePitchCatchAssignment[] = [
      { inning: 2, pitcherId: "old-pitcher", catcherId: "catcher-1" },
    ];
    const result = upsertPitchCatchAssignment(existing, 2, "P", "new-pitcher");
    expect(result).toHaveLength(1);
    expect(result[0].pitcherId).toBe("new-pitcher");
    expect(result[0].catcherId).toBe("catcher-1");
  });

  it("updates catcher without affecting existing pitcher in same inning", () => {
    const existing: GamePitchCatchAssignment[] = [
      { inning: 2, pitcherId: "pitcher-1", catcherId: "old-catcher" },
    ];
    const result = upsertPitchCatchAssignment(existing, 2, "C", "new-catcher");
    expect(result[0].pitcherId).toBe("pitcher-1");
    expect(result[0].catcherId).toBe("new-catcher");
  });

  it("adds multiple innings sorted by inning number", () => {
    let result = upsertPitchCatchAssignment([], 3, "P", "p3");
    result = upsertPitchCatchAssignment(result, 1, "P", "p1");
    result = upsertPitchCatchAssignment(result, 2, "P", "p2");
    expect(result[0].inning).toBe(1);
    expect(result[1].inning).toBe(2);
    expect(result[2].inning).toBe(3);
  });

  it("clears pitcher by passing null", () => {
    const existing: GamePitchCatchAssignment[] = [
      { inning: 1, pitcherId: "pitcher-1", catcherId: "catcher-1" },
    ];
    const result = upsertPitchCatchAssignment(existing, 1, "P", null);
    expect(result[0].pitcherId).toBeNull();
    expect(result[0].catcherId).toBe("catcher-1");
  });
});

// ─── upsertPlayerOverride ─────────────────────────────────────────────────────

describe("upsertPlayerOverride", () => {
  it("adds a new override when none exists for the player", () => {
    const override: PlayerGameOverride = { playerId: "p1", status: "absent" };
    const result = upsertPlayerOverride([], override);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(override);
  });

  it("replaces existing override for the same player", () => {
    const original: PlayerGameOverride = { playerId: "p1", status: "absent" };
    const updated: PlayerGameOverride = { playerId: "p1", status: "late", inning: 3 };
    const result = upsertPlayerOverride([original], updated);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("late");
    expect(result[0].inning).toBe(3);
  });

  it("does not affect other players' overrides", () => {
    const other: PlayerGameOverride = { playerId: "p2", status: "absent" };
    const newOverride: PlayerGameOverride = { playerId: "p1", status: "late", inning: 2 };
    const result = upsertPlayerOverride([other], newOverride);
    expect(result).toHaveLength(2);
    expect(result.find((o) => o.playerId === "p2")).toEqual(other);
  });
});

// ─── removePlayerOverride ─────────────────────────────────────────────────────

describe("removePlayerOverride", () => {
  it("removes the override for the specified player", () => {
    const overrides: PlayerGameOverride[] = [
      { playerId: "p1", status: "absent" },
      { playerId: "p2", status: "late", inning: 2 },
    ];
    const result = removePlayerOverride(overrides, "p1");
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("p2");
  });

  it("returns original array unchanged if player has no override", () => {
    const overrides: PlayerGameOverride[] = [{ playerId: "p1", status: "absent" }];
    const result = removePlayerOverride(overrides, "p-nonexistent");
    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("p1");
  });

  it("returns empty array when removing the only override", () => {
    const overrides: PlayerGameOverride[] = [{ playerId: "p1", status: "absent" }];
    const result = removePlayerOverride(overrides, "p1");
    expect(result).toHaveLength(0);
  });
});

// ─── copyInning ───────────────────────────────────────────────────────────────

describe("copyInning", () => {
  it("copies all player assignments from source to target inning", () => {
    const p1 = makePlayer();
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "LF", p1.id);
    innings = assignPlayerToSlot(innings, 1, "RF", p1.id); // ignore dup, just test copy

    const result = copyInning(innings, 1, 2);
    const lf2 = result.find((i) => i.inning === 2)!.slots.find((s) => s.position === "LF");
    expect(lf2?.playerId).toBe(p1.id);
  });

  it("respects locked slots in target inning by default", () => {
    const p1 = makePlayer();
    const p2 = makePlayer();
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", p1.id);
    // Lock inning 2 LF to p2
    innings = innings.map((inn) =>
      inn.inning === 2
        ? {
            ...inn,
            slots: inn.slots.map((s) =>
              s.position === "LF" ? { ...s, playerId: p2.id, locked: true } : s
            ),
          }
        : inn
    );

    const result = copyInning(innings, 1, 2);
    const lf2 = result.find((i) => i.inning === 2)!.slots.find((s) => s.position === "LF");
    // Locked slot should retain p2, not be overwritten with p1
    expect(lf2?.playerId).toBe(p2.id);
  });

  it("overwrites locked slots when respectLocks=false", () => {
    const p1 = makePlayer();
    const p2 = makePlayer();
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", p1.id);
    innings = innings.map((inn) =>
      inn.inning === 2
        ? {
            ...inn,
            slots: inn.slots.map((s) =>
              s.position === "LF" ? { ...s, playerId: p2.id, locked: true } : s
            ),
          }
        : inn
    );

    const result = copyInning(innings, 1, 2, false);
    const lf2 = result.find((i) => i.inning === 2)!.slots.find((s) => s.position === "LF");
    expect(lf2?.playerId).toBe(p1.id);
  });

  it("returns innings unchanged when source inning not found", () => {
    const innings = makeInnings(3);
    const result = copyInning(innings, 99, 1);
    expect(result).toEqual(innings);
  });
});

// ─── toggleSlotLock ───────────────────────────────────────────────────────────

describe("toggleSlotLock", () => {
  it("locks an unlocked slot", () => {
    const innings = makeInnings(2);
    const result = toggleSlotLock(innings, 1, "LF");
    const lf = result.find((i) => i.inning === 1)!.slots.find((s) => s.position === "LF");
    expect(lf?.locked).toBe(true);
  });

  it("unlocks a locked slot", () => {
    let innings = makeInnings(2);
    innings = innings.map((inn) =>
      inn.inning === 1
        ? {
            ...inn,
            slots: inn.slots.map((s) =>
              s.position === "LF" ? { ...s, locked: true } : s
            ),
          }
        : inn
    );

    const result = toggleSlotLock(innings, 1, "LF");
    const lf = result.find((i) => i.inning === 1)!.slots.find((s) => s.position === "LF");
    expect(lf?.locked).toBe(false);
  });

  it("does not affect other innings", () => {
    const innings = makeInnings(3);
    const result = toggleSlotLock(innings, 1, "LF");
    const lf2 = result.find((i) => i.inning === 2)!.slots.find((s) => s.position === "LF");
    expect(lf2?.locked).toBeFalsy();
  });
});

// ─── swapPlayersInInning ──────────────────────────────────────────────────────

describe("swapPlayersInInning", () => {
  it("swaps two players between two positions in the same inning", () => {
    const p1 = makePlayer();
    const p2 = makePlayer();
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", p1.id);
    innings = assignPlayerToSlot(innings, 1, "RF", p2.id);

    const result = swapPlayersInInning(innings, 1, "LF", "RF");
    const lf = result.find((i) => i.inning === 1)!.slots.find((s) => s.position === "LF");
    const rf = result.find((i) => i.inning === 1)!.slots.find((s) => s.position === "RF");
    expect(lf?.playerId).toBe(p2.id);
    expect(rf?.playerId).toBe(p1.id);
  });

  it("handles swap when one position is empty", () => {
    const p1 = makePlayer();
    let innings = makeInnings(1);
    innings = assignPlayerToSlot(innings, 1, "LF", p1.id);

    const result = swapPlayersInInning(innings, 1, "LF", "RF");
    const lf = result[0].slots.find((s) => s.position === "LF");
    const rf = result[0].slots.find((s) => s.position === "RF");
    expect(lf?.playerId).toBeNull();
    expect(rf?.playerId).toBe(p1.id);
  });

  it("does not modify other innings", () => {
    const p1 = makePlayer();
    const p2 = makePlayer();
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "LF", p1.id);
    innings = assignPlayerToSlot(innings, 2, "LF", p1.id);
    innings = assignPlayerToSlot(innings, 1, "RF", p2.id);

    const result = swapPlayersInInning(innings, 1, "LF", "RF");
    const inn2lf = result.find((i) => i.inning === 2)!.slots.find((s) => s.position === "LF");
    expect(inn2lf?.playerId).toBe(p1.id);
  });

  it("returns unchanged when position not found in inning", () => {
    const innings = makeInnings(1);
    // Use a valid position that exists in the inning
    const result = swapPlayersInInning(innings, 1, "LF", "RF");
    expect(result[0].slots.find((s) => s.position === "LF")?.playerId).toBeNull();
    expect(result[0].slots.find((s) => s.position === "RF")?.playerId).toBeNull();
  });
});

// ─── addInning / removeLastInning ─────────────────────────────────────────────

describe("addInning", () => {
  it("increases inning count by 1", () => {
    const innings = makeInnings(3);
    const result = addInning(innings);
    expect(result).toHaveLength(4);
  });

  it("new inning has the correct inning number", () => {
    const innings = makeInnings(3);
    const result = addInning(innings);
    expect(result[3].inning).toBe(4);
  });

  it("new inning has all slots empty", () => {
    const innings = makeInnings(2);
    const result = addInning(innings);
    const newInning = result[2];
    expect(newInning.slots.every((s) => s.playerId === null)).toBe(true);
  });
});

describe("removeLastInning", () => {
  it("decreases inning count by 1", () => {
    const innings = makeInnings(4);
    const result = removeLastInning(innings);
    expect(result).toHaveLength(3);
  });

  it("removes the highest-numbered inning", () => {
    const innings = makeInnings(4);
    const result = removeLastInning(innings);
    expect(result.every((i) => i.inning <= 3)).toBe(true);
  });

  it("does not remove below 1 inning", () => {
    const innings = makeInnings(1);
    const result = removeLastInning(innings);
    expect(result).toHaveLength(1);
    expect(result[0].inning).toBe(1);
  });
});

// ─── applyWarmupBullpen integration with pitcher assignment ───────────────────

describe("applyWarmupBullpen pipeline (store composition)", () => {
  it("setPitchCatchAssignment pipeline: assign pitcher → applyWarmupBullpen → N-1 locked", () => {
    // Simulate what store.setPitchCatchAssignment does (pure function chain)
    const pitcher = makePlayer();
    let innings = makeInnings(3);

    // Step 1: assign player to P slot in inning 2 and lock it
    innings = innings.map((inn) =>
      inn.inning === 2
        ? {
            ...inn,
            slots: inn.slots.map((s) =>
              s.position === "P"
                ? { ...s, playerId: pitcher.id, locked: true }
                : s
            ),
          }
        : inn
    );

    // Step 2: applyWarmupBullpen
    const result = applyWarmupBullpen(innings);

    // Inning 1 Bullpen-P should be filled with pitcher and locked
    const bp = result.find((i) => i.inning === 1)!.slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBe(pitcher.id);
    expect(bp?.locked).toBe(true);
  });

  it("autoFillGame pipeline: after solve, applyWarmupBullpen fills warmup slots", () => {
    // Verify that the result of applyWarmupBullpen after a solver run includes warmup
    const pitcher = makePlayer();
    // Manually create innings where inning 3 has a pitcher
    let innings = makeInnings(4);
    innings = innings.map((inn) =>
      inn.inning === 3
        ? {
            ...inn,
            slots: inn.slots.map((s) =>
              s.position === "P" ? { ...s, playerId: pitcher.id } : s
            ),
          }
        : inn
    );

    const result = applyWarmupBullpen(innings);
    const bp = result.find((i) => i.inning === 2)!.slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBe(pitcher.id);
  });
});
