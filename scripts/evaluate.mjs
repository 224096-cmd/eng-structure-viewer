// scripts/evaluate.mjs — 評価を一括実行して results/<version>/ に CSV / JSON / Markdown を書き出す
// 使い方: node scripts/evaluate.mjs <version>   例: node scripts/evaluate.mjs v0.5
// ブラウザの評価モードと同じ処理を Node で実行する（compromise.js は vendor のものを使う）
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
globalThis.nlp = require(path.join(ROOT, 'vendor/compromise.js'));
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const version = process.argv[2] || 'dev';
const OUT = path.join(ROOT, 'results', version);
fs.mkdirSync(OUT, { recursive: true });

// ES モジュールは ?v= 付きで import しているので、Node では版クエリを外して読み込む
async function load(rel) { return import('file://' + path.join(ROOT, rel)); }
const { tagSentence } = await load('src/pos.js');
const { chunk } = await load('src/chunker.js');
const { detectPattern } = await load('src/patterns.js');
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules/patterns.json'), 'utf8'));

const PATTERNS = ['SV', 'SVC', 'SVO', 'SVOO', 'SVOC'];
const csvq = v => '"' + String(v).replace(/"/g, '""') + '"';
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const head = lines[0].split(',').map(s => s.trim());
  return lines.slice(1).map(line => {
    const cells = []; let cur = '', q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch; }
    cells.push(cur);
    const o = {}; head.forEach((h, i) => o[h] = (cells[i] || '').trim()); o.level = Number(o.level); return o;
  });
}
function analyze(sentence, level) {
  const t0 = performance.now();
  const tokens = tagSentence(sentence);
  const chunks = chunk(tokens, { level });
  chunks.forEach(c => { c.headText = tokens[c.head].text.toLowerCase(); c.headLemma = tokens[c.head].lemma; });
  const pattern = detectPattern(chunks, rules, level);
  return { tokens, chunks, pattern, timeMs: performance.now() - t0 };
}
function evaluate(rows, ruleLevel) {
  const detail = rows.map(r => {
    const res = analyze(r.sentence, ruleLevel);
    return { id: r.id, level: r.level, sentence: r.sentence, gold: r.pattern, pred: res.pattern.type, ruleId: res.pattern.ruleId || '', core: res.pattern.core.join(' '), transforms: (res.pattern.transforms || []).join('+'), grammar_tag: r.grammar_tag, timeMs: Math.round(res.timeMs * 100) / 100, ok: res.pattern.type === r.pattern };
  });
  const n = detail.length, correct = detail.filter(d => d.ok).length;
  const perPattern = {}; for (const p of PATTERNS) { const g = detail.filter(d => d.gold === p); perPattern[p] = { n: g.length, correct: g.filter(d => d.ok).length }; }
  const perLevel = {}; for (const lv of [1, 2, 3]) { const g = detail.filter(d => d.level === lv); if (g.length) perLevel[lv] = { n: g.length, correct: g.filter(d => d.ok).length }; }
  const confusion = {}; for (const a of PATTERNS) { confusion[a] = {}; for (const b of [...PATTERNS, 'UNKNOWN']) confusion[a][b] = 0; }
  detail.forEach(d => { if (confusion[d.gold]) confusion[d.gold][d.pred] = (confusion[d.gold][d.pred] || 0) + 1; });
  return { ruleLevel, n, correct, accuracy: correct / n, perPattern, perLevel, confusion, detail };
}
function writeDetail(file, detail) {
  fs.writeFileSync(file, '﻿' + ['id,level,sentence,gold,pred,correct,ruleId,core,transforms,grammar_tag,timeMs', ...detail.map(d => [d.id, d.level, csvq(d.sentence), d.gold, d.pred, d.ok ? 1 : 0, d.ruleId, csvq(d.core), csvq(d.transforms), csvq(d.grammar_tag), d.timeMs].join(','))].join('\n'));
}
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';

// ---------- 文型 ----------
const report = [`# ${version} 評価結果（Node 実行、${new Date().toISOString()}）`, '', `規則数: ${rules.rules.length}（level1: ${rules.rules.filter(r => r.level === 1).length}, level2: ${rules.rules.filter(r => r.level === 2).length}, level3: ${rules.rules.filter(r => r.level === 3).length}）`, ''];
const summaryRows = [];
for (const ds of ['testset_dev.csv', 'testset_eval.csv']) {
  const rows = parseCSV(fs.readFileSync(path.join(ROOT, 'data', ds), 'utf8'));
  const name = ds.replace('testset_', '').replace('.csv', '');
  report.push(`## 文型: ${ds}（${rows.length} 文）`, '', '| 有効規則 | 全体 | L1 文 | L2 文 | L3 文 | SV | SVC | SVO | SVOO | SVOC |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const rl of [1, 2, 3]) {
    const s = evaluate(rows, rl);
    writeDetail(path.join(OUT, `pattern_${name}_rules_le${rl}.csv`), s.detail);
    fs.writeFileSync(path.join(OUT, `pattern_${name}_rules_le${rl}.json`), JSON.stringify({ version, dataset: ds, ...s, detail: undefined }, null, 2));
    const L = lv => s.perLevel[lv] ? `${pct(s.perLevel[lv].correct, s.perLevel[lv].n)} (${s.perLevel[lv].correct}/${s.perLevel[lv].n})` : '—';
    report.push(`| ≤${rl} | ${pct(s.correct, s.n)} (${s.correct}/${s.n}) | ${L(1)} | ${L(2)} | ${L(3)} | ${PATTERNS.map(p => pct(s.perPattern[p].correct, s.perPattern[p].n)).join(' | ')} |`);
    summaryRows.push([version, name, rl, s.n, s.correct, (s.accuracy).toFixed(4), ...[1, 2, 3].map(lv => s.perLevel[lv] ? (s.perLevel[lv].correct / s.perLevel[lv].n).toFixed(4) : '')]);
  }
  // 混同行列（規則≤3）
  const s3 = evaluate(rows, 3);
  report.push('', `混同行列（${name}、規則≤3、行＝正解・列＝出力）`, '', '| 正解＼出力 | ' + [...PATTERNS, 'UNKNOWN'].join(' | ') + ' |', '|---|' + '---|'.repeat(6));
  for (const a of PATTERNS) report.push(`| ${a} | ` + [...PATTERNS, 'UNKNOWN'].map(b => s3.confusion[a][b]).join(' | ') + ' |');
  // 誤りの文法項目分布（評価用は文を出さず項目名のみ）
  const errs = s3.detail.filter(d => !d.ok);
  const tagCount = {}; errs.forEach(d => { tagCount[d.grammar_tag] = (tagCount[d.grammar_tag] || 0) + 1; });
  report.push('', `誤り ${errs.length} 件の文法項目（規則≤3）: ` + Object.entries(tagCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join('、'), '');
  // クロス表
  report.push(`クロス表（${name}、行＝文のレベル、列＝有効規則）`, '', '| 文のレベル | n | ≤1 | ≤2 | ≤3 |', '|---|---|---|---|---|');
  const cross = [];
  for (const lv of [1, 2, 3]) {
    const sub = rows.filter(r => r.level === lv); if (!sub.length) continue;
    const acc = [1, 2, 3].map(rl => evaluate(sub, rl).accuracy);
    cross.push([lv, sub.length, ...acc.map(a => a.toFixed(4))]);
    report.push(`| ${lv} | ${sub.length} | ${acc.map(a => (100 * a).toFixed(1) + '%').join(' | ')} |`);
  }
  fs.writeFileSync(path.join(OUT, `pattern_${name}_cross.csv`), 'sentence_level,n,rules_le1,rules_le2,rules_le3\n' + cross.map(r => r.join(',')).join('\n'));
  report.push('');
}

// ---------- 品詞（UD English-EWT） ----------
const ud = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ud_ewt_sample.json'), 'utf8'));
const norm = w => w.toLowerCase().replace(/[^a-z0-9]/g, '');
function posEval(udMode) {
  let aligned = 0, unaligned = 0, nTok = 0, nOk = 0, lemmaN = 0, lemmaOk = 0; const perTag = {}, conf = {}, errors = [];
  for (const s of ud.sentences) {
    const gold = s.tokens.filter(t => t.upos !== 'PUNCT');
    const pred = tagSentence(s.text).map(t => ({ ...t, n: norm(t.text) })).filter(t => t.n);
    if (pred.length !== gold.length || pred.some((t, i) => t.n !== norm(gold[i].form))) { unaligned++; continue; }
    aligned++;
    gold.forEach((g, i) => {
      let p = pred[i].pos === 'REL' ? 'PRON' : pred[i].pos;
      if (udMode && p === 'VERB' && pred[i].lemma === 'be') p = 'AUX';
      nTok++; perTag[g.upos] = perTag[g.upos] || { n: 0, ok: 0 }; perTag[g.upos].n++;
      conf[g.upos] = conf[g.upos] || {}; conf[g.upos][p] = (conf[g.upos][p] || 0) + 1;
      if (p === g.upos) { nOk++; perTag[g.upos].ok++; } else errors.push({ id: s.id, word: g.form, gold: g.upos, pred: p, sentence: s.text });
      if (g.upos !== 'PROPN') { lemmaN++; if (pred[i].lemma.toLowerCase() === g.lemma.toLowerCase()) lemmaOk++; }
    });
  }
  return { udCopulaAsAux: udMode, sentences: ud.sentences.length, aligned, unaligned, tokens: nTok, posAccuracy: nOk / nTok, lemmaAccuracy: lemmaOk / lemmaN, perTag, confusion: conf, errors };
}
report.push('## 品詞・原形（UD English-EWT 300 文）', '', '| 比較規約 | 品詞正解率 | 原形正解率 | 整列 |', '|---|---|---|---|');
const posRows = [];
for (const udMode of [true, false]) {
  const r = posEval(udMode);
  const tag = udMode ? 'ud_convention' : 'raw';
  fs.writeFileSync(path.join(OUT, `pos_eval_${tag}.json`), JSON.stringify({ version, ...r, errors: undefined }, null, 2));
  fs.writeFileSync(path.join(OUT, `pos_errors_${tag}.csv`), '﻿' + ['id,word,gold,pred,sentence', ...r.errors.map(e => [e.id, csvq(e.word), e.gold, e.pred, csvq(e.sentence)].join(','))].join('\n'));
  report.push(`| ${udMode ? 'UD 規約（be＝AUX）' : '規約なし'} | ${pct(Math.round(r.posAccuracy * r.tokens), r.tokens)} | ${(100 * r.lemmaAccuracy).toFixed(1)}% | ${r.aligned}/${r.sentences} |`);
  posRows.push([version, tag, r.tokens, r.posAccuracy.toFixed(4), r.lemmaAccuracy.toFixed(4)]);
  if (udMode) {
    report.push('', '品詞ごと（UD 規約）:', '', '| 品詞 | 語数 | 正解率 |', '|---|---|---|');
    Object.entries(r.perTag).sort((a, b) => b[1].n - a[1].n).forEach(([t, v]) => report.push(`| ${t} | ${v.n} | ${pct(v.ok, v.n)} |`));
    report.push('');
  }
}
fs.writeFileSync(path.join(OUT, 'REPORT.md'), report.join('\n'));

// ---------- 全版まとめ（追記） ----------
const allFile = path.join(ROOT, 'results', 'summary_all.csv');
const head = 'version,dataset,rules_le,n,correct,accuracy,acc_L1,acc_L2,acc_L3';
let lines = fs.existsSync(allFile) ? fs.readFileSync(allFile, 'utf8').split('\n').filter(l => l && !l.startsWith(version + ',')) : [head];
if (lines[0] !== head) lines.unshift(head);
lines.push(...summaryRows.map(r => r.join(',')));
fs.writeFileSync(allFile, lines.join('\n') + '\n');
const posFile = path.join(ROOT, 'results', 'summary_pos_all.csv');
const phead = 'version,convention,tokens,pos_accuracy,lemma_accuracy';
let plines = fs.existsSync(posFile) ? fs.readFileSync(posFile, 'utf8').split('\n').filter(l => l && !l.startsWith(version + ',')) : [phead];
if (plines[0] !== phead) plines.unshift(phead);
plines.push(...posRows.map(r => r.join(',')));
fs.writeFileSync(posFile, plines.join('\n') + '\n');
console.log(report.join('\n'));
