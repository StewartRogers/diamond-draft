/**
 * Tests for src/lib/store.ts — Zustand store actions.
 *
 * Strategy:
 * - Mock @/lib/api entirely (vi.mock) so no HTTP requests are made.
 * - Create a fresh store instance per test using zustand's `create` + the same
 *   immer middleware, but seeded with controlled state via direct set().
 * - We import `useDiamondDraftStore` and call getState() / setState() directly
 *   without React — perfectly valid in a Node test environment.
 *
 * Covers:
 *   - deleteGame: game removed from state, seasons updated, activeGameId cleared
 *   - setPlayerOverride: override persisted in game.playerOverrides
 *   - removePlayerOverride: override removed from game.playerOverrides
 *   - autoFillGame with non-existent game ID
 *   - setPlayerOverride with player not in roster (no crash)
 *   - createGame attaches to active season
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock @/lib/api before importing the store ─────────────────────────────────
// Replaces all network calls with no-ops / resolved promises so the store's
// async actions complete without hitting any server.
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

import { useDiamondDraftStore } from "@/lib/store";
import type { Game, Season, Player, PlayerGameOverride } from "@/lib/types";
import { DEFAULT_APP_SETTINGS, DEFAULT_LEAGUE_RULES } from "@/lib/types";
import { createEmptyInning } from "@/lib/lineup";
import { makePlayer, makeRoster } from "./helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGame(id: string, overrides: Partial<Game> = {}): Game {
  return {
    id,
    date: "2026-06-01",
    opponent: "Test Opponent",
    teamName: "Eagles",
    notes: "",
    pitchCatchAssignments: [],
    innings: [createEmptyInning(1), createEmptyInning(2), createEmptyInning(3)],
    battingOrder: [],
    playerOverrides: [],
    rosterSnapshot: [],
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSeason(id: string, gameIds: string[] = []): Season {
  return {
    id,
    name: "Test Season",
    teamName: "Eagles",
    year: 2026,
    gameIds,
    createdAt: new Date().toISOString(),
  };
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

// ─── deleteGame ───────────────────────────────────────────────────────────────

describe("store.deleteGame", () => {
  beforeEach(resetStore);

  it("removes the game from state.games", async () => {
    const game = makeGame("game-1");
    useDiamondDraftStore.setState({ games: [game] });

    await useDiamondDraftStore.getState().deleteGame("game-1");

    const { games } = useDiamondDraftStore.getState();
    expect(games.find((g) => g.id === "game-1")).toBeUndefined();
    expect(games).toHaveLength(0);
  });

  it("clears activeGameId when deleting the active game", async () => {
    const game = makeGame("game-active");
    useDiamondDraftStore.setState({ games: [game], activeGameId: "game-active" });

    await useDiamondDraftStore.getState().deleteGame("game-active");

    expect(useDiamondDraftStore.getState().activeGameId).toBeNull();
  });

  it("does NOT clear activeGameId when deleting a different game", async () => {
    const game1 = makeGame("game-1");
    const game2 = makeGame("game-2");
    useDiamondDraftStore.setState({ games: [game1, game2], activeGameId: "game-1" });

    await useDiamondDraftStore.getState().deleteGame("game-2");

    expect(useDiamondDraftStore.getState().activeGameId).toBe("game-1");
  });

  it("removes the game ID from all seasons", async () => {
    const game = makeGame("game-to-delete");
    const season = makeSeason("season-1", ["game-to-delete", "other-game"]);
    useDiamondDraftStore.setState({ games: [game], seasons: [season] });

    await useDiamondDraftStore.getState().deleteGame("game-to-delete");

    const updatedSeason = useDiamondDraftStore.getState().seasons.find((s) => s.id === "season-1")!;
    expect(updatedSeason.gameIds).not.toContain("game-to-delete");
    expect(updatedSeason.gameIds).toContain("other-game");
  });

  it("is a no-op (no crash) when deleting a game that does not exist", async () => {
    useDiamondDraftStore.setState({ games: [] });
    await expect(
      useDiamondDraftStore.getState().deleteGame("non-existent")
    ).resolves.not.toThrow();
  });

  it("keeps other games intact after deletion", async () => {
    const game1 = makeGame("game-1");
    const game2 = makeGame("game-2");
    useDiamondDraftStore.setState({ games: [game1, game2] });

    await useDiamondDraftStore.getState().deleteGame("game-1");

    const { games } = useDiamondDraftStore.getState();
    expect(games).toHaveLength(1);
    expect(games[0].id).toBe("game-2");
  });
});

// ─── setPlayerOverride ────────────────────────────────────────────────────────

describe("store.setPlayerOverride", () => {
  beforeEach(resetStore);

  it("adds an override to game.playerOverrides", async () => {
    const game = makeGame("game-1");
    useDiamondDraftStore.setState({ games: [game] });

    const override: PlayerGameOverride = { playerId: "player-x", status: "absent" };
    await useDiamondDraftStore.getState().setPlayerOverride("game-1", override);

    const updatedGame = useDiamondDraftStore.getState().games.find((g) => g.id === "game-1")!;
    expect(updatedGame.playerOverrides).toHaveLength(1);
    expect(updatedGame.playerOverrides[0]).toEqual(override);
  });

  it("updates an existing override (upsert)", async () => {
    const game = makeGame("game-1", {
      playerOverrides: [{ playerId: "player-x", status: "absent" }],
    });
    useDiamondDraftStore.setState({ games: [game] });

    const updatedOverride: PlayerGameOverride = { playerId: "player-x", status: "late", inning: 3 };
    await useDiamondDraftStore.getState().setPlayerOverride("game-1", updatedOverride);

    const updatedGame = useDiamondDraftStore.getState().games.find((g) => g.id === "game-1")!;
    expect(updatedGame.playerOverrides).toHaveLength(1);
    expect(updatedGame.playerOverrides[0].status).toBe("late");
    expect(updatedGame.playerOverrides[0].inning).toBe(3);
  });

  it("adds multiple distinct overrides without clobbering each other", async () => {
    const game = makeGame("game-1");
    useDiamondDraftStore.setState({ games: [game] });

    await useDiamondDraftStore.getState().setPlayerOverride("game-1", { playerId: "p1", status: "absent" });
    await useDiamondDraftStore.getState().setPlayerOverride("game-1", { playerId: "p2", status: "late", inning: 4 });

    const updatedGame = useDiamondDraftStore.getState().games.find((g) => g.id === "game-1")!;
    expect(updatedGame.playerOverrides).toHaveLength(2);
  });

  it("does not crash when referencing a player not in the roster", async () => {
    const game = makeGame("game-1");
    useDiamondDraftStore.setState({ games: [game], players: [] });

    // Player "ghost" is not in the roster — override should still be stored
    await expect(
      useDiamondDraftStore.getState().setPlayerOverride("game-1", { playerId: "ghost", status: "absent" })
    ).resolves.not.toThrow();

    const updatedGame = useDiamondDraftStore.getState().games.find((g) => g.id === "game-1")!;
    expect(updatedGame.playerOverrides.some((o) => o.playerId === "ghost")).toBe(true);
  });

  it("is a no-op (no crash) when game does not exist", async () => {
    useDiamondDraftStore.setState({ games: [] });
    await expect(
      useDiamondDraftStore.getState().setPlayerOverride("non-existent", { playerId: "p1", status: "absent" })
    ).resolves.not.toThrow();
  });
});

// ─── removePlayerOverride ────────────────────────────────────────────────────

describe("store.removePlayerOverride", () => {
  beforeEach(resetStore);

  it("removes the matching override from game.playerOverrides", async () => {
    const game = makeGame("game-1", {
      playerOverrides: [
        { playerId: "p1", status: "absent" },
        { playerId: "p2", status: "late", inning: 2 },
      ],
    });
    useDiamondDraftStore.setState({ games: [game] });

    await useDiamondDraftStore.getState().removePlayerOverride("game-1", "p1");

    const updatedGame = useDiamondDraftStore.getState().games.find((g) => g.id === "game-1")!;
    expect(updatedGame.playerOverrides).toHaveLength(1);
    expect(updatedGame.playerOverrides[0].playerId).toBe("p2");
  });

  it("is a no-op when the player has no override", async () => {
    const game = makeGame("game-1", {
      playerOverrides: [{ playerId: "p2", status: "absent" }],
    });
    useDiamondDraftStore.setState({ games: [game] });

    await useDiamondDraftStore.getState().removePlayerOverride("game-1", "unknown-player");

    const updatedGame = useDiamondDraftStore.getState().games.find((g) => g.id === "game-1")!;
    expect(updatedGame.playerOverrides).toHaveLength(1);
  });

  it("is a no-op (no crash) when game does not exist", async () => {
    useDiamondDraftStore.setState({ games: [] });
    await expect(
      useDiamondDraftStore.getState().removePlayerOverride("non-existent", "p1")
    ).resolves.not.toThrow();
  });

  it("removes all overrides one by one until empty", async () => {
    const game = makeGame("game-1", {
      playerOverrides: [
        { playerId: "p1", status: "absent" },
        { playerId: "p2", status: "absent" },
      ],
    });
    useDiamondDraftStore.setState({ games: [game] });

    await useDiamondDraftStore.getState().removePlayerOverride("game-1", "p1");
    await useDiamondDraftStore.getState().removePlayerOverride("game-1", "p2");

    const updatedGame = useDiamondDraftStore.getState().games.find((g) => g.id === "game-1")!;
    expect(updatedGame.playerOverrides).toHaveLength(0);
  });
});

// ─── autoFillGame with non-existent game ─────────────────────────────────────

describe("store.autoFillGame — non-existent game", () => {
  beforeEach(resetStore);

  it("returns a result with feasible=false and a warning message", async () => {
    useDiamondDraftStore.setState({ games: [] });

    const result = await useDiamondDraftStore.getState().autoFillGame("no-such-game");

    expect(result.feasible).toBe(false);
    expect(result.warnings.some((w) => w.toLowerCase().includes("not found"))).toBe(true);
  });

  it("does not modify state when game is not found", async () => {
    const game = makeGame("real-game");
    useDiamondDraftStore.setState({ games: [game] });

    await useDiamondDraftStore.getState().autoFillGame("no-such-game");

    const { games } = useDiamondDraftStore.getState();
    expect(games).toHaveLength(1);
    expect(games[0].id).toBe("real-game");
  });
});

// ─── createGame + setPlayerOverride flow ─────────────────────────────────────

describe("store — createGame + setPlayerOverride produces correct game state", () => {
  beforeEach(resetStore);

  it("createGame creates a game with empty playerOverrides", async () => {
    const players = makeRoster(3);
    useDiamondDraftStore.setState({ players });

    const game = await useDiamondDraftStore.getState().createGame({
      date: "2026-06-01",
      opponent: "Rivals",
      teamName: "Eagles",
      notes: "",
    });

    expect(game.playerOverrides).toHaveLength(0);
    expect(game.status).toBe("draft");
  });

  it("setPlayerOverride after createGame is reflected in game state", async () => {
    const players = makeRoster(3);
    useDiamondDraftStore.setState({ players });

    const game = await useDiamondDraftStore.getState().createGame({
      date: "2026-06-01",
      opponent: "Rivals",
      teamName: "Eagles",
      notes: "",
    });

    await useDiamondDraftStore.getState().setPlayerOverride(game.id, {
      playerId: players[0].id,
      status: "absent",
    });

    const updatedGame = useDiamondDraftStore.getState().games.find((g) => g.id === game.id)!;
    expect(updatedGame.playerOverrides).toHaveLength(1);
    expect(updatedGame.playerOverrides[0].playerId).toBe(players[0].id);
    expect(updatedGame.playerOverrides[0].status).toBe("absent");
  });
});

// ─── createGame attaches to active season ────────────────────────────────────

describe("store.createGame — attaches to active season", () => {
  beforeEach(resetStore);

  it("adds the new game ID to the active season's gameIds", async () => {
    const season = makeSeason("season-1", []);
    useDiamondDraftStore.setState({
      seasons: [season],
      settings: {
        ...DEFAULT_APP_SETTINGS,
        activeSeasonId: "season-1",
        leagueRules: { ...DEFAULT_LEAGUE_RULES },
      },
    });

    const game = await useDiamondDraftStore.getState().createGame({
      date: "2026-06-01",
      opponent: "Test",
      teamName: "Eagles",
      notes: "",
    });

    const updatedSeason = useDiamondDraftStore.getState().seasons.find((s) => s.id === "season-1")!;
    expect(updatedSeason.gameIds).toContain(game.id);
  });

  it("creates game without attaching to season when no active season", async () => {
    useDiamondDraftStore.setState({
      seasons: [],
      settings: { ...DEFAULT_APP_SETTINGS, activeSeasonId: null, leagueRules: { ...DEFAULT_LEAGUE_RULES } },
    });

    const game = await useDiamondDraftStore.getState().createGame({
      date: "2026-06-01",
      opponent: "Test",
      teamName: "Eagles",
      notes: "",
    });

    const { games } = useDiamondDraftStore.getState();
    expect(games.find((g) => g.id === game.id)).toBeTruthy();
  });
});
