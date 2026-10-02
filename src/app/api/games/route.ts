import { getAllGames, saveGame, getGame } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { parseBody, GameSchema } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json(await getAllGames());
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const game = await parseBody(request, GameSchema);
  if (game instanceof Response) return game;
  if (await getGame(game.id)) {
    return Response.json({ error: "Game already exists" }, { status: 409 });
  }
  await saveGame(game);
  return Response.json(game, { status: 201 });
}

