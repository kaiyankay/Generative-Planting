# 交接 — Phase 02A.1 Knowledge Workspace（含 Phase 02A）

2026-11-26。02A.1 在 02A 的数据基础上，把知识界面重建成面向 Landscape Designer 的工作环境。02A 的数据基础包括：迁移的 Preset、个人层、IndexedDB 持久化、检索接口和来源追溯。02A.1 的范围如下：

- 修复全部已发现的数据问题；
- 建立跨集合的知识网络，以及 **Preset / My knowledge / Combined** 三种图层；
- 每个集合使用最合适的专业可视化；
- 渐进式的 Add / Edit；
- 建立 Botanical Modernism 设计系统。

**没有调用任何 LLM，没有购买或调用付费服务，没有改动空间模型。** Part B 的 Claude 接入层已经建好；但本机没有 SDK、凭证和付费授权，所以状态是 not connected，界面和接口都如实显示。

## 位置与回退

| | |
|---|---|
| 工作目录 | 公开分支：`ARCH540/Generative-Planting-knowledge-public`。原本地分支：`ARCH540/Generative-Planting-knowledge`。两个都是 git worktree，与另一 Agent 的 `ARCH540/Generative-Planting` 分开 |
| 分支 | **公开**：`feature/knowledge-workspace`，已推送到 kaiyankay/Generative-Planting。基于 main 3615e93，一个提交，只新增文件，另加 `.gitignore` 的几行。**2026-11-26 经 Kay 同意，main 已快进到这个提交（3615e93 → c0cc39f）；线上地址 https://kaiyankay.github.io/Generative-Planting/knowledge/ （只发布公开副本）。** **本地**：`feature/dynamic-knowledge-canvas`，保持原样，未 push，含完整历史 |
| 回退 | tag `knowledge-phase-02a`（b844e8f）= 02A 版本。02A.1 的方案图在 `docs/knowledge/redesign-02a1/` |
| 改动范围 | `knowledge/`、`tools/knowledge/`、`docs/knowledge/`、`docs/qa/knowledge_*`、`docs/screenshots/knowledge-02a1/`、`docs/screenshots/knowledge-02b/`。空间模型文件与基线 5a7062d 完全相同 |
| 提交 | 1806595（精简，回退基础）→ 73c4095（Part A）→ Part B 单独提交 |
| Preset | 由 planting-db **d577104** 重建，版本 `base-ebbbf3db18e5` |

## 公开分支与本地研究副本（2026-11-26）

这个分支最终要并入 Generative-Planting 主网页，所以推送到它自己的仓库。

两份资料的许可还没有确认：Robertson 1929 数字化表和 Metro Vancouver 原文引语。原来的 4 个历史提交里有这些资料，所以公开分支没有沿用那段历史，而是从 main 重新做成一个提交。

**两份 Preset**

| 文件 | 内容 | 发布 |
|---|---|---|
| `knowledge/data/seed.json` | 公开副本，版本 `base-965bbf84fc2f`。1083 条记录、全部实体和关系都在。<br>Robertson 只保留每种植物的计数，1998 行数据留在本地。<br>7 条 Metro Vancouver 记录保留转述的 statement；原文引语留在本地，locator 里说明了这一点。 | 是 |
| `knowledge/data/local/seed.json` | 完整研究副本，版本 `base-ebbbf3db18e5` | 否（被 git 忽略） |

**用哪一份**
- **本机浏览器**：在 localhost 或 127.0.0.1 打开时，如果有完整副本就用它；加 `?copy=public` 会强制看公开副本。
- **GitHub Pages**：永远只有公开副本。
- **`kq.py` 和 `server.py`**：同样先用完整副本；设 `GP_KNOWLEDGE_COPY=public` 会强制用公开副本。
- **服务器**：按浏览器 `activeRevision` 里的 Preset 版本，选用对应的副本。

**只留在本机的文件**（`.gitignore` 已列出）
- `knowledge/data/local/`
- `sources/knowledge/robertson_1929_subset.tsv`
- `sources/knowledge/metro_vancouver_water.json`
- 两张截图：`docs/screenshots/knowledge/16-water-rule-record.png`（含 Metro Vancouver 原文）和 `docs/screenshots/knowledge-02a1/12-research-robertson.png`（含 Robertson 数据行）。截图索引里已标注 `localOnly`。

**在另一台机器上恢复完整副本**：把上面这些文件拷过去即可。
- 有 `sources/knowledge/` 时，`build_seed.py` 会同时写出两份副本。
- 只有完整副本时，`build_seed.py --split` 会重新生成公开副本。

**两份副本下的行为**
- **公开副本**：Robertson 视图照常画图（用的是计数），数据行的位置会说明「留在本地研究副本」。
- **个人知识事件**：两份副本的记录 id 相同，所以事件都能套用，只是 activeRevision 不同。

## 运行

```bash
cd /Users/kay/Desktop/ARCH540/Generative-Planting-knowledge-public
```
```bash
python3 -m http.server 8781 --bind 127.0.0.1
```

打开 http://127.0.0.1:8781/knowledge/ 。Claude 桌面端的 launch 配置名是 `gp-knowledge`。这是纯静态服务：Ask 显示「没有知识服务器」，检索照常可用。

要使用 Ask 和 Claude 接入层，改用知识服务器（同时提供页面和 `/api`）：

```bash
python3 -I tools/knowledge/server.py
```

打开 http://127.0.0.1:8782/knowledge/ ，launch 配置名是 `gp-knowledge-api`。真实调用需要三个条件同时满足：安装 `anthropic`、有凭证、启动时设置 `GP_CLAUDE_ALLOW_CALLS=1`。见 `docs/knowledge/02b/CLAUDE_INTEGRATION.md`。

- 个人层保存在本浏览器的 IndexedDB 中。
- 导出、导入、清空在 Personal knowledge 页面底部。
- 检索测试和来源许可在右上角「⋯」→ Data & access。

重建与测试：

```bash
python3 -I tools/knowledge/build_seed.py
```
```bash
python3 -I tools/knowledge/test_seed.py
```
```bash
python3 -I tools/knowledge/run_knowledge_tests.py
```
```bash
python3 -I tools/knowledge/screenshots.py
```
```bash
python3 -I tools/knowledge/before_after.py
```
```bash
python3 -I tools/knowledge/kq.py search "Yarrow water" --place place:vancouver
```
```bash
python3 -I tools/knowledge/llm/test_llm.py
```
```bash
python3 -I tools/knowledge/llm/validate.py
```
```bash
python3 -I tools/knowledge/record_ask.py
```

## Part B — Claude 接入（2026-11-26）

**现状：架构、工具接口、数据传递和界面都已完成，并通过不调用模型的测试。真实 Claude 没有接入**：本机没有 `anthropic` 包、没有凭证，也没有付费授权。没有发出任何请求，没有产生费用。界面里没有任何内容冒充 Claude 的回答。

**Ask Knowledge（右栏，按需打开）**
- 入口有三个：顶栏「Ask」；Inspector 标题旁的「Ask about this」，会带上当前选中对象；在 Add 面板里切换到 Ask。
- Ask 与 Add knowledge 是同一个面板、同一个输入框，切换时文字保留。没有第四个常驻面板，也没有单独的聊天页。
- 上下文以小标签显示：当前图层、知识版本，以及选中对象（可移除）。项目地点可选。
- **Retrieve**：在当前生效的知识上做真实检索，不用模型，结果与 window.GPK 和 kq.py 相同。知识服务器会用浏览器的 events 重建同一版本，并核对返回相同的记录；界面会写明「Server read the same version…」。
- **Ask Claude**：只有服务器报告 connected 时才可点击。现在显示「Claude Sonnet 5.5 · not connected」，并逐条列出缺少的条件。展开「What is sent to Anthropic」可看到会发送什么：包括我自己的笔记；许可未明确的原文引语和 Robertson 数据行留在本地；密钥只在本地服务器。
- 接入后，回答分三块显示，互不混合：Answer（带编号引用）、Cited（标出「没有经工具检索」或「不在知识中」的引用）、Retrieved by Claude's tools（工具调用与返回的记录）。下面仍是本地的 Retrieved here。
- 回答里的植物和记录都可以点击：画布定位并高亮，Inspector 打开该对象，顶部有「Back to your question」，返回时问题和回答都还在。

**Knowledge Ingestion（Add）**
- 原有的确定性识别不变：名称、句子、清单、表格、文件。
- 句子模式新增「Understand with Claude」。没有接入时不可点击，并说明 Save 会按原文保存。
- 接入后，Claude 只返回**可编辑的结构化预览**：分句（原文）、植物（只采用精确匹配的 id；未知名称可选作新的 provisional 植物）、类型、地点、时间、条件、「In short」、未能确定的内容。服务器会清除知识中不存在的 id。
- **未经确认，不保存任何内容。**「Confirm and save」写成一个事件（多句时是一个 batch），Undo 一次撤销全部。每条记录保留：
  - 原始输入；
  - 模型的原始提议；
  - 模型名；
  - 是否被编辑过；
  - `confirmedBy: designer`；
  - 来源 `me`。

  检索结果会标注「structured by a language model from the designer's words; every field confirmed by the designer」。
- Discard 不保存任何内容。

**技术接入**
- `tools/knowledge/llm/provider.py`：使用官方 `anthropic` SDK（延迟导入）。
  - 模型 `claude-sonnet-5-5`，effort medium，adaptive thinking（默认），`max_tokens` 16000。
  - **已开启服务端拒答回退**：`fallbacks: "default"`，beta `server-side-fallback-2026-07-01`。
  - 手写工具循环，处理 end_turn / tool_use / pause_turn / refusal / max_tokens。
  - 五个 strict 只读工具。
- `tools/knowledge/server.py`：只监听 127.0.0.1，页面与 `/api` 同源。
  - 每个请求都带浏览器的 events 和 activeRevision，服务器用 kq.py 重建；版本不同时返回 409。所以后端读到的就是画布当前的生效知识，而不只是 Preset。
  - 拒绝跨源请求（403）和非 JSON 请求（415）。
  - 不提供 private-inputs、.git、.claude。
- window.GPK、kq.py、IndexedDB、事件日志、工作区文件都保持原有作用。

**研究验证（`validate.py`）**
- 同一组问题分别在 Preset 和 Combined 上运行。
- 第 1 部分（检索差异）已真实运行，见 `docs/knowledge/02b/VALIDATION.md`。
- 第 2 部分需要同一模型、同一设置，分别记录检索、引用和回答。**Not run**：需要接入并加 `--run-model`。不预设结果。
- 没有导出的 Kay 工作区时，个人层用的是测试事件脚本，并已标明。

**录屏**：`docs/screenshots/knowledge-02b/ask-session.gif`，共 13 帧，来自一次真实的 headless Chrome 会话：选中 → Ask about this → 检索 → 查看未接入状态 → 定位记录 → 返回 → 同一输入框写笔记并保存 → 在 Combined 和 Preset 上再检索。帧下方的说明条是录制脚本加的。

## Part A — 最终调整（2026-11-26，Kay 审查后）

保留视觉方向、三栏布局、插画、字体，以及 Preset / My knowledge / Combined。不做全局重构，也没有增加新的工具或页面。

**说明与图例**
- 恢复必要的范围说明、单位、方法说明和图例，但不恢复长段说明：
  - 每个标题下一行范围说明；
  - 表头标注单位；
  - 各图常驻的简短图例：网络、Connections、Compare、Profiles 的覆盖条、Seasons、Survey 的圆点、Curated databases、Robertson、组合符号。
- 不需要悬停就能看懂图表。
- 计数统一写明单位：知识记录、受访者、陈述、观测（按来源报告），不再混用。

**证据分级**
- planting-db 中 508 条值由 Claude 从数据库页面读取（T5），现在标为「值由语言模型读取 · 未经人工核对」。
- 10 条「model placeholder」标为「语言模型推断，没有外部来源，不是证据」。
- AI 复读来源（534 条）单独标注「不等于核对」。
- 检索接口返回同样的 `provenance` 字段和提示，JS 与 Python 一致。

**Expand in place**
- Connections 中双击（或 Shift+Enter、或再次点击已选中的对象）会在当前图中加入它的真实邻居，已有节点保持原位。
- 共同的邻居只画一次，跨集合的连线会自然出现。可以单独收起某次展开，或只保留最后一次。
- Plant Library 网络中双击植物，会把它的组合、研究、问卷、地点和笔记加在它周围；共享属性网络不变。
- 每张图有固定的版面：画布尺寸变化（如 Inspector 打开）只会缩放，不会重排。切换 Preset / My knowledge / Combined 时位置不变。被替换或停用的 Preset 关系以虚线幽灵线显示。

**专业可视化修正**
- Recipe Compare 默认只显示有知识的成员，按已记录的知识量排序；一键可看全部 46 个。
- Robertson 柱图与原始数据表不再重叠。
- Full profile 筛选外的「我的植物」改为显式的「+ mine」标签，可以关闭。
- 种植组合新增「Layers in the plan legend」图解：
  - 按图例中绘图角色的顺序排列，球根在地面线以下；
  - 每个成员一个符号，可以点选，点选每一层可查看对应的绘图角色；
  - 明确说明不表示高度、密度、功能或位置。

**交互**
- 节点、单元格、花期条、问卷圆点、组合成员和图层都可以用键盘聚焦；Enter 选中，Shift+Enter 展开。
- 窄屏适配：
  - ≤1280px 收紧间距；
  - ≤1024px 集合列表收进菜单按钮；
  - ≤760px Inspector 占满屏幕。

**测试**：新增 A01–A20，共 112/112 通过，Python parity 一致。

## 精简（Impeccable distill，2026-11-26）

按「去掉不必要的次级标签和说明，让布局本身表达」调整。使用 Impeccable 4.8.0 的 `distill` 流程和 craft floor 规则；改动后运行它的检测器，0 条问题。

- 每屏最多一行文字：标题加一个淡色计数（如 `10 / 285`）。去掉导语、范围说明和图表说明；方法、范围和注意事项改放在悬停提示、Inspector 和 Data & access 里。
- 去掉眉标（eyebrow）：Inspector 只显示对象名称；左侧集合只显示名称和数量。
- 图例只保留同时是控件的部分（网络图的主题开关）；线型和形状说明改为悬停提示。
- 网络图下方的四栏说明改成一行：折叠的共同属性（可展开），以及没有关联的植物。分组靠阴影区域表达；只有这一种植物具备的知识移到 Inspector 的「Only here」。
- 种植组合中，植物符号的颜色越深表示已知知识越多；原来的五个小方块和图例已删除。
- Add knowledge 改为在画布旁边打开的面板，不再是弹窗。输入时，这条知识将关联的植物会在画布中被圈出。
- My knowledge 图层用画布顶部的赭红色细线表示，不再显示说明条。
- 按 craft floor 修正：
  - 个人标记改为绘制的菱形，不再用字符；
  - 去掉彩色左边框、大号统计数字行和条纹渐变；
  - 主题化文本选中、光标和滚动条；
  - 次级灰色提高到 AA 对比度。
- 「我的修改」计数统一：左侧、图层开关和 Personal 页都按生效中的修改计算。

## 界面结构

- **左侧 Collections**：
  - Plant Library：285 个分类单元，即 150 个物种、100 个品种、3 个占位名、32 个未确认的问卷名称。
  - Designer survey：15 位受访者。
  - Research：Robertson 1929、专业数据库、设计文献。
  - Planting recipes：Detroit 的 8 个组合，点开后列出组合清单。
  - Local data：Metro Vancouver。
  - Personal knowledge。

  它们是浏览入口，不是知识图谱的固定分支。
- **中间画布**：视图由集合决定。
  - Plant Library：Network · Profiles · Compare · Seasons
  - Recipes：Composition · Compare · Seasons
  - Survey：Responses
  - Research：Flower visitors · Curated databases · Design literature
  - Local：Metro Vancouver
  - Personal：Changes

  每个集合都另有 **Connections**，可以从任何对象（植物、数据集、组合、地点、问卷、我的知识）出发，跨集合探索。
- **右侧 Inspector**：只在选中对象时出现，出现时画布变窄，不遮挡内容。ID、版本 hash、完整同义词、许可、原始字段都收在「Details」里。
- **顶部**：Preset · My knowledge · Combined 三个图层，共用同一套视图和数据通路。另有唯一的「Add knowledge」入口。

## 演示路线

截图在 `docs/screenshots/knowledge-02a1/`，共 26 张，都来自同一次真实会话。说明写在 `index.json`。

**A. 跨集合的知识网络**
- 01 默认工作区：十种完整档案植物，只通过记录中共享的属性相连。
  - 线越粗表示独立来源越多，但这不代表可信度。
  - 分组是根据当前数据实时计算的探索性区域。
  - 10 种里有 8 种以上共有的概念默认折叠，可以展开。
  - 只有一种植物具备的知识、没有关联的植物，都单独列出。
- 02 选中 Yarrow：Inspector 让画布变窄，显示档案、覆盖条、按来源和地点分开的花期，以及问卷原话。
- 03 Explore connections：从 Yarrow 经品种 ‘Terra Cotta’ 到 B beds 组合；Robertson（虚线，仅名称匹配）；问卷；本地来源；记录地点。
- 04 双击 Robertson 1929：以研究数据集为中心，反向回到它的 38 种植物。
- 05 B beds 组合为中心：成员按绘图角色分组。
- 25 以「My knowledge」为中心：我改动过的全部内容。

**B. 专业可视化**
- 06 Composition：B beds 的 46 个实际成员按图例角色分层，不是高度。
  - 每个角色标出植物类型构成，如「20 forbs, 1 bulb」。
  - 每株下方有五个知识标记。
  - 选中 ‘Terra Cotta’ 时，品种自身的知识和物种层知识分开显示。
- 07、08 Compare：
  - 高度条按来源分开，附温哥华行道树的中位数；
  - 光照符号；干湿刻度；12 个月花期条；
  - 受访者人数；Robertson 记录（虚线条）；
  - 「via species」表示只有物种层数据。
- 09 Seasons：花期按来源和地区逐条显示，不合并。
- 10 Profiles 与四个独立维度：Coverage、Origin、Identity、Contribution，可以交叉筛选。
- 11 Survey：
  - 受访者背景只显示汇总；
  - 植物 × 选择理由的点阵；
  - 去重后的原话（「2 records, one answer」）；
  - 共同列出的植物对。
- 12–14 Research：
  - Robertson 柱图和所选植物的原始行；
  - 数据库 × 植物的覆盖矩阵，含各来源描述的地区；
  - 功能层 / 空间功能及文献出处。
- 15 Local：地点层级、用水规定日历、每种植物的本地证据。

**C. Preset 与 Personal Knowledge**
- 16 Add knowledge：输入短名称 → 识别为植物名 → `Acer griseum` 以 provisional 新增，不编造任何属性。
- 17 输入一句话 → 识别为「你的知识」：
  - Yarrow 自动关联；
  - 由「prefer」预选 Preference，由「Vancouver」预选地点；
  - 以上都明确标出依据，可以修改。没有 AI 参与。
- 18 保存后：Yarrow 上出现 ◆ 我的知识，植物数不变（151 = 150 + Acer griseum）。
- 19、20 Edit my version（Kinnikinnick 的 MOBOT 记录）：
  - 我的版本从空白的 context 开始；
  - 保存后 Preset 原文显示为删除线，与我的版本并列；
  - 来源是「me」，地点是 Metro Vancouver，类型是 observation；原文可以恢复。
- 21 My knowledge 图层：同一张网络图，只突出我的部分，其余作为背景淡出。
- 22 Preset 图层：原始 MOBOT 记录生效，没有任何个人标记。
- 23 粘贴一份清单：
  - 识别为清单；
  - 必须先填写标题和来源才能导入；
  - Yarrow 的两行合并为一条成员关系；
  - 「irrigation」不关联，也不计入。
- 24 Personal knowledge：按植物列出新增、我的版本与原文对照、清单的未匹配行，以及可撤销的完整历史。
- 26 LLM access：`searchKnowledge()` 读取当前生效的知识。
  - 结果带地点匹配：same / within / broader / elsewhere。
  - 与 Preset 时的检索比较：我的版本出现，被替代的记录消失。

**改版前后对比**：`docs/screenshots/knowledge-02a1/before-after/` 有 a–f 六张。左边是 02A 原截图，右边是 02A.1，对应同一个任务。

## 验收（brief §12 逐条）

| # | 要求 | 结果 | 依据 |
|---|---|---|---|
| 1 | Preset 完整保留 | 通过 | 615 条 claims 逐字节重建，种子测试 31/31；编辑后 seed 对象不变（T04.9）；Preset 图层 |
| 2 | 不同来源之间有依据的关联 | 通过 | Connections；每个邻居都带记录（D21、D22、U04、U05） |
| 3 | 直接比较 Preset / 个人 / Combined | 通过 | U12；截图 20–22 |
| 4 | 添加新植物与专业知识 | 通过 | U06–U09、D15 |
| 5 | 修改、停用、恢复 | 通过 | U10、U13、U19 |
| 6 | 独有知识不会消失 | 通过 | D20；网络下方的「Carried by one plant only」「Not linked here」 |
| 7 | 各视图与检索同步 | 通过 | U09、U11、U12、T04、T09 |
| 8 | 已有植物的笔记不增加植物数 | 通过 | D15、U09 |
| 9 | Recipe 分析使用实际成员 | 通过 | D17、U16 |
| 10 | 图表与关系有真实依据 | 通过 | D18、D21、D11；所有图都从记录计算 |
| 11 | Inspector 不遮挡画布 | 通过 | U02（画布右边界 ≤ Inspector 左边界） |
| 12 | 独立的视觉辨识度 | 待你判断 | `DESIGN_SYSTEM.md`、截图、改版前后对比 |
| 13 | 迁移、持久化、检索测试通过 | 通过 | 92/92、31/31、Python parity 一致 |
| 14 | 空间模型不受影响 | 通过 | 23/23、42/42；与 5a7062d 无差异 |

## 测试结果（本次实际运行）

| 套件 | 结果 |
|---|---|
| `test_seed.py`：迁移、隐私、映射、02A.1 的种子回归，加上公开副本检查 P01–P03（公开副本 = public_seed(完整副本)；没有引语和数据行；记录一条不少） | **34/34**（用完整副本） |
| `run_knowledge_tests.py`：核心 T01–T12、数据回归 D01–D23、界面 U01–U20、Part A 的 A01–A20、Part B 的 B01–B21（在知识服务器上运行，`/api` 是真实的） | **133/133**（完整副本，本机运行 P57 私有用例）；**133/133**（公开副本，`--copy public`，T06.1 和 A15 改为检查「留在本地」的说明） |
| `llm/test_llm.py`：网关、工具、strict schema、工具循环（脚本替身，不是模型）、服务器的版本核对、安全 | **18/18**（完整副本），**18/18**（公开副本，`GP_KNOWLEDGE_COPY=public`）；真实模型测试 R01–R05 **Not run** |
| `kq.py` 与浏览器的一致性 | 两份副本都一致：同一 revision，1,062 条有效记录，18 个查询的 id 和分数完全相同 |
| 空间模型 `tools/test_model.py` | 23/23 |
| 空间 viewer 的 `tests.html` | 42/42。用 CDP 客户端运行；仓库自带的 `run_browser_tests.py` 用 `--dump-dom`，在本机超时 |

数据问题、原因、修正与回归测试的对应表见 `docs/knowledge/02a1/DATA_INTEGRITY.md`，共 21 项：方案里的 13 项，加上新 brief 要求检查的各项。

## 第一次使用者的操作测试（由我实际操作后修正）

按「第一次打开的设计师」走完上面 A→B→C 全程，发现并已修正：

1. 四维筛选栏占据了两行高度，压缩了画布 → 改为一行的范围摘要，按需展开。
2. Connections 里属性节点过密 → 属性按主题折叠成一个节点，点击展开，可一键「Fold groups」。
3. 输入一句话时，把「Yarrow for」误当作新植物名 → 现在只提示像拉丁学名的未知名称。
4. 新增植物后，Plant Library 的筛选被清空 → 改为保留筛选，「我的植物」会自动加入范围。
5. Personal 页把导入的清单写成「按名称添加的植物」 → 现在显示为清单：关联数和未匹配行。
6. 网络图的组名被插画遮挡 → 移到区域左侧。
7. 笔记日期用的是 UTC → 改为本地日期。

尚未处理的：
- 窄屏（低于 1280 px）没有专门适配；
- 图中不能用键盘移动焦点；
- 75 个成员的 Meadow 组合，构成图仍然很密。

## 局限（如实）

- **Claude 未接入，没有真实模型结果。** 接入层已建好，测试都不调用模型。真实回答的质量、引用是否准确、抽取是否可靠、Preset 与 Combined 的回答差异，都还**没有验证**（R01–R05、validate 第 2 部分：Not run）。
- 未接入时，Add knowledge 只按输入的形式识别：名称、句子、清单、表格、文件。
  - 名称做精确的别名匹配；
  - 类型和地点的预选只来自原文中的关键词，并明确说明依据；
  - 文件不解析。

  接入后，「Understand with Claude」作为可选步骤叠加在上面，预览和确认步骤不变。
- 发给 Claude 的内容里会包括你自己的笔记，前提是它们被检索到。
- 检索是关键词加别名，不是语义检索。
- Robertson 的 38 个物种都只是拼写匹配，尚未做分类学核对，只作为研究线索显示。
- 花期只有 9 个物种、29 条记录；Detroit 的品种没有自己的花期数据，只能通过物种显示。
- 绘图角色不是生态角色。Detroit 分类单元没有可用的高度和密度数据：空间模型中的数值标为 inferred，未采用。所以构成图不是空间方案。
- 只有十种 Plant Library 植物有插画（AI 编辑插画，声明不作证据）。其余用平面图符号，类型来自平面图物种表；有 2 个分类单元缺类型，显示为虚线圈。
- 问卷样本只有 15 人，部分选择理由没有编码，显示为「Reason (uncoded)」。
- 网络图最多画 36 种植物，其余在 Profiles 中查看。分组阈值（Jaccard 0.25）和折叠比例（80%）是设计选择，已在界面中写明。
- 个人层只存在单个浏览器中，跨设备要导出和导入；不支持多人协作。
- 设计系统的 token 已写成文档，但还没有抽成可被 Design Workspace 直接引用的共享包。

## 需要 Kay 决定 / 确认

1. **视觉方向**：
   - 字体：nct127 用于标题，Archivo 用于正文，DM Mono 用于数据；
   - 配色：白底、#252A25、#82967D、#A8B8AE、#B66D48。

   是否认可？
2. **发布与许可**：公开分支 `feature/knowledge-workspace` 已推送，并已快进合并进 main，线上地址是 https://kaiyankay.github.io/Generative-Planting/knowledge/ 。Robertson 数字化表和 Metro Vancouver 原文引语仍只在本地研究副本里；如果确认了许可，可以改为发布完整副本，改动就是把 `build_seed.py` 里的 `RESTRICTED_SOURCES` 清空。另一个会话的集成分支（`Generative-Planting-design` 里的 `integration/design-prototype`）合并的是本地的 73c4095，那里面含有受限资料；以后集成进主网页时，应改为合并这个公开分支。
3. **Robertson 的分类学核对**：由谁核对、何时核对。当前做法是带标记作为线索显示，符合你这次的要求。
4. **两个分析参数**：探索性分组的阈值（0.25），以及共同属性的折叠比例（80%）。
5. **Detroit 植物类型**：植物符号依赖空间模型物种表中的 `plantType`（该字段未标为 inferred）。是否接受？
6. planting-db `synonyms.json` 中的来源键（`rhs` 等）是否要在原库修正。
7. 合并时，是否在空间页 `index.html` 加一个 Knowledge 链接。为避免和 Phase 01.1 冲突，我没有改动。
8. **Claude 接入（Part B）**：
   - 是否提供 API 凭证，并授权产生费用（`GP_CLAUDE_ALLOW_CALLS=1`）。
   - 模型是否用 `claude-sonnet-5-5`。
   - 预算上限：每个问题最多 8 轮工具调用，`max_tokens` 16000。
   - 接入后，先跑 `test_llm.py`（`GP_CLAUDE_LIVE_TEST=1`）和 `validate.py --run-model`，再判断效果。
9. **发送范围**：个人笔记被检索到时会发给 Anthropic。是否接受？还是需要「不发送个人层」的开关？
10. **本地保留的来源**：目前是 Metro Vancouver 两个页面和 Robertson 1929，见 `provider.LOCAL_ONLY_SOURCES`。其他数据库来源（MOBOT、RHS 等）的改写陈述会发送给模型。是否需要扩大这个范围？
11. **验证问题**：`validate.py` 里的 8 个问题是否合适？是否用你导出的个人工作区代替测试事件脚本？

## 文件索引

- `knowledge/index.html`、`knowledge/src/`：
  - `app.js` 外壳；
  - `analysis.js` 所有推导分析，纯函数；
  - `views/*.js` 各视图；
  - `inspector.js`；
  - `add.js` 渐进输入；
  - `access.js` 检索和来源；
  - `kb.js`、`ingest.js`、`store.js` 数据核心。
- `knowledge/art/`：十张白底插画，附 ATTRIBUTION。`knowledge/fonts/nct127-Regular.woff2`。
- `docs/knowledge/DESIGN_SYSTEM.md`：设计系统。
- `docs/knowledge/02a1/DATA_INTEGRITY.md`：数据修正报告。
- `docs/knowledge/QA_REPORT.md`：测试报告。
- `docs/knowledge/DATA_CONTRACT.md`、`RETRIEVAL_API.md`：已补充 02A.1 新字段和地点匹配。
- Part B：
  - `knowledge/src/ask.js`：Ask 与连接状态；
  - `tools/knowledge/server.py`：知识服务器；
  - `tools/knowledge/llm/provider.py`：Claude 适配器；
  - `tools/knowledge/llm/test_llm.py`：测试；
  - `tools/knowledge/llm/validate.py`：研究验证；
  - `tools/knowledge/record_ask.py`：录屏；
  - `docs/knowledge/02b/`：CLAUDE_INTEGRATION.md、VALIDATION.md。
- `docs/screenshots/knowledge-02a1/`：截图和改版前后对比。02A 的截图仍在 `docs/screenshots/knowledge/`。
- `tools/knowledge/`：
  - `build_seed.py`、`test_seed.py`、`kq.py`；
  - `run_knowledge_tests.py`、`screenshots.py`、`before_after.py`；
  - `cdp.py`；
  - `mockup_data.py`、`render_mockups.py`：02A.1 方案图。
