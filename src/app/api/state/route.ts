import {
  clearAllData,
  getAllGames,
  getAllPlayers,
  getAllSeasons,
  getSettings,
  saveGame,
  savePlayer,
  saveSeason,
  saveSettings,
} from "@/lib/server/db";
import type { AppSettings, Game, Player, Season } from "@/lib/types";

export const runtime = "nodejs";

type Backup = {
  players: Player[];
  games: Game[];
  seasons: Season[];
  settings: AppSettings;
};

export async function GET() {
  return Response.json({
    players: getAllPlayers(),
    games: getAllGames(),
    seasons: getAllSeasons(),
    settings: getSettings(),
  } satisfies Backup);
}

export async function PUT(request: Request) {
  const backup = (await request.json()) as Backup;
  clearAllData();
  for (const player of backup.players ?? []) savePlayer(player);
  for (const game of backup.games ?? []) saveGame(game);
  for (const season of backup.seasons ?? []) saveSeason(season);
  saveSettings(backup.settings);
  return Response.json({ ok: true });
}

export async function DELETE() {
  clearAllData();
  return Response.json({ ok: true });
}
