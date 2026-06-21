import { getAllTeams, saveTeam } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import type { Team } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json(await getAllTeams());
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const team = (await request.json()) as Team;
  if (!team?.id || typeof team.id !== "string") {
    return new Response("Invalid team: missing id", { status: 400 });
  }
  await saveTeam(team);
  return Response.json(team, { status: 201 });
}
