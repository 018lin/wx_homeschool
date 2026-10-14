const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { types } = require("pg");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "home-school-test-"));
process.env.DATA_DIR = dataDir;
process.env.DATABASE_URL = "";
process.env.ZHIPU_API_KEY = "";
process.env.DEEPSEEK_API_KEY = "";
process.env.PORT = "0";
process.env.NODE_ENV = "test";

const app = require("../server");
let baseUrl;
let parentToken;
let teacherToken;
let childId;
let taskId;
let submissionId;

async function request(pathname, options) {
  options = options || {};
  const headers = Object.assign({}, options.headers || {});
  if (options.token) headers.Authorization = "Bearer " + options.token;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(baseUrl + pathname, {
    method: options.method || "GET",
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = {};
  const text = await response.text();
  try { data = text ? JSON.parse(text) : {}; } catch (error) { data = { text: text }; }
  return { response, data };
}

before(async function () {
  await app.databaseReady;
  await new Promise(function (resolve) {
    app.server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = "http://127.0.0.1:" + app.server.address().port;
});

after(async function () {
  await new Promise(function (resolve) {
    if (!app.server.listening) return resolve();
    app.server.close(resolve);
  });
  await app.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("database transaction rolls back failed writes", async function () {
  const beforeCount = Number((await app.db.prepare("SELECT COUNT(*) AS n FROM users").get()).n);
  await assert.rejects(
    app.db.transaction(async function (tx) {
      await tx.prepare(
        "INSERT INTO users (account, password_hash, display_name, role) VALUES (?,?,?,'parent')"
      ).run("rollback-user", "hash", "回滚测试");
      throw new Error("force rollback");
    }),
    /force rollback/
  );
  const afterCount = Number((await app.db.prepare("SELECT COUNT(*) AS n FROM users").get()).n);
  assert.equal(afterCount, beforeCount);
});

test("postgres local timestamps are not shifted before JSON serialization", function () {
  const parseTimestamp = types.getTypeParser(1114, "text");
  assert.equal(parseTimestamp("2026-10-06 20:15:30"), "2026-10-06 20:15:30");
});

test("student account opens its own task workspace", async function () {
  let result = await request("/api/auth/login", {
    method: "POST",
    body: { account: "xiaoce", password: "000111" }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.user.role, "student");
  assert.equal(result.data.user.displayName, "小测");

  result = await request("/api/student/home", { token: result.data.token });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.child.name, "小测");
  assert.ok(result.data.task);
});

test("core parent and teacher workflow remains compatible", async function () {
  const account = "parent_" + Date.now();
  let result = await request("/api/auth/register", {
    method: "POST",
    body: { account: account, password: "123456", displayName: "测试家长" }
  });
  assert.equal(result.response.status, 410);
  assert.equal(result.data.errorCode, "PUBLIC_REGISTRATION_DISABLED");

  result = await request("/api/auth/login", {
    method: "POST",
    body: { account: "admin", password: "018admin" }
  });
  assert.equal(result.response.status, 200);
  const adminToken = result.data.token;
  result = await request("/api/admin/accounts", {
    method: "POST",
    token: adminToken,
    body: { role: "parent", account: account, password: "123456", displayName: "测试家长" }
  });
  assert.equal(result.response.status, 201);

  result = await request("/api/auth/login", {
    method: "POST",
    body: { account: account, password: "123456" }
  });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.token);
  parentToken = result.data.token;

  result = await request("/api/home", { token: parentToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.needQuestionnaire, true);

  result = await request("/api/questionnaire", {
    method: "POST",
    token: parentToken,
    body: {
      childName: "测试孩子",
      gender: "女",
      age: 9,
      caregiver: ["妈妈"],
      timeAvailable: "适中",
      taskPreference: "低负担",
      interests: ["阅读", "观察"],
      familyNote: "",
      grade: "三年级"
    }
  });
  assert.equal(result.response.status, 200);
  childId = Number(result.data.child.id);
  assert.ok(childId);

  result = await request("/api/auth/login", {
    method: "POST",
    body: { account: "018", password: "018018" }
  });
  assert.equal(result.response.status, 200);
  teacherToken = result.data.token;

  /* 今日成长记录：先进入待校对清单（草稿），此时家长端不应收到通知 */
  result = await request("/api/teacher/daily-updates", {
    method: "POST",
    token: teacherToken,
    body: {
      transcript: "今天测试孩子在学校主动帮助同学整理图书，还把自己的观察结果分享给了小组。"
    }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.ok, true);
  assert.ok(result.data.update.summary);
  assert.equal(result.data.update.status, "draft");
  assert.equal(result.data.update.is_draft, true);
  assert.ok(result.data.autoSendTime);
  const draftId = Number(result.data.update.id);
  assert.ok(draftId);

  result = await request("/api/parent/notifications?limit=20", { token: parentToken });
  assert.equal(result.response.status, 200);
  assert.ok(!result.data.notifications.some(function (item) {
    return item.type === "teacher_daily_update";
  }), "草稿阶段不应直接推送给家长");

  /* 清单要标注每条记录会推送给哪些家长 */
  result = await request("/api/teacher/daily-updates", { token: teacherToken });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.updates.length >= 1);
  assert.equal(result.data.autoSendTime, "18:00");
  const draft = result.data.updates.find(function (item) { return Number(item.id) === draftId; });
  assert.ok(draft, "列表应包含新建的草稿");
  assert.equal(draft.is_draft, true);
  assert.ok(Array.isArray(draft.recipient_ids));
  assert.ok(Array.isArray(draft.recipients));
  assert.ok(draft.recipients.length >= 1, "应标注推送给哪些家长");
  assert.equal(Number(draft.recipient_count), draft.recipient_ids.length);

  /* 教师可编辑推送对象：清空后不应被确认发送 */
  result = await request("/api/teacher/daily-update-recipients", { token: teacherToken });
  assert.equal(result.response.status, 200);
  assert.ok(Array.isArray(result.data.options));

  result = await request("/api/teacher/daily-updates/" + draftId, {
    method: "PUT",
    token: teacherToken,
    body: { parentMessage: "测试孩子在图书馆帮助同伴整理图书。" }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.update.parent_message, "测试孩子在图书馆帮助同伴整理图书。");

  result = await request("/api/teacher/daily-updates/" + draftId, {
    method: "PUT",
    token: teacherToken,
    body: { recipientIds: [] }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.update.recipient_ids.length, 0);

  /* 没有推送对象时确认发送应被记为失败，不会误标为已发送 */
  result = await request("/api/teacher/daily-updates/confirm", {
    method: "POST",
    token: teacherToken,
    body: { ids: [draftId] }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.sent.length, 0);
  assert.equal(result.data.failed.length, 1);

  /* 恢复推送对象后确认无误，才真正写入家长通知中心 */
  const parentUserId = draft.recipients.length ? draft.recipients[0].userId : null;
  assert.ok(parentUserId, "应有可推送的家长");
  result = await request("/api/teacher/daily-updates/" + draftId, {
    method: "PUT",
    token: teacherToken,
    body: { recipientIds: [parentUserId] }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.update.recipient_ids.length, 1);

  result = await request("/api/teacher/daily-updates/confirm", {
    method: "POST",
    token: teacherToken,
    body: { ids: [draftId] }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.sent.length, 1);
  assert.equal(result.data.recipientCount, 1);

  /* 幂等：重复确认不会重复推送 */
  result = await request("/api/teacher/daily-updates/confirm", {
    method: "POST",
    token: teacherToken,
    body: { ids: [draftId] }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.sent.length, 0);

  /* 已发送的记录不可再修改或删除 */
  result = await request("/api/teacher/daily-updates/" + draftId, {
    method: "PUT",
    token: teacherToken,
    body: { summary: "试图修改" }
  });
  assert.equal(result.response.status, 400);

  result = await request("/api/teacher/daily-updates/" + draftId, {
    method: "DELETE",
    token: teacherToken
  });
  assert.equal(result.response.status, 400);

  result = await request("/api/parent/notifications?limit=20", { token: parentToken });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.notifications.some(function (item) {
    return item.type === "teacher_daily_update";
  }), "确认无误后家长应收到通知");

  result = await request("/api/timeline?childId=" + childId, { token: parentToken });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.items.some(function (item) {
    return item.timeline_type === "teacher_observation" && item.title.indexOf("测试孩子") >= 0;
  }));

  result = await request("/api/teacher/tasks", {
    method: "POST",
    token: teacherToken,
    body: {
      title: "测试班级任务",
      type: "观察探究",
      duration: 15,
      goal: "完成一次家庭观察",
      steps: "1. 一起观察\n2. 记录发现",
      dialogueTips: "你发现了什么？",
      submitHint: "提交文字记录",
      materials: "纸笔",
      fallbackPlan: "时间有限时只记录一句话",
      difficulty: "简单"
    }
  });
  assert.equal(result.response.status, 200);

  result = await request("/api/home?childId=" + childId, { token: parentToken });
  assert.equal(result.response.status, 200);
  taskId = Number(result.data.task.id);
  assert.ok(taskId);

  result = await request("/api/submissions", {
    method: "POST",
    token: parentToken,
    body: { taskId, childId, status: "draft", content: "", attachments: [] }
  });
  assert.equal(result.response.status, 200);
  submissionId = Number(result.data.id);

  result = await request("/api/submissions", {
    method: "POST",
    token: parentToken,
    body: {
      taskId,
      childId,
      status: "submitted",
      content: "我们观察到阳台上的植物长出了新叶。",
      attachments: []
    }
  });
  assert.equal(result.response.status, 200);
  assert.equal(Number(result.data.id), submissionId);

  result = await request("/api/submissions", {
    method: "POST",
    token: parentToken,
    body: {
      taskId,
      childId,
      status: "submitted",
      content: "重复提交",
      attachments: []
    }
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.data.errorCode, "SUBMISSION_EXISTS");

  result = await request("/api/teacher/feedback", {
    method: "POST",
    token: teacherToken,
    body: { submissionId, comment: "记录得很具体。", tags: ["观察力"] }
  });
  assert.equal(result.response.status, 200);

  result = await request("/api/timeline?childId=" + childId, { token: parentToken });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.items.some(function (item) { return item.feedback_comment === "记录得很具体。"; }));

  result = await request("/api/teacher/overview", { token: parentToken });
  assert.equal(result.response.status, 403);

  result = await request("/api/teacher/overview", { token: teacherToken });
  assert.equal(result.response.status, 200);
  const overviewSubmission = result.data.submissions.find(function (item) {
    return Number(item.id) === submissionId;
  });
  assert.ok(overviewSubmission);
  assert.equal(typeof overviewSubmission.feedback_count, "number");
  assert.equal(overviewSubmission.feedback_count, 1);

  result = await request("/api/teacher/submissions/" + submissionId, { token: teacherToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.submission.content, "我们观察到阳台上的植物长出了新叶。");
  assert.equal(result.data.task.title, "测试班级任务");
  assert.equal(result.data.task.goal, "完成一次家庭观察");
  assert.equal(result.data.feedbacks[0].comment, "记录得很具体。");

  result = await request("/api/teacher/submissions/ai-feedback", {
    method: "POST",
    token: teacherToken,
    body: { submissionId }
  });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.feedback.comment);
  assert.equal(result.data.feedback.aiGenerated, false);

  result = await request("/api/teacher/ai-chat", {
    method: "POST",
    token: teacherToken,
    body: { question: "本周谁未提交？" }
  });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.answer);

  result = await request("/api/teacher/tasks", {
    method: "POST",
    token: teacherToken,
    body: {
      childId,
      title: "并发提交测试任务",
      type: "观察探究",
      duration: 10,
      goal: "测试重复请求保护",
      steps: "完成一次简短观察"
    }
  });
  assert.equal(result.response.status, 200);
  result = await request("/api/home?childId=" + childId, { token: parentToken });
  const concurrentTaskId = Number(result.data.task.id);
  const concurrentResults = await Promise.all([
    request("/api/submissions", {
      method: "POST",
      token: parentToken,
      body: { taskId: concurrentTaskId, childId, status: "submitted", content: "并发提交一", attachments: [] }
    }),
    request("/api/submissions", {
      method: "POST",
      token: parentToken,
      body: { taskId: concurrentTaskId, childId, status: "submitted", content: "并发提交二", attachments: [] }
    })
  ]);
  assert.deepEqual(
    concurrentResults.map(function (item) { return item.response.status; }).sort(),
    [200, 409]
  );

  result = await request("/api/parent/task-requests", {
    method: "POST",
    token: parentToken,
    body: {
      childId,
      category: "情绪表达",
      observedBehavior: "孩子遇到困难时会离开座位，不太愿意说自己哪里不会。",
      context: "工作日晚上写作业时比较明显。",
      frequency: "每周几次",
      impact: "我们容易因为这件事争执。",
      parentExpectation: "希望孩子能先说出困难，家长也想少一些催促。",
      familyConstraints: "工作日晚间大约只有 15 分钟。",
      duration: 15
    }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.aiStatus, "fallback");
  const concernRequestId = Number(result.data.request.id);
  assert.ok(concernRequestId);

  result = await request("/api/parent/task-requests?childId=" + childId, { token: parentToken });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.requests.some(function (item) { return Number(item.id) === concernRequestId; }));

  result = await request("/api/teacher/parent-task-requests", { token: teacherToken });
  assert.equal(result.response.status, 200);
  const concernRequest = result.data.requests.find(function (item) { return Number(item.id) === concernRequestId; });
  assert.ok(concernRequest);
  assert.equal(concernRequest.ai_status, "fallback");
  assert.ok(concernRequest.ai_plan);

  result = await request("/api/teacher/parent-task-requests/review", {
    method: "POST",
    token: teacherToken,
    body: {
      requestId: concernRequestId,
      status: "approved",
      teacherComment: "已根据家庭时间调整，请先尝试一次并记录过程。",
      title: "困难时先说出来",
      type: "情绪社交",
      duration: 15,
      goal: "帮助孩子表达遇到的困难",
      steps: "1. 选择一个具体困难\n2. 请孩子说说发生了什么\n3. 一起想一个小行动",
      dialogueTips: "你希望我怎样陪你一起想办法？",
      submitHint: "提交两三句话的过程记录",
      fallbackPlan: "孩子不愿长谈时只完成五分钟倾听"
    }
  });
  assert.equal(result.response.status, 200);
  assert.ok(Number(result.data.taskId));

  result = await request("/api/parent/notifications?limit=20", { token: parentToken });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.notifications.some(function (item) {
    return item.type === "parent_task_request" && item.title === "老师已为孩子准备定制任务";
  }));
});

test("18:00 auto-send delivers leftover drafts exactly once", async function () {
  /* 教师当天未点「确认无误」，草稿应由定时任务自动推送给 AI 判定的家长 */
  let result = await request("/api/teacher/daily-updates", {
    method: "POST",
    token: teacherToken,
    body: { transcript: "自动推送测试：今天测试孩子在课堂上主动举手回答问题。" }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.update.status, "draft");
  const autoId = Number(result.data.update.id);
  assert.ok(autoId);

  /* 未到点（force 未开）时不应推送 */
  result = await request("/api/teacher/daily-updates?limit=30", { token: teacherToken });
  const stillDraft = result.data.updates.find(function (item) { return Number(item.id) === autoId; });
  assert.equal(stillDraft.is_draft, true, "未确认的记录应保持草稿状态");

  /* 模拟到点：force 直接执行一次自动推送 */
  result = await request("/api/teacher/daily-updates/auto-send?force=1", {
    method: "POST",
    token: teacherToken
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.ok, true);
  assert.ok(result.data.sent.some(function (item) { return Number(item.id) === autoId; }),
    "到点后应自动推送该草稿");

  /* 家长确实收到通知 */
  result = await request("/api/parent/notifications?limit=30", { token: parentToken });
  assert.ok(result.data.notifications.some(function (item) {
    return item.type === "teacher_daily_update";
  }), "自动推送后家长应收到通知");

  /* 幂等：再次执行不应重复推送 */
  const beforeCount = result.data.notifications.filter(function (item) {
    return item.type === "teacher_daily_update";
  }).length;
  result = await request("/api/teacher/daily-updates/auto-send?force=1", {
    method: "POST",
    token: teacherToken
  });
  assert.equal(result.data.sent.length, 0, "已发送的记录不应重复推送");
  result = await request("/api/parent/notifications?limit=30", { token: parentToken });
  const afterCount = result.data.notifications.filter(function (item) {
    return item.type === "teacher_daily_update";
  }).length;
  assert.equal(afterCount, beforeCount, "重复执行不应产生重复通知");

  /* 自动推送后状态应为 auto_sent */
  result = await request("/api/teacher/daily-updates?limit=30", { token: teacherToken });
  const autoSent = result.data.updates.find(function (item) { return Number(item.id) === autoId; });
  assert.equal(autoSent.status, "auto_sent");
  assert.equal(autoSent.is_draft, false);
  assert.ok(autoSent.sent_at);
});

test("drafts never appear on the parent timeline before being sent", async function () {
  let result = await request("/api/teacher/daily-updates", {
    method: "POST",
    token: teacherToken,
    body: { transcript: "草稿可见性测试：今天测试孩子主动帮助同学捡起掉落的文具。" }
  });
  assert.equal(result.response.status, 200);
  const draftId = Number(result.data.update.id);

  /* 草稿阶段：家长时间线不应出现该条记录 */
  result = await request("/api/timeline?childId=" + childId, { token: parentToken });
  assert.equal(result.response.status, 200);
  const leaked = result.data.items.find(function (item) {
    return item.timeline_type === "teacher_observation" && String(item.id) === String(draftId);
  });
  assert.ok(!leaked, "未发送的草稿不应出现在家长时间线");

  /* 确认发送后才会出现在家长时间线 */
  result = await request("/api/teacher/daily-updates/confirm", {
    method: "POST",
    token: teacherToken,
    body: { ids: [draftId] }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.sent.length, 1);

  result = await request("/api/timeline?childId=" + childId, { token: parentToken });
  assert.ok(result.data.items.some(function (item) {
    return item.timeline_type === "teacher_observation" && String(item.id) === String(draftId);
  }), "确认发送后家长时间线才可见");
});

test("input and static file boundaries are enforced", async function () {
  let result = await request("/api/submissions", {
    method: "POST",
    token: parentToken,
    body: {
      taskId,
      childId,
      status: "draft",
      content: "",
      attachments: [{ type: "application/x-msdownload", name: "bad.exe", size: 10, url: "" }]
    }
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.data.errorCode, "INVALID_ATTACHMENT");

  let response = await fetch(baseUrl + "/data/app.db");
  assert.equal(response.status, 403);
  response = await fetch(baseUrl + "/.env.local");
  assert.equal(response.status, 403);
  response = await fetch(baseUrl + "/../package.json");
  assert.notEqual(response.status, 200);
});

async function createAccount(adminToken, body) {
  const result = await request("/api/admin/accounts", {
    method: "POST",
    token: adminToken,
    body: body
  });
  assert.equal(result.response.status, 201);
  return result.data;
}

test("admin creates classes and teacher scope stays inside its own class", async function () {
  const stamp = Date.now();

  let result = await request("/api/auth/login", {
    method: "POST",
    body: { account: "admin", password: "018admin" }
  });
  assert.equal(result.response.status, 200);
  const adminToken = result.data.token;

  // 班级 A：教师 + 家长 + 学生
  const teacherA = await createAccount(adminToken, { role: "teacher", account: "cls_teacher_a_" + stamp, password: "123456", displayName: "分班教师甲" });
  await createAccount(adminToken, { role: "parent", account: "cls_parent_a_" + stamp, password: "123456", displayName: "分班家长甲" });
  const studentA = await createAccount(adminToken, { role: "student", account: "cls_student_a_" + stamp, password: "123456", displayName: "分班学生甲", grade: "四年级", parentAccount: "cls_parent_a_" + stamp });

  // 班级 B：教师 + 家长 + 学生
  const teacherB = await createAccount(adminToken, { role: "teacher", account: "cls_teacher_b_" + stamp, password: "123456", displayName: "分班教师乙" });
  await createAccount(adminToken, { role: "parent", account: "cls_parent_b_" + stamp, password: "123456", displayName: "分班家长乙" });
  const studentB = await createAccount(adminToken, { role: "student", account: "cls_student_b_" + stamp, password: "123456", displayName: "分班学生乙", grade: "五年级", parentAccount: "cls_parent_b_" + stamp });

  result = await request("/api/admin/classes", {
    method: "POST",
    token: adminToken,
    body: { name: "四年级一班", grade: "四年级", headTeacherId: Number(teacherA.id), teacherIds: [Number(teacherA.id)], studentIds: [Number(studentA.id)], parentIds: [] }
  });
  assert.equal(result.response.status, 201);
  const classAId = Number(result.data.id);
  assert.ok(classAId);

  result = await request("/api/admin/classes", {
    method: "POST",
    token: adminToken,
    body: { name: "五年级二班", grade: "五年级", headTeacherId: Number(teacherB.id), teacherIds: [Number(teacherB.id)], studentIds: [Number(studentB.id)], parentIds: [] }
  });
  assert.equal(result.response.status, 201);
  const classBId = Number(result.data.id);

  result = await request("/api/admin/classes", { token: adminToken });
  assert.equal(result.response.status, 200);
  const created = result.data.classes.find(function (item) { return item.id === classAId; });
  assert.ok(created);
  assert.equal(created.teacherCount, 1);
  assert.equal(created.studentCount, 1);
  assert.equal(created.parentCount, 1); // 学生绑定的家长自动纳入班级
  assert.equal(created.headTeacherName, "分班教师甲");
  assert.ok(result.data.accounts.teachers.some(function (item) { return item.name === "分班教师乙"; }));
  assert.ok(result.data.accounts.students.some(function (item) { return item.name === "分班学生甲"; }));

  // 教师甲登录后只能看到本班学生
  result = await request("/api/auth/login", { method: "POST", body: { account: "cls_teacher_a_" + stamp, password: "123456" } });
  assert.equal(result.response.status, 200);
  const teacherAToken = result.data.token;

  result = await request("/api/teacher/students", { token: teacherAToken });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.students.map(function (item) { return item.name; }), ["分班学生甲"]);

  // 教师乙登录后只能看到自己的学生
  result = await request("/api/auth/login", { method: "POST", body: { account: "cls_teacher_b_" + stamp, password: "123456" } });
  const teacherBToken = result.data.token;
  result = await request("/api/teacher/students", { token: teacherBToken });
  assert.deepEqual(result.data.students.map(function (item) { return item.name; }), ["分班学生乙"]);

  // 教师甲发布班级任务 → 落到班级 A
  result = await request("/api/teacher/tasks", {
    method: "POST",
    token: teacherAToken,
    body: { title: "分班班级任务A", type: "阅读", duration: 15, goal: "本班任务" }
  });
  assert.equal(result.response.status, 200);

  result = await request("/api/auth/login", { method: "POST", body: { account: "cls_student_a_" + stamp, password: "123456" } });
  assert.equal(result.response.status, 200);
  const studentAToken = result.data.token;
  result = await request("/api/student/home", { token: studentAToken });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.task);
  assert.equal(result.data.task.title, "分班班级任务A");

  // 班级 B 的学生看不到班级 A 的班级任务
  result = await request("/api/auth/login", { method: "POST", body: { account: "cls_student_b_" + stamp, password: "123456" } });
  const studentBToken = result.data.token;
  result = await request("/api/student/home", { token: studentBToken });
  assert.equal(result.response.status, 200);
  if (result.data.task) assert.notEqual(result.data.task.title, "分班班级任务A");

  // 本班学生提交 → 只在班级 A 教师的提交列表中
  const classTaskId = Number((await request("/api/student/home", { token: studentAToken })).data.task.id);
  result = await request("/api/submissions", {
    method: "POST",
    token: studentAToken,
    body: { taskId: classTaskId, childId: Number(studentA.childId), status: "submitted", content: "分班提交内容", attachments: [] }
  });
  assert.equal(result.response.status, 200);

  result = await request("/api/teacher/overview", { token: teacherAToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.task.title, "分班班级任务A");
  assert.ok(result.data.submissions.some(function (item) { return item.child_name === "分班学生甲"; }));

  result = await request("/api/teacher/overview", { token: teacherBToken });
  assert.equal(result.response.status, 200);
  assert.ok(!result.data.submissions.some(function (item) { return item.child_name === "分班学生甲"; }));

  // 班级 A 的家长能看到班级任务
  result = await request("/api/auth/login", { method: "POST", body: { account: "cls_parent_a_" + stamp, password: "123456" } });
  const parentAToken = result.data.token;
  result = await request("/api/home?childId=" + Number(studentA.childId), { token: parentAToken });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.task);
  assert.equal(result.data.task.title, "分班班级任务A");
});

test("parent-only class roster still yields AI recipients and a校对 list", async function () {
  /* 复现线上故障：班级里只放了「教师 + 家长」，孩子是家长填问卷建的（children.user_id 为空、
   * 也没有学生账号），旧逻辑按 children.user_id 过滤导致教师看不到任何学生，
   * 于是 AI 匹配不到推送家长、「校对推送对象」列表恒为空。 */
  const stamp = Date.now();
  let result = await request("/api/auth/login", {
    method: "POST",
    body: { account: "admin", password: "018admin" }
  });
  const adminToken = result.data.token;

  const teacherAccount = "roster_teacher_" + stamp;
  const parentAccount = "roster_parent_" + stamp;
  const teacher = await createAccount(adminToken, { role: "teacher", account: teacherAccount, password: "123456", displayName: "名册教师" });
  const parent = await createAccount(adminToken, { role: "parent", account: parentAccount, password: "123456", displayName: "名册家长" });

  // 家长填问卷建孩子（children.user_id 为空，与线上数据一致）
  result = await request("/api/auth/login", { method: "POST", body: { account: parentAccount, password: "123456" } });
  const parentToken = result.data.token;
  result = await request("/api/questionnaire", {
    method: "POST",
    token: parentToken,
    body: {
      childName: "名册小明", gender: "男", age: 8, caregiver: ["爸爸"],
      timeAvailable: "适中", taskPreference: "低负担", interests: ["阅读"], grade: "二年级"
    }
  });
  assert.equal(result.response.status, 200);
  const rosterChildId = Number(result.data.child.id);

  // 班级只登记「教师 + 家长」，不登记学生账号
  result = await request("/api/admin/classes", {
    method: "POST",
    token: adminToken,
    body: {
      name: "名册班" + stamp, grade: "二年级",
      headTeacherId: Number(teacher.id), teacherIds: [Number(teacher.id)],
      studentIds: [], parentIds: [Number(parent.id)]
    }
  });
  assert.equal(result.response.status, 201);

  result = await request("/api/auth/login", { method: "POST", body: { account: teacherAccount, password: "123456" } });
  const rosterTeacherToken = result.data.token;

  // 关键回归：只登记家长的班级，教师仍应看到该家长的孩子
  result = await request("/api/teacher/students", { token: rosterTeacherToken });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.students.map(function (item) { return item.name; }), ["名册小明"]);

  // 「校对推送对象」应返回该家长，而不是空列表
  result = await request("/api/teacher/daily-update-recipients", { token: rosterTeacherToken });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.options.length >= 1, "可推送家长不应为空");
  assert.ok(result.data.options.some(function (item) { return Number(item.childId) === rosterChildId; }));

  // AI 自动识别：口述里带空格与「同学」称呼也应匹配到该学生并自动带上家长
  result = await request("/api/teacher/daily-updates", {
    method: "POST",
    token: rosterTeacherToken,
    body: { transcript: "今天名册 小 明同学主动帮老师整理了图书角。" }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.recipientSource, "ai-student", "应按学生家长匹配推送对象");
  assert.equal(Number(result.data.matchedChildId), rosterChildId);
  assert.ok(result.data.recipientCount >= 1, "AI 应自动设置推送家长");
  assert.ok(result.data.update.recipients.length >= 1);
  assert.ok(result.data.update.recipients.some(function (item) { return item.name === "名册家长"; }));

  // 清理：这条草稿不留在库里影响其他用例
  await request("/api/teacher/daily-updates/" + Number(result.data.update.id), {
    method: "DELETE",
    token: rosterTeacherToken
  });
});

test("admin can delete a managed account but cannot delete admin accounts", async function () {
  let result = await request("/api/auth/login", {
    method: "POST",
    body: { account: "admin", password: "018admin" }
  });
  assert.equal(result.response.status, 200);
  const adminToken = result.data.token;
  const account = "delete_teacher_" + Date.now();

  result = await request("/api/admin/accounts", {
    method: "POST",
    token: adminToken,
    body: { role: "teacher", account: account, password: "123456", displayName: "待删除教师" }
  });
  assert.equal(result.response.status, 201);
  const accountId = Number(result.data.id);

  result = await request("/api/admin/accounts/" + accountId, {
    method: "DELETE",
    token: adminToken
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.ok, true);

  result = await request("/api/auth/login", {
    method: "POST",
    body: { account: account, password: "123456" }
  });
  assert.equal(result.response.status, 401);

  result = await request("/api/admin/accounts/1", {
    method: "DELETE",
    token: adminToken
  });
  assert.equal(result.response.status, 404);
});

test("admin reply reaches the student's worry list and unread hint clears after reading", async function () {
  let result = await request("/api/auth/login", {
    method: "POST",
    body: { account: "xiaoce", password: "000111" }
  });
  assert.equal(result.response.status, 200);
  const studentToken = result.data.token;

  result = await request("/api/student/worries", {
    method: "POST",
    token: studentToken,
    body: { content: "这次月考没考好，心里有点难过。" }
  });
  assert.equal(result.response.status, 201);
  const worryId = Number(result.data.worry.id);

  // 学生能看到自己的心事，但此时还没有回复
  result = await request("/api/student/worries", { token: studentToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.newReplyCount, 0);
  assert.equal(result.data.worries[0].id, worryId);
  assert.equal(result.data.worries[0].reply_content, "");

  // 学生无权替别人回复
  result = await request("/api/admin/worries/" + worryId + "/reply", {
    method: "POST",
    token: studentToken,
    body: { content: "越权回复" }
  });
  assert.equal(result.response.status, 403);

  result = await request("/api/auth/login", {
    method: "POST",
    body: { account: "admin", password: "018admin" }
  });
  const adminToken = result.data.token;

  result = await request("/api/admin/worries/" + worryId + "/reply", {
    method: "POST",
    token: adminToken,
    body: { content: "" }
  });
  assert.equal(result.response.status, 400);

  result = await request("/api/admin/worries/" + worryId + "/reply", {
    method: "POST",
    token: adminToken,
    body: { content: "一次考试说明不了什么，老师看到你的努力了，继续加油。" }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.worry.reply_content, "一次考试说明不了什么，老师看到你的努力了，继续加油。");

  // 管理员列表能看到该条回复
  result = await request("/api/admin/worries", { token: adminToken });
  const adminRow = result.data.worries.find(function (row) { return Number(row.id) === worryId; });
  assert.ok(adminRow);
  assert.equal(adminRow.reply_read_at, null);

  // 学生端出现「你有新的回复」
  result = await request("/api/student/worries", { token: studentToken });
  assert.equal(result.data.newReplyCount, 1);
  assert.equal(result.data.worries[0].reply_content, "一次考试说明不了什么，老师看到你的努力了，继续加油。");
  assert.equal(result.data.worries[0].reply_read_at, null);

  // 查看后标记已读，再次进入不再提示
  result = await request("/api/student/worries/replies/read", {
    method: "POST",
    token: studentToken
  });
  assert.equal(result.response.status, 200);

  result = await request("/api/student/worries", { token: studentToken });
  assert.equal(result.data.newReplyCount, 0);
  assert.ok(result.data.worries[0].reply_read_at);
});
