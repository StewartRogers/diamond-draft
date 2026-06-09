# Diamond Draft Test Coverage Catalogue

Generated: 2026-06-08

## Coverage Legend
- **Tested** — solid coverage in existing test files
- **Partial** — some cases covered, edge cases missing
- **New** — added by this pass
- **Untested** — no coverage (store actions require jsdom/server)

---

## src/lib/lineup.ts

| Function | Status | Classification | Priority |
|---|---|---|---|
| `createEmptyInning` | Tested | Unit | Low |
| `createEmptyGame` | Tested | Unit | Low |
| `assignPlayerToSlot` | Tested | Unit | Medium |
| `clearPlayerFromInning` | Tested | Unit | Medium |
| `swapPlayersInInning` | Tested → New (edge) | Unit | Medium |
| `copyInning` | Tested → New (lock edge) | Unit | Medium |
| `toggleSlotLock` | Tested → New | Unit | Medium |
| `addInning` | Tested → New | Unit | Low |
| `removeLastInning` | Tested → New | Unit | Low |
| `upsertPlayerOverride` | Tested → New | Unit | High |
| `removePlayerOverride` | Tested → New | Unit | High |
| `upsertPitchCatchAssignment` | Partial → New | Unit | High |
| `applyWarmupBullpen` | Partial → New (many branches) | Unit | Critical |
| `mergeRosterIntoSnapshot` | Tested | Unit | Medium |
| `formatPlayerName` | Tested | Unit | Low |
| `formatPlayerShort` | Tested | Unit | Low |
| `getPlayerPositionInInning` | Tested | Unit | Low |
| `getPlayerGamePositions` | Tested | Unit | Low |

### applyWarmupBullpen branches not previously covered:
- Pitcher in inning 1 (no warmup inning) — New
- Clearing a pitcher (null) — unlocks N-1 bullpen — New
- Bullpen-P in N-1 locked to *different* player — skip — New
- Catcher in a locked field slot in N-1 — don't move — New
- Multiple pitchers across innings — New

---

## src/lib/rules.ts

| Function | Status | Classification | Priority |
|---|---|---|---|
| `validateInning` | Tested | Unit | Critical |
| `validateGame` | Tested | Unit | Critical |
| `getComplianceSummary` | Tested | Unit | High |
| `maxConsecutiveBench = 0` guard | **Untested → New** | Unit | Critical |
| `maxConsecutiveBench = 1` boundary | Tested | Unit | High |
| `maxConsecutiveBench = 2` | **Untested → New** | Unit | High |
| Absent player: no fair-play violation | **Untested → New** | Unit | High |
| Late arrival: pre-arrival innings excluded | **Untested → New** | Unit | High |
| Early departure: post-departure excluded | **Untested → New** | Unit | High |

---

## src/lib/autoLineup.ts

| Function | Status | Classification | Priority |
|---|---|---|---|
| `buildAutoLineup` — happy path | Tested | Unit | Critical |
| `buildAutoLineup` — force-bench fallback | **Untested → New** | Unit | Critical |
| `buildAutoLineup` — `maxConsecutiveBench = 0` | **Untested → New** | Unit | Critical |
| `buildAutoLineup` — `maxConsecutiveBench = 1` | Partial | Unit | High |
| `buildAutoLineup` — `maxConsecutiveBench = 2` | **Untested → New** | Unit | High |
| `buildAutoLineup` — 0 available players | **Untested → New** | Unit | High |
| `buildAutoLineup` — 1-player roster | **Untested → New** | Unit | Medium |
| `buildAutoLineup` — 15-player roster, 6 innings | **Untested → New** | Unit | High |
| `buildAutoLineup` — all players absent | **Untested → New** | Unit | Medium |
| `fillSingleInning` | Partial | Unit | Medium |

---

## src/lib/store.ts (Zustand — requires jsdom/server to test directly)

| Action | Status | Classification | Priority | Notes |
|---|---|---|---|---|
| `loadAll` | Untested | Integration | High | Needs server |
| `updateSettings` | Untested | Integration | Medium | Needs server |
| `addPlayer` / `updatePlayer` / `removePlayer` | Untested | Integration | Medium | Needs server |
| `createSeason` / `deleteSeason` | Untested | Integration | Medium | Needs server |
| `createGame` | Untested | Integration | High | Needs server |
| `deleteGame` | Untested | Integration | Critical | Needs server; pure logic tested via season lib |
| `finalizeGame` | Untested | Integration | High | Needs server |
| `setPitchCatchAssignment` → `applyWarmupBullpen` | **Pure logic tested → New** | Unit | Critical |
| `autoFillGame` → `applyWarmupBullpen` | **Pure logic tested → New** | Unit | Critical |
| `assignPlayer` / `swapPlayers` / `copyInning` | Untested (Zustand) | Integration | Medium | Pure logic tested |
| `toggleSlotLock` | Untested (Zustand) | Integration | Low | Pure logic tested |
| `addInning` / `removeLastInning` | Untested (Zustand) | Integration | Low | Pure logic tested |
| `revalidate` | Untested | Integration | Medium | Delegates to rules.ts |
| `exportBackup` / `importBackup` / `clearAllData` | Untested | Integration | Low | Needs server |

### Cannot be covered without browser/server:
- All store actions that call `api.*` (fetch calls) require either a real server or a mock fetch environment.
- `useDiamondDraftStore` requires `jsdom` for the React/Zustand hooks environment.
- API routes (`/api/games`, `/api/games/[id]`) require a running Next.js server.

---

## src/lib/api.ts
All functions are thin fetch wrappers — untested, require server. Classification: Integration/E2E. Priority: Medium.

---

## Priority Summary

| Priority | Count | Notes |
|---|---|---|
| Critical | 8 | force-bench, warmup branches, maxConsecutiveBench=0, deleteGame logic |
| High | 12 | boundary conditions, edge cases |
| Medium | 10 | display helpers, store pure-logic wrappers |
| Low | 8 | factory functions already well-tested |
| Cannot test without server | ~20 store actions + all API routes | E2E scope |
