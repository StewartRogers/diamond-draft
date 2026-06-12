# Diamond Draft

A local-first web app for youth baseball coaches to build rule-compliant game lineups. Runs entirely on your own machine — no account, no cloud, no subscription required.

## Features

### Roster management
- Add players with jersey number, eligible positions, per-position skill tier (Primary / Secondary / Can play), and an overall defensive rating (1–4)
- Set per-game and season pitching inning limits per player
- Mark players as guests (+1)

### Game lineup builder
- Two views: **Grid** (all players × all innings) and **Field** (visual diamond, one inning at a time)
- **Manual editing** — click a filled position to bench the player immediately; click a bench slot to pick from available positions; drag rows to reorder the batting order
- **Auto-fill** — one-click solver fills the entire lineup while respecting all configured rules; produces a copyable reasoning log
- **Lineup check** — validate the current lineup for violations without making any changes
- **Player availability** — mark players absent, arriving late (from inning N), or leaving early (through inning N); auto-fill and validation account for availability automatically
- **Pitcher / Catcher plan** — lock P/C assignments per inning before running auto-fill; the rest of the lineup is built around them
- **AI assist** — describe your pitcher/catcher plan in plain English ("Jake pitches innings 1 and 3, never back-to-back") and Gemini fills in the P/C slots (requires API key)
- **Print export** — one-page print-ready lineup card (7-inning format)

### Rules engine
All rules are configurable in Settings and enforced by both auto-fill and the validator:

| Rule | Default |
|---|---|
| Minimum 2 innings on the field per player | On |
| No back-to-back bench innings | On |
| Per-game and per-season pitching inning caps | Per-player |
| No pitching after catching | Off |
| Position eligibility enforcement | On |
| Balanced field time across fully-available players | On |

### Data & backup
- All data stored locally in SQLite (`data/diamond-draft.sqlite3`) — no internet required
- Full JSON backup export and import from the Settings page
- Seasons group games; statistics like season pitching totals carry across games

---

## Installation

**Prerequisites:** [Node.js](https://nodejs.org/) v20+ and npm.

```bash
git clone <repo-url>
cd diamond-draft
npm install
npm run dev
```

Open [http://localhost:4000](http://localhost:4000). The app seeds a sample 9-player roster on first run.

### Accessing from another device on your network (phone, tablet)

The dev server only allows connections from `localhost` by default. To access it from another device:

1. Find your machine's local IP (e.g. `10.0.0.5`)
2. Add it to `.env`:
   ```
   ALLOWED_DEV_ORIGINS=10.0.0.5
   ```
3. Start the dev server with `--hostname 0.0.0.0` or add it to the `dev` script, then open `http://<your-ip>:4000` on the other device

### Production build

```bash
npm run build
npm start          # serves on port 4000
```

### Environment variables

Copy `.env.example` to `.env` and fill in as needed:

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | No | Enables the AI pitcher/catcher planning feature (Google Gemini) |
| `GEMINI_MODEL` | No | Override the Gemini model (default: `gemini-2.5-flash-lite`) |
| `ALLOWED_DEV_ORIGINS` | No | Comma-separated LAN IPs allowed to reach the dev server |
| `DIAMOND_DRAFT_DATA_DIR` | No | Override the SQLite data directory (default: `./data`) |

---

## Architecture

```
Browser (React 19 + Zustand)
  └─ src/lib/store.ts        — all client state; calls REST API via api.ts
       └─ src/lib/api.ts      — thin fetch wrappers
            └─ src/app/api/   — Next.js route handlers (runtime: "nodejs")
                 └─ src/lib/server/db.ts  — better-sqlite3; stores all entities as JSON blobs
```

### Key source locations

| Path | What lives here |
|---|---|
| `src/lib/types.ts` | All domain types: Player, Game, InningAssignment, LeagueRules, etc. |
| `src/lib/lineup.ts` | Pure functions for mutating innings (assign, swap, copy, bullpen warm-up) |
| `src/lib/rules.ts` | Violation checker — `validateInning`, `validateGame`, `getComplianceSummary` |
| `src/lib/autoLineup.ts` | Two-phase greedy solver (hard constraints → soft scoring) |
| `src/lib/store.ts` | Zustand store — single source of truth on the client |
| `src/lib/server/db.ts` | SQLite access (server-only; seeds default roster on first run) |
| `src/components/game/LineupBuilder.tsx` | Main interactive lineup editor |
| `src/components/game/lineup/` | Grid view, field view, popovers, shared types and adapters |
| `src/app/api/` | REST endpoints for players, games, seasons, settings, and AI pitch plan |
| `src/__tests__/` | Vitest unit suite; `COVERAGE.md` maps coverage status |

### Data model

SQLite stores each entity (`players`, `games`, `seasons`, `settings`) as a single JSON blob in a two-column table (`id`, `data`). There is no ORM and no migrations — schema changes are handled by re-seeding or manual migration of the JSON.

The lineup builder maintains a local `Schedule` (`Record<playerId, CellValue[]>`) in React state, converted to/from the `InningAssignment[]` model via `gameToSchedule` / `scheduleToInnings` in `src/components/game/lineup/shared.ts`. Changes persist immediately via `updateGameInnings`.

---

## Development scripts

```bash
npm run dev          # dev server at http://localhost:4000
npm test             # vitest unit suite (fast, no server needed)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run build        # production build
npm run eval         # live Gemini evals — requires GEMINI_API_KEY
```

Run a single test file:
```bash
npx vitest run src/__tests__/rules.test.ts
```

---

## License

See [LICENSE](LICENSE).
