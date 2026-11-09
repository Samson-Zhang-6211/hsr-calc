# HSR Battle Calculator (hsr-calc)

An **offline** damage and turn-based battle calculator for *Honkai: Star Rail*.

Enter a character's panel and it walks the damage formula zone by zone — direct damage, DoT,
break / super-break, elation — then hands the result to a complete turn-by-turn simulator driven by a
real action-value (AV) timeline: turn order, buff ticking, summons, and stage mechanics are all resolved
in order. No backend, no account, no telemetry: builds and battle logs live in your browser.

[中文说明](README.md)

## Features

- **Per-zone damage breakdown** — base × DMG bonus × crit × defence × resistance × vulnerability ×
  toughness, every factor expandable and auditable instead of a single opaque number.
- **Full battle simulation** — runs the encounter as a state machine on the AV timeline (action advance,
  extra turns, DoT snapshots, shields, healing, memosprites/summons, enemy actions).
- **Build management** — character panel, light cone + superimposition, 4-piece and planar relic sets,
  eidolons, traces; conditional equipment clauses are tracked explicitly.
- **Stage packs** — Memory of Chaos, Pure Fiction, Apocalyptic Shadow, Divergent Universe and more,
  with enemy skills, summons and per-wave scaling.
- **Showcase import** — fetch a public profile by UID through your own CORS relay (both upstream APIs
  refuse cross-origin requests).
- **Bilingual UI** — Chinese / English, key-symmetric at the type level.

Coverage: **99 characters · 665 enemies · 172 light cones · 64 relic sets · 5 stage packs**,
game data pinned to **4.6.54**.

## Quick start

Requires Node `^20.19.0 || >=22.12.0` and pnpm 12.

```bash
pnpm install
pnpm --filter @hsr-calc/web dev     # http://localhost:5173/hsr/
```

> The site is built for the `/hsr/` sub-path (`base` in `apps/web/vite.config.ts`), so the dev server
> only answers at `http://localhost:5173/hsr/`. To host it elsewhere, change that `base` value.

```bash
pnpm -r typecheck   # engine + web, including test tsconfigs
pnpm lint
pnpm -r test        # 1,358 engine tests / 231 web tests
pnpm -r build
```

## Offline package

```bash
node scripts/build-offline.mjs      # → offline/  (~212 MB with all artwork)
```

The result is a folder you can zip, copy to a USB stick, and open by double-clicking `index.html`:
no server, no install, no network. Three things had to be worked around because a `file://` page has a
`null` origin:

| Blocker | Workaround |
| --- | --- |
| `<script type="module" src>` is rejected by CORS | the main bundle is inlined into the HTML |
| data is fetched as `import()` chunks | pre-generated classic scripts (`data-offline/*.js`) inject `window.__HSR_STATIC__` |
| `BrowserRouter` needs history | offline builds switch to `HashRouter` (`#/calculator`) |

Note for phones: iOS Safari cannot run a local page from the Files app, and Android file managers often
hand the page a `content://` origin where sibling files are unreachable. For mobile use, serve the
folder over HTTP (e.g. a local server app) or deploy it as a PWA.

## Repository layout

| Path | Contents |
| --- | --- |
| `packages/engine/` | pure logic: `damage.ts` (formulas), `zones.ts` (multipliers), `panel.ts`, `timeline.ts` (action value), `combat/battle.ts` (turn engine) |
| `packages/shared/` | tiny shared types |
| `apps/web/` | React 19 + Vite 7 front end: calculator, simulators, character manager, showcase, history, help |
| `data/` | game data (characters, enemies, light cones, relic sets, stage packs); `source.lock.json` pins the version |
| `scripts/` | data fetching and code-generation pipeline |

Generated files (`apps/web/src/data/*-roster.ts`, `combat/skill-data.ts`, `combat/monster-stages.ts`, …)
come from `scripts/gen-*.mjs` — edit `data/` and re-run the pipeline instead of editing them by hand.

## Data

Game data is extracted from the public mirrors used by the community ([nanoka](https://hsr.nanoka.cc/))
and pinned in `data/source.lock.json`. Large artwork (portraits, enemy art, icons) is **not** committed —
fetch it on demand:

```bash
node scripts/fetch-portraits.mjs --kind=both   # 99 MB
node scripts/fetch-monster-art.mjs             # 49 MB
node scripts/fetch-equipment-icons.mjs         # 10 MB
node scripts/fetch-relic-pieces.mjs            # 6.5 MB
```

## Disclaimer

Not affiliated with miHoYo / HoYoverse. In-game text, values and artwork belong to miHoYo; they are
included here for study and non-commercial research only and are **not** covered by the MIT license.
The source code itself is MIT licensed — see [LICENSE](LICENSE).
