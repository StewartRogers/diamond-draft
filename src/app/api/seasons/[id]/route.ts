import { deleteSeason, getSeason, saveSeason } from "@/lib/server/db";
import type { Season } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = getSeason(id);
  if (!season) return new Response("Not found", { status: 404 });
  return Response.json(season);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = (await request.json()) as Season;
  saveSeason({ ...season, id });
  return Response.json({ ...season, id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteSeason(id);
  return new Response(null, { status: 204 });
}

