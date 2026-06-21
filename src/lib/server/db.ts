import "server-only";

import type { Client } from "@libsql/client";
import type { AppSettings, Game, Player, Season, Team } from "../types";
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
  __dd_data_db_ready?: Promise<void>;
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
    `CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`,
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

/**
 * Ensure the schema exists, the default roster is seeded on a fresh DB, and the
 * data has been migrated to the multi-team model. Memoized as a single promise
 * so concurrent callers (e.g. the parallel bootstrap reads) don't double-run.
 */
async function ensureData(): Promise<void> {
  if (!globalDataDb.__dd_data_db_ready) {
    const ready = (async () => {
      await ensureSchema();
      await seedDefaultPlayers();
      await migrateToMultiTeam();
    })();
    globalDataDb.__dd_data_db_ready = ready;
    // Don't cache a rejected promise — allow a later call to retry.
    ready.catch(() => {
      globalDataDb.__dd_data_db_ready = undefined;
    });
  }
  return globalDataDb.__dd_data_db_ready;
}

async function seedDefaultPlayers(): Promise<void> {
  const db = getSharedClient("__dd_data_db");
  const result = await db.execute("SELECT COUNT(*) as count FROM players");
  if (Number(result.rows[0]?.count ?? 0) > 0) return;
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
}

/**
 * One-time migration to the multi-team model. Runs when no Team exists yet:
 * wraps all current data into a single Team, attaches every season to it
 * (defaulting each season's roster to the full player list), and creates a
 * default season when none exist so there is always an active context.
 * Uses raw reads to avoid recursing through ensureData().
 */
async function migrateToMultiTeam(): Promise<void> {
  const db = getSharedClient("__dd_data_db");
  const teamCount = Number(
    (await db.execute("SELECT COUNT(*) as count FROM teams")).rows[0]?.count ?? 0
  );
  if (teamCount > 0) return; // already migrated

  const players = (await db.execute("SELECT data FROM players")).rows.map(
    (row) => JSON.parse(row.data as string) as Player
  );
  const seasons = (await db.execute("SELECT data FROM seasons")).rows
    .map((row) => JSON.parse(row.data as string) as Season)
    // Deterministic order (earliest first) so the chosen active season is stable.
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const settingsRow = (
    await db.execute({ sql: "SELECT data FROM settings WHERE id = ?", args: [SETTINGS_KEY] })
  ).rows[0];
  const settings: AppSettings = settingsRow
    ? (JSON.parse(settingsRow.data as string) as AppSettings)
    : { ...DEFAULT_APP_SETTINGS };

  const team = seasonLib.createTeam({
    name: settings.teamName?.trim() || "My Team",
    headCoach: settings.headCoach,
    leagueDivision: settings.leagueDivision,
  });

  const allPlayerIds = players.map((p) => p.id);
  const statements: { sql: string; args: (string | number)[] }[] = [
    { sql: "INSERT OR REPLACE INTO teams (id, data) VALUES (?, ?)", args: [team.id, JSON.stringify(team)] },
  ];

  let activeSeasonId = settings.activeSeasonId;
  if (seasons.length === 0) {
    // No season yet: create one and adopt any pre-existing games so they stay
    // visible under the new season filter.
    const gameIds = (await db.execute("SELECT id FROM games")).rows.map(
      (row) => row.id as string
    );
    const season = seasonLib.createSeason({
      name: `${new Date().getFullYear()} Season`,
      teamId: team.id,
      teamName: team.name,
      year: new Date().getFullYear(),
      roster: allPlayerIds,
    });
    season.gameIds = gameIds;
    statements.push({
      sql: "INSERT OR REPLACE INTO seasons (id, data) VALUES (?, ?)",
      args: [season.id, JSON.stringify(season)],
    });
    activeSeasonId = season.id;
  } else {
    for (const s of seasons) {
      const migrated: Season = {
        ...s,
        teamId: s.teamId || team.id,
        teamName: s.teamName || team.name,
        roster: s.roster && s.roster.length > 0 ? s.roster : allPlayerIds,
        gameIds: s.gameIds ?? [],
      };
      statements.push({
        sql: "INSERT OR REPLACE INTO seasons (id, data) VALUES (?, ?)",
        args: [migrated.id, JSON.stringify(migrated)],
      });
    }
    if (!activeSeasonId) activeSeasonId = seasons[0].id;
  }

  const updatedSettings: AppSettings = {
    ...settings,
    activeTeamId: team.id,
    activeSeasonId,
  };
  statements.push({
    sql: "INSERT OR REPLACE INTO settings (id, data) VALUES (?, ?)",
    args: [SETTINGS_KEY, JSON.stringify(updatedSettings)],
  });

  await db.batch(statements, "write");
}

export async function getAllPlayers(): Promise<Player[]> {
  await ensureData();
  const db = getSharedClient("__dd_data_db");
  const result = await db.execute("SELECT data FROM players");
  return result.rows.map((row) => JSON.parse(row.data as string) as Player);
}

export async function getPlayer(id: string): Promise<Player | undefined> {
  await ensureData();
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

// ─── Teams ──────────────────────────────────────────────────────────────────

export async function getAllTeams(): Promise<Team[]> {
  await ensureData();
  const db = getSharedClient("__dd_data_db");
  const result = await db.execute("SELECT data FROM teams");
  return result.rows.map((row) => JSON.parse(row.data as string) as Team);
}

export async function getTeam(id: string): Promise<Team | undefined> {
  await ensureData();
  const db = getSharedClient("__dd_data_db");
  const result = await db.execute({ sql: "SELECT data FROM teams WHERE id = ?", args: [id] });
  const row = result.rows[0];
  return row ? (JSON.parse(row.data as string) as Team) : undefined;
}

export async function saveTeam(team: Team): Promise<void> {
  const db = await ensureSchema();
  await db.execute({
    sql: "INSERT OR REPLACE INTO teams (id, data) VALUES (?, ?)",
    args: [team.id, JSON.stringify(team)],
  });
}

export async function deleteTeam(id: string): Promise<void> {
  const db = await ensureSchema();
  await db.execute({ sql: "DELETE FROM teams WHERE id = ?", args: [id] });
}

// ─── Seasons ────────────────────────────────────────────────────────────────

export async function getAllSeasons(): Promise<Season[]> {
  await ensureData();
  const db = getSharedClient("__dd_data_db");
  const result = await db.execute("SELECT data FROM seasons");
  return result.rows.map((row) => JSON.parse(row.data as string) as Season);
}

export async function getSeason(id: string): Promise<Season | undefined> {
  await ensureData();
  const db = getSharedClient("__dd_data_db");
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
  await ensureData();
  const db = getSharedClient("__dd_data_db");
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
    "DELETE FROM teams",
    "DELETE FROM seasons",
    "DELETE FROM settings",
  ], "write");
  // Force re-seed + re-migration on next read.
  globalDataDb.__dd_data_db_ready = undefined;
}

export async function restoreBackup(backup: {
  players: Player[];
  games: Game[];
  teams?: Team[];
  seasons: Season[];
  settings: AppSettings;
}): Promise<void> {
  const db = await ensureSchema();
  const statements: { sql: string; args: (string | number)[] }[] = [
    { sql: "DELETE FROM players", args: [] },
    { sql: "DELETE FROM games", args: [] },
    { sql: "DELETE FROM teams", args: [] },
    { sql: "DELETE FROM seasons", args: [] },
    { sql: "DELETE FROM settings", args: [] },
  ];

  for (const team of backup.teams ?? []) {
    if (team?.id && typeof team.id === "string") {
      statements.push({
        sql: "INSERT OR REPLACE INTO teams (id, data) VALUES (?, ?)",
        args: [team.id, JSON.stringify(team)],
      });
    }
  }

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
  // Reset so ensureData() re-runs: re-seeds an empty DB and migrates v1
  // backups (no teams) into the multi-team model on the next read.
  globalDataDb.__dd_data_db_ready = undefined;
}
