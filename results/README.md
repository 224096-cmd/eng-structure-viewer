# 評価結果の一覧

| フォルダ / ファイル | 内容 |
|---|---|
| `summary_all.csv` | 全版・全データセット・全規則レベルの文型正解率（卒論の表はここから作る） |
| `summary_pos_all.csv` | 全版の品詞・原形正解率 |
| `figures/` | 学習曲線、クロス表、開発用と評価用の比較（`scripts/make_figures.py` で生成） |
| `v0.3/` | ブラウザ（Edge/Windows）での実測。品詞評価・文型評価・開発用参考値 |
| `v0.5-pre/`, `v0.5/` | `scripts/evaluate.mjs` による Node 実行の結果。REPORT.md に表、CSV に 1 文ごとの判定、JSON に集計 |

v0.4 の値は summary_all.csv に記録（Node 実行、当時の評価用 100 文）。

## 再現方法
```
node scripts/evaluate.mjs v0.6      # 新しい版の評価を results/v0.6/ に書き出し、summary_*.csv に追記
python scripts/make_figures.py      # 図を更新
```
