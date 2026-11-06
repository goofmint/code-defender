// 置けるかどうかの枠(#162)の中身を決める純粋関数。枠の可否が確定（placeInitialItem / isPlaceableCell）と同じになることを確かめる。
// ルート・点・期待値は共有定数から求めずに書く。
import { describe, expect, it } from 'vitest';
import { placeInitialItem } from './initialPlacement';
import type { InitialPlacementState } from './initialPlacement';
import {
  getPlayingPlacementPreview,
  getSetupPlacementPreview,
  HIDDEN_PLACEMENT_PREVIEW,
  isSamePlacementPreview,
} from './placementPreview';
import type { Route } from './route';

// 出現 (30, 210) → (330, 210) → 折れ点 (330, 330) → 終点 (570, 330)。
const route: Route = {
  id: 0,
  spawn: { col: 0, row: 3 },
  waypoints: [
    { col: 0, row: 3 },
    { col: 5, row: 3 },
    { col: 5, row: 5 },
    { col: 9, row: 5 },
  ],
};
// 上帯・下帯と、初期配置UIのパネル（x=72〜464、y=68〜128）だけを置けない範囲にする。
const setupContext = {
  routes: [route],
  blockedRects: [
    { x: 0, y: 0, width: 960, height: 60 },
    { x: 0, y: 480, width: 960, height: 60 },
    { x: 72, y: 68, width: 392, height: 60 },
  ],
  // Linter は Lv.1 で解放済み(#164)。
  level: 1,
};
const state: InitialPlacementState = { points: 6, itemState: { placedItems: [], nextId: 0 } };
const linter = { kind: 'item', itemType: 'linter' } as const;

describe('getSetupPlacementPreview(#162)', () => {
  it.each([
    [{ x: 456, y: 344 }, { col: 28, row: 21 }, true], // ルートの線の外形（y<336）に接するだけ
    [{ x: 456, y: 328 }, { col: 28, row: 20 }, false], // ルートの線の上
    [{ x: 168, y: 88 }, { col: 10, row: 5 }, false], // パネルの上
    [{ x: 168, y: 136 }, { col: 10, row: 8 }, true], // パネルの下（上端 y=128 がパネルの下端に接するだけ）
  ])('%j → セル %j・可否 %s。押下と同じ placeInitialItem の結果になる', (point, cell, placeable) => {
    const view = getSetupPlacementPreview(point, false, linter, state, setupContext);
    expect(view).toEqual({ visible: true, cell, placeable });
    expect(placeInitialItem(state, 'linter', cell, setupContext).ok).toBe(placeable);
  });

  it('既にある・ポイント不足は置けない色。入力の状態は変えない', () => {
    const occupied: InitialPlacementState = {
      points: 6,
      itemState: { placedItems: [{ id: 0, itemType: 'linter', cell: { col: 28, row: 21 }, lastAttackTime: null }], nextId: 1 },
    };
    const snapshot = structuredClone(occupied);
    expect(getSetupPlacementPreview({ x: 456, y: 344 }, false, linter, occupied, setupContext)).toEqual({
      visible: true,
      cell: { col: 28, row: 21 },
      placeable: false,
    });
    expect(occupied).toEqual(snapshot);
    const empty: InitialPlacementState = { points: 0, itemState: { placedItems: [], nextId: 0 } };
    expect(getSetupPlacementPreview({ x: 456, y: 344 }, false, linter, empty, setupContext)).toEqual({
      visible: true,
      cell: { col: 28, row: 21 },
      placeable: false,
    });
  });

  it('UI の上・フィールドの外（x=960、y=540、負）・アイテム以外を選んでいるときは出さない。フィールド内の端（959.99, 539.99）は出す', () => {
    expect(getSetupPlacementPreview({ x: 456, y: 344 }, true, linter, state, setupContext)).toEqual(HIDDEN_PLACEMENT_PREVIEW);
    expect(getSetupPlacementPreview({ x: 960, y: 344 }, false, linter, state, setupContext)).toEqual(HIDDEN_PLACEMENT_PREVIEW);
    expect(getSetupPlacementPreview({ x: 456, y: 540 }, false, linter, state, setupContext)).toEqual(HIDDEN_PLACEMENT_PREVIEW);
    expect(getSetupPlacementPreview({ x: -0.01, y: 344 }, false, linter, state, setupContext)).toEqual(HIDDEN_PLACEMENT_PREVIEW);
    expect(getSetupPlacementPreview({ x: 959.99, y: 539.99 }, false, linter, state, setupContext)).toEqual({
      visible: true,
      cell: { col: 59, row: 33 },
      placeable: false,
    });
    expect(getSetupPlacementPreview({ x: 456, y: 344 }, false, { kind: 'none' }, state, setupContext)).toEqual(HIDDEN_PLACEMENT_PREVIEW);
    expect(getSetupPlacementPreview({ x: 456, y: 344 }, false, { kind: 'engineer' }, state, setupContext)).toEqual(
      HIDDEN_PLACEMENT_PREVIEW,
    );
  });
});

describe('getPlayingPlacementPreview(#162)', () => {
  it('主人公の位置を含むセルに出し、既定の置けない範囲（上帯・下帯）で判定する。初期配置UIの位置にも置ける', () => {
    const playing = { routes: [route], placedItems: [] };
    expect(getPlayingPlacementPreview({ x: 456, y: 344 }, playing)).toEqual({ visible: true, cell: { col: 28, row: 21 }, placeable: true });
    expect(getPlayingPlacementPreview({ x: 456, y: 335.99 }, playing)).toEqual({
      visible: true,
      cell: { col: 28, row: 20 },
      placeable: false,
    });
    expect(getPlayingPlacementPreview({ x: 168, y: 88 }, playing)).toEqual({ visible: true, cell: { col: 10, row: 5 }, placeable: true });
    expect(getPlayingPlacementPreview({ x: 168, y: 59.99 }, playing)).toEqual({ visible: true, cell: { col: 10, row: 3 }, placeable: false });
  });
});

describe('isSamePlacementPreview(#162)', () => {
  const at = (col: number, row: number, placeable: boolean) => ({ visible: true, cell: { col, row }, placeable }) as const;
  it.each([
    [HIDDEN_PLACEMENT_PREVIEW, HIDDEN_PLACEMENT_PREVIEW, true],
    [HIDDEN_PLACEMENT_PREVIEW, at(0, 0, true), false],
    [at(0, 0, true), HIDDEN_PLACEMENT_PREVIEW, false],
    [at(28, 21, true), at(28, 21, true), true],
    [at(28, 21, true), at(29, 21, true), false],
    [at(28, 21, true), at(28, 22, true), false],
    [at(28, 21, true), at(28, 21, false), false],
  ])('%j と %j → %s', (a, b, expected) => {
    expect(isSamePlacementPreview(a, b)).toBe(expected);
  });
});
