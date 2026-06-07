import type { AppSettings, Game, Player, Season } from "./types";
import { DEFAULT_APP_SETTINGS } from "./types";

export type FullBackup = {
  version: number;
  exportedAt: string;
  players: Player[];
  games: Game[];
  seasons: Season[];
  settings: AppSettings;
};

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw new Error(`Request failed: ${input}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Players ──────────────────────────────────────────────────────────────────

export const getAllPlayers = () => requestJson<Player[]>("/api/players");
export const getPlayer = (id: string) => requestJson<Player | undefined>(`/api/players/${id}`);
export const savePlayer = (player: Player) =>
  requestJson<Player>(`/api/players/${player.id}`, {
    method: "PUT",
    body: JSON.stringify(player),
  });
export const deletePlayer = (id: string) =>
  requestJson<void>(`/api/players/${id}`, { method: "DELETE" });
export const savePlayers = async (players: Player[]) => {
  await Promise.all(players.map(savePlayer));
};

// ─── Games ────────────────────────────────────────────────────────────────────

export const getAllGames = () => requestJson<Game[]>("/api/games");
export const getGame = (id: string) => requestJson<Game | undefined>(`/api/games/${id}`);
export const saveGame = (game: Game) =>
  requestJson<Game>(`/api/games/${game.id}`, {
    method: "PUT",
    body: JSON.stringify(game),
  });
export const deleteGame = (id: string) =>
  requestJson<void>(`/api/games/${id}`, { method: "DELETE" });
export const getGamesByDateRange = async (from: string, to: string) =>
  (await getAllGames()).filter((g) => g.date >= from && g.date <= to);

// ─── Seasons ──────────────────────────────────────────────────────────────────

export const getAllSeasons = () => requestJson<Season[]>("/api/seasons");
export const getSeason = (id: string) => requestJson<Season | undefined>(`/api/seasons/${id}`);
export const saveSeason = (season: Season) =>
  requestJson<Season>(`/api/seasons/${season.id}`, {
    method: "PUT",
    body: JSON.stringify(season),
  });
export const deleteSeason = (id: string) =>
  requestJson<void>(`/api/seasons/${id}`, { method: "DELETE" });

// ─── Settings ─────────────────────────────────────────────────────────────────

export const getSettings = async () =>
  (await requestJson<AppSettings>("/api/settings")) ?? { ...DEFAULT_APP_SETTINGS };
export const saveSettings = (settings: AppSettings) =>
  requestJson<AppSettings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });

// ─── Export / Import (full backup) ───────────────────────────────────────────

export async function exportAllData(): Promise<FullBackup> {
  const [players, games, seasons, settings] = await Promise.all([
    getAllPlayers(),
    getAllGames(),
    getAllSeasons(),
    getSettings(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    players,
    games,
    seasons,
    settings,
  };
}

export async function importAllData(backup: FullBackup): Promise<void> {
  await requestJson("/api/state", {
    method: "PUT",
    body: JSON.stringify({
      players: backup.players,
      games: backup.games,
      seasons: backup.seasons,
      settings: backup.settings,
    }),
  });
}

export const clearAllData = () =>
  requestJson<void>("/api/state", { method: "DELETE" });

