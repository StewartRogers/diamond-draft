# Diamond Draft

A local-first web app for youth baseball coaches to build rule-compliant game lineups.

Manage a roster (with per-position skill tiers and a 1–4 defense rating), create games, and assign players to the 9 field positions plus Bench and Bullpen slots inning by inning. The core is a rules engine and auto-fill solver that enforces league fair-play rules — pitching limits per game and season, pitching rest, no-pitch-after-catch, max consecutive bench innings, minimum field time, position eligibility, and late-arrival/early-leave availability — and can generate a full lineup that satisfies them, with a copyable reasoning log.

Data persists locally in SQLite (`data/diamond-draft.sqlite3`); no account or network required. An optional AI assistant (Google Gemini) can suggest per-inning pitcher/catcher plans.

## Getting Started

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm test           # vitest unit suite
npm run eval       # live Gemini evals for the pitch-plan feature (needs GEMINI_API_KEY; skips without it)
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm start          # serve production build
```

### Environment variables (optional)

Only needed for the AI pitch-plan feature. Copy `.env.example` to `.env.local`:

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key. If unset, the AI feature is unavailable; everything else works. |
| `GEMINI_MODEL` | Model override (default `gemini-2.5-flash-lite`). |

## Project Structure

- `src/lib/` — pure business logic: `types.ts` (domain model), `lineup.ts` (slot manipulation, bullpen warm-ups), `rules.ts` (violation checker), `autoLineup.ts` (auto-fill solver), `store.ts` (Zustand store), `server/db.ts` (SQLite persistence)
- `src/app/` — Next.js App Router pages and API routes under `src/app/api/`
- `src/components/` — UI; `game/LineupBuilder.tsx` is the main interactive grid
- `src/__tests__/` — Vitest suite (see `test-plan.md` and `src/__tests__/COVERAGE.md`)
- `design_handoff_diamond_draft/` — design reference prototype and visual spec

## Notes

- **Next.js version:** this project uses Next.js 16, which has breaking changes from earlier versions — see `AGENTS.md` and the docs in `node_modules/next/dist/docs/`.
- **PostCSS override:** `package.json` pins `postcss` via an `overrides` entry to keep the transitive dependency on a patched version. Keep an eye on it when updating dependencies so `npm audit` stays clean.
- CI (GitHub Actions) runs lint, typecheck, tests, and build on every push and PR.

## License

See [LICENSE](LICENSE).
