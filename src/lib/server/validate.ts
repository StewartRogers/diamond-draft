import "server-only";

import { z } from "zod";
import { ALL_POSITIONS, FIELD_POSITIONS, SPECIAL_POSITIONS } from "@/lib/types";
import type { AppSettings, Game, Player, Season, Team } from "@/lib/types";
import { readJson, DEFAULT_MAX_BODY_BYTES } from "./http";

// Request-body schemas for the data API. They mirror the domain types in
// `types.ts`, strip unknown keys, and bound every string/array so a direct API
// caller can only store data the UI could have produced.

const MAX_INNINGS = 99;
const MAX_ROSTER = 100;

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const id = z.string().regex(ID_RE, "Invalid id");

export function isValidId(value: string): boolean {
  return ID_RE.test(value);
}
const str = (max: number) => z.string().max(max);
/** Optional string that also accepts null from older data, stored as absent. */
const optStr = (max: number) =>
  z.string().max(max).nullish().transform((v) => v ?? undefined);
const timestamp = str(64);
const nonNeg = (max: number) => z.number().min(0).max(max);

const position = z.enum([...FIELD_POSITIONS, ...SPECIAL_POSITIONS]);
const fieldPosition = z.enum(FIELD_POSITIONS);

// ─── Player ───────────────────────────────────────────────────────────────────

export const PlayerSchema = z.object({
  id,
  firstName: str(100),
  lastInitial: str(20),
  jerseyNumber: z.union([str(20), z.number()]).transform(String),
  eligiblePositions: z.array(position).max(ALL_POSITIONS.length),
  positionRatings: z
    .partialRecord(fieldPosition, z.union([z.literal(1), z.literal(2), z.literal(3)]))
    .optional(),
  defenseRating: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  isGuest: z.boolean(),
  pitchingLimitSeason: nonNeg(1000),
  pitchingLimitGame: nonNeg(1000),
  pitchingLog: z
    .array(z.object({ gameId: id, date: str(64), innings: nonNeg(1000) }))
    .max(1000),
  notes: optStr(2000),
  createdAt: timestamp,
});

// ─── Game ─────────────────────────────────────────────────────────────────────

const inning = z.number().int().min(1).max(MAX_INNINGS);

export const GameSchema = z.object({
  id,
  date: str(64).min(1),
  opponent: optStr(200),
  teamName: optStr(200),
  notes: optStr(5000),
  pitchCatchAssignments: z
    .array(z.object({ inning, pitcherId: id.nullable(), catcherId: id.nullable() }))
    .max(MAX_INNINGS)
    .default([]),
  innings: z
    .array(
      z.object({
        inning,
        slots: z
          .array(
            z.object({
              position,
              playerId: id.nullable(),
              locked: z.boolean().optional(),
            })
          )
          .max(MAX_ROSTER),
      })
    )
    .max(MAX_INNINGS),
  battingOrder: z.array(id).max(MAX_ROSTER),
  playerOverrides: z
    .array(
      z.object({
        playerId: id,
        status: z.enum(["active", "absent", "late", "earlyLeave"]),
        inning: inning.optional(),
      })
    )
    .max(MAX_ROSTER),
  rosterSnapshot: z.array(PlayerSchema).max(MAX_ROSTER),
  gameStats: z
    .object({
      hitting: z
        .array(
          z.object({
            playerId: id,
            plateAppearances: nonNeg(1000),
            hits: nonNeg(1000),
            walks: nonNeg(1000),
          })
        )
        .max(MAX_ROSTER),
      pitching: z
        .array(
          z.object({
            playerId: id,
            inningsPitched: nonNeg(1000),
            pitches: nonNeg(10000),
            strikeouts: nonNeg(1000),
            hitsAllowed: nonNeg(1000),
            walksAllowed: nonNeg(1000),
          })
        )
        .max(MAX_ROSTER),
    })
    .optional(),
  externalId: optStr(64),
  status: z.enum(["draft", "finalized"]),
  createdAt: timestamp,
  updatedAt: timestamp,
});

// ─── Team / Season ────────────────────────────────────────────────────────────

export const TeamSchema = z.object({
  id,
  name: str(200),
  headCoach: optStr(200),
  leagueDivision: optStr(200),
  createdAt: timestamp,
});

export const SeasonSchema = z.object({
  id,
  name: str(200),
  teamId: id,
  teamName: str(200),
  year: nonNeg(9999),
  roster: z.array(id).max(500),
  depthChart: z.partialRecord(fieldPosition, z.array(id).max(MAX_ROSTER)).optional(),
  gameIds: z.array(id).max(5000),
  createdAt: timestamp,
});

// ─── Settings ─────────────────────────────────────────────────────────────────

const LeagueRulesSchema = z.object({
  id: str(128),
  name: str(200),
  defaultInnings: nonNeg(1000),
  minFieldPlayers: nonNeg(1000),
  maxFieldPlayers: nonNeg(1000),
  maxConsecutiveBench: nonNeg(1000),
  minFieldInningsPerPlayer: nonNeg(1000),
  globalPitchingLimitGame: nonNeg(1000),
  pitchingRestInnings: nonNeg(1000),
  enforcePositionEligibility: z.boolean(),
  enforceFairPlayTime: z.boolean(),
  enforceNoPitchingAfterCatching: z.boolean(),
});

export const SettingsSchema = z.object({
  activeTeamId: id.nullable(),
  activeSeasonId: id.nullable(),
  teamName: str(200),
  headCoach: optStr(200),
  leagueDivision: optStr(200),
  leagueRules: LeagueRulesSchema,
  onboardingComplete: z.boolean(),
});

// ─── Backup ───────────────────────────────────────────────────────────────────

// v1 backups predate teams: seasons may lack team/roster fields and settings
// may lack the active-team fields. `migrateToMultiTeam()` fills those in.
export const BackupSchema = z.object({
  players: z.array(PlayerSchema).max(5000).default([]),
  games: z.array(GameSchema).max(5000).default([]),
  teams: z.array(TeamSchema).max(500).default([]),
  seasons: z
    .array(
      SeasonSchema.partial({ teamId: true, teamName: true, roster: true, gameIds: true })
    )
    .max(1000)
    .default([]),
  settings: SettingsSchema.partial({ activeTeamId: true, activeSeasonId: true }).optional(),
});

// Compile-time checks that the schemas stay assignable to the domain types.
type AssignableTo<Target, Value extends Target> = Value;
export type SchemaTypeChecks = [
  AssignableTo<Player, z.infer<typeof PlayerSchema>>,
  AssignableTo<Game, z.infer<typeof GameSchema>>,
  AssignableTo<Team, z.infer<typeof TeamSchema>>,
  AssignableTo<Season, z.infer<typeof SeasonSchema>>,
  AssignableTo<AppSettings, z.infer<typeof SettingsSchema>>,
];

/**
 * Reads a JSON body and validates it against `schema`. Returns the parsed
 * value, or a 400/413 Response that the route handler should return directly.
 */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<z.infer<S> | Response> {
  const raw = await readJson<unknown>(request, maxBytes);
  if (raw instanceof Response) return raw;
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 10).map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return Response.json({ error: "Invalid request body", issues }, { status: 400 });
  }
  return result.data;
}
