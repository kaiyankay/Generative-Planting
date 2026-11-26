# Generative Planting · Phase 01.1 交接报告（Spatial Model Refinement）

- 在线地址：https://kaiyankay.github.io/Generative-Planting/
- 仓库：https://github.com/kaiyankay/Generative-Planting （`main`）
- 本轮起点：`main` @ `5a7062d`；工作分支 `refinement/phase-01-1`；代码与数据最终提交 **`1ea4975`**（已快进合并到 `main` 并部署），其后仅追加本文档类提交
- 测试：模型 23/23；浏览器本地 113/113、**线上 113/113**（原 42 项全部保留未放宽 + 新增 71 项）
- 原始数据未改动：`model.json`、`instances.bin` 的 SHA-256 与 Phase 01 完全相同（测试每次重新校验）

## 1. 六个必须回答的问题（以实际运行证据回答）

1. **能否真实切换参照、空种植草稿、纯地形？** 能。右上角 **State：Reference · Canvas · Terrain** 是独立于视图（World / Plan / Layers）的控件。第一次点 Canvas 会先弹出范围预览（“将清除 1,852 个 placement、14,679 个植物代理，位于 15 个床；保留地形、道路、墙、床框架与编号、现有树、草坪及其他 6 个单元”），确认后才创建空白草稿。测试证明：空白草稿中 B1 的 placement / 代理均为 0，查询返回空，3D 实际渲染数 = 草稿活跃行数；切回 Reference 原设计完整；Terrain 下植物和建筑在 3D 隐藏但对象一个都没删，被隐藏的木栈道仍然阻止种植；切换过程中地形网格是同一个对象（场地未重载）。截图 04、08、12。
2. **能否点爆炸层进入独立 2D 查看并返回？** 能。Layers 视图把模型拉开成 6 块实体层板（Terrain / Infrastructure / Site Vegetation / Planting Framework / Planting Composition / Plant Representation），Analysis 作为“仅平面”入口。测试用真实指针事件点击 3D 层板：点 Composition 板→聚焦、其他层变淡；点 Infrastructure→焦点移动；**Open in Plan**→独立正投影平面、面包屑 Garden / Layers / Infrastructure、专属图例与来源、只能选中该层对象；可叠加其他层作参照（透明度滑块，参照层不可选、不改锁定）；Back 回到 Layers 的同一相机，Esc 回到 World 原相机（误差 0）。截图 03、03b、05–07f、11。
3. **一次真实配置修改是否在两个视图、实例、查询、导出中一致？** 是。从数据中自动选出 B1 最大的非 matrix group（`pl.B1.g27`，*Monarda bradburiana*，6 个代理）替换为 *Achillea* ‘Moonshine’：同一批代理 id 的物种改变；B1 模型计数 Monarda 14→8；**3D 实际渲染计数**同步 ±6；该代理的 3D 形态 whorl→umbel、颜色改变；**平面画布像素颜色**改变；点查询 / 物种查询 / Inspector / 导出全部显示新物种。删除、添加（新代理可被点选并渲染）、越界添加被拒、批量中一条非法即整体回滚（含 `__proto__` 路径）、导出→导入指纹一致、Reset 后与参照逐行一致。截图 09a–09d（同镜头前后）。
4. **图纸与模型是否统一视觉语言？** 是。以 UBC SALA *Landscape as Laboratory* 为主参考（只学原则，未下载或复制任何图）：暖白纸面、淡化周边、鼠尾草绿/赭黄/蓝灰、细墨线、“实心核 + 半透明冠幅”的植物符号。同一套 token 与物种低饱和色同时用于平面、3D 地面纹理、层板和 3D 植物。先在真实模型上做了三种同镜头小样（纯线稿 / 线稿+低饱和插画 / 轻绘本），选定第二种，只保留一套主题。见 `PHASE_01_1_ART_DIRECTION.md`、截图 05-style-test。
5. **哪些数据真实、示意或未知？** 真实（documented）：床轮廓、道路、墙、水体、建筑（OSM）；床编号与风格（2019/2020 图纸）；各风格物种与图例角色；3DEP 1 m 地形。重建（reconstructed）：29 棵现有树冠（NAIP 目测，物种/高度未知）。示意（schematic）：床内斑块形状、植物与符号位置、草甸轮廓、Bird Border 走向。未知（unknown）：每床真实物种位置与数量、三角床配置、日照、土壤湿度、pH（返回 null + unknown，不画假图层）。另：2026 名录中 10 个品种与 2019 图纸不同，现标为“可能替换/版本差异”，不再当作同义名。详见 `PHASE_01_1_ACCURACY.md`。
6. **实际线上地址与 commit？** https://kaiyankay.github.io/Generative-Planting/ ，`main` @ `1ea4975`（推送后约 40 秒上线）；对线上页面运行完整测试 113/113，并在浏览器中实际打开线上页、完成 B1 替换→计数/3D 渲染同步→Reset 的流程。

## 2. 十项任务逐条状态

| # | 任务 | 状态 | 说明 |
|---|---|---|---|
| 01 | Site 与 Planting Design 分离 | **pass** | 场地 / 床框架 / 参照设计 / 工作设计 / 视图状态五个概念；参照冻结；工作设计有自己的 placement、实例表和空间索引；草稿按浏览器保存（可复现的操作列表）；隐藏 ≠ 删除 ≠ 保留均有测试。 |
| 02 | 原始设计精度与版本边界 | **partial（按授权边界停在书面比较）** | 私有 2019/2020 图纸清晰、1:100、带比例尺，技术上可配准描摹；但描摹会生成受版权保护图纸的衍生物，授权无法确认，因此未描摹。完成 A1/B1/C1 书面对照、15 床证据表、同义名与替换区分。 |
| 03 | 真实空间编辑闭环 | **pass** | replace / remove / add / set / reset / export / import / dryRun / 编辑锁；校验后原子提交；实例重建只影响被修改 placement；参照实例永不写入。 |
| 04 | 空间查询与约束 | **pass** | 精确相交（多边形、孔洞、多面、线、多线、点+半径、边界接触算相交，1 mm 容差）；bbox 候选显式标记；半径索引正确；条件采样带定义、单位、来源；路径集合来自 `case.json`；可种植 / 隐藏 / 锁定三者独立。 |
| 05 | Art Direction | **pass** | 三张同镜头小样 + 选择理由；统一 token；状态用线型+文字而非只靠颜色。 |
| 06 | 2D 图形系统 | **pass** | 按 7 组图层分绘制器；缩放分级显露；A 块 / B 基质 + 组团 / C 组团 + 个体 / 球根独立点纹；编号去重叠；图例随层/缩放变化；比例尺、指北针。 |
| 07 | 3D 图形系统 | **pass（视觉可继续细化）** | 低饱和共享色、Neutral 色调映射、柔和阴影、建筑细墨线、土壤剖面边、柔和树冠；整园 hero；爆炸图关闭投影；地形 ×1.6 明示，可切换真实比例（`?vex=1` 或状态栏按钮）。 |
| 08 | Layer Navigation | **pass** | 6 实体层板 + Analysis 平面入口；点选聚焦、Open in Plan（按钮 / Enter / 双击）、参照叠加、面包屑、Back、Fit；层状态与相机恢复。 |
| 09 | Interface | **pass** | 左上产品名与案例；中间 World / Plan / Layers；右上 State（不同样式）；选中才出 Inspector；图例按需；默认模型占屏 ≥ 80%（测试）；手机布局检查。 |
| 10 | QA、版本、部署 | **pass** | 测试、截图、性能、体积见 `PHASE_01_1_QA.md`；部署与线上验证见 §8。 |

## 3. 可点击操作步骤（约 5 分钟）

1. 打开在线地址，默认 **World · Reference**：整座花园的微缩模型。状态栏写着 *Schematic reconstruction · not a survey*。
2. 点 **Layers**：模型拉开成六层。点 *Planting Composition* 层板（或右侧标签）→ 其他层变淡，左下出现说明卡 → 点 **Open in Plan**。
3. 在独立平面中：左侧图例显示角色符号与“视野内物种”；勾选 *Terrain* 或 *Framework* 作参照叠加、拖动透明度；点任意斑块看属性。点 **Back** 回到层叠，再按 `Esc` 回到 World。
4. 点右上 **Canvas**：先看对话框里的清除范围 → **Start design**。15 个床变成待种植的空床（斜线），雨水花园、草甸、树木、道路都在。状态栏可 Reset / Export / New。
5. 点 **Terrain**：只剩地形（高程色带、阴影、0.25 m 插值等高线、可选床轮廓）。再点 **Reference** 回到原设计。
6. 验证编辑闭环（开发入口）：浏览器控制台运行

```js
GP.createDraft({ from: 'reference' })
const g = GP._store.model.placements.filter(p => p.bedId === 'bed.B1' && p.role === 'group' && p.speciesIds.length === 1).sort((a, b) => b.areaM2 - a.areaM2)[0]
GP.speciesTally({ bedId: 'bed.B1' })[g.speciesIds[0]]
GP.applyPatch([{ op: 'replaceSpecies', target: g.id, speciesIds: ['sp.achillea-moonshine'] }])
GP.speciesTally({ bedId: 'bed.B1' })['sp.achillea-moonshine']
GP._scene.renderedSpeciesCounts()['sp.achillea-moonshine']   // 3D 实际渲染数
GP.select(g.id)                                                  // Plan 与 World 中同时高亮
GP.resetDraft()
```

   或打开 `?dev=1&mode=canvas`，在 Canvas 中选中一个斑块，Inspector 底部有“Developer test · patch API”（替换 / 删除）。这是测试入口，不是常驻工具栏。

## 4. 真实数据 / 假设 / 未知

- **真实**：OSM 几何（ODbL）、USGS NAIP / 3DEP（公有领域）、图纸中的床编号、风格、物种与图例角色、2023 官方统计（按风格）。
- **假设**：现有树默认保留（不是“受保护”的证明）；墙高显示 0.45 m（未公布）；植物代理比例 ≈0.42/多年生、0.12/球根、1/木本；3D 植物形态是按形态类的推断，不是物种精确形态。
- **未知**：床内真实位置与数量、三角床物种配置、草甸内部排布、日照 / 湿度 / pH、物候。
- 时间层：2019 设计 → 2020 球根 → 2023 统计 → 2026 名录 → 2026 OSM，分别记录，不混用。

## 5. 截图索引（`docs/screenshots/phase-01-1/`，1440×900，真实模型）

| 文件 | 内容 |
|---|---|
| 01-hero-reference | World · Reference，整园 |
| 02-plan-reference | Plan · Reference |
| 03-layer-overview / 03b-layer-focus | Layers 层叠 / 聚焦 Composition |
| 04-terrain-only / 04b-terrain-plan | Terrain（3D / 平面，含图例） |
| 05-infrastructure / 06-framework | 独立层：基础设施 / 床框架与编号 |
| 07a/b/c-composition-A/B/C | 独立 Composition：A1 / B1 / C3 |
| 07d-site-vegetation / 07e-representation / 07f-analysis | 现有植被 / 植物个体代理 / 分析（坡度，日照等标 no data） |
| 05-style-test | 三种风格同镜头小样 |
| 08-planting-canvas / 08b-planting-canvas-plan | 空白种植草稿（3D / 平面） |
| 09a/09b | 替换前后 · 平面同镜头 |
| 09c/09d | 替换前后 · 3D 同镜头 |
| 10-closeup | 近景植物形态 |
| 11-overlay | 独立 Composition + Terrain / Infrastructure 参照叠加 |
| 12-restored-reference | 有草稿后返回 Reference |
| 13-plan-b1 / 14-3d-b1 | B1 平面 / 3D（与 before 同镜头） |
| `before/` | Phase 01 代码、同镜头：01-hero、02-plan、03-layers、04-terrain、09-b1-plan、09-b1-3d、10-closeup |

## 6. 剩余限制与需要 Kay 决定的事

1. **原图精细层（02）**：是否取得 Oudolf / OGD 授权以本机描摹 A1/B1/C1？若获准，路线已写在 `PHASE_01_1_ACCURACY.md`（QGIS 配准、残差记录、仅本机）。
2. **A 床“块”的形状**：图纸是沿床长轴的近似矩形格，模型是 Voronoi 不规则多边形。改生成器会改变 `model.json`/`instances.bin`（需新版本号和迁移），本轮按“不改 ID、不改基线”未做。
3. **2026 名录替换品种**：10 个品种是否视为替换（新物种记录）还是保留 2019 名称，由你决定。
4. **3D 质感**：已统一，但近景植物仍是形态类代理；草坪在 SwiftShader 截图中略偏黄绿（GPU 浏览器更灰绿）。
5. **性能**：本机 Iris 650，World DPR1.5 ≈ 24 fps、Layers ≈ 37 fps、编辑后 3D 重建 ≈ 0.19 s；平面全范围重绘 ≈ 45 ms。
6. **测试时长**：本机另有 Chrome 渲染进程长期占用 ~70% CPU，无头浏览器测试约 10–14 分钟；线束超时已放宽，断言未改。
7. 不做（按要求）：AI / LLM、知识图谱、自动生成设计、生态评分、物候 / 生长模拟、新案例、重画地形或道路。

## 7. 文件

`docs/PHASE_01_1_PLAN.md`（计划）· `PHASE_01_1_STATUS.md`（进度）· `PHASE_01_1_QA.md`（测试、截图、性能、体积）· `PHASE_01_1_ACCURACY.md`（02）· `PHASE_01_1_ART_DIRECTION.md`（05）· `MODEL_CONTRACT.md`（场景、查询与补丁 API）· `SOURCE_REGISTER.md` · `SLIDES_TO_MODEL.md` · `README.md`。课堂 slides、Oudolf 原图、SALA 原图均未进入仓库（`private-inputs/` 被 git 忽略）。

## 8. 部署与线上验证

| 项 | 结果 |
|---|---|
| 合并 | `refinement/phase-01-1` 快进合并到 `main`（无 force push；origin/main 期间无他人更新） |
| 部署提交 | `1ea4975`（GitHub Pages，main / root，legacy build；推送后约 40 s 新文件可访问） |
| 线上自动测试 | `python3 -I tools/run_browser_tests.py --url https://kaiyankay.github.io/Generative-Planting/tests.html` → **113/113**，应用加载 544 ms，总时长 469 s（`docs/qa/browser_tests_live.json`） |
| 线上人工检查 | 浏览器面板打开线上页：Layers 层叠正常、无控制台错误、API 0.4；控制台执行 B1 替换：Monarda 14→8、Achillea 0→6、3D 渲染 105→111、旧图例码清除并记录 `replaced`、Reset 后实例指纹与参照一致 |
| 回滚 | 上一可用版本 `5a7062d`（Phase 01）；如需回退：`git revert` 合并范围后推送，不需要 force |
