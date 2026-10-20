'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Paletas por tema; el índice 0 es null en ambas (0 = celda vacía)
const PALETTES = {
  dark: [
    null,
    '#4dd0e1', // I - cyan
    '#ffd54f', // O - yellow
    '#ba68c8', // T - purple
    '#81c784', // S - green
    '#e57373', // Z - red
    '#90caf9', // J - azul pálido
    '#ffb74d', // L - orange
    '#f06292', // + - rosa
    '#a1887f', // U - marrón
    '#4db6ac', // Y - verde azulado
    '#fff176', // 1×1 - amarillo claro
    '#b0bec5', // 3×3 hueca - gris azulado
  ],
  light: [
    null,
    '#00acc1', // I - cyan intenso
    '#f9a825', // O - ámbar
    '#8e24aa', // T - púrpura
    '#2e9e4f', // S - verde
    '#e53935', // Z - rojo
    '#1e63d6', // J - azul
    '#ef6c00', // L - naranja oscuro
    '#d81b60', // + - rosa
    '#795548', // U - marrón
    '#00897b', // Y - verde azulado
    '#c6a700', // 1×1 - dorado
    '#607d8b', // 3×3 hueca - gris azulado
  ],
};

const THEME_KEY = 'tetris-theme';
let COLORS = PALETTES.dark;
let gridColor = '#22222e';

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + (pentominó)
  [[9,0,9],[9,9,9],[0,0,0]],                  // U (pentominó)
  [[0,0,0,0],[10,10,10,10],[0,10,0,0],[0,0,0,0]], // Y (pentominó)
  [[11]],                                      // 1×1 (recompensa tras Tetris)
  [[12,12,12],[12,0,12],[12,12,12]],          // 3×3 hueca (reto al subir de nivel)
];

const PENTOMINOES = [8, 9, 10];
const PENTOMINO_CHANCE = 0.1;
const SINGLE = 11;
const HOLLOW = 12;

const LINE_SCORES = [0, 100, 300, 500, 800];

// Lógica de puntuación pura: sin DOM ni canvas. Devuelve puntos y eventos para los efectos.
const Scoring = {
  TSPIN_BONUS: [400, 800, 1200, 1600], // índice = líneas limpiadas
  B2B_FACTOR: 1.5,
  PERFECT_CLEAR_BONUS: 3000,
  state: { combo: 0, b2b: false },

  reset() {
    this.state.combo = 0;
    this.state.b2b = false;
  },

  resolveTurn({ cleared, tspin, boardEmpty, level }) {
    const st = this.state;
    const events = [];
    let base = ((LINE_SCORES[cleared] || 0) + (tspin ? (this.TSPIN_BONUS[cleared] || 0) : 0)) * level;
    if (tspin) events.push({ type: 'tspin', lines: cleared });

    if (cleared > 0) {
      const difficult = cleared === 4 || tspin;
      if (difficult && st.b2b) {
        base *= this.B2B_FACTOR;
        events.push({ type: 'b2b' });
      }
      st.b2b = difficult; // una limpieza simple corta la racha
      st.combo++;
    } else {
      st.combo = 0; // sin líneas reinicia el combo; B2B no cambia
    }

    const mult = Math.max(1, st.combo);
    if (st.combo >= 2) events.push({ type: 'combo', count: st.combo });

    let bonus = 0;
    if (cleared > 0 && boardEmpty) {
      bonus = this.PERFECT_CLEAR_BONUS;
      events.push({ type: 'perfect' });
    }

    return { points: Math.round(base * mult) + bonus, events };
  },
};

// Estado de las habilidades cargables: sin DOM. La energía sube al limpiar líneas.
const Abilities = {
  MAX: 100,
  GAIN: [0, 10, 25, 40, 60], // índice = líneas limpiadas
  SLOW_MS: 10000,
  SLOW_FACTOR: 2,
  PREVIEW_PIECES: 5,
  state: { energy: 0, slowLeft: 0, previewLeft: 0 },

  reset() {
    this.state.energy = 0;
    this.state.slowLeft = 0;
    this.state.previewLeft = 0;
  },

  onLock(cleared) {
    const st = this.state;
    st.energy = Math.min(this.MAX, st.energy + (this.GAIN[cleared] || 0));
    if (st.previewLeft > 0) st.previewLeft--;
  },

  ready() {
    return this.state.energy >= this.MAX;
  },

  consume() {
    this.state.energy = 0;
  },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const gameArea = document.querySelector('.game-area');
const titleEl = document.querySelector('.title');
const titleLetters = titleEl.querySelectorAll('span');
const queueCanvas = document.getElementById('queue-canvas');
const queueCtx = queueCanvas.getContext('2d');
const energyBar = document.getElementById('energy-bar');
const energyFill = document.getElementById('energy-fill');
const energyHint = document.getElementById('energy-hint');
const abilityMenu = document.getElementById('ability-menu');
const abilityMsg = document.getElementById('ability-msg');
const menuMain = document.getElementById('menu-main');
const menuSwap = document.getElementById('menu-swap');
const pauseMenu = document.getElementById('pause-menu');
const pauseTitle = document.getElementById('pause-title');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const pauseHint = document.getElementById('pause-hint');
const pauseLevelEl = document.getElementById('pause-level');

const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 15;
const PAUSE_ACTIONS = ['resume', 'restart', 'controls', 'level'];
let startLevel = 1; // nivel inicial elegido en el menú de pausa (se aplica en el próximo init)
try {
  const n = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
  if (n >= 1 && n <= MAX_START_LEVEL) startLevel = n;
} catch (e) {}
let pauseView = null; // menú de pausa: null (cerrado) | 'main' | 'controls'
let pauseSel = 0; // índice seleccionado en PAUSE_ACTIONS
const heldKeys = new Set(); // teclas físicamente pulsadas ahora
let blockedKeys = new Set(); // teclas pulsadas antes de reanudar: se ignoran hasta soltarlas

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let queue = []; // piezas forzadas (single/hueca) que salen antes del sorteo aleatorio
let hold = null; // tipo de la pieza guardada (null = vacío)
let canHold = true; // un solo hold por pieza; se libera al bloquear
let lastMoveRotate = false; // true si la última acción de la pieza actual fue una rotación (T-Spin)
let menu = null; // menú de habilidades: null (cerrado) | 'main' | 'swap'

// Animaciones de feedback: solo dibujan sobre el canvas, no conocen las reglas de puntuación.
const Effects = {
  active: [],
  shake: { age: 0, dur: 300, amp: 0 },

  trigger(events, info) {
    for (const ev of events) {
      if (ev.type === 'combo') {
        this.active.push({ type: 'combo', count: ev.count, age: 0, dur: 900 });
        this.shake = { age: 0, dur: 300, amp: Math.min(ev.count * 1.5, 8) };
      } else if (ev.type === 'tspin') {
        this.active.push({ type: 'tspin', lines: ev.lines, cells: info.tCells, age: 0, dur: 1000 });
      } else if (ev.type === 'b2b') {
        this.active.push({ type: 'b2b', age: 0, dur: 1000 });
      } else if (ev.type === 'perfect') {
        this.active.push({ type: 'perfect', age: 0, dur: 1600 });
      }
    }
  },

  update(dt) {
    for (const e of this.active) e.age += dt;
    this.active = this.active.filter(e => e.age < e.dur);
    this.shake.age += dt;
  },

  clear() {
    this.active = [];
    this.shake = { age: 0, dur: 300, amp: 0 };
  },

  shakeOffset() {
    const s = this.shake;
    if (s.age >= s.dur || !s.amp) return { x: 0, y: 0 };
    const k = s.amp * (1 - s.age / s.dur);
    return { x: (Math.random() - 0.5) * 2 * k, y: (Math.random() - 0.5) * 2 * k };
  },

  text(c, str, x, y, size, color, alpha, scale) {
    c.save();
    c.globalAlpha = Math.max(0, alpha);
    c.translate(x, y);
    c.scale(scale, scale);
    c.font = `800 ${size}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(0,0,0,0.65)';
    c.strokeText(str, 0, 0);
    c.fillStyle = color;
    c.shadowColor = color;
    c.shadowBlur = 12;
    c.fillText(str, 0, 0);
    c.restore();
  },

  // Entrada con "pop" (1.4 → 1) y salida con fundido
  pop(t) {
    const scale = t < 0.15 ? 1.4 - 0.4 * (t / 0.15) : 1;
    const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    return { scale, alpha };
  },

  draw(c) {
    const W = COLS * BLOCK, H = ROWS * BLOCK;
    for (const e of this.active) {
      const t = e.age / e.dur;
      const { scale, alpha } = this.pop(t);
      if (e.type === 'combo') {
        const n = e.count;
        const size = Math.min(18 + n * 4, 44);
        const color = `hsl(${Math.max(55 - n * 10, 0)}, 100%, ${Math.min(50 + n * 3, 65)}%)`;
        this.text(c, `COMBO x${n}`, W / 2, H * 0.38 - t * 40, size, color, alpha, scale);
      } else if (e.type === 'tspin') {
        const color = COLORS[3];
        // Pulso expansivo alrededor de las celdas de la T
        const grow = t * 14;
        c.save();
        c.globalAlpha = Math.max(0, 0.9 * (1 - t));
        c.strokeStyle = color;
        c.shadowColor = color;
        c.shadowBlur = 18;
        c.lineWidth = 3;
        for (const cell of e.cells) {
          c.strokeRect(cell.x * BLOCK - grow, cell.y * BLOCK - grow, BLOCK + grow * 2, BLOCK + grow * 2);
        }
        c.restore();
        const names = ['', ' SINGLE', ' DOUBLE', ' TRIPLE'];
        const cx = e.cells.reduce((s, p) => s + p.x, 0) / e.cells.length * BLOCK + BLOCK / 2;
        const cy = e.cells.reduce((s, p) => s + p.y, 0) / e.cells.length * BLOCK;
        const tx = Math.min(Math.max(cx, 90), W - 90);
        const ty = Math.min(Math.max(cy - t * 30, 20), H - 20);
        this.text(c, `T-SPIN${e.lines ? names[e.lines] || '' : ''}`, tx, ty, 22, color, alpha, scale);
      } else if (e.type === 'b2b') {
        this.text(c, 'B2B', W / 2, H * 0.28 - t * 20, 30, '#ffca28', alpha, scale);
      } else if (e.type === 'perfect') {
        if (t < 0.45) {
          const f = t / 0.45;
          const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * f);
          g.addColorStop(0, `rgba(255,255,255,${1 - f})`);
          g.addColorStop(1, `rgba(255,236,130,${0.6 * (1 - f)})`);
          c.fillStyle = g;
          c.fillRect(0, 0, W, H);
        }
        this.text(c, 'PERFECT CLEAR', W / 2, H / 2, 34, '#ffffff', alpha, scale);
      }
    }
  },
};

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  if (Math.random() < PENTOMINO_CHANCE) {
    return makePiece(PENTOMINOES[Math.floor(Math.random() * PENTOMINOES.length)]);
  }
  return makePiece(Math.floor(Math.random() * 7) + 1);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastMoveRotate = true;
      return;
    }
  }
}

// T-Spin: la T se bloquea tras una rotación con ≥3 de las 4 esquinas de su caja 3×3 ocupadas
function isTSpin() {
  if (current.type !== 3 || !lastMoveRotate) return false;
  let filled = 0;
  for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) {
    const nx = current.x + dx;
    const ny = current.y + dy;
    if (nx < 0 || nx >= COLS || ny >= ROWS || (ny >= 0 && board[ny][nx])) filled++;
  }
  return filled >= 3;
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  if (gy > current.y) lastMoveRotate = false;
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    lastMoveRotate = false;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  const tspin = isTSpin();
  const tCells = [];
  if (current.type === 3) {
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c]) tCells.push({ x: current.x + c, y: current.y + r });
  }

  merge();
  const prevLevel = level;
  const cleared = clearLines();
  const boardEmpty = board.every(row => row.every(v => v === 0));

  const res = Scoring.resolveTurn({ cleared, tspin, boardEmpty, level });
  score += res.points;
  lines += cleared;
  level = Math.max(startLevel, Math.floor(lines / 10) + 1);
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  Abilities.onLock(cleared);
  updateHUD();
  syncEnergy();

  Effects.trigger(res.events, { tCells });
  syncB2B();
  if (cleared === 4) celebrateTetris();
  canHold = true;
  drawHold();
  spawn();
  if (gameOver) return;
  if (level > prevLevel) forceNext(HOLLOW);
  if (cleared === 4) forceNext(SINGLE);
}

// Reemplaza "Siguiente"; la pieza desplazada sale justo después
function forceNext(type) {
  queue.unshift(next);
  next = makePiece(type);
  drawNext();
}

// Cada letra toma un color de la paleta actual (efecto arcoíris) y su retardo por índice
function syncTitleColors() {
  titleLetters.forEach((el, i) => {
    el.style.setProperty('--i', i);
    el.style.setProperty('--c', COLORS[(i % 7) + 1]);
  });
}

function celebrateTetris() {
  titleEl.classList.remove('tetris-celebrate');
  void titleEl.offsetWidth; // reinicia la animación si hay Tetris seguidos
  titleEl.classList.add('tetris-celebrate');
  canvas.classList.remove('tetris-glow');
  void canvas.offsetWidth;
  canvas.classList.add('tetris-glow');
}

function syncB2B() {
  gameArea.classList.toggle('b2b-active', Scoring.state.b2b);
}

function spawn() {
  lastMoveRotate = false;
  current = next;
  next = queue.shift() || randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

// Guarda la pieza actual; si ya hay una guardada, las intercambia
function holdPiece() {
  if (!canHold) return;
  if (hold === null) {
    hold = current.type;
    spawn();
  } else {
    const type = hold;
    hold = current.type;
    current = makePiece(type);
    lastMoveRotate = false;
    if (collide(current.shape, current.x, current.y)) endGame();
  }
  canHold = false;
  dropAccum = 0;
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  const sh = Effects.shakeOffset();
  ctx.translate(sh.x, sh.y);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  Effects.draw(ctx);
  ctx.restore();
}

// `slot` apila cajas de 4×4 celdas hacia abajo (cola de siguientes)
function drawPreview(context, cvs, piece, NB = 30, slot = 0, clear = true) {
  if (clear) context.clearRect(0, 0, cvs.width, cvs.height);
  if (!piece) return;
  const shape = piece.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2) + slot * 4;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], NB);
}

// next + las n-1 siguientes; rellena `queue` para que spawn/forceNext las respeten
function upcoming(n) {
  while (queue.length < n - 1) queue.push(randomPiece());
  return [next, ...queue.slice(0, n - 1)];
}

function drawNext() {
  drawPreview(nextCtx, nextCanvas, next);
  drawQueue();
}

function drawQueue() {
  const show = Abilities.state.previewLeft > 0;
  queueCanvas.classList.toggle('hidden', !show);
  if (!show) return;
  queueCtx.clearRect(0, 0, queueCanvas.width, queueCanvas.height);
  upcoming(Abilities.PREVIEW_PIECES).slice(1).forEach((p, i) => {
    drawPreview(queueCtx, queueCanvas, p, 15, i, false);
  });
}

function syncEnergy() {
  const st = Abilities.state;
  energyFill.style.width = `${(st.energy / Abilities.MAX) * 100}%`;
  energyBar.classList.toggle('ready', Abilities.ready());
  gameArea.classList.toggle('slow-active', st.slowLeft > 0);
  let hint = '';
  if (st.slowLeft > 0) hint = `Lento ${Math.ceil(st.slowLeft / 1000)}s`;
  else if (Abilities.ready()) hint = 'E activar';
  if (energyHint.textContent !== hint) energyHint.textContent = hint;
}

function showMenuView(view) {
  menu = view;
  menuMain.classList.toggle('hidden', view !== 'main');
  menuSwap.classList.toggle('hidden', view !== 'swap');
  abilityMsg.textContent = '';
}

function openAbilityMenu() {
  if (!Abilities.ready() || menu) return;
  cancelAnimationFrame(animId);
  showMenuView('main');
  abilityMenu.classList.remove('hidden');
}

function closeAbilityMenu() {
  menu = null;
  abilityMenu.classList.add('hidden');
  lastTime = performance.now(); // evita un dt enorme al reanudar
  loop(lastTime);
}

// Reemplaza la pieza actual por otra del tipo pedido; false si no cabe
function swapCurrent(type) {
  const p = makePiece(type);
  for (const kick of [0, -1, 1, -2, 2]) {
    if (!collide(p.shape, current.x + kick, current.y)) {
      p.x = current.x + kick;
      p.y = current.y;
      current = p;
      lastMoveRotate = false;
      return true;
    }
  }
  return false;
}

function useAbility(n) {
  const st = Abilities.state;
  if (n === 1) {
    st.previewLeft = Abilities.PREVIEW_PIECES;
    drawNext();
  } else if (n === 3) {
    st.slowLeft = Abilities.SLOW_MS;
    canvas.classList.remove('slow-glow');
    void canvas.offsetWidth; // reinicia el destello si se reactiva
    canvas.classList.add('slow-glow');
  }
  Abilities.consume();
  syncEnergy();
  closeAbilityMenu();
}

function handleMenuKey(e) {
  if (e.code === 'Escape') {
    if (menu === 'swap') showMenuView('main');
    else closeAbilityMenu();
    return;
  }
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  if (!m) return;
  const n = Number(m[1]);
  if (menu === 'main') {
    if (n === 2) showMenuView('swap');
    else if (n === 1 || n === 3) useAbility(n);
  } else if (n <= 7) {
    if (swapCurrent(n)) {
      Abilities.consume();
      syncEnergy();
      closeAbilityMenu();
    } else {
      abilityMsg.textContent = 'No cabe aquí';
    }
  }
}

function drawHold() {
  drawPreview(holdCtx, holdCanvas, hold && makePiece(hold));
  holdCanvas.classList.toggle('locked', !canHold);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  if (paused) closePauseMenu();
  else openPauseMenu();
}

function showPauseView(view) {
  pauseView = view;
  pauseMain.classList.toggle('hidden', view !== 'main');
  pauseControls.classList.toggle('hidden', view !== 'controls');
  pauseTitle.textContent = view === 'controls' ? 'CONTROLES' : 'PAUSA';
  pauseHint.classList.toggle('hidden', view !== 'main');
  pauseLevelEl.textContent = startLevel;
  [...pauseMain.children].forEach((li, i) => li.classList.toggle('selected', i === pauseSel));
}

function openPauseMenu() {
  if (gameOver || paused || menu) return;
  paused = true;
  cancelAnimationFrame(animId);
  pauseSel = 0;
  showPauseView('main');
  pauseMenu.classList.remove('hidden');
}

function closePauseMenu() {
  paused = false;
  pauseView = null;
  pauseMenu.classList.add('hidden');
  blockedKeys = new Set(heldKeys); // ignora lo que sigue pulsado hasta que se suelte
  lastTime = performance.now(); // evita un dt enorme al reanudar
  loop(lastTime);
}

function changeStartLevel(step) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(1, startLevel + step));
  try { localStorage.setItem(START_LEVEL_KEY, String(startLevel)); } catch (e) {}
  showPauseView(pauseView);
}

function activatePauseItem(action) {
  if (action === 'resume') closePauseMenu();
  else if (action === 'restart') {
    blockedKeys = new Set(heldKeys);
    init();
  } else if (action === 'controls') showPauseView('controls');
}

function handlePauseKey(e) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape'].includes(e.code)) e.preventDefault();
  if (e.repeat && (e.code === 'Enter' || e.code === 'Escape' || e.code === 'KeyP')) return;
  if (e.code === 'KeyP') { closePauseMenu(); return; }
  if (e.code === 'Escape') {
    if (pauseView === 'controls') showPauseView('main');
    else closePauseMenu();
    return;
  }
  if (pauseView === 'controls') {
    if (e.code === 'Enter') showPauseView('main');
    return;
  }
  const n = PAUSE_ACTIONS.length;
  if (e.code === 'ArrowUp') { pauseSel = (pauseSel + n - 1) % n; showPauseView('main'); }
  else if (e.code === 'ArrowDown') { pauseSel = (pauseSel + 1) % n; showPauseView('main'); }
  else if (PAUSE_ACTIONS[pauseSel] === 'level' && e.code === 'ArrowLeft') changeStartLevel(-1);
  else if (PAUSE_ACTIONS[pauseSel] === 'level' && e.code === 'ArrowRight') changeStartLevel(1);
  else if (e.code === 'Enter') activatePauseItem(PAUSE_ACTIONS[pauseSel]);
}

pauseMenu.addEventListener('click', e => {
  if (!pauseView) return;
  const step = e.target.closest('[data-step]');
  const li = e.target.closest('#pause-main > li');
  if (li) {
    pauseSel = [...pauseMain.children].indexOf(li);
    showPauseView('main');
  }
  if (step) changeStartLevel(Number(step.dataset.step));
  else if (li) activatePauseItem(li.dataset.action);
});

pauseMenu.addEventListener('mouseover', e => {
  const li = e.target.closest('#pause-main > li');
  if (!li || pauseView !== 'main') return;
  const i = [...pauseMain.children].indexOf(li);
  if (i !== pauseSel) { pauseSel = i; showPauseView('main'); }
});

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  Effects.update(Math.min(dt, 100));
  const slow = Abilities.state;
  const interval = dropInterval * (slow.slowLeft > 0 ? Abilities.SLOW_FACTOR : 1);
  if (slow.slowLeft > 0) {
    slow.slowLeft = Math.max(0, slow.slowLeft - Math.min(dt, 100));
    syncEnergy();
  }
  if (dropAccum >= interval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
      lastMoveRotate = false;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  Scoring.reset();
  Effects.clear();
  Abilities.reset();
  menu = null;
  abilityMenu.classList.add('hidden');
  pauseView = null;
  pauseMenu.classList.add('hidden');
  syncEnergy();
  syncB2B();
  titleEl.classList.remove('tetris-celebrate');
  queue = [];
  hold = null;
  canHold = true;
  next = randomPiece();
  spawn();
  drawHold();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  heldKeys.add(e.code);
  if (menu) { handleMenuKey(e); return; }
  if (pauseView) { handlePauseKey(e); return; }
  if (blockedKeys.has(e.code)) return; // tecla pulsada antes de reanudar
  if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) openPauseMenu(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'KeyE':
      openAbilityMenu();
      break;
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastMoveRotate = false; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastMoveRotate = false; }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => {
  heldKeys.delete(e.code);
  blockedKeys.delete(e.code);
});

window.addEventListener('blur', () => {
  heldKeys.clear();
  blockedKeys.clear();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  const isLight = theme === 'light';
  if (isLight) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  COLORS = isLight ? PALETTES.light : PALETTES.dark;
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  syncTitleColors();
  const label = isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
  themeToggle.setAttribute('aria-pressed', String(isLight));
  // Repinta directamente: en pausa o game over el rAF no corre
  if (board) { draw(); drawNext(); drawHold(); }
}

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  applyTheme(theme);
  themeToggle.blur(); // evita que Space/Enter vuelvan a activar el botón
});

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch (e) {}
applyTheme(savedTheme);

init();
