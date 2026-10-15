// gloss.js — 構造訳（structure-based gloss）
// 解析結果（文型・役割・チャンク）と英和辞書だけから、機械的に日本語を組み立てる。
// 自然な翻訳ではなく「構造どおりに訳すとこうなる」を示す学習用の直訳。AI モデルは使わない。
//   S → 「〜は」、O → 「〜を」、O（二重目的語の 1 つ目）→ 「〜に」、C → 「〜で（ある）」
//   M（前置詞句）→ 前置詞の訳（in → 〜で、to → 〜へ …）、節 → 「〜ということ」「〜する（名詞）」「〜なので」など
import { lookup } from './dict.js?v=1.0';

const PREP_JA = { in: 'で', on: 'で', at: 'で', to: 'へ', for: 'のために', with: 'と', by: 'によって', from: 'から', of: 'の', about: 'について', into: 'の中へ', over: 'にわたって', under: 'の下で', during: 'の間', after: 'の後', before: 'の前', since: '以来', until: 'まで', through: 'を通して', between: 'の間で', among: 'の間で', without: 'なしで', around: 'のまわりで', across: 'を横切って', along: 'に沿って', near: 'の近くで', against: 'に対して', toward: 'へ向かって', towards: 'へ向かって', like: 'のような', than: 'より', as: 'として', beyond: 'を超えて', within: '以内に', despite: 'にもかかわらず', behind: 'の後ろで', above: 'の上で', below: 'の下で', per: 'あたり', upon: 'の上に', onto: 'の上へ', throughout: 'の間ずっと', off: 'から離れて', out: '外へ' };
const SCONJ_JA = { because: 'ので', if: 'ならば', when: 'とき', while: '間に', although: 'けれども', though: 'けれども', since: 'ので', unless: 'でなければ', until: 'まで', after: 'あとで', before: '前に', whether: 'かどうか', as: 'ように', once: 'したら', whereas: '一方で', that: 'ということ' };
const PRON_JA = { i: '私', you: 'あなた', he: '彼', she: '彼女', it: 'それ', we: '私たち', they: '彼ら', me: '私', him: '彼', her: '彼女', us: '私たち', them: '彼ら', my: '私の', your: 'あなたの', his: '彼の', its: 'その', our: '私たちの', their: '彼らの', this: 'これ', that: 'それ', these: 'これら', those: 'それら', who: '誰', what: '何', which: 'どれ', there: '', one: '人', everyone: 'みんな', everybody: 'みんな', everything: 'すべて', someone: '誰か', something: '何か', nothing: '何も', nobody: '誰も', anything: '何でも', myself: '私自身', himself: '彼自身', herself: '彼女自身', themselves: '彼ら自身', mine: '私のもの', yours: 'あなたのもの' };
const DET_JA = { a: '', an: '', the: '', this: 'この', that: 'あの', these: 'これらの', those: 'あれらの', some: 'いくつかの', any: 'どんな', every: 'すべての', each: 'それぞれの', no: '〜ない', all: 'すべての', both: '両方の', many: '多くの', much: '多くの', few: '少しの', several: 'いくつかの', such: 'そのような', another: '別の', other: '他の', most: 'ほとんどの', half: '半分の', enough: '十分な' };
const AUX_JA = { can: '〜できる', could: '〜できた', may: '〜かもしれない', might: '〜かもしれない', must: '〜しなければならない', shall: '〜しよう', should: '〜すべきだ', will: '〜だろう', would: '〜だろう', ought: '〜すべきだ' };
const ROLE_PARTICLE = { S: 'は', O: 'を', O2: 'に', C: 'である', V: '' };

// 辞書の 1 義目が学習向きでない基本語の上書き（品詞ごと）。根拠: 中学・高校英語での最頻義
const OVERRIDE = {
  ADJ: { tired: '疲れた', happy: '幸せな', right: '正しい', fine: '元気な', kind: '親切な', well: '元気な', late: '遅い', hard: '難しい', last: '最後の', present: '現在の', close: '近い', light: '軽い', mean: '意地悪な', free: '自由な', even: '平らな', poor: '貧しい', own: '自分自身の', major: '主要な', little: '小さい', few: '少ない', more: 'もっと多くの', most: 'もっとも多くの', such: 'そのような', next: '次の', same: '同じ', only: '唯一の', real: '本当の', sure: '確かな', busy: '忙しい', able: 'できる', likely: 'ありそうな', simple: '簡単な', social: '社会的な', physical: '身体的な', modest: 'ささやかな', digital: 'デジタルの', online: 'オンラインの', offline: 'オフラインの', electronic: '電子の', mental: '精神的な', overall: '全体的な', entire: 'まるまるの', conscious: '意識的な', healthy: '健全な', significant: '大きな', manageable: '管理しやすい', convenient: '便利な', brief: '短い', constant: '絶え間ない', increased: '増えた', reduced: '減った', 'non-stop': 'ノンストップの', 'hyper-connected': '常時接続の', 'phone-free': 'スマホ禁止の', 'late-night': '深夜の', 'face-to-face': '対面の', 'well-known': 'よく知られた', 'long-term': '長期の', 'short-term': '短期の', 'so-called': 'いわゆる', 'full-time': '常勤の', 'part-time': '非常勤の', 'high-quality': '高品質の', 'old-fashioned': '昔風の', 'self-driving': '自動運転の', 'low-cost': '低コストの', 'man-made': '人工の', 'well-being': '幸福', 'up-to-date': '最新の', 'large-scale': '大規模な', 'small-scale': '小規模な', 'eco-friendly': '環境にやさしい', 'user-friendly': '使いやすい', 'world-famous': '世界的に有名な', 'one-way': '一方通行の', 'first-hand': '直接の', 'everyday': '日常の', 'physical': '物理的な', 'available': '利用できる', 'various': 'さまざまな', 'certain': 'ある', 'common': '共通の', 'current': '現在の', 'due': 'による', 'former': '以前の', 'global': '世界的な', 'local': '地域の', 'main': '主な', 'natural': '自然な', 'negative': '否定的な', 'positive': '肯定的な', 'recent': '最近の', 'similar': '似た', 'specific': '特定の', 'traditional': '伝統的な', 'whole': '全体の' },
  NOUN: { man: '男', kind: '種類', mean: '平均', well: '井戸', right: '権利', light: '光', present: '贈り物', fine: '罰金', leaves: '葉', work: '仕事', play: '劇', study: '研究', change: '変化', need: '必要', use: '使用', part: '部分', way: '方法', effect: '効果', result: '結果', cause: '原因', end: '終わり', people: '人々', person: '人々', world: '世界', problem: '問題', question: '質問', letter: '手紙', time: '時間', day: '日', life: '生活', thing: '物', place: '場所', year: '年', word: '言葉', number: '数', water: '水', money: 'お金', food: '食べ物', city: '都市', country: '国', family: '家族', friend: '友達', teacher: '先生', student: '学生', school: '学校', book: '本', car: '車', house: '家', home: '家', morning: '朝', night: '夜', experiment: '実験', debate: '議論', habit: '習慣', nature: '自然', pattern: '傾向', solution: '解決策', benefit: '利点', space: '空間', area: '地域', quality: '質', project: '計画', group: '集団', goal: '目標', team: 'チーム', participant: '参加者', critic: '批評家', planner: '計画者', commuter: '通勤者', income: '収入', mood: '気分', stress: 'ストレス', neighbor: '隣人', trip: '移動', jam: '渋滞', brain: '脳', chemical: '化学物質', exercise: '運動', study: '研究', finding: '発見',  live: '生活', lives: '生活', screen: '画面', detox: 'デトックス', smartphone: 'スマートフォン', internet: 'インターネット', weekend: '週末', device: '機器', notification: '通知', interaction: 'やり取り', access: 'アクセス', price: '代償', expert: '専門家', others: '他の人々', zone: '区域', energy: 'エネルギー', control: '制御', obligation: '義務', expectation: '期待', communication: 'コミュニケーション', anxiety: '不安', attention: '注目', span: '持続時間', challenge: '課題', concept: '概念', response: '対応', example: '例', break: '休憩', dinner: '夕食', boundary: '境界', individual: '個人', feeling: '感覚', technology: '科学技術', relationship: '関係', passage: '文章', reading: '読解', rethinking: '再考', choice: '選択', sleep: '睡眠', 'well-being': '幸福', interest: '興味', research: '研究', information: '情報', environment: '環境', society: '社会', government: '政府', company: '会社', business: '事業', service: 'サービス', system: 'システム', process: '過程', development: '発展', population: '人口', community: '地域社会', culture: '文化', language: '言語', health: '健康', product: '製品', market: '市場', industry: '産業', resource: '資源', education: '教育', knowledge: '知識', skill: '技能', experience: '経験', opportunity: '機会', issue: '問題', role: '役割', impact: '影響', influence: '影響', purpose: '目的', reason: '理由', approach: '取り組み方', condition: '状態', situation: '状況', evidence: '証拠', data: 'データ', level: '水準', amount: '量', rate: '割合', percent: 'パーセント', century: '世紀', decade: '10年間', generation: '世代', adult: '大人', child: '子ども', children: '子どもたち', parent: '親', researcher: '研究者', scientist: '科学者', user: '利用者', consumer: '消費者', customer: '顧客', worker: '労働者', employee: '従業員', 'screen time': '画面を見る時間' },
  VERB: { bark: '吠える', love: '愛する', rise: '昇る', stop: '止まる', like: '好む', mean: '意味する', leave: '去る', kind: '', well: '', right: '', fine: '', light: '照らす', present: '示す', close: '閉じる', work: '働く', play: '遊ぶ', study: '勉強する', change: '変える', need: '必要とする', use: '使う', look: '見る', make: '作る', get: '得る', take: '取る', give: '与える', go: '行く', come: '来る', see: '見る', know: '知っている', think: '思う', want: '欲する', say: '言う', tell: '伝える', find: '見つける', become: 'なる', keep: '保つ', let: 'させる', help: '助ける', show: '見せる', feel: '感じる', seem: '思われる', begin: '始まる', start: '始める', call: '呼ぶ', try: '試みる', ask: '尋ねる', turn: '変わる', run: '走る', live: '住む', walk: '歩く', meet: '会う', read: '読む', write: '書く', learn: '学ぶ', teach: '教える', buy: '買う', send: '送る', bring: '持ってくる', open: '開ける', hear: '聞く', believe: '信じる', hope: '望む', remember: '覚えている', remind: '思い出させる', offer: '提供する', involve: '含む', promote: '促進する', reduce: '減らす', gain: '得る', expand: '広がる', replace: '置き換える', absorb: '吸収する', release: '放出する', bring_together: '結びつける', set: '置く', experience: '経験する', encourage: '奨励する', choose: '選ぶ', stay: 'とどまる', improve: '改善する', enhance: '高める', boost: '高める', practice: '実践する', suggest: '提案する', create: '作る', regain: '取り戻す', gather: '集める', establish: '築く', abandon: '捨てる', overwhelm: '圧倒する', spend: '過ごす', rethink: '考え直す', increase: '増やす', decrease: '減らす', develop: '発展させる', provide: '提供する', require: '必要とする', allow: '許す', enable: '可能にする', consider: '考える', continue: '続ける', produce: '生産する', protect: '守る', prevent: '防ぐ', affect: '影響する', cause: '引き起こす', lead: '導く', follow: '従う', include: '含む', support: '支える', suffer: '苦しむ', achieve: '達成する', avoid: '避ける', build: '建てる', decide: '決める', depend: '頼る', describe: '描く', discover: '発見する', explain: '説明する', express: '表す', face: '直面する', focus: '集中する', introduce: '導入する', maintain: '維持する', manage: '管理する', notice: '気づく', perform: '行う', prepare: '準備する', realize: '気づく', receive: '受け取る', recognize: '認識する', reflect: '反映する', remain: '残る', report: '報告する', represent: '表す', respond: '応じる', result: '結果になる', share: '共有する', spread: '広がる', struggle: '苦労する', succeed: '成功する', survive: '生き残る', tend: '傾向がある', waste: '無駄にする', wonder: '不思議に思う', worry: '心配する', access: '利用する', connect: 'つなぐ', interact: 'やり取りする', communicate: '意思を伝える', download: 'ダウンロードする', post: '投稿する', search: '検索する', scroll: 'スクロールする', check: '確認する' },
  ADV: { well: 'うまく', right: 'ちょうど', hard: '一生懸命に', late: '遅く', even: '〜さえ', only: '〜だけ', just: 'ちょうど', still: 'まだ', also: '〜も', already: 'すでに', often: 'しばしば', sometimes: '時々', always: 'いつも', never: '決して〜ない', here: 'ここに', there: 'そこに', home: '家に', together: '一緒に', alone: '一人で', again: '再び', soon: 'すぐに', now: '今', then: 'その時', today: '今日', yesterday: '昨日', tomorrow: '明日', later: '後で', interestingly: '興味深いことに', furthermore: 'さらに', additionally: 'さらに', however: 'しかし', therefore: 'したがって', first: 'まず', alone: '一人で', equally: '等しく', constantly: '絶えず', intentionally: '意図的に', altogether: '完全に', instead: '代わりに', far: 'はるかに', more: 'もっと', how: 'どのように', why: 'なぜ', where: 'どこで', when: 'いつ', very: 'とても', really: '本当に', quite: 'かなり', rather: 'むしろ', almost: 'ほとんど', nearly: 'ほぼ', especially: '特に', particularly: '特に', generally: '一般に', usually: 'ふつう', recently: '最近', finally: '最後に', eventually: '結局', increasingly: 'ますます', significantly: '著しく', simply: '単に', directly: '直接', easily: '容易に', quickly: 'すぐに', slowly: 'ゆっくり', carefully: '注意深く', clearly: 'はっきりと', probably: 'たぶん', perhaps: 'おそらく', actually: '実際に', thus: 'このように', moreover: 'さらに', nevertheless: 'それにもかかわらず', otherwise: 'さもなければ', meanwhile: 'その間に', indeed: '実に', rarely: 'めったに〜ない', seldom: 'めったに〜ない', ever: 'これまでに', once: '一度', twice: '二度', away: '離れて', back: '戻って', forward: '前へ', abroad: '海外に', overseas: '海外に', online: 'オンラインで', offline: 'オフラインで', aside: 'わきに', off: '離れて', up: '上へ', down: '下へ', out: '外へ' }
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
  x = x.replace(/^=[a-z\-]+\s*\d*\s*/, '').replace(/^[,，、;；・\s]+/, '').split(/[,，、;；・]/)[0].replace(/\s*\d+$/, '').trim();
  x = x.replace(/^…?(を|に|と|の|が|へ|で|から)/, '').replace(/^…/, '').trim();
  x = x.replace(/^[〈〉《》…]+/, '').replace(/[〈《]$/, '');
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
  if (t.pos === 'DET') { if (/'s$/.test(w)) { const b = w.replace(/'s$/, ''); const bj = OVERRIDE.ADV[b] || OVERRIDE.NOUN[b] || PRON_JA[b] || (await gloss(b, b)) || b; return bj.replace(/の$/, '') + 'の'; } return DET_JA[w] ?? (await gloss(w, t.lemma)) ?? ''; }
  if (t.pos === 'PRON') { if ((t.tags || []).includes('Possessive') && w === 'her') return '彼女の'; return PRON_JA[w] ?? (await gloss(w, t.lemma)) ?? w; }
  if (t.pos === 'AUX') return '';            // 助動詞は動詞側でまとめる
  if (t.pos === 'PART') return w === 'not' ? '〜ない' : '';
  if (t.pos === 'ADP') return '';            // 前置詞は句の末尾に付ける
  if (t.pos === 'CCONJ') return w === 'and' ? 'と' : w === 'or' ? 'または' : w === 'but' ? 'しかし' : '';
  if (t.pos === 'SCONJ' || t.pos === 'REL') return '';
  if (t.pos === 'NUM') return w;
  if (t.pos === 'PROPN') return (t.display || t.text) + ' ';   // 固有名詞は英語のまま（連続する固有名詞の間に空白）
  const ov = OVERRIDE[t.pos] && (OVERRIDE[t.pos][w] ?? OVERRIDE[t.pos][(t.lemma || '').toLowerCase()]);
  if (ov) return ov;
  // 動名詞が名詞扱いになった語（abandoning, rethinking …）: 動詞の訳＋「こと」
  const lk0 = (t.pos === 'NOUN' || t.pos === 'VERB') && /ing$/.test(w) ? await lookup(w, w) : null;
  if (/ing$/.test(w) && ((t.pos === 'VERB' && !OVERRIDE.VERB[w]) || (t.pos === 'NOUN' && (!lk0 || lk0.headword !== w)))) {
    const stem = w.replace(/ing$/, '');
    const vs = OVERRIDE.VERB[stem] || OVERRIDE.VERB[stem + 'e'] || (await verbSense(stem, stem)) || (await verbSense(stem + 'e', stem + 'e'));
    if (vs) return t.pos === 'NOUN' ? vs + 'こと' : vs;
  }
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
  // ハイフン語: 部分ごとに訳して「-」でつなぐ（例: eco-friendly → 環境-友好的な）
  if (w.includes('-')) {
    const parts = await Promise.all(w.split('-').filter(Boolean).map(async p => OVERRIDE.ADJ[p] || OVERRIDE.NOUN[p] || OVERRIDE.ADV[p] || (await gloss(p, p)) || p));
    return parts.join('-');
  }
  return t.display || t.text;
}

// 動詞句の訳: 辞書の訳 + 時制・助動詞・否定・受動・進行
const PHRASAL_JA = { 'turn off': '消す', 'turn on': 'つける', 'set aside': '取っておく', 'give up': 'あきらめる', 'pick up': '拾う', 'put on': '身につける', 'take off': '脱ぐ', 'look for': '探す', 'look after': '世話をする', 'look at': '見る', 'find out': '見つけ出す', 'bring up': '育てる', 'carry out': '実行する', 'point out': '指摘する', 'go on': '続ける', 'come back': '戻る', 'get up': '起きる', 'wake up': '目覚める', 'grow up': '成長する', 'put off': '延期する', 'take care': '世話をする', 'figure out': '理解する', 'work out': 'うまくいく', 'end up': '結局〜になる', 'come up': '出てくる', 'set up': '設立する', 'cut down': '減らす', 'cut off': '切り離す', 'take part': '参加する', 'get rid': '取り除く', 'make up': '構成する', 'break down': '故障する', 'show up': '現れる', 'stand out': '目立つ', 'run out': '使い果たす', 'keep up': '維持する', 'hand in': '提出する', 'fill in': '記入する', 'log in': 'ログインする', 'sign up': '登録する', 'switch off': '消す', 'shut down': '停止する' };
async function verbGloss(tokens, idxs, afterTok) {
  const toks = Array.isArray(idxs) && idxs.length && typeof idxs[0] === 'object' ? idxs : idxs.map(i => tokens[i]);
  const head = [...toks].reverse().find(t => t.pos === 'VERB') || toks[toks.length - 1];
  const hl = (head.lemma || head.display || head.text).toLowerCase();
  // 句動詞: 動詞句の直後（または動詞句内）の小辞・前置詞と組み合わせて辞書を引く
  const hi = toks.indexOf(head);
  const partTok = toks.slice(hi + 1).find(t => t.pos === 'PART' || t.pos === 'ADP' || t.pos === 'ADV') || afterTok;
  const phr = partTok && PHRASAL_JA[hl + ' ' + (partTok.display || partTok.text).toLowerCase()];
  const stem = /ing$/.test(hl) ? hl.replace(/ing$/, '') : null;
  const ovv = phr || OVERRIDE.VERB[hl] || OVERRIDE.VERB[(head.display || head.text).toLowerCase()] || (stem && (OVERRIDE.VERB[stem] || OVERRIDE.VERB[stem + 'e'] || OVERRIDE.VERB[stem.replace(/([a-z])\1$/, '$1')]));
  let base = head.lemma === 'be' ? 'である' : (ovv || (await verbSense((head.display || head.text).toLowerCase(), head.lemma)) || head.lemma || head.text);
  base = base.replace(/^…を|^…に|^…と|^…の/, '');       // 「…を見る」→「見る」
  const auxes = toks.filter(t => t.pos === 'AUX').map(t => (t.display || t.text).toLowerCase());
  const neg = toks.some(t => t.pos === 'PART' && /^(not|n't)$/.test((t.display || t.text).toLowerCase()));
  const passive = toks.some(t => t !== head && t.lemma === 'be') && (head.tags || []).some(x => x === 'PastTense' || x === 'Participle') && !/ing$/.test(head.text);
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
      if (!inner.length && toks[j] && toks[j].pos === 'VERB') { i = j; continue; }   // of being … → 前置詞は省く
      outParts.push(innerJa + (PREP_JA[(t.display || t.text).toLowerCase()] ?? ''));
      i = j; continue;
    }
    if (t.pos === 'VERB' || t.pos === 'AUX' || (t.pos === 'PART' && /^(not|n't)$/.test((t.display || t.text).toLowerCase()))) {
      // 動詞句をまとめる
      let j = i; const grp = [];
      while (j < toks.length && (toks[j].pos === 'VERB' || toks[j].pos === 'AUX' || (toks[j].pos === 'PART' && /^(not|n't|to)$/.test((toks[j].display || toks[j].text).toLowerCase())) || (toks[j].pos === 'ADV' && j + 1 < toks.length && toks[j + 1].pos === 'VERB'))) { grp.push(toks[j]); j++; }
      const nxt = toks[j] && (toks[j].pos === 'PART' || toks[j].pos === 'ADV' || toks[j].pos === 'ADP') ? toks[j] : null;
      const vh = [...grp].reverse().find(t => t.pos === 'VERB') || grp[grp.length - 1];
      const isPhr = nxt && PHRASAL_JA[(vh.lemma || vh.text).toLowerCase() + ' ' + (nxt.display || nxt.text).toLowerCase()];
      verbs.push(await verbGloss(null, grp, nxt));
      i = isPhr && nxt.pos !== 'ADP' ? j + 1 : j; continue;
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
  return [...outParts, ...verbs].join('').replace(/なである/g, 'である').replace(/いである/g, 'い').replace(/するできる/g, 'できる').replace(/する（される）/g, 'される');
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
    const last = c.tokens[c.tokens.length - 1]; const after = tokens[last + 1];
    return { ja: await verbGloss(tokens, c.tokens, after && (after.pos === 'PART' || after.pos === 'ADV' || after.pos === 'ADP') ? after : null), text, role };
  }
  // 前置詞句: 中身 + 前置詞の訳
  if (c.type === 'PP') {
    const prep = tokens[c.tokens[0]];
    let inner = toks.slice(1);
    const pj = PREP_JA[(prep.display || prep.text).toLowerCase()] ?? '';
    // "In 1998" のように数値が別チャンク（ADVP/NP）になった場合は、次のチャンクを前置詞の中身として取り込む
    if (!inner.length && chunks[chunkIndex + 1] && ['ADVP', 'NP'].includes(chunks[chunkIndex + 1].type) && chunks[chunkIndex + 1].tokens.every(k => tokens[k].pos === 'NUM' || tokens[k].pos === 'PROPN')) {
      inner = chunks[chunkIndex + 1].tokens.map(k => tokens[k]); (result._glossSkip ||= new Set()).add(chunkIndex + 1);
    }
    const innerJa = (await Promise.all(inner.map(tokenGloss))).filter(Boolean).join('');
    return { ja: innerJa + pj, text, role };
  }
  // 節（従属節・関係詞節・that 節など）: 中を語ごとに訳して、節の種類で語尾を付ける
  const first = toks[0];
  const fw = (first.display || first.text).toLowerCase();
  const inner = await clauseGloss(toks);
  if (c.type === 'SUBCL' && first.pos === 'VERB' && /ing$/.test(first.text)) return { ja: inner.replace(/〔過去〕$/, '') + 'ながら、', text, role };
  if (c.type === 'SUBCL' || (first.pos === 'SCONJ' && fw !== 'that')) return { ja: inner + (SCONJ_JA[fw] ?? '') + '、', text, role };
  if (c.type === 'RELCL' || first.pos === 'REL') return { ja: '（' + inner + 'という）', text, role };
  if (c.type === 'COORDCL') return { ja: '、そして' + inner.replace(/^(と|または|しかし)/, ''), text, role };
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
    const toks = result.tokens.filter(t => !t.implicit);
    const words = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.pos === 'ADP') { const inner = []; let j = i + 1; while (j < toks.length && ['DET', 'ADJ', 'NOUN', 'PROPN', 'PRON', 'NUM'].includes(toks[j].pos)) { inner.push(toks[j]); j++; }
        words.push((await Promise.all(inner.map(tokenGloss))).filter(Boolean).join('') + (PREP_JA[(t.display || t.text).toLowerCase()] ?? '')); i = j - 1; continue; }
      const g = await tokenGloss(t); if (g) words.push(g);
    }
    const ja = words.join(' ').replace(/^読解 文章 ?/, '読解文： ').replace(/^(文章|本文) /, '本文： ');
    return { ja, parts: [], note: '見出し（語の訳を並べたもの）' };
  }
  // 役割に含まれないチャンク（並列述語の後半など）は、直前の役割に畳み込んで訳に含める
  const roles = p.roles.map(r => ({ ...r, folded: [...(r.folded || [])] }));
  const covered = new Set(); roles.forEach(r => { covered.add(r.chunkIndex); r.folded.forEach(f => covered.add(f)); });
  for (let k = 0; k < result.chunks.length; k++) {
    if (covered.has(k)) continue;
    const ct = result.chunks[k].type; if (ct === 'PUNCT' || ct === 'X') continue;
    let best = null, bestMax = -1;
    for (const r of roles) { const mx = Math.max(r.chunkIndex, ...r.folded); if (mx < k && mx > bestMax) { best = r; bestMax = mx; } }
    if (best) { best.folded.push(k); covered.add(k); }
  }
  const folded = new Set(); roles.forEach(r => r.folded.forEach(f => folded.add(f)));
  const parts = [];
  result._glossSkip = new Set();
  for (const r of roles) { if (folded.has(r.chunkIndex) || result._glossSkip.has(r.chunkIndex)) continue; parts.push({ ...(await chunkGloss(result, r.chunkIndex, r.folded, r.role, r)), chunkIndex: r.chunkIndex }); }
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
  let ja = seg.filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/、 /g, '、').replace(/ (は|を|に|が|と|の|へ|で|から|である|という|こと)(?= |$)/g, '$1').trim();
  ja = ja.replace(/なである/g, 'である').replace(/いである/g, 'い').replace(/はである/g, 'がある').replace(/ 愛$/, ' 愛する').replace(/するできる/g, 'できる').replace(/する（される）/g, 'される');
  if (p.type === 'UNKNOWN') ja = '（文型が判定できないため語の訳のみ）' + (await Promise.all(result.tokens.map(tokenGloss))).filter(Boolean).join(' ');
  return { ja, parts, note: '構造訳：役割（S/V/O/C/M）と辞書の 1 義目から機械的に組み立てた直訳です' };
}
