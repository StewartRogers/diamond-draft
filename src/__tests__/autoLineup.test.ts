/**
 * Tests for src/lib/autoLineup.ts
 * Covers: buildAutoLineup — feasibility, pitching limits, pitching rest,
 *         no-pitching-after-catching, back-to-back bench prevention,
 *         fair play time, position eligibility, player availability
 *         (absent, late, earlyLeave), locked slots.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildAutoLineup } from "@/lib/autoLineup";
import { FIELD_POSITIONS } from "@/lib/types";
import type { InningAssignment, Player } from "@/lib/types";
import { assignPlayerToSlot, toggleSlotLock } from "@/lib/lineup";
import { makePlayer, makeRules, resetPlayerSeq, makeRoster, makeInnings, GAME_STUB } from "./helpers";

beforeEach(() => resetPlayerSeq());

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pitcherCount(innings: InningAssignment[], playerId: string): number {
  return innings.reduce((sum, inn) => {
    const slot = inn.slots.find(
      (s) => s.playerId === playerId && (s.position === "P" || s.position === "Bullpen - P")
    );
    return sum + (slot ? 1 : 0);
  }, 0);
}

function fieldInnings(innings: InningAssignment[], playerId: string): number {
  return innings.reduce((sum, inn) => {
    const slot = inn.slots.find(
      (s) =>
        s.playerId === playerId &&
        (FIELD_POSITIONS as readonly string[]).includes(s.position)
    );
    return sum + (slot ? 1 : 0);
  }, 0);
}

function consecutiveBench(innings: InningAssignment[], playerId: string): number {
  let max = 0;
  let current = 0;
  for (const inn of innings) {
    const slot = inn.slots.find((s) => s.playerId === playerId);
    if (!slot || slot.position === "Bench") {
      current++;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

// ─── Basic feasibility ─────────────────────────────────────────────────────

describe("buildAutoLineup — basic feasibility", () => {
  it("returns feasible=true for a full roster (12 players, 6 innings)", () => {
    const players = makeRoster(12);
    const innings = makeInnings(6);
    const rules = makeRules();
    const result = buildAutoLineup(players, innings, [], rules, GAME_STUB);
    expect(result.feasible).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("assigns every player in every inning (each player gets a slot)", () => {
    const players = makeRoster(9);
    const innings = makeInnings(6);
    const result = buildAutoLineup(players, innings, [], makeRules(), GAME_STUB);
    // Each player should appear in each inning
    for (const inn of result.innings) {
      const assignedIds = inn.slots
        .filter((s) => s.playerId !== null)
        .map((s) => s.playerId!);
      for (const p of players) {
        expect(assignedIds).toContain(p.id);
      }
    }
  });

  it("returns innings with the same count as the input", () => {
    const players = makeRoster(9);
    const innings = makeInnings(4);
    const result = buildAutoLineup(players, innings, [], makeRules(), GAME_STUB);
    expect(result.innings).toHaveLength(4);
  });

  it("logs a header entry per inning", () => {
    const players = makeRoster(9);
    const innings = makeInnings(3);
    const result = buildAutoLineup(players, innings, [], makeRules(), GAME_STUB);
    const inningHeaders = result.log.filter((l) => l.startsWith("── Inning"));
    expect(inningHeaders).toHaveLength(3);
  });
});

// ─── Pitching limits ──────────────────────────────────────────────────────

describe("buildAutoLineup — pitching limits", () => {
  it("respects per-player game pitching limit", () => {
    // Only one pitcher-eligible player; limit = 2; 6 innings
    const pitcher = makePlayer({ id: "ace", pitchingLimitGame: 2, eligiblePositions: ["P", "LF"] });
    const others = makeRoster(8);
    const rules = makeRules({ globalPitchingLimitGame: 0 }); // no global limit
    const result = buildAutoLineup([pitcher, ...others], makeInnings(6), [], rules, GAME_STUB);
    const pitchCount = pitcherCount(result.innings, "ace");
    expect(pitchCount).toBeLessThanOrEqual(2);
  });

  it("respects global game pitching limit", () => {
    const pitcher = makePlayer({ id: "ace", pitchingLimitGame: 0 });
    const others = makeRoster(8);
    const rules = makeRules({ globalPitchingLimitGame: 2 });
    const result = buildAutoLineup([pitcher, ...others], makeInnings(6), [], rules, GAME_STUB);
    const pitchCount = pitcherCount(result.innings, "ace");
    expect(pitchCount).toBeLessThanOrEqual(2);
  });

  it("respects season pitching limit", () => {
    const pitcher = makePlayer({
      id: "ace",
      pitchingLimitSeason: 4,
      pitchingLog: [{ gameId: "prev", date: "2026-01-01", innings: 3 }], // 3 used, 1 remaining
    });
    const others = makeRoster(8);
    const rules = makeRules({ globalPitchingLimitGame: 0 });
    const result = buildAutoLineup([pitcher, ...others], makeInnings(6), [], rules, GAME_STUB);
    const pitchCount = pitcherCount(result.innings, "ace");
    expect(pitchCount).toBeLessThanOrEqual(1);
  });
});

// ─── Pitching rest ────────────────────────────────────────────────────────

describe("buildAutoLineup — pitching rest", () => {
  it("does not assign back-to-back pitching when pitchingRestInnings=1", () => {
    // 10 players so there's scheduling flexibility
    const players = makeRoster(10);
    const rules = makeRules({ pitchingRestInnings: 1, globalPitchingLimitGame: 0 });
    const result = buildAutoLineup(players, makeInnings(6), [], rules, GAME_STUB);

    for (const p of players) {
      const pitchingInnings: number[] = [];
      // Bullpen-P is warm-up (sitting), not an inning pitched — only count P.
      result.innings.forEach((inn) => {
        if (inn.slots.some((s) => s.playerId === p.id && s.position === "P")) {
          pitchingInnings.push(inn.inning);
        }
      });
      for (let i = 1; i < pitchingInnings.length; i++) {
        const gap = pitchingInnings[i] - pitchingInnings[i - 1] - 1;
        expect(gap).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

// ─── No pitching after catching ───────────────────────────────────────────

describe("buildAutoLineup — no pitching after catching", () => {
  it("does not assign pitching to a player who already caught (rule enabled)", () => {
    const players = makeRoster(10);
    const rules = makeRules({ enforceNoPitchingAfterCatching: true });
    const result = buildAutoLineup(players, makeInnings(6), [], rules, GAME_STUB);

    for (const p of players) {
      let caughtInInning: number | null = null;
      for (const inn of result.innings) {
        const slot = inn.slots.find((s) => s.playerId === p.id);
        if (!slot) continue;
        if (slot.position === "C" || slot.position === "Bullpen - C") {
          caughtInInning = inn.inning;
        } else if (
          (slot.position === "P" || slot.position === "Bullpen - P") &&
          caughtInInning !== null
        ) {
          // This should never happen
          expect(true).toBe(false); // fail explicitly
        }
      }
    }
  });
});

// ─── Back-to-back bench prevention ───────────────────────────────────────

describe("buildAutoLineup — back-to-back bench prevention", () => {
  it("no player exceeds maxConsecutiveBench=1", () => {
    const players = makeRoster(12); // extra players makes scheduling flexible
    const rules = makeRules({ maxConsecutiveBench: 1 });
    const result = buildAutoLineup(players, makeInnings(6), [], rules, GAME_STUB);

    for (const p of players) {
      const maxConsec = consecutiveBench(result.innings, p.id);
      expect(maxConsec).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Fair play time ───────────────────────────────────────────────────────

describe("buildAutoLineup — fair play time", () => {
  it("gives every active player at least minFieldInningsPerPlayer field innings", () => {
    const players = makeRoster(9);
    const rules = makeRules({ minFieldInningsPerPlayer: 2, enforceFairPlayTime: true });
    const result = buildAutoLineup(players, makeInnings(6), [], rules, GAME_STUB);

    for (const p of players) {
      expect(fieldInnings(result.innings, p.id)).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not count field innings for absent players toward violations", () => {
    const players = makeRoster(9);
    const overrides = [{ playerId: players[0].id, status: "absent" as const }];
    const rules = makeRules({ minFieldInningsPerPlayer: 2 });
    const result = buildAutoLineup(players, makeInnings(6), overrides, rules, GAME_STUB);

    // Absent player should have 0 field innings (they were excluded)
    expect(fieldInnings(result.innings, players[0].id)).toBe(0);
  });
});

// ─── Player availability overrides ───────────────────────────────────────

describe("buildAutoLineup — player availability", () => {
  it("does not assign an absent player any slot", () => {
    const players = makeRoster(10);
    const absentId = players[0].id;
    const overrides = [{ playerId: absentId, status: "absent" as const }];
    const result = buildAutoLineup(players, makeInnings(6), overrides, makeRules(), GAME_STUB);

    const absentSlots = result.innings.flatMap((inn) =>
      inn.slots.filter((s) => s.playerId === absentId)
    );
    expect(absentSlots).toHaveLength(0);
  });

  it("does not assign a late player before their arrival inning", () => {
    const players = makeRoster(10);
    const lateId = players[0].id;
    const overrides = [{ playerId: lateId, status: "late" as const, inning: 4 }];
    const result = buildAutoLineup(players, makeInnings(6), overrides, makeRules(), GAME_STUB);

    // Innings 1-3 should have no slot for lateId
    const earlySlots = result.innings
      .filter((inn) => inn.inning < 4)
      .flatMap((inn) => inn.slots.filter((s) => s.playerId === lateId));
    expect(earlySlots).toHaveLength(0);
  });

  it("assigns a late player starting from their arrival inning", () => {
    const players = makeRoster(10);
    const lateId = players[0].id;
    const overrides = [{ playerId: lateId, status: "late" as const, inning: 3 }];
    const result = buildAutoLineup(players, makeInnings(6), overrides, makeRules(), GAME_STUB);

    const afterArrivalInnings = result.innings.filter((inn) => inn.inning >= 3);
    const hasSlot = afterArrivalInnings.some((inn) =>
      inn.slots.some((s) => s.playerId === lateId)
    );
    expect(hasSlot).toBe(true);
  });

  it("does not assign an earlyLeave player after their departure inning", () => {
    const players = makeRoster(10);
    const earlyId = players[0].id;
    const overrides = [{ playerId: earlyId, status: "earlyLeave" as const, inning: 3 }];
    const result = buildAutoLineup(players, makeInnings(6), overrides, makeRules(), GAME_STUB);

    const afterDeparture = result.innings
      .filter((inn) => inn.inning > 3)
      .flatMap((inn) => inn.slots.filter((s) => s.playerId === earlyId));
    expect(afterDeparture).toHaveLength(0);
  });
});

// ─── Position eligibility ─────────────────────────────────────────────────

describe("buildAutoLineup — position eligibility", () => {
  it("only assigns players to positions they are eligible for (enforcePositionEligibility=true)", () => {
    const players = [
      makePlayer({ id: "p1", eligiblePositions: ["P", "1B"] }),
      makePlayer({ id: "p2", eligiblePositions: ["C", "2B"] }),
      makePlayer({ id: "p3", eligiblePositions: ["3B", "SS"] }),
      makePlayer({ id: "p4", eligiblePositions: ["LF", "CF"] }),
      makePlayer({ id: "p5", eligiblePositions: ["RF", "P"] }),
      makePlayer({ id: "p6", eligiblePositions: ["1B", "2B", "3B"] }),
      makePlayer({ id: "p7", eligiblePositions: ["SS", "LF", "CF"] }),
      makePlayer({ id: "p8", eligiblePositions: ["RF", "C"] }),
      makePlayer({ id: "p9", eligiblePositions: ["P", "SS", "LF"] }),
    ];
    const rules = makeRules({ enforcePositionEligibility: true });
    const result = buildAutoLineup(players, makeInnings(3), [], rules, GAME_STUB);

    for (const inn of result.innings) {
      for (const slot of inn.slots) {
        if (!slot.playerId) continue;
        if (!(FIELD_POSITIONS as readonly string[]).includes(slot.position)) continue;
        const player = players.find((p) => p.id === slot.playerId)!;
        expect(player.eligiblePositions).toContain(slot.position);
      }
    }
  });
});

// ─── Locked slots ────────────────────────────────────────────────────────

describe("buildAutoLineup — locked slots", () => {
  it("preserves locked player assignments", () => {
    const players = makeRoster(9);
    let innings = makeInnings(3);
    // Lock player[0] into P for inning 1
    innings = assignPlayerToSlot(innings, 1, "P", players[0].id);
    innings = toggleSlotLock(innings, 1, "P");

    const result = buildAutoLineup(players, innings, [], makeRules(), GAME_STUB);
    const pSlot = result.innings[0].slots.find((s) => s.position === "P");
    expect(pSlot?.playerId).toBe(players[0].id);
    expect(pSlot?.locked).toBe(true);
  });

  it("does not double-assign a locked player to another slot in same inning", () => {
    const players = makeRoster(9);
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "P", players[0].id);
    innings = toggleSlotLock(innings, 1, "P");

    const result = buildAutoLineup(players, innings, [], makeRules(), GAME_STUB);
    const slotsForP0 = result.innings[0].slots.filter((s) => s.playerId === players[0].id);
    expect(slotsForP0).toHaveLength(1);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe("buildAutoLineup — edge cases", () => {
  it("handles empty player list gracefully", () => {
    const innings = makeInnings(3);
    const result = buildAutoLineup([], innings, [], makeRules(), GAME_STUB);
    expect(result.feasible).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("handles single inning", () => {
    const players = makeRoster(9);
    const result = buildAutoLineup(players, makeInnings(1), [], makeRules(), GAME_STUB);
    expect(result.innings).toHaveLength(1);
  });

  it("handles more players than field spots (extra go to bench)", () => {
    const players = makeRoster(15);
    const result = buildAutoLineup(players, makeInnings(6), [], makeRules(), GAME_STUB);
    // Each player should appear in at least one inning across the whole game
    const allAssigned = new Set(
      result.innings.flatMap((inn) =>
        inn.slots.filter((s) => s.playerId !== null).map((s) => s.playerId!)
      )
    );
    for (const p of players) {
      expect(allAssigned.has(p.id)).toBe(true);
    }
  });
});

// ─── Defense-weighted bench scheduling ────────────────────────────────────────

describe("buildAutoLineup — defense-weighted bench scheduling", () => {
  /**
   * Helper: for each inning, collect the total defenseRating of all benched players.
   * Returns an array indexed by inning (0-based).
   */
  function benchDefenseByInning(
    innings: InningAssignment[],
    players: Player[]
  ): number[] {
    const pMap = new Map(players.map((p) => [p.id, p]));
    return innings.map((inn) =>
      inn.slots
        .filter((s) => s.position === "Bench" && s.playerId !== null)
        .reduce((sum, s) => sum + (pMap.get(s.playerId!)?.defenseRating ?? 2.5), 0)
    );
  }

  it("benches higher-rated defenders in early innings vs later innings", () => {
    // 11 players so there are always 2 on bench each inning (9 field spots).
    // 4 players are Elite (4), 4 are Developing (1), 3 are Average (2).
    const elites = makeRoster(4, { defenseRating: 4 });
    const devs = makeRoster(4, { defenseRating: 1 });
    const avgs = makeRoster(3, { defenseRating: 2 });
    const players = [...elites, ...devs, ...avgs];
    const rules = makeRules({ maxConsecutiveBench: 1, enforceFairPlayTime: true, minFieldInningsPerPlayer: 2 });
    const result = buildAutoLineup(players, makeInnings(6), [], rules, GAME_STUB);

    const byInning = benchDefenseByInning(result.innings, players);
    // Sum of bench defense ratings in the first half should be >= second half
    const earlySum = byInning.slice(0, 3).reduce((a, b) => a + b, 0);
    const lateSum = byInning.slice(3).reduce((a, b) => a + b, 0);
    expect(earlySum).toBeGreaterThanOrEqual(lateSum);
  });

  it("never benches all Elite defenders in the same inning", () => {
    // 12 players: 3 Elite (tier 4), rest Average/Developing.
    const elites = makeRoster(3, { defenseRating: 4 });
    const others = makeRoster(9, { defenseRating: 2 });
    const players = [...elites, ...others];
    const rules = makeRules({ maxConsecutiveBench: 1, enforceFairPlayTime: true, minFieldInningsPerPlayer: 2 });
    const result = buildAutoLineup(players, makeInnings(6), [], rules, GAME_STUB);

    const eliteIds = new Set(elites.map((p) => p.id));
    for (const inn of result.innings) {
      const benchedElites = inn.slots.filter(
        (s) => s.position === "Bench" && s.playerId !== null && eliteIds.has(s.playerId!)
      ).length;
      expect(benchedElites).toBeLessThan(elites.length);
    }
  });

  it("never benches all Strong (tier 3) defenders in the same inning", () => {
    const strong = makeRoster(2, { defenseRating: 3 });
    const others = makeRoster(9, { defenseRating: 1 });
    const players = [...strong, ...others];
    const rules = makeRules({ maxConsecutiveBench: 1, enforceFairPlayTime: true, minFieldInningsPerPlayer: 2 });
    const result = buildAutoLineup(players, makeInnings(6), [], rules, GAME_STUB);

    const strongIds = new Set(strong.map((p) => p.id));
    for (const inn of result.innings) {
      const benchedStrong = inn.slots.filter(
        (s) => s.position === "Bench" && s.playerId !== null && strongIds.has(s.playerId!)
      ).length;
      expect(benchedStrong).toBeLessThan(strong.length);
    }
  });

  it("still satisfies consecutive-bench and fair-play constraints with defense ratings", () => {
    const elites = makeRoster(4, { defenseRating: 4 });
    const devs = makeRoster(7, { defenseRating: 1 });
    const players = [...elites, ...devs];
    const rules = makeRules({ maxConsecutiveBench: 1, enforceFairPlayTime: true, minFieldInningsPerPlayer: 3 });
    const result = buildAutoLineup(players, makeInnings(6), [], rules, GAME_STUB);

    // No consecutive bench violations
    for (const p of players) {
      expect(consecutiveBench(result.innings, p.id)).toBeLessThanOrEqual(1);
    }
    // Each player meets the minimum field innings
    for (const p of players) {
      expect(fieldInnings(result.innings, p.id)).toBeGreaterThanOrEqual(3);
    }
  });
});

// ─── Position tier rating assignment ─────────────────────────────────────────

describe("buildAutoLineup — position tier rating assignment", () => {
  /**
   * Count how many innings a player was assigned to a specific position.
   */
  function inningsAtPosition(
    innings: InningAssignment[],
    playerId: string,
    pos: string
  ): number {
    return innings.reduce(
      (sum, inn) =>
        sum + (inn.slots.find((s) => s.playerId === playerId && s.position === pos) ? 1 : 0),
      0
    );
  }

  it("prefers a tier-1 player over a tier-3 player for the same position", () => {
    // 9 players: one rated Tier 1 at SS, one rated Tier 3 at SS, rest eligible everywhere.
    // The Tier 1 player should accumulate more SS innings across a 6-inning game.
    const tier1SS = makePlayer({
      eligiblePositions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
      positionRatings: { SS: 1 },
    });
    const tier3SS = makePlayer({
      eligiblePositions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
      positionRatings: { SS: 3 },
    });
    const rest = makeRoster(7);
    const players = [tier1SS, tier3SS, ...rest];
    const result = buildAutoLineup(players, makeInnings(6), [], makeRules(), GAME_STUB);

    const t1Innings = inningsAtPosition(result.innings, tier1SS.id, "SS");
    const t3Innings = inningsAtPosition(result.innings, tier3SS.id, "SS");
    expect(t1Innings).toBeGreaterThanOrEqual(t3Innings);
  });

  it("assigns tier-1 player to their primary position over an unrated player", () => {
    // Player A has SS=1 (Primary). Player B has no positionRatings (unrated eligible).
    // Over 6 innings, A should get SS at least as often as B.
    const primary = makePlayer({
      eligiblePositions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
      positionRatings: { SS: 1 },
    });
    const unrated = makePlayer({
      eligiblePositions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
      positionRatings: {},
    });
    const rest = makeRoster(7);
    const players = [primary, unrated, ...rest];
    const result = buildAutoLineup(players, makeInnings(6), [], makeRules(), GAME_STUB);

    const primarySS = inningsAtPosition(result.innings, primary.id, "SS");
    const unratedSS = inningsAtPosition(result.innings, unrated.id, "SS");
    expect(primarySS).toBeGreaterThanOrEqual(unratedSS);
  });

  it("fills all field slots when position ratings are set", () => {
    // Mix of tier ratings across positions — all 9 field slots should be filled each inning.
    const players = [
      makePlayer({ positionRatings: { P: 1, SS: 2, CF: 3 } }),
      makePlayer({ positionRatings: { C: 1, "1B": 2 } }),
      makePlayer({ positionRatings: { "2B": 1, "3B": 1 } }),
      makePlayer({ positionRatings: { LF: 1, RF: 2 } }),
      makePlayer({ positionRatings: { SS: 1, "2B": 2 } }),
      makePlayer({ positionRatings: { CF: 1, LF: 2, RF: 2 } }),
      makePlayer({ positionRatings: { "1B": 1, "3B": 2 } }),
      makePlayer({ positionRatings: { C: 2, P: 2 } }),
      makePlayer({ positionRatings: { RF: 1, LF: 3 } }),
    ];
    const result = buildAutoLineup(players, makeInnings(6), [], makeRules(), GAME_STUB);
    // Every field position in every inning should have a player assigned
    const FIELD_POS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
    for (const inn of result.innings) {
      for (const pos of FIELD_POS) {
        const slot = inn.slots.find((s) => s.position === pos);
        expect(slot?.playerId).not.toBeNull();
      }
    }
  });
});
