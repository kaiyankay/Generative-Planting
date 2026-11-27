# Phase 01.3 · Computational Spatial Foundation — 交接报告

**线上：** https://kaiyankay.github.io/Generative-Planting/ （2026-11-26 按你的要求部署：`main` 快进到 94b56e4，包含 Phase 01.2 + 01.3；线上测试结果见文末“部署验证”）。
分支 `feature/computational-space` 仍保留在 GitHub 上。
Knowledge 模块的分支与 worktree（`feature/dynamic-knowledge-canvas`，`Generative-Planting-knowledge`）未被触碰。

## 一句话

场地现在是一个**可计算的空间**：即使所有种植床都是空的，每个真实种植床都是独立的计算域——可以在其中采样、查询 X/Y/Z、高程、坡度、到路径距离等条件的**面积分布**，可以用可配置阈值把多个条件叠加成**计算区域（zones）**，区域始终保持在床的真实边界内并带着原始 Bed ID，单床、多床、全部可设计床都可以作为操作范围。

## A. 研究依据（实际阅读的 slides）

课堂 slides 只在本机阅读（`private-inputs/`，git 忽略），未复制进仓库。下表是“空间条件如何成为种植计算的输入”的理解，以及它在模型里对应的做法——不是复制原研究的算法。

| Slides | 内容 | 本轮的对应 |
|---|---|---|
| P24–25 Scalable modules / Legible spatial framework | 模块在框架内重复；树和覆盖层构成可读框架 | 15 个真实床 = 固定框架；全场统一 lattice；`samplePoints` 的 grid / hex 位置是未来模块的落点 |
| P65 From digitization to computation | 数字化之后才是计算 | 第 1–4 层全部从已数字化的数据计算，不再只是显示 |
| P67 Design response to building shade | 遮荫场在床形内部驱动种植密度 | Detroit 没有日照数据：`field.sun` 保持 unknown；“到墙 / 构筑物距离”是可测量的物理条件，但**不**被说成遮荫 |
| P69 Topo · Site · Paving · Planting · Performance | 分层叠合的场地模型 | 五个模型层次（Performance 不在本轮） |
| P71 Rules-based planting | 每层分析影响种植；更多层 = 更多组合；暴露缺失 | 规则（字段 + 阈值）→ 区域键 = 维恩图中的交集；未知字段显示为“no data”，而不是被填成 0 |
| P72 Layering constraints | Slope / Sun / Elevation / Proximity 叠在同一平面 | 所有字段映射到同一 1 m lattice 与同一坐标系 |
| P73 Computational planting | 床形内部的计算单元 | 每床一个 domain；单元用与 DEM 对齐的方格（数据本身是方格），蜂窝只用于位置采样 |
| P74 Spatial clustering (k-means) | 自动聚类 | 采用阈值分类 + 连通区域（regions），可选小片合并；k-means 未做（会把均匀地面人为切开，见“未解决”） |
| P124–130 Site conditions → generated plant zones，迭代土壤 / 地形 | 条件改变，区域随之重算 | 改阈值即时重算区域；土壤数据不存在，只有 hypothetical 测试字段 |

## B. 保留的既有内容

床的几何、ID、面积、坐标、地形、路径与基础设施、现有植被、参照种植全部原样保留：`model.json`、`instances.bin` 字节不变（b7bc3689…、1bf31385…）；计算从不修改床（测试比较床的几何哈希）。没有新增绘床工具。

## C. 五个模型层次（数据关系，不是页面）

| 层 | 内容 | 是否读取种植设计 |
|---|---|---|
| 1 Base Site | 3DEP 1 m 地形、路径、墙、构筑物、水 | 否 |
| 2 Planting Framework | 20 个真实床（15 主床 + 三角、雨水花园、草甸） | 否 |
| 3 Environmental Fields | 高程、坡度、到路径 / 床边 / 墙与构筑物的距离、现有树冠；日照、土壤湿度、pH = unknown | 否 |
| 4 Computational Space | lattice、床域、分布、区域、位置采样、查询 | 否 |
| 5 Planting Design | 参照 / 工作方案 | — |

`GP.spatialModel()` 返回五层状态。测试：把 20 个可设计床全部清空后，第 1–4 层照常工作，分布与区域的指纹与有种植时**完全相同**。

## D. Computational Space（本轮核心）

先检查了已有能力：`sampleConditions(x, y)`（单点）、`getPlantingContext`（只有床中心点）、`plantableAt`、精确空间查询、`paint.js` 里的显示用栅格。没有面积分布、没有分类、没有与床绑定的区域——这些是本轮新增的，单点 API 保持不变。

- **Lattice**：全场一个格网，原点 = DEM 原点，单元中心 = 3DEP 采样点，1 m。更细的格网被拒绝（不能用更细的网格暗示更高精度），2 m / 3 m 可以。
- **床域**：边界单元按床轮廓精确裁剪（面积闭合到 < 1 mm²），跨两床的单元分属两床；整单元的高程就是 DEM 节点值（测试逐格比对）。
- **分布**：每个字段按面积加权：min / p10 / 中位数 / p90 / max / 均值 / 标准差 / 直方图 / 未知面积 / 每床统计。
- **区域**：1–4 条规则（字段 + 阈值）；按床合并单元、与床轮廓做矢量相交（polygon-clipping），区域互不重叠、拼起来正好是床，每个区域带 `bedId`。
- **诚实的精度**：每个字段有精度（高程 0.1 m、坡度 1.5°、距离 0.5 m）。床内变化小于精度 → 不划分（TN 高程变化 0.06 m）；阈值 ±½ 精度内的面积单独报告；字段显示的色带不细于精度。
- **范围**：单床、多床（Shift 点击）、全部 20 个可设计床、任意多边形区域。
- **查询**：`sampleAt`（点值 + 所在单元 + 区域）、`zoneAt`、`queryZones`（任意几何）、`samplePoints`（grid / hex / jitter，可种植点）。

数据结构与 API 见 [COMPUTATIONAL_SPACE.md](COMPUTATIONAL_SPACE.md)。

## E. Environmental Fields

只用真实或可推导的数据：高程（3DEP）、坡度（由 DEM 推导）、到路径距离、到床边距离（种植边界）、到墙 / 构筑物距离（物理障碍）、现有树冠（NAIP，物理障碍，不是日照）。日照、土壤湿度、pH 继续为 unknown：值是 null，图上画成“no data”灰色交叉线，统计里计为未知面积，规则中得到“no data”类，绝不当成 0。
`hyp.low-ground-wetter` 是明确标注的假设测试字段（低处 = 1、高处 = 0），只用于验证三个条件的叠加；凡是用到它的结果都带 `hypothetical: true` 与说明。所有阈值和方法在 `data/compute.json` 与每次调用里都可改；`experiments` 里的数值只是实验起点，不是种植规则。

## F. Reference 与 Working Design

- 查看参照：Design › Reference。
- **仅隐藏**原有植物：Conditions 面板的 *Hide planting*（与 Layers 的 *Site only* 是同一个视图状态），数据不动。
- 从原配置开始：开始对话框 *From the reference planting*。
- **在选定床内清空**：面板中 *Empty these beds in a new design*，或开始对话框新增的 *Blank: B1 only*（只清空选中的床，其余床保留参照种植）。
清空后床边界、环境条件和计算区域都在（验收第 7 步）；参照永远不被覆盖（第 9 步，实例指纹一致）。

## G. 用户体验

- 首次访问（URL 无状态）先看到 **site preset 卡**和同一个轴测图，*Open site* 后工具出现，进入同一个 Spatial Workspace（SimCity 的进入逻辑，不是画风）。
- 点击床后，选择卡才显示该床的条件范围（高程 / 坡度 / 到路径），*Conditions* 打开计算面板；平时界面不增加常驻控件。
- 面板只在画布内显示一样东西：一个字段（色带）或区域（第一个条件 = 靛蓝色阶，第二个 = 斜线，第三个 = 点；区域之间留纸色间隙，不靠颜色单独区分）。2D / 3D 同一个绘制器：3D 中区域直接画在地形纹理上。
- 颜色按 data-viz 方法生成并用验证脚本检查（单色相有序色阶：亮度单调、ΔL ≥ 0.06、浅端对纸色 ≥ 2:1），与物种颜色、选择 / 悬停 / 草稿颜色分开。
- Exploded 3D 仍是可选解释视图，本轮未扩展。

## H. 为未来种植配置预留

用现有补丁 API 的 dry run 验证空间可以承载：点（emergent 落在采样点）、线（0.3 m 条带，bulb-line）、面 / Block（某区域最大的一块）、Matrix（整床）、Grouping（同一区域内三个组）、Mixed（以上一批提交）。全部通过校验，参照未改动。生成算法不在本轮。

这个测试还暴露了一个**既有编辑 API 的 bug**：沿床边的面状补丁被误判为“与路径重叠”（床位于路径多边形的洞里，旧判定只看外环）。现在改为精确判定：补丁 ∩ 障碍的面积 > 1 cm²（含洞）。沿边接触允许；压在 East Meadow 木栈道上的补丁仍被拒绝（新增测试）。

## I. 验收实验（B1，一次真实 Chrome 会话）

`tools/acceptance_run.py`：无头 Chrome（SwiftShader）通过 DevTools 协议驱动，点击是真实鼠标输入事件（含 Shift），每一步截图并把屏幕上的查询结果写入 [docs/qa/acceptance_run.json](qa/acceptance_run.json)。截图在 `docs/screenshots/phase-01-3/`。

| 步 | 操作 | 实际结果（来自 acceptance_run.json） | 截图 |
|---|---|---|---|
| 0 | 首访：先显示 site preset（同一轴测），*Open site* 后进入工作区 | entered: false → true，视图保持 axo（home 姿态 True） | [00a-entry-site-preset.png](screenshots/phase-01-3/00a-entry-site-preset.png) [00b-workspace-entered.png](screenshots/phase-01-3/00b-workspace-entered.png) |
| 1 | Axo 中真实点击 B1；选择卡显示整床条件范围；*Conditions* 打开 | 选中 `bed.B1`；范围 B1，274 个单元（194 个整单元），232.821 m² = 床面积 | [01a-axo-select-b1.png](screenshots/phase-01-3/01a-axo-select-b1.png) [01b-axo-conditions-b1.png](screenshots/phase-01-3/01b-axo-conditions-b1.png) |
| 2 | 切换 Plan：同一选择、同一范围 | 中心差 < 0.05 m，比例一致；选择与范围不变 | [02-plan-same-scope.png](screenshots/phase-01-3/02-plan-same-scope.png) |
| 3 | 隐藏原有种植（不是清空） | filter = site，B1 补丁仍为 125 个，床轮廓可见，设计仍是 Reference | [03-plan-planting-hidden.png](screenshots/phase-01-3/03-plan-planting-hidden.png) |
| 4 | 高程 / 坡度 / 到路径的实际分布 | 高程 175.97–176.47 m（中位 176.22）；坡度 0.2–3.4°（中位 1.2）；到路径 0.0–5.3 m；日照未知（232.821 m² 未知） | [04a-b1-elevation.png](screenshots/phase-01-3/04a-b1-elevation.png) [04b-b1-slope.png](screenshots/phase-01-3/04b-b1-slope.png) [04c-b1-path.png](screenshots/phase-01-3/04c-b1-path.png) |
| 5 | 坡度 2° × 到路径 1.5 m 叠加 | Slope < 2° · To path < 1.5 m 72.26 m²；Slope < 2° · To path ≥ 1.5 m 137 m²；Slope ≥ 2° · To path < 1.5 m 15.56 m²；Slope ≥ 2° · To path ≥ 1.5 m 8 m²；合计 = 床面积；103.62 m² 在坡度阈值 ±0.75° 内（已在面板说明） | [05-b1-zones-slope-path.png](screenshots/phase-01-3/05-b1-zones-slope-path.png) |
| 6 | 改阈值 2° → 1°；均匀情况 | 坡度 ≥ 阈值的面积 23.6 → 155.6 m²，区域即时重算；TN 高程变化 0.055 m < 0.1 m → 阈值落在其范围内也只有 1 个区域 | [06a-b1-threshold-1deg.png](screenshots/phase-01-3/06a-b1-threshold-1deg.png) [06b-tn-uniform-no-split.png](screenshots/phase-01-3/06b-tn-uniform-no-split.png) [06c-tn-uniform-field.png](screenshots/phase-01-3/06c-tn-uniform-field.png) |
| 7 | 只在 B1 内创建空白工作方案 | B1 补丁 0、A1 补丁 141；区域指纹不变 True，字段分布不变 True | [07-plan-blank-b1-zones-kept.png](screenshots/phase-01-3/07-plan-blank-b1-zones-kept.png) |
| 8 | 回到 Axo：区域与地形、床边界对齐 | 10 个区域顶点 屏幕 ↔ 地面往返误差最大 5.62 mm；区域画在地形纹理上（同一绘制器） | [08-axo-zones-on-terrain.png](screenshots/phase-01-3/08-axo-zones-on-terrain.png) |
| 9 | 恢复 Reference | 实例指纹与参照一致 True（20788 个植物符号），B1 补丁 125 个；工作方案保留 True | [09-axo-reference-restored.png](screenshots/phase-01-3/09-axo-reference-restored.png) |
| 10 | 多床联合（Shift 点击 A1、B2），再全部可设计床 | 三床：B1 4 区, A1 4 区, B2 3 区；全部：20 床、70 个区域、8635.583 m²，82.4 ms | [10a-plan-three-beds.png](screenshots/phase-01-3/10a-plan-three-beds.png) [10b-plan-all-design-beds.png](screenshots/phase-01-3/10b-plan-all-design-beds.png) [10c-axo-all-design-beds.png](screenshots/phase-01-3/10c-axo-all-design-beds.png) |

运行中页面错误：0 个。

三张截图在会话之后用同一 URL 状态单独重拍（`tools/screenshots.py`），原因都已修复并记录：`00a` 第一次拍摄暴露了入口状态的样式冲突（应用根节点的状态类与入口卡片同名，整个应用被缩到 330 px 宽；已改名并加了布局测试）；`06b` / `06c` 在“uniform 标签替代直方图”和“阈值标签不再四舍五入”两处显示修正之后重拍。数据（json）来自会话本身。

## 测试

| 测试 | 结果 | 说明 |
|---|---|---|
| 模型契约 `tools/test_model.py` | 23 / 23 | 数据文件字节不变 |
| 浏览器 `tests.html`（无头 Chrome，`tools/run_browser_tests.py`） | **177 / 177** | 原 128 项全部保留；新增 49 项：计算空间 API 31 项、B1 验收 1–10 步（真实指针事件，含 Shift）13 项、嵌入桥 1 项、入口 3 项、木栈道重叠 1 项。结果在 `docs/qa/browser_tests.json`；最后的显示微调后在浏览器面板复跑仍为 177 / 177 |
| 验收运行 `tools/acceptance_run.py` | 19 步，0 个页面错误 | 同一个 Chrome 会话，DevTools 协议真实鼠标输入；截图 + `docs/qa/acceptance_run.json` |
| 独立复算 `tools/test_compute.py` | **12 / 12** | shapely + numpy 从源文件重算 B1：单元面积、三个字段的 min / max / 面积加权均值、四个区域的面积，与浏览器结果一致（`docs/qa/compute_crosscheck.json`） |

主要检查项（浏览器）：五层模型、lattice 与 DEM 对齐、拒绝细于 1 m 的网格、20 个床面积闭合到 1 mm²、整单元值 = DEM 节点值、分布单调与直方图面积闭合、未知字段为 null、区域拼合与互不重叠（矢量）、区域与单元值一致、阈值单调移动区域、均匀不分、阈值在范围外不分、未知规则 = no data、假设字段标注、多床与全部床、任意区域范围、`sampleAt` / `samplePoints` / `queryZones`、六种未来种植配置的 dry run、全部床清空后计算指纹不变、床框架从不被修改。

## J. 新旧能力对照

| 能力 | Phase 01.2 | Phase 01.3 |
|---|---|---|
| 条件查询 | 单点 `sampleConditions`；床只给中心点 | 面积加权分布（任意范围）；`conditionsInBed` |
| 计算单元 | 无（只有显示用栅格） | 与 DEM 对齐的全场 lattice；每床一个精确裁剪的域 |
| 环境场 | 高程、坡度、到路径（单点） | + 到床边、到墙 / 构筑物、现有树冠；每个字段有方法与精度；假设字段单独注册并标注 |
| 叠加 / 分类 | 无 | 1–4 条可配置规则 → 按床的矢量区域，均匀不分，阈值附近的不确定面积，未知 = no data |
| 范围 | 单个对象 | 单床、多床、全部可设计床、任意区域 |
| 空间查询 | 对象 / 补丁 / 植物 | + `zoneAt`、`queryZones`、`sampleAt`、`samplePoints` |
| 隐藏 vs 清空 | Site only 在 Layers 里；清空只能整批（15 主床） | 面板里 *Hide planting*；*只清空选中床* 的工作方案 |
| 层次关系 | 未显式 | 五层 `spatialModel()`；1–4 层不读种植（测试） |
| 入口 | 直接进入工作区 | 先 site preset，再进入同一工作区 |
| 嵌入 | 原 API | 计算空间的纯数据方法全部可经 `postMessage` 调用 |
| 编辑 API | 沿床边的面状补丁被误拒 | 精确相交面积判定 |
| 测试 | 128 浏览器 + 23 模型 | 177 浏览器 + 23 模型 + 验收运行 + Python 独立复算 |

## 尚未解决 / 需要你决定

1. **阈值都是实验值**：坡度 2°、到路径 1.5 m 只是起点。真正的规则应来自植物知识（Knowledge 模块），本轮不接。
2. **坡度精度 1.5° 是估计值**：依据 1 m DEM 相对噪声的量级，不是测量得到的数；如果你有更可靠的 3DEP 精度说明，改 `data/compute.json` 即可。B1 有约 104 m² 落在 2° 阈值 ±0.75° 内，面板会明确说出来。
3. **k-means / 机器学习聚类（P74）未做**：在 Detroit 这种近乎平坦的场地上，它会把均匀地面切成“区域”；如果需要，可在同一接口下加，并带同样的均匀性保护。
4. **只有方格单元**：蜂窝只用于位置采样。若希望区域本身是蜂窝，需要从方格数据重采样，会引入插值。
5. **日照 / 遮荫**：可以从现有树冠、建筑和地形做一个**模拟**日照场，但那是 hypothetical，需要你决定是否要以及如何标注。
6. 已按你的要求部署到 GitHub Pages（`main` 快进合并，没有强制推送）。Knowledge 分支只在本机、基于更早的 main，这次快进不影响它；它以后合入 main 时需要在 01.3 之上合并。

## 部署验证

| 检查 | 结果 |
|---|---|
| Pages 发布 | `main` 快进到 94b56e4 后约 40 秒，`src/compute.js`、`data/compute.json` 返回 200，运行时 API = 0.6 |
| 线上页面（浏览器面板打开） | `?view=plan&cond=B1&show=zones` 显示 B1 的四个区域：72.3 / 137.0 / 15.6 / 8.0 m²，与本机一致；控制台 0 个错误 |
| 线上浏览器测试 `tests.html` | **177 / 177**（桌面浏览器面板，Chromium，GPU；`docs/qa/browser_tests_live.json`） |
| 无头 SwiftShader 线上运行 | 在旧的 30 分钟上限内没跑完（软件渲染 + 网络），已把上限改为可配置（默认 60 分钟）；同一套测试本机无头 177 / 177 |
