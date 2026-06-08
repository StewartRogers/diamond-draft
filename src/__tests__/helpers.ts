/**
 * Shared test helpers and factories for Diamond Draft test suite.
 */
import type { Player, Game, LeagueRules, InningAssignment } from "@/lib/types";
import { DEFAULT_LEAGUE_RULES } from "@/lib/types";
import { createEmptyInning } from "@/lib/lineup";

// ─── Player factory ───────────────────────────────────────────────────────────

let _playerSeq = 0;

export function makePlayer(overrides: Partial<Player> = {}): Player {
  _playerSeq++;
  return {
    id: `player-${_playerSeq}`,
    firstName: `Player`,
    lastInitial: String.fromCharCode(64 + (_playerSeq % 26 || 26)),
    jerseyNumber: String(_playerSeq),
    eligiblePositions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
    isGuest: false,
    pitchingLimitSeason: 0,
    pitchingLimitGame: 0,
    pitchingLog: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Reset the player sequence counter (call in beforeEach if needed). */
export function resetPlayerSeq() {
  _playerSeq = 0;
}

// ─── Roster factory ───────────────────────────────────────────────────────────

/** Build a roster of n players, all eligible everywhere by default. */
export function makeRoster(n: number, overrides: Partial<Player> = {}): Player[] {
  return Array.from({ length: n }, () => makePlayer(overrides));
}

// ─── Rules factory ────────────────────────────────────────────────────────────

export function makeRules(overrides: Partial<LeagueRules> = {}): LeagueRules {
  return { ...DEFAULT_LEAGUE_RULES, ...overrides };
}

// ─── Innings factory ──────────────────────────────────────────────────────────

export function makeInnings(n: number): InningAssignment[] {
  return Array.from({ length: n }, (_, i) => createEmptyInning(i + 1));
}

// ─── Game stub (for rules/validation context) ─────────────────────────────────

export const GAME_STUB: Pick<Game, "id"> = { id: "test-game-id" };
