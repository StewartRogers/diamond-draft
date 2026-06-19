import "server-only";

import type { Client } from "@libsql/client";
import type { AppSettings, Game, Player, Season } from "../types";
import { DEFAULT_APP_SETTINGS } from "../types";
import * as seasonLib from "../season";
import { getSharedClient, ensureWalMode } from "./connection";

const DEFAULT_ROSTER_SEED = [
  { firstName: "Aiden", lastInitial: "A", jerseyNumber: "1" },
  { firstName: "Brooks", lastInitial: "B", jerseyNumber: "2" },
  { firstName: "Carter", lastInitial: "C", jerseyNumber: "3" },
  { firstName: "Declan", lastInitial: "D", jerseyNumber: "4" },
  { firstName: "Eli", lastInitial: "E", jerseyNumber: "5" },
  { firstName: "Finn", lastInitial: "F", jerseyNumber: "6" },
  { firstName: "Gabe", lastInitial: "G", jerseyNumber: "7" },
  { firstName: "Hudson", lastInitial: "H", jerseyNumber: "8" },
  { firstName: "Ira", lastInitial: "I", jerseyNumber: "9" },
] as const;

const globalDataDb = globalThis as typeof globalThis & {
  __dd_data_db_initialized?: boolean;
  __dd_data_db_seeded?: boolean;
};

async function ensureSchema(): Promise<Client> {
  const db = getSharedClient("__dd_data_db");
  if (globalDataDb.__dd_data_db_initialized) return db;

  await ensureWalMode(db);
  await db.batch([
    `CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      data TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_games_date ON games(date)",
    `CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`,
  ], "write");

  globalDataDb.__dd_data_db_initialized = true;
  return db;
}

async function seedDefaultPlayersIfNeeded(): Promise<void> {
  if (globalDataDb.__dd_data_db_seeded) return;
  const db = await ensureSchema();
  const result = await db.execute("SELECT COUNT(*) as count FROM players");
  const count = Number(result.rows[0]?.count ?? 0);
  if (count > 0) {
    globalDataDb.__dd_data_db_seeded = true;
    return;
  }
  await savePlayers(
    DEFAULT_ROSTER_SEED.map((player) =>
      seasonLib.createPlayer({
        ...player,
        eligiblePositions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
        isGuest: false,
        pitchingLimitGame: 3,
        pitchingLimitSeason: 0,
      })
    )
  );
  globalDataDb.__dd_data_db_seeded = true;
}

export async function getAllPlayers(): Promise<Player[]> {
  await seedDefaultPlayersIfNeeded();
  const db = getSharedClient("__dd_data_db");
  const result = await db.execute("SELECT data FROM players");
  return result.rows.map((row) => JSON.parse(row.data as string) as Player);
}

export async function getPlayer(id: string): Promise<Player | undefined> {
  await seedDefaultPlayersIfNeeded();
  const db = getSharedClient("__dd_data_db");
  const result = await db.execute({ sql: "SELECT data FROM players WHERE id = ?", args: [id] });
  const row = result.rows[0];
  return row ? (JSON.parse(row.data as string) as Player) : undefined;
}

export async function savePlayer(player: Player): Promise<void> {
  const db = await ensureSchema();
  await db.execute({
    sql: "INSERT OR REPLACE INTO players (id, data) VALUES (?, ?)",
    args: [player.id, JSON.stringify(player)],
  });
}

export async function deletePlayer(id: string): Promise<void> {
  const db = await ensureSchema();
  await db.execute({ sql: "DELETE FROM players WHERE id = ?", args: [id] });
}

export async function savePlayers(players: Player[]): Promise<void> {
  const db = await ensureSchema();
  await db.batch(
    players.map((player) => ({
      sql: "INSERT OR REPLACE INTO players (id, data) VALUES (?, ?)",
      args: [player.id, JSON.stringify(player)],
    })),
    "write"
  );
}

export async function getAllGames(): Promise<Game[]> {
  const db = await ensureSchema();
  const result = await db.execute("SELECT data FROM games ORDER BY date DESC");
  return result.rows.map((row) => JSON.parse(row.data as string) as Game);
}

export async function getGame(id: string): Promise<Game | undefined> {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT data FROM games WHERE id = ?", args: [id] });
  const row = result.rows[0];
  return row ? (JSON.parse(row.data as string) as Game) : undefined;
}

export async function saveGame(game: Game): Promise<void> {
  const db = await ensureSchema();
  await db.execute({
    sql: "INSERT OR REPLACE INTO games (id, date, data) VALUES (?, ?, ?)",
    args: [game.id, game.date, JSON.stringify(game)],
  });
}

export async function deleteGame(id: string): Promise<void> {
  const db = await ensureSchema();
  await db.execute({ sql: "DELETE FROM games WHERE id = ?", args: [id] });
}

export async function getAllSeasons(): Promise<Season[]> {
  const db = await ensureSchema();
  const result = await db.execute("SELECT data FROM seasons");
  return result.rows.map((row) => JSON.parse(row.data as string) as Season);
}

export async function getSeason(id: string): Promise<Season | undefined> {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT data FROM seasons WHERE id = ?", args: [id] });
  const row = result.rows[0];
  return row ? (JSON.parse(row.data as string) as Season) : undefined;
}

export async function saveSeason(season: Season): Promise<void> {
  const db = await ensureSchema();
  await db.execute({
    sql: "INSERT OR REPLACE INTO seasons (id, data) VALUES (?, ?)",
    args: [season.id, JSON.stringify(season)],
  });
}

export async function deleteSeason(id: string): Promise<void> {
  const db = await ensureSchema();
  await db.execute({ sql: "DELETE FROM seasons WHERE id = ?", args: [id] });
}

const SETTINGS_KEY = "app-settings";

export async function getSettings(): Promise<AppSettings> {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT data FROM settings WHERE id = ?", args: [SETTINGS_KEY] });
  const row = result.rows[0];
  return row ? (JSON.parse(row.data as string) as AppSettings) : { ...DEFAULT_APP_SETTINGS };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await ensureSchema();
  await db.execute({
    sql: "INSERT OR REPLACE INTO settings (id, data) VALUES (?, ?)",
    args: [SETTINGS_KEY, JSON.stringify(settings)],
  });
}

export async function clearAllData(): Promise<void> {
  const db = await ensureSchema();
  await db.batch([
    "DELETE FROM players",
    "DELETE FROM games",
    "DELETE FROM seasons",
    "DELETE FROM settings",
  ], "write");
  globalDataDb.__dd_data_db_seeded = false;
}

export async function restoreBackup(backup: {
  players: Player[];
  games: Game[];
  seasons: Season[];
  settings: AppSettings;
}): Promise<void> {
  const db = await ensureSchema();
  const statements: { sql: string; args: (string | number)[] }[] = [
    { sql: "DELETE FROM players", args: [] },
    { sql: "DELETE FROM games", args: [] },
    { sql: "DELETE FROM seasons", args: [] },
    { sql: "DELETE FROM settings", args: [] },
  ];

  for (const player of backup.players) {
    if (player?.id && typeof player.id === "string") {
      statements.push({
        sql: "INSERT OR REPLACE INTO players (id, data) VALUES (?, ?)",
        args: [player.id, JSON.stringify(player)],
      });
    }
  }
  for (const game of backup.games) {
    if (game?.id && typeof game.id === "string" && game.date) {
      statements.push({
        sql: "INSERT OR REPLACE INTO games (id, date, data) VALUES (?, ?, ?)",
        args: [game.id, game.date, JSON.stringify(game)],
      });
    }
  }
  for (const season of backup.seasons) {
    if (season?.id && typeof season.id === "string") {
      statements.push({
        sql: "INSERT OR REPLACE INTO seasons (id, data) VALUES (?, ?)",
        args: [season.id, JSON.stringify(season)],
      });
    }
  }
  if (backup.settings && typeof backup.settings === "object") {
    statements.push({
      sql: "INSERT OR REPLACE INTO settings (id, data) VALUES (?, ?)",
      args: [SETTINGS_KEY, JSON.stringify(backup.settings)],
    });
  }

  await db.batch(statements, "write");
  globalDataDb.__dd_data_db_seeded = false;
}
