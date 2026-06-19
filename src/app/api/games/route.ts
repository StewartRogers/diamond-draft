import { getAllGames, saveGame } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import type { Game } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json(await getAllGames());
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const game = (await request.json()) as Game;
  if (!game?.id || typeof game.id !== "string") {
    return new Response("Invalid game: missing id", { status: 400 });
  }
  await saveGame(game);
  return Response.json(game, { status: 201 });
}

