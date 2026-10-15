// patterns.js — 文型判定エンジン（JSON 規則をレベルで絞って照合）
// 入力: chunks, rules(JSON), level
// 出力: { type, ruleId, roles: [{chunkIndex, role, folded}], core:[...], note }
//
// レベル2以上では規則照合の前に「節の畳み込み」を行う：
//   - that 節（I think that ...）        → 目的語の名詞節 NP（clause）
//   - 関係詞節（the man who lives ...）  → 直前の名詞句に付く修飾語 RELCL
//   - 従属節（because / if ... ）        → 修飾語 SUBCL

const NAMING_VERBS = new Set(['call', 'name', 'elect', 'appoint', 'consider', 'make']);
const CLAUSE_TYPES = ['NP', 'VP', 'VP_be', 'ADJP', 'PP', 'ADVP', 'REL', 'SCONJ'];

export function detectPattern(chunks, rulesJson, level = 1) {
  const mods = new Set([...(rulesJson.modifiers || []), 'RELCL', 'SUBCL']);
  const rules = rulesJson.rules.filter(r => r.level <= level);

  let work = chunks.map((c, i) => ({ ...c, idx: i, folded: [] }));
  if (level >= 2) {
    work = foldRelativeClauses(work);
    work = foldSubordinateClauses(work);
    work = foldThatClause(work);
  }

  const core = work.filter(c => !mods.has(c.type) && !['PUNCT', 'X', 'CCONJ', 'SCONJ', 'REL'].includes(c.type));
  const coreTypes = core.map(c => c.type);

  for (const r of rules) {
    if (matchCore(core, r.core)) {
      const roles = work.map(c => ({ chunkIndex: c.idx, role: mods.has(c.type) ? 'M' : null, folded: c.folded }));
      core.forEach((c, i) => {
        const k = roles.findIndex(x => x.chunkIndex === c.idx);
        if (k >= 0) roles[k].role = r.roles[i];
      });
      return { type: r.type, ruleId: r.id, roles, core: coreTypes, note: r.note };
    }
  }
  return { type: 'UNKNOWN', ruleId: null, roles: work.map(c => ({ chunkIndex: c.idx, role: mods.has(c.type) ? 'M' : null, folded: c.folded })), core: coreTypes, note: '一致する規則がありません' };
}

function matchCore(core, spec) {
  if (core.length !== spec.length) return false;
  return spec.every((s, i) => {
    const [type, feat] = s.split(':');
    const c = core[i];
    if (c.type !== type) return false;
    if (feat === 'linking') return !!c.linking;
    if (feat === 'passive') return !!c.passive;
    if (feat === 'naming') return NAMING_VERBS.has(c.headLemma);
    return true;
  });
}

// 関係詞節: NP REL ... を、REL 以降の節を 1 つの RELCL（修飾語）にまとめる
// 節の終わり = 節内で動詞句を見たあと、次に動詞句が現れる直前（主節の動詞）または文末
function foldRelativeClauses(work) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    if (c.type === 'REL' && out.length && out[out.length - 1].type === 'NP') {
      let j = i + 1, vpSeen = 0;
      const members = [c];
      while (j < work.length) {
        const t = work[j].type;
        if ((t === 'VP' || t === 'VP_be')) { if (vpSeen >= 1) break; vpSeen++; }
        if (t === 'SCONJ' || t === 'CCONJ' || t === 'PUNCT') break;
        members.push(work[j]); j++;
      }
      out.push({ type: 'RELCL', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx) });
      i = j - 1;
      continue;
    }
    out.push(c);
  }
  return out;
}

// 従属節（because/if/when ...）: SCONJ(that 以外) から、節内で動詞句を見たあと次の動詞句の直前まで、または文末まで
function foldSubordinateClauses(work) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    if (c.type === 'SCONJ' && c.headText !== 'that') {
      let j = i + 1, vpSeen = 0;
      const members = [c];
      while (j < work.length) {
        const t = work[j].type;
        if (t === 'VP' || t === 'VP_be') { if (vpSeen >= 1) break; vpSeen++; }
        // 文頭の従属節: 動詞句を見たあと NP が来て、その次が VP なら主節の始まり
        if (vpSeen >= 1 && t === 'NP' && j + 1 < work.length && ['VP', 'VP_be'].includes(work[j + 1].type)) break;
        if (t === 'PUNCT') break;
        members.push(work[j]); j++;
      }
      out.push({ type: 'SUBCL', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx) });
      i = j - 1;
      continue;
    }
    out.push(c);
  }
  return out;
}

// that 節: 動詞句のあとの that から文末までを名詞節 NP にまとめる
function foldThatClause(work) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    if (c.type === 'SCONJ' && c.headText === 'that' && out.length && ['VP', 'VP_be'].includes(out[out.length - 1].type)) {
      const rest = work.slice(i + 1).filter(x => x.type !== 'PUNCT');
      out.push({ type: 'NP', idx: c.idx, tokens: [...c.tokens, ...rest.flatMap(x => x.tokens)], head: c.head, folded: rest.map(x => x.idx), clause: true });
      break;
    }
    out.push(c);
  }
  return out;
}
