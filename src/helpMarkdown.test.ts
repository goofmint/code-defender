// ゲームの説明の Markdown の解析(#185)。使える記法は「# 見出し」と「- 項目」だけで、それ以外は行番号付きの例外にする。
import { describe, expect, it } from 'vitest';
import { parseHelpMarkdown } from './helpMarkdown';

describe('parseHelpMarkdown(#185)', () => {
  it('# の行が見出し、- の行が上から順の説明の行', () => {
    expect(parseHelpMarkdown('# 佐藤さんの説明\n- 1行目\n- 2行目\n- 3行目')).toEqual({
      title: '佐藤さんの説明',
      lines: ['1行目', '2行目', '3行目'],
    });
  });

  it('空行・空白だけの行・末尾の改行は無視する', () => {
    expect(parseHelpMarkdown('\n# 見出し\n\n- 鈴木\n   \n- 高橋\n\n')).toEqual({ title: '見出し', lines: ['鈴木', '高橋'] });
  });

  it('CRLF の改行も LF と同じに扱う（行末に \\r が残らない）', () => {
    expect(parseHelpMarkdown('# 見出し\r\n\r\n- 田中\r\n- 伊藤\r\n')).toEqual({ title: '見出し', lines: ['田中', '伊藤'] });
  });

  it('項目の前後の空白は取り除き、項目の中の記号（{名前}・「-」・「#」）はそのまま残す', () => {
    expect(parseHelpMarkdown('#   見出し  \n-   {range}px - #1  ').lines).toEqual(['{range}px - #1']);
    expect(parseHelpMarkdown('#   見出し  ').title).toBe('見出し');
  });

  it('境界値: 項目が0個なら行は空、1個なら1行', () => {
    expect(parseHelpMarkdown('# 見出し')).toEqual({ title: '見出し', lines: [] });
    expect(parseHelpMarkdown('# 見出し\n- 渡辺')).toEqual({ title: '見出し', lines: ['渡辺'] });
  });

  it('見出しがない（空の文字列・項目だけ）と例外', () => {
    expect(() => parseHelpMarkdown('')).toThrow('見出し（# ）がありません');
    expect(() => parseHelpMarkdown('- 山本')).toThrow('1行目');
  });

  it('見出しが2つ以上・項目より後の見出し・空の見出しは行番号付きの例外', () => {
    expect(() => parseHelpMarkdown('# 見出し\n# もう1つ')).toThrow('2行目');
    expect(() => parseHelpMarkdown('# 見出し\n- 中村\n# もう1つ')).toThrow('3行目');
    expect(() => parseHelpMarkdown('#  ')).toThrow('1行目');
  });

  it('空の項目（「-」だけ・「- 」の後が空白だけ）は行番号付きの例外', () => {
    expect(() => parseHelpMarkdown('# 見出し\n-')).toThrow('項目が空です（2行目）');
    expect(() => parseHelpMarkdown('# 見出し\n- 小林\n-   ')).toThrow('項目が空です（3行目）');
  });

  it.each([
    ['## の見出し', '## 小見出し'],
    ['段落', '加藤さんの段落'],
    ['字下げした継続行', '  続きの行'],
    ['入れ子の項目', '  - 入れ子'],
    ['空白のない -', '-吉田'],
    ['空白のない #', '#見出し'],
    ['* の箇条書き', '* 山田'],
    ['番号付きの箇条書き', '1. 佐々木'],
  ])('使えない記法（%s）は行番号付きの例外', (_label, line) => {
    expect(() => parseHelpMarkdown(`# 見出し\n- 山口\n${line}`)).toThrow('使えない記法です');
    expect(() => parseHelpMarkdown(`# 見出し\n- 山口\n${line}`)).toThrow('3行目');
  });
});
