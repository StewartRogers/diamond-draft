import { deletePlayer, getPlayer, savePlayer } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { isValidId, parseBody, PlayerSchema } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const player = await getPlayer(id);
  if (!player) return new Response("Not found", { status: 404 });
  return Response.json(player);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!isValidId(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  const player = await parseBody(request, PlayerSchema);
  if (player instanceof Response) return player;
  await savePlayer({ ...player, id });
  return Response.json({ ...player, id });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  await deletePlayer(id);
  return new Response(null, { status: 204 });
}

