// chunker.js — 品詞列をチャンク（句）にまとめる
// 出力: chunks = [{ type, tokens:[idx...], head }]
//   type: NP(名詞句) / VP(動詞句) / VP_be(be動詞句) / ADJP(形容詞句) / PP(前置詞句) / ADVP(副詞句) / SCONJ / CCONJ / PUNCT / X
// レベル依存の処理は options.level で切り替える

const TIME_NOUNS = new Set(['morning', 'afternoon', 'evening', 'night', 'day', 'week', 'month', 'year', 'time', 'weekend', 'summer', 'winter', 'spring', 'autumn', 'fall', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const TIME_DETS = new Set(['every', 'last', 'next', 'this', 'each']);
const LINKING_VERBS = new Set(['be', 'become', 'seem', 'look', 'feel', 'sound', 'taste', 'smell', 'get', 'remain', 'stay', 'turn', 'appear', 'grow', 'keep']);

export function chunk(tokens, options = { level: 1 }) {
  const level = options.level || 1;
  const chunks = [];
  let k = 0;
  const n = tokens.length;
  const pos = i => (i < n ? tokens[i].pos : null);

  while (k < n) {
    const p = pos(k);

    // 名詞句: DET? (ADV? ADJ)* NUM* (NOUN|PROPN)+ | PRON | 所有格+名詞
    if (p === 'DET' || p === 'ADJ' || p === 'NOUN' || p === 'PROPN' || p === 'PRON' || p === 'NUM') {
      const start = k;
      const possWithNoun = p === 'PRON' && tokens[k].tags.includes('Possessive') && ['ADJ', 'NOUN', 'PROPN', 'NUM'].includes(pos(k + 1));
      if (p === 'PRON' && !possWithNoun) {
        chunks.push({ type: 'NP', tokens: [k], head: k });
        k++; continue;
      }
      if (p === 'DET' || possWithNoun) k++;
      while (k < n && (pos(k) === 'ADJ' || pos(k) === 'NUM' || (pos(k) === 'ADV' && pos(k + 1) === 'ADJ'))) k++;
      // レベル2: 分詞（動詞の -ing / -ed）が名詞の前に来る前置修飾
      if (level >= 2) while (k < n && pos(k) === 'VERB' && (pos(k + 1) === 'NOUN' || pos(k + 1) === 'PROPN') && /(ing|ed)$/.test(tokens[k].text)) k++;
      let head = -1;
      while (k < n && (pos(k) === 'NOUN' || pos(k) === 'PROPN')) { head = k; k++; }
      if (head === -1) {
        // 名詞が無い（形容詞だけ等）→ 形容詞句
        if (k > start && tokens.slice(start, k).some(t => t.pos === 'ADJ')) {
          chunks.push({ type: 'ADJP', tokens: range(start, k), head: k - 1 });
        } else {
          chunks.push({ type: 'X', tokens: range(start, Math.max(k, start + 1)), head: start });
          if (k === start) k++;
        }
        continue;
      }
      // 時を表す名詞句（every morning, last night）は副詞句として扱う
      const first = tokens[start].text.toLowerCase();
      const isTime = TIME_NOUNS.has(tokens[head].lemma) && (TIME_DETS.has(first) || TIME_DETS.has(tokens[start].lemma));
      chunks.push({ type: isTime ? 'ADVP' : 'NP', tokens: range(start, k), head });
      continue;
    }

    // 動詞句: AUX* (ADV)? VERB | AUX 単独（be 本動詞は pos.js で VERB になっている）
    if (p === 'AUX' || p === 'VERB') {
      const start = k;
      while (k < n && pos(k) === 'AUX') k++;
      while (k < n && (pos(k) === 'ADV' || (pos(k) === 'PART' && tokens[k].tags.includes('Negative'))) && (pos(k + 1) === 'VERB' || pos(k + 1) === 'AUX')) k++;
      while (k < n && pos(k) === 'AUX') k++;
      let head = -1;
      if (k < n && pos(k) === 'VERB') { head = k; k++; if (k < n && pos(k) === 'PART' && tokens[k].tags.includes('Particle')) k++; }
      else head = k - 1; // 助動詞のみ
      // 不定詞 to + 動詞 は目的語として後で扱う（ここでは VP に含めない）
      const headTok = tokens[head];
      const isBe = headTok.lemma === 'be';
      const isLinking = LINKING_VERBS.has(headTok.lemma);
      chunks.push({ type: isBe ? 'VP_be' : 'VP', tokens: range(start, k), head, linking: isLinking, passive: isPassive(tokens, start, k) });
      continue;
    }

    // 前置詞句: ADP + 次の名詞句（再帰的に簡易処理）
    if (p === 'ADP') {
      const start = k; k++;
      const sub = chunk(tokens.slice(k), options);
      if (sub.length && sub[0].type === 'NP') {
        const len = sub[0].tokens.length;
        chunks.push({ type: 'PP', tokens: range(start, k + len), head: start, inner: 'NP' });
        k += len; continue;
      }
      chunks.push({ type: 'PP', tokens: [start], head: start });
      continue;
    }

    // 不定詞 to + VERB (+ NP) → 名詞的用法として NP 扱い（レベル2以上）
    if (p === 'PART' && pos(k + 1) === 'VERB') {
      const start = k; k += 2;
      if (level >= 2) {
        const sub = chunk(tokens.slice(k), options);
        if (sub.length && sub[0].type === 'NP') k += sub[0].tokens.length;
        chunks.push({ type: 'NP', tokens: range(start, k), head: start + 1, infinitive: true });
      } else {
        chunks.push({ type: 'X', tokens: range(start, k), head: start });
      }
      continue;
    }

    if (p === 'REL') { chunks.push({ type: 'REL', tokens: [k], head: k }); k++; continue; }
    if (p === 'PART') { chunks.push({ type: 'ADVP', tokens: [k], head: k }); k++; continue; }
    if (p === 'ADV') { chunks.push({ type: 'ADVP', tokens: [k], head: k }); k++; continue; }
    if (p === 'SCONJ') { chunks.push({ type: 'SCONJ', tokens: [k], head: k }); k++; continue; }
    if (p === 'CCONJ') { chunks.push({ type: 'CCONJ', tokens: [k], head: k }); k++; continue; }
    chunks.push({ type: 'X', tokens: [k], head: k }); k++;
  }
  return chunks;
}

function isPassive(tokens, s, e) {
  const seg = tokens.slice(s, e);
  const hasBe = seg.some(t => t.lemma === 'be' && t.pos === 'AUX');
  const last = seg[seg.length - 1];
  return hasBe && last.pos === 'VERB' && (last.tags.includes('PastTense') || last.tags.includes('Participle') || /ed$/.test(last.text));
}

function range(a, b) { const r = []; for (let i = a; i < b; i++) r.push(i); return r; }
