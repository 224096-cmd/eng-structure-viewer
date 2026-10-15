// tree.js — 構造図（SVG）。文型 → 役割（S/V/O/C/M）→ チャンク → 単語（品詞）の階層を描く
import { escapeHtml, ROLE_JA } from './render.js?v=0.9';

const COLORS = { S: 'var(--S)', V: 'var(--V)', O: 'var(--O)', C: 'var(--C)', M: 'var(--M)' };

export function renderTree(result, container) {
  // 役割付きチャンクを並べる（畳み込まれた節は親チャンクに含める）
  const items = [];
  const folded = new Set();
  result.pattern.roles.forEach(r => (r.folded || []).forEach(f => folded.add(f)));
  result.pattern.roles.forEach(r => {
    if (folded.has(r.chunkIndex)) return;
    const c = result.chunks[r.chunkIndex];
    const idxs = [...c.tokens, ...(r.folded || []).flatMap(f => result.chunks[f].tokens)].sort((a, b) => a - b);
    items.push({ role: r.role || 'M', tokens: idxs.map(i => result.tokens[i]) });
  });
  if (!items.length) return;

  const colW = 150, tokW = 64, pad = 12;
  const widths = items.map(it => Math.max(colW, it.tokens.length * tokW + pad));
  const totalW = widths.reduce((a, b) => a + b, 0) + pad * (items.length + 1);
  const H = 220;
  let x = pad;
  let svg = `<svg viewBox="0 0 ${totalW} ${H}" width="${totalW}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12">`;
  // ルート
  const rootX = totalW / 2;
  svg += `<rect x="${rootX - 40}" y="8" width="80" height="26" rx="6" fill="#374151"/><text x="${rootX}" y="26" text-anchor="middle" fill="#fff" font-weight="700">${escapeHtml(result.pattern.type)}</text>`;
  items.forEach((it, i) => {
    const w = widths[i], cx = x + w / 2, col = COLORS[it.role] || COLORS.M;
    svg += `<line x1="${rootX}" y1="34" x2="${cx}" y2="62" stroke="#9ca3af" stroke-width="1.2"/>`;
    svg += `<rect x="${cx - 46}" y="62" width="92" height="24" rx="6" fill="${col}" opacity=".9"/><text x="${cx}" y="79" text-anchor="middle" fill="#fff" font-weight="700">${it.role} ${ROLE_JA[it.role]}</text>`;
    // チャンクの枠
    svg += `<rect x="${x}" y="104" width="${w}" height="94" rx="8" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="${it.role === 'M' ? '4 3' : '0'}"/>`;
    svg += `<line x1="${cx}" y1="86" x2="${cx}" y2="104" stroke="#9ca3af" stroke-width="1.2"/>`;
    const tw = Math.min(tokW, (w - pad) / it.tokens.length);
    it.tokens.forEach((t, j) => {
      const tx = x + pad / 2 + tw * j + tw / 2;
      svg += `<text x="${tx}" y="140" text-anchor="middle" font-size="${it.tokens.length > 6 ? 10 : 13}" font-weight="600">${escapeHtml(t.text)}</text>`;
      svg += `<text x="${tx}" y="160" text-anchor="middle" font-size="10" fill="#6b7280">${escapeHtml(t.pos)}</text>`;
      svg += `<text x="${tx}" y="178" text-anchor="middle" font-size="10" fill="#6b7280">${escapeHtml(t.posJa.replace(/（.*/, ''))}</text>`;
    });
    x += w + pad;
  });
  svg += '</svg>';
  const wrap = document.createElement('div');
  wrap.className = 'tree';
  wrap.innerHTML = svg;
  container.appendChild(wrap);
}
