import { deleteTeam, getTeam, saveTeam } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import type { Team } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const team = await getTeam(id);
  if (!team) return new Response("Not found", { status: 404 });
  return Response.json(team);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const team = (await request.json()) as Team;
  if (!team || typeof team !== "object") {
    return new Response("Invalid team body", { status: 400 });
  }
  await saveTeam({ ...team, id });
  return Response.json({ ...team, id });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  await deleteTeam(id);
  return new Response(null, { status: 204 });
}
