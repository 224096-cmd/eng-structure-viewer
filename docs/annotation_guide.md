# テストセットのアノテーション仕様書（v0.2）

テストセット `data/testset.csv` に正解（gold）を付けるときの基準。卒論では「評価データの作成方法」として引用する。

## 列
| 列 | 内容 |
|---|---|
| id | `L{レベル}-{連番}` |
| level | 文のレベル。1=中学（単文）、2=高校（複文・受動態・SVOC・不定詞・関係詞）、3=入試 |
| sentence | 英文 1 文。文中にカンマがある場合はダブルクォートで囲む |
| pattern | 5 文型のいずれか：SV / SVC / SVO / SVOO / SVOC |
| grammar_tag | 文が主に含む文法項目（誤り分析に使う） |

## 文型の判定基準
- **主節のみ**を判定対象とする。従属節・関係詞節の内部の文型は問わない。
- 前置詞句・副詞（句）・従属節・関係詞節は **M（修飾語）** とし、文型には数えない。
- **SVC**：be 動詞または連結動詞（become, look, seem, feel, get, keep, remain など）の後に、主語と同じものを指す名詞か、主語の状態を表す形容詞が来る。
- **SVO**：他動詞の後に目的語（名詞句・代名詞・that 節・不定詞・動名詞）が来る。
- **SVOO**：「人＋物」の二重目的語（give, show, tell, send, ask など）。
- **SVOC**：目的語の後に、目的語の状態・名前を表す語（O＝C の関係）が来る（make, call, name, find, keep など）。
- **受動態**（be＋過去分詞）は **SV** とする。受動態の後に目的語が残る場合（I was given a chance.）は **SVO**、補語が残る場合（The dog was called Pochi.）は **SV** とする。ただし過去分詞が形容詞化している場合（The window was broken. の「壊れている状態」）は SVC とも解釈でき、曖昧例として記録する。
- **命令文**は主語省略として、動詞以降で SV / SVO 等を判定する。
- **There is 構文**は SV とする（there を M 扱い）。

## 時を表す名詞句
every morning / last night / yesterday などは **M** として扱う（目的語ではない）。

## 曖昧例の扱い
判定が分かれる文は grammar_tag に「曖昧」を含め、どちらの解釈を採ったかを本ファイル末尾に記録する。

### 記録
- D2-047 What do you think about it? → what は think の目的語とみなし SVO（当初 SV としていたが修正）。
- L2-006 The window was broken. → 受動態として SV を採用（形容詞化すれば SVC）。
