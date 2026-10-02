import { getAllSeasons, saveSeason, getSeason } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { parseBody, SeasonSchema } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json(await getAllSeasons());
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const season = await parseBody(request, SeasonSchema);
  if (season instanceof Response) return season;
  if (await getSeason(season.id)) {
    return Response.json({ error: "Season already exists" }, { status: 409 });
  }
  await saveSeason(season);
  return Response.json(season, { status: 201 });
}

