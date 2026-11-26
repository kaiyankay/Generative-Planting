"""Curated, citable facts for Oudolf Garden Detroit + model-side form proxies.

FACTS (dataKind=source) are transcribed by hand from:
  S-OGD-PL-2026   official Plant List, Feb 2026 (PDF, oudolfgardendetroit.org)
  S-OGD-FA-2019 / S-OGD-FB-2019 / S-OGD-FC-2019   Piet Oudolf, revised planting plans A/B/C, Oct 2019 (legends)
  S-OGD-BA-2020 / S-OGD-BB-2020 / S-OGD-BC-2020   Piet Oudolf, bulb plans A/B/C, Sept 2020 (legends)
  S-OGD-RG-2020   Rain Garden trees & shrubs plan, March 2020 (legend)
  S-OGD-BB-2023   Bird Border drawing (legend)
  S-OGD-MEADOW-2026  East / West Meadow plant lists, Feb 2026
Only species names, legend codes and legend grouping are taken from the drawings —
never their drawn geometry (the drawings are copyrighted and are not redistributed).

INFERRED (dataKind=inferred): growth-form proxy, nominal height, display colour.
They are general horticultural knowledge used for rendering, not Oudolf's data.
"""

# ---------------------------------------------------------------- form proxies
# form -> renderer recipe. h = nominal mature height (m), w = spread (m)
# colour words are display colours for the illustrative summer state.

SP = {}  # id -> dict


def sp(sid, name, cultivar=None, ptype="forb", form="umbel", h=0.6, w=0.5, flower=None, leaf="#5f7a4a",
       aliases=None, note=None):
    SP[sid] = {"id": sid, "scientificName": name, "cultivar": cultivar, "plantType": ptype,
               "formProxy": form, "nominalHeightM": h, "nominalSpreadM": w,
               "displayFlower": flower, "displayLeaf": leaf, "aliases": aliases or [], "note": note}
    return sid


# ---- grasses & sedges
sp("sp.sporobolus-heterolepis", "Sporobolus heterolepis", None, "grass", "grass-fine", 0.6, 0.6, "#d9c9a0", "#7a8f4e")
sp("sp.schizachyrium-smoke-signal", "Schizachyrium scoparium", "Smoke Signal", "grass", "grass-upright", 0.8, 0.4, "#b98a6a", "#7d8a74")
sp("sp.schizachyrium-blue-paradise", "Schizachyrium scoparium", "Blue Paradise", "grass", "grass-upright", 0.8, 0.4, "#b07d73", "#7c8d8a")
sp("sp.schizachyrium-ha-ha-tonka", "Schizachyrium scoparium", "Ha Ha Tonka", "grass", "grass-upright", 0.8, 0.4, "#a98b6b", "#7f9594")
sp("sp.schizachyrium-standing-ovation", "Schizachyrium scoparium", "Standing Ovation", "grass", "grass-upright", 0.9, 0.4, "#b28466", "#7b8c79")
sp("sp.eragrostis-spectabilis", "Eragrostis spectabilis", None, "grass", "grass-haze", 0.45, 0.5, "#b8798c", "#7d8f55")
sp("sp.molinia-crystal-veil", "Molinia arundinacea", "Crystal Veil", "grass", "grass-tall-airy", 1.8, 0.8, "#c9b27f", "#74884a")
sp("sp.molinia-whirlwind", "Molinia caerulea", "Whirlwind", "grass", "grass-tall-airy", 1.4, 0.7, "#bba476", "#74884a")
sp("sp.andropogon-dancing-wind", "Andropogon gerardii", "Dancing Wind", "grass", "grass-upright", 1.6, 0.6, "#8d6a6e", "#6f8270")
sp("sp.andropogon-red-october", "Andropogon gerardii", "Red October", "grass", "grass-upright", 1.5, 0.6, "#9a5a52", "#6c7d63")
sp("sp.pennisetum-viridescens", "Pennisetum alopecuroides", "Viridescens", "grass", "grass-bottlebrush", 0.8, 0.7, "#3f3a36", "#6f8a4c",
   aliases=["Pennisetum viridescens"], note="Listed as 'Pennisetum viridescens'.")
sp("sp.deschampsia-goldtau", "Deschampsia cespitosa", "Goldtau", "grass", "grass-haze", 0.7, 0.5, "#d6c28a", "#6e8a48")
sp("sp.carex-bromoides", "Carex bromoides", None, "sedge", "grass-fine", 0.4, 0.4, None, "#71904b")
sp("sp.carex-comosa", "Carex comosa", None, "sedge", "grass-fine", 0.8, 0.6, "#8f9a62", "#6f8b48")
sp("sp.carex-muskingumensis", "Carex muskingumensis", None, "sedge", "grass-fine", 0.6, 0.5, None, "#7a9a4a")
sp("sp.carex-little-midge", "Carex muskingumensis", "Little Midge", "sedge", "grass-fine", 0.3, 0.3, None, "#7a9a4a")

# ---- A plan forbs (2019 legend names; current 2026 list names in aliases where different)
sp("sp.achillea-moonshine", "Achillea", "Moonshine", "forb", "umbel", 0.6, 0.5, "#e9d86a", "#9aa88a")
sp("sp.achillea-parkers", "Achillea filipendulina", "Parker's Variety", "forb", "umbel", 1.2, 0.6, "#d9b43a", "#8b9a6f")
sp("sp.amsonia-hubrichtii", "Amsonia hubrichtii", None, "forb", "feather-mound", 0.9, 0.9, "#9fb1d8", "#7f9a4e")
sp("sp.amsonia-salicifolia", "Amsonia tabernaemontana var. salicifolia", None, "forb", "feather-mound", 0.9, 0.7, "#8ea4d8", "#6f8f4c",
   aliases=["Amsonia tabernaemontana 'Storm Cloud' (2026 list)"])
sp("sp.anemone-hadspen", "Anemone hupehensis", "Hadspen Abundance", "forb", "saucer", 0.8, 0.5, "#d78aa8", "#5e7a46",
   aliases=["Anemone x hybrida 'September Charm' (2026 list)"])
sp("sp.aster-twilight", "Eurybia macrophylla", "Twilight", "forb", "daisy-small", 0.6, 0.5, "#a9a1d6", "#5f7b47",
   aliases=["Aster 'Twilight'"])
sp("sp.astilbe-visions-pink", "Astilbe chinensis", "Visions in Pink", "forb", "plume", 0.5, 0.4, "#e7a6c0", "#4f6f3c")
sp("sp.centaurea", "Centaurea montana", "Amethyst Dream", "forb", "daisy-small", 0.5, 0.4, "#7c4fa8", "#7d8f6a",
   note="Legend reads 'Centaurea + Calamintha'; cultivar from 2026 list.")
sp("sp.calamintha-nepeta", "Calamintha nepeta subsp. nepeta", None, "forb", "cloud", 0.45, 0.5, "#e4e3f0", "#7b9064")
sp("sp.echinacea-fatal-attraction", "Echinacea purpurea", "Fatal Attraction", "forb", "daisy", 0.8, 0.45, "#c2457c", "#4f6b3a")
sp("sp.dalea-purpurea", "Dalea purpurea", None, "forb", "spike-short", 0.6, 0.4, "#9b4f9a", "#74895c")
sp("sp.geum-triflorum", "Geum triflorum", None, "forb", "cloud", 0.3, 0.35, "#c98a96", "#6c8752")
sp("sp.echinops-starfrost", "Echinops bannaticus", "Starfrost", "forb", "globe", 1.1, 0.6, "#e8ecef", "#8a9a86")
sp("sp.eryngium-yuccifolium", "Eryngium yuccifolium", None, "forb", "globe-small", 1.2, 0.5, "#d9dfcf", "#8fa3a0")
sp("sp.eragrostis-spec", "Eragrostis", "spec.", "grass", "grass-haze", 0.5, 0.5, "#b8798c", "#7d8f55",
   note="Legend 'Eragrostis spec. + Limonium latif.'")
sp("sp.limonium-latifolium", "Limonium latifolium", None, "forb", "cloud", 0.6, 0.6, "#b7a6dc", "#6e8550")
sp("sp.eupatorium-hyssopifolium", "Eupatorium hyssopifolium", None, "forb", "umbel", 0.8, 0.5, "#f0efe2", "#6a8048")
sp("sp.lobelia-siphilitica", "Lobelia siphilitica", None, "forb", "spike", 0.7, 0.35, "#4d63b8", "#5c7a40")
sp("sp.lythrum-alatum", "Lythrum alatum", None, "forb", "spike-airy", 0.8, 0.4, "#b65aa8", "#5f7d45")
sp("sp.monarda-bradburiana", "Monarda bradburiana", None, "forb", "whorl", 0.5, 0.45, "#d7b4d6", "#6c7d5c")
sp("sp.penstemon-digitalis", "Penstemon digitalis", None, "forb", "spike-airy", 0.9, 0.4, "#f2eee8", "#556e3d")
sp("sp.perovskia-blue-spire", "Perovskia atriplicifolia", "Blue Spire / Blue Steel", "forb", "spike-airy", 1.0, 0.7, "#8f9cd8", "#a7b0a0",
   note="Legend 'Perovskia Blue Spritzer(?) + Liatris pyc.'; 2026 list: 'Blue Steel'.")
sp("sp.liatris-pycnostachya", "Liatris pycnostachya", None, "forb", "spike", 1.1, 0.35, "#b45cb1", "#5d7a44")
sp("sp.phlox-blue-paradise", "Phlox paniculata", "Blue Paradise", "forb", "dome", 0.9, 0.5, "#7d74c9", "#4e6e39",
   aliases=["Phlox paniculata 'Fashionably Early Lavender Ice' (2026 list)"])
sp("sp.phlox-sweet-laura", "Phlox paniculata", "Sweet Laura", "forb", "dome", 0.9, 0.5, "#d36aa3", "#4e6e39")
sp("sp.pycnanthemum-muticum", "Pycnanthemum muticum", None, "forb", "umbel", 0.8, 0.6, "#e3e2e8", "#8a9e7a")
sp("sp.scutellaria-incana", "Scutellaria incana", None, "forb", "spike-short", 0.8, 0.5, "#8fa6d8", "#7b9068")
sp("sp.sedum-matrona", "Hylotelephium", "Matrona", "forb", "umbel", 0.6, 0.5, "#c98c8e", "#7d8f7a",
   aliases=["Hylotelephium (Sedum) 'Pillow Talk' (2026 list)"])
sp("sp.echinacea-virgin", "Echinacea purpurea", "Virgin", "forb", "daisy", 0.7, 0.45, "#f3f0e4", "#4f6b3a")
sp("sp.stachys-hummelo", "Stachys monieri", "Hummelo", "forb", "spike-short", 0.5, 0.45, "#c45aa2", "#4e6e3a")
sp("sp.stachys-pink", "Stachys officinalis", "pink (Mrs. Magenta)", "forb", "spike-short", 0.5, 0.45, "#d77ab3", "#4e6e3a",
   note="Legend 'Stachys pink (future plants)'; 2026 list 'Mrs. Magenta'.")
sp("sp.vernonia-summers-surrender", "Vernonia", "Summer's Surrender", "forb", "umbel-tall", 1.3, 0.6, "#8e3c8c", "#4e6a3a")
sp("sp.geranium-raven", "Geranium", "Raven", "forb", "cloud", 0.5, 0.5, "#6b3f6f", "#5f7c45",
   aliases=["Geranium psilostemon / sanguineum 'Max Frei' (2026 list)"])
sp("sp.vernonia-summers-swan-song", "Vernonia", "Summer's Swan Song", "forb", "umbel-tall", 1.3, 0.6, "#9b4a96", "#4e6a3a")
sp("sp.veronica-goodnight-irene", "Veronica", "Goodnight Irene", "forb", "spike", 0.6, 0.4, "#4e58b0", "#4f6c3b")
# A emergents
sp("sp.asclepias-tuberosa", "Asclepias tuberosa", None, "forb", "umbel", 0.6, 0.45, "#e98d2c", "#5e7a3e")
sp("sp.aster-october-skies", "Symphyotrichum oblongifolium", "October Skies", "forb", "daisy-small", 0.6, 0.6, "#7f84d4", "#6b8452")
sp("sp.geranium-psilostemon", "Geranium psilostemon", None, "forb", "cloud", 0.9, 0.8, "#c2307f", "#4f6f3a")
sp("sp.helenium-kupferzwerg", "Helenium", "Kupferzwerg", "forb", "daisy", 0.9, 0.5, "#d7742c", "#5a7542",
   aliases=["Helenium 'Sahin's Early Flowerer' (2026 list)"])
sp("sp.iris-germanica", "Iris germanica", "mixed", "forb", "sword", 0.8, 0.4, "#6b5aa6", "#8aa09a")
sp("sp.parthenium-integrifolium", "Parthenium integrifolium", None, "forb", "umbel", 0.9, 0.5, "#efeee6", "#5d7a46")
sp("sp.persicaria-firetail", "Persicaria amplexicaulis", "Firetail", "forb", "spike", 1.0, 0.8, "#c5233d", "#4f7039")
sp("sp.salvia-azurea", "Salvia azurea", "Nekan", "forb", "spike-airy", 1.2, 0.5, "#7aa2e0", "#7d9067")
sp("sp.salvia-pink-delight", "Salvia pratensis", "Pink Delight", "forb", "spike", 0.6, 0.4, "#d77fb0", "#5f7a45")
sp("sp.veronicastrum-cupid", "Veronicastrum", "Cupid", "forb", "spike-candelabra", 1.4, 0.5, "#9f8ec9", "#4e6c3a",
   aliases=["Veronicastrum sibiricum 'Red Arrows' (2026 list)"])

# ---- B plan forbs
sp("sp.achillea-terracotta", "Achillea millefolium", "Terra Cotta", "forb", "umbel", 0.7, 0.5, "#cf8a52", "#7f8f6a")
sp("sp.saponaria-max-frei", "Saponaria x lempergii", "Max Frei", "forb", "cloud", 0.4, 0.5, "#e58fbd", "#6e8550")
sp("sp.echinacea-hula-dancer", "Echinacea pallida", "Hula Dancer", "forb", "daisy-drooping", 0.9, 0.35, "#e2a7c6", "#557043")
sp("sp.echinops-veitchs-blue", "Echinops ritro", "Veitch's Blue", "forb", "globe", 0.9, 0.5, "#6f86c8", "#8a9a86",
   aliases=["Echinops bannaticus 'Blue Glow' (2026 list)"])
sp("sp.eryngium-bourgatii", "Eryngium bourgatii", None, "forb", "globe-small", 0.45, 0.4, "#9fb3cf", "#8fa3a0")
sp("sp.helenium-moerheim", "Helenium", "Moerheim Beauty", "forb", "daisy", 1.0, 0.5, "#b8432b", "#5a7542",
   aliases=["Helenium 'Potter's Wheel' (2026 list)"])
sp("sp.iris-perrys-blue", "Iris sibirica", "Perry's Blue", "forb", "sword", 0.9, 0.5, "#5873c4", "#6e8f4a")
sp("sp.persicaria-alba", "Persicaria amplexicaulis", "Alba", "forb", "spike", 1.0, 0.8, "#f1ece6", "#4f7039")
sp("sp.pycnanthemum-flexuosum", "Pycnanthemum flexuosum", None, "forb", "umbel", 0.7, 0.5, "#e6e0ea", "#7a9068")
sp("sp.salvia-crystal-blue", "Salvia nemorosa", "Crystal Blue", "forb", "spike", 0.5, 0.4, "#a9b9e8", "#5f7a45")
sp("sp.salvia-mainacht", "Salvia nemorosa", "Mainacht", "forb", "spike", 0.6, 0.4, "#45358f", "#5f7a45")
sp("sp.veronica-pink-eveline", "Veronica longifolia", "Pink Eveline", "forb", "spike", 0.7, 0.4, "#e092c3", "#557043")
sp("sp.allium-big-beauty", "Allium", "Big Beauty", "bulb", "globe", 0.9, 0.3, "#9b6cc8", "#7a9a6a",
   note="B legend 'Veronica Pink Eveline + Allium Big Beauty'; not on 2026 list.")
sp("sp.althaea-park-allee", "Alcalthaea suffrutescens", "Park Allee", "forb", "spike-tall", 1.6, 0.6, "#f2d6d8", "#5f7a45")
sp("sp.asclepias-purpurascens", "Asclepias purpurascens", None, "forb", "umbel", 0.8, 0.45, "#a33a6d", "#5e7a3e")
sp("sp.aster-little-carlow", "Symphyotrichum", "Little Carlow", "forb", "daisy-small", 0.9, 0.6, "#6a72cc", "#5f7b47")
sp("sp.gentiana-andrewsii", "Gentiana andrewsii", None, "forb", "spike-short", 0.5, 0.35, "#2f4fa8", "#4f6e3c")
sp("sp.papaver-matador", "Papaver orientale", "Matador", "forb", "cup", 0.8, 0.5, "#d8322a", "#788a62",
   aliases=["Papaver orientale 'Patty's Plum' (2026 list)"])
sp("sp.perovskia-little-spire", "Perovskia atriplicifolia", "Little Spire", "forb", "spike-airy", 0.7, 0.5, "#8f9cd8", "#a7b0a0")
sp("sp.persicaria-orange-field", "Persicaria amplexicaulis", "Orange Field", "forb", "spike", 1.0, 0.8, "#e3684a", "#4f7039")
sp("sp.phlomis-prima-donna", "Phlomis tuberosa", "Prima Donna", "forb", "whorl-tall", 1.2, 0.6, "#d4a2c4", "#5d7444")
sp("sp.trollius-new-moon", "Trollius x cultorum", "New Moon", "forb", "cup", 0.6, 0.4, "#f1e1a0", "#4f6e3a")
sp("sp.veronicastrum-challenger", "Veronicastrum virginicum", "Challenger", "forb", "spike-candelabra", 1.6, 0.6, "#efe9ea", "#4e6c3a")
sp("sp.baptisia-carolina-moonlight", "Baptisia", "Carolina Moonlight", "forb", "shrubby", 1.0, 0.9, "#efe09a", "#6f8770")
sp("sp.baptisia-lunar-eclipse", "Baptisia", "Lunar Eclipse", "forb", "shrubby", 1.0, 0.9, "#cbbfe0", "#6f8770")
sp("sp.baptisia-midnight-prairie-blues", "Baptisia", "Midnight Prairie Blues", "forb", "shrubby", 1.1, 0.9, "#3e4fa0", "#6f8770")
sp("sp.baptisia-leucantha", "Baptisia leucantha", None, "forb", "shrubby", 1.2, 0.9, "#f1efe4", "#6f8770")

# ---- C plan forbs
sp("sp.allium-summer-beauty", "Allium lusitanicum", "Summer Beauty", "forb", "globe-small", 0.45, 0.35, "#d6b7e0", "#7c9a6c")
sp("sp.deschampsia-goldtau-c", "Deschampsia cespitosa", "Goldtau", "grass", "grass-haze", 0.7, 0.5, "#d6c28a", "#6e8a48")
del SP["sp.deschampsia-goldtau-c"]
sp("sp.echinacea-pallida", "Echinacea pallida", "Hula Dancer", "forb", "daisy-drooping", 0.9, 0.35, "#e2a7c6", "#557043")
del SP["sp.echinacea-pallida"]
sp("sp.liatris-spicata-alba", "Liatris spicata", "Alba", "forb", "spike", 0.8, 0.3, "#f2efe6", "#5d7a44")
sp("sp.iris-caesars-brother", "Iris sibirica", "Caesar's Brother", "forb", "sword", 0.9, 0.5, "#3b2d7a", "#6e8f4a")
sp("sp.eryngium-big-blue", "Eryngium x zabelii", "Big Blue", "forb", "globe-small", 0.7, 0.5, "#5872c0", "#8fa3a0")
sp("sp.salvia-rhapsody-in-blue", "Salvia x sylvestris", "Rhapsody in Blue", "forb", "spike", 0.6, 0.4, "#3d4bb0", "#5f7a45")
sp("sp.amorpha-canescens", "Amorpha canescens", None, "shrub", "shrubby", 0.8, 0.8, "#5d3c8a", "#a3ab9a")
sp("sp.stachys-rosea", "Stachys officinalis", "Rosea", "forb", "spike-short", 0.5, 0.4, "#e293bf", "#4e6e3a")
sp("sp.stokesia-peachies-pick", "Stokesia laevis", "Peachie's Pick", "forb", "daisy-small", 0.4, 0.4, "#8c8be0", "#557043")
sp("sp.asclepias-incarnata", "Asclepias incarnata", None, "forb", "umbel", 1.2, 0.6, "#d17aa0", "#5e7a3e")
sp("sp.aster-horizontalis", "Symphyotrichum lateriflorum", "Horizontalis", "forb", "daisy-small", 0.6, 0.6, "#efe3ea", "#5a5f3e")
sp("sp.hemerocallis-chicago-apache", "Hemerocallis", "Chicago Apache", "forb", "sword", 0.7, 0.6, "#b8262d", "#6c8a44")
sp("sp.rudbeckia-little-henry", "Rudbeckia subtomentosa", "Little Henry", "forb", "daisy", 0.9, 0.5, "#e7b62e", "#5a7542")
sp("sp.thalictrum-thundercloud", "Thalictrum aquilegiifolium", "Thundercloud", "forb", "cloud-tall", 0.9, 0.5, "#8a4a8f", "#7f9a8a",
   note="On C legend; not on 2026 list.")
sp("sp.papaver-mrs-perry", "Papaver orientale", "Mrs. Perry", "forb", "cup", 0.8, 0.5, "#e7a39b", "#788a62")

# ---- bulbs (2020 bulb plan legends)
for sid, name, cv, col in [
    ("sp.allium-christophii", "Allium christophii", None, "#a98ad0"),
    ("sp.allium-obliquum", "Allium obliquum", None, "#e3e08a"),
    ("sp.anemone-blue-shades", "Anemone blanda", "Blue Shades", "#5f7bd0"),
    ("sp.iris-katharine-hodgkin", "Iris", "Katharine Hodgkin", "#9fb4d8"),
    ("sp.lilium-martagon", "Lilium martagon", "Claude Shride", "#7a2140"),
    ("sp.narcissus-lemon-drops", "Narcissus", "Lemon Drops", "#f3eba2"),
    ("sp.ornithogalum-sochii", "Ornithogalum ponticum", "Sochii", "#f4f2ea"),
    ("sp.scilla-mischtschenkoana", "Scilla mischtschenkoana", None, "#c9d6ee"),
    ("sp.tulipa-spring-green", "Tulipa viridiflora", "Spring Green", "#e9efd2"),
    ("sp.tulipa-shirley", "Tulipa", "Shirley", "#efe6f2"),
    ("sp.allium-carinatum-pulchellum", "Allium carinatum subsp. pulchellum", None, "#b77fc0"),
    ("sp.allium-nigrum", "Allium nigrum", None, "#f1efe6"),
    ("sp.camassia-semiplena", "Camassia leichtlinii", "Semiplena", "#ece9d6"),
    ("sp.crocus-roseus", "Crocus tommasinianus", "Roseus", "#d89ac8"),
    ("sp.mertensia-virginica", "Mertensia virginica", None, "#7fa0e0"),
    ("sp.narcissus-poeticus", "Narcissus poeticus", "Actaea", "#f6f3ea"),
    ("sp.puschkinia-libanotica", "Puschkinia scilloides var. libanotica", None, "#dfe6f4"),
    ("sp.tulipa-clusiana-lady-jane", "Tulipa clusiana", "Lady Jane", "#f0d0d6"),
    ("sp.tulipa-hageri-splendens", "Tulipa hageri", "Splendens", "#b8362e"),
    ("sp.crocus-blue-pearl", "Crocus chrysanthus", "Blue Pearl", "#b9c4ea"),
    ("sp.allium-mohican", "Allium amethystinum", "Red Mohican", "#5a2a5f"),
    ("sp.allium-caeruleum", "Allium caeruleum", None, "#7aa0e0"),
    ("sp.crocus-kiss-of-spring", "Crocus korolkowii", "Kiss of Spring", "#f2d46a"),
    ("sp.muscari-peppermint", "Muscari", "Peppermint", "#a9c4e8"),
    ("sp.muscari-valerie-finnis", "Muscari armeniacum", "Valerie Finnis", "#9fc0e6"),
    ("sp.narcissus-segovia", "Narcissus", "Segovia", "#f5f0d8"),
    ("sp.ornithogalum-nutans", "Ornithogalum nutans", None, "#e8efe8"),
    ("sp.tulipa-persian-pearl", "Tulipa humilis", "Persian Pearl", "#b0407f"),
    ("sp.tulipa-purple-dream", "Tulipa", "Purple Dream", "#6d4a9c"),
]:
    sp(sid, name, cv, "bulb", "bulb", 0.3, 0.15, col, "#7d9a5c")

# ---- Rain garden (forbs/sedges from 2026 list; trees+shrubs from March 2020 drawing)
for sid, name, cv, form, h, col in [
    ("sp.aquilegia-canadensis", "Aquilegia canadensis", None, "cloud", 0.6, "#d0473a"),
    ("sp.iris-fulva", "Iris fulva", None, "sword", 0.8, "#b5532c"),
    ("sp.lobelia-cardinalis", "Lobelia cardinalis", None, "spike", 0.9, "#c41e2a"),
    ("sp.mimulus-ringens", "Mimulus ringens", None, "spike-short", 0.7, "#8b7ac8"),
    ("sp.onoclea-sensibilis", "Onoclea sensibilis", None, "fern", 0.6, None),
    ("sp.osmunda-cinnamomea", "Osmundastrum cinnamomeum", None, "fern", 0.9, "#a8642e"),
]:
    sp(sid, name, cv, "fern" if form == "fern" else "forb", form, h, 0.5, col, "#5f8a45")
for sid, name, cv, ptype, form, h, w, col in [
    ("sp.chionanthus-virginicus", "Chionanthus virginicus", None, "tree", "tree-small", 4.5, 4.0, "#f4f2ea"),
    ("sp.clethra-alnifolia", "Clethra alnifolia", None, "shrub", "shrub", 1.6, 1.4, "#f2eee6"),
    ("sp.halesia-carolina", "Halesia carolina", None, "tree", "tree-small", 6.0, 5.0, None),
    ("sp.hamamelis-jelena", "Hamamelis x intermedia", "Jelena", "shrub", "shrub-vase", 3.0, 3.0, None),
    ("sp.hamamelis-vernalis", "Hamamelis vernalis", None, "shrub", "shrub-vase", 2.5, 2.5, None),
    ("sp.ilex-verticillata", "Ilex verticillata", "M + F", "shrub", "shrub", 2.0, 1.8, "#c8312e"),
    ("sp.myrica-gale", "Myrica gale", None, "shrub", "shrub", 1.2, 1.2, None),
    ("sp.rhododendron-viscosum", "Rhododendron viscosum", None, "shrub", "shrub", 1.6, 1.5, "#f6eef0"),
    ("sp.lindera-benzoin", "Lindera benzoin", None, "shrub", "shrub-vase", 2.5, 2.5, None),
    ("sp.nyssa-sylvatica", "Nyssa sylvatica", None, "tree", "tree", 8.0, 5.0, None),
    ("sp.rhus-copallina", "Rhus copallina", None, "shrub", "shrub-vase", 2.0, 2.0, None),
    ("sp.viburnum-nudum", "Viburnum nudum", None, "shrub", "shrub", 2.2, 2.0, "#f1efe2"),
    ("sp.stewartia-pseudocamellia", "Stewartia pseudocamellia", None, "tree", "tree-small", 5.0, 3.5, "#f6f3ec"),
    ("sp.betula-nigra-heritage", "Betula nigra", "Heritage (multi-stem)", "tree", "tree-multistem", 8.0, 5.0, None),
    # Bird Border
    ("sp.amelanchier-lamarckii", "Amelanchier lamarckii", None, "shrub", "shrub-vase", 3.0, 2.5, None),
    ("sp.cornus-sericea", "Cornus sericea", None, "shrub", "shrub", 2.0, 2.0, None),
    ("sp.salix-rosmarinifolia", "Salix rosmarinifolia", None, "shrub", "shrub", 1.5, 1.5, None),
    ("sp.styrax-americanus", "Styrax americanus", None, "shrub", "shrub-vase", 2.5, 2.0, None),
    ("sp.vaccinium-corymbosum", "Vaccinium corymbosum", None, "shrub", "shrub", 1.8, 1.6, None),
    ("sp.viburnum-dentatum", "Viburnum dentatum", None, "shrub", "shrub", 2.5, 2.2, None),
    ("sp.viburnum-trilobum", "Viburnum trilobum", None, "shrub", "shrub", 2.5, 2.2, None),
]:
    sp(sid, name, cv, ptype, form, h, w, col, "#56743f")
# generic placeholders where species are not documented
sp("sp.unidentified-shrub", "unidentified shrub", None, "shrub", "shrub", 1.8, 1.6, None, "#5d7647",
   note="Triangles list 6 trees & shrubs (13 plants) but the species are not in the public list.")
sp("sp.unidentified-tree", "unidentified existing tree", None, "tree", "tree", 12.0, 10.0, None, "#4f6b3c",
   note="Canopy digitised from USGS NAIP; species unknown.")
sp("sp.lawn", "turf grass (mown lawn)", None, "grass", "lawn", 0.06, 0.0, None, "#8fa266")

# ---- Native meadow species (Feb 2026 lists) — names only; spatial arrangement undocumented
MEADOW_EAST = """Andropogon gerardii|Anemone canadensis|Angelica atropurpurea|Arnoglossum atriplicifolium|Aronia prunifolia|Asclepias incarnata|Baptisia australis|Baptisia lactea|Cephalanthus occidentalis|Coreopsis tripteris|Cornus foemina|Cornus sericea|Dasiphora fruticosa|Desmodium canadense|Echinacea purpurea|Elymus virginicus|Eryngium yuccifolium|Eupatorium perfoliatum|Euphorbia corollata|Euthamia graminifolia|Eutrochium maculatum|Gentiana andrewsii|Helenium autumnale|Hibiscus moscheutos|Iris virginica|Lindera benzoin|Lobelia siphilitica|Lysimachia quadriflora|Monarda fistulosa|Onoclea sensibilis|Packera aurea|Penstemon digitalis|Physostegia virginiana|Pycnanthemum virginianum|Rosa palustris|Sambucus canadensis|Schizachyrium scoparium|Solidago ohioensis|Solidago riddellii|Sorghastrum nutans|Spiraea tomentosa|Symphyotrichum novae-angliae|Symphyotrichum oolentangiense|Thalictrum dasycarpum|Thelypteris palustris|Tradescantia ohiensis|Verbena hastata|Verbesina alternifolia|Vernonia missurica|Veronicastrum virginicum|Viburnum cassinoides|Viburnum lentago|Zizia aurea|Carex bebbii|Carex cristatella|Carex grayi|Carex lurida|Carex muskingumensis|Carex radiata|Carex scoparia|Carex squarrosa|Carex sprengelii|Carex stricta|Carex tenera|Carex vulpinoidea|Eleocharis obtusa|Juncus dudleyi|Juncus effusus|Juncus tenuis|Juncus torreyi|Schoenoplectus pungens|Schoenoplectus tabernaemontani|Scirpus atrovirens|Scirpus pendulus|Sparganium eurycarpum""".split("|")
MEADOW_WEST = """Anemone canadensis|Aronia prunifolia|Asclepias incarnata|Baptisia lactea|Chelone glabra|Dasiphora fruticosa|Echinacea purpurea|Elymus virginicus|Euphorbia corollata|Gentiana andrewsii|Geranium maculatum|Glyceria striata|Ilex verticillata|Iris virginica|Liatris spicata|Lobelia cardinalis|Lobelia siphilitica|Lobelia spicata|Lythrum alatum|Onoclea sensibilis|Penstemon digitalis|Pycnanthemum virginianum|Rosa setigera|Schizachyrium scoparium|Scutellaria lateriflora|Solidago ohioensis|Solidago riddellii|Solidago rigida|Sorghastrum nutans|Sporobolus heterolepis|Symphyotrichum oolentangiense|Thelypteris palustris|Verbena hastata|Zizia aurea|Carex bebbii|Carex cristatella|Carex grayi|Carex lurida|Carex muskingumensis|Carex radiata|Carex scoparia|Carex squarrosa|Carex sprengelii|Carex stricta|Carex tenera|Carex vulpinoidea|Eleocharis obtusa|Juncus dudleyi|Juncus effusus|Juncus tenuis|Juncus torreyi|Schoenoplectus pungens|Schoenoplectus tabernaemontani|Scirpus atrovirens|Scirpus pendulus|Sparganium eurycarpum""".split("|")
MEADOW_SHRUBS = {"Aronia prunifolia", "Cephalanthus occidentalis", "Cornus foemina", "Cornus sericea", "Dasiphora fruticosa",
                 "Lindera benzoin", "Rosa palustris", "Rosa setigera", "Sambucus canadensis", "Spiraea tomentosa",
                 "Viburnum cassinoides", "Viburnum lentago", "Ilex verticillata"}
MEADOW_GRAMINOIDS_PREFIX = ("Carex", "Juncus", "Eleocharis", "Schoenoplectus", "Scirpus", "Sparganium", "Andropogon",
                            "Elymus", "Glyceria", "Schizachyrium", "Sorghastrum", "Sporobolus")
# Hydrology zone per species as printed on the 2026 meadow lists (attribute, not a map)
MEADOW_HYDRO_NOTE = "Hydrology zones (Obligate wet 10cm / Facultative wet 5cm / Upland) are species attributes on the official list; their spatial zones are not published."

# ---------------------------------------------------------------- legends (recipes)
# role vocabulary: block | emergent | matrix | group | individual | bulb-drift | bulb-scatter | tree | shrub | hedgerow
# Each entry: (legendCode, [speciesIds], role, legend section)
LEGEND_A = [
    ("Ach", ["sp.achillea-moonshine"], "block"), ("AMS", ["sp.amsonia-hubrichtii"], "block"),
    ("ANE", ["sp.anemone-hadspen"], "block"), ("AST TW", ["sp.aster-twilight"], "block"),
    ("ASTi", ["sp.astilbe-visions-pink"], "block"), ("CA/cen", ["sp.centaurea", "sp.calamintha-nepeta"], "block"),
    ("ec+D", ["sp.echinacea-fatal-attraction", "sp.dalea-purpurea"], "block"),
    ("ec+G", ["sp.echinacea-fatal-attraction", "sp.geum-triflorum"], "block"),
    ("echi/ey", ["sp.echinops-starfrost", "sp.eryngium-yuccifolium"], "block"),
    ("era+Li", ["sp.eragrostis-spec", "sp.limonium-latifolium"], "block"),
    ("eup", ["sp.eupatorium-hyssopifolium"], "block"), ("lob", ["sp.lobelia-siphilitica"], "block"),
    ("LYT AL", ["sp.lythrum-alatum"], "block"), ("MON", ["sp.monarda-bradburiana"], "block"),
    ("pen", ["sp.penstemon-digitalis"], "block"), ("per+Li", ["sp.perovskia-blue-spire", "sp.liatris-pycnostachya"], "block"),
    ("phlo BP", ["sp.phlox-blue-paradise"], "block"), ("phl SL", ["sp.phlox-sweet-laura"], "block"),
    ("pyc", ["sp.pycnanthemum-muticum"], "block"), ("schy", ["sp.schizachyrium-smoke-signal"], "block"),
    ("scut", ["sp.scutellaria-incana"], "block"), ("sed", ["sp.sedum-matrona"], "block"),
    ("spo+ec", ["sp.sporobolus-heterolepis", "sp.echinacea-virgin"], "block"), ("ST", ["sp.stachys-hummelo"], "block"),
    ("ST R", ["sp.stachys-pink"], "block"), ("V SSU", ["sp.vernonia-summers-surrender", "sp.geranium-raven"], "block"),
    ("V SW", ["sp.vernonia-summers-swan-song"], "block"), ("Ver", ["sp.veronica-goodnight-irene"], "block"),
    ("AC", ["sp.achillea-parkers"], "emergent"), ("AM", ["sp.amsonia-salicifolia"], "emergent"),
    ("AN", ["sp.andropogon-dancing-wind"], "emergent"), ("AS", ["sp.asclepias-tuberosa"], "emergent"),
    ("A", ["sp.aster-october-skies"], "emergent"), ("G", ["sp.geranium-psilostemon"], "emergent"),
    ("he", ["sp.helenium-kupferzwerg"], "emergent"), ("IR", ["sp.iris-germanica"], "emergent"),
    ("MOL", ["sp.molinia-crystal-veil", "sp.scutellaria-incana"], "emergent"),
    ("PAR", ["sp.parthenium-integrifolium"], "emergent"), ("P x", ["sp.pennisetum-viridescens"], "emergent"),
    ("pe", ["sp.persicaria-firetail"], "emergent"), ("SA", ["sp.salvia-azurea"], "emergent"),
    ("S", ["sp.salvia-pink-delight"], "emergent"), ("V", ["sp.veronicastrum-cupid"], "emergent"),
]
LEGEND_B = [
    ("SPO", ["sp.sporobolus-heterolepis"], "matrix"),
    ("Ach", ["sp.achillea-terracotta", "sp.saponaria-max-frei"], "group"), ("AM h", ["sp.amsonia-hubrichtii"], "group"),
    ("ec", ["sp.echinacea-hula-dancer"], "scatter"), ("echi", ["sp.echinops-veitchs-blue"], "group"),
    ("er", ["sp.eryngium-bourgatii", "sp.calamintha-nepeta"], "group"), ("hel", ["sp.helenium-moerheim"], "group"),
    ("IR", ["sp.iris-perrys-blue"], "group"), ("M", ["sp.monarda-bradburiana"], "group"),
    ("per A", ["sp.persicaria-alba"], "group"), ("pyc F", ["sp.pycnanthemum-flexuosum"], "group"),
    ("pyc", ["sp.pycnanthemum-muticum"], "group"), ("SA", ["sp.salvia-crystal-blue", "sp.salvia-mainacht"], "group"),
    ("sed", ["sp.sedum-matrona"], "group"), ("STA", ["sp.stachys-hummelo"], "group"),
    ("V SSU", ["sp.vernonia-summers-surrender"], "group"), ("V SW", ["sp.vernonia-summers-swan-song"], "group"),
    ("V pe", ["sp.veronica-pink-eveline", "sp.allium-big-beauty"], "group"), ("LYT AL", ["sp.lythrum-alatum"], "group"),
    ("AlC", ["sp.althaea-park-allee"], "emergent"), ("AsC", ["sp.asclepias-purpurascens"], "emergent"),
    ("A LC", ["sp.aster-little-carlow"], "emergent"), ("gen", ["sp.gentiana-andrewsii"], "scatter"),
    ("P", ["sp.papaver-matador"], "emergent"), ("p", ["sp.perovskia-little-spire"], "scatter"),
    ("pe", ["sp.persicaria-orange-field"], "emergent"), ("Phl", ["sp.phlomis-prima-donna"], "emergent"),
    ("T", ["sp.trollius-new-moon"], "emergent"), ("V", ["sp.veronicastrum-challenger"], "emergent"),
    ("B CM", ["sp.baptisia-carolina-moonlight"], "emergent"), ("B LE", ["sp.baptisia-lunar-eclipse"], "emergent"),
    ("B MB", ["sp.baptisia-midnight-prairie-blues"], "emergent"), ("B L", ["sp.baptisia-leucantha"], "emergent"),
]
LEGEND_C = [
    ("ALL", ["sp.allium-summer-beauty"], "group"), ("AM h", ["sp.amsonia-hubrichtii"], "group"),
    ("AST TW", ["sp.aster-twilight"], "group"), ("ASTi", ["sp.astilbe-visions-pink"], "group"),
    ("D", ["sp.deschampsia-goldtau"], "group"), ("ec+LiA", ["sp.echinacea-hula-dancer", "sp.liatris-spicata-alba"], "group"),
    ("IR", ["sp.iris-caesars-brother"], "group"), ("MOL+er", ["sp.molinia-whirlwind", "sp.eryngium-big-blue"], "group"),
    ("MON", ["sp.monarda-bradburiana"], "group"), ("pe", ["sp.persicaria-alba"], "group"),
    ("SA+AM", ["sp.salvia-rhapsody-in-blue", "sp.amorpha-canescens"], "group"), ("sed", ["sp.sedum-matrona"], "group"),
    ("schy", ["sp.schizachyrium-blue-paradise"], "group"), ("STA R", ["sp.stachys-rosea"], "group"),
    ("STO", ["sp.stokesia-peachies-pick"], "group"), ("era", ["sp.eragrostis-spectabilis"], "group"),
    ("AM", ["sp.amsonia-salicifolia"], "individual"), ("A", ["sp.asclepias-incarnata"], "individual"),
    ("AST LAT", ["sp.aster-horizontalis"], "individual"), ("A x", ["sp.aster-october-skies"], "individual"),
    ("H", ["sp.hemerocallis-chicago-apache"], "individual"), ("R LH", ["sp.rudbeckia-little-henry"], "individual"),
    ("T", ["sp.thalictrum-thundercloud"], "individual"), ("P", ["sp.papaver-mrs-perry"], "individual"),
]
BULBS_A = [("AL", ["sp.allium-christophii"], "bulb-cluster"), ("AL o", ["sp.allium-obliquum"], "bulb-cluster"),
           ("ANE", ["sp.anemone-blue-shades"], "bulb-scatter"), ("IR", ["sp.iris-katharine-hodgkin"], "bulb-line"),
           ("LM", ["sp.lilium-martagon"], "bulb-cluster"), ("N", ["sp.narcissus-lemon-drops"], "bulb-drift"),
           ("OR", ["sp.ornithogalum-sochii"], "bulb-cluster"), ("SCM", ["sp.scilla-mischtschenkoana"], "bulb-line"),
           ("Tsp", ["sp.tulipa-spring-green"], "bulb-drift"), ("Ts", ["sp.tulipa-shirley"], "bulb-drift")]
BULBS_B = [("AL P", ["sp.allium-carinatum-pulchellum"], "bulb-scatter"), ("AL N", ["sp.allium-nigrum"], "bulb-scatter"),
           ("CA", ["sp.camassia-semiplena"], "bulb-cluster"), ("Cr", ["sp.crocus-roseus"], "bulb-line"),
           ("M", ["sp.mertensia-virginica"], "bulb-cluster"), ("N", ["sp.narcissus-poeticus"], "bulb-drift"),
           ("PU", ["sp.puschkinia-libanotica"], "bulb-scatter"), ("Tcl", ["sp.tulipa-clusiana-lady-jane"], "bulb-drift"),
           ("Th", ["sp.tulipa-hageri-splendens"], "bulb-drift")]
BULBS_C = [("Cr BP", ["sp.crocus-blue-pearl"], "bulb-scatter"), ("AL M", ["sp.allium-mohican"], "bulb-cluster"),
           ("AL C", ["sp.allium-caeruleum"], "bulb-scatter"), ("Cr K", ["sp.crocus-kiss-of-spring"], "bulb-scatter"),
           ("M PM", ["sp.muscari-peppermint"], "bulb-line"), ("M VF", ["sp.muscari-valerie-finnis"], "bulb-line"),
           ("NS", ["sp.narcissus-segovia"], "bulb-drift"), ("OR", ["sp.ornithogalum-nutans"], "bulb-cluster"),
           ("TPP", ["sp.tulipa-persian-pearl"], "bulb-drift"), ("TPD", ["sp.tulipa-purple-dream"], "bulb-drift")]
RAIN_TREES = [("Chion", "sp.chionanthus-virginicus"), ("CL", "sp.clethra-alnifolia"), ("HAL", "sp.halesia-carolina"),
              ("HAM J", "sp.hamamelis-jelena"), ("HAM V", "sp.hamamelis-vernalis"), ("X", "sp.ilex-verticillata"),
              ("MG", "sp.myrica-gale"), ("Rho", "sp.rhododendron-viscosum"), ("Li", "sp.lindera-benzoin"),
              ("Nys", "sp.nyssa-sylvatica"), ("Rhus", "sp.rhus-copallina"), ("VN", "sp.viburnum-nudum"),
              ("Stew", "sp.stewartia-pseudocamellia"), ("Bet", "sp.betula-nigra-heritage")]
RAIN_PERENNIALS = ["sp.aquilegia-canadensis", "sp.asclepias-incarnata", "sp.gentiana-andrewsii", "sp.iris-fulva",
                   "sp.iris-perrys-blue", "sp.lobelia-cardinalis", "sp.lobelia-siphilitica", "sp.mimulus-ringens",
                   "sp.onoclea-sensibilis", "sp.osmunda-cinnamomea"]
RAIN_SEDGES = ["sp.carex-bromoides", "sp.carex-comosa", "sp.carex-muskingumensis", "sp.carex-little-midge",
               "sp.deschampsia-goldtau"]
BIRD_BORDER = ["sp.amelanchier-lamarckii", "sp.cornus-sericea", "sp.lindera-benzoin", "sp.myrica-gale",
               "sp.salix-rosmarinifolia", "sp.styrax-americanus", "sp.viburnum-dentatum", "sp.vaccinium-corymbosum",
               "sp.viburnum-trilobum"]

# ---------------------------------------------------------------- official statistics (as of March 2023)
STATS = {
    "source": "S-OGD-MAIN", "asOf": "2023-03",
    "site": {"Main Garden": {"acres": 1.5, "varieties": 145, "plants": 79833},
             "Rain Garden": {"acres": 0.25, "varieties": 24, "plants": 2909},
             "Meadows": {"acres": 1.25, "varieties": 86, "plants": 15357},
             "Bird Border": {"acres": 0.035, "varieties": 9, "plants": 45},
             "Total Garden": {"acres": 3.4, "varieties": 264, "plants": 98144}},
    "mainGardenByStyle": {
        "A": {"label": "Block (A beds)", "varieties": 66, "plants": 28126, "bulbs": 19084, "forbs": 8091, "grasses": 951},
        "B": {"label": "Matrix (B beds)", "varieties": 49, "plants": 31925, "bulbs": 20639, "forbs": 6796, "grasses": 4490},
        "C": {"label": "Grouping (C beds)", "varieties": 40, "plants": 16754, "bulbs": 10345, "forbs": 5435, "grasses": 974},
        "T": {"label": "Triangles (Matrix)", "varieties": 14, "plants": 3028, "forbs": 1058, "grasses": 1957, "treesShrubs": 13},
    },
    "mainGardenByType": {"Forbs": [99, 21380], "Bulbs": [31, 50068], "Grasses and Sedges": [10, 8372], "Trees and Shrubs": [6, 13]},
    "rainGarden": {"stormwaterPracticeAreaSqft": 3803, "retentionDepthIn": 8.2, "retentionVolumeCuft": 1677,
                   "forbs": [20, 1078], "grasses": [5, 1742], "treesShrubs": [15, 89]},
    "meadows": {"westAcres": 0.38, "eastAcres": 0.87, "graminoids": [27, 2434], "forbs": [47, 12805], "shrubs": [12, 118]},
}
