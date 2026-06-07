import { getAllSeasons, saveSeason } from "@/lib/server/db";
import type { Season } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getAllSeasons());
}

export async function POST(request: Request) {
  const season = (await request.json()) as Season;
  saveSeason(season);
  return Response.json(season, { status: 201 });
}

