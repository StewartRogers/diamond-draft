import {
  needsSetup,
  createUserIfNoUsers,
  createSession,
  isRateLimited,
  makeSessionCookie,
  validatePassword,
} from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await needsSetup())) {
    return Response.json({ error: "Setup already complete" }, { status: 400 });
  }

  if (isRateLimited("__setup__")) {
    return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const body = (await request.json()) as { username?: string; password?: string; displayName?: string };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

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
  return Response.json({ needsSetup: await needsSetup() });
}
