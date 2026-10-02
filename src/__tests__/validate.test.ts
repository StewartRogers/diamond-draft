import { describe, it, expect } from "vitest";
import {
  BackupSchema,
  GameSchema,
  PlayerSchema,
  SeasonSchema,
  SettingsSchema,
  TeamSchema,
  parseBody,
} from "@/lib/server/validate";
import { createPlayer, createSeason, createTeam } from "@/lib/season";
import { createEmptyGame } from "@/lib/lineup";
import { DEFAULT_APP_SETTINGS } from "@/lib/types";
import { makePlayer, makeRoster } from "./helpers";

// Everything the UI creates must pass the API schemas, or saves would fail.
describe("schemas accept app-created objects", () => {
  const player = createPlayer({
    firstName: "Sam",
    lastInitial: "R",
    jerseyNumber: "7",
    eligiblePositions: ["P", "SS", "Bench"],
    positionRatings: { P: 1, SS: 2 },
    defenseRating: 3,
    isGuest: false,
    pitchingLimitSeason: 0,
    pitchingLimitGame: 3,
  });
  const team = createTeam({ name: "Bears", headCoach: "Coach" });

  it("player", () => {
    expect(PlayerSchema.safeParse(player).success).toBe(true);
    expect(PlayerSchema.safeParse(makePlayer()).success).toBe(true);
  });

  it("game", () => {
    const game = createEmptyGame({ date: "2026-06-01", opponent: "Cubs" }, makeRoster(10), 6);
    game.gameStats = {
      hitting: [{ playerId: player.id, plateAppearances: 3, hits: 1, walks: 1 }],
      pitching: [{ playerId: player.id, inningsPitched: 2.1, pitches: 40, strikeouts: 3, hitsAllowed: 2, walksAllowed: 1 }],
    };
    expect(GameSchema.safeParse(game).success).toBe(true);
  });

  it("team, season and settings", () => {
    const season = createSeason({ name: "2026", teamId: team.id, teamName: team.name, year: 2026, roster: [player.id] });
    season.depthChart = { SS: [player.id] };
    expect(TeamSchema.safeParse(team).success).toBe(true);
    expect(SeasonSchema.safeParse(season).success).toBe(true);
    expect(SettingsSchema.safeParse(DEFAULT_APP_SETTINGS).success).toBe(true);
  });

  it("v1 backups without teams or season team fields", () => {
    const result = BackupSchema.safeParse({
      players: [makePlayer()],
      games: [],
      seasons: [{ id: "s1", name: "Old", year: 2025, createdAt: "2025-01-01" }],
      settings: { ...DEFAULT_APP_SETTINGS, activeTeamId: undefined },
    });
    expect(result.success).toBe(true);
  });
});

describe("schemas reject bad input", () => {
  it("unknown positions and out-of-range ratings", () => {
    expect(PlayerSchema.safeParse(makePlayer({ eligiblePositions: ["QB" as never] })).success).toBe(false);
    expect(PlayerSchema.safeParse(makePlayer({ defenseRating: 9 as never })).success).toBe(false);
  });

  it("ids with unexpected characters", () => {
    expect(PlayerSchema.safeParse(makePlayer({ id: "../etc" })).success).toBe(false);
  });

  it("oversized strings", () => {
    expect(PlayerSchema.safeParse(makePlayer({ notes: "x".repeat(5000) })).success).toBe(false);
  });

  it("strips unknown keys", () => {
    const parsed = PlayerSchema.parse({ ...makePlayer(), isAdmin: true });
    expect(parsed).not.toHaveProperty("isAdmin");
  });
});

describe("parseBody", () => {
  const post = (body: unknown) =>
    new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

  it("returns parsed data for a valid body", async () => {
    const team = createTeam({ name: "Bears" });
    expect(await parseBody(post(team), TeamSchema)).toEqual(team);
  });

  it("returns 400 with issue paths for an invalid body", async () => {
    const res = (await parseBody(post({ id: "t1" }), TeamSchema)) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues.map((i: { path: string }) => i.path)).toContain("name");
  });
});
