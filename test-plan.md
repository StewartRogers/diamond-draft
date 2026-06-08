# Diamond Draft — Test Plan

## Overview

Diamond Draft is a local-first Next.js app for youth baseball coaches to manage
game lineups. This plan covers unit and integration testing of the pure
business-logic layer. Browser/E2E tests are out of scope (no Playwright wired up).

---

## Key User Flows

| Flow | Description |
|---|---|
| Create game | Initialise innings, roster snapshot, batting order |
| Mark player absent / late / earlyLeave | Override availability for the game |
| Auto-fill lineup | `buildAutoLineup` — greedy solver across all innings |
| Fill single inning | `fillSingleInning` — mid-game re-fill |
| Manually assign / swap / copy | Direct slot edits: assign, clear, swap, copy inning |
| Lock / unlock slots | Prevent auto-fill from overwriting a decision |
| Warm-up bullpen | `applyWarmupBullpen` — pre-game pitcher/catcher setup |
| Validate lineup | `validateInning` / `validateGame` — rule-violation checker |
| Print / export | UI concern only; no business logic to test |
| Delete game | Store action; covered at integration layer |

---

## Test Layers

### Unit — pure functions (covered in this suite)

All tests live in `src/__tests__/`.

#### `lineup.test.ts` — `src/lib/lineup.ts`

| Group | What is tested |
|---|---|
| `createEmptyInning` | Inning number, all 9 field + 3 special positions, null player ids |
| `createEmptyGame` | Innings count, batting order sorted by jersey number, status=draft, snapshot stored |
| `assignPlayerToSlot` | Assigns to correct inning/position, leaves others untouched, immutability, clear with null |
| `clearPlayerFromInning` | Removes player from all slots in target inning; other innings untouched |
| `swapPlayersInInning` | Swaps two players; safe with one empty slot |
| `copyInning` | Copies assignments; respects locked slots (respectLocks=true/false) |
| `toggleSlotLock` | Locks and unlocks |
| `addInning` / `removeLastInning` | Append/trim; won't remove last inning |
| `upsertPlayerOverride` | Add new, update existing |
| `removePlayerOverride` | Removes matching, no-op for unknown |
| `applyWarmupBullpen` | Core warm-up logic — see below |
| `mergeRosterIntoSnapshot` | Live players included, guest-only players kept, no duplicates |
| Display helpers | `formatPlayerName`, `formatPlayerShort`, `getPlayerPositionInInning`, `getPlayerGamePositions` |

**`applyWarmupBullpen` detail (10 cases):**

- Pitcher in inning N → Bullpen-P in inning N-1, locked
- Catcher in inning N → Bullpen-C in inning N-1, locked
- Pitcher removed from other non-locked slots in warm-up inning
- Locked conflicting Bullpen-P slot is NOT overwritten
- Inning 1 pitcher has no warm-up (no inning 0)
- Clearing pitcher (null) → Bullpen-P and Bullpen-C in N-1 unlocked and cleared
- Three-inning chain (innings 2 and 3 each get their respective warm-up in 1 and 2)
- Pitcher locked in a non-bullpen slot in warm-up inning stays in that slot

#### `rules.test.ts` — `src/lib/rules.ts`

| Group | Violation codes tested |
|---|---|
| Field player counts | `TOO_FEW_FIELD_PLAYERS`, `TOO_MANY_FIELD_PLAYERS` |
| Duplicate positions | `DUPLICATE_POSITION` (extra slot injected with same position) |
| Player multiple positions | `PLAYER_MULTIPLE_POSITIONS` |
| Player availability — absent | `PLAYER_ABSENT_ASSIGNED` |
| Player availability — late | `PLAYER_NOT_YET_ARRIVED` |
| Player availability — early leave | `PLAYER_ALREADY_DEPARTED` |
| Player availability — valid late arrival | No violation when assigned after arrival inning |
| Position eligibility | `INELIGIBLE_POSITION`; suppressed when rule disabled |
| Game pitching limit (personal) | `EXCEEDS_GAME_PITCH_LIMIT` |
| Game pitching limit (global fallback) | `EXCEEDS_GAME_PITCH_LIMIT` |
| Season pitching limit | `EXCEEDS_SEASON_PITCH_LIMIT` (per-inning and full-game) |
| Pitching rest | `PITCHING_TOO_SOON`; no violation with sufficient rest |
| No pitching after catching | `PITCHING_AFTER_CATCHING`; suppressed when rule disabled |
| Back-to-back bench | `BACK_TO_BACK_BENCH`; suppressed when maxConsecutiveBench=0 |
| Fair play time (game-level) | `INSUFFICIENT_FIELD_TIME`; absent player excluded |
| Season pitch limit (game-level) | `EXCEEDS_SEASON_PITCH_LIMIT` cross-check |
| `getComplianceSummary` | valid=true when clean; valid=false on errors; warning count separate |

#### `autoLineup.test.ts` — `src/lib/autoLineup.ts`

| Group | What is tested |
|---|---|
| Basic feasibility | feasible=true for full roster; every player gets a slot; innings count matches; log count matches |
| Pitching limits | Per-player game limit; global game limit; season limit |
| Pitching rest | No back-to-back pitching appearances when `pitchingRestInnings=1` |
| No pitching after catching | No player pitches after catching (rule enabled) |
| Back-to-back bench | No player exceeds `maxConsecutiveBench=1` |
| Fair play time | Every active player meets `minFieldInningsPerPlayer`; absent player excluded |
| Availability — absent | Player gets zero slots |
| Availability — late | No slots before arrival inning; has slots from arrival inning onward |
| Availability — earlyLeave | No slots after departure inning |
| Position eligibility | Only eligible positions assigned when rule enabled |
| Locked slots | Locked player/position preserved; no double-assignment |
| Edge cases | Empty player list (infeasible); single inning; 15-player roster (all assigned somewhere) |

---

## What Is NOT Covered

| Area | Reason |
|---|---|
| Zustand store actions (`store.ts`) | Requires jsdom / React environment; no store tests wired up |
| `fillSingleInning` | Thin wrapper around `buildAutoLineup`; covered implicitly |
| `season.ts` | Aggregation helpers; straightforward reduce logic; low risk |
| API routes (`api.ts`, `server/`) | Requires SQLite / Next.js request context |
| UI components | Requires Playwright or React Testing Library |
| Print / export | UI concern only |

---

## Running the Tests

```bash
npm test           # vitest run (exits after one pass)
npx vitest         # watch mode during development
```

Configuration: `vitest.config.ts` at repo root; path alias `@/*` → `./src/*`.

---

## Test Results (as of initial run)

- **95 tests across 3 files — all pass**
- 0 failures, 0 skipped
