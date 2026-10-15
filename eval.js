import { loadRules, analyzeSentence } from './src/analyzer.js';
import { escapeHtml } from './src/render.js';

const $ = id => document.getElementById(id);
const PATTERNS = ['SV', 'SVC', 'SVO', 'SVOO', 'SVOC'];
let testset = [];
let lastDetail = null, lastSummary = null, lastCross = null;

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

function runOne() {
  const lv = Number($('level').value);
  const s = evaluate(testset, lv);
  lastDetail = s.detail; lastSummary = { ...s, detail: undefined, userAgent: navigator.userAgent, evaluatedAt: new Date().toISOString(), testsetSize: testset.length };
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

(async () => {
  await loadRules();
  testset = parseCSV(await (await fetch('data/testset.csv')).text());
  $('status').textContent = `testset.csv を読み込みました（${testset.length} 文）。「一括評価」を押してください。`;
})();
