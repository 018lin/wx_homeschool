# 家校共育系统 · Web 前端页面结构分析（为小程序重写做准备）

> 分析对象：`家校共育系统/` 下的原生 HTML + CSS + JS（无框架），后端为 `server.js`（Node 原生 HTTP + SQLite）。
> 分析方式：逐个 HTML 读取 DOM 结构 + 内联脚本，配合 `js/*.js` 与 `Grep` 抓取全部 `/api/**` 调用。
> 本文只做研究分析，不含业务代码。

---

## 目录

1. [总体结论速览](#1-总体结论速览)
2. [全局机制（小程序需重写的底座）](#2-全局机制小程序需重写的底座)
3. [页面清单总表](#3-页面清单总表)
4. [逐页详细分析](#4-逐页详细分析)
5. [四端导航结构](#5-四端导航结构)
6. [API 调用矩阵](#6-api-调用矩阵)
7. [小程序重写要点与风险提示](#7-小程序重写要点与风险提示)

---

## 1. 总体结论速览

### 1.1 核心在用页面（15 个）

| 端 | 页面 |
| --- | --- |
| 公共 | `index.html`（登录）、`questionnaire.html`（首登问卷） |
| 家长端 | `home.html`、`timeline.html`、`feedback.html`、`parent-concern.html` |
| 教师端 | `teacher.html`、`teacher-ai.html`、`teacher-class-overview.html`、`teacher-publish.html`、`teacher-submissions.html`、`teacher-students.html` |
| 管理员端 | `admin.html`、`admin-tasks.html`、`admin-timeline.html` |
| 学生端 | `student.html` |

### 1.2 废弃 / 占位 / 孤儿页面（7 个）

| 页面 | 判定 | 依据 |
| --- | --- | --- |
| `register.html` | **废弃占位** | 全静态，只有一句"家长账号暂不开放自助注册"+ 返回登录按钮；无任何 API；全站无任何入口链接 |
| `ai-analysis.html` | **孤儿静态页** | 纯静态说明文案（"成长档案持续沉淀中"），无 API、无脚本；全站无任何入口链接（只有它自己返回 home.html） |
| `ai-class-overview.html` | **纯重定向壳** | 只有 `<meta refresh>` + `location.replace("teacher-class-overview.html")`，无内容 |
| `admin-accounts.html` | **纯重定向壳** | 同上，重定向到 `admin.html` |
| `task-detail.html` | **孤儿重复页** | 功能与 `home.html` 的"任务卡 + 提交区"**完全重复**（同样的 `/api/home` + `/api/submissions`、同样的 5 种提交类型）；全站无任何链接指向它，已彻底被 home.html 取代 |
| `parent-engagement.html` | **孤儿页（有真实 API）** | 接了 3 个真实接口（engagement / engagement-feedback / engagement-preference），但**全站没有任何导航或按钮链入**，只能手动输 URL 访问。需要产品决策：是否保留成"我的关注记录"入口 |
| `learning-garden.html` | **占位页** | 学生端导航里的第二个 tab，内容只有"内容正在准备中"，除 logout 外无 API |

### 1.3 死代码（JS 层）

| 文件 | 判定 |
| --- | --- |
| `js/admin.js` | **完全未被引用**。它渲染 `teacherCount / studentCount / parentCount / teacherList / studentList / updatedAt` 这些 DOM id，但**任何 HTML 都不存在这些元素**，也没有任何 HTML `<script src="js/admin.js">`。它对应的"管理员概览页"已被 `admin.html`（账号管理）取代 |
| `js/teacher-page.js` 中 `renderReport()` 的非 AI 分支 | **不可达**。1105 行文件中 `var isAiPage = document.body.classList.contains("teacher-ai-page")`；全站只有 `teacher-ai.html` 引入该脚本且 body 带 `teacher-ai-page` class，因此 `isAiPage` 恒为 `true`，`statHtml`（关键指标卡）、`renderDataBoard()`、`renderAiActionHub()` 等"数据档案"分支是历史遗留死代码 |
| `css/parent-home.css`、`css/refined-ui.css`、`css/teacher-ai.css` 等 | 部分样式与页面内联 `<style>` 重叠；`refined-ui.css` 被几乎所有页面引用，但实际大量效果由各页内联 CSS 覆盖 |

### 1.4 已知不一致（重写时不要照搬）

1. **教师端导航文案错位**：5 个教师页的导航第一项都写"全局报告"且指向 `teacher.html`，但 `teacher.html` 实际是"今日记录/今日校园观察"（用 `js/teacher-daily.js`）。真正的"全局报告"页已不存在。
2. **`admin-tasks.html` 的导航是硬编码的**，但 `admin-tasks.js` 又调用 `setupWorkspaceNavigation("admin","tasks")` 覆盖了它 → 硬编码那份是冗余的，运行时会被替换为 5 项。
3. **`admin.html` 标题叫"账号管理"**，脚本是 `js/admin-accounts.js`（不是 `admin.js`），它是管理员**默认落地页**（`login.js` 中 admin 角色跳转目标）。
4. **同一个"学生档案"页 (`teacher-students.html`) 教师和管理员共用**，靠 `setupWorkspaceNavigation(role, "students")` 切换导航、靠 `body.admin-view` 隐藏"发布任务给该学生"区块。

---

## 2. 全局机制（小程序需重写的底座）

### 2.1 `js/api.js` —— 统一请求层（**所有页面都先引它**）

- `window.API_BASE`：localhost 时为 `""`（同源），线上写死 `https://home-school-04zi.onrender.com`。
- `api(path, options)`：自动加 `Authorization: Bearer <token>`、自动 JSON 序列化/反序列化、20s 超时（可传 `timeoutMs` 覆盖，最长用到 60s）。
- **401 自动处理**：清 `localStorage.auth` 并 `window.location.href = "index.html"`。
- `getAuth()` / `requireAuth()`：登录态存在 `localStorage.auth`，结构 `{ token, user: { id, account, displayName, role } }`。
- `getSelectedChildId()` / `setSelectedChildId(id)`：**家长端跨页共享的"当前选中孩子"**，存 `localStorage.selectedChildId`。这是家长端 4 个页面的核心全局状态。
- `setupWorkspaceNavigation(role, active)`：**只有 role==="admin" 才生效**，把 `.brand` 改成"管理员工作台"并把 `.teacher-nav` 的 innerHTML 替换为 5 项（账号管理 / 已发布任务 / 成长时间线 / AI 洞察 / 学生档案）。
- `trackEvent(type, payload)` → `POST /api/events`，**失败静默吞掉**。
- **页面停留埋点（P1-4）**：脚本末尾 IIFE，对已登录用户，在 `visibilitychange`(hidden) 和 `pagehide` 时上报 `page_dwell`（停留 < 3s 过滤）。
- `esc(str)`：XSS 转义工具，全站拼 HTML 时用。

> **小程序对应物**：`wx.request` 封装 + `wx.setStorageSync('auth')` / `'selectedChildId'`；401 改为 `wx.redirectTo` 登录页；`page_dwell` 对应 `onUnload` / `onHide`。

### 2.2 角色分流（登录成功后）

`js/login.js` 依据 `data.user.role` 跳转：

| role | 落地页 |
| --- | --- |
| `teacher` | `teacher.html` |
| `admin` | `admin.html` |
| `student` | `student.html` |
| 其他（parent） | `home.html` |

登录时还会清理 `teacherAiReport_*` / `teacherAiChat_*` 的历史缓存（key 形如 `teacherAi{Report|Chat}_v{1,2,3}_{account}`）。

### 2.3 反向守卫（各页自我保护）

| 页面 | 守卫逻辑 |
| --- | --- |
| `home.html` | `role === "teacher"` → 踢到 `teacher.html` |
| `feedback.html` / `timeline.html` | 同上 |
| `teacher.html` | `role !== "teacher"` → 踢到 `home.html` |
| `teacher-publish.html` / `teacher-submissions.html` / `teacher-class-overview.html` / `teacher-ai.html`（隐式） | `role !== "teacher"` → 踢到 `home.html` |
| `teacher-students.html` | `role` 不是 `teacher` 也不是 `admin` → 踢到 `home.html` |
| `admin.html` / `admin-tasks.html` / `admin-timeline.html` | `role !== "admin"` → `teacher` 踢 `teacher.html`，否则踢 `home.html` |
| `student.html` | `role !== "student"` → 踢到 `home.html` |

### 2.4 首登问卷劫持

`/api/home` 返回 `needQuestionnaire: true` 时，`home.html` / `feedback.html` / `timeline.html` / `parent-concern.html` 会**立刻 `window.location.href = "questionnaire.html"`**。
`selectedChildInvalid: true` 时清掉 `selectedChildId`。

### 2.5 全站通用 UI 模式（小程序组件化的切分点）

- **顶栏 `.topbar`**：brand（logo+名称）+ 横向 nav + 用户区（家长端多一个"孩子切换下拉 `.child-switcher`"）+ 退出登录按钮。
- **卡片 `.card`**：白底圆角 + 细边 + 阴影，全站一致。
- **弹窗**：3 种实现 —— `home.html` 用 `.modal-mask.show`；`admin.html` 用 `hidden` 属性；`teacher-submissions.html` / `teacher-publish.html` 用 `.detail-backdrop.is-open` + `body.modal-open`。**重写时建议统一成一个 modal 组件**。
- **移动端适配**：全部靠 `@media (max-width: 900px/640px)`，例如表格在窄屏隐藏、改渲染"移动卡片列表"（`teacher-class-overview.html` 的 `.mobile-card-list`）。小程序天然小屏，这些分支可直接砍掉。

---

## 3. 页面清单总表

| # | 页面 | 端 | 用途一句话 | 主要 API | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | `index.html` | 公共 | 登录 | `POST /api/auth/login` | ✅ 核心 |
| 2 | `questionnaire.html` | 家长 | 首次登录孩子情况问卷 | `POST /api/questionnaire` | ✅ 核心 |
| 3 | `home.html` | 家长 | 本周任务 + 提交主页面 | `/api/home`、`/api/submissions`、`/api/children`、通知 3 个 | ✅ 核心 |
| 4 | `timeline.html` | 家长 | 孩子成长时间线 | `/api/timeline`、`/api/home` | ✅ 核心 |
| 5 | `feedback.html` | 家长 | 教师反馈列表 | `/api/timeline`、`/api/home` | ✅ 核心 |
| 6 | `parent-concern.html` | 家长 | 提交"成长关注"→ 老师审核生成定制任务 | `/api/parent/task-requests`(GET/POST)、`/api/home` | ✅ 核心 |
| 7 | `parent-engagement.html` | 家长 | 家长关注度分析 + 反馈校准 | engagement 3 个 | ⚠️ 孤儿但有真实数据 |
| 8 | `task-detail.html` | 家长 | 任务详情+提交（与 home 重复） | `/api/home`、`/api/submissions` | ❌ 废弃孤儿 |
| 9 | `student.html` | 学生 | 学生端任务提交 | `/api/student/home`、`/api/submissions` | ✅ 核心 |
| 10 | `learning-garden.html` | 学生 | 学习园地占位 | （仅 logout） | ❌ 占位 |
| 11 | `teacher.html` | 教师 | 今日校园观察（语音/文字录入 + AI 整理通知家长） | `/api/teacher/daily-updates`(GET/POST) | ✅ 核心 |
| 12 | `teacher-ai.html` | 教师 | AI 洞察 + AI 助手对话（SSE 流式） | `/api/teacher/global-report?local=1 / ?ai=1`、`/api/teacher/ai-chat?stream=1`、`/api/teacher/notifications` | ✅ 核心 |
| 13 | `teacher-class-overview.html` | 教师 | 班级概览（指标 + 分布 + 洞察 + 未交名单） | `/api/teacher/ai-overview` | ✅ 核心 |
| 14 | `teacher-publish.html` | 教师 | 发布任务（模板）+ 审核家长定制任务请求 | `/api/teacher/tasks`、`/api/teacher/parent-task-requests`(+review) | ✅ 核心 |
| 15 | `teacher-submissions.html` | 教师 | 学生提交批阅（含 AI 生成评价草稿） | `/api/teacher/overview`、`/api/teacher/submissions/{id}`、`ai-feedback`、`/api/teacher/feedback` | ✅ 核心 |
| 16 | `teacher-students.html` | 教师/管理员 | 学生档案表 + 个性化任务建议 + 定向发布 | `/api/teacher/students`、`global-report?local=1`、`student-suggestions`、`/api/teacher/tasks` | ✅ 核心（共用） |
| 17 | `admin.html` | 管理员 | 账号管理（增删改查 + 筛选 + 编辑弹窗） | `/api/admin/accounts`(GET/POST/PUT) | ✅ 核心 |
| 18 | `admin-tasks.html` | 管理员 | 已发布任务完成进度看板 | `/api/admin/tasks?limit=100` | ✅ 核心 |
| 19 | `admin-timeline.html` | 管理员 | 全站成长时间线看板（含趋势图） | `/api/admin/growth-timeline?limit=500` | ✅ 核心 |
| 20 | `register.html` | 公共 | "不开放注册"说明 | 无 | ❌ 废弃 |
| 21 | `ai-analysis.html` | 家长(?) | 成长档案说明静态文案 | 无 | ❌ 孤儿 |
| 22 | `ai-class-overview.html` | — | 重定向壳 → teacher-class-overview | 无 | ❌ 重定向 |
| 23 | `admin-accounts.html` | — | 重定向壳 → admin | 无 | ❌ 重定向 |

---

## 4. 逐页详细分析

---

### 4.1 `index.html` — 登录页

**用途**：全站唯一入口，所有角色共用。账号由管理员统一创建（不开放自助注册）。
**脚本**：`js/api.js` + `js/login.js`。**样式**：`css/style.css` + `css/refined-ui.css`。

**UI 区块（从上到下）**

| 区块 | 内容 |
| --- | --- |
| `.login-visual-logo` | 装饰性大图 `assets/black.png` |
| `.login-card` | 卡片主体 |
| ↳ `.logo` + `<h1>` | 品牌 "凌田家校" |
| ↳ `#loginForm` | 表单 |
| ↳ `.field` 账号 | `#account`（maxlength 30）+ `#accountError` |
| ↳ `.field` 密码 | `#password`（maxlength 64）+ `#togglePwd` 明文切换按钮 + `#passwordError` |
| ↳ `#submitBtn` | "登 录" |
| ↳ `.register-link` | "家长账号由管理员统一创建，请联系学校管理员" |
| ↳ `.footer-note` | 用户协议/隐私政策声明 |

**调用 API**：`POST /api/auth/login`（`js/login.js:38`，注意**不走 `api()`，直接 `fetch`**，因为此时无 token）。
请求体 `{ account, password }`；响应 `{ token, user: { id, account, displayName, role } }`。

**交互行为**
1. 客户端校验：账号 ≥ 3 字符、密码 ≥ 6 位，错误显示在字段下方 `.error-msg` 并加 `.is-invalid`。
2. 提交中：`#submitBtn` disabled + 文案"登录中…"。
3. 成功：写 `localStorage.auth`，清理 `teacherAiReport_*_v{1,2,3}_{account}`、`teacherAiChat_*_v{1,2,3}_{account}` 缓存，然后**按 role 跳页**（见 2.2）。
4. 失败：密码框下方显示 `data.message || "账号或密码错误"`，恢复按钮。
5. 网络异常：若 `location.protocol === "file:"` 提示"请通过 http://localhost:3123 访问"，否则"网络异常，请稍后再试"。
6. `#togglePwd`：切换 `password` / `text`。
7. 输入时实时清除该字段错误提示。

**是否废弃**：否，核心页。

---

### 4.2 `questionnaire.html` — 孩子情况小问卷（首登必填）

**用途**：家长首次登录后被 `/api/home` 的 `needQuestionnaire` 强制跳转过来。收集孩子画像用于任务匹配。填完回 `home.html`。
**脚本**：`js/api.js` + 内联。

**UI 区块**

| 区块 | 字段 / 控件 |
| --- | --- |
| `.progress-note` | "第 1 次登录 · 共 1 步，约 1 分钟完成" |
| `.card` 头部 | `<h1>孩子情况小问卷` + 说明 + `.privacy-note`（隐私声明） |
| 字段 1 | 孩子昵称 `#childName`（必填，maxlength 20） |
| 字段 2 | 性别 `#genderOptions` —— 单选胶囊 `.opt`：男孩 / 女孩（必填） |
| 字段 3 | 年龄 `#childAge`（必填，number，3–18） |
| 字段 4 | 年级 `#childGrade`（选填，下拉：一年级…初三） |
| 字段 5 | 主要陪伴人 `#caregiverOptions` —— **多选**：妈妈/爸爸/祖辈/其他亲属/家人轮流/其他…（选"其他…"展开 `#caregiverOther`） |
| 字段 6 | 每周可用时间 `#timeOptions` —— 单选：工作日晚间/周末白天/周末均可/时间较少/其他…（展开 `#timeOther`） |
| 字段 7 | 任务偏好 `#taskPreferenceOptions` —— 单选：低负担/短时长/高参与度/长时长 |
| 字段 8 | 孩子兴趣 `#interestOptions` —— **多选**：阅读/运动/绘画手工/音乐/科学实验/动物自然/棋类/做饭家务/其他…（展开 `#interestOther`） |
| 字段 9 | 家庭情况说明 `#familyNote`（选填 textarea） |
| 提交 | `#formError` + `#submitBtn`（"完成，开始使用"） |

**调用 API**：`POST /api/questionnaire`，body `{ childName, gender, age, grade, caregiver[], caregiverOther, timeAvailable, taskPreference, interests[], familyNote }`；响应 `{ child: { id } }`。

**交互行为**
1. 单选组点击：清除同组 `.selected`，给当前加 `.selected`。
2. 多选组点击：`toggle` `.selected`；点到 `data-value="__other"` 时展开对应自定义输入框并 focus，取消则收起。
3. 提交前逐项校验（昵称 / 性别 / 年龄范围 / 时间 / 至少一位陪伴人 / 至少一个兴趣 / 任务偏好），错误写 `#formError`。
4. 成功：`setSelectedChildId(res.child.id)` → 跳 `home.html`。
5. 失败：恢复按钮文案。

**是否废弃**：否，核心（首登必经）。**注意：它不在任何导航里，只能被 `needQuestionnaire` 重定向进入。**

---

### 4.3 `home.html` — 家长首页 / 本周任务（41KB，最复杂）

**用途**：家长端主页面。查看本周亲子任务、切换孩子、提交成果（文字/打卡/照片/语音/视频）、看教师反馈、读教师通知、绑定孩子、评价任务适配度。
**脚本**：`js/api.js` + **898 行文件里约 430 行内联 JS**（无独立 `home.js`）。**样式**：`css/refined-ui.css` + 约 190 行内联 `<style>` + `css/parent-home.css`。

**UI 区块（从上到下）**

| 区块 | 展示的数据字段 / 控件 |
| --- | --- |
| `.topbar` | brand "家校共育"；`.parent-nav` 四个 tab（本周任务/孩子成长时间线/教师的反馈/成长关注，当前页 active）；`.user-area`：`#childSwitcher` 孩子下拉（name + " · " + grade）、`#userName`、`#logoutBtn` |
| `.page-title` | `<h1>本周任务` + 副标题；`#taskStatusTag` 状态标签（`ongoing` 进行中 / `draft` 草稿 / `submitted` 已提交 / `done` 已反馈） |
| `#notificationBar` 通知条 | `#notificationSummary`（"有 N 条未读通知…"）；`#markNotificationsRead` 全部标记已读；`#hideNotifications` 隐藏通知；`#notificationList` 列表项显示 `title / content / sender_name / created_at`（今天只显示 HH:mm，否则 M月D日 HH:mm），未读项带"未读"角标 |
| `#bindBar` 未绑定提示 | 无孩子时显示 + `#bindBtn` 去绑定 |
| `#emptyState` 空态 | "本周暂无成长任务" |
| `#taskLayout`（grid 两列） | 左列 `.stack`，右列 `aside.stack` |
| ↳ `#taskCard` 任务卡 | `task.task_type`、`task.title`、`task.duration`（"约 N 分钟 · 截止周日"）；三宫格 `task.difficulty` / `task.materials` / `task.fallback_plan`；四块详情 `task.goal` / `task.steps` / `task.dialogue_tips` / `task.submit_hint` |
| ↳ `#submitCard` 提交区 | 5 个提交类型 tab（文字记录/完成打卡/照片/语音/视频）；`#textArea`(`#contentInput`)、`#checkArea`（4 个固定打卡项）、`#mediaArea`（`#mediaInput` file + `#mediaNote` + `#mediaList`，最多 3 个附件、合计 ≤ 4.5MB）；`#submitError` / `#submitOk`；`#draftBtn` 保存草稿 / `#submitBtn` 正式提交 |
| ↳ `#submittedCard` 已提交卡 | `submission.content`；`#submittedAttachments` 附件预览；`#feedbackArea` → `feedback.comment` + `#feedbackTags`（tags 逗号切分） |
| ↳ `#fitCard` 适配度评价 | 两个选项："该任务较适合我和孩子" / "该任务不适合我和孩子"；`#fitMessage` |
| `#bindModal` 绑定孩子弹窗 | `#childName`（maxlength 20）+ `#childGrade`（下拉一年级…初三）+ `#bindError` + 取消/确认绑定 |

**调用 API**
- `GET /api/parent/notifications?limit=6` → `{ notifications[], unreadCount }`
- `POST /api/parent/notifications/{id}/read`
- `POST /api/parent/notifications/read-all`
- `GET /api/home?childId=` → `{ children[], child, task, taskStatus, submission, feedback, needQuestionnaire, selectedChildInvalid }`
- `POST /api/submissions` body `{ taskId, childId, content, subType, status, attachments[] }`
- `POST /api/children` body `{ name, grade }` → `{ child: { id } }`
- `POST /api/auth/logout`
- `POST /api/events`（trackEvent：`task_detail_viewed` / `submit_page_entered` / `feedback_read` / `task_fit_feedback` / `submit_abandoned`）

**交互行为**
1. 孩子切换 `#childSwitcher` → `setSelectedChildId` → 重新 `loadHome`。
2. 通知项点击（或 Enter/Space）→ 若未读则 `markNotificationRead`；"全部标记已读" → `read-all`；"隐藏通知" → 把最新通知 id 写入 `localStorage["parentNotificationBarHidden:{userId}"]`，下次有新的未读时自动取消隐藏。
3. 提交类型 tab 切换 → 显示对应区域，媒体 tab 会设置 `accept`（image/audio/video）。
4. 选文件 → `FileReader.readAsDataURL` 转 base64（**小程序需改为 `wx.chooseMedia` + `uploadFile`**），校验 ≤ 4.5MB。
5. 提交/存草稿 → `POST /api/submissions`；`status: "submitted"` 成功后 `location.reload()`；草稿成功显示"草稿已保存"。
6. 适配度按钮 → 结果只写 `localStorage["taskFit:{childId}:{taskId}"]` + 上报埋点（**不发后端**）。
7. 绑定孩子弹窗 → `POST /api/children` → 设为当前孩子并刷新。
8. `pagehide` 时若编辑过但未保存 → 上报 `submit_abandoned`。
9. 退出登录 → logout + 清 `auth` + `selectedChildId` → `index.html`。

**是否废弃**：否，**家长端最核心的页面**。

---

### 4.4 `timeline.html` — 孩子成长时间线

**用途**：家长端按时间倒序回看孩子的任务提交 + 教师校园观察 + 教师反馈。
**脚本**：`js/api.js` + 内联（约 185 行）。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | 家长端 4 项导航（当前 active）+ 孩子切换器 `#childSwitcher` + `#userName` + `#logoutBtn` |
| `.page-title` | eyebrow "成长档案" / `<h1>孩子成长时间线` / 副标题 |
| `#emptyState` | "还没有成长记录" |
| `#timeline` | 时间线列表，每条 `.item` 三段：左侧日期块（M月D日 + 周X HH:mm）+ 中间圆点 marker + 右侧卡片 |

**两种卡片形态**
1. **教师观察**（`timeline_type === "teacher_observation"`，紫色 `.is-observation`）：`title`、`created_at`、`teacher_name`、标签"教师记录"、"老师观察到" + `content`、可选 `observation_analysis`（"教育观察"）、`observation_tags` 逗号切分的标签。
2. **孩子提交**（默认）：`title`、`task_type` 徽章、`created_at`（"提交于 …"）、"孩子的记录" + `content`（空则"这次提交没有填写文字记录。"）、`attachments` 预览（img/audio/video/文件块）、可选反馈块（`feedback_id` 存在时）显示"X 的反馈" + `feedback_comment` + `feedback_tags`。

**调用 API**
- `GET /api/home?childId=`（拿 children / child + 问卷劫持判断）
- `GET /api/timeline?childId=` → `{ items[] }`
- `POST /api/auth/logout`

**交互行为**：孩子切换 → 重拉时间线；无其它交互（纯展示）。排序在前端做：`created_at` 倒序，同时间按 `id` 倒序。

**是否废弃**：否，核心。

---

### 4.5 `feedback.html` — 教师的反馈

**用途**：家长端集中查看老师对每次提交的点评（区别于散落在时间线里的反馈）。
**脚本**：`js/api.js` + 内联（约 160 行）。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | 家长端导航（当前 active）+ 孩子切换器 |
| `.main`（CSS `::before` 伪元素插入"家庭反馈"小标题） |  |
| ↳ `.page-title` | `<h1>教师的反馈` + 副标题；`.page-actions` 里 `#feedbackCount`（"共 N 条反馈" / "显示 X / 共 N 条反馈"）+ `#typeFilter` 任务类型下拉（类型 > 1 种时才显示） |
| ↳ `#emptyState` | "还没有收到教师反馈" |
| ↳ `#feedbackList` | 反馈卡片列表 |

**反馈卡片 `.feedback-card` 字段**
- `.context-strip` 上下文条：`title`（截断 64 字）+"关联任务"、`content`（截断 86 字）+"学生提交"
- `.feedback-head`：教师头像（姓名首字）+ `teacher_name` + "点评人"徽章 + `feedback_at || created_at`（"反馈于 …"）+ `task_type` 药丸标签
- `.comment`："教师评语" + `feedback_comment`
- `.ability-section`："评价维度" + `feedback_tags`（按 `，,;；|` 切分）；无标签则"老师暂未添加能力标签"

**调用 API**
- `GET /api/home?childId=`
- `GET /api/timeline?childId=`（**反馈数据复用时间线接口**，再在前端 `filter(it => it.feedback_id)` 过滤）
- `POST /api/auth/logout`
- `POST /api/events`（`feedback_page_viewed` / `feedback_read`）

**交互行为**：切换孩子重拉；切换类型只做本地过滤；进入即上报埋点。

**是否废弃**：否，核心。

---

### 4.6 `parent-concern.html` — 成长关注（家长提交关注 → 老师审核）

**用途**：家长描述观察到的具体场景，系统生成温和低负担的任务草案，交由教师审核后生成定制任务。这是"家长反向提需求"的链路起点。
**脚本**：`js/api.js` + 内联（约 145 行）。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | 家长端导航（当前 active）+ 孩子切换器 |
| `.concern-intro` | `<h1>告诉老师最近想支持孩子的地方` + 说明 |
| `.concern-panel` | 标题"提交成长关注" + `.notice` 隐私/边界声明（不做心理或性格判断） |
| ↳ `#concernForm` | 双列 `.form-grid` |
| ↳ `#category` 关注方向（选填下拉） | 情绪表达 / 亲子沟通 / 规则习惯 / 责任感与自理 / 同伴交往 / 学习动力 / 注意力与执行 / 其他 |
| ↳ `#frequency` 出现频率（选填下拉） | 偶尔发生 / 每周几次 / 最近经常发生 / 暂时说不清 |
| ↳ `#observedBehavior` 具体情况（**必填**，≥4 字，maxlength 1200） | |
| ↳ `#context` 发生场景（选填，1000） | |
| ↳ `#impact` 对家庭影响（选填，800） | |
| ↳ `#parentExpectation` 希望得到什么支持（选填，800） | |
| ↳ `#familyConstraints` 家庭情况/执行限制（选填，800） | |
| ↳ `#duration` 希望任务时长（下拉：10/15(默认)/20/30 分钟） | |
| ↳ `#submitConcern` 提交给老师 + `#formMsg` | |
| `.history-panel` 我的提交记录 | `#requestList`；每条 `.request-item`：`concern_category || title`、`created_at`（M月D日）、`observed_behavior`、状态徽章（pending 等待老师审核 / approved 老师已采用并生成任务 / rejected 老师已回复）、`task_title`（定制任务）、`teacher_comment`（老师回复） |

**调用 API**
- `GET /api/home`（拿 children + 问卷劫持）
- `GET /api/parent/task-requests?childId=` → `{ requests[] }`
- `POST /api/parent/task-requests`，body `{ childId, category, observedBehavior, context, frequency, impact, parentExpectation, familyConstraints, duration }`，**`timeoutMs: 60000`**（AI 生成草案较慢）
- `POST /api/auth/logout`

**交互行为**
1. 提交前校验：已绑定孩子 + 描述 ≥ 4 字。
2. 提交中按钮禁用 + "分析并提交中…"；成功后显示 `result.message || "已提交，等待老师审核"`，`form.reset()` 并把 duration 复位成 15，刷新历史列表。
3. 切换孩子 → 重新拉取该孩子的提交记录。

**是否废弃**：否，核心（与 `teacher-publish.html` 的审核区形成闭环）。

---

### 4.7 `parent-engagement.html` — 我的关注记录（孤儿页，但有真实数据）

**用途**：向家长透明化"系统如何根据站内行为形成主动关注证据"，允许家长反馈校准或关闭分析。
**脚本**：`js/api.js` + 内联（约 85 行）。
**入口**：**全站无任何链接指向此页**，只能手动输入 URL。文件名是 `parent-engagement.html` 但 `<title>` 和页面标题都叫"我的关注记录"。

**UI 区块（全部由 JS 动态生成到 `#body`）**

| 区块 | 字段 |
| --- | --- |
| 卡片 1 · 头部 | `child.name` + "的家校关注记录"；`engagement.level`（如"证据不足"）；`engagement.windowDays`（近 N 天）；`engagement.confidence`（置信度）；开关徽章"已开启/已关闭" |
| 卡片 1 · 三宫格指标 | `engagement.score`（主动关注分）、`engagement.counts.activeDays`（活跃天数）、`engagement.counts.followThrough`（跟进行为） |
| 卡片 2 · 判断依据 | `engagement.evidence[]` 列表；`engagement.recommendation`（建议动作） |
| 卡片 3 · 数据范围 | 两列：`data.collected[]`（会使用）/ `data.notCollected[]`（不会使用） |
| 卡片 4 · 修正与设置 | 3 个按钮："判断基本准确" / "我很关注，但最近没用系统" / `#toggleBtn`（"关闭关注分析" ↔ "重新开启分析"）；`#msg` 提示 |

**调用 API**
- `GET /api/home`（无 `selectedChildId` 时，取 `data.child.id`）
- `GET /api/parent/engagement?childId=` → `{ engagement, enabled, child, collected[], notCollected[] }`
- `POST /api/parent/engagement-feedback` body `{ childId, choice }`
- `POST /api/parent/engagement-preference` body `{ childId, enabled }`

**交互行为**
1. 点"判断基本准确"/"我很关注但少用系统" → `engagement-feedback`，提示"已收到你的修正反馈"。
2. 点 `#toggleBtn` → `engagement-preference` 取反 → 重新 `load(cid)` 刷新整页。
3. 只有"‹ 返回首页"链接（无标准家长端导航、无退出登录）。

**是否废弃**：**功能完整但未接入导航**。重写时需产品决策：要么在家长端加一个入口（如 home 的"任务适合度卡"旁），要么直接不迁移。

---

### 4.8 `task-detail.html` — 任务详情与提交（**废弃孤儿**）

**用途**：与 `home.html` 的任务区 100% 重复的单页版本。
**脚本**：`js/api.js` + 内联（约 227 行）。

**UI 区块**：顶栏只有一个"`‹ 返回首页`"链接（无家长端导航、无孩子切换器）→ `#emptyState` → `#taskCard`（同 home 的任务字段）→ `#submitCard`（同 home 的 5 种提交类型）→ `#submittedCard`（同 home）。

**调用 API**：`GET /api/home?childId=`（**注意：它没有 `needQuestionnaire` 劫持判断**）、`POST /api/submissions`、`POST /api/auth/logout`、trackEvent 三个。

**与 home.html 的差异（都是 home 更全）**
- 无通知条、无绑定孩子弹窗、无适配度评价卡、无孩子切换器、无问卷劫持。
- 埋点 meta 无 `source: "home"` 标识。

**是否废弃**：**是**。全站 0 个链接指向它（Grep 全库 `task-detail.html` 只在自身出现），功能被 `home.html` 完整覆盖。建议小程序直接不迁移。

---

### 4.9 `student.html` — 学生端任务提交

**用途**：学生用自己的账号登录，查看本周任务并提交自己的记录（比家长端简化很多）。
**脚本**：`js/api.js` + `js/student.js`（104 行）。**样式**：`css/student.css`。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.student-topbar` | brand（回 student.html）+ 学生端导航 2 项：任务提交(active) / 学习园地 + `#userName` + `#logoutBtn` |
| `.student-heading` | "我的学习任务" / `<h1>完成任务，提交你的发现` / 副标题 + `#taskStatus` 状态标签（ongoing 进行中 / draft 草稿已保存 / submitted 已提交） |
| `#emptyState` 空态 | "本周暂时没有任务"（加载失败时替换文案为错误提示） |
| `#taskContent` grid（有任务时） | |
| ↳ `.task-card` | `#taskType`（task_type）、`#taskTitle`（title）、`#taskMeta`（"约 N 分钟"）；两格 `#taskDifficulty` / `#taskMaterials`；四块 `#taskGoal`（任务目标）/ `#taskSteps`（完成步骤）/ `#taskTips`（dialogue_tips）/ `#taskSubmitHint`（提交什么） |
| ↳ `#submitCard` 提交卡 | `#contentInput`（textarea，maxlength 1200）+ `#charCount` + `#submitMessage`；`#draftButton` 保存草稿 / `#submitButton` 提交任务 |
| ↳ `#submittedCard` 已提交卡 | ✓ 图标 + "任务已提交" + `#submittedContent`；`#feedbackBlock` → "老师反馈" + `#feedbackContent` |

**调用 API**
- `GET /api/student/home` → `{ task, child, taskStatus, submission, feedback }`
- `POST /api/submissions` body `{ taskId, childId, content, subType: "text", status, attachments: [] }`
- `POST /api/auth/logout`

**交互行为**
1. 提交前校验：status 为 submitted 且内容为空 → "请先写下你的记录" + focus。
2. 草稿 → 提示"草稿已保存" + 状态改成"草稿已保存"；正式提交 → **`window.location.reload()`** 切到 `#submittedCard`。
3. 已有提交且 status 为 draft → 回填文本框；非 draft → 隐藏提交卡、显示已提交卡，有 `feedback.comment` 则显示反馈块。
4. 角色守卫：`role !== "student"` → `home.html`。

**是否废弃**：否，学生端核心页（唯一实质页面）。

---

### 4.10 `learning-garden.html` — 学习园地（占位）

**用途**：学生端第二个导航 tab，目前只是"内容正在准备中"的占位卡。
**脚本**：`js/api.js` + 内联（仅 11 行：守卫 + 显示用户名 + 退出登录）。

**UI 区块**：`.student-topbar`（学习园地 active）→ `.placeholder-main` > `.placeholder-card`（✦ 图标 + "学习园地" + `<h1>内容正在准备中` + 说明 + "返回任务提交"按钮）。

**调用 API**：仅 `POST /api/auth/logout`。

**是否废弃**：**占位**。小程序若要保留两 tab 结构，可保留一个空壳 tab 或直接砍掉。

---

### 4.11 `teacher.html` — 今日校园观察（教师工作台落地页）

**用途**：教师用语音（Web Speech API）或文字记录当天学生的校园表现，AI 整理成结构化观察并**自动通知对应家长**。
**脚本**：`js/api.js` + `js/teacher-daily.js`（208 行）。**样式**：`css/refined-ui.css` + `css/teacher-daily.css?v=2`。
**注意**：导航第一项写"全局报告"，但本页实际是"今日记录"，页内 `<h1>` 是"记录今天，孩子在学校发生的事"。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | brand "教师工作台" + 教师端 6 项导航（今日记录 active）+ `#userName` + `#logoutBtn` |
| `.daily-capture` 录入区 | eyebrow "今日校园观察" + `<h1>` + 说明"说出学生姓名和事情，AI 会整理并通知家长。" |
| ↳ `.voice-stage` | `#recordButton`（麦克风图标 + `#recordButtonText` 文案在"点击开始说"/"结束录音"间切换）+ `#recordStatus` 状态文案 |
| ↳ `#dailyForm` | `#transcriptInput`（textarea，maxlength 2000）+ `#charCount`（"N / 2000"）+ `#analyzeButton`（✦ "整理并发布"） |
| ↳ `#formMessage` | 结果/错误提示（role=status） |
| `.daily-timeline` 记录留档 | eyebrow "记录留档" + `<h2>今日与历史记录` + `#timelineCount`（"N 条"）+ `#timelineList` |

**时间线条目 `.daily-entry` 字段**：`student_name`、`created_at`（M月D日 HH:mm）、`summary`、`analysis`（"教育观察"块）、`ai_status`（"AI 已整理" / "本地已整理"）、`recipient_count`（"已通知 N 位家长" / "暂未匹配家长"）、`tags` 逗号切分的标签。

**调用 API**
- `GET /api/teacher/daily-updates?limit=30` → `{ updates[] }`
- `POST /api/teacher/daily-updates`，body `{ transcript }`，**`timeoutMs: 45000`** → `{ recipientCount }`
- `POST /api/auth/logout`（并额外清 `selectedChildId`）

**交互行为**
1. `#recordButton` 切换录音：`webkitSpeechRecognition`（lang=zh-CN，continuous，interimResults）→ 识别结果实时拼进 `#transcriptInput`。**小程序需替换为 `wx.getRecorderManager` + 后端语音转写**。
2. 不支持语音时降级：`#recordStatus` 提示"当前浏览器不支持语音识别，请直接输入文字。"，点录音按钮改为 focus 文本框。
3. 提交 → 禁用按钮 + "AI 正在整理，并同步通知家长…" → 返回后清空输入 + 显示"已整理并通知 N 位家长。"或"已保存到时间线，暂未找到可通知的家长账号。" → 刷新时间线。
4. 角色守卫：`role !== "teacher"` → `home.html`。

**是否废弃**：否，教师端落地页 + 核心功能。

---

### 4.12 `teacher-ai.html` — AI 洞察 + AI 助手（SSE 流式对话）

**用途**：教师端 AI 能力集中页。上半部分是 AI 生成的班级洞察，下半部分是可连续追问的 AI 助手（流式输出，带本地历史缓存）。
**脚本**：`js/api.js` + **`js/teacher-page.js`（1105 行，全站最大脚本）**。**样式**：`css/refined-ui.css` + `css/teacher-ai.css`（41KB）。
**body class**：`global-report teacher-ai-page`（`teacher-ai-page` 决定 `renderReport` 走 AI 分支）。

**UI 区块（全部由 `renderReport()` 动态生成到 `#reportBody`）**

| 区块 | 内容 |
| --- | --- |
| 数据范围提示 `.data-scope-note` | 当 `dataScope.realStudents === 0 && filteredDemoStudents > 0` 时显示"当前没有真实家长数据…请先让家长使用真实账号注册" |
| `.assistant-shell` AI 助手（`createAssistantShell()`） | 开场简报气泡（`renderBriefingBubble()`：已提交/草稿停滞名单摘要）+ 消息列表 + `#assistantForm` / `#assistantInput`（textarea，自动增高 ≤132px，Enter 发送、Shift+Enter 换行）/ `#assistantSend`；快捷追问 chip（`data-question`）；复制按钮（"【复制】未交家庭催交通知"）；消息带 `.assistant-citations` "参考：xxx" |
| AI 加载态 | 轮询期间按阶段显示文案："正在读取班级数据"→"正在分析家长参与节奏"→"正在生成下周任务建议"→"正在整理教师行动清单" |
| `.warn-note` | `aiError`（AI 调用未完成/失败 → 降级本地规则分析）；`ai.risks[]`（"谨慎解读：…"） |
| 空态 | "暂无真实学生数据。请先让家长注册、填写问卷或绑定孩子后再查看 AI 分析。" |

**调用 API**
- `GET /api/teacher/global-report?local=1` → 本地规则报告（立即渲染）
- `GET /api/teacher/global-report?ai=1` → AI 报告；**若返回 `aiPending: true`，前端轮询重试最多 18 次**（前 3 次间隔 1.2s，之后 2.5s），成功后写入 `localStorage` 缓存
- `POST /api/teacher/ai-chat?stream=1`（**`fetch` + `ReadableStream` SSE，不走 `api()`**），body `{ question, history }`，逐块解析 `data:` 行
- `POST /api/teacher/notifications` body `{ title, content }`（"请补充孩子档案信息"）→ `{ recipientCount }`
- `POST /api/auth/logout`

**交互行为**
1. 两级 Tab（`.main-tab` / `.data-tab` + `.main-tab-panel` / `.data-pane`）—— **注意：AI 页分支下这些 tab 结构实际未被渲染，属死代码**。
2. AI 助手发送：本地先插入用户消息 + 创建流式消息占位，逐字渲染；完成后保存消息到 `localStorage`（key 含 `teacherAiChat_v{ver}_{account}`），重新进入可 `restoreChat()` 恢复（但开场简报始终按最新数据重新生成）。
3. `data-dashboard-notify` 按钮 → 发教师通知 → 按钮临时变"已通知 N 位家长" / "暂无真实家长账号"，2.2s 后复原。
4. `data-question` 按钮 → 直接把问题送进助手。

**是否废弃**：否，核心。**但 `teacher-page.js` 中约一半代码（数据档案/指标卡/维度看板分支）不可达，迁移时应只取 AI 助手 + 洞察部分。**

---

### 4.13 `teacher-class-overview.html` — 班级概览（34KB）

**用途**：教师端班级数据驾驶舱：本周完成率/反馈覆盖率、多维度分布图、AI 洞察卡片（可"立即发送/定时"）、未提交学生名单（可批量催交）。
**脚本**：`js/api.js` + 内联（约 350 行）。**样式**：内联 + `css/refined-ui.css`。

**UI 区块（由 `GET /api/teacher/ai-overview` 数据动态渲染到 `#overviewBody`）**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | 教师端 6 项导航（班级概览 active） |
| `.stats-row` 指标卡 | `stats.completionRate`（本周完成率 %，≥80 绿色 ok、<50 橙色 warn）+ 进度条；`stats.feedbackRate`（反馈覆盖率 %，`pendingFeedback>0` 则 warn） |
| `.dist-panel` 分布图（`renderDist()`） | 对每个维度对象渲染：堆叠色条（7 色调色板 `COLORS`）+ 图例（`名称 (数量)`）+ 逐行进度列表（`名称 / 进度条 / N人`） |
| `.insight-col` 洞察栏（PC 右侧栏；移动端抽屉） | `.insight-card` 列表：`compactInsight()` 把 AI 文本转成 `{ label, action }`（进度提醒 / 表现稳定 / 进度观察 / 反馈完成 / 待办急件 / 特殊关怀 / 分层推进 / 下周选题 / 观察）；每个卡片两个按钮："立即发送" + 动态时机按钮（"定时周三发" / "安排点评" / "加入下周任务" / "稍后跟进"） |
| 面板 · 当前任务与个性化名单 | 右上角链接"调整班级任务" → `teacher-publish.html` |
| 未提交学生区 | `.attention-toolbar`："批量催交" + "提醒全部未交（N 人）"；`.unsubmitted-table`（复选框列 + 学生/年级/主要陪伴人/状态/快捷操作，`name`/`grade`/`caregiver`/`status` 可点击表头排序）+ 移动端 `.mobile-card-list` 卡片列表；快捷操作两个图标按钮"微"（微信提醒）/ "☎"（电话提醒） |
| `#overviewToast` | 轻提示（2.2s 自动消失） |

**调用 API**
- `GET /api/teacher/ai-overview` → `{ stats: { totalStudents, completionRate, feedbackRate, pendingFeedback, personalTaskCount, ... }, distributions..., insights[], unsubmittedStudents[] }`
- `POST /api/auth/logout`
- `POST /api/events`（`teacher_contact_started`，meta 含 `source: "class_overview_insight"/"class_overview_unsubmitted"`）

**交互行为**
1. 移动端：`.insight-col` 变抽屉，`data-mobile-panel` 按钮打开（`parents` → 标题"家长证据"；否则"学情洞察与建议"），`data-close-drawer` / 遮罩关闭。
2. 排序表头 → `renderUnsubmittedRows(list, key, dir)` 本地重排（`localeCompare("zh-Hans-CN")`），全选框复位。
3. "批量催交" → 若无勾选提示"请先勾选需要催交的学生"；否则 toast "提醒模板已生成：N人" + 埋点。
4. **⚠️ 所有"催交/提醒/发送"动作目前都是纯前端 toast，不调用后端、不真发消息**（只上报埋点）。小程序重写时这里要么接真实推送，要么明确标注为"生成模板"占位。

**是否废弃**：否，核心。

---

### 4.14 `teacher-publish.html` — 发布任务 + 审核家长定制任务（35KB）

**用途**：教师端两大功能合页：① 从模板快速发布本周全班任务；② 审核家长在 `parent-concern.html` 提交的"成长关注"请求，同意即生成任务、拒绝需填写原因。
**脚本**：`js/api.js` + 内联（约 325 行）。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | 教师端 6 项导航（发布任务 active） |
| `.publish-panel` 发布任务 | 说明"从模板带出任务卡，老师可微调后发布给全班" |
| ↳ `#templateSelect` | 任务模板下拉（`TASK_TEMPLATES` 常量数组，**10 个内置模板**，前端硬编码） |
| ↳ 任务表单 | `#pubTitle`(50) / `#pubType`（下拉：阅读/习惯养成/学科应用/情绪社交/家务实践/运动健身/观察探究）/ `#pubDuration`(5–60) / `#pubDifficulty`（简单/普通/进阶）/ `#pubMaterials`(80) / `#pubGoal`(100) / `#pubSteps`(textarea，自动增高) / `#pubTips`(100) / `#pubSubmit`(100) / `#pubFallback`(120) |
| ↳ `#publishBtn` "发布给全班" + `#publishMsg` | |
| 家长定制请求区 | `#requestCount`（"N 项 · M 待处理"）+ `#parentRequestList`（缩略卡列表） |
| ↳ `.request-thumb` 缩略卡 | `child_name` / `grade` · `parent_name` / 状态徽章（待审核/已同意/已拒绝）/ 任务标题 / 预览文本（`observed_behavior || description || context || parent_expectation || goal`）/ 底部 `concern_category || type` + "查看详情" |
| `#requestModal` 审核弹窗 | `#requestModalTitle`（"{学生}的提交项目详情"）+ `#requestModalSub`（"{年级} · {家长} · {状态}"）+ `#requestModalBody` |

**弹窗内详情 `.parent-request-item` 结构**
- 顶部：`child_name` / `grade` · `parent_name` / 状态徽章
- "家长观察"块：`concern_category`（关注方向）、`observed_behavior || description`、`context`（发生场景）、`frequency`（出现频率）、`impact`（家庭影响）、`parent_expectation || goal`（家长期待）、`family_constraints`（执行限制）
- "AI 分析报告"块（`.ai-request-plan`，默认折叠）：`ai_status`（"AI 已生成"/"基础规则兜底"）、`plan.analysisSummary`、`plan.supportGoal`、`plan.boundaryNote`、`plan.needsProfessionalReview`（风险红字提示）
- **status === "pending" 时**渲染可编辑任务表单（`.pr-title` / `.pr-type` / `.pr-duration` / `.pr-difficulty` / `.pr-materials` / `.pr-goal` / `.pr-steps` / `.pr-tips` / `.pr-submit` / `.pr-fallback`，初值来自 `plan.task` 或由 `defaultTaskFromRequest()` 兜底）+ `.pr-comment` 教师评价 + `.pr-approve` "同意实施" / `.pr-reject` "拒绝并评价" + `.pr-msg`
- **非 pending 时**只读展示"教师评价"：`teacher_comment` + `task_title`（已生成任务）

**调用 API**
- `POST /api/teacher/tasks` body `{ title, type, duration, difficulty, materials, goal, steps, dialogueTips, submitHint, fallbackPlan }`
- `GET /api/teacher/parent-task-requests` → `{ requests[] }`
- `POST /api/teacher/parent-task-requests/review` body `{ requestId, status, teacherComment, title, type, duration, difficulty, materials, goal, steps, dialogueTips, submitHint, fallbackPlan }`
- `POST /api/auth/logout`

**交互行为**
1. 选模板 → `fillTemplate()` 把 10 个字段一次性填满（模板数据全在前端）。
2. 发布 → 校验标题非空 → `POST /api/teacher/tasks` → 成功"已发布，本周任务会出现在家长端"；失败显示 `res.message`。
3. 点缩略卡 → 开弹窗渲染详情（`textarea` 自动增高）。
4. 点"展开详情" → 切换 `.ai-request-plan` 的 `is-expanded` / `is-collapsed` + 按钮文案"收起详情"/"展开详情"。
5. "同意实施" → status `approved`；"拒绝并评价" → status `rejected`，**拒绝时 `.pr-comment` 必填**，否则提示"拒绝时请填写评价或原因"。提交期间弹窗内所有按钮禁用。
6. 成功后关闭弹窗 + 刷新列表。支持点击遮罩、`#requestModalClose`、Esc 关闭。
7. 角色守卫：`role !== "teacher"` → `home.html`。

**是否废弃**：否，核心。

---

### 4.15 `teacher-submissions.html` — 学生提交批阅（29KB）

**用途**：教师端批阅学生提交：卡片列表 → 详情弹窗（任务要求 + 提交内容 + 点评记录 + AI 生成评价草稿 → 发布评价）。
**脚本**：`js/api.js` + 内联（约 305 行）。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | 教师端 6 项导航（学生提交 active）+ `#subCount`（"共 N 份 · M 待点评"）+ `#userName` + `#logoutBtn` |
| `.page-heading` | eyebrow "提交与反馈" + `<h1>学生提交` + "点击任意卡片查看任务要求、提交内容和点评记录" |
| `#subList` 卡片网格 | `.sub-card`：`child_name`（+ ` · grade`）/ `title` / 状态徽章（已点评 / 待点评）/ `content` 预览（空则"这份提交没有文字内容，请打开详情查看附件。"）/ `created_at` + "N 个附件" / "查看详情 →" |
| `#detailBackdrop` 详情弹窗 | `#detailKicker`（学生 · 年级）+ `#detailTitle`（任务标题）+ `#closeDetailBtn` + `#detailContent` |

**弹窗内 `.detail-layout` 两列**
- **左列 · 任务详情**：`task.title`、`task.type`、`task.weekStart`、"任务目标" `goal`、"完成步骤" `steps`（按换行拆成有序列表，去掉行首序号）、"对话提示" `dialogueTips`、"提交要求" `submitHint`、meta 两格"建议时长" `duration` / "材料" `materials`
- **右列 · 学生提交**：`submission.createdAt`、`submission.content`、`submission.attachments`（img/audio/video/文件块）
- **右列 · 点评记录**：`feedbacks[]` 历史（`comment` + `teacher_name` · `created_at` · `tags`），或"暂时还没有点评记录。"
- **右列 · `.composer`（仅未点评时）**：提示"AI 只生成草稿，不会自动发布；你可以修改后再推送给家长。"；`#feedbackInput`（maxlength 300）；`QUICK_COMMENTS` 4 个快捷评语按钮；`QUICK_TAGS` 6 个标签按钮（表达力/观察力/坚持/合作/责任感/情绪表达，可多选 toggle `.active`）；`#feedbackSource`（AI 来源说明）；`#generateAiBtn` "AI 生成评价" / `#publishFeedbackBtn` "发布评价"；`#feedbackStatus`

**调用 API**
- `GET /api/teacher/overview` → `{ submissions[] }`
- `GET /api/teacher/submissions/{id}` → `{ submission, task, feedbacks[], feedbackCount }`
- `POST /api/teacher/submissions/ai-feedback` body `{ submissionId }` → `{ feedback: { comment, tags, provider, warning } }`
- `POST /api/teacher/feedback` body `{ submissionId, comment, tags }`
- `POST /api/auth/logout`

**交互行为**
1. 点卡片（或 Enter/Space）→ 开弹窗 + 拉详情；关闭（按钮/遮罩/Esc）后焦点回到原卡片。
2. 快捷评语按钮 → 填入文本框 + focus。
3. 标签按钮 → toggle 选中，选中项用逗号拼接提交。
4. AI 生成 → 按钮"生成中…" → 回填 `comment` 并自动点亮匹配标签 → `#feedbackSource` 显示 `provider + warning + "· 可编辑草稿"`；失败提示"AI生成失败，请改用自定义评价"。
5. 发布评价 → 校验非空 → 禁用弹窗内所有按钮/文本框 → "评价发布中…" → 成功"评价已发布"，刷新列表并在 350ms 后刷新详情（此时 composer 消失，变只读）。
6. 角色守卫：`role !== "teacher"` → `home.html`。

**是否废弃**：否，核心。

---

### 4.16 `teacher-students.html` — 学生档案（教师 + 管理员共用）

**用途**：学生画像表格 + 展开查看 AI/模板任务建议 + 一键"使用此任务"填充并定向发布给单个学生。
**脚本**：`js/api.js` + 内联（约 187 行）。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | 教师端 6 项导航（学生档案 active）；**管理员访问时被 `setupWorkspaceNavigation("admin","students")` 替换为管理员 5 项导航，brand 变"管理员工作台"** |
| `.page-heading` | `<h1>学生档案` + "按行查看学生基础资料；打开任务建议后可直接发布个性化成长任务。" |
| `#filterNote` | 筛选说明（"已筛选：陪伴人、可用时间或兴趣标签未完善的学生。" / "已筛选：本周尚未正式提交任务的学生。"） |
| `.student-table` 表格 | 9 列：学生 / 年级 / 性别·年龄 / 主要陪伴人 / 可用时间 / 任务偏好 / 兴趣 / 家庭情况备注 / 操作。字段：`name`、`grade`、`gender`、`age`、`caregiver`、`timeAvailable`、`taskPreference`、`interests`（顿号连接）、`familyNote`；操作列"查看建议"按钮 |
| `.detail-row` 展开面板 | 懒加载（首次展开才请求） |

**展开面板 `.detail-panel` 内容**
- `<h3>` "{姓名} · 个性化任务建议" + `.history`（`history.totalCompleted` "已完成 N 个任务，类型：xxx"；0 则"该学生尚未完成任何任务，期待第一次参与"）
- `.suggestions` 建议卡列表：`suggestion.source`（"AI 分析建议" / "AI 分析建议 · 本地兜底" / "模板建议"）+ `type` + `duration`；`title` / `goal` / `steps` / `rationale`；"使用此任务"按钮
- `.publish-section` 定向发布表单（**管理员身份时 `hidden`**）：`pt-title` / `pt-type`（7 种）/ `pt-duration`(5–60，默认 20) / `pt-difficulty` / `pt-materials` / `pt-goal` / `pt-steps` / `pt-tips` / `pt-submit` / `pt-fallback` + `pt-publish` "发布给{姓名}" + `pt-msg`

**调用 API**
- `GET /api/teacher/students` → `{ students[] }`
- `GET /api/teacher/global-report?local=1` → 用于 `studentProgress`（`draftStalled` / `viewedNotStarted` / `untouched`）计算未提交名单
- `GET /api/teacher/student-suggestions?childId=` → `{ student, suggestions[], history }`
- `POST /api/teacher/tasks` body 同上 + **`childId`（定向发布）**
- `POST /api/auth/logout`

**交互行为**
1. "查看建议" → 展开/收起（**同时只允许展开一行**，展开时会把其它行收起并复位按钮文案为"查看建议"），首次展开触发 `loadStudentDetail()`。
2. "使用此任务" → 把建议的 `title/type/duration/goal/steps/dialogueTips/submitHint` 填进定向发布表单，`difficulty` 按 `duration <= 15 ? "简单" : "普通"` 推算，平滑滚动到发布区。
3. 定向发布 → 校验标题 → `POST /api/teacher/tasks`（带 childId）→ "已发布，该学生家长端本周可见"。
4. **URL hash 筛选**：`location.hash` 里 `filter=incomplete` / `filter=unsubmitted`，监听 `hashchange` 重新加载。这是 `teacher-page.js` 指标卡跳转过来的入口（如 `teacher-students.html#filter=incomplete`）。
5. 角色守卫：非 teacher 且非 admin → `home.html`。

**是否废弃**：否，核心（且是唯一教师/管理员共用页）。

---

### 4.17 `admin.html` — 账号管理（管理员落地页）

**用途**：管理员统一创建/编辑教师、学生、家长三类账号。**注意：脚本是 `js/admin-accounts.js`，不是 `js/admin.js`**。
**脚本**：`js/api.js` + `js/admin-accounts.js`（53 行）。**样式**：`css/refined-ui.css` + `css/admin.css` + `css/admin-accounts.css`。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | brand "管理员工作台"（但 HTML 里初始写死，随后被 `setupWorkspaceNavigation` 确认）+ `.teacher-nav`（空容器，由 JS 注入 5 项，账号管理 active）+ `#userName` + `#logoutBtn` |
| `.accounts-heading` | eyebrow "系统管理 / 账号与档案" + `<h1>账号管理` + 说明 + `#addAccountBtn` "＋ 新增账号" |
| `.account-toolbar` | 4 个分段筛选（全部账号 / 教师 / 学生 / 家长，`.segment[data-filter]`）+ `#accountSearch`（搜索姓名、账号或年级）+ `#resultCount`（"N 个账号" / "正在同步…" / "同步失败"） |
| `.account-table` | 6 列：成员（姓名 + 类型小字："学生档案"/"家长账号"/"工作人员"）/ 账号 / 身份（彩色徽章）/ 资料摘要 / 创建时间 / 操作（编辑按钮） |
| 资料摘要规则 `profileText()` | 教师：`subject` · 工号`employee_no` · `phone`；家长：`"N 位关联学生"` · `phone` · `email`；学生：`grade` · `gender` · `age`岁 · `caregiver` |
| `#accountModal` 弹窗 | `#modalTitle`（"新增账号"/"编辑账号"）+ `#closeModalBtn` + `#formStatus` + `#accountForm` |

**弹窗表单字段（按角色动态显隐）**
- `#rolePicker`（**仅新增时可见**，编辑时隐藏）：单选 teacher(默认) / student / parent
- 通用：`#accountInput`（登录账号，≥3 字符，`*`）、`#passwordInput`（新增 ≥6 位；编辑留空表示不改）、`#displayNameInput`（姓名 `*`；label 随角色变"教师姓名/学生姓名/家长姓名"）、`#phoneInput`、`#emailInput`
- **教师专属 `.teacher-only`**：`#subjectInput`（任教科目）、`#employeeNoInput`（工号）
- **学生专属 `.student-only`**：`#gradeInput`（年级 `*`）、`#genderInput`（下拉：未填写/男/女）、`#ageInput`（3–20）、`#caregiverInput`（主要照护人）、`#interestsInput`（兴趣标签，逗号分隔）、`#parentAccountInput`（关联家长账号）、`#relationInput`（家长关系，默认"家长"）、`#familyNoteInput`（家庭备注，500）
- `#cancelBtn` / `#saveBtn`（"保存账号"/"保存中…"）

**调用 API**
- `GET /api/admin/accounts` → `{ teachers[], students[], parents[] }`（前端合并并打上 `role` 标签）
- `POST /api/admin/accounts` body `{ role, account, password, displayName, phone, email, subject, employeeNo, grade, gender, age, caregiver, interests, parentAccount, relation, familyNote }`
- `PUT /api/admin/accounts/{id}`（编辑，body 同上，password 可空）
- `DELETE /api/admin/accounts/{id}`（删除教师/学生/家长账号，管理员账号不可删除）
- `POST /api/auth/logout`

**交互行为**
1. 分段筛选 + 搜索框（本地过滤，不请求后端）。
2. "＋ 新增账号" → `openModal()` 清空表单 + 显示角色选择 + 默认 teacher。
3. 行内"编辑" → `openModal(item)` 回填（注意后端字段是 snake_case，通过 `map` 转换：`display_name` / `employee_no` / `family_note` / `parent_account` / `parent_relation`）。
4. 切换角色单选 → `setRole()` 切 `body.student-form` / `body.parent-form` class 控制字段显隐、改姓名 label、改密码必填标记与提示。
5. 提交校验：账号 ≥3、密码规则、姓名非空、学生年级必填 → 错误显示 `#formStatus`（红色）。
6. 保存成功 → 关弹窗 + 刷新列表；失败 → 弹窗内显示错误。
7. 关闭方式：`#closeModalBtn` / `#cancelBtn` / 点遮罩。
8. 角色守卫：非 admin → 按角色踢到 `teacher.html` 或 `home.html`。

**是否废弃**：否，管理员端落地页 + 核心。

---

### 4.18 `admin-tasks.html` — 已发布任务看板

**用途**：管理员按任务维度查看全校学生完成情况，可展开看每个学生进度。
**脚本**：`js/api.js` + `js/admin-tasks.js`（85 行）。**样式**：`css/refined-ui.css` + `css/admin.css`。
**注意**：HTML 里硬编码了一份 4 项导航，但脚本的 `setupWorkspaceNavigation("admin","tasks")` 会覆盖成 5 项。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | 管理员导航（已发布任务 active） |
| `.admin-heading.task-heading` | eyebrow "任务管理 / 完成进度" + `<h1>已发布任务` + 说明 + `#taskFilter` 下拉（全部任务 / 仍有未完成 / 全部完成） |
| `#taskResultNote` | "N 项任务 · 共 M 项已发布任务" / "正在同步任务…" / "同步失败" |
| `#taskList` | `<details class="task-card">` 折叠卡列表 |

**`<summary class="task-summary">` 摘要内容**：`title`；`scope` + `studentName || "全班学生"` + "发布于 {createdAt}"；`"N / M 完成"` + `"X 份草稿"`；完成率进度条（`completionRate%`）。

**展开 `.task-detail` 内容**：标题"完成详情" + `publisherName` · `type` · "预计 N 分钟"；`.completion-list` 里每个学生一行 `.completion-row`：
- `studentName` + 状态徽章（已完成 / 草稿 / 未开始）
- meta：已完成 → `"{submittedAt} · {subType || 文字提交}"`；草稿 → "已保存草稿，尚未正式提交"；未开始 → "暂无提交记录"
- `content`（提交内容，若有）

**调用 API**
- `GET /api/admin/tasks?limit=100` → `{ tasks[] }`
- `POST /api/auth/logout`

**交互行为**：切换筛选下拉 → 本地过滤重渲染（`incomplete`: `completedCount < targetCount`；`completed`: `targetCount>0 && completedCount===targetCount`）。原生 `<details>` 展开/收起，无 JS 介入。

**是否废弃**：否，核心。

---

### 4.19 `admin-timeline.html` — 成长时间线看板

**用途**：管理员视角跨学生回看全站成长记录 + 统计 + 趋势图。
**脚本**：`js/api.js` + `js/admin-timeline.js`（182 行）。**样式**：`css/refined-ui.css` + `css/admin.css` + `css/admin-timeline.css`。

**UI 区块**

| 区块 | 内容 |
| --- | --- |
| `.topbar` | 管理员导航（成长时间线 active） |
| `.timeline-heading` | eyebrow "管理员工作台 / 成长档案" + `<h1>成长时间线看板` + 说明 + `#updatedAt`（"更新于 …" / "正在同步…" / "同步失败"） |
| `.timeline-controls` 筛选 | `#studentFilter`（全部学生 + 各学生 name · grade）+ `#rangeFilter`（近 30 天 / 近 90 天(默认) / 全部记录）+ 类型三按钮（全部记录 / 孩子提交 / 观察记录，`.type-filter-btn[data-kind]`）+ `#refreshBtn` "↻ 刷新数据" |
| `.timeline-metrics` 四宫格 | `#metricTotal`（时间线记录）/ `#metricStudents`（有记录学生）/ `#metricSubmissions`（孩子提交）/ `#metricObservations`（教师观察） |
| `.timeline-feed-panel` | "成长足迹" + `#feedCount`（"N 条记录"）+ `#timelineFeed` 时间线 |
| `.timeline-insights` 右栏 | ① "最近 7 天 / 记录节奏" + `#trendTotal` + `#trendChart`（7 根柱状，今天高亮）；② "学生分布 / 活跃学生" + `#studentBars`（Top6 横向条 + "N 条"）；③ 图例（孩子提交 / 教师观察 / 教师反馈） |

**时间线条目 `.timeline-entry` 字段**：`createdAt`（日期块 M月D日 + HH:mm）、`title`、`kindLabel` 徽章（submission / observation）、（选"全部学生"时多一行 `studentName`）、meta（`studentName` / `grade` / `teacherName` 记录或发布于）、`content`、`analysis`（"教育观察"）、`tags[]` + `recipientCount`（"已通知 N 位家长"）、`feedback`（`feedback.teacherName` + `feedback.comment`）。

**调用 API**
- `GET /api/admin/growth-timeline?limit=500` → `{ items[], children[], generatedAt }`
- `POST /api/auth/logout`

**交互行为**：学生下拉 / 时间范围下拉 / 类型按钮 → 全本地重算（不重请求）；刷新按钮才重新拉数据（`state.loading` 防重入）。

**是否废弃**：否，核心。

---

### 4.20 `register.html` — 账号申请（**废弃**）

**用途**：静态说明页，告知家长账号不开放自助注册。
**脚本**：无。**样式**：`css/style.css` + `css/refined-ui.css`。

**UI 区块**：`.login-page` > `.login-card`：`.logo` + `<h1>家长账号暂不开放自助注册` + `.slogan`（"为保障学生信息安全，家长账号由学校管理员统一创建。"）+ "返回登录"按钮（`.btn-primary` 当链接用，跳 `index.html`）+ `.footer-note`（"如需账号，请联系班主任或学校管理员"）。

**调用 API**：无（`server.js` 里存在 `POST /api/auth/register`，但本页并未调用）。

**是否废弃**：**是**。全站无任何入口链接（`index.html` 里"家长账号由管理员统一创建"是纯文字，不是链接）。

---

### 4.21 `ai-analysis.html` — 成长档案说明（**孤儿静态页**）

**用途**：静态文案说明成长档案会包含什么。
**脚本**：无 JS。

**UI 区块**：`.topbar`（"`‹ 返回首页`" → home.html + 标题"成长档案说明"）→ `.card`（图标 + `<h1>成长档案持续沉淀中` + 说明）→ `.tips`（"成长档案会包含：" + 4 条列表：每周任务作品与提交记录 / 老师的轻量反馈和能力标签 / 基于成长档案的能力观察 / 适合家庭回顾的亲子互动建议）。

**调用 API**：无。

**是否废弃**：**是**。全站无任何入口（Grep 全库 `ai-analysis.html` 只在自身出现），且内容已被 `timeline.html` 完全覆盖。

---

### 4.22 `ai-class-overview.html` / 4.23 `admin-accounts.html` — 重定向壳

两者都是 `<meta http-equiv="refresh" content="0; url=...">` + `window.location.replace(...)` + 一行"正在前往…"提示，无任何业务内容。

| 文件 | 重定向目标 |
| --- | --- |
| `ai-class-overview.html` | `teacher-class-overview.html` |
| `admin-accounts.html` | `admin.html` |

**是否废弃**：**是**（历史 URL 兼容壳，小程序无 URL 概念，直接删）。

---

## 5. 四端导航结构

### 5.1 公共（未登录）

```
index.html (登录)
  ├─ role=teacher  → teacher.html
  ├─ role=admin    → admin.html
  ├─ role=student  → student.html
  └─ role=parent   → home.html
```

### 5.2 家长端（4 个主页面，横向 nav 互相跳转）

导航条完全一致（`.parent-nav`，4 项），每个页面还带 `#childSwitcher` 孩子切换器：

```
home.html (本周任务)  ←→  timeline.html (孩子成长时间线)
     ↕                          ↕
feedback.html (教师的反馈) ←→ parent-concern.html (成长关注)
```

辅助入口（不在导航里）：
- `questionnaire.html` —— 由 `/api/home` 返回 `needQuestionnaire` 时从上述 4 页强制跳转进入，提交后回 `home.html`。
- `parent-engagement.html` —— **当前无入口**（孤儿）。
- `task-detail.html` —— **当前无入口**（废弃）。

家长端关键全局状态：`localStorage.selectedChildId`（4 个主页面共享）。

### 5.3 学生端（2 个 tab）

```
student.html (任务提交) ←→ learning-garden.html (学习园地，占位)
```

学生端**没有**孩子切换器（学生即本人），也没有家长端那种状态标签之外的复杂交互。

### 5.4 教师端（6 个页面，横向 nav 全互通）

导航条（6 项，每个教师页都有完整一份，复制粘贴）：

```
teacher.html (今日记录 / 导航文案误写为"全局报告")
teacher-ai.html (AI 洞察)
teacher-class-overview.html (班级概览)
teacher-publish.html (发布任务)
teacher-submissions.html (学生提交)
teacher-students.html (学生档案)
```

**任意两页之间都能直接跳转**（完整 6×6 互联）。

额外的跨页跳转：
- `teacher-class-overview.html` → "调整班级任务" → `teacher-publish.html`（`teacher-class-overview.html:447`）
- `teacher-page.js` 的指标卡（死代码分支）原本会跳 `teacher-students.html` / `teacher-submissions.html`（带 `#filter=incomplete` / `#filter=unsubmitted` hash）
- `teacher-students.html` 支持 hash 筛选：`#filter=incomplete` / `#filter=unsubmitted`

闭环链路：
```
parent-concern.html (家长提交成长关注)
      ↓ POST /api/parent/task-requests
teacher-publish.html (教师审核 → 同意则生成任务)
      ↓ POST /api/teacher/tasks
home.html (家长端看到本周任务) → 提交 → teacher-submissions.html (教师批阅)
      ↓ POST /api/teacher/feedback
feedback.html / timeline.html (家长看到反馈)
```

### 5.5 管理员端（5 项导航，由 `setupWorkspaceNavigation` 动态注入）

`js/api.js:86-92` 定义的管理员导航（**只有 role==="admin" 时才注入**）：

| # | 标签 | 目标 |
| --- | --- | --- |
| 1 | 账号管理 | `admin.html`（实际执行 `js/admin-accounts.js`） |
| 2 | 已发布任务 | `admin-tasks.html` |
| 3 | 成长时间线 | `admin-timeline.html` |
| 4 | AI 洞察 | `teacher-ai.html`（**跳到教师端页面**） |
| 5 | 学生档案 | `teacher-students.html`（**跳到教师端页面**） |

也就是说管理员端只有 **3 个自有页面**（`admin.html` / `admin-tasks.html` / `admin-timeline.html`），另外 2 项复用教师端页面。离开这 2 个复用页后，因为 `teacher-ai.html` / `teacher-students.html` 的守卫允许 admin（`teacher-students.html` 显式允许；`teacher-ai.html` 未做 role 限制），可以再跳回教师端任意页面——**管理员可以直接进入整个教师端 6 页**（除 `teacher.html` / `teacher-publish.html` / `teacher-submissions.html` / `teacher-class-overview.html` 会强制踢回 `home.html`，因为它们要求 `role === "teacher"`）。

> 这是一个**当前存在的一致性缺陷**：管理员从导航点进 `teacher-ai.html` 后，再点导航里的"学生提交"会被踢回 `home.html`。小程序重写时应统一权限矩阵。

---

## 6. API 调用矩阵

图例：● 主要数据接口　○ 次要/辅助　× 仅 logout

| API | 页面 |
| --- | --- |
| `POST /api/auth/login` | index |
| `POST /api/auth/logout` | 所有已登录页面（除 ai-analysis / register / 重定向壳） |
| `POST /api/events` | 全局（trackEvent）+ home / feedback / timeline / task-detail / teacher-class-overview |
| `POST /api/questionnaire` | questionnaire |
| `GET /api/home?childId=` | ●home ●timeline ●feedback ●parent-concern ○task-detail ○parent-engagement |
| `POST /api/children` | home（绑定孩子） |
| `GET /api/timeline?childId=` | ●timeline ●feedback |
| `POST /api/submissions` | ●home ●student ○task-detail |
| `GET /api/student/home` | ●student |
| `GET /api/parent/notifications?limit=6` | ●home |
| `POST /api/parent/notifications/{id}/read` | ●home |
| `POST /api/parent/notifications/read-all` | ●home |
| `GET /api/parent/task-requests?childId=` | ●parent-concern |
| `POST /api/parent/task-requests` | ●parent-concern |
| `GET /api/parent/engagement?childId=` | ●parent-engagement |
| `POST /api/parent/engagement-feedback` | ●parent-engagement |
| `POST /api/parent/engagement-preference` | ●parent-engagement |
| `GET /api/teacher/daily-updates?limit=30` | ●teacher |
| `POST /api/teacher/daily-updates` | ●teacher |
| `GET /api/teacher/global-report?local=1` | ●teacher-ai ○teacher-students |
| `GET /api/teacher/global-report?ai=1` | ●teacher-ai（带轮询） |
| `POST /api/teacher/ai-chat?stream=1` | ●teacher-ai（fetch + SSE） |
| `POST /api/teacher/notifications` | ●teacher-ai |
| `GET /api/teacher/ai-overview` | ●teacher-class-overview |
| `GET /api/teacher/overview` | ●teacher-submissions |
| `GET /api/teacher/submissions/{id}` | ●teacher-submissions |
| `POST /api/teacher/submissions/ai-feedback` | ●teacher-submissions |
| `POST /api/teacher/feedback` | ●teacher-submissions |
| `POST /api/teacher/tasks` | ●teacher-publish ●teacher-students |
| `GET /api/teacher/parent-task-requests` | ●teacher-publish |
| `POST /api/teacher/parent-task-requests/review` | ●teacher-publish |
| `GET /api/teacher/students` | ●teacher-students |
| `GET /api/teacher/student-suggestions?childId=` | ●teacher-students |
| `GET /api/admin/accounts` | ●admin |
| `POST /api/admin/accounts` | ●admin |
| `PUT /api/admin/accounts/{id}` | ●admin |
| `DELETE /api/admin/accounts/{id}` | ●admin |
| `GET /api/admin/tasks?limit=100` | ●admin-tasks |
| `GET /api/admin/growth-timeline?limit=500` | ●admin-timeline |

**后端存在但前端未调用的接口**：`POST /api/auth/register`（`server.js:2258`）。

---

## 7. 小程序重写要点与风险提示

### 7.1 必须替换的 Web 专有能力

| Web 用法 | 位置 | 小程序替代 |
| --- | --- | --- |
| `localStorage` | 全站（auth / selectedChildId / fitKey / teacherAi 缓存 / notificationHidden） | `wx.setStorageSync` / `wx.getStorageSync` |
| `window.location.href` 跳转 | 全站 | `wx.navigateTo` / `wx.redirectTo` / `wx.switchTab` |
| `window.location.reload()` | home / student / task-detail 提交成功后 | 改为重新请求并 `setData` |
| `location.hash` 筛选 | teacher-students（`#filter=incomplete`） | 改为 `wx.navigateTo` 带 query，在 `onLoad(options)` 读取 |
| `FileReader.readAsDataURL`（附件转 base64 存库） | home / task-detail | `wx.chooseMedia` + `wx.uploadFile`（**后端需改造：目前附件是 base64 直接存 SQLite**） |
| `webkitSpeechRecognition` 语音识别 | teacher.html | `wx.getRecorderManager` + 后端接入语音转写（后端当前只收文本 `transcript`） |
| `fetch` + `ReadableStream` SSE | teacher-ai.html AI 对话流式 | `wx.request({ enableChunked: true })` + `onChunkReceived`（需自行拼接/解析 SSE，iOS 与安卓表现有差异，建议评估是否退化为非流式） |
| `navigator.clipboard.writeText` | teacher-ai.html 复制通知 | `wx.setClipboardData` |
| `<details>/<summary>` 原生折叠 | admin-tasks | 自行实现折叠或用 `wx` 组件 |
| `@media` 响应式 + 移动端独立 DOM（`.mobile-card-list`、抽屉） | 多页 | 小程序天然单宽度，两套 DOM 可合并为一套 |
| `new Date` / `Intl.DateTimeFormat` 时区处理 | 全站（多处手动补 `+08:00`） | 保留逻辑，注意小程序基础库对 `Intl` 的支持（建议自写格式化函数） |
| `location.protocol === "file:"` 检测 | login.js | 删除 |

### 7.2 建议的页面合并与拆分

- **`task-detail.html` 直接删除**（被 home 覆盖）。
- **`home.html` 太大**（任务 + 提交 + 通知 + 绑定 + 适配度），小程序建议拆成：
  - `pages/parent/home`（任务 + 状态 + 提交入口）
  - `pages/parent/submit`（5 种提交类型的独立页，`onLoad` 带 taskId/childId）
  - 通知条 / 绑定孩子 / 适配度做成组件或弹层
- **`teacher-publish.html` 建议拆成两个 tab 页**：发布任务 / 家长请求审核（当前一个页面承载两套完全不同的逻辑）。
- **`parent-engagement.html`** 需产品决策后再决定是否保留。
- **`register.html` / `ai-analysis.html` / 两个重定向壳**：直接不迁移。

### 7.3 需要后端配合改造的点

1. **附件方案**：当前前端把图片/音视频转成 base64 塞进 `submissions.attachments` JSON 存 SQLite，单条限制 4.5MB、最多 3 个。小程序应改为对象存储 + URL。
2. **SSE 流式**：`/api/teacher/ai-chat?stream=1` 在小程序 `wx.request` 分块接收下需验证兼容性，必要时提供非流式兜底。
3. **语音转写**：`teacher.html` 目前依赖浏览器 Web Speech API 在前端转文字，小程序需后端提供"音频 → 文字"接口。
4. **推送/通知**：`teacher-class-overview.html` 的催交、提醒目前是纯前端 toast，没有后端支撑；小程序若要真实通知需接订阅消息。
5. **权限矩阵**：管理员复用教师页面存在跳转后被打回的问题（见 5.5），重写时应在后端/前端统一定义 `role → 可访问页面` 映射。

### 7.4 数据字段速查（`GET /api/home` 为核心）

```
/api/home?childId=
  children[]        { id, name, grade }
  child             { id, name, grade }
  task              { id, task_type, title, duration, difficulty, materials,
                      fallback_plan, goal, steps, dialogue_tips, submit_hint }
  taskStatus        "ongoing" | "draft" | "submitted" | "done"
  submission        { content, sub_type, status, attachments }
  feedback          { comment, tags }
  needQuestionnaire boolean
  selectedChildInvalid boolean
```

其余接口的字段已在第 4 节各页面的"UI 区块"表格中逐项列出。
