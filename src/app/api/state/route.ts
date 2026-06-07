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
  if (!backup || typeof backup !== "object") {
    return new Response("Invalid backup body", { status: 400 });
  }
  clearAllData();
  for (const player of backup.players ?? []) {
    if (player?.id && typeof player.id === "string") savePlayer(player);
  }
  for (const game of backup.games ?? []) {
    if (game?.id && typeof game.id === "string") saveGame(game);
  }
  for (const season of backup.seasons ?? []) {
    if (season?.id && typeof season.id === "string") saveSeason(season);
  }
  if (backup.settings && typeof backup.settings === "object") saveSettings(backup.settings);
  return Response.json({ ok: true });
}

export async function DELETE() {
  clearAllData();
  return Response.json({ ok: true });
}
