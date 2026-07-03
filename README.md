# Diamond Draft

A web app for youth baseball coaches to build rule-compliant game lineups. Runs locally with SQLite or deploys to the cloud with Turso on Vercel.

## Features

### Multi-team support
- Manage multiple teams, each with its own seasons — switch between teams from the nav
- Players are a shared, global pool: the same player can appear on multiple teams' or seasons' rosters at once
- Each season has its own roster (a subset of the global player list) and its own depth chart
- A master player list page shows every player and which team-seasons they're on, with one-click add to the active season's roster
- Deleting a team cascades to its seasons and games; deleting a player prunes it from every roster and depth chart

### Roster management
- Add players with jersey number, eligible positions, per-position skill tier (Primary / Secondary / Can play), and an overall defensive rating (1–4)
- Set per-game and season pitching inning limits per player
- Mark players as guests (+1)
- **Depth chart** — a visual field diagram (excluding pitcher) for setting each position's ordered depth per season, with drag-to-reorder

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

### Authentication
- Built-in auth with no external dependencies — password hashing via Node.js `crypto.scrypt`
- First-run setup creates an initial superuser; subsequent users are managed by superusers
- Session-based authentication with httpOnly cookies (30-day expiry)
- Two roles: `superuser` (can manage users) and `user` (full read/write access to team data)

### Data & backup
- SQLite storage — local file (`data/diamond-draft.sqlite3`) or remote via Turso
- Full JSON backup export and import from the Settings page (backups include teams, players, seasons, and games)
- Teams group seasons; seasons group games and hold a per-season roster and depth chart. Statistics like season pitching totals carry across games within a season
- Existing single-team databases and backups migrate automatically into the multi-team model on first load

---

## Installation

**Prerequisites:** [Node.js](https://nodejs.org/) v20+ and npm.

```bash
git clone <repo-url>
cd diamond-draft
npm install
npm run dev
```

Open [http://localhost:4000](http://localhost:4000). On first run, the app creates a setup page to create an initial superuser account and seeds a sample 9-player roster.

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

### Deploy to Vercel + Turso

The app can be deployed to Vercel using [Turso](https://turso.tech/) for managed SQLite storage.

1. Create a Turso database and get your credentials
2. Set the following environment variables in Vercel:
   - `TURSO_DATABASE_URL` — your Turso database URL (`libsql://...`)
   - `TURSO_AUTH_TOKEN` — your Turso auth token
3. Deploy via `git push` or the Vercel dashboard
4. On first visit, complete the setup page to create a superuser

Use the built-in backup export/import feature to migrate data between local and cloud.

### Environment variables

Copy `.env.example` to `.env` and fill in as needed:

| Variable | Required | Purpose |
|---|---|---|
| `TURSO_DATABASE_URL` | On Vercel | Turso database URL (`libsql://...`) — when absent, uses local SQLite |
| `TURSO_AUTH_TOKEN` | On Vercel | Turso auth token |
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
                 └─ src/lib/server/db.ts  — @libsql/client; stores all entities as JSON blobs
```

### Key source locations

| Path | What lives here |
|---|---|
| `src/lib/types.ts` | All domain types: Player, Team, Season, Game, InningAssignment, LeagueRules, etc. |
| `src/lib/lineup.ts` | Pure functions for mutating innings (assign, swap, copy, bullpen warm-up) |
| `src/lib/rules.ts` | Violation checker — `validateInning`, `validateGame`, `getComplianceSummary` |
| `src/lib/autoLineup.ts` | Two-phase greedy solver (hard constraints → soft scoring) |
| `src/lib/season.ts` | Season/player factory helpers plus roster and depth-chart helpers |
| `src/lib/store.ts` | Zustand store — single source of truth on the client |
| `src/lib/server/db.ts` | SQLite access via @libsql/client (server-only; seeds default roster on first run; migrates legacy single-team data) |
| `src/lib/server/auth.ts` | Built-in authentication — password hashing, sessions, user CRUD, route guards |
| `src/lib/server/connection.ts` | Shared @libsql/client factory — local SQLite or remote Turso |
| `src/lib/server/env.ts` | Vercel environment detection and env var validation |
| `src/components/game/LineupBuilder.tsx` | Main interactive lineup editor |
| `src/components/game/lineup/` | Grid view, field view, popovers, shared types and adapters |
| `src/components/roster/DepthChartView.tsx` | Season depth chart — field diagram with drag-to-reorder per position |
| `src/components/TeamSeasonSwitcher.tsx` | Nav control for switching the active team/season |
| `src/app/players/page.tsx` | Master player list — all players and which team-seasons they're on |
| `src/app/api/` | REST endpoints for players, games, seasons, teams, settings, auth, users, and AI pitch plan |
| `src/__tests__/` | Vitest unit suite; `COVERAGE.md` maps coverage status |

### Data model

SQLite (via `@libsql/client`) stores each entity (`players`, `games`, `seasons`, `teams`, `settings`) as a single JSON blob in a two-column table (`id`, `data`). Auth tables (`users`, `sessions`) live in the same database. There is no ORM and no migrations — schema changes are handled by re-seeding or manual migration of the JSON. Players are global; a `Season` holds `teamId`, `roster` (player IDs), and `depthChart` (ordered player IDs per field position).

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
