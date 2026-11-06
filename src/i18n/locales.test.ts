import { afterEach, describe, expect, it } from 'vitest';
import { INITIAL_PLACEMENT_PANEL_LINES, STAGE_POINTS_INITIAL } from '../config';
import { buildGameOverLines } from '../gameOver';
import { formatInitialPlacementPanel } from '../initialPlacement';
import { getCatalogue, getPlaceholderNames, setLocale } from './index';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './resolveLocale';
import { SPAWN_MARKER_STYLE, VACATION_MARKER_STYLE } from '../route';
import { estimateTextWidth } from '../textMetrics';

// カタログを葉（文字列・数値）まで平らにした [キーのパス, 値] の一覧。
type CatalogueNode = string | number | { readonly [key: string]: CatalogueNode };
const flatten = (node: CatalogueNode, path = ''): [string, string | number][] =>
  typeof node === 'object'
    ? Object.entries(node).flatMap(([key, child]) => flatten(child, path === '' ? key : `${path}.${key}`))
    : [[path, node]];

const reference = new Map(flatten(getCatalogue(DEFAULT_LOCALE)));
const others = SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

describe('言語カタログの整合', () => {
  it('既定言語のカタログは空でない', () => {
    expect(reference.size).toBeGreaterThan(0);
  });

  it.each(others)('%s のキーの集合は既定言語（ja）と同じ', (locale) => {
    const keys = flatten(getCatalogue(locale)).map(([key]) => key);
    expect([...keys].sort()).toEqual([...reference.keys()].sort());
  });

  it.each(SUPPORTED_LOCALES)('%s の文言はすべて空でない', (locale) => {
    for (const [key, value] of flatten(getCatalogue(locale))) {
      expect(value, key).not.toBe('');
    }
  });

  it.each(others)('%s のプレースホルダー名の集合はキーごとに既定言語と同じ', (locale) => {
    for (const [key, value] of flatten(getCatalogue(locale))) {
      const expected = reference.get(key);
      if (typeof value === 'number' || typeof expected === 'number') {
        expect(typeof value, key).toBe(typeof expected);
        continue;
      }
      expect(getPlaceholderNames(value).sort(), key).toEqual(getPlaceholderNames(String(expected)).sort());
    }
  });

  it.each(SUPPORTED_LOCALES)('%s の文言は1行（改行を含まない）', (locale) => {
    for (const [key, value] of flatten(getCatalogue(locale))) {
      expect(String(value), key).not.toContain('\n');
    }
  });

  it.each(SUPPORTED_LOCALES)('%s のゲームオーバー画面は4行（タイトル・スコア・経過日数・案内）', (locale) => {
    expect(Object.keys(getCatalogue(locale).gameOver)).toEqual(['title', 'score', 'elapsedDays', 'restart']);
  });

  it.each(SUPPORTED_LOCALES)('%s の短い金額の除数は正の数', (locale) => {
    expect(getCatalogue(locale).currency.short.divisor).toBeGreaterThan(0);
  });
});

describe('休暇マーカーの文字', () => {
  const fontPx = parseInt(VACATION_MARKER_STYLE.labelFontSize, 10);
  const diameter = SPAWN_MARKER_STYLE.radius * 2;

  it('日本語は「休」', () => {
    expect(getCatalogue('ja').vacation.marker).toBe('休');
  });

  it.each(SUPPORTED_LOCALES)('%s は1行で、推定幅がマーカーの円（直径）に収まる', (locale) => {
    const marker = getCatalogue(locale).vacation.marker;
    expect(marker.split('\n')).toHaveLength(1);
    expect(estimateTextWidth(marker, fontPx)).toBeLessThanOrEqual(diameter);
  });

  it('英語は単独の英字にしない（操作キーと紛らわしいため）', () => {
    expect(getCatalogue('en').vacation.marker).not.toMatch(/^[A-Za-z]$/);
  });
});

describe.each(SUPPORTED_LOCALES)('%s の複数行の文言は行数が決まっている', (locale) => {
  afterEach(() => {
    setLocale('ja');
  });

  it('ゲームオーバー画面は4行・初期配置パネルは INITIAL_PLACEMENT_PANEL_LINES 行', () => {
    setLocale(locale);
    expect(buildGameOverLines(0, 0)).toHaveLength(4);
    expect(formatInitialPlacementPanel(STAGE_POINTS_INITIAL, { kind: 'none' })).toHaveLength(INITIAL_PLACEMENT_PANEL_LINES);
  });
});
