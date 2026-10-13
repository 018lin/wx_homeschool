/**
 * 通用工具：时间格式化、状态映射、安全解析
 */

/**
 * 后端时间格式解析
 * 库里是 "YYYY-MM-DD HH:MM:SS"（无时区，服务器按 +08:00 本地时间写入）
 * 个别接口返回 ISO "YYYY-MM-DDTHH:mm:ss.sssZ"
 * @returns {number} 毫秒时间戳
 */
function parseTime(str) {
  if (!str) return 0;
  if (typeof str === "number") return str;
  var s = String(str).trim();
  // 已是 ISO（含 T 和 Z/时区）
  if (s.indexOf("T") >= 0) return new Date(s).getTime();
  // "YYYY-MM-DD HH:MM:SS" → 按 +08:00 解析
  var iso = s.replace(" ", "T") + "+08:00";
  var t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

/** 日期时间：10-12 18:30 */
function formatDateTime(str) {
  var t = parseTime(str);
  if (!t) return "";
  var d = new Date(t);
  return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

/** 仅限日期：2026-10-12 */
function formatDate(str) {
  var t = parseTime(str);
  if (!t) return "";
  var d = new Date(t);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/** 相对时间：刚刚 / 5 分钟前 / 昨天 18:30 / 10-12 */
function fromNow(str) {
  var t = parseTime(str);
  if (!t) return "";
  var diff = Date.now() - t;
  if (diff < 0) diff = 0;
  var min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return min + " 分钟前";
  var hour = Math.floor(min / 60);
  if (hour < 24) return hour + " 小时前";
  var day = Math.floor(hour / 24);
  if (day === 1) return "昨天 " + formatDateTime(str).split(" ")[1];
  if (day < 7) return day + " 天前";
  return formatDate(str);
}

/** 任务状态 → 展示文案与色值 */
var TASK_STATUS = {
  none: { text: "暂无任务", color: "#8795a7", bg: "#f1f5f9" },
  ongoing: { text: "待完成", color: "#0057b8", bg: "#edf5ff" },
  draft: { text: "草稿待提交", color: "#8a4b10", bg: "#fff7e8" },
  submitted: { text: "待老师点评", color: "#0f766e", bg: "#e9f8f0" },
  done: { text: "已完成", color: "#157a45", bg: "#e9f8f0" }
};

function taskStatusMeta(status) {
  return TASK_STATUS[status] || TASK_STATUS.none;
}

/** 提交类型 → 展示 */
var SUB_TYPE = {
  text: "文字记录",
  check: "打卡",
  image: "图片",
  audio: "录音",
  video: "视频",
  teacher_observation: "教师观察"
};

function subTypeLabel(t) {
  return SUB_TYPE[t] || "文字记录";
}

/** 关注等级 → 色值 */
var ENGAGEMENT_STATUS = {
  insufficient: { color: "#8795a7" },
  low: { color: "#b42318" },
  medium: { color: "#8a4b10" },
  high: { color: "#157a45" }
};

function engagementColor(status) {
  return (ENGAGEMENT_STATUS[status] || ENGAGEMENT_STATUS.insufficient).color;
}

/** 风险等级 → 色值 */
function riskColor(level) {
  if (level === "red") return "#b42318";
  if (level === "yellow") return "#8a4b10";
  return "#157a45";
}

/** 审阅状态 */
var REQUEST_STATUS = {
  pending: { text: "待老师回复", color: "#8a4b10", bg: "#fff7e8" },
  approved: { text: "已采纳", color: "#157a45", bg: "#e9f8f0" },
  rejected: { text: "未采纳", color: "#b42318", bg: "#fff1f0" }
};

function requestStatusMeta(status) {
  return REQUEST_STATUS[status] || REQUEST_STATUS.pending;
}

/** 安全解析 attachments（JSON 字符串） */
function parseAttachments(str) {
  if (!str) return [];
  if (Array.isArray(str)) return str;
  try {
    var arr = JSON.parse(str);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

/** 安全解析 feedback_tags（逗号字符串） */
function parseTags(str) {
  if (!str) return [];
  if (Array.isArray(str)) return str;
  return String(str)
    .split(/[，,]/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return !!s; });
}

/** 文本摘要 */
function truncate(str, len) {
  var s = str == null ? "" : String(str);
  return s.length > len ? s.slice(0, len) + "…" : s;
}

/** 非空兜底 */
function orDefault(v, d) {
  return v === undefined || v === null || v === "" ? d : v;
}

module.exports = {
  parseTime: parseTime,
  formatDate: formatDate,
  formatDateTime: formatDateTime,
  fromNow: fromNow,
  taskStatusMeta: taskStatusMeta,
  subTypeLabel: subTypeLabel,
  engagementColor: engagementColor,
  riskColor: riskColor,
  requestStatusMeta: requestStatusMeta,
  parseAttachments: parseAttachments,
  parseTags: parseTags,
  truncate: truncate,
  orDefault: orDefault
};
