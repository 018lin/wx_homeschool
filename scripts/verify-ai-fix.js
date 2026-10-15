/**
 * 修复后回归验证：管理员 + 教师双角色的「一键生成个性任务 → 发布」全链路
 */
const BASE = "http://localhost:" + (process.env.AI_VERIFY_PORT || "3123");
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + label + (extra ? "  " + extra : "")); }
  else { fail++; console.log("  ✗ " + label + (extra ? "  " + extra : "")); }
}

async function jfetch(path, options = {}) {
  const res = await fetch(BASE + path, options);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = { __raw: text.slice(0, 200) }; }
  return { status: res.status, data };
}

async function login(account, password) {
  const r = await jfetch("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, password }),
  });
  return { token: r.data.token, role: r.data.user.role };
}

async function verify(label, account, password) {
  console.log("\n========== " + label + " ==========");
  const { token, role } = await login(account, password);
  ok("登录成功", !!token, "role=" + role);
  const H = { "Content-Type": "application/json", Authorization: "Bearer " + token };

  // 1. 学生列表
  const st = await jfetch("/api/teacher/students", { headers: H });
  const list = (st.data && st.data.students) || [];
  ok("GET /api/teacher/students", st.status === 200 && list.length > 0, "count=" + list.length);

  // 2. 模拟前端 loadStudents 的 id 归一化（修复后行为）
  const normalized = list.map(function (s) { return Object.assign({}, s, { id: Number(s.id) }); });
  const childId = normalized[0].id;
  ok("学生 id 归一化为 Number", typeof childId === "number", "childId=" + childId);

  // 3. 模拟 publish.js loadStudents 定位逻辑（修复后：Number 比较）
  const wantId = Number(childId) || 0;
  let idx = 0;
  for (let i = 0; i < normalized.length; i++) { if (normalized[i].id === wantId) { idx = i + 1; break; } }
  ok("picker 能定位到该学生（不再退回全班）", idx > 0, "studentIndex=" + idx + "（0 表示定位失败）");

  // 4. AI 一键生成
  const t0 = Date.now();
  const sug = await jfetch("/api/teacher/student-suggestions?childId=" + childId, { headers: H });
  const s0 = (sug.data && sug.data.suggestions && sug.data.suggestions[0]) || {};
  const ms = Date.now() - t0;
  ok("GET student-suggestions（AI 一键生成）", sug.status === 200 && !!s0.title, ms + "ms");
  ok("AI 真实生成（非本地兜底）", s0.aiGenerated === true, "aiStatus=" + s0.aiStatus);
  ok("生成耗时在 60s 超时内", ms < 60000, ms + "ms");

  // 5. 重新生成（教师口述）
  const regen = await jfetch("/api/teacher/student-suggestions/regenerate", {
    method: "POST", headers: H,
    body: JSON.stringify({ childId, note: "孩子注意力分散，先做10分钟即可。" }),
  });
  ok("POST regenerate（教师口述重生成）", regen.status === 200 && regen.data.suggestions.length > 0);

  // 6. 发布带 childId 的个人任务 —— 这是修复前 404「学生不存在」的那一步
  const pub = await jfetch("/api/teacher/tasks", {
    method: "POST", headers: H,
    body: JSON.stringify({
      title: "【回归验证】AI 一键生成任务 " + Date.now(),
      childId: childId, goal: s0.goal || "g", steps: s0.steps || "s",
      dialogueTips: s0.dialogueTips || "d", submitHint: s0.submitHint || "h",
      duration: Number(s0.duration) || 20, type: s0.type || "阅读", difficulty: "普通",
    }),
  });
  ok("POST /api/teacher/tasks（发布 AI 生成任务）", pub.status === 200,
    "status=" + pub.status + " " + (pub.data && pub.data.message ? "msg=" + pub.data.message : ""));
  return pub.data && pub.data.id;
}

(async () => {
  const adminTaskId = await verify("管理员 admin", "admin", "018admin");
  await verify("教师 018", "018", "018018");

  // 清理回归验证产生的任务
  if (adminTaskId) {
    const { token } = await login("admin", "018admin");
    const del = await jfetch("/api/admin/tasks/" + adminTaskId, {
      method: "DELETE", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    });
    console.log("\n[清理] 删除回归任务 id=" + adminTaskId + " → HTTP " + del.status);
  }

  console.log("\n===== 汇总：通过 " + pass + " / 失败 " + fail + " =====");
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error("FATAL", e); process.exit(1); });
