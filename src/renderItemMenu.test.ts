// アイテムのメニューのページ送り矢印(#187)。Phaser はモックし、scene.add の呼び出しと入力ハンドラを記録する。
import { describe, expect, it, vi } from 'vitest';
import { ITEM_PAGE_BUTTON_LABELS, ITEM_PAGE_SIZE } from './config';
import { drawItemMenu } from './render';

vi.mock('phaser', () => ({
  default: { Scene: class {}, Geom: { Rectangle: class {}, Circle: class {} } },
}));

type FakeObject = {
  readonly kind: string;
  readonly args: readonly (string | number | object)[];
  interactive: boolean;
  readonly handlers: Map<string, () => void>;
  readonly setOrigin: (...values: number[]) => FakeObject;
  readonly setDepth: (depth: number) => FakeObject;
  readonly setStrokeStyle: (...values: number[]) => FakeObject;
  readonly setInteractive: (...values: object[]) => FakeObject;
  readonly setSize: (width: number, height: number) => FakeObject;
  readonly setText: (text: string) => FakeObject;
  readonly add: (...children: object[]) => FakeObject;
  readonly on: (event: string, handler: () => void) => FakeObject;
  readonly destroy: () => void;
};

// 呼び出しを記録するだけの scene（描画しない）。作った物は objects に作った順に入る。
const createFakeScene = () => {
  const objects: FakeObject[] = [];
  const make = (kind: string, args: readonly (string | number | object)[]): FakeObject => {
    const handlers = new Map<string, () => void>();
    const object: FakeObject = {
      kind,
      args,
      interactive: false,
      handlers,
      setOrigin: () => object,
      setDepth: () => object,
      setStrokeStyle: () => object,
      setInteractive: () => ((object.interactive = true), object),
      setSize: () => object,
      setText: () => object,
      add: () => object,
      on: (event, handler) => (handlers.set(event, handler), object),
      destroy: () => undefined,
    };
    objects.push(object);
    return object;
  };
  const scene = {
    add: {
      rectangle: (...args: (string | number)[]) => make('rectangle', args),
      text: (...args: (string | number | object)[]) => make('text', args),
      container: (...args: (number | object)[]) => make('container', args),
    },
  };
  return { scene, objects };
};

const draw = (pageCount: number) => {
  const { scene, objects } = createFakeScene();
  const callbacks = { onBuySlot: vi.fn(), onPage: vi.fn() };
  const view = {
    labels: Array.from({ length: ITEM_PAGE_SIZE }, (_, slot) => `アイテム${slot}`),
    pageLabel: `1/${pageCount}`,
    pageCount,
    selectedSlot: null,
  };
  drawItemMenu(scene as never, view, callbacks);
  const texts = objects.filter((object) => object.kind === 'text');
  const textOf = (label: string) => texts.find((text) => text.args[2] === label);
  return { objects, texts, textOf, callbacks };
};

describe('drawItemMenu のページ送り矢印(#187)', () => {
  it('境界値: pageCount 1 では ◀ ▶ の文字も、押せるボタンも作らず、「1/1」だけ出す', () => {
    const { objects, texts, textOf } = draw(1);
    expect(textOf(ITEM_PAGE_BUTTON_LABELS.previous)).toBeUndefined();
    expect(textOf(ITEM_PAGE_BUTTON_LABELS.next)).toBeUndefined();
    expect(textOf('1/1')).toBeDefined();
    expect(texts.every((text) => !text.interactive)).toBe(true);
    // 押せるのは ITEM_PAGE_SIZE 個の枠のボタンと、入力を止めるパネル背景だけ（矢印の当たり判定はない）。
    const interactive = objects.filter((object) => object.interactive);
    expect(interactive).toHaveLength(ITEM_PAGE_SIZE + 1);
    expect(interactive.filter((object) => object.kind === 'rectangle')).toHaveLength(1);
  });

  it('境界値: pageCount 1 でもパネル背景は入力を受け止め、枠の数だけボタンがある', () => {
    const { objects } = draw(1);
    expect(objects[0].kind).toBe('rectangle');
    expect(objects[0].interactive).toBe(true);
  });

  it('境界値: pageCount 2 では ◀ ▶ の両方を作り、押すと onPage(previous / next) を呼ぶ', () => {
    const { objects, textOf, callbacks } = draw(2);
    expect(textOf('1/2')).toBeDefined();
    const arrowTexts = [textOf(ITEM_PAGE_BUTTON_LABELS.previous), textOf(ITEM_PAGE_BUTTON_LABELS.next)];
    expect(arrowTexts.every((text) => text !== undefined)).toBe(true);
    // 矢印ごとの押せるボタンは、枠のボタンと同じく interactive な物として増える。
    expect(objects.filter((object) => object.interactive)).toHaveLength(ITEM_PAGE_SIZE + 1 + 2);
    const pressers = objects.filter((object) => object.handlers.has('pointerdown'));
    expect(pressers).toHaveLength(ITEM_PAGE_SIZE + 2);
    pressers.slice(-2)[0].handlers.get('pointerdown')?.();
    pressers.slice(-1)[0].handlers.get('pointerdown')?.();
    expect(callbacks.onPage.mock.calls).toEqual([['previous'], ['next']]);
  });

  it('pageCount 3 でも ◀ ▶ を作る', () => {
    const { textOf } = draw(3);
    expect(textOf(ITEM_PAGE_BUTTON_LABELS.previous)).toBeDefined();
    expect(textOf(ITEM_PAGE_BUTTON_LABELS.next)).toBeDefined();
  });
});
