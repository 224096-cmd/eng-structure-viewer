# v0.3 評価結果（規則は v0.2 と同一）

実行環境: Windows 10/11, Edge 155（userAgent は各 JSON に記録）

## 品詞・原形（UD English-EWT 300 文、整列 291 文・3,247 語）
| 比較規約 | 品詞正解率 | 原形正解率 | 処理時間 |
|---|---|---|---|
| UD 規約（be 動詞を AUX として比較） | 84.4% (2740/3247) | 94.0% | 130 ms |
| 規約なし | 81.8% (2657/3247) | 94.0% | 109 ms |

- pos_eval_ud_convention.json / pos_errors_ud_convention.csv
- pos_eval_raw.json / pos_errors_raw.csv

## 文型（評価用 100 文）
- eval_summary_L2_*.json / eval_detail_L2_*.csv / eval_cross_*.csv  ← 評価モードで取得して追加する

## 参考: 開発用 50 文（規則を作りながら見た文。汎化性能の証拠にはならない）
- dev_set_reference/ : 規則≤2 で 49/50 (98.0%)、平均 1.17 ms/文
