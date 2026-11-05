import { describe, expect, it } from 'vitest';
import { ENGINEER_SPAWN_CELLS } from './config';
import {
  advanceCode,
  initialSpawnElapsed,
  moveDistanceUnlessPaused,
  partitionCodesByRoute,
  pickCodeKind,
  spawnCode,
  stepSpawnTimer,
  stepSpawnTimerUnlessPaused,
} from './codeFlow';
import type { FlowingCode } from './codeFlow';
import { RELEASE_POINT_CENTER } from './releasePoint';
import { cellCenter, createRoutes, routePixelPoints } from './route';

// 乱数を固定してルートの形を決める（常に 0 なら曲がり列は最左、曲がる回数は最小）。
const routes = createRoutes(ENGINEER_SPAWN_CELLS, () => 0);
const topRoute = routes[0];
const middleRoute = routes[1];

const pathLength = (path: readonly { x: number; y: number }[]): number =>
  path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);

describe('spawnCode', () => {
  it('生成直後の位置は出現セルの中心で、未到達', () => {
    const code = spawnCode(1, 'normal', topRoute);
    expect(code.position).toEqual(cellCenter(topRoute.spawn));
    expect(code.released).toBe(false);
    expect(code.routeId).toBe(topRoute.id);
  });
});

describe('advanceCode の移動', () => {
  it('最初の区間（水平）は直線で進む', () => {
    const code = spawnCode(1, 'normal', middleRoute);
    const next = advanceCode(code, 30);
    expect(next.position.x).toBeCloseTo(code.position.x + 30);
    expect(next.position.y).toBeCloseTo(code.position.y);
  });

  it('上ルートは曲がり角を越えた残距離を縦方向に使う', () => {
    const code = spawnCode(1, 'normal', topRoute);
    const path = routePixelPoints(topRoute);
    const corner = path[1];
    const direction = Math.sign(path[2].y - corner.y);
    const toCorner = corner.x - code.position.x;
    const next = advanceCode(code, toCorner + 30);
    expect(next.position.x).toBeCloseTo(corner.x);
    expect(next.position.y).toBeCloseTo(corner.y + direction * 30);
  });

  it('1 回で複数区間を通過できる', () => {
    const code = spawnCode(1, 'normal', topRoute);
    const path = routePixelPoints(topRoute);
    const first = Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y);
    const second = Math.hypot(path[2].x - path[1].x, path[2].y - path[1].y);
    const next = advanceCode(code, first + second + 10);
    expect(next.segmentIndex).toBe(2);
    expect(next.position.y).toBeCloseTo(path[2].y);
    expect(next.position.x).toBeCloseTo(path[2].x + 10);
  });

  it('入力を変更しない', () => {
    const code = spawnCode(1, 'normal', topRoute);
    const snapshot = JSON.parse(JSON.stringify(code));
    advanceCode(code, 500);
    expect(JSON.parse(JSON.stringify(code))).toEqual(snapshot);
  });
});

describe('advanceCode のリリース到達（境界値）', () => {
  const code = spawnCode(1, 'normal', topRoute);
  const total = pathLength(code.path);

  it('終点の 1px 手前は未到達', () => {
    expect(advanceCode(code, total - 1).released).toBe(false);
  });

  it('終点の微小量手前は未到達', () => {
    expect(advanceCode(code, total - 1e-6).released).toBe(false);
  });

  it('ちょうど残距離で到達し、位置はリリース地点の中心', () => {
    const next = advanceCode(code, total);
    expect(next.released).toBe(true);
    expect(next.position.x).toBeCloseTo(RELEASE_POINT_CENTER.x);
    expect(next.position.y).toBeCloseTo(RELEASE_POINT_CENTER.y);
  });

  it('残距離を超えても終点を越えない', () => {
    const next = advanceCode(code, total + 1000);
    expect(next.released).toBe(true);
    expect(next.position).toEqual(RELEASE_POINT_CENTER);
  });

  it('到達後に再度進めても変化しない', () => {
    const done = advanceCode(code, total + 1);
    expect(advanceCode(done, 100)).toEqual(done);
  });

  it('距離 0 は変化しない', () => {
    expect(advanceCode(code, 0)).toEqual(code);
  });

  it('path が 1 点以下なら即到達する', () => {
    const single: FlowingCode = { ...code, path: [code.path[0]], segmentIndex: 0 };
    expect(advanceCode(single, 1).released).toBe(true);
    const empty: FlowingCode = { ...code, path: [], segmentIndex: 0 };
    expect(advanceCode(empty, 1).released).toBe(true);
  });
});

describe('stepSpawnTimer（境界値）', () => {
  const interval = 2000;

  it('間隔 - 1ms は生成しない', () => {
    expect(stepSpawnTimer(0, interval - 1, interval)).toEqual({
      elapsedMs: interval - 1,
      spawn: false,
    });
  });

  it('ちょうど間隔で生成する', () => {
    expect(stepSpawnTimer(0, interval, interval)).toEqual({ elapsedMs: 0, spawn: true });
  });

  it('間隔 + 1ms は 1 個だけ生成し、余りを持ち越す', () => {
    expect(stepSpawnTimer(0, interval + 1, interval)).toEqual({ elapsedMs: 1, spawn: true });
  });

  it('非常に大きい delta でも 1 個だけで、経過時間は間隔未満', () => {
    const result = stepSpawnTimer(0, interval * 1000 + 5, interval);
    expect(result.spawn).toBe(true);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.elapsedMs).toBeLessThan(interval);
  });

  it('初回（初期値）はすぐ生成する', () => {
    expect(stepSpawnTimer(initialSpawnElapsed(interval), 0, interval).spawn).toBe(true);
  });
});

describe('stepSpawnTimerUnlessPaused（休暇中の停止 #36・境界値）', () => {
  const interval = 2000;
  // 1 か月分の大きい delta。
  const huge = 60000;

  it.each([interval - 1, interval, interval + 1])('停止中は elapsed + delta = %i でも生成せず、入力値を保持する', (total) => {
    expect(stepSpawnTimerUnlessPaused(0, total, interval, true)).toEqual({ elapsedMs: 0, spawn: false });
    expect(stepSpawnTimerUnlessPaused(interval - 1, total - (interval - 1), interval, true)).toEqual({
      elapsedMs: interval - 1,
      spawn: false,
    });
  });

  it('停止中は初期値と delta = 0 でも生成せず、解除後は生成する', () => {
    const initial = initialSpawnElapsed(interval);
    expect(stepSpawnTimerUnlessPaused(initial, 0, interval, true)).toEqual({ elapsedMs: initial, spawn: false });
    expect(stepSpawnTimerUnlessPaused(initial, 0, interval, false)).toEqual({ elapsedMs: 0, spawn: true });
  });

  it('停止中は大きい delta でも生成せず、値を保持する', () => {
    expect(stepSpawnTimerUnlessPaused(interval - 1, huge, interval, true)).toEqual({
      elapsedMs: interval - 1,
      spawn: false,
    });
  });

  it.each<[number, number, boolean]>([
    [0, interval - 1, false],
    [1, 0, true],
    [2, 1, true],
  ])('解除後、凍結値 interval - 1 に delta = %i → 経過 %i・生成 %s', (delta, elapsedMs, spawn) => {
    expect(stepSpawnTimerUnlessPaused(interval - 1, delta, interval, false)).toEqual({ elapsedMs, spawn });
  });

  it('解除後は大きい delta でも 1 個だけで、経過時間は間隔未満', () => {
    const result = stepSpawnTimerUnlessPaused(interval - 1, huge, interval, false);
    expect(result.spawn).toBe(true);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.elapsedMs).toBeLessThan(interval);
  });

  it.each<[number, number]>([
    [0, interval - 1],
    [0, interval],
    [interval - 1, 2],
    [0, huge],
  ])('停止していなければ stepSpawnTimer と同じ（elapsed %i, delta %i）', (elapsedMs, delta) => {
    expect(stepSpawnTimerUnlessPaused(elapsedMs, delta, interval, false)).toEqual(
      stepSpawnTimer(elapsedMs, delta, interval),
    );
  });
});

describe('moveDistanceUnlessPaused（休暇中の停止 #36・境界値）', () => {
  it.each([0, 1, 30, 1e6])('停止中は基準 %i でも 0', (distance) => {
    expect(moveDistanceUnlessPaused(distance, true)).toBe(0);
  });

  it.each([0, 1, 30, 1e6])('停止していなければ基準 %i をそのまま返す', (distance) => {
    expect(moveDistanceUnlessPaused(distance, false)).toBe(distance);
  });

  it.each(['normal', 'malicious'] as const)(
    '%s: 残り 1px のコードに停止中の大きい距離を渡してもリリースされず、元のオブジェクトのまま',
    (kind) => {
      const code = spawnCode(1, kind, topRoute);
      const nearEnd = advanceCode(code, pathLength(code.path) - 1);
      expect(nearEnd.released).toBe(false);
      const next = advanceCode(nearEnd, moveDistanceUnlessPaused(1e6, true));
      expect(next).toBe(nearEnd);
      expect(next.released).toBe(false);
      expect(next.id).toBe(nearEnd.id);
      expect(next.kind).toBe(kind);
      expect(next.path).toBe(nearEnd.path);
      expect(next.segmentIndex).toBe(nearEnd.segmentIndex);
      expect(next.position).toEqual(nearEnd.position);
    },
  );

  describe('解除後のリリース境界', () => {
    const code = spawnCode(1, 'malicious', topRoute);
    const total = pathLength(code.path);
    // 途中まで進めたあと停止し、解除後に残り距離 - 1 / 一致 / + 1 を渡す。
    const half = advanceCode(code, total / 2);
    const frozen = advanceCode(half, moveDistanceUnlessPaused(total, true));
    const remaining = total - total / 2;

    it.each<[string, number, boolean]>([
      ['残り距離 - 1', remaining - 1, false],
      ['残り距離ちょうど', remaining, true],
      ['残り距離 + 1', remaining + 1, true],
    ])('%s は released=%s', (_label, distance, released) => {
      expect(frozen).toBe(half);
      const next = advanceCode(frozen, moveDistanceUnlessPaused(distance, false));
      expect(next.released).toBe(released);
      if (released) {
        expect(next.position.x).toBeCloseTo(RELEASE_POINT_CENTER.x);
        expect(next.position.y).toBeCloseTo(RELEASE_POINT_CENTER.y);
      }
    });
  });
});

describe('pickCodeKind（境界値）', () => {
  const rate = 0.3;

  it('random = 0 は不正', () => {
    expect(pickCodeKind(() => 0, rate)).toBe('malicious');
  });

  it('random = rate - ε は不正', () => {
    expect(pickCodeKind(() => rate - 1e-9, rate)).toBe('malicious');
  });

  it('random = rate は正常', () => {
    expect(pickCodeKind(() => rate, rate)).toBe('normal');
  });

  it('random が 1 に近い値は正常', () => {
    expect(pickCodeKind(() => 1 - 1e-9, rate)).toBe('normal');
  });

  it('rate = 0 は常に正常', () => {
    expect(pickCodeKind(() => 0, 0)).toBe('normal');
  });

  it('rate = 1 は常に不正', () => {
    expect(pickCodeKind(() => 1 - 1e-9, 1)).toBe('malicious');
  });
});

describe('partitionCodesByRoute（退職でルートが消える #32）', () => {
  const codeOn = (id: number, routeIndex: number): FlowingCode => spawnCode(id, 'normal', routes[routeIndex]);

  it('空配列なら両方とも空', () => {
    expect(partitionCodesByRoute([], 0)).toEqual({ remaining: [], removed: [] });
  });

  it('該当するコードがなければ全部残る', () => {
    const codes = [codeOn(0, 1), codeOn(1, 2)];
    const result = partitionCodesByRoute(codes, 0);
    expect(result.removed).toEqual([]);
    expect(result.remaining).toEqual(codes);
    expect(result.remaining).not.toBe(codes);
  });

  it('全部が該当すれば全部消える', () => {
    const codes = [codeOn(0, 0), codeOn(1, 0)];
    const result = partitionCodesByRoute(codes, routes[0].id);
    expect(result.remaining).toEqual([]);
    expect(result.removed.map((code) => code.id)).toEqual([0, 1]);
  });

  it('複数ルートが混ざっていても該当ルートだけを、元の順序と参照のまま分ける', () => {
    const codes = [codeOn(0, 0), codeOn(1, 1), codeOn(2, 0), codeOn(3, 2), codeOn(4, 1)];
    const result = partitionCodesByRoute(codes, routes[1].id);
    expect(result.removed.map((code) => code.id)).toEqual([1, 4]);
    expect(result.remaining.map((code) => code.id)).toEqual([0, 2, 3]);
    expect(result.removed[0]).toBe(codes[1]);
    expect(result.remaining[2]).toBe(codes[3]);
  });

  it('入力の配列とコードを変更しない', () => {
    const codes = [codeOn(0, 0), codeOn(1, 1)];
    const before = [...codes];
    const snapshot = structuredClone(codes);
    partitionCodesByRoute(codes, routes[0].id);
    expect(codes).toEqual(snapshot);
    codes.forEach((code, i) => expect(code).toBe(before[i]));
  });

  it('routeId を持つ別の型（シーン側の Graphics 付きなど）にも使え、追加の項目を保つ', () => {
    const items = [
      { routeId: 0, label: 'a' },
      { routeId: 1, label: 'b' },
    ];
    expect(partitionCodesByRoute(items, 1)).toEqual({ remaining: [items[0]], removed: [items[1]] });
  });
});
