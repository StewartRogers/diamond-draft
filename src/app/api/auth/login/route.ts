import {
  authenticate,
  createSession,
  destroySession,
  getSessionIdFromRequest,
  isRateLimited,
  makeSessionCookie,
  needsSetup,
} from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (await needsSetup()) {
    return Response.json({ error: "Setup required" }, { status: 403 });
  }

  const body = (await request.json()) as { username?: string; password?: string };
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 });
  }

  if (isRateLimited(username.toLowerCase().trim())) {
    return Response.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const user = await authenticate(username, password);
  if (!user) {
    return Response.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const oldSessionId = getSessionIdFromRequest(request);
  if (oldSessionId) await destroySession(oldSessionId);

  const session = await createSession(user.id);

  return Response.json({ user }, {
    headers: { "Set-Cookie": makeSessionCookie(session.id) },
  });
}
