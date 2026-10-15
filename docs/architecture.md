# 処理の流れ（v0.6）

```
入力テキスト
  │ src/text.js  正規化（引用符・ダッシュ）、略語を考慮した文分割、セミコロンで節分割、段落番号
  ▼
src/pos.js      品詞タグ付け：compromise のタグ → 粗い品詞（NOUN, VERB, AUX, ADJ, ADV, ADP, DET, PRON, SCONJ, CCONJ, PART, REL, NUM）
  │              + 原形（lemma）
  ▼
src/chunker.js  チャンク化：NP / VP / VP_be / ADJP / PP / ADVP / REL / SCONJ
  │              （時の名詞句→ADVP、不定詞→NP などレベル依存の処理あり。コンマ等の記号で句を区切る）
  ▼
src/patterns.js 文型判定：
  │   記号処理（全レベル）：引用→名詞節、括弧・ダッシュ→挿入、コロン以降→補足、文頭の副詞句
  │   変形（全レベル）：疑問文の語順復元、There is 構文、伝達の倒置（L2）
  │   レベル2以上：関係詞節・分詞の後置修飾→RELCL、従属節→SUBCL、that 節（省略含む）→NP に畳み込み
  │   レベル3：wh 節（主語・間接疑問）→NP、文頭分詞構文→SUBCL、the 比較級、重文・並列述語→COORDCL、否定副詞倒置、強調構文、同格、接触節
  │   特徴付き照合：VP:linking / passive / naming / causative / control / bare、NP:inf / it / existential
  │   修飾語を除いた主要チャンク列を rules/patterns.json と照合（level ≤ 指定レベルの規則のみ）
  ▼
結果 JSON { pattern, tokens[{text,pos,lemma,role}], chunks, timeMs }
  │
  ├─ index.html / src/render.js  色＋記号＋ラベルで表示、ホバーカード（src/dict.js で訳語）
  ├─ src/tree.js                 構造図（SVG）
  ├─ eval.html / eval.js         テストセット一括評価 → CSV / JSON（ブラウザ）
  └─ scripts/evaluate.mjs        同じ評価を Node で実行し results/ に保存（卒論用の正式な数値）

## 辞書データ
EJDict-hand（パブリックドメイン）45,366 行から、見出し語が英字のみの 36,236 語を取り、各語の最初の 2 義（60 字まで）を残して頭文字ごとの JSON（data/dict/a.json …、合計約 2.5 MB）に分割。ブラウザは必要な頭文字のファイルだけを読み込む。

## オフライン動作
sw.js（Service Worker）が本体ファイルを先読みし、辞書・データは参照したものを保存する。ネットワーク優先・失敗時キャッシュ方式。スマホでは「ホーム画面に追加」で単独アプリとして開ける（manifest.json）。
```

## 設計上の判断
- AI モデルは使わない（ブラウザ内・オフライン・100MB 以下という制約と、規則の説明可能性のため）。
- 規則は JSON に外出しし、各規則に `level` を持たせる。レベル切替は「level ≤ N の規則だけ有効」というフィルタ。
- 色覚多様性への配慮として、役割の表示は色だけに頼らず記号（○□△◇…）とラベル（S/V/O/C/M）を併記する。

## 既知の限界（v0.6）
- 重文は前の節の文型のみ判定し、後の節は並列節（M）として扱う（後の節の内部は判定しない）。
- 評価用レベル3の文での正解率は 70%、評価用長文では 67% にとどまる。未対応項目は results/v0.6/REPORT.md に示す。
- 長さの上限は設けていないが、1 文が極端に長い（60 語超）と節の終端判定の誤りが増える。約 2,000 語（120 文）で 0.5 秒程度。
- 関係詞節・従属節の終端判定は「動詞句を 1 つ見たあと、次の動詞句の直前」という単純な規則。
- 過去分詞と形容詞の区別は compromise の判定に依存する。
