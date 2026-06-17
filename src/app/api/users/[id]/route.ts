import { requireSuperuser, deleteUser, resetPassword, setUserRole, getUser } from "@/lib/server/auth";
import type { UserRole } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSuperuser(request);
  if (result instanceof Response) return result;

  const { id } = await params;
  const user = getUser(id);
  if (!user) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(user);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = requireSuperuser(request);
  if (result instanceof Response) return result;

  const { id } = await params;
  const body = (await request.json()) as { role?: UserRole; password?: string };

  if (body.password) {
    if (body.password.length < 6) {
      return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    const ok = await resetPassword(id, body.password);
    if (!ok) return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (body.role && (body.role === "superuser" || body.role === "user")) {
    const ok = setUserRole(id, body.role);
    if (!ok) return Response.json({ error: "User not found" }, { status: 404 });
  }

  const updated = getUser(id);
  return Response.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = requireSuperuser(request);
  if (caller instanceof Response) return caller;

  const { id } = await params;
  if (id === caller.id) {
    return Response.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  deleteUser(id);
  return new Response(null, { status: 204 });
}
