import { getSettings, saveSettings } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { parseBody, SettingsSchema } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json(await getSettings());
}

export async function PUT(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const settings = await parseBody(request, SettingsSchema);
  if (settings instanceof Response) return settings;
  await saveSettings(settings);
  return Response.json(settings);
}

