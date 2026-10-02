import { deleteSeason, getSeason, saveSeason } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { isValidId, parseBody, SeasonSchema } from "@/lib/server/validate";

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
  if (!isValidId(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  const season = await parseBody(request, SeasonSchema);
  if (season instanceof Response) return season;
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

