# English Structure Viewer

英文を入力すると、文構造（SVOC）・品詞・原形・訳語をブラウザ内だけで可視化する学習支援 Web アプリ。
三重大学 教育学部 技術・ものづくり教育コース 卒業研究。

- 公開 URL: https://224096-cmd.github.io/eng-structure-viewer/
- サーバ・API キー不要。GitHub Pages 上の静的サイトとして動作。
- 解析はルールベース（非 AI）を基本とし、小型モデルは比較実験用に限定する。

## 構成
- `index.html` / `style.css` / `app.js` : アプリ本体
- `.github/workflows/pages.yml` : GitHub Pages への自動デプロイ
- `data/` : 評価用データ・実験結果（CSV / JSON）※今後追加

## 更新履歴
- v0.1 : 最小構成・Pages デプロイ確認
