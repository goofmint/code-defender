// ゲームの説明(#185)の Markdown（言語ごとの正本）。Vite の ?raw で文字列としてバンドルに含める（実行時の取得はしない）。
// Record<Locale, string> にしているので、言語を resolveLocale.ts に足したときに Markdown の追加漏れが型エラーになる。
import type { Locale } from '../resolveLocale';
import en from './en.md?raw';
import ja from './ja.md?raw';

export const HELP_MARKDOWN: Readonly<Record<Locale, string>> = { ja, en };
