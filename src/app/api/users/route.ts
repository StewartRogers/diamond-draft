import { requireSuperuser, getAllUsers, createUser, validatePassword } from "@/lib/server/auth";
import type { UserRole } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const result = await requireSuperuser(request);
  if (result instanceof Response) return result;

  return Response.json(await getAllUsers());
}

export async function POST(request: Request) {
  const result = await requireSuperuser(request);
  if (result instanceof Response) return result;

  const body = (await request.json()) as {
    username?: string;
    password?: string;
    displayName?: string;
    role?: UserRole;
  };

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const role = body.role === "superuser" ? "superuser" : "user";

  if (!username || username.length < 3) {
    return Response.json({ error: "Username must be at least 3 characters" }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) {
    return Response.json({ error: pwError }, { status: 400 });
  }

  try {
    const user = await createUser(username, password, displayName || username, role);
    return Response.json(user, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("UNIQUE constraint")) {
      return Response.json({ error: "Username already exists" }, { status: 409 });
    }
    return Response.json({ error: "Failed to create user" }, { status: 500 });
  }
}
