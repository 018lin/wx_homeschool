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

/** 今天的日期键：2026-10-12（用于与后端 record_date 对齐） */
function dateKey(date) {
  var d = date instanceof Date ? date : new Date();
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

/** 审阅状态（家长成长关注反馈：家长只提交反馈，老师确认后才生成定制任务） */
var REQUEST_STATUS = {
  pending: { text: "待老师处理", color: "#8a4b10", bg: "#fff7e8" },
  approved: { text: "已生成定制任务", color: "#157a45", bg: "#e9f8f0" },
  rejected: { text: "老师已回复", color: "#b42318", bg: "#fff1f0" }
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

/* ---------- 成长关注 AI 方案（ai_plan 存的是 JSON 字符串）→ 可读段落 ---------- */
var AI_PLAN_GROUPS = [
  { keys: ["analysisSummary", "analysis_summary"], label: "情况理解" },
  { keys: ["observations", "observation"], label: "观察要点" },
  { keys: ["supportGoal", "support_goal"], label: "支持目标" },
  { keys: ["boundaryNote", "boundary_note"], label: "边界提示" },
  { keys: ["followUp", "follow_up"], label: "后续观察" }
];

var AI_TASK_GROUPS = [
  { keys: ["goal"], label: "任务目标" },
  { keys: ["materials"], label: "材料" },
  { keys: ["steps"], label: "步骤" },
  { keys: ["dialogueTips", "dialogue_tips"], label: "对话提示" },
  { keys: ["submitHint", "submit_hint"], label: "提交要求" },
  { keys: ["fallbackPlan", "fallback_plan"], label: "替代方案" }
];

function planPick(source, keys) {
  for (var i = 0; i < keys.length; i++) {
    var val = source[keys[i]];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return "";
}

/** 把字符串 / 数组 / 嵌套对象统一拆成多行文本 */
function planLines(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    var fromArray = [];
    value.forEach(function (item) {
      fromArray = fromArray.concat(planLines(item));
    });
    return fromArray;
  }
  if (typeof value === "object") {
    var fromObject = [];
    Object.keys(value).forEach(function (key) {
      fromObject = fromObject.concat(planLines(value[key]));
    });
    return fromObject;
  }
  var text = String(value).replace(/\r\n?/g, "\n").replace(/\\n/g, "\n");
  var lines = text.split("\n").map(function (line) {
    return line.trim();
  }).filter(function (line) {
    return !!line;
  });
  // 数组被 String() 拼成一整行（"1. xx,2. xx"）时，按序号重新断行
  if (lines.length === 1) {
    var rebuilt = lines[0].split(/[,，;；]\s*(?=\d{1,2}\s*[.、)）])/);
    if (rebuilt.length > 1) lines = rebuilt;
  }
  return lines;
}

/**
 * 解析家长成长关注的 AI 方案，返回可直接渲染的结构：
 * { title, meta, needReview, sections: [{ label, body }] } 或 { text } 纯文本兜底
 * 解析不出内容时返回 null
 */
function formatAiPlan(raw) {
  var plan = null;
  var text = "";
  if (raw && typeof raw === "object") {
    plan = raw;
  } else {
    text = String(raw === undefined || raw === null ? "" : raw).trim();
    if (text) {
      try {
        var parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") plan = parsed;
      } catch (e) {
        plan = null;
      }
    }
  }
  if (!plan) return text ? { text: text } : null;

  var summarySections = [];
  AI_PLAN_GROUPS.forEach(function (group) {
    var lines = planLines(planPick(plan, group.keys));
    if (lines.length) summarySections.push({ label: group.label, body: lines.join("\n") });
  });

  var task = plan.task && typeof plan.task === "object" ? plan.task : {};
  var taskTitle = String(planPick(task, ["title"]) || "").trim();
  var meta = [];
  var type = String(planPick(task, ["type"]) || "").trim();
  if (type) meta.push(type);
  var duration = Number(planPick(task, ["duration"])) || 0;
  if (duration) meta.push(duration + " 分钟");
  var difficulty = String(planPick(task, ["difficulty"]) || "").trim();
  if (difficulty) meta.push(difficulty);

  var taskSections = [];
  AI_TASK_GROUPS.forEach(function (group) {
    var lines = planLines(planPick(task, group.keys));
    if (lines.length) taskSections.push({ label: group.label, body: lines.join("\n") });
  });

  // 解析成功但没有任何可用内容（例如默认的 "{}"）：不展示
  if (!summarySections.length && !taskSections.length && !taskTitle) {
    return /^[\[{]/.test(text) ? null : (text ? { text: text } : null);
  }

  // AI 任务草案原始字段：供教师端"确认实施"时预填，避免拿家长原话当作任务内容
  var draft = null;
  var draftSteps = String(planPick(task, ["steps"]) || "").trim();
  if (taskTitle && draftSteps) {
    draft = {
      title: taskTitle,
      goal: String(planPick(task, ["goal"]) || "").trim(),
      steps: draftSteps,
      dialogueTips: String(planPick(task, ["dialogueTips", "dialogue_tips"]) || "").trim(),
      submitHint: String(planPick(task, ["submitHint", "submit_hint"]) || "").trim(),
      materials: String(planPick(task, ["materials"]) || "").trim(),
      fallbackPlan: String(planPick(task, ["fallbackPlan", "fallback_plan"]) || "").trim(),
      type: type,
      difficulty: difficulty,
      duration: duration
    };
  }

  var review = planPick(plan, ["needsProfessionalReview", "needs_professional_review"]);
  return {
    title: taskTitle,
    meta: meta.join(" · "),
    needReview: review === true || review === 1 || review === "true" || review === "1",
    summarySections: summarySections,
    taskSections: taskSections,
    draft: draft,
    sections: summarySections.concat(taskSections)
  };
}

module.exports = {
  parseTime: parseTime,
  formatDate: formatDate,
  dateKey: dateKey,
  formatDateTime: formatDateTime,
  fromNow: fromNow,
  taskStatusMeta: taskStatusMeta,
  subTypeLabel: subTypeLabel,
  engagementColor: engagementColor,
  riskColor: riskColor,
  requestStatusMeta: requestStatusMeta,
  formatAiPlan: formatAiPlan,
  parseAttachments: parseAttachments,
  parseTags: parseTags,
  truncate: truncate,
  orDefault: orDefault
};
