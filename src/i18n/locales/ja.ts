// 日本語の文言カタログ(#158)。表示する文言はここと en.ts に置き、ロジック側は src/i18n/index.ts の getMessages() から読む。
// この形（typeof ja）を Messages 型にし、ほかの言語のカタログは Messages 型で書く（キーの過不足は tsc がエラーにする）。
// 動的な値は名前付きプレースホルダー（{amount} など）で埋め込み、言語ごとに語順を変えられるようにする（interpolate で置換）。
// 内部識別子（codeRabbit・junior など）と絵文字（📅💰💸📈🔵🟡🔴 など。config.ts の HUD_ICONS・TECH_DEBT_LEVELS #165）は翻訳しない。カタログには入れずに呼び出し側で埋め込む。
// 型の参照は import type だけにする。カタログからロジックや config.ts を実行時に読み込まない（循環参照を作らないため）。
import type { AiAgentType } from '../../aiAgent';
import type { EngineerPersonalityId, EngineerRank, SalaryDirection } from '../../engineer';
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
    // キー操作は #165 で廃止したので、Enter は書かない。
    restart: 'タップ / クリックでもう一度',
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
  // #165 で語の代わりに絵文字（{icon}・{calendar}。config.ts の HUD_ICONS・TECH_DEBT_LEVELS）と数字にした。並びは言語によらず同じ。
  hud: {
    // {level} はレベル(#164)、{calendar} は 📅、{days} は経過日数(#165)。
    levelAndDays: 'Lv.{level} {calendar}{days}',
    // {icon} は 💰。
    funds: '{icon}{amount}',
    // {icon} は 📈。
    cumulativeSales: '{icon}{amount}',
    // 月末に支払うお金（給料＋月額アイテム＋AIエージェントの月額）。{icon} は 💸（赤文字で出す #165）。
    monthEndPayment: '{icon}{amount}',
    // 四捨五入した整数の技術的負債。
    techDebt: '技術的負債: {debt}',
    // 右下の指標の負債(#156, #165)。{icon} は段階の絵文字（🔵🟡🔴）、{debt} は四捨五入して 0〜上限に収めた整数。
    techDebtStatus: '{icon}{debt}',
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
    startButton: 'プレイ開始',
    // エンジニアの選択ボタン(#157)。{count} は未配置のエンジニア（初期配置の間に雇った人 #172）の人数。
    engineerButton: 'エンジニア 残り{count}人',
    placed: '{name}を置きました',
    removed: '{name}を撤去しました',
    insufficientPoints: 'ステージポイントが足りません',
    noItemThere: 'そこにはアイテムがありません',
    engineerPlaced: 'エンジニアを置きました',
    engineerRemoved: 'エンジニアを外しました',
    engineerNotCandidate: 'エンジニアはここに置けません',
    engineerOverlapsItem: 'アイテムと重なるため置けません',
    noUnplacedEngineer: '置けるエンジニアがいません。先に雇ってください',
    selectFirst: '先に置くものを選んでください',
    placeAllEngineers: 'エンジニアを全員配置してください',
    // 置いた人が INITIAL_PLACEMENT_MIN_ENGINEERS 人に足りないとき(#172)。
    hireAndPlaceEngineer: 'エンジニアを1人以上雇って配置してください',
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
    // エンジニアのメニュー(#156)。雇うときの費用はない(#179)ので、雇うボタンにはランクだけを出す。
    count: 'エンジニア: {count}/{max}',
    hireOption: '{rank}を雇う',
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
  },
  releasePoint: {
    // リリース地点の円の上に出すラベル。
    label: 'リリース',
  },
  // ゲームの説明(#165)。右上の ℹ️ で開くパネルの見出しと説明の行（help.ts の buildHelpLines が上から順に並べる）。
  // 数値は config.ts の値から埋め込む（文言に数値を直接書かない）。操作はマウスだけなので、キーの名前は書かない。
  help: {
    title: 'ゲームの説明',
    // {funds} は formatYen(0)、{bankrupt} は bankruptAtOrBelow か bankruptBelow（BANKRUPT_INCLUDES_ZERO）。
    goal: '正常なコードはリリースまで通し、不正なコードは倒す。資金が{funds}{bankrupt}になると倒産',
    bankruptAtOrBelow: '以下',
    bankruptBelow: '未満',
    // {range} は攻撃の射程（px）。
    controls: 'マウスを押し続けると主人公がそこへ動く。主人公をクリックすると{range}px以内の不正なコードを攻撃',
    // 主人公のキーボードとバーチャルパッドの操作(#182)。{up}・{down}・{left}・{right}・{attack} はパッドのボタンの文字（VIRTUAL_PAD_LABELS）。
    keyboardPad: 'キーボード: 矢印かWASDで移動、スペースで攻撃。右下のパッド: {up}{down}{left}{right}で移動、中央の{attack}で攻撃',
    // {points} はステージポイントの初期値、{start} は開始ボタンの文言。
    setup: '開始前: 右上のエンジニアで雇い、色付きの床に置く（1人以上・全員）。アイテムを選んで床をクリック（{points}pt）。×で取消。「{start}」',
    popover: '出現地点をクリック: 休暇・復帰とAIエージェント',
    // {reduction}・{max}・{min} はパーセントポイント（四捨五入した整数）。
    vacation: '休暇: 不正率-{reduction}pt/回・最大-{max}pt・下限{min}%。効果は復帰後も維持。給与は継続、休暇中は生産停止',
    // {max} はエンジニアの上限人数。
    hire: '右上のエンジニア: 雇用（最大{max}人）・昇給・減給。給料は月末に払う',
    aiAgent: 'AIエージェント: 出力ペースが上がる。安いほど不正なコードが混ざりやすい。月額',
    // {days} はレベルが上がる間隔（日）。
    items: '右上のアイテム: 資金で買い、主人公の位置に置く。{days}日ごとにレベルが上がり、使えるアイテムが増える',
    // {refactoring}・{feature} はボタンの文字（◀ / ▶）、{step} は1回で変える割合（%）。
    balance: '右上の開発バランス: ゲージの左が機能開発（売上）、右がリファクタリング（負債を返す）。{refactoring} {feature}で{step}%ずつ',
    // {days}・{funds}・{sales}・{payment} は HUD_ICONS の絵文字。
    hudIcons: '{days}経過日数 {funds}資金 {sales}累計売上 {payment}次の月末に払う額',
    // {normal}・{caution}・{critical} は段階の絵文字、*Min・*Max はその段階の範囲。{outage} は大障害の閾値、{days} は放置できる日数。
    techDebt:
      '技術的負債: {normal}{normalMin}〜{normalMax} {caution}{cautionMin}〜{cautionMax} {critical}{criticalMin}〜{criticalMax}。{outage}を超えたまま{days}日で大障害',
  },
};

// 入れ子のオブジェクトをすべて readonly にする（文字列・数値はそのまま）。
type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

export type Messages = DeepReadonly<typeof ja>;
