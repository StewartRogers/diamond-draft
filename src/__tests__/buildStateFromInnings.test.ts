/**
 * Tests for buildStateFromInnings.
 *
 * This function is the critical pivot of the refactor. It must produce
 * PlayerState values that exactly agree with what validateGame()'s helper
 * functions produce for the same innings data.
 *
 * Each test builds a known innings sequence, runs buildStateFromInnings,
 * and asserts that every PlayerState field matches what the corresponding
 * rules.ts helper returns when called directly on the same data.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildStateFromInnings } from "@/lib/autoLineup";
import {
  consecutiveBenchInnings,
  lastActualPitchingInningBefore,
  lastInningPitchedBefore,
  totalFieldInnings,
  totalInningsPitchedInGame,
} from "@/lib/rules";
import { assignPlayerToSlot } from "@/lib/lineup";
import { makePlayer, makeRoster, makeInnings, resetPlayerSeq } from "./helpers";
import type { InningAssignment, InningSlot, PlayerGameOverride } from "@/lib/types";

beforeEach(() => resetPlayerSeq());

const GAME = { id: "test-game" };
const NO_OVERRIDES: PlayerGameOverride[] = [];

// ─── Helper: build synthetic locked-slot list from a committed inning ─────────

function lockedSlots(inn: InningAssignment): InningSlot[] {
  return inn.slots.filter((s) => s.locked && s.playerId != null);
}

// ─── Baseline: all-empty innings ──────────────────────────────────────────────

describe("buildStateFromInnings — all-empty innings", () => {
  it("all fields are zero/null/empty for a fresh game", () => {
    const players = makeRoster(3);
    const innings = makeInnings(3);
    const state = buildStateFromInnings(players, [], [], 1, NO_OVERRIDES, GAME);

    for (const p of players) {
      const ps = state.get(p.id)!;
      expect(ps.fieldInnings).toBe(0);
      expect(ps.pitchInnings).toBe(0);
      expect(ps.consecutiveBench).toBe(0);
      expect(ps.positionsPlayed.size).toBe(0);
      expect(ps.lastPosition).toBeNull();
      expect(ps.lastPitchInning).toBeNull();
      expect(ps.lastActualPitchInning).toBeNull();
    }

    // Suppress unused variable
    void innings;
  });
});

// ─── fieldInnings agrees with totalFieldInnings ───────────────────────────────

describe("buildStateFromInnings — fieldInnings", () => {
  it("matches totalFieldInnings for a player in field innings 1 and 3", () => {
    const players = makeRoster(2);
    const [a, b] = players;
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "LF", a.id);
    innings = assignPlayerToSlot(innings, 2, "Bench", a.id);
    innings = assignPlayerToSlot(innings, 3, "CF", a.id);
    innings = assignPlayerToSlot(innings, 1, "RF", b.id);

    // Build state for inning 4 (all three innings committed)
    const state = buildStateFromInnings(players, innings, [], 4, NO_OVERRIDES, GAME);

    expect(state.get(a.id)!.fieldInnings).toBe(
      totalFieldInnings(a.id, innings)
    );
    expect(state.get(b.id)!.fieldInnings).toBe(
      totalFieldInnings(b.id, innings)
    );
  });

  it("only counts prior innings, not the current inning's open slots", () => {
    const players = makeRoster(1);
    const [a] = players;
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", a.id);
    // inning 2 is open (no assignment yet)

    const state = buildStateFromInnings(players, innings.slice(0, 1), [], 2, NO_OVERRIDES, GAME);
    // Only inning 1 is prior — fieldInnings should be 1
    expect(state.get(a.id)!.fieldInnings).toBe(1);
  });
});

// ─── pitchInnings agrees with totalInningsPitchedInGame ───────────────────────

describe("buildStateFromInnings — pitchInnings", () => {
  it("counts P and Bullpen-P as pitching innings", () => {
    const players = makeRoster(2);
    const [pitcher] = players;
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "Bullpen - P", pitcher.id);
    innings = assignPlayerToSlot(innings, 2, "P", pitcher.id);
    innings = assignPlayerToSlot(innings, 3, "P", pitcher.id);

    const state = buildStateFromInnings(players, innings, [], 4, NO_OVERRIDES, GAME);

    expect(state.get(pitcher.id)!.pitchInnings).toBe(
      totalInningsPitchedInGame(pitcher.id, innings)
    );
    expect(state.get(pitcher.id)!.pitchInnings).toBe(3);
  });
});

// ─── consecutiveBench agrees with consecutiveBenchInnings ─────────────────────

describe("buildStateFromInnings — consecutiveBench", () => {
  it("matches consecutiveBenchInnings for a player benched in the last two innings", () => {
    const players = makeRoster(2);
    const [a] = players;
    let innings = makeInnings(4);
    innings = assignPlayerToSlot(innings, 1, "LF", a.id);
    innings = assignPlayerToSlot(innings, 2, "Bench", a.id);
    innings = assignPlayerToSlot(innings, 3, "Bench", a.id);

    // Building state for inning 4 — prior innings are 1,2,3
    const state = buildStateFromInnings(players, innings.slice(0, 3), [], 4, NO_OVERRIDES, GAME);

    expect(state.get(a.id)!.consecutiveBench).toBe(
      consecutiveBenchInnings(a.id, innings.slice(0, 3), 3, NO_OVERRIDES)
    );
    expect(state.get(a.id)!.consecutiveBench).toBe(2);
  });

  it("resets to 0 after a field inning", () => {
    const players = makeRoster(1);
    const [a] = players;
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "Bench", a.id);
    innings = assignPlayerToSlot(innings, 2, "Bench", a.id);
    innings = assignPlayerToSlot(innings, 3, "LF", a.id);

    const state = buildStateFromInnings(players, innings, [], 4, NO_OVERRIDES, GAME);
    expect(state.get(a.id)!.consecutiveBench).toBe(0);
  });

  it("does not count unavailable innings (late arrival) in the streak", () => {
    const players = makeRoster(1);
    const [a] = players;
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 2, "Bench", a.id);
    innings = assignPlayerToSlot(innings, 3, "Bench", a.id);
    const overrides: PlayerGameOverride[] = [
      { playerId: a.id, status: "late", inning: 2 },
    ];
    // Inning 1: not available. Innings 2-3: bench. Streak = 2, not 3.
    const state = buildStateFromInnings(players, innings, [], 4, overrides, GAME);

    expect(state.get(a.id)!.consecutiveBench).toBe(
      consecutiveBenchInnings(a.id, innings, 3, overrides)
    );
  });
});

// ─── lastPitchInning agrees with lastInningPitchedBefore ──────────────────────

describe("buildStateFromInnings — lastPitchInning", () => {
  it("returns the inning number of the most recent pitching assignment", () => {
    const players = makeRoster(2);
    const [pitcher] = players;
    let innings = makeInnings(4);
    innings = assignPlayerToSlot(innings, 1, "P", pitcher.id);
    innings = assignPlayerToSlot(innings, 2, "LF", pitcher.id);
    innings = assignPlayerToSlot(innings, 3, "Bullpen - P", pitcher.id);

    const state = buildStateFromInnings(players, innings.slice(0, 3), [], 4, NO_OVERRIDES, GAME);

    expect(state.get(pitcher.id)!.lastPitchInning).toBe(
      lastInningPitchedBefore(pitcher.id, innings.slice(0, 3), 4)
    );
    expect(state.get(pitcher.id)!.lastPitchInning).toBe(3);
  });

  it("is null when player has never pitched", () => {
    const players = makeRoster(1);
    const [a] = players;
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", a.id);

    const state = buildStateFromInnings(players, innings.slice(0, 1), [], 2, NO_OVERRIDES, GAME);
    expect(state.get(a.id)!.lastPitchInning).toBeNull();
  });
});

// ─── lastActualPitchInning agrees with lastActualPitchingInningBefore ─────────

describe("buildStateFromInnings — lastActualPitchInning", () => {
  it("returns most recent P assignment, ignoring Bullpen-P", () => {
    const players = makeRoster(2);
    const [pitcher] = players;
    let innings = makeInnings(4);
    innings = assignPlayerToSlot(innings, 1, "P", pitcher.id);
    innings = assignPlayerToSlot(innings, 2, "LF", pitcher.id);
    innings = assignPlayerToSlot(innings, 3, "Bullpen - P", pitcher.id);

    const state = buildStateFromInnings(players, innings.slice(0, 3), [], 4, NO_OVERRIDES, GAME);

    expect(state.get(pitcher.id)!.lastActualPitchInning).toBe(
      lastActualPitchingInningBefore(pitcher.id, innings.slice(0, 3), 4)
    );
    // Bullpen-P in inning 3 does NOT update lastActualPitchInning
    expect(state.get(pitcher.id)!.lastActualPitchInning).toBe(1);
  });

  it("is null when player has never been the actual pitcher", () => {
    const players = makeRoster(1);
    const [a] = players;
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "Bullpen - P", a.id);

    const state = buildStateFromInnings(players, innings.slice(0, 1), [], 2, NO_OVERRIDES, GAME);
    expect(state.get(a.id)!.lastActualPitchInning).toBeNull();
  });
});

// ─── positionsPlayed and lastPosition ────────────────────────────────────────

describe("buildStateFromInnings — positionsPlayed and lastPosition", () => {
  it("positionsPlayed contains all positions from prior innings and locked current slots", () => {
    const players = makeRoster(1);
    const [a] = players;
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", a.id);
    innings = assignPlayerToSlot(innings, 2, "P", a.id);

    const state = buildStateFromInnings(players, innings.slice(0, 1), [], 2, NO_OVERRIDES, GAME);
    expect(state.get(a.id)!.positionsPlayed.has("LF")).toBe(true);
    expect(state.get(a.id)!.positionsPlayed.has("P")).toBe(false); // inning 2 not committed
  });

  it("lastPosition reflects the most recent committed inning position", () => {
    const players = makeRoster(1);
    const [a] = players;
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "LF", a.id);
    innings = assignPlayerToSlot(innings, 2, "RF", a.id);

    const state = buildStateFromInnings(players, innings.slice(0, 2), [], 3, NO_OVERRIDES, GAME);
    expect(state.get(a.id)!.lastPosition).toBe("RF");
  });

  it("locked slots of the current inning are included in positionsPlayed", () => {
    const players = makeRoster(1);
    const [pitcher] = players;
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", pitcher.id);
    // inning 2 has a locked P slot
    const locked: InningSlot[] = [{ position: "P", playerId: pitcher.id, locked: true }];

    const state = buildStateFromInnings(
      players,
      innings.slice(0, 1),
      locked,
      2,
      NO_OVERRIDES,
      GAME
    );
    expect(state.get(pitcher.id)!.positionsPlayed.has("P")).toBe(true);
    expect(state.get(pitcher.id)!.positionsPlayed.has("LF")).toBe(true);
  });
});

// ─── Locked current slots affect consecutiveBench correctly ──────────────────

describe("buildStateFromInnings — locked current slots affect consecutiveBench", () => {
  it("a locked bench slot in the current inning extends the streak", () => {
    const players = makeRoster(1);
    const [a] = players;
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "Bench", a.id);
    const locked: InningSlot[] = [{ position: "Bench", playerId: a.id, locked: true }];

    const state = buildStateFromInnings(
      players,
      innings.slice(0, 1),
      locked,
      2,
      NO_OVERRIDES,
      GAME
    );
    // Inning 1: bench. Locked inning 2: bench. Streak through inning 2 = 2.
    expect(state.get(a.id)!.consecutiveBench).toBe(2);
  });

  it("a locked field slot in the current inning resets the streak", () => {
    const players = makeRoster(1);
    const [a] = players;
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "Bench", a.id);
    const locked: InningSlot[] = [{ position: "LF", playerId: a.id, locked: true }];

    const state = buildStateFromInnings(
      players,
      innings.slice(0, 1),
      locked,
      2,
      NO_OVERRIDES,
      GAME
    );
    expect(state.get(a.id)!.consecutiveBench).toBe(0);
  });
});
