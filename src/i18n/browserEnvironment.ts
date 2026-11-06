// 表示言語の決定に使うブラウザーの値の取得と、決めた言語の反映(#158)。
// window がない環境（Vitest の Node 環境など）では空の値を返し、何もしない（main.ts をテストで読み込んでも失敗しないようにする）。
// Node にも navigator はある（Node 21 以降）ため、ブラウザーかどうかは window の有無で判定する。
import type { Locale } from './resolveLocale';

// location.search（「?locale=en」の形）。ブラウザー外では空文字。
export const getLocationSearch = (): string => (typeof window === 'undefined' ? '' : window.location.search);

// ブラウザーの言語設定（優先順）。navigator.languages が空なら navigator.language の1件にする。ブラウザー外・未設定なら空配列。
export const getBrowserLanguages = (): readonly string[] => {
  if (typeof window === 'undefined') return [];
  const { languages, language } = window.navigator;
  if (languages.length > 0) return languages;
  return language === '' ? [] : [language];
};

// html 要素の lang 属性を表示言語にする（読み上げ・フォント選択用）。document がない環境では何もしない。
export const applyDocumentLang = (locale: Locale): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
};
