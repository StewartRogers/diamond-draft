/**
 * Tests for src/lib/rules.ts
 * Covers: validateInning, validateGame, getComplianceSummary
 */
import { describe, it, expect, beforeEach } from "vitest";
import { validateInning, validateGame, getComplianceSummary } from "@/lib/rules";
import type { Game, Player, InningAssignment } from "@/lib/types";
import { createEmptyInning } from "@/lib/lineup";
import { makePlayer, makeRules, resetPlayerSeq, makeRoster } from "./helpers";

beforeEach(() => resetPlayerSeq());

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fully-staffed inning with 9 unique players at each field position. */
function buildFullInning(players: Player[], inningNum = 1): InningAssignment {
  const fieldPositions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
  let inning = createEmptyInning(inningNum);
  fieldPositions.forEach((pos, i) => {
    if (players[i]) {
      inning = {
        ...inning,
        slots: inning.slots.map((s) =>
          s.position === pos ? { ...s, playerId: players[i].id } : s
        ),
      };
    }
  });
  return inning;
}

function makeGameWithInnings(innings: InningAssignment[], rosterSnapshot: Player[] = []): Game {
  return {
    id: "test-game",
    date: "2026-01-01",
    opponent: "Rival",
    teamName: "Eagles",
    notes: "",
    pitchCatchAssignments: [],
    innings,
    battingOrder: [],
    playerOverrides: [],
    rosterSnapshot,
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// ─── validateInning ───────────────────────────────────────────────────────────

describe("validateInning — field player counts", () => {
  it("flags TOO_FEW_FIELD_PLAYERS when fewer than minFieldPlayers assigned", () => {
    const players = makeRoster(5); // 5 players, only 5 field positions filled
    const inning = buildFullInning(players); // fills only 5 of 9 field slots
    const rules = makeRules({ minFieldPlayers: 9 });
    const violations = validateInning(inning, [inning], players, [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "TOO_FEW_FIELD_PLAYERS")).toBe(true);
  });

  it("flags TOO_MANY_FIELD_PLAYERS when more than maxFieldPlayers assigned", () => {
    const players = makeRoster(10);
    // Manually build inning with 10 field positions (override max)
    let inning = createEmptyInning(1);
    // Assign 9 players to the standard 9 field positions
    const fieldPositions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
    fieldPositions.forEach((pos, i) => {
      inning = {
        ...inning,
        slots: inning.slots.map((s) =>
          s.position === pos ? { ...s, playerId: players[i].id } : s
        ),
      };
    });
    const rules = makeRules({ maxFieldPlayers: 8 }); // max is 8 but 9 assigned
    const violations = validateInning(inning, [inning], players, [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "TOO_MANY_FIELD_PLAYERS")).toBe(true);
  });

  it("no field-count violations for a perfect 9-player lineup", () => {
    const players = makeRoster(9);
    const inning = buildFullInning(players);
    const rules = makeRules(); // default: min=9, max=9
    const violations = validateInning(inning, [inning], players, [], rules, { id: "g1" });
    const fieldCountViolations = violations.filter(
      (v) => v.code === "TOO_FEW_FIELD_PLAYERS" || v.code === "TOO_MANY_FIELD_PLAYERS"
    );
    expect(fieldCountViolations).toHaveLength(0);
  });
});

describe("validateInning — duplicate positions", () => {
  it("flags DUPLICATE_POSITION when two slots have the same field position", () => {
    const players = makeRoster(9);
    let inning = buildFullInning(players);
    // Inject an extra P slot with a different player to create a true duplicate position
    const extraPitcher = makePlayer({ id: "extra-pitcher" });
    inning = {
      ...inning,
      slots: [...inning.slots, { position: "P", playerId: extraPitcher.id }],
    };
    const rules = makeRules();
    const violations = validateInning(inning, [inning], [...players, extraPitcher], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "DUPLICATE_POSITION")).toBe(true);
  });

  it("flags PLAYER_MULTIPLE_POSITIONS when same player is in two positions", () => {
    const players = makeRoster(9);
    let inning = buildFullInning(players);
    // Add an extra slot assigning player[0] to a second position
    inning = {
      ...inning,
      slots: [...inning.slots, { position: "2B", playerId: players[0].id }],
    };
    const rules = makeRules();
    const violations = validateInning(inning, [inning], players, [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "PLAYER_MULTIPLE_POSITIONS" && v.playerId === players[0].id)).toBe(true);
  });
});

describe("validateInning — player multiple positions", () => {
  it("flags PLAYER_MULTIPLE_POSITIONS", () => {
    const p = makePlayer({ id: "multi" });
    let inning = createEmptyInning(1);
    inning = {
      ...inning,
      slots: inning.slots.map((s) =>
        s.position === "P" || s.position === "C" ? { ...s, playerId: "multi" } : s
      ),
    };
    const violations = validateInning(inning, [inning], [p], [], makeRules(), { id: "g1" });
    expect(violations.some((v) => v.code === "PLAYER_MULTIPLE_POSITIONS")).toBe(true);
  });
});

describe("validateInning — player availability", () => {
  it("flags PLAYER_ABSENT_ASSIGNED when absent player has a slot", () => {
    const p = makePlayer({ id: "p1" });
    let inning = createEmptyInning(1);
    inning = {
      ...inning,
      slots: inning.slots.map((s) => s.position === "P" ? { ...s, playerId: "p1" } : s),
    };
    const overrides = [{ playerId: "p1", status: "absent" as const }];
    const violations = validateInning(inning, [inning], [p], overrides, makeRules(), { id: "g1" });
    expect(violations.some((v) => v.code === "PLAYER_ABSENT_ASSIGNED")).toBe(true);
  });

  it("flags PLAYER_NOT_YET_ARRIVED for late player assigned before arrival", () => {
    const p = makePlayer({ id: "p1" });
    let inning = createEmptyInning(1); // inning 1
    inning = {
      ...inning,
      slots: inning.slots.map((s) => s.position === "P" ? { ...s, playerId: "p1" } : s),
    };
    const overrides = [{ playerId: "p1", status: "late" as const, inning: 3 }]; // arrives inning 3
    const violations = validateInning(inning, [inning], [p], overrides, makeRules(), { id: "g1" });
    expect(violations.some((v) => v.code === "PLAYER_NOT_YET_ARRIVED")).toBe(true);
  });

  it("flags PLAYER_ALREADY_DEPARTED for earlyLeave player assigned after departure", () => {
    const p = makePlayer({ id: "p1" });
    let inning = createEmptyInning(4); // inning 4
    inning = {
      ...inning,
      slots: inning.slots.map((s) => s.position === "P" ? { ...s, playerId: "p1" } : s),
    };
    const overrides = [{ playerId: "p1", status: "earlyLeave" as const, inning: 2 }]; // leaves after inning 2
    const violations = validateInning(inning, [inning], [p], overrides, makeRules(), { id: "g1" });
    expect(violations.some((v) => v.code === "PLAYER_ALREADY_DEPARTED")).toBe(true);
  });

  it("no availability violation when late player is assigned after they arrive", () => {
    const p = makePlayer({ id: "p1" });
    let inning = createEmptyInning(3);
    inning = {
      ...inning,
      slots: inning.slots.map((s) => s.position === "P" ? { ...s, playerId: "p1" } : s),
    };
    const overrides = [{ playerId: "p1", status: "late" as const, inning: 3 }];
    const violations = validateInning(inning, [inning], [p], overrides, makeRules(), { id: "g1" });
    expect(violations.some((v) => v.code === "PLAYER_NOT_YET_ARRIVED")).toBe(false);
  });
});

describe("validateInning — position eligibility", () => {
  it("flags INELIGIBLE_POSITION when player plays a position they can't", () => {
    const p = makePlayer({ id: "p1", eligiblePositions: ["LF", "CF", "RF"] });
    let inning = createEmptyInning(1);
    inning = {
      ...inning,
      slots: inning.slots.map((s) => s.position === "P" ? { ...s, playerId: "p1" } : s),
    };
    const rules = makeRules({ enforcePositionEligibility: true });
    const violations = validateInning(inning, [inning], [p], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "INELIGIBLE_POSITION" && v.playerId === "p1")).toBe(true);
  });

  it("no eligibility violation when enforcePositionEligibility=false", () => {
    const p = makePlayer({ id: "p1", eligiblePositions: ["LF"] });
    let inning = createEmptyInning(1);
    inning = {
      ...inning,
      slots: inning.slots.map((s) => s.position === "P" ? { ...s, playerId: "p1" } : s),
    };
    const rules = makeRules({ enforcePositionEligibility: false });
    const violations = validateInning(inning, [inning], [p], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "INELIGIBLE_POSITION")).toBe(false);
  });
});

describe("validateInning — pitching limits", () => {
  function makeInningsWithPitcher(pitcherId: string, inningNums: number[]): InningAssignment[] {
    return inningNums.map((n) => {
      let inn = createEmptyInning(n);
      inn = {
        ...inn,
        slots: inn.slots.map((s) => s.position === "P" ? { ...s, playerId: pitcherId } : s),
      };
      return inn;
    });
  }

  it("flags EXCEEDS_GAME_PITCH_LIMIT when player exceeds game limit", () => {
    const p = makePlayer({ id: "ace", pitchingLimitGame: 2 });
    const allInnings = makeInningsWithPitcher("ace", [1, 2, 3]);
    const inningToCheck = allInnings[2]; // inning 3 — would be 3rd inning pitched
    const rules = makeRules();
    const violations = validateInning(inningToCheck, allInnings, [p], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "EXCEEDS_GAME_PITCH_LIMIT" && v.playerId === "ace")).toBe(true);
  });

  it("uses global pitching limit when player has no personal limit", () => {
    const p = makePlayer({ id: "ace", pitchingLimitGame: 0 }); // no personal limit
    const allInnings = makeInningsWithPitcher("ace", [1, 2, 3, 4]);
    const inningToCheck = allInnings[3]; // 4th inning — exceeds global limit of 3
    const rules = makeRules({ globalPitchingLimitGame: 3 });
    const violations = validateInning(inningToCheck, allInnings, [p], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "EXCEEDS_GAME_PITCH_LIMIT")).toBe(true);
  });

  it("flags EXCEEDS_SEASON_PITCH_LIMIT when player exceeds season limit", () => {
    const p = makePlayer({
      id: "ace",
      pitchingLimitSeason: 5,
      pitchingLog: [{ gameId: "prev-game", date: "2026-01-01", innings: 5 }],
    });
    let inning = createEmptyInning(1);
    inning = {
      ...inning,
      slots: inning.slots.map((s) => s.position === "P" ? { ...s, playerId: "ace" } : s),
    };
    const violations = validateInning(inning, [inning], [p], [], makeRules(), { id: "current-game" });
    expect(violations.some((v) => v.code === "EXCEEDS_SEASON_PITCH_LIMIT")).toBe(true);
  });

  it("no pitching limit violation within limits", () => {
    const p = makePlayer({ id: "ace", pitchingLimitGame: 3 });
    const allInnings = makeInningsWithPitcher("ace", [1, 2]);
    const inningToCheck = allInnings[1]; // 2nd inning = within limit
    const violations = validateInning(inningToCheck, allInnings, [p], [], makeRules(), { id: "g1" });
    expect(violations.some((v) => v.code === "EXCEEDS_GAME_PITCH_LIMIT")).toBe(false);
  });
});

describe("validateInning — pitching rest", () => {
  it("flags PITCHING_TOO_SOON when rest rule is violated", () => {
    const p = makePlayer({ id: "ace" });
    // Pitched inning 1, now trying inning 2 with 1 required rest inning
    let inn1 = createEmptyInning(1);
    inn1 = { ...inn1, slots: inn1.slots.map((s) => s.position === "P" ? { ...s, playerId: "ace" } : s) };
    let inn2 = createEmptyInning(2);
    inn2 = { ...inn2, slots: inn2.slots.map((s) => s.position === "P" ? { ...s, playerId: "ace" } : s) };
    const rules = makeRules({ pitchingRestInnings: 1 });
    const violations = validateInning(inn2, [inn1, inn2], [p], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "PITCHING_TOO_SOON")).toBe(true);
  });

  it("no rest violation when sufficient rest has passed", () => {
    const p = makePlayer({ id: "ace" });
    let inn1 = createEmptyInning(1);
    inn1 = { ...inn1, slots: inn1.slots.map((s) => s.position === "P" ? { ...s, playerId: "ace" } : s) };
    const inn2 = createEmptyInning(2); // resting
    let inn3 = createEmptyInning(3);
    inn3 = { ...inn3, slots: inn3.slots.map((s) => s.position === "P" ? { ...s, playerId: "ace" } : s) };
    const rules = makeRules({ pitchingRestInnings: 1 });
    const violations = validateInning(inn3, [inn1, inn2, inn3], [p], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "PITCHING_TOO_SOON")).toBe(false);
  });
});

describe("validateInning — no pitching after catching", () => {
  it("flags PITCHING_AFTER_CATCHING when rule is enabled", () => {
    const p = makePlayer({ id: "p1" });
    let inn1 = createEmptyInning(1);
    inn1 = { ...inn1, slots: inn1.slots.map((s) => s.position === "C" ? { ...s, playerId: "p1" } : s) };
    let inn2 = createEmptyInning(2);
    inn2 = { ...inn2, slots: inn2.slots.map((s) => s.position === "P" ? { ...s, playerId: "p1" } : s) };
    const rules = makeRules({ enforceNoPitchingAfterCatching: true });
    const violations = validateInning(inn2, [inn1, inn2], [p], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "PITCHING_AFTER_CATCHING")).toBe(true);
  });

  it("no violation when enforceNoPitchingAfterCatching=false", () => {
    const p = makePlayer({ id: "p1" });
    let inn1 = createEmptyInning(1);
    inn1 = { ...inn1, slots: inn1.slots.map((s) => s.position === "C" ? { ...s, playerId: "p1" } : s) };
    let inn2 = createEmptyInning(2);
    inn2 = { ...inn2, slots: inn2.slots.map((s) => s.position === "P" ? { ...s, playerId: "p1" } : s) };
    const rules = makeRules({ enforceNoPitchingAfterCatching: false });
    const violations = validateInning(inn2, [inn1, inn2], [p], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "PITCHING_AFTER_CATCHING")).toBe(false);
  });
});

describe("validateInning — back-to-back bench", () => {
  it("flags BACK_TO_BACK_BENCH when player exceeds maxConsecutiveBench", () => {
    const p = makePlayer({ id: "p1" });
    // Player on bench for innings 1 and 2; maxConsecutiveBench=1
    function benchInning(n: number): InningAssignment {
      let inn = createEmptyInning(n);
      inn = { ...inn, slots: [...inn.slots, { position: "Bench", playerId: "p1" }] };
      return inn;
    }
    const inn1 = benchInning(1);
    const inn2 = benchInning(2);
    const rules = makeRules({ maxConsecutiveBench: 1 });
    const violations = validateInning(inn2, [inn1, inn2], [p], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "BACK_TO_BACK_BENCH" && v.playerId === "p1")).toBe(true);
  });

  it("no bench violation when maxConsecutiveBench=0 (disabled)", () => {
    const p = makePlayer({ id: "p1" });
    function benchInning(n: number): InningAssignment {
      let inn = createEmptyInning(n);
      inn = { ...inn, slots: [...inn.slots, { position: "Bench", playerId: "p1" }] };
      return inn;
    }
    const inn1 = benchInning(1);
    const inn2 = benchInning(2);
    const inn3 = benchInning(3);
    const rules = makeRules({ maxConsecutiveBench: 0 });
    const violations = validateInning(inn3, [inn1, inn2, inn3], [p], [], rules, { id: "g1" });
    expect(violations.some((v) => v.code === "BACK_TO_BACK_BENCH")).toBe(false);
  });
});

// ─── validateGame (full-game level) ──────────────────────────────────────────

describe("validateGame — fair play time", () => {
  it("warns INSUFFICIENT_FIELD_TIME when player has too few field innings", () => {
    const players = makeRoster(9);
    // Build a 6-inning game where player[0] only gets 1 field inning
    const innings: InningAssignment[] = [];
    for (let n = 1; n <= 6; n++) {
      let inn = buildFullInning(players, n);
      if (n > 1) {
        // Remove player[0] from field (bench them for innings 2-6)
        inn = {
          ...inn,
          slots: inn.slots.map((s) =>
            s.playerId === players[0].id ? { ...s, playerId: players[1].id } : s
          ),
        };
      }
      innings.push(inn);
    }
    const game = makeGameWithInnings(innings, players);
    const rules = makeRules({ minFieldInningsPerPlayer: 2, enforceFairPlayTime: true });
    const violations = validateGame(game, players, rules);
    expect(
      violations.some(
        (v) => v.code === "INSUFFICIENT_FIELD_TIME" && v.playerId === players[0].id
      )
    ).toBe(true);
  });

  it("no fair-play violation for absent player", () => {
    const players = makeRoster(9);
    const innings = Array.from({ length: 6 }, (_, i) => buildFullInning(players, i + 1));
    const game: Game = {
      ...makeGameWithInnings(innings, players),
      playerOverrides: [{ playerId: players[0].id, status: "absent" }],
    };
    const rules = makeRules({ enforceFairPlayTime: true });
    const violations = validateGame(game, players, rules);
    expect(
      violations.some(
        (v) => v.code === "INSUFFICIENT_FIELD_TIME" && v.playerId === players[0].id
      )
    ).toBe(false);
  });
});

describe("validateGame — season pitch limit cross-check", () => {
  it("flags EXCEEDS_SEASON_PITCH_LIMIT in full-game check", () => {
    const p = makePlayer({
      id: "ace",
      pitchingLimitSeason: 3,
      pitchingLog: [{ gameId: "prev", date: "2026-01-01", innings: 3 }],
    });
    // Assign ace to pitch in 1 inning this game
    let inn = createEmptyInning(1);
    inn = { ...inn, slots: inn.slots.map((s) => s.position === "P" ? { ...s, playerId: "ace" } : s) };
    const game = makeGameWithInnings([inn], [p]);
    const violations = validateGame(game, [p], makeRules());
    expect(violations.some((v) => v.code === "EXCEEDS_SEASON_PITCH_LIMIT")).toBe(true);
  });
});

// ─── getComplianceSummary ─────────────────────────────────────────────────────

describe("getComplianceSummary", () => {
  it("returns valid=true when no errors", () => {
    const players = makeRoster(9);
    const innings = [buildFullInning(players)];
    const game = makeGameWithInnings(innings, players);
    // Use relaxed rules so fair-play warning doesn't cause error
    const rules = makeRules({ enforceFairPlayTime: false });
    const summary = getComplianceSummary(game, players, rules);
    expect(summary.valid).toBe(true);
  });

  it("returns valid=false when there are errors", () => {
    const players = makeRoster(1);
    // Only 1 player — can't fill 9 field positions
    const innings = [createEmptyInning(1)];
    const game = makeGameWithInnings(innings, players);
    const summary = getComplianceSummary(game, players, makeRules());
    expect(summary.valid).toBe(false);
    expect(summary.errorCount).toBeGreaterThan(0);
  });

  it("counts warnings separately from errors", () => {
    // 2-inning game, one player sits bench both innings (0 field innings < min 2).
    // That's a fair-play warning, not an error.
    const players = makeRoster(10); // 10 players, 9 field slots → 1 on bench each inning
    const inn1 = buildFullInning(players.slice(0, 9)); // first 9 on field, player[9] benched
    const inn2 = { ...inn1, inning: 2 };              // same 9 on field again
    const innings = [inn1, inn2];
    const game = makeGameWithInnings(innings, players);
    const rules = makeRules({ minFieldInningsPerPlayer: 2, enforceFairPlayTime: true, maxConsecutiveBench: 0 });
    const summary = getComplianceSummary(game, players, rules);
    expect(summary.warningCount).toBeGreaterThan(0); // player[9] got 0 field innings
    expect(summary.errorCount).toBe(0);              // warnings don't make it invalid
  });
});
