import { GoogleGenAI } from "@google/genai";
import { getGame, getAllPlayers } from "@/lib/server/db";
import type { GamePitchCatchAssignment } from "@/lib/types";

export const runtime = "nodejs";

type PlanRequest = {
  gameId: string;
  prompt: string;
};

type PlanResponse = {
  assignments: GamePitchCatchAssignment[];
  notes: string[];
};

function makeModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

export async function POST(request: Request) {
  const body = (await request.json()) as PlanRequest;
  const gameId = typeof body.gameId === "string" ? body.gameId.slice(0, 128) : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 500) : "";
  if (!gameId) return new Response("Missing gameId", { status: 400 });

  const game = getGame(gameId);
  if (!game) return new Response("Game not found", { status: 404 });

  const players = getAllPlayers();
  const roster = game.rosterSnapshot.map((player) => {
    const live = players.find((p) => p.id === player.id) ?? player;
    return {
      id: live.id,
      name: `${live.firstName} ${live.lastInitial}.`,
      eligiblePositions: live.eligiblePositions,
      pitchingLimitGame: live.pitchingLimitGame,
      pitchingLimitSeason: live.pitchingLimitSeason,
      isGuest: live.isGuest,
    };
  });

  const schema = {
    type: "object",
    properties: {
      assignments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            inning: { type: "integer" },
            pitcherId: { type: ["string", "null"] },
            catcherId: { type: ["string", "null"] },
          },
          required: ["inning", "pitcherId", "catcherId"],
          additionalProperties: false,
        },
      },
      notes: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["assignments", "notes"],
    additionalProperties: false,
  } as const;

  const ai = makeModel();
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "You are helping build a youth baseball lineup.",
              "Generate only pitcher/catcher assignments for each inning.",
              "Use the provided roster IDs exactly. Return null for a slot if the request is impossible or ambiguous.",
              `Game innings: ${game.innings.length}`,
              `Roster: ${JSON.stringify(roster)}`,
              `User request: ${prompt}`,
            ].join("\n"),
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    },
  });

  let parsed: PlanResponse;
  try {
    parsed = JSON.parse(response.text || "{}") as PlanResponse;
  } catch {
    return new Response("AI returned invalid JSON", { status: 502 });
  }

  // Only accept player IDs that actually belong to this game's roster.
  // The model can hallucinate or be prompted to inject arbitrary strings.
  const rosterIds = new Set(roster.map((p) => p.id));
  const assignments = (parsed.assignments ?? [])
    .filter((item) => item.inning >= 1 && item.inning <= game.innings.length)
    .map((item) => ({
      inning: item.inning,
      pitcherId: item.pitcherId && rosterIds.has(item.pitcherId) ? item.pitcherId : null,
      catcherId: item.catcherId && rosterIds.has(item.catcherId) ? item.catcherId : null,
    }))
    .sort((a, b) => a.inning - b.inning);

  return Response.json({
    assignments,
    notes: parsed.notes ?? [],
  } satisfies PlanResponse);
}
