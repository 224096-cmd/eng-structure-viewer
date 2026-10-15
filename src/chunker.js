// chunker.js — 品詞列をチャンク（句）にまとめる
// 出力: chunks = [{ type, tokens:[idx...], head, ...特徴 }]
//   type: NP / VP / VP_be / ADJP / PP / ADVP / REL / SCONJ / CCONJ / X
//   特徴: linking(連結動詞) passive(受動) auxOnly(助動詞のみ) infinitive(不定詞句) gerund(動名詞句)
//         existential(There is の be) wh(疑問詞) bare(助動詞なしの分詞・原形)
// レベル依存の処理は options.level で切り替える

const TIME_NOUNS = new Set(['morning', 'afternoon', 'evening', 'night', 'day', 'week', 'month', 'year', 'time', 'weekend', 'summer', 'winter', 'spring', 'autumn', 'fall', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const TIME_DETS = new Set(['every', 'last', 'next', 'this', 'each', 'all']);
const LINKING_VERBS = new Set(['be', 'become', 'seem', 'look', 'feel', 'sound', 'taste', 'smell', 'get', 'remain', 'stay', 'turn', 'appear', 'grow', 'keep']);
// 他動詞として扱う句動詞（動詞＋小辞/前置詞）
const PHRASAL = new Set(['look after', 'look for', 'take off', 'put on', 'turn on', 'turn off', 'pick up', 'give up', 'take care of', 'look up', 'put off', 'get on', 'get off', 'wake up', 'bring up', 'set up']);

export function chunk(tokens, options = { level: 1 }) {
  const level = options.level || 1;
  const chunks = [];
  let k = 0;
  const n = tokens.length;
  const pos = i => (i < n ? tokens[i].pos : null);
  const lem = i => (i < n ? tokens[i].lemma : '');
  const txt = i => (i < n ? tokens[i].text.toLowerCase() : '');
  const prevType = () => (chunks.length ? chunks[chunks.length - 1].type : null);
  const prevChunk = () => (chunks.length ? chunks[chunks.length - 1] : null);
  // 記号による区切り: コンマ・コロン・セミコロン・ダッシュ・閉じ引用符・閉じ括弧の直後では句を伸ばさない
  const brk = i => i >= 0 && i < n && !!(tokens[i].commaAfter || tokens[i].colonAfter || tokens[i].semiAfter || tokens[i].dashAfter || tokens[i].quoteClose || tokens[i].parenClose);
  const ext = i => i < n && !brk(i - 1); // i 番目へ伸ばしてよいか
  let start = 0;
  const ext2 = i => i < n && (i === start || !brk(i - 1));

  let guardLast = -1;
  while (k < n) {
    if (k === guardLast) { chunks.push({ type: 'X', tokens: [k], head: k }); k++; continue; } // 進まない場合の安全弁
    guardLast = k;
    const p = pos(k);

    // ---- 名詞句 ----
    const moreThan = p === 'ADV' && /^(more|less|fewer)$/.test(txt(k)) && txt(k + 1) === 'than' && (pos(k + 2) === 'NUM' || pos(k + 2) === 'NOUN' || pos(k + 2) === 'DET');
    if (p === 'DET' || p === 'ADJ' || p === 'NOUN' || p === 'PROPN' || p === 'PRON' || p === 'NUM' || moreThan) {
      start = k;
      if (moreThan) k += 2;
      const possWithNoun = p === 'PRON' && tokens[k].tags.includes('Possessive') && ['ADJ', 'NOUN', 'PROPN', 'NUM'].includes(pos(k + 1));
      if (p === 'PRON' && !possWithNoun) {
        chunks.push({ type: 'NP', tokens: [k], head: k, pronoun: true, wh: tokens[k].tags.includes('QuestionWord'), existential: txt(k) === 'there', it: txt(k) === 'it' });
        k++; continue;
      }
      if ((p === 'DET' || possWithNoun) && !brk(k)) { k++; while (ext2(k) && pos(k) === 'DET') k++; }
      else if (p === 'DET' || possWithNoun) { chunks.push({ type: 'NP', tokens: [k], head: k }); k++; continue; }
      while (ext2(k) && (pos(k) === 'ADJ' || pos(k) === 'NUM' || (pos(k) === 'ADV' && pos(k + 1) === 'ADJ') || (pos(k) === 'CCONJ' && pos(k - 1) === 'ADJ' && pos(k + 1) === 'ADJ'))) k++;
      if (level >= 2) while (ext(k) && pos(k) === 'VERB' && (pos(k + 1) === 'NOUN' || pos(k + 1) === 'PROPN') && /(ing|ed)$/.test(tokens[k].text)) k++;
      let head = -1;
      const startedWithDet = pos(start) === 'DET';
      while (ext2(k) && (pos(k) === 'NOUN' || pos(k) === 'PROPN')) {
        if (startedWithDet && head !== -1 && pos(head) === 'NOUN' && pos(k) === 'PROPN') break; // the baby Emma → 2 つの NP
        head = k; k++;
      }
      if (head === -1) {
        if (k > start && tokens.slice(start, k).some(t => t.pos === 'ADJ')) {
          chunks.push({ type: 'ADJP', tokens: range(start, k), head: k - 1, theComparative: pos(start) === 'DET' && txt(start) === 'the' && /er$/.test(txt(k - 1)) });
        } else {
          chunks.push({ type: 'X', tokens: range(start, Math.max(k, start + 1)), head: start });
          if (k === start) k++;
        }
        continue;
      }
      const first = txt(start);
      const isTime = TIME_NOUNS.has(tokens[head].lemma) && TIME_DETS.has(first);
      chunks.push({ type: isTime ? 'ADVP' : 'NP', tokens: range(start, k), head });
      continue;
    }

    // ---- 動詞句 ----
    if (p === 'AUX' || p === 'VERB') {
      start = k;
      const bare = p === 'VERB';
      while (ext2(k) && pos(k) === 'AUX') k++;
      while (ext2(k) && (pos(k) === 'ADV' || (pos(k) === 'PART' && tokens[k].tags.includes('Negative'))) && (pos(k + 1) === 'VERB' || pos(k + 1) === 'AUX')) k++;
      while (ext2(k) && pos(k) === 'AUX') k++;
      let head = -1, auxOnly = false;
      // 法助動詞・do の直後の -ing は動名詞（should walking → should | walking）なので動詞句に含めない
      const lastAux = k > start ? tokens[k - 1] : null;
      const modalBeforeIng = lastAux && lastAux.pos === 'AUX' && lastAux.lemma !== 'be' && lastAux.lemma !== 'have' && k < n && pos(k) === 'VERB' && /ing$/.test(tokens[k].text);
      if (k < n && pos(k) === 'VERB' && (k === start || ext(k)) && !modalBeforeIng) { head = k; k++; }
      else { head = k - 1; auxOnly = true; }
      const headTok = tokens[head];
      // 動名詞句（レベル2）: 助動詞なしの -ing が VP の直後（enjoy playing）または文頭（Swimming is）
      const isIng = /ing$/.test(headTok.text) && headTok.pos === 'VERB' && bare;
      const pc = prevChunk();
      const noVPYet = !chunks.some(c => c.type === 'VP' || c.type === 'VP_be');
      if (level >= 2 && isIng && (prevType() === 'VP' || prevType() === null || prevType() === 'ADJP' || ((prevType() === 'PP' || prevType() === 'ADVP') && noVPYet && pc.commaAfter) || (pc && pc.auxOnly)) && !(pc && pc.type === 'VP' && !pc.auxOnly && pc.commaAfter)) {
        const sub = chunk(tokens.slice(k), options);
        if (sub.length && sub[0].type === 'NP') k += sub[0].tokens.length;
        chunks.push({ type: 'NP', tokens: range(start, k), head, gerund: true });
        continue;
      }
      // 句動詞: 小辞 / 前置詞を吸収
      let phrasal = false;
      if (ext(k) && (pos(k) === 'PART' && tokens[k].tags.includes('Particle'))) { k++; phrasal = true; }
      else if (ext(k) && (pos(k) === 'ADP' || pos(k) === 'PART')) {
        const two = headTok.lemma + ' ' + txt(k), three = two + ' ' + txt(k + 1);
        if (PHRASAL.has(three)) { k += 2; phrasal = true; }
        else if (PHRASAL.has(two)) { k += 1; phrasal = true; }
      }
      const isBe = headTok.lemma === 'be' && !auxOnly;
      chunks.push({
        type: isBe ? 'VP_be' : 'VP', tokens: range(start, k), head,
        linking: !phrasal && LINKING_VERBS.has(headTok.lemma), passive: isPassive(tokens, start, k),
        auxOnly, bare: bare && !auxOnly, existential: isBe && prevType() === 'NP' && chunks[chunks.length - 1].existential
      });
      continue;
    }

    // ---- 前置詞句 ----
    if (p === 'ADP') {
      start = k; k++;
      const sub = brk(start) ? [] : chunk(tokens.slice(k), options);
      if (sub.length && sub[0].type === 'NP') {
        const len = sub[0].tokens.length;
        chunks.push({ type: 'PP', tokens: range(start, k + len), head: start, inner: 'NP' });
        k += len; continue;
      }
      chunks.push({ type: 'PP', tokens: [start], head: start });
      continue;
    }

    // ---- 不定詞 to + VERB (+ NP) → 名詞的用法として NP（レベル2以上） ----
    if (p === 'PART' && pos(k + 1) === 'VERB' && !brk(k)) {
      start = k; k += 2;
      if (level >= 2) {
        const sub = chunk(tokens.slice(k), options);
        let j = 0;
        // to be a pilot / to make this dish のように後続の NP / ADJP / PP を 1 つ吸収
        if (!brk(k - 1) && sub.length && ['NP', 'ADJP'].includes(sub[0].type)) { k += sub[0].tokens.length; j = 1; }
        chunks.push({ type: 'NP', tokens: range(start, k), head: start + 1, infinitive: true });
      } else {
        chunks.push({ type: 'X', tokens: range(start, k), head: start });
      }
      continue;
    }

    if (p === 'REL') { chunks.push({ type: 'REL', tokens: [k], head: k }); k++; continue; }
    if (p === 'PART') { chunks.push({ type: 'ADVP', tokens: [k], head: k }); k++; continue; }
    if (p === 'ADV') { chunks.push({ type: 'ADVP', tokens: [k], head: k, wh: tokens[k].tags.includes('QuestionWord') }); k++; continue; }
    if (p === 'SCONJ') { chunks.push({ type: 'SCONJ', tokens: [k], head: k }); k++; continue; }
    if (p === 'CCONJ') { chunks.push({ type: 'CCONJ', tokens: [k], head: k }); k++; continue; }
    if (p === 'INTJ') { chunks.push({ type: 'ADVP', tokens: [k], head: k }); k++; continue; }
    chunks.push({ type: 'X', tokens: [k], head: k }); k++;
  }

  // 句読点の特徴をチャンクに写す
  chunks.forEach(c => {
    const first = tokens[c.tokens[0]], last = tokens[c.tokens[c.tokens.length - 1]];
    c.commaAfter = !!last.commaAfter; c.colonAfter = !!last.colonAfter; c.dashAfter = !!last.dashAfter; c.quoteClose = !!last.quoteClose; c.parenClose = !!last.parenClose;
    c.quoteOpen = !!first.quoteOpen; c.parenOpen = !!first.parenOpen; c.dashBefore = c.tokens[0] > 0 && !!tokens[c.tokens[0] - 1].dashAfter;
  });
  // 等位接続の名詞句をまとめる: NP CCONJ NP → NP（レベル1）
  return mergeCoordinatedNP(chunks, tokens);
}

function mergeCoordinatedNP(chunks, tokens) {
  chunks.forEach((c, i) => { if (c.type === 'VP' && c.linking && chunks[i + 1] && chunks[i + 1].gerund) c.linking = false; }); // kept walking
  const out = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const vpBefore = out.some(x => x.type === 'VP' || x.type === 'VP_be');
    const startsClause = chunks[i + 3] && (chunks[i + 3].type === 'VP' || chunks[i + 3].type === 'VP_be') && vpBefore;
    if (c.type === 'NP' && chunks[i + 1] && chunks[i + 1].type === 'CCONJ' && chunks[i + 2] && chunks[i + 2].type === 'NP' && !startsClause && !c.commaAfter) {
      const merged = { ...chunks[i + 2], type: 'NP', tokens: [...c.tokens, ...chunks[i + 1].tokens, ...chunks[i + 2].tokens], head: chunks[i + 2].head, coordinated: true, pronoun: false };
      out.push(merged); i += 2;
      continue;
    }
    out.push(c);
  }
  return out;
}

function isPassive(tokens, s, e) {
  const seg = tokens.slice(s, e);
  const hasBe = seg.some(t => t.lemma === 'be' && t.pos === 'AUX');
  const last = seg.filter(t => t.pos === 'VERB').pop();
  return !!(hasBe && last && (last.tags.includes('PastTense') || last.tags.includes('Participle') || /(ed|en)$/.test(last.text)));
}

function range(a, b) { const r = []; for (let i = a; i < b; i++) r.push(i); return r; }
