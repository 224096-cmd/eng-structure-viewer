// pos.js — 品詞タグ付け（compromise.js のタグを UPOS 風の粗い品詞に変換）
// 依存: vendor/compromise.js（グローバル nlp）
// 出力: tokens = [{ i, text, pre, post, pos, posJa, lemma, tags, feats }]

const POS_JA = {
  NOUN: '名詞', PROPN: '固有名詞', PRON: '代名詞', VERB: '動詞', AUX: '助動詞',
  ADJ: '形容詞', ADV: '副詞', ADP: '前置詞', DET: '限定詞', CCONJ: '等位接続詞',
  SCONJ: '従属接続詞', NUM: '数詞', PART: '不変化詞（to / not / 句動詞の小辞）', REL: '関係詞',
  INTJ: '間投詞', PUNCT: '句読点', X: 'その他'
};

const SUBORDINATORS = new Set(['that', 'because', 'if', 'when', 'while', 'although', 'though', 'since', 'unless', 'until', 'after', 'before', 'whether', 'as']);
const COORDINATORS = new Set(['and', 'or', 'but', 'nor', 'so', 'yet']);
const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
const MODALS = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would', 'ought']);
const DO_FORMS = new Set(['do', 'does', 'did']);
const HAVE_FORMS = new Set(['have', 'has', 'had']);
const REL_WORDS = new Set(['who', 'which', 'whom', 'whose', 'that']);
const WH_PRON = new Set(['what', 'who', 'whom', 'which']);
const WH_ADV = new Set(['when', 'where', 'why', 'how']);
const TIME_WORDS = new Set(['yesterday', 'today', 'tomorrow', 'tonight', 'now', 'then']);
const LOCATIVE_ADVS = new Set(['home', 'abroad', 'here', 'there', 'downtown', 'upstairs', 'downstairs', 'outside', 'inside']);
const PLAIN_ADVS = new Set(['together', 'alone', 'well', 'soon', 'again', 'already', 'always', 'usually', 'often', 'sometimes', 'never', 'twice', 'once']);
const MANNER_ADVS = new Set(['early', 'late', 'hard', 'fast']); // 動詞の直後のみ副詞（be 動詞の後は形容詞）
const CAUSATIVE_FOR_POS = new Set(['let', 'make', 'help', 'see', 'hear', 'watch', 'feel', 'notice']);
const DEMONSTRATIVES = new Set(['this', 'that', 'these', 'those']);
const POSS_DETS = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);
const DETS = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'such', 'some', 'any', 'every', 'each', 'no', 'all', 'both', 'many', 'much', 'few', 'several']);
const PLACE_NOUNS = new Set(['place', 'town', 'city', 'house', 'country', 'village', 'room', 'school', 'park', 'station', 'shop', 'store', 'restaurant', 'hotel', 'office', 'island', 'area', 'spot', 'world']);
const INDIRECT_VERBS = new Set(['know', 'wonder', 'ask', 'tell', 'remember', 'forget', 'understand', 'see', 'explain', 'show', 'learn', 'find', 'decide', 'guess', 'imagine', 'say']);
const LANGUAGES = new Set(['english', 'japanese', 'french', 'chinese', 'spanish', 'german', 'korean', 'italian']);

function has(term, tag) { return term && (term.tags || []).includes(tag); }
function w(term) { return term ? (term.normal || term.text.toLowerCase()) : ''; }

// 否定・副詞を飛ばして次の語を見る
function nextContent(terms, k) {
  let j = k + 1;
  while (j < terms.length && (has(terms[j], 'Negative') || has(terms[j], 'Adverb'))) j++;
  return terms[j] || null;
}

function mapTag(terms, k) {
  const term = terms[k], prev = terms[k - 1] || null, next = terms[k + 1] || null;
  const tags = new Set(term.tags || []);
  const word = w(term);
  const atStart = k === 0;

  // --- 語彙で決まるもの ---
  if (word === 'to' && next && has(next, 'Verb')) return 'PART';
  if (tags.has('Negative') || word === 'not') return 'PART';
  if (tags.has('Particle') && has(prev, 'Verb')) return 'PART';
  if (TIME_WORDS.has(word)) return 'ADV';
  if (tags.has('Date') && !has(prev, 'Determiner') && !has(prev, 'Adjective') && !has(prev, 'Possessive')) return 'ADV';
  // 関係副詞・間接疑問の wh 語（文中）
  if (!atStart && WH_ADV.has(word)) {
    const pl = prev ? (prev.root || w(prev)) : '';
    if (prev && has(prev, 'Noun') && !has(prev, 'Pronoun') && ((word === 'where' && PLACE_NOUNS.has(pl)) || (word === 'when' && (has(prev, 'Date') || /^(day|time|year|moment|month|week|summer|winter|night|morning)$/.test(pl))) || (word === 'why' && pl === 'reason'))) return 'REL';
    // 間接疑問（know where …）なら副詞（wh 節の先頭）、それ以外の when/where は従属接続詞
    let v = k - 1; while (v >= 0 && !has(terms[v], 'Verb')) v--;
    const nearVerb = v >= 0 ? (terms[v].root || w(terms[v])) : '';
    if (prev && (has(prev, 'Verb') || has(prev, 'Pronoun')) && INDIRECT_VERBS.has(nearVerb) && k - v <= 2) return 'ADV';
    if (word !== 'how') return 'SCONJ';
    return 'ADV';
  }
  if (!atStart && WH_PRON.has(word) && word !== 'which' && prev && (has(prev, 'Verb') || has(prev, 'Pronoun'))) return 'PRON';
  // 文末の分詞構文: 名詞の直後の -ing を compromise が名詞と誤る（the window reading a magazine）
  if (/ing$/.test(word) && tags.has('Noun') && !tags.has('Verb') && prev && has(prev, 'Noun') && !has(prev, 'Determiner') && next && (has(next, 'Determiner') || has(next, 'Pronoun') || has(next, 'Possessive')) && nlp(word.replace(/ing$/, '')).has('#Verb')) return 'VERB';
  if (PLAIN_ADVS.has(word)) return 'ADV';
  if (MANNER_ADVS.has(word) && prev && has(prev, 'Verb') && !BE_FORMS.has(w(prev)) && !has(next, 'Noun')) return 'ADV';
  // 使役・知覚動詞＋代名詞＋原形（heard her sing）: compromise が名詞と誤る原形を動詞に戻す
  if (tags.has('Noun') && !tags.has('Pronoun') && prev && has(prev, 'Pronoun') && k >= 2 && CAUSATIVE_FOR_POS.has(terms[k - 2].root || w(terms[k - 2])) && nlp(word).has('#Infinitive')) return 'VERB';
  if (word === 'that' && prev && (has(prev, 'Verb') || has(prev, 'Adjective') || (has(prev, 'Pronoun') && k >= 2 && has(terms[k - 2], 'Verb'))) && next && (has(next, 'Determiner') || has(next, 'Pronoun') || has(next, 'Noun') || DETS.has(w(next)))) return 'SCONJ';
  if (DEMONSTRATIVES.has(word) && !(next && (has(next, 'Noun') || has(next, 'Adjective') || has(next, 'Value')))) return 'PRON';
  if (LOCATIVE_ADVS.has(word) && prev && !has(prev, 'Determiner') && !has(prev, 'Adjective') && !has(prev, 'Preposition')) return 'ADV';
  if (POSS_DETS.has(word) && (word !== 'her' || !has(prev, 'Verb') || has(next, 'Noun') || has(next, 'Adjective'))) return 'PRON'; // 所有格（her は目的格と曖昧）
  if (atStart && WH_PRON.has(word)) return 'PRON';
  if (atStart && WH_ADV.has(word)) {
    // 文頭の when/where/…: 直後が助動詞・be・do なら疑問文（副詞）、主語＋動詞が続くなら従属節（接続詞）
    const nw = w(next);
    if (next && (has(next, 'Verb') || MODALS.has(nw) || BE_FORMS.has(nw) || DO_FORMS.has(nw))) return 'ADV';
    return word === 'how' ? 'ADV' : 'SCONJ';
  }
  if (REL_WORDS.has(word) && prev && (has(prev, 'Noun') || has(prev, 'Pronoun')) && !has(prev, 'Verb')) return 'REL';
  if (word === 'there' && next && BE_FORMS.has(w(next))) return 'PRON'; // 存在文の there
  if (DETS.has(word) && !DEMONSTRATIVES.has(word) && !(word === 'all' && has(prev, 'Verb') && !has(next, 'Noun'))) return 'DET';
  if (LANGUAGES.has(word) && (atStart || has(prev, 'Verb') || has(prev, 'Preposition'))) return 'PROPN';

  // be / do / have: 後ろ（否定・副詞を飛ばして）に動詞が続けば助動詞、続かなければ本動詞
  if (BE_FORMS.has(word) || DO_FORMS.has(word) || HAVE_FORMS.has(word)) {
    const nc = nextContent(terms, k);
    const ncIsVerb = nc && has(nc, 'Verb') && !has(nc, 'Modal');
    // 疑問文: 文頭の Do/Is + 主語 + 動詞 も助動詞
    const afterWh = k === 1 && (WH_PRON.has(w(terms[0])) || WH_ADV.has(w(terms[0])));
    // 否定副詞などの文頭倒置（Never have I / Little did he / Not only did he）: 先行する語がすべて副詞・否定・little/only
    const afterNegAdv = k >= 1 && terms.slice(0, k).every(t => has(t, 'Adverb') || has(t, 'Negative') || /^(little|only|never|rarely|seldom|hardly|scarcely|nor|neither)$/.test(w(t)));
    const invertedAux = (atStart || afterWh || afterNegAdv) && nc && (has(nc, 'Pronoun') || has(nc, 'Noun') || has(nc, 'Determiner')) && terms.slice(k + 2).some(t => has(t, 'Verb'));
    if (ncIsVerb || (invertedAux && !BE_FORMS.has(word))) return 'AUX';
    return 'VERB';
  }
  if (tags.has('Modal') || MODALS.has(word)) return 'AUX';

  // --- compromise のタグで決まるもの ---
  if (tags.has('Value') || tags.has('Cardinal') || tags.has('Ordinal')) return 'NUM';
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
  if (tags.has('Noun')) return 'NOUN';
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
    for (let k = 0; k < terms.length; k++) {
      const t = terms[k];
      const pos = mapTag(terms, k);
      const tags = (t.tags || []).slice();
      const word = w(t);
      if (POSS_DETS.has(word) && pos === 'PRON' && !tags.includes('Possessive')) tags.push('Possessive');
      if ((pos === 'PRON' && WH_PRON.has(word)) || (pos === 'ADV' && WH_ADV.has(word))) { if (!tags.includes('QuestionWord')) tags.push('QuestionWord'); }
      tokens.push({
        i: i++, text: t.text, pre: t.pre || '', post: t.post || '',
        pos, posJa: POS_JA[pos] || pos, lemma: lemmaOf(t), tags
      });
    }
  }
  return tokens;
}

export { POS_JA };
