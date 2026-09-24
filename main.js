import * as L from './logic.js';

// localStorage はほかのアプリと共有される（同じ t-of.github.io のため）。
// キーは必ず 'madoakari.' で始める。
const STORE = 'madoakari.';

function load(key, fallback) {
  try {
    const v = localStorage.getItem(STORE + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ }
}

WebAppKit.init({ title: 'まどあかり', text: '夜の建物の窓をタップして明かりをつける。押した窓と上下左右のとなりが一緒に切り替わるので、どこを押すかを考えて、なるべく少ない数で全部の窓を灯す。' });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// ---- 設定と記録 ----

const settings = L.readSettings(load('settings', null));
const best = L.readBest(load('best', null));
if (!L.solvable(settings.rows, settings.cols, settings.pattern)) settings.pattern = 'blank';
let customOpen = !(settings.rows === settings.cols && L.PRESETS.includes(settings.rows));

const saveSettings = () => save('settings', settings);

// ---- 音（Web Audio で作る。ファイルは使わない） ----

// iPhone のマナーモードでも鳴らす（Safari 16.4 以降）。
// 'playback' にすると音楽アプリの曲が止まるので、アプリの音がオンのときだけにする。
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}
setAudioSession(settings.sound);

let actx = null;
function tone(freq, { dur = 0.12, type = 'sine', gain = 0.08, delay = 0 } = {}) {
  if (!settings.sound) return;
  try {
    setAudioSession(true);
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* 音が出せなくても遊べる */ }
}
const sfx = {
  tap: () => tone(660, { dur: 0.06, type: 'triangle', gain: 0.05 }),
  on: () => tone(784, { dur: 0.14, type: 'triangle' }),       // 押した窓が点いた
  off: () => tone(392, { dur: 0.12 }),                        // 押した窓が消えた
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.4, type: 'triangle', gain: 0.07, delay: i * 0.11 })),
  record: () => [1319, 1568, 2093].forEach((f, i) => tone(f, { dur: 0.3, gain: 0.05, delay: 0.55 + i * 0.08 })),   // クリアの音のあとに
};

// ---- タイトル ----

const $ = (id) => document.getElementById(id);
const titleEl = $('title'), playEl = $('play'), clearEl = $('clear');

function show(screen) {
  titleEl.hidden = screen !== titleEl;
  playEl.hidden = screen !== playEl;
}

// 窓を並べる（タイトルの見本・形の絵）
function miniWindows(el, cols, cells) {
  el.style.setProperty('--cols', cols);
  el.innerHTML = cells.map((on) => `<span class="win${on ? ' on' : ''}"></span>`).join('');
}

// 見本: 窓がいくつか灯った夜の建物
{
  const sample = $('sample');
  sample.innerHTML = '<div class="building__roof"><span class="tank"></span></div><div class="windows"></div>';
  const lit = [1, 5, 6, 7, 11, 13, 18];
  miniWindows(sample.lastChild, 5, Array.from({ length: 20 }, (_, i) => lit.includes(i)));
}

const sizesEl = $('sizes');
sizesEl.innerHTML = L.PRESETS.map((n) => `<button class="chip" data-size="${n}">${n}×${n}</button>`).join('')
  + '<button class="chip" data-size="custom">じぶんで</button>';

// 形のボタン（4×4 の小さな絵つき。おまかせは見本の 1 つ）
const patternsEl = $('patterns');
const RANDOM_PIC = [1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 0, 1].map(Boolean);
patternsEl.innerHTML = L.PATTERNS.map((p) =>
  `<button class="shape" data-pattern="${p}"><span class="shape__pic windows"></span><span class="shape__name">${L.PATTERN_NAMES[p]}</span></button>`).join('');
for (const b of patternsEl.children) {
  const p = b.dataset.pattern;
  miniWindows(b.firstChild, 4, p === 'random' ? RANDOM_PIC : L.fixedBoard(4, 4, p));
}

function renderTitle() {
  const { rows, cols, pattern } = settings;
  for (const b of sizesEl.children) {
    const s = b.dataset.size;
    b.setAttribute('aria-pressed', String(s === 'custom' ? customOpen : !customOpen && rows === +s && cols === +s));
  }
  $('custom').hidden = !customOpen;
  for (const st of document.querySelectorAll('.stepper')) {
    const v = settings[st.dataset.dim];
    st.querySelector('output').textContent = v;
    st.querySelector('[data-step="-1"]').disabled = v <= L.MIN_SIZE;
    st.querySelector('[data-step="1"]').disabled = v >= L.MAX_SIZE;
  }
  const bad = [];
  for (const b of patternsEl.children) {
    const p = b.dataset.pattern;
    b.disabled = !L.solvable(rows, cols, p);
    b.setAttribute('aria-pressed', String(p === pattern));
    if (b.disabled) bad.push(L.PATTERN_NAMES[p]);
  }
  $('unsolvable').hidden = !bad.length;
  $('unsolvable').textContent = `${bad.join('・')}は、この大きさでは解けない`;
  const rec = best.records[L.recordKey(rows, cols, pattern)];
  $('record').hidden = rec == null;
  if (rec != null) {
    const min = L.minSolution(rows, cols, L.fixedBoard(rows, cols, pattern)).count;
    $('record').textContent = `${rows}×${cols} ${L.PATTERN_NAMES[pattern]}の記録 ${rec} 回（最少 ${min} 回）`;
  }
  const snd = $('sound-btn');
  snd.textContent = settings.sound ? '音 オン' : '音 オフ';
  snd.setAttribute('aria-pressed', String(settings.sound));
}

// 大きさを変えたとき、その大きさで解けない形を選んでいたら、まっくらにする
function setSize(rows, cols) {
  settings.rows = rows;
  settings.cols = cols;
  if (!L.solvable(rows, cols, settings.pattern)) settings.pattern = 'blank';
  saveSettings();
  renderTitle();
}

sizesEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]');
  if (!b) return;
  sfx.tap();
  if (b.dataset.size === 'custom') { customOpen = true; renderTitle(); return; }
  customOpen = false;
  setSize(+b.dataset.size, +b.dataset.size);
});

$('custom').addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  sfx.tap();
  const dim = b.closest('.stepper').dataset.dim;
  const v = Math.min(L.MAX_SIZE, Math.max(L.MIN_SIZE, settings[dim] + +b.dataset.step));
  if (dim === 'rows') setSize(v, settings.cols); else setSize(settings.rows, v);
});

patternsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pattern]');
  if (!b || b.disabled) return;
  sfx.tap();
  settings.pattern = b.dataset.pattern;
  saveSettings();
  renderTitle();
});

$('sound-btn').addEventListener('click', () => {
  settings.sound = !settings.sound;
  setAudioSession(settings.sound);
  saveSettings();
  sfx.tap();
  renderTitle();
});

// ---- 遊ぶ ----

const boardEl = $('board'), buildingEl = $('building'), stageEl = $('stage');
let game = null;
let clearLockUntil = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// 盤を作る（おまかせは崩し直す）。窓のボタンはここで 1 回だけ作り、押したときは色を変えるだけ
function newGame() {
  const { rows, cols, pattern } = settings;
  const start = L.makeBoard(rows, cols, pattern);
  game = { rows, cols, pattern, start, cells: null, moves: 0, min: L.minSolution(rows, cols, start).count, done: false };
  boardEl.style.setProperty('--cols', cols);
  boardEl.innerHTML = '';
  for (let i = 0; i < rows * cols; i++) {
    const b = document.createElement('button');
    b.className = 'win';
    b.dataset.i = i;
    b.setAttribute('aria-label', `${Math.floor(i / cols) + 1} 段目 ${i % cols + 1} 列目`);
    boardEl.append(b);
  }
  $('another-btn').hidden = pattern !== 'random';
  $('min').textContent = game.min;
  restart();
  fit();
}

// はじめから: 同じ始まりの形（おまかせでも同じ盤）に戻す
function restart() {
  game.cells = game.start.slice();
  game.moves = 0;
  game.done = false;
  clearEl.hidden = true;
  playEl.classList.remove('cleared');
  buildingEl.classList.remove('glow');
  for (const b of boardEl.children) paint(b);
  $('moves').textContent = 0;
}

function paint(b) {
  const on = game.cells[b.dataset.i];
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
}

// 窓の大きさ: 幅（最大 480px）と、上下の表示を除いた高さの両方に収まる正方形
function fit() {
  if (!game || playEl.hidden) return;
  const cs = getComputedStyle(buildingEl);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + buildingEl.firstElementChild.offsetHeight;
  const gap = Math.max(game.rows, game.cols) > 8 ? 2 : 4;
  const w = Math.min(stageEl.clientWidth, 480) - padX - gap * (game.cols - 1);
  const h = stageEl.clientHeight - parseFloat(getComputedStyle(stageEl).paddingTop) - padY - gap * (game.rows - 1);
  const size = Math.max(10, Math.min(88, Math.floor(Math.min(w / game.cols, h / game.rows))));
  boardEl.style.setProperty('--win', `${size}px`);
  boardEl.style.setProperty('--gap', `${gap}px`);
}
new ResizeObserver(fit).observe(stageEl);

boardEl.addEventListener('click', (e) => {
  const b = e.target.closest('.win');
  if (!b || game.done) return;
  const i = +b.dataset.i;
  const changed = L.press(game.cells, game.rows, game.cols, i);
  game.moves++;
  $('moves').textContent = game.moves;
  for (const j of changed) {
    const w = boardEl.children[j];
    paint(w);
    if (!reduceMotion.matches) {
      w.classList.remove('flash');
      void w.offsetWidth;          // 続けて押しても光り直す
      w.classList.add('flash');
    }
  }
  if (L.isClear(game.cells)) finish();
  else if (game.cells[i]) sfx.on();
  else sfx.off();
});
boardEl.addEventListener('animationend', (e) => e.target.classList.remove('flash'));

function finish() {
  game.done = true;
  sfx.clear();
  buildingEl.classList.add('glow');
  const record = L.addRecord(best, game.rows, game.cols, game.pattern, game.moves);
  if (record) { save('best', best); sfx.record(); }
  $('clear-moves').textContent = game.moves;
  $('clear-min').textContent = game.min;
  const badges = [];
  if (game.moves === game.min) badges.push('最少で灯した');
  if (record) badges.push('記録更新');
  $('badges').innerHTML = badges.map((t) => `<span class="badge">${t}</span>`).join('');
  $('badges').hidden = !badges.length;
  clearEl.hidden = false;
  playEl.classList.add('cleared');
  // 出た直後の 0.4 秒は押せない（最後の窓を押した勢いで「もう一度」を押さないように）
  clearLockUntil = performance.now() + 400;
  clearEl.classList.add('locked');
  setTimeout(() => clearEl.classList.remove('locked'), 400);
}

const unlocked = () => performance.now() >= clearLockUntil;

function play() {
  sfx.tap();
  show(playEl);
  newGame();
}

function toTitle() {
  sfx.tap();
  show(titleEl);
  renderTitle();
}

$('play-btn').addEventListener('click', play);
$('back-btn').addEventListener('click', toTitle);
$('reset-btn').addEventListener('click', () => { sfx.tap(); restart(); });
$('another-btn').addEventListener('click', play);
// もう一度: 同じ大きさ・形。おまかせなら新しい盤
$('again-btn').addEventListener('click', () => {
  if (!unlocked()) return;
  if (game.pattern === 'random') play(); else { sfx.tap(); restart(); }
});
$('home-btn').addEventListener('click', () => { if (unlocked()) toTitle(); });
$('share-btn').addEventListener('click', () => {
  if (!unlocked()) return;
  WebAppKit.share({ text: `まどあかりで ${game.rows}×${game.cols} の窓を ${game.moves} 回で全部灯した（最少 ${game.min} 回）` });
});

// PC: Enter でタイトルは「あそぶ」、クリアは「もう一度」（ボタンにフォーカスがあるときはそのボタンに任せる）
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.closest('button, a')) return;
  if (!titleEl.hidden) $('play-btn').click();
  else if (!clearEl.hidden) $('again-btn').click();
});

renderTitle();
