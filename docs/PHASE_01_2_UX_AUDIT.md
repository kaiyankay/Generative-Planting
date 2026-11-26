# Phase 01.2 · Site setup 组件化：UX/UI 审查与简化

**定位纠正。** Generative Planting 是 AI 辅助种植设计工具。本页面只是其中的 **Site setup / Spatial input** 模块：载入一个场地预设（site preset），读懂地形、基础设施、现有植被与种植框架，然后从原种植方案或空白床开始一个工作方案。Detroit（Oudolf Garden Detroit）是第一个 site preset，不是产品本身。本轮只改信息架构与界面，不改数据、空间 API、编辑机制，也不开发 AI、知识库或其他未来页面。

## 1. 审查方法

- **frontend-design skill**（已加载）：设计原则、文字与结构规则（不用 eyebrow 标签、不用全大写标签、少用 “A · B · C” 拼接、每个结构元素必须承载信息）。
- **Impeccable**（本机 `planting-db/.claude/skills/impeccable`，v4.8）：按其 `critique` / `distill` / `operate` / `craft-floor` 手册执行。其启动器是另一项目中的二进制、首次运行可能下载，本轮未执行，因此 detector 未跑，属于**部分降级运行**（Impeccable 要求在报告中写明）。
  - Assessment A（设计审查）由一个**独立子代理**完成，未看到我的结论；
  - Assessment B（浏览器证据）由我在真实浏览器中测量：可见控件数、屏幕文字量、界面面板占比、重复控件。
- 截图均为真实浏览器（无头 Chrome，SwiftShader）在 1440×900 与 390×844 下的实际渲染。

## 2. 审查结果（Phase 01.1 界面，改前）

**设计特异性：** 图面本身属于景观研究图纸（平面符号、层叠、半透明植物），不像通用模板；但外围界面是通用的浮动面板地图浏览器，且处处以花园命名（品牌行 “Detroit · Spatial Laboratory”、面包屑根 “Garden”），没有 “site preset / Site setup” 的概念 —— 读起来是 Oudolf 花园浏览器，而不是设计工具里的一个场地。

**Nielsen 启发式：23 / 40**（独立审查）。较弱项：系统用语（World / State / Canvas / proxies / placements / ids 直接暴露）2 分；一致性（“Layers” 指三种东西；工作方案在不同处被叫 Canvas / working design / Draft / New…）2 分；最简设计（常驻长句、图例兼控制面板、Inspector 堆砌数据）2 分；认知负荷检查 5 项不合格。

**改前测量（同一脚本）：**

| 状态 | 可见控件 | 屏幕文字（词） | 界面面板占比 |
|---|---|---|---|
| 进入（World · Reference） | 10 | 52 | 3.9 % |
| 选中一个床 | 20 | 404 | 24.1 % |
| Layers 视图 + 聚焦 | 21 | 76 | 9.3 % |
| 隔离图层平面 | 29 | 152 | 19.8 % |
| 图层索引展开 | 38 | 61 | 8.5 % |

**重复与冲突控件（改前）：**

| 重复 | 问题 |
|---|---|
| “Layers” 视图标签 / “Layers” 面板按钮 / 面包屑 “Layers” | 同一个词表示三件事，同时出现在屏幕上 |
| 图层索引的 “open in Plan” / 层叠标签双击 / 卡片 “Open in Plan” / Enter | 同一隔离动作四条路径 |
| 图层索引的眼睛 / 隔离图例里的 ●○ / 参照叠加勾选框 | 可见性在三处设置，符号不同 |
| “Terrain” 状态 / 隔离 Terrain 图层 / 底部 “Hide planting” / 关闭若干图层 | 去掉种植有四种方式，且 Terrain 被当成“设计状态” |
| 顶栏 Fit / 面包屑 Fit | 同一功能同时出现 |
| 面包屑 Back / Garden / Layers / 卡片 All layers / Esc | 同一种“返回”，去向却不同 |
| 第一次点击 Canvas / 底部 “New…” | 都打开开始对话框 |
| 隔离中改动的图层开关 | 退出时被静默还原 |

另：开始对话框一次给出 2 个单选 + 6 个勾选框 + “清除 1,852 个 placement、14,679 个代理” 的破坏性表述；左侧三个面板重叠（面包屑压住图层索引标题，图例压住索引底部）；失败时弹出原生 `alert()`；“Detroit · Spatial Laboratory” 在近景中压在植物上难以阅读。

## 3. 新的信息架构

```
┌ bar ─────────────────────────────────────────────────────────────────┐
│ Generative Planting / Site setup  [Oudolf Garden Detroit ▾]   Design [Reference | Working design] ⋯ │
├──────────────────────────────────────────────────────────────────────┤
│ [Layers panel]                                     [selection card]  │
│  Show: Everything · Site only · Terrain              (compact;       │
│  7 layer groups: parts ▸ · eye · solo                 Details opens  │
│  key for what is shown                                the record)    │
│  Exploded view (optional)                                            │
│                       SPATIAL CANVAS (Axo default / Plan)            │
│ compass/scale        [ Axo | Plan ]  [ Layers ]  [ ⤢ ]        status │
└──────────────────────────────────────────────────────────────────────┘
```

两条轴永不混用：

| | 内容 | 位置 | 改动的是 |
|---|---|---|---|
| **Design（设计方案）** | Reference（原种植方案的示意重建，只读）· Working design（可编辑） | 顶栏右侧 | 看哪一个种植方案 |
| **View（观察方式）** | Axo · Plan；显示 Everything / Site only / Terrain；单层 solo（2D）+ trace 叠加；Exploded（可选解释） | 画布工具条与 Layers 面板 | 怎么看，不改数据 |

## 4. 十项要求逐条对应

| # | 要求 | 做法 | 截图（`docs/screenshots/phase-01-2/`） |
|---|---|---|---|
| 1 | 模型定位为 Site setup / Spatial input 模块 | 顶栏：`Generative Planting / Site setup / [site preset]`；页面标题 “Site setup — Generative Planting”；site preset 来自 `data/presets.json`（`?site=` 选择）；花园信息收进 site 芯片打开的说明页 | 01, 11 |
| 2 | 清晰稳定的默认 Axonometric | 正交轴测，相机在南偏东 20°、仰角 35°（北向保持接近上方，与平面一致）；进入即此视角；`Reset view`/F 回到同一视角；左键拖动＝平移（与平面一致），右键旋转 | 01 |
| 3 | Axo 与 Plan 是同一画布 | 两者是画布工具条里的同一个开关；切换时**同一中心点与比例**带过去（测试验证）；不再是主导航页面 | 01 ↔ 02 |
| 4 | Layers 是画布内上下文功能，以 2D 隔离与叠加为主 | Layers 面板（工具条按钮 / L）：每组只有 3 个控件（展开 · 可见 · solo）；solo＝该层单独在平面中显示，其他行原位变成 “Trace” 叠加 + 不透明度；Exploded 3D 只是面板底部的可选解释 | 03, 04, 06 |
| 5 | Design State 与 View State 分开 | 顶栏只有 Reference / Working design；Terrain 移入 Layers 的 “Show: Terrain” 过滤，与 Site only 同级 | 05, 08 |
| 6 | 可从原方案或空白开始，原设计保留 | “New design” 打开两张对等的选择卡（From the reference planting / Blank beds），一键开始；额外清空范围折叠在 “Also empty…”；描述用床而非代理数量；工作方案的 Undo all / Export / Start new / Delete 收进 “⋯” 菜单；参照永不改变（测试验证） | 07, 08 |
| 7 | 默认隐藏 Inspector、技术信息、复杂图层控制 | 选择卡默认紧凑（名称、类型、一句事实、设计状态、证据等级）；ids / OSM / JSON / 来源收进 Details › Data & sources；坐标只在 Plan 显示；锁和子图层收在每组的展开里；Layers 面板默认关闭 | 09, 10 |
| 8 | UX/UI Audit | 本文第 1–2、6 节 | — |
| 9 | 保留 Landscape as Laboratory 视觉语言，不为 Detroit 单独建立视觉体系 | 画布配色与符号不变；界面去掉 Detroit 品牌行；改为句首大写、去 eyebrow、去 2 px 彩色左边框、去 Unicode 符号当图标，统一 1 px 线与一套按钮 | 全部 |
| 10 | 保留数据、空间 API、编辑机制与测试 | `model.json` / `instances.bin` 字节不变；模型与补丁代码未动；Phase 01.1 的 API 全部保留（`setMode` 等作兼容映射）；原 42 + 71 项测试全部保留，按新界面改选择器并记录原因 | — |

**组件化：** `?embed=1` 时隐藏产品与模块名（由宿主工作流提供），保留 site 芯片、Design 选择与画布；同一套 API 在页面内为 `window.GP`，嵌入时通过 `postMessage` 调用（白名单方法，返回纯数据），并向宿主发出 `ready / view / design / solo / selection` 事件。`tools/embed_check.html` 是 QA 夹具（不是产品页面），截图 12。

## 5. 改后测量（同一脚本，1440×900）

| 状态 | 可见控件 | 屏幕文字（词） | 界面面板占比 |
|---|---|---|---|
| 进入（Axo · Reference） | **7**（原 10） | **22**（原 52） | **2.7 %**（原 3.9） |
| 选中一个床 | **12**（原 20） | **40**（原 404） | **6.8 %**（原 24.1） |
| Layers 面板打开 | 33（原索引展开 38） | 40 | 随内容高度 |
| 单层 solo（平面） | 32（原 29） | **112**（原 152） | 随内容高度 |

solo 状态控件略多（+3），因为叠加控制从单独列表并入了图层行本身（每行一个 Trace）；换来的是只有一处设置叠加、没有重叠面板。

## 6. 删除或移动的复杂度

| 去掉 / 移动 | 原因 | 现在在哪里 |
|---|---|---|
| 主导航 World / Plan / Layers | Axo/Plan 是画布的观察方式；Layers 是工具 | 画布工具条 |
| State：Reference / Canvas / Terrain | 混合了设计、视图过滤与创建动作 | Design 选择（顶栏）；Terrain → Layers 的 Show 过滤 |
| 面包屑（Garden / Layers / X）与 Back | 与 Esc、卡片按钮重复且去向不一 | solo 行的切换按钮 / 面板关闭时的 solo 提示条；Esc 一级一级返回 |
| Layers 卡片（Open in Plan） | 第四条隔离路径 | 层叠标签上的 “Show alone in plan” |
| 图例里的子图层开关与 Reference overlays 列表 | 与图层行重复 | 图层行（展开 / Trace） |
| 状态栏长句与 Reset / Export / New 链接 | 常驻文字过多；与菜单重复 | 状态栏一句话；工作方案菜单 “⋯” |
| About 按钮 | 与 site 芯片重复 | site 芯片 |
| 原生 `alert()` | 无法恢复的错误提示 | 对话框内联错误 |
| 退出隔离时静默还原图层开关 | 用户改动丢失 | 只还原程序自动打开的图层，用户改动保留 |

## 7. 仍需决定 / 已知限制

1. 只有一个 site preset，因此 site 芯片目前打开的是场地说明，而不是预设切换列表；第二个场地加入 `data/presets.json` 后再做切换。
2. Exploded 视图打开时同时显示面板与层叠标签，控件数较多（作为可选解释视图可接受）。
3. Impeccable detector 未运行（见第 1 节），对比度等机械检查由人工完成；如需要，可在授权后运行其启动器补测。
4. Axo 角度（南偏东 20°、仰角 35°）是为与平面方向一致而选，若你更偏好标准等轴（45°/35.26°），只需改 `Scene3D.AXO` 一处。
