import { getSettings, saveSettings } from "@/lib/server/db";
import type { AppSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getSettings());
}

export async function PUT(request: Request) {
  const settings = (await request.json()) as AppSettings;
  saveSettings(settings);
  return Response.json(settings);
}

