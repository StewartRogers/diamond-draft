/**
 * Verifies that statistics are derived purely from recorded game participation,
 * so "season" vs "career" is just a matter of which games are aggregated — there
 * are no separately maintained totals. Mirrors how the dashboard feeds
 * season-scoped vs. all games into the same compute path.
 */
import { describe, it, expect } from "vitest";
import { computeSeasonStats } from "@/lib/season";
import { makePlayer } from "./helpers";
import type { Game, InningAssignment, FieldPosition } from "@/lib/types";

function fieldGame(id: string, playerId: string, position: FieldPosition = "1B"): Game {
  const innings: InningAssignment[] = [
    { inning: 1, slots: [{ position, playerId }] },
    { inning: 2, slots: [{ position, playerId }] },
  ];
  return {
    id,
    date: "2026-06-01",
    pitchCatchAssignments: [],
    innings,
    battingOrder: [playerId],
    playerOverrides: [],
    rosterSnapshot: [],
    status: "finalized",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

describe("computeSeasonStats — season vs career scope", () => {
  it("aggregates exactly the games it is given", () => {
    const p = makePlayer({ id: "p1" });
    const gameA = fieldGame("gA", "p1"); // e.g. team-season A
    const gameB = fieldGame("gB", "p1"); // e.g. team-season B

    // Season scope: just one season's games.
    const season = computeSeasonStats([p], [gameA])[0];
    // Career scope: every game across teams/seasons.
    const career = computeSeasonStats([p], [gameA, gameB])[0];

    expect(season.gamesPlayed).toBe(1);
    expect(season.inningsInField).toBe(2);
    expect(career.gamesPlayed).toBe(2);
    expect(career.inningsInField).toBe(4);
  });

  it("ignores draft (non-finalized) games", () => {
    const p = makePlayer({ id: "p1" });
    const draft: Game = { ...fieldGame("gD", "p1"), status: "draft" };
    expect(computeSeasonStats([p], [draft])[0].gamesPlayed).toBe(0);
  });

  it("excludes a player marked absent for a game", () => {
    const p = makePlayer({ id: "p1" });
    const game: Game = {
      ...fieldGame("gAbs", "p1"),
      playerOverrides: [{ playerId: "p1", status: "absent" }],
    };
    expect(computeSeasonStats([p], [game])[0].gamesPlayed).toBe(0);
  });
});
