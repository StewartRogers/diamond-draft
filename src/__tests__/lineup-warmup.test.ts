/**
 * Tests for applyWarmupBullpen in src/lib/lineup.ts
 * Covers all branches of the warm-up logic:
 *   - Basic pitcher filling (Bullpen-P only — Bullpen-C is not auto-assigned)
 *   - Inning 1 pitcher (no warmup)
 *   - Clearing a pitcher (null) releases N-1 bullpen
 *   - Locked conflicting Bullpen-P slot skipped
 *   - Multiple pitchers across innings
 *   - Same player pitches innings 2 AND 4
 */
import { describe, it, expect, beforeEach } from "vitest";
import { applyWarmupBullpen, createEmptyInning } from "@/lib/lineup";
import type { InningAssignment } from "@/lib/types";
import { makePlayer, resetPlayerSeq } from "./helpers";

beforeEach(() => resetPlayerSeq());

function setSlot(
  inn: InningAssignment,
  position: string,
  playerId: string | null,
  locked = false
): InningAssignment {
  return {
    ...inn,
    slots: inn.slots.map((s) =>
      s.position === position ? { ...s, playerId, locked } : s
    ),
  };
}

// ─── Basic warm-up filling ────────────────────────────────────────────────────

describe("applyWarmupBullpen — basic filling", () => {
  it("pitcher in inning 2 fills Bullpen-P in inning 1 (locked)", () => {
    const pitcher = makePlayer();
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    innings[1] = setSlot(innings[1], "P", pitcher.id);

    const result = applyWarmupBullpen(innings);

    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBe(pitcher.id);
    expect(bp?.locked).toBe(true);
  });

  it("catcher from inning 2 fills Bullpen-C in inning 1 (locked)", () => {
    const pitcher = makePlayer();
    const catcher = makePlayer();
    let innings = [createEmptyInning(1), createEmptyInning(2)];
    innings[1] = setSlot(innings[1], "P", pitcher.id);
    innings[1] = setSlot(innings[1], "C", catcher.id);

    const result = applyWarmupBullpen(innings);

    const bc = result[0].slots.find((s) => s.position === "Bullpen - C");
    expect(bc?.playerId).toBe(catcher.id);
    expect(bc?.locked).toBe(true);
  });

  it("pitcher removed from other non-locked slots in warmup inning when placed in Bullpen-P", () => {
    const pitcher = makePlayer();
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    // Place pitcher in a regular field slot in inning 1 (not locked)
    innings[0] = setSlot(innings[0], "LF", pitcher.id);
    // Set pitcher for inning 2
    innings[1] = setSlot(innings[1], "P", pitcher.id);

    const result = applyWarmupBullpen(innings);

    // Pitcher should be in Bullpen-P in inning 1, not LF
    const lf = result[0].slots.find((s) => s.position === "LF");
    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(lf?.playerId).toBeNull();
    expect(bp?.playerId).toBe(pitcher.id);
  });
});

// ─── Inning 1 pitcher — no warm-up inning ─────────────────────────────────────

describe("applyWarmupBullpen — pitcher in inning 1", () => {
  it("does not create a warmup for inning 0 (does not crash)", () => {
    const pitcher = makePlayer();
    const innings = [createEmptyInning(1)];
    innings[0] = setSlot(innings[0], "P", pitcher.id);

    const result = applyWarmupBullpen(innings);

    // Only 1 inning — no error, no inning 0 created
    expect(result.length).toBe(1);
  });

  it("does not modify any slots for inning 1 pitcher warmup", () => {
    const pitcher = makePlayer();
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    innings[0] = setSlot(innings[0], "P", pitcher.id);

    const result = applyWarmupBullpen(innings);

    // Inning 1 pitcher should not cause any warmup (warmupNum = 0, not >= 1)
    const bp1 = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp1?.playerId).toBeNull();
    expect(bp1?.locked).toBeFalsy();
  });
});

// ─── Clearing a pitcher releases N-1 bullpen ──────────────────────────────────

describe("applyWarmupBullpen — clearing pitcher (null)", () => {
  it("clears and unlocks Bullpen-P in N-1 when pitcher is set to null", () => {
    const pitcher = makePlayer();
    // Start with inning 1 Bullpen-P already locked (as if pitcher was set before)
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    innings[0] = setSlot(innings[0], "Bullpen - P", pitcher.id, true); // locked
    // Inning 2 pitcher is null (cleared)
    innings[1] = setSlot(innings[1], "P", null);

    const result = applyWarmupBullpen(innings);

    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBeNull();
    expect(bp?.locked).toBe(false);
  });

  it("also clears and unlocks Bullpen-C in N-1 when pitcher is cleared", () => {
    const pitcher = makePlayer();
    const catcher = makePlayer();
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    innings[0] = setSlot(innings[0], "Bullpen - P", pitcher.id, true);
    innings[0] = setSlot(innings[0], "Bullpen - C", catcher.id, true);
    innings[1] = setSlot(innings[1], "P", null);

    const result = applyWarmupBullpen(innings);

    const bc = result[0].slots.find((s) => s.position === "Bullpen - C");
    expect(bc?.playerId).toBeNull();
    expect(bc?.locked).toBe(false);
  });

  it("does not touch Bullpen-P in N-1 if it is not locked (external assignment)", () => {
    const pitcher = makePlayer();
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    // Bullpen-P in inning 1 is unlocked — not a warmup slot
    innings[0] = setSlot(innings[0], "Bullpen - P", pitcher.id, false);
    innings[1] = setSlot(innings[1], "P", null); // clear pitcher

    const result = applyWarmupBullpen(innings);

    // Should NOT clear unlocked Bullpen-P
    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBe(pitcher.id);
    expect(bp?.locked).toBe(false);
  });
});

// ─── Locked conflicting Bullpen-P — skip ──────────────────────────────────────

describe("applyWarmupBullpen — locked Bullpen-P in N-1 for different player", () => {
  it("does not override locked Bullpen-P that belongs to a different player", () => {
    const pitcher = makePlayer();
    const otherPitcher = makePlayer();
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    // Inning 1 Bullpen-P locked to a different player
    innings[0] = setSlot(innings[0], "Bullpen - P", otherPitcher.id, true);
    // Inning 2 has a different pitcher
    innings[1] = setSlot(innings[1], "P", pitcher.id);

    const result = applyWarmupBullpen(innings);

    // Locked slot should remain unchanged
    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBe(otherPitcher.id);
    expect(bp?.locked).toBe(true);
  });

  it("fills Bullpen-P when locked to the SAME pitcher (idempotent)", () => {
    const pitcher = makePlayer();
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    // Already locked to the same pitcher
    innings[0] = setSlot(innings[0], "Bullpen - P", pitcher.id, true);
    innings[1] = setSlot(innings[1], "P", pitcher.id);

    const result = applyWarmupBullpen(innings);

    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBe(pitcher.id);
    expect(bp?.locked).toBe(true);
  });
});

// ─── Catcher in a locked field slot in N-1 — don't move ─────────────────────

describe("applyWarmupBullpen — catcher in locked slot in N-1", () => {
  it("does not move catcher to Bullpen-C if they are locked in a field slot in N-1", () => {
    const pitcher = makePlayer();
    const catcher = makePlayer();
    let innings = [createEmptyInning(1), createEmptyInning(2)];
    // Catcher is locked to 1B in inning 1
    innings[0] = setSlot(innings[0], "1B", catcher.id, true);
    innings[1] = setSlot(innings[1], "P", pitcher.id);
    innings[1] = setSlot(innings[1], "C", catcher.id);

    const result = applyWarmupBullpen(innings);

    // Catcher should NOT be moved from their locked 1B slot
    const lockedSlot = result[0].slots.find((s) => s.position === "1B");
    expect(lockedSlot?.playerId).toBe(catcher.id);
    expect(lockedSlot?.locked).toBe(true);

    // Bullpen-C should remain empty
    const bc = result[0].slots.find((s) => s.position === "Bullpen - C");
    expect(bc?.playerId).toBeNull();
  });
});

// ─── Multiple pitchers across innings ─────────────────────────────────────────

describe("applyWarmupBullpen — multiple pitchers across innings", () => {
  it("fills warmup for each pitcher in their preceding inning", () => {
    const pitcher2 = makePlayer();
    const pitcher3 = makePlayer();
    const pitcher4 = makePlayer();
    const innings = [
      createEmptyInning(1),
      createEmptyInning(2),
      createEmptyInning(3),
      createEmptyInning(4),
    ];
    innings[1] = setSlot(innings[1], "P", pitcher2.id);
    innings[2] = setSlot(innings[2], "P", pitcher3.id);
    innings[3] = setSlot(innings[3], "P", pitcher4.id);

    const result = applyWarmupBullpen(innings);

    // Inning 1 → Bullpen-P for inning 2 pitcher
    expect(result[0].slots.find((s) => s.position === "Bullpen - P")?.playerId).toBe(pitcher2.id);
    // Inning 2 → Bullpen-P for inning 3 pitcher
    expect(result[1].slots.find((s) => s.position === "Bullpen - P")?.playerId).toBe(pitcher3.id);
    // Inning 3 → Bullpen-P for inning 4 pitcher
    expect(result[2].slots.find((s) => s.position === "Bullpen - P")?.playerId).toBe(pitcher4.id);
  });

  it("same player pitches innings 2 AND 4 — both warmup innings filled correctly", () => {
    const pitcher = makePlayer();
    const catcher = makePlayer();
    const innings = [
      createEmptyInning(1),
      createEmptyInning(2),
      createEmptyInning(3),
      createEmptyInning(4),
    ];
    innings[1] = setSlot(innings[1], "P", pitcher.id);
    innings[1] = setSlot(innings[1], "C", catcher.id);
    innings[3] = setSlot(innings[3], "P", pitcher.id);
    innings[3] = setSlot(innings[3], "C", catcher.id);

    const result = applyWarmupBullpen(innings);

    // Inning 1 Bullpen-P for inning 2 pitcher; Bullpen-C is not auto-assigned
    expect(result[0].slots.find((s) => s.position === "Bullpen - P")?.playerId).toBe(pitcher.id);
    expect(result[0].slots.find((s) => s.position === "Bullpen - C")?.playerId).toBe(catcher.id);

    // Inning 3 Bullpen-P for inning 4 pitcher
    expect(result[2].slots.find((s) => s.position === "Bullpen - P")?.playerId).toBe(pitcher.id);
    expect(result[2].slots.find((s) => s.position === "Bullpen - C")?.playerId).toBe(catcher.id);

    // Inning 2 and 4 are unchanged (they are source innings)
    const bp2 = result[1].slots.find((s) => s.position === "Bullpen - P");
    expect(bp2?.playerId).toBeNull();
  });

  it("inning with no pitcher assigned leaves warmup inning's Bullpen-P empty", () => {
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    // Inning 2 has no pitcher

    const result = applyWarmupBullpen(innings);

    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBeNull();
  });
});
