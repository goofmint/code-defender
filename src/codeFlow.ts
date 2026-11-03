// コードの流れの純粋ロジック。Phaser には依存しない（テスト可能にするため）。
import type { CodeKind } from './code';
import type { MaliciousCodeType } from './maliciousCode';
import type { Point, Route } from './route';
import { routePixelPoints } from './route';

export type FlowingCode = {
  readonly id: number;
  readonly kind: CodeKind;
  readonly routeId: number;
  readonly path: readonly Point[];
  // 現在の区間の始点の添字。目標は path[segmentIndex + 1]。
  readonly segmentIndex: number;
  readonly position: Point;
  readonly released: boolean;
  // 不正コードの種別。種別の抽選が入るまでは持たない。
  readonly maliciousType?: MaliciousCodeType;
};

// リリース地点へ到達したときにシーンが発行するイベント名。
export const CODE_RELEASED_EVENT = 'code-released';

export type CodeReleasedPayload = {
  readonly id: number;
  readonly kind: CodeKind;
  readonly routeId: number;
  readonly maliciousType?: MaliciousCodeType;
};

export const spawnCode = (id: number, kind: CodeKind, route: Route): FlowingCode => {
  const path = routePixelPoints(route);
  return {
    id,
    kind,
    routeId: route.id,
    path,
    segmentIndex: 0,
    position: path[0],
    released: false,
  };
};

// 距離ぶん進める。残距離は次の区間へ持ち越し、終点を越えない。入力は変更しない。
export const advanceCode = (code: FlowingCode, distance: number): FlowingCode => {
  if (code.released || distance <= 0) return code;
  const { path } = code;
  if (path.length <= 1) return { ...code, released: true };

  let { segmentIndex, position } = code;
  let remaining = distance;
  while (segmentIndex < path.length - 1) {
    const target = path[segmentIndex + 1];
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const length = Math.hypot(dx, dy);
    if (remaining < length) {
      const ratio = remaining / length;
      return {
        ...code,
        segmentIndex,
        position: { x: position.x + dx * ratio, y: position.y + dy * ratio },
      };
    }
    remaining -= length;
    position = target;
    segmentIndex += 1;
  }
  return { ...code, segmentIndex, position, released: true };
};

// 初期値を間隔と同じにすると、最初の更新ですぐ 1 個生成される。
export const initialSpawnElapsed = (intervalMs: number): number => intervalMs;

// 経過時間を進め、間隔に達したら生成フラグを立てる。1 回の更新で最大 1 個。経過時間は [0, 間隔) に収める。
export const stepSpawnTimer = (
  elapsedMs: number,
  deltaMs: number,
  intervalMs: number,
): { readonly elapsedMs: number; readonly spawn: boolean } => {
  const total = elapsedMs + deltaMs;
  if (total < intervalMs) return { elapsedMs: total, spawn: false };
  return { elapsedMs: total % intervalMs, spawn: true };
};

// random(0以上1未満) が割合未満なら不正コード。
export const pickCodeKind = (random: () => number, maliciousRate: number): CodeKind =>
  random() < maliciousRate ? 'malicious' : 'normal';
