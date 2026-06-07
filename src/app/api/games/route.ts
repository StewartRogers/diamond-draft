import { getAllGames, saveGame } from "@/lib/server/db";
import type { Game } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getAllGames());
}

export async function POST(request: Request) {
  const game = (await request.json()) as Game;
  if (!game?.id || typeof game.id !== "string") {
    return new Response("Invalid game: missing id", { status: 400 });
  }
  saveGame(game);
  return Response.json(game, { status: 201 });
}

