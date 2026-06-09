/**
 * Regulatory rule tests: RULE_001 through RULE_010.
 *
 * Each describe block covers one rule with at least:
 *   - a "violation fires" test
 *   - a "no violation" (clean) test
 *
 * validateInning signature:
 *   (inningAssignment, allInnings, players, overrides, rules, game)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { validateInning, validateGame } from "@/lib/rules";
import {
  makePlayer,
  makeRoster,
  makeRules,
  makeInnings,
  resetPlayerSeq,
} from "./helpers";
import { createEmptyInning, assignPlayerToSlot } from "@/lib/lineup";
import type {
  InningAssignment,
  PlayerGameOverride,
  Game,
  Player,
} from "@/lib/types";

beforeEach(() => resetPlayerSeq());

const GAME_REF = { id: "reg-test-game" };

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makeGame(
  innings: InningAssignment[],
  players: Player[],
  overrides: PlayerGameOverride[] = []
): Game {
  return {
    id: "reg-test-game",
    date: "2026-06-01",
    pitchCatchAssignments: [],
    innings,
    battingOrder: [],
    playerOverrides: overrides,
    rosterSnapshot: players,
    status: "draft",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

/** Build a fully-populated inning: 9 distinct players at 9 field positions. */
function makeFullInning(inningNum: number, players: Player[]): InningAssignment {
  const positions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
  let inn = createEmptyInning(inningNum);
  for (let i = 0; i < 9; i++) {
    inn = assignPlayerToSlot([inn], inningNum, positions[i], players[i].id)[0];
  }
  return inn;
}

// ─── RULE_001: Player unavailable → cannot be assigned ────────────────────────

describe("RULE_001 — absent player cannot be assigned", () => {
  it("fires PLAYER_ABSENT_ASSIGNED when absent player appears in a slot", () => {
    const players = makeRoster(9);
    const [absent] = players;
    const override: PlayerGameOverride = { playerId: absent.id, status: "absent" };
    const inn = makeFullInning(1, players);
    const violations = validateInning(inn, [inn], players, [override], makeRules(), GAME_REF);
    expect(violations.some((v) => v.code === "PLAYER_ABSENT_ASSIGNED")).toBe(true);
  });

  it("no violation when absent player is not assigned", () => {
    const players = makeRoster(10);
    const absentPlayer = players[9];
    const override: PlayerGameOverride = { playerId: absentPlayer.id, status: "absent" };
    const inn = makeFullInning(1, players.slice(0, 9));
    const violations = validateInning(inn, [inn], players, [override], makeRules(), GAME_REF);
    expect(violations.filter((v) => v.code === "PLAYER_ABSENT_ASSIGNED")).toHaveLength(0);
  });
});

// ─── RULE_002: Player arriving late → cannot be assigned before arrival inning ─

describe("RULE_002 — late player cannot play before arrival inning", () => {
  it("fires PLAYER_NOT_YET_ARRIVED when late player appears too early", () => {
    const players = makeRoster(9);
    const latePlayer = players[0];
    const override: PlayerGameOverride = { playerId: latePlayer.id, status: "late", inning: 3 };
    const inn = makeFullInning(1, players);
    const violations = validateInning(inn, [inn], players, [override], makeRules(), GAME_REF);
    expect(violations.some((v) => v.code === "PLAYER_NOT_YET_ARRIVED")).toBe(true);
  });

  it("no violation when late player only plays from their arrival inning onward", () => {
    const players = makeRoster(9);
    const latePlayer = players[0];
    const override: PlayerGameOverride = { playerId: latePlayer.id, status: "late", inning: 2 };
    const inn = makeFullInning(2, players);
    const violations = validateInning(inn, [inn], players, [override], makeRules(), GAME_REF);
    expect(violations.filter((v) => v.code === "PLAYER_NOT_YET_ARRIVED")).toHaveLength(0);
  });
});

// ─── RULE_003: Player leaving early → cannot be assigned after departure inning

describe("RULE_003 — early-leave player cannot play after departure inning", () => {
  it("fires PLAYER_ALREADY_DEPARTED when assigned after departure", () => {
    const players = makeRoster(9);
    const earlyPlayer = players[0];
    const override: PlayerGameOverride = {
      playerId: earlyPlayer.id,
      status: "earlyLeave",
      inning: 2,
    };
    const inn = makeFullInning(3, players);
    const violations = validateInning(inn, [inn], players, [override], makeRules(), GAME_REF);
    expect(violations.some((v) => v.code === "PLAYER_ALREADY_DEPARTED")).toBe(true);
  });

  it("no violation when player leaves after their last assigned inning", () => {
    const players = makeRoster(9);
    const earlyPlayer = players[0];
    const override: PlayerGameOverride = {
      playerId: earlyPlayer.id,
      status: "earlyLeave",
      inning: 3,
    };
    const inn = makeFullInning(3, players);
    const violations = validateInning(inn, [inn], players, [override], makeRules(), GAME_REF);
    expect(violations.filter((v) => v.code === "PLAYER_ALREADY_DEPARTED")).toHaveLength(0);
  });
});

// ─── RULE_004: Each inning must have exactly 9 defensive players ──────────────

describe("RULE_004 — inning must have exactly 9 field players", () => {
  it("fires TOO_FEW_FIELD_PLAYERS when fewer than 9 assigned", () => {
    const players = makeRoster(8);
    let inn = createEmptyInning(1);
    const positions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF"] as const;
    for (let i = 0; i < 8; i++) {
      inn = assignPlayerToSlot([inn], 1, positions[i], players[i].id)[0];
    }
    const violations = validateInning(
      inn,
      [inn],
      players,
      [],
      makeRules({ minFieldPlayers: 9, maxFieldPlayers: 9 }),
      GAME_REF
    );
    expect(violations.some((v) => v.code === "TOO_FEW_FIELD_PLAYERS")).toBe(true);
  });

  it("no violation when exactly 9 field players present", () => {
    const players = makeRoster(9);
    const inn = makeFullInning(1, players);
    const violations = validateInning(
      inn,
      [inn],
      players,
      [],
      makeRules({ minFieldPlayers: 9, maxFieldPlayers: 9 }),
      GAME_REF
    );
    expect(violations.filter((v) => v.code === "TOO_FEW_FIELD_PLAYERS")).toHaveLength(0);
    expect(violations.filter((v) => v.code === "TOO_MANY_FIELD_PLAYERS")).toHaveLength(0);
  });
});

// ─── RULE_005: A player may appear only once per inning ───────────────────────

describe("RULE_005 — player may appear only once per inning", () => {
  it("fires PLAYER_MULTIPLE_POSITIONS when player is in two slots", () => {
    const players = makeRoster(9);
    const dup = players[0];
    let inn = makeFullInning(1, players);
    // Force dup into CF as well (they're already at P)
    inn = assignPlayerToSlot([inn], 1, "CF", dup.id)[0];
    const violations = validateInning(inn, [inn], players, [], makeRules(), GAME_REF);
    expect(violations.some((v) => v.code === "PLAYER_MULTIPLE_POSITIONS")).toBe(true);
  });

  it("no violation when each player appears exactly once", () => {
    const players = makeRoster(9);
    const inn = makeFullInning(1, players);
    const violations = validateInning(inn, [inn], players, [], makeRules(), GAME_REF);
    expect(violations.filter((v) => v.code === "PLAYER_MULTIPLE_POSITIONS")).toHaveLength(0);
  });
});

// ─── RULE_006: A position may be occupied by only one player per inning ───────

describe("RULE_006 — a position may be occupied by only one player per inning", () => {
  it("fires DUPLICATE_POSITION when two players share a position", () => {
    const players = makeRoster(10);
    const inn = makeFullInning(1, players.slice(0, 9));
    // Manually inject a second LF slot — assignPlayerToSlot would replace, not duplicate
    const innWithDup: InningAssignment = {
      ...inn,
      slots: [...inn.slots, { position: "LF", playerId: players[9].id }],
    };
    const violations = validateInning(innWithDup, [innWithDup], players, [], makeRules(), GAME_REF);
    expect(violations.some((v) => v.code === "DUPLICATE_POSITION")).toBe(true);
  });

  it("no violation when all positions are uniquely occupied", () => {
    const players = makeRoster(9);
    const inn = makeFullInning(1, players);
    const violations = validateInning(inn, [inn], players, [], makeRules(), GAME_REF);
    expect(violations.filter((v) => v.code === "DUPLICATE_POSITION")).toHaveLength(0);
  });
});

// ─── RULE_007: A player may not be benched in consecutive innings ─────────────

describe("RULE_007 — no back-to-back bench innings", () => {
  it("fires BACK_TO_BACK_BENCH when a player sits two innings in a row", () => {
    const players = makeRoster(10);
    const benched = players[9];
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "Bench", benched.id);
    innings = assignPlayerToSlot(innings, 2, "Bench", benched.id);
    const positions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    for (let n = 1; n <= 2; n++) {
      for (let j = 0; j < 9; j++) {
        innings = assignPlayerToSlot(innings, n, positions[j], players[j].id);
      }
    }
    const violations = validateInning(
      innings[1], // inning 2
      innings,
      players,
      [],
      makeRules({ maxConsecutiveBench: 1 }),
      GAME_REF
    );
    expect(violations.some((v) => v.code === "BACK_TO_BACK_BENCH")).toBe(true);
  });

  it("no violation when bench innings are separated by a field inning", () => {
    const players = makeRoster(10);
    const rotated = players[9];
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "Bench", rotated.id);
    innings = assignPlayerToSlot(innings, 2, "LF", rotated.id);
    innings = assignPlayerToSlot(innings, 3, "Bench", rotated.id);
    const violations = validateInning(
      innings[1], // inning 2 — rotated is in field here
      innings,
      players,
      [],
      makeRules({ maxConsecutiveBench: 1 }),
      GAME_REF
    );
    expect(violations.filter((v) => v.code === "BACK_TO_BACK_BENCH")).toHaveLength(0);
  });
});

// ─── RULE_008: A player may pitch only once per game ─────────────────────────

describe("RULE_008 — a player may pitch at most N innings per game", () => {
  it("fires EXCEEDS_GAME_PITCH_LIMIT when pitcher exceeds their per-game limit", () => {
    const pitcher = makePlayer({ pitchingLimitGame: 1 });
    const others = makeRoster(8);
    const players = [pitcher, ...others];
    let innings = makeInnings(2);
    const positions = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    for (const n of [1, 2]) {
      innings = assignPlayerToSlot(innings, n, "P", pitcher.id);
      for (let i = 0; i < 8; i++) {
        innings = assignPlayerToSlot(innings, n, positions[i], others[i].id);
      }
    }
    const violations = validateInning(
      innings[1], // inning 2
      innings,
      players,
      [],
      makeRules({ globalPitchingLimitGame: 0 }),
      GAME_REF
    );
    expect(violations.some((v) => v.code === "EXCEEDS_GAME_PITCH_LIMIT")).toBe(true);
  });

  it("no violation when pitcher stays within their per-game limit", () => {
    const pitcher = makePlayer({ pitchingLimitGame: 1 });
    const others = makeRoster(8);
    const players = [pitcher, ...others];
    let innings = makeInnings(2);
    const positions = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    // Inning 1: pitcher pitches
    innings = assignPlayerToSlot(innings, 1, "P", pitcher.id);
    for (let i = 0; i < 8; i++) {
      innings = assignPlayerToSlot(innings, 1, positions[i], others[i].id);
    }
    // Inning 2: someone else pitches, pitcher plays 1B
    innings = assignPlayerToSlot(innings, 2, "P", others[0].id);
    innings = assignPlayerToSlot(innings, 2, "1B", pitcher.id);
    for (let i = 1; i < 8; i++) {
      innings = assignPlayerToSlot(innings, 2, positions[i], others[i].id);
    }
    const violations = validateInning(
      innings[1],
      innings,
      players,
      [],
      makeRules({ globalPitchingLimitGame: 0 }),
      GAME_REF
    );
    expect(violations.filter((v) => v.code === "EXCEEDS_GAME_PITCH_LIMIT")).toHaveLength(0);
  });
});

// ─── RULE_009: Once removed from pitcher, may not return ──────────────────────

describe("RULE_009 — once removed as pitcher, may not return", () => {
  it("fires PITCHER_RETURNED_AFTER_REMOVAL when pitcher is reinstated after a gap", () => {
    // Inning 1: pitches; inning 2: plays 1B (removed); inning 3: pitches again → violation
    const pitcher = makePlayer();
    const others = makeRoster(8);
    const players = [pitcher, ...others];
    const fieldPositions = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    let innings = makeInnings(3);

    // Inning 1: pitcher at P
    innings = assignPlayerToSlot(innings, 1, "P", pitcher.id);
    for (let i = 0; i < 8; i++) {
      innings = assignPlayerToSlot(innings, 1, fieldPositions[i], others[i].id);
    }
    // Inning 2: pitcher removed, plays 1B; others[0] now pitches
    innings = assignPlayerToSlot(innings, 2, "P", others[0].id);
    innings = assignPlayerToSlot(innings, 2, "1B", pitcher.id);
    for (let i = 1; i < 8; i++) {
      innings = assignPlayerToSlot(innings, 2, fieldPositions[i], others[i].id);
    }
    // Inning 3: pitcher returns to P → RULE_009 violation
    innings = assignPlayerToSlot(innings, 3, "P", pitcher.id);
    for (let i = 0; i < 8; i++) {
      innings = assignPlayerToSlot(innings, 3, fieldPositions[i], others[i].id);
    }

    const violations = validateInning(innings[2], innings, players, [], makeRules(), GAME_REF);
    expect(violations.some((v) => v.code === "PITCHER_RETURNED_AFTER_REMOVAL")).toBe(true);
  });

  it("no violation when pitcher pitches consecutive innings (no removal gap)", () => {
    const pitcher = makePlayer();
    const others = makeRoster(8);
    const players = [pitcher, ...others];
    const fieldPositions = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    let innings = makeInnings(3);
    for (const n of [1, 2, 3]) {
      innings = assignPlayerToSlot(innings, n, "P", pitcher.id);
      for (let i = 0; i < 8; i++) {
        innings = assignPlayerToSlot(innings, n, fieldPositions[i], others[i].id);
      }
    }
    const violations = validateInning(innings[2], innings, players, [], makeRules(), GAME_REF);
    expect(violations.filter((v) => v.code === "PITCHER_RETURNED_AFTER_REMOVAL")).toHaveLength(0);
  });

  it("no violation when Bullpen-P warmup precedes first real pitch (inning N-1/N pattern)", () => {
    // Inning 1: Bullpen-P warmup; innings 2-3: actual pitcher — continuous stint, no gap
    const pitcher = makePlayer();
    const others = makeRoster(8);
    const players = [pitcher, ...others];
    const fieldPositions = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    let innings = makeInnings(3);

    innings = assignPlayerToSlot(innings, 1, "Bullpen - P", pitcher.id);
    for (let i = 0; i < 8; i++) {
      innings = assignPlayerToSlot(innings, 1, fieldPositions[i], others[i].id);
    }
    for (const n of [2, 3]) {
      innings = assignPlayerToSlot(innings, n, "P", pitcher.id);
      for (let i = 0; i < 8; i++) {
        innings = assignPlayerToSlot(innings, n, fieldPositions[i], others[i].id);
      }
    }

    const violations = validateInning(innings[2], innings, players, [], makeRules(), GAME_REF);
    expect(violations.filter((v) => v.code === "PITCHER_RETURNED_AFTER_REMOVAL")).toHaveLength(0);
  });
});

// ─── RULE_010: Max field-inning difference among fully-available players = 1 ──

describe("RULE_010 — field innings balanced among fully-available players", () => {
  it("fires UNBALANCED_FIELD_TIME when a fully-available player is ≥2 innings behind", () => {
    // 9 players, 4 innings; shortPlayer benched in innings 1-3, fields inning 4
    // → 1 field inning vs 4 for others (gap = 3 → violation)
    const players = makeRoster(9);
    const shortPlayer = players[0];
    const positions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    let innings = makeInnings(4);

    for (const n of [1, 2, 3]) {
      innings = assignPlayerToSlot(innings, n, "Bench", shortPlayer.id);
      for (let i = 1; i < 9; i++) {
        innings = assignPlayerToSlot(innings, n, positions[i], players[i].id);
      }
    }
    // Inning 4: shortPlayer gets one field inning
    innings = assignPlayerToSlot(innings, 4, "LF", shortPlayer.id);
    for (let i = 1; i < 9; i++) {
      if (positions[i] === "LF") continue;
      innings = assignPlayerToSlot(innings, 4, positions[i], players[i].id);
    }

    const game = makeGame(innings, players);
    const violations = validateGame(
      game,
      players,
      makeRules({ enforceFairPlayTime: true, minFieldInningsPerPlayer: 0 })
    );
    expect(violations.some((v) => v.code === "UNBALANCED_FIELD_TIME")).toBe(true);
  });

  it("no violation when field innings differ by at most 1", () => {
    // 9 players, 4 innings; player 0 gets 3 field innings (bench inning 4), others get 4
    const players = makeRoster(9);
    const positions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    let innings = makeInnings(4);
    for (const n of [1, 2, 3]) {
      for (let i = 0; i < 9; i++) {
        innings = assignPlayerToSlot(innings, n, positions[i], players[i].id);
      }
    }
    innings = assignPlayerToSlot(innings, 4, "Bench", players[0].id);
    for (let i = 1; i < 9; i++) {
      innings = assignPlayerToSlot(innings, 4, positions[i], players[i].id);
    }

    const game = makeGame(innings, players);
    const violations = validateGame(
      game,
      players,
      makeRules({ enforceFairPlayTime: true, minFieldInningsPerPlayer: 0 })
    );
    expect(violations.filter((v) => v.code === "UNBALANCED_FIELD_TIME")).toHaveLength(0);
  });

  it("excludes players with overrides from the balance check", () => {
    // 10 players; player 0 is absent (override) → not counted in RULE_010
    // The 9 active players all have equal field time → no violation
    const players = makeRoster(10);
    const absentPlayer = players[0];
    const override: PlayerGameOverride = { playerId: absentPlayer.id, status: "absent" };
    const positions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    let innings = makeInnings(3);
    for (const n of [1, 2, 3]) {
      for (let i = 0; i < 9; i++) {
        innings = assignPlayerToSlot(innings, n, positions[i], players[i + 1].id);
      }
    }
    const game = makeGame(innings, players, [override]);
    const violations = validateGame(
      game,
      players,
      makeRules({ enforceFairPlayTime: true, minFieldInningsPerPlayer: 0 })
    );
    expect(violations.filter((v) => v.code === "UNBALANCED_FIELD_TIME")).toHaveLength(0);
  });
});
