"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  Player,
  Game,
  GameStats,
  Season,
  Team,
  AppSettings,
  Position,
  FieldPosition,
  PlayerGameOverride,
  LeagueRules,
  RuleViolation,
  InningAssignment,
} from "./types";
import { DEFAULT_APP_SETTINGS } from "./types";
import * as api from "./api";
import type { FullBackup } from "./api";
import * as lineupLib from "./lineup";
import * as seasonLib from "./season";
import { getComplianceSummary } from "./rules";
import { buildAutoLineup, fillSingleInning, type AutoLineupResult } from "./autoLineup";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if the player appears anywhere in the season's depth chart. */
function hasDepthChartEntry(season: Season, playerId: string): boolean {
  const chart = season.depthChart;
  if (!chart) return false;
  return Object.values(chart).some((ids) => ids?.includes(playerId));
}

// ─── State shape ──────────────────────────────────────────────────────────────

type LoadingStatus = "idle" | "loading" | "ready" | "error";

type DiamondDraftState = {
  // Persistence status
  status: LoadingStatus;

  // Core data
  players: Player[];
  games: Game[];
  teams: Team[];
  seasons: Season[];
  settings: AppSettings;

  // Active game being edited
  activeGameId: string | null;

  // Derived / transient
  violations: RuleViolation[];
};

// ─── Actions shape ────────────────────────────────────────────────────────────

type DiamondDraftActions = {
  // Bootstrap
  loadAll: () => Promise<void>;

  // Settings
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  updateLeagueRules: (updates: Partial<LeagueRules>) => Promise<void>;

  // Players
  addPlayer: (
    params: Parameters<typeof seasonLib.createPlayer>[0]
  ) => Promise<Player>;
  updatePlayer: (id: string, updates: Partial<Player>) => Promise<void>;
  removePlayer: (id: string) => Promise<void>;

  // Teams
  createTeam: (
    params: Pick<Team, "name"> & Partial<Pick<Team, "headCoach" | "leagueDivision">>
  ) => Promise<Team>;
  updateTeam: (id: string, updates: Partial<Team>) => Promise<void>;
  deleteTeam: (id: string) => Promise<void>;
  setActiveTeam: (teamId: string) => Promise<void>;

  // Seasons
  createSeason: (
    params: Pick<Season, "name" | "teamId" | "teamName" | "year"> &
      Partial<Pick<Season, "roster">>
  ) => Promise<Season>;
  setActiveSeason: (seasonId: string) => Promise<void>;
  updateSeason: (
    id: string,
    updates: Partial<Pick<Season, "name" | "year">>
  ) => Promise<void>;
  deleteSeason: (id: string) => Promise<void>;
  addPlayerToSeasonRoster: (seasonId: string, playerId: string) => Promise<void>;
  removePlayerFromSeasonRoster: (seasonId: string, playerId: string) => Promise<void>;
  setDepthChartPosition: (
    seasonId: string,
    position: FieldPosition,
    playerIds: string[]
  ) => Promise<void>;

  // Games
  createGame: (
    params: Pick<Game, "date" | "opponent" | "teamName" | "notes">,
    totalInnings?: number
  ) => Promise<Game>;
  setActiveGame: (gameId: string | null) => void;
  updateGameMeta: (
    gameId: string,
    updates: Pick<Game, "date" | "opponent" | "teamName" | "notes">
  ) => Promise<void>;
  deleteGame: (id: string) => Promise<void>;
  finalizeGame: (gameId: string) => Promise<void>;
  reopenGame: (gameId: string) => Promise<void>;

  // Lineup builder
  assignPlayer: (
    gameId: string,
    inning: number,
    position: Position,
    playerId: string | null
  ) => Promise<void>;
  swapPlayers: (
    gameId: string,
    inning: number,
    positionA: Position,
    positionB: Position
  ) => Promise<void>;
  copyInning: (
    gameId: string,
    fromInning: number,
    toInning: number
  ) => Promise<void>;
  toggleSlotLock: (
    gameId: string,
    inning: number,
    position: Position
  ) => Promise<void>;
  addInning: (gameId: string) => Promise<void>;
  removeLastInning: (gameId: string) => Promise<void>;

  // Player game overrides
  setPlayerOverride: (
    gameId: string,
    override: PlayerGameOverride
  ) => Promise<void>;
  removePlayerOverride: (gameId: string, playerId: string) => Promise<void>;
  setPitchCatchAssignment: (
    gameId: string,
    inning: number,
    position: "P" | "C",
    playerId: string | null
  ) => Promise<void>;

  // Auto-lineup
  autoFillGame: (gameId: string) => Promise<AutoLineupResult>;
  autoFillInning: (gameId: string, inning: number) => Promise<AutoLineupResult>;

  // Batting order
  setBattingOrder: (gameId: string, order: string[]) => Promise<void>;

  // Game stats (post-game hitting / pitching)
  updateGameStats: (gameId: string, stats: GameStats) => Promise<void>;

  // External ID (used for CSV imports)
  setGameExternalId: (gameId: string, externalId: string) => Promise<void>;

  // Direct game innings update (used by LineupBuilder for batch assignments)
  updateGameInnings: (gameId: string, innings: InningAssignment[]) => Promise<void>;

  // Compliance
  revalidate: (gameId: string) => void;

  // Data management
  exportBackup: () => Promise<FullBackup>;
  importBackup: (backup: FullBackup) => Promise<void>;
  clearAllData: () => Promise<void>;
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDiamondDraftStore = create<
  DiamondDraftState & DiamondDraftActions
>()(
  immer((set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    status: "idle",
    players: [],
    games: [],
    teams: [],
    seasons: [],
    settings: DEFAULT_APP_SETTINGS,
    activeGameId: null,
    violations: [],

    // ── Bootstrap ──────────────────────────────────────────────────────────
    loadAll: async () => {
      set((s) => {
        s.status = "loading";
      });
      try {
        const { players, games, teams, seasons, settings } = await api.loadAll();
        const normalizedGames = games.map((game) => ({
          ...game,
          pitchCatchAssignments: game.pitchCatchAssignments ?? [],
        }));
        set((s) => {
          s.players = players;
          s.games = normalizedGames;
          s.teams = teams;
          s.seasons = seasons;
          s.settings = settings;
          s.status = "ready";
        });
      } catch {
        set((s) => {
          s.status = "error";
        });
      }
    },

    // ── Settings ───────────────────────────────────────────────────────────
    updateSettings: async (updates) => {
      const next = { ...get().settings, ...updates };
      set((s) => {
        s.settings = next;
      });
      await api.saveSettings(next);
    },

    updateLeagueRules: async (updates) => {
      const next = {
        ...get().settings,
        leagueRules: { ...get().settings.leagueRules, ...updates },
      };
      set((s) => {
        s.settings = next;
      });
      await api.saveSettings(next);
    },

    // ── Players ────────────────────────────────────────────────────────────
    addPlayer: async (params) => {
      const player = seasonLib.createPlayer(params);
      set((s) => {
        s.players.push(player);
      });
      await api.createPlayer(player);
      return player;
    },

    updatePlayer: async (id, updates) => {
      const existing = get().players.find((p) => p.id === id);
      if (!existing) return;
      const updated = seasonLib.updatePlayer(existing, updates);
      set((s) => {
        const idx = s.players.findIndex((p) => p.id === id);
        if (idx >= 0) s.players[idx] = updated;
        // Keep rosterSnapshots in sync so game pages reflect the latest name/data
        for (const game of s.games) {
          const si = game.rosterSnapshot.findIndex((p) => p.id === id);
          if (si >= 0) game.rosterSnapshot[si] = updated;
        }
      });
      await api.savePlayer(updated);
    },

    removePlayer: async (id) => {
      // Globally delete the player and strip them from every season roster and
      // depth chart.
      const affectedSeasons = get().seasons
        .filter((s) => s.roster.includes(id) || hasDepthChartEntry(s, id))
        .map((s) =>
          seasonLib.pruneFromDepthChart(
            seasonLib.removePlayerFromSeasonRoster(s, id),
            id
          )
        );
      set((s) => {
        s.players = s.players.filter((p) => p.id !== id);
        for (const updated of affectedSeasons) {
          const idx = s.seasons.findIndex((s2) => s2.id === updated.id);
          if (idx >= 0) s.seasons[idx] = updated;
        }
      });
      await Promise.all([
        api.deletePlayer(id),
        ...affectedSeasons.map(api.saveSeason),
      ]);
    },

    // ── Teams ──────────────────────────────────────────────────────────────
    createTeam: async (params) => {
      const team = seasonLib.createTeam(params);
      set((s) => {
        s.teams.push(team);
      });
      await api.createTeam(team);
      return team;
    },

    updateTeam: async (id, updates) => {
      const existing = get().teams.find((t) => t.id === id);
      if (!existing) return;
      const updated = seasonLib.updateTeam(existing, updates);
      set((s) => {
        const idx = s.teams.findIndex((t) => t.id === id);
        if (idx >= 0) s.teams[idx] = updated;
      });
      await api.saveTeam(updated);
    },

    deleteTeam: async (id) => {
      // Remove the team, its seasons, and those seasons' games (no orphans).
      const removedSeasons = get().seasons.filter((s) => s.teamId === id);
      const removedSeasonIds = removedSeasons.map((s) => s.id);
      const removedGameIds = [...new Set(removedSeasons.flatMap((s) => s.gameIds))];
      set((s) => {
        s.teams = s.teams.filter((t) => t.id !== id);
        s.seasons = s.seasons.filter((s2) => s2.teamId !== id);
        s.games = s.games.filter((g) => !removedGameIds.includes(g.id));
        if (s.activeGameId && removedGameIds.includes(s.activeGameId)) s.activeGameId = null;
        if (s.settings.activeTeamId === id) s.settings.activeTeamId = null;
        if (s.settings.activeSeasonId && removedSeasonIds.includes(s.settings.activeSeasonId)) {
          s.settings.activeSeasonId = null;
        }
      });
      const next = get().settings;
      await Promise.all([
        api.deleteTeam(id),
        ...removedSeasonIds.map(api.deleteSeason),
        ...removedGameIds.map(api.deleteGame),
        api.saveSettings(next),
      ]);
    },

    setActiveTeam: async (teamId) => {
      // Switch teams and default the active season to one of that team's seasons.
      const seasonsForTeam = get().seasons.filter((s) => s.teamId === teamId);
      const nextSeasonId = seasonsForTeam[0]?.id ?? null;
      const next = { ...get().settings, activeTeamId: teamId, activeSeasonId: nextSeasonId };
      set((s) => {
        s.settings = next;
      });
      await api.saveSettings(next);
    },

    // ── Seasons ────────────────────────────────────────────────────────────
    createSeason: async (params) => {
      const season = seasonLib.createSeason(params);
      set((s) => {
        s.seasons.push(season);
      });
      await api.createSeason(season);
      return season;
    },

    setActiveSeason: async (seasonId) => {
      const season = get().seasons.find((s) => s.id === seasonId);
      const next = {
        ...get().settings,
        activeSeasonId: seasonId,
        // Keep the active team in sync with the chosen season.
        activeTeamId: season?.teamId ?? get().settings.activeTeamId,
      };
      set((s) => {
        s.settings = next;
      });
      await api.saveSettings(next);
    },

    updateSeason: async (id, updates) => {
      const existing = get().seasons.find((s) => s.id === id);
      if (!existing) return;
      const updated = seasonLib.updateSeason(existing, updates);
      set((s) => {
        const idx = s.seasons.findIndex((s2) => s2.id === id);
        if (idx >= 0) s.seasons[idx] = updated;
      });
      await api.saveSeason(updated);
    },

    deleteSeason: async (id) => {
      // Remove the season and its games so nothing is left orphaned.
      const season = get().seasons.find((s) => s.id === id);
      const gameIds = season?.gameIds ?? [];
      set((s) => {
        s.seasons = s.seasons.filter((s2) => s2.id !== id);
        s.games = s.games.filter((g) => !gameIds.includes(g.id));
        if (s.activeGameId && gameIds.includes(s.activeGameId)) s.activeGameId = null;
        if (s.settings.activeSeasonId === id) {
          s.settings.activeSeasonId = null;
        }
      });
      await Promise.all([
        api.deleteSeason(id),
        ...gameIds.map(api.deleteGame),
      ]);
    },

    addPlayerToSeasonRoster: async (seasonId, playerId) => {
      const season = get().seasons.find((s) => s.id === seasonId);
      if (!season) return;
      const updated = seasonLib.addPlayerToSeasonRoster(season, playerId);
      if (updated === season) return; // already on roster — no-op
      set((s) => {
        const idx = s.seasons.findIndex((s2) => s2.id === seasonId);
        if (idx >= 0) s.seasons[idx] = updated;
      });
      await api.saveSeason(updated);
    },

    removePlayerFromSeasonRoster: async (seasonId, playerId) => {
      const season = get().seasons.find((s) => s.id === seasonId);
      if (!season) return;
      // Drop from the roster and from any depth-chart spots in this season.
      const updated = seasonLib.pruneFromDepthChart(
        seasonLib.removePlayerFromSeasonRoster(season, playerId),
        playerId
      );
      set((s) => {
        const idx = s.seasons.findIndex((s2) => s2.id === seasonId);
        if (idx >= 0) s.seasons[idx] = updated;
      });
      await api.saveSeason(updated);
    },

    setDepthChartPosition: async (seasonId, position, playerIds) => {
      const season = get().seasons.find((s) => s.id === seasonId);
      if (!season) return;
      const updated = seasonLib.setDepthChartPosition(season, position, playerIds);
      set((s) => {
        const idx = s.seasons.findIndex((s2) => s2.id === seasonId);
        if (idx >= 0) s.seasons[idx] = updated;
      });
      await api.saveSeason(updated);
    },

    // ── Games ──────────────────────────────────────────────────────────────
    createGame: async (params, totalInnings) => {
      const { players, settings, seasons, teams } = get();
      const innings = totalInnings ?? settings.leagueRules.defaultInnings;

      const activeSeasonId = settings.activeSeasonId;
      const season = activeSeasonId
        ? seasons.find((s) => s.id === activeSeasonId)
        : undefined;
      // New games draw their roster from the active season's roster (so the
      // lineup is constrained to it). Fall back to all players if no season is
      // active. rosterSnapshot then preserves this game's roster for history.
      const rosterPlayers = season
        ? seasonLib.getRosterPlayers(season, players)
        : players;
      const activeTeam = teams.find((t) => t.id === settings.activeTeamId);
      const defaultTeamName = activeTeam?.name || season?.teamName || settings.teamName;

      const game = lineupLib.createEmptyGame(
        {
          ...params,
          teamName: params.teamName?.trim() || defaultTeamName || undefined,
        },
        rosterPlayers,
        innings
      );

      // Attach to active season
      if (season) {
        const updatedSeason = seasonLib.addGameToSeason(season, game.id);
        set((s) => {
          const idx = s.seasons.findIndex((s2) => s2.id === season.id);
          if (idx >= 0) s.seasons[idx] = updatedSeason;
        });
        await api.saveSeason(updatedSeason);
      }

      set((s) => {
        s.games.push(game);
        s.activeGameId = game.id;
      });
      await api.createGame(game);
      return game;
    },

    setActiveGame: (gameId) => {
      set((s) => {
        s.activeGameId = gameId;
        s.violations = [];
      });
      if (gameId) get().revalidate(gameId);
    },

    updateGameMeta: async (gameId, updates) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updated: Game = {
        ...game,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
    },

    deleteGame: async (id) => {
      const { seasons } = get();
      const updatedSeasons = seasons.map((s) =>
        seasonLib.removeGameFromSeason(s, id)
      );
      set((s) => {
        s.games = s.games.filter((g) => g.id !== id);
        s.seasons = updatedSeasons;
        if (s.activeGameId === id) s.activeGameId = null;
      });
      await Promise.all([
        api.deleteGame(id),
        ...updatedSeasons.map(api.saveSeason),
      ]);
    },

    finalizeGame: async (gameId) => {
      const { games, players } = get();
      const game = games.find((g) => g.id === gameId);
      if (!game) return;

      const updatedGame: Game = {
        ...game,
        status: "finalized",
        updatedAt: new Date().toISOString(),
      };

      // Update pitching logs
      const updatedPlayers = seasonLib.recordPitchingFromGame(players, updatedGame);

      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updatedGame;
        s.players = updatedPlayers;
      });

      await Promise.all([
        api.saveGame(updatedGame),
        api.savePlayers(updatedPlayers),
      ]);
    },

    reopenGame: async (gameId) => {
      const { games, players } = get();
      const game = games.find((g) => g.id === gameId);
      if (!game) return;

      const updatedGame: Game = {
        ...game,
        status: "draft",
        updatedAt: new Date().toISOString(),
      };

      // Remove this game's pitching log entries so season totals don't double-count on re-finalize
      const updatedPlayers = players.map((p) => ({
        ...p,
        pitchingLog: p.pitchingLog.filter((e) => e.gameId !== gameId),
      }));

      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updatedGame;
        s.players = updatedPlayers;
      });

      await Promise.all([
        api.saveGame(updatedGame),
        api.savePlayers(updatedPlayers),
      ]);
    },

    // ── Lineup builder ─────────────────────────────────────────────────────
    assignPlayer: async (gameId, inning, position, playerId) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updatedInnings = lineupLib.assignPlayerToSlot(
        game.innings,
        inning,
        position,
        playerId
      );
      const updated: Game = {
        ...game,
        innings: updatedInnings,
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
      get().revalidate(gameId);
    },

    swapPlayers: async (gameId, inning, positionA, positionB) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updatedInnings = lineupLib.swapPlayersInInning(
        game.innings,
        inning,
        positionA,
        positionB
      );
      const updated: Game = {
        ...game,
        innings: updatedInnings,
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
      get().revalidate(gameId);
    },

    copyInning: async (gameId, fromInning, toInning) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updatedInnings = lineupLib.copyInning(
        game.innings,
        fromInning,
        toInning
      );
      const updated: Game = {
        ...game,
        innings: updatedInnings,
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
      get().revalidate(gameId);
    },

    toggleSlotLock: async (gameId, inning, position) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updatedInnings = lineupLib.toggleSlotLock(
        game.innings,
        inning,
        position
      );
      const updated: Game = {
        ...game,
        innings: updatedInnings,
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
    },

    addInning: async (gameId) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updated: Game = {
        ...game,
        innings: lineupLib.addInning(game.innings),
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
    },

    removeLastInning: async (gameId) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updated: Game = {
        ...game,
        innings: lineupLib.removeLastInning(game.innings),
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
      get().revalidate(gameId);
    },

    // ── Player overrides ───────────────────────────────────────────────────
    setPlayerOverride: async (gameId, override) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updated: Game = {
        ...game,
        playerOverrides: lineupLib.upsertPlayerOverride(
          game.playerOverrides,
          override
        ),
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
      get().revalidate(gameId);
    },

    removePlayerOverride: async (gameId, playerId) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updated: Game = {
        ...game,
        playerOverrides: lineupLib.removePlayerOverride(
          game.playerOverrides,
          playerId
        ),
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
      get().revalidate(gameId);
    },

    setPitchCatchAssignment: async (gameId, inning, position, playerId) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updatedAssignments = lineupLib.upsertPitchCatchAssignment(
        game.pitchCatchAssignments ?? [],
        inning,
        position,
        playerId
      );
      const assignedInnings = lineupLib.assignPlayerToSlot(
        game.innings,
        inning,
        position,
        playerId
      ).map((inn) =>
        inn.inning === inning
          ? {
              ...inn,
              slots: inn.slots.map((slot) =>
                slot.position === position
                  ? { ...slot, locked: playerId !== null }
                  : slot
              ),
            }
          : inn
      );
      // After assigning pitcher, apply warm-up bullpen for the preceding inning
      const updatedInnings = position === "P"
        ? lineupLib.applyWarmupBullpen(assignedInnings)
        : assignedInnings;
      const updated: Game = {
        ...game,
        pitchCatchAssignments: updatedAssignments,
        innings: updatedInnings,
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
      get().revalidate(gameId);
    },

    // ── Auto-lineup ────────────────────────────────────────────────────────
    autoFillGame: async (gameId) => {
      const { games, players, settings } = get();
      const game = games.find((g) => g.id === gameId);
      if (!game) return { innings: [], log: [], feasible: false, warnings: ["Game not found."] };

      const result = buildAutoLineup(
        players,
        game.innings,
        game.playerOverrides,
        settings.leagueRules,
        game
      );

      // Do NOT run applyWarmupBullpen here. Warmup bullpen slots are set up
      // (and locked) by setPitchCatchAssignment when the coach deliberately
      // assigns a pitcher. By the time auto-fill runs, those locked slots are
      // already present and the solver respects them. Running warmup again
      // after auto-fill would move auto-filled pitchers to Bullpen-P in the
      // preceding inning, clearing their field assignment there and producing
      // TOO_FEW_FIELD_PLAYERS violations.
      const updated: Game = {
        ...game,
        innings: result.innings,
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
      get().revalidate(gameId);
      return result;
    },

    autoFillInning: async (gameId, inning) => {
      const { games, players, settings } = get();
      const game = games.find((g) => g.id === gameId);
      if (!game) return { innings: [], log: [], feasible: false, warnings: ["Game not found."] };

      const filledInning = fillSingleInning(inning, players, game, settings.leagueRules);
      const updatedInnings = game.innings.map((inn) =>
        inn.inning === inning ? filledInning : inn
      );
      const updated: Game = {
        ...game,
        innings: updatedInnings,
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
      get().revalidate(gameId);
      return {
        innings: updatedInnings,
        log: [`Inning ${inning} auto-filled.`],
        feasible: true,
        warnings: [],
      };
    },

    // ── Direct innings update ──────────────────────────────────────────────
    updateGameInnings: async (gameId, innings) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updated: Game = { ...game, innings, updatedAt: new Date().toISOString() };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
      get().revalidate(gameId);
    },

    updateGameStats: async (gameId, stats) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updated: Game = { ...game, gameStats: stats, updatedAt: new Date().toISOString() };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
    },

    setGameExternalId: async (gameId, externalId) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updated: Game = { ...game, externalId, updatedAt: new Date().toISOString() };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
    },

    // ── Batting order management ──────────────────────────────────────────
    setBattingOrder: async (gameId, order) => {
      const game = get().games.find((g) => g.id === gameId);
      if (!game) return;
      const updated: Game = {
        ...game,
        battingOrder: order,
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await api.saveGame(updated);
    },

    // ── Compliance ─────────────────────────────────────────────────────────
    revalidate: (gameId) => {
      const { games, players, settings } = get();
      const game = games.find((g) => g.id === gameId);
      if (!game) return;
      const summary = getComplianceSummary(
        game,
        players,
        settings.leagueRules
      );
      set((s) => {
        s.violations = summary.violations;
      });
    },

    // ── Data management ────────────────────────────────────────────────────
    exportBackup: () => api.exportAllData(),

    importBackup: async (backup) => {
      await api.importAll(backup);
      await get().loadAll();
    },

    clearAllData: async () => {
      await api.clearAll();
      set((s) => {
        s.players = [];
        s.games = [];
        s.teams = [];
        s.seasons = [];
        s.settings = DEFAULT_APP_SETTINGS;
        s.activeGameId = null;
        s.violations = [];
      });
    },
  }))
);

// ─── Selector helpers ─────────────────────────────────────────────────────────

export const selectActiveGame = (
  state: DiamondDraftState
): Game | undefined => {
  if (!state.activeGameId) return undefined;
  return state.games.find((g) => g.id === state.activeGameId);
};

export const selectActiveTeam = (
  state: DiamondDraftState
): Team | undefined => {
  if (!state.settings.activeTeamId) return undefined;
  return state.teams.find((t) => t.id === state.settings.activeTeamId);
};

export const selectSeasonsByActiveTeam = (
  state: DiamondDraftState
): Season[] => {
  const teamId = state.settings.activeTeamId;
  if (!teamId) return state.seasons;
  return state.seasons.filter((s) => s.teamId === teamId);
};

export const selectActiveSeason = (
  state: DiamondDraftState
): Season | undefined => {
  if (!state.settings.activeSeasonId) return undefined;
  return state.seasons.find((s) => s.id === state.settings.activeSeasonId);
};

/** Players on the active season's roster, in roster order. Empty if no season. */
export const selectRosterPlayers = (
  state: DiamondDraftState
): Player[] => {
  const season = selectActiveSeason(state);
  if (!season) return state.players;
  return seasonLib.getRosterPlayers(season, state.players);
};

export const selectPlayerById =
  (id: string) =>
  (state: DiamondDraftState): Player | undefined =>
    state.players.find((p) => p.id === id);

export const selectGamesByActiveSeason = (
  state: DiamondDraftState
): Game[] => {
  const season = selectActiveSeason(state);
  if (!season) return state.games;
  return state.games.filter((g) => season.gameIds.includes(g.id));
};

export const selectViolationsByPlayer =
  (playerId: string) =>
  (state: DiamondDraftState): RuleViolation[] =>
    state.violations.filter((v) => v.playerId === playerId);

export const selectViolationsByInning =
  (inning: number) =>
  (state: DiamondDraftState): RuleViolation[] =>
    state.violations.filter((v) => v.inning === inning);

export const selectHasErrors = (state: DiamondDraftState): boolean =>
  state.violations.some((v) => v.severity === "error");
