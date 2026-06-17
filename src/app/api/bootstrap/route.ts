import { getAllGames, getAllPlayers, getAllSeasons, getSettings } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json({
    players: getAllPlayers(),
    games: getAllGames(),
    seasons: getAllSeasons(),
    settings: getSettings(),
  });
}

