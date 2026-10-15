# 家校共育系统 · 后端 API 契约（微信小程序重写参考）

> 本文档由 `server.js` 的 `handleApi()`（2256–4423 行）逐行提取，**所有字段名与后端源码完全一致**，未做任何驼峰/下划线统一。
> 后端：单文件 Express（`server.js`）；数据库：SQLite（`data/app.db`，也兼容 Neon PostgreSQL）。
> 全文共 **45 个接口**（含 1 个已停用接口）。

---

## 0. 横切逻辑（必读）

### 0.1 鉴权方式

- 请求头：`Authorization: Bearer <token>`（**大小写不敏感**，Node 会把 header 名小写化；前缀必须是 `Bearer `，含一个空格，源码用 `header.startsWith("Bearer ")` 判断，然后 `slice(7)`）。
- `getAuthUser(req)`（`server.js:130`）：

  ```js
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  SELECT u.id, u.account, u.display_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?
  ```

  - 返回字段：`id`、`account`、`display_name`、`role`（**注意是 `display_name`，不是 `displayName`**）。
  - token 即 `sessions.token`，`crypto.randomBytes(24).toString("hex")` → 48 位十六进制字符串。
  - session **无过期时间**（表内只有 `created_at`，不做校验）。
- 全局流程：登录接口之后的**所有**接口都会先执行 `getAuthUser`，失败直接
  `401 {"message":"请先登录"}`。
- CORS 已全开（`Access-Control-Allow-Origin: *`，允许 `Authorization` 头），`OPTIONS` 直接 204。

### 0.2 角色（role）

`parent` / `student` / `teacher` / `admin`，存于 `users.role`。

### 0.3 路由匹配顺序（很重要的坑）

`handleApi` 是**顺序 if 链**，顺序如下：

```
1. POST /api/auth/register          → 410
2. POST /api/auth/login
3. 【登录校验】getAuthUser
4. POST /api/auth/logout
5. GET  /api/me、PUT /api/me/avatar （任意登录角色，个人资料 / 头像）
6. admin 专属接口（overview / accounts / tasks / growth-timeline）
7. POST /api/events                 （任意登录角色）
8. POST /api/children               （parent）
9. GET  /api/student/home           （student）
10. GET  /api/home                   （parent）
11. parent/* 系列接口
12. POST /api/questionnaire         （parent）
13. POST /api/submissions           （parent | student）
14. GET  /api/timeline              （任意，但需 canAccessChild）
15. parent/engagement* 三个接口
15. 【门禁】if (role !== 'teacher' && role !== 'admin') → 403 "仅教师或管理员账号可访问"
16. teacher/* 系列接口
17. 兜底 404 {"message":"接口不存在"}
```

**后果**：

- 教师/管理员访问 `/api/home`、`/api/parent/*`、`/api/questionnaire` → `403 仅家长账号可访问…`
- 家长/学生访问 `/api/teacher/*` → `403 仅教师或管理员账号可访问`
- **未匹配任何路由 → `404 {"message":"接口不存在"}`**，不是 405。用错 HTTP 方法（例如 `GET /api/submissions`）也会落到这里返回 404。

### 0.4 数据可见性：`canAccessChild`（`server.js:147`）

```js
if (!childId) return false;
if (user.role === "teacher") return !!children表存在该 id;   // 教师可访问任意孩子
return (role === "parent" || role === "student") && bindings 表存在 (user.id, childId);
```

> 坑：**`admin` 角色没有被 `canAccessChild` 放行**，admin 走 childId 相关接口会 403。
> 教师创建任务时的 `canAccessChild` 也只校验孩子存在性。

### 0.5 "真实学生"过滤（demo 过滤）

后端大量 SQL 用 `realStudentWhere("c")` / `realParentWhere("u")` 过滤掉账号为 **`demo`** 的家长及其孩子：

- `realStudentWhere`：孩子必须由 **非 demo 家长** 通过 `bindings` 绑定，或在 `questionnaires` 中由非 demo 家长创建。
- `realParentWhere`：`role='parent' AND account NOT IN ('demo')`。

**小程序端无需感知**，但如果用 demo 账号登录，教师端概览/报告/学生列表会看不到数据。

### 0.6 分页 / limit 参数汇总

| 接口 | 参数 | 默认 | 夹取范围 | 说明 |
|---|---|---|---|---|
| `GET /api/admin/tasks` | `limit` | 100 | 1–200 | 同时限制 tasks 与其 submissions 子查询 |
| `GET /api/admin/growth-timeline` | `limit` | 300 | 1–500 | 非有限数时回落 300 |
| `GET /api/parent/notifications` | `limit` | 6 | 1–20 | |
| `GET /api/teacher/daily-updates` | `limit` | 20 | 1–50 | |
| `GET /api/teacher/overview` | — | 固定 50 | — | 硬编码 `LIMIT 50` |
| `GET /api/teacher/parent-task-requests` | `status` | 全部 | `pending`/`approved`/`rejected` | 内存过滤 |
| `GET /api/teacher/parent-task-requests` | — | 无 LIMIT | — | 全量返回 |
| `POST /api/parent/task-requests`(GET 版) | — | 固定 20 | — | `LIMIT 20` |
| `GET /api/teacher/global-report` | `local` | — | `local=1` 跳过 AI | |
| `GET /api/admin/worries` | `limit` | 100 | 1–200 | 同时返回 `newCount`（未读提交数） |
| `GET /api/student/worries` | `limit` | 50 | 1–100 | 同时返回 `newReplyCount`（未读回复数） |
| `POST /api/teacher/ai-chat` | `stream` | — | `stream=1` → SSE | |

> **没有 offset / page 参数**，全部是 limit-only。写死 LIMIT 的接口无法翻页。

### 0.7 日期处理：`mondayOf()`（`server.js:51`）

```js
function mondayOf(d) {
  const dt = new Date(d);
  const wd = dt.getDay() === 0 ? 7 : dt.getDay();   // 周日算 7
  dt.setDate(dt.getDate() - (wd - 1));
  return `${yyyy}-${MM}-${dd}`;
}
```

- **本周边界 = 周一 00:00（服务器本地时区）**，周日被归入**上一个**周一所在的周（即周日属于"本周最后一天"，不会跳到下一周）。
- `week_start` 字段格式：`YYYY-MM-DD`，例如 `2026-10-12`。
- 任务发布/审核一律用 `mondayOf(new Date())`，即"当时所在周"，**不做跨时区换算**。小程序端若做本地周计算，必须和服务器时区一致（服务器用 `datetime('now','localtime')`）。
- 另有 `lastMondayOf(d)` = 上周一（全局报告等处使用）。
- 时间字段（`created_at` 等）来自 `datetime('now','localtime')`，格式 `YYYY-MM-DD HH:MM:SS`，**无时区后缀**。前端排序时后端用 `replace(" ","T") + "+08:00"` 兜底，小程序端也应按 `+08:00` 解析。

### 0.8 请求体（readBody，`server.js:101`）

- 必须是 JSON，否则 `400 {"message":"请求格式不正确","errorCode":"INVALID_JSON"}`。
- 空 body → `{}`。
- **超过 6 MB → `413 {"message":"请求内容过大","errorCode":"BODY_TOO_LARGE"}`**。
- 所有字段基本都走 `String(body.xxx || "")` + `.trim()`（注意：**falsy 值 0 / false 会被当成空字符串吞掉**，见 `/api/parent/engagement-preference` 的 `enabled` 特例）。

### 0.9 提交内容 content 与附件 attachments

- `submissions.content` 是 **TEXT 纯文本**（`String(body.content||"").trim()`），**不是富文本 JSON / HTML**。旧前端的"富文本"最终落库仍是纯文本。
- `submissions.sub_type` 枚举：`text` | `check` | `image` | `audio` | `video`（不在枚举内一律回落 `text`）。
- `submissions.attachments` 是 **JSON 字符串**（落库为字符串，默认 `"[]"`），数组元素结构（`lib/attachments.js`）：

  | 字段 | 类型 | 说明 |
  |---|---|---|
  | `name` | string | 截取前 80 字符 |
  | `type` | string | MIME，仅允许 `image/jpeg`、`image/png`、`image/webp`、`audio/mpeg`、`audio/wav`、`audio/ogg`、`video/mp4`、`video/webm` |
  | `size` | number | 单文件 ≤ 15 MB（`15*1024*1024`） |
  | `url` | string | 必须是 `data:` 或 `http(s)://` 开头；长度 ≤ 2,000,000 |

  约束：最多 **6** 个附件。校验失败 → `400 {"message":"…","errorCode":"INVALID_ATTACHMENT"}`
  （`最多只能添加 6 个附件` / `暂不支持该附件类型` / `单个附件不能超过 15MB` / `附件地址过长` / `附件地址格式不正确`）。
- **文件上传**：后端**没有** multipart 上传接口。小程序需先自行上传到对象存储/图床，或把小文件转 `data:` base64 URL 再放进 `attachments[].url`。

### 0.10 统一错误响应

`sendJson`（`server.js:64`）：当 `code >= 400` 时自动注入 `requestId`，且响应头带 `X-Request-Id`。

```json
{ "message": "账号或密码错误", "errorCode": "REQUEST_NOT_FOUND", "requestId": "req_xxx" }
```

- 业务错误通常只有 `message`；事务内抛出的 `ApiError` 会带 `errorCode`。
- 未捕获异常（`lib/errors.js`）：`status >= 500` 时 `message` 被替换为 `"服务器暂时无法完成请求"`。

### 0.11 常见 errorCode 一览

| errorCode | HTTP | 出现位置 |
|---|---|---|
| `PUBLIC_REGISTRATION_DISABLED` | 410 | `/api/auth/register` |
| `INVALID_JSON` | 400 | 任意 POST/PUT，body 解析失败 |
| `BODY_TOO_LARGE` | 413 | body > 6 MB |
| `INVALID_ATTACHMENT` | 400 | `/api/submissions` 附件非法 |
| `ACCOUNT_EXISTS` | 409 | `/api/admin/accounts` 建号/改号重名 |
| `PARENT_NOT_FOUND` | 400 | 建/改学生账号时 `parentAccount` 不存在 |
| `SUBMISSION_EXISTS` | 409 | 重复正式提交同一任务 |
| `REQUEST_ALREADY_REVIEWED` | 409 | 成长关注反馈已被处理过 |
| `REQUEST_NOT_FOUND` | 404 | 成长关注反馈不存在（事务内） |
| `INTERNAL_ERROR` / `REQUEST_ERROR` | 500 / 4xx | 兜底 |

### 0.12 常见状态枚举

| 枚举字段 | 取值 |
|---|---|
| `submissions.status` | `draft` / `submitted` |
| `parent_task_requests.status` | `pending` / `approved` / `rejected` |
| `parent_task_requests.ai_status` | `ai` / `fallback`（建表默认 `pending`） |
| `teacher_daily_updates.ai_status` | `ai` / `fallback` |
| `tasks.difficulty` | `简单` / `普通` / `进阶`（非法值回落 `普通`） |
| `tasks.task_type` / `suggestion.type` | `阅读`、`习惯养成`、`学科应用`、`情绪社交`、`家务实践`、`运动健身`、`观察探究`（学生建议里还允许 `观察探究`；教师发布任务**不做枚举校验**，默认 `阅读`） |
| engagement `status` | `insufficient` / `low` / `medium` / `high` |
| engagement `level` | `证据不足` / `近期主动关注证据较少` / `有一定主动关注` / `主动关注证据较高` |
| engagement `confidence` | `高` / `中` / `低` |
| `studentProgress.riskLevel` | `green` / `yellow` / `red` |
| notification `type` | `announcement` / `teacher_daily_update` / `parent_task_request` |
| 首页 `taskStatus` | `none` / `ongoing` / `draft` / `submitted` / `done`（**学生端没有 `done`**） |
| admin/tasks detail `status` | `not_started` / `draft` / `completed` |

### 0.13 事件埋点类型（用于 `POST /api/events` 的 `eventType`）

后端已识别并统计的类型（`BEHAVIOR_TYPE_NAMES`，`server.js:1278`）：

```
parent_logged_in              → 家长登录系统
task_card_viewed              → 查看任务卡片
task_detail_viewed            → 查看任务详情
feedback_card_viewed          → 查看反馈卡片
timeline_viewed               → 回看成长档案
submission_drafted            → 起草提交
submission_submitted          → 完成提交
parent_task_request_submitted → 提交成长关注反馈
teacher_contact_started       → 发起沟通
page_dwell                    → 页面停留
questionnaire_viewed          → 查看问卷
student_task_page_viewed      → 学生首页浏览（后端自动打）
engagement_page_viewed        → 关注页浏览（后端自动打）
engagement_analysis_enabled / _disabled
engagement_judgment_corrected
```

> 后端**会自动**打点：`parent_logged_in`（登录时）、`student_task_page_viewed`（学生首页）、`timeline_viewed`（时间线）、`engagement_page_viewed`、`submission_drafted/submitted`（提交时）、`parent_task_request_submitted`。前端只需补 `task_card_viewed`、`task_detail_viewed`、`feedback_card_viewed`、`page_dwell`、`questionnaire_viewed`、`teacher_contact_started`。

### 0.14 原始表字段速查（响应里大量直接 `SELECT *` 返回）

| 表 | 字段 |
|---|---|
| `users` | `id`, `account`, `password_hash`, `display_name`, `role`, `phone`, `email`, `subject`, `employee_no`, `created_at` |
| `children` | `id`, `name`, `grade`, `created_at`, `gender`, `age`, `caregiver`, `interests`, `family_note`, `user_id` |
| `bindings` | `id`, `user_id`, `child_id`, `relation` |
| `tasks` | `id`, `title`, `goal`, `steps`, `dialogue_tips`, `submit_hint`, `duration`, `task_type`, `week_start`, `published_by`, `created_at`, `child_id`, `difficulty`, `materials`, `fallback_plan` |
| `submissions` | `id`, `task_id`, `child_id`, `content`, `sub_type`, `created_at`, `status`, `attachments` |
| `feedback` | `id`, `submission_id`, `teacher_id`, `comment`, `tags`, `read_at`, `created_at` |
| `parent_task_requests` | `id`, `user_id`, `child_id`, `title`, `description`, `goal`, `duration`, `status`, `teacher_id`, `teacher_comment`, `task_id`, `concern_category`, `observed_behavior`, `context`, `frequency`, `impact`, `parent_expectation`, `family_constraints`, `ai_plan`, `ai_status`, `created_at`, `reviewed_at` |
| `notifications` | `id`, `recipient_user_id`, `sender_user_id`, `type`, `title`, `content`, `read_at`, `created_at` |
| `teacher_daily_updates` | `id`, `teacher_id`, `child_id`, `student_name`, `transcript`, `summary`, `analysis`, `parent_message`, `tags`, `ai_status`, `recipient_count`, `created_at` |
| `questionnaires` | `id`, `user_id`, `child_id`, `answers`(JSON 字符串), `created_at` |
| `student_worries` | `id`, `student_user_id`, `child_id`, `student_name`, `grade`, `content`, `read_at`（管理员是否已查看）, `reply_content`, `reply_by`, `reply_by_name`, `replied_at`, `reply_read_at`（学生是否已读回复）, `created_at` |

---

## 1. 认证（3 个）

### 1.1 `POST /api/auth/register` —— 已停用

- 权限：无
- 响应：`410`

```json
{ "message": "家长账号由管理员统一创建", "errorCode": "PUBLIC_REGISTRATION_DISABLED" }
```

> 小程序端**不要**做注册页，账号全部由管理员在后台创建。

### 1.2 `POST /api/auth/login`

- 权限：无
- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `account` | string | 是 | `String(body.account||"").trim()`，按账号精确匹配 |
| `password` | string | 是 | 明文，后端用 scrypt 校验 |

- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `token` | string | 48 位 hex，后续放 `Authorization: Bearer <token>` |
| `user.id` | string | `users.id`（SQLite 下由驱动返回为字符串） |
| `user.account` | string | |
| `user.displayName` | string | **注意是驼峰**，映射自 `users.display_name` |
| `user.role` | string | `parent`/`student`/`teacher`/`admin` |
| `user.avatarUrl` | string | 自定义头像，未设置时为 `""`，前端回落到角色默认头像 |

```json
{ "token": "a1b2...", "user": { "id": "12", "account": "parent01", "displayName": "张妈妈", "role": "parent", "avatarUrl": "" } }
```

- 错误：
  - `401 {"message":"账号或密码错误"}`（账号不存在或密码错误，同一提示）
- 副作用：若为 `parent` 角色，会为每个已绑定孩子写一条 `parent_logged_in` 事件。

### 1.3 `POST /api/auth/logout`

- 权限：**需登录**（任意角色）
- 请求体：无
- 成功 `200`：`{ "ok": true }`
- 行为：`DELETE FROM sessions WHERE token = <token>`（仅删当前 token）
- 注意：源码直接 `req.headers["authorization"].slice(7)`，因前置已鉴权，header 必然存在。

### 1.4 `GET /api/me`

- 权限：**需登录**（任意角色）
- 成功 `200`：`{ "user": { id, account, displayName, role, avatarUrl } }`
- 行为：按当前 token 重新查一次 `users`，用于同步最新资料（主要是头像）。

### 1.5 `PUT /api/me/avatar`

- 权限：**需登录**（任意角色）
- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `url` | string | 是 | 为空字符串表示**恢复默认角色头像**；否则必须匹配 `data:image/(jpeg\|jpg\|png\|webp);base64,...` 或 `https://...`，且长度 ≤ `MAX_AVATAR_URL_LENGTH`（550000） |

- 成功 `200`：`{ "user": { ..., "avatarUrl": "<url>" } }`
- 错误：
  - `400 {"message":"头像格式不正确，仅支持 JPG / PNG / WebP"}`
  - `413 {"message":"头像图片过大，请重新选择更小的图片","errorCode":"AVATAR_TOO_LARGE"}`
- 行为：`UPDATE users SET avatar_url = ? WHERE id = ?`。
- 小程序端流程：`wx.chooseMedia` → 离屏 canvas 裁成 320×320 JPEG → `FileSystemManager.readFile({encoding:"base64"})` 拼成 data URL → 调本接口落库。不经过 `POST /api/uploads`，避免 multipart 的 Content-Type 判定问题。

---

## 2. 家长端（11 个）

> 以下接口除标注外，均要求 `role === 'parent'`，否则 `403`。

### 2.1 `POST /api/children` —— 绑定/新增孩子

- 权限：parent（`403 仅家长账号可绑定孩子`）
- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `name` | string | **是** | 非空，`400 请填写孩子姓名/昵称` |
| `grade` | string | 否 | 默认空串 |

- 成功 `200`：`{ "child": {…children 表全字段…} }`（`SELECT * FROM children WHERE id = ?`）
- 行为：事务内 `INSERT INTO children (name, grade)` + `INSERT OR IGNORE INTO bindings (user_id, child_id)`。
- ⚠️ 只写 `name`/`grade`，**不写** `gender/age/caregiver/interests/family_note`；要这些字段请用问卷接口 `POST /api/questionnaire`。

### 2.2 `GET /api/home` —— 家庭首页聚合

- 权限：parent（`403 仅家长账号可访问家庭首页`）
- Query：

| 参数 | 类型 | 说明 |
|---|---|---|
| `childId` | number | 可选。若传入但不属于当前家长 → 仍返回 200，但 `selectedChildInvalid = true` 且回落到第一个孩子 |

- 成功 `200`，顶层字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `children` | Array\<children 全字段\> | 通过 bindings 或 questionnaires 关联的孩子，`ORDER BY c.id` |
| `child` | object \| null | 当前选中孩子（children 表全字段） |
| `task` | tasks 全字段 \| null | 本周任务：优先 `child_id = 当前孩子`，否则 `child_id IS NULL`（班级任务）；均按 `id DESC LIMIT 1` |
| `taskStatus` | string | `none` / `ongoing` / `draft` / `submitted` / `done`。有反馈时从 `submitted` 升级为 `done` |
| `submission` | submissions 全字段 \| null | 该任务下最新一条提交（含 draft） |
| `feedback` | object \| null | 最新反馈，字段 = feedback 全字段 + `teacher_name` + `task_title` |
| `unreadCount` | number | `feedback.read_at IS NULL` 的条数 |
| `timeline` | `{ taskCount, workCount }` | `taskCount`=去重 task 数，`workCount`=提交数（均只统计 `submitted`） |
| `parentTaskRequest` | object \| null | 最近一条成长关注反馈，**仅**含 `id, title, description, goal, duration, status, teacher_comment, task_id, created_at, reviewed_at, task_title`（老师确认后生成的定制任务标题，无则 null） |
| `needQuestionnaire` | boolean | 无孩子且未填问卷时为 `true` → 跳问卷页 |
| `engagement` | object \| null | `engagementEnabled=false` 时为 `null` |
| `engagementEnabled` | boolean | 默认 `true` |
| `selectedChildInvalid` | boolean | `childId` 非法 |

- `engagement` 对象结构（`getParentEngagement`，`server.js:245`，统计窗口固定 **30 天**）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `windowDays` | number | 固定 30 |
| `score` | number | 0–100 |
| `level` | string | `证据不足`/`近期主动关注证据较少`/`有一定主动关注`/`主动关注证据较高` |
| `status` | string | `insufficient`/`low`/`medium`/`high` |
| `confidence` | string | `高`/`中`/`低` |
| `evidence` | string[] | 中文证据描述数组 |
| `recommendation` | string | 建议文案 |
| `counts.touchpoints` | number | `task_card_viewed + feedback_card_viewed + task_detail_viewed` |
| `counts.exploration` | number | `task_detail_viewed + timeline_viewed + feedback_card_viewed` |
| `counts.followThrough` | number | `submission_drafted + submission_submitted + teacher_contact_started + parent_task_request_submitted` |
| `counts.activeDays` | number | 近 30 天有有效事件的天数 |
| `counts.events` | number | 事件总数 |

- 错误：`403` 仅角色不符。

### 2.3 `GET /api/parent/notifications` —— 通知列表

- 权限：parent（`403 仅家长账号可查看通知`）
- Query：`limit` 默认 6，夹取 1–20
- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `notifications` | Array | 元素字段：`id`, `type`, `title`, `content`, `read_at`, `created_at`, `sender_name`（来自 `users.display_name`，可能为 null） |
| `unreadCount` | number | 全量未读数（不受 limit 影响） |

- 排序：`ORDER BY n.id DESC`

### 2.4 `POST /api/parent/notifications/read-all` —— 全部标记已读

- 权限：parent（`403 仅家长账号可标记通知`）
- 请求体：无
- 成功 `200`：`{ "ok": true }`

### 2.5 `POST /api/parent/notifications/:id/read` —— 单条已读

- 路径正则：`/^\/api\/parent\/notifications\/(\d+)\/read$/`
- 权限：parent（`403 仅家长账号可标记通知`）
- 请求体：无
- 成功 `200`：`{ "ok": true }`
- 说明：即使 id 不存在也返回 `ok: true`（UPDATE 影响 0 行不报错）。

### 2.6 `GET /api/parent/task-requests` —— 成长关注列表

- 权限：parent（`403 仅家长账号可查看成长关注`）
- Query：`childId` 可选；传入且 `!canAccessChild` → `403 无权访问该孩子信息`
- 成功 `200`：`{ "requests": [ … ] }`，固定 `LIMIT 20`，`ORDER BY r.id DESC`
- 元素字段：`id`, `child_id`, `title`, `concern_category`, `observed_behavior`, `status`, `teacher_comment`, `task_id`, `created_at`, `reviewed_at`, `task_title`（LEFT JOIN tasks，无则 null）

### 2.7 `POST /api/parent/task-requests` —— 提交成长关注反馈（描述孩子不足，非任务）

- 权限：parent（`403 仅家长账号可提交成长关注反馈`）
- 语义边界：家长只负责**描述孩子需要支持的具体表现**；服务端会调用 AI 生成「中性总结 + 任务草案」存入 `ai_plan`，此时**不会创建任何任务**；教师确认后才生成正式定制任务并推送家长端与学生端。
- 请求体：

| 字段 | 类型 | 必填 | 校验 / 处理 |
|---|---|---|---|
| `childId` | number | **是** | `Number()`；`!childId` 或 `!canAccessChild` → `403 无权访问该孩子信息` |
| `category` | string | 否 | trim，截 40 字 → `concern_category` |
| `observedBehavior` | string | **是** | 别名 `description`；trim 后即 `description`；**长度 < 4 → `400 请至少写 4 个字描述你观察到的具体情况`**；> 1200 → `400 描述内容过长，请适当精简后再提交` |
| `description` | string | 否 | `observedBehavior` 的别名 |
| `context` | string | 否 | trim，> 1000 → 400 |
| `frequency` | string | 否 | trim，截 40 字 |
| `impact` | string | 否 | trim，> 800 → 400 |
| `parentExpectation` | string | 否 | 别名 `goal`；trim，> 800 → 400；截 160 字写入 `goal` |
| `goal` | string | 否 | `parentExpectation` 的别名 |
| `familyConstraints` | string | 否 | trim，> 800 → 400 |
| `title` | string | 否 | trim，截 60 字；缺省用 `category + "方面的成长关注"` 或 `"孩子近期的成长关注"` |
| `duration` | number | 否 | `Math.max(5, Math.min(90, Number(body.duration) \|\| 20))` |

- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `ok` | boolean | `true` |
| `request` | object | `id, title, concern_category, observed_behavior, duration, status, teacher_comment, task_id, created_at, reviewed_at, ai_status` |
| `aiStatus` | string | `ai` / `fallback` |
| `message` | string | 成功提示文案 |
| `vectorIndexed` | boolean | 向量索引是否成功 |

- ⚠️ `request` 里**没有** `description`、`goal`、`context`、`child_id`。

### 2.8 `POST /api/questionnaire` —— 首次登录问卷（创建孩子档案 + 绑定）

- 权限：parent（`403 仅家长账号需要填写问卷`）
- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `childName` | string | **是** | `400 请填写孩子昵称` |
| `gender` | string | **是** | 必须是 `男` 或 `女`，否则 `400 请选择孩子性别` |
| `age` | number | **是** | 3–18，否则 `400 请填写 3-18 之间的年龄` |
| `caregiver` | string[] \| string | **是** | 多选数组或单值；去重后 join `、`；空 → `400 请选择主要陪伴人` |
| `caregiverOther` | string | 否 | 追加进 caregivers 数组 |
| `taskPreference` | string | **是** | 必须是 `低负担` / `短时长` / `高参与度` / `长时长`，否则 `400 请选择希望共同完成的任务类型偏好` |
| `interests` | string[] | 否 | 数组 → `join(",")`；非数组 → 空串 |
| `familyNote` | string | 否 | |
| `grade` | string | 否 | |
| `timeAvailable` | string | 否 | 写入 questionnaires.answers |

- 成功 `200`：`{ "child": {…children 全字段…}, "vectorIndexed": boolean }`
- 行为：事务内建 children + `INSERT OR IGNORE INTO bindings` + 写 `questionnaires`（`answers` = `JSON.stringify({timeAvailable, taskPreference, familyNote, interests})`）。
- ⚠️ **问卷是"一次性建档"入口**，重复提交会创建新孩子档案。

### 2.9 `GET /api/parent/engagement` —— 家长关注记录与透明说明

- 权限：parent（`403 仅家长账号可查看自己的关注记录`）
- Query：`childId` **必填**；缺失或无权 → `403 无权访问该孩子的关注记录`
- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `child` | object \| null | `id`, `name`, `grade` |
| `engagement` | object | 同 2.2 的 engagement 结构 |
| `enabled` | boolean | 关注分析开关 |
| `collected` | string[] | 固定 3 条文案 |
| `notCollected` | string[] | 固定 4 条文案 |

- 副作用：写 `engagement_page_viewed` 事件。

### 2.10 `POST /api/parent/engagement-preference` —— 开关关注分析

- 权限：parent（`403 仅家长账号可修改关注分析设置`）
- 请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `childId` | number | **是** | 无权 → `403 无权修改该孩子的关注分析设置` |
| `enabled` | boolean | **是（语义上）** | **只有严格 `=== false` 才关闭**，其他一切值（含 `0`/`""`/`null`/不传）都视为开启 |

- 成功 `200`：`{ "ok": true, "enabled": boolean }`
- 副作用：写 `engagement_analysis_enabled` / `engagement_analysis_disabled` 事件。

### 2.11 `POST /api/parent/engagement-feedback` —— 反馈关注分析结果

- 权限：parent（`403 仅家长账号可反馈关注分析结果`）
- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `childId` | number | **是** | 无权 → `403 无权反馈该孩子的关注分析结果` |
| `choice` | string | **是** | 截 80 字；空 → `400 缺少反馈内容` |

- 成功 `200`：`{ "ok": true }`
- 副作用：写 `engagement_judgment_corrected` 事件，meta = `{ choice }`

---

## 3. 学生端（4 个）

### 3.1 `GET /api/student/home`

- 权限：**student**（`403 仅学生账号可访问学生首页`）
- Query：无（孩子由 `bindings` 中第一条决定）
- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `child` | children 全字段 \| null | `bindings` 里第一条 |
| `task` | tasks 全字段 \| null | 本周（`mondayOf(now)`）个人任务优先，否则班级任务 |
| `taskStatus` | string | `none` / `ongoing` / `draft` / `submitted`（**学生端不会出现 `done`**） |
| `submission` | submissions 全字段 \| null | |
| `feedback` | feedback 全字段 \| null | 提交非 draft 时附带 |

- 无孩子时：`{ child: null, task: null, taskStatus: "none", submission: null, feedback: null }`
- 副作用：写 `student_task_page_viewed` 事件。

### 3.2 `POST /api/student/worries` —— 提交「我的小心事」

- 权限：student（`403 仅学生账号可提交小心事`）
- 请求体：`{ content: string }`
- 校验：空 → `400 先写下你的小心事吧`；> 500 字 → `400 小心事不能超过 500 个字`
- 成功 `201`：

```json
{ "ok": true, "worry": { "id": 1, "student_name": "小明", "grade": "三年级", "content": "…", "read_at": null, "created_at": "…" } }
```

- 行为：`student_name` / `grade` 取 `bindings` 里第一个孩子，取不到则回退 `users.display_name`；`read_at` 初始为 `NULL`（管理员端视为新提交）。
- 副作用：写 `student_worry_submitted` 事件。

### 3.3 `GET /api/student/worries` —— 我的小心事列表（含管理员回复）

- 权限：student（`403 仅学生账号可查看小心事`）
- Query：`limit` 默认 50，夹取 1–100
- 成功 `200`：`{ generatedAt, newReplyCount, total, worries: [...] }`
- 只返回 `student_user_id = 当前用户` 的记录，`ORDER BY id DESC`
- 元素字段（下划线，与管理员端同表不同列）：`id`, `content`, `read_at`, `reply_content`, `reply_by_name`, `replied_at`, `reply_read_at`, `created_at`
- `newReplyCount`：`replied_at IS NOT NULL AND reply_content <> '' AND reply_read_at IS NULL` 的条数，**不受 limit 影响**，学生端首页（`pages/student/home`）用它渲染顶部信息提示模块（`limit=1` 只取计数）；进入「我的小心事」看到回复后调用 `POST /api/student/worries/replies/read` 标记已读，首页提示随之消失。

### 3.4 `POST /api/student/worries/replies/read` —— 回复全部标记已读

- 权限：student（`403 仅学生账号可查看小心事`）
- 请求体：无
- 成功 `200`：`{ "ok": true }`
- 说明：把本人所有未读回复一次性置为已读（无 id 参数的批量接口）。**建议小程序端在渲染出回复内容后再调用**，这样提示消失时用户已经看过内容。

---

## 4. 通用 / 跨角色（3 个）

### 4.1 `POST /api/events` —— 行为埋点

- 权限：**任意已登录角色**（parent / student / teacher / admin）
- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `eventType` | string | **是** | 别名 `event_type`；空 → `400 缺少事件类型`；入库截 60 字 |
| `childId` | number | 否 | 传了且 `!canAccessChild` → `403 无权记录该孩子事件` |
| `taskId` | number | 否 | |
| `meta` | object | 否 | JSON 序列化入库 |

- 成功 `200`：`{ "ok": true }`
- ⚠️ `body.childId` 用真值判断（`body.childId ? Number(...) : null`），**`childId = 0` 会被当 null**。

### 4.2 `POST /api/submissions` —— 提交/存草稿作品

- 权限：**parent 或 student**（其他角色 `403 仅家长或学生账号可提交作品`）
- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `taskId` | number | **是** | 缺 → `400 缺少任务或孩子信息` |
| `childId` | number | **是** | 缺 → `400 缺少任务或孩子信息`；`!canAccessChild` → `403 尚未绑定该孩子` |
| `content` | string | 提交时**必填** | `status==='submitted' && !content` → `400 请填写提交内容` |
| `subType` | string | 否 | `text`/`check`/`image`/`audio`/`video`，其他回落 `text` |
| `status` | string | 否 | 只有严格 `=== "draft"` 才是草稿，其余（含不传）一律 `submitted` |
| `attachments` | Array | 否 | 见 0.9，非法 → `400 … errorCode: INVALID_ATTACHMENT` |

- 校验顺序（**影响错误优先级**）：附件校验 → taskId/childId → content → 绑定 → `getVisibleTask`
- `getVisibleTask`（`server.js:154`）：任务不存在，或 `task.child_id != null && task.child_id !== childId` → `403 该任务不属于当前孩子`
- 成功 `200`：`{ "id": number, "ok": true, "status": "draft"|"submitted", "vectorIndexed": boolean }`
- 错误：`409 {"message":"该任务已提交，请勿重复提交","errorCode":"SUBMISSION_EXISTS"}`
- 行为要点：
  - 同一 `(task_id, child_id)` 若已有 **draft**，则**更新该 draft**（并刷新 `created_at`），返回原 id。
  - 正式提交时若已存在 `submitted` → 409。
  - 副作用：写 `submission_drafted`（带 `meta.round`）或 `submission_submitted`（带 `meta.draftsBeforeSubmit`）；meta 含 `subType`、`contentLength`、`attachmentTypes`、`fileCount`。

### 4.3 `GET /api/timeline` —— 成长时间线

- 权限：任意已登录，但需 `canAccessChild`
- Query：`childId` **必填**，缺 → `400 缺少 childId`；无权 → `403 无权访问该孩子时间线`
- 成功 `200`：`{ "items": [ … ] }`，按 `created_at` 倒序（无 LIMIT）
- **两类 item 字段不一致，需分别处理**：

  **A. 提交类**（`timeline_type === "submission"`）：

  | 字段 | 类型 | 说明 |
  |---|---|---|
  | `id` | number | submissions.id |
  | `content` | string | |
  | `sub_type` | string | |
  | `attachments` | string | JSON 字符串 |
  | `created_at` | string | |
  | `title` | string | tasks.title |
  | `task_type` | string | |
  | `week_start` | string | |
  | `feedback_id` | number \| null | |
  | `feedback_comment` | string \| null | |
  | `feedback_tags` | string | |
  | `feedback_at` | string \| null | |
  | `teacher_name` | string | 可能为 null |
  | `timeline_type` | string | 固定 `"submission"` |

  **B. 教师观察类**（`timeline_type === "teacher_observation"`）：

  | 字段 | 类型 |
  |---|---|
  | `id` | number（teacher_daily_updates.id，**与提交类 id 会撞号，必须靠 timeline_type 区分**） |
  | `child_id` | number \| null |
  | `content` | string（= `summary`） |
  | `sub_type` | string，固定 `"teacher_observation"` |
  | `attachments` | string，固定 `"[]"` |
  | `created_at` | string |
  | `title` | string，`"今日校园观察 · " + student_name` |
  | `task_type` | string，固定 `"教师记录"` |
  | `week_start` | string，固定 `""` |
  | `feedback_id` / `feedback_comment` / `feedback_at` | null |
  | `feedback_tags` | `""` |
  | `teacher_name` | string |
  | `timeline_type` | `"teacher_observation"` |
  | `observation_analysis` | string |
  | `observation_message` | string |
  | `observation_tags` | string |
  | `observation_ai_status` | string |
  | `observation_recipient_count` | number |

- **副作用（重要）**：调用此接口会把该孩子所有 `read_at IS NULL` 的 feedback 标记为已读，并写 `timeline_viewed` 事件。**所以 home 的 `unreadCount` 会被这个接口清零。**

---

## 5. 教师端（15 个，teacher 与 admin 均可访问）

> 前置门禁：`role !== 'teacher' && role !== 'admin'` → `403 {"message":"仅教师或管理员账号可访问"}`

### 5.1 `POST /api/teacher/notifications` —— 发全班公告

- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `title` | string | 否 | 默认 `"教师通知"`，截 80 字 |
| `content` | string | **是** | 空 → `400 请填写通知内容`；截 1200 字 |

- 成功 `200`：`{ "ok": true, "recipientCount": number }`
- 行为：给**所有非 demo 家长**各插一条 `notifications`（`type = "announcement"`），事务写入。

### 5.2 `GET /api/teacher/daily-updates` —— 校园观察列表

- Query：`limit` 默认 20，夹取 1–50
- 成功 `200`：`{ "updates": [ … ] }`，`WHERE teacher_id = 当前用户`，`ORDER BY id DESC`
- 元素字段：`id`, `child_id`, `student_name`, `transcript`, `summary`, `analysis`, `parent_message`, `tags`, `ai_status`, `recipient_count`, `created_at`

### 5.3 `POST /api/teacher/daily-updates` —— 提交校园观察（AI 整理 + 推送家长）

- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `transcript` | string | **是** | 空 → `400 请先说一段校园记录，或直接输入文字`；截 2000 字 |

- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `ok` | boolean | |
| `id` | number | 新建的 teacher_daily_updates.id |
| `update.id` | number | |
| `update.child_id` | number \| null | AI 识别/文本匹配到的学生 |
| `update.student_name` | string | 默认 `"学生"` |
| `update.transcript` | string | 原文 |
| `update.summary` | string | 截 260 字 |
| `update.analysis` | string | 截 600 字 |
| `update.parent_message` | string | 截 600 字 |
| `update.tags` | string | 逗号连接，最多 4 个 |
| `update.ai_status` | string | `ai` / `fallback` |
| `update.recipient_count` | number | |
| `update.recipient_ids` | number[] | AI 判定的推送家长 user id |
| `update.recipients` | Array\<`{userId, name, relation, childNames, childNameText}`\> | 推送对象明细，用于清单上标注「会推送给谁」 |
| `update.created_at` | string | 北京时间 `YYYY-MM-DD HH:MM:SS` |
| `recipientCount` | number | |
| `recipientSource` | string | `ai-student` 按学生家长匹配 / `ai-all-visible` 未认出学生推给全部可见家长 / `ai-student-no-parent` 认出学生但未绑家长 / `teacher` 教师手动指定 / `none` 暂无可推送家长 |
| `matchedChildId` | number \| null | 匹配到的学生 id |
| `visibleChildCount` | number | 教师可见学生数，为 `0` 时 AI 必然匹配不到家长 |

- 行为：识别到学生 → 只推给该学生的非 demo 家长；未识别 → 推给所有非 demo 家长。通知 `type = "teacher_daily_update"`。
- **推送对象为空的最常见原因**：教师所属班级里只有家长、而孩子没有对应学生账号（`children.user_id` 为空）。
  班级作用域现按「学生账号在班级内」**或**「孩子的家长在班级内」两种情况取并集，教师即可看到这些孩子并自动匹配推送家长。

### 5.3.1 `GET /api/teacher/daily-update-recipients` —— 可推送家长清单

- 成功 `200`：`{ "options": [ { userId, name, relation, childId, childName } ] }`
- 数据来源：教师可见学生（`getTeacherVisibleChildren`）对应的非 demo 家长，按 `childId, userId` 排序。
- 同一家长绑定多个孩子会出现多条，前端按 `userId` 去重。
- 返回空数组说明该教师可见学生为 `0`，需检查班级成员（管理员端「班级管理」里把家长加入班级即可）。

### 5.4 `POST /api/teacher/ai-chat` —— 教师 AI 助手

- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `question` | string | **是** | 空 → `400 请输入想了解的问题`；截 1200 字 |
| `history` | Array | 否 | 对话历史，仅在流式/非流式 AI 分支使用 |

- Query：`stream=1` → **SSE**（`text/event-stream`），否则普通 JSON
- 非流式 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `answer` | string | |
| `sources` | Array\<`{title, type}`\> | `type`：`student` / `class`，最多 5 条 |
| `provider` | string | 如 `"本地规则 + 向量索引"`、`"本地检索"`、`"deepseek + 本地向量检索"` |
| `indexedDocuments` | number | |
| `embeddedDocuments` | number | |
| `aiError` | string \| undefined | 仅失败时存在（JSON 中 undefined 会被省略） |

- 流式模式事件：`delta`（`{content}`）→ `done`（`{sources, provider, indexedDocuments, embeddedDocuments, aiError?}`）或 `error`（`{message}`）。
- ⚠️ **微信小程序 `wx.request` 不支持 SSE**，小程序端必须走非流式（`stream` 不传）。

### 5.5 `GET /api/teacher/overview` —— 教师首页概览

- Query：无
- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `task` | tasks 全字段 \| null | 本周**班级**任务（`child_id IS NULL`），`id DESC LIMIT 1` |
| `weekStart` | string | `mondayOf(now)` |
| `submissions` | Array | 最近 50 条 `submitted`；元素：`id`, `content`, `sub_type`, `attachments`, `created_at`, `child_name`, `grade`, `title`, `feedback_count` |

### 5.6 `GET /api/teacher/parent-task-requests` —— 家长成长关注列表

- Query：`status`（`pending`/`approved`/`rejected`，其他值忽略）
- 成功 `200`：`{ "requests": [ … ] }`
- 元素字段：`parent_task_requests` **全字段** + `child_name`, `grade`, `caregiver`, `interests`, `parent_name`, `task_title`
- 排序：`pending` 优先，其次 `approved`，最后其他，同为 `r.id DESC`

### 5.7 `POST /api/teacher/parent-task-requests/review` —— 确认成长关注反馈并生成定制任务

- 语义边界：家长提交的是**反馈**。`approved` 时正式任务内容**以 `ai_plan.task`（AI 任务草案）为默认基底**，教师可在请求体中逐字段覆盖；任何字段都不会回落到家长原话（`request.description` / `request.title` 不再参与任务生成）。
- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `requestId` | number | **是** | 不存在 → `404 成长关注反馈不存在` |
| `status` | string | **是** | 别名 `decision`；必须是 `approved` 或 `rejected`，否则 `400 请选择同意实施或拒绝` |
| `decision` | string | 否 | `status` 的别名（优先取 `status`） |
| `teacherComment` | string | 拒绝时**必填** | 别名 `comment`；截 500 字；`rejected && !comment` → `400 拒绝时请填写评价或原因` |
| `comment` | string | 否 | 别名 |
| `title` | string | 否 | 截 80 字，默认取 AI 草案 `task.title`，再回落 `"老师为你定制的成长任务"` |
| `goal` | string | 否 | 截 180 字，默认取 AI 草案 `task.goal` |
| `steps` | string | 否 | 截 3000 字，默认取 AI 草案 `task.steps`；`approved` 且最终为空 → `400 该反馈还没有可用的 AI 任务草案，请先完善任务步骤` |
| `dialogueTips` | string | 否 | 截 200 字，默认取 AI 草案 |
| `submitHint` | string | 否 | 截 200 字，默认取 AI 草案 |
| `duration` | number | 否 | 夹取 5–90，默认取 AI 草案 `task.duration`，再默认 20 |
| `type` | string | 否 | 截 40 字，默认取 AI 草案 `task.type`，再回落 `"习惯养成"` |
| `difficulty` | string | 否 | `简单`/`普通`/`进阶`，默认取 AI 草案，其他回落 `普通` |
| `materials` | string | 否 | 截 160 字，默认取 AI 草案，再回落 `"按家庭实际准备"` |
| `fallbackPlan` | string | 否 | 截 240 字，默认取 AI 草案 |

- 成功 `200`：`{ "ok": true, "taskId": number \| null, "vectorIndexed": boolean }`
  - `approved` 时用 `mondayOf(now)` 新建一条 **`child_id = request.child_id`** 的定制任务，`taskId` 为其 id。
  - `rejected` 时 `taskId` 为 `null`。
- 错误：
  - `409 {"message":"该成长关注反馈已经处理过","errorCode":"REQUEST_ALREADY_REVIEWED"}`
  - `404 {"message":"成长关注反馈不存在"}`
- 副作用（`approved` 时）：
  - 家长端：`type = "parent_task_request"` 通知「老师已根据你的反馈生成定制任务」。
  - 学生端：经 `bindings` 找到孩子的学生账号，推 `type = "student_custom_task"` 通知「老师为你定制了新的成长任务」；同时该定向任务会出现在学生端首页任务卡片（带「老师定制」标识，`/api/student/home` 返回 `isCustomTask` / `customTaskNotice`）。

### 5.8 `GET /api/teacher/students` —— 学生档案列表

- Query：无
- 成功 `200`：`{ "students": [ … ] }`
- 元素字段（**驼峰与下划线混用，照抄**）：
  `id`, `name`, `grade`, `gender`, `age`, `caregiver`, `interests`, **`familyNote`**（来自 `family_note`）, `timeAvailable`, `taskPreference`
- 已按 `realStudentWhere` 过滤 demo，且 `LIMIT 1000`。

### 5.9 `GET /api/teacher/global-report` —— 班级全局分析报告（大响应）

- Query：`local=1` 时跳过 AI 缓存，只返回本地规则分析
- 成功 `200`，顶层字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `generatedAt` | string | ISO 8601 |
| `source` | string | 固定 `"本地规则分析"` |
| `aiEnabled` | boolean | 是否配置了智谱/DeepSeek key |
| `dataScope.studentSource` | string | |
| `dataScope.realStudents` | number | |
| `dataScope.filteredDemoStudents` | number | |
| `dataScope.storageConfigured` | boolean | |
| `dataScope.storageMode` | string | `neon` / `persistent-disk` / `sqlite` |
| `stats.totalStudents` | number | |
| `stats.profileCompleteness` | number | 百分比 |
| `stats.totalSubmissions` | number | |
| `stats.activeStudents` | number | |
| `stats.peakCompletionTime` | string | `上午`/`下午`/`晚间`/`深夜/清晨`/`未知`/`暂无` |
| `stats.avgTextLength` | number | |
| `stats.totalTaskCount` | number | |
| `stats.customTaskCount` | number | 个性化任务数 |
| `stats.weekTaskCount` | number | |
| `stats.weekSubmittedStudents` | number | |
| `stats.weekPendingFeedback` | number | |
| `stats.weekStart` | string | |
| `studentProgress` | object | 见下 |
| `dimensions` | Array(4) | 见下 |
| `ai` | object \| 无 | AI 洞察命中缓存时才有 |
| `aiCached` / `aiPending` / `aiStale` / `aiStatus` / `aiLoadingText` / `aiError` | 布尔/字符串 | AI 缓存状态；`aiStatus`：`refreshing`/`running`/`generating` |

- `studentProgress`：

| 字段 | 类型 |
|---|---|
| `riskLevel` | `green`/`yellow`/`red` |
| `riskTitle` | `任务进度正常`/`任务推进需要干预`/`任务进度严重滞后` |
| `completionRate` | number（百分比） |
| `totalStudents` | number |
| `weekTaskCount` | number |
| `personalizedWeekTaskCount` | number |
| `submittedCount` | number |
| `pendingFeedback` | number |
| `suggestedReminderWindow` | string，如 `"18:30 - 20:30"` |
| `completed` | Array\<`{id, name, taskCount, pendingFeedback, tasks[]}`\> |
| `draftStalled` | Array\<`{id, name, taskTitle, draftCount}`\> |
| `viewedNotStarted` | Array\<`{id, name, touchpoints}`\> |
| `untouched` | Array\<`{id, name}`\> |
| `noAnswerCount` | number |

- `dimensions` 4 个元素，`key` 分别为：

  1. **`profiles`**（学生档案）：`key`, `title`, `summary`, `findings[]`, `actions[]`, `rows[]`
     - `rows[]`：`{id, name, grade, caregiver, interests, timeAvailable, taskPreference, completeness}`
  2. **`completionTime`**（完成时间）：额外带 `latency{avgViewLagHours, avgActionLagHours, avgSubmitLagHours, viewLagCount, actionLagCount}`、`distribution[]{label,count,percent}`、`weekdayDistribution[]{label,count,percent}`
  3. **`textMaterials`**（文字素材）：额外带 `indicators{positive, difficulty, collaboration, observation}`、`samples[]{childName, taskTitle, snippet}`
  4. **`behaviorSignals`**（埋点信号）：额外带 `indicators{events, activeStudents, avgActiveDays, touchpoints, exploration, followThrough}`、`distribution[]{label,count,percent}`、`rows[]{childId, childName, touchpoints, exploration, followThrough, activeDays, events}`

### 5.10 `GET /api/teacher/ai-overview` —— 班级规则概览

- Query：无
- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `stats.totalStudents` | number | |
| `stats.submittedCount` | number | |
| `stats.completionRate` | number | 百分比 |
| `stats.totalSubmissions` | number | |
| `stats.feedbackedCount` | number | |
| `stats.pendingFeedback` | number | |
| `stats.feedbackRate` | number | 百分比 |
| `stats.personalTaskCount` | number | |
| `task` | tasks 全字段 \| null | 本周班级任务 |
| `personalTasks` | Array\<`{id, title, child_id, child_name}`\> | |
| `insights` | string[] | 规则生成的中文洞察 |
| `unsubmittedStudents` | Array\<`{id, name, grade, caregiver}`\> | |
| `caregiverDistribution` | object | `{陪伴人: 人数}` |
| `interestDistribution` | object | `{兴趣: 人数}` |
| `engagementSummary` | object | `{high, medium, low, insufficient}` |
| `engagementRows` | Array\<`{childId, childName, caregiver, enabled, engagement}`\> | `engagement` 结构同 2.2 |

### 5.11 `GET /api/teacher/student-suggestions` —— 单个学生的任务建议

- Query：`childId` **必填**，缺 → `400 缺少 childId`
- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `student.id` / `name` / `grade` / `gender` / `age` / `caregiver` / `interests` | | |
| `student.familyNote` | string | **驼峰**，来自 `family_note` |
| `student.timeAvailable` | string | |
| `student.taskPreference` | string | |
| `suggestions` | Array(1) | 当前只返回一条 AI 建议，见下 |
| `aiMeta.generated` | boolean | 该建议是否由 AI 生成 |
| `aiMeta.status` | string | `AI 已生成` / `本地规则兜底` |
| `history.totalCompleted` | number | |
| `history.completedTypes` | string[] | |

- `suggestions[]` 元素字段：
  `title`, `type`, `duration`, `goal`, `steps`, `dialogueTips`, `submitHint`, `rationale`, `source`（`ai`）, `aiGenerated`（boolean）, `aiStatus`
  - `aiGenerated:true` 为 AI 生成；AI key 缺失或调用失败时返回本地兜底（`aiGenerated:false`, `aiStatus:"本地规则兜底"`）
  - ⚠️ 2026-10-15 起不再返回规则模板建议（`source:"template"`），小程序端「规则推荐」卡片已下线
- 错误：`404 {"message":"学生不存在"}`（含 demo 过滤，demo 学生查不到）

### 5.11b `POST /api/teacher/student-suggestions/regenerate` —— 教师口述情况后重新生成

教师在建议卡片点「重新生成」，填写学生情况描述，由 AI 先整理这段描述再重出任务。

- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `childId` | number | **是** | 空 → `400 缺少 childId` |
| `note` | string | **是** | 去空白后为空 → `400 请先描述学生情况`；服务端截断到 800 字 |

- 成功 `200`：结构与 5.11 完全一致，额外回传 `teacherNote`（原样回显本次描述）
- 语义：**`note` 优先级高于档案数据**。提示词要求 AI 先把口语描述整理成结构化要点（近期状态／困难点／可用材料／可陪伴时间／注意事项），冲突时以教师描述为准并在 `rationale` 说明采纳了哪一条
- 权限：沿用 `studentScopeWhere`，非本班学生 → `404`

### 5.12 `POST /api/teacher/tasks` —— 发布/更新任务

- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `title` | string | **是** | 空 → `400 请填写任务标题` |
| `childId` | number | 否 | 传了 → 建**个性化任务**；不传 → 建/更新**班级任务** |
| `goal` | string | 否 | |
| `steps` | string | 否 | |
| `dialogueTips` | string | 否 | |
| `submitHint` | string | 否 | |
| `duration` | number | 否 | `Number(body.duration) \|\| 20` |
| `type` | string | 否 | 默认 `"阅读"`，**不做枚举校验** |
| `difficulty` | string | 否 | `简单`/`普通`/`进阶`，其他回落 `普通` |
| `materials` | string | 否 | |
| `fallbackPlan` | string | 否 | 别名 `fallback_plan` |

- 成功 `200`：`{ "ok": true }`（**不返回 task id**）
- 行为差异（**重要**）：
  - **有 `childId`**：校验 `canAccessChild`（教师恒通过），**每次都 INSERT 一条新任务**（同一周可有多条个性化任务）。
  - **无 `childId`**：查本周（`week_start = mondayOf(now)`）是否已有 `child_id IS NULL` 的任务，有则 **UPDATE**，无则 INSERT。即**每周最多一条班级任务**，重复发布会覆盖。
- 错误：`childId` 未通过 `canAccessChild` → `404 {"message":"学生不存在"}`

### 5.13 `GET /api/teacher/submissions/:id` —— 提交详情

- 路径正则：`/^\/api\/teacher\/submissions\/(\d+)$/`
- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `submission.id` | number | |
| `submission.childId` | number | |
| `submission.childName` | string | |
| `submission.grade` | string | |
| `submission.content` | string | |
| `submission.subType` | string | |
| `submission.attachments` | string | JSON 字符串 |
| `submission.createdAt` | string | `YYYY-MM-DD HH:MM:SS` |
| `task.id` | number | |
| `task.title` | string | |
| `task.type` | string | |
| `task.weekStart` | string | |
| `task.goal` / `steps` / `dialogueTips` / `submitHint` | string | |
| `task.duration` | number | |
| `task.materials` / `fallbackPlan` | string | |
| `task.createdAt` | string | |
| `feedbacks` | Array\<`{id, comment, tags, created_at, teacher_name}`\> | `ORDER BY f.id DESC` |
| `feedbackCount` | number | |

- 错误：`404 {"message":"提交不存在或尚未正式提交"}`（status 非 `submitted` 或 demo 学生也走此分支）
- ⚠️ 路径 `/api/teacher/submissions/ai-feedback` 不会被此正则匹配（末尾不是数字），无冲突。

### 5.14 `POST /api/teacher/submissions/ai-feedback` —— 生成 AI 点评草稿

- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `submissionId` | number | **是** | 缺 → `400 缺少 submissionId` |

- 成功 `200`：`{ "ok": true, "feedback": {…} }`

| `feedback` 字段 | 类型 | 说明 |
|---|---|---|
| `comment` | string | 截 300 字 |
| `tags` | string | 逗号连接，最多 3 个（本地兜底最多 5 个经 `cleanTags` 截 5） |
| `provider` | string | `"本地建议"` 或 DeepSeek/智谱 provider 名 |
| `aiGenerated` | boolean | |
| `warning` | string | 仅 AI 失败时出现：`"AI暂时不可用，已生成一份本地评价草稿。"` |

- 错误：`404 {"message":"提交不存在或尚未正式提交"}`
- ⚠️ **只生成草稿，不落库**。需再调 5.15 保存。

### 5.15 `POST /api/teacher/feedback` —— 保存点评

- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `submissionId` | number | **是** | 缺或 comment 空 → `400 请填写点评内容` |
| `comment` | string | **是** | |
| `tags` | string \| Array | 否 | 经 `cleanTags()`：按 `，`/`,` 分割、trim、去重后保留 **最多 5 个**、再 join `","` |

- 成功 `200`：`{ "ok": true }`
- 错误：`404 {"message":"提交不存在或尚未正式提交"}`（仅允许对 `status='submitted'` 的提交点评）
- 副作用：写入 `feedback`（`teacher_id = 当前用户`，`read_at` 为 NULL），并重建向量索引。
- ⚠️ **不检查是否已点评过**，同一提交可重复点评（前端 `feedbacks` 按 id 倒序取最新）。

---

## 6. 管理员端（10 个）

> 全部要求 `role === 'admin'`，否则 `403 {"message":"仅管理员账号可访问"}`。

### 6.1 `GET /api/admin/overview` —— 全局概览

- Query：无
- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `generatedAt` | string | ISO 8601 |
| `stats.teacherCount` | number | |
| `stats.studentCount` | number | children 表总数 |
| `stats.parentCount` | number | |
| `teachers` | Array\<`{id, account, display_name, created_at}`\> | `id DESC` |
| `students` | Array\<`{id, name, grade, created_at, parent_count}`\> | `id DESC`；`parent_count` = bindings 条数（**不区分角色**） |

### 6.2 `GET /api/admin/accounts` —— 账号目录

- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `generatedAt` | string | ISO 8601 |
| `teachers` | Array | `{id, account, display_name, phone, email, subject, employee_no, created_at}` |
| `parents` | Array | `{id, account, display_name, phone, email, created_at, child_count}`，`child_count` = bindings 数 |
| `students` | Array | `{id, account, display_name, phone, email, created_at, child_id, name, grade, gender, age, caregiver, interests, family_note, parent_count, parent_account, parent_relation}` |

- ⚠️ `students` 是 `users LEFT JOIN children ON c.user_id = u.id`，**`child_id`/`name` 等可能为 null**（学生账号没建档案时）。
- `parent_account` / `parent_relation` 取的是 bindings 里 **id 最小** 的那条家长绑定。

### 6.3 `POST /api/admin/accounts` —— 创建账号

- 请求体：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `role` | string | **是** | 必须 `teacher`/`student`/`parent`，否则 `400 请选择教师、学生或家长账号` |
| `account` | string | **是** | trim 后长度 ≥ 3，否则 `400 账号至少 3 个字符` |
| `password` | string | **是** | 长度 ≥ 6，否则 `400 密码至少 6 位` |
| `displayName` | string | **是** | 别名 `name`；空 → `400 请填写学生姓名`/`请填写家长姓名`/`请填写教师姓名` |
| `name` | string | 否 | 别名 |
| `phone` | string | 否 | |
| `email` | string | 否 | |
| `subject` | string | 否 | 仅 teacher 生效 |
| `employeeNo` | string | 否 | 仅 teacher 生效 → `employee_no` |
| `grade` | string | **student 必填** | 空 → `400 请填写学生年级` |
| `gender` | string | 否 | 仅 student |
| `age` | number \| null | 否 | 仅 student；`""` 或 `null` → 存 `null`，否则 `Number()` |
| `caregiver` | string | 否 | 仅 student |
| `interests` | string | 否 | 仅 student |
| `familyNote` | string | 否 | 仅 student → `family_note` |
| `parentAccount` | string | 否 | 仅 student；必须是已存在的 `role='parent'` 账号，否则 `400 {"message":"未找到对应的家长账号","errorCode":"PARENT_NOT_FOUND"}` |
| `relation` | string | 否 | 仅 student；默认 `"家长"` |

- 成功 `201`：`{ "ok": true, "id": number, "childId": number \| null }`
  - `role=student` 时同步创建 `children`（`user_id` 指向新学生账号），`childId` 为其 id；如有 `parentAccount` 再插一条 `bindings`。
  - 其他角色 `childId` 为 `null`。
- 错误：`409 {"message":"该账号已被注册","errorCode":"ACCOUNT_EXISTS"}`
- 事务内完成，失败整体回滚。

### 6.4 `PUT /api/admin/accounts/:id` —— 编辑账号

- 路径：`/^\/api\/admin\/accounts\/\d+$/`，`accountId = Number(pathname.split("/").pop())`
- 请求体（**字段为空表示"不修改"，保留原值**）：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `account` | string | 否 | 缺省用原值；长度 ≥ 3，否则 `400 账号至少 3 个字符` |
| `displayName` | string | 否 | 缺省用原 `display_name`；结果为空 → `400 请填写姓名` |
| `password` | string | 否 | **留空/不传 = 不修改密码**；非空则 ≥ 6，否则 `400 新密码至少 6 位` |
| `phone` | string | 否 | |
| `email` | string | 否 | |
| `subject` | string | 否 | 仅 teacher |
| `employeeNo` | string | 否 | 仅 teacher |
| `grade` / `gender` / `age` / `caregiver` / `interests` / `familyNote` | | 否 | 仅 student，同步更新/补建 `children` |
| `parentAccount` | string | 否 | 仅 student；不存在 → `400 PARENT_NOT_FOUND`；已存在绑定则 `INSERT OR IGNORE` |
| `relation` | string | 否 | 默认 `"家长"` |

- 成功 `200`：`{ "ok": true, "id": number }`
- 错误：
  - `404 {"message":"账号不存在"}`（目标不是 teacher/student/parent，或 id 不存在）
  - `409 {"message":"该账号已被注册","errorCode":"ACCOUNT_EXISTS"}`
- ⚠️ **坑**：路由匹配块只校验了 `req.method === "PUT"`，`PUT /api/admin/accounts`（不带 id）会进入该分支，`accountId = NaN` → `404 账号不存在`。
- ⚠️ 该路径块**不支持 GET 单条**（没有对应 handler，会落到外层继续匹配，最终 404）。

### 6.5 `DELETE /api/admin/accounts/:id` —— 删除账号

- 仅管理员可调用；目标必须是教师、学生或家长账号，管理员账号不可删除。
- 删除会使目标账号立即失效，并清理登录会话、绑定关系、班级成员及账号关联的个人记录。
- 删除学生账号时，同时删除其学生档案、学生专属任务与提交记录；删除教师账号时，已发布任务保留但解除发布者，班级保留但解除负责教师。
- 成功 `200`：`{ "ok": true, "id": number }`
- 目标不存在或不是可删除角色 → `404 {"message":"账号不存在"}`

### 6.6 `GET /api/admin/tasks` —— 全量任务与完成情况

- Query：`limit` 默认 100，夹取 1–200
- 成功 `200`：`{ "tasks": [ … ], "studentCount": number }`
- `tasks[]` 元素：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | |
| `title` | string | |
| `type` | string | 来自 `task_type` |
| `weekStart` | string | |
| `createdAt` | string | |
| `duration` | number | |
| `scope` | string | `个性化任务` / `全班任务` |
| `studentName` | string | 个性化任务为孩子名，班级任务为 `"全班学生"` |
| `publisherName` | string | `users.display_name`，缺省 `"教师"` |
| `targetCount` | number | |
| `completedCount` | number | |
| `draftCount` | number | |
| `completionRate` | number | 百分比整数 |
| `details` | Array | 见下 |

- `details[]`：`{ studentId, studentName, grade, status, submissionId, content, submittedAt, subType }`
  - `status`：`not_started` / `draft` / `completed`
  - 仅 `completed` 时 `content` / `submittedAt` / `subType` 有值，否则为 `""` / `null` / `""`
  - 同一 (task, child) 有多条提交时，**优先取 `submitted` 的那条**

### 6.7 `GET /api/admin/growth-timeline` —— 成长时间线看板

- Query：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `limit` | number | 300（夹取 1–500） | |
| `childId` | number | 不传 = 全部 | 按孩子过滤 |

- 成功 `200`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `generatedAt` | string | ISO 8601 |
| `children` | Array\<`{id, name, grade}`\> | `ORDER BY name, id` |
| `stats.timelineCount` | number | |
| `stats.activeStudentCount` | number | |
| `stats.submissionCount` | number | |
| `stats.observationCount` | number | |
| `stats.feedbackCount` | number | |
| `items` | Array | 见下 |

- `items[]`（两类混合，靠 `kind` 区分）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `"submission-<id>"` 或 `"observation-<id>"` |
| `sourceId` | number | 原始表主键 |
| `kind` | string | `submission` / `observation` |
| `kindLabel` | string | `孩子提交` / `教师观察` |
| `childId` | number \| null | |
| `studentName` | string | |
| `grade` | string | |
| `title` | string | |
| `taskType` | string | |
| `content` | string | |
| `analysis` | string | 提交类恒为 `""` |
| `tags` | string | 提交类恒为 `""` |
| `teacherName` | string | |
| `createdAt` | string | |
| `feedback` | object \| null | 提交类才有：`{comment, tags, teacherName, createdAt}` |
| `aiStatus` | string | **仅 observation 类有** |
| `recipientCount` | number | **仅 observation 类有** |

- 排序：按 `createdAt` 倒序（按 `+08:00` 解析），最后 `slice(0, limit)`。

### 6.8 `GET /api/admin/worries` —— 学生小心事列表（含未读数与回复）

- 权限：admin（`403 仅管理员账号可访问`）
- Query：`limit` 默认 100，夹取 1–200
- 成功 `200`：`{ generatedAt, newCount, total, worries: [...] }`
- `newCount`：`read_at IS NULL` 的条数（管理员端首页顶部板块据此显示「有 N 条新提交」），**不受 limit 影响**
- 元素字段：`id`, `student_name`, `grade`, `content`, `read_at`, `reply_content`, `reply_by_name`, `replied_at`, `reply_read_at`, `created_at`
- ⚠️ 一次拉取所有学生的心事，**没有按学生过滤的参数**。

### 6.9 `POST /api/admin/worries/read` —— 全部标记已读

- 权限：admin（`403 仅管理员账号可访问`）
- 请求体：无
- 成功 `200`：`{ "ok": true }`
- 说明：`WHERE read_at IS NULL` 全量置已读，**无 id 参数**，一次性清空管理员首页的新提交提示。

### 6.10 `POST /api/admin/worries/:id/reply` —— 回复某条小心事

- 路径正则：`/^\/api\/admin\/worries\/(\d+)\/reply$/`
- 权限：admin（`403 仅管理员账号可回复小心事`）
- 请求体：`{ content: string }`
- 校验：空 → `400 先写下要回复的内容吧`；> 500 字 → `400 回复不能超过 500 个字`；id 不存在 → `404 该小心事不存在或已被删除`
- 成功 `200`：`{ "ok": true, "worry": { "id", "reply_content", "reply_by_name", "replied_at", "reply_read_at" } }`
- 行为：`UPDATE student_worries SET reply_content = ?, reply_by = ?, reply_by_name = ?, replied_at = now, reply_read_at = NULL`——**再次回复会清空 `reply_read_at`**，学生端会重新出现「你有新的回复」提示（每条只有一条回复，重复回复即覆盖更新，不是多轮会话）。
- 副作用：写 `student_worry_replied` 事件。

---

## 7. 小程序端落地注意事项（坑清单）

1. ~~**登录响应没有 `user.id`**~~（已修复）。登录响应现为 `id` / `account` / `displayName` / `role` / `avatarUrl`，其中 `id` 在 SQLite 下由驱动返回为**字符串**，比较时不要直接用 `===`。
2. **字段名混用**，绝不能统一：
   - 登录 → `displayName`（驼峰）；
   - `/api/teacher/students` 与 `/api/teacher/student-suggestions` 的 student → `familyNote`（驼峰）；
   - 其余几乎全是下划线：`display_name`、`child_id`、`task_type`、`week_start`、`sub_type`、`teacher_comment`、`concern_category`、`observed_behavior`、`parent_count`、`parent_account`、`parent_relation`、`employee_no`、`family_note`、`feedback_count`、`child_name`、`created_at`、`read_at` 等。
   - 教师端提交详情 `/api/teacher/submissions/:id` 反而是**全驼峰**：`childId`、`childName`、`subType`、`createdAt`、`weekStart`、`dialogueTips`、`submitHint`、`fallbackPlan`、`feedbacks`。
3. **同名字段不同形状**：`/api/home` 的 `parentTaskRequest` 只有 10 个字段，而 `/api/parent/task-requests` 的 `requests[]` 有 11 个且字段集不同（多了 `child_id`、`concern_category`，少了 `goal`、`description`）。
4. **`/api/timeline` 的 items 是"两套字段强行对齐"**，且 submission 类**没有 `child_id`**，observation 类才有；两类 `id` 会撞号，必须用 `timeline_type` 区分。
5. **调 `/api/timeline` 会清掉未读反馈数**（接口副作用），首页红点会被它清零。
6. **`enabled` 开关**：只有严格 `false` 才关，别传 `0` 或 `""`。
7. **`submissions.status`**：只有严格 `"draft"` 才是草稿，传任何别的值（含 `"DRAFT"`、`1`）都会变成正式提交。
8. **重复提交会 409**，草稿则可反复覆盖（同一 task+child 只有一条 draft）。
9. **本周任务判定**由后端 `mondayOf()` 决定，周日仍属本周；小程序端不要自己算周一起点，直接读后端的 `weekStart`。
10. **班级任务每周只能有一条**（重复发布会覆盖），个性化任务可以有多条。
11. **管理员不能通过 `canAccessChild`**：`admin` 访问 `/api/timeline?childId=`、`/api/submissions` 等会 403。
12. **SSE 不可用**：`/api/teacher/ai-chat?stream=1` 在小程序里不要使用（`wx.request` 不支持 `text/event-stream`）。
13. **无文件上传接口**：附件只能用外链 URL 或 `data:` base64（≤ 15 MB/个，≤ 6 个）。
14. **无分页 offset**：所有列表都是 limit-only，且多处硬编码 LIMIT（20/50）。
15. **用错 HTTP 方法返回 404 而非 405**，调试时注意。
16. 所有 `>= 400` 的响应都会带 `requestId`，响应头有 `X-Request-Id`，报错时建议上报该 ID。
17. **全局兜底**：5xx 时 `message` 被统一替换为 `"服务器暂时无法完成请求"`，真实原因只在服务端日志。
