// 英語の文言カタログ(#158)。Messages 型（日本語カタログ ja.ts の形）で書くので、キーの欠落・余分なキーは tsc がエラーにする。
// 複数形の処理が要らない書き方にする（例: 「Days elapsed: 3」）。プレースホルダー名は ja.ts と同じにする（locales.test.ts で検証）。
// 型の参照は import type だけにする（ja.ts と同じ理由）。
import type { CurrencyFormat, Messages } from './ja';

// 円は記号を数値の前に置き（¥20,000）、短い金額は千円単位（¥100K、¥20K/mo）にする。
const EN_CURRENCY: CurrencyFormat = {
  symbol: '¥',
  position: 'prefix',
  short: { divisor: 1000, oneTime: '¥{value}K', monthly: '¥{value}K/mo' },
};

export const en: Messages = {
  numberLocale: 'en-US',
  currency: EN_CURRENCY,
  gameOver: {
    title: 'You went bankrupt',
    score: 'Score: {amount}',
    elapsedDays: 'Days elapsed: {days}',
    restart: 'Tap / Click / Enter to play again',
  },
  penalty: {
    amount: '-{amount}',
  },
  items: {
    names: {
      codeRabbit: 'CodeRabbit',
      linter: 'Static analysis tool (Linter)',
      testTool: 'Test tool',
      ci: 'CI',
      securityScanner: 'Security scanner',
      pairProgrammer: 'Pair programming buddy',
      cat: 'Cat',
      rubberDuck: 'Rubber duck',
      codeFreeze: 'Code freeze',
      specChangeStorm: 'Storm of spec changes',
      coffeeMachine: 'Coffee machine',
      energyDrink: 'Energy drink',
      pizza: 'Pizza',
      documentation: 'Documentation',
      fridayDeploy: 'Friday evening deploy',
      rollbackButton: 'Rollback button',
      worksFine: '"It works, so it\'s fine!"',
      seniorNote: "Legendary senior's note",
    },
    // 日本語でも英語の短い名前を使っているので、同じ文字列にする。
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
    },
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
    },
  },
  aiAgents: {
    names: {
      strong: 'AI coding agent (strong)',
      normal: 'AI coding agent (standard)',
      cheap: 'AI coding agent (budget)',
    },
    shortNames: {
      strong: 'Strong',
      normal: 'Std',
      cheap: 'Budget',
    },
  },
  engineer: {
    ranks: {
      junior: 'Junior',
      middle: 'Mid',
      senior: 'Senior',
    },
    personalities: {
      meticulous: 'Meticulous',
      passive: 'Passive',
      careless: 'Careless',
      slacker: 'Slacker',
      earnest: 'Earnest',
      calm: 'Composed',
      cheerful: 'Cheerful',
      gloomy: 'Gloomy',
    },
  },
  maliciousCode: {
    names: {
      vulnerabilityCritical: 'Vulnerability: Critical',
      vulnerabilityMajor: 'Vulnerability: Major',
      vulnerabilityMinor: 'Vulnerability: Minor',
      vulnerabilityInfo: 'Vulnerability: Info',
      spaghetti: 'Spaghetti code',
      bug: 'Bug',
      duplication: 'Duplicated code',
      lowPerformance: 'Poor performance',
      typo: 'Typo',
    },
  },
  vacation: {
    // 「休」の代わり。円に収まる2文字の「眠り」の記号にする。単独の英字は操作キー（Z/X など）と紛らわしいので使わない。
    marker: 'Zz',
  },
  releasePoint: {
    // 推定幅（textMetrics.ts）が 60px 以下になる長さ（リリース地点の中心 x=930 から画面右端 960 まで 30px）。
    label: 'Release',
  },
};
