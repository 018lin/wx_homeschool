# 成长关注流程：家长反馈 → AI 总结 → 教师确认 → 双端推送

> 定位：家长端提交的「成长关注」是**描述孩子不足之处的反馈**，**不是**家长自定制任务。
> 数据表沿用 `parent_task_requests`，但全链路的语义、文案与任务生成逻辑均已按"反馈"重新对齐。

---

## 一、改造前的问题

| # | 问题 | 证据（改造前） |
|---|---|---|
| 1 | 实体与文案错位 | 事件标签 `parent_task_request_submitted: "提交自主定制任务"`；AI 报告 `"家长自主定制任务提议总数…"`；向量文档 `title: "家长自主定制任务…"`、`"家长想和孩子一起做…"`；错误消息 `404 家长定制任务不存在` |
| 2 | **AI 草案被架空，家长原话直连任务** | 教师端 `openReview` 用 `item.title` / `item.expectation` / `item.behavior` 预填任务表单，**从未读取 `ai_plan.task`**；后端 review 兜底 `steps = body.steps \|\| request.description`（家长原话）、`type` 恒为 `"家务实践"` |
| 3 | 推送不完整 | 审核通过后只给**家长**插 `notifications`，**学生端完全没有推送** |
| 4 | 职责边界不清 | 家长表单出现"你希望达成什么""任务时长"等**应由 AI/教师决定**的任务设计字段 |

结论：教师"确认"退化为"转发"，最终 `tasks` 记录 = 家长原话被打上任务标签。

---

## 二、概念边界

| 概念 | 归属 | 载体 | 特征 |
|---|---|---|---|
| **家长反馈（成长关注）** | 家长 | `parent_task_requests` 一行 | 观察性描述：具体表现 / 场景 / 频率 / 影响 / 家庭限制 / 期望支持。**是信息输入，不是任务** |
| **AI 总结** | 系统 | `ai_plan` 的 `analysisSummary`、`observations`、`supportGoal`、`boundaryNote`、`needsProfessionalReview` | 中性理解 + 风险边界，**仅教师可见**，避免给家长贴标签 |
| **AI 任务草案** | 系统 | `ai_plan.task` | 待定稿草稿，教师可改；**不等于正式任务** |
| **正式定制任务** | 教师确认 | `tasks`（`child_id` 定向） | 教师以草案为基底确认后创建，推送家长端与学生端 |

> **家长只负责"反馈问题"，AI 负责"整理 + 起草"，教师负责"决策 + 实施"，系统负责"双端送达"。**

---

## 三、重构后的完整流程

```
① 家长提交反馈（描述孩子不足）
     POST /api/parent/task-requests → status = pending
     服务端同步跑 AI：生成「中性总结 + 任务草案」写入 ai_plan
     仅推送"新反馈"给教师/管理员，此时不产生任何任务
        ▼
② 教师端「家长成长关注」收件箱
     家长原始反馈  +  AI 总结（仅教师可见）  +  AI 任务草案
        ▼
③ 教师确认与实施
     ├─ 同意实施 → 以 ai_plan.task 为基底（教师可逐字段覆盖）创建定向 tasks(child_id)
     │              status = approved
     └─ 暂不采纳 → status = rejected，回复家长，不建任务
        ▼
④ 推送双端（仅 approved）
     ├─ 家长端：通知「老师已根据你的反馈生成定制任务」；反馈列表展示定制任务标题
     └─ 学生端：经 bindings 找到学生账号推通知；定向任务出现在学生首页，
                带「老师定制」标识（/api/student/home 返回 isCustomTask / customTaskNotice）
        ▼
⑤ 结果回流
     家长端状态：待老师处理 / 已生成定制任务 / 老师已回复
     教师端与 AI 报告：统一使用「家长反馈」措辞
```

---

## 四、关键实现点

### 后端 `server.js`
- 新增 `parseAiTaskDraft(ai_plan)`：抽取 AI 草案默认值（title/goal/steps/duration/difficulty/type/materials/dialogueTips/submitHint/fallbackPlan）。
- `POST /api/teacher/parent-task-requests/review`：
  - 任务内容**一律以 `ai_plan.task` 为基底**，`request.description` / `request.title` **不再参与**任务生成；
  - `approved` 且最终 `steps` 为空 → `400 该反馈还没有可用的 AI 任务草案，请先完善任务步骤`；
  - 家长端通知（两种决策都有）+ 学生端通知（仅 approved）。
- `GET /api/home` 的 `parentTaskRequest` 增加 `task_title`（LEFT JOIN tasks）。
- `GET /api/student/home` 增加 `isCustomTask` / `customTaskNotice`。
- 措辞统一：事件标签、AI 报告、参与度证据、向量文档、错误消息。

### 小程序
| 文件 | 改动 |
|---|---|
| `utils/util.js` | `formatAiPlan` 拆出 `summarySections` / `taskSections` / `draft`；`REQUEST_STATUS` 改为反馈语义（待老师处理 / 已生成定制任务 / 老师已回复） |
| `pages/teacher/requests` | AI 总结与 AI 任务草案分栏展示；审核表单**预填 AI 草案**；按钮「确认并推送」；提示"已按 AI 任务草案预填" |
| `pages/parent/concern` | 整体定位为"反馈孩子需要支持的具体表现"；列表展示老师生成的定制任务 |
| `pages/parent/home` | 「我反馈的成长关注」卡片展示定制任务标题 |
| `pages/student/home` | 定制任务「老师定制」徽标 + 提示语 |
| `pages/admin/concerns` | 措辞统一为"反馈" |

### 回归测试
`test/core-api.test.js` 新增断言：**不带任何任务字段**确认实施时，任务标题来自 AI 草案（`亲子观察：一起理解这件事`）而非家长反馈标题。

---

## 五、部署提示
`server.js` 的改动需 `git commit` 并 push 到 `origin/main`，Render 才会按 `render.yaml` 的 `branch: main` 自动部署；否则小程序仍会命中旧的远端逻辑。