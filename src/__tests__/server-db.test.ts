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
    teamName: "Tigers",
    year: 2026,
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
  it("returns defaults when nothing is saved", async () => {
    expect(await db.getSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("round-trips saved settings", async () => {
    const settings: AppSettings = {
      activeSeasonId: "season-x",
      teamName: "Tigers",
      leagueRules: { ...DEFAULT_LEAGUE_RULES, defaultInnings: 7 },
      onboardingComplete: true,
    };
    await db.saveSettings(settings);
    expect(await db.getSettings()).toEqual(settings);
  });
});

describe("clearAllData", () => {
  it("wipes all tables (players re-seed on next read)", async () => {
    await db.saveGame(makeGame("game-wipe"));
    await db.saveSeason(makeSeason("season-wipe"));
    await db.clearAllData();
    expect(await db.getGame("game-wipe")).toBeUndefined();
    expect(await db.getAllSeasons()).toHaveLength(0);
    expect(await db.getSettings()).toEqual(DEFAULT_APP_SETTINGS);
    // Player table is empty, so the next read re-seeds the default roster.
    expect(await db.getAllPlayers()).toHaveLength(9);
  });
});

describe("restoreBackup", () => {
  it("replaces all existing data with the backup contents", async () => {
    await db.saveGame(makeGame("game-pre"));
    const player = makePlayer({ firstName: "Backup" });
    const game = makeGame("game-bk");
    const season = makeSeason("season-bk");
    const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, teamName: "Restored" };

    await db.restoreBackup({ players: [player], games: [game], seasons: [season], settings });

    expect(await db.getGame("game-pre")).toBeUndefined();
    expect(await db.getAllPlayers()).toEqual([player]);
    expect(await db.getGame("game-bk")).toEqual(game);
    expect(await db.getSeason("season-bk")).toEqual(season);
    expect(await db.getSettings()).toEqual(settings);
  });

  it("skips malformed records instead of failing the restore", async () => {
    const good = makePlayer({ firstName: "Good" });
    await db.restoreBackup({
      players: [good, { bad: true } as unknown as Player, null as unknown as Player],
      games: [{ id: "no-date" } as unknown as Game],
      seasons: [{} as unknown as Season],
      settings: DEFAULT_APP_SETTINGS,
    });
    expect(await db.getAllPlayers()).toEqual([good]);
    expect(await db.getAllGames()).toHaveLength(0);
    expect(await db.getAllSeasons()).toHaveLength(0);
  });

  it("restoring an empty backup leaves empty tables (then players re-seed)", async () => {
    await db.restoreBackup({ players: [], games: [], seasons: [], settings: DEFAULT_APP_SETTINGS });
    expect(await db.getAllGames()).toHaveLength(0);
    expect(await db.getAllSeasons()).toHaveLength(0);
    expect(await db.getAllPlayers()).toHaveLength(9); // re-seeded
  });
});
