import { needsSetup, createUser, createSession, makeSessionCookie } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!needsSetup()) {
    return Response.json({ error: "Setup already complete" }, { status: 400 });
  }

  const body = (await request.json()) as { username?: string; password?: string; displayName?: string };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

  if (!username || username.length < 3) {
    return Response.json({ error: "Username must be at least 3 characters" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const user = await createUser(username, password, displayName || username, "superuser");
  const session = createSession(user.id);

  return Response.json({ user }, {
    status: 201,
    headers: { "Set-Cookie": makeSessionCookie(session.id) },
  });
}

export async function GET() {
  return Response.json({ needsSetup: needsSetup() });
}
