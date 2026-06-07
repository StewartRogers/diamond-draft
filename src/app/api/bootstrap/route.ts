import { getAllGames, getAllPlayers, getAllSeasons, getSettings } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    players: getAllPlayers(),
    games: getAllGames(),
    seasons: getAllSeasons(),
    settings: getSettings(),
  });
}

