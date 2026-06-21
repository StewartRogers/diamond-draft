/**
 * Integration tests for src/lib/server/db.ts against a real SQLite database
 * in a temporary directory (DIAMOND_DRAFT_DATA_DIR).
 *
 * The db module holds a singleton connection, so all tests share one
 * database file. Each describe block uses distinct IDs and clearAllData()
 * where isolation matters.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { AppSettings, Game, Player, Season } from "@/lib/types";
import { DEFAULT_APP_SETTINGS, DEFAULT_LEAGUE_RULES } from "@/lib/types";
import { makePlayer, makeInnings, resetPlayerSeq } from "./helpers";

let tmpDir: string;
let db: typeof import("@/lib/server/db");

beforeAll(async () => {
  resetPlayerSeq();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diamond-draft-test-"));
  process.env.DIAMOND_DRAFT_DATA_DIR = tmpDir;
  db = await import("@/lib/server/db");
});

afterAll(() => {
  delete process.env.DIAMOND_DRAFT_DATA_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGame(id: string, overrides: Partial<Game> = {}): Game {
  return {
    id,
    date: "2026-06-01",
    pitchCatchAssignments: [],
    innings: makeInnings(2),
    battingOrder: [],
    playerOverrides: [],
    rosterSnapshot: [],
    status: "draft",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSeason(id: string, overrides: Partial<Season> = {}): Season {
  return {
    id,
    name: "Spring",
    teamId: "team-1",
    teamName: "Tigers",
    year: 2026,
    roster: [],
    gameIds: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("database file", () => {
  it("creates the SQLite file inside DIAMOND_DRAFT_DATA_DIR", async () => {
    await db.getAllGames(); // force connection
    expect(fs.existsSync(path.join(tmpDir, "diamond-draft.sqlite3"))).toBe(true);
  });
});

describe("default roster seeding", () => {
  it("seeds 9 default players on first player read", async () => {
    const players = await db.getAllPlayers();
    expect(players).toHaveLength(9);
    for (const p of players) {
      expect(p.id).toBeTruthy();
      expect(p.eligiblePositions.length).toBeGreaterThan(0);
      expect(p.isGuest).toBe(false);
    }
  });

  it("does not re-seed once players exist", async () => {
    const before = await db.getAllPlayers();
    const again = await db.getAllPlayers();
    expect(again).toHaveLength(before.length);
    expect(new Set(again.map((p) => p.id)).size).toBe(before.length);
  });

  it("does not re-seed after a player is added to a non-empty table", async () => {
    const extra = makePlayer({ firstName: "Zed" });
    await db.savePlayer(extra);
    expect(await db.getAllPlayers()).toHaveLength(10);
  });
});

describe("players CRUD", () => {
  it("saves and retrieves a player by id, round-tripping all fields", async () => {
    const player = makePlayer({
      firstName: "Round",
      lastInitial: "T",
      positionRatings: { P: 1, "1B": 2 },
      defenseRating: 3,
      pitchingLog: [{ gameId: "g-x", date: "2026-05-01", innings: 2 }],
      notes: "lefty",
    });
    await db.savePlayer(player);
    expect(await db.getPlayer(player.id)).toEqual(player);
  });

  it("save with an existing id replaces the player", async () => {
    const player = makePlayer({ firstName: "Before" });
    await db.savePlayer(player);
    await db.savePlayer({ ...player, firstName: "After" });
    expect((await db.getPlayer(player.id))?.firstName).toBe("After");
  });

  it("deletes a player", async () => {
    const player = makePlayer();
    await db.savePlayer(player);
    await db.deletePlayer(player.id);
    expect(await db.getPlayer(player.id)).toBeUndefined();
  });

  it("getPlayer returns undefined for an unknown id", async () => {
    expect(await db.getPlayer("nope")).toBeUndefined();
  });

  it("savePlayers writes a batch transactionally", async () => {
    const batch = [makePlayer(), makePlayer(), makePlayer()];
    await db.savePlayers(batch);
    for (const p of batch) expect(await db.getPlayer(p.id)).toEqual(p);
  });
});

describe("games CRUD", () => {
  it("saves and retrieves a game with nested innings intact", async () => {
    const game = makeGame("game-rt", {
      battingOrder: ["a", "b"],
      playerOverrides: [{ playerId: "a", status: "late", inning: 2 }],
    });
    await db.saveGame(game);
    expect(await db.getGame("game-rt")).toEqual(game);
  });

  it("getAllGames returns games ordered by date descending", async () => {
    await db.saveGame(makeGame("game-old", { date: "2026-04-01" }));
    await db.saveGame(makeGame("game-new", { date: "2026-07-01" }));
    const dates = (await db.getAllGames()).map((g) => g.date);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("deletes a game", async () => {
    await db.saveGame(makeGame("game-del"));
    await db.deleteGame("game-del");
    expect(await db.getGame("game-del")).toBeUndefined();
  });
});

describe("seasons CRUD", () => {
  it("saves, retrieves, and deletes a season", async () => {
    const season = makeSeason("season-1", { gameIds: ["g1", "g2"] });
    await db.saveSeason(season);
    expect(await db.getSeason("season-1")).toEqual(season);
    expect((await db.getAllSeasons()).some((s) => s.id === "season-1")).toBe(true);
    await db.deleteSeason("season-1");
    expect(await db.getSeason("season-1")).toBeUndefined();
  });
});

describe("settings", () => {
  it("seeds an active team + season context via migration", async () => {
    // ensureData() has run (default roster seeding above), so migration has
    // created a default team + season and pointed settings at them.
    const settings = await db.getSettings();
    expect(settings.activeTeamId).toBeTruthy();
    expect(settings.activeSeasonId).toBeTruthy();
    expect(settings.leagueRules).toEqual(DEFAULT_APP_SETTINGS.leagueRules);
  });

  it("round-trips saved settings", async () => {
    const settings: AppSettings = {
      activeTeamId: "team-x",
      activeSeasonId: "season-x",
      teamName: "Tigers",
      leagueRules: { ...DEFAULT_LEAGUE_RULES, defaultInnings: 7 },
      onboardingComplete: true,
    };
    await db.saveSettings(settings);
    expect(await db.getSettings()).toEqual(settings);
  });
});

describe("teams CRUD", () => {
  it("saves, retrieves, and deletes a team", async () => {
    const team = { id: "team-rt", name: "Owls", createdAt: "2026-01-01T00:00:00.000Z" };
    await db.saveTeam(team);
    expect(await db.getTeam("team-rt")).toEqual(team);
    expect((await db.getAllTeams()).some((t) => t.id === "team-rt")).toBe(true);
    await db.deleteTeam("team-rt");
    expect(await db.getTeam("team-rt")).toBeUndefined();
  });
});

describe("clearAllData + multi-team migration", () => {
  it("wipes all tables and re-seeds a fresh team + season context", async () => {
    await db.saveGame(makeGame("game-wipe"));
    await db.clearAllData();
    expect(await db.getGame("game-wipe")).toBeUndefined();

    // The next read re-seeds the default roster and migrates into exactly one
    // team and one season pointed to by settings.
    const players = await db.getAllPlayers();
    const teams = await db.getAllTeams();
    const seasons = await db.getAllSeasons();
    const settings = await db.getSettings();

    expect(players).toHaveLength(9);
    expect(teams).toHaveLength(1);
    expect(seasons).toHaveLength(1);
    expect(settings.activeTeamId).toBe(teams[0].id);
    expect(settings.activeSeasonId).toBe(seasons[0].id);
    expect(seasons[0].teamId).toBe(teams[0].id);

    // The migrated season roster holds every seeded player exactly once.
    expect(seasons[0].roster).toHaveLength(players.length);
    expect(new Set(seasons[0].roster)).toEqual(new Set(players.map((p) => p.id)));
  });
});

describe("restoreBackup", () => {
  it("replaces all existing data with the backup contents (v2 backup with teams)", async () => {
    await db.saveGame(makeGame("game-pre"));
    const player = makePlayer({ firstName: "Backup" });
    const game = makeGame("game-bk");
    const team = { id: "team-bk", name: "Restored", createdAt: "2026-01-01T00:00:00.000Z" };
    const season = makeSeason("season-bk", { teamId: "team-bk", roster: [player.id] });
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      activeTeamId: "team-bk",
      activeSeasonId: "season-bk",
      teamName: "Restored",
    };

    // Backup already contains a team, so migration is a no-op and data
    // round-trips exactly.
    await db.restoreBackup({ players: [player], games: [game], teams: [team], seasons: [season], settings });

    expect(await db.getGame("game-pre")).toBeUndefined();
    expect(await db.getAllPlayers()).toEqual([player]);
    expect(await db.getGame("game-bk")).toEqual(game);
    expect(await db.getAllTeams()).toEqual([team]);
    expect(await db.getSeason("season-bk")).toEqual(season);
    expect(await db.getSettings()).toEqual(settings);
  });

  it("skips malformed records, then migrates a fresh context (v1 backup, no teams)", async () => {
    const good = makePlayer({ firstName: "Good" });
    await db.restoreBackup({
      players: [good, { bad: true } as unknown as Player, null as unknown as Player],
      games: [{ id: "no-date" } as unknown as Game],
      seasons: [{} as unknown as Season],
      settings: DEFAULT_APP_SETTINGS,
    });
    expect(await db.getAllPlayers()).toEqual([good]);
    expect(await db.getAllGames()).toHaveLength(0);
    // No team in the (v1) backup → migration creates one team + one season.
    expect(await db.getAllTeams()).toHaveLength(1);
    expect(await db.getAllSeasons()).toHaveLength(1);
  });

  it("restoring an empty backup re-seeds and migrates a fresh context", async () => {
    await db.restoreBackup({ players: [], games: [], seasons: [], settings: DEFAULT_APP_SETTINGS });
    expect(await db.getAllGames()).toHaveLength(0);
    expect(await db.getAllPlayers()).toHaveLength(9); // re-seeded
    expect(await db.getAllTeams()).toHaveLength(1);
    expect(await db.getAllSeasons()).toHaveLength(1);
  });
});

describe("migration of pre-existing seasons (upgrade path)", () => {
  it("links rosterless seasons to a team and back-fills only empty rosters", async () => {
    // clearAllData resets the migration flag. savePlayers/saveSeason write via
    // ensureSchema only (no migration), so we can stage pre-migration data.
    await db.clearAllData();
    const p1 = makePlayer({ firstName: "One" });
    const p2 = makePlayer({ firstName: "Two" });
    await db.savePlayers([p1, p2]);
    // teamId "" simulates v1 data with no team link. One season has no roster,
    // the other already has one.
    await db.saveSeason(makeSeason("s-empty", { teamId: "", roster: [] }));
    await db.saveSeason(makeSeason("s-filled", { teamId: "", roster: [p1.id] }));

    // First ensureData() read triggers the migration over the staged seasons.
    const seasons = await db.getAllSeasons();
    const teams = await db.getAllTeams();
    const settings = await db.getSettings();

    expect(teams).toHaveLength(1);
    const sEmpty = seasons.find((s) => s.id === "s-empty")!;
    const sFilled = seasons.find((s) => s.id === "s-filled")!;
    // Both seasons now belong to the single migrated team.
    expect(sEmpty.teamId).toBe(teams[0].id);
    expect(sFilled.teamId).toBe(teams[0].id);
    // The empty roster is back-filled with the full player list...
    expect(new Set(sEmpty.roster)).toEqual(new Set([p1.id, p2.id]));
    // ...while an existing roster is left untouched.
    expect(sFilled.roster).toEqual([p1.id]);
    expect(settings.activeTeamId).toBe(teams[0].id);
    expect(settings.activeSeasonId).toBeTruthy();
  });
});
