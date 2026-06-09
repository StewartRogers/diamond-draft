import {
  clearAllData,
  getAllGames,
  getAllPlayers,
  getAllSeasons,
  getSettings,
  restoreBackup,
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
  // Restore atomically — wipe + writes happen in one transaction so a
  // mid-restore failure never leaves the database empty.
  restoreBackup({
    players: Array.isArray(backup.players) ? backup.players : [],
    games: Array.isArray(backup.games) ? backup.games : [],
    seasons: Array.isArray(backup.seasons) ? backup.seasons : [],
    settings: backup.settings ?? {},
  });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body?.confirm !== "wipe") {
    return new Response("Missing confirmation: send { confirm: 'wipe' }", { status: 400 });
  }
  clearAllData();
  return Response.json({ ok: true });
}
