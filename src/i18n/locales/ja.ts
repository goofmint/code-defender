// 日本語の文言カタログ(#158)。表示する文言はここと en.ts に置き、ロジック側は src/i18n/index.ts の getMessages() から読む。
// この形（typeof ja）を Messages 型にし、ほかの言語のカタログは Messages 型で書く（キーの過不足は tsc がエラーにする）。
// 動的な値は名前付きプレースホルダー（{amount} など）で埋め込み、言語ごとに語順を変えられるようにする（interpolate で置換）。
// 操作キーの表記（[1]・ENTER など）と内部識別子（codeRabbit・junior など）は翻訳しない。カタログには入れずに呼び出し側で埋め込む。
// 型の参照は import type だけにする。カタログからロジックや config.ts を実行時に読み込まない（循環参照を作らないため）。
import type { AiAgentType } from '../../aiAgent';
import type { EngineerPersonalityId, EngineerRank, SalaryDirection } from '../../engineer';
import type { ItemType } from '../../item';
import type { MaliciousCodeType } from '../../maliciousCode';
import type { TechDebtLevel } from '../../techDebt';

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
  // 複数の機能で同じ文言を使う結果メッセージ。
  common: {
    insufficientFunds: '資金が足りません',
    noTargetEngineer: '対象のエンジニアがいません',
    notPlaceable: 'そこには置けません',
    // {item} は渡された生の識別子（不明なので表示名はない）。
    unknownItem: '不明なアイテムです: {item}',
    // 解放前のアイテム(#164)。レベルが上がると使えるようになる。
    itemLocked: 'まだ使えないアイテムです',
  },
  // 常時表示（左上の経過日数、右下の指標 #156）。{amount} は formatYen で整形した円額。
  hud: {
    // {level} はレベル(#164)、{days} は経過日数。
    levelAndDays: 'Lv.{level} / {days}日',
    funds: '資金: {amount}',
    cumulativeSales: '累計売上: {amount}',
    // 月末に支払うお金（給料＋月額アイテム＋AIエージェントの月額）。
    monthEndPayment: '月末支払: {amount}',
    // 四捨五入した整数の技術的負債。
    techDebt: '技術的負債: {debt}',
    // 右下の指標の負債の段階(#156)。{level} は techDebtLevels の語。
    techDebtLevel: '負債 {level}',
    techDebtLevels: {
      normal: '正常',
      caution: '注意',
      critical: '要解消',
    } satisfies Record<TechDebtLevel, string>,
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
    // アイテムのメニュー(#156)の枠。{price} は formatShortAmount で整形した購入価格か月額。
    option: '{name} {price}',
    placed: '{name}を置きました',
    // 置かずに購入時に発動するアイテム(#58)。
    used: '{name}を使いました',
    noEligibleIncident: '取り消せる障害がありません',
    seniorNotePrevented: '書き置きのおかげで障害を防いだ（中身は誰も読めない）',
  },
  // 開発バランスのメニュー(#156)。{feature}・{refactoring} は整数パーセント（合計 100）。
  balance: {
    title: '開発バランス',
    allocation: '機能{feature}:リファ{refactoring}',
  },
  // 技術的負債の放置による大障害(#46)の通知。
  outage: {
    major: '大障害発生!',
  },
  // 初期配置(#47, #157)。pt はステージポイント（休暇の pt のパーセントポイントとは別）。
  initialPlacement: {
    // パネルの3行目までの各行。{selection} は selectionNone・selectionEngineer・itemCost のどれか。
    header: '初期配置 残りポイント: {points}pt',
    selected: '選択: {selection}',
    selectionNone: 'なし',
    selectionEngineer: 'エンジニア',
    // 選択中のアイテムと、初期配置の間のアイテムのメニューの枠(#157)。
    itemCost: '{name} {cost}pt',
    instruction: '右上のアイテムアイコンから選択し、床をクリック／×で取消',
    startButton: 'プレイ開始',
    // エンジニアの選択ボタン(#157)。{count} は未配置の初期エンジニアの人数。
    engineerButton: 'エンジニア 残り{count}人',
    placed: '{name}を置きました',
    removed: '{name}を撤去しました',
    insufficientPoints: 'ステージポイントが足りません',
    noItemThere: 'そこにはアイテムがありません',
    engineerPlaced: 'エンジニアを置きました',
    engineerRemoved: 'エンジニアを外しました',
    engineerNotCandidate: 'エンジニアはここに置けません',
    engineerOverlapsItem: 'アイテムと重なるため置けません',
    noUnplacedEngineer: '置けるエンジニアがいません',
    selectFirst: '先に置くものを選んでください',
    placeAllEngineers: 'エンジニアを全員配置してください',
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
    // ポップオーバー(#156)のボタン。{fee} は formatShortAmount で整形した月額。
    option: 'AI {name} {fee}',
    equipped: 'AI({name})を付けました',
    replaced: 'AI({from})を AI({to})に付け替えました',
    // {agent} は渡された生の識別子。
    unknownAgent: '不明なAIエージェントです: {agent}',
    alreadyEquipped: '同じAIエージェントを付けています',
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
    // エンジニアのメニュー(#156)。{cost} は formatShortAmount で整形した一時費用（雇用費）。
    count: 'エンジニア: {count}/{max}',
    hireOption: '{rank}を雇う {cost}',
    hired: '{rank}を雇いました',
    hireLimit: 'これ以上雇えません',
    // {rank} は渡された生の識別子（不明なので表示名はない）。
    unknownRank: '不明なランクです: {rank}',
    // 自主退職(#32)。
    resigned: '#{id} {rank}が退職しました',
    // 選択中のエンジニア（メニューでは2行）。{salary} は formatYen で整形した月給、{ai} は付けている AIエージェントの短い名前か aiNone。
    selectedNone: '選択: 対象なし',
    selectedHeading: '選択: #{id} {rank}',
    selectedDetail: '月給 {salary} AI: {ai}',
    aiNone: 'なし',
    salaryButtons: {
      previous: '◀ 前へ',
      next: '次へ ▶',
      raise: '昇給',
      cut: '減給',
    },
    // 昇給・減給(#34)の結果。{before}・{after}・{amount} は formatYen で整形した月給。
    salaryChanged: '#{id} {action}: {before}→{after}',
    salaryActions: {
      raise: '昇給',
      cut: '減給',
    } satisfies Record<SalaryDirection, string>,
    salaryAtMax: 'これ以上昇給できません（上限 {amount}）',
    salaryAtMin: 'これ以上減給できません（下限 {amount}）',
    salaryInvalid: '#{id} の月給が不正です',
    // エンジニアのポップオーバー(#156)の見出し・休暇の状態・休暇ボタン。
    popoverHeading: '#{id} {rank} AI: {ai}',
    popoverState: '状態: {state}',
    working: '勤務中',
    onVacation: '休暇中',
    startVacation: '休暇にする',
    endVacation: '復帰する',
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
    // エンジニアのポップオーバー(#156)の休暇の案内文(#150)の3行。{reduction}・{max}・{min} はパーセントポイント（四捨五入した整数）。
    hintOperation: '休暇ボタンで休暇/復帰（給与は継続）',
    hintRate: '不正率-{reduction}pt/回・最大-{max}pt・下限{min}%',
    hintPersistence: '効果は復帰後も維持。休暇中は生産停止',
  },
  releasePoint: {
    // リリース地点の円の上に出すラベル。
    label: 'リリース',
  },
};

// 入れ子のオブジェクトをすべて readonly にする（文字列・数値はそのまま）。
type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

export type Messages = DeepReadonly<typeof ja>;
