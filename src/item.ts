// アイテムの属性（企画書 8）と、ダメージ計算・範囲判定の純粋関数。Phaser には依存しない（テスト可能にするため）。
// 定義済みは「攻撃する」6アイテム、ランダムにコードを消す猫（#57）、その他の11アイテム（#58）。
// AIコーディングエージェント（強い・普通・安い）は別タスクで追加する。価格は itemPlacement.ts（#48）、支払い区分は payment（#51）で持つ。
import {
  ITEM_POWER_DAMAGE,
  ITEM_REQUIRED_LEVEL_BY_TYPE,
  LINTER_ATTACK_COOLDOWN_MS,
  ITEM_RANGE_RATIOS,
  ITEM_STRONG_AGAINST_MULTIPLIER,
} from './config';
import { CELL_SIZE } from './field';
import { getMessages } from './i18n';
import type { MaliciousCodeType } from './maliciousCode';
import type { Point } from './route';

export const ITEM_TYPES = [
  'codeRabbit',
  'linter',
  'testTool',
  'ci',
  'securityScanner',
  'pairProgrammer',
  'cat',
  'rubberDuck',
  'codeFreeze',
  'specChangeStorm',
  'coffeeMachine',
  'energyDrink',
  'pizza',
  'documentation',
  'fridayDeploy',
  'rollbackButton',
  'worksFine',
  'seniorNote',
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

// 得意な不正コード。万能型(all)は得意ボーナスなしで全種類に等倍（config.ts 参照）。
// なし(none)は得意がない（猫 #57。攻撃しないため）。
export type StrongAgainst =
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }
  | { readonly kind: 'types'; readonly types: readonly MaliciousCodeType[] };

// 範囲の段階（企画書の表の言葉）。どこから測るか（基準点）は個別アイテムの担当。
// 例: CI はリリース地点の直前、ペアプロ相棒は主人公の周り。
export type ItemRange = 'short' | 'middle' | 'long';

// 範囲の指定。random は範囲を持たず場のすべてのコードが対象（猫 #57）。
// none は距離を持たない（#58。購入時に全体へ効く・主人公に効くなど、フィールドに置かないアイテム）。
export type ItemRangeSpec = ItemRange | 'random' | 'none';

// 攻撃力の段階（弱・中・強）。なし(none)は攻撃しないアイテム（猫 #57）。
export type ItemPower = 'none' | 'weak' | 'medium' | 'strong';

// アイテムの効果。attack は範囲内の不正なコードを攻撃する。deleteRandomCode は場のコードを1つランダムに消す（猫 #57）。
// 以下は #58。置いて範囲内に効くもの: reveal（不正なコードの正体を暴く）・coffee（近くのエンジニアのペース）・seniorNote（近くの障害を防ぐ）。
// 購入時に発動するもの: codeFreeze・specChangeStorm・energyDrink・pizza・documentation・fridayDeploy・rollback・worksFine。
export type ItemEffect =
  | 'attack'
  | 'deleteRandomCode'
  | 'reveal'
  | 'coffee'
  | 'seniorNote'
  | 'codeFreeze'
  | 'specChangeStorm'
  | 'energyDrink'
  | 'pizza'
  | 'documentation'
  | 'fridayDeploy'
  | 'rollback'
  | 'worksFine';

// 置き方(#58)。cell は主人公がいるセルに置く。none は置かずに購入時に効果を発動する。
export type ItemPlacement = 'cell' | 'none';

// 支払い区分（企画書 8 の「支払い」列）。monthly は月額払い、oneTime は購入時の1回払い。
export type ItemPayment = 'monthly' | 'oneTime';

// 効果の発動方式。nearestTarget は範囲内で最も近い対象を自動攻撃する（main.ts の updateItems）。
// releaseGate はリリース直前の減速と確率阻止（CI #55。ci.ts と main.ts の updateCodes）で、汎用攻撃はしない。
export type ItemActivation = 'nearestTarget' | 'releaseGate';

// 表示名は言語カタログ（items.names）に置き、getItemLabel で読む(#158)。
type ItemDefinition = {
  readonly payment: ItemPayment;
  readonly strongAgainst: StrongAgainst;
  readonly range: ItemRangeSpec;
  readonly power: ItemPower;
  // このアイテムが正常なコードも対象にするか。
  // true にしてよいのは猫だけ（企画書 8 の例外、#57）。それ以外は false（正常なコードは攻撃しない）。
  readonly targetsNormalCode: boolean;
  readonly activation: ItemActivation;
  readonly effect: ItemEffect;
  readonly placement: ItemPlacement;
  // 主人公についてまわるか（ペアプロ相棒 #58）。true なら置いたセルではなく主人公の位置から攻撃し、セルを占有しない。
  readonly followsPlayer: boolean;
  // このアイテムだけの攻撃間隔（ミリ秒）。null なら共通の ITEM_ATTACK_COOLDOWN_MS（Linter の連射 #58）。
  readonly attackCooldownMs: number | null;
};

export const ITEM_DEFINITIONS = {
  codeRabbit: {
    payment: 'monthly',
    strongAgainst: { kind: 'all' },
    range: 'long',
    power: 'medium',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'attack',
    placement: 'cell',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  linter: {
    payment: 'oneTime',
    strongAgainst: { kind: 'types', types: ['typo', 'duplication'] },
    range: 'short',
    power: 'weak',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'attack',
    placement: 'cell',
    followsPlayer: false,
    attackCooldownMs: LINTER_ATTACK_COOLDOWN_MS,
  },
  testTool: {
    payment: 'oneTime',
    strongAgainst: { kind: 'types', types: ['bug'] },
    range: 'middle',
    power: 'weak',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'attack',
    placement: 'cell',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  ci: {
    payment: 'monthly',
    strongAgainst: { kind: 'types', types: ['bug', 'lowPerformance'] },
    range: 'short',
    power: 'medium',
    targetsNormalCode: false,
    activation: 'releaseGate',
    effect: 'attack',
    placement: 'cell',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  // 企画書 8（docs/game_plan.md の表）: 得意は脆弱性クリティカル・メジャー、中距離、強、月額。
  // 「クリティカル・メジャーは、セキュリティスキャナーがないと苦戦する」（同ファイル）。ダメージ・範囲の数値は config.ts の仮の値（仮・要確認）。
  securityScanner: {
    payment: 'monthly',
    strongAgainst: {
      kind: 'types',
      types: ['vulnerabilityCritical', 'vulnerabilityMajor'],
    },
    range: 'middle',
    power: 'strong',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'attack',
    placement: 'cell',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  pairProgrammer: {
    payment: 'monthly',
    strongAgainst: { kind: 'types', types: ['spaghetti'] },
    range: 'short',
    power: 'medium',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'attack',
    placement: 'cell',
    followsPlayer: true,
    attackCooldownMs: null,
  },
  cat: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'random',
    power: 'none',
    targetsNormalCode: true,
    activation: 'nearestTarget',
    effect: 'deleteRandomCode',
    placement: 'cell',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  // 以下は #58。攻撃しない（攻撃力・得意なし）1回払いのアイテム。範囲 none は置かずに購入時に発動する。
  rubberDuck: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'middle',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'reveal',
    placement: 'cell',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  codeFreeze: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'none',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'codeFreeze',
    placement: 'none',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  specChangeStorm: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'none',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'specChangeStorm',
    placement: 'none',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  coffeeMachine: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'short',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'coffee',
    placement: 'cell',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  energyDrink: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'none',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'energyDrink',
    placement: 'none',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  pizza: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'none',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'pizza',
    placement: 'none',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  documentation: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'none',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'documentation',
    placement: 'none',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  fridayDeploy: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'none',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'fridayDeploy',
    placement: 'none',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  rollbackButton: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'none',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'rollback',
    placement: 'none',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  worksFine: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'none',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'worksFine',
    placement: 'none',
    followsPlayer: false,
    attackCooldownMs: null,
  },
  seniorNote: {
    payment: 'oneTime',
    strongAgainst: { kind: 'none' },
    range: 'middle',
    power: 'none',
    targetsNormalCode: false,
    activation: 'nearestTarget',
    effect: 'seniorNote',
    placement: 'cell',
    followsPlayer: false,
    attackCooldownMs: null,
  },
} as const satisfies Record<ItemType, ItemDefinition>;

// 表示名（正式名称）。現在の言語のカタログから読む(#158)。
export const getItemLabel = (itemType: ItemType): string => getMessages().items.names[itemType];

// このアイテムが正常なコードも対象にするか（企画書 8。猫だけが true）。
export const itemTargetsNormalCode = (itemType: ItemType): boolean =>
  ITEM_DEFINITIONS[itemType].targetsNormalCode;

// アイテムの発動方式（nearestTarget は汎用の自動攻撃、releaseGate は CI のリリース直前の効果）。
export const getItemActivation = (itemType: ItemType): ItemActivation => ITEM_DEFINITIONS[itemType].activation;
// 場のコードをランダムに消すアイテムか（猫 #57）。true なら攻撃（findItemTarget・damageMaliciousCode）を通さない。
export const isRandomDeleteItem = (itemType: ItemType): boolean =>
  ITEM_DEFINITIONS[itemType].effect === 'deleteRandomCode';

// 範囲内の不正なコードを攻撃するアイテムか（#58）。MainScene.updateItems はこれが true のアイテムだけ攻撃させる。
export const isAttackItem = (itemType: ItemType): boolean => ITEM_DEFINITIONS[itemType].effect === 'attack';

// 置き方(#58)。none は購入時に発動し、placedItems に入らない。
export const getItemPlacement = (itemType: ItemType): ItemPlacement => ITEM_DEFINITIONS[itemType].placement;

// 主人公についてまわるか（ペアプロ相棒 #58）。
export const isFollowItem = (itemType: ItemType): boolean => ITEM_DEFINITIONS[itemType].followsPlayer;

// アイテムを置ける・使えるようになるレベル(#164)。値は config.ts の ITEM_REQUIRED_LEVEL_BY_TYPE。
export const ITEM_REQUIRED_LEVELS: Readonly<Record<ItemType, number>> = ITEM_REQUIRED_LEVEL_BY_TYPE;

// レベルは 1 以上の整数（level.ts の levelAt が返す値）。それ以外は呼び出し側の誤りなので例外にする（全解放・未解放のどちらにも寄せない）。
const assertLevel = (level: number): void => {
  if (!Number.isInteger(level) || level < 1) throw new RangeError(`レベルは 1 以上の整数にする: ${level}`);
};

// level で解放済みか(#164)。必要レベルちょうどで解放する。
export const isItemUnlocked = (itemType: ItemType, level: number): boolean => {
  assertLevel(level);
  return ITEM_REQUIRED_LEVELS[itemType] <= level;
};

// level で解放済みのアイテム（ITEM_TYPES の定義順）(#164)。アイテムのメニューとキー 4〜9 はこの一覧のページを使う。
export const unlockedItemTypes = (level: number): ItemType[] =>
  ITEM_TYPES.filter((itemType) => isItemUnlocked(itemType, level));

// 範囲の段階をピクセルに変換する。設定値は引数で差し替えられる（既定値は config.ts）。
// random（猫 #57）は距離の制限がないので Infinity。none（#58、距離を持たない）は 0。
export const getItemRange = (
  itemType: ItemType,
  ratios: Readonly<Record<ItemRange, number>> = ITEM_RANGE_RATIOS,
  cellSize: number = CELL_SIZE,
): number => {
  const range: ItemRangeSpec = ITEM_DEFINITIONS[itemType].range;
  if (range === 'random') return Infinity;
  if (range === 'none') return 0;
  return ratios[range] * cellSize;
};

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
// 万能型(all)も false（得意ボーナスなしで全種類に等倍のため）。なし(none)も false。
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
