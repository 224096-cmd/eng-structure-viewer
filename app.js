import { loadRules, analyzeText } from './src/analyzer.js';
import { renderResult } from './src/render.js';

const $ = id => document.getElementById(id);
let lastResults = null;

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

function run() {
  const text = $('input').value.trim();
  const level = Number($('level').value);
  const out = $('output');
  out.innerHTML = '';
  if (!text) { $('status').textContent = '英文を入力してください。'; return; }
  const t0 = performance.now();
  lastResults = analyzeText(text, level);
  const total = Math.round((performance.now() - t0) * 100) / 100;
  lastResults.forEach(r => renderResult(r, out));
  $('status').textContent = `${lastResults.length} 文を解析（合計 ${total} ms、レベル ${level}）`;
  $('download').disabled = false;
}

function download() {
  if (!lastResults) return;
  const slim = lastResults.map(r => ({
    sentence: r.sentence, level: r.level, pattern: r.pattern.type, ruleId: r.pattern.ruleId, timeMs: r.timeMs,
    tokens: r.tokens.map(t => ({ text: t.text, pos: t.pos, lemma: t.lemma, role: t.role, chunk: t.chunkType }))
  }));
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), userAgent: navigator.userAgent, results: slim }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'analysis_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  a.click();
}

$('run').addEventListener('click', run);
$('download').addEventListener('click', download);
$('level').addEventListener('change', run);
$('run').disabled = true;
init();
