// 表示言語の決定(#158)。ブラウザーのグローバル変数は直接読まない純粋関数だけを置く（取得は browserEnvironment.ts）。
// 言語を足すときは、locales/ にカタログを足し、SUPPORTED_LOCALES と index.ts のカタログ表に加える。

export const SUPPORTED_LOCALES = ['ja', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

// URL にもブラウザーの言語設定にも対応言語がないときの言語。既存の表示（日本語）を保つ。
export const DEFAULT_LOCALE: Locale = 'ja';

// 言語を指定する URL のクエリ名（?locale=en）。
export const LOCALE_QUERY_KEY = 'locale';

export const isSupportedLocale = (value: string): value is Locale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value);

// 言語タグを対応言語にそろえる。大文字・小文字は区別せず、地域付き（en-US・ja_JP）は基本言語（en・ja）にする。
// 空文字・対応外は undefined（次の候補へ進む）。
const toSupportedLocale = (tag: string): Locale | undefined => {
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(base) ? base : undefined;
};

// 表示言語を決める。優先順は URL の ?locale= → ブラウザーの言語設定（先頭から順に照合）→ DEFAULT_LOCALE。
// search は location.search の形（先頭の ? はあってもなくてもよい）。
export const resolveLocale = (search: string, browserLanguages: readonly string[]): Locale => {
  const requested = new URLSearchParams(search).get(LOCALE_QUERY_KEY);
  const fromUrl = requested === null ? undefined : toSupportedLocale(requested);
  if (fromUrl !== undefined) return fromUrl;
  for (const language of browserLanguages) {
    const fromBrowser = toSupportedLocale(language);
    if (fromBrowser !== undefined) return fromBrowser;
  }
  return DEFAULT_LOCALE;
};
