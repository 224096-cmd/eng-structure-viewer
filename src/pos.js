// pos.js — 品詞タグ付け（compromise.js のタグを UPOS 風の粗い品詞に変換）
// 依存: vendor/compromise.js（グローバル nlp）
// 出力: tokens = [{ i, text, display, pre, post, pos, posJa, lemma, tags, commaAfter, quoteOpen, ... }]
//   判定の優先順位: ①語彙で決まるもの → ②文脈で決まる機能語 → ③be/do/have → ④compromise のタグ
import { punctFeatures } from './text.js?v=0.9';

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
const MANNER_ADVS = new Set(['early', 'late', 'hard', 'fast', 'loudly']);
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

// -ing 形の語幹が動詞か（making → make, running → run, reading → read）
function isNounWord(base) { return nlp(base).has('#Noun') || nlp('the ' + base).has('#Noun'); }
function isVerbStem(word) {
  const base = word.replace(/ing$/, '');
  return nlp(base).has('#Verb') || nlp(base + 'e').has('#Verb') || (/(.)\1$/.test(base) && nlp(base.slice(0, -1)).has('#Verb')) || nlp(word).has('#Gerund');
}
function has(term, tag) { return term && (term.tags || []).includes(tag); }
function w(term) { return term ? (term.implicit || term.normal || term.text.toLowerCase()).replace(/[^a-z'\-.]/g, '') : ''; }
function nextContent(terms, k) {
  let j = k + 1;
  while (j < terms.length && (has(terms[j], 'Negative') || has(terms[j], 'Adverb'))) j++;
  return terms[j] || null;
}
function isNounish(t) { return t && (has(t, 'Noun') || has(t, 'Pronoun') || has(t, 'Determiner') || has(t, 'Adjective') || has(t, 'Possessive') || has(t, 'Value')); }

function mapTag(terms, k, assigned, ctx = {}) {
  const term = terms[k], prev = terms[k - 1] || null, next = terms[k + 1] || null;
  const prevPos = assigned[k - 1] || null;
  const prevNoun = prev && ((prevPos ? (prevPos === 'NOUN' || prevPos === 'PROPN') : has(prev, 'Noun')) && !has(prev, 'Pronoun'));
  const tags = new Set(term.tags || []);
  const word = w(term);
  const atStart = k === 0;
  const prevW = w(prev), nextW = w(next);

  // the 比較級: 文頭または節頭の the + 比較級 → 形容詞
  if (prevW === 'the' && (tags.has('Comparative') || /^(more|less|better|worse|sooner|earlier|later|harder|faster|longer|higher|lower|bigger|smaller|older|younger|wiser|richer|poorer)$/.test(word)) && next && (has(next, 'Pronoun') || has(next, 'Noun') || has(next, 'Determiner'))) return 'ADJ';
  if (ctx.titleCase && (tags.has('Verb') || /ing$/.test(word)) && !tags.has('Auxiliary') && !tags.has('Copula') && !MODALS.has(word) && !BE_FORMS.has(word)) return tags.has('Gerund') || /ing$/.test(word) ? 'NOUN' : (isNounWord(word) ? 'NOUN' : 'VERB');
  if (ctx.titleCase && tags.has('ProperNoun') && !tags.has('Person') && !tags.has('Place') && isNounWord(word)) return 'NOUN';
  // ハイフン語（hyper-connected, non-stop, face-to-face, well-being）: 後ろに名詞が続けば形容詞、続かなければ名詞
  if (tags.has('Hyphenated')) {
    let e = k; while (e + 1 < terms.length && has(terms[e + 1], 'Hyphenated') && (terms[e].post || '').includes('-')) e++;
    const last = terms[e];
    const after = terms[e + 1];
    if (k < e) return 'ADJ';                       // 連結の途中
    if (after && (has(after, 'Noun') || has(after, 'Adjective')) && !has(after, 'Pronoun')) return 'ADJ';
    if (/ing$/.test(w(last)) || tags.has('Noun')) return 'NOUN';
    return has(prev, 'Determiner') || has(prev, 'Adjective') || has(prev, 'Possessive') ? 'NOUN' : 'ADJ';
  }
  // 所有格の名詞（today's, one's, Tom's）→ 限定詞扱い
  if (/'s$/.test(term.text || '') && (tags.has('Possessive') || tags.has('Noun') || tags.has('Date')) && next && (has(next, 'Noun') || has(next, 'Adjective') || has(next, 'Hyphenated'))) return 'DET';
  if (word === 'example' && prevW === 'for') return 'NOUN';
  // 'due to' → 前置詞、'such as' → 前置詞
  if (word === 'due' && nextW === 'to') return 'ADP';
  if (word === 'to' && prevW === 'due') return 'PART';
  if (word === 'such' && nextW === 'as') return 'ADP';
  if (word === 'as' && prevW === 'such') return 'PART';
  // 文頭の名詞＋三単現（Research shows that …）: 1 語目が命令形と誤られ 2 語目が複数名詞と誤られる
  if (atStart && tags.has('Verb') && !tags.has('Noun') && next && has(next, 'Noun') && /s$/.test(nextW) && !has(next, 'Determiner') && isNounWord(word) && nlp(nextW.replace(/s$/, '')).has('#Verb') && (terms[k + 2] ? (SUBORDINATORS.has(w(terms[k + 2])) || has(terms[k + 2], 'Determiner') || has(terms[k + 2], 'Pronoun') || has(terms[k + 2], 'Noun') || has(terms[k + 2], 'Adjective') || has(terms[k + 2], 'Gerund')) : true)) return 'NOUN';
  if (k === 1 && prevPos === 'NOUN' && has(prev, 'Verb') && tags.has('Noun') && !tags.has('Verb') && /s$/.test(word) && nlp(word.replace(/s$/, '')).has('#Verb')) return 'VERB';
  // 'set aside' など 名詞＋小辞 で名詞と誤られた動詞（others set aside）
  if (tags.has('Noun') && !tags.has('Verb') && !tags.has('Plural') && next && (has(next, 'Adverb') || has(next, 'Particle')) && /^(aside|away|up|down|off|out|back|over)$/.test(nextW) && prev && (has(prev, 'Noun') || has(prev, 'Pronoun')) && nlp(word).has('#Infinitive')) return 'VERB';
  // ①' 文頭付近の複合名詞・名詞/動詞の曖昧性（compromise の誤りを先に直す）
  // 文頭の「名詞＋三単現」（Research shows / Smartphones and tablets have）: 文頭の語を compromise が命令形と誤る
  if (atStart && tags.has('Verb') && !tags.has('Noun') && isNounWord(word.replace(/s$/, '')) && next && ((has(next, 'Noun') && /s$/.test(nextW) && nlp(nextW.replace(/s$/, '')).has('#Verb')) || COORDINATORS.has(nextW) || MODALS.has(nextW) || BE_FORMS.has(nextW) || HAVE_FORMS.has(nextW) || DO_FORMS.has(nextW))) return 'NOUN';
  if (k === 1 && prevPos === 'NOUN' && tags.has('Noun') && !tags.has('Verb') && /s$/.test(word) && nlp(word.replace(/s$/, '')).has('#Verb') && next && !has(next, 'Verb')) return 'VERB';
  // 接続詞の直後で動詞と誤られた複数名詞（As prices rise）: 次の語が動詞になりうる
  if (tags.has('Verb') && !tags.has('Noun') && !tags.has('Auxiliary') && /s$/.test(word) && prev && (SUBORDINATORS.has(prevW) || prevW === 'as' || atStart) && next && !has(next, 'Determiner') && isNounWord(word.replace(/s$/, '')) && (has(next, 'Verb') || nlp(nextW).has('#Infinitive'))) return 'NOUN';
  // 動詞の直後で動詞と誤られた複数名詞（use smartphones）
  if (tags.has('Verb') && !tags.has('Noun') && !tags.has('Auxiliary') && !tags.has('Copula') && !BE_FORMS.has(word) && !DO_FORMS.has(word) && !HAVE_FORMS.has(word) && !MODALS.has(word) && word.length >= 5 && /s$/.test(word) && prev && prevPos === 'VERB' && !has(prev, 'Auxiliary') && !has(prev, 'Modal') && !BE_FORMS.has(prevW) && isNounWord(word.replace(/s$/, ''))) return 'NOUN';
  // コンマや接続詞の直後で動詞と誤られた複数名詞（…, smartphones and …）
  if (tags.has('Verb') && !tags.has('Noun') && !tags.has('Auxiliary') && /s$/.test(word) && prev && ((prev.post || '').includes(',') || COORDINATORS.has(prevW)) && isNounWord(word.replace(/s$/, '')) && next && (COORDINATORS.has(nextW) || has(next, 'Verb') || MODALS.has(nextW) || has(next, 'Preposition'))) return 'NOUN';
  // 接続詞の直後の 名詞＋三単現（that exercise improves）
  if (tags.has('Verb') && !tags.has('Noun') && !tags.has('Auxiliary') && prev && (SUBORDINATORS.has(prevW) || prevW === 'that') && next && has(next, 'Verb') && /s$/.test(nextW) && isNounWord(word)) return 'NOUN';
  // 複合名詞の主語（Rooftop gardens can … / Community gardens bring … / prices rise）: 文頭近くの 名詞＋動詞と誤られた複数形 の直後に動詞・助動詞が続く
  if (tags.has('Verb') && !tags.has('Noun') && !tags.has('Auxiliary') && !tags.has('Copula') && !BE_FORMS.has(word) && !DO_FORMS.has(word) && !HAVE_FORMS.has(word) && /s$/.test(word) && prev && (has(prev, 'Noun') || prevPos === 'NOUN' || (has(prev, 'Adjective') && isNounWord(prevW))) && !has(prev, 'Pronoun') && !has(prev, 'Verb') && k <= 3 && next && (has(next, 'Verb') || MODALS.has(nextW) || BE_FORMS.has(nextW) || DO_FORMS.has(nextW) || HAVE_FORMS.has(nextW)) && isNounWord(word.replace(/s$/, ''))) return 'NOUN';
  // 動詞の直後で名詞と誤られた動詞（prices rise and …）: 文頭 名詞 + 名詞? → 2 語目が動詞になりうるなら動詞
  if (tags.has('Noun') && !tags.has('Verb') && !tags.has('Pronoun') && !tags.has('Plural') && !tags.has('ProperNoun') && prev && (has(prev, 'Noun') || prevPos === 'NOUN') && !has(prev, 'Pronoun') && !has(prev, 'Possessive') && !has(prev, 'Determiner') && k <= 3 && next && (COORDINATORS.has(nextW) || has(next, 'Preposition') || has(next, 'Determiner') || has(next, 'Adverb') || has(next, 'Pronoun') || (has(next, 'Noun') && !terms.slice(k + 1).some(t => has(t, 'Verb') && !has(t, 'Gerund')))) && nlp(word).has('#Infinitive') && !nlp(word).has('#Plural') && (prevPos === 'NOUN' ? has(prev, 'Plural') || k >= 2 : true)) return 'VERB';
  // 複数名詞の主語の直後の動詞原形（Community gardens bring …）: 2 語目以降が名詞と誤られ、後ろに他の動詞が無い
  if (tags.has('Noun') && !tags.has('Verb') && !tags.has('Plural') && !tags.has('ProperNoun') && prev && prevPos === 'NOUN' && has(prev, 'Plural') === false && prevW.endsWith('s') && k >= 2 && next && (has(next, 'Noun') || has(next, 'Pronoun')) && nlp(word).has('#Infinitive') && !terms.slice(k + 1).some(t => has(t, 'Verb') && !has(t, 'Gerund') && !has(t, 'Modal'))) return 'VERB';
  // 複合名詞の 1 語目の -ing（building temperatures / air conditioning）
  if (/ing$/.test(word) && tags.has('Gerund') && !tags.has('Noun') && next && has(next, 'Noun') && !has(next, 'Pronoun') && has(next, 'Plural') && prev && (has(prev, 'Verb') || has(prev, 'Adjective')) && !has(prev, 'Auxiliary') && !BE_FORMS.has(prevW)) return 'NOUN';
  // 所有格 's（today's students / Tom's car）→ 限定詞扱い
  if (/'s$/.test(word) && tags.has('Possessive') && next && (has(next, 'Noun') || has(next, 'Adjective'))) return 'DET';
  // ① 語彙で決まるもの
  if (word === 'due' && nextW === 'to') return 'ADP';
  if (word === 'to' && prevW === 'due') return 'ADP';
  if (word === 'such' && nextW === 'as') return 'ADP';
  if (word === 'as' && prevW === 'such') return 'ADP';
  if (word === 'to' && next && has(next, 'Verb')) return 'PART';
  if (word === 'no' && next && (has(next, 'Noun') || has(next, 'Adjective'))) return 'DET';
  if (tags.has('Negative') || word === 'not') return 'PART';
  if (tags.has('Particle') && has(prev, 'Verb')) return 'PART';
  if (/^(off|on|up|down|out|away|back|over|aside)$/.test(word) && prev && (has(prev, 'Verb') || prevPos === 'VERB') && !has(prev, 'Auxiliary') && (!next || !(has(next, 'Determiner') || has(next, 'Possessive') || has(next, 'Noun') || has(next, 'Pronoun') || has(next, 'Adjective') || has(next, 'Value')) || /^(off|away|aside|back|out)$/.test(word) && !/^(depend|rely|insist|focus|count|base)$/.test(prev.root || prevW))) return 'PART';
  if (COORDINATORS.has(word) && word !== 'so') return 'CCONJ';
  if (word === 'so' && prev && (prev.post || '').includes(',')) return 'CCONJ';
  if (TIME_WORDS.has(word)) return 'ADV';
  if (PLAIN_ADVS.has(word)) return 'ADV';
  // 程度副詞（far less often / much easier / more quickly）
  if (/^(far|much|less|more|very|quite|rather|even|still|too|so)$/.test(word) && next && (has(next, 'Adverb') || has(next, 'Adjective') || has(next, 'Comparative')) && !has(next, 'Noun')) return 'ADV';
  // 限定詞・所有格の直後で動詞と誤られた名詞（their name / the experience）
  if (tags.has('Verb') && !tags.has('Gerund') && !tags.has('Auxiliary') && !tags.has('Copula') && !BE_FORMS.has(word) && !DO_FORMS.has(word) && !HAVE_FORMS.has(word) && !MODALS.has(word) && prev && (has(prev, 'Determiner') || has(prev, 'Possessive') || POSS_DETS.has(prevW)) && !INDEF_PRONS.has(prevW) && !DEMONSTRATIVES.has(prevW) && !/ing$/.test(word) && !(next && has(next, 'Determiner'))) return 'NOUN';
  // 形容詞の直後の -ing（busy doing something）
  if (/ing$/.test(word) && tags.has('Noun') && !tags.has('Verb') && prev && has(prev, 'Adjective') && next && (has(next, 'Determiner') || has(next, 'Pronoun') || has(next, 'Noun')) && isVerbStem(word)) return 'VERB';
  if (MANNER_ADVS.has(word) && !next && prev && !has(prev, 'Determiner') && !has(prev, 'Adjective') && k > 1 && terms.slice(0, k).some(t => has(t, 'Verb'))) return 'ADV';
  if (MANNER_ADVS.has(word) && prev && ((has(prev, 'Verb') && !BE_FORMS.has(prevW)) || (prevW === 'so' && k >= 2 && has(terms[k - 2], 'Verb') && !BE_FORMS.has(w(terms[k - 2])))) && !has(next, 'Noun')) return 'ADV';
  if (tags.has('Date') && !has(prev, 'Determiner') && !has(prev, 'Adjective') && !has(prev, 'Possessive') && !has(prev, 'Value') && !has(prev, 'Noun') && !/s$/.test(word)) return 'ADV';
  if (tags.has('Date') && (has(prev, 'Determiner') || has(prev, 'Adjective') || /s$/.test(word))) return 'NOUN';
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
  if (word === 'as' && prev && has(prev, 'Verb') && next && (has(next, 'Determiner') || has(next, 'Adjective'))) return 'ADP';
  if (word === 'as') {
    let j = k + 1, sawNoun = false;
    const nounish = t => has(t, 'Noun') || has(t, 'Pronoun') || (has(t, 'Verb') && /s$/.test(w(t)) && nlp(w(t).replace(/s$/, '')).has('#Noun') && !has(t, 'Auxiliary'));
    const verbish = t => has(t, 'Verb') && !(nounish(t) && !has(t, 'Noun') && j > k + 1 && !sawNoun);
    while (j < terms.length && j <= k + 6 && !(sawNoun && (has(terms[j], 'Verb') || nlp(w(terms[j])).has('#Infinitive'))) && !(terms[j - 1].post || '').includes(',')) { if (nounish(terms[j])) sawNoun = true; j++; }
    if (j < terms.length && j <= k + 6 && sawNoun && (has(terms[j], 'Verb') || nlp(w(terms[j])).has('#Infinitive')) && !has(terms[j], 'Gerund') && !has(terms[j], 'PastTense')) return 'SCONJ';
    if (next && (has(next, 'Determiner') || has(next, 'Adjective') || has(next, 'Value') || (has(next, 'Noun') && !has(next, 'Pronoun')))) return 'ADP';
  }
  // like: 代名詞の直後（you like tennis）や文中に他の動詞が無いときは動詞
  if (word === 'like' && prev && (has(prev, 'Pronoun') || DO_FORMS.has(w(terms[0])) ) && !terms.slice(k + 1).some(t => has(t, 'Verb') && !has(t, 'Gerund'))) return 'VERB';
  if (word === 'like' && !terms.some((t, i) => i !== k && has(t, 'Verb') && ((!has(t, 'Gerund') && !has(t, 'Auxiliary') && !has(t, 'Copula')) || (has(t, 'Gerund') && i > 0 && (BE_FORMS.has(w(terms[i - 1])) || has(terms[i - 1], 'Modal')))))) return 'VERB';
  // like: 名詞の直後で、後ろに名詞句が続き、その後に動詞があれば前置詞（methods like online learning are …）
  if (word === 'like' && prev && has(prev, 'Noun') && !has(prev, 'Pronoun') && next && (has(next, 'Noun') || has(next, 'Adjective') || has(next, 'Determiner') || has(next, 'Value')) && !has(next, 'Pronoun') && terms.slice(k + 2).some(t => has(t, 'Verb') && !has(t, 'Gerund'))) return 'ADP';
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
  if (word === 'that' && prev && !(k === 1 && BE_FORMS.has(prevW)) && (has(prev, 'Verb') || prevPos === 'VERB' || has(prev, 'Adjective') || (has(prev, 'Pronoun') && k >= 2 && has(terms[k - 2], 'Verb'))) && next && (isNounish(next) || DETS.has(nextW) || INDEF_PRONS.has(nextW))) return 'SCONJ';
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
  if (word === 'that' && k >= 2 && BE_FORMS.has(w(terms[k - 2])) && w(terms[k - 3]) === 'it' && (has(prev, 'Adverb') || TIME_WORDS.has(prevW) || has(prev, 'Noun'))) return 'REL';
  if (word === 'there' && next && BE_FORMS.has(nextW)) return 'PRON';
  // 指示詞・不定代名詞: 後ろに名詞が続かなければ代名詞
  const nextIsPossDet = next && POSS_DETS.has(nextW);
  if ((DEMONSTRATIVES.has(word) || (INDEF_PRONS.has(word) && !has(prev, 'Determiner'))) && (nextIsPossDet || !(next && (has(next, 'Noun') || has(next, 'Adjective') || has(next, 'Value')) && !has(next, 'Verb')))) {
    if (!(word === 'one' && has(prev, 'Determiner'))) return 'PRON';
  }
  if (DETS.has(word) && !DEMONSTRATIVES.has(word) && !(word === 'all' && has(prev, 'Verb') && !has(next, 'Noun'))) return 'DET';
  // 使役・知覚動詞＋代名詞＋原形（heard her sing）
  if (tags.has('Noun') && !tags.has('Pronoun') && prev && has(prev, 'Pronoun') && k >= 2 && CAUSATIVE_FOR_POS.has(terms[k - 2].root || w(terms[k - 2])) && nlp(word).has('#Infinitive')) return 'VERB';
  // that/文頭の直後の -ing 形容詞タグ（that taking brief breaks …）→ 動名詞
  if (/ing$/.test(word) && tags.has('Adjective') && !tags.has('Verb') && (atStart || SUBORDINATORS.has(prevW) || (prev.post || '').includes(',')) && next && (has(next, 'Adjective') || has(next, 'Determiner') || has(next, 'Noun')) && isVerbStem(word)) return 'VERB';
  if (prev && /ing$/.test(prevW) && tags.has('Noun') && !tags.has('Plural') && next && has(next, 'Verb') && /s$/.test(nextW) && nlp(word).has('#Adjective')) return 'ADJ'; // taking brief breaks: brief
  if (tags.has('Verb') && !tags.has('Noun') && /s$/.test(word) && prev && (has(prev, 'Adjective') || prevPos === 'ADJ') && k >= 2 && /ing$/.test(w(terms[k - 2])) && isNounWord(word.replace(/s$/, ''))) return 'NOUN'; // taking brief breaks: breaks
  // 小辞・副詞の直後の -ing（ran away laughing / stood there holding）
  if (/ing$/.test(word) && prev && (has(prev, 'Particle') || has(prev, 'Adverb') || LOCATIVE_ADVS.has(prevW)) && k >= 2 && has(terms[k - 2], 'Verb') && isVerbStem(word)) return 'VERB';
  // 名詞の直後の -ing を compromise が名詞と誤る（the window reading a magazine）
  if (/ing$/.test(word) && tags.has('Noun') && !tags.has('Verb') && prev && has(prev, 'Noun') && !has(prev, 'Determiner') && next && (has(next, 'Determiner') || has(next, 'Pronoun') || has(next, 'Possessive') || has(next, 'Preposition') || PREPS.has(nextW)) && isVerbStem(word)) return 'VERB';
  // 従属節の主語の直後で名詞と誤られた動詞（As the sun set we …）
  if (tags.has('Noun') && !tags.has('Pronoun') && !tags.has('Plural') && prev && has(prev, 'Noun') && !has(prev, 'Pronoun') && k >= 2 && (has(terms[k - 2], 'Determiner') || has(terms[k - 2], 'Adjective')) && next && (has(next, 'Pronoun') || has(next, 'Determiner')) && nlp(word).has('#Infinitive') && terms.slice(0, k - 2).some(t => SUBORDINATORS.has(w(t)) || w(t) === 'as')) return 'VERB';
  // 挿入の関係詞節のあとの動詞（…, who lives in Osaka, visits us）: コンマの直後で、名詞と誤られた三単現
  if (tags.has('Noun') && !tags.has('Pronoun') && !tags.has('ProperNoun') && prev && (prev.post || '').includes(',') && /s$/.test(word) && next && (has(next, 'Pronoun') || has(next, 'Determiner') || has(next, 'Possessive')) && nlp(word).has('#PresentTense') && terms.slice(0, k).some(t => REL_WORDS.has(w(t)))) return 'VERB';
  // people who walk: 関係詞の直後の語を compromise が名詞と誤る
  if (tags.has('Noun') && !tags.has('Pronoun') && prev && REL_WORDS.has(prevW) && k >= 2 && has(terms[k - 2], 'Noun') && nlp(word).has('#Verb') && !has(next, 'Noun')) return 'VERB';

  // 「a few more sidewalks」: 数量表現の直後で動詞と誤られた複数名詞
  if (tags.has('Verb') && !tags.has('Noun') && /s$/.test(word) && prev && (has(prev, 'Adverb') || has(prev, 'Adjective') || has(prev, 'Determiner') || has(prev, 'Value')) && k >= 2 && (has(terms[k - 2], 'Determiner') || has(terms[k - 2], 'Adjective') || has(terms[k - 2], 'Value') || /^(few|many|more|several|some)$/.test(w(terms[k - 2]))) && !has(next, 'Determiner') && !has(next, 'Pronoun') && isNounWord(word.replace(/s$/, ''))) return 'NOUN';
  // 前置詞＋名詞＋-ing（for air conditioning）: 複合名詞
  if (/ing$/.test(word) && tags.has('Verb') && prev && has(prev, 'Noun') && !has(prev, 'Pronoun') && k >= 2 && (has(terms[k - 2], 'Preposition') || PREPS.has(w(terms[k - 2]))) && (!next || COORDINATORS.has(nextW) || has(next, 'Preposition') || (next.pre || '').match(/[,.;]/) || (prev.post || '').match(/[,.;]/) === null && !has(next, 'Determiner') && !has(next, 'Pronoun') && !has(next, 'Noun'))) return 'NOUN';
  // worth + -ing（be worth doing）: worth は形容詞、-ing は動名詞
  if (word === 'worth' && next && /ing$/.test(nextW)) return 'ADJ';
  if (/ing$/.test(word) && prevW === 'worth' && isVerbStem(word)) return 'VERB';
  // 形式目的語 it の直後の形容詞（thought it strange / find it surprising）
  if (prevW === 'it' && tags.has('Verb') && !tags.has('Noun') && next && nextW === 'that' && nlp(word).has('#Adjective')) return 'ADJ';
  if (prevW === 'it' && /ing$/.test(word) && next && nextW === 'that') return 'ADJ';
  // 前置詞の直後の -ing は動名詞（interested in learning / good at making）
  if (/ing$/.test(word) && prev && (has(prev, 'Preposition') || PREPS.has(prevW)) && !has(prev, 'Verb') && (tags.has('Verb') || tags.has('Noun') || tags.has('Gerund')) && isVerbStem(word)) return 'VERB';
  // 文頭の過去分詞（Tired from … / Built in …）: 直後が前置詞で、後に主語＋動詞が続く
  if (atStart && /(ed|en)$/.test(word) && next && (has(next, 'Preposition') || PREPS.has(nextW)) && terms.slice(2).some(t => has(t, 'Verb')) && nlp(word).has('#PastTense')) return 'VERB';
  // interested in: 受動態ではなく形容詞（be + 感情の過去分詞 + 前置詞）
  if (/(ed|en)$/.test(word) && prev && BE_FORMS.has(prevW) && next && (has(next, 'Preposition') || PREPS.has(nextW)) && /^(interested|tired|bored|excited|surprised|worried|pleased|satisfied|disappointed|involved|concerned|scared|frightened|confused|married|known|covered|filled|made)$/.test(word)) return 'ADJ';
  // ③ be / do / have
  if (BE_FORMS.has(word) || DO_FORMS.has(word) || HAVE_FORMS.has(word)) {
    const nc = nextContent(terms, k);
    const ncIsVerb = nc && has(nc, 'Verb') && !has(nc, 'Modal');
    const subjThenLike = DO_FORMS.has(word) && nc && (has(nc, 'Pronoun') || has(nc, 'Noun')) && terms.slice(k + 2, k + 4).some(t => w(t) === 'like');
    const afterWh = k === 1 && (WH_PRON.has(w(terms[0])) || WH_ADV.has(w(terms[0])));
    const afterNegAdv = k >= 1 && terms.slice(0, k).every(t => has(t, 'Adverb') || has(t, 'Negative') || /^(little|only|never|rarely|seldom|hardly|scarcely|nor|neither)$/.test(w(t)));
    const invertedAux = (atStart || afterWh || afterNegAdv) && nc && (has(nc, 'Pronoun') || has(nc, 'Noun') || has(nc, 'Determiner')) && terms.slice(k + 2).some(t => has(t, 'Verb'));
    if (ncIsVerb || subjThenLike || (invertedAux && !BE_FORMS.has(word))) return 'AUX';
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

// ハイフンでつながった語（hyper-connected, face-to-face, well-being）を 1 つの語にまとめる
function mergeHyphenated(terms) {
  const out = [];
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    if (has(t, 'Hyphenated') && !(t.post || '').includes(' ') && terms[i + 1] && has(terms[i + 1], 'Hyphenated')) {
      let j = i; const parts = [];
      while (j < terms.length && has(terms[j], 'Hyphenated')) { parts.push(terms[j]); if ((terms[j].post || '').includes(' ') || j + 1 >= terms.length || !has(terms[j + 1], 'Hyphenated')) break; j++; }
      const last = parts[parts.length - 1];
      const text = parts.map(x => x.text).join('-');
      const nextT = terms[j + 1];
      const nounNext = nextT && (has(nextT, 'Noun') || has(nextT, 'Adjective')) && !has(nextT, 'Verb') && !has(nextT, 'Pronoun');
      // 名詞が続けば形容詞、そうでなければ名詞（well-being）。ただし -ing/-ed で終わる語は形容詞寄り
      const tags = nounNext ? ['Adjective', 'Hyphenated'] : (/^(well-being|face-to-face|day-to-day)$/i.test(text) ? ['Noun', 'Singular', 'Hyphenated'] : ['Noun', 'Singular', 'Hyphenated']);
      if (!nounNext && /(ing|ed|free|proof|like|wide|based)$/i.test(text) && nextT && has(nextT, 'Noun')) tags[0] = 'Adjective';
      out.push({ text, normal: text.toLowerCase(), pre: parts[0].pre, post: last.post, tags, root: text.toLowerCase(), merged: true });
      i = j; continue;
    }
    out.push(t);
  }
  return out;
}

export function tagSentence(text) {
  const doc = nlp(text);
  doc.compute('root');
  const sents = doc.json();
  const tokens = [];
  let i = 0;
  for (const s of sents) {
    const terms = mergeHyphenated(s.terms);
    const assigned = [];
    const alpha = terms.filter(t => /^[A-Za-z]/.test(t.text || ''));
    const titleCase = alpha.length >= 3 && alpha.every(t => /^[A-Z]/.test(t.text) || /^(a|an|the|of|in|on|at|to|for|with|and|or|by|from|our|your|my|his|her|its|their)$/i.test(t.text));
    for (let k = 0; k < terms.length; k++) {
      const t = terms[k];
      const pos = mapTag(terms, k, assigned, { titleCase });
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
