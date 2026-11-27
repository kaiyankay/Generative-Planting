// Connections: the open knowledge graph, explored by expanding in place. Start from any object (plant, research dataset,
// recipe, place, the designer survey, your own knowledge); every expansion adds that object's real neighbours to the same
// picture — nodes already placed stay where they are, shared neighbours are drawn once, so cross-links appear by themselves.
// Positions are remembered across Preset / My knowledge / Combined; links that exist only in the Preset are drawn as ghosts.
import * as A from '../analysis.js';
import { esc, sci, glyph, trim, THEME_COLOR } from '../ui.js';
import { h01 } from './common.js';
import { relax, placeLabels, textW } from './graphkit.js';

const ORDER = ['My knowledge', 'Added by me', 'My records about', 'Left out by me', 'Identity', 'Planting recipes', 'Designers (survey)', 'Research', 'Local data', 'Where it was recorded', 'Applies in', 'Places', 'Recipe',
  'Plants', 'Plants recorded here', 'Topics & rules', 'Topics', 'Sources'];
const PER_GROUP = 10;
const rank = g => g.startsWith('Role · ') ? 30 : g.startsWith('Attributes · ') ? 40 : (ORDER.indexOf(g) + 1 || 50);
const themeOf = g => { const l = g.replace('Attributes · ', ''); return Object.entries(A.THEMES).find(([, t]) => t.label === l)?.[0] || null; };

export function state(app) {
  if (!app.cx || !app.cx.expanded.length) app.cx = { expanded: [app.focus || 'achillea-millefolium'], pos: new Map(), open: new Set() };
  return app.cx;
}

/** Visible graph for the current layer: nodes, edges (with Preset-only ghosts), grouped by the expansion that produced them. */
export function build(app) {
  const kb = app.kbv(); const cx = state(app);
  const base = app.layer !== 'preset' ? app.kbBase : null;
  const nodes = new Map(); const edges = [];
  const addNode = (id, info, extra = {}) => { if (!nodes.has(id)) nodes.set(id, { id, info, parents: new Set(), ...extra }); return nodes.get(id); };
  for (const e of cx.expanded) addNode(e, A.nodeInfo(kb, e), { expanded: true });
  for (const e of cx.expanded) {
    if (!kb.state.entities.has(e) && !e.startsWith('src:') && e !== 'me' && !e.startsWith('rn:')) continue;
    const cur = A.neighbours(kb, e); const curKeys = new Set(cur.map(x => x.group + '|' + x.id));
    const ghosts = base ? A.neighbours(base, e).filter(x => !curKeys.has(x.group + '|' + x.id) && !x.group.startsWith('Attributes')) : [];
    const groups = new Map(); for (const it of cur) { if (!groups.has(it.group)) groups.set(it.group, []); groups.get(it.group).push(it); }
    const gkeys = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    for (const g of gkeys) {
      const all = groups.get(g).sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.weight - a.weight || String(a.id).localeCompare(String(b.id)));
      const open = cx.open.has(e + '|' + g);
      if (g.startsWith('Attributes · ') && !open && all.length > 1) {
        const id = `agg:${e}|${g}`; const rids = [...new Set(all.flatMap(x => x.recordIds))];
        addNode(id, { id, kind: 'agg', name: `${g.replace('Attributes · ', '')} · ${all.length}` }, { group: g, root: e, agg: true }).parents.add(e);
        edges.push({ from: e, to: id, item: { group: g, label: `${all.length} attributes`, recordIds: rids, weight: rids.length, mine: all.some(x => x.mine) }, theme: themeOf(g), status: 'both' });
        continue;
      }
      const shown = open ? all : all.slice(0, e === cx.expanded[0] ? PER_GROUP : 6);
      for (const it of shown) {
        if (it.id === e) continue;
        const info = it.kind === 'record' ? { id: it.id, kind: 'record', name: it.name || 'note', mine: true } : A.nodeInfo(kb, it.id);
        const n = addNode(it.id, info, { group: g, root: e }); n.parents.add(e); if (it.mine) n.mine = true;
        edges.push({ from: e, to: it.id, item: it, theme: g.startsWith('Attributes · ') ? themeOf(g) : null, status: 'both' });
      }
      if (all.length > shown.length) { const id = `more:${e}|${g}`; addNode(id, { id, kind: 'more', name: `+${all.length - shown.length}` }, { group: g, root: e, more: all.length - shown.length }).parents.add(e);
        edges.push({ from: e, to: id, item: { group: g, label: 'more', recordIds: [], weight: 1 }, status: 'both' }); }
    }
    for (const it of ghosts.slice(0, 12)) {     // in the Preset, but not in effect in your knowledge (left out / replaced)
      const info = A.nodeInfo(base, it.id); const n = addNode(it.id, info, { group: it.group, root: e, ghost: !nodes.has(it.id) }); n.parents.add(e);
      edges.push({ from: e, to: it.id, item: it, status: 'presetOnly' });
    }
  }
  return { nodes, edges, cx };
}

export function render(host, app) {
  const kb = app.kbv(); const { nodes, edges, cx } = build(app);
  host.classList.add('fill');
  const chips = cx.expanded.map((id, i) => `<span class="xchip ${i === cx.expanded.length - 1 ? 'cur' : ''}"><button data-sel="${esc(id)}">${nameOf(kb, id)}</button>${cx.expanded.length > 1 ? `<button class="x" data-collapse="${esc(id)}" aria-label="Collapse ${esc(nameText(kb, id))}">×</button>` : ''}</span>`).join('<span class="dim">+</span>');
  const recs = new Set(edges.filter(e => e.status !== 'presetOnly').flatMap(e => e.item.recordIds || [])).size;
  host.innerHTML = `<div class="netwrap">
    <div class="netbar"><div class="crumbs">${chips}</div><span class="dim">${nodes.size - cx.expanded.length} connected · ${recs} knowledge records</span>
      <span style="margin-left:auto;display:flex;gap:14px">${cx.open.size ? '<button class="btn small quiet" data-fold>Fold groups</button>' : ''}${cx.expanded.length > 1 ? '<button class="btn small quiet" data-reset>Keep only the last</button>' : ''}</span></div>
    <div class="netcanvas" id="cc"></div>
    <div class="legend" style="padding:8px 28px;border-top:1px solid var(--rule)">
      <span><span class="sw"></span>stated in records · thicker = more records</span><span><span class="sw dashed"></span>listed together by a designer</span><span><span class="sw dotted"></span>name match only · identity link</span>
      ${app.layer !== 'preset' ? `<span><span class="sw mine"></span>my knowledge</span><span><span class="sw dashed" style="border-color:var(--ink-4)"></span>in the Preset, not in effect for me</span>` : ''}
      <span>${shapeKey()}</span><span class="dim">double-click or Shift+Enter: expand in place · click a selected object again: expand</span></div></div>`;
  const cc = host.querySelector('#cc');
  const CW = Math.max(320, cc.clientWidth), CH = Math.max(300, cc.clientHeight);
  // the picture has its own frame, fixed when the exploration starts: resizing the canvas (e.g. the inspector opening) scales it, never rearranges it
  cx.frame = cx.frame || { W: Math.max(720, CW), H: Math.max(480, CH) }; const W = cx.frame.W, H = cx.frame.H;
  layout(app, nodes, edges, W, H);
  const P = id => cx.pos.get(id) || [W / 2, H / 2];
  const nl = [...nodes.values()];
  // the picture may grow beyond the canvas as you expand: fit the view to it (never smaller than the canvas)
  let bx0 = 0, by0 = 0, bx1 = W, by1 = H;
  for (const n of nl) { const [x, y] = P(n.id); const r = radius(kb, n) + 90; bx0 = Math.min(bx0, x - r); by0 = Math.min(by0, y - r + 50); bx1 = Math.max(bx1, x + r); by1 = Math.max(by1, y + r - 40); }
  const vb = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
  const lab = nl.map(n => { const [x, y] = P(n.id); const t = labelText(n); return { id: n.id, x, y, r: radius(kb, n), w: Math.max(textW(t.main, n.expanded ? 12.5 : 11), t.sub ? textW(t.sub, 11) : 0) + 4, h: t.sub ? 26 : 14, prio: n.expanded ? 3 : n.info.sci ? 2 : 1 }; });
  const spots = placeLabels(lab, W, H, { prefer: n => nodes.get(n.id).expanded ? 'below' : null, bounds: vb });
  const mineMode = app.mineMode;
  let s = `<svg class="net" viewBox="${vb.x0.toFixed(0)} ${vb.y0.toFixed(0)} ${(vb.x1 - vb.x0).toFixed(0)} ${(vb.y1 - vb.y0).toFixed(0)}" width="${CW}" height="${CH}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Knowledge connections">`;
  for (const e of edges) {
    const [x1, y1] = P(e.from), [x2, y2] = P(e.to);
    const it = e.item; const w = Math.min(5, .8 + Math.sqrt(it.weight || 1) * .5);
    const style = e.status === 'presetOnly' ? 'dashed ghost' : it.style === 'dashed' ? 'dashed' : it.style === 'dotted' ? 'dotted' : it.style === 'identity' ? 'identity' : it.style === 'excluded' ? 'dashed' : '';
    const dim = mineMode && !it.mine && e.status !== 'presetOnly' ? 'dim' : '';
    s += `<line class="edge ${style} ${it.mine && app.layer !== 'preset' ? 'mine' : ''} ${dim}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${e.status === 'presetOnly' ? 'var(--ink-4)' : e.theme ? THEME_COLOR[e.theme] : 'var(--ink-4)'}" stroke-width="${w.toFixed(2)}"/><line class="hit" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" data-edge="${esc(e.from)}|${esc(e.to)}|${e.status}"/>`;
  }
  nl.forEach((n, i) => {
    const [x, y] = P(n.id); const sp = n.info.kind === 'more' ? null : spots[i]; const t = labelText(n);
    const dim = mineMode && !n.mine && !n.expanded ? 'dim' : '';
    const lbl = sp ? (t.sub ? `<text class="lab-c halo-t" x="${(sp.tx - x).toFixed(1)}" y="${(sp.ty - y - 3).toFixed(1)}" text-anchor="${sp.anchor}">${esc(t.main)}</text><text class="lab-s halo-t" x="${(sp.tx - x).toFixed(1)}" y="${(sp.ty - y + 10).toFixed(1)}" text-anchor="${sp.anchor}">${esc(t.sub)}</text>`
      : `<text class="halo-t ${n.info.mine ? 'mine-t' : ''} ${n.expanded ? 'lab-c' : ''}" x="${(sp.tx - x).toFixed(1)}" y="${(sp.ty - y + 4).toFixed(1)}" text-anchor="${sp.anchor}">${esc(t.main)}</text>`) : '';
    s += `<g class="node ${n.expanded ? 'center' : ''} ${dim} ${n.mine ? 'mine' : ''} ${n.ghost ? 'ghost' : ''}" data-id="${esc(n.id)}" data-key="${esc(n.id)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" tabindex="0" role="button" aria-label="${esc(nameText(kb, n.id) || n.info.name)}${n.expanded ? ' (expanded)' : ''}">${body(kb, n)}${lbl}</g>`;
  });
  s += `</svg><div class="tip" hidden></div>`;
  cc.innerHTML = s;
  const svg = cc.querySelector('svg'); const tip = cc.querySelector('.tip');
  const activate = (g, expand) => {
    const id = g.dataset.id;
    if (id.startsWith('agg:') || id.startsWith('more:')) { const [root, grp] = id.slice(id.indexOf(':') + 1).split('|'); cx.open.add(root + '|' + grp); app.renderBody(); return; }
    if (expand || (app.sel?.id === id && !cx.expanded.includes(id))) return expandIn(app, id);
    selectNode(app, id);
  };
  svg.addEventListener('click', ev => {
    const g = ev.target.closest('.node'); const hit = ev.target.closest('.hit');
    if (g) return activate(g, false);
    if (hit) { const [from, to, st] = hit.dataset.edge.split('|'); const e = edges.find(x => x.from === from && x.to === to);
      if (e) app.select({ kind: 'evidence', title: `${nameText(kb, from)} — ${e.item.label} — ${nameText(kb, to) || nodes.get(to)?.info.name}`, recordIds: e.item.recordIds || [], key: 'edge:' + to, sub: st === 'presetOnly' ? 'in the Preset; left out or replaced in your knowledge' : '' }); return; }
    app.select(null);
  });
  svg.addEventListener('dblclick', ev => { const g = ev.target.closest('.node'); if (!g) return; const id = g.dataset.id; if (/^(agg|more|rn):/.test(id)) return; if (cx.expanded.includes(id) && cx.expanded.length > 1) collapse(app, id); else expandIn(app, id); });
  svg.addEventListener('keydown', ev => { const g = ev.target.closest('.node'); if (!g) return;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(g, ev.shiftKey); }
    if (ev.key === '+') expandIn(app, g.dataset.id); if (ev.key === '-' && cx.expanded.length > 1) collapse(app, g.dataset.id); });
  svg.addEventListener('mouseover', ev => { const g = ev.target.closest('.node[data-id]'); if (!g) return; const id = g.dataset.id; const n = nodes.get(id); const es = edges.filter(x => x.to === id);
    const r = g.getBoundingClientRect(); const pr = cc.getBoundingClientRect();
    tip.innerHTML = `<b>${nameOf(kb, id) || esc(n?.info.name || '')}</b>${es.length ? '<br>' + es.slice(0, 3).map(x => `${esc(x.item.label)}${x.item.weight ? ` · ${x.item.weight} record${x.item.weight === 1 ? '' : 's'}` : ''}${x.status === 'presetOnly' ? ' · Preset only' : ''}`).join('<br>') : ''}`;
    tip.hidden = false; tip.style.left = Math.min(pr.width - 300, r.right - pr.left + 6) + 'px'; tip.style.top = (r.top - pr.top) + 'px'; });
  svg.addEventListener('mouseout', ev => { if (!ev.relatedTarget?.closest?.('.node')) tip.hidden = true; });
  host.querySelectorAll('[data-collapse]').forEach(b => b.onclick = () => collapse(app, b.dataset.collapse));
  host.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => selectNode(app, b.dataset.sel));
  host.querySelector('[data-fold]')?.addEventListener('click', () => { cx.open = new Set(); app.renderBody(); });
  host.querySelector('[data-reset]')?.addEventListener('click', () => { const last = cx.expanded[cx.expanded.length - 1]; app.cx = { expanded: [last], pos: new Map(), open: new Set() }; app._placed = new Set(); app.focus = last; app.renderBody(); app.syncUrl(); });
  app.markSelection();
}

export function expandIn(app, id) {
  const cx = state(app);
  if (/^(agg|more|rn):/.test(id)) return;
  if (!cx.expanded.includes(id)) cx.expanded.push(id);
  app.focus = id;
  const kb = app.kbv(); const ent = kb.state.entities.get(id);
  app.sel = id === 'me' ? { kind: 'me', id } : id.startsWith('src:') ? { kind: 'source', id } : ent ? { kind: 'entity', id } : app.sel;
  app.render(); app.syncUrl();
}
export function collapse(app, id) {
  const cx = state(app); if (cx.expanded.length < 2) return;
  cx.expanded = cx.expanded.filter(x => x !== id); app.focus = cx.expanded[cx.expanded.length - 1];
  app.renderBody(); app.syncUrl();
}
export function mark(app) { const id = app.sel?.id; if (!id) return; document.querySelectorAll(`#cc .node[data-id="${CSS.escape(id)}"]`).forEach(n => n.classList.add('sel')); }

function selectNode(app, id) {
  if (id.startsWith('rn:')) return app.select({ kind: 'record', id: id.slice(3) });
  if (id.startsWith('src:')) return app.select({ kind: 'source', id });
  if (id === 'me') return app.select({ kind: 'me', id });
  if (/^(agg|more):/.test(id)) return;
  app.select({ kind: 'entity', id });
}

/** Place new nodes around the object that brought them; keep every node that already has a place. */
function layout(app, nodes, edges, W, H) {
  const cx = app.cx; const kb = app.kbv();
  const P = id => cx.pos.get(id) || null;
  const root = cx.expanded[0];
  if (!P(root)) cx.pos.set(root, [W / 2, H / 2]);
  const R = Math.min(W * .34, H * .37);
  for (const e of cx.expanded) {
    if (!P(e)) { const par = [...(nodes.get(e)?.parents || [])][0]; const pp = par && P(par); cx.pos.set(e, pp ? [pp[0] + (W / 2 - pp[0]) * .2, pp[1]] : [W / 2, H / 2]); }
    const [ex, ey] = P(e);
    const kids = edges.filter(x => x.from === e && !P(x.to)).map(x => x.to).filter((v, i, a) => a.indexOf(v) === i);
    if (!kids.length) continue;
    const groups = new Map(); for (const k of kids) { const g = nodes.get(k).group || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); }
    const gk = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const unit = k => { const n = nodes.get(k); return n.info.art ? 2.2 : n.info.sci ? 1.5 : 1.15; };
    const weights = gk.map(g => Math.max(2.2, groups.get(g).reduce((a, k) => a + unit(k), 0) + 1.2));
    const total = weights.reduce((a, b) => a + b, 0);
    const isRoot = e === root && cx.expanded.length === 1;
    // the root fans out all round; later expansions fan away from the picture's centre
    const out = Math.atan2(ey - H / 2, ex - W / 2); const span = isRoot ? Math.PI * 2 : Math.min(Math.PI * 1.35, Math.PI * .5 + total * .12);
    let ang = isRoot ? -Math.PI / 2 - Math.PI * weights[0] / total : out - span / 2;
    const rad = isRoot ? R : Math.max(130, Math.min(R * 1.05, 110 + 9 * kids.length));
    gk.forEach((g, gi) => { const step = span / total; let cum = .6;
      groups.get(g).forEach((k, i) => { const u = unit(k); const a = ang + step * (cum + u / 2); cum += u; const r = rad * (groups.get(g).length > 2 ? (i % 2 ? .78 : 1) : .92) + (h01(k) - .5) * 8;
        const nx = ex + r * Math.cos(a), ny = ey + r * Math.sin(a);
        cx.pos.set(k, isRoot ? [Math.max(W * .03, Math.min(W * .97, nx)), Math.max(H * .05, Math.min(H * .92, ny))] : [nx, ny]); });
      ang += span * weights[gi] / total; });
  }
  // gentle relaxation: nodes that already had a place barely move; links keep children near their parent
  const had = new Set([...nodes.keys()].filter(id => app._placed?.has(id)));
  if ([...nodes.keys()].every(id => had.has(id))) return;              // nothing new: nothing moves
  const arr = [...nodes.values()].map(n => { const [x, y] = P(n.id); return { id: n.id, x, y, r: radius(kb, n), w: textW(labelText(n).main), anchor: had.has(n.id) || n.expanded && had.size ? 1 : 0 }; });
  relax(arr, edges.map(e => [e.from, e.to, cx.expanded.length === 1 && e.from === root ? R : 120]), W, H, { iters: had.size ? 70 : 120, gravity: 0, clamp: cx.expanded.length === 1 });
  for (const n of arr) cx.pos.set(n.id, [n.x, n.y]);
  app._placed = new Set([...(app._placed || []), ...nodes.keys()]);
}

function radius(kb, n) { if (n.expanded) return n.info.art ? 46 : 30; if (n.info.art) return 22; if (n.info.sci) return 15; if (n.info.kind === 'agg') return 11; return 8; }
function labelText(n) {
  const i = n.info;
  if (i.kind === 'more') return { main: i.name };
  if (i.sci) return i.common ? { main: trim(i.common, 26), sub: trim(i.name, 34) } : { main: trim(i.name, 34) };
  return { main: trim(i.short || i.name, n.expanded ? 40 : 30) };
}
function nameText(kb, id) { const n = A.nodeInfo(kb, id); return n.common || n.short || n.name; }
function nameOf(kb, id) { const n = A.nodeInfo(kb, id); return n.sci ? (n.common ? `${esc(n.common)} <span class="dim">${sci(n.name)}</span>` : sci(n.name)) : esc(n.short || n.name); }

function shape(kind, mine, r = 7) {
  switch (kind) {
    case 'record': return `<path d="M0 ${-r}L${r} 0 0 ${r} ${-r} 0Z" fill="var(--mine)"/>`;
    case 'concept': return `<circle r="${r * .55}" fill="currentColor"/>`;
    case 'place': return `<path d="M0 ${-r}L${r * .9} ${r * .7}H${-r * .9}Z" fill="var(--paper)" stroke="var(--ink-2)"/>`;
    case 'dataset': case 'list': return `<rect x="${-r}" y="${-r * .8}" width="${2 * r}" height="${1.6 * r}" fill="var(--paper)" stroke="${mine ? 'var(--mine)' : 'var(--ink-2)'}"/><path d="M${-r} ${-r * .25}H${r}M${-r} ${r * .3}H${r}" stroke="${mine ? 'var(--mine)' : 'var(--ink-2)'}" stroke-width=".8"/>`;
    case 'source': return `<rect x="${-r * .75}" y="${-r * .75}" width="${1.5 * r}" height="${1.5 * r}" fill="var(--paper)" stroke="var(--ink-2)"/>`;
    case 'survey': return `<rect x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" fill="var(--paper)" stroke="var(--ink-2)"/><circle cx="-3" cy="-3" r="1.2" fill="var(--ink-2)"/><circle cx="3" cy="-3" r="1.2" fill="var(--ink-2)"/><circle cx="-3" cy="3" r="1.2" fill="var(--ink-2)"/><circle cx="3" cy="3" r="1.2" fill="var(--ink-2)"/>`;
    case 'planting_system': { const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; p.push(`${(r * 1.1 * Math.cos(a)).toFixed(1)},${(r * 1.1 * Math.sin(a)).toFixed(1)}`); } return `<polygon points="${p.join(' ')}" fill="var(--paper)" stroke="var(--ink)"/>`; }
    case 'topic': case 'role': return `<rect x="${-r}" y="${-r * .6}" width="${2 * r}" height="${1.2 * r}" fill="var(--paper)" stroke="var(--ink-2)" stroke-dasharray="${kind === 'role' ? '2 1.5' : ''}"/>`;
    case 'me': return `<path d="M0 ${-r}L${r} 0 0 ${r} ${-r} 0Z" fill="var(--mine)"/>`;
    case 'agg': return `<circle r="${r * 1.5}" fill="var(--paper)" stroke="currentColor"/><circle cx="-3.5" r="1.6" fill="currentColor"/><circle r="1.6" fill="currentColor"/><circle cx="3.5" r="1.6" fill="currentColor"/>`;
    case 'more': return `<circle r="${r * 1.6}" fill="var(--paper)" stroke="var(--ink-3)" stroke-dasharray="2 2"/>`;
    default: return `<circle r="${r * .6}" fill="var(--paper)" stroke="var(--ink-3)"/>`;
  }
}
function shapeKey() {
  const k = [['planting_system', 'recipe'], ['dataset', 'dataset'], ['survey', 'survey'], ['source', 'source'], ['place', 'place'], ['concept', 'attribute'], ['agg', 'folded group'], ['record', 'my note']];
  return k.map(([kind, l]) => `<svg width="16" height="14" style="vertical-align:-3px;margin:0 3px 0 8px;overflow:visible" aria-hidden="true"><g transform="translate(8,7)" style="color:var(--ink-3)">${shape(kind, false, 5)}</g></svg>${l}`).join('');
}
function body(kb, n) {
  const i = n.info; const isP = i.kind === 'plant' || i.kind === 'cultivar';
  if (isP) {
    const ent = kb.state.entities.get(n.id) || {};
    if (n.expanded) return i.art ? `<circle class="ring" r="46" style="stroke:var(--ink)"/><image href="art/${esc(i.art)}.webp" x="-38" y="-42" width="76" height="82"/>` : `<circle class="ring" r="30" style="stroke:var(--ink)"/><g transform="translate(-22,-24) scale(1.85)" class="glyph">${glyph(ent.plantType || 'unknown').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
    return i.art ? `<circle class="ring" r="22"/><image href="art/${esc(i.art)}.webp" x="-18" y="-21" width="36" height="39"/>` : `<circle class="ring" r="15"/><g transform="translate(-11,-12) scale(.92)" class="glyph">${glyph(ent.plantType || 'unknown').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
  }
  const th = n.group?.startsWith('Attributes · ') ? themeOf(n.group) : null;
  if (n.expanded) return `<circle r="30" fill="var(--paper)" stroke="var(--ink)"/><g transform="scale(2.1)" style="color:var(--ink)">${shape(i.kind, i.mine)}</g>`;
  if (i.kind === 'more') return `${shape('more')}<text y="4" text-anchor="middle" style="font:500 10px var(--f-mono)">${esc(i.name)}</text>`;
  return `<g style="color:${th ? THEME_COLOR[th] : 'var(--ink-2)'}">${shape(i.kind, i.mine)}</g>`;
}
