# English Structure Viewer

英文を入力すると、文構造（SVOC）・品詞・原形をブラウザ内だけで解析して可視化する Web アプリ。

- 公開 URL: https://224096-cmd.github.io/eng-structure-viewer/
- 評価モード: https://224096-cmd.github.io/eng-structure-viewer/eval.html
- サーバ・API キー不要。GitHub Pages 上の静的サイトとして動作し、解析はすべてルールベース（AI モデル不使用）。

## 構成
| パス | 内容 |
|---|---|
| `index.html`, `app.js`, `style.css` | 解析画面 |
| `eval.html`, `eval.js` | 評価モード（文型・品詞の一括評価、CSV/JSON 出力） |
| `src/pos.js` | 品詞タグ付け・原形 |
| `src/chunker.js` | チャンク化（名詞句・動詞句など） |
| `src/patterns.js` | 文型判定エンジン |
| `src/render.js` | 描画・ホバーカード |
| `src/dict.js` | 英和辞書の読み込み（EJDict-hand、CC0） |
| `src/tree.js` | 構造図（SVG） |
| `sw.js`, `manifest.json`, `icon.svg` | オフライン対応（PWA） |
| `scripts/evaluate.mjs` | 評価を一括実行して results/ に保存（`node scripts/evaluate.mjs v0.5`） |
| `scripts/make_figures.py` | 図の生成（`python scripts/make_figures.py`） |
| `rules/patterns.json` | 文型規則（level 付き） |
| `data/testset_dev.csv` | 開発用テストセット（135 文） |
| `data/testset_eval.csv` | 評価用テストセット（130 文・規則改良には使わない） |
| `data/dict/` | 英和辞書（頭文字ごとの JSON） |
| `data/ud_ewt_sample.json` | 品詞評価用 UD English-EWT 抜粋（300 文、CC BY-SA 4.0） |
| `docs/annotation_guide.md` | テストセットのアノテーション仕様 |
| `docs/evaluation_protocol.md` | 評価手順と版ごとの記録 |
| `docs/architecture.md` | 処理の流れ・設計判断・既知の限界 |
| `results/` | 評価結果（版ごとのフォルダ、`summary_all.csv`、`figures/`） |
| `vendor/compromise.js` | 品詞タグ付けライブラリ（MIT License） |

## 現在の精度（v0.5、評価用 130 文・UD 300 文）
- 文型: 89.2%（レベル1の文 96%、レベル2の文 96%、レベル3の文 67%）
- 品詞: 87.4%（UD 規約）、原形: 94.0%

![学習曲線](results/figures/learning_curve.png)

## 更新履歴
- v0.5 : レベル3規則（重文・分詞構文・関係副詞・what 節・間接疑問・倒置など）、訳語表示（EJDict-hand）、構造図（SVG）、オフライン対応、評価スクリプト・図の自動生成。評価用 130 文: 89.2%
- v0.4 : 疑問文・There is・等位接続主語・動名詞・使役知覚・分詞修飾・形式主語など規則拡張、開発用 +50 文、キャッシュ対策（?v=）。評価用 100 文: 71% → 95%
- v0.3 : 評価用テストセット 100 文（未知データ）、UD English-EWT による品詞・原形評価、評価プロトコル。規則は v0.2 から変更なし
- v0.2 : 品詞・原形のホバー表示、レベル付き文型規則（JSON）、S/V/O/C/M の色分け、評価モード、開発用テストセット 50 文
- v0.1 : 最小構成・Pages デプロイ確認
