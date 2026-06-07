import { openDB, type IDBPDatabase } from "idb";
import type { Player, Game, Season, AppSettings } from "./types";
import { DEFAULT_APP_SETTINGS } from "./types";

const DB_NAME = "diamond-draft";
const DB_VERSION = 1;

type DiamondDraftDB = {
  players: {
    key: string;
    value: Player;
  };
  games: {
    key: string;
    value: Game;
    indexes: { "by-date": string };
  };
  seasons: {
    key: string;
    value: Season;
  };
  settings: {
    key: string;
    value: AppSettings & { id: string };
  };
};

let dbInstance: IDBPDatabase<DiamondDraftDB> | null = null;

async function getDB(): Promise<IDBPDatabase<DiamondDraftDB>> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<DiamondDraftDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("players")) {
        db.createObjectStore("players", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("games")) {
        const gameStore = db.createObjectStore("games", { keyPath: "id" });
        gameStore.createIndex("by-date", "date");
      }
      if (!db.objectStoreNames.contains("seasons")) {
        db.createObjectStore("seasons", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    },
  });
  return dbInstance;
}

// ─── Players ──────────────────────────────────────────────────────────────────

export async function getAllPlayers(): Promise<Player[]> {
  const db = await getDB();
  return db.getAll("players");
}

export async function getPlayer(id: string): Promise<Player | undefined> {
  const db = await getDB();
  return db.get("players", id);
}

export async function savePlayer(player: Player): Promise<void> {
  const db = await getDB();
  await db.put("players", player);
}

export async function deletePlayer(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("players", id);
}

export async function savePlayers(players: Player[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("players", "readwrite");
  await Promise.all([...players.map((p) => tx.store.put(p)), tx.done]);
}

// ─── Games ────────────────────────────────────────────────────────────────────

export async function getAllGames(): Promise<Game[]> {
  const db = await getDB();
  return db.getAll("games");
}

export async function getGame(id: string): Promise<Game | undefined> {
  const db = await getDB();
  return db.get("games", id);
}

export async function saveGame(game: Game): Promise<void> {
  const db = await getDB();
  await db.put("games", game);
}

export async function deleteGame(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("games", id);
}

export async function getGamesByDateRange(
  from: string,
  to: string
): Promise<Game[]> {
  const db = await getDB();
  return db.getAllFromIndex("games", "by-date", IDBKeyRange.bound(from, to));
}

// ─── Seasons ──────────────────────────────────────────────────────────────────

export async function getAllSeasons(): Promise<Season[]> {
  const db = await getDB();
  return db.getAll("seasons");
}

export async function getSeason(id: string): Promise<Season | undefined> {
  const db = await getDB();
  return db.get("seasons", id);
}

export async function saveSeason(season: Season): Promise<void> {
  const db = await getDB();
  await db.put("seasons", season);
}

export async function deleteSeason(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("seasons", id);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY = "app-settings";

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB();
  const row = await db.get("settings", SETTINGS_KEY);
  if (!row) return { ...DEFAULT_APP_SETTINGS };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...settings } = row;
  return settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put("settings", { ...settings, id: SETTINGS_KEY });
}

// ─── Export / Import (full backup) ───────────────────────────────────────────

export type FullBackup = {
  version: number;
  exportedAt: string;
  players: Player[];
  games: Game[];
  seasons: Season[];
  settings: AppSettings;
};

export async function exportAllData(): Promise<FullBackup> {
  const [players, games, seasons, settings] = await Promise.all([
    getAllPlayers(),
    getAllGames(),
    getAllSeasons(),
    getSettings(),
  ]);
  return {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    players,
    games,
    seasons,
    settings,
  };
}

export async function importAllData(backup: FullBackup): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["players", "games", "seasons", "settings"], "readwrite");

  // Clear existing data
  await Promise.all([
    tx.objectStore("players").clear(),
    tx.objectStore("games").clear(),
    tx.objectStore("seasons").clear(),
    tx.objectStore("settings").clear(),
  ]);

  // Write backup data
  await Promise.all([
    ...backup.players.map((p) => tx.objectStore("players").put(p)),
    ...backup.games.map((g) => tx.objectStore("games").put(g)),
    ...backup.seasons.map((s) => tx.objectStore("seasons").put(s)),
    tx.objectStore("settings").put({ ...backup.settings, id: SETTINGS_KEY }),
    tx.done,
  ]);
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["players", "games", "seasons", "settings"], "readwrite");
  await Promise.all([
    tx.objectStore("players").clear(),
    tx.objectStore("games").clear(),
    tx.objectStore("seasons").clear(),
    tx.objectStore("settings").clear(),
    tx.done,
  ]);
}
