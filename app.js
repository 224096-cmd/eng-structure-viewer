import { loadRules, analyzeSentence, splitSentencesWithMeta } from './src/analyzer.js?v=0.8';
import { renderResult } from './src/render.js?v=0.8';
import { renderTree } from './src/tree.js?v=0.8';
import { prefetch } from './src/dict.js?v=0.8';
import { sentenceGloss } from './src/gloss.js?v=0.8';

const $ = id => document.getElementById(id);
const PATTERNS = ['SV', 'SVC', 'SVO', 'SVOO', 'SVOC', 'HEADING', 'UNKNOWN'];
let lastResults = null;
let running = false;

async function init() {
  try {
    await loadRules();
    $('status').textContent = '準備完了。「解析」を押してください。';
    $('run').disabled = false;
    run();
  } catch (e) {
    $('status').textContent = '規則ファイルの読み込みに失敗しました: ' + e.message;
  }
}

let lastGloss = {};
async function run() {
  lastGloss = {};
  if (running) return;
  const text = $('input').value.trim();
  const level = Number($('level').value);
  const out = $('output');
  out.innerHTML = ''; $('summary').innerHTML = ''; $('summary').style.display = 'none';
  if (!text) { $('status').textContent = '英文を入力してください。'; return; }
  running = true; $('run').disabled = true;
  const sents = splitSentencesWithMeta(text);
  const words = text.split(/\s+/).length;
  const long = sents.length > 4;                      // 長文モード: 構造図は折りたたみ
  const treeMode = $('treeMode').value;               // always / fold / never
  const showTreeInline = treeMode === 'always' || (treeMode === 'fold' && !long);
  const t0 = performance.now();
  lastResults = [];
  let curPara = 0;
  for (let i = 0; i < sents.length; i++) {
    const s = sents[i];
    if (s.paragraph !== curPara) {
      curPara = s.paragraph;
      if (sents[sents.length - 1].paragraph > 1) { const h = document.createElement('div'); h.className = 'para-head'; h.textContent = `段落 ${curPara}`; out.appendChild(h); }
    }
    const r = { ...analyzeSentence(s.text, level), paragraph: s.paragraph, index: s.index, fragment: s.fragment };
    // 判定不能のとき、上のレベルなら判定できるかを裏で試す
    if (r.pattern.type === 'UNKNOWN' && level < 3) {
      for (let lv = level + 1; lv <= 3; lv++) { const alt = analyzeSentence(s.text, lv); if (alt.pattern.type !== 'UNKNOWN') { r.altLevel = lv; r.altPattern = alt.pattern.type; break; } }
    }
    lastResults.push(r);
    const el = renderResult(r, out, { treeSlot: true });
    if (r.altLevel) {
      const hint = document.createElement('div'); hint.className = 'hint';
      hint.innerHTML = `対象レベルを <b>${r.altLevel}</b> にすると <b>${r.altPattern}</b> と判定されます。`;
      const b = document.createElement('button'); b.textContent = `レベル ${r.altLevel} で解析し直す`; b.className = 'tree-btn';
      b.onclick = () => { $('level').value = String(r.altLevel); run(); };
      hint.appendChild(b); el.appendChild(hint);
    }
    const slot = el.querySelector('.tree-slot');
    if (showTreeInline) renderTree(r, slot);
    else if (treeMode !== 'never') {
      const b = document.createElement('button'); b.className = 'tree-btn'; b.textContent = '構造図を表示';
      b.onclick = () => { if (slot.querySelector('svg')) { slot.querySelector('.tree').remove(); b.textContent = '構造図を表示'; } else { renderTree(r, slot); b.textContent = '構造図を閉じる'; } };
      slot.appendChild(b);
    }
    prefetch(r.tokens);
    if ($('showGloss').checked) {
      const g = document.createElement('div'); g.className = 'gloss'; g.innerHTML = '<span class="gl-label">構造訳</span><span class="gl-text muted">…</span>';
      el.insertBefore(g, slot);
      sentenceGloss(r).then(res => { lastGloss[r.index] = res.ja; g.querySelector('.gl-text').textContent = res.ja; g.querySelector('.gl-text').classList.remove('muted'); g.title = res.note; });
    }
    if (i % 8 === 7) { $('status').textContent = `解析中… ${i + 1}/${sents.length} 文`; await new Promise(res => setTimeout(res, 0)); }
  }
  const total = Math.round((performance.now() - t0) * 10) / 10;
  renderSummary(lastResults, words, sents.length, total, level);
  $('status').textContent = `${sents.length} 文（${words} 語）を解析：合計 ${total} ms、1 文あたり ${(total / sents.length).toFixed(2)} ms（レベル ${level}）`;
  $('download').disabled = false;
  running = false; $('run').disabled = false;
}

function renderSummary(results, words, nSent, totalMs, level) {
  const counts = {}; PATTERNS.forEach(p => counts[p] = 0);
  results.forEach(r => counts[r.pattern.type] = (counts[r.pattern.type] || 0) + 1);
  const paras = new Set(results.map(r => r.paragraph)).size;
  const sum = $('summary');
  sum.style.display = '';
  sum.innerHTML = `<div class="metrics">
      <span class="metric">${words} 語 / ${nSent} 文 / ${paras} 段落</span>
      <span class="metric">合計 <b>${totalMs}</b> ms</span>
      <span class="metric">判定不能 <b>${counts.UNKNOWN}</b> 文</span>
    </div>
    <div class="pattern-counts">${PATTERNS.map(p => `<button class="pc ${p === 'UNKNOWN' ? 'unk' : ''}" data-p="${p}">${p === 'UNKNOWN' ? '判定不能' : p === 'HEADING' ? '見出し' : p} <b>${counts[p]}</b></button>`).join('')}
      <button class="pc" data-p="ALL">すべて表示</button></div>
    <p class="small muted">文型のボタンを押すと、その文型の文だけを表示します。番号は「段落-文」。</p>`;
  sum.querySelectorAll('.pc').forEach(b => b.onclick = () => {
    const p = b.dataset.p;
    document.querySelectorAll('#output .sentence').forEach((el, i) => { el.style.display = (p === 'ALL' || results[i].pattern.type === p) ? '' : 'none'; });
    document.querySelectorAll('#output .para-head').forEach(el => el.style.display = p === 'ALL' ? '' : 'none');
    sum.querySelectorAll('.pc').forEach(x => x.classList.toggle('active', x === b));
  });
}

function download() {
  if (!lastResults) return;
  const slim = lastResults.map(r => ({
    index: r.index, paragraph: r.paragraph, sentence: r.sentence, gloss: lastGloss[r.index] || null, level: r.level, pattern: r.pattern.type, ruleId: r.pattern.ruleId, transforms: r.pattern.transforms, timeMs: r.timeMs,
    tokens: r.tokens.filter(t => !t.implicit).map(t => ({ text: t.display, pos: t.pos, lemma: t.lemma, role: t.role, chunk: t.chunkType }))
  }));
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), userAgent: navigator.userAgent, results: slim }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'analysis_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  a.click();
}

async function loadSample(name) {
  try {
    const d = await (await fetch(`data/${name}?v=0.8`)).json();
    $('input').value = d.passages[0].text;
    $('level').value = '3';  // 長文は入試レベルの規則が必要
    run();
  } catch (e) { $('status').textContent = 'サンプルの読み込みに失敗: ' + e.message; }
}

$('run').addEventListener('click', run);
$('download').addEventListener('click', download);
$('level').addEventListener('change', run);
$('treeMode').addEventListener('change', run);
$('showGloss').addEventListener('change', run);
$('sample').addEventListener('click', () => loadSample('passages_dev.json'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
$('run').disabled = true;
init();
