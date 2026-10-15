# v0.3 評価結果（規則は v0.2 と同一。評価用 100 文は規則の改良に使っていない）

実行環境: Windows, Edge 155（userAgent は各 JSON に記録）。2026-10-15 実施。

## 文型（評価用 100 文 `data/testset_eval.csv`）
| 有効規則 | 全体 | SV | SVC | SVO | SVOO | SVOC | 平均 ms/文 |
|---|---|---|---|---|---|---|---|
| ≤1 | 54.0% (54/100) | 73.9% | 56.5% | 55.9% | 55.6% | 0.0% | 0.27 |
| ≤2 | **71.0% (71/100)** | 78.3% | 78.3% | 76.5% | 44.4% | 45.5% | 0.69 |

クロス表（行＝文のレベル、列＝有効規則）
| 文のレベル | n | ≤1 | ≤2 | ≤3 |
|---|---|---|---|---|
| 1 | 50 | 84.0% | 84.0% | 84.0% |
| 2 | 50 | 24.0% | 58.0% | 58.0% |

ファイル: eval_summary_rules_le1.json / eval_detail_rules_le1.csv / eval_summary_rules_le2.json / eval_detail_rules_le2.csv / eval_cross.csv
※ 詳細 CSV の 1 文目の timeMs（約 38 ms）は JIT 暖機のため平均から除外して考える。

## 品詞・原形（UD English-EWT 300 文、整列 291 文・3,247 語）
| 比較規約 | 品詞正解率 | 原形正解率 | 処理時間 |
|---|---|---|---|
| UD 規約（be 動詞を AUX として比較） | 84.4% (2740/3247) | 94.0% | 130 ms |
| 規約なし | 81.8% (2657/3247) | 94.0% | 109 ms |

ファイル: pos_eval_ud_convention.json / pos_errors_ud_convention.csv / pos_eval_raw.json / pos_errors_raw.csv

## 参考: 開発用 50 文（規則を作りながら見た文。汎化性能の証拠にはならない）
dev_set_reference/ : 規則≤2 で 49/50 (98.0%)
