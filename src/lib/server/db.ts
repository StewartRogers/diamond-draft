import "server-only";

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { AppSettings, Game, Player, Season } from "../types";
import { DEFAULT_APP_SETTINGS } from "../types";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "diamond-draft.sqlite3");

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

export function getAllPlayers(): Player[] {
  return getDb()
    .prepare("SELECT data FROM players")
    .all()
    .map((row: { data: string }) => JSON.parse(row.data) as Player);
}

export function getPlayer(id: string): Player | undefined {
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
