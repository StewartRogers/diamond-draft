import { getAllGames, getAllPlayers, getAllTeams, getAllSeasons, getSettings } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const [players, games, teams, seasons, settings] = await Promise.all([
    getAllPlayers(), getAllGames(), getAllTeams(), getAllSeasons(), getSettings(),
  ]);
  return Response.json({ players, games, teams, seasons, settings });
}

