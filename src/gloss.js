// gloss.js — 構造訳（structure-based gloss）
// 解析結果（文型・役割・チャンク）と英和辞書だけから、機械的に日本語を組み立てる。
// 自然な翻訳ではなく「構造どおりに訳すとこうなる」を示す学習用の直訳。AI モデルは使わない。
//   S → 「〜は」、O → 「〜を」、O（二重目的語の 1 つ目）→ 「〜に」、C → 「〜で（ある）」
//   M（前置詞句）→ 前置詞の訳（in → 〜で、to → 〜へ …）、節 → 「〜ということ」「〜する（名詞）」「〜なので」など
import { lookup } from './dict.js?v=0.8';

const PREP_JA = { in: 'で', on: 'で', at: 'で', to: 'へ', for: 'のために', with: 'と', by: 'によって', from: 'から', of: 'の', about: 'について', into: 'の中へ', over: 'にわたって', under: 'の下で', during: 'の間', after: 'の後', before: 'の前', since: '以来', until: 'まで', through: 'を通して', between: 'の間で', among: 'の間で', without: 'なしで', around: 'のまわりで', across: 'を横切って', along: 'に沿って', near: 'の近くで', against: 'に対して', toward: 'へ向かって', towards: 'へ向かって', like: 'のような', than: 'より', as: 'として', beyond: 'を超えて', within: '以内に', despite: 'にもかかわらず', behind: 'の後ろで', above: 'の上で', below: 'の下で', per: 'あたり', upon: 'の上に', onto: 'の上へ', throughout: 'の間ずっと', off: 'から離れて', out: '外へ' };
const SCONJ_JA = { because: 'ので', if: 'ならば', when: 'とき', while: '間に', although: 'けれども', though: 'けれども', since: 'ので', unless: 'でなければ', until: 'まで', after: 'あとで', before: '前に', whether: 'かどうか', as: 'ように', once: 'したら', whereas: '一方で', that: 'ということ' };
const PRON_JA = { i: '私', you: 'あなた', he: '彼', she: '彼女', it: 'それ', we: '私たち', they: '彼ら', me: '私', him: '彼', her: '彼女', us: '私たち', them: '彼ら', my: '私の', your: 'あなたの', his: '彼の', its: 'その', our: '私たちの', their: '彼らの', this: 'これ', that: 'それ', these: 'これら', those: 'それら', who: '誰', what: '何', which: 'どれ', there: '', one: '人', everyone: 'みんな', everybody: 'みんな', everything: 'すべて', someone: '誰か', something: '何か', nothing: '何も', nobody: '誰も', anything: '何でも', myself: '私自身', himself: '彼自身', herself: '彼女自身', themselves: '彼ら自身', mine: '私のもの', yours: 'あなたのもの' };
const DET_JA = { a: '', an: '', the: '', this: 'この', that: 'あの', these: 'これらの', those: 'あれらの', some: 'いくつかの', any: 'どんな', every: 'すべての', each: 'それぞれの', no: '〜ない', all: 'すべての', both: '両方の', many: '多くの', much: '多くの', few: '少しの', several: 'いくつかの', such: 'そのような', another: '別の', other: '他の', most: 'ほとんどの', half: '半分の', enough: '十分な' };
const AUX_JA = { can: '〜できる', could: '〜できた', may: '〜かもしれない', might: '〜かもしれない', must: '〜しなければならない', shall: '〜しよう', should: '〜すべきだ', will: '〜だろう', would: '〜だろう', ought: '〜すべきだ' };
const ROLE_PARTICLE = { S: 'は', O: 'を', O2: 'に', C: 'である', V: '' };

// 辞書の 1 義目が学習向きでない基本語の上書き（品詞ごと）。根拠: 中学・高校英語での最頻義
const OVERRIDE = {
  ADJ: { tired: '疲れた', happy: '幸せな', right: '正しい', fine: '元気な', kind: '親切な', well: '元気な', late: '遅い', hard: '難しい', last: '最後の', present: '現在の', close: '近い', light: '軽い', mean: '意地悪な', free: '自由な', even: '平らな', poor: '貧しい', own: '自分自身の', major: '主要な', little: '小さい', few: '少ない', more: 'もっと多くの', most: 'もっとも多くの', such: 'そのような', next: '次の', same: '同じ', only: '唯一の', real: '本当の', sure: '確かな', busy: '忙しい', able: 'できる', likely: 'ありそうな', simple: '簡単な', social: '社会的な', physical: '身体的な', modest: 'ささやかな' },
  NOUN: { man: '男', kind: '種類', mean: '平均', well: '井戸', right: '権利', light: '光', present: '贈り物', fine: '罰金', leaves: '葉', work: '仕事', play: '劇', study: '研究', change: '変化', need: '必要', use: '使用', part: '部分', way: '方法', effect: '効果', result: '結果', cause: '原因', end: '終わり', people: '人々', world: '世界', problem: '問題', question: '質問', letter: '手紙', time: '時間', day: '日', life: '生活', thing: '物', place: '場所', year: '年', word: '言葉', number: '数', water: '水', money: 'お金', food: '食べ物', city: '都市', country: '国', family: '家族', friend: '友達', teacher: '先生', student: '学生', school: '学校', book: '本', car: '車', house: '家', home: '家', morning: '朝', night: '夜', experiment: '実験', debate: '議論', habit: '習慣', nature: '自然', pattern: '傾向', solution: '解決策', benefit: '利点', space: '空間', area: '地域', quality: '質' },
  VERB: { bark: '吠える', love: '愛する', rise: '昇る', stop: '止まる', like: '好む', mean: '意味する', leave: '去る', kind: '', well: '', right: '', fine: '', light: '照らす', present: '示す', close: '閉じる', work: '働く', play: '遊ぶ', study: '勉強する', change: '変える', need: '必要とする', use: '使う', look: '見る', make: '作る', get: '得る', take: '取る', give: '与える', go: '行く', come: '来る', see: '見る', know: '知っている', think: '思う', want: '欲する', say: '言う', tell: '伝える', find: '見つける', become: 'なる', keep: '保つ', let: 'させる', help: '助ける', show: '見せる', feel: '感じる', seem: '思われる', begin: '始まる', start: '始める', call: '呼ぶ', try: '試みる', ask: '尋ねる', turn: '変わる', run: '走る', live: '住む', walk: '歩く', meet: '会う', read: '読む', write: '書く', learn: '学ぶ', teach: '教える', buy: '買う', send: '送る', bring: '持ってくる', open: '開ける', hear: '聞く', believe: '信じる', hope: '望む', remember: '覚えている', remind: '思い出させる', offer: '提供する', involve: '含む', promote: '促進する', reduce: '減らす', gain: '得る', expand: '広がる', replace: '置き換える', absorb: '吸収する', release: '放出する', bring_together: '結びつける' },
  ADV: { well: 'うまく', right: 'ちょうど', hard: '一生懸命に', late: '遅く', even: '〜さえ', only: '〜だけ', just: 'ちょうど', still: 'まだ', also: '〜も', already: 'すでに', often: 'しばしば', sometimes: '時々', always: 'いつも', never: '決して〜ない', here: 'ここに', there: 'そこに', home: '家に', together: '一緒に', alone: '一人で', again: '再び', soon: 'すぐに', now: '今', then: 'その時', today: '今日', yesterday: '昨日', tomorrow: '明日', later: '後で', interestingly: '興味深いことに', furthermore: 'さらに', additionally: 'さらに', however: 'しかし', therefore: 'したがって' }
};
const cache = new Map();
async function gloss(word, lemma) {
  const key = (lemma || word).toLowerCase();
  if (cache.has(key)) return cache.get(key);
  // 原形 → 表層形 の順に引く（活用形の見出しは「〜の過去形」になりやすい）
  let g = lemma ? await lookup(lemma, lemma) : null;
  let v = g ? firstSense(g.gloss) : null;
  if (!v || /の(過去|複数|三人称|現在分詞|過去分詞|比較級|最上級)/.test(v)) {
    const g2 = await lookup(word, word);
    const v2 = g2 ? firstSense(g2.gloss) : null;
    if (v2 && !/の(過去|複数|三人称|現在分詞|過去分詞|比較級|最上級)/.test(v2)) v = v2;
    else if (!v) v = v2;
  }
  cache.set(key, v);
  return v;
}
// 辞書の 1 義目から短い訳を取り出す（「『』」「〈C〉」「(…)」などを除く）
function cleanSense(raw) {
  let x = raw.replace(/《.*?》/g, '').replace(/〈.*?〉/g, '').replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/[『』]/g, '');
  x = x.replace(/^[,，、;；\s]+/, '').split(/[,，、;；]/)[0].trim();
  x = x.replace(/^…?(を|に|と|の|が|へ|で|から)/, '').replace(/^…/, '').trim();
  return x;
}
const BAD_SENSE = /(島|川|山脈|市|州|県|湖|地方|人名|姓|名前|の略|略語|記号|元素|の過去|の複数|三人称|分詞|比較級|最上級|の短縮|の省略)/;
function senses(text) {
  const all = text.split(' / ').map(cleanSense).filter(Boolean);
  return [...all.filter(x => !BAD_SENSE.test(x)), ...all.filter(x => BAD_SENSE.test(x))];
}
function firstSense(text) { const s = senses(text); return s[0] || null; }

// 動詞らしい訳（う段で終わる / 「する」を含む）を優先して選ぶ
async function verbSense(word, lemma) {
  const g = (lemma ? await lookup(lemma, lemma) : null) || await lookup(word, word);
  if (!g) return null;
  const ss = senses(g.gloss);
  const verbish = ss.find(x => /[うくぐすずつづぬふぶむゆる]$/.test(x) || /する$/.test(x) || /になる$/.test(x) || /である$/.test(x));
  return verbish || ss[0] || null;
}

// 1 トークンの訳
async function tokenGloss(t) {
  const w = (t.display || t.text || '').toLowerCase();
  if (t.implicit) return '';
  if (t.pos === 'PUNCT') return '';
  if (t.pos === 'DET') return DET_JA[w] ?? (await gloss(w, t.lemma)) ?? '';
  if (t.pos === 'PRON') { if ((t.tags || []).includes('Possessive') && w === 'her') return '彼女の'; return PRON_JA[w] ?? (await gloss(w, t.lemma)) ?? w; }
  if (t.pos === 'AUX') return '';            // 助動詞は動詞側でまとめる
  if (t.pos === 'PART') return w === 'not' ? '〜ない' : '';
  if (t.pos === 'ADP') return '';            // 前置詞は句の末尾に付ける
  if (t.pos === 'CCONJ') return w === 'and' ? 'と' : w === 'or' ? 'または' : w === 'but' ? 'しかし' : '';
  if (t.pos === 'SCONJ' || t.pos === 'REL') return '';
  if (t.pos === 'NUM') return w;
  if (t.pos === 'PROPN') return t.display || t.text;
  const ov = OVERRIDE[t.pos] && (OVERRIDE[t.pos][w] ?? OVERRIDE[t.pos][(t.lemma || '').toLowerCase()]);
  if (ov) return ov;
  if (t.pos === 'NOUN' || t.pos === 'ADJ' || t.pos === 'ADV') {
    const g0 = (t.lemma ? await lookup(t.lemma, t.lemma) : null) || await lookup(w, w);
    if (g0) {
      const ss = senses(g0.gloss);
      const pick = t.pos === 'NOUN' ? (ss.find(x => !/[うくぐすずつづぬふぶむゆる]$/.test(x) && !/する$/.test(x)) || ss[0]) : t.pos === 'ADJ' ? (ss.find(x => /[いな]$/.test(x)) || ss[0]) : (ss.find(x => /[にくと]$/.test(x)) || (ss[0] && /^(.*)(な|の)$/.test(ss[0]) ? ss[0].replace(/(な|の)$/, 'に') : ss[0]));
      if (pick) return pick;
    }
  }
  const g = await gloss(w, t.lemma);
  if (g) return g;
  return t.display || t.text;
}

// 動詞句の訳: 辞書の訳 + 時制・助動詞・否定・受動・進行
async function verbGloss(tokens, idxs) {
  const toks = Array.isArray(idxs) && idxs.length && typeof idxs[0] === 'object' ? idxs : idxs.map(i => tokens[i]);
  const head = [...toks].reverse().find(t => t.pos === 'VERB') || toks[toks.length - 1];
  const ovv = OVERRIDE.VERB[(head.lemma || '').toLowerCase()] || OVERRIDE.VERB[(head.display || head.text).toLowerCase()];
  let base = head.lemma === 'be' ? 'である' : (ovv || (await verbSense((head.display || head.text).toLowerCase(), head.lemma)) || head.lemma || head.text);
  base = base.replace(/^…を|^…に|^…と|^…の/, '');       // 「…を見る」→「見る」
  const auxes = toks.filter(t => t.pos === 'AUX').map(t => (t.display || t.text).toLowerCase());
  const neg = toks.some(t => t.pos === 'PART' && /^(not|n't)$/.test((t.display || t.text).toLowerCase()));
  const passive = toks.some(t => t.lemma === 'be' && t.pos === 'AUX') && (head.tags || []).some(x => x === 'PastTense' || x === 'Participle') && !/ing$/.test(head.text);
  const progressive = toks.some(t => t.lemma === 'be' && t.pos === 'AUX') && /ing$/.test(head.text);
  const perfect = toks.some(t => /^(have|has|had)$/.test((t.display || t.text).toLowerCase()) && t.pos === 'AUX');
  const past = (head.tags || []).includes('PastTense') || auxes.some(a => /^(was|were|did|had)$/.test(a));
  let out = base;
  if (passive) out += '（される）';
  if (progressive) out += '（している）';
  if (perfect) out += '（してきた）';
  const modal = auxes.find(a => AUX_JA[a]);
  if (modal) out += AUX_JA[modal].replace('〜', '');
  if (neg) out += '〔ない〕';
  if (past && !perfect) out += '〔過去〕';
  return out;
}

// 節の中の語順を日本語風（動詞を最後）に並べ替えて訳す。前置詞句は「中身＋前置詞の訳」にまとめる
async function clauseGloss(toks) {
  const outParts = [];
  const verbs = [];
  let i = 0, nps = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.pos === 'ADP') {
      // 前置詞 + 続く名詞句（DET/ADJ/NOUN/PROPN/PRON/NUM）
      let j = i + 1; const inner = [];
      while (j < toks.length && ['DET', 'ADJ', 'NOUN', 'PROPN', 'PRON', 'NUM'].includes(toks[j].pos)) { inner.push(toks[j]); j++; }
      const innerJa = (await Promise.all(inner.map(tokenGloss))).filter(Boolean).join('');
      outParts.push(innerJa + (PREP_JA[(t.display || t.text).toLowerCase()] ?? ''));
      i = j; continue;
    }
    if (t.pos === 'VERB' || t.pos === 'AUX' || (t.pos === 'PART' && /^(not|n't)$/.test((t.display || t.text).toLowerCase()))) {
      // 動詞句をまとめる
      let j = i; const grp = [];
      while (j < toks.length && (toks[j].pos === 'VERB' || toks[j].pos === 'AUX' || (toks[j].pos === 'PART' && /^(not|n't|to)$/.test((toks[j].display || toks[j].text).toLowerCase())) || (toks[j].pos === 'ADV' && j + 1 < toks.length && toks[j + 1].pos === 'VERB'))) { grp.push(toks[j]); j++; }
      verbs.push(await verbGloss(null, grp));
      i = j; continue;
    }
    // 名詞句のまとまり（DET/ADJ/NOUN/PROPN/PRON/NUM の連続）
    if (['DET', 'ADJ', 'NOUN', 'PROPN', 'PRON', 'NUM'].includes(t.pos)) {
      let j = i; const np = [];
      while (j < toks.length && ['DET', 'ADJ', 'NOUN', 'PROPN', 'PRON', 'NUM'].includes(toks[j].pos)) { np.push(toks[j]); j++; }
      const npJa = (await Promise.all(np.map(tokenGloss))).filter(Boolean).join('');
      const verbFollows = toks.slice(j).some(x => x.pos === 'VERB' || x.pos === 'AUX');
      const verbBefore = toks.slice(0, i).some(x => x.pos === 'VERB' || x.pos === 'AUX');
      const nextIsBe = toks[j] && (toks[j].lemma === 'be');
      nps++;
      const hasNounish = np.some(x => x.pos === 'NOUN' || x.pos === 'PRON' || x.pos === 'PROPN');
      const lastVerb = [...toks.slice(0, i)].reverse().find(x => x.pos === 'VERB' || x.pos === 'AUX');
      const afterBe = lastVerb && lastVerb.lemma === 'be';
      const prevIsAdp = i > 0 && toks[i - 1].pos === 'ADP';
      const INTRANS = new Set(['live', 'go', 'come', 'sit', 'stand', 'walk', 'run', 'arrive', 'sleep', 'die', 'happen', 'exist', 'stay', 'wait', 'work', 'belong', 'depend', 'look', 'listen', 'talk', 'speak', 'laugh', 'smile', 'cry']);
      const intrans = lastVerb && INTRANS.has(lastVerb.lemma);
      if (npJa) outParts.push(npJa + (nps === 1 && verbFollows && !verbBefore ? 'は' : (verbBefore && !nextIsBe && hasNounish && !afterBe && !prevIsAdp && !intrans ? 'を' : '')));
      i = j; continue;
    }
    const g = await tokenGloss(t);
    if (g) outParts.push(g);
    i++;
  }
  return [...outParts, ...verbs].join('').replace(/なである/g, 'である').replace(/いである/g, 'い');
}

// チャンク（役割つき）の訳
async function chunkGloss(result, chunkIndex, folded, role, r = {}) {
  const chunks = result.chunks, tokens = result.tokens;
  const c = { ...chunks[chunkIndex], type: r.kind || chunks[chunkIndex].type, clause: r.clause || chunks[chunkIndex].clause, quote: r.quote || chunks[chunkIndex].quote, wh: r.wh || chunks[chunkIndex].wh };
  const idxs = [...c.tokens, ...(folded || []).flatMap(f => chunks[f].tokens)].sort((a, b) => a - b);
  const toks = idxs.map(i => tokens[i]);
  const text = toks.filter(t => !t.implicit).map(t => t.display).join(' ');
  if (role === 'V' || c.type === 'VP' || c.type === 'VP_be') {
    if (c.type === 'VP_be' && !folded?.length) return { ja: '', text, role };  // be 動詞は補語側で「である」
    return { ja: await verbGloss(tokens, c.tokens), text, role };
  }
  // 前置詞句: 中身 + 前置詞の訳
  if (c.type === 'PP') {
    const prep = tokens[c.tokens[0]];
    const inner = toks.slice(1);
    const innerJa = (await Promise.all(inner.map(tokenGloss))).filter(Boolean).join('');
    const pj = PREP_JA[(prep.display || prep.text).toLowerCase()] ?? '';
    return { ja: innerJa + pj, text, role };
  }
  // 節（従属節・関係詞節・that 節など）: 中を語ごとに訳して、節の種類で語尾を付ける
  const first = toks[0];
  const fw = (first.display || first.text).toLowerCase();
  const inner = await clauseGloss(toks);
  if (c.type === 'SUBCL' && first.pos === 'VERB' && /ing$/.test(first.text)) return { ja: inner.replace(/〔過去〕$/, '') + 'ながら、', text, role };
  if (c.type === 'SUBCL' || (first.pos === 'SCONJ' && fw !== 'that')) return { ja: inner + (SCONJ_JA[fw] ?? '') + '、', text, role };
  if (c.type === 'RELCL' || first.pos === 'REL') return { ja: '（' + inner + 'という）', text, role };
  if (c.type === 'COORDCL') return { ja: '、そして' + inner, text, role };
  if (c.type === 'PAREN' || c.type === 'EXPL' || c.type === 'APPOS') return { ja: '（' + inner + '）', text, role };
  if (c.clause && !c.quote && !c.wh) return { ja: inner.replace(/を$/, '') + 'ということ', text, role };
  if (c.clause && c.wh) return { ja: inner + 'こと', text, role };
  if (c.quote) return { ja: '「' + inner + '」', text, role };
  if (c.infinitive) return { ja: inner + 'こと', text, role };
  if (c.gerund) return { ja: inner + 'こと', text, role };
  return { ja: inner, text, role };
}

// 文全体の構造訳: 日本語の語順（S → M → O → C → V）に並べ替える
export async function sentenceGloss(result) {
  const p = result.pattern;
  if (p.type === 'HEADING') {
    const ja = (await Promise.all(result.tokens.map(tokenGloss))).filter(Boolean).join('');
    return { ja, parts: [], note: '見出し（語の訳を並べたもの）' };
  }
  const folded = new Set(); p.roles.forEach(r => (r.folded || []).forEach(f => folded.add(f)));
  const parts = [];
  for (const r of p.roles) { if (folded.has(r.chunkIndex)) continue; parts.push({ ...(await chunkGloss(result, r.chunkIndex, r.folded, r.role, r)), chunkIndex: r.chunkIndex }); }
  // 役割ごとに助詞を付けて並べ替え
  const S = parts.filter(x => x.role === 'S'), V = parts.filter(x => x.role === 'V'), O = parts.filter(x => x.role === 'O'), C = parts.filter(x => x.role === 'C'), M = parts.filter(x => x.role === 'M' || !x.role);
  const lead = M.filter(x => x.chunkIndex < (V[0]?.chunkIndex ?? 9999));
  const tail = M.filter(x => !lead.includes(x));
  const seg = [];
  const j = x => x.ja;
  const adjTo = x => { const t = j(x); if (/な$/.test(t)) return t.slice(0, -1) + 'に'; if (/[いきしちにひみりぎじぢびぴ]$/.test(t) && /い$/.test(t)) return t.slice(0, -1) + 'く'; return t + 'に'; };
  if (p.type === 'SVOO' && O.length >= 2) {
    seg.push(...S.map(x => j(x) + 'は'), ...lead.map(j), j(O[0]) + 'に', j(O[1]) + 'を', ...tail.map(j), ...V.map(j));
  } else if (p.type === 'SVOC') {
    seg.push(...S.map(x => j(x) + 'は'), ...lead.map(j), ...O.map(x => j(x) + 'を'), ...C.map(adjTo), ...tail.map(j), ...V.map(j));
  } else if (p.ruleId === 'THERE_be') {
    seg.push(...lead.map(j), ...tail.map(j), ...S.map(x => j(x) + 'が'), 'ある');
  } else if (p.type === 'SVC') {
    const LINK_JA = { look: 'に見える', seem: 'に思える', feel: 'に感じる', sound: 'に聞こえる', taste: 'の味がする', smell: 'のにおいがする', become: 'になる', get: 'になる', turn: 'になる', grow: 'になる', remain: 'のままである', stay: 'のままである', keep: 'のままである', appear: 'に見える' };
    const vChunk = V.length ? result.chunks[V[0].chunkIndex] : null;
    const linkV = vChunk && LINK_JA[vChunk.headLemma];
    const vj = V.map(j).filter(Boolean);
    const past = vj.some(x => /〔過去〕/.test(x));
    if (linkV) { let cj = C.map(j).join('').replace(/な$/, ''); if (/[たい]$/.test(cj) && /に/.test(linkV)) cj = cj.replace(/た$/, 'て').replace(/い$/, 'く') ; seg.push(...S.map(x => j(x) + 'は'), ...lead.map(j), ...tail.map(j), cj + linkV.replace(/^に/, /[てく]$/.test(cj) ? '' : 'に') + (past ? '〔過去〕' : '')); }
    else seg.push(...S.map(x => j(x) + 'は'), ...lead.map(j), ...tail.map(j), ...C.map(j), vj.length ? vj.join('') : 'である');
  } else {
    seg.push(...S.map(x => j(x) + 'は'), ...lead.map(j), ...O.map(x => j(x) + 'を'), ...tail.map(j), ...V.map(j));
  }
  let ja = seg.filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/、 /g, '、').trim();
  ja = ja.replace(/なである/g, 'である').replace(/いである/g, 'い').replace(/はである/g, 'がある').replace(/ 愛$/, ' 愛する');
  if (p.type === 'UNKNOWN') ja = '（文型が判定できないため語の訳のみ）' + (await Promise.all(result.tokens.map(tokenGloss))).filter(Boolean).join(' ');
  return { ja, parts, note: '構造訳：役割（S/V/O/C/M）と辞書の 1 義目から機械的に組み立てた直訳です' };
}
