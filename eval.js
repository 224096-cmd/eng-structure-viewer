import { loadRules, analyzeSentence } from './src/analyzer.js?v=0.6';
import { escapeHtml } from './src/render.js?v=0.6';
import { tagSentence } from './src/pos.js?v=0.6';

const $ = id => document.getElementById(id);
const PATTERNS = ['SV', 'SVC', 'SVO', 'SVOO', 'SVOC'];
let testset = [];
let lastDetail = null, lastSummary = null, lastCross = null, lastPos = null;
let datasetName = 'testset_eval.csv';

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const head = lines[0].split(',').map(s => s.trim());
  return lines.slice(1).map(line => {
    // 単純な CSV（文中にカンマがある場合はダブルクォートで囲む）
    const cells = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q; else if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    const o = {}; head.forEach((h, i) => o[h] = (cells[i] || '').trim());
    o.level = Number(o.level);
    return o;
  });
}

function evaluate(rows, ruleLevel) {
  const detail = rows.map(r => {
    const res = analyzeSentence(r.sentence, ruleLevel);
    return { id: r.id, level: r.level, sentence: r.sentence, gold: r.pattern, pred: res.pattern.type, ruleId: res.pattern.ruleId || '', core: res.pattern.core.join(' '), grammar_tag: r.grammar_tag, timeMs: res.timeMs, ok: res.pattern.type === r.pattern };
  });
  const n = detail.length, correct = detail.filter(d => d.ok).length;
  const perPattern = {};
  for (const p of PATTERNS) {
    const g = detail.filter(d => d.gold === p);
    perPattern[p] = { n: g.length, correct: g.filter(d => d.ok).length, acc: g.length ? g.filter(d => d.ok).length / g.length : null };
  }
  const labels = [...PATTERNS, 'UNKNOWN'];
  const confusion = {};
  for (const a of PATTERNS) { confusion[a] = {}; for (const b of labels) confusion[a][b] = 0; }
  detail.forEach(d => { if (confusion[d.gold]) confusion[d.gold][d.pred] = (confusion[d.gold][d.pred] || 0) + 1; });
  const avgMs = detail.reduce((s, d) => s + d.timeMs, 0) / n;
  return { ruleLevel, n, correct, accuracy: correct / n, perPattern, confusion, avgMs, detail };
}

function renderSummary(s) {
  $('summary').style.display = ''; $('detailSec').style.display = '';
  $('metrics').innerHTML = `<span class="metric">正解率 <b>${(s.accuracy * 100).toFixed(1)}%</b> (${s.correct}/${s.n})</span>
    <span class="metric">平均処理時間 <b>${s.avgMs.toFixed(2)}</b> ms/文</span>
    <span class="metric">有効規則 <b>レベル ≤ ${s.ruleLevel}</b></span>`;
  $('perPattern').innerHTML = table(['文型', '文数', '正解', '正解率'], PATTERNS.map(p => [p, s.perPattern[p].n, s.perPattern[p].correct, s.perPattern[p].acc == null ? '—' : (s.perPattern[p].acc * 100).toFixed(1) + '%']));
  const labels = [...PATTERNS, 'UNKNOWN'];
  $('confusion').innerHTML = table(['正解＼出力', ...labels], PATTERNS.map(a => [a, ...labels.map(b => s.confusion[a][b])]));
  $('detail').innerHTML = table(['id', 'Lv', '文', '正解', '出力', '規則', '主要チャンク', '文法項目', 'ms'],
    s.detail.map(d => [d.id, d.level, escapeHtml(d.sentence), d.gold, d.pred, d.ruleId, d.core, d.grammar_tag, d.timeMs]),
    s.detail.map(d => d.ok ? 'ok' : 'ng'));
}

function table(head, rows, rowClass) {
  return `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
    rows.map((r, i) => `<tr>${r.map((c, j) => `<td class="${rowClass && j === 4 ? rowClass[i] : ''}">${c}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
}

async function loadDataset(url) {
  testset = parseCSV(await (await fetch(url + '?v=' + Date.now())).text());
  datasetName = url.split('/').pop();
  $('status').textContent = `${datasetName} を読み込みました（${testset.length} 文）。「一括評価」を押してください。`;
}

function runOne() {
  const lv = Number($('level').value);
  const s = evaluate(testset, lv);
  lastDetail = s.detail; lastSummary = { ...s, detail: undefined, dataset: datasetName, userAgent: navigator.userAgent, evaluatedAt: new Date().toISOString(), testsetSize: testset.length };
  renderSummary(s);
  $('status').textContent = `評価完了（${testset.length} 文）`;
}

function runCross() {
  const levels = [...new Set(testset.map(r => r.level))].sort();
  const ruleLevels = [1, 2, 3];
  const rows = levels.map(lv => {
    const subset = testset.filter(r => r.level === lv);
    return { level: lv, n: subset.length, acc: ruleLevels.map(rl => evaluate(subset, rl).accuracy) };
  });
  lastCross = rows;
  $('crossSec').style.display = '';
  $('cross').innerHTML = table(['文のレベル', '文数', ...ruleLevels.map(r => `規則 ≤${r}`)], rows.map(r => [`レベル ${r.level}`, r.n, ...r.acc.map(a => (a * 100).toFixed(1) + '%')]));
}

function dl(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
}
const csvq = v => '"' + String(v).replace(/"/g, '""') + '"';
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

$('dlDetail').onclick = () => lastDetail && dl(`eval_detail_L${lastSummary.ruleLevel}_${stamp()}.csv`,
  '﻿' + ['id,level,sentence,gold,pred,correct,ruleId,core,grammar_tag,timeMs', ...lastDetail.map(d => [d.id, d.level, csvq(d.sentence), d.gold, d.pred, d.ok ? 1 : 0, d.ruleId, csvq(d.core), csvq(d.grammar_tag), d.timeMs].join(','))].join('\n'), 'text/csv');
$('dlSummary').onclick = () => lastSummary && dl(`eval_summary_L${lastSummary.ruleLevel}_${stamp()}.json`, JSON.stringify(lastSummary, null, 2), 'application/json');
$('dlCross').onclick = () => lastCross && dl(`eval_cross_${stamp()}.csv`,
  '﻿' + ['sentence_level,n,rules_le1,rules_le2,rules_le3', ...lastCross.map(r => [r.level, r.n, ...r.acc.map(a => a.toFixed(4))].join(','))].join('\n'), 'text/csv');
$('run').onclick = runOne;
$('runAll').onclick = runCross;
$('file').onchange = async e => { const f = e.target.files[0]; if (!f) return; testset = parseCSV(await f.text()); $('status').textContent = `${f.name} を読み込みました（${testset.length} 文）`; };

$('dataset').onchange = e => loadDataset(e.target.value);

// ---------- 品詞評価 ----------
const UPOS_ORDER = ['NOUN', 'VERB', 'AUX', 'ADJ', 'ADV', 'ADP', 'DET', 'PRON', 'PROPN', 'CCONJ', 'SCONJ', 'PART', 'NUM', 'INTJ'];
const norm = w => w.toLowerCase().replace(/[^a-z0-9]/g, '');
// UD の規約: be 動詞（コピュラ）は常に AUX。本システムは本動詞の be を VERB とするため、比較時に合わせるオプションを用意
function mapForCompare(t, udMode) {
  if (t.pos === 'REL') return 'PRON';
  if (udMode && t.pos === 'VERB' && t.lemma === 'be') return 'AUX';
  return t.pos;
}

async function runPos() {
  const udMode = $('udMode').checked;
  const data = await (await fetch('data/ud_ewt_sample.json?v=0.3')).json();
  const t0 = performance.now();
  let aligned = 0, unaligned = 0, nTok = 0, nOk = 0, lemmaN = 0, lemmaOk = 0;
  const perTag = {}; const conf = {}; const errors = [];
  for (const s of data.sentences) {
    const gold = s.tokens.filter(t => t.upos !== 'PUNCT');
    const pred = tagSentence(s.text).map(t => ({ ...t, n: norm(t.text) })).filter(t => t.n);
    const goldN = gold.map(t => norm(t.form));
    if (pred.length !== gold.length || pred.some((t, i) => t.n !== goldN[i])) { unaligned++; continue; }
    aligned++;
    gold.forEach((g, i) => {
      const p = mapForCompare(pred[i], udMode);
      nTok++;
      perTag[g.upos] = perTag[g.upos] || { n: 0, ok: 0 };
      perTag[g.upos].n++;
      conf[g.upos] = conf[g.upos] || {}; conf[g.upos][p] = (conf[g.upos][p] || 0) + 1;
      if (p === g.upos) { nOk++; perTag[g.upos].ok++; } else errors.push({ id: s.id, word: g.form, gold: g.upos, pred: p, sentence: s.text });
      if (g.upos !== 'PROPN' && g.upos !== 'PUNCT') { lemmaN++; if (pred[i].lemma.toLowerCase() === g.lemma.toLowerCase()) lemmaOk++; }
    });
  }
  const ms = performance.now() - t0;
  lastPos = { source: data.source, license: data.license, udCopulaAsAux: udMode, sentences: data.sentences.length, aligned, unaligned, tokens: nTok, posAccuracy: nOk / nTok, lemmaAccuracy: lemmaOk / lemmaN, perTag, confusion: conf, errors, totalMs: ms, userAgent: navigator.userAgent, evaluatedAt: new Date().toISOString() };
  $('posMetrics').innerHTML = `<span class="metric">品詞正解率 <b>${(100 * nOk / nTok).toFixed(1)}%</b> (${nOk}/${nTok} 語)</span>
    <span class="metric">原形正解率 <b>${(100 * lemmaOk / lemmaN).toFixed(1)}%</b> (${lemmaOk}/${lemmaN} 語、固有名詞除く)</span>
    <span class="metric">整列成功 <b>${aligned}</b> 文 / 失敗 ${unaligned} 文</span>
    <span class="metric">処理時間 <b>${ms.toFixed(0)}</b> ms（${aligned} 文）</span>`;
  const tags = UPOS_ORDER.filter(t => perTag[t]);
  $('posPerTag').innerHTML = table(['品詞', '語数', '正解', '正解率'], tags.map(t => [t, perTag[t].n, perTag[t].ok, (100 * perTag[t].ok / perTag[t].n).toFixed(1) + '%']));
  $('posConfusion').innerHTML = table(['正解＼出力', ...tags, 'X'], tags.map(a => [a, ...tags.map(b => conf[a][b] || 0), conf[a]['X'] || 0]));
}
$('runPos').onclick = runPos;
$('dlPos').onclick = () => lastPos && dl(`pos_eval_${stamp()}.json`, JSON.stringify({ ...lastPos, errors: undefined }, null, 2), 'application/json');
$('dlPosErr').onclick = () => lastPos && dl(`pos_errors_${stamp()}.csv`, '\uFEFF' + ['id,word,gold,pred,sentence', ...lastPos.errors.map(e => [e.id, csvq(e.word), e.gold, e.pred, csvq(e.sentence)].join(','))].join('\n'), 'text/csv');

(async () => {
  await loadRules();
  await loadDataset($('dataset').value);
})();
