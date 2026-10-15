// text.js — 入力テキストの前処理と文分割
// - 引用符・ダッシュの正規化
// - 略語（Dr. / e.g. など）で切らない文分割、閉じ引用符・括弧の後で切る
// - セミコロンは節の区切りとして分割（fragment フラグを付ける）
// 出力: [{ text, paragraph, index, fragment }]

const ABBR = new Set(['dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'mt', 'jr', 'sr', 'vs', 'etc', 'e.g', 'i.e', 'no', 'inc', 'ltd', 'co', 'u.s', 'u.k', 'a.m', 'p.m', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'fig', 'vol', 'pp', 'ed']);

export function normalize(text) {
  return text
    .replace(/[“”„″]/g, '"').replace(/[‘’‛′]/g, "'")
    .replace(/—|–|--/g, ' — ')      // ダッシュは前後に空白を付けて独立させる（— に統一）
    .replace(/…/g, '...')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n');
}

function isAbbrev(word) {
  const w = word.toLowerCase().replace(/^["'(]+/, '');
  if (ABBR.has(w)) return true;
  if (/^[a-z]$/.test(w)) return true;            // 頭文字 A.
  if (/^([a-z]\.)+[a-z]$/.test(w)) return true;  // u.s / e.g
  return false;
}

export function splitSentences(text) {
  const paras = normalize(text).split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean);
  const out = [];
  let index = 0;
  paras.forEach((para, pi) => {
    const words = para.split(' ');
    let cur = [];
    const flush = (fragment) => {
      const t = cur.join(' ').trim();
      if (t) out.push({ text: t, paragraph: pi + 1, index: ++index, fragment: !!fragment });
      cur = [];
    };
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      cur.push(w);
      const next = words[i + 1];
      // 文末: . ! ? のあと（閉じ引用符・括弧があってもよい）、次の語が大文字・引用符・括弧・数字で始まる
      const endMatch = /[.!?]+["')\]]*$/.test(w);
      if (endMatch && next !== undefined) {
        const bare = w.replace(/["')\]]+$/, '').replace(/[.!?]+$/, '');
        const nextStartsSentence = /^["'(\[]*[A-Z0-9]/.test(next);
        if (!(isAbbrev(bare) && /\.$/.test(w.replace(/["')\]]+$/, ''))) && nextStartsSentence) { flush(false); continue; }
      }
      // セミコロン: 節の区切り（断片として扱う）
      if (/;["')]*$/.test(w) && next !== undefined) { flush(true); continue; }
    }
    flush(false);
  });
  return out;
}

// トークンの前後の記号から特徴を取り出す
export function punctFeatures(pre, post) {
  const p = post || '', q = pre || '';
  return {
    commaAfter: /,/.test(p), colonAfter: /:/.test(p), semiAfter: /;/.test(p), dashAfter: /—/.test(p),
    quoteOpen: /"/.test(q), quoteClose: /"/.test(p), parenOpen: /[(\[]/.test(q), parenClose: /[)\]]/.test(p),
    sentenceEnd: /[.!?]/.test(p)
  };
}
