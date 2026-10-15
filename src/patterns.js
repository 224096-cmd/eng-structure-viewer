// patterns.js — 文型判定エンジン（JSON 規則をレベルで絞って照合）
// 入力: chunks, rules(JSON), level
// 出力: { type, ruleId, roles: [{chunkIndex, role, folded}], core:[...], note, transforms:[...] }
//
// 規則照合の前に「変形」と「節の畳み込み」を行う（レベルで有効化）:
//   L1: 疑問文の語順を戻す（Do you like → you like）、存在文（There is）の認識
//   L2: that 節 / that 省略 → 目的語の名詞節、関係詞節・分詞の後置修飾 → RELCL、従属節 → SUBCL

const NAMING_VERBS = new Set(['call', 'name', 'elect', 'appoint', 'consider', 'choose', 'declare', 'crown', 'nominate']);
const CAUSATIVE_VERBS = new Set(['let', 'make', 'help', 'see', 'hear', 'watch', 'feel', 'notice']);
const CONTROL_VERBS = new Set(['ask', 'tell', 'want', 'allow', 'order', 'advise', 'expect', 'get', 'teach', 'help', 'would like']);
const THAT_VERBS = new Set(['think', 'know', 'believe', 'hope', 'say', 'guess', 'feel', 'suppose', 'hear', 'wish', 'see', 'mean', 'find']);

export function detectPattern(chunks, rulesJson, level = 1) {
  const mods = new Set([...(rulesJson.modifiers || []), 'RELCL', 'SUBCL', 'COORDCL', 'PAREN', 'EXPL', 'LEADM', 'APPOS']);
  const rules = rulesJson.rules.filter(r => r.level <= level);
  const transforms = [];

  let work = chunks.map((c, i) => ({ ...c, idx: i, folded: [] }));
  work = work.filter(c => c.type !== 'PUNCT');
  work = groupSpans(work, tokensOf(chunks), transforms);   // 引用符・括弧・ダッシュで囲まれた部分
  work = foldColon(work, transforms);                       // コロン以降は補足
  work = foldLeadingAdverbials(work, transforms);           // 文頭の「〜, 」
  if (level >= 2) work = undoReporting(work, transforms);   // "…," said X
  if (level >= 3) work = foldWhClauses(work, transforms);
  if (level >= 3) work = foldWhetherSubject(work, transforms);
  work = undoInversion(work, transforms, level);
  if (level >= 3) {
    work = foldLeadingParticipial(work, transforms);
    work = foldTheComparative(work, transforms);
  }
  if (level >= 2) work = foldRelativeClauses(work, transforms, level);
  if (level >= 2) work = foldInfinitiveModifiers(work, transforms);
  if (level >= 2) work = foldPostAdjectives(work, transforms);
  if (level >= 3) {
    work = foldAppositives(work, transforms);
    work = foldContactClauses(work, transforms);
    work = foldGerundAfterAdj(work, transforms);
    work = splitCompound(work, transforms);
  }
  if (level >= 2) {
    work = foldParticiples(work, transforms, level);
    work = foldSubordinateClauses(work, transforms, level);
    work = foldThatClause(work, transforms, level);
  }

  const core = work.filter(c => !mods.has(c.type) && !['X', 'CCONJ', 'SCONJ', 'REL'].includes(c.type));
  const coreTypes = core.map(c => c.type);
  // 動詞句が 1 つも無い → 見出し・名詞句のみ（文型なし）
  if (!chunks.some(c => c.type === 'VP' || c.type === 'VP_be')) {
    return { type: 'HEADING', ruleId: null, roles: work.map(c => ({ chunkIndex: c.idx, role: null, folded: c.folded })), core: coreTypes, note: '動詞がないため文型はありません（見出し・名詞句）', transforms };
  }

  for (const r of rules) {
    if (matchCore(core, r.core) && (!r.require || core.some(c => (c.type === 'VP' || c.type === 'VP_be') && matchCore([c], [c.type + ':' + r.require])))) {
      const roles = work.map(c => ({ chunkIndex: c.idx, role: mods.has(c.type) ? 'M' : null, folded: c.folded, kind: c.type, clause: !!c.clause, quote: !!c.quote, wh: !!c.wh, gerund: !!c.gerund, infinitive: !!c.infinitive }));
      core.forEach((c, i) => {
        const k = roles.findIndex(x => x.chunkIndex === c.idx);
        if (k >= 0) roles[k].role = r.roles[i];
      });
      return { type: r.type, ruleId: r.id, roles, core: coreTypes, note: r.note, transforms };
    }
  }
  return { type: 'UNKNOWN', ruleId: null, roles: work.map(c => ({ chunkIndex: c.idx, role: mods.has(c.type) ? 'M' : null, folded: c.folded, kind: c.type, clause: !!c.clause, quote: !!c.quote, wh: !!c.wh })), core: coreTypes, note: '一致する規則がありません', transforms };
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
      case 'quote': return !!c.quote;
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
    if (!(w.length >= 2 && ((w[0].type === 'VP' && w[0].auxOnly) || w[0].type === 'VP_be') && w[1].type === 'NP')) { w = [...lead, ...w]; lead = []; }
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

function tokensOf(chunks) { return chunks; }

// 引用符 / 括弧 / ダッシュで囲まれた範囲を 1 つのチャンクにまとめる
//   引用 → QUOTE（名詞節として扱う）、括弧・ダッシュ → PAREN（修飾語）
function groupSpans(work, _chunks, transforms) {
  let out = work;
  for (const [openKey, closeKey, type] of [['parenOpen', 'parenClose', 'PAREN'], ['quoteOpen', 'quoteClose', 'QUOTE']]) {
    const res = [];
    for (let i = 0; i < out.length; i++) {
      const c = out[i];
      if (c[openKey]) {
        let j = i; const members = [];
        while (j < out.length) { members.push(out[j]); if (out[j][closeKey]) break; j++; }
        if (members.length > 1 || type === 'QUOTE') {
          const last = members[members.length - 1];
          res.push({ type: type === 'QUOTE' ? 'NP' : 'PAREN', quote: type === 'QUOTE', clause: type === 'QUOTE', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx), commaAfter: last.commaAfter, colonAfter: last.colonAfter, dashAfter: last.dashAfter });
          transforms.push(type === 'QUOTE' ? 'quotation' : 'parenthesis');
          i = j; continue;
        }
      }
      res.push(c);
    }
    out = res;
  }
  // ダッシュ: 「— … —」は挿入、「— …」（文末まで）は補足
  const res = [];
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (c.dashBefore && i > 0) {
      let j = i; const members = [];
      while (j < out.length) { members.push(out[j]); if (out[j].dashAfter) break; j++; }
      res.push({ type: 'PAREN', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx), commaAfter: members[members.length - 1].commaAfter });
      transforms.push('dash_insert');
      i = j; continue;
    }
    res.push(c);
  }
  return res;
}

// コロンのあとは説明・列挙（EXPL、修飾語扱い）。ただしコロンの前に動詞句がある場合のみ
function foldColon(work, transforms) {
  const i = work.findIndex(c => c.colonAfter);
  if (i < 0 || i === work.length - 1) return work;
  if (!work.slice(0, i + 1).some(c => c.type === 'VP' || c.type === 'VP_be')) return work;
  const rest = work.slice(i + 1);
  transforms.push('colon_explanation');
  return [...work.slice(0, i + 1), { type: 'EXPL', idx: rest[0].idx, tokens: rest.flatMap(x => x.tokens), head: rest[0].head, folded: rest.slice(1).map(x => x.idx) }];
}

// 文頭の副詞句（In 1998, / Today, more than twenty years later, / Interestingly,）: 最初の動詞句より前で、
// コンマで終わる区間に動詞句が無く、かつ区間が主語になりうる単独の名詞句でなければ LEADM（修飾語）にする
function foldLeadingAdverbials(work, transforms) {
  let w = work;
  for (let guard = 0; guard < 3; guard++) {
    const firstVP = w.findIndex(c => c.type === 'VP' || c.type === 'VP_be');
    if (firstVP <= 0) return w;
    let commaAt = w.findIndex((c, i) => i < firstVP && c.commaAfter);
    if (commaAt < 0 && (w[0].type === 'PP' || w[0].type === 'ADVP')) {
      // 文頭が前置詞句で、コンマまでに動詞句を 1 つ含む節（At the moment we hear a name, we …）
      const c2 = w.findIndex((c, i) => i > firstVP && c.commaAfter && w[i + 1] && w[i + 1].type === 'NP' && w[i + 2] && ['VP', 'VP_be'].includes(w[i + 2].type));
      if (c2 > 0 && w.slice(0, c2 + 1).filter(c => c.type === 'VP' || c.type === 'VP_be').length === 1) commaAt = c2;
    }
    if (commaAt < 0) return w;
    const run = w.slice(0, commaAt + 1);
    const onlyNP = run.length === 1 && run[0].type === 'NP' && !run[0].clause;
    const nextIsSubject = w[commaAt + 1] && w[commaAt + 1].type === 'NP';
    if (onlyNP || !nextIsSubject) return w;
    if (run.some(c => ['SCONJ', 'REL', 'CCONJ'].includes(c.type))) return w; // 従属節は別の処理に任せる
    const vpsInRun = run.filter(c => c.type === 'VP' || c.type === 'VP_be').length;
    if (vpsInRun > 1) return w;
    if (vpsInRun === 1 && !(run[0].type === 'PP' || run[0].type === 'ADVP')) return w; // 「At the moment we hear a name,」のみ節として扱う
    transforms.push(vpsInRun ? 'leading_clause' : 'leading_adverbial');
    w = [{ type: vpsInRun ? 'SUBCL' : 'LEADM', idx: run[0].idx, tokens: run.flatMap(x => x.tokens), head: run[0].head, folded: run.slice(1).map(x => x.idx) }, ...w.slice(commaAt + 1)];
  }
  return w;
}

// 伝達の倒置（レベル2）: QUOTE VP(said) NP … → NP VP QUOTE、QUOTE NP VP → NP VP QUOTE。
// 残りの QUOTE（"…," she said, "…"）は最初の QUOTE に併合する
function undoReporting(work, transforms) {
  const qi = work.findIndex(c => c.quote);
  if (qi < 0) return work;
  let w = work.slice();
  const others = w.filter((c, i) => c.quote && i !== qi);
  if (others.length) {
    const main = w[qi];
    main.tokens = [...main.tokens, ...others.flatMap(o => o.tokens)];
    main.folded = [...(main.folded || []), ...others.flatMap(o => [o.idx, ...(o.folded || [])])];
    w = w.filter((c, i) => !(c.quote && i !== qi));
    transforms.push('quote_merge');
  }
  const q = w.findIndex(c => c.quote);
  const a = w[q + 1], b = w[q + 2];
  if (q === 0 && a && a.type === 'VP' && b && b.type === 'NP') {
    const rest = w.slice(q + 3);
    transforms.push('reporting_inversion');
    return [b, a, w[q], ...rest];
  }
  if (q === 0 && a && a.type === 'NP' && b && b.type === 'VP') {
    transforms.push('reporting_order');
    return [a, b, w[q], ...w.slice(q + 3)];
  }
  return w;
}

// 不定詞の形容詞的用法（レベル2）: VP NP [to-VP …] で、動詞が want/ask 等の補語を取る動詞でなければ、不定詞は直前の名詞の修飾
function foldInfinitiveModifiers(work, transforms) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const prev = out[out.length - 1], prev2 = out[out.length - 2];
    if (c.type === 'NP' && c.infinitive && c.afterNP && prev && prev.type === 'NP' && !prev.pronoun && prev2 && prev2.type === 'VP' && !CONTROL_VERBS.has(prev2.headLemma) && !NAMING_VERBS.has(prev2.headLemma)) {
      out.push({ ...c, type: 'RELCL' }); transforms.push('infinitive_modifier'); continue;
    }
    out.push(c);
  }
  return out;
}

// 同格（レベル3）: NP, NP （文末またはコンマ＋動詞句が続く）→ 2 つ目を APPOS（修飾語）。
// 「Attention, not memory, is」の「, not memory,」も同様
function foldAppositives(work, transforms) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const n1 = work[i + 1], n2 = work[i + 2];
    if (c.type === 'NP' && c.commaAfter && n1) {
      // , not memory,
      if (n1.type === 'ADVP' && /^not$/i.test(n1.headText || '') && n2 && n2.type === 'NP' && n2.commaAfter) {
        out.push(c, { type: 'APPOS', idx: n1.idx, tokens: [...n1.tokens, ...n2.tokens], head: n2.head, folded: [n2.idx], commaAfter: true });
        transforms.push('appositive'); i += 2; continue;
      }
      const endsHere = i + 2 >= work.length;
      const beforeVP = n1.commaAfter && n2 && ['VP', 'VP_be'].includes(n2.type);
      if (n1.type === 'NP' && !n1.clause && !n1.pronoun && !n1.wh && (endsHere || beforeVP)) {
        out.push({ ...c, commaAfter: false }, { ...n1, type: 'APPOS' });
        transforms.push('appositive'); i += 1; continue;
      }
    }
    out.push(c);
  }
  return out;
}

// 接触節（レベル3）: VP の後の NP NP VP … で関係詞が省略されたもの（the people the planners had expected）
function foldContactClauses(work, transforms) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const prev = out[out.length - 1];
    const n1 = work[i + 1], n2 = work[i + 2];
    const vpsBefore = out.filter(x => x.type === 'VP' || x.type === 'VP_be').length;
    const inLeadingSub = work[0].type === 'SCONJ' && vpsBefore < 2;
    if (!inLeadingSub && c.type === 'NP' && !c.clause && !c.quote && prev && ['VP', 'VP_be', 'ADVP'].includes(prev.type) && n1 && n1.type === 'NP' && !n1.clause && !n1.wh && !c.commaAfter && n2 && ['VP', 'VP_be'].includes(n2.type) && !isParticipleVP(n2)) {
      let j = i + 1, vpSeen = 0; const members = [];
      while (j < work.length) {
        const t = work[j].type;
        if (t === 'VP' || t === 'VP_be') { if (vpSeen >= 1) break; vpSeen++; }
        if (t === 'CCONJ' || t === 'SCONJ') break;
        members.push(work[j]); j++;
      }
      out.push(c, { type: 'RELCL', idx: members[0].idx, tokens: members.flatMap(m => m.tokens), head: members[0].head, folded: members.slice(1).map(m => m.idx) });
      transforms.push('contact_clause'); i = j - 1; continue;
    }
    out.push(c);
  }
  return out;
}

// 形容詞の直後の動名詞句（busy doing something）は形容詞の修飾語
function foldGerundAfterAdj(work, transforms) {
  return work.map((c, i) => (c.type === 'NP' && c.gerund && work[i - 1] && work[i - 1].type === 'ADJP') ? (transforms.push('gerund_after_adjective'), { ...c, type: 'ADVP' }) : c);
}

// wh 節（レベル3）: what/where/when… + NP + VP … を名詞節にまとめる（主語の what 節、間接疑問）
function foldWhClauses(work, transforms) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const isWh = (c.type === 'NP' || c.type === 'ADVP') && c.wh;
    const next = work[i + 1], next2 = work[i + 2];
    const prev = out[out.length - 1];
    const prevOk = !prev || prev.type === 'VP' || (prev.type === 'PP' && !prev.inner) || (prev.type === 'NP' && out[out.length - 2] && out[out.length - 2].type === 'VP');
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
        const clauseChunk = { type: 'NP', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx), clause: true };
        if (prev && prev.type === 'PP' && !prev.inner) {
          // about how we should live → 前置詞句の中身として併合
          out[out.length - 1] = { ...prev, tokens: [...prev.tokens, ...clauseChunk.tokens], inner: 'CLAUSE', folded: [...(prev.folded || []), c.idx, ...clauseChunk.folded] };
          transforms.push('wh_clause_in_pp'); i = j - 1; continue;
        }
        out.push(clauseChunk);
        transforms.push('wh_clause');
        i = j - 1;
        continue;
      }
    }
    out.push(c);
  }
  return out;
}

// whether 節の主語（レベル3）: Whether … VP … [VP_be|VP] → 名詞節
function foldWhetherSubject(work, transforms) {
  if (!work.length || work[0].type !== 'SCONJ' || !/^(whether|that)$/.test(work[0].headText || '')) return work;
  let j = 1, vpSeen = 0;
  while (j < work.length) {
    const t = work[j].type;
    if (t === 'VP' || t === 'VP_be') { if (vpSeen >= 1) break; vpSeen++; }
    j++;
  }
  if (vpSeen < 1 || j >= work.length) return work;
  // 2 つ目の動詞句の直前までが節。ただし直前が NP なら（…whether it rains or not we will go）主語なので除く
  let end = j;
  if (work[end - 1].type === 'NP' && !work[end - 1].clause && end - 1 > 1 && (work[end - 2].type !== 'VP' && work[end - 2].type !== 'VP_be' || work[end - 1].pronoun)) end = end - 1;
  const members = work.slice(0, end);
  if (members.filter(c => c.type === 'VP' || c.type === 'VP_be').length < 1) return work;
  const isSubject = end === j; // 節の直後が動詞句 → 主語の名詞節。そうでなければ譲歩の従属節
  transforms.push(isSubject ? 'whether_subject' : 'subordinate_clause');
  return [{ type: isSubject ? 'NP' : 'SUBCL', clause: true, idx: members[0].idx, tokens: members.flatMap(m => m.tokens), head: members[0].head, folded: members.slice(1).map(m => m.idx) }, ...work.slice(end)];
}

// 文頭の分詞構文（レベル3）: 分詞句（動名詞 NP / 助動詞なし分詞 VP）+ 修飾語 … 主節の NP VP の直前まで → SUBCL
function foldLeadingParticipial(work, transforms) {
  if (work.length < 3) return work;
  const c = work[0];
  const isPart = (c.type === 'NP' && c.gerund) || (c.type === 'VP' && c.bare && (c.participle || /(ing|ed|en)$/.test(c.headText || ''))) || (c.type === 'ADJP' && work[1] && work[1].type === 'PP' && /(ed|en)$/.test(c.headText || ''));
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
    const vp = work[5];
    const second = vp.linking ? { ...work[3], type: 'ADJP', theComparative: false } : { ...work[3], type: 'ADVP' };
    return [sub, work[4], vp, second, ...work.slice(6)];
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
    const vpsBefore = work.slice(0, i).filter(x => x.type === 'VP' || x.type === 'VP_be').length;
    if (work[0].type === 'SCONJ' && vpsBefore < 2) continue; // 文頭の従属節の中の or/and
    if (c.type === 'CCONJ') {
      const n1 = work[i + 1], n2 = work[i + 2], n3 = work[i + 3];
      let look = i + 2; while (look < work.length && look < i + 6 && ['ADVP', 'ADJP', 'PP', 'RELCL', 'PAREN'].includes(work[look].type)) look++;
      const npThenVP = n1 && n1.type === 'NP' && work[look] && ['VP', 'VP_be'].includes(work[look].type);
      const clause = n1 && (npThenVP || (n1.type === 'NP' && n2 && (['VP', 'VP_be'].includes(n2.type) || (n2.type === 'ADVP' && n3 && ['VP', 'VP_be'].includes(n3.type)))) || (['VP', 'VP_be'].includes(n1.type) && !isParticipleVP(n1)) || (n1.type === 'ADVP' && n2 && (n2.type === 'NP' || n2.type === 'VP')));
      if (clause) {
        const rest = work.slice(i + 1);
        transforms.push('compound_sentence');
        return [...work.slice(0, i), { type: 'COORDCL', idx: c.idx, tokens: [...c.tokens, ...rest.flatMap(x => x.tokens)], head: c.head, folded: rest.map(x => x.idx) }];
      }
    }
    // コンマ区切りの並列述語（meet their neighbors, notice changes …, and feel …）
    if (work[i - 1] && work[i - 1].commaAfter && ['VP', 'VP_be'].includes(c.type) && !isParticipleVP(c) && !c.auxOnly) {
      const rest = work.slice(i);
      transforms.push('coordinated_predicate');
      return [...work.slice(0, i), { type: 'COORDCL', idx: c.idx, tokens: rest.flatMap(x => x.tokens), head: c.head, folded: rest.slice(1).map(x => x.idx) }];
    }
  }
  return work;
}
function isParticipleVP(c) { return c.bare && !c.auxOnly && /(ing|ed|en)$/.test(c.headText || ''); }

// 関係詞節: NP REL ... → RELCL（修飾語）。節の終わり = 節内で動詞句を見たあと、次の動詞句の直前または文末
// 「名詞, which …, 動詞」型（コンマ付きの非制限用法）は、コンマで終わる区間のあとに主節の動詞句が来たところで終わる
function foldRelativeClauses(work, transforms, level = 2) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const prevC = out.length ? out[out.length - 1] : null;
    const prevT = prevC ? prevC.type : null;
    if (c.type === 'REL' && (prevT === 'NP' || (level >= 3 && (prevT === 'PP' || prevT === 'ADVP')))) {
      let j = i + 1, vpSeen = 0;
      const members = [c];
      const commaRel = !!(prevC && prevC.commaAfter);
      while (j < work.length) {
        const t = work[j].type;
        const prevComma = j - 1 >= i + 1 && work[j - 1].commaAfter;
        if (commaRel) {
          if (vpSeen >= 1 && prevComma && (t === 'VP' || t === 'VP_be')) break;
          if (vpSeen >= 1 && prevComma && t === 'NP' && work[j + 1] && ['VP', 'VP_be'].includes(work[j + 1].type) && !work[j].commaAfter) break;
          if (t === 'VP' || t === 'VP_be') vpSeen++;
          members.push(work[j]); j++; continue;
        }
        if (t === 'VP' || t === 'VP_be') { if (vpSeen >= 1) break; vpSeen++; }
        if (t === 'CCONJ' && work[j + 1] && ['VP', 'VP_be'].includes(work[j + 1].type) && vpSeen >= 1) { members.push(work[j], work[j + 1]); j += 2; continue; }
        if (t === 'CCONJ' && work[j + 1] && work[j + 1].type === 'REL') { members.push(work[j], work[j + 1]); j += 2; vpSeen = 0; continue; }
        if (t === 'CCONJ' && vpSeen >= 1 && work[j + 1] && ['NP', 'PP'].includes(work[j + 1].type) && !(work[j + 2] && ['VP', 'VP_be'].includes(work[j + 2].type))) { members.push(work[j], work[j + 1]); j += 2; continue; }
        if (t === 'SCONJ' || t === 'CCONJ') break;
        members.push(work[j]); j++;
      }
      const last = members[members.length - 1];
      out.push({ type: (prevT === 'PP' || prevT === 'ADVP') ? 'SUBCL' : 'RELCL', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx), commaAfter: !!last.commaAfter });
      transforms.push((prevT === 'PP' || prevT === 'ADVP') ? 'cleft_clause' : 'relative_clause');
      i = j - 1;
      continue;
    }
    out.push(c);
  }
  return out;
}

// 名詞の後置修飾の形容詞句（a diet rich in …）: NP ADJP PP → 修飾語（レベル2）
const POST_ADJ = new Set(['rich', 'full', 'free', 'capable', 'responsible', 'famous', 'similar', 'different', 'available', 'ready', 'interested', 'aware', 'worth', 'suitable', 'eager', 'present', 'involved', 'close', 'related', 'opposite', 'due']);
function foldPostAdjectives(work, transforms) {
  const out = [];
  for (let i = 0; i < work.length; i++) {
    const c = work[i];
    const prev = out[out.length - 1], next = work[i + 1];
    if (c.type === 'ADJP' && prev && prev.type === 'NP' && !prev.commaAfter && next && next.type === 'PP' && POST_ADJ.has(c.headText || '') && out.some(x => x.type === 'VP' || x.type === 'VP_be')) {
      out.push({ type: 'RELCL', idx: c.idx, tokens: [...c.tokens, ...next.tokens], head: c.head, folded: [next.idx], commaAfter: next.commaAfter });
      transforms.push('postnominal_adjective'); i++; continue;
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
    const afterMod = level >= 3 && prev && (prev.type === 'PP' || prev.type === 'ADVP' || prev.type === 'VP') && prevVP && /ing$/.test(c.headText || '');
    // 主語の直後の過去形動詞（I stayed / The cat chased）を分詞と誤らないための制約
    const prevIsPron = prev && prev.type === 'NP' && prev.pronoun;
    const edForm = /(ed|en)$/.test(c.headText || '') && !/ing$/.test(c.headText || '');
    const afterConj = out.length >= 2 && out[out.length - 2].type === 'CCONJ';
    const okNP = prev && prev.type === 'NP' && !prevIsPron && !(edForm && (out.length === 1 || afterConj));
    if (isParticiple && prev && (okNP || afterMod) && (otherVP || afterMod) && !(prevVP && CAUSATIVE_VERBS.has(prevVP.headLemma))) {
      const asSub = prev.type !== 'NP';
      let j = i + 1;
      const members = [c];
      while (j < work.length && (['NP', 'PP', 'ADVP'].includes(work[j].type) || (asSub && work[j].type === 'CCONJ' && work[j + 1] && isParticipleVP(work[j + 1])))) {
        // 分詞の目的語・修飾語を吸収。ただし次が動詞句なら、その直前の NP は主節の要素なので残す
        if (work[j].type === 'CCONJ') { members.push(work[j], work[j + 1]); j += 2; continue; } // reducing … and conserving …
        if (work[j].type === 'NP' && work[j + 1] && (work[j + 1].type === 'VP' || work[j + 1].type === 'VP_be') && !isParticipleVP(work[j + 1])) {
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
    const soThat = level >= 3 && c.type === 'SCONJ' && c.headText === 'that' && prev && (prev.type === 'ADJP' || prev.type === 'ADVP' || (prev.type === 'VP' && prev.passive));
    // wonder if / know whether: 従属接続詞 if/whether が目的語節を導く
    if (c.type === 'SCONJ' && /^(if|whether)$/.test(c.headText || '') && prev && prev.type === 'VP' && /^(wonder|know|ask|doubt|see|check|tell|decide|care|matter|remember|find)$/.test(prev.headLemma || '') && i + 1 < work.length) {
      const rest = work.slice(i + 1);
      out.push({ type: 'NP', clause: true, idx: c.idx, tokens: [...c.tokens, ...rest.flatMap(x => x.tokens)], head: c.head, folded: rest.map(x => x.idx) });
      transforms.push('if_clause_object'); break;
    }
    if (c.type === 'SCONJ' && (c.headText !== 'that' || soThat)) {
      let j = i + 1, vpSeen = 0, sawComma = false;
      const members = [c];
      while (j < work.length) {
        const t = work[j].type;
        if (t === 'CCONJ' && vpSeen >= 1 && !sawComma && work[j + 1] && work[j + 1].type === 'NP' && work[j + 2] && ['VP', 'VP_be'].includes(work[j + 2].type)) { members.push(work[j], work[j + 1]); j += 2; vpSeen = 0; continue; } // 従属節内の重文
        if (t === 'VP' || t === 'VP_be') { if (vpSeen >= 1) break; vpSeen++; }
        if (vpSeen >= 1 && t === 'NP') { let q = j + 1; while (q < work.length && ['PP', 'ADVP', 'ADJP'].includes(work[q].type)) q++; if (q < work.length && ['VP', 'VP_be'].includes(work[q].type)) break; }
        if (vpSeen >= 1 && work[j - 1] !== c && work[j - 1].commaAfter) break; // 節の終わりのコンマ
        members.push(work[j]); if (work[j].commaAfter) sawComma = true; j++;
      }
      out.push({ type: 'SUBCL', idx: c.idx, tokens: members.flatMap(m => m.tokens), head: c.head, folded: members.slice(1).map(m => m.idx), commaAfter: !!members[members.length - 1].commaAfter });
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
