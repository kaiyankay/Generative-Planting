# 早晨交接 — Generative Planting · Phase 01（Oudolf Garden Detroit）

**在线网页：** https://kaiyankay.github.io/Generative-Planting/ （已在浏览器里实际打开并测试，见 QA_REPORT §5）
**仓库：** https://github.com/kaiyankay/Generative-Planting （`main`，最终 commit 见 `git log -1` / QA_REPORT）

## 你打开网页会看到什么

- **3D 默认视图**：从南向北的正交轴测，北在上（与平面图同向）。前景是 Nancy Brown Peace Carillon 和 Native Meadows，后面是 15 个主花床、两个 Triangles、西端的 Rain Garden 和 Bird Border。拖动旋转、右键平移、滚轮缩放；拉近后自动换成精细植物形态（叶丛、茎、穗状/伞形/雏菊状花序、草穗）。
- **Plan 视图**：Rhino 式正投影平面，矢量边界、床号、比例尺、真北箭头、10 m / 1 m 网格；可缩放平移。A 床是色块马赛克、B 床是 Sporobolus 基质（黄色点纹）上的组团与点状 emergents、C 床是有机组团加单株符号；球根是独立的虚线漂移层。
- **选择**：点一次选花床，再点进入 patch，再点到单株；两个视图的选择、图层状态完全同步。右侧 Inspector 显示：证据状态（documented / reconstructed / schematic / unknown）、来源链接、官方按风格的数量、该床的 recipe（物种 + 图例角色）、点击位置的高程/坡度/到步道距离，以及日照/土壤湿度/pH = unknown（不是 0）。
- **图层**（左上角，默认折叠）：Site / Topography（含 0.25 m 等高线）/ Built / Planting structure / Vegetation / Analysis，可独立显示、锁定，组级控制子级。

## 哪些是真的，哪些是示意

| 内容 | 状态 |
|---|---|
| 15 主床 + 2 Triangles + Rain Garden 的边界、步道、挡土墙、道路、Carillon、湖 | **documented**（OpenStreetMap，已与 USGS 航拍核对） |
| 床号 A1–A4、B1–B5、C1–C4（Oudolf 2020 球根图原文编号，A3、B3 各标两床，模型拆成 N/S） | **documented** |
| 每种风格的物种和图例角色（block / matrix / group / emergent / bulbs） | **documented**（2019 修订图 + 2020 球根图图例，2026 名单作为别名） |
| 地形（USGS 3DEP 1 m） | **documented**；3D 中竖向放大 ×1.6 |
| 29 棵现有树（从 NAIP 航拍目测数字化） | **reconstructed**，树种未知 |
| 床内 patch 形状、单株位置、草甸边界、Bird Border 走向 | **schematic**：按已记录的结构和物种用固定种子生成，**不是测绘，也不是描图** |

公开仓库里没有课堂 slides、Oudolf 原图、官网照片或 PDF，也没有从原图描出的几何（这些都只在本机 `private-inputs/`）。

## 测试与验证

- 模型合约测试：`tools/test_model.py`（15 床、编号、引用、几何、实例都在床内、unknown 不为 0、重建逐字节一致等）。
- 浏览器测试：`tools/run_browser_tests.py`，在 `/Generative-Planting/` 路径下跑真实 app（图层开关、锁定、2D↔3D 选择同步、缩放/平移/复位、草稿不改 baseline、手机宽度不溢出、无报错）；同一套测试也对线上网址跑过。
- 性能（本机 Intel Iris Plus 650，1440×900）：总览约 25 fps（DPR 1.5）/ 37 fps（DPR 1）；静止时不渲染。数字见 QA_REPORT。

## 没做完 / 需要你确认

1. 床内布局是生成的示意。若你认为对 Oudolf 原图做描图（只放本地、不公开）在版权上可以接受，可以加一个本地精细层做对照——这是你的判断，我没有做。
2. Triangles 的物种官网没有公布，用中性代理显示。
3. 草甸边界按官方面积和 2023 航拍照片示意；水文分区只是物种属性，没有空间图。
4. 日照、土壤、pH 没有数据，界面显示 n/a。
5. 植物形态是按生长型的代理（推断），颜色是示意的夏季状态，没有物候校准。

## 下一阶段 AI 接入点

- 读：`window.GP.getObject / getBedAt / queryObjects / sampleConditions / getPlantingContext`，或直接读 `data/detroit/model.json` + `instances.bin`（格式见 MODEL_CONTRACT.md）。
- 改：`GP.applyPatch([...])` 只写草稿，`resetDraft()` 还原，baseline 冻结不可改；渲染层不是 AI 的输入。
- 物种边界：`sp.*` ID + `canonicalKey`，将来接开放知识库；角色存在 recipe/placement 上，不是物种的全局标签。
- 第二、第三个案例：同一 schema，换 `geo.py` 原点、写一个 `curated_<case>.py`、改床登记表即可（MODEL_CONTRACT.md 末尾）。
