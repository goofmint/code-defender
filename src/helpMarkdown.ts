// ゲームの説明(#185)の Markdown を見出しと説明の行に分ける純粋関数。Phaser にも Vite にも依存しない（テスト可能にするため）。
// 説明は Phaser のプレーンテキストで1行ずつ描くので、解釈する記法は「# 見出し」（タイトル）と「- 項目」（説明の1行）だけにする。
// それ以外の行（## 見出し・段落・字下げした継続行など）は、表示から黙って欠けないように行番号付きの例外にする。空行は無視する。

export type HelpMarkdown = {
  // 見出し（# の行）。
  readonly title: string;
  // 説明の行のテンプレート（- の行。上から順。プレースホルダーは help.ts で埋める）。
  readonly lines: readonly string[];
};

const TITLE_PREFIX = '# ';
const ITEM_PREFIX = '- ';

export const parseHelpMarkdown = (markdown: string): HelpMarkdown => {
  let title: string | null = null;
  const lines: string[] = [];
  // CRLF（Windows で保存したファイル）も LF と同じに扱う。
  for (const [index, raw] of markdown.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    if (raw.trim() === '') continue;
    if (raw.startsWith(TITLE_PREFIX)) {
      if (title !== null) throw new Error(`ゲームの説明の見出し（# ）が2つ以上あります（${lineNumber}行目）`);
      if (lines.length > 0) throw new Error(`ゲームの説明の見出し（# ）は項目より前に書いてください（${lineNumber}行目）`);
      const text = raw.slice(TITLE_PREFIX.length).trim();
      if (text === '') throw new Error(`ゲームの説明の見出しが空です（${lineNumber}行目）`);
      title = text;
      continue;
    }
    // 「-」だけの行（後ろの空白を除く）も空の項目として扱う。
    if (raw.startsWith(ITEM_PREFIX) || raw.trimEnd() === '-') {
      if (title === null) throw new Error(`ゲームの説明の項目（- ）より前に見出し（# ）が必要です（${lineNumber}行目）`);
      const text = raw.slice(ITEM_PREFIX.length).trim();
      if (text === '') throw new Error(`ゲームの説明の項目が空です（${lineNumber}行目）`);
      lines.push(text);
      continue;
    }
    throw new Error(`ゲームの説明で使えない記法です（使えるのは「# 見出し」と「- 項目」だけ）: ${raw}（${lineNumber}行目）`);
  }
  if (title === null) throw new Error('ゲームの説明の見出し（# ）がありません');
  return { title, lines };
};
