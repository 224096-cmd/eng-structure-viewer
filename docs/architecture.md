# 処理の流れ（v0.4）

```
入力テキスト
  │ 文分割（compromise.js）
  ▼
src/pos.js      品詞タグ付け：compromise のタグ → 粗い品詞（NOUN, VERB, AUX, ADJ, ADV, ADP, DET, PRON, SCONJ, CCONJ, PART, REL, NUM）
  │              + 原形（lemma）
  ▼
src/chunker.js  チャンク化：NP / VP / VP_be / ADJP / PP / ADVP / REL / SCONJ
  │              （時の名詞句→ADVP、不定詞→NP などレベル依存の処理あり）
  ▼
src/patterns.js 文型判定：
  │   変形（全レベル）：疑問文の語順復元、There is 構文
  │   レベル2以上：関係詞節・分詞の後置修飾→RELCL、従属節→SUBCL、that 節（省略含む）→NP に畳み込み
  │   特徴付き照合：VP:linking / passive / naming / causative / control / bare、NP:inf / it / existential
  │   修飾語を除いた主要チャンク列を rules/patterns.json と照合（level ≤ 指定レベルの規則のみ）
  ▼
結果 JSON { pattern, tokens[{text,pos,lemma,role}], chunks, timeMs }
  │
  ├─ index.html / src/render.js  色＋記号＋ラベルで表示、ホバーカード
  └─ eval.html / eval.js         テストセット一括評価 → CSV / JSON
```

## 設計上の判断
- AI モデルは使わない（ブラウザ内・オフライン・100MB 以下という制約と、規則の説明可能性のため）。
- 規則は JSON に外出しし、各規則に `level` を持たせる。レベル切替は「level ≤ N の規則だけ有効」というフィルタ。
- 色覚多様性への配慮として、役割の表示は色だけに頼らず記号（○□△◇…）とラベル（S/V/O/C/M）を併記する。

## 既知の限界（v0.4）
- 等位接続詞（and）でつながる重文（2 つの節）は未対応（名詞句の等位接続のみ対応）。
- 関係詞節・従属節の終端判定は「動詞句を 1 つ見たあと、次の動詞句の直前」という単純な規則。
- 過去分詞と形容詞の区別は compromise の判定に依存する。
