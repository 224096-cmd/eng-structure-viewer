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
  const mods = new Set([...(rulesJson.modifiers || []), 'RELCL', 'SUBCL', 'COORDCL']);
  const rules = rulesJson.rules.filter(r => r.level <= level);
  const transforms = [];

  let work = chunks.map((c, i) => ({ ...c, idx: i, folded: [] }));
  work = work.filter(c => c.type !== 'PUNCT');
  if (level >= 3) work = foldWhClauses(work, transforms);
  work = undoInversion(work, transforms, level);
  if (level >= 3) {
    work = foldLeadingParticipial(work, transforms);
    work = foldTheComparative(work, transforms);
    work = splitCompound(work, transforms);
  }
  if (level >= 2) {
    work = foldRelativeClauses(work, transforms, level);
    work = foldParticiples(work, transforms, level);
    work = foldSubordinateClauses(work, transforms, level);
    work = foldThatClause(work, transforms, level);
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
      case 'clause': return !!c.clause;
      default: return false;
    }
  });
}

// 疑問文: [WH] AUX/VP_be NP ... → NP AUX ... (WH を目的語に戻す)
function undoInversion(work, transforms, level = 1) {
  let w = work.slice();
  let wh = null;
  // レベル3: 否定副詞などの文頭倒置（Never have I seen / Little did he know / Not only did he sing）
  let lead = [];
  if (level >= 3) {
    while (w.length > 2 && (w[0].type === 'ADVP' || w[0].type === 'ADJP') && !w[0].wh) { lead.push(w[0]); w = w.slice(1); }
    if (!(w.length >= 2 && w[0].type === 'VP' && w[0].auxOnly && w[1].type === 'NP')) { w = [...lead, ...w]; lead = []; }
    else transforms.push('negative_inversion');
  }
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
  if (lead.length) w = [...lead.map(c => ({ ...c, type: 'ADVP' })), ...w];
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

// wh 節（レベル3）: what/where/when… + NP + VP … を名詞節にまとめる（主語の what 節、間接疑問）
function foldWhClauses(work, transforms) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const isWh = (c.type === 'NP' || c.type === 'ADVP') && c.wh;
    const next = work[i + 1], next2 = work[i + 2];
    const prev = out[out.length - 1];
    const prevOk = !prev || prev.type === 'VP' || (prev.type === 'NP' && out[out.length - 2] && out[out.length - 2].type === 'VP');
    // 疑問文の倒置（What did you buy）は対象外: 直後が助動詞のみの VP なら飛ばす
    const subjectClause = isWh && next && next.type === 'NP' && next2 && (next2.type === 'VP' || next2.type === 'VP_be') && !next2.auxOnly && prevOk;
    const whSubject = isWh && c.type === 'NP' && next && next.type === 'VP' && !next.auxOnly && prevOk && i === 0 && work.slice(i + 2).some(x => x.type === 'VP' || x.type === 'VP_be'); // What happened yesterday surprised everyone
    if (subjectClause || whSubject) {
      let j = i + 1, vpSeen = 0;
      const members = [c];
      while (j < work.length) {
        const t = work[j].type;
        if (t === 'VP' || t === 'VP_be') { if (vpSeen >= 1) break; vpSeen++; }
        if (vpSeen >= 1 && t === 'NP' && work[j + 1] && ['VP', 'VP_be'].includes(work[j + 1].type)) break;
        if (t === 'CCONJ' || t === 'SCONJ') break;
        members.push(work[j]); j++;
      }
      if (vpSeen >= 1 && (j < work.length || prev)) { // 主語節なら後ろに主節の動詞が必要、目的語節なら文末まででよい
        out.push({ type: 'NP', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx), clause: true });
        transforms.push('wh_clause');
        i = j - 1;
        continue;
      }
    }
    out.push(c);
  }
  return out;
}

// 文頭の分詞構文（レベル3）: 分詞句（動名詞 NP / 助動詞なし分詞 VP）+ 修飾語 … 主節の NP VP の直前まで → SUBCL
function foldLeadingParticipial(work, transforms) {
  if (work.length < 3) return work;
  const c = work[0];
  const isPart = (c.type === 'NP' && c.gerund) || (c.type === 'VP' && c.bare && /(ing|ed|en)$/.test(c.headText || ''));
  if (!isPart) return work;
  let j = 1;
  while (j < work.length && !(work[j].type === 'NP' && work[j + 1] && ['VP', 'VP_be'].includes(work[j + 1].type))) j++;
  if (j >= work.length) return work;
  const members = work.slice(0, j);
  transforms.push('participial_construction');
  return [{ type: 'SUBCL', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx) }, ...work.slice(j)];
}

// The 比較級, the 比較級（レベル3）: 前半を SUBCL、後半の前置された ADJP を動詞の後ろへ
function foldTheComparative(work, transforms) {
  if (work.length >= 6 && work[0].type === 'ADJP' && work[0].theComparative && work[1].type === 'NP' && work[2].type === 'VP' && work[3].type === 'ADJP' && work[3].theComparative && work[4].type === 'NP' && work[5].type === 'VP') {
    transforms.push('the_comparative');
    const sub = { type: 'SUBCL', idx: work[0].idx, tokens: [...work[0].tokens, ...work[1].tokens, ...work[2].tokens], head: work[0].head, folded: [work[1].idx, work[2].idx] };
    return [sub, work[4], work[5], { ...work[3], type: 'ADJP', theComparative: false }, ...work.slice(6)];
  }
  if (work.length >= 6 && work[0].type === 'ADJP' && work[0].theComparative && work[1].type === 'NP' && work[2].type === 'VP' && work[3].type === 'ADVP' && work[4].type === 'NP' && work[5].type === 'VP') {
    transforms.push('the_comparative');
    const sub = { type: 'SUBCL', idx: work[0].idx, tokens: [...work[0].tokens, ...work[1].tokens, ...work[2].tokens], head: work[0].head, folded: [work[1].idx, work[2].idx] };
    return [sub, work[4], work[5], work[3], ...work.slice(6)];
  }
  return work;
}

// 重文（レベル3）: 動詞句のあとに CCONJ + (NP) VP が続けば、それ以降を並列節 COORDCL（修飾語扱い）にする
function splitCompound(work, transforms) {
  const firstVP = work.findIndex(c => c.type === 'VP' || c.type === 'VP_be');
  if (firstVP < 0) return work;
  for (let i = firstVP + 1; i < work.length; i++) {
    const c = work[i];
    if (c.type === 'CCONJ') {
      const n1 = work[i + 1], n2 = work[i + 2], n3 = work[i + 3];
      const clause = n1 && ((n1.type === 'NP' && n2 && (['VP', 'VP_be'].includes(n2.type) || (n2.type === 'ADVP' && n3 && ['VP', 'VP_be'].includes(n3.type)))) || (n1.type === 'VP' && !n1.bare) || (n1.type === 'ADVP' && n2 && n2.type === 'NP'));
      if (clause) {
        const rest = work.slice(i + 1);
        transforms.push('compound_sentence');
        return [...work.slice(0, i), { type: 'COORDCL', idx: c.idx, tokens: [...c.tokens, ...rest.flatMap(x => x.tokens)], head: c.head, folded: rest.map(x => x.idx) }];
      }
    }
  }
  return work;
}

// 関係詞節: NP REL ... → RELCL（修飾語）。節の終わり = 節内で動詞句を見たあと、次の動詞句の直前または文末
function foldRelativeClauses(work, transforms, level = 2) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const prevT = out.length ? out[out.length - 1].type : null;
    if (c.type === 'REL' && (prevT === 'NP' || (level >= 3 && prevT === 'PP'))) {
      let j = i + 1, vpSeen = 0;
      const members = [c];
      while (j < work.length) {
        const t = work[j].type;
        if (t === 'VP' || t === 'VP_be') { if (vpSeen >= 1) break; vpSeen++; }
        if (t === 'SCONJ' || t === 'CCONJ') break;
        members.push(work[j]); j++;
      }
      out.push({ type: prevT === 'PP' ? 'SUBCL' : 'RELCL', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx) });
      transforms.push(prevT === 'PP' ? 'cleft_clause' : 'relative_clause');
      i = j - 1;
      continue;
    }
    out.push(c);
  }
  return out;
}

// 分詞の後置修飾: NP + 助動詞なしの分詞 VP (+ 修飾語) → RELCL。ただし直前の動詞が使役・知覚なら対象外
function foldParticiples(work, transforms, level = 2) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const prev = out[out.length - 1];
    const prevVP = [...out].reverse().find(x => x.type === 'VP' || x.type === 'VP_be');
    const isParticiple = c.type === 'VP' && c.bare && !c.auxOnly && /(ing|ed|en)$/.test(c.headText || '');
    const otherVP = work.some((x, k) => k !== i && (x.type === 'VP' || x.type === 'VP_be'));
    const afterMod = level >= 3 && prev && (prev.type === 'PP' || prev.type === 'ADVP' || prev.type === 'VP') && prevVP;
    // 主語の直後の過去形動詞（I stayed / The cat chased）を分詞と誤らないための制約
    const prevIsPron = prev && prev.type === 'NP' && prev.pronoun;
    const edForm = /(ed|en)$/.test(c.headText || '') && !/ing$/.test(c.headText || '');
    const okNP = prev && prev.type === 'NP' && !prevIsPron && !(edForm && out.length === 1);
    if (isParticiple && prev && (okNP || afterMod) && (otherVP || afterMod) && !(prevVP && CAUSATIVE_VERBS.has(prevVP.headLemma))) {
      const asSub = prev.type !== 'NP';
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
      out.push({ type: asSub ? 'SUBCL' : 'RELCL', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx) });
      transforms.push(asSub ? 'participial_construction' : 'participle_modifier');
      i = j - 1;
      continue;
    }
    out.push(c);
  }
  return out;
}

// 従属節（because/if/when/though ...）: SCONJ(that 以外) → SUBCL（修飾語）
function foldSubordinateClauses(work, transforms, level = 2) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const prev = out[out.length - 1];
    const soThat = level >= 3 && c.type === 'SCONJ' && c.headText === 'that' && prev && (prev.type === 'ADJP' || (prev.type === 'VP' && prev.passive));
    if (c.type === 'SCONJ' && (c.headText !== 'that' || soThat)) {
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
function foldThatClause(work, transforms, level = 2) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const prev = out[out.length - 1];
    const prev2 = out[out.length - 2];
    const afterObj = level >= 3 && prev && prev.type === 'NP' && prev2 && prev2.type === 'VP' && !prev2.passive;
    const afterItAdj = level >= 3 && prev && prev.type === 'ADJP' && prev2 && prev2.type === 'NP' && prev2.it;
    const explicit = c.type === 'SCONJ' && c.headText === 'that' && prev && ((prev.type === 'VP' && !prev.passive) || prev.type === 'VP_be' || afterObj || afterItAdj);
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
