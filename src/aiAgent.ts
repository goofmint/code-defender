// AIコーディングエージェント（強い・普通・安い）(#53)。エンジニアに1人1個付けて、担当ルートの出力ペース（コード生成間隔）を上げる。
// 攻撃するアイテム（item.ts の ITEM_TYPES）とは別の種類として扱い、フィールドには置かない。月額の倍率(ITEM_MONTHLY_FEE_RATIO)だけを共有する。
// 価格の段階表はアイテムの半額化(#164)の対象外なので、アイテムの ITEM_PRICE_TIERS ではなく AI_AGENT_PRICE_TIERS（半額前の値）を使う。レベルによる解放(#164)の対象でもない。
// Phaser に依存しない純粋関数だけを置く。
import {
  AI_AGENT_MALICIOUS_RATE_MODIFIER_BY_TYPE,
  AI_AGENT_PRICE_TIER_BY_TYPE,
  AI_AGENT_PRICE_TIERS,
  AI_AGENT_SHORT_NAMES,
  AI_AGENT_SPAWN_INTERVAL_MULTIPLIER_BY_TYPE,
  CODE_SPAWN_INTERVAL_MIN_MS,
  ITEM_MONTHLY_FEE_RATIO,
} from './config';
import type { Engineer } from './engineer';
import { formatShortAmount, getMessages, interpolate } from './i18n';
import type { ItemPayment } from './item';

export const AI_AGENT_TYPES = ['strong', 'normal', 'cheap'] as const;

export type AiAgentType = (typeof AI_AGENT_TYPES)[number];

type PriceTier = keyof typeof AI_AGENT_PRICE_TIERS;

// 攻撃しないので range・power・strongAgainst は持たない。表示名は言語カタログ（aiAgents.names）に置き、getAiAgentLabel で読む(#158)。
type AiAgentDefinition = {
  readonly payment: ItemPayment;
};

export const AI_AGENT_DEFINITIONS = {
  strong: { payment: 'monthly' },
  normal: { payment: 'monthly' },
  cheap: { payment: 'monthly' },
} as const satisfies Record<AiAgentType, AiAgentDefinition>;

// 表示名（正式名称）。現在の言語のカタログから読む(#158)。
export const getAiAgentLabel = (agentType: AiAgentType): string => getMessages().aiAgents.names[agentType];

// AIエージェントを付けたときに scene.events で発行するイベント名。
export const AI_AGENT_EQUIPPED_EVENT = 'ai-agent-equipped';

export type AiAgentEquippedPayload = {
  readonly engineerId: number;
  readonly agentType: AiAgentType;
  readonly price: number;
  // 付け替える前の種類。付けていなかったら null。
  readonly replaced: AiAgentType | null;
};

export const isAiAgentType = (value: string): value is AiAgentType =>
  (AI_AGENT_TYPES as readonly string[]).includes(value);

// 購入価格（円）。段階表と種類ごとの段階は引数で差し替えられる（既定値は config.ts）。
export const getAiAgentPrice = (
  agentType: AiAgentType,
  tiers: Readonly<Record<PriceTier, number>> = AI_AGENT_PRICE_TIERS,
  tierByType: Readonly<Record<AiAgentType, PriceTier>> = AI_AGENT_PRICE_TIER_BY_TYPE,
): number => tiers[tierByType[agentType]];

// 1個の月額。itemPlacement.ts の getItemMonthlyFee と同じ規則（購入価格 × 倍率を四捨五入。倍率が負・NaN・Infinity なら 0）。
export const getAiAgentMonthlyFee = (agentType: AiAgentType, ratio: number = ITEM_MONTHLY_FEE_RATIO): number => {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
  return Math.round(getAiAgentPrice(agentType) * safeRatio);
};

export type EquipAiAgentFailReason =
  | 'gameOver'
  | 'unknownAgent'
  | 'engineerNotFound'
  | 'alreadyEquipped'
  | 'insufficientFunds';

export type EquipAiAgentResult =
  | {
      readonly ok: true;
      readonly engineers: readonly Engineer[];
      readonly fundsAfter: number;
      readonly price: number;
      readonly replaced: AiAgentType | null;
    }
  | { readonly ok: false; readonly reason: EquipAiAgentFailReason };

export type EquipAiAgentState = {
  readonly funds: number;
  readonly gameOver: boolean;
};

// 対象のエンジニアに AIエージェントを付ける。1人1個で、別の種類なら付け替える（前の種類の返金はしない）。
// 判定順: ゲームオーバー → 不明な種類 → エンジニアがいない（null を含む）→ 同じ種類を付けている → 資金不足。
// 資金がちょうど価格なら付けられて 0 になる。休暇中・ルート未割当のエンジニアにも付けられる。入力は変更しない。
export const equipAiAgent = (
  engineers: readonly Engineer[],
  engineerId: number | null,
  agentType: string,
  state: EquipAiAgentState,
): EquipAiAgentResult => {
  if (state.gameOver) return { ok: false, reason: 'gameOver' };
  if (!isAiAgentType(agentType)) return { ok: false, reason: 'unknownAgent' };
  const target = engineerId === null ? undefined : engineers.find((engineer) => engineer.id === engineerId);
  if (target === undefined) return { ok: false, reason: 'engineerNotFound' };
  if (target.aiAgent === agentType) return { ok: false, reason: 'alreadyEquipped' };
  const price = getAiAgentPrice(agentType);
  if (state.funds < price) return { ok: false, reason: 'insufficientFunds' };
  return {
    ok: true,
    engineers: engineers.map((engineer) => (engineer.id === target.id ? { ...engineer, aiAgent: agentType } : engineer)),
    fundsAfter: state.funds - price,
    price,
    replaced: target.aiAgent,
  };
};

// 結果のメッセージ。ゲームオーバー中は表示しないので空文字。
export const formatAiAgentMessage = (result: EquipAiAgentResult, agentType: string): string => {
  const messages = getMessages();
  if (result.ok) {
    if (!isAiAgentType(agentType)) throw new Error(`成功した結果に不明なAIエージェントが渡されました: ${agentType}`);
    const name = AI_AGENT_SHORT_NAMES[agentType];
    return result.replaced === null
      ? interpolate(messages.aiAgents.equipped, { name })
      : interpolate(messages.aiAgents.replaced, { from: AI_AGENT_SHORT_NAMES[result.replaced], to: name });
  }
  switch (result.reason) {
    case 'gameOver':
      return '';
    case 'unknownAgent':
      return interpolate(messages.aiAgents.unknownAgent, { agent: agentType });
    case 'engineerNotFound':
      return messages.common.noTargetEngineer;
    case 'alreadyEquipped':
      return messages.aiAgents.alreadyEquipped;
    case 'insufficientFunds':
      return messages.common.insufficientFunds;
  }
};

// エンジニアのポップオーバー(#156)のボタンの文言。「AI 強い 10万/月」（英語は「AI Strong ¥100K/mo」#158）。月額は精算と同じ計算（getAiAgentMonthlyFee）。キー名（V/B/N）は出さない。
export const formatAiAgentOption = (agentType: AiAgentType, ratio: number = ITEM_MONTHLY_FEE_RATIO): string =>
  interpolate(getMessages().aiAgents.option, {
    name: AI_AGENT_SHORT_NAMES[agentType],
    fee: formatShortAmount(getAiAgentMonthlyFee(agentType, ratio), 'monthly'),
  });

// 倍率が 0 以下・有限でないなら 1（効果なし）として扱う。
const sanitizeMultiplier = (multiplier: number): number =>
  Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;

// 担当エンジニアの AIエージェントを反映したコード生成間隔（ミリ秒）。
// 担当者がいない・付けていないなら baseMs のまま。付けていれば baseMs × 倍率を CODE_SPAWN_INTERVAL_MIN_MS 以上に制限する。
export const aiAgentSpawnIntervalMs = (
  engineer: Engineer | undefined,
  baseMs: number,
  multiplierByType: Readonly<Record<AiAgentType, number>> = AI_AGENT_SPAWN_INTERVAL_MULTIPLIER_BY_TYPE,
  minMs: number = CODE_SPAWN_INTERVAL_MIN_MS,
): number => {
  if (engineer === undefined || engineer.aiAgent === null) return baseMs;
  return Math.max(baseMs * sanitizeMultiplier(multiplierByType[engineer.aiAgent]), minMs);
};

// AIエージェントによる不正コード率の補正。effectiveMaliciousRate の modifiers に渡す差分の一覧。
// 担当者がいない・付けていない・差分が 0・有限でないなら空配列。[CODE_MALICIOUS_RATE_MIN, 1] への制限は effectiveMaliciousRate に任せる。
export const aiAgentMaliciousRateModifiers = (
  engineer: Engineer | undefined,
  modifierByType: Readonly<Record<AiAgentType, number>> = AI_AGENT_MALICIOUS_RATE_MODIFIER_BY_TYPE,
): readonly number[] => {
  if (engineer === undefined || engineer.aiAgent === null) return [];
  const modifier = modifierByType[engineer.aiAgent];
  if (!Number.isFinite(modifier) || modifier === 0) return [];
  return [modifier];
};

// 付けている AIエージェントの月額の合計と個数。休暇中・ルート未割当のエンジニアの分も数える（給料 #37 と同じく全員が対象）。
export const getMonthlyAiAgentFees = (
  engineers: readonly Pick<Engineer, 'aiAgent'>[],
  ratio: number = ITEM_MONTHLY_FEE_RATIO,
): { readonly amount: number; readonly itemCount: number } => {
  const equipped = engineers.flatMap((engineer) => (engineer.aiAgent === null ? [] : [engineer.aiAgent]));
  return {
    amount: equipped.reduce((sum, agentType) => sum + getAiAgentMonthlyFee(agentType, ratio), 0),
    itemCount: equipped.length,
  };
};
