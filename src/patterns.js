// patterns.js — 文型判定エンジン（JSON 規則をレベルで絞って照合）
// 入力: chunks, rules(JSON), level
// 出力: { type, ruleId, roles: [{chunkIndex, role, folded}], core:[...], note, transforms:[...] }
//
// 規則照合の前に「変形」と「節の畳み込み」を行う（レベルで有効化）:
//   L1: 疑問文の語順を戻す（Do you like → you like）、存在文（There is）の認識
//   L2: that 節 / that 省略 → 目的語の名詞節、関係詞節・分詞の後置修飾 → RELCL、従属節 → SUBCL

const NAMING_VERBS = new Set(['call', 'name', 'elect', 'appoint', 'consider']);
const CAUSATIVE_VERBS = new Set(['let', 'make', 'help', 'see', 'hear', 'watch', 'feel', 'notice']);
const CONTROL_VERBS = new Set(['ask', 'tell', 'want', 'allow', 'order', 'advise', 'expect', 'get', 'teach', 'help', 'would like']);
const THAT_VERBS = new Set(['think', 'know', 'believe', 'hope', 'say', 'guess', 'feel', 'suppose', 'hear', 'wish', 'see', 'mean', 'find']);

export function detectPattern(chunks, rulesJson, level = 1) {
  const mods = new Set([...(rulesJson.modifiers || []), 'RELCL', 'SUBCL']);
  const rules = rulesJson.rules.filter(r => r.level <= level);
  const transforms = [];

  let work = chunks.map((c, i) => ({ ...c, idx: i, folded: [] }));
  work = work.filter(c => c.type !== 'PUNCT');
  work = undoInversion(work, transforms);
  if (level >= 2) {
    work = foldRelativeClauses(work, transforms);
    work = foldParticiples(work, transforms);
    work = foldSubordinateClauses(work, transforms);
    work = foldThatClause(work, transforms);
  }

  const core = work.filter(c => !mods.has(c.type) && !['X', 'CCONJ', 'SCONJ', 'REL'].includes(c.type));
  const coreTypes = core.map(c => c.type);

  for (const r of rules) {
    if (matchCore(core, r.core) && (!r.require || core.some(c => (c.type === 'VP' || c.type === 'VP_be') && matchCore([c], [c.type + ':' + r.require])))) {
      const roles = work.map(c => ({ chunkIndex: c.idx, role: mods.has(c.type) ? 'M' : null, folded: c.folded }));
      core.forEach((c, i) => {
        const k = roles.findIndex(x => x.chunkIndex === c.idx);
        if (k >= 0) roles[k].role = r.roles[i];
      });
      return { type: r.type, ruleId: r.id, roles, core: coreTypes, note: r.note, transforms };
    }
  }
  return { type: 'UNKNOWN', ruleId: null, roles: work.map(c => ({ chunkIndex: c.idx, role: mods.has(c.type) ? 'M' : null, folded: c.folded })), core: coreTypes, note: '一致する規則がありません', transforms };
}

function matchCore(core, spec) {
  if (core.length !== spec.length) return false;
  return spec.every((s, i) => {
    const [type, feat] = s.split(':');
    const c = core[i];
    if (c.type !== type) return false;
    if (!feat) return true;
    switch (feat) {
      case 'linking': return !!c.linking;
      case 'passive': return !!c.passive;
      case 'naming': return NAMING_VERBS.has(c.headLemma);
      case 'causative': return CAUSATIVE_VERBS.has(c.headLemma);
      case 'control': return CONTROL_VERBS.has(c.headLemma);
      case 'inf': return !!c.infinitive;
      case 'bare': return !!c.bare;
      case 'existential': return !!c.existential;
      case 'it': return !!c.it;
      default: return false;
    }
  });
}

// 疑問文: [WH] AUX/VP_be NP ... → NP AUX ... (WH を目的語に戻す)
function undoInversion(work, transforms) {
  let w = work.slice();
  let wh = null;
  if (w.length && (w[0].type === 'NP' || w[0].type === 'ADVP') && w[0].wh) { wh = w[0]; w = w.slice(1); }
  if (w.length >= 2 && w[1].type === 'NP' && !w[1].existential) {
    const v = w[0];
    if (v.type === 'VP' && v.auxOnly) {
      // Do you like / Could you lend → you [do like] / you [could lend]
      const nextVP = w.findIndex((c, i) => i >= 2 && (c.type === 'VP' || c.type === 'VP_be'));
      if (nextVP > 0) {
        const merged = { ...w[nextVP], tokens: [...v.tokens, ...w[nextVP].tokens], folded: [v.idx, ...(w[nextVP].folded || [])] };
        w = [w[1], merged, ...w.slice(2, nextVP), ...w.slice(nextVP + 1)];
        transforms.push('question_inversion');
      }
    } else if (v.type === 'VP_be') {
      // Is this your bag → this is your bag
      w = [w[1], v, ...w.slice(2)];
      transforms.push('question_inversion_be');
    }
  }
  if (wh) {
    if (wh.type === 'ADVP') { w.push({ ...wh, type: 'ADVP' }); transforms.push('wh_adverb'); }
    else {
      // 目的語が無ければ WH を目的語として末尾に置く（What did you buy → you did buy what）。主語疑問文（Who wrote）はそのまま主語
      const hasVP = w.some(c => c.type === 'VP' || c.type === 'VP_be');
      const firstIsVP = w.length && (w[0].type === 'VP' || w[0].type === 'VP_be') && !w[0].auxOnly;
      if (firstIsVP) { w = [{ ...wh, type: 'NP' }, ...w]; transforms.push('wh_subject'); }
      else if (hasVP) { w.push({ ...wh, type: 'NP' }); transforms.push('wh_object'); }
      else { w = [{ ...wh, type: 'NP' }, ...w]; }
    }
  }
  return w;
}

// 関係詞節: NP REL ... → RELCL（修飾語）。節の終わり = 節内で動詞句を見たあと、次の動詞句の直前または文末
function foldRelativeClauses(work, transforms) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    if (c.type === 'REL' && out.length && out[out.length - 1].type === 'NP') {
      let j = i + 1, vpSeen = 0;
      const members = [c];
      while (j < work.length) {
        const t = work[j].type;
        if (t === 'VP' || t === 'VP_be') { if (vpSeen >= 1) break; vpSeen++; }
        if (t === 'SCONJ' || t === 'CCONJ') break;
        members.push(work[j]); j++;
      }
      out.push({ type: 'RELCL', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx) });
      transforms.push('relative_clause');
      i = j - 1;
      continue;
    }
    out.push(c);
  }
  return out;
}

// 分詞の後置修飾: NP + 助動詞なしの分詞 VP (+ 修飾語) → RELCL。ただし直前の動詞が使役・知覚なら対象外
function foldParticiples(work, transforms) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const prev = out[out.length - 1];
    const prevVP = [...out].reverse().find(x => x.type === 'VP' || x.type === 'VP_be');
    const isParticiple = c.type === 'VP' && c.bare && !c.auxOnly && /(ing|ed|en)$/.test(c.headText || '');
    const otherVP = work.some((x, k) => k !== i && (x.type === 'VP' || x.type === 'VP_be'));
    if (isParticiple && prev && prev.type === 'NP' && otherVP && !(prevVP && CAUSATIVE_VERBS.has(prevVP.headLemma))) {
      let j = i + 1;
      const members = [c];
      while (j < work.length && ['NP', 'PP', 'ADVP'].includes(work[j].type)) {
        // 分詞の目的語・修飾語を吸収。ただし次が動詞句なら、その直前の NP は主節の要素なので残す
        if (work[j].type === 'NP' && work[j + 1] && (work[j + 1].type === 'VP' || work[j + 1].type === 'VP_be')) {
          // playing the piano is → the piano は分詞の目的語
          members.push(work[j]); j++; break;
        }
        members.push(work[j]); j++;
      }
      out.push({ type: 'RELCL', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx) });
      transforms.push('participle_modifier');
      i = j - 1;
      continue;
    }
    out.push(c);
  }
  return out;
}

// 従属節（because/if/when/though ...）: SCONJ(that 以外) → SUBCL（修飾語）
function foldSubordinateClauses(work, transforms) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    if (c.type === 'SCONJ' && c.headText !== 'that') {
      let j = i + 1, vpSeen = 0;
      const members = [c];
      while (j < work.length) {
        const t = work[j].type;
        if (t === 'VP' || t === 'VP_be') { if (vpSeen >= 1) break; vpSeen++; }
        if (vpSeen >= 1 && t === 'NP' && j + 1 < work.length && ['VP', 'VP_be'].includes(work[j + 1].type)) break;
        members.push(work[j]); j++;
      }
      out.push({ type: 'SUBCL', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx) });
      transforms.push('subordinate_clause');
      i = j - 1;
      continue;
    }
    out.push(c);
  }
  return out;
}

// that 節（明示 / 省略）: VP(that を取る動詞) [that] NP VP ... → 名詞節 NP
function foldThatClause(work, transforms) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const prev = out[out.length - 1];
    const explicit = c.type === 'SCONJ' && c.headText === 'that' && prev && (prev.type === 'VP' || prev.type === 'VP_be');
    const omitted = c.type === 'NP' && prev && prev.type === 'VP' && THAT_VERBS.has(prev.headLemma) && !prev.auxOnly &&
      !(CAUSATIVE_VERBS.has(prev.headLemma) && work[i + 1] && work[i + 1].type === 'VP' && work[i + 1].bare) &&
      work[i + 1] && (work[i + 1].type === 'VP' || work[i + 1].type === 'VP_be') && !(work[i + 1].bare && /(ing|ed|en)$/.test(work[i + 1].headText || ''));
    if (explicit || omitted) {
      const rest = work.slice(explicit ? i + 1 : i);
      out.push({ type: 'NP', idx: c.idx, tokens: [...(explicit ? c.tokens : []), ...rest.flatMap(x => x.tokens)], head: c.head, folded: rest.map(x => x.idx).filter(x => x !== c.idx), clause: true });
      transforms.push(explicit ? 'that_clause' : 'that_omitted');
      break;
    }
    out.push(c);
  }
  return out;
}
