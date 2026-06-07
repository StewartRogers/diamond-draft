import { getAllGames, saveGame } from "@/lib/server/db";
import type { Game } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getAllGames());
}

export async function POST(request: Request) {
  const game = (await request.json()) as Game;
  saveGame(game);
  return Response.json(game, { status: 201 });
}

