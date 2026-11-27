// Personal layer persistence: IndexedDB in this browser + a JSON workspace file for export / import.
// The Base snapshot is never stored here; only the user's events, retrieval traces and attached files.

const DB = 'gp-knowledge'; const VER = 1;   // tests pass another name, so they never touch a real personal layer
export const WORKSPACE_FORMAT = 'gp-knowledge-workspace/1';

// The Preset seed. Served from this machine, the full research copy (data/local/, git-ignored: licence-unclear rows and
// quotes) is used when it exists; everywhere else — and with ?copy=public — the published copy (data/seed.json).
export async function loadSeed(params = new URLSearchParams(location.search)) {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && params.get('copy') !== 'public';
  if (local) { const r = await fetch('data/local/seed.json').catch(() => null); if (r?.ok) return r.json(); }
  return fetch('data/seed.json').then(r => r.json());
}

function open(name = DB) {
  return new Promise((res, rej) => {
    const q = indexedDB.open(name, VER);
    q.onupgradeneeded = () => {
      const db = q.result;
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'seq', autoIncrement: true });
      if (!db.objectStoreNames.contains('traces')) db.createObjectStore('traces', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    };
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}

function tx(db, store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode); const s = t.objectStore(store); let out;
    Promise.resolve(fn(s)).then(v => { out = v; });
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const all = s => new Promise((res, rej) => { const q = s.getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });

export class Store {
  constructor(name = DB) { this.name = name; this.db = null; this.available = typeof indexedDB !== 'undefined'; this.error = null; }
  async init() {
    if (!this.available) return this;
    try { this.db = await open(this.name); } catch (e) { this.available = false; this.error = String(e); }
    return this;
  }
  async loadEvents() { if (!this.db) return []; const rows = await tx(this.db, 'events', 'readonly', all); return rows.sort((a, b) => a.seq - b.seq).map(({ seq, ...e }) => e); }
  async appendEvent(e) { if (this.db) await tx(this.db, 'events', 'readwrite', s => { s.add(structuredClone(e)); }); }
  async replaceEvents(events) { if (this.db) await tx(this.db, 'events', 'readwrite', s => { s.clear(); for (const e of events) s.add(structuredClone(e)); }); }
  async loadTraces() { return this.db ? (await tx(this.db, 'traces', 'readonly', all)).sort((a, b) => a.at < b.at ? -1 : 1) : []; }
  async saveTrace(t) { if (this.db) await tx(this.db, 'traces', 'readwrite', s => { s.put(structuredClone(t)); }); }
  async putFile(f) { if (this.db) await tx(this.db, 'files', 'readwrite', s => { s.put(f); }); }
  async getFile(id) { return this.db ? tx(this.db, 'files', 'readonly', s => new Promise(r => { const q = s.get(id); q.onsuccess = () => r(q.result); })) : null; }
  async allFiles() { return this.db ? tx(this.db, 'files', 'readonly', all) : []; }
  async clearAll() { if (this.db) for (const n of ['events', 'traces', 'files']) await tx(this.db, n, 'readwrite', s => { s.clear(); }); }
}

const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

export async function exportWorkspace(kb, store) {
  const files = [];
  for (const f of await store.allFiles()) files.push({ id: f.id, name: f.name, type: f.type, size: f.size, data: b64(await f.blob.arrayBuffer()) });
  return { format: WORKSPACE_FORMAT, exportedAt: new Date().toISOString(), baseVersion: kb.baseVersion, activeRevision: kb.activeRevision,
    note: 'Personal knowledge layer only (events on top of the Base snapshot). Contains your notes and attached files; share it deliberately.',
    events: kb.events, traces: kb.traces, files };
}

export function parseWorkspace(obj) {
  if (!obj || obj.format !== WORKSPACE_FORMAT || !Array.isArray(obj.events)) throw new Error('not a knowledge workspace file (' + (obj?.format || 'no format') + ')');
  for (const e of obj.events) if (!e.id || !e.type) throw new Error('event without id/type');
  return obj;
}

export async function importWorkspace(obj, kb, store, { mode = 'replace' } = {}) {
  const ws = parseWorkspace(obj);
  const events = mode === 'merge' ? [...kb.events, ...ws.events.filter(e => !kb.events.some(x => x.id === e.id))] : ws.events;
  kb.setEvents(events);                      // throws nothing; unknown targets simply have no effect in rebuild
  await store.replaceEvents(events);
  for (const f of ws.files || []) await store.putFile({ id: f.id, name: f.name, type: f.type, size: f.size, blob: new Blob([unb64(f.data)], { type: f.type }) });
  for (const t of ws.traces || []) { if (!kb.traces.some(x => x.id === t.id)) kb.traces.push(t); await store.saveTrace(t); }
  return { events: events.length, baseVersionMatches: ws.baseVersion === kb.baseVersion, importedBase: ws.baseVersion };
}
