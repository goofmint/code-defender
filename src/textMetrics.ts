// 文字列の表示幅の見積もり(#158)。Phaser に依存しない（Canvas で測らずに配置判定・レイアウト検証へ使うため）。
// 全角文字は 1 文字 = フォント px、半角文字はフォント px × HALF_WIDTH_CHAR_RATIO で数える。
// 日本語だけの文字列は従来の見積もり（文字数 × フォント px）と同じ幅になる（例: 14px の「リリース」は 56px）。
import { HALF_WIDTH_CHAR_RATIO } from './config';

// 半角として数える文字か。U+1100 より前（ASCII・ラテン文字・ギリシャ文字・キリル文字など）と、半角カナ・半角記号（U+FF61〜U+FFDC、U+FFE8〜U+FFEE）。
// それ以外（かな・漢字・全角英数・◀ などの記号）は全角として数える（広めに見積もる側に倒す）。
export const isHalfWidthChar = (char: string): boolean => {
  const code = char.codePointAt(0);
  if (code === undefined) throw new Error('幅を見積もる文字が空です');
  return code < 0x1100 || (code >= 0xff61 && code <= 0xffdc) || (code >= 0xffe8 && code <= 0xffee);
};

// fontSizePx のときの text の推定幅（px）。サロゲートペアは 1 文字として数える。
export const estimateTextWidth = (text: string, fontSizePx: number, halfWidthRatio: number = HALF_WIDTH_CHAR_RATIO): number =>
  Array.from(text).reduce(
    (width, char) => width + (isHalfWidthChar(char) ? fontSizePx * halfWidthRatio : fontSizePx),
    0,
  );
