# English Structure Viewer

英文を入力すると、文構造（SVOC）・品詞・原形をブラウザ内だけで解析して可視化する Web アプリ。

- 公開 URL: https://224096-cmd.github.io/eng-structure-viewer/
- 評価モード: https://224096-cmd.github.io/eng-structure-viewer/eval.html
- サーバ・API キー不要。GitHub Pages 上の静的サイトとして動作し、解析はすべてルールベース（AI モデル不使用）。

## 構成
| パス | 内容 |
|---|---|
| `index.html`, `app.js`, `style.css` | 解析画面 |
| `eval.html`, `eval.js` | 評価モード（テストセット一括評価、CSV/JSON 出力） |
| `src/pos.js` | 品詞タグ付け・原形 |
| `src/chunker.js` | チャンク化（名詞句・動詞句など） |
| `src/patterns.js` | 文型判定エンジン |
| `src/render.js` | 描画・ホバーカード |
| `rules/patterns.json` | 文型規則（level 付き） |
| `data/testset.csv` | 評価用テストセット（自作） |
| `docs/annotation_guide.md` | テストセットのアノテーション仕様 |
| `docs/architecture.md` | 処理の流れ・設計判断・既知の限界 |
| `results/` | 評価結果の保存先（評価モードでダウンロードした CSV/JSON をここに置く） |
| `vendor/compromise.js` | 品詞タグ付けライブラリ（MIT License） |

## 更新履歴
- v0.2 : 品詞・原形のホバー表示、レベル付き文型規則（JSON）、S/V/O/C/M の色分け、評価モード、テストセット 50 文
- v0.1 : 最小構成・Pages デプロイ確認
