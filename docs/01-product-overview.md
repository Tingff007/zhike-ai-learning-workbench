# 产品总览设计

## 1. 项目定位

本项目是面向学习场景的 **AI 个性化学习工作台系统**。

它不是传统课程内容展示平台，也不是单纯 AI 聊天工具，更不是只围绕文档问答构建的知识库问答系统，而是围绕 **通用学习对话、课程上下文、Chat / Agent 能力、云端 RAG 课程资料问答、学习路径、学情画像、资源生成、资源沉淀和管理端治理** 形成的智能学习闭环。

系统需要同时支持三类使用场景：

1. **指定课程学习场景**：用户选择某门课程后，系统围绕课程知识库、学习路径、课程画像和课程资源进行问答、生成与推荐。
2. **未指定课程的通用学习场景**：用户不选择课程，也可以像通用 AI 学习助手一样直接提问、规划学习、生成资料和沉淀通用画像。
3. **临时资料 / 临时任务场景**：用户围绕一次对话、一个主题或上传材料进行短期学习，不强制绑定到固定课程。

整体产品形态可以概括为：

> 以 AI 对话为主入口，以课程资料问答作为显式知识库模式，以多层学习画像为个性化依据，以学习路径为课程内学习任务组织方式，以资源大厅为资源沉淀空间，以知识大本营、网关中心、资源审核和运维监控作为管理端支撑。

---

## 2. 核心价值

系统核心价值包括：

* 用户可以在 `/dashboard` 中进行普通学习对话、通用学习规划、课程资料问答、资源生成、智能辅导和资源预览。
* 用户选择课程时，AI 能结合当前课程、章节节点、知识点、课程资料、学习路径和课程画像生成更贴合当前课程的回答与资源。
* 用户不选择课程时，AI 仍可以结合全局画像、历史学习偏好和当前会话意图提供通用学习支持。
* 系统通过自然语言对话、学习行为、测验结果、资源使用记录和用户纠偏持续更新画像。
* 系统通过多智能体协同生成讲义、题库、代码实验、拓展阅读、错题补救卡、PPT 大纲、视频脚本等多模态学习资源。
* 管理端负责课程结构、知识库、模型供应商、资源审核和运行监控，保证 AI 学习体验稳定、可信、可追踪。

---

## 3. 文档拆分说明

项目详细规范不再全部堆叠在 README 中，README 只保留项目总纲和文档索引。详细设计拆分如下：

| 文档 | 内容 |
|---|---|
| `docs/01-product-overview.md` | 项目定位、核心价值、整体闭环、需求对应关系、视觉风格。 |
| `docs/02-route-and-page-design.md` | 用户侧路由、管理端路由、页面功能、WorkspaceLayout 页面模式。 |
| `docs/03-learning-profile-design.md` | 多层动态学习画像、全局画像、课程画像、会话画像、无课程场景、多课程切换、画像更新规则。 |
| `docs/04-ai-orchestration-design.md` | Chat / Agent 与 Cloud RAG 解耦、AiOrchestrator、HybridIntentRouter、Provider Adapter 边界。 |
| `docs/05-resource-generation-design.md` | 多智能体资源生成、ResourceTaskCard、ArtifactCanvas、资源生命周期。 |
| `docs/06-admin-design.md` | 知识大本营、网关中心、资源审核、运维监控、课程建设台、公告发布、界面设置、ChatDoc 配置。 |
| `docs/07-api-data-and-acceptance.md` | API 设计、核心数据模型、验收标准、调用边界速查。 |

---

## 4. 核心业务闭环

```text
用户进入 /dashboard
  ↓
是否选择课程？
  ├─ 是：加载课程上下文、课程画像、课程路径、课程资料状态
  └─ 否：加载全局画像、当前会话画像，进入通用学习模式
  ↓
用户进行普通学习对话 / 学习进度查询 / 课程资料问答 / 资源生成 / 智能辅导
  ↓
AiOrchestrator 通过 HybridIntentRouter 识别意图，再调度 ChatProvider、CloudRagProvider、ResourceAgent 或学习进度快照
  ↓
系统返回回答、引用、资源任务卡片或 ArtifactCanvas 预览
  ↓
用户学习、做题、保存资源、提交审核或复用资源
  ↓
记录学习行为、练习表现、资源使用、对话历史和画像证据
  ↓
更新全局画像、课程画像、会话画像或跨课程画像
  ↓
反向影响下一次 AI 回答、路径规划和资源推荐
```

---

## 5. 与需求能力的对应关系

| 需求能力 | 系统对应设计 |
|---|---|
| 对话式学习画像自主构建 | `/dashboard` 对话舱、`/learning-profile`、多层动态画像、Profile Context Resolver。 |
| 多智能体协同资源生成 | `/dashboard` + ResourceTaskCard + ArtifactCanvas + ResourceAgent + 多角色生成流程。 |
| 个性化学习路径规划 | `/learning-path`，基于课程画像、当前节点、掌握度和学习目标动态规划。 |
| 学习日程编排 | `/calendar`，按日期聚合课程路径节点、复盘安排、资源复习、小测和公告提醒。 |
| 公告与界面配置 | `/announcements`、`/admin/announcements`、`/admin/interface-settings`，覆盖用户通知、管理员公告发布和登录页视觉配置。 |
| 资源推送与复用 | `/resource-hall`，通过后端聚合接口沉淀课程、通用、个人、社区、精选和推荐资源。 |
| 智能辅导 | `/dashboard` AI 对话舱，支持普通学习对话、课程资料问答、图解说明、资源转化。 |
| 学习效果评估 | `/assessment`，记录答题表现、错题归因、掌握度更新和补救建议。 |
| 课程资料问答 | `/dashboard` 显式课程资料问答模式、`/admin/knowledge-base`、`/admin/model-gateway`。 |
| 管理端治理 | 知识大本营、网关中心、资源审核、运维监控；资源审核负责真实队列、统计、详情、动作和日志闭环。 |

---

## 6. 产品主题风格

项目整体视觉风格定义为：

> **浅色极简的 AI 学习工作台风格，辅以科技感数据面板与低饱和蓝色交互强调。**

视觉关键词：

* 轻量化工作台；
* AI 产品感；
* 教育科技感；
* 低干扰界面；
* 浅色背景；
* 蓝色强调；
* 圆角卡片；
* 细边框；
* 少量深色科技面板。

建议色彩：

```text
基础背景：#F8FAFC / #F9FAFB / #FFFFFF
主文字色：#111827 / #1F2937
次级文字：#6B7280 / #9CA3AF
边框线：#E5E7EB / #EEF2F7
主强调色：#2563EB / #3B82F6
深色按钮：#020617 / #111827
科技面板底色：#06111F / #081827
科技光效色：#22D3EE / #38BDF8 / #10B981
```

布局风格：

* 左侧窄图标 Dock；
* 顶部全局状态栏；
* 主区域根据路由切换为 AI 对话、业务画布或管理面板；
* `/dashboard` 支持 standalone 和 split；
* 管理端多使用表格、筛选、状态卡片和配置表单；
* 学情画像允许使用暗色科技感数据面板。

### 6.1 21st.dev / shadcn 组件设计基准

用户侧页面、AI 资源生成页、资源大厅、学习工作台和需要展示项目亮点的页面，可以参考 [21st.dev Community Components](https://21st.dev/community/components) 的组件组织方式；管理端仍以本章后续的 shadcn/ui New York 中性后台风格为准。

这套基准不是引入新的强约束设计系统，而是作为项目后续 UI 组件选型、页面拼装和视觉优化的参考方法：

* **shadcn/ui 打基础**：按钮、输入框、弹窗、Tabs、表格、下拉菜单、侧边栏等基础控件优先沿用 [shadcn/ui](https://ui.shadcn.com/) 思路，组件代码进入项目后应可直接二次修改。
* **21st.dev 找成品模块**：AI 对话、Hero、Dashboard 区块、卡片、CTA、定价 / 功能展示、Shader 背景、资源生成结果面板等展示型模块，可以参考 21st.dev 的社区组件结构和视觉语言。
* **Tailwind + CSS 变量统一主题**：组件样式优先使用 Tailwind 与项目主题变量，颜色、边框、背景、强调态应接入现有 token，避免在业务组件中散落硬编码色值。
* **预览优先、复制可改**：新增组件应能在页面中直接看到完整状态，包括空状态、加载态、错误态、禁用态和交互态；不要只实现静态截图式 UI。
* **现代 SaaS / AI 产品审美**：用户侧亮点页面可以适度使用网格卡片、轻量动效、AI 对话气泡、资源卡、渐进式生成过程和低干扰背景效果，但不能牺牲学习任务的清晰度。
* **组件小而专注**：组件职责应围绕一个清晰场景，不把路由逻辑、请求逻辑、复杂数据转换和大量展示样例混在同一个组件中。
* **可访问性与交互状态完整**：按钮、菜单、输入框、图标按钮和可点击卡片必须有明确 hover、focus、active、disabled 状态；图标按钮需要可访问名称，关键操作不能只依赖颜色表达。
* **免费开源优先**：外部 UI 参考优先选择 [shadcn/ui](https://ui.shadcn.com/)、[21st.dev 社区组件](https://21st.dev/community/components)、[Magic UI](https://magicui.design/docs)、[Origin UI](https://originui.com/)、[ReUI](https://reui.io/)、[Kibo UI](https://www.kibo-ui.com/)、[HyperUI](https://www.hyperui.dev/)、[daisyUI](https://daisyui.com/docs/intro/)、[Flowbite](https://flowbite.com/docs/getting-started/introduction/) 等免费或开源资源；引入 Pro / 商业组件前必须单独确认授权。

在本项目中的推荐组合：

```text
基础组件：https://ui.shadcn.com/
高质量社区组件：https://21st.dev/community/components
AI 产品动效与展示亮点：https://magicui.design/docs
业务表单与应用型组件参考：https://originui.com/ / https://reui.io/ / https://www.kibo-ui.com/
后台普通图表：https://recharts.org/
知识图谱、关系图和复杂可视化：https://echarts.apache.org/examples/zh/index.html
```

管理端后台主题补充定义为：

> **shadcn/ui New York 风格的极简中性后台，使用 Neutral / Zinc 黑白灰色系、低圆角、细边框、轻阴影和高密度数据表格，整体接近 Linear / Vercel / Notion / Stripe Dashboard 这类克制、现代、工程感强的 SaaS 管理台。**

后续 AI 或开发者新增、重构 `/admin/*` 前端页面时，必须优先沿用这套后台风格，不得擅自改成科技蓝大屏、玻璃拟态、渐变营销页、卡片堆叠首页或移动端优先的窄屏布局。管理端应服务高频配置、审核、检索、监控和排障任务，视觉表达以清晰、克制、密集、稳定为先。
