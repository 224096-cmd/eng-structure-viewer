// scripts/gloss_eval.mjs — 構造訳の評価: 辞書カバー率（訳語が見つかった語の割合）と、評価用テストセットの構造訳を一覧出力
// 使い方: node scripts/gloss_eval.mjs v0.8
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
globalThis.nlp = require(path.join(ROOT, 'vendor/compromise.js'));
globalThis.performance = globalThis.performance || { now: () => Date.now() };
// ブラウザの fetch を、ローカルファイル読み込みに置き換える
globalThis.fetch = async (url) => { const f = path.join(ROOT, url.split('?')[0]); return { ok: fs.existsSync(f), json: async () => JSON.parse(fs.readFileSync(f, 'utf8')), text: async () => fs.readFileSync(f, 'utf8') }; };
const version = process.argv[2] || 'dev';
const OUT = path.join(ROOT, 'results', version); fs.mkdirSync(OUT, { recursive: true });
const load = rel => import('file://' + path.join(ROOT, rel));
const { loadRules, analyzeSentence } = await load('src/analyzer.js');
const { sentenceGloss } = await load('src/gloss.js');
const { lookup } = await load('src/dict.js');
await loadRules();
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim()); const head = lines[0].split(',');
  return lines.slice(1).map(line => { const cells = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch; } cells.push(cur); const o = {}; head.forEach((h, i) => o[h.trim()] = (cells[i] || '').trim()); return o; });
}
const rows = parseCSV(fs.readFileSync(path.join(ROOT, 'data/testset_eval.csv'), 'utf8'));
let nTok = 0, nFound = 0; const out = ['id,sentence,pattern,gloss'];
const csvq = v => '"' + String(v).replace(/"/g, '""') + '"';
for (const r of rows) {
  const res = analyzeSentence(r.sentence, 3);
  for (const t of res.tokens) { if (t.implicit || !/[a-z]/i.test(t.text)) continue; if (['DET', 'PRON', 'AUX', 'PART', 'ADP', 'CCONJ', 'SCONJ', 'REL', 'NUM', 'PROPN'].includes(t.pos)) continue; nTok++; if (await lookup(t.display, t.lemma)) nFound++; }
  const g = await sentenceGloss(res);
  out.push([r.id, csvq(r.sentence), res.pattern.type, csvq(g.ja)].join(','));
}
fs.writeFileSync(path.join(OUT, 'gloss_eval.csv'), '﻿' + out.join('\n'));
const summary = { version, sentences: rows.length, contentTokens: nTok, dictionaryCoverage: nFound / nTok };
fs.writeFileSync(path.join(OUT, 'gloss_summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
