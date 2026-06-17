import { authenticate, createSession, makeSessionCookie, needsSetup } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (needsSetup()) {
    return Response.json({ error: "Setup required" }, { status: 403 });
  }

  const body = (await request.json()) as { username?: string; password?: string };
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 });
  }

  const user = await authenticate(username, password);
  if (!user) {
    return Response.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const session = createSession(user.id);

  return Response.json({ user }, {
    headers: { "Set-Cookie": makeSessionCookie(session.id) },
  });
}
