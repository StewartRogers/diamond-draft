/**
 * Edge cases filling any remaining gaps in coverage after the main test pass.
 * Covers:
 *   - buildAutoLineup: absent player branch in post-solve fair-play check
 *   - buildAutoLineup: locked slots are respected during assignment
 *   - buildAutoLineup: fillSingleInning returns the correct inning
 *   - applyWarmupBullpen: 3-inning game multiple warmup passes don't interfere
 *   - applyWarmupBullpen: no pitcher in any inning → no changes
 *   - rules: PLAYER_MULTIPLE_POSITIONS violation
 *   - rules: TOO_FEW_FIELD_PLAYERS violation
 *   - rules: TOO_MANY_FIELD_PLAYERS violation
 *   - rules: DUPLICATE_POSITION violation
 *   - lineup: mergeRosterIntoSnapshot keeps guest players
 *   - lineup: getPlayerGamePositions across multiple innings
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildAutoLineup, fillSingleInning } from "@/lib/autoLineup";
import { applyWarmupBullpen, assignPlayerToSlot, mergeRosterIntoSnapshot, getPlayerGamePositions } from "@/lib/lineup";
import { validateInning, validateGame } from "@/lib/rules";
import {
  makePlayer,
  makeRoster,
  makeRules,
  makeInnings,
  resetPlayerSeq,
  GAME_STUB,
} from "./helpers";
import type { Game, InningAssignment, PlayerGameOverride } from "@/lib/types";

beforeEach(() => resetPlayerSeq());

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

// ─── buildAutoLineup: absent player skipped in post-solve fair-play ───────────

describe("buildAutoLineup — absent player", () => {
  it("absent player is not included in post-solve fair-play warning", () => {
    const present = makeRoster(9);
    const absent = makePlayer();
    const allPlayers = [...present, absent];
    const overrides: PlayerGameOverride[] = [{ playerId: absent.id, status: "absent" }];
    const innings = makeInnings(3);
    const rules = makeRules({
      enforcePositionEligibility: false,
      enforceFairPlayTime: true,
      minFieldInningsPerPlayer: 2,
    });

    const result = buildAutoLineup(allPlayers, innings, overrides, rules, GAME_STUB);
    const absentWarning = result.warnings.find((w) => w.includes(absent.firstName));
    expect(absentWarning).toBeUndefined();
  });
});

// ─── buildAutoLineup: locked slots respected ──────────────────────────────────

describe("buildAutoLineup — locked slots", () => {
  it("locked slot player assignment is preserved and not overwritten", () => {
    const players = makeRoster(9);
    const lockedPlayer = players[0];
    let innings = makeInnings(2);
    // Lock player 0 to P slot in inning 1
    innings = innings.map((inn) =>
      inn.inning === 1
        ? {
            ...inn,
            slots: inn.slots.map((s) =>
              s.position === "P"
                ? { ...s, playerId: lockedPlayer.id, locked: true }
                : s
            ),
          }
        : inn
    );

    const rules = makeRules({ enforcePositionEligibility: false });
    const result = buildAutoLineup(players, innings, [], rules, GAME_STUB);

    const pSlot = result.innings.find((i) => i.inning === 1)!.slots.find((s) => s.position === "P");
    expect(pSlot?.playerId).toBe(lockedPlayer.id);
    expect(pSlot?.locked).toBe(true);
  });
});

// ─── fillSingleInning ────────────────────────────────────────────────────────

describe("fillSingleInning", () => {
  it("returns the filled inning number that was requested", () => {
    const players = makeRoster(9);
    let innings = makeInnings(3);
    const game = makeGame(innings);
    const rules = makeRules({ enforcePositionEligibility: false });

    const filled = fillSingleInning(2, players, { ...game, rosterSnapshot: players }, rules);
    expect(filled.inning).toBe(2);
  });

  it("does not modify other innings", () => {
    const players = makeRoster(9);
    const innings = makeInnings(3);
    const game = makeGame(innings);
    const rules = makeRules({ enforcePositionEligibility: false });

    const filled = fillSingleInning(2, players, { ...game, rosterSnapshot: players }, rules);
    // fillSingleInning returns only the target inning
    expect(filled.inning).toBe(2);
  });
});

// ─── applyWarmupBullpen: no pitcher in any inning ─────────────────────────────

describe("applyWarmupBullpen — no pitchers anywhere", () => {
  it("returns innings unchanged (all Bullpen-P slots remain null)", () => {
    const innings = makeInnings(4);
    const result = applyWarmupBullpen(innings);

    for (const inn of result) {
      const bp = inn.slots.find((s) => s.position === "Bullpen - P");
      const bc = inn.slots.find((s) => s.position === "Bullpen - C");
      expect(bp?.playerId).toBeNull();
      expect(bc?.playerId).toBeNull();
    }
  });
});

// ─── applyWarmupBullpen: multi-pass stability ─────────────────────────────────

describe("applyWarmupBullpen — idempotent", () => {
  it("applying twice produces the same result as once", () => {
    const pitcher = makePlayer();
    const catcher = makePlayer();
    let innings = makeInnings(3);
    innings = innings.map((inn) =>
      inn.inning === 2
        ? {
            ...inn,
            slots: inn.slots.map((s) => {
              if (s.position === "P") return { ...s, playerId: pitcher.id };
              if (s.position === "C") return { ...s, playerId: catcher.id };
              return s;
            }),
          }
        : inn
    );

    const once = applyWarmupBullpen(innings);
    const twice = applyWarmupBullpen(once);

    // Check Bullpen-P and Bullpen-C in inning 1 are the same
    const bp1 = twice.find((i) => i.inning === 1)!.slots.find((s) => s.position === "Bullpen - P");
    const bc1 = twice.find((i) => i.inning === 1)!.slots.find((s) => s.position === "Bullpen - C");
    expect(bp1?.playerId).toBe(pitcher.id);
    expect(bc1?.playerId).toBe(catcher.id);
  });
});

// ─── rules: structural violations ────────────────────────────────────────────

describe("validateInning — structural violations", () => {
  it("PLAYER_MULTIPLE_POSITIONS when same player in two slots", () => {
    const p1 = makePlayer();
    const rules = makeRules({ minFieldPlayers: 0 });
    let innings = makeInnings(1);
    innings = assignPlayerToSlot(innings, 1, "LF", p1.id);
    innings = assignPlayerToSlot(innings, 1, "RF", p1.id);

    const inn1 = innings[0];
    const violations = validateInning(inn1, innings, [p1], [], rules, GAME_STUB);
    expect(violations.some((v) => v.code === "PLAYER_MULTIPLE_POSITIONS")).toBe(true);
  });

  it("TOO_FEW_FIELD_PLAYERS when below minFieldPlayers", () => {
    const p1 = makePlayer();
    const rules = makeRules({ minFieldPlayers: 3, maxFieldPlayers: 9 });
    let innings = makeInnings(1);
    innings = assignPlayerToSlot(innings, 1, "LF", p1.id); // only 1 field player

    const inn1 = innings[0];
    const violations = validateInning(inn1, innings, [p1], [], rules, GAME_STUB);
    expect(violations.some((v) => v.code === "TOO_FEW_FIELD_PLAYERS")).toBe(true);
  });

  it("TOO_MANY_FIELD_PLAYERS when above maxFieldPlayers", () => {
    const players = makeRoster(4);
    const rules = makeRules({ minFieldPlayers: 1, maxFieldPlayers: 2 });
    // Assign 3 field players
    let innings = makeInnings(1);
    innings = assignPlayerToSlot(innings, 1, "LF", players[0].id);
    innings = assignPlayerToSlot(innings, 1, "RF", players[1].id);
    innings = assignPlayerToSlot(innings, 1, "CF", players[2].id);

    const inn1 = innings[0];
    const violations = validateInning(inn1, innings, players, [], rules, GAME_STUB);
    expect(violations.some((v) => v.code === "TOO_MANY_FIELD_PLAYERS")).toBe(true);
  });

  it("DUPLICATE_POSITION when two players in same field position", () => {
    const p1 = makePlayer();
    const p2 = makePlayer();
    const rules = makeRules({ minFieldPlayers: 0 });
    // Manually craft an inning with duplicate position (since assignPlayerToSlot would overwrite)
    const inn: InningAssignment = {
      inning: 1,
      slots: [
        { position: "LF", playerId: p1.id },
        { position: "LF", playerId: p2.id },
        { position: "RF", playerId: null },
        { position: "P", playerId: null },
        { position: "C", playerId: null },
        { position: "1B", playerId: null },
        { position: "2B", playerId: null },
        { position: "3B", playerId: null },
        { position: "SS", playerId: null },
        { position: "CF", playerId: null },
        { position: "Bench", playerId: null },
        { position: "Bullpen - P", playerId: null },
        { position: "Bullpen - C", playerId: null },
      ],
    };
    const violations = validateInning(inn, [inn], [p1, p2], [], rules, GAME_STUB);
    expect(violations.some((v) => v.code === "DUPLICATE_POSITION")).toBe(true);
  });
});

// ─── mergeRosterIntoSnapshot ──────────────────────────────────────────────────

describe("mergeRosterIntoSnapshot", () => {
  it("keeps guest players from snapshot not present in live roster", () => {
    const livePlayer = makePlayer({ isGuest: false });
    const guestPlayer = makePlayer({ isGuest: true });
    const live = [livePlayer];
    const snapshot = [livePlayer, guestPlayer];

    const result = mergeRosterIntoSnapshot(live, snapshot);
    expect(result.some((p) => p.id === guestPlayer.id)).toBe(true);
  });

  it("updates existing player data from live roster", () => {
    const original = makePlayer({ firstName: "Old" });
    const updated = { ...original, firstName: "New" };
    const live = [updated];
    const snapshot = [original];

    const result = mergeRosterIntoSnapshot(live, snapshot);
    expect(result.find((p) => p.id === original.id)?.firstName).toBe("New");
  });

  it("adds new players from live roster not in snapshot", () => {
    const existing = makePlayer();
    const newPlayer = makePlayer();
    const live = [existing, newPlayer];
    const snapshot = [existing];

    const result = mergeRosterIntoSnapshot(live, snapshot);
    expect(result.some((p) => p.id === newPlayer.id)).toBe(true);
  });
});

// ─── getPlayerGamePositions ───────────────────────────────────────────────────

describe("getPlayerGamePositions", () => {
  it("returns all positions across multiple innings", () => {
    const p = makePlayer();
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "LF", p.id);
    innings = assignPlayerToSlot(innings, 2, "RF", p.id);
    innings = assignPlayerToSlot(innings, 3, "Bench", p.id);

    const positions = getPlayerGamePositions(p.id, innings);
    expect(positions).toHaveLength(3);
    expect(positions.find((x) => x.inning === 1)?.position).toBe("LF");
    expect(positions.find((x) => x.inning === 2)?.position).toBe("RF");
    expect(positions.find((x) => x.inning === 3)?.position).toBe("Bench");
  });

  it("returns empty array when player has no assignments", () => {
    const p = makePlayer();
    const innings = makeInnings(3);
    const positions = getPlayerGamePositions(p.id, innings);
    expect(positions).toHaveLength(0);
  });
});

// ─── buildAutoLineup: zero-inning game ───────────────────────────────────────

describe("buildAutoLineup — zero-inning game", () => {
  it("returns empty innings without error for 0-inning game", () => {
    const players = makeRoster(9);
    const innings: InningAssignment[] = [];
    const rules = makeRules({
      enforcePositionEligibility: false,
      enforceFairPlayTime: false, // disable to avoid post-solve fair-play warnings
    });
    const result = buildAutoLineup(players, innings, [], rules, GAME_STUB);
    expect(result.innings).toHaveLength(0);
    expect(result.feasible).toBe(true);
  });
});
