// アイテムの見た目(#154): drawPlacedItem が、配置判定のフットプリント（配置グリッド 1マス = 16px）と同じ大きさの四角を、
// セルの中心に描くことを確かめる。Phaser はモックし、scene.add.rectangle / text / container の呼び出し引数を記録する。
import { describe, expect, it, vi } from 'vitest';
import {
  ITEM_BOX_CELLS,
  ITEM_BOX_SIZE,
  ITEM_BOX_STROKE,
  ITEM_COLORS,
  ITEM_MARK_STYLE,
  ITEM_MARKS,
  PLACEMENT_CELL_SIZE,
  PLACEMENT_PREVIEW,
} from './config';
import { ITEM_TYPES } from './item';
import { itemFootprint, placementCellCenter } from './itemPlacement';
import type { PlacedItem } from './itemPlacement';
import { drawPlacedItem, drawPlacementPreview, updatePlacementPreview } from './render';

vi.mock('phaser', () => ({
  default: { Scene: class {}, Geom: { Rectangle: class {}, Circle: class {} } },
}));

type RectangleCall = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly color: number };
type TextCall = { readonly x: number; readonly y: number; readonly text: string; readonly style: Record<string, string | number> };
type ContainerCall = { readonly x: number; readonly y: number; readonly children: readonly object[] };

// 呼び出し引数を記録するだけの scene（描画しない）。
const createFakeScene = () => {
  const rectangles: RectangleCall[] = [];
  const texts: TextCall[] = [];
  const containers: ContainerCall[] = [];
  const strokes: { readonly width: number; readonly color: number }[] = [];
  const origins: number[] = [];
  const depths: number[] = [];
  const scene = {
    add: {
      rectangle: (x: number, y: number, width: number, height: number, color: number) => {
        rectangles.push({ x, y, width, height, color });
        const box = {
          setStrokeStyle: (width: number, color: number) => {
            strokes.push({ width, color });
            return box;
          },
        };
        return box;
      },
      text: (x: number, y: number, text: string, style: Record<string, string | number>) => {
        texts.push({ x, y, text, style });
        const mark = {
          setOrigin: (origin: number) => {
            origins.push(origin);
            return mark;
          },
        };
        return mark;
      },
      container: (x: number, y: number, children: readonly object[]) => {
        containers.push({ x, y, children });
        const container = {
          setDepth: (depth: number) => {
            depths.push(depth);
            return container;
          },
        };
        return container;
      },
    },
  };
  return { scene, rectangles, texts, containers, strokes, origins, depths };
};

const item = (itemType: PlacedItem['itemType'], cell: PlacedItem['cell']): PlacedItem => ({ id: 0, itemType, cell, lastAttackTime: null });

describe('drawPlacedItem: 配置グリッド 1マスの見た目(#154)', () => {
  it('四角の一辺は配置グリッド 1マス（16px）で、itemFootprint の幅・高さと一致する', () => {
    expect(ITEM_BOX_CELLS).toBe(1);
    expect(ITEM_BOX_SIZE).toBe(PLACEMENT_CELL_SIZE * ITEM_BOX_CELLS);
    const cell = { col: 28, row: 16 };
    const { scene, rectangles } = createFakeScene();
    drawPlacedItem(scene as never, item('linter', cell));
    const footprint = itemFootprint(cell);
    expect(rectangles).toHaveLength(1);
    expect(rectangles[0].width).toBe(footprint.width);
    expect(rectangles[0].height).toBe(footprint.height);
    expect(rectangles[0].width).toBe(16);
    // Container の中の原点 (0, 0) に描くので、Container の位置がそのまま四角の中心になる。
    expect(rectangles[0].x).toBe(0);
    expect(rectangles[0].y).toBe(0);
  });

  it.each([
    [{ col: 0, row: 0 }],
    [{ col: 28, row: 16 }],
    [{ col: 59, row: 33 }],
  ])('Container の位置は placementCellCenter(%j)', (cell) => {
    const { scene, containers } = createFakeScene();
    drawPlacedItem(scene as never, item('cat', cell));
    const center = placementCellCenter(cell);
    expect(containers).toHaveLength(1);
    expect(containers[0].x).toBe(center.x);
    expect(containers[0].y).toBe(center.y);
    // 四角の範囲（Container の位置 ± 半辺）がフットプリントと一致する。
    const footprint = itemFootprint(cell);
    expect(containers[0].x - ITEM_BOX_SIZE / 2).toBe(footprint.x);
    expect(containers[0].y - ITEM_BOX_SIZE / 2).toBe(footprint.y);
  });

  it.each(ITEM_TYPES)('%s: 色・縁取り・マークの文字とスタイルは config の値（文字 8px・黒縁 1px・四角の縁取り 1px）', (itemType) => {
    const { scene, rectangles, texts, strokes, origins } = createFakeScene();
    drawPlacedItem(scene as never, item(itemType, { col: 30, row: 8 }));
    expect(rectangles[0].color).toBe(ITEM_COLORS[itemType]);
    expect(strokes).toEqual([{ width: ITEM_BOX_STROKE.width, color: ITEM_BOX_STROKE.color }]);
    expect(strokes[0].width).toBe(1);
    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe(ITEM_MARKS[itemType]);
    expect(texts[0].style.fontSize).toBe(ITEM_MARK_STYLE.fontSize);
    expect(texts[0].style.fontSize).toBe('8px');
    expect(texts[0].style.strokeThickness).toBe(ITEM_MARK_STYLE.strokeThickness);
    expect(texts[0].style.strokeThickness).toBe(1);
    expect(texts[0].style.color).toBe(ITEM_MARK_STYLE.color);
    expect(texts[0].style.stroke).toBe(ITEM_MARK_STYLE.strokeColor);
    expect(origins).toEqual([0.5]);
  });

  it('Container は [四角, 文字] の順で、四角と文字は Container の中心 (0, 0) に置く', () => {
    const { scene, containers, texts } = createFakeScene();
    drawPlacedItem(scene as never, item('ci', { col: 5, row: 5 }));
    expect(containers[0].children).toHaveLength(2);
    expect(texts[0].x).toBe(0);
    expect(texts[0].y).toBe(0);
  });
});

// 置けるかどうかの枠(#162)。塗りのない 16px の四角を作り、updatePlacementPreview でセルの中心へ動かして色を変える。
// 呼び出しを順に記録するだけの偽の Rectangle（描画しない）。
const createFakePreviewScene = () => {
  const rectangles: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly fillColor?: number }[] = [];
  const calls: (readonly [string, ...number[]] | readonly ['setVisible', boolean])[] = [];
  const preview = {
    setStrokeStyle: (width: number, color: number, alpha: number) => {
      calls.push(['setStrokeStyle', width, color, alpha]);
      return preview;
    },
    setDepth: (depth: number) => {
      calls.push(['setDepth', depth]);
      return preview;
    },
    setVisible: (visible: boolean) => {
      calls.push(['setVisible', visible]);
      return preview;
    },
    setPosition: (x: number, y: number) => {
      calls.push(['setPosition', x, y]);
      return preview;
    },
  };
  const scene = {
    add: {
      rectangle: (x: number, y: number, width: number, height: number, fillColor?: number) => {
        rectangles.push({ x, y, width, height, fillColor });
        return preview;
      },
    },
  };
  return { scene, preview, rectangles, calls };
};

describe('置けるかどうかの枠(#162)', () => {
  it('drawPlacementPreview は塗りのない一辺 16px の四角を、アイテム(0.4)より手前・×ボタン(0.6)より奥に、隠して作る', () => {
    const { scene, rectangles, calls } = createFakePreviewScene();
    drawPlacementPreview(scene as never);
    expect(rectangles).toEqual([{ x: 0, y: 0, width: 16, height: 16, fillColor: undefined }]);
    expect(calls).toEqual([
      ['setStrokeStyle', PLACEMENT_PREVIEW.lineWidth, PLACEMENT_PREVIEW.okColor, PLACEMENT_PREVIEW.alpha],
      ['setDepth', 0.45],
      ['setVisible', false],
    ]);
    expect(PLACEMENT_PREVIEW.depth).toBeGreaterThan(0.4);
    expect(PLACEMENT_PREVIEW.depth).toBeLessThan(0.6);
  });

  it('置けるなら ok の色、置けないなら ng の色で、セル (28, 21) の中心 (456, 344) に出す', () => {
    const { scene, preview, calls } = createFakePreviewScene();
    drawPlacementPreview(scene as never);
    calls.length = 0;
    updatePlacementPreview(preview as never, { visible: true, cell: { col: 28, row: 21 }, placeable: true });
    expect(calls).toEqual([
      ['setPosition', 456, 344],
      ['setStrokeStyle', PLACEMENT_PREVIEW.lineWidth, PLACEMENT_PREVIEW.okColor, PLACEMENT_PREVIEW.alpha],
      ['setVisible', true],
    ]);
    calls.length = 0;
    updatePlacementPreview(preview as never, { visible: true, cell: { col: 0, row: 0 }, placeable: false });
    expect(calls).toEqual([
      ['setPosition', 8, 8],
      ['setStrokeStyle', PLACEMENT_PREVIEW.lineWidth, PLACEMENT_PREVIEW.ngColor, PLACEMENT_PREVIEW.alpha],
      ['setVisible', true],
    ]);
    expect(PLACEMENT_PREVIEW.okColor).not.toBe(PLACEMENT_PREVIEW.ngColor);
  });

  it('出さないときは隠すだけで、位置・色は変えない', () => {
    const { scene, preview, calls } = createFakePreviewScene();
    drawPlacementPreview(scene as never);
    calls.length = 0;
    updatePlacementPreview(preview as never, { visible: false });
    expect(calls).toEqual([['setVisible', false]]);
  });
});
