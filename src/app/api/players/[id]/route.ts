import { deletePlayer, getPlayer, savePlayer } from "@/lib/server/db";
import type { Player } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = getPlayer(id);
  if (!player) return new Response("Not found", { status: 404 });
  return Response.json(player);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = (await request.json()) as Player;
  if (!player || typeof player !== "object") {
    return new Response("Invalid player body", { status: 400 });
  }
  savePlayer({ ...player, id });
  return Response.json({ ...player, id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deletePlayer(id);
  return new Response(null, { status: 204 });
}

