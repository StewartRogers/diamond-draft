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
  it("creates the SQLite file inside DIAMOND_DRAFT_DATA_DIR", () => {
    db.getAllGames(); // force connection
    expect(fs.existsSync(path.join(tmpDir, "diamond-draft.sqlite3"))).toBe(true);
  });
});

describe("default roster seeding", () => {
  it("seeds 9 default players on first player read", () => {
    const players = db.getAllPlayers();
    expect(players).toHaveLength(9);
    for (const p of players) {
      expect(p.id).toBeTruthy();
      expect(p.eligiblePositions.length).toBeGreaterThan(0);
      expect(p.isGuest).toBe(false);
    }
  });

  it("does not re-seed once players exist", () => {
    const before = db.getAllPlayers();
    const again = db.getAllPlayers();
    expect(again).toHaveLength(before.length);
    expect(new Set(again.map((p) => p.id)).size).toBe(before.length);
  });

  it("does not re-seed after a player is added to a non-empty table", () => {
    const extra = makePlayer({ firstName: "Zed" });
    db.savePlayer(extra);
    expect(db.getAllPlayers()).toHaveLength(10);
  });
});

describe("players CRUD", () => {
  it("saves and retrieves a player by id, round-tripping all fields", () => {
    const player = makePlayer({
      firstName: "Round",
      lastInitial: "T",
      positionRatings: { P: 1, "1B": 2 },
      defenseRating: 3,
      pitchingLog: [{ gameId: "g-x", date: "2026-05-01", innings: 2 }],
      notes: "lefty",
    });
    db.savePlayer(player);
    expect(db.getPlayer(player.id)).toEqual(player);
  });

  it("save with an existing id replaces the player", () => {
    const player = makePlayer({ firstName: "Before" });
    db.savePlayer(player);
    db.savePlayer({ ...player, firstName: "After" });
    expect(db.getPlayer(player.id)?.firstName).toBe("After");
  });

  it("deletes a player", () => {
    const player = makePlayer();
    db.savePlayer(player);
    db.deletePlayer(player.id);
    expect(db.getPlayer(player.id)).toBeUndefined();
  });

  it("getPlayer returns undefined for an unknown id", () => {
    expect(db.getPlayer("nope")).toBeUndefined();
  });

  it("savePlayers writes a batch transactionally", () => {
    const batch = [makePlayer(), makePlayer(), makePlayer()];
    db.savePlayers(batch);
    for (const p of batch) expect(db.getPlayer(p.id)).toEqual(p);
  });
});

describe("games CRUD", () => {
  it("saves and retrieves a game with nested innings intact", () => {
    const game = makeGame("game-rt", {
      battingOrder: ["a", "b"],
      playerOverrides: [{ playerId: "a", status: "late", inning: 2 }],
    });
    db.saveGame(game);
    expect(db.getGame("game-rt")).toEqual(game);
  });

  it("getAllGames returns games ordered by date descending", () => {
    db.saveGame(makeGame("game-old", { date: "2026-04-01" }));
    db.saveGame(makeGame("game-new", { date: "2026-07-01" }));
    const dates = db.getAllGames().map((g) => g.date);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("deletes a game", () => {
    db.saveGame(makeGame("game-del"));
    db.deleteGame("game-del");
    expect(db.getGame("game-del")).toBeUndefined();
  });
});

describe("seasons CRUD", () => {
  it("saves, retrieves, and deletes a season", () => {
    const season = makeSeason("season-1", { gameIds: ["g1", "g2"] });
    db.saveSeason(season);
    expect(db.getSeason("season-1")).toEqual(season);
    expect(db.getAllSeasons().some((s) => s.id === "season-1")).toBe(true);
    db.deleteSeason("season-1");
    expect(db.getSeason("season-1")).toBeUndefined();
  });
});

describe("settings", () => {
  it("returns defaults when nothing is saved", () => {
    expect(db.getSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("round-trips saved settings", () => {
    const settings: AppSettings = {
      activeSeasonId: "season-x",
      teamName: "Tigers",
      leagueRules: { ...DEFAULT_LEAGUE_RULES, defaultInnings: 7 },
      onboardingComplete: true,
    };
    db.saveSettings(settings);
    expect(db.getSettings()).toEqual(settings);
  });
});

describe("clearAllData", () => {
  it("wipes all tables (players re-seed on next read)", () => {
    db.saveGame(makeGame("game-wipe"));
    db.saveSeason(makeSeason("season-wipe"));
    db.clearAllData();
    expect(db.getGame("game-wipe")).toBeUndefined();
    expect(db.getAllSeasons()).toHaveLength(0);
    expect(db.getSettings()).toEqual(DEFAULT_APP_SETTINGS);
    // Player table is empty, so the next read re-seeds the default roster.
    expect(db.getAllPlayers()).toHaveLength(9);
  });
});

describe("restoreBackup", () => {
  it("replaces all existing data with the backup contents", () => {
    db.saveGame(makeGame("game-pre"));
    const player = makePlayer({ firstName: "Backup" });
    const game = makeGame("game-bk");
    const season = makeSeason("season-bk");
    const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, teamName: "Restored" };

    db.restoreBackup({ players: [player], games: [game], seasons: [season], settings });

    expect(db.getGame("game-pre")).toBeUndefined();
    expect(db.getAllPlayers()).toEqual([player]);
    expect(db.getGame("game-bk")).toEqual(game);
    expect(db.getSeason("season-bk")).toEqual(season);
    expect(db.getSettings()).toEqual(settings);
  });

  it("skips malformed records instead of failing the restore", () => {
    const good = makePlayer({ firstName: "Good" });
    db.restoreBackup({
      players: [good, { bad: true } as unknown as Player, null as unknown as Player],
      games: [{ id: "no-date" } as unknown as Game],
      seasons: [{} as unknown as Season],
      settings: DEFAULT_APP_SETTINGS,
    });
    expect(db.getAllPlayers()).toEqual([good]);
    expect(db.getAllGames()).toHaveLength(0);
    expect(db.getAllSeasons()).toHaveLength(0);
  });

  it("restoring an empty backup leaves empty tables (then players re-seed)", () => {
    db.restoreBackup({ players: [], games: [], seasons: [], settings: DEFAULT_APP_SETTINGS });
    expect(db.getAllGames()).toHaveLength(0);
    expect(db.getAllSeasons()).toHaveLength(0);
    expect(db.getAllPlayers()).toHaveLength(9); // re-seeded
  });
});
