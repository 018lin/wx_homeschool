/**
 * 用「修复后真实的 publish.js / app.js」跑一遍，确认前端逻辑成立。
 * 做法：注入模拟 wx + getApp 运行时，require 真实页面文件，触发 onLoad/onShow/onGenerateTask。
 */
const path = require("path");
const Module = require("module");
const fs = require("fs");

const MP = path.join(__dirname, "..", "miniprogram");
const API_FILE = path.join(MP, "utils", "api.js");
const PORT = process.env.AI_VERIFY_PORT || "3123";
const BASE = "http://localhost:" + PORT;

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + label + (extra ? "  " + extra : "")); }
  else { fail++; console.log("  ✗ " + label + (extra ? "  " + extra : "")); }
}

// ---- 模拟 wx ----
const toasts = [];
global.wx = {
  getStorageSync: function (k) { return global.__store[k] || ""; },
  setStorageSync: function (k, v) { global.__store[k] = v; },
  removeStorageSync: function (k) { delete global.__store[k]; },
  showLoading: function (o) { console.log("    [wx.showLoading]", o.title); },
  hideLoading: function () {},
  showToast: function (o) { toasts.push(o.title); console.log("    [wx.showToast]", o.title); },
  showModal: function () {},
  getAccountInfoSync: function () { return { miniProgram: { envVersion: "develop" } }; },
  redirectTo: function () {}, reLaunch: function () {}, navigateTo: function (o) { console.log("    [wx.navigateTo]", o.url); },
  request: function (o) {
    let url = o.url;
    if (o.method === "GET" && o.data && Object.keys(o.data).length) {
      const parts = [];
      Object.keys(o.data).forEach(function (k) {
        if (o.data[k] !== undefined && o.data[k] !== null && o.data[k] !== "") {
          parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(o.data[k]));
        }
      });
      if (parts.length) url += (url.indexOf("?") >= 0 ? "&" : "?") + parts.join("&");
    }
    const started = Date.now();
    fetch(url, {
      method: o.method || "GET",
      headers: o.header || {},
      body: (o.method && o.method !== "GET") ? JSON.stringify(o.data || {}) : undefined,
    }).then(async function (res) {
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch (e) { data = text; }
      console.log("    → HTTP " + res.status + " (" + (Date.now() - started) + "ms) " + url.replace(/^https?:\/\/[^/]+/, ""));
      if (o.success) o.success({ statusCode: res.status, data: data });
    }).catch(function (e) {
      console.log("    → 请求失败 " + (e.cause ? e.cause.code : e.message));
      if (o.fail) o.fail({ errMsg: "request:fail " + (e.cause ? e.cause.code : e.message) });
    });
    return { abort: function () {}, onChunkReceived: function () {} };
  },
};

// ---- 把 api.js 指向本机后端（不改动真实文件）----
const orig = fs.readFileSync(API_FILE, "utf8");
const tmp = API_FILE + ".simtmp2";
fs.writeFileSync(tmp, orig.replace('var REMOTE_BASE = "https://wx-homeschool-1.onrender.com";', "var REMOTE_BASE = \"" + BASE + "\";"));

// 让页面 require 的 "../../../utils/api.js" 解析到打了补丁的副本
const Module_ = require("module");
const origResolve = Module_._resolveFilename;
Module_._resolveFilename = function (request, parent, ...rest) {
  if (/utils\/api(\.simtmp2)?(\.js)?$/.test(request)) return tmp;
  return origResolve.call(this, request, parent, ...rest);
};

const PUBLISH = path.join(MP, "pages", "teacher", "publish", "publish.js");

async function main() {
  const loginRes = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: "018", password: "018018" }),
  }).then(function (r) { return r.json(); });
  global.__store = { token: loginRes.token, user: loginRes.user };

  const app = {
    globalData: { token: loginRes.token, user: loginRes.user, role: loginRes.user.role, publishDraft: null },
    isLogin: function () { return true; },
    requireRole: function (roles) { return !roles || roles.length === 0 || roles.indexOf(app.globalData.role) >= 0; },
    landingPath: function () { return "/pages/teacher/workbench/workbench"; },
  };
  global.getApp = function () { return app; };

  console.log("=== 场景：从「任务建议」带 draft 进发布页（childId=数字） ===");
  app.globalData.publishDraft = {
    title: "预置标题", goal: "g", steps: "s", dialogueTips: "d", submitHint: "h",
    duration: 20, type: "阅读", childId: 21,
  };

  let captured = null;
  global.Page = function (def) { captured = def; };
  delete require.cache[PUBLISH];
  require(PUBLISH);

  ok("页面已注册", !!captured);
  const page = Object.assign({}, captured);
  page.data = JSON.parse(JSON.stringify(captured.data));
  page.setData = function (patch) { Object.assign(page.data, patch); };
  page.route = "pages/teacher/publish/publish";

  page.onLoad({});
  ok("onLoad 已带入 childId", page.data.childId === 21, "childId=" + page.data.childId);
  ok("onLoad 已带入表单内容", page.data.title === "预置标题");

  console.log("\n=== 触发 onShow → loadStudents（验证 picker 定位） ===");
  await page.onShow();
  await new Promise(function (r) { setTimeout(r, 2500); });

  ok("学生列表已加载", page.data.students.length > 0, "count=" + page.data.students.length);
  ok("学生 id 已归一化为 Number", typeof page.data.students[0].id === "number",
    "id=" + JSON.stringify(page.data.students[0].id));
  ok("picker 正确选中该学生（不再是全班）", page.data.studentIndex > 0,
    "studentIndex=" + page.data.studentIndex + "，显示=" + page.data.studentNames[page.data.studentIndex]);

  console.log("\n=== 触发 onGenerateTask（AI 一键生成，实测需 5~10s） ===");
  page.onGenerateTask();
  await new Promise(function (r) { setTimeout(r, 20000); });

  ok("generating 已复位", page.data.generating === false);
  ok("表单已被 AI 内容回填", !!page.data.title && page.data.title !== "预置标题",
    "title=" + page.data.title);
  ok("AI 回填了具体步骤", !!page.data.steps && page.data.steps.length > 10);
  ok("AI 回填了共育目标", !!page.data.goal && page.data.goal.length > 5);
  ok("最终 toast 提示正确", toasts[toasts.length - 1].indexOf("AI 任务已生成") >= 0,
    "toast=" + toasts[toasts.length - 1]);

  console.log("\n=== 场景：未选学生（选「全班学生」）时点按钮 ===");
  toasts.length = 0;
  page.setData({ childId: null, studentIndex: 0 });
  page.onGenerateTask();
  ok("给出明确引导提示", toasts[0] && toasts[0].indexOf("先在上方选择具体学生") >= 0,
    "toast=" + toasts[0]);

  console.log("\n===== 汇总：通过 " + pass + " / 失败 " + fail + " =====");
  Module_._resolveFilename = origResolve;
  try { fs.unlinkSync(tmp); } catch (e) {}
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) { console.error("FATAL", e); process.exit(1); });
