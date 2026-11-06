// 右下の指標（💸 の赤文字）とゲームの説明の描画(#165)。Phaser はモックし、scene.add の呼び出しと、作った物のメソッド呼び出しを記録する。
import { describe, expect, it, vi } from 'vitest';
import { ELAPSED_DAYS_STYLE, HELP_ICON_RECT, HELP_OVERLAY, HUD_ICONS, STATUS_PANEL_PAYMENT_COLOR } from './config';
import { FIELD_HEIGHT, FIELD_WIDTH } from './field';
import { helpLayout } from './help';
import { drawHelpIcon, drawHelpOverlay, drawStatusPanel } from './render';
import { STATUS_PANEL_CELLS, statusPanelCellRect } from './statusPanel';

vi.mock('phaser', () => ({
  default: { Scene: class {}, Geom: { Rectangle: class {}, Circle: class {} } },
}));

type Call = readonly [string, ...(string | number | boolean | object)[]];
type FakeObject = {
  readonly kind: string;
  readonly args: readonly (string | number | object)[];
  readonly calls: Call[];
  readonly handlers: Map<string, () => void>;
  readonly setOrigin: (...values: number[]) => FakeObject;
  readonly setDepth: (depth: number) => FakeObject;
  readonly setStrokeStyle: (...values: number[]) => FakeObject;
  readonly setInteractive: (...values: object[]) => FakeObject;
  readonly setSize: (width: number, height: number) => FakeObject;
  readonly setText: (text: string) => FakeObject;
  readonly on: (event: string, handler: () => void) => FakeObject;
  readonly destroy: () => void;
};

// 呼び出しを記録するだけの scene（描画しない）。作った物は objects に作った順に入る。
const createFakeScene = () => {
  const objects: FakeObject[] = [];
  const make = (kind: string, args: readonly (string | number | object)[]): FakeObject => {
    const calls: Call[] = [];
    const handlers = new Map<string, () => void>();
    const object: FakeObject = {
      kind,
      args,
      calls,
      handlers,
      setOrigin: (...values) => (calls.push(['setOrigin', ...values]), object),
      setDepth: (depth) => (calls.push(['setDepth', depth]), object),
      setStrokeStyle: (...values) => (calls.push(['setStrokeStyle', ...values]), object),
      setInteractive: (...values) => (calls.push(['setInteractive', ...values]), object),
      setSize: (width, height) => (calls.push(['setSize', width, height]), object),
      setText: (text) => (calls.push(['setText', text]), object),
      on: (event, handler) => (handlers.set(event, handler), object),
      destroy: () => {
        calls.push(['destroy']);
      },
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

const depthOf = (object: FakeObject): number | undefined => {
  const call = object.calls.find(([name]) => name === 'setDepth');
  return call === undefined ? undefined : Number(call[1]);
};
const textStyleOf = (object: FakeObject): { readonly color?: string; readonly fontSize?: string } => {
  const style = object.args[3];
  return typeof style === 'object' ? style : {};
};

describe('drawStatusPanel(#165)', () => {
  const values = { funds: 1_000_000, score: 20_000, monthEndPayment: 900_000, techDebt: 30 };

  it('4つの枠に 💰・💸・📈・負債の文字を置き、💸 だけ赤文字（STATUS_PANEL_PAYMENT_COLOR）にする', () => {
    const { scene, objects } = createFakeScene();
    drawStatusPanel(scene as never, values);
    const texts = objects.filter((object) => object.kind === 'text');
    expect(texts.map((text) => text.args[2])).toEqual(['💰1,000,000円', '💸900,000円', '📈20,000円', '🔵30']);
    const positions = texts.map((text) => ({ x: text.args[0], y: text.args[1] }));
    const cells = [STATUS_PANEL_CELLS.funds, STATUS_PANEL_CELLS.monthEndPayment, STATUS_PANEL_CELLS.sales, STATUS_PANEL_CELLS.techDebt];
    expect(positions).toEqual(cells.map(({ column, row }) => ({ x: statusPanelCellRect(column, row).x, y: statusPanelCellRect(column, row).y })));
    expect(textStyleOf(texts[1]).color).toBe(STATUS_PANEL_PAYMENT_COLOR);
    for (const index of [0, 2, 3]) expect(textStyleOf(texts[index]).color).toBe(ELAPSED_DAYS_STYLE.color);
    // 丸（circle）は描かず、入力も受け付けない。
    expect(objects.some((object) => object.calls.some(([name]) => name === 'setInteractive'))).toBe(false);
  });

  it.each([
    [30, '🔵30'],
    [31, '🟡31'],
    [60, '🟡60'],
    [61, '🔴61'],
  ])('境界値: setTechDebt(%d) で負債の枠を %s にする（他の枠は変えない）', (debt, expected) => {
    const { scene, objects } = createFakeScene();
    const panel = drawStatusPanel(scene as never, values);
    panel.setTechDebt(debt);
    const texts = objects.filter((object) => object.kind === 'text');
    expect(texts[3].calls.at(-1)).toEqual(['setText', expected]);
    for (const index of [0, 1, 2]) expect(texts[index].calls.some(([name]) => name === 'setText')).toBe(false);
  });

  it('setFunds・setScore・setMonthEndPayment はそれぞれの枠だけを書き換える（💸 は赤文字のまま）', () => {
    const { scene, objects } = createFakeScene();
    const panel = drawStatusPanel(scene as never, values);
    panel.setFunds(-300_000);
    panel.setScore(40_000);
    panel.setMonthEndPayment(0);
    const texts = objects.filter((object) => object.kind === 'text');
    expect(texts[0].calls.at(-1)).toEqual(['setText', '💰-300,000円']);
    expect(texts[2].calls.at(-1)).toEqual(['setText', '📈40,000円']);
    expect(texts[1].calls.at(-1)).toEqual(['setText', '💸0円']);
    expect(textStyleOf(texts[1]).color).toBe(STATUS_PANEL_PAYMENT_COLOR);
  });
});

describe('drawHelpIcon(#165)', () => {
  it('右上の HELP_ICON_RECT に ℹ️ のアイコンを置き、押すと onPress を呼ぶ', () => {
    const { scene, objects } = createFakeScene();
    const onPress = vi.fn();
    drawHelpIcon(scene as never, onPress);
    const container = objects.find((object) => object.kind === 'container');
    if (container === undefined) throw new Error('アイコンがありません');
    expect(container.args.slice(0, 2)).toEqual([HELP_ICON_RECT.x, HELP_ICON_RECT.y]);
    expect(objects.find((object) => object.kind === 'text')?.args[2]).toBe(HUD_ICONS.help);
    container.handlers.get('pointerdown')?.();
    expect(onPress).toHaveBeenCalledOnce();
  });
});

describe('drawHelpOverlay(#165)', () => {
  const lines = ['1行目', '2行目'];

  it('全面の背景（入力を受け止める）・パネル・見出し・説明の行・✕ を、ゲームオーバー表示（3）より上の深さに描く', () => {
    const { scene, objects } = createFakeScene();
    drawHelpOverlay(scene as never, '説明', lines, vi.fn());
    const [backdrop, panel] = objects;
    expect(backdrop.args.slice(0, 4)).toEqual([0, 0, FIELD_WIDTH, FIELD_HEIGHT]);
    expect(backdrop.calls.some(([name]) => name === 'setInteractive')).toBe(true);
    expect(panel.calls.some(([name]) => name === 'setInteractive')).toBe(true);
    const layout = helpLayout(lines.length);
    expect(panel.args.slice(0, 4)).toEqual([layout.panel.x, layout.panel.y, layout.panel.width, layout.panel.height]);
    const texts = objects.filter((object) => object.kind === 'text').map((object) => object.args[2]);
    expect(texts).toEqual(['説明', ...lines, HELP_OVERLAY.closeButtonLabel]);
    expect(HELP_OVERLAY.depth).toBeGreaterThan(3);
    for (const object of objects.filter((candidate) => depthOf(candidate) !== undefined)) {
      expect(depthOf(object)).toBe(HELP_OVERLAY.depth);
    }
  });

  it('背景と ✕ の押下で onClose を呼び、パネルの押下では呼ばない。destroy で全部消す', () => {
    const { scene, objects } = createFakeScene();
    const onClose = vi.fn();
    const overlay = drawHelpOverlay(scene as never, '説明', lines, onClose);
    const [backdrop, panel] = objects;
    const close = objects.find((object) => object.kind === 'container');
    if (close === undefined) throw new Error('✕ のボタンがありません');
    expect(panel.handlers.has('pointerdown')).toBe(false);
    backdrop.handlers.get('pointerdown')?.();
    expect(onClose).toHaveBeenCalledTimes(1);
    close.handlers.get('pointerdown')?.();
    expect(onClose).toHaveBeenCalledTimes(2);
    overlay.destroy();
    for (const object of [backdrop, panel, close]) expect(object.calls.at(-1)).toEqual(['destroy']);
  });
});
