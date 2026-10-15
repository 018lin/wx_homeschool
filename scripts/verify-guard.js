/**
 * 验证 app.js installPageGuard 修复：
 * 管理员能否进入教师端「一键生成个性任务」所在页面与「任务建议」页。
 */
const path = require("path");
const fs = require("fs");
const Module = require("module");

const MP = path.join(__dirname, "..", "miniprogram");
const APPJS = path.join(MP, "app.js");

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + label + (extra ? "  " + extra : "")); }
  else { fail++; console.log("  ✗ " + label + (extra ? "  " + extra : "")); }
}

// 极简 wx：守卫只需 reLaunch / showToast
const reLaunches = [];
global.wx = {
  getStorageSync: function () { return ""; },
  reLaunch: function (o) { reLaunches.push(o.url); },
  showToast: function (o) { reLaunches.push("toast:" + o.title); },
  setStorageSync: function () {}, removeStorageSync: function () {},
};
global.getApp = function () { return global.__app; };

// api.js 的 track 会被守卫调用，这里直接打桩
const API_STUB = path.join(__dirname, "_api_stub.js");
fs.writeFileSync(API_STUB, "module.exports={ getToken:function(){return'';}, getUser:function(){return null;}, clearAuth:function(){}, api:{ track:function(){} } };");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (/utils\/api\.js$/.test(request)) return API_STUB;
  return origResolve.call(this, request, parent, ...rest);
};

global.__app = {
  globalData: { token: "t", user: { role: "admin" }, role: "admin" },
  isLogin: function () { return true; },
  landingPath: function (r) { return "/pages/admin/overview/overview"; },
  requireRole: function (roles) {
    if (!this.isLogin()) { global.wx.reLaunch({ url: "/pages/login/login" }); return false; }
    var allowed = Array.isArray(roles) ? roles : (roles ? [roles] : []);
    var cur = String(this.globalData.role || "").trim().toLowerCase();
    if (!allowed.length || allowed.indexOf(cur) >= 0) return true;
    global.wx.showToast({ title: "当前账号无权访问此页面" });
    var target = this.landingPath(cur);
    setTimeout(function () { global.wx.reLaunch({ url: target }); }, 0);
    return false;
  },
};

global.App = function (def) { global.__appDef = def; };
// app.js 加载前先装一层记录器：记录每次 Page(def) 收到的原始定义。
// app.js 的 installPageGuard 会把 global.Page 换成包装版，这里预留钩子，
// 让包装版也把定义写回 __lastDef。
global.__lastDef = null;
global.Page = function (def) { global.__lastDef = def; };
// app.js 加载后，把包装后的 Page 也接到同一个记录器上
function attachRecorder() {
  const wrapped = global.Page;
  if (wrapped.__recorderAttached) return;
  global.Page = function (def) { global.__lastDef = def; return wrapped(def); };
  global.Page.__recorderAttached = true;
}

delete require.cache[APPJS];
require(APPJS);
ok("app.js 已加载", !!global.__appDef);
attachRecorder();

async function tryRoute(route) {
  // 守卫在 app.js 加载时已包装 Page；用它包装的 Page 注册页面，才会真正走 onShow 守卫。
  const guardedPage = global.Page;
  guardedPage({ onShow: function () {} });
  const def = global.__lastDef;
  if (!def) return true;
  reLaunches.length = 0;
  def.route = route;
  def.onShow();
  // requireRole 内部用 setTimeout(…, 0) 触发 reLaunch，必须让出事件循环后再判定
  await new Promise(function (r) { setTimeout(r, 20); });
  const blocked = reLaunches.some(function (u) { return typeof u === "string" && u.indexOf("/pages/") === 0; });
  return !blocked;
}

(async function run(){
console.log("\n=== 管理员（admin）访问各页面 ===");
const adminCases = [
  ["pages/teacher/publish/publish", true, "一键生成个性任务 / 发布任务"],
  ["pages/teacher/suggestion/suggestion", true, "AI 任务建议与重新生成"],
  ["pages/teacher/ai/ai", true, "AI 洞察（原本就放行）"],
  ["pages/teacher/ai/report/report", true, "AI 报告（原本就放行）"],
  ["pages/teacher/students/students", false, "学生档案（仍应仅教师）"],
  ["pages/teacher/daily/daily", false, "今日校园观察（仍应仅教师）"],
  ["pages/admin/overview/overview", true, "管理员工作台"],
];
for (const c of adminCases) {
  const got = await tryRoute(c[0]);
  ok("admin → " + c[2], got === c[1], got ? "已放行" : "被拦截");
}

console.log("\n=== 教师（teacher）访问各页面 ===");
global.__app.globalData.role = "teacher";
global.__app.globalData.user = { role: "teacher" };
const teacherCases = [
  ["pages/teacher/publish/publish", true, "一键生成个性任务"],
  ["pages/teacher/suggestion/suggestion", true, "AI 任务建议"],
  ["pages/teacher/ai/ai", true, "AI 洞察"],
  ["pages/admin/overview/overview", false, "管理员工作台（应拦截）"],
];
for (const c of teacherCases) {
  const got = await tryRoute(c[0]);
  ok("teacher → " + c[2], got === c[1], got ? "已放行" : "被拦截");
}

console.log("\n=== 家长（parent）访问教师端 ===");
global.__app.globalData.role = "parent";
global.__app.globalData.user = { role: "parent" };
for (const r of ["pages/teacher/publish/publish", "pages/teacher/suggestion/suggestion", "pages/teacher/ai/ai"]) {
  ok("parent → " + r + "（应拦截）", (await tryRoute(r)) === false);
}

console.log("\n===== 汇总：通过 " + pass + " / 失败 " + fail + " =====");
Module._resolveFilename = origResolve;
try { fs.unlinkSync(API_STUB); } catch (e) {}
process.exit(fail ? 1 : 0);
})();
