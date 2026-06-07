import { getAllPlayers, savePlayer } from "@/lib/server/db";
import type { Player } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getAllPlayers());
}

export async function POST(request: Request) {
  const player = (await request.json()) as Player;
  savePlayer(player);
  return Response.json(player, { status: 201 });
}

