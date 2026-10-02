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
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import type { AppSettings, Game, Player, Season, Team } from "@/lib/types";
import { readJson, BACKUP_MAX_BODY_BYTES } from "@/lib/server/http";
import { parseBody, BackupSchema } from "@/lib/server/validate";

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
  // Validate the whole backup before anything is deleted.
  const backup = await parseBody(request, BackupSchema, BACKUP_MAX_BODY_BYTES);
  if (backup instanceof Response) return backup;
  await restoreBackup({
    players: backup.players,
    games: backup.games,
    teams: backup.teams,
    // v1 seasons may lack team/roster fields; restoreBackup re-runs the
    // multi-team migration, which fills them in.
    seasons: backup.seasons as Season[],
    settings: {
      ...DEFAULT_APP_SETTINGS,
      activeTeamId: null,
      activeSeasonId: null,
      ...backup.settings,
    },
  });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireSuperuser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson<Record<string, unknown> | null>(request);
  if (body instanceof Response) return body;
  if (body?.confirm !== "wipe") {
    return new Response("Missing confirmation: send { confirm: 'wipe' }", { status: 400 });
  }
  await clearAllData();
  return Response.json({ ok: true });
}
