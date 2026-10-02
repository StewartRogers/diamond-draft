import { getAllPlayers, savePlayer, getPlayer } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { parseBody, PlayerSchema } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json(await getAllPlayers());
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const player = await parseBody(request, PlayerSchema);
  if (player instanceof Response) return player;
  if (await getPlayer(player.id)) {
    return Response.json({ error: "Player already exists" }, { status: 409 });
  }
  await savePlayer(player);
  return Response.json(player, { status: 201 });
}

