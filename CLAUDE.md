# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no `package.json`, no build, no tests, no linter. README is in Spanish; UI strings are Spanish too.

## Run

Open `index.html` directly, or serve statically: `python -m http.server 8000` (then http://localhost:8000).

## Architecture

Three files, all logic in `game.js` (single script, global scope, `'use strict'`):

- `index.html` — DOM ids that `game.js` looks up at load (`board`, `next-canvas`, `hold-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `theme-toggle`, `b2b-badge`; plus `.game-area` and `.title` (with one `<span>` per letter) via querySelector). Renaming any breaks the script.
- `game.js` — module-level mutable state (`board`, `current`, `next`, `score`, ...) reset by `init()`. Flow: `init` → `spawn` → rAF `loop` (gravity via `dropAccum` vs `dropInterval`) → `lockPiece` = `merge` + `clearLines` + `spawn`. `spawn` calls `endGame` if new piece collides. Keydown handler at the bottom drives movement; restart button re-calls `init`.
- Pieces are square matrices whose cell values are color indices (1–12) into `COLORS`/`PIECES`; the same index is stored in `board` after merge (0 = empty). Index 0 is `null` in both arrays — keep that offset when adding pieces. 1–7 tetrominoes (`randomPiece` hardcodes `* 7 + 1`), 8–10 pentominoes (+, U, Y; `PENTOMINO_CHANCE` 10% in `randomPiece`), 11 single, 12 hollow 3×3. `makePiece(type)` builds a piece; `forceNext(type)` swaps `next` and pushes the displaced piece onto `queue` (`spawn` drains `queue` first; reset in `init`). `lockPiece` forces `SINGLE` after a Tetris and `HOLLOW` on level-up.
- Hold (C / Shift): `hold` stores a piece *type* (rebuilt with `makePiece`, so rotation resets). `holdPiece` swaps, or on empty hold calls `spawn`. `canHold` goes false after use and true in `lockPiece` (not in `spawn`); `drawHold` dims `#hold-canvas` via `.locked`. `drawNext`/`drawHold` share `drawPreview`.
- Rotation: `rotateCW` + `tryRotate` with horizontal kicks `[0,-1,1,-2,2]` only (no SRS).
- `clearLines` only removes rows and returns the count. Scoring/level live in `lockPiece`: `isTSpin` → `merge` → `clearLines` → `Scoring.resolveTurn` → `Effects.trigger` → `spawn`. Level = `floor(lines/10)+1`, `dropInterval = max(100, 1000-(level-1)*90)`.
- `Scoring` (game.js) is pure logic: combo multiplier, T-Spin bonus, B2B x1.5, Perfect Clear flat bonus; returns `{points, events}`. `Effects` (game.js) only animates on the board canvas from those events (`update(dt)` in `loop`, `draw` inside `draw()`, shake via `shakeOffset`). Both reset in `init`.
- T-Spin: `lastMoveRotate` is set by `tryRotate` and cleared by any successful move/drop and in `spawn`; `isTSpin` needs ≥3 of the 4 corners of the T's 3×3 box filled.
- Tetris (4 lines) title effect: `lockPiece` calls `celebrateTetris` (toggles `tetris-celebrate` on `.title`); per-letter `--i`/`--c` set by `syncTitleColors` from `COLORS` (called in `applyTheme`); keyframes `title-hop` in `style.css`.
- Abilities (E): `Abilities` (game.js) holds energy (`GAIN` by lines cleared, max 100), `slowLeft`, `previewLeft`; `onLock` runs in `lockPiece`. At full energy `openAbilityMenu` stops rAF and shows `#ability-menu` (`menu` = null|'main'|'swap'; keydown routes to `handleMenuKey` first); `closeAbilityMenu` resumes like `togglePause`. 1 = `previewLeft=5` → `drawQueue` on `#queue-canvas` using `upcoming(n)` (fills `queue` with real pieces). 2 = `swapCurrent(type)` with kicks `[0,-1,1,-2,2]` (fails without spending). 3 = `slowLeft` doubles the drop interval in `loop`. `syncEnergy` updates `#energy-bar/#energy-fill/#energy-hint` and `slow-active` on `.game-area`. Extra ids: `queue-canvas`, `energy-bar`, `energy-fill`, `energy-hint`, `ability-menu`, `ability-msg`, `menu-main`, `menu-swap`.
- Badges: `#b2b-badge` and `#slow-badge` live in `.badges` (stacked, B2B on top; `badge-pop` scale 1.05). Slow shows its badge via `slow-active`; `useAbility(3)` fires a one-shot `slow-glow` on `#board` (re-fired on every activation).
- B2B halo is CSS: `syncB2B` toggles `b2b-active` on `.game-area` (`#b2b-badge`, `--b2b-glow`).

- Pause menu (P / Esc): `togglePause` shows `#pause-menu` (views `pauseView` main|controls; items `.pause-item[data-action]`: resume, restart, controls, level). While `paused`, keydown goes only to `handlePauseKey` (game inputs blocked). `startLevel` (1–15, `#start-level`) is used by `init` and `lockPiece` (`level = startLevel + floor(lines/10)`, `dropIntervalFor`). `#overlay` is now game-over only.
- Records: `Records` (game.js) is pure logic (top 5 `{name,score}`, `bestCombo`, `maxLines`, localStorage key `tetris-records`). `endGame` calls `updateStats(maxCombo, lines)`; if `rankOf(score)>=0` it shows `#name-form` and sets `pendingScore` (saved by submit, or as "Anónimo" on restart). `renderRecords(highlight)` fills `#records-list`/`#records-stats` in the shared `#overlay` (hidden by `init`). Load ends with `init(); showStart()`: start screen = stopped game with `gameOver=true` and the restart button labelled "Jugar". `maxCombo` is tracked in `lockPiece`. Extra ids: `name-form`, `name-input`, `record-msg`, `records`, `records-list`, `records-stats`, `reset-records`.
- Theming: CSS variables under `:root` (dark, default) and `[data-theme="light"]`; `applyTheme` in `game.js` swaps `COLORS` between `PALETTES.dark/light`, caches `--grid` into `gridColor`, repaints directly (rAF is stopped when paused/game over) and persists to `localStorage` key `tetris-theme`. A small inline script in `index.html`'s head applies the saved theme before first paint.

## Gotchas

- Board size is duplicated: `COLS`/`ROWS`/`BLOCK` in `game.js` must match `<canvas id="board" width height>` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). Next-piece canvas is fixed 120×120 (4 cells × 30).
- Pause/restart cancel and restart rAF via `animId`; `togglePause` resets `lastTime` to avoid a huge `dt` on resume. Preserve this when touching the loop.
