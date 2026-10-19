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
- B2B halo is CSS: `syncB2B` toggles `b2b-active` on `.game-area` (`#b2b-badge`, `--b2b-glow`).

- Theming: CSS variables under `:root` (dark, default) and `[data-theme="light"]`; `applyTheme` in `game.js` swaps `COLORS` between `PALETTES.dark/light`, caches `--grid` into `gridColor`, repaints directly (rAF is stopped when paused/game over) and persists to `localStorage` key `tetris-theme`. A small inline script in `index.html`'s head applies the saved theme before first paint.

## Gotchas

- Board size is duplicated: `COLS`/`ROWS`/`BLOCK` in `game.js` must match `<canvas id="board" width height>` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). Next-piece canvas is fixed 120×120 (4 cells × 30).
- Pause/restart cancel and restart rAF via `animId`; `togglePause` resets `lastTime` to avoid a huge `dt` on resume. Preserve this when touching the loop.
