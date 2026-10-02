import { GoogleGenAI } from "@google/genai";
import { getGame, getAllPlayers } from "@/lib/server/db";
import { requireUser, isAiRateLimited } from "@/lib/server/auth";
import type { GamePitchCatchAssignment } from "@/lib/types";
import { readJson } from "@/lib/server/http";

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
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson<PlanRequest>(request);
  if (body instanceof Response) return body;
  const gameId = typeof body?.gameId === "string" ? body.gameId.slice(0, 128) : null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.slice(0, 500) : "";
  if (!gameId) return new Response("Missing gameId", { status: 400 });

  // Each call costs Gemini quota; cap per-user usage.
  if (await isAiRateLimited(auth.id)) {
    return new Response("Too many AI requests. Try again later.", { status: 429 });
  }

  const game = await getGame(gameId);
  if (!game) return new Response("Game not found", { status: 404 });

  const players = await getAllPlayers();
  const roster = game.rosterSnapshot.map((player) => {
    const live = players.find((p) => p.id === player.id) ?? player;
    return {
      id: live.id,
      name: `${live.firstName} ${live.lastInitial}`,
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

  let ai: GoogleGenAI;
  try {
    ai = makeModel();
  } catch {
    return new Response("AI is not configured", { status: 503 });
  }
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
  const systemContext = [
    "You are helping build a youth baseball lineup.",
    "Generate only pitcher/catcher assignments for each inning.",
    "Use the provided roster IDs exactly. Return null for a slot if the request is impossible or ambiguous.",
    `Game innings: ${game.innings.length}`,
    `Roster: ${JSON.stringify(roster)}`,
  ].join("\n");
  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ text: systemContext }],
        },
        {
          role: "model",
          parts: [{ text: "Understood. Ready to generate assignments. What is your request?" }],
        },
        {
          role: "user",
          parts: [{ text: prompt || "Please generate balanced assignments." }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });
  } catch {
    return new Response("AI request failed", { status: 502 });
  }

  let parsed: PlanResponse;
  try {
    parsed = JSON.parse(response.text || "{}") as PlanResponse;
  } catch {
    return new Response("AI returned invalid JSON", { status: 502 });
  }

  // Only accept player IDs that actually belong to this game's roster.
  // The model can hallucinate or be prompted to inject arbitrary strings.
  const rosterIds = new Set(roster.map((p) => p.id));
  const rawAssignments = Array.isArray(parsed?.assignments) ? parsed.assignments : [];
  const assignments = rawAssignments
    .filter((item) => item && typeof item === "object" && Number.isInteger(item.inning))
    .filter((item) => item.inning >= 1 && item.inning <= game.innings.length)
    .map((item) => ({
      inning: item.inning,
      pitcherId: item.pitcherId && rosterIds.has(item.pitcherId) ? item.pitcherId : null,
      catcherId: item.catcherId && rosterIds.has(item.catcherId) ? item.catcherId : null,
    }))
    .sort((a, b) => a.inning - b.inning);

  return Response.json({
    assignments,
    notes: Array.isArray(parsed?.notes)
      ? parsed.notes.filter((n): n is string => typeof n === "string").slice(0, 20).map((n) => n.slice(0, 500))
      : [],
  } satisfies PlanResponse);
}
