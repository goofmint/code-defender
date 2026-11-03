# Code Defender

Webブラウザで動く2Dディフェンスゲーム。正常なコードに紛れ込む不正なコードを退治し、正常なコードだけをリリースしよう。

企画書: [docs/game_plan.md](docs/game_plan.md)

## 開発

```sh
npm install
npm run dev
```

開発サーバーは http://localhost:5173/ で、タイトルだけの空のゲーム画面を表示します。

```sh
npm run build
npm run preview
```

本番ビルドの公開パスは `/code-defender/` です。プレビューは http://localhost:4173/code-defender/ で確認できます。`main` への push で GitHub Actions が [GitHub Pages](https://goofmint.github.io/code-defender/) へデプロイします。Pages のソースは GitHub Actions に設定してください。
