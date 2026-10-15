# 家校共育系统 · 小程序全局设计系统

> 真源文件：**`miniprogram/app.wxss`**（全项目唯一样式真源）
> 基线来源：管理员端**任务看板**（`pages/admin/tasks`）+ **工作台**（`pages/admin/overview`）+ **登录页**（`pages/login`）确立的现代视觉体系。
> 适用范围：`miniprogram/` 下全部页面与组件。

---

## 一、设计令牌（Design Tokens）

全部令牌定义在 `app.wxss` 的 `page { }` 内，共 **81 个**。页面只允许通过 `var(--token)` 取用，不得再硬编码。

### 1.1 配色

| 分组 | 令牌 | 值 | 用途 |
|---|---|---|---|
| **品牌** | `--primary` | `#0066dc` | 按钮、激活态、链接、进度 |
| | `--primary-deep` | `#0057b8` | 渐变末端 |
| | `--primary-bright` | `#4a94f0` | 渐变起始 |
| | `--primary-dark` | `#004494` | 按压态 |
| | `--primary-light` | `#eaf3ff` | 标签底、提示块底 |
| | `--primary-lighter` | `#edf5ff` | 更浅底 |
| **辅助** | `--teal` / `--teal-light` | `#0f766e` / `#e9f8f0` | 教师端、辅助强调 |
| | `--purple` / `--purple-bright` / `--purple-light` | `#6c5ce7` / `#8a63f2` / `#f3eefe` | AI 洞察、个性化任务 |
| | `--orange` / `--orange-light` / `--orange-deep` | `#ff8f3e` / `#fff3e8` / `#c96a15` | 待办提醒 |
| **语义** | `--success` / `--success-bright` / `--success-light` | `#157a45` / `#15b982` / `#e9f8f0` | 成功 |
| | `--warning` / `--warning-light` | `#8a4b10` / `#fff7e8` | 警告 |
| | `--danger` / `--danger-bright` / `--danger-light` | `#b42318` / `#d04a44` / `#fff1f0` | 危险 |
| **中性** | `--bg` | `#f4f7fb` | 页面底色 |
| | `--card` / `--white` | `#ffffff` | 卡片底 / 纯白（反色文字） |
| | `--fill` / `--fill-gray` / `--fill-dark` | `#f8fbff` / `#eef2f7` / `#f1f5f9` | 输入框底 / 进度槽 / 禁用底 |
| | `--line` / `--line-soft` | `#e1e8f0` / `#eaeef5` | 边框、分割线 |
| **文字** | `--text` | `#1d2129` | 主文字（标题、姓名） |
| | `--text-body` | `#374151` | 正文 |
| | `--text-sub` | `#536174` | 次级 |
| | `--text-muted` | `#86909c` | 弱化说明、时间 |
| | `--text-placeholder` | `#b6c0cd` | 占位符、禁用 |

**收敛说明**：旧主色 `#0057b8` 与现代主色 `#0066dc` 统一收敛到 `--primary`（取现代值）；旧主文字 `#1f2937`/`#111827` 统一到 `--text`；旧弱化灰 `#8795a7` 统一到 `--text-muted`。同色系微调，视觉识别度不变。

### 1.2 字号与字重

字号由 **27 种散值 → 10 级阶梯**：

`--fs-xs` 20 · `--fs-sm` 22 · `--fs-base` 24 · `--fs-md` 26 · `--fs-lg` 28 · `--fs-xl` 30 · `--fs-2xl` 32 · `--fs-3xl` 36 · `--fs-4xl` 40 · `--fs-display` 52

字重：`--fw-normal` 400 · `--fw-medium` 500 · `--fw-semibold` 600 · `--fw-bold` 700
（原散落的 `650` 归一到 `--fw-semibold`）

### 1.3 间距 / 圆角 / 阴影 / 层级

- 间距：`--sp-xs` 8 · `--sp-sm` 12 · `--sp-md` 16 · `--sp-lg` 24 · `--sp-xl` 32
- 圆角（**33 种 → 7 级**）：`--radius-xs` 8 · `-sm` 12 · `-md` 16 · `-lg` 20 · `-xl` 24 · `-2xl` 32 · `-pill` 999
- 阴影（**37 种 → 9 级**）：`--shadow-xs/sm/md/lg` 卡片层级 · `--shadow-primary(-sm)` 主色按钮 · `--shadow-glass` 毛玻璃 · `--shadow-up` 底部固定条 · `--shadow-ai` AI 紫色光晕
- 层级：`--z-nav` 200 · `--z-sheet` 400 · `--z-modal` 1000

### 1.4 渐变（整条值定义，不在 `gradient()` 内嵌 `var`）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--grad-primary` | `135deg #0057b8 → #0f766e` | 品牌主渐变（通知条、头图装饰） |
| `--grad-primary-deep` | `135deg #0066dc → #0057b8` | 深蓝渐变（胶囊选中、录音按钮） |
| `--grad-brand` | `90deg #4a94f0 → #0066dc` | 品牌横渐变（登录按钮） |
| `--grad-hero` | `170deg #6fb8ee → #d9eef8` | **沉浸式弧形头图**（登录页/工作台/任务看板共用） |
| `--grad-progress` | `90deg #0066dc → #15b982` | 进度条 |
| `--grad-ai` | `140deg #4a94f0 → #8a63f2` | AI 洞察 |

> 渐变以「整条 gradient 值」为单位做成令牌，而不是在 `gradient()` 里嵌 `var()`，规避个别旧版 WebView 解析失败导致背景丢失。

---

## 二、基础元素全局类

以下类在 `app.wxss` 中统一定义，**页面内不得重复声明**：

| 元素 | 全局类 |
|---|---|
| 卡片 | `.card` `.card-flat` `.card-title` `.card-title__text/__more` |
| 按钮 | `.btn` + `.btn-primary/outline/teal/gray/danger` `.btn-sm` `.btn-block`；胶囊按钮 `.pill-btn` + `--light/--primary` |
| 表单 | `.field` `.field__label` `.field__input` `.field__textarea` `.field__textarea--sm` `.field__hint` `.ph`；选择器 `.picker-box` `.picker-box__arrow`；可选项 `.option` `.option.active` |
| 标签 | `.tag`（方形）`.badge` + `.badge-primary/teal/orange/warning/danger/success/gray`（胶囊） |
| 列表 | `.list-item` `.list-item__main/__title/__desc` |
| 状态 | `.empty` `.empty__icon/__text/__hint` `.loading-wrap` |
| 弹层 | `.modal-mask` `.modal-sheet` `.modal-head` `.modal-head__title/__close` `.modal-body` `.modal-foot`；轻量弹层 `.sheet-mask` |
| 其它 | `.stat-grid` `.stat` `.segment` `.section-title` `.quote` `.quote-teal` `.footer-bar` `.wo-entry` |
| 文字 | `.title-lg` `.title` `.subtitle` `.text-xs/sm/md/lg` `.text-sub/muted/primary/teal/success/warning/danger` `.text-center` `.bold` `.clamp-1/2/3` |
| 布局 | `.page` `.page-with-nav` `.flex` `.flex-col` `.between` `.center` `.align-center` `.wrap` `.flex-1` |
| 间距 | `.mt-4/8/12/16/24/32` `.mb-8/12/16/24` `.ml-8/12` `.mr-8/12` `.gap-8/12/16/24` |

**修复的遗留缺陷**：`.mt-12` / `.mb-12` / `.mb-8` 此前在 wxml 中被使用但 `app.wxss` 内**根本没有定义**（失效类），现已补齐。

---

## 三、统一前后对比（全项目）

| 指标 | 重构前 | 重构后 |
|---|---|---|
| 设计令牌数 | 12（仅配色，且不成体系） | **81**（配色/字号/字重/间距/圆角/阴影/渐变/层级/动效） |
| 令牌引用 `var()` | 363 处 | **1456 处** |
| 硬编码色值（不含 gradient 内部） | 588 处 | **112 处**（−81%） |
| 字号取值种类 | 27 种 | **10 级**（其余为 44rpx+ 图标/展示级，保留原值） |
| 圆角取值种类 | 33 种 | **7 级** + `50%` 圆形 |
| 阴影种类 | 37 种 | **9 级** |
| 令牌化率 | — | **92.9%** |

---

## 四、主要改动文件清单

### 4.1 真源文件

| 文件 | 改动 |
|---|---|
| **`app.wxss`** | **重写**。建立 81 个设计令牌 + 全套基础元素全局类 + 补齐失效间距类 + 保留顶部页头兼容层 |

### 4.2 去重：删除页面级重复定义

| 文件 | 删除内容 | 说明 |
|---|---|---|
| `pages/admin/accounts/accounts.wxss` | `.modal-*` 7 条、`.field__textarea--sm` | modal 与 overview 逐字节重复；统一到全局 |
| `pages/admin/overview/overview.wxss` | `.modal-*` 7 条、`.field__textarea--sm`（原 160rpx） | 同上；`--sm` 值 160→140rpx 与其它页对齐 |
| `pages/admin/timeline/timeline.wxss` | `.picker-box` `.picker-box__arrow` | 与 publish 页完全相同，统一到全局 |
| `pages/parent/feedback/feedback.wxss` | `.picker-box` | 原 padding/圆角/字号与它页**不一致**（18rpx/12rpx/25rpx），统一到全局标准值 |
| `pages/teacher/publish/publish.wxss` | `.picker-box` `.picker-box__arrow` `.field__textarea--sm` | 统一到全局 |
| `pages/parent/concern`、`teacher/ai/report`、`teacher/requests`、`teacher/overview` | `.field__textarea--sm` | 6 处同名定义统一为全局 `140rpx` |
| `pages/teacher/daily/daily.wxss` | `.sheet-mask` | 统一到全局（`z-index` 改用 `--z-sheet`） |

### 4.3 批量归一化（35 个页面 wxss + nav-bar）

每页把硬编码色值 / 字号 / 圆角 / 阴影 / 字重替换为设计令牌，按改动量排序：

| 文件 | 变更行 | 令牌引用 前→后 | 硬编码色 前→后 |
|---|---:|---:|---:|
| `pages/teacher/daily/daily.wxss` | 320 | 0 → 223 | 146 → 28 |
| `pages/admin/tasks/tasks.wxss` | 98 | 0 → 98 | 50 → 4 |
| `pages/admin/timeline/timeline.wxss` | 79 | 0 → 36 | 18 → 0 |
| `pages/admin/overview/overview.wxss` | 78 | 3 → 72 | 38 → 6 |
| `pages/teacher/ai/ai.wxss` | 49 | 19 → 68 | 30 → 8 |
| `pages/login/login.wxss` | 38 | 0 → 38 | 36 → 20 |
| `pages/parent/timeline/timeline.wxss` | 33 | 0 → 37 | 18 → 1 |
| `pages/teacher/publish/publish.wxss` | 33 | 0 → 9 | 10 → 2 |
| `pages/teacher/requests/requests.wxss` | 33 | 9 → 38 | 7 → 0 |
| `pages/student/home/home.wxss` | 29 | 2 → 31 | 10 → 0 |
| `pages/teacher/suggestion/suggestion.wxss` | 29 | 0 → 29 | 12 → 0 |
| `pages/parent/feedback/feedback.wxss` | 27 | 0 → 18 | 9 → 0 |
| `pages/admin/accounts/accounts.wxss` | 26 | 0 → 16 | 12 → 0 |
| `pages/teacher/overview/overview.wxss` | 26 | 0 → 25 | 10 → 0 |
| `pages/teacher/workbench/workbench.wxss` | 25 | 6 → 31 | 7 → 1 |
| `pages/admin/worries/worries.wxss` | 24 | 16 → 40 | 6 → 1 |
| `pages/student/worry/worry.wxss` | 23 | 15 → 38 | 5 → 0 |
| `pages/teacher/students/students.wxss` | 22 | 0 → 22 | 9 → 0 |
| `pages/parent/notifications/notifications.wxss` | 21 | 0 → 25 | 10 → 0 |
| `pages/parent/task/task.wxss` | 21 | 0 → 55 | 34 → 2 |
| `pages/teacher/submission-detail/*` | 21 | 0 → 25 | 11 → 0 |
| `pages/admin/classes/classes.wxss` | 19 | 16 → 35 | 3 → 0 |
| `pages/mine/mine.wxss` | 18 | 1 → 19 | 6 → 0 |
| `components/nav-bar/index.wxss` | 17 | 0 → 17 | 7 → 0 |
| `pages/admin/concerns/concerns.wxss` | 17 | 12 → 29 | 2 → 0 |
| `pages/teacher/ai/report/report.wxss` | 17 | 0 → 17 | 11 → 0 |
| `pages/parent/home/home.wxss` | 16 | 0 → 16 | 6 → 0 |
| `pages/teacher/submissions/submissions.wxss` | 15 | 0 → 15 | 5 → 0 |
| `pages/parent/concern`、`parent/engagement` | 14 / 13 | 0 → 10 / 0 → 13 | 3 → 0 / 3 → 0 |
| `pages/messages/chat`、`messages` | 10 / 10 | 7 → 25 / 12 → 26 | 10 → 2 / 5 → 2 |
| `pages/parent/questionnaire` | 7 | 0 → 7 | 2 → 0 |
| `pages/parent/children/children.wxss` | 4 | 0 → 4 | 2 → 0 |
| `pages/student/garden/garden.wxss` | 3 | 2 → 5 | 0 → 0 |
| **合计（36 个文件）** | **1921** | **363 → 1456** | **588 → 112** |

---

## 五、保持不变的部分（避免破坏性调整）

本次重构**未改动任何信息架构、路由、业务流程与 JS 逻辑**，具体包括：

1. **页面路由与 `app.json` 配置**：未改动。
2. **wxml 结构与 class 命名**：除删除失效样式外未改动，所有 `bindtap` / 数据绑定原样保留。
3. **业务流程**：`js` 文件全部未改（仅 `tasks.js` 为上一轮任务看板重构的既有成果）。
4. **登录页专属视觉**：`login` 的「天空蓝 → 奶油」背景渐变（`#7cc3ee`/`#a9d9f4`/`#d3ecf6`/`#e6f4e4`/`#f6f3da`）与装饰元素**刻意保留**，作为品牌入口的独特识别，仅共享中性色归一到令牌。
5. **各角色 hero 头图**：`--grad-hero` 保持任务看板 / 工作台 / 时间线一致的浅蓝渐变与弧形裁切。
6. **页面级 BEM 业务样式**：如 `.daily-*` `.draft-*` `.sent-*` `.cl-*` 等页面特有模块样式原样保留，仅将其中的色值/字号/圆角替换为令牌。
7. **顶部页头兼容层**：`app.wxss` 第 13c 节用 `!important` 降级旧渐变头图的兼容代码完整保留，防止旧页面残留样式复现。

---

## 六、开发约定

1. 新增样式**必须**用 `var(--token)`；确需新色值时，先在 `app.wxss` 添加令牌再引用。
2. 新增**基础元素**（按钮/输入框/卡片/弹窗等）一律加在 `app.wxss`，不要写在页面里。
3. 页面 wxss 只写**该页独有的 BEM 模块样式**（如 `.tk-card__stripe`）。
4. 不要删除 `app.wxss` 第 13c 节的页头兼容层。
