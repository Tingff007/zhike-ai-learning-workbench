# 页面布局规范

本文件是所有前端页面布局的强制基线。新增页面、重构页面、新增模块时必须严格遵循，禁止自行自定义排版样式。遇到边界不确定时优先查阅本文件，不要凭主观实现。

## 1. 设计原则

1. **统一性**：所有页面顶部标题区使用同一种 Page Header 形态，不因页面业务差异自行变更。
2. **主流审美**：遵循现代 SaaS / AI 产品的页面头部设计惯例，纯文字排版优先于容器装饰。
3. **内容优先**：标题区仅服务于"页面在讲什么"的认知建立，不承担操作按钮、面包屑、标签页等额外职责。
4. **中文优先**：所有标题文案使用简体中文，不附加英文标题或英文翻译。

---

## 2. Page Header（页面总标题区）

### 2.1 定义

Page Header 是整页最顶部的总标题区，采用"裸页头 / 无容器标题"形态：

- **位置**：页面内容区的最顶部
- **形态**：不带边框、不带卡片容器、不带背景色块、纯文字排版
- **职责**：仅承载主标题与补充说明文案，不承载操作按钮、标签页、面包屑、筛选器等

### 2.2 结构

Page Header 由以下两部分组成：

| 字段 | 必填 | 内容 | 说明 |
|---|---|---|---|
| Title | 是 | 主标题 | 简体中文，概括页面核心主题，不加英文副标题 |
| Subtitle / Description | 否 | 下方补充说明文案 | 简体中文，说明页面用途、范围或关键提示 |

结构示意：

```text
[主标题]
[补充说明文案（可选）]
```

DOM 骨架示例（仅作结构参考，class 命名以项目实际实现为准）：

```html
<header class="page-header">
  <h1 class="page-header__title">主标题</h1>
  <p class="page-header__subtitle">下方补充说明文案</p>
</header>
```

### 2.3 样式基线

为保持全站统一，Page Header 的视觉参数应遵循以下基线。具体值以项目 `frontend/src/styles/1-settings/variables.css` 中的设计令牌为准；未定义时按基线值实现，并同步补充对应令牌，避免硬编码：

| 参数 | 基线值 | 说明 |
|---|---|---|
| Title 字号 | 22px | 主标题（B 端 CloudBase 风格） |
| Title 字重 | 600 ~ 650 | 半粗 / 粗体 |
| Title 行高 | 1.25 ~ 1.35 | 保证可读性 |
| Title 颜色 | 主文本色 | 引用 `--settings-ink` 或等价令牌 |
| Subtitle 字号 | 13px | 补充说明 |
| Subtitle 颜色 | 次要文本色 | 引用 `--settings-muted` 或等价令牌 |
| Title 与 Subtitle 间距 | 6px | 引用 `--page-header-gap` |
| Page Header 上下内边距 | 16px | 引用 `--page-header-pad-y` |
| Page Header 与下方内容间距 | 20px | 引用 `--page-header-margin-bottom` |
| Page Header 左右对齐 | 与页面内容区左对齐 | 不居中、不缩进；左右内边距 24px（`--page-overlay-pad-x`） |

### 2.4 使用场景

所有用户可见页面（含管理端）的顶部必须使用 Page Header，包括但不限于：

- **用户侧**：AI 学习工作台、学习路径、学习日历、公告中心、资源大厅、学情画像、个人设置等
- **管理端**：知识大本营、网关中心、资源审核、运维监控、课程建设台、公告发布、界面设置等

以下场景不强制使用 Page Header：

- 弹窗、抽屉、模态框内部的标题区（可使用 Card Header 或对话框自带标题）
- 对话流、卡片流等无明确"页面顶部"概念的沉浸式区域
- 第三方嵌入页面

### 2.5 操作层标准变体（Page Header Toolbar）

Page Header 自身只承载主标题与说明文案；标题下方若需要放置操作按钮、Tab 选项卡、筛选器等控件，必须使用 `PageHeaderToolbar` 容器，并从以下 3 种标准变体中选择一种，禁止自创排版。

#### 2.5.1 通用底层规则（所有变体强制执行）

1. **固定两层基础结构**：所有页面的标题区必为「主标题 + 辅助描述」上下排列，主标题统一字号字重颜色，辅助描述统一字号颜色行高，不可省略、不可换顺序。
2. **强制左对齐基线**：Page Header 主标题、辅助描述、PageHeaderToolbar 内所有控件一律左对齐，左侧与页面内容容器左边缘完全对齐，形成统一的视觉起始竖线。
3. **禁止居中排布**：禁止 Tab、操作按钮、筛选控件居中摆放；Tab 数量少时左对齐，数量多时支持横向滚动，永远不居中。
4. **统一视觉参数**（未定义令牌时按基线值实现并同步补充令牌，禁止硬编码）：

| 元素 | 规范要求 |
|---|---|
| 主标题 | 22px / 字重 650 / 一级文本色（`--settings-ink`） |
| 辅助描述 | 13px / 次要文本色（`--settings-muted`）/ 行高 1.5 |
| 主标题 → 辅助描述间距 | 6px |
| Page Header 上下内边距 | 16px（`--page-header-pad-y`） |
| 辅助描述 → 下方操作区（Toolbar）间距 | 16px |
| 整个页头区 → 下方内容区间距 | 20px（`--page-header-margin-bottom`） |
| 左右内边距 | 24px（`--page-overlay-pad-x`），与下方卡片/列表内容区左右边距完全一致 |

5. **Toolbar 与 Page Header 分离**：Toolbar 是独立容器，禁止把操作控件塞进 Page Header 的 `header` 标签内部，避免污染裸页头结构。

#### 2.5.2 变体 1：左对齐操作栏（最常用）

- **样式**：按钮、下拉选择器、标签、筛选控件横向左对齐排列，控件间距统一；主操作靠左，次要统计信息可放在同一行最右侧。
- **适用页面**：学习日历、资源中心、公告中心（"全部已读"按钮区）。
- **结构示意**：

```text
[主标题]
[辅助描述]
[主操作按钮] [筛选下拉] [筛选标签]            [次要统计]
```

- **DOM 骨架示例**：

```html
<header class="page-header">
  <h1 class="page-header__title">主标题</h1>
  <p class="page-header__subtitle">辅助描述</p>
</header>
<div class="page-header-toolbar">
  <div class="toolbar-primary">主操作与筛选控件</div>
  <div class="toolbar-secondary">次要统计（可选）</div>
</div>
```

- **规则**：Toolbar 默认 `justify-content: space-between`，左侧主操作容器 `flex: 1`，右侧次要统计容器收缩；控件间距统一引用设计令牌（默认 12px），禁止每个页面随手调。

#### 2.5.3 变体 2：左对齐 Tab 选项卡栏

- **样式**：Tab 标签横向左对齐，与主标题左边缘对齐，**单独占满整行**；禁止 Tab 与右侧操作按钮挤在同一行导致 Tab 视觉居中。
- **适用页面**：学情画像。
- **整改要点**：原学情画像 Tab 与右侧 3 个操作按钮挤在同一 Toolbar，因 `space-between` 让 Tab 视觉居中，必须改为 Tab 独占一行（左对齐占满），操作按钮下移到次行 Toolbar（按变体 1 排布）。
- **结构示意**：

```text
[主标题]
[辅助描述]
[Tab 1] [Tab 2] [Tab 3] [Tab 4]   ← 占满整行，左对齐
[主操作按钮] [统计] [统计] [统计]  ← 次行 Toolbar，按变体 1
```

- **DOM 骨架示例**：

```html
<header class="page-header">…</header>
<div class="page-header-toolbar page-header-toolbar--tabs">
  <nav class="toolbar-tabs">Tab 选项卡</nav>
</div>
<div class="page-header-toolbar">
  <div class="toolbar-primary">主操作按钮</div>
  <div class="toolbar-secondary">统计信息</div>
</div>
```

- **规则**：`.page-header-toolbar--tabs` 必须覆盖默认 `space-between`，改为 `justify-content: flex-start`，让 Tab 容器占满整行；Tab 数量多时支持横向滚动（`overflow-x: auto`），永远不居中。

#### 2.5.4 变体 3：标题行右侧操作（极简场景）

- **样式**：主标题在左，少量操作按钮/状态在主标题同一行右侧，垂直居中对齐；辅助描述仍在标题下方左对齐。
- **适用场景**：简单页面，描述很短、操作只有 1~2 个按钮。
- **结构示意**：

```text
[主标题]                        [操作按钮 1] [操作按钮 2]
[辅助描述]
```

- **DOM 骨架示例**：

```html
<header class="page-header page-header--with-actions">
  <div class="page-header__heading">
    <h1 class="page-header__title">主标题</h1>
    <div class="page-header__inline-actions">操作按钮</div>
  </div>
  <p class="page-header__subtitle">辅助描述</p>
</header>
```

- **规则**：操作按钮数量上限为 2 个；按钮必须垂直居中于主标题行，禁止与辅助描述同行；本变体不使用 `PageHeaderToolbar`，操作直接挂在 Page Header 内的标题行容器中。

#### 2.5.5 变体选择与组合规则

| 页面 | 主变体 | 备注 |
|---|---|---|
| 公告中心 | 变体 1（"全部已读"按钮区） + 变体 2（筛选 Tab） | 两层 Toolbar 上下排列，间距统一引用令牌 |
| 学情画像 | 变体 2（范围 Tab） + 变体 1（校准/重塑按钮与统计） | Tab 独占首行，按钮与统计下移次行 |
| 资源中心 | 变体 1（搜索 + 类型/难度筛选 + 上传按钮） | 统计卡作为内容区，不放进 Toolbar |
| 学习日历 | 变体 1（课程切换器 + 月份控制） | 主操作左对齐，月份控件靠右 |

- 同一页面允许组合使用变体 1 与变体 2，但必须以上下两层 Toolbar 形式呈现，禁止把 Tab 与操作按钮挤在同一 Toolbar 行。
- 新增页面时，先在本表登记归属变体，再落地代码；变体未覆盖的场景必须先补充本文件条款，禁止自创排版。

### 2.6 禁忌清单

- 禁止为 Page Header 添加边框、卡片容器、背景色块
- 禁止在 Page Header 内塞入操作按钮、标签页、面包屑、筛选器等非标题元素（变体 3 的标题行右侧操作除外）
- 禁止在 Title 或 Subtitle 旁附加英文标题或英文翻译
- 禁止用 Card Header 替代 Page Header 承担页面顶级标题职责
- 禁止为追求视觉差异在不同页面使用不同形态的 Page Header
- 禁止硬编码颜色、字号、间距，必须引用 `1-settings/variables.css` 中的设计令牌
- 禁止 Tab、操作按钮、筛选控件居中排布
- 禁止 Tab 与右侧操作按钮挤在同一 Toolbar 行导致 Tab 视觉居中
- 禁止自创 Toolbar 排版结构，操作层只能从变体 1 / 变体 2 / 变体 3 中选择
- 禁止把统计卡、Hero 容器、装饰背景等非标题元素与 Page Header 包裹在同一个带边框/背景的容器中

### 2.7 Overlay 内容区统一间距基线

学生端 overlay 页面（学习路径、学习日历、资源大厅、学情画像、公告中心、个人设置、练习评估等）通过 `.ai-overlay-content` 承载，其内边距必须全站统一，禁止页面级覆盖，以确保 Page Header 在每个页面都处于相同的顶部偏移与左侧对齐起点。

#### 2.7.1 设计令牌

| 令牌 | 基线值 | 用途 |
|---|---|---|
| `--page-overlay-pad-top` | 16px | overlay 内容区顶部内边距，决定 Page Header 距 overlay 顶边的垂直偏移 |
| `--page-overlay-pad-x` | 24px | overlay 内容区左右内边距，决定 Page Header 与下方内容的左对齐起点 |
| `--page-overlay-pad-bottom` | 20px | overlay 内容区底部内边距 |
| `--page-card-pad` | 20px | 卡片/模块内边距统一基线 |
| `--page-module-gap` | 16px | 同级模块纵向间距基线（复杂页面可放宽至 20px） |

令牌统一定义在 `frontend/src/styles/1-settings/variables.css` 的 `:root` 中，`.ai-overlay-content` 必须引用这些令牌，禁止硬编码。

#### 2.7.2 强制规则

1. **统一引用令牌**：非破窗 overlay 页面的 `.ai-overlay-content` 的 `padding` 必须为 `var(--page-overlay-pad-top) var(--page-overlay-pad-x) var(--page-overlay-pad-bottom)`，禁止硬编码。
2. **破窗页面例外**：采用 `OverlayPageShell` 的页面（第 2.8 节）由 Shell 管理 hero / card 间距，`.ai-overlay-content` 的 `padding` 为 0，不得与第 2.7 节令牌叠加。
3. **Page Header 直接挂载**：非破窗页面中 Page Header 必须作为 overlay 内容区首个可见子元素，禁止再用 `px-*`、`pt-*` 等容器包裹产生二次偏移。
4. **禁止页面级 padding 覆盖**：非破窗页面根容器不得自带 padding 抵消 overlay 间距。
5. **侧栏型页面例外处理**：个人设置等双栏页面中 Page Header 上移到 grid 之上；破窗五页使用 `OverlayPageShell` 统一处理标题区。
6. **响应式行为保留**：移动端断点对 float-dock 的隐藏或转底部栏行为属于既有响应式约定，桌面端侧栏避让必须保持一致。
7. **管理端豁免**：管理端（`.admin-workbench`）保留独立间距体系，不强制套用学生端令牌。

#### 2.7.3 验收要点

- 非破窗 overlay 页面之间切换时，Page Header 主标题首行基线与左对齐线应完全一致。
- 破窗五页切换时，通栏背景顶边距导航栏底边应为 24px，标题左缘与白色卡片内容左缘对齐。
- float-dock 在桌面端与 `.floating-main-canvas` 同属 `.app-viewport-wrapper` flex 子项，等高拉伸；禁止 `position: fixed` 脱离视口 flex 结构。
- 主内容区通过 frame `flex: 1` 横向填满剩余宽度，禁止 frame 左内边距避让侧栏。

### 2.8 破窗页面布局（学生端 Overlay 页面）

学习路径、学习日历、资源大厅、学情画像、公告中心五个学生端 overlay 页面采用「破窗」布局：通栏背景图 + 标题区穿透白色内容卡片顶边；其中学习日历禁止整页滚动、采用日历与侧栏独立滚动，其余页面默认整页统一纵向滚动。

#### 2.8.1 结构示意

```text
[Global Header：主标题 + 副标题 + 课程切换 + 全局操作]  ← 固定粘顶，详见第 2.11 节
[通栏背景图（全宽，纯装饰）]
[轻量化内容卡片：透明底 + 细边框 + 柔和阴影]
  [PageHeaderToolbar / 页面主体内容]
```

DOM 骨架（以 `OverlayPageShell` 为准）：

```html
<div class="overlay-page-shell">
  <div class="overlay-page-hero">
    <div class="overlay-page-hero__backdrop" aria-hidden="true"></div>
  </div>
  <div class="overlay-page-card">…</div>
</div>
```

#### 2.8.2 视觉与滚动规则

1. **通栏背景**：`.overlay-page-hero__backdrop` 占据内容区全宽，默认使用薄荷森林预设图；用户启用外观主题时与工作台背景保持一致（`--overlay-page-hero-bg`）。
2. **标题非粘顶**：主标题与辅助描述位于 `.overlay-page-hero` 内，与背景同属文档流，随 `.ai-overlay-content` 一并上移消失，禁止 `position: sticky` / `fixed` / Portal 脱离滚动流。
3. **破窗层次**：`.overlay-page-card` 通过负向 `margin-top`（`--page-overlay-card-overlap`）上探，与 hero 底部重叠；卡片 `padding-top`（`--page-overlay-card-pad-top`）主动退让。卡片背景透明，仅保留细边框、柔和阴影与圆角，避免与全局背景遮罩形成双层白底。
4. **统一滚动**：`.ai-overlay-content:has(> .overlay-page-shell)` 为唯一纵向滚动容器（`overflow-y: auto`），面板本身（`.ai-overlay-panel--broken-window`）与 hero 均禁止独立滚动；页面内不得再嵌套 `overflow: auto/hidden` 截断整页滚动（复杂工作台内部列滚动除外，须在本任务外单独评估）。
5. **导航间距**：通栏背景顶边与顶部导航栏底边的外边距固定为 `--page-overlay-nav-gap`（24px）。实现时在 hero 上使用 `margin-top: calc(var(--page-overlay-nav-gap) - var(--ai-workspace-frame-gap))`，并令 `.ai-workspace-stage--overlay:has(.overlay-page-shell)` 的 `padding-top` 为 0。
6. **侧栏避让**：侧栏与画布并列于 `.app-viewport-wrapper`（`gap: 0`，无缝紧贴），主内容区通过 flex 占位自动适配侧栏宽度变化，禁止内容与侧栏重叠，禁止 frame 左内边距硬编码避让。

#### 2.8.3 实现约束

1. 五个破窗页面必须使用 `OverlayPageShell` 包裹，`PageHeader` 由 Shell 内部渲染，页面不得再单独挂载裸 `PageHeader`。
2. `WorkspaceLayout` 在破窗画布时为 overlay 面板追加 `ai-overlay-panel--broken-window`，并在 shell 注入 `--overlay-page-hero-bg`（`resolveOverlayPageHeroBackground`）。
3. 破窗页面 `.ai-overlay-content` 的 `padding` 为 0，间距由 Shell 内 hero / card 令牌统一管理；非破窗 overlay 页面仍遵循第 2.7 节。
4. 个人设置全屏覆盖（`.personal-settings-page`）不使用破窗布局，保留第 2.7 节裸页头 + overlay 令牌。
5. 管理端、练习评估等非破窗 overlay 页面不受本节约束。

#### 2.8.4 设计令牌

| 令牌 | 基线值 | 用途 |
|---|---|---|
| `--page-overlay-nav-gap` | 24px | 导航栏底边到通栏背景顶边的目标外边距 |
| `--page-overlay-hero-min-height` | 108px | hero 区域最小高度（B 端适中页头） |
| `--page-overlay-card-overlap` | 32px | 白色卡片负 margin 上探量（破窗深度） |
| `--page-overlay-card-pad-top` | 16px | 卡片顶部内边距，为探出标题退让 |
| `--page-overlay-pad-x` | 24px | hero 标题与 card 内容左右对齐起点 |
| `--page-overlay-pad-bottom` | 20px | card 底部内边距 |
| `--overlay-page-hero-bg` | 运行时注入 | 通栏背景 CSS `background-image` |
| `--ai-workspace-frame-gap` | 10px | frame 内 topbar 与 stage 间距，用于校准 24px 导航间距 |

### 2.9 大屏宽度约束（宽屏适配规范）

#### 2.9.1 设计原则

为解决宽屏下内容无限拉伸、破坏设计比例的问题，遵循现代 Web 应用通用响应式设计原则：
- **背景满宽**：页面背景、通栏 Hero 背景图可铺满容器整个宽度，不受最大宽度限制
- **内容居中限宽**：所有文本内容、卡片、操作区等用户交互内容，设置最大宽度，超宽后两侧留白、内容居中
- **统一对齐基线**：页面顶部状态条、Page Header、内容卡片、底部提示条，左边缘与右边缘必须严格对齐

#### 2.9.2 设计令牌

| 令牌 | 基线值 | 用途 |
|---|---|---|
| `--page-content-max-width` | 1400px | 大屏下内容容器最大宽度，所有主内容区必须引用本令牌 |
| `--scroller-size` | 7px | 自定义滚动条宽度，用于对齐 Portal 渲染的 Header 与滚动容器内卡片 |

令牌统一定义在 `frontend/src/styles/1-settings/variables.css` 的 `:root` 中，禁止硬编码宽度值。

#### 2.9.3 强制规则

1. **所有 overlay 页面根容器**：包括破窗五页（学习路径、日历、资源大厅、学情画像、公告中心）、个人设置、管理员工作台，根容器必须设置：
   ```css
   width: 100%;
   max-width: var(--page-content-max-width);
   margin-left: auto;
   margin-right: auto;
   box-sizing: border-box;
   ```
2. **破窗页面 Hero 背景**：`.overlay-page-hero__backdrop` 保持通栏满宽（占满滚动容器宽度），不受最大宽度限制，实现"背景满宽、内容居中"的视觉层次。
3. **破窗页面 Portal Header 对齐**：由于 Page Header 通过 React Portal 渲染到 `.ai-overlay-header-slot`（滚动容器外），必须给槽位添加 `padding-right: var(--scroller-size)`，预留滚动条宽度，保证 Header 与滚动容器内卡片的父容器宽度完全一致，居中对齐无偏移。
4. **破窗页面内容区**：`.ai-overlay-content` 在破窗模式下 `padding: 0`，左右间距由 Hero Header 和 Card 各自通过 `padding-left/right: var(--page-overlay-pad-x)` 控制，保证对齐。
5. **全局顶部元素**：`.ai-top-status`（AI 状态条）、`.workspace-offline-banner`（离线提示条）必须统一应用相同的最大宽度与居中规则，与页面内容保持对齐。
6. **禁止硬编码宽度**：禁止在页面级样式中硬编码 `max-width: 1200px/1400px/1600px` 等固定值，必须统一引用 `--page-content-max-width` 令牌。

#### 2.9.4 验收要点

- 在 1920px 及以上宽度大屏下，页面内容不会无限拉伸，两侧有自然留白，内容居中。
- 破窗页面的 Page Header 左边缘与下方白色卡片左边缘完全对齐，无横向偏移。
- 通栏背景图铺满整个面板宽度，内容区域限宽居中，层次清晰。
- 不同 overlay 页面之间切换，内容左边缘对齐基线保持一致。

### 2.10 学习路径三栏工作台（B 端密度布局）

学习路径页采用固定侧栏 + 弹性主内容的三栏 flex 布局，仅 PC 网页端适配；左右辅助栏宽度不随屏幕拉伸，仅中间主内容区弹性自适应。

#### 2.10.1 结构示意

```text
[Page Header：主标题 + 副标题 + 右侧指标/筛选]
                    ↓ 20px
[左栏 280px 固定] | [中栏 flex:1] | [右栏 300px 固定]
   多源路线图          任务画像          学习闭环
   （可拖拽 240–360）   （弹性自适应）     （固定宽度）
```

#### 2.10.2 强制规则

1. **布局方式**：三栏必须使用 `display: flex`，栏间距 20px（`--lp-gap`），禁止 grid 百分比列宽导致大屏侧栏被拉伸。
2. **左栏（多源路线图）**：默认固定 280px（`--lp-nav-width`），右侧提供可拖拽分隔条，调节范围 240px–360px；目录单条目高度 52px，信息排布紧凑。
3. **中栏（任务画像）**：`flex: 1 1 auto; min-width: 0`，随屏幕拓宽弹性自适应。
4. **右栏（学习闭环）**：固定 300px（`--lp-actions-width`），不随大屏拉宽。
5. **独立滚动**：三栏各自 `overflow-y: auto`，纵向滚动互不联动。
6. **页面内边距**：左右 24px（`--page-overlay-pad-x`），卡片内边距 20px（`--page-card-pad`），模块纵向间距 16–20px。

#### 2.10.3 设计令牌

| 令牌 | 基线值 | 用途 |
|---|---|---|
| `--lp-gap` | 20px | 三栏间距 |
| `--lp-nav-width` | 280px | 左栏默认宽度 |
| `--lp-nav-width-min` | 240px | 左栏最小宽度 |
| `--lp-nav-width-max` | 360px | 左栏最大宽度 |
| `--lp-actions-width` | 300px | 右栏固定宽度 |
| `--lp-card-pad` | 20px（引用 `--page-card-pad`） | 三栏卡片内边距 |

### 2.11 Global Header（工作台统一顶栏）

#### 2.11.1 定义

Global Header 是工作台内唯一的固定顶栏，**合并**原先独立的浮动 Topbar（课程切换、模式切换、账号）与 Page Header（页面标题 + 副标题），消除「双行顶栏」造成的垂直空间浪费与视觉割裂。

- **位置**：`.floating-main-canvas` 内顶部行，`position: sticky; top: 0; z-index: 50`（与主内容区同属统一浮动画布，禁止与内容区分离成独立浮岛）
- **形态**：嵌入画布的顶栏行（高度固定 48px），无硬分割线，与侧栏 logo 行顶对齐
- **职责**：承载页面身份、课程上下文、页面主操作与全局账号控件

#### 2.11.2 三槽位结构

| 槽位 | 内容 | 说明 |
|---|---|---|
| 左侧 Identity | 主标题 + 副标题（纵向 flex，gap 4px） | 由页面通过 `useRegisterGlobalPageHeader` / `PageHeader` / `OverlayPageShell` 注册 |
| 中间 Context | 课程切换器（`CourseSwitcher variant="header"`） | 单行「当前课程：…」+ chevron，白底细边框 |
| 右侧 Actions | 页面主操作 + 角色切换 + 日历/公告/设置 + 头像 | 主操作通过 `primaryAction` 注册；全局控件由 `GlobalHeader` 内置 |

结构示意：

```text
[主标题          ]     [当前课程：深度学习 ▾]     [+ 上传资源] [用户|管理员] [🔔] [⚙] [头像]
[副标题说明      ]
```

DOM 骨架（class 以 `GlobalHeader` 组件为准）：

```html
<header class="global-header">
  <div class="global-header__inner">
    <div class="global-header__identity">…</div>
    <div class="global-header__context">…</div>
    <div class="global-header__actions">…</div>
  </div>
</header>
```

#### 2.11.3 设计令牌

| 令牌 | 基线值 | 用途 |
|---|---|---|
| `--global-header-height` | 48px | 顶栏固定高度（与 `--sidebar-head-height` 一致，标题与 logo 顶对齐） |
| `--global-header-content-gap` | 0px | 已废弃为顶栏与内容区间隙；Header 与内容合并为 `.floating-main-canvas` |
| `--global-header-bg` | `transparent` | 透明背景，由森林壁纸或内容卡片承载层次 |
| `--global-header-border` | `transparent` | 禁止硬分割线 |
| `--global-header-title-size` | 20px | 主标题字号 |
| `--global-header-subtitle-size` | 12px | 副标题字号 |
| `--global-header-actions-gap` | 16px | 右侧操作区间距 |

令牌统一定义在 `frontend/src/styles/1-settings/variables.css`。

#### 2.11.4 与 Page Header 的关系

1. **工作台内**：Page Header 的 Title / Subtitle **不得**再在页面内容区重复渲染；通过 `GlobalPageHeaderContext` 注册到 Global Header 左侧槽位。
2. **PageHeaderToolbar** 仍在页面内容区原位渲染（搜索、Tab、筛选等），与 Global Header 分离。
3. **变体 3**（标题行右侧操作）改为通过 `primaryAction` 注册到 Global Header 右侧槽位，不再挂在裸 Page Header 内。
4. **破窗页面**（`OverlayPageShell`）：hero 区仅保留装饰背景，标题注册到 Global Header；`.overlay-page-hero` 最小高度缩减为 56px。
5. **个人设置全屏页**：Global Header 隐藏，保留原有沉浸式布局。
6. **管理端**：Global Header 沿用 admin 工作台中性风格覆盖，Page Header 注册机制与普通 overlay 一致。

#### 2.11.5 强制规则

- 禁止在工作台内同时渲染 Global Header 与独立 Page Header 标题行（双行页头）。
- 禁止恢复浮动胶囊 Topbar（`.ai-top-status` 圆角胶囊形态）。
- Global Header 内左右内边距引用 `--page-overlay-pad-x`（24px）；嵌入 `.floating-main-canvas` 时 inner 容器**不限宽**，与画布同宽拉伸。
- 页面切换时标题注册必须在路由组件 `useEffect` 中自动清理，避免残留。

### 2.12 Floating Linear Workbench（视口 + 统一浮动画布）

#### 2.12.1 定义

工作台采用 **Floating Linear Workbench** 范式：森林背景不滚动（`html/body` 锁定 `100vh`），左侧 Dock **贴左/上/下边缘**（`--viewport-padding: 0`），右侧主画布 flex 等高拉伸；侧栏与**非 dashboard 主画布**统一半透毛玻璃，页面内卡片仅保留边框与柔阴影，避免双层底色叠加；`/dashboard` 主画布保持透明沉浸式。

#### 2.12.2 DOM 骨架

```text
.ai-workspace-shell.app-viewport-wrapper
├── .ai-workspace-background-layer（可选壁纸层）
└── .workspace-chrome-unified
    ├── aside.left-sidebar.float-dock（独立玻璃侧栏）
    └── .ai-workspace-frame（flex: 1；无外层顶 padding）
        ├── AnnouncementSurface（如有）
        └── .floating-main-canvas（非 dashboard：与侧栏同玻璃底；dashboard：透明）
            ├── header.global-header.integrated-header（padding-top: 20px）
            ├── .workspace-offline-banner（如有）
            └── .page-content-body.ai-workspace-stage
```

#### 2.12.3 设计令牌

| 令牌 | 基线值 | 用途 |
|---|---|---|
| `--viewport-padding` | 0px | 视口无外侧留白，侧栏贴边 |
| `--viewport-gap` | 0px | 侧栏与主画布间距（无缝紧贴） |
| `--workspace-top-inset` | 20px | 侧栏与主内容区统一顶内边距，标题与 logo 顶对齐 |
| `--sidebar-width-expanded` | 220px | 侧栏展开宽度（图标左对齐 + 菜单文字） |
| `--sidebar-width-collapsed` | 64px | 侧栏收拢宽度（仅图标，整体横向收窄） |
| `--sidebar-width` | 随展开/收拢状态切换 | 当前侧栏占位宽度，主内容区通过 flex 自动适配 |
| `--sidebar-transition-duration` | 0.25s | 侧栏宽度与菜单文字显隐过渡 |
| `--sidebar-top-padding` | 20px | 侧栏顶内边距（同 `--workspace-top-inset`） |
| `--sidebar-head-height` | 48px | 侧栏顶栏固定高度（logo 与收拢按钮同排） |
| `--sidebar-head-control-size` | 32px | logo 与收拢按钮统一尺寸 |
| `--sidebar-item-height` | 40px | 菜单项固定高度（展开/收拢一致） |
| `--sidebar-group-gap` | 16px | 菜单分组间距（禁止分割线） |
| `--sidebar-item-hover-bg` | 浅主题色半透明 | hover 低调底色反馈 |
| `--sidebar-item-active-bg` | 略深主题色半透明 | 选中态底色反馈 |
| `--sidebar-surface-bg` | `rgba(255,255,255,0.72)` | 侧栏半透白底 |
| `--sidebar-surface-blur` | `blur(14px)` | 侧栏毛玻璃 |
| `--sidebar-edge-shadow` | 极柔右侧投影 | 替代硬分割线，与背景自然融合 |
| `--page-inner-surface` | 透明 | 内容卡片不再叠加半透白底（玻璃由主画布承载） |
| `--page-inner-radius` | 14px | overlay 内层卡片圆角 |
| `--page-inner-shadow` | 柔阴影 | 内容卡片阴影 |
| `--global-header-height` | 48px | 集成顶栏固定高度 |

侧栏玻璃质感由 `.left-sidebar.float-dock` 自身承载；非 dashboard 页面 `.floating-main-canvas` 引用 `--sidebar-surface-*` 与侧栏一致；`.workspace-chrome-unified` 禁止再套全局外框或 `.global-glass-panel`。

#### 2.12.4 强制规则

1. `.app-viewport-wrapper` 必须为 `display: flex; gap: 0; padding: 0; width: 100vw; height: 100vh; align-items: stretch; overflow: hidden`。
2. 禁止让 Global Header 与 `.ai-workspace-stage` 作为 `.ai-workspace-frame` 下并列的独立浮岛。
3. `.floating-main-canvas` 必须 `flex: 1; min-width: 0`，**禁止** `max-width` 居中限宽导致右侧背景空白；**非 dashboard** 页面主画布必须引用 `--sidebar-surface-bg` 与 `--sidebar-surface-blur`，与侧栏视觉一致；**dashboard**（`.route-dashboard`）主画布保持透明，禁止玻璃遮罩。
4. overlay 页面内容卡片引用 `--page-inner-*` 令牌（透明底 + 边框/阴影）；`.ai-overlay-panel` 在画布内不得二次套壳（破窗页除外）。
5. 左侧 Dock 与主画布同属视口 flex 行，禁止 `position: fixed` 独立悬浮；**禁止** frame 左内边距避让侧栏。
6. 侧栏顶部 `padding-top: 20px`；顶栏 48px 内 logo 与收拢按钮同排、尺寸不变；菜单分组用 16px 留白区分、禁止分割线；选中/hover 仅用浅主题色底色；收拢时文字隐藏、图标居中、hover 显示 tooltip；侧栏右侧仅用 `--sidebar-edge-shadow` 柔投影，禁止硬边框与分割线。
7. 顶对齐内边距 **禁止** 由 `.ai-workspace-frame` 外层承担；侧栏 `.left-sidebar.float-dock` 与集成顶栏 `.global-header.integrated-header` 各自 `padding-top: var(--workspace-top-inset)`（20px），标题与 logo 顶对齐；无 Global Header 的页面（如个人设置）由 `.floating-main-canvas` 承担同等 `padding-top`。集成顶栏内容区高度 48px，禁止在 header 内塞入统计条或筛选行。
8. 学情画像、公告中心、学习路径、学习日历四页必须共用 `OverlayPageShell` 破窗壳层；`.overlay-page-card` 与 `.overlay-inner-card` 引用 `--page-inner-*`（透明底 + 柔边框/阴影），禁止二次半透/白底填充。

#### 2.12.6 三层背景分层（DIY 壁纸 + 路由类名）

自定义外观激活时，工作台背景按以下三层叠加（仅 PC 端）：

| 层级 | 承载元素 | 非 dashboard | dashboard（`.route-dashboard`） |
|---|---|---|---|
| 底层 | `.ai-workspace-background-layer`（fixed） | 用户 DIY 壁纸/预设色 | 同左 |
| 中层 | `.floating-main-canvas` | `rgba(255,255,255,0.72)` + `blur(14px)`，与侧栏 `--sidebar-surface-*` 完全一致 | **透明**，直接透出底层壁纸 |
| 上层 | 页面内业务卡片 | 透明底 + `--page-inner-border` / `--page-inner-shadow`，禁止二次毛玻璃 | 对话气泡、上下文条、输入框等保留独立 `--sidebar-surface-*` 毛玻璃以保证可读性 |

路由区分：`.ai-workspace-shell` 在 `/dashboard` 追加 `.route-dashboard`；其余业务页不追加。侧栏 `.left-sidebar.float-dock` 始终引用 `--sidebar-surface-*`，与中层主画布参数全局统一。

#### 2.12.5 五页内容区自适应（概要）

| 页面 | 主布局 |
|---|---|
| 学习路径 | `.content-meta-bar` + `.workspace-grid`（280px \| flex:1 \| 300px） |
| 资源大厅 | 4 列 auto-fill 资源卡片网格，横向撑满画布 |
| 学情画像 | Tab + `grid: 1fr 1.5fr 1fr` 三列看板 |
| 学习日历 | KPI 响应式网格 + 日历 \| 35% 双卡片日程侧栏（左右约 65:35，独立滚动）；详见 2.12.7 |
| 公告中心 | `grid: 360px 1fr`（列表 \| 详情） |

#### 2.12.7 学习日历 PC 响应式（仅桌面端）

样式实现：`frontend/src/styles/pages/learning-calendar/learning-calendar.css`。

| 断点 | 统计卡片（`.lc-metrics`） | 主工作区（`.lc-layout__body`） |
|---|---|---|
| ≥1600px | 四栏横排 | 日历 + 35% 日程侧栏横排（约 65:35） |
| 1200–1599px | 2×2 网格 | 日历 + 35% 日程侧栏横排（约 65:35） |
| ≤1199px | 单列堆叠 | 日历与日程侧栏纵向上下排布 |

强制规则：

1. 页面禁止整页纵向滚动：`.learning-calendar-page` 与 overlay 内容区 `overflow: hidden`，顶部工具栏与统计卡片固定在 `.lc-layout__fixed`（`flex-shrink: 0`），日历（`.lc-calendar-scroll`）与侧栏（`.lc-side-panel`）各自独立 `overflow-y: auto`，滚动互不影响。
2. 页面纵向模块间距 20px（`--lc-gap-page`），组件间隙 16px（`--lc-gap-component`）。
3. 业务卡片引用透明底 + `rgba(0,0,0,0.06)` 细边框 + 弱阴影，禁止二次白底与 `backdrop-filter`；文字三级灰度 `#1D2129` / `#6E7681` / `#C9CDD4`。
4. 月历使用 CSS Grid：`grid-template-rows: repeat(7, 1fr)`（星期行 + 6 行日期）固定等高；单元格 `min-height: 0; overflow: hidden`，选中态仅改变内部日期圆样式，不修改容器尺寸。
5. 日程侧栏分为两个独立卡片：**上半「今日执行清单」**（选中日期安排，Checkbox 状态 + 完整标题 + 右侧操作，禁止百分比与独立进度条）与 **下半「近期 7 项任务」**（长期进度追踪，标题右侧胶囊进度标签 + 底部 2px 细进度线）；任务标题禁止省略号截断；无任务时展示占位提示。
6. 事件圆点与任务状态统一复用语义色：预习紫（`todo`）、进行中绿（`active`）、复盘橙（`review`）、完成灰（`done`）；主题色 `#2563eb` 仅用于选中高亮与主按钮。
7. 主按钮（`.lc-btn--primary`）与次要按钮（`.lc-btn--secondary`）视觉层级必须可区分。

---

## 3. Card Header（卡片式标题，预留）

Card Header 用于页面内区块小标题，仅当该区块需要容器包裹时才允许使用。Card Header 的完整定义将在后续补充。

**强制约束**：Card Header 不得替代 Page Header 承担页面顶级标题职责，二者禁止混用、错用。页面顶部永远是 Page Header，页面内分区块才是 Card Header。

---

## 4. 维护规则

1. **先文档后代码**：修改本规范时，先更新本文件，再落地代码。
2. **触碰即修正**：新增或重构页面时，如发现现有实现与本规范不一致，应在本任务内同步修正相邻过期样式，不留中英混杂或形态不一致的局部上下文。
3. **与路由文档互补**：本文件定义"长什么样"，`docs/02-route-and-page-design.md` 定义"放什么内容、走什么路由"，两者配合使用。
4. **与 AGENTS.md 联动**：`AGENTS.md` 的"前端 UI 布局规范"章节是硬性入口，本文件是完整细则，硬性规则冲突时以本文件为准。
5. **令牌同步**：新增 Page Header 相关视觉参数时，必须同步在 `1-settings/variables.css` 中补充对应设计令牌，不得散落在组件内联样式中。
