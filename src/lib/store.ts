"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  Player,
  Game,
  Season,
  AppSettings,
  Position,
  PlayerGameOverride,
  LeagueRules,
  RuleViolation,
} from "./types";
import { DEFAULT_APP_SETTINGS } from "./types";
import * as db from "./db";
import * as lineupLib from "./lineup";
import * as seasonLib from "./season";
import { getComplianceSummary } from "./rules";
import { buildAutoLineup, fillSingleInning, type AutoLineupResult } from "./autoLineup";

// ─── State shape ──────────────────────────────────────────────────────────────

type LoadingStatus = "idle" | "loading" | "ready" | "error";

type DiamondDraftState = {
  // Persistence status
  status: LoadingStatus;

  // Core data
  players: Player[];
  games: Game[];
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

  // Seasons
  createSeason: (
    params: Pick<Season, "name" | "teamName" | "year">
  ) => Promise<Season>;
  setActiveSeason: (seasonId: string) => Promise<void>;
  deleteSeason: (id: string) => Promise<void>;

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

  // Auto-lineup
  autoFillGame: (gameId: string) => Promise<AutoLineupResult>;
  autoFillInning: (gameId: string, inning: number) => Promise<AutoLineupResult>;

  // Compliance
  revalidate: (gameId: string) => void;

  // Data management
  exportBackup: () => Promise<db.FullBackup>;
  importBackup: (backup: db.FullBackup) => Promise<void>;
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
        const [players, games, seasons, settings] = await Promise.all([
          db.getAllPlayers(),
          db.getAllGames(),
          db.getAllSeasons(),
          db.getSettings(),
        ]);
        set((s) => {
          s.players = players;
          s.games = games;
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
      await db.saveSettings(next);
    },

    updateLeagueRules: async (updates) => {
      const next = {
        ...get().settings,
        leagueRules: { ...get().settings.leagueRules, ...updates },
      };
      set((s) => {
        s.settings = next;
      });
      await db.saveSettings(next);
    },

    // ── Players ────────────────────────────────────────────────────────────
    addPlayer: async (params) => {
      const player = seasonLib.createPlayer(params);
      set((s) => {
        s.players.push(player);
      });
      await db.savePlayer(player);
      return player;
    },

    updatePlayer: async (id, updates) => {
      const existing = get().players.find((p) => p.id === id);
      if (!existing) return;
      const updated = seasonLib.updatePlayer(existing, updates);
      set((s) => {
        const idx = s.players.findIndex((p) => p.id === id);
        if (idx >= 0) s.players[idx] = updated;
      });
      await db.savePlayer(updated);
    },

    removePlayer: async (id) => {
      set((s) => {
        s.players = s.players.filter((p) => p.id !== id);
      });
      await db.deletePlayer(id);
    },

    // ── Seasons ────────────────────────────────────────────────────────────
    createSeason: async (params) => {
      const season = seasonLib.createSeason(params);
      set((s) => {
        s.seasons.push(season);
      });
      await db.saveSeason(season);
      return season;
    },

    setActiveSeason: async (seasonId) => {
      const next = { ...get().settings, activeSeasonId: seasonId };
      set((s) => {
        s.settings = next;
      });
      await db.saveSettings(next);
    },

    deleteSeason: async (id) => {
      set((s) => {
        s.seasons = s.seasons.filter((s2) => s2.id !== id);
        if (s.settings.activeSeasonId === id) {
          s.settings.activeSeasonId = null;
        }
      });
      await db.deleteSeason(id);
    },

    // ── Games ──────────────────────────────────────────────────────────────
    createGame: async (params, totalInnings) => {
      const { players, settings, seasons } = get();
      const innings = totalInnings ?? settings.leagueRules.defaultInnings;
      const game = lineupLib.createEmptyGame(params, players, innings);

      // Attach to active season
      const activeSeasonId = settings.activeSeasonId;
      if (activeSeasonId) {
        const season = seasons.find((s) => s.id === activeSeasonId);
        if (season) {
          const updated = seasonLib.addGameToSeason(season, game.id);
          set((s) => {
            const idx = s.seasons.findIndex((s2) => s2.id === activeSeasonId);
            if (idx >= 0) s.seasons[idx] = updated;
          });
          await db.saveSeason(seasons.find((s) => s.id === activeSeasonId)!);
        }
      }

      set((s) => {
        s.games.push(game);
        s.activeGameId = game.id;
      });
      await db.saveGame(game);
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
      await db.saveGame(updated);
    },

    deleteGame: async (id) => {
      const { seasons } = get();
      // Remove from season
      const updatedSeasons = seasons.map((s) =>
        seasonLib.removeGameFromSeason(s, id)
      );
      set((s) => {
        s.games = s.games.filter((g) => g.id !== id);
        s.seasons = updatedSeasons;
        if (s.activeGameId === id) s.activeGameId = null;
      });
      await Promise.all([
        db.deleteGame(id),
        ...updatedSeasons.map(db.saveSeason),
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
        db.saveGame(updatedGame),
        db.savePlayers(updatedPlayers),
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
      await db.saveGame(updated);
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
      await db.saveGame(updated);
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
      await db.saveGame(updated);
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
      await db.saveGame(updated);
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
      await db.saveGame(updated);
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
      await db.saveGame(updated);
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
      await db.saveGame(updated);
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
      await db.saveGame(updated);
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

      const updated: Game = {
        ...game,
        innings: result.innings,
        updatedAt: new Date().toISOString(),
      };
      set((s) => {
        const idx = s.games.findIndex((g) => g.id === gameId);
        if (idx >= 0) s.games[idx] = updated;
      });
      await db.saveGame(updated);
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
      await db.saveGame(updated);
      get().revalidate(gameId);
      return {
        innings: updatedInnings,
        log: [`Inning ${inning} auto-filled.`],
        feasible: true,
        warnings: [],
      };
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
    exportBackup: () => db.exportAllData(),

    importBackup: async (backup) => {
      await db.importAllData(backup);
      await get().loadAll();
    },

    clearAllData: async () => {
      await db.clearAllData();
      set((s) => {
        s.players = [];
        s.games = [];
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

export const selectActiveSeason = (
  state: DiamondDraftState
): Season | undefined => {
  if (!state.settings.activeSeasonId) return undefined;
  return state.seasons.find((s) => s.id === state.settings.activeSeasonId);
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
