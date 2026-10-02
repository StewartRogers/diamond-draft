import { getAllTeams, saveTeam, getTeam } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { parseBody, TeamSchema } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json(await getAllTeams());
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const team = await parseBody(request, TeamSchema);
  if (team instanceof Response) return team;
  if (await getTeam(team.id)) {
    return Response.json({ error: "Team already exists" }, { status: 409 });
  }
  await saveTeam(team);
  return Response.json(team, { status: 201 });
}
