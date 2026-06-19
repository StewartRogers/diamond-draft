import { getAllSeasons, saveSeason } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import type { Season } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json(await getAllSeasons());
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const season = (await request.json()) as Season;
  if (!season?.id || typeof season.id !== "string") {
    return new Response("Invalid season: missing id", { status: 400 });
  }
  await saveSeason(season);
  return Response.json(season, { status: 201 });
}

