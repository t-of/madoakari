// まどあかりの決まりごと。画面（DOM）に触らない部分をここに集める。
// main.js（ブラウザ）と test.mjs（node）の両方から読む。
//
// 盤は長さ rows × cols の配列 cells。i = r * cols + c、true = 点いている。

export const MIN_SIZE = 2;
export const MAX_SIZE = 12;
export const PRESETS = [3, 4, 5, 6, 7];            // よく使う大きさ（正方形）
export const PATTERNS = ['blank', 'stripes', 'mosaic', 'random'];
export const PATTERN_NAMES = { blank: 'まっくら', stripes: 'たてじま', mosaic: 'いちまつ', random: 'おまかせ' };
export const DEFAULT_SETTINGS = { v: 1, rows: 5, cols: 5, pattern: 'blank', sound: true };

// 押すと切り替わる窓（押した窓と上下左右。盤の外は無視）
export function neighbors(rows, cols, i) {
  const r = Math.floor(i / cols), c = i % cols;
  const out = [i];
  if (r > 0) out.push(i - cols);
  if (r < rows - 1) out.push(i + cols);
  if (c > 0) out.push(i - 1);
  if (c < cols - 1) out.push(i + 1);
  return out;
}

// cells を書き換え、切り替わった窓の番号を返す
export function press(cells, rows, cols, i) {
  const changed = neighbors(rows, cols, i);
  for (const j of changed) cells[j] = !cells[j];
  return changed;
}

export const isClear = (cells) => cells.every(Boolean);

// 固定の始まりの形（おまかせ以外）
export function fixedBoard(rows, cols, pattern) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(pattern === 'stripes' ? c % 2 === 0 : pattern === 'mosaic' ? (r + c) % 2 === 0 : false);
    }
  }
  return cells;
}

// おまかせ: 全部点いた盤から、各窓を 50% で押したことにして崩す。全部点いたままならやり直す。
// 押した手を逆にたどれば戻るので必ず解ける。
export function randomBoard(rows, cols, rand = Math.random) {
  for (;;) {
    const cells = new Array(rows * cols).fill(true);
    for (let i = 0; i < cells.length; i++) if (rand() < 0.5) press(cells, rows, cols, i);
    if (!isClear(cells)) return cells;
  }
}

export const makeBoard = (rows, cols, pattern, rand) =>
  pattern === 'random' ? randomBoard(rows, cols, rand) : fixedBoard(rows, cols, pattern);

// 全部点けるための押し方を 2 を法とする連立方程式（掃き出し法）で解く。
// 返り値: { x: 押し方の 1 つ（0/1 の配列）, kernel: 押しても盤が変わらない押し方の基底 }。解けなければ null。
// 窓 i に効く押し方 = 窓 i のとなり（行列は対称）なので、行 i は neighbors(i) に 1 を立てたもの。
export function solve(rows, cols, cells) {
  const n = rows * cols;
  const M = [];
  for (let i = 0; i < n; i++) {
    const row = new Uint8Array(n + 1);
    for (const j of neighbors(rows, cols, i)) row[j] = 1;
    row[n] = cells[i] ? 0 : 1;          // 消えている窓は奇数回切り替える
    M.push(row);
  }
  const pivotCols = [];
  let r = 0;
  for (let c = 0; c < n && r < n; c++) {
    let p = r;
    while (p < n && !M[p][c]) p++;
    if (p === n) continue;              // 自由な列
    [M[r], M[p]] = [M[p], M[r]];
    for (let q = 0; q < n; q++) {
      if (q !== r && M[q][c]) for (let k = c; k <= n; k++) M[q][k] ^= M[r][k];
    }
    pivotCols.push(c);
    r++;
  }
  for (let q = r; q < n; q++) if (M[q][n]) return null;   // 0 = 1 になる行 → 解けない

  const x = new Uint8Array(n);
  pivotCols.forEach((c, i) => { x[c] = M[i][n]; });
  const isPivot = new Uint8Array(n);
  for (const c of pivotCols) isPivot[c] = 1;
  const kernel = [];
  for (let f = 0; f < n; f++) {
    if (isPivot[f]) continue;
    const v = new Uint8Array(n);
    v[f] = 1;
    pivotCols.forEach((c, i) => { v[c] = M[i][f]; });
    kernel.push(v);
  }
  return { x, kernel };
}

// いちばん少ない押し数と、その押し方。解けなければ null。
// 核の組み合わせ（2^次元、12×12 までなら最大 4096 通り）をグレイコードの順に全部試す。
export function minSolution(rows, cols, cells) {
  const s = solve(rows, cols, cells);
  if (!s) return null;
  const cur = s.x.slice();
  let best = cur.slice(), bestW = weight(cur);
  for (let m = 1; m < 1 << s.kernel.length; m++) {
    const v = s.kernel[31 - Math.clz32(m & -m)];   // m で変わるビット
    for (let i = 0; i < cur.length; i++) cur[i] ^= v[i];
    const w = weight(cur);
    if (w < bestW) { bestW = w; best = cur.slice(); }
  }
  return { count: bestW, presses: best };
}

function weight(v) {
  let w = 0;
  for (const b of v) w += b;
  return w;
}

// その大きさで始まりの形が解けるか（おまかせは必ず解ける）
export const solvable = (rows, cols, pattern) =>
  pattern === 'random' || solve(rows, cols, fixedBoard(rows, cols, pattern)) !== null;

// ---- 保存 ----

const inRange = (n) => Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE;

// 読んだ設定を確かめる。範囲外・知らない形・壊れた値ははじめの値に戻す。
export function readSettings(raw) {
  const d = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return d;
  if (!inRange(raw.rows) || !inRange(raw.cols) || !PATTERNS.includes(raw.pattern)) {
    return typeof raw.sound === 'boolean' ? { ...d, sound: raw.sound } : d;
  }
  return { v: 1, rows: raw.rows, cols: raw.cols, pattern: raw.pattern, sound: raw.sound !== false };
}

export const recordKey = (rows, cols, pattern) => `${rows}x${cols}-${pattern}`;

export function readBest(raw) {
  const records = {};
  if (raw && raw.v === 1 && raw.records && typeof raw.records === 'object') {
    for (const [k, n] of Object.entries(raw.records)) {
      if (/^\d+x\d+-(blank|stripes|mosaic)$/.test(k) && Number.isInteger(n) && n > 0) records[k] = n;
    }
  }
  return { v: 1, records };
}

// クリアした数を記録に入れる。記録を更新したら true。おまかせは記録しない。
export function addRecord(best, rows, cols, pattern, moves) {
  if (pattern === 'random') return false;
  const k = recordKey(rows, cols, pattern);
  if (best.records[k] != null && best.records[k] <= moves) return false;
  best.records[k] = moves;
  return true;
}
