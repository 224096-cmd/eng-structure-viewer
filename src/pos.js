// pos.js — 品詞タグ付け（compromise.js のタグを UPOS 風の粗い品詞に変換）
// 依存: vendor/compromise.js（グローバル nlp）
// 出力: tokens = [{ i, text, display, pre, post, pos, posJa, lemma, tags, commaAfter, quoteOpen, ... }]
//   判定の優先順位: ①語彙で決まるもの → ②文脈で決まる機能語 → ③be/do/have → ④compromise のタグ
import { punctFeatures } from './text.js?v=0.6';

const POS_JA = {
  NOUN: '名詞', PROPN: '固有名詞', PRON: '代名詞', VERB: '動詞', AUX: '助動詞',
  ADJ: '形容詞', ADV: '副詞', ADP: '前置詞', DET: '限定詞', CCONJ: '等位接続詞',
  SCONJ: '従属接続詞', NUM: '数詞', PART: '不変化詞（to / not / 句動詞の小辞）', REL: '関係詞',
  INTJ: '間投詞', PUNCT: '句読点', X: 'その他'
};

const SUBORDINATORS = new Set(['that', 'because', 'if', 'when', 'while', 'although', 'though', 'since', 'unless', 'until', 'after', 'before', 'whether', 'as', 'once', 'whereas', 'wherever', 'whenever']);
const COORDINATORS = new Set(['and', 'or', 'but', 'nor', 'so', 'yet']);
const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
const MODALS = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would', 'ought']);
const DO_FORMS = new Set(['do', 'does', 'did']);
const HAVE_FORMS = new Set(['have', 'has', 'had']);
const REL_WORDS = new Set(['who', 'which', 'whom', 'whose', 'that']);
const WH_PRON = new Set(['what', 'who', 'whom', 'which']);
const WH_ADV = new Set(['when', 'where', 'why', 'how']);
const TIME_WORDS = new Set(['yesterday', 'today', 'tomorrow', 'tonight', 'now', 'then', 'later', 'ago']);
const LOCATIVE_ADVS = new Set(['home', 'abroad', 'here', 'there', 'downtown', 'upstairs', 'downstairs', 'outside', 'inside']);
const PLAIN_ADVS = new Set(['together', 'alone', 'aloud', 'well', 'soon', 'again', 'already', 'always', 'usually', 'often', 'sometimes', 'never', 'twice', 'once', 'still', 'even', 'also', 'just', 'only', 'almost', 'perhaps', 'maybe', 'however', 'therefore', 'instead', 'rather']);
const MANNER_ADVS = new Set(['early', 'late', 'hard', 'fast']);
const CAUSATIVE_FOR_POS = new Set(['let', 'make', 'help', 'see', 'hear', 'watch', 'feel', 'notice']);
const DEMONSTRATIVES = new Set(['this', 'that', 'these', 'those']);
const POSS_DETS = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);
const DETS = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'such', 'some', 'any', 'every', 'each', 'no', 'all', 'both', 'many', 'much', 'few', 'several', 'another', 'other', 'most', 'half', 'enough']);
const INDEF_PRONS = new Set(['another', 'others', 'everyone', 'everybody', 'everything', 'someone', 'somebody', 'something', 'anyone', 'anybody', 'anything', 'nobody', 'nothing', 'none', 'one', 'ones', 'both', 'each', 'all', 'most', 'some', 'many', 'few', 'several', 'half', 'this', 'that', 'these', 'those', 'mine', 'yours', 'hers', 'ours', 'theirs', 'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves']);
const INDIRECT_VERBS = new Set(['know', 'wonder', 'ask', 'tell', 'remember', 'forget', 'understand', 'see', 'explain', 'show', 'learn', 'find', 'decide', 'guess', 'imagine', 'say']);
const PLACE_NOUNS = new Set(['place', 'town', 'city', 'house', 'country', 'village', 'room', 'school', 'park', 'station', 'shop', 'store', 'restaurant', 'hotel', 'office', 'island', 'area', 'spot', 'world', 'university', 'street', 'building']);
const LANGUAGES = new Set(['english', 'japanese', 'french', 'chinese', 'spanish', 'german', 'korean', 'italian']);
const PREPS = new Set(['over', 'in', 'on', 'at', 'by', 'for', 'with', 'during', 'after', 'before', 'since', 'until', 'from', 'of', 'under', 'through', 'across', 'among', 'between', 'despite', 'without', 'within', 'into', 'along', 'around', 'about', 'near', 'beyond', 'against', 'toward', 'towards', 'throughout', 'behind', 'above', 'below', 'beside', 'besides', 'per', 'via', 'unlike', 'onto', 'upon']);
const NOUN_AFTER_PREP = new Set(['contrast', 'fact', 'addition', 'example', 'short', 'general', 'particular', 'turn', 'practice', 'theory', 'effect', 'part', 'order', 'response', 'spite', 'case', 'place', 'time', 'return', 'exchange', 'detail', 'advance', 'control', 'charge', 'need', 'use', 'demand', 'favor', 'favour', 'light', 'line', 'touch', 'balance', 'progress', 'process', 'question', 'doubt', 'danger', 'trouble', 'love', 'sight', 'mind', 'hand', 'work', 'school', 'home', 'bed', 'church', 'court', 'sea', 'war', 'peace', 'reach', 'risk', 'stock', 'print', 'sale', 'rest', 'shape', 'form', 'nature', 'name', 'point', 'view', 'terms', 'account', 'behalf', 'regard', 'respect', 'search', 'support', 'honor', 'honour', 'memory', 'pursuit']);
const REPORTING_VERBS = new Set(['say', 'write', 'ask', 'add', 'explain', 'reply', 'answer', 'tell', 'insist', 'argue', 'note', 'claim', 'admit', 'continue', 'shout', 'whisper']);

function has(term, tag) { return term && (term.tags || []).includes(tag); }
function w(term) { return term ? (term.implicit || term.normal || term.text.toLowerCase()).replace(/[^a-z'\-.]/g, '') : ''; }
function nextContent(terms, k) {
  let j = k + 1;
  while (j < terms.length && (has(terms[j], 'Negative') || has(terms[j], 'Adverb'))) j++;
  return terms[j] || null;
}
function isNounish(t) { return t && (has(t, 'Noun') || has(t, 'Pronoun') || has(t, 'Determiner') || has(t, 'Adjective') || has(t, 'Possessive') || has(t, 'Value')); }

function mapTag(terms, k, assigned) {
  const term = terms[k], prev = terms[k - 1] || null, next = terms[k + 1] || null;
  const prevPos = assigned[k - 1] || null;
  const prevNoun = prev && ((prevPos ? (prevPos === 'NOUN' || prevPos === 'PROPN') : has(prev, 'Noun')) && !has(prev, 'Pronoun'));
  const tags = new Set(term.tags || []);
  const word = w(term);
  const atStart = k === 0;
  const prevW = w(prev), nextW = w(next);

  // ① 語彙で決まるもの
  if (word === 'to' && next && has(next, 'Verb')) return 'PART';
  if (tags.has('Negative') || word === 'not') return 'PART';
  if (tags.has('Particle') && has(prev, 'Verb')) return 'PART';
  if (COORDINATORS.has(word) && word !== 'so') return 'CCONJ';
  if (word === 'so' && prev && (prev.post || '').includes(',')) return 'CCONJ';
  if (TIME_WORDS.has(word)) return 'ADV';
  if (PLAIN_ADVS.has(word)) return 'ADV';
  // 程度副詞（far less often / much easier / more quickly）
  if (/^(far|much|less|more|very|quite|rather|even|still|too|so)$/.test(word) && next && (has(next, 'Adverb') || has(next, 'Adjective') || has(next, 'Comparative')) && !has(next, 'Noun')) return 'ADV';
  // 限定詞・所有格の直後で動詞と誤られた名詞（their name / the experience）
  if (tags.has('Verb') && !tags.has('Gerund') && !tags.has('Auxiliary') && !tags.has('Copula') && !BE_FORMS.has(word) && !DO_FORMS.has(word) && !HAVE_FORMS.has(word) && !MODALS.has(word) && prev && (has(prev, 'Determiner') || has(prev, 'Possessive') || POSS_DETS.has(prevW)) && !INDEF_PRONS.has(prevW) && !DEMONSTRATIVES.has(prevW) && !/ing$/.test(word) && !(next && has(next, 'Determiner'))) return 'NOUN';
  // 形容詞の直後の -ing（busy doing something）
  if (/ing$/.test(word) && tags.has('Noun') && !tags.has('Verb') && prev && has(prev, 'Adjective') && next && (has(next, 'Determiner') || has(next, 'Pronoun') || has(next, 'Noun')) && nlp(word.replace(/ing$/, '')).has('#Verb')) return 'VERB';
  if (MANNER_ADVS.has(word) && prev && has(prev, 'Verb') && !BE_FORMS.has(prevW) && !has(next, 'Noun')) return 'ADV';
  if (tags.has('Date') && !has(prev, 'Determiner') && !has(prev, 'Adjective') && !has(prev, 'Possessive') && !has(prev, 'Value') && !has(prev, 'Noun')) return 'ADV';
  // 大文字始まりの前置詞（Over five years）や、動詞と誤られた前置詞
  if (/^(before|after|since|until)$/.test(word)) {
    // 前置詞か接続詞か: 直後の名詞句のあとに動詞が続けば接続詞（before the day has started）
    let j = k + 1, sawNoun = false;
    while (j < terms.length && j <= k + 6 && !has(terms[j], 'Verb')) { if (has(terms[j], 'Noun') || has(terms[j], 'Pronoun')) sawNoun = true; j++; }
    if (j < terms.length && j <= k + 6 && has(terms[j], 'Verb') && sawNoun && !has(terms[j], 'Gerund')) return 'SCONJ';
    return 'ADP';
  }
  if (PREPS.has(word) && !(tags.has('Verb') && has(prev, 'Pronoun') && !has(next, 'Determiner'))) return 'ADP';
  // 複合名詞の 2 語目を動詞と誤る（traffic jams that …）: 名詞の直後で、関係詞や前置詞が続けば名詞
  if (tags.has('Verb') && !tags.has('Noun') && !tags.has('Auxiliary') && !tags.has('Copula') && !BE_FORMS.has(word) && !DO_FORMS.has(word) && !HAVE_FORMS.has(word) && word.length >= 4 && prev && has(prev, 'Noun') && !has(prev, 'Pronoun') && !has(prev, 'Determiner') && !has(prev, 'Verb') && next && REL_WORDS.has(nextW) && /s$/.test(word)) return 'NOUN';
  // as: 名詞句が続けば前置詞、主語＋動詞が続けば接続詞
  if (word === 'as' && next && (has(next, 'Determiner') || has(next, 'Adjective') || has(next, 'Value') || (has(next, 'Noun') && !has(next, 'Pronoun')))) return 'ADP';
  // 前置詞の直後で動詞と誤られた名詞（by contrast / in contrast）
  if (prev && (has(prev, 'Preposition') || PREPS.has(prevW)) && tags.has('Verb') && !tags.has('Gerund') && (NOUN_AFTER_PREP.has(word) || nlp(word).has('#Noun'))) return 'NOUN';
  if (LOCATIVE_ADVS.has(word) && prev && !has(prev, 'Determiner') && !has(prev, 'Adjective') && !has(prev, 'Preposition')) return 'ADV';
  if (POSS_DETS.has(word) && (word !== 'her' || !has(prev, 'Verb') || has(next, 'Noun') || has(next, 'Adjective'))) return 'PRON';
  if (LANGUAGES.has(word) && (atStart || has(prev, 'Verb') || has(prev, 'Preposition'))) return 'PROPN';

  // ② 文脈で決まる機能語
  // 関係詞（名詞の直後の who/which/that/whose/whom）
  if (REL_WORDS.has(word) && prev && (prevNoun || has(prev, 'Noun') || (has(prev, 'Pronoun') && INDEF_PRONS.has(prevW))) && (prevPos ? prevPos !== 'VERB' : !has(prev, 'Verb')) && !(word === 'that' && isNounish(next) && !has(next, 'Verb') && has(prev, 'Pronoun'))) return 'REL';
  // 関係副詞（場所・時・理由の名詞の直後）
  if (!atStart && WH_ADV.has(word) && prevNoun) {
    const pl = prev.root || prevW;
    if ((word === 'where' && PLACE_NOUNS.has(pl)) || (word === 'when' && (has(prev, 'Date') || /^(day|time|year|moment|month|week|summer|winter|night|morning|age)$/.test(pl))) || (word === 'why' && pl === 'reason')) return 'REL';
  }
  // that: 動詞・形容詞・「動詞＋代名詞」の後で名詞句が続けば接続詞
  if (word === 'that' && prev && (has(prev, 'Verb') || has(prev, 'Adjective') || (has(prev, 'Pronoun') && k >= 2 && has(terms[k - 2], 'Verb'))) && next && (isNounish(next) || DETS.has(nextW) || INDEF_PRONS.has(nextW))) return 'SCONJ';
  // 文頭の wh
  if (atStart && WH_PRON.has(word)) return 'PRON';
  if (atStart && WH_ADV.has(word)) {
    if (next && (has(next, 'Verb') || MODALS.has(nextW) || BE_FORMS.has(nextW) || DO_FORMS.has(nextW))) return 'ADV';
    return word === 'how' ? 'ADV' : 'SCONJ';
  }
  // 文中の wh: 間接疑問（know where …）なら副詞/代名詞、それ以外の when/where は従属接続詞
  if (!atStart && (WH_ADV.has(word) || (WH_PRON.has(word) && word !== 'which'))) {
    let v = k - 1; while (v >= 0 && !has(terms[v], 'Verb')) v--;
    const nearVerb = v >= 0 ? (terms[v].root || w(terms[v])) : '';
    const indirect = prev && (has(prev, 'Verb') || has(prev, 'Pronoun') || has(prev, 'Preposition')) && INDIRECT_VERBS.has(nearVerb) && k - v <= 3;
    if (WH_PRON.has(word)) return indirect ? 'PRON' : (has(prev, 'Preposition') ? 'PRON' : 'PRON');
    if (indirect || word === 'how') return 'ADV';
    return 'SCONJ';
  }
  if (word === 'there' && next && BE_FORMS.has(nextW)) return 'PRON';
  // 指示詞・不定代名詞: 後ろに名詞が続かなければ代名詞
  if ((DEMONSTRATIVES.has(word) || (INDEF_PRONS.has(word) && !has(prev, 'Determiner'))) && !(next && (has(next, 'Noun') || has(next, 'Adjective') || has(next, 'Value')) && !has(next, 'Verb'))) {
    if (!(word === 'one' && has(prev, 'Determiner'))) return 'PRON';
  }
  if (DETS.has(word) && !DEMONSTRATIVES.has(word) && !(word === 'all' && has(prev, 'Verb') && !has(next, 'Noun'))) return 'DET';
  // 使役・知覚動詞＋代名詞＋原形（heard her sing）
  if (tags.has('Noun') && !tags.has('Pronoun') && prev && has(prev, 'Pronoun') && k >= 2 && CAUSATIVE_FOR_POS.has(terms[k - 2].root || w(terms[k - 2])) && nlp(word).has('#Infinitive')) return 'VERB';
  // 名詞の直後の -ing を compromise が名詞と誤る（the window reading a magazine）
  if (/ing$/.test(word) && tags.has('Noun') && !tags.has('Verb') && prev && has(prev, 'Noun') && !has(prev, 'Determiner') && next && (has(next, 'Determiner') || has(next, 'Pronoun') || has(next, 'Possessive')) && nlp(word.replace(/ing$/, '')).has('#Verb')) return 'VERB';
  // people who walk: 関係詞の直後の語を compromise が名詞と誤る
  if (tags.has('Noun') && !tags.has('Pronoun') && prev && REL_WORDS.has(prevW) && k >= 2 && has(terms[k - 2], 'Noun') && nlp(word).has('#Verb') && !has(next, 'Noun')) return 'VERB';

  // ③ be / do / have
  if (BE_FORMS.has(word) || DO_FORMS.has(word) || HAVE_FORMS.has(word)) {
    const nc = nextContent(terms, k);
    const ncIsVerb = nc && has(nc, 'Verb') && !has(nc, 'Modal');
    const afterWh = k === 1 && (WH_PRON.has(w(terms[0])) || WH_ADV.has(w(terms[0])));
    const afterNegAdv = k >= 1 && terms.slice(0, k).every(t => has(t, 'Adverb') || has(t, 'Negative') || /^(little|only|never|rarely|seldom|hardly|scarcely|nor|neither)$/.test(w(t)));
    const invertedAux = (atStart || afterWh || afterNegAdv) && nc && (has(nc, 'Pronoun') || has(nc, 'Noun') || has(nc, 'Determiner')) && terms.slice(k + 2).some(t => has(t, 'Verb'));
    if (ncIsVerb || (invertedAux && !BE_FORMS.has(word))) return 'AUX';
    return 'VERB';
  }
  if (tags.has('Modal') || MODALS.has(word)) return 'AUX';

  // ④ compromise のタグ
  if (tags.has('Value') || tags.has('Cardinal') || tags.has('Ordinal') || /^\d[\d,.]*$/.test(word)) return 'NUM';
  if (tags.has('Determiner')) return 'DET';
  if (tags.has('Pronoun')) return 'PRON';
  if (tags.has('Preposition')) return 'ADP';
  if (tags.has('Conjunction')) return COORDINATORS.has(word) ? 'CCONJ' : 'SCONJ';
  if (SUBORDINATORS.has(word)) return 'SCONJ';
  if (tags.has('Verb')) return 'VERB';
  if (tags.has('Adjective')) return 'ADJ';
  if (tags.has('Adverb')) return 'ADV';
  if (tags.has('Expression')) return 'INTJ';
  if (tags.has('ProperNoun')) return 'PROPN';
  if (tags.has('Noun') || tags.has('Abbreviation')) return 'NOUN';
  return 'X';
}

function lemmaOf(term) {
  const word = w(term);
  if (BE_FORMS.has(word)) return 'be';
  if (term.root) return term.root;
  return word;
}

export function tagSentence(text) {
  const doc = nlp(text);
  doc.compute('root');
  const sents = doc.json();
  const tokens = [];
  let i = 0;
  for (const s of sents) {
    const terms = s.terms;
    const assigned = [];
    for (let k = 0; k < terms.length; k++) {
      const t = terms[k];
      const pos = mapTag(terms, k, assigned);
      assigned.push(pos);
      const tags = (t.tags || []).slice();
      const word = w(t);
      if (POSS_DETS.has(word) && pos === 'PRON' && !tags.includes('Possessive')) tags.push('Possessive');
      if ((pos === 'PRON' && WH_PRON.has(word)) || (pos === 'ADV' && WH_ADV.has(word))) { if (!tags.includes('QuestionWord')) tags.push('QuestionWord'); }
      if (REPORTING_VERBS.has(t.root || word) && pos === 'VERB') tags.push('Reporting');
      let txt = t.text || '';
      let pre = t.pre || '', post = t.post || '';
      const mOpen = txt.match(/^([(\["]+)(.*)$/); if (mOpen) { pre += mOpen[1]; txt = mOpen[2]; }
      const mClose = txt.match(/^(.*?)([)\]"]+[,.;:!?]*)$/); if (mClose && mClose[1]) { txt = mClose[1]; post = mClose[2] + post; }
      const feats = punctFeatures(pre, post);
      // 短縮形: "didn't" は 2 トークン（did / not）。表示は 1 つ目にまとめ、2 つ目は非表示にする
      const display = txt;
      tokens.push({
        i: i++, text: txt || t.implicit || '', display, implicit: !t.text && !!t.implicit, pre, post,
        pos, posJa: POS_JA[pos] || pos, lemma: lemmaOf(t), tags, ...feats
      });
    }
  }
  // 短縮形の 2 つ目（空文字）の句読点情報を 1 つ目に寄せる
  for (let k = 0; k < tokens.length - 1; k++) {
    if (tokens[k + 1].implicit) { for (const f of ['commaAfter', 'colonAfter', 'semiAfter', 'dashAfter', 'quoteClose', 'parenClose', 'sentenceEnd']) tokens[k][f] = tokens[k][f] || tokens[k + 1][f]; }
  }
  return tokens;
}

export { POS_JA };
