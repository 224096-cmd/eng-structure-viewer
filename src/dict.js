// dict.js — 英和辞書（EJDict-hand, CC0）。頭文字ごとの JSON を必要なときだけ読み込む
const cache = new Map();   // letter → {word: gloss}
const pending = new Map();

async function loadLetter(ch) {
  if (cache.has(ch)) return cache.get(ch);
  if (pending.has(ch)) return pending.get(ch);
  const p = fetch(`data/dict/${ch}.json`).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    .then(obj => { cache.set(ch, obj); pending.delete(ch); return obj; });
  pending.set(ch, p);
  return p;
}

// 単語 → 訳語。見出し語 → 原形 の順に探す。見つからなければ null
export async function lookup(word, lemma) {
  const cands = [...new Set([word, lemma].map(w => (w || '').toLowerCase().replace(/[^a-z'\-]/g, '')).filter(Boolean))];
  for (const w of cands) {
    const d = await loadLetter(w[0]);
    if (d[w]) return { headword: w, gloss: d[w] };
  }
  return null;
}

// 文全体の語をまとめて先読み（ホバー前に辞書を温める）
export function prefetch(tokens) {
  const letters = new Set(tokens.map(t => (t.lemma || t.text).toLowerCase()[0]).filter(c => /[a-z]/.test(c || '')));
  letters.forEach(loadLetter);
}
