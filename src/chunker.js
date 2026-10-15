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
    if (txt(k) === 'a' && /^(lot|number|couple|bit|kind|sort|great deal)$/.test(txt(k + 1)) && txt(k + 2) === 'of') {
      const sub = chunk(tokens.slice(k + 3), options);
      const len = sub.length && sub[0].type === 'NP' ? sub[0].tokens.length : 0;
      chunks.push({ type: 'NP', tokens: range(k, k + 3 + len), head: len ? k + 2 + len : k + 1 }); k += 3 + len; continue;
    }
    if (p === 'DET' || p === 'ADJ' || p === 'NOUN' || p === 'PROPN' || p === 'PRON' || p === 'NUM' || moreThan) {
      start = k;
      if (moreThan) k += 2;
      const NAMING = new Set(['call', 'name', 'elect', 'appoint', 'consider', 'make', 'choose', 'declare', 'crown', 'nominate']);
      const herAfterNaming = txt(k) === 'her' && k > 0 && pos(k - 1) === 'VERB' && NAMING.has(lem(k - 1)) && pos(k + 1) === 'NOUN' && (k + 2 >= n || pos(k + 2) !== 'NOUN');
      const possWithNoun = (p === 'PRON' || p === 'NOUN' || p === 'PROPN') && tokens[k].tags.includes('Possessive') && ['ADJ', 'NOUN', 'PROPN', 'NUM'].includes(pos(k + 1)) && !herAfterNaming;
      if (p === 'PRON' && !possWithNoun) {
        chunks.push({ type: 'NP', tokens: [k], head: k, pronoun: true, wh: tokens[k].tags.includes('QuestionWord'), existential: txt(k) === 'there', it: txt(k) === 'it' });
        k++; continue;
      }
      if ((p === 'DET' || possWithNoun) && !brk(k)) { k++; while (ext2(k) && (pos(k) === 'DET' || (pos(k) === 'PRON' && /^(few|many|little|several|lot|couple)$/.test(txt(k))))) k++; while (ext2(k) && pos(k) === 'ADV' && /^(more|less|fewer)$/.test(txt(k)) && (pos(k + 1) === 'NOUN' || pos(k + 1) === 'ADJ')) k++; }
      else if (p === 'DET' || possWithNoun) { chunks.push({ type: 'NP', tokens: [k], head: k }); k++; continue; }
      while (ext2(k) && (pos(k) === 'ADJ' || pos(k) === 'NUM' || (pos(k) === 'ADV' && pos(k + 1) === 'ADJ') || (pos(k) === 'CCONJ' && pos(k - 1) === 'ADJ' && pos(k + 1) === 'ADJ'))) k++;
      if (level >= 2) while (ext(k) && pos(k) === 'VERB' && (pos(k + 1) === 'NOUN' || pos(k + 1) === 'PROPN') && /(ing|ed)$/.test(tokens[k].text)) k++;
      let head = -1;
      const startedWithDet = pos(start) === 'DET';
      while (ext2(k) && (pos(k) === 'NOUN' || pos(k) === 'PROPN')) {
        if (startedWithDet && head !== -1 && pos(head) === 'NOUN' && pos(k) === 'PROPN') break; // the baby Emma → 2 つの NP
        if (startedWithDet && head !== -1 && pos(head) === 'NOUN' && tokens[head].tags.includes('Plural') && pos(k) === 'NOUN' && !tokens[k].tags.includes('Plural') && k === n - 1) break; // the children music → 2 つの NP（文末）
        head = k; k++;
      }
      if (head === -1) {
        if (k > start && tokens.slice(start, k).some(t => t.pos === 'ADJ')) {
          chunks.push({ type: 'ADJP', tokens: range(start, k), head: k - 1, theComparative: pos(start) === 'DET' && txt(start) === 'the' && /(er|more|less|worse)$/.test(txt(k - 1)) });
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
      const afterBareADP = start > 0 && pos(start - 1) === 'ADP';
      const prevCommaTok = start > 0 && !!tokens[start - 1].commaAfter;
      const pcEndsParticle = pc && pc.type === 'VP' && tokens[pc.tokens[pc.tokens.length - 1]].pos === 'PART';
      if (level >= 2 && isIng && !pcEndsParticle && (prevType() === 'VP' || prevType() === null || prevType() === 'ADJP' || afterBareADP || ((prevType() === 'PP' || prevType() === 'ADVP') && noVPYet && (prevCommaTok || (prevType() === 'ADVP' && pc.tokens.length === 1))) || (pc && pc.auxOnly)) && !(pc && pc.type === 'VP' && !pc.auxOnly && prevCommaTok)) {
        const sub = chunk(tokens.slice(k), options);
        if (sub.length && sub[0].type === 'NP') { k += sub[0].tokens.length; if (k < n && pos(k) === 'VERB' && !/(ing|ed|s)$/.test(tokens[k].text) && (k + 1 >= n || pos(k + 1) !== 'VERB')) k++; }
        else if (sub.length && sub[0].type === 'ADJP' && sub[0].tokens.length === 1 && (k + 1 >= n || brk(k) || pos(k + 1) === 'ADP')) k += 1; // starting small
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
        linking: !phrasal && LINKING_VERBS.has(headTok.lemma), passive: isPassive(tokens, start, k), participle: bare && !auxOnly && (headTok.tags.includes('PastTense') || headTok.tags.includes('Participle') || /ing$/.test(headTok.text)) && start === 0,
        auxOnly, bare: bare && !auxOnly, existential: isBe && prevType() === 'NP' && chunks[chunks.length - 1].existential
      });
      continue;
    }

    // ---- 前置詞句 ----
    if (p === 'ADP') {
      start = k; k++;
      if ((txt(start) === 'due' || txt(start) === 'such') && pos(k) === 'PART') k++; // due to / such as
      const sub = brk(start) ? [] : chunk(tokens.slice(k), options);
      if (sub.length && (sub[0].type === 'NP' || (level >= 2 && sub[0].gerund))) {
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
        let j = 0;
        // to be a pilot / to make this dish のように後続の NP / ADJP / PP を 1 つ吸収
        if (k < n && pos(k) === 'PART' && tokens[k].tags.includes('Particle') === false && /^(off|on|up|down|out|away|back|over|aside)$/.test(txt(k))) k++;
        else if (k < n && pos(k) === 'PART' && tokens[k].tags.includes('Particle')) k++;
        const sub2 = chunk(tokens.slice(k), options);
        if (!brk(k - 1) && sub2.length && ['NP', 'ADJP'].includes(sub2[0].type)) { k += sub2[0].tokens.length; j = 1; }
        chunks.push({ type: 'NP', tokens: range(start, k), head: start + 1, infinitive: true, afterNP: prevType() === 'NP' });
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
    const n3 = chunks[i + 3], n4 = chunks[i + 4];
    let look = i + 3; while (look < chunks.length && look < i + 6 && ['ADVP', 'ADJP', 'PP'].includes(chunks[look].type)) look++;
    const startsClause = vpBefore && chunks[look] && (chunks[look].type === 'VP' || chunks[look].type === 'VP_be');
    // コンマ列挙: NP, NP, and NP（最後の NP のあとに動詞句が続かない＝節の始まりではない）
    if (c.type === 'NP' && c.commaAfter && chunks[i + 1] && chunks[i + 1].type === 'NP' && !c.clause) {
      let j = i + 1; const members = [c];
      while (j < chunks.length && chunks[j].type === 'NP' && chunks[j].commaAfter) { members.push(chunks[j]); j++; }
      if (j < chunks.length && chunks[j].type === 'CCONJ' && chunks[j + 1] && chunks[j + 1].type === 'NP') {
        const after = chunks[j + 2];
        let look = j + 2; while (look < chunks.length && ['PP', 'ADVP', 'ADJP'].includes(chunks[look].type)) look++;
        const clauseStarts = chunks[look] && (chunks[look].type === 'VP' || chunks[look].type === 'VP_be') && !vpBefore;
        if (!clauseStarts || vpBefore) {
          members.push(chunks[j], chunks[j + 1]);
          const last = chunks[j + 1];
          out.push({ ...last, type: 'NP', tokens: members.flatMap(m => m.tokens), head: last.head, coordinated: true, pronoun: false, commaAfter: last.commaAfter });
          i = j + 1; continue;
        }
      }
    }
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
