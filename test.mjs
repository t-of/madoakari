// node test.mjs — 画面を使わない部分のテスト（押す・クリア・始まりの形・解けるか・いちばん少ない数・保存）
import assert from 'node:assert/strict';
import * as L from './logic.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok ${name}`); };

// 押し方 presses（0/1）を全部押したら全部点くか
function lightsAll(rows, cols, cells, presses) {
  const b = cells.slice();
  presses.forEach((p, i) => { if (p) L.press(b, rows, cols, i); });
  return L.isClear(b);
}

// 総当たりの最少（小さい盤だけ）。解けなければ null
function bruteMin(rows, cols, cells) {
  const N = rows * cols;
  let best = null;
  for (let m = 0; m < 1 << N; m++) {
    const presses = Array.from({ length: N }, (_, i) => (m >> i) & 1);
    const w = presses.reduce((a, b) => a + b, 0);
    if ((best === null || w < best) && lightsAll(rows, cols, cells, presses)) best = w;
  }
  return best;
}

// 決まった種から同じ列を返す乱数
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('押す: 角は 3 つ、辺は 4 つ、中は 5 つ切り替わり、2 回押すと元に戻る', () => {
  const b = L.fixedBoard(3, 3, 'blank');
  assert.equal(L.press(b, 3, 3, 0).length, 3);
  assert.deepEqual(b, [true, true, false, true, false, false, false, false, false]);
  L.press(b, 3, 3, 0);
  assert.ok(b.every((x) => !x));
  assert.equal(L.press(b, 3, 3, 1).length, 4);
  assert.equal(L.press(b, 3, 3, 4).length, 5);
  // 横長の盤で、行の端から次の行へ回り込まない
  assert.deepEqual(L.neighbors(2, 4, 3).sort(), [2, 3, 7]);
  assert.deepEqual(L.neighbors(2, 4, 4).sort(), [0, 4, 5]);
});

test('始まりの形: たてじまは左から 1・3・5…列目、いちまつは左上が点いている', () => {
  assert.deepEqual(L.fixedBoard(2, 3, 'stripes'), [true, false, true, true, false, true]);
  assert.deepEqual(L.fixedBoard(2, 3, 'mosaic'), [true, false, true, false, true, false]);
  assert.ok(L.fixedBoard(4, 4, 'blank').every((x) => !x));
});

test('確かめ用の値: 3×3 まっくらの最少は 5（四隅と真ん中）、5×5 は 15', () => {
  const s3 = L.minSolution(3, 3, L.fixedBoard(3, 3, 'blank'));
  assert.equal(s3.count, 5);
  assert.deepEqual([...s3.presses], [1, 0, 1, 0, 1, 0, 1, 0, 1]);
  const b5 = L.fixedBoard(5, 5, 'blank');
  const s5 = L.minSolution(5, 5, b5);
  assert.equal(s5.count, 15);
  assert.ok(lightsAll(5, 5, b5, s5.presses));
});

test('まっくらはどの大きさ（2〜12 × 2〜12）でも解け、出した押し方で全部点く', () => {
  for (let r = 2; r <= 12; r++) {
    for (let c = 2; c <= 12; c++) {
      const b = L.fixedBoard(r, c, 'blank');
      const s = L.solve(r, c, b);
      assert.ok(s, `${r}x${c}`);
      assert.ok(lightsAll(r, c, b, s.x), `${r}x${c} の解`);
      assert.ok(s.kernel.length <= 12, `${r}x${c} の核の次元 ${s.kernel.length}`);
      for (const v of s.kernel) assert.ok(lightsAll(r, c, L.fixedBoard(r, c, 'blank').map(() => true), v), `${r}x${c} の核`);
    }
  }
});

test('解けるか・最少: 小さい盤（窓 16 以下）の全部の形を総当たりと比べる', () => {
  let unsolvable = 0;
  for (let r = 2; r <= 4; r++) {
    for (let c = 2; c <= 4; c++) {
      for (const p of ['blank', 'stripes', 'mosaic']) {
        const b = L.fixedBoard(r, c, p);
        const want = bruteMin(r, c, b);
        const got = L.minSolution(r, c, b);
        assert.equal(got ? got.count : null, want, `${r}x${c}-${p}`);
        assert.equal(L.solvable(r, c, p), want !== null, `${r}x${c}-${p} 解けるか`);
        if (got) assert.ok(lightsAll(r, c, b, got.presses));
        else unsolvable++;
      }
      // 総当たりで分かっている盤そのものを解けるか（全部の 2^N 通りのうち、ばらばらに 20）
      const rand = rng(r * 31 + c);
      for (let k = 0; k < 20; k++) {
        const b = Array.from({ length: r * c }, () => rand() < 0.5);
        const got = L.minSolution(r, c, b);
        assert.equal(got ? got.count : null, bruteMin(r, c, b), `${r}x${c} ばらばら`);
      }
    }
  }
  assert.ok(unsolvable > 0, '解けない形が 1 つもない（確かめが働いていない）');
});

test('解けない形: 4×4・3×8 はたてじま・いちまつとも解けない。2×3 はいちまつだけ解けない', () => {
  assert.equal(L.solvable(4, 4, 'stripes'), false);
  assert.equal(L.solvable(4, 4, 'mosaic'), false);
  assert.equal(L.solvable(3, 8, 'stripes'), false);
  assert.equal(L.solvable(3, 8, 'mosaic'), false);
  assert.equal(L.solvable(2, 3, 'stripes'), true);
  assert.equal(L.solvable(2, 3, 'mosaic'), false);
  assert.equal(L.solvable(5, 5, 'stripes'), true);
  assert.equal(L.solvable(4, 4, 'random'), true);
});

test('おまかせ: 全部点いてはいない盤で、必ず解ける（12×12 までばらばらに）', () => {
  const rand = rng(7);
  for (let k = 0; k < 60; k++) {
    const r = 2 + Math.floor(rand() * 11), c = 2 + Math.floor(rand() * 11);
    const b = L.randomBoard(r, c, rand);
    assert.equal(b.length, r * c);
    assert.ok(!L.isClear(b));
    const s = L.minSolution(r, c, b);
    assert.ok(s, `${r}x${c}`);
    assert.ok(lightsAll(r, c, b, s.presses));
  }
  // 崩した結果が全部点いていたらやり直す（1 回目は何も押さない乱数）
  let calls = 0;
  const b = L.randomBoard(3, 3, () => (calls++ < 9 ? 0.9 : 0.1));
  assert.ok(!L.isClear(b));
  assert.ok(calls > 9);
});

test('12×12 の最少は時間内に出る', () => {
  const t = Date.now();
  for (const p of ['blank', 'stripes', 'mosaic']) L.minSolution(12, 12, L.fixedBoard(12, 12, p));
  L.minSolution(11, 11, L.fixedBoard(11, 11, 'blank'));   // 核の次元が大きい盤
  assert.ok(Date.now() - t < 2000, `${Date.now() - t}ms`);
});

test('設定: 範囲外・知らない形・壊れた値ははじめの値に戻す', () => {
  assert.deepEqual(L.readSettings(null), L.DEFAULT_SETTINGS);
  assert.deepEqual(L.readSettings('x'), L.DEFAULT_SETTINGS);
  assert.deepEqual(L.readSettings({ v: 1, rows: 4, cols: 12, pattern: 'mosaic' }),
    { v: 1, rows: 4, cols: 12, pattern: 'mosaic', sound: true });
  assert.deepEqual(L.readSettings({ v: 1, rows: 13, cols: 5, pattern: 'blank' }), L.DEFAULT_SETTINGS);
  assert.deepEqual(L.readSettings({ v: 1, rows: 1, cols: 5, pattern: 'blank' }), L.DEFAULT_SETTINGS);
  assert.deepEqual(L.readSettings({ v: 1, rows: 5.5, cols: 5, pattern: 'blank' }), L.DEFAULT_SETTINGS);
  assert.deepEqual(L.readSettings({ v: 1, rows: 5, cols: 5, pattern: 'zigzag', sound: false }),
    { ...L.DEFAULT_SETTINGS, sound: false });
  assert.deepEqual(L.readSettings({ v: 2, rows: 3, cols: 3, pattern: 'blank' }), L.DEFAULT_SETTINGS);
});

test('記録: 少ないときだけ更新し、おまかせは入れない。壊れた記録は捨てる', () => {
  const best = L.readBest(null);
  assert.equal(L.addRecord(best, 5, 5, 'blank', 17), true);
  assert.equal(L.addRecord(best, 5, 5, 'blank', 17), false);
  assert.equal(L.addRecord(best, 5, 5, 'blank', 20), false);
  assert.equal(L.addRecord(best, 5, 5, 'blank', 15), true);
  assert.equal(L.addRecord(best, 5, 5, 'random', 3), false);
  assert.deepEqual(best.records, { '5x5-blank': 15 });
  assert.equal(L.recordKey(4, 6, 'mosaic'), '4x6-mosaic');
  const read = L.readBest({ v: 1, records: { '5x5-blank': 17, '4x6-mosaic': 9, '3x3-random': 2, junk: 1, '3x3-blank': -1 } });
  assert.deepEqual(read.records, { '5x5-blank': 17, '4x6-mosaic': 9 });
});

console.log(`${n} tests passed`);
