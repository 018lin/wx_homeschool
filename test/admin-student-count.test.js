/**
 * 回归测试：管理员端「账号概览」卡片与「账号管理」详情页的学生数必须一致。
 *
 * 历史 bug：/api/admin/overview 的 stats.studentCount 统计 children 表（学生档案），
 * 而 /api/admin/accounts 统计 users.role='student'（学生账号）。
 * 家长端 POST /api/children 绑定孩子只建 children 不建 users，演示种子数据同理，
 * 于是同一个「学生数」在两个页面差出一大截（线上实测 16 vs 3）。
 *
 * 本测试造出「有档案但无账号」的脏数据，锁死三处口径必须相等。
 */
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "home-school-count-"));
process.env.DATA_DIR = dataDir;
// ⚠️ 必须赋空字符串，**绝不能 delete**：
// server.js 的 loadLocalEnv 用 hasOwnProperty 守卫「不覆盖已存在的变量」，
// delete 之后 DATABASE_URL 不复存在，.env.local 会把生产库连接串填回去，
// 于是这个测试会直接往**生产 Neon 库**写测试数据（真实踩过）。
process.env.DATABASE_URL = "";
process.env.ZHIPU_API_KEY = "";
process.env.DEEPSEEK_API_KEY = "";
process.env.PORT = "0";
process.env.NODE_ENV = "test";
// 本测试自己造脏数据，不依赖演示种子；也避免 seed 往 children 里塞演示档案。
process.env.DEMO_SEED = "0";

const app = require("../server");
let baseUrl;
let adminToken;

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
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (error) { data = { text: text }; }
  return { response, data };
}

before(async function () {
  await app.databaseReady;
  // 保险丝：万一环境变量又被 .env.local 灌回生产库，这里必须立刻炸掉，
  // 绝不允许测试往生产数据里写脏数据。
  assert.equal(app.db.isPostgres, false, "测试必须跑在 SQLite 沙箱，检测到 Postgres/生产库连接，已中止");
  await new Promise(function (resolve) {
    app.server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = "http://127.0.0.1:" + app.server.address().port;

  // 管理员登录（种子账号）
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { account: "admin", password: "018admin" }
  });
  assert.equal(login.response.status, 200, "管理员登录失败：" + JSON.stringify(login.data));
  adminToken = login.data.token;
});

after(async function () {
  await new Promise(function (resolve) {
    if (!app.server.listening) return resolve();
    app.server.close(resolve);
  });
  await app.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("概览卡片的三项账号数与账号管理页逐项一致（学生数不再统计档案表）", async function () {
  // 造脏数据：3 个只有 children 档案、没有 users 账号的「学生」
  for (const name of ["口径测试甲", "口径测试乙", "口径测试丙"]) {
    await app.db.prepare("INSERT INTO children (name, grade) VALUES (?, ?)").run(name, "五年级");
  }
  // 再造 2 个正式学生账号（POST 会同时建 users + children + bindings）
  for (const item of [{ account: "countstd1", name: "计数学生一" }, { account: "countstd2", name: "计数学生二" }]) {
    const created = await request("/api/admin/accounts", {
      method: "POST",
      token: adminToken,
      body: {
        role: "student",
        account: item.account,
        password: "123456",
        displayName: item.name,
        grade: "五年级"
      }
    });
    assert.equal(created.response.status, 201, "创建学生账号失败：" + JSON.stringify(created.data));
  }

  const overview = await request("/api/admin/overview", { token: adminToken });
  assert.equal(overview.response.status, 200);
  const accounts = await request("/api/admin/accounts", { token: adminToken });
  assert.equal(accounts.response.status, 200);

  const stats = overview.data.stats || {};
  const studentAccounts = (accounts.data.students || []).length;
  const teacherAccounts = (accounts.data.teachers || []).length;
  const parentAccounts = (accounts.data.parents || []).length;

  // 核心断言：概览卡片 = 账号管理页
  assert.equal(stats.studentCount, studentAccounts, "概览学生数必须等于账号管理页的学生账号数");
  assert.equal(stats.teacherCount, teacherAccounts, "概览教师数必须等于账号管理页的教师账号数");
  assert.equal(stats.parentCount, parentAccounts, "概览家长数必须等于账号管理页的家长账号数");

  // 档案数仍是另一个值，且确实大于账号数（证明两种口径确实不同，不是巧合相等）
  assert.equal(stats.profileCount, (overview.data.students || []).length, "profileCount 必须等于 children 档案数");
  assert.ok(
    stats.profileCount > stats.studentCount,
    "脏数据下档案数应大于账号数（否则本测试失去区分能力）"
  );

  // 概览返回的 students 是档案列表（children），不是账号列表
  const overviewNames = (overview.data.students || []).map(function (s) { return s.name; });
  assert.ok(overviewNames.indexOf("口径测试甲") >= 0, "概览 students 应包含无账号的档案");
});

test("无脏数据时概览的 profileCount 与 studentCount 可以相等，但字段语义不混淆", async function () {
  const overview = await request("/api/admin/overview", { token: adminToken });
  const stats = overview.data.stats || {};
  assert.equal(typeof stats.profileCount, "number", "必须始终返回 profileCount");
  assert.ok(stats.studentCount >= 0);
  // 学生账号数不应超过档案数（每个 student 账号建档时会同时插 children）
  assert.ok(stats.studentCount <= stats.profileCount, "学生账号数不应大于档案数");
});