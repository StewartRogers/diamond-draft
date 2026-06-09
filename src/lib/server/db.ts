import "server-only";

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { AppSettings, Game, Player, Season } from "../types";
import { DEFAULT_APP_SETTINGS } from "../types";
import * as seasonLib from "../season";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "diamond-draft.sqlite3");
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

let db: InstanceType<typeof Database> | null = null;

function getDb() {
  if (db) return db;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
  `);
  return db;
}

function rowTo<T>(row: { data: string } | undefined): T | undefined {
  return row ? (JSON.parse(row.data) as T) : undefined;
}

function seedDefaultPlayersIfNeeded(): void {
  const count = getDb().prepare("SELECT COUNT(*) as count FROM players").get() as
    | { count: number }
    | undefined;
  if ((count?.count ?? 0) > 0) return;
  savePlayers(
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
}

export function getAllPlayers(): Player[] {
  seedDefaultPlayersIfNeeded();
  return getDb()
    .prepare("SELECT data FROM players")
    .all()
    .map((row: { data: string }) => JSON.parse(row.data) as Player);
}

export function getPlayer(id: string): Player | undefined {
  seedDefaultPlayersIfNeeded();
  return rowTo<Player>(getDb().prepare("SELECT data FROM players WHERE id = ?").get(id));
}

export function savePlayer(player: Player): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO players (id, data) VALUES (?, ?)")
    .run(player.id, JSON.stringify(player));
}

export function deletePlayer(id: string): void {
  getDb().prepare("DELETE FROM players WHERE id = ?").run(id);
}

export function savePlayers(players: Player[]): void {
  const stmt = getDb().prepare("INSERT OR REPLACE INTO players (id, data) VALUES (?, ?)");
  const tx = getDb().transaction((rows: Player[]) => {
    for (const player of rows) stmt.run(player.id, JSON.stringify(player));
  });
  tx(players);
}

export function getAllGames(): Game[] {
  return getDb()
    .prepare("SELECT data FROM games ORDER BY date DESC")
    .all()
    .map((row: { data: string }) => JSON.parse(row.data) as Game);
}

export function getGame(id: string): Game | undefined {
  return rowTo<Game>(getDb().prepare("SELECT data FROM games WHERE id = ?").get(id));
}

export function saveGame(game: Game): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO games (id, date, data) VALUES (?, ?, ?)")
    .run(game.id, game.date, JSON.stringify(game));
}

export function deleteGame(id: string): void {
  getDb().prepare("DELETE FROM games WHERE id = ?").run(id);
}

export function getAllSeasons(): Season[] {
  return getDb()
    .prepare("SELECT data FROM seasons")
    .all()
    .map((row: { data: string }) => JSON.parse(row.data) as Season);
}

export function getSeason(id: string): Season | undefined {
  return rowTo<Season>(getDb().prepare("SELECT data FROM seasons WHERE id = ?").get(id));
}

export function saveSeason(season: Season): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO seasons (id, data) VALUES (?, ?)")
    .run(season.id, JSON.stringify(season));
}

export function deleteSeason(id: string): void {
  getDb().prepare("DELETE FROM seasons WHERE id = ?").run(id);
}

const SETTINGS_KEY = "app-settings";

export function getSettings(): AppSettings {
  const row = getDb()
    .prepare("SELECT data FROM settings WHERE id = ?")
    .get(SETTINGS_KEY) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as AppSettings) : { ...DEFAULT_APP_SETTINGS };
}

export function saveSettings(settings: AppSettings): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (id, data) VALUES (?, ?)")
    .run(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearAllData(): void {
  const database = getDb();
  database.exec("DELETE FROM players; DELETE FROM games; DELETE FROM seasons; DELETE FROM settings;");
}

/**
 * Atomically replace all data with a backup.
 * The wipe and all writes happen inside a single SQLite transaction so a
 * mid-restore failure never leaves the database in a partially-empty state.
 */
export function restoreBackup(backup: {
  players: Player[];
  games: Game[];
  seasons: Season[];
  settings: AppSettings;
}): void {
  const database = getDb();
  const stmtPlayer = database.prepare("INSERT OR REPLACE INTO players (id, data) VALUES (?, ?)");
  const stmtGame = database.prepare("INSERT OR REPLACE INTO games (id, date, data) VALUES (?, ?, ?)");
  const stmtSeason = database.prepare("INSERT OR REPLACE INTO seasons (id, data) VALUES (?, ?)");
  const stmtSettings = database.prepare("INSERT OR REPLACE INTO settings (id, data) VALUES (?, ?)");

  database.transaction(() => {
    database.exec("DELETE FROM players; DELETE FROM games; DELETE FROM seasons; DELETE FROM settings;");
    for (const player of backup.players) {
      if (player?.id && typeof player.id === "string") {
        stmtPlayer.run(player.id, JSON.stringify(player));
      }
    }
    for (const game of backup.games) {
      if (game?.id && typeof game.id === "string" && game.date) {
        stmtGame.run(game.id, game.date, JSON.stringify(game));
      }
    }
    for (const season of backup.seasons) {
      if (season?.id && typeof season.id === "string") {
        stmtSeason.run(season.id, JSON.stringify(season));
      }
    }
    if (backup.settings && typeof backup.settings === "object") {
      stmtSettings.run(SETTINGS_KEY, JSON.stringify(backup.settings));
    }
  })();
}
