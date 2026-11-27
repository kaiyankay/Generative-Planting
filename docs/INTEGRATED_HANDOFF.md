# Generative Planting · Integrated Design Prototype — 中文交接报告

日期：2026-11-26 · 分支：本地 `integration/design-prototype`（含 Knowledge 模块，完整验收版，未 push）；GitHub `integration/design-prototype-public`（同样的设计层，不含待授权的 Knowledge 资料，见 §9）
本地打开：`python3 -I tools/serve.py --port 8790` → http://127.0.0.1:8790/ （无缓存静态服务器；Claude 预览配置名 `gp-design`）

## 0. 结果一览

| 验收 | 结果 |
|---|---|
| 实验 A–F（真实浏览器、真实鼠标事件、逐步截图） | **39 / 39** 通过 · `tools/design_e2e.py` · [docs/qa/DESIGN_E2E.md](qa/DESIGN_E2E.md) |
| 原有空间模型浏览器测试 | **177 / 177**（整合设计层之后，headless Chrome，约 18 分钟）· `docs/qa/browser_tests.json` |
| Knowledge 模块浏览器测试 + Python 检索一致性 | **133 / 133**，parity 无差异（合并 Part B 之后） |
| model.json / 计算空间 / 知识种子 | `test_model.py` 23/23 · `test_compute.py` 12/12 · `test_seed.py` 31/31 |
| Impeccable critique（两个独立评审：设计评审 + detector/浏览器证据）| 已运行；P1/P2 问题已修复（见 §8） |
| 连续截图 / 录屏 | 18 步截图 `docs/screenshots/integrated/`，动画 `flow.gif`，总览 `flow-sheet.jpg` |


## 1. 这一轮交付了什么

一个从「选择场地 → 进入场地 → 选择 / 创建 Mix → 填色或绘制 → 2D/3D 查看 → 修改与迭代」都在同一个空间工作区里完成的种植设计原型，建立在已有 Detroit 模型上（地形、种植床、Reference 设计、2D/3D 共用模型、Computational Space、原子化编辑 API 都没有重建或覆盖）。

- **入口**：首次打开先看到 Detroit site preset 的轴测图，卡片上直接有两个开始方式：*Empty beds*（清空 15 个主床）或 *From the reference*（在重建的 Reference 种植上覆盖）。*Open site* 仍可只看场地。Detroit 是 preset，不是产品本身。
- **左侧 Mixes 调色盘**：5 个初始 Mix（4 个可执行 + 1 个待完成模板），新建、复制、编辑。
- **画布工具栏里的笔刷**：Select · Fill · Area · Curve · Point · Erase · Keep。Axo / Plan 切换、Layers、Reset view 保留。
- **右侧按需出现的面板**：Mix 编辑器（待提交修改 → Preview → Apply）、空间（Assignment）卡片、植物卡片（含知识与「添加我知道的」）、Feedback。
- **右下角数字**：植物数、面积、密度、未填充面积、未种植位置；点开即 Feedback。
- **Ask · Operate 抽屉**：结构化设计操作（JSON，和笔刷是同一个接口）的 Preview / Apply / Undo，以及给语言模型用的设计上下文导出。没有接入经过授权的 LLM，因此自然语言**不会被解释**，界面明确说明。

## 2. 最重要的连接逻辑：一次填色 = 一条真实的 Design Assignment

填色不是改多边形颜色，也不是画一层视觉植物：

1. 笔刷得到实际几何（床的集合 / 套索多边形 / 曲线 + 宽度 / 点 + 数量）→ 一条 **Design Assignment**（引用某个 Mix，带局部参数、优先级和保留规则）。一条 Assignment 可以跨多个床。
2. 与种植床和可种植范围求交（polygon-clipping）；床内的路、栈道、构筑物扣除。
3. 在每个植物位置精确读取 Computational Space 的场（不是 1 m 网格值）：高程、到路距离、到床边距离、现有树冠。
4. 从 Plant Library 读取 Mix 中植物的知识（水文分区、光照、花期），只用适用于 Detroit 的记录。
5. 按群落角色、比例、株距、配置方法生成候选位置（世界坐标锚定的格网 + 抖动，不是随机 scatter）。
6. 独立验证：在本床内、不在路 / 构筑物上、与同层植物间距 ≥ 0.55 × 株距；失败者丢弃并计数。
7. 通过已有的 `applyPatch` 写入 Working Design（新增 `kind: 'plants'` 的 placement，一行 = 一株计划中的植物）。
8. 2D、3D、数量与反馈都从同一份数据重绘。

三个空间概念彼此独立：**原始床边界**（模型对象，永不修改）、**设计者的空间**（Assignment）、**环境计算分区**（ComputeSpace 1 m 网格与 zones）。

1 m 分析网格不是株距：株距来自 Mix（0.25–1.2 m）。每株植物的 Z 都是 3DEP 1 m DEM 在该点的双线性值（NAVD88）；3D 的 ×1.6 竖向夸张只用于显示，从不进入计算。

三类位置明确区分：**现有真实位置**（现有树冠，NAIP 数字化，`pl = −1`）、**设计生成位置**（design plants，`k = 1`，一行一株）、**渲染 proxy**（Reference 的视觉符号 ≈ 0.42 / 株多年生植物，以及 3D 里给每株设计植物用的形体）。

## 3. Plant Library（植物库）

- 已有 Knowledge 模块（02A.1）整合进同一站点：`knowledge/src/kb.js` 读取 Base 快照 + 浏览器 IndexedDB `gp-knowledge` 里的个人事件——与 Knowledge 工作区共享同一层个人知识。
- 映射：`species_map.json`（科学名、cultivar、canonical id 与空间物种 id）。**cultivar 不当作种的同义名**：种级记录只显示、不自动用于品种。
- **适用范围**：记录的地点与项目地点（Detroit）比较：same / within / broader（如 North America）默认可用；elsewhere（Vancouver、UK、St. Louis）只列出，不自动应用。设计者可以「Apply in Detroit」——这一判断本身作为带范围的个人记录（`applies_in`）保存。没有地点的个人记录会保存，但不被设计规则使用（个人经验必须写明适用范围）。
- 站点属性：`data/detroit/design-library.json`——官方 2026 East / West Meadow 名录上每个种印的水文分区（S-OGD-MEADOW）。两份名录不一致的 6 个种保留两种印法（范围）。
- 可以在植物卡片里新增光照、花期、水文、笔记；会写进同一个个人知识层，设计立即重新读取。
- 缺失就是 Unknown：Detroit 物种几乎没有花期与光照记录，界面与 Feedback 都显示覆盖率或 unknown。

## 4. Planting Mixes（颜料）

每个 Mix 是可复用、可编辑、有版本的设计对象：角色（层：base 按面积份额 / overlay 每 m² 株数 / ephemeral 漂移覆盖率）、种与权重、比例与单位、株距、配置方法（matrix · intermingled · blocks · groups · scatter · drift）、规则、颜色、名称、依据与来源。每个角色同时记录 **图纸角色**（来自 Detroit 图例）与 **群落 / 功能角色**，并标明依据：图例 / 名录 / 设计假设。

| Mix | 系统 | 来源与状态 |
|---|---|---|
| Dropseed matrix | Matrix-based | B 床图例：Sporobolus heterolepis 为记录在案的 matrix；8 个 groups、5 个 emergents、3 种球根。可执行 |
| Colour blocks | Maximal colour | A 床图例：base blocks + emergents + ephemerals；块大小按研究依据（约 20–50 株 / 块）。可执行 |
| Organic groups | Custom（C 床 grouping） | C 床图例：groups 镶嵌 + individuals + 球根。可执行 |
| Native meadow | True meadow | 官方草甸名录物种 + 印刷的水文分区；四个功能角色（暖季、冷季、固氮、动态填充）是**设计假设**。可执行（带提示） |
| Under trees | Under trees | 研究依据中的五个角色；候选种来自 Detroit 名录，多数没有光照记录 → **待完成模板**；树冠下只种有适用遮阴知识的种 |

种的比例：图纸没有公布真实比例，初始为等权（与示意重建一致），可编辑。株距与密度是设计输入。

## 5. Planting Brushes（笔刷）

Point / Line / Area 是几何；Matrix / Blocks / Groups / Mixed 是配置方法；功能角色是群落中的角色——三者可以任意组合。

- **Fill**：点一个床即填色；Shift-点多个床再 *Fill*（一条跨床 Assignment）；*Fill all 15 main beds*。
- **Area**：任意套索；路面部分不种并报告面积。
- **Curve**：沿曲线的带（宽度 0.8–8 m）：*drifts*（沿线交替的群落块，对应手绘草图）或 *rows*（Layout Plant Row）。
- **Point**：点击放置 N 株的小群（叶序排列），角色 / 种可选。
- **Erase**：拖框清空（设计植物以及该处原有种植，真正删除数据，不是隐藏）；点一个空间则删除它。
- **Keep**：拖框保留该处植物快照，之后的修改与 Mix 更新都不影响；点一个空间则冻结 / 解冻。
- 隐藏植物（Layers → Site only，视图）与清空（数据）仍是两回事。

## 6. 环境响应

真实可用的条件：高程、坡度、到路距离、到床边距离、障碍物、现有树冠。日照、土壤湿度、pH 保持 Unknown；不把高程当湿度，不把树冠当日照分析。

- **到路距离（OSM，真实）**：角色规则（例如 emergents 离路 ≥ 0.6 m）。
- **现有树冠（NAIP，真实）**：所有植物离树冠中心 ≥ 0.6 m（近似树干）；Under trees 规则：树冠下只种有适用遮阴记录的种。
- **到床边距离**：植物留在钢边内（约 0.16–0.3 m）。
- **假设情景（明确标注、可关闭）**：「低处更湿」指数 + 名录上的水文分区 → 湿生种向低处聚集。只用于对比实验；湿度本身仍是 unknown。
- 局部替换优先保持原角色（同角色替换计数、理由记录）；无法满足时留下未种植位置并报告原因（plan 里 × 标记）。

## 7. AI build-in workflow

- 鼠标操作与 AI 操作使用同一套接口 `GP.design.run(ops, { preview })`：fill、paint、line、point、erase、keep、freeze、remove、setAssignment、createMix、editMix、setScenario；知识操作 `addKnowledge`、`applyRecordHere`、`setKnowledgePolicy` 通过 `runAsync`。
- `GP.design.context()` 输出语言模型需要读取的全部内容：当前设计、空间、场的注册表（unknown 保留）、各床条件范围、Mix 中物种的知识与覆盖、知识策略、可用操作。
- AI 负责理解、检索、提出与解释操作；引擎负责几何、配置、验证与执行。Preview / Apply / Undo / Reference 对照都可用。
- **限制**：本机没有经过授权的模型接入方式（无 API key，不产生额外费用），所以没有自然语言理解，界面上的 *Ask* 明确回答「Not interpreted」，不伪造。

## 8. 实验结果（真实 Detroit 模型）

完整数字与截图清单：[qa/DESIGN_E2E.md](qa/DESIGN_E2E.md)；原始记录：`qa/design_e2e.json`。

**实验 A · 整体填色**：入口卡片 *Empty beds* → 调色盘选 Dropseed matrix → Fill，Shift-点 6 个 B 床 → *Fill*；再选 Colour blocks，Shift-点 9 个 A/C 床 → *Fill*。两条跨床 Assignment 覆盖全部 15 个主床（未填充 0 m²）：**16,231 株多年生 + 7,112 球根，2,936 m²，5.5 株/m²，33 种**。基础角色比例：matrix 72 % → 71.2 %，groups 28 % → 27.4 %，blocks 100 % → 97.5 %。抽查 3,334 株用 `plantableAt` 复核：0 株不可种；23,343 行设计植物的高程与 DEM 双线性值完全一致（最大偏差 0）。3D 渲染实例 = 数据行数。

**实验 B · 跨区域**：用鼠标画一条 3 m 宽曲线（Organic groups，drifts），一条 Assignment 跨 C1、B1、A1、B3N；带上 30.6 m² 落在路上，不种并报告；942 株全部可种。套索区域（Native meadow）跨 C1、B1、B2、RG 及之间的路，裁切到床内，床外 134 m² 不种。

**实验 C · 地形与环境响应**（同一个 Mix 放到不同条件）：
- Under trees 在 TE（有一棵现有树冠）与 East Meadow 一块含树冠和栈道的区域：树冠下只种了有适用遮阴知识的 Cornus sericea（USDA North America 记录），其余位置留空并写明原因（TE 20 处、East Meadow 131 处）；栈道内 103 个位置不种；所有植物离树冠中心 ≥ 0.6 m。没有树冠的开阔部分所有角色正常种植。
- 假设情景「低处更湿」（Native meadow，West Meadow，z 175.38–175.87 m）：关闭时各水文类的平均高程相同（干 175.607 / 中 175.606 / 湿 175.608 m）；打开后按地形分开：**湿 175.48 < 中 175.61 < 干 175.72 m**，同角色替换 41 种组合。结果处处标注 hypothetical；依据是名录印刷的水文分区。plan 的 *Plants by: water* 直接看到干种在西北高处、湿种在南部低处。
- 真实场的角色规则：Dropseed 的 88 株 emergents 全部离路 ≥ 0.6 m（最小 0.61 m）。
- Z：各床植物 z 范围不同（主床约 175.7–176.8 m，West Meadow 175.4–175.9 m），全部来自 3DEP。

**实验 D · 修改共享 Mix**：先用 Keep 刷子框住 B5（快照 2,462 株）。在 Mix 编辑器把 Dropseed matrix 的 matrix 从 72 % 改为 50 %，并在 groups 加入 Echinacea pallida 'Hula Dancer' → *Preview*（每个角色的前→后、植物数变化、平面图上的新植物）→ *Apply*：v1 → v3，所有未冻结的 Dropseed 空间更新（groups 实际 27 % → 48 %）；B5 快照逐位不变；Colour blocks 空间不变。之后在 B2 局部重画 Colour blocks：区域外 24,632 株完全不变（与顺序无关的哈希相同）。

**实验 E · 知识连接**（个人知识写在测试数据库，不碰真实个人层）：
- 之前：Geranium maculatum 光照 unknown，TE 树冠下只有 Cornus 4 株、20 处留空。
- 在植物卡片 / 操作接口新增个人记录「Geranium maculatum 耐半阴–阴，Detroit，我的观察」→ 引擎重新读取：树冠下 Geranium 19 株 + Cornus 4 株，留空降到 1 处。
- 把知识适用范围收窄到「只用 Detroit 本地记录」→ Cornus（记录是 North America）退出树冠下。
- 把 USDA 那条记录「Apply in Detroit」（保存为带范围的个人判断）→ Cornus 回来。
- Packera aurea、Carex radiata、Sporobolus heterolepis 的光照与花期正确报告为 unknown。

**实验 F · 完整迭代**：入口 → Empty beds → 调色盘 → Fill（A）→ Curve / Area（B）→ Mix 编辑 Preview / Apply（D）→ Undo / Redo（工具栏按钮）→ Reference 对照（调色盘隐藏、两边都完整）→ Feedback 的季节（5 月：只有 0.1 % 的植物有适用花期记录，覆盖率如实显示）→ Ask · Operate：自然语言回答「Not interpreted」；结构化操作 Preview（不写入）→ Apply（同一引擎）→ 2D / 3D → 重新加载后设计文档恢复并重建为相同植物。没有运行时错误。

**UX/UI（Impeccable）**：两个独立评审（Nielsen 23/40）。已修复：点击已画空间打开空间卡片而不是床卡片、面板不再叠放、数字统一为「多年生 + 球根」、份额统一为 %、Mix 编辑器角色可折叠 + 前后对比 + 固定在底部的待提交栏 + 放弃前确认、Variation 后卡片保持、Preview 时平面淡化以看清新植物、操作抽屉默认空白且必须先 Preview 才能 Apply、Esc 逐层关闭、小字对比度（3.6:1 → ≥ 4.5:1）、右侧面板打开时工具栏居中于剩余画布并收起文字、手机宽度可用、直线拖动 Area 生成矩形。未做：在画布上直接拖动角色比例条（评审的主要建议，见 §12）。


## 9. 发布检查

- 没有上传 slides、私有输入（`private-inputs/` 仍被 git 忽略）、密钥。
- Knowledge 模块交接中写明：Robertson 数字化表与 Metro Vancouver 原文引语**在许可确认前只留本地**。所以：
  - 本地分支 `integration/design-prototype` = computational-space + 设计层 + 合并的 Knowledge 分支（完整验收版，未 push）；
  - GitHub 分支 `integration/design-prototype-public` = 同样的设计层，但不含 Knowledge 模块文件；在那里植物库报告 `unavailable`，光照 / 花期为 unknown，水文分区仍可用（站点属性）。
- `design-library.json` 只存事实（种名 → 名录上印的水文分区，附来源 S-OGD-MEADOW；与 model.json 里已公开的草甸种名同源），PDF 本身仍在 `private-inputs/`。它**已包含在公开分支**，因为没有它水文情景无法运行；如果你不同意公开，删除该文件即可（功能退化为 unknown）。
- 公开分支不含 `E01-knowledge-card.png`（卡片上显示了由 Robertson 1929 数字化表得出的访花昆虫数），`flow.gif` / `flow-sheet.jpg` 在公开分支里重新生成为 17 帧（同样去掉这一帧）。
- 合并后 Knowledge 分支又前进到 `ca437c4`（Part B：Claude 集成层，未连接）；本地完整分支已合并它，Knowledge 测试 133/133。
- 没有覆盖 main、没有动 Knowledge Agent 的 worktree（那里还有一个未提交的 `tools/knowledge/llm/`，未触碰）。

## 10. 计算方法（摘要）与数据来源

- 方法细节：[DESIGN_CONTRACT.md](DESIGN_CONTRACT.md)；研究依据：[INTEGRATED_RESEARCH.md](INTEGRATED_RESEARCH.md)。
- 位置：世界坐标锚定的六边形格网（Mix 基础角色的份额加权株距，±13 % 哈希抖动）；块 / 组的种子在抖动网格上，各向异性单元；matrix / intermingled 按 R2 低差异抖动逐株选择；overlay 每格一株、取代最近的基础植物；ephemeral 为椭圆漂移内的细格网。同一地点在任何 Assignment 中给出相同答案 → 局部修改不会重排其他区域（实验 D 验证）。
- 优先级：后画的空间覆盖先画的（只在自身范围内）；Keep / Freeze 的空间高于一切；接缝处同层植物间距 ≥ 0.6 × 株距。
- 数据来源：OSM（床、路、构筑物）、USGS 3DEP 1 m（高程、坡度）、USGS NAIP（现有树冠）、Oudolf 2019/2020 图例与 2026 官方植物名录（种、图纸角色）、2026 官方 East / West Meadow 名录（水文分区，S-OGD-MEADOW）、Planting Intelligence 知识库（planting-db d577104 快照 + 个人事件；USDA PLANTS、MOBOT、RHS、BC eFlora、iNaturalist 等记录，按地点适用）。
- 运行：静态 ES modules，无 Node；`tools/serve.py`（无缓存）。整个主花园（15 床、约 2,936 m²）一次填色约 2 s（桌面浏览器）。

## 11. 当前限制（需要你知道的）

1. **没有 LLM**：无授权接入方式、无 API 费用。自然语言不被解释；结构化操作接口与设计上下文已就绪，接入模型后由模型提出操作、引擎执行。
2. **Detroit 物种知识很少**：光照只有 Cornus sericea 有适用记录（USDA，North America）；花期覆盖率约 0.1 %。季节视图因此大多为 unknown——这是真实状态，可以在植物卡片里逐个补充。Under trees 因此仍是待完成模板。
3. **比例与株距是设计输入**：图纸没有公布各种的真实比例，初始等权；株距、块大小、密度都是可编辑的假设。功能角色（暖季 / 冷季 / 固氮 / 动态填充）对 Native meadow 是设计假设，已标注。
4. **环境条件**：日照、土壤湿度、pH 仍 unknown；湿度只以假设情景出现（相对每个空间的高程，可关闭，处处标注 hypothetical）。树干位置用 NAIP 树冠中心近似。
5. **不做生长 / 多年生态预测**：没有无依据的动画或评分。
6. **3D**：空间轮廓、名称标签、月份着色只在平面图；3D 显示植物与地面色块。
7. **交互**：画笔需要指针；非指针路径是 JSON 操作。Mix 编辑仍是表单（评审建议：直接拖动色板上的角色条——未做）。
8. **持久化**：设计文档保存在本浏览器 localStorage；导出用 ⋯ › Export working design（含所有设计植物）。
9. **GitHub 分支不含 Knowledge 模块**（见 §9）：公开分支上植物库为 unavailable，Under trees 在树冠下不会种植任何植物（因为没有任何遮阴知识可用），实验 E 只能在本地完整分支复现。

## 12. 需要你决定的事项

1. 是否同意公开 Knowledge 模块中的 Robertson 数字化表与 Metro Vancouver 原文引语（决定后可把本地完整分支 push）。
2. `design-library.json`（官方草甸名录印刷的水文分区，事实 + 来源）是否可以公开。
3. 初始 Mix 的物种子集、等权比例、株距（0.40–0.80 m）、块大小（1.6–6 m²）是否符合你的设计意图。
4. Native meadow 四个功能角色的物种归类（目前是设计假设）。
5. 「树冠下需要遮阴知识」与「emergents 离路 ≥ 0.6 m」两条规则的阈值。
6. 是否需要把 Mix 编辑改成直接在画布上拖动角色比例（评审的主要建议）。
7. 合并 / 发布：本轮没有覆盖 main，也没有部署 Pages。

