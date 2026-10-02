import {
  needsSetup,
  createUserIfNoUsers,
  createSession,
  isSetupRateLimited,
  getTrustedClientIp,
  checkSetupToken,
  isSetupTokenRequired,
  makeSessionCookie,
  validatePassword,
} from "@/lib/server/auth";
import { readJson, AUTH_MAX_BODY_BYTES } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await needsSetup())) {
    return Response.json({ error: "Setup already complete" }, { status: 400 });
  }

  if (await isSetupRateLimited(getTrustedClientIp(request))) {
    return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const body = await readJson<{
    username?: string;
    password?: string;
    displayName?: string;
    setupToken?: string;
  } | null>(
    request,
    AUTH_MAX_BODY_BYTES
  );
  if (body instanceof Response) return body;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  const setupToken = typeof body?.setupToken === "string" ? body.setupToken : "";

  const tokenCheck = checkSetupToken(setupToken);
  if (tokenCheck === "not_configured") {
    return Response.json(
      { error: "Set the SETUP_TOKEN environment variable to complete setup on this deployment." },
      { status: 503 }
    );
  }
  if (tokenCheck === "invalid") {
    return Response.json({ error: "Invalid setup token" }, { status: 403 });
  }

  if (!username || username.length < 3) {
    return Response.json({ error: "Username must be at least 3 characters" }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) {
    return Response.json({ error: pwError }, { status: 400 });
  }

  const user = await createUserIfNoUsers(username, password, displayName || username);
  if (!user) {
    return Response.json({ error: "Setup already complete" }, { status: 400 });
  }

  const session = await createSession(user.id);

  return Response.json({ user }, {
    status: 201,
    headers: { "Set-Cookie": makeSessionCookie(session.id) },
  });
}

export async function GET() {
  return Response.json({ needsSetup: await needsSetup(), setupTokenRequired: isSetupTokenRequired() });
}
