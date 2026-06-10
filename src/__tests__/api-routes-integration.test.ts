/**
 * Integration tests for the Next.js API route handlers, invoked directly as
 * functions against a real SQLite database in a temp directory.
 *
 * Covers: /api/players, /api/players/[id], /api/games/[id], /api/state,
 * and the AI pitch-plan route's output sanitization (Gemini mocked).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Game, Player } from "@/lib/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { makePlayer, makeInnings, resetPlayerSeq } from "./helpers";

// Mock the Gemini client before any route import pulls it in.
const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

let tmpDir: string;
let db: typeof import("@/lib/server/db");
let playersRoute: typeof import("@/app/api/players/route");
let playerIdRoute: typeof import("@/app/api/players/[id]/route");
let gameIdRoute: typeof import("@/app/api/games/[id]/route");
let stateRoute: typeof import("@/app/api/state/route");
let pitchPlanRoute: typeof import("@/app/api/ai/pitch-plan/route");

beforeAll(async () => {
  resetPlayerSeq();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diamond-draft-api-test-"));
  process.env.DIAMOND_DRAFT_DATA_DIR = tmpDir;
  process.env.GEMINI_API_KEY = "test-key";
  db = await import("@/lib/server/db");
  playersRoute = await import("@/app/api/players/route");
  playerIdRoute = await import("@/app/api/players/[id]/route");
  gameIdRoute = await import("@/app/api/games/[id]/route");
  stateRoute = await import("@/app/api/state/route");
  pitchPlanRoute = await import("@/app/api/ai/pitch-plan/route");
});

afterAll(() => {
  delete process.env.DIAMOND_DRAFT_DATA_DIR;
  delete process.env.GEMINI_API_KEY;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function jsonRequest(method: string, body: unknown): Request {
  if (method === "GET") return new Request("http://localhost/api/test");
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function makeGame(id: string, overrides: Partial<Game> = {}): Game {
  return {
    id,
    date: "2026-06-01",
    pitchCatchAssignments: [],
    innings: makeInnings(3),
    battingOrder: [],
    playerOverrides: [],
    rosterSnapshot: [],
    status: "draft",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("POST /api/players", () => {
  it("creates a player and returns 201", async () => {
    const player = makePlayer({ firstName: "Api" });
    const res = await playersRoute.POST(jsonRequest("POST", player));
    expect(res.status).toBe(201);
    expect(db.getPlayer(player.id)).toEqual(player);
  });

  it("rejects a player without an id", async () => {
    const res = await playersRoute.POST(jsonRequest("POST", { firstName: "NoId" }));
    expect(res.status).toBe(400);
  });
});

describe("/api/players/[id]", () => {
  it("GET returns 404 for unknown player", async () => {
    const res = await playerIdRoute.GET(jsonRequest("GET", null), params("missing"));
    expect(res.status).toBe(404);
  });

  it("PUT updates a player, forcing the URL id over the body id", async () => {
    const player = makePlayer({ firstName: "Url" });
    db.savePlayer(player);
    const res = await playerIdRoute.PUT(
      jsonRequest("PUT", { ...player, id: "spoofed-id", firstName: "Renamed" }),
      params(player.id)
    );
    expect(res.status).toBe(200);
    expect(db.getPlayer(player.id)?.firstName).toBe("Renamed");
    expect(db.getPlayer("spoofed-id")).toBeUndefined();
  });

  it("DELETE removes the player and returns 204", async () => {
    const player = makePlayer();
    db.savePlayer(player);
    const res = await playerIdRoute.DELETE(jsonRequest("DELETE", null), params(player.id));
    expect(res.status).toBe(204);
    expect(db.getPlayer(player.id)).toBeUndefined();
  });
});

describe("/api/games/[id]", () => {
  it("GET round-trips a saved game", async () => {
    const game = makeGame("api-game");
    db.saveGame(game);
    const res = await gameIdRoute.GET(jsonRequest("GET", null), params("api-game"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(game);
  });

  it("GET returns 404 for unknown game", async () => {
    const res = await gameIdRoute.GET(jsonRequest("GET", null), params("missing"));
    expect(res.status).toBe(404);
  });

  it("PUT rejects a non-object body", async () => {
    const res = await gameIdRoute.PUT(jsonRequest("PUT", null), params("api-game"));
    expect(res.status).toBe(400);
  });
});

describe("/api/state (backup / wipe)", () => {
  it("GET exports players, games, seasons, and settings", async () => {
    db.saveGame(makeGame("state-game"));
    const res = await stateRoute.GET();
    const body = await res.json();
    expect(body.games.some((g: Game) => g.id === "state-game")).toBe(true);
    expect(Array.isArray(body.players)).toBe(true);
    expect(body.settings).toBeDefined();
  });

  it("PUT restores a backup, replacing existing data", async () => {
    const player = makePlayer({ firstName: "Restored" });
    const res = await stateRoute.PUT(
      jsonRequest("PUT", {
        players: [player],
        games: [],
        seasons: [],
        settings: { ...DEFAULT_APP_SETTINGS, teamName: "Restored FC" },
      })
    );
    expect(res.status).toBe(200);
    expect(db.getAllPlayers()).toEqual([player]);
    expect(db.getGame("state-game")).toBeUndefined();
    expect(db.getSettings().teamName).toBe("Restored FC");
  });

  it("DELETE requires the wipe confirmation token", async () => {
    const res = await stateRoute.DELETE(jsonRequest("DELETE", {}));
    expect(res.status).toBe(400);
  });

  it("DELETE wipes all data when confirmed", async () => {
    db.saveGame(makeGame("wipe-me"));
    const res = await stateRoute.DELETE(jsonRequest("DELETE", { confirm: "wipe" }));
    expect(res.status).toBe(200);
    expect(db.getGame("wipe-me")).toBeUndefined();
  });
});

describe("POST /api/ai/pitch-plan", () => {
  it("rejects a missing gameId", async () => {
    const res = await pitchPlanRoute.POST(jsonRequest("POST", { prompt: "hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown game", async () => {
    const res = await pitchPlanRoute.POST(
      jsonRequest("POST", { gameId: "missing", prompt: "hi" })
    );
    expect(res.status).toBe(404);
  });

  it("filters hallucinated player ids and out-of-range innings from the model output", async () => {
    const roster: Player[] = [makePlayer({ firstName: "Real" })];
    const game = makeGame("ai-game", { rosterSnapshot: roster });
    db.saveGame(game);

    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assignments: [
          { inning: 1, pitcherId: roster[0].id, catcherId: "hallucinated-id" },
          { inning: 99, pitcherId: roster[0].id, catcherId: null },
        ],
        notes: ["ok"],
      }),
    });

    const res = await pitchPlanRoute.POST(
      jsonRequest("POST", { gameId: "ai-game", prompt: "plan" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments).toEqual([
      { inning: 1, pitcherId: roster[0].id, catcherId: null },
    ]);
    expect(body.notes).toEqual(["ok"]);
  });

  it("returns 502 when the model output is not valid JSON", async () => {
    const game = makeGame("ai-game-2", { rosterSnapshot: [makePlayer()] });
    db.saveGame(game);
    generateContent.mockResolvedValueOnce({ text: "not json{" });

    const res = await pitchPlanRoute.POST(
      jsonRequest("POST", { gameId: "ai-game-2", prompt: "plan" })
    );
    expect(res.status).toBe(502);
  });
});
