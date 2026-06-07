# Handoff: Diamond Draft — Youth Baseball Lineup Builder

## Overview
Diamond Draft is an app for a youth baseball coach to plan rule-clean lineups across a season. The core is an interactive **lineup builder** for one game: who bats in what order, what defensive position each player plays each inning, and who sits the bench — enforcing league fair-play rules in real time, with **two synchronized views** (a tabular **Grid** and a **Field** diagram stepped inning-by-inning). Around the builder is a small app: **Home / Dugout, Roster, Games, New Game, Settings**.

> **⚠️ READ FIRST — the most common implementation mistake.** Diamond Draft is a **warm, light** design: cream page background, **white** cards, **olive-green** primary (`#3f6212`). An earlier dev build drifted to **dark-navy cards with dark text** (names became unreadable) and a **bright kelly/blue** primary button. **Do not do that.** See **Contrast & color rules** below — getting the surface/text/primary trio right is what keeps the whole app on-brand and accessible.

## About the Design Files
The files in this bundle are **design references created in HTML/React (via in-browser Babel)** — a working prototype showing intended look and behavior, **not production code to ship directly**. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, Svelte, SwiftUI, etc.) using its established patterns, state libraries, and component conventions. If no environment exists yet, pick the most appropriate framework and implement there. The prototype hard-codes one game's worth of mock data; a real implementation would source roster/schedule from app state or an API.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are all specified. Recreate the UI pixel-accurately using the codebase's libraries. Exact tokens are listed below.

---

## Data Model

The entire UI derives from three pieces of state plus a static roster.

**Player** (roster, static per game):
```
{ id, first, li (last initial), num (jersey #, string),
  elig: [positions this player can play],
  guest?: true, status: 'active'|'late'|'earlyLeave'|'absent' }
```

**Positions** — 9 field positions, grouped into 3 color "zones":
- `bat` (battery): `P`, `C`
- `inf` (infield): `1B`, `2B`, `3B`, `SS`
- `out` (outfield): `LF`, `CF`, `RF`

**Cell values** — each player has a value per inning: a position code (above), or one of `BENCH`, `LATE` (not yet arrived), `OUT` (left game), `ABSENT` (no-show / scratched).

**Live state (3 things):**
1. `batting` — ordered array of player ids (the batting order; index+1 = batting slot). Absent players are *scratched* and excluded.
2. `schedule` — `{ playerId: [7 cell values] }`, one array slot per inning.
3. UI: `sort` (`bat`|`jersey`|`name`), `view` (`grid`|`field`), `inning` (0–6), `edit` (open popover descriptor).

**Derived (recompute on every state change, memoized):**
- `onFieldPerInning[i]` = count of players whose cell `i` is a field position. **Must equal 9.**
- `battingSlot(id)` = `batting.indexOf(id) + 1`.
- **Violations** (all live):
  - *Field count* — any inning where on-field ≠ 9.
  - *Back-to-back bench* — any player with `BENCH` in two consecutive innings.
  - *Fair-play minimum* — any player with fewer than 2 field innings across the game.
- `violations` = total count; drives the header chip and the single most-important banner message (priority: field-count → back-to-back → short-play → "clean").

---

## The Lineup Builder (core screen)

### Shared chrome (both views)
- **Card**: width `1320px`, `background #fff`, `border 1px solid #e7e4dc`, `border-radius 16px`, `overflow hidden`, shadow `0 1px 3px rgba(40,35,25,.06), 0 18px 50px rgba(40,35,25,.07)`. The page scales this card down (transform: scale) to fit narrow viewports, never up.
- **Header bar** (`padding 16px 22px`, bottom border `#e7e4dc`): left = rotated-square logo (24px, `#3f6212`, rotate 45°, radius 5) + "Diamond Draft" (`800`, 17px). Center = `{team} vs {opp} · {homeAway} · {date} · {time}` (team/opp in Hanken; meta in IBM Plex Mono 12.5px `#6f6a60`). Right = green **Print · 1 page** button (`height 36`, `bg #3f6212`, `#fff`, `700`, 13px, radius 9) → `window.print()`.
- **Toolbar bar** (`padding 12px 22px`, bg `#fcfbf8`, bottom border): left = **View toggle** (Grid / Field segmented) then a 1×20 divider `#e3e0d8`, then view-specific controls. Right = **violation chip**: if `violations>0` red pill (`color #9a3412`, `bg #f6e7df`, `border #eccfc0`, radius 999) "N rule violation(s)"; else green pill (`#3f6212` / `#eef1e3` / `#dbe3c6`) "Fair play on track".
- **Footer bar** (`padding 13px 22px`, bg `#fcfbf8`, top border): left = legend swatches (Infield/Outfield/Battery zone colors with a sample code, Bench, Late/Out); right = **banner** — green when clean (`#3f6212`/`#eef1e3`/`#dbe3c6`) or red (`#9a3412`/`#f8ece6`/`#eccfc0`), radius 8, `padding 7px 12px`, max-width 560, with a 16px round badge (✓ or !) + `<strong>main</strong> — hint`.

### View A — Grid
A table: rows = players, columns = 7 innings, plus two leading columns (BAT, PLAYER) and a trailing ON FIELD footer row.
- **Toolbar controls**: "ORDER BY" label + segmented **SortSeg** (`Batting order` / `Jersey #` / `First name`). In `bat` mode, a hint with a grip glyph: "drag a row · click any cell to assign".
- **Columns**: `BAT` col `66px`, `PLAYER` col `228px`, 7 inning cols equal-width. `table-layout: fixed`.
- **Header row** (`thead th`): bg `#faf8f3`, IBM Plex Mono 11px `600`, uppercase, letter-spacing .04em, `#6f6a60`, `padding 10px 0`, bottom border `1.5px solid #d9d5cb`. The sorted BAT col gets `color #3f6212; background #f3f4ea`.
- **Body row** height `48px`; `tr:hover td` → `background rgba(63,98,18,.045)`. Scratched players render at `opacity .55`, strike-through name, "SCRATCHED" tag, em-dash batting number.
  - **BAT cell**: drag grip (3×2 dots, `#8d877a`, opacity .4 → .85 hover, grab cursor) — only shown in `bat` sort and for non-scratched rows — plus batting number (IBM Plex Mono 17px `600`).
  - **PLAYER cell**: jersey chip (mono 12px `600`, `bg #eef0e6`, `color #3f6212`, radius 6, min-w 26, h 24) + name "First L." (14px `700`). Name has a dotted underline tooltip listing `Can play: <elig joined by ·>` (dark tooltip `#211f1b`, mono 11px, eligible positions highlighted `#bcd39a`). Guest players get a "+1" amber tag.
  - **Inning cells**: field positions show the code (mono 15px `600`) on the zone's bg/fg color. Word states (Bench/Late/Out/—) show italic label on their muted bg. Editable cells (field or BENCH, non-scratched) get `cursor:pointer` and a hover ring `inset 0 0 0 2px rgba(63,98,18,.35)`; the open cell gets a solid `inset 0 0 0 2px #3f6212`.
- **Footer row** (`tfoot`): "ON FIELD →" right-aligned, then per-inning count `N/9` — green when 9, red `#9a3412` otherwise. Mono 12px on `#faf8f3`, top border `1.5px solid #d9d5cb`.

### View B — Field
A diamond diagram (left) + roster panel (right), stepped one inning at a time.
- **Toolbar controls**: "INNING" label + **InningStepper** — `‹` arrow, buttons `1`–`7` (mono, active = `bg #3f6212` `#fff`), `›` arrow, in a segmented shell (`bg #f1efe8`, border `#e3e0d8`, radius 9). Hint: "step through all 7 innings".
- **Body** (`display:flex; gap 30px; padding 26px 30px 30px`):
  - **Left — diamond** (`flex: 0 0 568px`, `aspect-ratio 1000/880`, `position:relative`): an SVG field backdrop (grass rect, foul lines, dashed outfield fence arc, tan infield diamond, base squares, mound, home plate — *simple shapes only, no illustration*) with 9 position chips absolutely placed by percentage anchors (see Geometry). Each chip: zone-colored card (`min-w 30`, `padding 6px 11px`, radius 11, shadow `0 2px 7px rgba(40,35,25,.13)`, lift on hover) showing `POS · #num` (mono 10px, zone fg) over "First L." (12.5px `700`). An **empty** position renders a dashed "+ open" chip (`bg rgba(255,255,255,.45)`, `border 1.5px dashed #b9c19f`).
  - **Right — roster panel** (`flex:1`): header row "Inning N" (20px `800`) + sub "Tap a position to swap who plays it", and a `N/9 on the field` pill (green at 9, red otherwise). Below: **On the bench** section — clickable roster pills (jersey + name + eligible positions in mono 10px) that put a benched player on the field; plus read-only **Arriving late** and **Out / left game** sections when populated. Empty bench → "Everyone available is on the field this inning."

---

## Interactions & Behavior

1. **Drag to reorder batting** (Grid, `bat` sort only): pointer-drag the row grip. Dragged row follows the cursor; sibling rows slide live via `translateY` transitions into their would-be slots; DOM/state order commits only on drop with a settle animation (~190ms). Note: pointer deltas are screen-space and must be divided by the card's current scale to map into the (scaled) local transform space.
2. **Assign a position — cell/chip click** (both views): opens **CellPopover** anchored under the clicked element. Shows the player, the inning, their **eligible** positions as a 3-col grid (current = filled green), each showing a "#num" badge if another player currently holds that spot, plus a full-width **Bench this inning** button.
3. **Fill an empty spot — "+ open" chip click** (Field): opens **PositionPopover** listing every lineup player **eligible** for that position, each annotated with where they are now (on field / on bench / etc). Selecting assigns them.
4. **Assignment with swap** — `assign(id, inn, pos)`: if `pos` is a field position already held by another player that inning, that player is moved to the assigning player's *previous* cell value (or `BENCH` if the previous value wasn't field/bench). This keeps each field position **unique per inning** so counts stay stable. Then `schedule[id][inn] = pos`.
5. **Inning stepper** (Field): sets `inning` (0–6); diamond + roster recompute for that inning.
6. **View toggle**: switches Grid/Field; **state is shared**, so every edit is reflected in both.
7. **Live validation**: on every assignment/reorder, recompute on-field counts + violations; the header chip, footer banner, footer ON FIELD row, and Field `N/9` pill all update.
8. **Popovers**: portal to `document.body` with `position: fixed` (so the scaled card's transform doesn't capture them), clamped within the viewport, close on outside pointerdown or Escape.
9. **Print**: `window.print()`.

---

## App Screens (around the builder)

A light top **nav bar** (sticky, `height 64`, `background rgba(255,255,255,.86)` + blur, bottom border `#e7e4dc`) is shared by every screen: rotated-square logo + "Diamond Draft" (`800`, 17px, `white-space:nowrap`) on the left; nav links **Home · Roster · Games · Settings** (each `padding 7px 14px`, radius 9, `600`, muted `#6f6a60`; **active** = `color #3f6212` on `#eef1e3`; hover = `#f1efe8`); a round avatar on the right. Page content sits in a centered `.wrap` (max-width `1180px`, padding `34px 30px 70px`; the lineup screen uses `1380px`). Page titles are `30px/800`, with a mono uppercase **eyebrow** (`11px`, letter-spacing .08em, `#a09a8e`) above and a `14.5px #6f6a60` subtitle below.

**Home (“Dugout”)** — header with eyebrow `{team} · {coach}`, title, subtitle, and right-aligned **Manage roster** (secondary) + **New game** (primary) buttons. Then a 3-up grid of **stat cards** (white `.card`, `padding 22px 24px`): big olive number (`46px/800`, `#3f6212`), a small rotated-square accent (`#eef1e3` fill, `#dbe3c6` border) top-right, a `14.5/700` label, and a faint sub-line. Below, an "Upcoming & recent games" eyebrow with a **View all →** link, then a list of **game rows**.

**Game row** (`.listrow`, `padding 16px 18px`, radius 13, border `#e7e4dc`, hover lifts + olive border): a 52px date chip (home games tint olive `#eef1e3`/`#dbe3c6`, away tint blue `#eef2f6`/`#dbe4ec`) showing day over month (mono); the matchup `vs {opp}` / `@ {opp}` (`16/700`, **ellipsis-truncated, no wrap** — important to avoid colliding with the meta line) + a HOME/AWAY chip; a meta line `{time} · {innings} innings · {players} players` (`13px #a09a8e`, `nowrap`); right-aligned **status pill** (Finalized = green, Draft = amber `#a16207`/`#f8f0db`/`#ecdcb6`, Not started = grey) + chevron. Clicking opens the **Lineup** screen.

**Roster** — header + **Add player** (primary). A search input (`.input`, 44px, focus ring `rgba(63,98,18,.13)`) filters by name/number. A white `.card` wraps a table: columns **# / Player / Eligible positions / Plays / Status / (edit)**. Header cells are mono uppercase `10.5px #a09a8e` with a `1.5px #d9d5cb` bottom rule; body rows `padding 13px 16px`, `1px #eeece5` separators, hover `rgba(63,98,18,.035)`. Jersey = mono chip (`#eef0e6`/`#3f6212`). Eligible positions render as **zone-tinted chips** (mono `11px`, see zone colors). Status uses the status pills (see tokens). Last-initial format "First L.".

**Games** — header + **New game**; a segmented filter **All / Draft / Finalized** (`.seg`); then the same game-row list, filtered. Empty state = centered faint message in a card.

**New Game (modal)** — a scrim (`rgba(33,30,22,.34)` + blur) over a 560px white modal (radius 18, shadow `0 24px 70px rgba(30,26,18,.34)`). Header (eyebrow + `20/800` title + close X), body fields: Opponent (text), Date + First pitch (2-col), Home/Away segmented + Innings segmented (`6/7/9`), and an info note (`#faf8f3` panel) stating the active roster carries in. Footer (`#fcfbf8`, top border): **Cancel** (secondary) + **Create & build lineup** (primary) → opens the Lineup screen. Close on scrim click or X.

**Settings** (`.wrap` max-width 820) — two white cards. **Team**: a 2-col grid of inputs (team name, head coach, league/division, default innings). **Fair-play rules**: rows of `title` + faint `body` + a **toggle** (`42×25` pill, off `#d8d3c8` / on `#3f6212`, 19px knob) — Minimum 2 innings, No back-to-back bench, Pitch/inning caps, Rotate battery, Equal at-bats. Footer buttons **Discard** / **Save settings**.

**Lineup** — wraps the builder in the app shell: a breadcrumb **‹ Games** (left) and a **Draft · not finalized** amber pill (right), then the 1320px builder card. The card is **scaled to fit** the available width via a `FitCard` helper (ResizeObserver measures the container, applies `transform: scale(min(1, width/1320))`, and reserves the scaled height so there's no gap/overlap). **Why this matters:** the builder card has a fixed `1320px` design width; if you instead drop it into a `display:flex; justify-content:center` parent it becomes a shrinkable flex child, compresses below 1320px, and the header text overlaps. Either scale-to-fit (as here) or give it `flex-shrink:0` inside a horizontally-scrollable container.

---

## Contrast & color rules (non-negotiable)
The single most important thing to get right. The palette is **warm and light**:
- **Page background** = cream `#efece6`. **Card / table / modal surfaces** = white `#fff` (subtle bars `#fcfbf8` / `#faf8f3`). **Never** dark-navy surfaces.
- **Primary action** = olive `#3f6212` with white text. **Never** bright kelly-green or blue. Secondary = white with `#d9d5cb` border; ghost = transparent.
- **Body text** = `#211f1b` (primary) / `#6f6a60` (muted) / `#a09a8e` (faint) — always on light surfaces, so it stays high-contrast.
- **Position chips** = light zone tints (`#ecf0e1`/`#f7eed7`/`#e7eef4`) with the zone's darker text color. **Never** dark chips with low-contrast text.
- **Status / accent pills** use the green/amber/grey trios below — colored text on a matching light tint, never white text on a saturated fill (except the primary button).

## State Management
Single owner component holds `batting`, `schedule`, `sort`, `view`, `inning`, `edit`. All derivations are pure functions of `batting` + `schedule` (memoize the heavier ones). `edit` is a descriptor: `{ kind:'cell', id, inn, rect }` or `{ kind:'pos', pos, inn, rect }` (rect = anchor's bounding box for popover placement). No async/data-fetching in the prototype; wire roster + initial schedule to your data layer.

---

## Design Tokens

**Fonts** — `Hanken Grotesk` (UI text, weights 400–800) and `IBM Plex Mono` (codes, numbers, meta, 400–600).

**Core colors**
| Token | Hex |
|---|---|
| App background | `#efece6` |
| Card surface | `#fff` |
| Subtle surface (toolbars/footers) | `#fcfbf8` / `#faf8f3` |
| Text primary | `#211f1b` |
| Text muted | `#6f6a60` / `#7c776c` |
| Text faint | `#a09a8e` / `#bdb8ad` |
| Hairline borders | `#e7e4dc` / `#e8e5dd` / `#eeece5` |
| Strong rule | `#d9d5cb` |
| **Primary green** | `#3f6212` |
| Error/alert red | `#9a3412` |

**Zone colors** (cell bg / code fg)
| Zone | bg | fg | sample |
|---|---|---|---|
| Battery (P/C) | `#f7eed7` | `#9a6712` | P |
| Infield | `#ecf0e1` | `#3f6212` | SS |
| Outfield | `#e7eef4` | `#345d86` | CF |

**Word-state colors** (bg / fg): Bench `#f1efe8`/`#938e80`, Late `#f8f0db`/`#a16207`, Out `#eae8e1`/`#9a958a`, Absent `#f4f2ec`/`#bdb8ad`.

**Status / accent pills** (text fg / bg / border) — colored text on a light tint, never white-on-saturated:
| Use | fg | bg | border |
|---|---|---|---|
| Positive — Active / Finalized / Fair-play / Home | `#3f6212` | `#eef1e3` | `#dbe3c6` |
| Caution — Draft / Late / Leaves early | `#a16207` | `#f8f0db` | `#ecdcb6` |
| Negative — violations / alerts | `#9a3412` | `#f6e7df` | `#eccfc0` |
| Neutral — Out today / Not started | `#a09a8e` | `#f1efe8` | `#e3e0d8` |
| Away (game accent) | `#345d86` | `#eef2f6` | `#dbe4ec` |

**Buttons**: primary `bg #3f6212` / `#fff` (hover brightness 1.08); secondary `#fff` / `#211f1b` / border `#d9d5cb`; ghost transparent / `#6f6a60`. Height 42 (sm 34), radius 11 (sm 9). **Toggle**: `42×25`, off `#d8d3c8` / on `#3f6212`, 19px white knob. **Inputs**: height 44, border `#d9d5cb`, focus border `#3f6212` + ring `0 0 0 3px rgba(63,98,18,.13)`.

**Field SVG theme**: grass `#dde6cd`, grass-dark (arc) `#d2dcbd`, lines `#fbfaf6` (fence arc dashed `11 9`), infield `#e6d2ab`, infield edge `#d0b889`, bases `#fdfbf5`, field corner radius 20.

**Radii**: chips/pills 6–11px, cards/popovers 8–16px, round pills 999. **Row height** 48px (grid), 38px (footer). **Shadows**: see card + chip values above; popover `0 10px 40px rgba(30,26,18,.22), 0 0 0 1px rgba(40,35,25,.08)`.

**Field position anchors** (% of the field box, x/y):
`LF 15/23 · CF 50/12 · RF 85/23 · 3B 20/53 · SS 36/45 · 2B 64/45 · 1B 80/53 · P 50/64 · C 50/87`.

## Assets
None external. The logo is a CSS rotated square; the field is inline SVG built from primitive shapes (rects, lines, a quadratic arc, rotated base squares, a home-plate polygon, mound circle). No images, no icon library — all glyphs are inline SVG paths. Recreate icons with your codebase's icon set if preferred.

## Files (in this bundle)
- **`Diamond Draft App.html`** — **primary entry point.** Mounts the full app (nav + all screens + builder). Open this first.
- `dd-app.jsx` — app shell: top nav + screen router, and the **Home, Roster, Games, New Game (modal), Settings** screens, the shared `C` token object, small primitives (Pill, Jersey, ZChips), the game-row, and the `FitCard` scale-to-fit wrapper for the embedded builder. `window.DiamondDraftApp`.
- `dd-grid.jsx` — the interactive lineup builder: Grid table, Field diagram, both popovers, drag-reorder, live validation. `window.BuilderGrid`.
- `dd-core.jsx` — mock roster (`PLAYERS`), full 7-inning `SCHEDULE`, `BATTING` order, helpers (`isField`, `getInning`, `battingSlot`, …), `WARNINGS`, `GAME` meta, and the **FieldSVG** backdrop + position geometry (`FIELD_POS`, `FIELD_ORDER`). Shared by both.
- `Diamond Draft.html` — standalone entry for **just the builder** (no app shell), if you want to work on it in isolation.

Load order in HTML: React/ReactDOM/Babel → `dd-core.jsx` → `dd-grid.jsx` → `dd-app.jsx`. Note `dd-app.jsx` re-declares the same color tokens locally (`C`) as `dd-grid.jsx` uses inline — keep them in sync, or lift to one shared token module when you reimplement.

Implement from **`Diamond Draft App.html`** + `dd-app.jsx`, `dd-grid.jsx`, `dd-core.jsx`.
