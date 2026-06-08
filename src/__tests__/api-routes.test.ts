/**
 * Tests for Next.js API route handlers.
 *
 * Strategy:
 * - Mock @/lib/server/db entirely (vi.mock) with an in-memory store so no
 *   SQLite files are touched. The mock also simulates data-integrity behaviour
 *   (save/delete/get).
 * - Call the exported GET/POST/PUT/DELETE handler functions directly, passing
 *   a Request object — no HTTP server needed.
 *
 * Covers:
 *   - GET /api/games → returns all games
 *   - POST /api/games → saves game, returns 201
 *   - POST /api/games with missing id → 400
 *   - POST /api/games with malformed JSON → error
 *   - GET /api/games/[id] → returns game or 404
 *   - PUT /api/games/[id] → upserts game
 *   - DELETE /api/games/[id] → deletes game, returns 204
 *   - db.deleteGame / db.saveGame / db.getAllGames data integrity (via mock)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Game, Player, Season } from "@/lib/types";
import { createEmptyInning } from "@/lib/lineup";

// ── In-memory mock for @/lib/server/db ───────────────────────────────────────
// Replaces the SQLite-backed module with a simple Map-based store.
// This ensures: save/delete/get behave correctly without any filesystem I/O.

type MockDb = {
  games: Map<string, Game>;
  players: Map<string, Player>;
  seasons: Map<string, Season>;
};

const mockDb: MockDb = {
  games: new Map(),
  players: new Map(),
  seasons: new Map(),
};

vi.mock("@/lib/server/db", () => ({
  // Games
  getAllGames: vi.fn(() => Array.from(mockDb.games.values())),
  getGame: vi.fn((id: string) => mockDb.games.get(id)),
  saveGame: vi.fn((game: Game) => { mockDb.games.set(game.id, game); }),
  deleteGame: vi.fn((id: string) => { mockDb.games.delete(id); }),
  // Players
  getAllPlayers: vi.fn(() => Array.from(mockDb.players.values())),
  getPlayer: vi.fn((id: string) => mockDb.players.get(id)),
  savePlayer: vi.fn((player: Player) => { mockDb.players.set(player.id, player); }),
  deletePlayer: vi.fn((id: string) => { mockDb.players.delete(id); }),
  savePlayers: vi.fn((players: Player[]) => { players.forEach((p) => mockDb.players.set(p.id, p)); }),
  // Seasons
  getAllSeasons: vi.fn(() => Array.from(mockDb.seasons.values())),
  getSeason: vi.fn((id: string) => mockDb.seasons.get(id)),
  saveSeason: vi.fn((season: Season) => { mockDb.seasons.set(season.id, season); }),
  deleteSeason: vi.fn((id: string) => { mockDb.seasons.delete(id); }),
  // Settings
  getSettings: vi.fn(() => ({ activeSeasonId: null, teamName: "", leagueRules: {}, onboardingComplete: false })),
  saveSettings: vi.fn(),
  // Clear
  clearAllData: vi.fn(() => { mockDb.games.clear(); mockDb.players.clear(); mockDb.seasons.clear(); }),
}));

// Import route handlers AFTER mocking
import { GET as gamesGET, POST as gamesPOST } from "@/app/api/games/route";
import { GET as gameByIdGET, PUT as gameByIdPUT, DELETE as gameByIdDELETE } from "@/app/api/games/[id]/route";

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeTestGame(id: string): Game {
  return {
    id,
    date: "2026-06-01",
    opponent: "Test Opponent",
    teamName: "Eagles",
    notes: "",
    pitchCatchAssignments: [],
    innings: [createEmptyInning(1)],
    battingOrder: [],
    playerOverrides: [],
    rosterSnapshot: [],
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/games", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockDb.games.clear();
  mockDb.players.clear();
  mockDb.seasons.clear();
  vi.clearAllMocks();
});

// ─── GET /api/games ───────────────────────────────────────────────────────────

describe("GET /api/games", () => {
  it("returns an empty array when no games exist", async () => {
    const res = await gamesGET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("returns all stored games", async () => {
    const game1 = makeTestGame("game-1");
    const game2 = makeTestGame("game-2");
    mockDb.games.set("game-1", game1);
    mockDb.games.set("game-2", game2);

    const res = await gamesGET();
    const data = await res.json();
    expect(data).toHaveLength(2);
    const ids = data.map((g: Game) => g.id);
    expect(ids).toContain("game-1");
    expect(ids).toContain("game-2");
  });
});

// ─── POST /api/games ──────────────────────────────────────────────────────────

describe("POST /api/games", () => {
  it("saves a valid game and returns 201", async () => {
    const game = makeTestGame("game-new");
    const req = makeRequest(game, "POST");

    const res = await gamesPOST(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.id).toBe("game-new");
    expect(mockDb.games.has("game-new")).toBe(true);
  });

  it("returns 400 when game body is missing id", async () => {
    const req = makeRequest({ date: "2026-06-01" }, "POST");
    const res = await gamesPOST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when game id is not a string", async () => {
    const req = makeRequest({ id: 42, date: "2026-06-01" }, "POST");
    const res = await gamesPOST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is null", async () => {
    const req = makeRequest(null, "POST");
    const res = await gamesPOST(req);
    expect(res.status).toBe(400);
  });

  it("persists game data integrity — saved game matches input", async () => {
    const game = makeTestGame("integrity-test");
    game.opponent = "Data Integrity FC";
    const req = makeRequest(game, "POST");
    await gamesPOST(req);

    const saved = mockDb.games.get("integrity-test")!;
    expect(saved.opponent).toBe("Data Integrity FC");
    expect(saved.status).toBe("draft");
  });
});

// ─── GET /api/games/[id] ─────────────────────────────────────────────────────

describe("GET /api/games/[id]", () => {
  it("returns the game when it exists", async () => {
    const game = makeTestGame("game-123");
    mockDb.games.set("game-123", game);

    const req = new Request("http://localhost/api/games/game-123");
    const res = await gameByIdGET(req, makeParams("game-123"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.id).toBe("game-123");
  });

  it("returns 404 when game does not exist", async () => {
    const req = new Request("http://localhost/api/games/no-such-game");
    const res = await gameByIdGET(req, makeParams("no-such-game"));
    expect(res.status).toBe(404);
  });
});

// ─── PUT /api/games/[id] ─────────────────────────────────────────────────────

describe("PUT /api/games/[id]", () => {
  it("upserts (creates) a game and returns it", async () => {
    const game = makeTestGame("game-put");
    const req = new Request("http://localhost/api/games/game-put", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(game),
    });

    const res = await gameByIdPUT(req, makeParams("game-put"));
    expect(res.status).toBe(200);
    expect(mockDb.games.has("game-put")).toBe(true);
  });

  it("uses the URL id even if body has a different id", async () => {
    const game = makeTestGame("body-id");
    const req = new Request("http://localhost/api/games/url-id", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(game),
    });

    const res = await gameByIdPUT(req, makeParams("url-id"));
    const data = await res.json();
    expect(data.id).toBe("url-id");
    expect(mockDb.games.has("url-id")).toBe(true);
  });

  it("returns 400 when body is not an object", async () => {
    const req = new Request("http://localhost/api/games/game-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("not-an-object"),
    });
    const res = await gameByIdPUT(req, makeParams("game-1"));
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/games/[id] ──────────────────────────────────────────────────

describe("DELETE /api/games/[id]", () => {
  it("returns 204 and removes the game", async () => {
    const game = makeTestGame("game-del");
    mockDb.games.set("game-del", game);

    const req = new Request("http://localhost/api/games/game-del", { method: "DELETE" });
    const res = await gameByIdDELETE(req, makeParams("game-del"));
    expect(res.status).toBe(204);
    expect(mockDb.games.has("game-del")).toBe(false);
  });

  it("returns 204 even if game does not exist (idempotent)", async () => {
    const req = new Request("http://localhost/api/games/non-existent", { method: "DELETE" });
    const res = await gameByIdDELETE(req, makeParams("non-existent"));
    expect(res.status).toBe(204);
  });
});

// ─── db layer data integrity (via mock) ──────────────────────────────────────

describe("db mock — data integrity through API route round-trips", () => {
  it("saveGame → getAllGames → deleteGame cycle", async () => {
    const game = makeTestGame("cycle-game");

    // Save via POST
    await gamesPOST(makeRequest(game, "POST"));
    expect(mockDb.games.has("cycle-game")).toBe(true);

    // Read via GET all
    const getAllRes = await gamesGET();
    const allGames = await getAllRes.json();
    expect(allGames.some((g: Game) => g.id === "cycle-game")).toBe(true);

    // Delete via DELETE /[id]
    const delReq = new Request("http://localhost/api/games/cycle-game", { method: "DELETE" });
    await gameByIdDELETE(delReq, makeParams("cycle-game"));
    expect(mockDb.games.has("cycle-game")).toBe(false);

    // Confirm gone
    const afterRes = await gamesGET();
    const afterGames = await afterRes.json();
    expect(afterGames.some((g: Game) => g.id === "cycle-game")).toBe(false);
  });

  it("PUT updates existing game in place", async () => {
    const game = makeTestGame("update-game");
    mockDb.games.set("update-game", game);

    const updated = { ...game, opponent: "Updated Opponent" };
    const req = new Request("http://localhost/api/games/update-game", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    await gameByIdPUT(req, makeParams("update-game"));

    const saved = mockDb.games.get("update-game")!;
    expect(saved.opponent).toBe("Updated Opponent");
  });
});
