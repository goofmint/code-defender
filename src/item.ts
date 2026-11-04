// アイテムの属性（企画書 8）と、ダメージ計算・範囲判定の純粋関数。Phaser には依存しない（テスト可能にするため）。
// 今回定義するのは「攻撃する」6アイテムだけ。攻撃力・得意が「なし」の他15アイテムは、
// それぞれのタスク（#52〜）で追加する。価格は itemPlacement.ts（#48）、支払い区分は payment（#51）で持つ。
import {
  ITEM_POWER_DAMAGE,
  ITEM_RANGE_RATIOS,
  ITEM_STRONG_AGAINST_MULTIPLIER,
} from './config';
import { CELL_SIZE } from './field';
import type { MaliciousCodeType } from './maliciousCode';
import type { Point } from './route';

export const ITEM_TYPES = [
  'codeRabbit',
  'linter',
  'testTool',
  'ci',
  'securityScanner',
  'pairProgrammer',
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

// 得意な不正コード。万能型(all)は得意ボーナスなしで全種類に等倍（config.ts 参照）。
export type StrongAgainst =
  | { readonly kind: 'all' }
  | { readonly kind: 'types'; readonly types: readonly MaliciousCodeType[] };

// 範囲の段階（企画書の表の言葉）。どこから測るか（基準点）は個別アイテムの担当。
// 例: CI はリリース地点の直前、ペアプロ相棒は主人公の周り。
export type ItemRange = 'short' | 'middle' | 'long';

// 攻撃力の段階（弱・中・強）。
export type ItemPower = 'weak' | 'medium' | 'strong';

// 支払い区分（企画書 8 の「支払い」列）。monthly は月額払い、oneTime は購入時の1回払い。
export type ItemPayment = 'monthly' | 'oneTime';

type ItemDefinition = {
  readonly label: string;
  readonly payment: ItemPayment;
  readonly strongAgainst: StrongAgainst;
  readonly range: ItemRange;
  readonly power: ItemPower;
  // このアイテムが正常なコードも攻撃対象にするか。
  // true にしてよいのは猫だけ（企画書 8 の例外）。猫は #57 で追加する。それ以外は false（正常なコードは攻撃しない）。
  readonly targetsNormalCode: boolean;
};

export const ITEM_DEFINITIONS = {
  codeRabbit: {
    label: 'CodeRabbit',
    payment: 'monthly',
    strongAgainst: { kind: 'all' },
    range: 'long',
    power: 'medium',
    targetsNormalCode: false,
  },
  linter: {
    label: '静的解析ツール（Linter）',
    payment: 'oneTime',
    strongAgainst: { kind: 'types', types: ['typo', 'duplication'] },
    range: 'short',
    power: 'weak',
    targetsNormalCode: false,
  },
  testTool: {
    label: 'テストツール',
    payment: 'oneTime',
    strongAgainst: { kind: 'types', types: ['bug'] },
    range: 'middle',
    power: 'weak',
    targetsNormalCode: false,
  },
  ci: {
    label: 'CI',
    payment: 'monthly',
    strongAgainst: { kind: 'types', types: ['bug', 'lowPerformance'] },
    range: 'short',
    power: 'medium',
    targetsNormalCode: false,
  },
  securityScanner: {
    label: 'セキュリティスキャナー',
    payment: 'monthly',
    strongAgainst: {
      kind: 'types',
      types: ['vulnerabilityCritical', 'vulnerabilityMajor'],
    },
    range: 'middle',
    power: 'strong',
    targetsNormalCode: false,
  },
  pairProgrammer: {
    label: 'ペアプロ相棒',
    payment: 'monthly',
    strongAgainst: { kind: 'types', types: ['spaghetti'] },
    range: 'short',
    power: 'medium',
    targetsNormalCode: false,
  },
} as const satisfies Record<ItemType, ItemDefinition>;

// このアイテムが正常なコードも攻撃対象にするか（企画書 8。猫だけが true になる予定）。
export const itemTargetsNormalCode = (itemType: ItemType): boolean =>
  ITEM_DEFINITIONS[itemType].targetsNormalCode;

// 範囲の段階をピクセルに変換する。設定値は引数で差し替えられる（既定値は config.ts）。
export const getItemRange = (
  itemType: ItemType,
  ratios: Readonly<Record<ItemRange, number>> = ITEM_RANGE_RATIOS,
  cellSize: number = CELL_SIZE,
): number => ratios[ITEM_DEFINITIONS[itemType].range] * cellSize;

// 距離が範囲以下なら範囲内（境界ちょうども範囲内。attack.ts の findAttackTarget と同じ方針）。
// rangePx が負・NaN のときは false。
export const isWithinRange = (origin: Point, target: Point, rangePx: number): boolean =>
  Math.hypot(target.x - origin.x, target.y - origin.y) <= rangePx;

// アイテムの範囲内に対象がいるか（距離だけを見る）。対象の選択（最も近いもの・正常コードを除くか）は itemPlacement.ts の findItemTarget / findTargetFor（targetsNormalCode に従う）。
export const isTargetInItemRange = (
  itemType: ItemType,
  itemPosition: Point,
  targetPosition: Point,
): boolean => isWithinRange(itemPosition, targetPosition, getItemRange(itemType));

// 得意な種類か。種類なし(undefined)は常に false。
// 万能型(all)も false（得意ボーナスなしで全種類に等倍のため）。
export const isItemSpecialty = (
  itemType: ItemType,
  maliciousType: MaliciousCodeType | undefined,
): boolean => {
  if (maliciousType === undefined) return false;
  // as const の狭いリテラル型のままでは includes に渡せないため、StrongAgainst 型に広げて読む。
  const strongAgainst: StrongAgainst = ITEM_DEFINITIONS[itemType].strongAgainst;
  return strongAgainst.kind === 'types' && strongAgainst.types.includes(maliciousType);
};

// 負・NaN・Infinity は 0 として扱う（defeat.ts の sanitizeDamage と同じ方針）。
const sanitize = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

// 1ヒットのダメージ。得意なら攻撃力 × 倍率、そうでなければ攻撃力そのまま。
export const calculateItemDamage = (
  power: number,
  strong: boolean,
  multiplier: number = ITEM_STRONG_AGAINST_MULTIPLIER,
): number => {
  const base = sanitize(power);
  return strong ? base * sanitize(multiplier) : base;
};

// アイテムが不正コード1体に与える1ヒットのダメージ。defeat.ts の applyHit(hp, damage) にそのまま渡せる。
export const getItemDamage = (
  itemType: ItemType,
  maliciousType: MaliciousCodeType | undefined,
): number =>
  calculateItemDamage(
    ITEM_POWER_DAMAGE[ITEM_DEFINITIONS[itemType].power],
    isItemSpecialty(itemType, maliciousType),
  );
