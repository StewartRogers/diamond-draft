import { v4 as uuidv4 } from "uuid";
import type {
  Game,
  Player,
  Season,
  PlayerSeasonStats,
  Position,
  PitchingLogEntry,
} from "./types";
import { FIELD_POSITIONS } from "./types";

// ─── Season CRUD ──────────────────────────────────────────────────────────────

export function createSeason(
  params: Pick<Season, "name" | "teamName" | "year">
): Season {
  return {
    id: uuidv4(),
    ...params,
    gameIds: [],
    createdAt: new Date().toISOString(),
  };
}

export function addGameToSeason(season: Season, gameId: string): Season {
  if (season.gameIds.includes(gameId)) return season;
  return { ...season, gameIds: [...season.gameIds, gameId] };
}

export function removeGameFromSeason(season: Season, gameId: string): Season {
  return { ...season, gameIds: season.gameIds.filter((id) => id !== gameId) };
}

// ─── Player CRUD ──────────────────────────────────────────────────────────────

export function createPlayer(
  params: Pick<
    Player,
    | "firstName"
    | "lastInitial"
    | "jerseyNumber"
    | "eligiblePositions"
    | "positionRatings"
    | "defenseRating"
    | "isGuest"
    | "pitchingLimitSeason"
    | "pitchingLimitGame"
  >
): Player {
  return {
    id: uuidv4(),
    ...params,
    pitchingLog: [],
    createdAt: new Date().toISOString(),
  };
}

export function updatePlayer(player: Player, updates: Partial<Player>): Player {
  return { ...player, ...updates };
}

// ─── Pitching log ─────────────────────────────────────────────────────────────

/**
 * After a game is finalized, record each player's pitching innings into their
 * season-level pitching log. Returns an updated player array.
 */
export function recordPitchingFromGame(
  players: Player[],
  game: Game
): Player[] {
  return players.map((player) => {
    const inningsPitched = game.innings.reduce((sum, inn) => {
      const slot = inn.slots.find(
        (s) =>
          s.playerId === player.id &&
          (s.position === "P" || s.position === "Bullpen - P")
      );
      return sum + (slot ? 1 : 0);
    }, 0);

    if (inningsPitched === 0) return player;

    // Remove existing entry for this game (idempotent re-finalize)
    const filteredLog = player.pitchingLog.filter(
      (e) => e.gameId !== game.id
    );
    const newEntry: PitchingLogEntry = {
      gameId: game.id,
      date: game.date,
      innings: inningsPitched,
    };

    return { ...player, pitchingLog: [...filteredLog, newEntry] };
  });
}

// ─── Season statistics ────────────────────────────────────────────────────────

/**
 * Compute cumulative season stats for all players across the provided games.
 * Only finalized games are included.
 */
export function computeSeasonStats(
  players: Player[],
  games: Game[]
): PlayerSeasonStats[] {
  const finalizedGames = games.filter((g) => g.status === "finalized");

  return players.map((player) => {
    let gamesPlayed = 0;
    let inningsInField = 0;
    let inningsOnBench = 0;
    let inningsPitched = 0;
    const positionCounts: Partial<Record<Position, number>> = {};

    for (const game of finalizedGames) {
      const override = game.playerOverrides.find(
        (o) => o.playerId === player.id
      );
      if (override?.status === "absent") continue;

      let appearedInGame = false;

      for (const inn of game.innings) {
        const slot = inn.slots.find((s) => s.playerId === player.id);
        if (!slot) continue;

        appearedInGame = true;
        const pos = slot.position;
        positionCounts[pos] = (positionCounts[pos] ?? 0) + 1;

        if ((FIELD_POSITIONS as readonly string[]).includes(pos)) {
          inningsInField++;
        } else if (pos === "Bench") {
          inningsOnBench++;
        }

        if (pos === "P" || pos === "Bullpen - P") {
          inningsPitched++;
        }
      }

      if (appearedInGame) gamesPlayed++;
    }

    return {
      playerId: player.id,
      gamesPlayed,
      inningsInField,
      inningsOnBench,
      inningsPitched,
      positionCounts,
    };
  });
}

/**
 * Get a per-game breakdown for a single player.
 */
export type PlayerGameRecord = {
  gameId: string;
  date: string;
  opponent?: string;
  assignments: Array<{ inning: number; position: Position }>;
  inningsInField: number;
  inningsPitched: number;
};

export function getPlayerGameHistory(
  playerId: string,
  games: Game[]
): PlayerGameRecord[] {
  return games
    .filter((g) => g.status === "finalized")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((game) => {
      const assignments: Array<{ inning: number; position: Position }> = [];
      let inningsInField = 0;
      let inningsPitched = 0;

      for (const inn of game.innings) {
        const slot = inn.slots.find((s) => s.playerId === playerId);
        if (!slot) continue;
        assignments.push({ inning: inn.inning, position: slot.position });
        if ((FIELD_POSITIONS as readonly string[]).includes(slot.position)) {
          inningsInField++;
        }
        if (slot.position === "P" || slot.position === "Bullpen - P") {
          inningsPitched++;
        }
      }

      return {
        gameId: game.id,
        date: game.date,
        opponent: game.opponent,
        assignments,
        inningsInField,
        inningsPitched,
      };
    })
    .filter((r) => r.assignments.length > 0);
}

// ─── Pitching eligibility ─────────────────────────────────────────────────────

/**
 * Returns true if the player is eligible to pitch in the upcoming game based on
 * the rest rule (pitchingRestInnings from rules) applied to their recent log.
 * "innings pitched in the last game" ≥ restInnings → ineligible.
 */
export function isPitchingEligible(
  player: Player,
  upcomingGameDate: string,
  restInnings: number
): boolean {
  if (restInnings === 0) return true;
  if (player.pitchingLog.length === 0) return true;

  // Find the most recent game before the upcoming game
  const sorted = [...player.pitchingLog]
    .filter((e) => e.date < upcomingGameDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) return true;

  const lastGame = sorted[0];
  return lastGame.innings < restInnings;
}

// ─── Export helpers ───────────────────────────────────────────────────────────

/**
 * Produce a CSV string of season stats for all players.
 */
export function exportSeasonStatsCsv(
  players: Player[],
  stats: PlayerSeasonStats[]
): string {
  const statsMap = new Map(stats.map((s) => [s.playerId, s]));
  const header = [
    "Name",
    "Jersey",
    "Games Played",
    "Field Innings",
    "Bench Innings",
    "Innings Pitched",
  ].join(",");

  const rows = players.map((p) => {
    const s = statsMap.get(p.id);
    return [
      `"${p.firstName} ${p.lastInitial}."`,
      p.jerseyNumber,
      s?.gamesPlayed ?? 0,
      s?.inningsInField ?? 0,
      s?.inningsOnBench ?? 0,
      s?.inningsPitched ?? 0,
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

/**
 * Produce a CSV string for a single game lineup grid.
 * Columns: Name, #, Inning 1, Inning 2, ...
 */
export function exportGameLineupCsv(game: Game): string {
  const players = game.rosterSnapshot;
  const totalInnings = game.innings.length;

  const header = [
    "Name",
    "#",
    ...Array.from({ length: totalInnings }, (_, i) => `Inning ${i + 1}`),
  ].join(",");

  const rows = players.map((p) => {
    const cols = game.innings.map((inn) => {
      const slot = inn.slots.find((s) => s.playerId === p.id);
      return slot ? slot.position : "";
    });
    return [`"${p.firstName} ${p.lastInitial}."`, p.jerseyNumber, ...cols].join(",");
  });

  return [header, ...rows].join("\n");
}
