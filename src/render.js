// render.js — 解析結果の描画（色＋記号による役割表示、ホバー／タップのカード）
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
  NUM: '数を表す語。',
  PART: '不定詞の to など。',
  PUNCT: '句読点。'
};

export function renderResult(result, container) {
  const el = document.createElement('div');
  el.className = 'sentence';

  const header = document.createElement('div');
  header.className = 'sentence-head';
  header.innerHTML = `<span class="pattern-badge">${result.pattern.type}</span>
    <span class="pattern-note">${escapeHtml(result.pattern.note)}</span>
    <span class="time">${result.timeMs} ms</span>`;
  el.appendChild(header);

  const line = document.createElement('div');
  line.className = 'tokens';
  // チャンク単位で枠を付け、トークン単位でホバー
  result.chunks.forEach((c, ci) => {
    const r = result.pattern.roles.find(x => x.chunkIndex === ci);
    const span = document.createElement('span');
    const role = r && r.role ? r.role : null;
    span.className = 'chunk' + (role ? ' role-' + role : '');
    if (role) span.dataset.role = role;
    c.tokens.forEach(ti => span.appendChild(tokenEl(result.tokens[ti])));
    if (role) {
      const lab = document.createElement('span');
      lab.className = 'role-label';
      lab.textContent = `${ROLE_MARK[role]} ${role}`;
      span.appendChild(lab);
    }
    line.appendChild(span);
  });
  el.appendChild(line);
  container.appendChild(el);
}

function tokenEl(t) {
  const w = document.createElement('span');
  w.className = 'tok pos-' + t.pos;
  w.textContent = t.text + (t.post || ' ');
  w.tabIndex = 0;
  const show = (ev) => showCard(t, w);
  w.addEventListener('mouseenter', show);
  w.addEventListener('focus', show);
  w.addEventListener('click', show);
  w.addEventListener('mouseleave', hideCard);
  w.addEventListener('blur', hideCard);
  return w;
}

let card = null;
function showCard(t, anchor) {
  if (!card) { card = document.createElement('div'); card.className = 'card-pop'; document.body.appendChild(card); }
  card.innerHTML = `
    <div class="cp-word">${escapeHtml(t.text)}</div>
    <div class="cp-row"><b>品詞</b> ${t.posJa}（${t.pos}）</div>
    <div class="cp-row"><b>原形</b> ${escapeHtml(t.lemma)}</div>
    <div class="cp-row"><b>役割</b> ${t.role ? ROLE_JA[t.role] + '（' + t.role + '）' : '—'}</div>
    <div class="cp-row"><b>訳語</b> <span class="muted">（v0.4 で辞書を導入）</span></div>
    <div class="cp-note">${GRAMMAR_NOTE[t.pos] || ''}</div>`;
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
