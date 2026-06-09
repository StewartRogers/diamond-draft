/**
 * Extended tests for src/lib/rules.ts
 * Covers: maxConsecutiveBench boundary conditions (0/1/2),
 *         absent/late/earlyLeave player edge cases.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { validateInning, validateGame } from "@/lib/rules";
import {
  makePlayer,
  makeRoster,
  makeRules,
  makeInnings,
  resetPlayerSeq,
  GAME_STUB,
} from "./helpers";
import { createEmptyInning, assignPlayerToSlot } from "@/lib/lineup";
import type { InningAssignment, PlayerGameOverride, Game } from "@/lib/types";

beforeEach(() => resetPlayerSeq());

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGame(innings: InningAssignment[], overrides: PlayerGameOverride[] = []): Game {
  return {
    id: "test-game",
    date: "2026-01-01",
    pitchCatchAssignments: [],
    innings,
    battingOrder: [],
    playerOverrides: overrides,
    rosterSnapshot: [],
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function benchPlayer(
  innings: InningAssignment[],
  playerId: string,
  inningNumbers: number[]
): InningAssignment[] {
  let result = innings;
  for (const n of inningNumbers) {
    result = assignPlayerToSlot(result, n, "Bench", playerId);
  }
  return result;
}

function fieldPlayer(
  innings: InningAssignment[],
  playerId: string,
  inningNumber: number,
  pos = "LF" as const
): InningAssignment[] {
  return assignPlayerToSlot(innings, inningNumber, pos, playerId);
}

// ─── maxConsecutiveBench = 0 (rule disabled) ─────────────────────────────────

describe("maxConsecutiveBench = 0 — rule disabled", () => {
  it("no BACK_TO_BACK_BENCH violation for 2 consecutive bench innings", () => {
    const player = makePlayer();
    const rules = makeRules({ maxConsecutiveBench: 0, minFieldPlayers: 0 });
    let innings = makeInnings(3);
    innings = benchPlayer(innings, player.id, [1, 2, 3]);

    const inn3 = innings.find((i) => i.inning === 3)!;
    const violations = validateInning(inn3, innings, [player], [], rules, GAME_STUB);

    const backToBack = violations.filter((v) => v.code === "BACK_TO_BACK_BENCH");
    expect(backToBack.length).toBe(0);
  });

  it("no BACK_TO_BACK_BENCH violation when benched every inning of a 6-inning game", () => {
    const player = makePlayer();
    const rules = makeRules({ maxConsecutiveBench: 0, minFieldPlayers: 0, enforceFairPlayTime: false });
    let innings = makeInnings(6);
    innings = benchPlayer(innings, player.id, [1, 2, 3, 4, 5, 6]);
    const game = makeGame(innings);
    const violations = validateGame(game, [player], rules);
    const backToBack = violations.filter((v) => v.code === "BACK_TO_BACK_BENCH");
    expect(backToBack.length).toBe(0);
  });
});

// ─── maxConsecutiveBench = 1 ─────────────────────────────────────────────────

describe("maxConsecutiveBench = 1", () => {
  it("no violation when player benched in non-consecutive innings", () => {
    const player = makePlayer();
    const rules = makeRules({ maxConsecutiveBench: 1, minFieldPlayers: 0 });
    let innings = makeInnings(4);
    innings = benchPlayer(innings, player.id, [1, 3]); // non-consecutive
    innings = fieldPlayer(innings, player.id, 2, "LF");
    innings = fieldPlayer(innings, player.id, 4, "RF");

    for (const inn of innings) {
      const violations = validateInning(inn, innings, [player], [], rules, GAME_STUB);
      const btb = violations.filter((v) => v.code === "BACK_TO_BACK_BENCH");
      expect(btb.length).toBe(0);
    }
  });

  it("violation fires when player is benched in 2 consecutive innings", () => {
    const player = makePlayer();
    const rules = makeRules({ maxConsecutiveBench: 1, minFieldPlayers: 0 });
    let innings = makeInnings(3);
    innings = benchPlayer(innings, player.id, [1, 2]);
    innings = fieldPlayer(innings, player.id, 3, "LF");

    // validateInning checks per-inning — check inning 2 where consecutive count = 2
    const inn2 = innings.find((i) => i.inning === 2)!;
    const violations = validateInning(inn2, innings, [player], [], rules, GAME_STUB);
    const btb = violations.filter((v) => v.code === "BACK_TO_BACK_BENCH");
    expect(btb.length).toBe(1);
    expect(btb[0].playerId).toBe(player.id);
  });

  it("violation message includes the consecutive count and max", () => {
    const player = makePlayer();
    const rules = makeRules({ maxConsecutiveBench: 1, minFieldPlayers: 0 });
    let innings = makeInnings(2);
    innings = benchPlayer(innings, player.id, [1, 2]);

    const inn2 = innings.find((i) => i.inning === 2)!;
    const violations = validateInning(inn2, innings, [player], [], rules, GAME_STUB);
    const btb = violations.find((v) => v.code === "BACK_TO_BACK_BENCH");
    expect(btb?.message).toContain("max 1");
  });
});

// ─── maxConsecutiveBench = 2 ─────────────────────────────────────────────────

describe("maxConsecutiveBench = 2", () => {
  it("no violation for exactly 2 consecutive bench innings", () => {
    const player = makePlayer();
    const rules = makeRules({ maxConsecutiveBench: 2, minFieldPlayers: 0 });
    let innings = makeInnings(3);
    innings = benchPlayer(innings, player.id, [1, 2]);
    innings = fieldPlayer(innings, player.id, 3, "LF");

    for (const inn of innings) {
      const violations = validateInning(inn, innings, [player], [], rules, GAME_STUB);
      const btb = violations.filter((v) => v.code === "BACK_TO_BACK_BENCH");
      expect(btb.length).toBe(0);
    }
  });

  it("violation fires on the 3rd consecutive bench inning", () => {
    const player = makePlayer();
    const rules = makeRules({ maxConsecutiveBench: 2, minFieldPlayers: 0 });
    let innings = makeInnings(4);
    innings = benchPlayer(innings, player.id, [1, 2, 3]);
    innings = fieldPlayer(innings, player.id, 4, "LF");

    const inn3 = innings.find((i) => i.inning === 3)!;
    const violations = validateInning(inn3, innings, [player], [], rules, GAME_STUB);
    const btb = violations.filter((v) => v.code === "BACK_TO_BACK_BENCH");
    expect(btb.length).toBe(1);
    expect(btb[0].code).toBe("BACK_TO_BACK_BENCH");
  });

  it("no violation for 2 consecutive then field then 2 consecutive", () => {
    const player = makePlayer();
    const rules = makeRules({ maxConsecutiveBench: 2, minFieldPlayers: 0 });
    let innings = makeInnings(5);
    innings = benchPlayer(innings, player.id, [1, 2]);
    innings = fieldPlayer(innings, player.id, 3, "LF");
    innings = benchPlayer(innings, player.id, [4, 5]);

    for (const inn of innings) {
      const violations = validateInning(inn, innings, [player], [], rules, GAME_STUB);
      const btb = violations.filter((v) => v.code === "BACK_TO_BACK_BENCH");
      expect(btb.length).toBe(0);
    }
  });
});

// ─── Player absent for entire game ────────────────────────────────────────────

describe("absent player — no violations", () => {
  it("absent player with no assignment produces zero violations", () => {
    const player = makePlayer();
    const overrides: PlayerGameOverride[] = [
      { playerId: player.id, status: "absent" },
    ];
    const rules = makeRules({ minFieldPlayers: 0, enforceFairPlayTime: false });
    const innings = makeInnings(3);
    const game = makeGame(innings, overrides);

    const violations = validateGame(game, [player], rules);
    expect(violations.length).toBe(0);
  });

  it("absent player does not get INSUFFICIENT_FIELD_TIME violation", () => {
    const player = makePlayer();
    const overrides: PlayerGameOverride[] = [
      { playerId: player.id, status: "absent" },
    ];
    const rules = makeRules({
      minFieldPlayers: 0,
      enforceFairPlayTime: true,
      minFieldInningsPerPlayer: 2,
    });
    const innings = makeInnings(6);
    const game = makeGame(innings, overrides);

    const violations = validateGame(game, [player], rules);
    const insuffField = violations.filter((v) => v.code === "INSUFFICIENT_FIELD_TIME");
    expect(insuffField.length).toBe(0);
  });
});

// ─── Late arrival ─────────────────────────────────────────────────────────────

describe("late arrival player", () => {
  it("no violation when late player is assigned starting from their arrival inning", () => {
    const player = makePlayer();
    const overrides: PlayerGameOverride[] = [
      { playerId: player.id, status: "late", inning: 3 },
    ];
    const rules = makeRules({ minFieldPlayers: 0 });
    let innings = makeInnings(5);
    // Only assigned innings 3–5
    innings = fieldPlayer(innings, player.id, 3, "LF");
    innings = fieldPlayer(innings, player.id, 4, "RF");
    innings = fieldPlayer(innings, player.id, 5, "CF");

    for (const inn of innings) {
      const violations = validateInning(inn, innings, [player], overrides, rules, GAME_STUB);
      const avail = violations.filter(
        (v) => v.code === "PLAYER_NOT_YET_ARRIVED" || v.code === "PLAYER_ABSENT_ASSIGNED"
      );
      expect(avail.length).toBe(0);
    }
  });

  it("PLAYER_NOT_YET_ARRIVED violation when late player assigned before arrival", () => {
    const player = makePlayer();
    const overrides: PlayerGameOverride[] = [
      { playerId: player.id, status: "late", inning: 3 },
    ];
    const rules = makeRules({ minFieldPlayers: 0 });
    let innings = makeInnings(4);
    innings = fieldPlayer(innings, player.id, 1, "LF"); // before arrival

    const inn1 = innings.find((i) => i.inning === 1)!;
    const violations = validateInning(inn1, innings, [player], overrides, rules, GAME_STUB);
    const notYet = violations.filter((v) => v.code === "PLAYER_NOT_YET_ARRIVED");
    expect(notYet.length).toBe(1);
    expect(notYet[0].playerId).toBe(player.id);
  });

  it("late player's pre-arrival innings not counted toward bench violations", () => {
    const player = makePlayer();
    // Player arrives inning 3. Innings 1-2 they are absent.
    // In innings 3,4 they are benched (2 consecutive = would violate maxConsecutiveBench=1
    // only if innings 1,2 are counted). They should NOT be counted.
    const overrides: PlayerGameOverride[] = [
      { playerId: player.id, status: "late", inning: 3 },
    ];
    const rules = makeRules({ maxConsecutiveBench: 1, minFieldPlayers: 0 });
    let innings = makeInnings(4);
    // Player has no slot in innings 1-2 (not arrived), benched in innings 3-4
    innings = benchPlayer(innings, player.id, [3, 4]);

    const inn4 = innings.find((i) => i.inning === 4)!;
    const violations = validateInning(inn4, innings, [player], overrides, rules, GAME_STUB);
    const btb = violations.filter((v) => v.code === "BACK_TO_BACK_BENCH");
    // Player arrived inning 3 and was benched innings 3-4 (2 consecutive bench innings).
    // consecutiveBenchInnings must stop at the arrival inning and not count pre-arrival
    // gaps as bench — so consecutive count is 2, which equals maxConsecutiveBench(1)+1=2,
    // triggering a violation. But pre-arrival innings must NOT be counted (they were absent).
    // With the fix: count stops at arrival inning → consecutive=2 → violation fires once.
    expect(btb.length).toBe(1);
  });
});

// ─── Early departure ─────────────────────────────────────────────────────────

describe("early departure player", () => {
  it("no violation when early-leave player assigned only up to departure inning", () => {
    const player = makePlayer();
    const overrides: PlayerGameOverride[] = [
      { playerId: player.id, status: "earlyLeave", inning: 3 },
    ];
    const rules = makeRules({ minFieldPlayers: 0 });
    let innings = makeInnings(5);
    innings = fieldPlayer(innings, player.id, 1, "LF");
    innings = fieldPlayer(innings, player.id, 2, "RF");
    innings = fieldPlayer(innings, player.id, 3, "CF");

    for (const inn of innings) {
      const violations = validateInning(inn, innings, [player], overrides, rules, GAME_STUB);
      const departed = violations.filter((v) => v.code === "PLAYER_ALREADY_DEPARTED");
      expect(departed.length).toBe(0);
    }
  });

  it("PLAYER_ALREADY_DEPARTED violation when player assigned after departure", () => {
    const player = makePlayer();
    const overrides: PlayerGameOverride[] = [
      { playerId: player.id, status: "earlyLeave", inning: 2 },
    ];
    const rules = makeRules({ minFieldPlayers: 0 });
    let innings = makeInnings(4);
    innings = fieldPlayer(innings, player.id, 4, "LF"); // after departure

    const inn4 = innings.find((i) => i.inning === 4)!;
    const violations = validateInning(inn4, innings, [player], overrides, rules, GAME_STUB);
    const departed = violations.filter((v) => v.code === "PLAYER_ALREADY_DEPARTED");
    expect(departed.length).toBe(1);
    expect(departed[0].playerId).toBe(player.id);
  });

  it("early-departure player skipped in fair-play check for innings after departure", () => {
    const player = makePlayer();
    const overrides: PlayerGameOverride[] = [
      { playerId: player.id, status: "earlyLeave", inning: 1 },
    ];
    const rules = makeRules({
      minFieldPlayers: 0,
      enforceFairPlayTime: true,
      minFieldInningsPerPlayer: 2,
    });
    let innings = makeInnings(6);
    innings = fieldPlayer(innings, player.id, 1, "LF"); // only available inning
    const game = makeGame(innings, overrides);

    const violations = validateGame(game, [player], rules);
    // Player is only available for inning 1. They played their only available inning
    // on the field. The fair-play minimum is capped at min(2, availableInnings.length)=1,
    // so 1 field inning satisfies the requirement — no violation should fire.
    const insuff = violations.filter((v) => v.code === "INSUFFICIENT_FIELD_TIME");
    expect(insuff.length).toBe(0);
  });
});

// ─── Multiple players — bench violations isolated ─────────────────────────────

describe("bench violations are per-player", () => {
  it("violation only applies to the player with consecutive bench, not others", () => {
    const p1 = makePlayer();
    const p2 = makePlayer();
    const rules = makeRules({ maxConsecutiveBench: 1, minFieldPlayers: 0 });
    let innings = makeInnings(3);
    innings = benchPlayer(innings, p1.id, [1, 2, 3]); // p1 violates
    innings = fieldPlayer(innings, p2.id, 1, "LF");
    innings = fieldPlayer(innings, p2.id, 2, "RF");
    innings = fieldPlayer(innings, p2.id, 3, "CF");

    const inn3 = innings.find((i) => i.inning === 3)!;
    const violations = validateInning(inn3, innings, [p1, p2], [], rules, GAME_STUB);
    const btb = violations.filter((v) => v.code === "BACK_TO_BACK_BENCH");

    expect(btb.some((v) => v.playerId === p1.id)).toBe(true);
    expect(btb.some((v) => v.playerId === p2.id)).toBe(false);
  });
});
