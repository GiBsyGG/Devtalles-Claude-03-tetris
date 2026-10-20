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

- Theming: CSS variables under `:root` (dark, default) and `[data-theme="light"]`; `applyTheme` in `game.js` swaps `COLORS` between `PALETTES.dark/light`, caches `--grid` into `gridColor`, repaints directly (rAF is stopped when paused/game over) and persists to `localStorage` key `tetris-theme`. A small inline script in `index.html`'s head applies the saved theme before first paint.
- Skins: `SKINS` (game.js) = `{label, palette(theme), drawBlock(c,x,y,ci,size), grid?}` for `retro` (default), `neon`, `pastel`, `pixel`. Global `drawBlock` wraps the skin's in `save/restore` with `globalAlpha` set (skin code must multiply from `c.globalAlpha`, no manual reset needed). `syncSkinColors` sets `COLORS`/`gridColor` from skin + theme (used by `applyTheme` and `applySkin`). `applySkin` sets `data-skin` on `<html>`, repaints board/next/hold/queue directly, persists to `localStorage` `tetris-skin`; the `#skin-select` change handler blurs it. Neon forces black canvas bg via CSS `[data-skin="neon"]`. Head inline script pre-applies `data-skin`. Extra DOM id: `skin-select`.
- Records: `Records` (game.js) is pure logic over localStorage `tetris-records` (`{entries, bestCombo, maxLines}`, top 5 by score; `qualifies`, `add` returns index, `noteGame`, `clear`); last name in `tetris-player`. `maxCombo` is tracked in `lockPiece` from `Scoring.state.combo` (only >=2) and reset in `init`. On load the game does NOT start: `gameOver = true` + `#start-screen` (Jugar / Enter -> `startGame` -> `init`). `endGame` calls `noteGame`, shows `#record-form` if `qualifies`, and `renderRecords(container, highlight)` fills `#overlay-records`; `saveRecord` adds + highlights (restart button also calls it, so a pending record is not lost). Keydown ignores everything when target is `#name-input` or the start screen is visible. Extra ids: `start-screen`, `start-records`, `play-btn`, `clear-records-btn`, `overlay-records`, `record-form`, `name-input`, `save-btn`.
- Pause menu (P / Esc): `#pause-menu` (separate from `#overlay`, which is game over only). `openPauseMenu`/`closePauseMenu` (same rAF pattern as ability menu; `paused` stays true while open). `pauseView` = null|'main'|'controls', `pauseSel` indexes `PAUSE_ACTIONS` (resume, restart, controls, level); `handlePauseKey` runs after `handleMenuKey` in keydown; Esc opens it only when the ability menu is closed. Restart = `init()` (no reload). Start level (1–15, `START_LEVEL_KEY` `tetris-start-level`) is `startLevel`: `init` copies it to `initialLevel`, `lockPiece` level = `max(initialLevel, floor(lines/10)+1)`. Held-key guard: `heldKeys` (keydown/keyup/blur) → on resume/restart `blockedKeys` copies it and those keys are ignored until keyup. Extra ids: `pause-menu`, `pause-title`, `pause-main`, `pause-controls`, `pause-hint`, `pause-level`.

## Gotchas

- Board size is duplicated: `COLS`/`ROWS`/`BLOCK` in `game.js` must match `<canvas id="board" width height>` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). Next-piece canvas is fixed 120×120 (4 cells × 30).
- Pause/restart cancel and restart rAF via `animId`; `togglePause` resets `lastTime` to avoid a huge `dt` on resume. Preserve this when touching the loop.
