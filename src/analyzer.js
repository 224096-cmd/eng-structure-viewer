// analyzer.js — 解析の入口。1文ごとに 品詞 → チャンク → 文型 を実行し、JSON で返す
import { tagSentence } from './pos.js?v=0.4';
import { chunk } from './chunker.js?v=0.4';
import { detectPattern } from './patterns.js?v=0.4';

const RULES_VERSION = '0.4';
let RULES = null;
export async function loadRules(url = 'rules/patterns.json') {
  if (!RULES) RULES = await (await fetch(url + '?v=' + RULES_VERSION)).json();
  return RULES;
}
export function getRules() { return RULES; }

export function splitSentences(text) {
  return nlp(text).json().map(s => s.text.trim()).filter(Boolean);
}

export function analyzeSentence(sentence, level = 1) {
  const t0 = performance.now();
  const tokens = tagSentence(sentence);
  const chunks = chunk(tokens, { level });
  chunks.forEach(c => { c.headText = tokens[c.head].text.toLowerCase(); c.headLemma = tokens[c.head].lemma; });
  const pattern = detectPattern(chunks, RULES, level);
  // 各トークンに役割を付与
  const roleByChunk = new Map(pattern.roles.map(r => [r.chunkIndex, r]));
  tokens.forEach(t => { t.role = null; t.chunkType = null; });
  chunks.forEach((c, ci) => {
    const r = roleByChunk.get(ci);
    c.tokens.forEach(ti => { tokens[ti].chunkType = c.type; tokens[ti].role = r ? r.role : null; });
    if (r && r.folded) r.folded.forEach(fi => chunks[fi].tokens.forEach(ti => { tokens[ti].role = r.role; tokens[ti].inClause = true; }));
  });
  const ms = performance.now() - t0;
  return { sentence, level, tokens, chunks, pattern, timeMs: Math.round(ms * 100) / 100 };
}

export function analyzeText(text, level = 1) {
  return splitSentences(text).map(s => analyzeSentence(s, level));
}
