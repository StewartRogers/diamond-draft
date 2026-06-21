/**
 * Tests for the multi-team store actions and selectors in src/lib/store.ts.
 *
 * Same strategy as store.test.ts: mock @/lib/api so no HTTP happens, then drive
 * the Zustand store directly via getState()/setState().
 *
 * Covers:
 *   - createTeam / updateTeam / deleteTeam (cascades seasons, clears active ids)
 *   - setActiveTeam (defaults the active season) / setActiveSeason (syncs team)
 *   - addPlayerToSeasonRoster (dedupe) / removePlayerFromSeasonRoster
 *   - removePlayer strips the player from every season roster
 *   - createGame snapshots ONLY the active season's roster
 *   - selectActiveTeam / selectSeasonsByActiveTeam / selectRosterPlayers /
 *     selectGamesByActiveSeason
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  loadAll: vi.fn().mockResolvedValue({ players: [], games: [], teams: [], seasons: [], settings: {} }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  createGame: vi.fn().mockResolvedValue(undefined),
  saveGame: vi.fn().mockResolvedValue(undefined),
  deleteGame: vi.fn().mockResolvedValue(undefined),
  createTeam: vi.fn().mockResolvedValue(undefined),
  saveTeam: vi.fn().mockResolvedValue(undefined),
  deleteTeam: vi.fn().mockResolvedValue(undefined),
  saveSeason: vi.fn().mockResolvedValue(undefined),
  createSeason: vi.fn().mockResolvedValue(undefined),
  deleteSeason: vi.fn().mockResolvedValue(undefined),
  createPlayer: vi.fn().mockResolvedValue(undefined),
  savePlayer: vi.fn().mockResolvedValue(undefined),
  deletePlayer: vi.fn().mockResolvedValue(undefined),
  savePlayers: vi.fn().mockResolvedValue(undefined),
  exportAllData: vi.fn().mockResolvedValue({ players: [], games: [], teams: [], seasons: [], settings: {}, version: 2, exportedAt: "" }),
  importAll: vi.fn().mockResolvedValue(undefined),
  clearAll: vi.fn().mockResolvedValue(undefined),
}));

import {
  useDiamondDraftStore,
  selectActiveTeam,
  selectActiveSeason,
  selectSeasonsByActiveTeam,
  selectRosterPlayers,
  selectGamesByActiveSeason,
} from "@/lib/store";
import type { Game, Season, Team } from "@/lib/types";
import { DEFAULT_APP_SETTINGS, DEFAULT_LEAGUE_RULES } from "@/lib/types";
import { createEmptyInning } from "@/lib/lineup";
import { makePlayer } from "./helpers";

function makeTeam(id: string, name = "Owls"): Team {
  return { id, name, createdAt: "2026-01-01T00:00:00.000Z" };
}

function makeSeason(id: string, teamId: string, overrides: Partial<Season> = {}): Season {
  return {
    id,
    name: "Spring",
    teamId,
    teamName: "Owls",
    year: 2026,
    roster: [],
    gameIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeGame(id: string, overrides: Partial<Game> = {}): Game {
  return {
    id,
    date: "2026-06-01",
    pitchCatchAssignments: [],
    innings: [createEmptyInning(1)],
    battingOrder: [],
    playerOverrides: [],
    rosterSnapshot: [],
    status: "draft",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function resetStore() {
  useDiamondDraftStore.setState({
    status: "ready",
    players: [],
    games: [],
    teams: [],
    seasons: [],
    settings: { ...DEFAULT_APP_SETTINGS, leagueRules: { ...DEFAULT_LEAGUE_RULES } },
    activeGameId: null,
    violations: [],
  });
}

const store = () => useDiamondDraftStore.getState();

// ─── Teams ──────────────────────────────────────────────────────────────────

describe("store team actions", () => {
  beforeEach(resetStore);

  it("createTeam adds the team to state and returns it", async () => {
    const team = await store().createTeam({ name: "Hawks", headCoach: "Sam" });
    expect(team.id).toBeTruthy();
    expect(store().teams).toHaveLength(1);
    expect(store().teams[0].name).toBe("Hawks");
    expect(store().teams[0].headCoach).toBe("Sam");
  });

  it("updateTeam renames an existing team", async () => {
    useDiamondDraftStore.setState({ teams: [makeTeam("t1", "Owls")] });
    await store().updateTeam("t1", { name: "Eagles" });
    expect(store().teams[0].name).toBe("Eagles");
  });

  it("deleteTeam removes the team, its seasons, and clears active context", async () => {
    useDiamondDraftStore.setState({
      teams: [makeTeam("t1"), makeTeam("t2", "Other")],
      seasons: [makeSeason("s1", "t1"), makeSeason("s2", "t1"), makeSeason("s3", "t2")],
      settings: { ...DEFAULT_APP_SETTINGS, activeTeamId: "t1", activeSeasonId: "s1" },
    });

    await store().deleteTeam("t1");

    expect(store().teams.map((t) => t.id)).toEqual(["t2"]);
    expect(store().seasons.map((s) => s.id)).toEqual(["s3"]); // t1's seasons gone
    expect(store().settings.activeTeamId).toBeNull();
    expect(store().settings.activeSeasonId).toBeNull();
  });

  it("deleteTeam also deletes its seasons' games (no orphans)", async () => {
    useDiamondDraftStore.setState({
      teams: [makeTeam("t1"), makeTeam("t2", "Other")],
      seasons: [makeSeason("s1", "t1", { gameIds: ["g1"] }), makeSeason("s2", "t2", { gameIds: ["g2"] })],
      games: [makeGame("g1"), makeGame("g2")],
      settings: { ...DEFAULT_APP_SETTINGS, activeTeamId: "t1", activeSeasonId: "s1" },
    });

    await store().deleteTeam("t1");

    expect(store().seasons.map((s) => s.id)).toEqual(["s2"]);
    expect(store().games.map((g) => g.id)).toEqual(["g2"]); // g1 removed with its season
  });

  it("setActiveTeam switches team and defaults the active season to its first", async () => {
    useDiamondDraftStore.setState({
      teams: [makeTeam("t1"), makeTeam("t2", "Other")],
      seasons: [makeSeason("s1", "t1"), makeSeason("s2", "t2")],
      settings: { ...DEFAULT_APP_SETTINGS, activeTeamId: "t1", activeSeasonId: "s1" },
    });

    await store().setActiveTeam("t2");

    expect(store().settings.activeTeamId).toBe("t2");
    expect(store().settings.activeSeasonId).toBe("s2");
  });

  it("setActiveTeam sets a null season when the team has none", async () => {
    useDiamondDraftStore.setState({
      teams: [makeTeam("t1"), makeTeam("t2", "Other")],
      seasons: [makeSeason("s1", "t1")],
      settings: { ...DEFAULT_APP_SETTINGS, activeTeamId: "t1", activeSeasonId: "s1" },
    });

    await store().setActiveTeam("t2");

    expect(store().settings.activeTeamId).toBe("t2");
    expect(store().settings.activeSeasonId).toBeNull();
  });

  it("setActiveSeason syncs the active team to the season's team", async () => {
    useDiamondDraftStore.setState({
      teams: [makeTeam("t1"), makeTeam("t2", "Other")],
      seasons: [makeSeason("s1", "t1"), makeSeason("s2", "t2")],
      settings: { ...DEFAULT_APP_SETTINGS, activeTeamId: "t1", activeSeasonId: "s1" },
    });

    await store().setActiveSeason("s2");

    expect(store().settings.activeSeasonId).toBe("s2");
    expect(store().settings.activeTeamId).toBe("t2");
  });
});

// ─── Season roster ────────────────────────────────────────────────────────────

describe("store season-roster actions", () => {
  beforeEach(resetStore);

  it("addPlayerToSeasonRoster adds a player", async () => {
    useDiamondDraftStore.setState({ seasons: [makeSeason("s1", "t1", { roster: ["a"] })] });
    await store().addPlayerToSeasonRoster("s1", "b");
    expect(store().seasons[0].roster).toEqual(["a", "b"]);
  });

  it("addPlayerToSeasonRoster is a no-op for a duplicate (unique per team-season)", async () => {
    useDiamondDraftStore.setState({ seasons: [makeSeason("s1", "t1", { roster: ["a", "b"] })] });
    await store().addPlayerToSeasonRoster("s1", "a");
    expect(store().seasons[0].roster).toEqual(["a", "b"]);
  });

  it("removePlayerFromSeasonRoster removes a player", async () => {
    useDiamondDraftStore.setState({ seasons: [makeSeason("s1", "t1", { roster: ["a", "b", "c"] })] });
    await store().removePlayerFromSeasonRoster("s1", "b");
    expect(store().seasons[0].roster).toEqual(["a", "c"]);
  });

  it("updateSeason renames a season and updates its year", async () => {
    useDiamondDraftStore.setState({
      seasons: [makeSeason("s1", "t1", { name: "Spring", year: 2026, roster: ["a"], gameIds: ["g1"] })],
    });
    await store().updateSeason("s1", { name: "Summer", year: 2027 });
    const season = store().seasons[0];
    expect(season.name).toBe("Summer");
    expect(season.year).toBe(2027);
    // Unrelated fields are preserved.
    expect(season.roster).toEqual(["a"]);
    expect(season.gameIds).toEqual(["g1"]);
  });

  it("deleteSeason also deletes the season's games", async () => {
    useDiamondDraftStore.setState({
      seasons: [makeSeason("s1", "t1", { gameIds: ["g1", "g2"] })],
      games: [makeGame("g1"), makeGame("g2"), makeGame("g3")],
      settings: { ...DEFAULT_APP_SETTINGS, activeSeasonId: "s1" },
    });

    await store().deleteSeason("s1");

    expect(store().seasons).toHaveLength(0);
    expect(store().games.map((g) => g.id)).toEqual(["g3"]); // g1, g2 removed
    expect(store().settings.activeSeasonId).toBeNull();
  });

  it("setDepthChartPosition persists an ordered list for a position", async () => {
    useDiamondDraftStore.setState({ seasons: [makeSeason("s1", "t1", { roster: ["a", "b"] })] });
    await store().setDepthChartPosition("s1", "SS", ["b", "a"]);
    expect(store().seasons[0].depthChart?.SS).toEqual(["b", "a"]);
  });

  it("removePlayerFromSeasonRoster also prunes the depth chart", async () => {
    useDiamondDraftStore.setState({
      seasons: [makeSeason("s1", "t1", { roster: ["a", "b"], depthChart: { SS: ["a", "b"], "2B": ["a"] } })],
    });
    await store().removePlayerFromSeasonRoster("s1", "a");
    const s = store().seasons[0];
    expect(s.roster).toEqual(["b"]);
    expect(s.depthChart?.SS).toEqual(["b"]);
    expect(s.depthChart?.["2B"]).toEqual([]);
  });

  it("removePlayer (global) strips the player from every season roster", async () => {
    const p = makePlayer({ id: "p-del" });
    useDiamondDraftStore.setState({
      players: [p, makePlayer({ id: "p-keep" })],
      seasons: [
        makeSeason("s1", "t1", { roster: ["p-del", "p-keep"] }),
        makeSeason("s2", "t1", { roster: ["p-keep"] }),
        makeSeason("s3", "t2", { roster: ["p-del"] }),
      ],
    });

    await store().removePlayer("p-del");

    expect(store().players.map((p) => p.id)).toEqual(["p-keep"]);
    expect(store().seasons.find((s) => s.id === "s1")!.roster).toEqual(["p-keep"]);
    expect(store().seasons.find((s) => s.id === "s2")!.roster).toEqual(["p-keep"]);
    expect(store().seasons.find((s) => s.id === "s3")!.roster).toEqual([]);
  });

  it("removePlayer also prunes the player from every season's depth chart", async () => {
    const p = makePlayer({ id: "p-del" });
    useDiamondDraftStore.setState({
      players: [p, makePlayer({ id: "p-keep" })],
      seasons: [
        makeSeason("s1", "t1", { roster: ["p-del", "p-keep"], depthChart: { SS: ["p-del", "p-keep"] } }),
        // p-del is only on the depth chart here, not the roster — still pruned.
        makeSeason("s2", "t2", { roster: ["p-keep"], depthChart: { CF: ["p-del"] } }),
      ],
    });

    await store().removePlayer("p-del");

    expect(store().seasons.find((s) => s.id === "s1")!.depthChart?.SS).toEqual(["p-keep"]);
    expect(store().seasons.find((s) => s.id === "s2")!.depthChart?.CF).toEqual([]);
  });
});

// ─── createGame snapshots the season roster ────────────────────────────────────

describe("store.createGame with a season roster", () => {
  beforeEach(resetStore);

  it("snapshots only the active season's roster, in jersey order, and attaches the game", async () => {
    const p1 = makePlayer({ id: "p1", jerseyNumber: "1" });
    const p2 = makePlayer({ id: "p2", jerseyNumber: "2" });
    const p3 = makePlayer({ id: "p3", jerseyNumber: "3" });
    useDiamondDraftStore.setState({
      players: [p1, p2, p3],
      teams: [makeTeam("t1")],
      seasons: [makeSeason("s1", "t1", { roster: ["p1", "p3"] })],
      settings: { ...DEFAULT_APP_SETTINGS, activeTeamId: "t1", activeSeasonId: "s1" },
    });

    const game = await store().createGame({ date: "2026-06-10", opponent: "Rockets", teamName: "", notes: "" });

    // Roster snapshot is constrained to the season roster (p2 excluded).
    expect(game.rosterSnapshot.map((p) => p.id).sort()).toEqual(["p1", "p3"]);
    expect(game.battingOrder).toEqual(["p1", "p3"]);

    // The game is attached to the active season.
    const season = store().seasons.find((s) => s.id === "s1")!;
    expect(season.gameIds).toContain(game.id);
    expect(store().games.map((g) => g.id)).toContain(game.id);
  });
});

// ─── Selectors ────────────────────────────────────────────────────────────────

describe("multi-team selectors", () => {
  beforeEach(resetStore);

  it("selectActiveTeam / selectSeasonsByActiveTeam scope to the active team", () => {
    useDiamondDraftStore.setState({
      teams: [makeTeam("t1", "Owls"), makeTeam("t2", "Hawks")],
      seasons: [makeSeason("s1", "t1"), makeSeason("s2", "t1"), makeSeason("s3", "t2")],
      settings: { ...DEFAULT_APP_SETTINGS, activeTeamId: "t1", activeSeasonId: "s1" },
    });

    expect(selectActiveTeam(store())!.name).toBe("Owls");
    expect(selectSeasonsByActiveTeam(store()).map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("selectRosterPlayers resolves the active season roster in order", () => {
    const p1 = makePlayer({ id: "p1" });
    const p2 = makePlayer({ id: "p2" });
    const p3 = makePlayer({ id: "p3" });
    useDiamondDraftStore.setState({
      players: [p1, p2, p3],
      teams: [makeTeam("t1")],
      seasons: [makeSeason("s1", "t1", { roster: ["p3", "p1"] })],
      settings: { ...DEFAULT_APP_SETTINGS, activeTeamId: "t1", activeSeasonId: "s1" },
    });

    expect(selectRosterPlayers(store()).map((p) => p.id)).toEqual(["p3", "p1"]);
  });

  it("selectActiveSeason / selectGamesByActiveSeason filter games by the season's gameIds", () => {
    useDiamondDraftStore.setState({
      teams: [makeTeam("t1")],
      seasons: [makeSeason("s1", "t1", { gameIds: ["g1", "g3"] })],
      games: [makeGame("g1"), makeGame("g2"), makeGame("g3")],
      settings: { ...DEFAULT_APP_SETTINGS, activeTeamId: "t1", activeSeasonId: "s1" },
    });

    expect(selectActiveSeason(store())!.id).toBe("s1");
    expect(selectGamesByActiveSeason(store()).map((g) => g.id)).toEqual(["g1", "g3"]);
  });
});
