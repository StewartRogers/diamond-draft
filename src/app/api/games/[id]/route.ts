import { deleteGame, getGame, saveGame } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import type { Game } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const game = await getGame(id);
  if (!game) return new Response("Not found", { status: 404 });
  return Response.json(game);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const game = (await request.json()) as Game;
  if (!game || typeof game !== "object") {
    return new Response("Invalid game body", { status: 400 });
  }
  await saveGame({ ...game, id });
  return Response.json({ ...game, id });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  await deleteGame(id);
  return new Response(null, { status: 204 });
}

