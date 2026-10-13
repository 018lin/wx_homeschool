#!/usr/bin/env node
/**
 * 今日成长记录 · 自动推送任务
 *
 * 教师当天没有点「确认无误」时，草稿会在每天 18:00（北京时间）自动推送给
 * AI 判定的家长（教师可提前调整推送对象）。
 *
 * 为什么要独立脚本：Render 免费实例会休眠，进程内定时器在实例睡着时不会执行。
 * 因此由 Render Cron Job 定时拉起本脚本（见 render.yaml），
 * 与 server.js 内的定时器、请求惰性补偿互为兜底，三者并发也不会重复推送。
 *
 * 用法：
 *   node --experimental-sqlite scripts/auto-send-daily-updates.js
 *   DAILY_AUTO_SEND_TIME=18:30 node scripts/auto-send-daily-updates.js
 */
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const { db, databaseReady, runDailyUpdateAutoSend } = require("../server.js");

databaseReady
  .then(function () { return runDailyUpdateAutoSend({}); })
  .then(function (result) {
    console.log("[成长记录自动推送] 检查时间 " + result.checkedAt + "，计划推送时间 " + result.autoSendTime);
    console.log("  已推送 " + result.sent.length + " 条" + (result.skipped.length ? "，未推送 " + result.skipped.length + " 条" : ""));
    result.sent.forEach(function (item) {
      console.log("  #" + item.id + " -> " + item.recipientCount + " 位家长（" + (item.mode === "overdue" ? "跨日补发" : "按时推送") + "）");
    });
    return db.close();
  })
  .then(function () { process.exit(0); })
  .catch(function (error) {
    console.error("[成长记录自动推送] 执行失败：", error && error.stack ? error.stack : error);
    process.exit(1);
  });
