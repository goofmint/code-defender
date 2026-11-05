// 表示言語と文言の入り口(#158)。現在の言語をモジュール内に持ち、文言はカタログから呼び出し時に読む。
// 言語は起動時（main.ts の new Phaser.Game の直前）に1回だけ setLocale で決める。scene.restart() はモジュールを読み直さないので、再開後も同じ言語のまま。
// 初期値は DEFAULT_LOCALE（日本語）。テストは言語を設定しなければ日本語のまま動く。
import type { ItemPayment } from '../item';
import { en } from './locales/en';
import { ja } from './locales/ja';
import type { Messages } from './locales/ja';
import { DEFAULT_LOCALE } from './resolveLocale';
import type { Locale } from './resolveLocale';

export type { Messages } from './locales/ja';
export type { Locale } from './resolveLocale';

const CATALOGUES: Readonly<Record<Locale, Messages>> = { ja, en };

let currentLocale: Locale = DEFAULT_LOCALE;

export const setLocale = (locale: Locale): void => {
  currentLocale = locale;
};

export const getLocale = (): Locale => currentLocale;

// 現在の言語のカタログ。
export const getMessages = (): Messages => CATALOGUES[currentLocale];

// 指定した言語のカタログ（テストで全言語を比べるときに使う）。
export const getCatalogue = (locale: Locale): Messages => CATALOGUES[locale];

// {name} の形のプレースホルダー。名前は英数字と _ だけ。
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

// テンプレート中のプレースホルダー名（出現順・重複なし）。カタログの整合テストで使う。
export const getPlaceholderNames = (template: string): string[] => [
  ...new Set(Array.from(template.matchAll(PLACEHOLDER_PATTERN), (match) => match[1])),
];

// プレースホルダーを params の値で置き換える。params にない名前があればエラーにする（文言の取り違えを黙って表示しない）。
export const interpolate = (template: string, params: Readonly<Record<string, string | number>>): string =>
  template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    if (!Object.hasOwn(params, name)) {
      throw new Error(`文言のプレースホルダーに値が渡されていません: {${name}}（${template}）`);
    }
    return String(params[name]);
  });

// 3桁区切り（現在の言語の BCP 47 タグで整形）。
export const formatNumber = (value: number): string => value.toLocaleString(getMessages().numberLocale);

// 円額。日本語は「20,000円」、英語は「¥20,000」。負の値は符号を通貨記号の前に置く（「-50,000円」「-¥50,000」）。
export const formatYen = (amount: number): string => {
  const { symbol, position } = getMessages().currency;
  const sign = amount < 0 ? '-' : '';
  const digits = formatNumber(Math.abs(amount));
  return position === 'prefix' ? `${sign}${symbol}${digits}` : `${sign}${digits}${symbol}`;
};

// 短い金額（ボタンなど）。amount は呼び出し側で計算済み（四捨五入など）の円額で、表示の除数と単位だけを言語ごとに変える。
// 日本語は「10万円」「2万/月」、英語は「¥100K」「¥20K/mo」。
export const formatShortAmount = (amount: number, payment: ItemPayment): string => {
  const { divisor, oneTime, monthly } = getMessages().currency.short;
  return interpolate(payment === 'monthly' ? monthly : oneTime, { value: amount / divisor });
};

// キーごとの文言を、読むたびに現在の言語のカタログから返す表(#158)。
// 既存の表（ITEM_SHORT_NAMES など）を同じ名前・同じ添字の書き方のまま言語に追従させるために使う（呼び出し側を変えない）。
// キーの一覧は既定言語のカタログから取る（ほかの言語も Messages 型で同じキーを持つ）。
export const localizedRecord = <K extends string>(
  select: (messages: Messages) => Readonly<Record<K, string>>,
): Readonly<Record<K, string>> => {
  const keys = Object.keys(select(CATALOGUES[DEFAULT_LOCALE])) as K[];
  const view: Partial<Record<K, string>> = {};
  for (const key of keys) {
    Object.defineProperty(view, key, { enumerable: true, get: () => select(getMessages())[key] });
  }
  return view as Readonly<Record<K, string>>;
};
