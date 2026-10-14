/**
 * 家校共育系统 · 小程序请求层
 * 统一处理：base 地址、JWT 鉴权、401 跳转、错误提示、超时
 */

/* 后端地址
 * REMOTE_BASE：线上 Render（正式版使用，必须 HTTPS 且已配置 request 合法域名）
 * LOCAL_BASE ：本机后端（开发调试使用，需先在「家校共育系统」目录执行 npm start）
 *
 * 注意：本机后端连的是 .env.local 里的 Neon 生产库，和线上是同一份数据。
 */
var REMOTE_BASE = "https://wx-homeschool-1.onrender.com";
var LOCAL_BASE = "http://localhost:3123";

// 默认所有版本走线上后端；本地调试时可临时改为 true，并先重启本地 server.js
var AUTO_LOCAL_IN_DEV = false;

var resolvedBase = null;
function API_BASE() {
  if (resolvedBase) return resolvedBase;
  var useLocal = false;
  if (AUTO_LOCAL_IN_DEV) {
    try {
      // develop = 开发版（开发者工具/真机调试），trial = 体验版，release = 正式版
      var envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
      useLocal = envVersion === "develop" || envVersion === "trial";
    } catch (e) {
      useLocal = false;
    }
  }
  resolvedBase = useLocal ? LOCAL_BASE : REMOTE_BASE;
  return resolvedBase;
}

var TIMEOUT = 30000; // Render 免费实例冷启动约 15s，超时放宽

function getToken() {
  try {
    return wx.getStorageSync("token") || "";
  } catch (e) {
    return "";
  }
}

function getUser() {
  try {
    return wx.getStorageSync("user") || null;
  } catch (e) {
    return null;
  }
}

function clearAuth() {
  try {
    wx.removeStorageSync("token");
    wx.removeStorageSync("user");
    wx.removeStorageSync("childId");
    wx.removeStorageSync("selectedChildId");
  } catch (e) {}
}

/**
 * 核心请求方法
 * @param {string} path 以 / 开头的接口路径
 * @param {object} options { method, data, query, silent, loading }
 * @returns {Promise<any>}
 */
function request(path, options) {
  options = options || {};
  var method = (options.method || "GET").toUpperCase();
  var url = API_BASE() + path;
  var query = options.query;
  if (query) {
    var parts = [];
    for (var k in query) {
      if (Object.prototype.hasOwnProperty.call(query, k) && query[k] !== undefined && query[k] !== null && query[k] !== "") {
        parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(query[k]));
      }
    }
    if (parts.length) url += (url.indexOf("?") >= 0 ? "&" : "?") + parts.join("&");
  }

  var header = { "Content-Type": "application/json" };
  var token = getToken();
  if (token) header["Authorization"] = "Bearer " + token;

  if (options.loading) {
    wx.showLoading({ title: options.loading, mask: true });
  }

  return new Promise(function (resolve, reject) {
    wx.request({
      url: url,
      method: method,
      data: options.data || {},
      header: header,
      timeout: options.timeout || TIMEOUT,
      success: function (res) {
        if (options.loading) wx.hideLoading();
        var status = res.statusCode;
        var data = res.data;

        if (status === 401) {
          try {
            var app = getApp();
            if (app && app.clearSession) app.clearSession();
            else clearAuth();
          } catch (e) { clearAuth(); }
          wx.showToast({ title: "登录已失效，请重新登录", icon: "none" });
          setTimeout(function () {
            wx.redirectTo({ url: "/pages/login/login" });
          }, 800);
          reject(makeError("请先登录", 401, data));
          return;
        }

        if (status === 403) {
          var forbiddenMessage = (data && data.message) || "当前账号无权执行此操作";
          if (!options.silent) wx.showToast({ title: forbiddenMessage, icon: "none", duration: 2500 });
          reject(makeError(forbiddenMessage, 403, data));
          return;
        }

        if (status >= 500 && method === "GET" && options.retry !== false && !options.__retried) {
          if (options.loading) wx.hideLoading();
          request(path, Object.assign({}, options, { __retried: true, loading: "" })).then(resolve).catch(reject);
          return;
        }

        if (status >= 400) {
          var msg = (data && data.message) || "请求失败";
          if (!options.silent) wx.showToast({ title: msg, icon: "none", duration: 2500 });
          reject(makeError(msg, status, data));
          return;
        }

        resolve(data);
      },
      fail: function (err) {
        if (method === "GET" && options.retry !== false && !options.__retried) {
          if (options.loading) wx.hideLoading();
          request(path, Object.assign({}, options, { __retried: true, loading: "" })).then(resolve).catch(reject);
          return;
        }
        if (options.loading) wx.hideLoading();
        var em = (err && err.errMsg) || "";
        var msg = "网络异常，请稍后重试";
        if (em.indexOf("url not in domain list") >= 0) {
          msg = "域名未加入合法域名白名单";
        } else if (em.indexOf("timeout") >= 0) {
          msg = "服务器响应较慢，请稍后重试";
        } else if (em.indexOf("fail ssl") >= 0 || em.indexOf("certificate") >= 0) {
          msg = "HTTPS 证书校验失败";
        }
        console.warn("[request fail]", url, em);
        if (!options.silent) wx.showToast({ title: msg, icon: "none", duration: 2500 });
        reject(makeError(msg, 0, err));
      }
    });
  });
}

/** 使用后端统一上传适配层。后端未配置存储时会明确返回 503。 */
function uploadFile(filePath, options) {
  options = options || {};
  var token = getToken();
  var header = {};
  if (token) header.Authorization = "Bearer " + token;
  return new Promise(function (resolve, reject) {
    var task = wx.uploadFile({
      url: API_BASE() + "/api/uploads",
      filePath: filePath,
      name: "file",
      header: header,
      formData: {
        purpose: options.purpose || "submission",
        fileName: options.name || ""
      },
      timeout: options.timeout || 60000,
      success: function (res) {
        var data = {};
        try { data = typeof res.data === "string" ? JSON.parse(res.data) : (res.data || {}); }
        catch (e) { data = { message: "上传服务返回格式不正确" }; }
        if (res.statusCode === 401) {
          try {
            var app = getApp();
            if (app && app.clearSession) app.clearSession();
            else clearAuth();
          } catch (e) { clearAuth(); }
          wx.reLaunch({ url: "/pages/login/login" });
          reject(makeError(data.message || "请先登录", 401, data));
          return;
        }
        if (res.statusCode >= 400 || !data.attachment || !data.attachment.url) {
          var uploadMessage = data.message || "附件上传失败";
          if (res.statusCode === 404 && uploadMessage.indexOf("接口不存在") >= 0) {
            uploadMessage = "线上后端尚未部署附件上传接口";
          }
          reject(makeError(uploadMessage, res.statusCode || 0, data));
          return;
        }
        resolve(data.attachment);
      },
      fail: function (err) {
        reject(makeError((err && err.errMsg) || "附件上传失败，请检查网络后重试", 0, err));
      }
    });
    if (task && task.onProgressUpdate && typeof options.onProgress === "function") {
      task.onProgressUpdate(function (progress) { options.onProgress(progress.progress || 0); });
    }
  });
}

function decodeUtf8(bytes, state) {
  state = state || { carry: [] };
  var input = state.carry.concat(Array.prototype.slice.call(bytes || []));
  var out = "";
  var i = 0;
  while (i < input.length) {
    var c = input[i];
    var needed = c < 128 ? 1 : c < 224 ? 2 : c < 240 ? 3 : 4;
    if (i + needed > input.length) break;
    if (needed === 1) out += String.fromCharCode(c);
    else if (needed === 2) out += String.fromCharCode(((c & 31) << 6) | (input[i + 1] & 63));
    else if (needed === 3) out += String.fromCharCode(((c & 15) << 12) | ((input[i + 1] & 63) << 6) | (input[i + 2] & 63));
    else {
      var point = ((c & 7) << 18) | ((input[i + 1] & 63) << 12) | ((input[i + 2] & 63) << 6) | (input[i + 3] & 63);
      point -= 65536;
      out += String.fromCharCode(55296 + (point >> 10), 56320 + (point & 1023));
    }
    i += needed;
  }
  state.carry = input.slice(i);
  return out;
}

/**
 * 小程序分块 SSE 请求。若基础库不支持分块或连接未产生任何内容，会自动回退 JSON。
 */
function aiChatStream(question, history, handlers) {
  handlers = handlers || {};
  var token = getToken();
  var gotChunk = false;
  var finished = false;
  var fallbackStarted = false;
  var buffer = "";
  var decoderState = { carry: [] };

  function emitBlock(block) {
    var lines = String(block || "").split(/\r?\n/);
    var eventName = "message";
    var dataText = "";
    lines.forEach(function (line) {
      if (line.indexOf("event:") === 0) eventName = line.slice(6).trim();
      if (line.indexOf("data:") === 0) dataText += line.slice(5).trim();
    });
    if (!dataText) return;
    var data;
    try { data = JSON.parse(dataText); } catch (e) { return; }
    if (eventName === "delta" && handlers.onDelta) handlers.onDelta(data.content || "");
    if (eventName === "error" && handlers.onStreamError) handlers.onStreamError(data.message || "AI 连接中断");
    if (eventName === "done") {
      finished = true;
      if (handlers.onDone) handlers.onDone(data);
    }
  }

  function consume(text) {
    buffer += text || "";
    var parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || "";
    parts.forEach(emitBlock);
  }

  function fallback(resolve, reject) {
    if (fallbackStarted) return;
    fallbackStarted = true;
    request("/api/teacher/ai-chat", {
      method: "POST",
      data: { question: question, history: history || [] },
      silent: true,
      timeout: 60000
    }).then(function (data) {
      if (handlers.onFallback) handlers.onFallback(data);
      resolve(data);
    }).catch(reject);
  }

  return new Promise(function (resolve, reject) {
    var task;
    try {
      task = wx.request({
        url: API_BASE() + "/api/teacher/ai-chat?stream=1",
        method: "POST",
        data: { question: question, history: history || [] },
        header: {
          "Content-Type": "application/json",
          Authorization: token ? "Bearer " + token : ""
        },
        timeout: 60000,
        enableChunked: true,
        success: function (res) {
          if (res.statusCode >= 400) {
            var data = res.data || {};
            reject(makeError(data.message || "AI 请求失败", res.statusCode, data));
            return;
          }
          if (!gotChunk) {
            fallback(resolve, reject);
            return;
          }
          if (buffer) emitBlock(buffer);
          if (!finished && handlers.onDone) handlers.onDone({});
          resolve({ streamed: true });
        },
        fail: function (err) {
          if (!gotChunk) fallback(resolve, reject);
          else reject(makeError((err && err.errMsg) || "AI 连接中断", 0, err));
        }
      });
      if (!task || typeof task.onChunkReceived !== "function") {
        if (task && task.abort) task.abort();
        fallback(resolve, reject);
        return;
      }
      task.onChunkReceived(function (chunk) {
        gotChunk = true;
        var data = chunk && chunk.data;
        if (typeof data === "string") consume(data);
        else consume(decodeUtf8(new Uint8Array(data || new ArrayBuffer(0)), decoderState));
      });
    } catch (error) {
      fallback(resolve, reject);
    }
  });
}

function makeError(message, status, data) {
  var e = new Error(message);
  e.status = status;
  e.data = data || {};
  return e;
}

/* ---------------- 语义化封装 ---------------- */

var api = {
  get: function (path, query, options) {
    return request(path, Object.assign({}, options, { method: "GET", query: query }));
  },
  post: function (path, data, options) {
    return request(path, Object.assign({}, options, { method: "POST", data: data }));
  },
  put: function (path, data, options) {
    return request(path, Object.assign({}, options, { method: "PUT", data: data }));
  },

  /* ---- 认证 ---- */
  login: function (account, password) {
    return request("/api/auth/login", {
      method: "POST",
      data: { account: account, password: password },
      silent: true
    });
  },
  logout: function () {
    return request("/api/auth/logout", { method: "POST", silent: true });
  },

  /* ---- 当前账号资料 / 自定义头像 ---- */
  getMe: function () {
    return request("/api/me", { method: "GET", silent: true });
  },
  /** url 传空字符串表示恢复默认角色头像 */
  updateMyAvatar: function (url) {
    return request("/api/me/avatar", {
      method: "PUT",
      data: { url: url || "" },
      silent: true
    });
  },

  /* ---- 埋点（失败静默） ---- */
  track: function (eventType, payload) {
    if (!getToken()) return Promise.resolve();
    var data = payload || {};
    data.eventType = eventType;
    return request("/api/events", { method: "POST", data: data, silent: true }).catch(function () {});
  },

  /* ---- 家长端 ---- */
  getHome: function (childId) {
    return request("/api/home", { method: "GET", query: { childId: childId } });
  },
  addChild: function (name, grade) {
    return request("/api/children", { method: "POST", data: { name: name, grade: grade } });
  },
  getNotifications: function (limit) {
    return request("/api/parent/notifications", { method: "GET", query: { limit: limit || 20 } });
  },
  readAllNotifications: function () {
    return request("/api/parent/notifications/read-all", { method: "POST" });
  },
  readNotification: function (id) {
    return request("/api/parent/notifications/" + id + "/read", { method: "POST" });
  },
  getWechatSubscriptionConfig: function () {
    return request("/api/wechat/subscription-config", { method: "GET", silent: true });
  },
  bindWechat: function (code) {
    return request("/api/wechat/bind", { method: "POST", data: { code: code }, silent: true });
  },
  getParentTaskRequests: function (childId) {
    return request("/api/parent/task-requests", { method: "GET", query: { childId: childId } });
  },
  createParentTaskRequest: function (data) {
    return request("/api/parent/task-requests", { method: "POST", data: data, loading: "提交中" });
  },
  submitQuestionnaire: function (data) {
    return request("/api/questionnaire", { method: "POST", data: data, loading: "提交中" });
  },
  getEngagement: function (childId) {
    return request("/api/parent/engagement", { method: "GET", query: { childId: childId } });
  },
  setEngagementPreference: function (childId, enabled) {
    return request("/api/parent/engagement-preference", {
      method: "POST",
      data: { childId: childId, enabled: !!enabled }
    });
  },
  sendEngagementFeedback: function (childId, choice) {
    return request("/api/parent/engagement-feedback", {
      method: "POST",
      data: { childId: childId, choice: choice }
    });
  },

  /* ---- 学生端 ---- */
  getStudentHome: function () {
    return request("/api/student/home", { method: "GET" });
  },
  /** 提交「我的小心事」，内容会推送到管理员端 */
  submitWorry: function (content) {
    return request("/api/student/worries", {
      method: "POST",
      data: { content: content },
      loading: "发送中"
    });
  },

  /* ---- 提交 / 时间线（家长、学生共用） ---- */
  submitWork: function (data) {
    return request("/api/submissions", { method: "POST", data: data, loading: "提交中" });
  },
  getTimeline: function (childId) {
    return request("/api/timeline", { method: "GET", query: { childId: childId } });
  },
  uploadAttachment: function (filePath, options) {
    return uploadFile(filePath, options);
  },
  getUploadStatus: function () {
    return request("/api/uploads/status", { method: "GET", silent: true, retry: false });
  },

  /* ---- 教师端 ---- */
  getTeacherOverview: function () {
    return request("/api/teacher/overview", { method: "GET" });
  },
  publishTask: function (data) {
    return request("/api/teacher/tasks", { method: "POST", data: data, loading: "发布中" });
  },
  getTeacherStudents: function () {
    return request("/api/teacher/students", { method: "GET" });
  },
  getStudentSuggestions: function (childId) {
    return request("/api/teacher/student-suggestions", { method: "GET", query: { childId: childId }, loading: "生成建议" });
  },
  generatePersonalTask: function (childId) {
    return request("/api/teacher/student-suggestions", {
      method: "GET",
      query: { childId: childId },
      loading: "AI 生成中"
    });
  },
  getSubmissionDetail: function (id) {
    return request("/api/teacher/submissions/" + id, { method: "GET" });
  },
  generateAiFeedback: function (submissionId) {
    return request("/api/teacher/submissions/ai-feedback", {
      method: "POST",
      data: { submissionId: submissionId },
      loading: "AI 生成中"
    });
  },
  saveFeedback: function (submissionId, comment, tags) {
    return request("/api/teacher/feedback", {
      method: "POST",
      data: { submissionId: submissionId, comment: comment, tags: tags },
      loading: "提交中"
    });
  },
  getAiOverview: function () {
    return request("/api/teacher/ai-overview", { method: "GET", loading: "加载中" });
  },
  getGlobalReportLocal: function () {
    return request("/api/teacher/global-report", { method: "GET", query: { local: 1 }, silent: true });
  },
  getGlobalReportAi: function () {
    return request("/api/teacher/global-report", { method: "GET", query: { ai: 1 }, silent: true, timeout: 60000 });
  },
  getGlobalReport: function () {
    return request("/api/teacher/global-report", { method: "GET", silent: true });
  },
  getTeacherTaskRequests: function (status) {
    return request("/api/teacher/parent-task-requests", { method: "GET", query: { status: status } });
  },
  reviewTaskRequest: function (data) {
    return request("/api/teacher/parent-task-requests/review", {
      method: "POST",
      data: data,
      loading: "提交中"
    });
  },
  getDailyUpdates: function (limit) {
    return request("/api/teacher/daily-updates", { method: "GET", query: { limit: limit || 20 }, silent: true });
  },
  /** 新建记录：只生成草稿进入待校对清单，不会直接推送给家长 */
  createDailyUpdate: function (data) {
    var payload = typeof data === "string" ? { transcript: data } : (data || {});
    return request("/api/teacher/daily-updates", {
      method: "POST",
      data: payload,
      loading: "AI 整理中"
    });
  },
  /** 可推送家长清单（教师可见学生的家长），用于校对推送对象 */
  getDailyUpdateRecipients: function () {
    return request("/api/teacher/daily-update-recipients", { method: "GET", silent: true });
  },
  /** 校对草稿：修改内容或推送对象 */
  updateDailyUpdate: function (id, data) {
    return request("/api/teacher/daily-updates/" + id, {
      method: "PUT",
      data: data || {},
      loading: "保存中"
    });
  },
  deleteDailyUpdate: function (id) {
    return request("/api/teacher/daily-updates/" + id, { method: "DELETE", silent: true });
  },
  /** 确认无误后推送；传 { all: true } 表示一键确认当天全部草稿 */
  confirmDailyUpdates: function (data) {
    return request("/api/teacher/daily-updates/confirm", {
      method: "POST",
      data: data || {},
      silent: true
    });
  },
  transcribeAudio: function (attachment) {
    return request("/api/teacher/transcribe", {
      method: "POST",
      data: { url: attachment.url, type: attachment.type, name: attachment.name },
      silent: true,
      timeout: 90000
    });
  },
  sendAnnouncement: function (title, content) {
    return request("/api/teacher/notifications", {
      method: "POST",
      data: { title: title, content: content },
      loading: "发送中"
    });
  },
  aiChat: function (question, history) {
    return request("/api/teacher/ai-chat", {
      method: "POST",
      data: { question: question, history: history || [] },
      loading: "思考中"
    });
  },
  aiChatStream: function (question, history, handlers) {
    return aiChatStream(question, history, handlers);
  },
  sendTargetedNotification: function (data) {
    return request("/api/teacher/notifications/targeted", { method: "POST", data: data, silent: true });
  },

  /* ---- 信息交流 ---- */
  getMessages: function (peerId, limit) {
    return request("/api/messages", {
      method: "GET",
      query: { peerId: peerId, limit: limit || 200 },
      silent: true
    });
  },
  sendMessage: function (recipientUserId, content) {
    return request("/api/messages", {
      method: "POST",
      data: { recipientUserId: recipientUserId, content: content },
      loading: "发送中"
    });
  },
  markMessagesRead: function (peerId) {
    return request("/api/messages/read", {
      method: "POST",
      data: { peerId: peerId },
      silent: true
    });
  },

  /* ---- 管理员端 ---- */
  getAdminOverview: function () {
    return request("/api/admin/overview", { method: "GET" });
  },
  getAdminAccounts: function () {
    return request("/api/admin/accounts", { method: "GET" });
  },
  createAccount: function (data) {
    return request("/api/admin/accounts", { method: "POST", data: data, loading: "创建中" });
  },
  updateAccount: function (id, data) {
    return request("/api/admin/accounts/" + id, { method: "PUT", data: data, loading: "保存中" });
  },
  deleteAccount: function (id) {
    return request("/api/admin/accounts/" + id, { method: "DELETE", loading: "删除中" });
  },
  getAdminTasks: function (limit) {
    return request("/api/admin/tasks", { method: "GET", query: { limit: limit || 100 } });
  },
  getAdminTimeline: function (childId, limit) {
    return request("/api/admin/growth-timeline", {
      method: "GET",
      query: { childId: childId, limit: limit || 200 }
    });
  },

  /* ---- 管理员端：班级 ---- */
  getAdminClasses: function () {
    return request("/api/admin/classes", { method: "GET" });
  },
  /** 学生「我的小心事」列表（含未读条数 newCount） */
  getAdminWorries: function (limit) {
    return request("/api/admin/worries", {
      method: "GET",
      query: { limit: limit || 100 },
      silent: true
    });
  },
  /** 进入详情页后标记为已读 */
  markAdminWorriesRead: function () {
    return request("/api/admin/worries/read", { method: "POST", silent: true });
  },
  createClass: function (data) {
    return request("/api/admin/classes", { method: "POST", data: data, loading: "创建中" });
  },
  /** 编辑班级：更新基本信息，并按名单增删成员 */
  updateClass: function (id, data) {
    return request("/api/admin/classes/" + id, { method: "PUT", data: data, loading: "保存中" });
  }
};

module.exports = {
  get API_BASE() {
    return API_BASE();
  },
  request: request,
  uploadFile: uploadFile,
  aiChatStream: aiChatStream,
  getToken: getToken,
  getUser: getUser,
  clearAuth: clearAuth,
  api: api
};
