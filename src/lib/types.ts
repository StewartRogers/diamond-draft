// ─── Positions ────────────────────────────────────────────────────────────────

export const FIELD_POSITIONS = [
  "P",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
] as const;

export const SPECIAL_POSITIONS = ["Bench", "Bullpen - P", "Bullpen - C"] as const;

export type FieldPosition = (typeof FIELD_POSITIONS)[number];
export type SpecialPosition = (typeof SPECIAL_POSITIONS)[number];
export type Position = FieldPosition | SpecialPosition;

export const ALL_POSITIONS: Position[] = [...FIELD_POSITIONS, ...SPECIAL_POSITIONS];

// ─── Player ───────────────────────────────────────────────────────────────────

export type PitchingLogEntry = {
  gameId: string;
  date: string;
  innings: number;
};

export type Player = {
  id: string;
  firstName: string;
  lastInitial: string;
  jerseyNumber: string;
  eligiblePositions: Position[];
  isGuest: boolean;
  /** Season-level pitching limit (innings). 0 = no limit. */
  pitchingLimitSeason: number;
  /** Per-game pitching limit (innings). 0 = no limit. */
  pitchingLimitGame: number;
  pitchingLog: PitchingLogEntry[];
  notes?: string;
  createdAt: string;
};

// ─── Game-level player status ─────────────────────────────────────────────────

export type PlayerGameStatus = "active" | "absent" | "late" | "earlyLeave";

export type PlayerGameOverride = {
  playerId: string;
  status: PlayerGameStatus;
  /** Inning number (1-based) when a late player arrives, or last inning before early departure */
  inning?: number;
};

// ─── Lineup ───────────────────────────────────────────────────────────────────

export type InningSlot = {
  position: Position;
  playerId: string | null;
  locked?: boolean;
};

export type InningAssignment = {
  inning: number;
  slots: InningSlot[];
};

// ─── Game ─────────────────────────────────────────────────────────────────────

export type GameStatus = "draft" | "finalized";

export type Game = {
  id: string;
  date: string;
  opponent?: string;
  teamName?: string;
  notes?: string;
  /** Ordered list of innings (1-based index = inning number - 1) */
  innings: InningAssignment[];
  /** Per-player status overrides for this game */
  playerOverrides: PlayerGameOverride[];
  /** Snapshot of the roster at the time of the game */
  rosterSnapshot: Player[];
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
};

// ─── Season ───────────────────────────────────────────────────────────────────

export type Season = {
  id: string;
  name: string;
  teamName: string;
  year: number;
  gameIds: string[];
  createdAt: string;
};

// ─── League Rules ─────────────────────────────────────────────────────────────

export type LeagueRules = {
  id: string;
  name: string;
  defaultInnings: number;
  minFieldPlayers: number;
  maxFieldPlayers: number;
  /** Max consecutive innings on bench before a violation */
  maxConsecutiveBench: number;
  /** Minimum innings each active player must play in the field */
  minFieldInningsPerPlayer: number;
  /** Global game pitching inning limit (0 = no limit) */
  globalPitchingLimitGame: number;
  /** Mandatory rest innings after pitching (0 = none) */
  pitchingRestInnings: number;
  enforcePositionEligibility: boolean;
  enforceFairPlayTime: boolean;
  enforceNoPitchingAfterCatching: boolean;
};

export const DEFAULT_LEAGUE_RULES: LeagueRules = {
  id: "default",
  name: "Default Rules",
  defaultInnings: 6,
  minFieldPlayers: 9,
  maxFieldPlayers: 9,
  maxConsecutiveBench: 1,
  minFieldInningsPerPlayer: 2,
  globalPitchingLimitGame: 3,
  pitchingRestInnings: 0,
  enforcePositionEligibility: true,
  enforceFairPlayTime: true,
  enforceNoPitchingAfterCatching: false,
};

// ─── App Settings ─────────────────────────────────────────────────────────────

export type AppSettings = {
  activeSeasonId: string | null;
  leagueRules: LeagueRules;
  onboardingComplete: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  activeSeasonId: null,
  leagueRules: DEFAULT_LEAGUE_RULES,
  onboardingComplete: false,
};

// ─── Validation / Rules Engine types ─────────────────────────────────────────

export type ViolationSeverity = "error" | "warning";

export type ViolationCode =
  | "BACK_TO_BACK_BENCH"
  | "EXCEEDS_GAME_PITCH_LIMIT"
  | "EXCEEDS_SEASON_PITCH_LIMIT"
  | "INELIGIBLE_POSITION"
  | "INSUFFICIENT_FIELD_TIME"
  | "PLAYER_ABSENT_ASSIGNED"
  | "PLAYER_NOT_YET_ARRIVED"
  | "PLAYER_ALREADY_DEPARTED"
  | "DUPLICATE_POSITION"
  | "MISSING_POSITION"
  | "TOO_FEW_FIELD_PLAYERS"
  | "TOO_MANY_FIELD_PLAYERS"
  | "PITCHING_AFTER_CATCHING";

export type RuleViolation = {
  code: ViolationCode;
  severity: ViolationSeverity;
  message: string;
  playerId?: string;
  inning?: number;
  position?: Position;
};

// ─── Season stats ─────────────────────────────────────────────────────────────

export type PlayerSeasonStats = {
  playerId: string;
  gamesPlayed: number;
  inningsInField: number;
  inningsOnBench: number;
  inningsPitched: number;
  positionCounts: Partial<Record<Position, number>>;
};
