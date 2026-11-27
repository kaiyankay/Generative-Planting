# Generative Planting V3.1 — 交接（HANDOFF，2026-11-27/28 overnight）

分支 **`feature/integrated-prototype`**（在 V2 `6fd9001` 之上追加 commit，已 push，PR #1 已更新，**未合并**；`main` 与正式 Pages 未动）。
回退：V2 tag `v2/integrated-prototype-6fd9001`，V1 tag `v1/integrated-prototype-e64f437`。开发包：`ARCH540/Generative_Planting_V3_1_Overnight`
（00 为唯一入口；private-references 与课程 PDF 只在本机阅读，**未提交**）。

先读：本节 → [docs/integrated/V3_REPORT.md](docs/integrated/V3_REPORT.md)（验收 A–P 逐项、性能前后对比、未完成）→
[docs/integrated/ALGORITHMS_V3.md](docs/integrated/ALGORITHMS_V3.md) → [docs/integrated/DESIGN_CHANGES_V3.md](docs/integrated/DESIGN_CHANGES_V3.md)
（精简记录：删掉/合并/移走的文字；Knowledge 的“课件概念 → 数据语义 → 决定 → 表达”对照）→ [docs/qa/V3_E2E.md](docs/qa/V3_E2E.md)。

## 一句话
入口与场地选择保持 V2 原样（有保存的设计时 Detroit 卡片显示 “Continue”，新建需确认，不再无提示覆盖）→ **Define**：在地图上直接选范围
（点击＝只选这一块，⇧点击＝加/减，⇧拖动＝框选，或预设），候选范围虚线、确认后实线、范围外淡化；策略针对候选范围提出，确认一次；
已有设计的床不会因新策略被丢掉 → **Structure**：相机自动适配所选床的并集；点击某床＝局部 focus（面包屑 Detroit / 范围 / B1 + Overview），
**不改变 scope** → **Compose**：继承 focus；选 Mix 卡片即上笔刷并显示该 Mix 的适生图（按真实成员光照记录 × 床的光照：你的项目假设 > 树冠代理 > 未知；
fits / partly / conflict / unknown / blocked 用纹理区分）；悬停与拖动是**同一个评估函数**：光标旁的小标签说明此处会新增、替换、保留、
因光照跳过多少，或为什么被阻挡（路径、冻结、范围外）；按住拖动时植物实时出现；内部 cell 边界不再内缩，间距跨 cell 检查；
Replace / Soft edge；Base / Overlay / Bulbs 分层；冲突默认替换为同层合适成员或跳过，只有勾选 “allow conflicts” 才放置并标记 →
**Explore**：独立结果空间（只显示设计范围，可开 Site context；面板默认收起；顶栏 ← Design · 结果版本 · Save option · Compare · Export；
底部 Plan · 3D · Diagram · Performance + 12 个月与播放；2D 和 3D 都按月份着色；点击真实群落 → 由真实实例计算的 inspector：
计划 vs 实际组成、密度、角色（P34/P41 系统里真正出现的）、空间逻辑、叠加关系、简报月份覆盖、光照，每条注明来源；Edit in Compose 回到对应 cell）。
**Knowledge**：默认是本项目真实的 Detroit 植物（可比较的属性表 + 档案）、Seasons（花期日历）、Communities（系统 → 角色 → Mix 组成）、
Relations（只有真实关系才画图：传粉类群、光照/湿度；Spatial function 只有 Metro Vancouver 记录，需点击才显示并有横幅说明）、Notebook。

## 运行与测试
```
python3 -I tools/flow_server.py --port 8796                     # http://127.0.0.1:8796/ （?fresh=1 忽略已存设计，?intro=0 跳过简介但不清空设计，?resume=1 直接恢复）
python3 -I -u tools/v3_unit.py --serve <rsync 快照>              # 引擎 71 项（V2 60 + V3 11）→ docs/qa/v3_unit_tests.json
python3 -I -u tools/v3_e2e.py  --serve <rsync 快照>              # 真实鼠标/键盘完整旅程 27 步（A–P）→ docs/qa/v3_e2e.json + docs/screenshots/v3/
python3 -I -u tools/v3_perf.py --serve <快照> --label X --gpu    # 笔刷性能（空设计 + 约 2 万株），→ docs/qa/perf/X-gpu.json（--profile 可加 CPU 采样）
python3 tools/v3_report.py                                       # docs/qa/V3_E2E.md、各类拼图、journey.gif
python3 -I -u tools/run_browser_tests.py --out docs/qa/browser_tests_v3.json   # 原有场地组件 177 项（?classic=1），单独运行：177/177
```
旅程与性能测试在本机用 headless Chrome + Metal GPU（Intel Iris Plus 650）运行；`--swiftshader` 可用软件渲染（慢）。

## 数据诚实性
- 没有调用任何语言模型（Rules 标签处处可见）；没有付费 API。
- 光照：开阔地 = **unknown**（V2 曾当作 sun，已改）；树冠 = 可能阴（代理）；你设定的 sun / part / shade 是“项目假设”，标注、可撤销，不覆盖代理。
- Detroit 的花期/类群/光照多数来自 illustrative 教学层（可在 Define → Brief and sources 关闭；旅程第 24 步验证关闭后 unknown 上升）。
- Spatial function 记录全部属于 Metro Vancouver，不再在 “This project” 下冒充 Detroit 记录。

## 需要你决定
1. 光照匹配是否保持“字面匹配”（part ≠ shade）。2. 原型参数：reachM 1.2 m、soft edge 外环 45 %、床边 0.08 m、强资源阈值 1/m²（ALGORITHMS_V3）。
3. 3D Explore 只隐藏了非设计植物并遮罩地面，建筑/地形仍在（是否需要进一步裁切）。4. 教学层保留/替换。5. 是否合并 PR #1 并部署。

## 给下一个 Agent
- 观察状态属于阶段：`P.state.view.sv[stage]`；月份/性能/时间轴只在 Explore。scope = `brief.scopeBeds`，focus = `F.u.focus`。
- 笔刷：`brush.js _segment()` 是 hover、拖动和提交共用的评估；绘制走 `plan.requestRegion()` + 覆盖层 `#c2o`，按住时不要调用 `plan.request()`（全量重绘）。
- `P.perf` 是惰性的（getter）；`commit()` 的撤销快照对声明了 changedCells 的命令只存这些 cell。
- polygon-clipping 偶发失败：`geo.js` 的 clip/union/diff 先以 1 mm 网格重试；`safe*` 版本不抛异常（结算笔刷时用）。
- 测试在 rsync 快照上跑；浏览器面板保持空闲。

---

# Generative Planting V2 — 交接（HANDOFF，2026-11-27/28 overnight）

分支 **`feature/integrated-prototype`**（在 V1 `e64f437` 之上追加 commit，已 push，PR #1 更新，**未合并**；`main` 与正式 Pages 未动）。
V1 回退：tag `v1/integrated-prototype-e64f437`。开发包：`ARCH540/Generative_Planting_V2_Overnight`（00 为唯一入口；私有参考图与课件未提交）。

先读：本节 → [docs/integrated/V2_REPORT.md](docs/integrated/V2_REPORT.md)（P0/P1 逐项结果、限制）→ [docs/integrated/ALGORITHMS_V2.md](docs/integrated/ALGORITHMS_V2.md)
→ [docs/integrated/DESIGN_CHANGES_V2.md](docs/integrated/DESIGN_CHANGES_V2.md) → [docs/qa/V2_E2E.md](docs/qa/V2_E2E.md)（真实鼠标旅程，逐步截图，按住鼠标时的连续帧）。

## 一句话
入口：简介（真实植株实例生成的图形）→ 选择场地（统一轴测卡片；只有 Detroit 有真实模型，另两个明确为 Planned）→
**Define** 一次给出全场策略（分区 = 角色 · 种植系统 · 空间逻辑，画在地图上，确认一次）→ **Structure** 全部分区一次预览、一次确认
（沿路弯曲条带、共享轴、手绘引导曲线、蜂窝、有机、整块），点单床才是局部微调 → **Compose** 先看 Mix 调色板（计划小样来自同一引擎、剖面、物候带），
选中即为画笔：**按住拖动时植物逐步生成**，可跨床、自动跳过道路；Cell Fill / Auto Compose 用同一引擎；分层配方（基础层面积比+间距、叠加层独立密度、球根漂移覆盖率）
→ **Explore** 同一画布底部 Dock：Plan · Axo · Diagram · Performance + 月份播放；按实际植株算的开花资源分布（1 m 像素）、区域对比、问题回到 Compose、方案对比、导出。
**Knowledge** 恢复 V4.3 的 X · 植物 → Z → Y 分类网络，四个关系 lens，Network/Matrix/Table 同一数据，记录先预览影响再应用。

## 运行与测试
```
python3 -I tools/flow_server.py --port 8796        # http://127.0.0.1:8796/  （?fresh=1 忽略已存设计，?intro=0 跳过简介，?resume=1 直接恢复，?classic=1 = 更早的原型）
python3 -I -u tools/v2_e2e.py --serve <rsync 快照>   # 引擎 60 项 + 真实鼠标旅程 36 步 → docs/qa/v2_*.json + docs/screenshots/v2/
python3 tools/v2_report.py                          # docs/qa/V2_E2E.md、live-stroke-strip.jpg、journey.gif
python3 -I -u tools/run_browser_tests.py            # 原有场地组件 177 项（classic）
```
在线预览（第三方 raw.githack，不是 GitHub Pages）：见 V2_REPORT.md 的固定 SHA 链接。

## 数据诚实性
- 没有调用任何语言模型；Rules mode 在界面上标明，列出“读到了什么 / 没用上什么”。
- Detroit 植物的花期 / 传粉类群 / 光照多数来自 **illustrative 教学层**（可在 Define 关闭；关闭后 unknown 上升，旅程第 28 步验证）。
- 主花园没有任何床 ≥ 30 % 树冠覆盖（最大 6 %），所以 “beneath trees” 不会生成 Under Trees 分区——策略里如实写出。
- 模板层密度、颗粒度、漂移覆盖率、弯曲条带分段长度、强资源阈值 1 株/m² 等都是原型假设（ALGORITHMS_V2.md 标 assumption）。

## 需要你决定
1. 教学层保留 / 替换为有来源数据 / 默认关闭。 2. 原型参数（ALGORITHMS_V2 §4–7）。 3. 是否接真实 LLM（需 key + 明确付费许可）。
4. 是否合并 PR #1 并部署（合并后 `index.html` 即为 V2）。 5. 第二、第三个真实场地模型何时提供。

## 给下一个 Agent
- 植株是权威状态：`instances[cell].plants`（带 lattice id、slot、fragment），`assignments[cell].fragments` 记录几何；模型 draft 由它派生。
- 候选点是世界坐标锚定的格网（盐 = mix id + 层签名），所以同一 mix 重复画不会叠加、编辑一层不移动其他层。
- localStorage 用紧凑编码（`packInstances`），约 60 字节/株；快照最多 4 个。
- 测试时保持浏览器面板空闲（WebGL 页面会拖慢 headless）；在 rsync 快照上跑 e2e。

---

# Generative Planting · Integrated Prototype — 交接（HANDOFF）

日期 2026-11-27 · 分支 **`feature/integrated-prototype`**（已 push 到 kaiyankay/Generative-Planting，未合并 main，GitHub Pages 未改动）
回退基线：tag `baseline/pre-integrated-prototype`（= 已公开的 `integration/design-prototype-public` 8454ba6）
开发包：`ARCH540/Generative_Planting_Development_Package`（00–06 + 手稿）

先读：本文件 → [docs/integrated/IMPLEMENTATION_REPORT.md](docs/integrated/IMPLEMENTATION_REPORT.md)（实现、数据、测试、未完成）→
[docs/integrated/ALGORITHMS.md](docs/integrated/ALGORITHMS.md)（实际算法与参数）→ [docs/qa/FLOW_E2E.md](docs/qa/FLOW_E2E.md)（真实浏览器测试逐步结果与截图）→
[docs/integrated/IMPLEMENTATION_MAP.md](docs/integrated/IMPLEMENTATION_MAP.md)（Gate 0 审计与模块映射）。

## 1. 一句话

同一个 App、同一个项目状态、同一块画布，按 **Define → Structure → Compose → Explore** 完成一次种植设计：
写意图 → 可编辑的 Brief → 选床、选空间逻辑、生成自适应的编号单元 → 建立 / 推荐 Mix（配方）→ 涂到单元或 Auto compose
→ 真实植株实例写进模型（2D / 3D 同一份数据）→ 按月份看传粉资源、季相、适应性 → 问题直接回到对应单元 / Mix 修改 → 保存、比较、导出。
Knowledge 是并行工作区（顶栏 Design | Knowledge），不是额外阶段。

## 2. 运行

```bash
python3 -I tools/flow_server.py --port 8796      # http://127.0.0.1:8796/   （Claude 预览配置名 gp-integrated）
python3 -I -u tools/flow_e2e.py                  # 引擎测试 + 首次用户完整旅程（headless Chrome，真实鼠标事件）
python3 -I tools/flow_report.py                  # 生成 docs/qa/FLOW_E2E.md、flow-sheet.jpg、flow.gif
```

在线预览（不改动正式部署）：
`https://raw.githack.com/kaiyankay/Generative-Planting/feature/integrated-prototype/index.html`
（githack 第一次会显示 “One more step” 提示页，点 *Open the page* 即可；这是第三方代理，不是 GitHub Pages。）
`?fresh=1` 忽略浏览器里已保存的设计；`?classic=1` 打开上一版（Site setup + 笔刷原型），旧测试都改为跑 classic。

## 3. 四个阶段（用户看到的）

- **Define**：唯一真实场地已预选（不假装有多个项目）。输入意图或点三个起始意图之一 → Rules mode 显示“读到了什么 / 没用上什么”（例如
  “maintenance：知识库里没有养护数据”）→ 可编辑目标（开花连续性及月份、传粉者类群、空间连续、植物适宜性）、约束（硬 / 软）、
  知识来源（Foundation / 场地名录 / 本项目 / 我的知识 / Illustrative）与覆盖率；日照、土壤湿度、pH 明确为 unknown。保存过的设计会出现 *Resume*。
- **Structure**：点床（列表或画布）→ 三种逻辑的真实预览缩略图 → 选一种后在画布上预览编号单元，并说明怎样适应（沿路、沿长轴、沿等高线、
  林冠、碎片合并）、可调尺寸 / 方向 / 种子布局、可展开“候选比较”→ Confirm。其他床保持参考种植。改已确认的床：先预览影响，
  按重叠 ≥ 50 % 继承 Mix 或清空，可取消。
- **Compose**：Suggest mixes（Rules mode，明示非 AI）/ Create a mix / Reuse a recipe（Detroit 图例配方转换）→ 同一个 Mix 库。
  Mix 编辑：成员、角色、% 株数（必须 100 %）、密度、证据与来源、冲突时按项目选择来源；“Ask for a change” → 补丁预览（不是整体重生成）；
  “add what you know” → 原话保存、规则解析出的主张需确认、选择范围（本项目 / 我的知识 / 只记在 Mix 上）。
  赋值：Paint（点或拖，一次手势一步撤销）或 Auto compose（只填所选或未赋值单元，先预览再接受）。点单元（无笔刷时）才出现 Inspector。
  共享 Mix 修改：Update all（只重排用到它的单元）或 Local variant（只改所选单元）。
- **Explore**：默认 Planting 视图；Pollinators / Seasonality / Adaptability + 月份时间轴（只改变视图）；按月柱状图；问题列表 → Edit mix /
  Reassign cell / Add knowledge / Change structure（带着选择回到对应阶段）；快照（读回确认后才说已保存）、对比（同一指标定义才对比）、导出 JSON。

## 4. 数据诚实性（重要）

- Detroit 植物在公开知识库里**没有花期和传粉者类群**。为了让流程可教可用，新增可开关的
  **Illustrative 教学层** `data/detroit/teaching-traits.json`（约 60 种，花期 / 类群 / 光照 / 湿度 / 角色）：我按一般园艺常识写的典型值，
  **未核对来源、不是 Detroit 调查、不是证据**；界面所有用到它的地方都标 “illustrative / not verified”，Define 里可以关掉看真实未知。
  → 需要你决定：替换为有来源的数据（例如 USDA PLANTS 公共领域特征数据），或保留为教学层。
- Robertson 1929（伊利诺伊）只作为“有昆虫访花记录”的证据显示，不当作类群或数量。
- 光照适宜性只用唯一的空间光照代理：NAIP 树冠（“树冠下 = 可能阴”，标明是推断）。湿度永远 uncertain。
- 没有任何 LLM 调用。Rules mode 的意图解读、Mix 推荐、编辑解析都是可见的显式规则。

## 5. 测试结果

| 测试 | 结果 |
|---|---|
| 引擎测试 `flow-tests.html`（Gate 2–4：几何有效性、孔洞、确定性、目标/场地驱动的自适应、相邻、最大余数分配、已知传粉例子、unknown→uncertain、连通性、知识改变→配方改变、范围隔离、冲突选择、无效模型回答被拒、撤销/局部变体/改逻辑） | **42 / 42** |
| 首次用户完整旅程（空白浏览器配置、真实鼠标点击与拖动、31 步、逐步截图） | **31 / 31** |
| 原有场地组件测试（`?classic=1`） | **177 / 177** |
| `test_model.py`（model.json 字节未变）· `test_seed.py` | 23 / 23 · 31 / 31 |
| 控制台错误 | 1 条：Knowledge 工作区在 localhost 上找本地研究副本 `knowledge/data/local/seed.json`（git 忽略），404 后回退到公开副本——原有行为 |

注意：原有 177 项测试第一次跑出 4 个爆炸视图点击失败；在浏览器面板中无法复现，关掉面板里另一个 WebGL 页面后重跑 177/177（基线提交也是 177/177）——是负载导致的时序问题，不是回归。

逐步表格与截图：[docs/qa/FLOW_E2E.md](docs/qa/FLOW_E2E.md)；连续截图 `docs/screenshots/integrated-prototype/flow-sheet.jpg`、`flow.gif`。

## 6. 需要你决定 / 确认

1. Illustrative 教学层是否保留、替换为有来源的数据，或默认关闭。
2. 原型默认值：密度 4.5 株/m²、角色间距系数、Bands 段长 = 3 × 带宽、碎片合并 30 %、相邻共享边 ≥ 0.3 m、跨路“相邻” ≤ 3 m、评分权重（ALGORITHMS.md）。
3. LLM：如需真实 Claude（Sonnet 5.5），需要在本机 `tools/flow_server.py` 环境里安装 `anthropic`、提供 `ANTHROPIC_API_KEY` 并设 `GP_CLAUDE_ALLOW_CALLS=1`（会产生费用）；目前从未用真实模型测试过。
4. 是否合并 / 部署：PR 已开（未合并），正式 Pages 未改动。合并后 `index.html` 将变成新的工作流（旧版在 `?classic=1`）。
5. 已知问题清单见 IMPLEMENTATION_REPORT §8。

## 7. 给下一个 Agent 的注意事项

- `src/flow/` 是全部新代码；`GPFlow`（window）= 工作流控制器，`GPFlow.P` = 项目状态，`GPFlow.K` = Active Knowledge。
- 模型的 working draft 是**派生物**：由项目状态重建（`Project.syncStore`），不要直接改 draft。
- `GP.design()` 仍然必须是函数（旧测试调用）。旧测试 / 旧工具一律加 `?classic=1`。
- 引擎测试页 `flow-tests.html` 会在结束后**恢复**访问者原有的保存设计；e2e 在干净的浏览器配置里跑并清空存储。
- headless Chrome 跑 SwiftShader 很慢；e2e 在快照副本上跑（`--serve <copy>`），以免边改边测。
- Knowledge 公开版（不含 Robertson 原始行、Metro Vancouver 原文引语）才可以 push；本分支检查过没有受限文件。
