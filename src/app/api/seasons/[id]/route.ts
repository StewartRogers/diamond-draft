import { deleteSeason, getSeason, saveSeason } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import type { Season } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const season = await getSeason(id);
  if (!season) return new Response("Not found", { status: 404 });
  return Response.json(season);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const season = (await request.json()) as Season;
  if (!season || typeof season !== "object") {
    return new Response("Invalid season body", { status: 400 });
  }
  await saveSeason({ ...season, id });
  return Response.json({ ...season, id });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  await deleteSeason(id);
  return new Response(null, { status: 204 });
}

