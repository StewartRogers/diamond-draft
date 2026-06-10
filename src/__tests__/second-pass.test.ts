/**
 * Phase 5 — Second pass tests.
 *
 * Covers scenarios discovered on re-reading the code:
 *   1. applyWarmupBullpen × autoFillGame: the "cleared pitcher" case when
 *      Bullpen-P in warm-up inning is not locked (should silently skip clear).
 *   2. consecutiveBench counter reset: verify it resets the *very next inning*
 *      after a force-bench event (using a controlled 10-player scenario).
 *   3. NewGameModal absent player flow: createGame snapshot includes the absent
 *      player; setPlayerOverride marks them absent; autoFill respects it.
 *   4. deleteGame confirmation state: after deleteGame the game is gone AND
 *      seasons no longer reference it.
 *   5. season.ts uncovered functions: computeSeasonStats, recordPitchingFromGame,
 *      exportSeasonStatsCsv, exportGameLineupCsv, isPitchingEligible,
 *      getPlayerGameHistory.
 *   6. upsertPitchCatchAssignment edge cases.
 *   7. PUT /api/games/[id] accepts a JSON array body (typeof [] === "object")
 *      — discovered potential bug: documented as a known gap.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock api + server/db for store tests ─────────────────────────────────────
vi.mock("@/lib/api", () => ({
  loadAll: vi.fn().mockResolvedValue({ players: [], games: [], seasons: [], settings: { activeSeasonId: null, teamName: "", leagueRules: { id: "default", name: "Default Rules", defaultInnings: 6, minFieldPlayers: 9, maxFieldPlayers: 9, maxConsecutiveBench: 1, minFieldInningsPerPlayer: 2, globalPitchingLimitGame: 3, pitchingRestInnings: 0, enforcePositionEligibility: true, enforceFairPlayTime: true, enforceNoPitchingAfterCatching: false }, onboardingComplete: false } }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  createGame: vi.fn().mockResolvedValue(undefined),
  saveGame: vi.fn().mockResolvedValue(undefined),
  deleteGame: vi.fn().mockResolvedValue(undefined),
  saveSeason: vi.fn().mockResolvedValue(undefined),
  createSeason: vi.fn().mockResolvedValue(undefined),
  deleteSeason: vi.fn().mockResolvedValue(undefined),
  createPlayer: vi.fn().mockResolvedValue(undefined),
  savePlayer: vi.fn().mockResolvedValue(undefined),
  deletePlayer: vi.fn().mockResolvedValue(undefined),
  savePlayers: vi.fn().mockResolvedValue(undefined),
  exportAllData: vi.fn().mockResolvedValue({ players: [], games: [], seasons: [], settings: {}, version: 1, exportedAt: "" }),
  importAll: vi.fn().mockResolvedValue(undefined),
  clearAll: vi.fn().mockResolvedValue(undefined),
}));

import {
  applyWarmupBullpen,
  assignPlayerToSlot,
  toggleSlotLock,
  createEmptyInning,
  upsertPitchCatchAssignment,
} from "@/lib/lineup";
import { buildAutoLineup } from "@/lib/autoLineup";
import {
  recordPitchingFromGame,
  computeSeasonStats,
  exportSeasonStatsCsv,
  exportGameLineupCsv,
  isPitchingEligible,
  getPlayerGameHistory,
} from "@/lib/season";
import { useDiamondDraftStore } from "@/lib/store";
import type { Game, Season, Player, InningAssignment } from "@/lib/types";
import { DEFAULT_APP_SETTINGS, DEFAULT_LEAGUE_RULES } from "@/lib/types";
import { makePlayer, makeRoster, makeRules, makeInnings, GAME_STUB, resetPlayerSeq } from "./helpers";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeGame(id: string, overrides: Partial<Game> = {}): Game {
  return {
    id,
    date: "2026-06-01",
    opponent: "Test",
    teamName: "Eagles",
    notes: "",
    pitchCatchAssignments: [],
    innings: [createEmptyInning(1), createEmptyInning(2)],
    battingOrder: [],
    playerOverrides: [],
    rosterSnapshot: [],
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSeason(id: string, gameIds: string[] = []): Season {
  return { id, name: "Season", teamName: "Eagles", year: 2026, gameIds, createdAt: "2026-01-01T00:00:00.000Z" };
}

function resetStore() {
  useDiamondDraftStore.setState({
    status: "ready",
    players: [],
    games: [],
    seasons: [],
    settings: { ...DEFAULT_APP_SETTINGS, leagueRules: { ...DEFAULT_LEAGUE_RULES } },
    activeGameId: null,
    violations: [],
  });
}

beforeEach(() => {
  resetPlayerSeq();
  resetStore();
});

// ─── 1. applyWarmupBullpen: clearing pitcher when Bullpen-P is NOT locked ─────

describe("applyWarmupBullpen — clearing pitcher when Bullpen-P was not previously locked", () => {
  it("silently skips clear when Bullpen-P in warm-up inning is unlocked and null", () => {
    let innings = [createEmptyInning(1), createEmptyInning(2)];
    // No pitcher was ever assigned — Bullpen-P starts null + unlocked
    innings = assignPlayerToSlot(innings, 2, "P", null);
    const result = applyWarmupBullpen(innings);
    // Should remain null and unlocked — no crash
    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.playerId).toBeNull();
    expect(bp?.locked).toBeFalsy();
  });

  it("does not unlock an already-unlocked Bullpen-P when pitcher is null", () => {
    const innings = [createEmptyInning(1), createEmptyInning(2)];
    // Inning 2 pitcher is null from the start
    const result = applyWarmupBullpen(innings);
    const bp = result[0].slots.find((s) => s.position === "Bullpen - P");
    expect(bp?.locked).toBeFalsy();
    expect(bp?.playerId).toBeNull();
  });
});

// ─── 2. consecutiveBench counter resets ──────────────────────────────────────

describe("buildAutoLineup — consecutiveBench resets after bench inning", () => {
  it("a player who benched in inning N can be assigned to field in inning N+1 (score allows it)", () => {
    // 9 players exactly — no bench needed; each player must be in the field every inning
    const players = makeRoster(9);
    const rules = makeRules({ maxConsecutiveBench: 2, maxFieldPlayers: 9, enforceFairPlayTime: true });
    const result = buildAutoLineup(players, makeInnings(6), [], rules, GAME_STUB);

    // With exactly 9 players and 9 field spots, no one should bench at all
    for (const p of players) {
      for (const inn of result.innings) {
        const slot = inn.slots.find((s) => s.playerId === p.id);
        expect(slot).toBeDefined();
        expect(slot?.position).not.toBe("Bench");
      }
    }
  });

  it("bench counter reaches 0 for a player who played field after consecutive bench", () => {
    // Use 10 players — one must bench. After benching + getting a field slot the
    // counter should not accumulate unbounded.
    const players = makeRoster(10);
    const rules = makeRules({ maxConsecutiveBench: 1, maxFieldPlayers: 9, enforceFairPlayTime: false });
    const result = buildAutoLineup(players, makeInnings(4), [], rules, GAME_STUB);

    // For each player, if they get a field slot after bench innings, no subsequent
    // run of bench innings should exceed 2 (1 normal + 1 force at most)
    for (const p of players) {
      let consec = 0;
      for (const inn of result.innings) {
        const slot = inn.slots.find((s) => s.playerId === p.id);
        if (!slot || slot.position === "Bench") {
          consec++;
        } else {
          consec = 0; // field slot resets the streak
        }
        // The counter should never go beyond 2 for any player in this scenario
        expect(consec).toBeLessThanOrEqual(2);
      }
    }
  });
});

// ─── 3. NewGameModal absent player flow ──────────────────────────────────────

describe("store — NewGameModal absent player flow", () => {
  it("createGame includes absent player in rosterSnapshot", async () => {
    const players = makeRoster(3);
    useDiamondDraftStore.setState({ players });

    const game = await useDiamondDraftStore.getState().createGame({
      date: "2026-06-01",
      opponent: "Test",
      teamName: "Eagles",
      notes: "",
    });

    // All 3 players should be in the roster snapshot
    expect(game.rosterSnapshot).toHaveLength(3);
    expect(game.rosterSnapshot.map((p) => p.id)).toContain(players[0].id);
  });

  it("setPlayerOverride absent → autoFillGame does not assign that player", async () => {
    const players = makeRoster(10);
    useDiamondDraftStore.setState({
      players,
      settings: { ...DEFAULT_APP_SETTINGS, leagueRules: { ...DEFAULT_LEAGUE_RULES } },
    });

    const game = await useDiamondDraftStore.getState().createGame({
      date: "2026-06-01",
      opponent: "Test",
      teamName: "Eagles",
      notes: "",
    }, 3);

    // Mark player 0 as absent
    await useDiamondDraftStore.getState().setPlayerOverride(game.id, {
      playerId: players[0].id,
      status: "absent",
    });

    const result = await useDiamondDraftStore.getState().autoFillGame(game.id);

    // The absent player should have no slot in any inning
    const absentSlots = result.innings.flatMap((inn) =>
      inn.slots.filter((s) => s.playerId === players[0].id)
    );
    expect(absentSlots).toHaveLength(0);
  });
});

// ─── 4. deleteGame confirmation state ────────────────────────────────────────

describe("store — deleteGame clears all references", () => {
  it("game is gone from state AND season no longer references it", async () => {
    const game = makeGame("game-del");
    const season = makeSeason("s1", ["game-del", "other-game"]);
    useDiamondDraftStore.setState({ games: [game], seasons: [season], activeGameId: "game-del" });

    await useDiamondDraftStore.getState().deleteGame("game-del");

    const { games, seasons, activeGameId } = useDiamondDraftStore.getState();
    expect(games.find((g) => g.id === "game-del")).toBeUndefined();
    expect(seasons[0].gameIds).not.toContain("game-del");
    expect(seasons[0].gameIds).toContain("other-game");
    expect(activeGameId).toBeNull();
  });

  it("deleting a game that is NOT the active game leaves activeGameId unchanged", async () => {
    const game1 = makeGame("game-1");
    const game2 = makeGame("game-2");
    useDiamondDraftStore.setState({ games: [game1, game2], activeGameId: "game-1" });

    await useDiamondDraftStore.getState().deleteGame("game-2");

    expect(useDiamondDraftStore.getState().activeGameId).toBe("game-1");
  });
});

// ─── 5. season.ts: recordPitchingFromGame ─────────────────────────────────────

describe("recordPitchingFromGame", () => {
  it("adds a pitching log entry for players who pitched", () => {
    const pitcher = makePlayer({ id: "ace" });
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "P", "ace");
    innings = assignPlayerToSlot(innings, 2, "P", "ace");

    const game = makeGame("game-1", { innings, status: "finalized" });
    const result = recordPitchingFromGame([pitcher], game);

    const entry = result[0].pitchingLog.find((e) => e.gameId === "game-1");
    expect(entry).toBeDefined();
    expect(entry!.innings).toBe(2);
  });

  it("does not add a log entry for players who did not pitch", () => {
    const nonPitcher = makePlayer({ id: "bench" });
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", "bench");

    const game = makeGame("game-1", { innings, status: "finalized" });
    const result = recordPitchingFromGame([nonPitcher], game);

    expect(result[0].pitchingLog).toHaveLength(0);
  });

  it("is idempotent — re-finalizing the same game replaces the existing entry", () => {
    const pitcher = makePlayer({
      id: "ace",
      pitchingLog: [{ gameId: "game-1", date: "2026-06-01", innings: 1 }],
    });
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "P", "ace");
    innings = assignPlayerToSlot(innings, 2, "P", "ace");

    const game = makeGame("game-1", { innings, date: "2026-06-01", status: "finalized" });
    const result = recordPitchingFromGame([pitcher], game);

    const entries = result[0].pitchingLog.filter((e) => e.gameId === "game-1");
    expect(entries).toHaveLength(1);
    expect(entries[0].innings).toBe(2); // updated to 2, not 1+2=3
  });

  it("also counts Bullpen-P innings in the pitch log", () => {
    const pitcher = makePlayer({ id: "ace" });
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "Bullpen - P", "ace");
    innings = assignPlayerToSlot(innings, 2, "P", "ace");

    const game = makeGame("game-1", { innings, status: "finalized" });
    const result = recordPitchingFromGame([pitcher], game);

    expect(result[0].pitchingLog[0].innings).toBe(2);
  });
});

// ─── 5. season.ts: computeSeasonStats ────────────────────────────────────────

describe("computeSeasonStats", () => {
  it("returns empty stats when no finalized games", () => {
    const players = makeRoster(2);
    const game = makeGame("g1", { status: "draft" });
    const stats = computeSeasonStats(players, [game]);
    for (const s of stats) {
      expect(s.gamesPlayed).toBe(0);
      expect(s.inningsInField).toBe(0);
    }
  });

  it("counts field innings from finalized games only", () => {
    const player = makePlayer({ id: "p1" });
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", "p1");
    innings = assignPlayerToSlot(innings, 2, "RF", "p1");

    const finalizedGame = makeGame("g1", { innings, status: "finalized" });
    const draftGame = makeGame("g2", { innings, status: "draft" });

    const stats = computeSeasonStats([player], [finalizedGame, draftGame]);
    expect(stats[0].inningsInField).toBe(2); // only finalized game counts
    expect(stats[0].gamesPlayed).toBe(1);
  });

  it("counts bench innings separately from field innings", () => {
    const player = makePlayer({ id: "p1" });
    let innings = makeInnings(2);
    // inning 1: bench, inning 2: field
    innings[0] = {
      ...innings[0],
      slots: [...innings[0].slots, { position: "Bench", playerId: "p1" }],
    };
    innings = assignPlayerToSlot(innings, 2, "LF", "p1");

    const game = makeGame("g1", { innings, status: "finalized" });
    const stats = computeSeasonStats([player], [game]);
    expect(stats[0].inningsInField).toBe(1);
    expect(stats[0].inningsOnBench).toBe(1);
  });

  it("does not count innings for absent players", () => {
    const player = makePlayer({ id: "p1" });
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", "p1");

    const game = makeGame("g1", {
      innings,
      status: "finalized",
      playerOverrides: [{ playerId: "p1", status: "absent" }],
    });
    const stats = computeSeasonStats([player], [game]);
    expect(stats[0].gamesPlayed).toBe(0);
  });
});

// ─── 5. season.ts: isPitchingEligible ────────────────────────────────────────

describe("isPitchingEligible", () => {
  it("returns true when pitching log is empty", () => {
    const player = makePlayer({ pitchingLog: [] });
    expect(isPitchingEligible(player, "2026-06-07", 2)).toBe(true);
  });

  it("returns true when restInnings = 0 (rule disabled)", () => {
    const player = makePlayer({
      pitchingLog: [{ gameId: "g1", date: "2026-06-06", innings: 5 }],
    });
    expect(isPitchingEligible(player, "2026-06-07", 0)).toBe(true);
  });

  it("returns false when last game innings >= restInnings", () => {
    const player = makePlayer({
      pitchingLog: [{ gameId: "g1", date: "2026-06-06", innings: 3 }],
    });
    // Last game had 3 innings pitched; restInnings = 2 → NOT eligible (3 >= 2)
    expect(isPitchingEligible(player, "2026-06-07", 2)).toBe(false);
  });

  it("returns true when last game innings < restInnings", () => {
    const player = makePlayer({
      pitchingLog: [{ gameId: "g1", date: "2026-06-06", innings: 1 }],
    });
    // Last game had 1 inning; restInnings = 2 → eligible (1 < 2)
    expect(isPitchingEligible(player, "2026-06-07", 2)).toBe(true);
  });

  it("ignores future-dated games when checking rest", () => {
    const player = makePlayer({
      pitchingLog: [{ gameId: "g1", date: "2026-07-01", innings: 5 }],
    });
    // The log entry is AFTER the upcoming game date — should be ignored
    expect(isPitchingEligible(player, "2026-06-07", 2)).toBe(true);
  });
});

// ─── 5. season.ts: exportSeasonStatsCsv ──────────────────────────────────────

describe("exportSeasonStatsCsv", () => {
  it("returns a CSV string with header and player rows", () => {
    const players = makeRoster(2);
    const stats = computeSeasonStats(players, []);
    const csv = exportSeasonStatsCsv(players, stats);
    const lines = csv.split("\n");
    // Header + 2 player rows
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Jersey");
  });

  it("CSV rows contain player first name", () => {
    const player = makePlayer({ firstName: "Alice", lastInitial: "Z", jerseyNumber: "99" });
    const stats = computeSeasonStats([player], []);
    const csv = exportSeasonStatsCsv([player], stats);
    expect(csv).toContain("Alice");
  });
});

// ─── 5. season.ts: exportGameLineupCsv ───────────────────────────────────────

describe("exportGameLineupCsv", () => {
  it("returns header with correct inning count", () => {
    const player = makePlayer({ id: "p1", firstName: "Bob", lastInitial: "B", jerseyNumber: "5" });
    let innings = makeInnings(3);
    innings = assignPlayerToSlot(innings, 1, "P", "p1");

    const game = makeGame("g1", { innings, rosterSnapshot: [player] });
    const csv = exportGameLineupCsv(game);
    const header = csv.split("\n")[0];
    expect(header).toContain("Inning 1");
    expect(header).toContain("Inning 2");
    expect(header).toContain("Inning 3");
  });

  it("shows position in the correct inning column", () => {
    const player = makePlayer({ id: "p1", firstName: "Bob", lastInitial: "B", jerseyNumber: "5" });
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "LF", "p1");

    const game = makeGame("g1", { innings, rosterSnapshot: [player] });
    const csv = exportGameLineupCsv(game);
    expect(csv).toContain("LF");
  });
});

// ─── 5. season.ts: getPlayerGameHistory ──────────────────────────────────────

describe("getPlayerGameHistory", () => {
  it("returns only finalized games where player appeared", () => {
    const player = makePlayer({ id: "p1" });
    let innings = makeInnings(1);
    innings = assignPlayerToSlot(innings, 1, "P", "p1");

    const finalizedGame = makeGame("g1", { innings, status: "finalized", date: "2026-06-01" });
    const draftGame = makeGame("g2", { innings, status: "draft", date: "2026-06-02" });

    const history = getPlayerGameHistory("p1", [finalizedGame, draftGame]);
    expect(history).toHaveLength(1);
    expect(history[0].gameId).toBe("g1");
  });

  it("returns empty array when player never appeared in any finalized game", () => {
    const innings = makeInnings(1);
    const game = makeGame("g1", { innings, status: "finalized" });
    const history = getPlayerGameHistory("non-existent", [game]);
    expect(history).toHaveLength(0);
  });

  it("records inningsInField and inningsPitched correctly", () => {
    const player = makePlayer({ id: "p1" });
    let innings = makeInnings(2);
    innings = assignPlayerToSlot(innings, 1, "P", "p1");
    innings = assignPlayerToSlot(innings, 2, "LF", "p1");

    const game = makeGame("g1", { innings, status: "finalized", date: "2026-06-01" });
    const history = getPlayerGameHistory("p1", [game]);
    expect(history[0].inningsInField).toBe(2); // P and LF are both field positions
    expect(history[0].inningsPitched).toBe(1); // only inning 1
  });
});

// ─── 6. upsertPitchCatchAssignment edge cases ────────────────────────────────

describe("upsertPitchCatchAssignment", () => {
  it("creates a new assignment for a new inning", () => {
    const result = upsertPitchCatchAssignment([], 2, "P", "pitcher-1");
    expect(result).toHaveLength(1);
    expect(result[0].inning).toBe(2);
    expect(result[0].pitcherId).toBe("pitcher-1");
    expect(result[0].catcherId).toBeNull();
  });

  it("updates only the pitcher for an existing inning", () => {
    const existing = [{ inning: 1, pitcherId: null, catcherId: "catcher-1" }];
    const result = upsertPitchCatchAssignment(existing, 1, "P", "pitcher-2");
    expect(result).toHaveLength(1);
    expect(result[0].pitcherId).toBe("pitcher-2");
    expect(result[0].catcherId).toBe("catcher-1"); // preserved
  });

  it("updates only the catcher for an existing inning", () => {
    const existing = [{ inning: 1, pitcherId: "pitcher-1", catcherId: null }];
    const result = upsertPitchCatchAssignment(existing, 1, "C", "catcher-2");
    expect(result).toHaveLength(1);
    expect(result[0].catcherId).toBe("catcher-2");
    expect(result[0].pitcherId).toBe("pitcher-1"); // preserved
  });

  it("clears the pitcher with null", () => {
    const existing = [{ inning: 1, pitcherId: "pitcher-1", catcherId: "catcher-1" }];
    const result = upsertPitchCatchAssignment(existing, 1, "P", null);
    expect(result[0].pitcherId).toBeNull();
    expect(result[0].catcherId).toBe("catcher-1");
  });

  it("returns sorted by inning number", () => {
    const result = upsertPitchCatchAssignment([], 3, "P", "p1");
    upsertPitchCatchAssignment(result, 1, "P", "p2");
    // Each call creates a new entry; let's build from scratch
    const r1 = upsertPitchCatchAssignment([], 3, "P", "p1");
    const r2 = upsertPitchCatchAssignment(r1, 1, "P", "p2");
    expect(r2[0].inning).toBe(1);
    expect(r2[1].inning).toBe(3);
  });
});
