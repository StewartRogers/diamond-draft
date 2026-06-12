# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # dev server at http://localhost:4000
npm test             # vitest unit suite (fast, node environment, no server needed)
npm run eval         # live Gemini evals — requires GEMINI_API_KEY, slow (60s timeout per case)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run build        # production Next.js build
npm start            # serve production build on port 4000
```

Run a single test file:
```bash
npx vitest run src/__tests__/rules.test.ts
```

## Architecture

### Data flow

The app is **local-first**: all data lives in `data/diamond-draft.sqlite3`. There is no backend beyond the Next.js API routes running in the same process.

```
Browser (React + Zustand)
  └─ src/lib/store.ts          ← all client state; calls api.ts fetch wrappers
       └─ src/lib/api.ts        ← thin fetch wrappers for the REST API
            └─ src/app/api/     ← Next.js route handlers (runtime: "nodejs")
                 └─ src/lib/server/db.ts  ← better-sqlite3; stores everything as JSON blobs
```

The Zustand store (`store.ts`) is the single source of truth on the client. It holds players, games, seasons, and settings. Components read from it with selectors; mutations go through store actions which call `api.ts` and update local state.

### Data model

- **Player** — roster member with `eligiblePositions`, per-position `positionRatings` (1–3), `defenseRating` (1–4), per-game/season pitching limits, and a `pitchingLog`.
- **Game** — has `innings: InningAssignment[]` (each with `slots: InningSlot[]` for all 9 field positions + Bench + 2 Bullpen slots), a `battingOrder`, `playerOverrides` (absent/late/earlyLeave), and `pitchCatchAssignments` (the pitcher/catcher plan used to lock autofill).
- **Season** — groups games; tracks `activeSeasonId` in settings.
- SQLite stores each entity as a single JSON blob (`data` column). The schema is flat: `players`, `games`, `seasons`, `settings` tables, each with `id TEXT PRIMARY KEY, data TEXT`.

### Business logic (`src/lib/`)

| File | Purpose |
|---|---|
| `types.ts` | All domain types and constants (positions, rules, defaults) |
| `lineup.ts` | Pure functions for mutating innings — `assignPlayerToSlot`, `swapPlayersInInning`, `copyInning`, `applyWarmupBullpen`, etc. |
| `rules.ts` | Violation checker — `validateInning` / `validateGame` / `getComplianceSummary`. Contains all league rule logic. |
| `autoLineup.ts` | Two-phase greedy solver. Phase 1: hard constraints (eligibility, limits, availability, locked slots). Phase 2: soft scoring (fair play, bench distribution, position variety). Works inning-by-inning, carrying forward cumulative `PlayerState`. |
| `season.ts` | Season and player factory helpers |
| `server/db.ts` | SQLite access (server-only). Seeds a default 9-player roster on first run. `DIAMOND_DRAFT_DATA_DIR` env var overrides the data directory. |

### Lineup builder UI (`src/components/game/lineup/`)

`LineupBuilder.tsx` holds all interactive state. It maintains a local `schedule: Schedule` (a `Record<playerId, CellValue[]>` indexed by inning) that is synced from/to the game data model via two adapters in `shared.ts`:

- `gameToSchedule(game, players)` — converts `InningAssignment[]` → `Schedule`
- `scheduleToInnings(schedule, baseInnings)` — converts `Schedule` → `InningAssignment[]` for persistence

Cell interaction model (as of latest):
- **Clicking a field-position cell** benches the player immediately (no popover).
- **Clicking a bench cell** opens `CellPopover` — shows that player's eligible positions to pick from.
- **Clicking an empty field chip** (field view) opens `PositionPopover` — picks from eligible players.
- **Clicking a filled chip** (field view) benches the player immediately.

### API routes (`src/app/api/`)

All routes use `export const runtime = "nodejs"` (required for `better-sqlite3`). They are thin: validate input, delegate to `server/db.ts`, return JSON. The one AI route (`/api/ai/pitch-plan`) calls Google Gemini and returns `GamePitchCatchAssignment[]`.

### Environment variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Required for AI pitch-plan feature only |
| `GEMINI_MODEL` | Gemini model override (default `gemini-2.5-flash-lite`) |
| `ALLOWED_DEV_ORIGINS` | Comma-separated LAN IPs allowed to access the dev server (e.g. `10.0.0.73`) |
| `DIAMOND_DRAFT_DATA_DIR` | Override the SQLite data directory (default: `./data`) |

## Testing

Tests live in `src/__tests__/` and run in a `node` environment (no jsdom). `server-only` imports are stubbed via `src/__tests__/stubs/server-only.ts`.

Shared factories are in `src/__tests__/helpers.ts`: `makePlayer()`, `makeRoster(n)`, `makeRules(overrides)`, `makeInnings(n)`. Use these rather than constructing objects by hand.

**What can and cannot be tested without a server:** Store actions that call `api.*` (fetch) and all API routes require a running server or mock fetch — they are integration/E2E scope. Pure business logic in `rules.ts`, `lineup.ts`, `autoLineup.ts`, and `season.ts` is unit-testable directly. See `src/__tests__/COVERAGE.md` for the full coverage map.

The eval suite (`npm run eval`) tests the Gemini pitch-plan feature against live model calls. It reads `.env` / `.env.local` for the API key automatically (see `vitest.eval.config.ts`). Skip it if the key is unavailable — the unit suite has no network dependency.
