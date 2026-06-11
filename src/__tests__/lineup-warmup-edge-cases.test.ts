/**
 * Additional edge-case tests for applyWarmupBullpen in src/lib/lineup.ts.
 * Covers scenarios NOT in the existing lineup.test.ts:
 *   - Multiple different pitchers across 4+ innings
 *   - Same pitcher assigned in non-consecutive innings (inning 2 and 4)
 *   - Pitcher cleared mid-game (inning 3 cleared, inning 4 has new pitcher)
 *   - Bullpen-C already locked by a DIFFERENT player (must not override)
 *   - Inning-1 pitcher has no warm-up (warmupNum = 0 < 1)
 *   - Catcher locked elsewhere in warm-up inning — should not move to Bullpen-C
 */
import { describe, it, expect } from "vitest";
import {
  applyWarmupBullpen,
  assignPlayerToSlot,
  toggleSlotLock,
  createEmptyInning,
} from "@/lib/lineup";
import type { InningAssignment } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInnings(n: number): InningAssignment[] {
  return Array.from({ length: n }, (_, i) => createEmptyInning(i + 1));
}

function getBullpenP(innings: InningAssignment[], inningNum: number) {
  return innings
    .find((x) => x.inning === inningNum)!
    .slots.find((s) => s.position === "Bullpen - P");
}

function getBullpenC(innings: InningAssignment[], inningNum: number) {
  return innings
    .find((x) => x.inning === inningNum)!
    .slots.find((s) => s.position === "Bullpen - C");
}

function getSlot(innings: InningAssignment[], inningNum: number, pos: string) {
  return innings
    .find((x) => x.inning === inningNum)!
    .slots.find((s) => s.position === pos);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("applyWarmupBullpen — multiple different pitchers", () => {
  it("correctly places warm-up for each pitcher across 4 innings", () => {
    // Innings 2,3,4 each have a different pitcher
    let innings = makeInnings(4);
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-A");
    innings = assignPlayerToSlot(innings, 3, "P", "pitcher-B");
    innings = assignPlayerToSlot(innings, 4, "P", "pitcher-C");

    const result = applyWarmupBullpen(innings);

    expect(getBullpenP(result, 1)?.playerId).toBe("pitcher-A"); // warm-up for inn-2
    expect(getBullpenP(result, 2)?.playerId).toBe("pitcher-B"); // warm-up for inn-3
    expect(getBullpenP(result, 3)?.playerId).toBe("pitcher-C"); // warm-up for inn-4
    // Inning 4 has no warm-up because there is no inning 5
    expect(getBullpenP(result, 4)?.playerId).toBeNull();
  });

  it("locks each bullpen warm-up slot independently", () => {
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-A");
    innings = assignPlayerToSlot(innings, 3, "P", "pitcher-B");

    const result = applyWarmupBullpen(innings);
    expect(getBullpenP(result, 1)?.locked).toBe(true);
    expect(getBullpenP(result, 2)?.locked).toBe(true);
  });
});

describe("applyWarmupBullpen — same pitcher in non-consecutive innings", () => {
  it("places pitcher in Bullpen-P for each preceding inning", () => {
    let innings = makeInnings(4);
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-X");
    innings = assignPlayerToSlot(innings, 4, "P", "pitcher-X");

    const result = applyWarmupBullpen(innings);

    expect(getBullpenP(result, 1)?.playerId).toBe("pitcher-X"); // warm-up for inn-2
    expect(getBullpenP(result, 3)?.playerId).toBe("pitcher-X"); // warm-up for inn-4
    // Inning 2 had a different pitcher (same pitcher-X) in slot — warm-up for inn-3 is null
    expect(getBullpenP(result, 2)?.playerId).toBeNull();
  });
});

describe("applyWarmupBullpen — pitcher cleared mid-game", () => {
  it("clears the warm-up slot when pitcher is cleared from the next inning", () => {
    let innings = makeInnings(3);
    // Set up pitcher in inning 2
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-X");
    // Apply warm-up to establish locked Bullpen-P in inning 1
    innings = applyWarmupBullpen(innings);
    expect(getBullpenP(innings, 1)?.playerId).toBe("pitcher-X");
    expect(getBullpenP(innings, 1)?.locked).toBe(true);

    // Now clear the pitcher from inning 2
    innings = assignPlayerToSlot(innings, 2, "P", null);
    const result = applyWarmupBullpen(innings);

    // Bullpen-P in inning 1 should be cleared and unlocked
    expect(getBullpenP(result, 1)?.playerId).toBeNull();
    expect(getBullpenP(result, 1)?.locked).toBe(false);
  });

  it("clears Bullpen-C when pitcher is cleared (manually-locked Bullpen-C released)", () => {
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-X");
    // Manually lock Bullpen-C (simulates a coach-set warm-up partner)
    innings = assignPlayerToSlot(innings, 1, "Bullpen - C", "catcher-Y");
    innings = toggleSlotLock(innings, 1, "Bullpen - C");
    innings = applyWarmupBullpen(innings);

    // Bullpen-P should be locked, Bullpen-C stays as manually locked
    expect(getBullpenP(innings, 1)?.playerId).toBe("pitcher-X");
    expect(getBullpenC(innings, 1)?.playerId).toBe("catcher-Y");
    expect(getBullpenC(innings, 1)?.locked).toBe(true);

    // Clear pitcher
    innings = assignPlayerToSlot(innings, 2, "P", null);
    const result = applyWarmupBullpen(innings);

    expect(getBullpenC(result, 1)?.playerId).toBeNull();
    expect(getBullpenC(result, 1)?.locked).toBe(false);
  });

  it("new pitcher in inning 4 after clearing inning 3 pitcher sets up new warm-up", () => {
    let innings = makeInnings(4);
    innings = assignPlayerToSlot(innings, 3, "P", "pitcher-X");
    innings = applyWarmupBullpen(innings);
    // inning 2 warm-up for pitcher-X
    expect(getBullpenP(innings, 2)?.playerId).toBe("pitcher-X");

    // Clear inning 3, set new pitcher in inning 4
    innings = assignPlayerToSlot(innings, 3, "P", null);
    innings = assignPlayerToSlot(innings, 4, "P", "pitcher-Z");
    const result = applyWarmupBullpen(innings);

    // Inning 2 warm-up should be cleared (inning 3 pitcher was cleared)
    expect(getBullpenP(result, 2)?.playerId).toBeNull();
    // Inning 3 warm-up should be pitcher-Z (warm-up for inning 4)
    expect(getBullpenP(result, 3)?.playerId).toBe("pitcher-Z");
  });
});

describe("applyWarmupBullpen — Bullpen-C locked by different player", () => {
  it("does NOT replace Bullpen-C when it is locked to a different player", () => {
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-X");
    innings = assignPlayerToSlot(innings, 2, "C", "catcher-Y");
    // Lock Bullpen-C in inning 1 to a DIFFERENT catcher
    innings = assignPlayerToSlot(innings, 1, "Bullpen - C", "other-catcher");
    innings = toggleSlotLock(innings, 1, "Bullpen - C");

    const result = applyWarmupBullpen(innings);

    // Bullpen-C should still be locked to other-catcher, not catcher-Y
    expect(getBullpenC(result, 1)?.playerId).toBe("other-catcher");
    expect(getBullpenC(result, 1)?.locked).toBe(true);
  });

});

describe("applyWarmupBullpen — inning-1 pitcher has no warm-up", () => {
  it("does not create a warm-up for a pitcher starting in inning 1 (warmupNum = 0)", () => {
    let innings = makeInnings(1);
    innings = assignPlayerToSlot(innings, 1, "P", "pitcher-X");
    const result = applyWarmupBullpen(innings);
    // Only one inning exists; inning 1 pitcher has no warm-up inning (warmup would be inning 0)
    expect(getBullpenP(result, 1)?.playerId).toBeNull();
  });

  it("single-inning game: Bullpen-P remains null after warmup pass", () => {
    let innings = makeInnings(1);
    innings = assignPlayerToSlot(innings, 1, "P", "pitcher-A");
    innings = assignPlayerToSlot(innings, 1, "C", "catcher-B");
    const result = applyWarmupBullpen(innings);
    expect(getBullpenP(result, 1)?.playerId).toBeNull();
    expect(getBullpenC(result, 1)?.playerId).toBeNull();
  });
});

describe("applyWarmupBullpen — catcher locked in another slot in warm-up inning", () => {
  it("does not move catcher to Bullpen-C if they are locked in a different slot", () => {
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-X");
    innings = assignPlayerToSlot(innings, 2, "C", "catcher-Y");
    // Lock catcher-Y to C slot in inning 1
    innings = assignPlayerToSlot(innings, 1, "C", "catcher-Y");
    innings = toggleSlotLock(innings, 1, "C");

    const result = applyWarmupBullpen(innings);

    // catcher-Y should NOT be moved to Bullpen-C since they are locked in C position
    expect(getBullpenC(result, 1)?.playerId).toBeNull();
    // The locked C slot should still have catcher-Y
    expect(getSlot(result, 1, "C")?.playerId).toBe("catcher-Y");
  });
});

describe("applyWarmupBullpen — idempotency", () => {
  it("applying warmup twice produces the same result as applying once", () => {
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 2, "P", "pitcher-A");
    innings = assignPlayerToSlot(innings, 3, "P", "pitcher-B");
    innings = assignPlayerToSlot(innings, 2, "C", "catcher-Y");

    const once = applyWarmupBullpen(innings);
    const twice = applyWarmupBullpen(once);

    // Same player assignments
    expect(getBullpenP(twice, 1)?.playerId).toBe(getBullpenP(once, 1)?.playerId);
    expect(getBullpenP(twice, 2)?.playerId).toBe(getBullpenP(once, 2)?.playerId);
  });
});
