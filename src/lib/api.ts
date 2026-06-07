/**
 * Typed API client — thin fetch wrappers over the Next.js API routes.
 * The Zustand store uses these exclusively; the server persists to SQLite.
 */

import type { AppSettings, Game, Player, Season } from "./types";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${options?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export type FullState = {
  players: Player[];
  games: Game[];
  seasons: Season[];
  settings: AppSettings;
};

export async function loadAll(): Promise<FullState> {
  return request<FullState>("/api/state");
}

export async function importAll(state: FullState): Promise<void> {
  await request("/api/state", { method: "PUT", body: JSON.stringify(state) });
}

export async function clearAll(): Promise<void> {
  await request("/api/state", { method: "DELETE" });
}

// ─── Players ──────────────────────────────────────────────────────────────────

export async function savePlayer(player: Player): Promise<Player> {
  // Use PUT if updating (player exists), POST if creating
  return request<Player>(`/api/players/${player.id}`, {
    method: "PUT",
    body: JSON.stringify(player),
  });
}

export async function createPlayer(player: Player): Promise<Player> {
  return request<Player>("/api/players", {
    method: "POST",
    body: JSON.stringify(player),
  });
}

export async function deletePlayer(id: string): Promise<void> {
  await request(`/api/players/${id}`, { method: "DELETE" });
}

export async function savePlayers(players: Player[]): Promise<void> {
  await Promise.all(players.map(savePlayer));
}

// ─── Games ────────────────────────────────────────────────────────────────────

export async function saveGame(game: Game): Promise<Game> {
  return request<Game>(`/api/games/${game.id}`, {
    method: "PUT",
    body: JSON.stringify(game),
  });
}

export async function createGame(game: Game): Promise<Game> {
  return request<Game>("/api/games", {
    method: "POST",
    body: JSON.stringify(game),
  });
}

export async function deleteGame(id: string): Promise<void> {
  await request(`/api/games/${id}`, { method: "DELETE" });
}

// ─── Seasons ──────────────────────────────────────────────────────────────────

export async function saveSeason(season: Season): Promise<Season> {
  return request<Season>(`/api/seasons/${season.id}`, {
    method: "PUT",
    body: JSON.stringify(season),
  });
}

export async function createSeason(season: Season): Promise<Season> {
  return request<Season>("/api/seasons", {
    method: "POST",
    body: JSON.stringify(season),
  });
}

export async function deleteSeason(id: string): Promise<void> {
  await request(`/api/seasons/${id}`, { method: "DELETE" });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return request<AppSettings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// ─── Backup export (reuse loadAll) ───────────────────────────────────────────

export type FullBackup = FullState & {
  version: number;
  exportedAt: string;
};

export async function exportAllData(): Promise<FullBackup> {
  const state = await loadAll();
  return {
    ...state,
    version: 1,
    exportedAt: new Date().toISOString(),
  };
}
