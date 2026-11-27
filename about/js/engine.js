// Generative Planting · About — the real engine, loaded read-only in an isolated, in-memory project.
//
// The About pages never touch the visitor's design: this module builds its OWN Project (never saved), its own Active Knowledge
// (personal layer read from an empty, About-only store) and refuses every write to the workflow's storage keys while it runs.
// Everything it returns is computed by the same modules the Design workspace uses (src/flow/*).
import { ModelStore } from '../../src/model.js';
import { ComputeSpace } from '../../src/compute.js';
import { PlantLibrary } from '../../src/design/library.js';
import { ActiveKnowledge } from '../../src/flow/knowledge.js';
import { Project } from '../../src/flow/project.js';

export const ROOT = new URL('../../', import.meta.url).href;
const GUARDED = /^gp\./; // the workflow's keys: gp.flow.project.v2, gp.flow.snapshots.v2, gp.workingDraft.v1 …

// while the About engine runs, a write to a workflow key is dropped (reads are untouched)
function guardStorage() {
  try {
    const S = Storage.prototype; if (S.__gpAboutGuard) return; const set = S.setItem, rem = S.removeItem;
    S.setItem = function (k, v) { if (this === window.localStorage && GUARDED.test(k)) return; return set.call(this, k, v); };
    S.removeItem = function (k) { if (this === window.localStorage && GUARDED.test(k)) return; return rem.call(this, k); };
    S.__gpAboutGuard = true;
  } catch { /* storage unavailable: nothing to protect */ }
}

let _eng = null;
export function loadEngine() {
  if (_eng) return _eng;
  guardStorage();
  _eng = (async () => {
    const j = (p) => fetch(ROOT + p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const store = await ModelStore.load(ROOT + 'data/detroit/');
    const cs = new ComputeSpace(store, await j('data/compute.json')); store.compute = cs;
    const libFile = await j('data/detroit/design-library.json');
    const lib = new PlantLibrary(store, { place: (libFile && libFile.place) || 'place:detroit', library: libFile });
    await lib.loadKnowledge({ base: ROOT + 'knowledge/', db: 'gp-knowledge-about-readonly' });
    const teaching = await j('data/detroit/teaching-traits.json');
    const legend = await j('data/detroit/mixes.json');
    const site = { id: 'detroit', name: 'Oudolf Garden Detroit' };
    let P = null; const K = new ActiveKnowledge({ store, library: lib, teaching, project: () => (P ? P.state : null) });
    P = isolated(new Project({ store, cs, K, site }));
    const fresh = () => { const Q = isolated(new Project({ store, cs, K, site })); P = Q; return Q; };
    return { store, cs, lib, K, teaching, legend, site, get P() { return P; }, fresh };
  })();
  return _eng;
}
// a Project that can never persist
function isolated(P) { P.save = () => {}; P.saveSoon = () => {}; P.saveSnapshot = () => ({ ok: false, error: 'About: not saved' }); return P; }
