#!/usr/bin/env node
/**
 * 小程序工程自检脚本
 * 1. app.json 注册的页面是否都有完整四件套（js/json/wxml/wxss）
 * 2. wxml 中 bindtap/bindchange 等方法是否在对应 js 中定义
 * 3. wxml 中引用的组件是否在 app.json 全局注册
 * 用法：node scripts/check-mp.js
 */
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..", "miniprogram");
var problems = [];
var warnings = [];

function exists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

/* ---- 1. 页面四件套 ---- */
var appJson = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
var pages = appJson.pages || [];
console.log("注册页面数：" + pages.length);

pages.forEach(function (p) {
  ["js", "json", "wxml", "wxss"].forEach(function (ext) {
    if (!exists(p + "." + ext)) problems.push("缺少文件：" + p + "." + ext);
  });
});

/* ---- 2. 全局组件 ---- */
var globalComponents = Object.keys(appJson.usingComponents || {});

/* ---- 3. wxml 事件方法 vs js 定义 ---- */
pages.forEach(function (p) {
  var wxmlPath = path.join(ROOT, p + ".wxml");
  var jsPath = path.join(ROOT, p + ".js");
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) return;

  var wxml = fs.readFileSync(wxmlPath, "utf8");
  var js = fs.readFileSync(jsPath, "utf8");

  // 事件绑定方法名
  var handlerRe = /bind(?:tap|change|input|confirm|submit)="([A-Za-z_$][\w$]*)"/g;
  var m;
  var names = {};
  while ((m = handlerRe.exec(wxml)) !== null) names[m[1]] = true;

  Object.keys(names).forEach(function (name) {
    var defRe = new RegExp("(^|\\s)" + name + "\\s*[:(]", "m");
    if (!defRe.test(js)) problems.push(p + ".wxml 绑定了 " + name + "，但 " + p + ".js 中没有定义");
  });

  // catch:bind* 形式
  var catchRe = /catch(?:tap)="([A-Za-z_$][\w$]*)"/g;
  while ((m = catchRe.exec(wxml)) !== null) {
    if (!new RegExp("(^|\\s)" + m[1] + "\\s*[:(]", "m").test(js)) {
      problems.push(p + ".wxml catch 绑定 " + m[1] + " 未定义");
    }
  }

  // 自定义组件标签
  var tagRe = /<(nav-bar|app-header)\b/g;
  while ((m = tagRe.exec(wxml)) !== null) {
    if (globalComponents.indexOf(m[1]) < 0) {
      problems.push(p + ".wxml 使用了 <" + m[1] + ">，但未在 app.json usingComponents 注册");
    }
  }
});

/* ---- 4. wxml 中 data-* 引用了未定义的顶层字段（粗查） ---- */
pages.forEach(function (p) {
  var wxmlPath = path.join(ROOT, p + ".wxml");
  var jsPath = path.join(ROOT, p + ".js");
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) return;
  var wxml = fs.readFileSync(wxmlPath, "utf8");
  var js = fs.readFileSync(jsPath, "utf8");
  // 收集 js 中 data: { 块的一级 key
  var dataMatch = js.match(/data:\s*\{/);
  if (!dataMatch) return;
  var start = dataMatch.index + dataMatch[0].length;
  var depth = 1;
  var i = start;
  while (i < js.length && depth > 0) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") depth--;
    i++;
  }
  var dataBlock = js.slice(start, i - 1);
  var keys = {};
  var kRe = /(^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g;
  var km;
  while ((km = kRe.exec(dataBlock)) !== null) keys[km[2]] = true;

  // wxml 顶层 {{xxx}} 引用
  var varRe = /\{\{\s*([A-Za-z_$][\w$]*)/g;
  var vm;
  while ((vm = varRe.exec(wxml)) !== null) {
    var v = vm[1];
    if (["item", "index", "true", "false", "null", "undefined"].indexOf(v) >= 0) continue;
    if (!keys[v]) warnings.push(p + ".wxml 引用 {{" + v + "}}，js data 中未声明（可能是 setData 动态写入，需人工确认）");
  }
});

/* ---- 5. 弹层必须放在 .page--hero 容器外 ----
 * .page--hero 有 position:relative + z-index:2，会生成堆叠上下文；
 * 弹层写在里面时，它的 z-index(var(--z-modal)=1000) 只在该上下文内生效，
 * 压不过同为根级兄弟的 <nav-bar>(z-index:var(--z-nav)=200)，
 * 底部固定导航栏会盖住 .modal-foot 的确认按钮 → 按钮点不动。
 */
pages.forEach(function (p) {
  var wxmlPath = path.join(ROOT, p + ".wxml");
  if (!fs.existsSync(wxmlPath)) return;
  var lines = fs.readFileSync(wxmlPath, "utf8").split(/\r?\n/);

  var depth = 0;        // .page 容器内的嵌套深度
  var inPage = false;
  lines.forEach(function (raw, i) {
    var line = raw.replace(/<!--[\s\S]*?-->/g, "");
    var opens = (line.match(/<view[\s>]/g) || []).length;
    var closes = (line.match(/<\/view>/g) || []).length;
    var isPageRoot = /class="[^"]*\bpage\b[^"]*"/.test(line) && !/modal|sheet/.test(line);

    if (!inPage && isPageRoot) { inPage = true; depth = opens - closes; return; }
    if (inPage) {
      if (/\bmodal-mask\b|\bsheet-mask\b/.test(line)) {
        problems.push(
          p + ".wxml:" + (i + 1) + " 弹层(.modal-mask/.sheet-mask) 写在 .page 容器内，" +
          "会被 .page--hero 的堆叠上下文困住，底部确认按钮可能被 nav-bar 遮挡；请移到 .page 之外"
        );
      }
      depth += opens - closes;
      if (depth <= 0) inPage = false;
    }
  });
});

console.log("\n===== 错误 (" + problems.length + ") =====");
problems.forEach(function (x) { console.log("  ✗ " + x); });

console.log("\n===== 提示 (" + warnings.length + ") =====");
warnings.slice(0, 60).forEach(function (x) { console.log("  ! " + x); });

console.log("\n结果：" + (problems.length ? "存在需要修复的问题" : "结构检查通过"));
process.exit(problems.length ? 1 : 0);
