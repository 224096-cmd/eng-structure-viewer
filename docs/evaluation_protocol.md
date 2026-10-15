# 評価の手順（評価プロトコル）

## データ
| ファイル | 用途 | 文数 | 扱い |
|---|---|---|---|
| `data/testset_dev.csv` | 開発用。規則を作る・直すときに見てよい | 50 | 自由に追加してよい。誤り分析で見つけた文法項目はここに新しい文を足す |
| `data/testset_eval.csv` | 評価用。**規則の改良には使わない**（未知データとして扱う） | 100 | 中身を見て規則を直さない。マイルストーンごとに 1 回だけ実行し、結果を `results/` に保存する |
| `data/ud_ewt_sample.json` | 品詞評価用。UD English-EWT テスト部分から抽出 | 300 | CC BY-SA 4.0。`data/ud_ewt_LICENSE.txt` 参照 |

評価用の正解ラベルは `docs/annotation_guide.md` の基準で付与した。研究者本人が確認し、判定が分かれる文は仕様書末尾に記録する。

## 手順
1. 開発用で規則を改良する（Node または評価モード）。
2. 区切りのよいところ（版を上げるとき）で評価用を 1 回実行し、「集計 JSON」「詳細 CSV」「クロス表 CSV」を `results/vX.Y/` に保存して commit する。
3. 品詞評価は UD 規約あり／なしの両方を保存する。
4. 評価用の誤りを**見て規則を直してはいけない**。誤りの「文法項目」の分布（grammar_tag 列）だけを見て、その項目の文を開発用に新しく書いて改良する。

## 記録（評価用 100 文・UD 300 文）
| 版 | 規則≤1 全体 | 規則≤2 全体 | L1 文 (規則≤2) | L2 文 (規則≤2) | 品詞 (UD規約) | 品詞 (規約なし) | 原形 |
|---|---|---|---|---|---|---|---|
| v0.3 | 54% | 71% | 84% (42/50) | 58% (29/50) | 84.4% | 81.8% | 94.0% |
| v0.4 | 65% | 95% | 96% (48/50) | 94% (47/50) | 87.0% | — | 94.0% |

（v0.4 の値は Node での実行値。ブラウザ実測は results/v0.4/ に保存する）

### v0.4 で行った改良（v0.3 の誤り分析の文法項目に対応。評価用の文は見ていない）
- 開発用に 50 文追加（D1-031〜D1-050, D2-021〜D2-050）し、開発用 100 文で 99% まで改良
- 品詞: be/do/have の助動詞判定を「否定・副詞を飛ばして次の語を見る」方式に変更、疑問文の文頭 Do/Is、所有格 my/your…、such/all などの限定詞、言語名、副詞 together/alone、this/that の代名詞用法
- チャンク: 等位接続の名詞句（Tom and I）、動名詞句（enjoy playing / Swimming is）、他動詞的な句動詞辞書（look after, take care of …）、「the baby Emma」の分割
- 変形: 疑問文の語順復元（Do you like → you like、What did you buy → you did buy what）、There is 構文
- 畳み込み: that 省略（I think he is …）、分詞の後置修飾（the boy running …）
- 規則: SVOC（使役・知覚＋原形、ask O to do、name/elect）、形式主語・形式目的語 it、受動態＋残存目的語、命令文＋SVOO


### v0.3 の誤り分析（評価用 29 件、grammar_tag の集計）
- 未対応の構文（規則が無い）: 疑問文、There is 構文、等位接続の主語、動名詞の目的語、使役・知覚動詞（SVOC with 動詞）、ask O to do、分詞の後置修飾、形式主語・形式目的語、that 省略
- 品詞の誤り: together→ADJ、math→VERB、English→ADJ（文頭）、that→DET、my→NOUN
- 動詞辞書の不足: name / elect / make（SVOO と SVOC の区別）、look after（句動詞）
- 時の名詞句: all night

## 処理時間の記録
初回の 1 文は JIT の暖機で数十 ms かかる。平均値を出すときは最初の 1 文を除くか、2 回実行して 2 回目を採用する。端末名・ブラウザ名を JSON の userAgent から転記する。
