import { getSettings, saveSettings } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import type { AppSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json(await getSettings());
}

export async function PUT(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const settings = (await request.json()) as AppSettings;
  if (!settings || typeof settings !== "object") {
    return new Response("Invalid settings body", { status: 400 });
  }
  await saveSettings(settings);
  return Response.json(settings);
}

