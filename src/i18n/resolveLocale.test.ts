import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDocumentLang, getBrowserLanguages, getLocationSearch } from './browserEnvironment';
import { DEFAULT_LOCALE, isSupportedLocale, resolveLocale, SUPPORTED_LOCALES } from './resolveLocale';
import type { Locale } from './resolveLocale';

describe('対応言語と既定言語', () => {
  it('対応言語は ja・en、既定は ja', () => {
    expect(SUPPORTED_LOCALES).toEqual(['ja', 'en']);
    expect(DEFAULT_LOCALE).toBe('ja');
  });

  it.each([
    ['ja', true],
    ['en', true],
    ['', false],
    ['EN', false],
    ['en-US', false],
    ['fr', false],
  ])('isSupportedLocale(%j) は %s（正規化前の値はそのまま判定する）', (value, expected) => {
    expect(isSupportedLocale(value)).toBe(expected);
  });
});

describe('resolveLocale: URL の ?locale= を最優先にする', () => {
  it.each<[string, readonly string[], Locale]>([
    ['?locale=en', ['ja-JP'], 'en'],
    ['?locale=ja', ['en-US'], 'ja'],
    ['locale=en', ['ja'], 'en'],
    ['?foo=1&locale=en', ['ja'], 'en'],
    ['?locale=en&locale=ja', ['ja'], 'en'],
  ])('search %j・ブラウザー %j → %s', (search, languages, expected) => {
    expect(resolveLocale(search, languages)).toBe(expected);
  });
});

describe('resolveLocale: 大文字・小文字と地域付きタグをそろえる', () => {
  it.each<[string, readonly string[], Locale]>([
    ['?locale=EN', [], 'en'],
    ['?locale=En', [], 'en'],
    ['?locale=en-US', [], 'en'],
    ['?locale=en_GB', [], 'en'],
    ['?locale=JA-jp', ['en'], 'ja'],
    ['?locale=%20en%20', [], 'en'],
    ['', ['EN-us'], 'en'],
    ['', ['ja_JP'], 'ja'],
  ])('search %j・ブラウザー %j → %s', (search, languages, expected) => {
    expect(resolveLocale(search, languages)).toBe(expected);
  });
});

describe('resolveLocale: URL の値が空・対応外ならブラウザーの言語設定へ進む', () => {
  it.each<[string, readonly string[], Locale]>([
    ['?locale=', ['en-US'], 'en'],
    ['?locale', ['en-US'], 'en'],
    ['?locale=fr', ['en-US'], 'en'],
    ['?locale=eng', ['en-US'], 'en'],
    ['?locale=-en', ['en-US'], 'en'],
    ['?lang=ja', ['en-US'], 'en'],
    ['', ['en-US'], 'en'],
  ])('search %j・ブラウザー %j → %s', (search, languages, expected) => {
    expect(resolveLocale(search, languages)).toBe(expected);
  });
});

describe('resolveLocale: ブラウザーの言語設定は先頭から順に照合する', () => {
  it.each<[readonly string[], Locale]>([
    [['en-US', 'ja-JP'], 'en'],
    [['ja-JP', 'en-US'], 'ja'],
    [['fr-FR', 'de', 'en'], 'en'],
    [['fr-FR', 'ja'], 'ja'],
    [['', 'en'], 'en'],
  ])('ブラウザー %j → %s', (languages, expected) => {
    expect(resolveLocale('', languages)).toBe(expected);
  });
});

describe('resolveLocale: どれにも対応言語がなければ既定の ja', () => {
  it.each<[string, readonly string[]]>([
    ['', []],
    ['?locale=fr', []],
    ['', ['fr-FR', 'de-DE']],
    ['?locale=zh', ['ko-KR']],
  ])('search %j・ブラウザー %j → ja', (search, languages) => {
    expect(resolveLocale(search, languages)).toBe('ja');
  });
});

describe('ブラウザー環境の値の取得（window がない Node 環境）', () => {
  it('location.search は空文字、言語設定は空配列', () => {
    expect(typeof window).toBe('undefined');
    expect(getLocationSearch()).toBe('');
    expect(getBrowserLanguages()).toEqual([]);
  });

  it('Node の値で決めると既定の ja になる', () => {
    expect(resolveLocale(getLocationSearch(), getBrowserLanguages())).toBe('ja');
  });

  it('document がなければ lang の反映は何もしない（エラーにしない）', () => {
    expect(typeof document).toBe('undefined');
    expect(() => applyDocumentLang('en')).not.toThrow();
  });
});

describe('ブラウザー環境の値の取得（window がある環境）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubWindow = (search: string, languages: readonly string[], language: string): void => {
    vi.stubGlobal('window', { location: { search }, navigator: { languages, language } });
  };

  it('location.search をそのまま返す', () => {
    stubWindow('?locale=en', ['ja-JP'], 'ja-JP');
    expect(getLocationSearch()).toBe('?locale=en');
  });

  it('navigator.languages があればそれを返す', () => {
    stubWindow('', ['en-US', 'ja-JP'], 'ja-JP');
    expect(getBrowserLanguages()).toEqual(['en-US', 'ja-JP']);
  });

  it('navigator.languages が空なら navigator.language の1件', () => {
    stubWindow('', [], 'en-GB');
    expect(getBrowserLanguages()).toEqual(['en-GB']);
  });

  it('navigator.languages も navigator.language も空なら空配列', () => {
    stubWindow('', [], '');
    expect(getBrowserLanguages()).toEqual([]);
  });

  it('URL・ブラウザーの値から決めた言語を html 要素の lang に反映する', () => {
    stubWindow('?locale=EN-us', ['ja-JP'], 'ja-JP');
    const documentElement = { lang: 'ja' };
    vi.stubGlobal('document', { documentElement });
    applyDocumentLang(resolveLocale(getLocationSearch(), getBrowserLanguages()));
    expect(documentElement.lang).toBe('en');
  });
});
