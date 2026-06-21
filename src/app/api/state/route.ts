import {
  clearAllData,
  getAllGames,
  getAllPlayers,
  getAllTeams,
  getAllSeasons,
  getSettings,
  restoreBackup,
} from "@/lib/server/db";
import { requireUser, requireSuperuser } from "@/lib/server/auth";
import type { AppSettings, Game, Player, Season, Team } from "@/lib/types";

export const runtime = "nodejs";

type Backup = {
  players: Player[];
  games: Game[];
  teams: Team[];
  seasons: Season[];
  settings: AppSettings;
};

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const [players, games, teams, seasons, settings] = await Promise.all([
    getAllPlayers(), getAllGames(), getAllTeams(), getAllSeasons(), getSettings(),
  ]);
  return Response.json({ players, games, teams, seasons, settings } satisfies Backup);
}

export async function PUT(request: Request) {
  const auth = await requireSuperuser(request);
  if (auth instanceof Response) return auth;
  const backup = (await request.json()) as Backup;
  if (!backup || typeof backup !== "object") {
    return new Response("Invalid backup body", { status: 400 });
  }
  await restoreBackup({
    players: Array.isArray(backup.players) ? backup.players : [],
    games: Array.isArray(backup.games) ? backup.games : [],
    teams: Array.isArray(backup.teams) ? backup.teams : [],
    seasons: Array.isArray(backup.seasons) ? backup.seasons : [],
    settings: backup.settings ?? {},
  });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireSuperuser(request);
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body?.confirm !== "wipe") {
    return new Response("Missing confirmation: send { confirm: 'wipe' }", { status: 400 });
  }
  await clearAllData();
  return Response.json({ ok: true });
}
