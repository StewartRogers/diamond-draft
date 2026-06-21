/**
 * Unit tests for the multi-team season-roster helpers in src/lib/season.ts.
 * Pure functions — no server or fetch needed.
 */
import { describe, it, expect } from "vitest";
import {
  createTeam,
  updateTeam,
  createSeason,
  addPlayerToSeasonRoster,
  removePlayerFromSeasonRoster,
  getRosterPlayers,
  setDepthChartPosition,
  pruneFromDepthChart,
} from "@/lib/season";
import { makePlayer } from "./helpers";

describe("createTeam / updateTeam", () => {
  it("creates a team with an id and timestamp", () => {
    const team = createTeam({ name: "Owls", headCoach: "Jamie" });
    expect(team.id).toBeTruthy();
    expect(team.name).toBe("Owls");
    expect(team.headCoach).toBe("Jamie");
    expect(team.createdAt).toBeTruthy();
  });

  it("applies updates immutably", () => {
    const team = createTeam({ name: "Owls" });
    const renamed = updateTeam(team, { name: "Hawks" });
    expect(renamed.name).toBe("Hawks");
    expect(team.name).toBe("Owls"); // original unchanged
    expect(renamed.id).toBe(team.id);
  });
});

describe("createSeason", () => {
  it("requires a teamId and starts with an empty roster by default", () => {
    const season = createSeason({ name: "Spring", teamId: "t1", teamName: "Owls", year: 2026 });
    expect(season.teamId).toBe("t1");
    expect(season.roster).toEqual([]);
    expect(season.gameIds).toEqual([]);
  });

  it("dedupes a provided roster", () => {
    const season = createSeason({
      name: "Spring", teamId: "t1", teamName: "Owls", year: 2026,
      roster: ["a", "b", "a", "b", "c"],
    });
    expect(season.roster).toEqual(["a", "b", "c"]);
  });
});

describe("season roster membership", () => {
  const base = createSeason({ name: "Spring", teamId: "t1", teamName: "Owls", year: 2026, roster: ["a", "b"] });

  it("adds a new player", () => {
    const next = addPlayerToSeasonRoster(base, "c");
    expect(next.roster).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when the player is already on the roster (unique per team-season)", () => {
    const next = addPlayerToSeasonRoster(base, "a");
    expect(next).toBe(base); // same reference — no change
    expect(next.roster).toEqual(["a", "b"]);
  });

  it("removes a player", () => {
    const next = removePlayerFromSeasonRoster(base, "a");
    expect(next.roster).toEqual(["b"]);
  });

  it("removing an absent player leaves the roster unchanged", () => {
    const next = removePlayerFromSeasonRoster(base, "zz");
    expect(next.roster).toEqual(["a", "b"]);
  });
});

describe("depth chart helpers", () => {
  const base = createSeason({ name: "Spring", teamId: "t1", teamName: "Owls", year: 2026, roster: ["a", "b", "c"] });

  it("sets and dedupes a position's ordered list", () => {
    const next = setDepthChartPosition(base, "SS", ["a", "b", "a", "c"]);
    expect(next.depthChart?.SS).toEqual(["a", "b", "c"]);
  });

  it("keeps positions independent", () => {
    let s = setDepthChartPosition(base, "SS", ["a", "b"]);
    s = setDepthChartPosition(s, "2B", ["c"]);
    expect(s.depthChart?.SS).toEqual(["a", "b"]);
    expect(s.depthChart?.["2B"]).toEqual(["c"]);
  });

  it("prunes a player from every position", () => {
    let s = setDepthChartPosition(base, "SS", ["a", "b"]);
    s = setDepthChartPosition(s, "2B", ["b", "c"]);
    const pruned = pruneFromDepthChart(s, "b");
    expect(pruned.depthChart?.SS).toEqual(["a"]);
    expect(pruned.depthChart?.["2B"]).toEqual(["c"]);
  });

  it("pruneFromDepthChart is a no-op (same ref) when nothing changes", () => {
    expect(pruneFromDepthChart(base, "zz")).toBe(base); // no depth chart at all
    const s = setDepthChartPosition(base, "SS", ["a"]);
    expect(pruneFromDepthChart(s, "zz")).toBe(s); // present, but player not listed
  });
});

describe("getRosterPlayers", () => {
  it("resolves roster IDs to players in roster order and skips unknown IDs", () => {
    const p1 = makePlayer({ id: "p1" });
    const p2 = makePlayer({ id: "p2" });
    const p3 = makePlayer({ id: "p3" });
    const season = createSeason({
      name: "Spring", teamId: "t1", teamName: "Owls", year: 2026,
      roster: ["p3", "p1", "missing"],
    });
    const resolved = getRosterPlayers(season, [p1, p2, p3]);
    expect(resolved.map((p) => p.id)).toEqual(["p3", "p1"]);
  });
});
