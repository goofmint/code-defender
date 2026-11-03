// 不正なコードの種類（企画書 3-1）。Phaser には依存しない（テスト可能にするため）。
// 見た目・強さ・損害額は企画書で未定のため、config.ts の仮の値を参照する。
import {
  MALICIOUS_CODE_BADGE_BORDER_COLOR,
  MALICIOUS_CODE_BADGE_BORDER_WIDTH,
  MALICIOUS_CODE_PARAMS,
} from './config';
import { CODE_SIZE, CODE_STYLES } from './code';
import type { CodeStyle } from './code';

// 脆弱性は重大度の高い順に先頭4つ。
export const MALICIOUS_CODE_TYPES = [
  'vulnerabilityCritical',
  'vulnerabilityMajor',
  'vulnerabilityMinor',
  'vulnerabilityInfo',
  'spaghetti',
  'bug',
  'duplication',
  'lowPerformance',
  'typo',
] as const;

export type MaliciousCodeType = (typeof MALICIOUS_CODE_TYPES)[number];

export type CodeVariant =
  | { readonly kind: 'normal' }
  | { readonly kind: 'malicious'; readonly maliciousType: MaliciousCodeType };

export type MaliciousCodeGroup = 'vulnerability' | 'other';

type MaliciousCodeTypeDefinition = {
  readonly label: string;
  readonly group: MaliciousCodeGroup;
  // 仮の見た目（星の右上のバッジ）。
  readonly badgeColor: number;
  readonly badgeRadiusRatio: number;
  // 仮の強さ（耐久）。
  readonly hp: number;
  // 仮の損害額。
  readonly damage: number;
};

export const MALICIOUS_CODE_TYPE_DEFINITIONS = {
  vulnerabilityCritical: {
    label: '脆弱性：クリティカル',
    group: 'vulnerability',
    ...MALICIOUS_CODE_PARAMS.vulnerabilityCritical,
  },
  vulnerabilityMajor: {
    label: '脆弱性：メジャー',
    group: 'vulnerability',
    ...MALICIOUS_CODE_PARAMS.vulnerabilityMajor,
  },
  vulnerabilityMinor: {
    label: '脆弱性：マイナー',
    group: 'vulnerability',
    ...MALICIOUS_CODE_PARAMS.vulnerabilityMinor,
  },
  vulnerabilityInfo: {
    label: '脆弱性：インフォ',
    group: 'vulnerability',
    ...MALICIOUS_CODE_PARAMS.vulnerabilityInfo,
  },
  spaghetti: { label: 'スパゲティコード', group: 'other', ...MALICIOUS_CODE_PARAMS.spaghetti },
  bug: { label: 'バグ', group: 'other', ...MALICIOUS_CODE_PARAMS.bug },
  duplication: { label: 'コード重複', group: 'other', ...MALICIOUS_CODE_PARAMS.duplication },
  lowPerformance: {
    label: '低パフォーマンス',
    group: 'other',
    ...MALICIOUS_CODE_PARAMS.lowPerformance,
  },
  typo: { label: 'タイポ', group: 'other', ...MALICIOUS_CODE_PARAMS.typo },
} as const satisfies Record<MaliciousCodeType, MaliciousCodeTypeDefinition>;

// 描画用の見た目。不正コードの基本形（赤い星形＋「!」）にバッジを足したもの。
export type MaliciousCodeAppearance = CodeStyle & {
  readonly badgeColor: number;
  readonly badgeBorderColor: number;
  readonly badgeBorderWidth: number;
  // バッジの半径（ピクセル）。
  readonly badgeRadius: number;
};

export const getMaliciousCodeAppearance = (type: MaliciousCodeType): MaliciousCodeAppearance => {
  const { badgeColor, badgeRadiusRatio } = MALICIOUS_CODE_TYPE_DEFINITIONS[type];
  return {
    ...CODE_STYLES.malicious,
    badgeColor,
    badgeBorderColor: MALICIOUS_CODE_BADGE_BORDER_COLOR,
    badgeBorderWidth: MALICIOUS_CODE_BADGE_BORDER_WIDTH,
    badgeRadius: CODE_SIZE * badgeRadiusRatio,
  };
};
