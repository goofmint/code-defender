import { describe, expect, it } from 'vitest';
import { ENGINEER_SPAWN_CELLS } from './config';
import {
  advanceCode,
  initialSpawnElapsed,
  pickCodeKind,
  spawnCode,
  stepSpawnTimer,
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
