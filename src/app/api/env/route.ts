import { requireSuperuser } from "@/lib/server/auth";
import { getVercelEnv, validateEnv } from "@/lib/server/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireSuperuser(request);
  if (auth instanceof Response) return auth;

  const vercel = getVercelEnv();
  const validation = validateEnv();

  return Response.json({ vercel, validation });
}
