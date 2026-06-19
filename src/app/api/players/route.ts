import { getAllPlayers, savePlayer } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import type { Player } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json(await getAllPlayers());
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const player = (await request.json()) as Player;
  if (!player?.id || typeof player.id !== "string") {
    return new Response("Invalid player: missing id", { status: 400 });
  }
  await savePlayer(player);
  return Response.json(player, { status: 201 });
}

