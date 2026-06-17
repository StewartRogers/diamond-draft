import { getSessionIdFromRequest, getSessionUser, needsSetup } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (needsSetup()) {
    return Response.json({ user: null, needsSetup: true });
  }
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) {
    return Response.json({ user: null });
  }
  const user = getSessionUser(sessionId);
  return Response.json({ user });
}
