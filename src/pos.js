// pos.js — 品詞タグ付け（compromise.js のタグを UPOS 風の粗い品詞に変換）
// 依存: vendor/compromise.js（グローバル nlp）
// 出力: tokens = [{ i, text, post, pos, posJa, lemma, tags }]

const POS_JA = {
  NOUN: '名詞', PROPN: '固有名詞', PRON: '代名詞', VERB: '動詞', AUX: '助動詞',
  ADJ: '形容詞', ADV: '副詞', ADP: '前置詞', DET: '限定詞', CCONJ: '等位接続詞',
  SCONJ: '従属接続詞', NUM: '数詞', PART: '不変化詞', INTJ: '間投詞', PUNCT: '句読点', X: 'その他'
};

const SUBORDINATORS = new Set(['that', 'because', 'if', 'when', 'while', 'although', 'though', 'since', 'unless', 'until', 'after', 'before', 'whether', 'as']);
const COORDINATORS = new Set(['and', 'or', 'but', 'nor', 'so', 'yet']);
const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
const MODALS = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would', 'ought']);
const DO_FORMS = new Set(['do', 'does', 'did']);
const HAVE_FORMS = new Set(['have', 'has', 'had']);
const REL_WORDS = new Set(['who', 'which', 'whom', 'whose', 'that']);
const TIME_WORDS = new Set(['yesterday', 'today', 'tomorrow', 'tonight', 'now', 'then']);
const LOCATIVE_ADVS = new Set(['home', 'abroad', 'here', 'there', 'downtown', 'upstairs', 'downstairs', 'outside', 'inside']);

function mapTag(term, prevTerm, nextTerm) {
  const tags = new Set(term.tags || []);
  const w = term.normal || term.text.toLowerCase();
  const nextTags = new Set((nextTerm && nextTerm.tags) || []);
  const prevTags = new Set((prevTerm && prevTerm.tags) || []);
  if (w === 'to' && nextTerm && nextTags.has('Verb')) return 'PART';
  if (tags.has('Negative')) return 'PART';
  if (tags.has('Particle') && prevTags.has('Verb')) return 'PART';
  if (tags.has('Date') || TIME_WORDS.has(w)) return 'ADV';
  if (LOCATIVE_ADVS.has(w) && prevTerm && !prevTags.has('Determiner') && !prevTags.has('Adjective') && !prevTags.has('Preposition')) return 'ADV';
  if (REL_WORDS.has(w) && prevTerm && (prevTags.has('Noun') || prevTags.has('Pronoun')) && !prevTags.has('Verb')) return 'REL';
  if (tags.has('Value') || tags.has('Cardinal') || tags.has('Ordinal')) return 'NUM';
  if (tags.has('Determiner')) return 'DET';
  if (tags.has('Pronoun')) return 'PRON';
  if (tags.has('Preposition')) {
    // "to" + 動詞 → 不定詞マーカー（PART）
    if (w === 'to' && nextTerm && (nextTerm.tags || []).includes('Verb')) return 'PART';
    return 'ADP';
  }
  if (tags.has('Conjunction')) {
    if (COORDINATORS.has(w)) return 'CCONJ';
    return 'SCONJ';
  }
  if (SUBORDINATORS.has(w) && !tags.has('Determiner') && !tags.has('Pronoun')) {
    if (w === 'that' && (!nextTerm || !(nextTerm.tags || []).some(t => ['Noun','Pronoun','Determiner','Adjective'].includes(t)))) {
      // 文末や "that is" 等は代名詞扱い
      return 'PRON';
    }
    return 'SCONJ';
  }
  if (tags.has('Verb')) {
    if (tags.has('Modal') || MODALS.has(w)) return 'AUX';
    if (tags.has('Auxiliary') || tags.has('Copula')) {
      // be/do/have が本動詞かどうか：直後に動詞（分詞）が続くなら助動詞、続かなければ本動詞
      const nextIsVerb = nextTerm && (nextTags.has('Verb') || nextTags.has('Negative') || nextTags.has('Adverb'));
      if ((BE_FORMS.has(w) || DO_FORMS.has(w) || HAVE_FORMS.has(w)) && !nextIsVerb) return 'VERB';
      return 'AUX';
    }
    return 'VERB';
  }
  if (tags.has('Adjective')) return 'ADJ';
  if (tags.has('Adverb')) return 'ADV';
  if (tags.has('Expression')) return 'INTJ';
  if (tags.has('ProperNoun')) return 'PROPN';
  if (tags.has('Noun')) return 'NOUN';
  return 'X';
}

function lemmaOf(term, pos) {
  const w = term.normal || term.text.toLowerCase();
  if (BE_FORMS.has(w)) return 'be';
  if (term.root) return term.root;
  return w;
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
      const pos = mapTag(t, terms[k - 1], terms[k + 1]);
      tokens.push({
        i: i++, text: t.text, pre: t.pre || '', post: t.post || '',
        pos, posJa: POS_JA[pos] || pos, lemma: lemmaOf(t, pos), tags: t.tags || []
      });
    }
  }
  return tokens;
}

export { POS_JA };
