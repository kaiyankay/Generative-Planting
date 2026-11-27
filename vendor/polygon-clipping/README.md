# polygon-clipping (vendored)

| library | version | source | licence | used for |
|---|---|---|---|---|
| polygon-clipping | 0.15.7 | https://github.com/mfogel/polygon-clipping (`dist/polygon-clipping.esm.js`) | MIT (`LICENSE.md`) | zones = cells ∩ bed outline; exact overlap area in the patch API |
| splaytree (dependency) | 3.1.2 | https://github.com/w8r/splay-tree (`dist/splay.esm.js`) | MIT | sweep-line event queue |
| robust-predicates (dependency) | 3.0.2 | https://github.com/mourner/robust-predicates | Unlicense (`LICENSE-robust-predicates`) | exact orientation test |

The two bare imports of the ESM build were rewritten to the relative files beside it; nothing else changed.
Same files as the copy used by the planting-db design workspace (fetched from the npm CDN, 2026-11-08).
