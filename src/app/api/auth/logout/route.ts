import { getSessionIdFromRequest, destroySession, makeClearSessionCookie } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sessionId = getSessionIdFromRequest(request);
  if (sessionId) destroySession(sessionId);

  return Response.json({ ok: true }, {
    headers: { "Set-Cookie": makeClearSessionCookie() },
  });
}
