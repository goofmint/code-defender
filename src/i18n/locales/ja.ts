// 日本語の文言カタログ(#158)。表示する文言はここと en.ts に置き、ロジック側は src/i18n/index.ts の getMessages() から読む。
// この形（typeof ja）を Messages 型にし、ほかの言語のカタログは Messages 型で書く（キーの過不足は tsc がエラーにする）。
// 動的な値は名前付きプレースホルダー（{amount} など）で埋め込み、言語ごとに語順を変えられるようにする（interpolate で置換）。
// 操作キーの表記（[1]・ENTER など）と内部識別子（codeRabbit・junior など）は翻訳しない。カタログには入れずに呼び出し側で埋め込む。
// 型の参照は import type だけにする。カタログからロジックや config.ts を実行時に読み込まない（循環参照を作らないため）。
import type { AiAgentType } from '../../aiAgent';
import type { EngineerPersonalityId, EngineerRank } from '../../engineer';
import type { ItemType } from '../../item';
import type { MaliciousCodeType } from '../../maliciousCode';

// 円の表記。symbol を数値の前（prefix）に置くか後ろ（suffix）に置くか。負の値は言語によらず符号を記号の前に置く（formatYen）。
export type CurrencyFormat = {
  readonly symbol: string;
  readonly position: 'prefix' | 'suffix';
  // 短い金額表記（ボタンなど）。金額を divisor で割った値を {value} に入れる。oneTime は一時費用、monthly は毎月の費用。
  readonly short: {
    readonly divisor: number;
    readonly oneTime: string;
    readonly monthly: string;
  };
};

const JA_CURRENCY: CurrencyFormat = {
  symbol: '円',
  position: 'suffix',
  short: { divisor: 10000, oneTime: '{value}万円', monthly: '{value}万/月' },
};

export const ja = {
  // 数値の桁区切りに使う BCP 47 の言語タグ。
  numberLocale: 'ja-JP',
  currency: JA_CURRENCY,
  // ゲームオーバー画面の4行（タイトル→スコア→経過日数→案内）。案内はタッチ端末でも読める文言にしている。
  // {amount} は formatYen で整形した円額、{days} は経過日数。
  gameOver: {
    title: '倒産しました',
    score: 'スコア: {amount}',
    elapsedDays: '経過日数: {days}日',
    restart: 'タップ / クリック / Enter でもう一度',
  },
  // 正常なコードを攻撃したときの浮遊減点表示。{amount} は formatYen で整形した円額。
  penalty: {
    amount: '-{amount}',
  },
  items: {
    // 正式名称（企画書 8 の表の名前）。
    names: {
      codeRabbit: 'CodeRabbit',
      linter: '静的解析ツール（Linter）',
      testTool: 'テストツール',
      ci: 'CI',
      securityScanner: 'セキュリティスキャナー',
      pairProgrammer: 'ペアプロ相棒',
      cat: '猫',
      rubberDuck: 'ラバーダック',
      codeFreeze: 'コードフリーズ',
      specChangeStorm: '仕様変更の嵐',
      coffeeMachine: 'コーヒーマシン',
      energyDrink: 'エナジードリンク',
      pizza: 'ピザ',
      documentation: 'ドキュメント',
      fridayDeploy: '金曜日の夕方デプロイ',
      rollbackButton: 'ロールバックボタン',
      worksFine: '「動いてるからヨシ！」',
      seniorNote: '伝説のシニアの書き置き',
    } satisfies Record<ItemType, string>,
    // 仮・要確認(#48): ボタン・メッセージに使う短い名前。
    shortNames: {
      codeRabbit: 'CodeRabbit',
      linter: 'Linter',
      testTool: 'Test',
      ci: 'CI',
      securityScanner: 'Scanner',
      pairProgrammer: 'Pair',
      cat: 'Cat',
      rubberDuck: 'Duck',
      codeFreeze: 'Freeze',
      specChangeStorm: 'SpecStorm',
      coffeeMachine: 'Coffee',
      energyDrink: 'Energy',
      pizza: 'Pizza',
      documentation: 'Docs',
      fridayDeploy: 'FriDeploy',
      rollbackButton: 'Rollback',
      worksFine: 'Yoshi!',
      seniorNote: 'Senior',
    } satisfies Record<ItemType, string>,
    // 仮・要確認(#48): フィールド上に置いたアイテムに書く短い文字。
    // 仮・要確認(#58): フィールドに置くのはラバーダック・コーヒーマシン・書き置きだけ。他は購入時に発動して置かないが、表の形を揃えるために持つ。
    marks: {
      codeRabbit: 'CR',
      linter: 'Lint',
      testTool: 'Test',
      ci: 'CI',
      securityScanner: 'Sec',
      pairProgrammer: 'Pair',
      cat: 'Cat',
      rubberDuck: 'Duck',
      codeFreeze: 'Frz',
      specChangeStorm: 'Spec',
      coffeeMachine: 'Cof',
      energyDrink: 'Enr',
      pizza: 'Piz',
      documentation: 'Doc',
      fridayDeploy: 'Fri',
      rollbackButton: 'RB',
      worksFine: 'Yoshi',
      seniorNote: 'Note',
    } satisfies Record<ItemType, string>,
  },
  aiAgents: {
    // 正式名称。
    names: {
      strong: 'AIコーディングエージェント（強い）',
      normal: 'AIコーディングエージェント（普通）',
      cheap: 'AIコーディングエージェント（安い）',
    } satisfies Record<AiAgentType, string>,
    // 仮・要確認(#53): ボタン・メッセージ・選択中のエンジニアの情報行に使う短い名前。
    shortNames: {
      strong: '強い',
      normal: '普通',
      cheap: '安い',
    } satisfies Record<AiAgentType, string>,
  },
  engineer: {
    // ランクの表示名（ENGINEER_RANKS の id ごと）。
    ranks: {
      junior: 'ジュニア',
      middle: 'ミドル',
      senior: 'シニア',
    } satisfies Record<EngineerRank, string>,
    // 性格の表示名（企画書(6)の性格8種、ENGINEER_PERSONALITIES の id ごと）。
    personalities: {
      meticulous: '几帳面',
      passive: '消極的',
      careless: '適当',
      slacker: 'サボりがち',
      earnest: '真面目',
      calm: '冷静沈着',
      cheerful: '陽気',
      gloomy: '根暗',
    } satisfies Record<EngineerPersonalityId, string>,
  },
  // 不正なコードの種類の表示名（企画書 3-1 の9名称）。
  maliciousCode: {
    names: {
      vulnerabilityCritical: '脆弱性：クリティカル',
      vulnerabilityMajor: '脆弱性：メジャー',
      vulnerabilityMinor: '脆弱性：マイナー',
      vulnerabilityInfo: '脆弱性：インフォ',
      spaghetti: 'スパゲティコード',
      bug: 'バグ',
      duplication: 'コード重複',
      lowPerformance: '低パフォーマンス',
      typo: 'タイポ',
    } satisfies Record<MaliciousCodeType, string>,
  },
  vacation: {
    // 仮・要確認(#35): 出現場所マーカーに重ねる休暇の文字。マーカーの円（直径 = SPAWN_MARKER_STYLE.radius × 2）に収める。
    marker: '休',
  },
  releasePoint: {
    // リリース地点の円の上に出すラベル。
    label: 'リリース',
  },
};

// 入れ子のオブジェクトをすべて readonly にする（文字列・数値はそのまま）。
type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

export type Messages = DeepReadonly<typeof ja>;
