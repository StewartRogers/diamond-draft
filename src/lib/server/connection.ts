import "server-only";

import { createClient, type Client } from "@libsql/client";
import path from "path";
import fs from "fs";

const globalConn = globalThis as typeof globalThis & {
  __dd_clients?: Map<string, Client>;
  __dd_wal_set?: boolean;
};

function isTurso(): boolean {
  return !!process.env.TURSO_DATABASE_URL;
}

export function getSharedClient(cacheKey: string): Client {
  if (!globalConn.__dd_clients) globalConn.__dd_clients = new Map();
  const cached = globalConn.__dd_clients.get(cacheKey);
  if (cached) return cached;

  let client: Client;
  if (isTurso()) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    const dataDir = process.env.DIAMOND_DRAFT_DATA_DIR ?? path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    client = createClient({
      url: `file:${path.join(dataDir, "diamond-draft.sqlite3")}`,
    });
  }

  globalConn.__dd_clients.set(cacheKey, client);
  return client;
}

export async function ensureWalMode(client: Client): Promise<void> {
  if (isTurso() || globalConn.__dd_wal_set) return;
  await client.execute("PRAGMA journal_mode = WAL");
  globalConn.__dd_wal_set = true;
}
