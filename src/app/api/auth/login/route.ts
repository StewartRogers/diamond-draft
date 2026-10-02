import {
  authenticate,
  createSession,
  destroySession,
  getSessionIdFromRequest,
  getTrustedClientIp,
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
  makeSessionCookie,
  needsSetup,
} from "@/lib/server/auth";
import { readJson, AUTH_MAX_BODY_BYTES } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (await needsSetup()) {
    return Response.json({ error: "Setup required" }, { status: 403 });
  }

  const body = await readJson<{ username?: string; password?: string } | null>(request, AUTH_MAX_BODY_BYTES);
  if (body instanceof Response) return body;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 });
  }

  const ip = getTrustedClientIp(request);
  if (await isLoginBlocked(username, ip)) {
    return Response.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const user = await authenticate(username, password);
  if (!user) {
    await recordLoginFailure(username, ip);
    return Response.json({ error: "Invalid username or password" }, { status: 401 });
  }

  await clearLoginFailures(username, ip);

  const oldSessionId = getSessionIdFromRequest(request);
  if (oldSessionId) await destroySession(oldSessionId);

  const session = await createSession(user.id);

  return Response.json({ user }, {
    headers: { "Set-Cookie": makeSessionCookie(session.id) },
  });
}
