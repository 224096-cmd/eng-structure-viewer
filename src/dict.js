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
// 活用形から見出し語の候補を作る（原形推定が失敗した語の保険）: weekends→weekend, abandoning→abandon, studies→study …
function morphCandidates(w) {
  const out = [];
  if (/ies$/.test(w)) out.push(w.slice(0, -3) + 'y');
  if (/(ss|sh|ch|x|z)es$/.test(w)) out.push(w.slice(0, -2));
  if (/es$/.test(w)) out.push(w.slice(0, -1));
  if (/s$/.test(w) && !/ss$/.test(w)) out.push(w.slice(0, -1));
  if (/ing$/.test(w)) { out.push(w.slice(0, -3)); out.push(w.slice(0, -3) + 'e'); if (/([a-z])\1ing$/.test(w)) out.push(w.slice(0, -4)); }
  if (/ed$/.test(w)) { out.push(w.slice(0, -2)); out.push(w.slice(0, -1)); if (/([a-z])\1ed$/.test(w)) out.push(w.slice(0, -3)); if (/ied$/.test(w)) out.push(w.slice(0, -3) + 'y'); }
  if (/er$/.test(w)) out.push(w.slice(0, -2), w.slice(0, -1));
  if (/est$/.test(w)) out.push(w.slice(0, -3), w.slice(0, -2));
  if (/ly$/.test(w)) out.push(w.slice(0, -2));
  return out.filter(x => x.length >= 3);
}

export async function lookup(word, lemma, depth = 0) {
  const base = [...new Set([word, lemma].map(w => (w || '').toLowerCase().replace(/[^a-z'\-]/g, '')).filter(Boolean))];
  const cands = [...base, ...base.flatMap(morphCandidates)];
  for (const w of cands) {
    const d = await loadLetter(w[0]);
    if (d[w]) {
      let g = d[w];
      // 「=relation 1」のような参照見出しは参照先の訳を使う
      const m = /^=([a-z\-]+)/.exec(g);
      if (m && depth < 2) { const ref = await lookup(m[1], m[1], depth + 1); if (ref) g = ref.gloss + (g.includes(' / ') ? ' / ' + g.split(' / ').slice(1).join(' / ') : ''); }
      return { headword: w, gloss: g };
    }
  }
  return null;
}

// 文全体の語をまとめて先読み（ホバー前に辞書を温める）
export function prefetch(tokens) {
  const letters = new Set(tokens.map(t => (t.lemma || t.text).toLowerCase()[0]).filter(c => /[a-z]/.test(c || '')));
  letters.forEach(loadLetter);
}
