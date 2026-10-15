// render.js — 解析結果の描画（色＋記号による役割表示、ホバー／タップのカード、長文向けの文カード）
import { lookup } from './dict.js?v=0.9';

const ROLE_JA = { S: '主語', V: '動詞', O: '目的語', C: '補語', M: '修飾語' };
const ROLE_MARK = { S: '○', V: '□', O: '△', C: '◇', M: '…' };
const GRAMMAR_NOTE = {
  NOUN: '人・物・事を表す語。主語・目的語・補語になれる。',
  PROPN: '固有名詞。人名・地名など。',
  PRON: '名詞の代わりをする語（I, you, it など）。',
  VERB: '動作・状態を表す語。文の中心。',
  AUX: '動詞を助ける語（be, have, do, 法助動詞 can/will など）。',
  ADJ: '名詞を説明する語。補語にもなる。',
  ADV: '動詞・形容詞・文全体を修飾する語。',
  ADP: '前置詞。後ろに名詞句を取り、全体で修飾語になる。',
  DET: '限定詞（a, the, this, my など）。名詞の前に付く。',
  CCONJ: '等位接続詞（and, but, or）。対等なものをつなぐ。',
  SCONJ: '従属接続詞（that, because, if など）。節を導く。',
  REL: '関係詞（who, which, that, where など）。直前の名詞を説明する節を導く。',
  NUM: '数を表す語。',
  PART: '不定詞の to、否定の not、句動詞の小辞など。',
  INTJ: '間投詞。',
  PUNCT: '句読点。'
};
// 変形・畳み込みの名前（patterns.js の transforms）→ 表示名
const TRANSFORM_JA = {
  question_inversion: '疑問文の語順', question_inversion_be: 'be 疑問文', wh_object: 'wh 疑問文', wh_adverb: 'wh 疑問文', wh_subject: '主語の疑問詞',
  negative_inversion: '倒置', relative_clause: '関係詞節', participle_modifier: '分詞の後置修飾', participial_construction: '分詞構文',
  subordinate_clause: '従属節', that_clause: 'that 節', that_omitted: 'that 省略', wh_clause: 'wh 節', wh_clause_in_pp: '前置詞＋wh 節',
  compound_sentence: '重文', coordinated_predicate: '並列述語', the_comparative: 'the 比較級', cleft_clause: '強調構文',
  quotation: '引用', quote_merge: '引用', reporting_inversion: '伝達の倒置', reporting_order: '伝達', parenthesis: '括弧', dash_insert: 'ダッシュ挿入',
  colon_explanation: 'コロン以降は補足', leading_adverbial: '文頭の副詞句', leading_clause: '文頭の節', appositive: '同格', postnominal_adjective: '形容詞の後置修飾', infinitive_modifier: '不定詞の形容詞的用法', whether_subject: 'whether 節の主語', if_clause_object: 'if/whether 節', negative_inversion: '倒置', contact_clause: '接触節（関係詞省略）', gerund_after_adjective: '形容詞＋動名詞'
};
const CHUNK_JA = { APPOS: '同格', RELCL: '関係詞節', SUBCL: '従属節', COORDCL: '並列節', PAREN: '挿入', EXPL: '補足', LEADM: '文頭の副詞句', PP: '前置詞句', ADVP: '副詞（句）' };

export function renderResult(result, container, opts = {}) {
  const el = document.createElement('div');
  el.className = 'sentence' + (result.pattern.type === 'UNKNOWN' ? ' unknown' : '') + (result.pattern.type === 'HEADING' ? ' heading' : '');
  if (result.index) el.id = 's' + result.index;

  const header = document.createElement('div');
  header.className = 'sentence-head';
  const num = result.index ? `<span class="snum">${result.paragraph ? result.paragraph + '-' : ''}${result.index}</span>` : '';
  const tf = [...new Set((result.pattern.transforms || []).map(t => TRANSFORM_JA[t]).filter(Boolean))].map(t => `<span class="chip">${t}</span>`).join('');
  header.innerHTML = `${num}<span class="pattern-badge ${result.pattern.type === 'UNKNOWN' ? 'unk' : ''}">${result.pattern.type === 'UNKNOWN' ? '判定不能' : result.pattern.type === 'HEADING' ? '見出し' : result.pattern.type}</span>
    <span class="pattern-note">${escapeHtml(result.pattern.note)}</span>${tf}${result.fragment ? '<span class="chip muted">；で区切った節</span>' : ''}
    <span class="time">${result.timeMs} ms</span>`;
  el.appendChild(header);

  const line = document.createElement('div');
  line.className = 'tokens';
  const folded = new Set();
  result.pattern.roles.forEach(r => (r.folded || []).forEach(f => folded.add(f)));
  result.chunks.forEach((c, ci) => {
    if (folded.has(ci)) return; // 畳み込まれた節は親チャンクの中で描く
    const r = result.pattern.roles.find(x => x.chunkIndex === ci);
    const role = r && r.role ? r.role : null;
    const idxs = [...c.tokens, ...((r && r.folded) || []).flatMap(f => result.chunks[f].tokens)].sort((a, b) => a - b);
    const span = document.createElement('span');
    span.className = 'chunk' + (role ? ' role-' + role : '');
    if (role) span.dataset.role = role;
    const subType = r && r.folded && r.folded.length && role === 'M' ? (CHUNK_JA[result.chunks[ci].type] || '') : '';
    idxs.forEach(ti => { const tok = tokenEl(result.tokens[ti]); if (tok) span.appendChild(tok); });
    if (role) {
      const lab = document.createElement('span');
      lab.className = 'role-label';
      lab.textContent = `${ROLE_MARK[role]} ${role}${subType ? '・' + subType : ''}`;
      span.appendChild(lab);
    }
    line.appendChild(span);
  });
  el.appendChild(line);
  if (opts.treeSlot) { const slot = document.createElement('div'); slot.className = 'tree-slot'; el.appendChild(slot); }
  container.appendChild(el);
  return el;
}

function tokenEl(t) {
  if (t.implicit) return null; // 短縮形の 2 つ目（didn't の not）は表示しない
  const w = document.createElement('span');
  w.className = 'tok pos-' + t.pos;
  w.textContent = (t.pre || '') + t.display + (t.post || ' ');
  w.tabIndex = 0;
  const show = () => showCard(t, w);
  w.addEventListener('mouseenter', show);
  w.addEventListener('focus', show);
  w.addEventListener('click', show);
  w.addEventListener('mouseleave', hideCard);
  w.addEventListener('blur', hideCard);
  return w;
}

let card = null, cardSeq = 0;
function showCard(t, anchor) {
  if (!card) { card = document.createElement('div'); card.className = 'card-pop'; document.body.appendChild(card); }
  card.innerHTML = `
    <div class="cp-word">${escapeHtml(t.display)}</div>
    <div class="cp-row"><b>品詞</b> ${t.posJa}（${t.pos}）</div>
    <div class="cp-row"><b>原形</b> ${escapeHtml(t.lemma)}</div>
    <div class="cp-row"><b>役割</b> ${t.role ? ROLE_JA[t.role] + '（' + t.role + '）' : '—'}</div>
    <div class="cp-row"><b>訳語</b> <span class="cp-gloss muted">…</span></div>
    <div class="cp-note">${GRAMMAR_NOTE[t.pos] || ''}</div>`;
  const glossEl = card.querySelector('.cp-gloss');
  const myCard = ++cardSeq;
  lookup(t.display, t.lemma).then(g => {
    if (myCard !== cardSeq || !glossEl) return;
    glossEl.textContent = g ? g.gloss + (g.headword !== t.display.toLowerCase() ? `（${g.headword}）` : '') : '（辞書に無い語）';
    glossEl.classList.remove('muted');
  });
  const r = anchor.getBoundingClientRect();
  card.style.display = 'block';
  const top = r.bottom + window.scrollY + 6;
  let left = r.left + window.scrollX;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - card.offsetWidth - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);
  card.style.top = top + 'px'; card.style.left = left + 'px';
}
function hideCard() { if (card) card.style.display = 'none'; }

export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export { ROLE_JA, ROLE_MARK };
