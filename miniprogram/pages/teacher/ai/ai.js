var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

function formatReport(res) {
  var p = (res && res.studentProgress) || {};
  return {
    generatedAt: util.formatDateTime(res && res.generatedAt),
    source: res && res.source || "本地规则分析",
    aiEnabled: !!(res && res.aiEnabled),
    stats: res && res.stats || null,
    aiText: res && res.ai ? (res.ai.headline || res.ai.summary || res.ai.content || res.ai.text || "") : "",
    riskLevel: p.riskLevel || "",
    riskTitle: p.riskTitle || "",
    riskColor: util.riskColor(p.riskLevel),
    riskCls: p.riskLevel === "red" ? "badge-danger" : p.riskLevel === "yellow" ? "badge-warning" : "badge-teal",
    completionRate: p.completionRate || 0,
    submittedCount: p.submittedCount || 0,
    pendingFeedback: p.pendingFeedback || 0,
    reminderWindow: p.suggestedReminderWindow || "",
    completed: p.completed || [],
    draftStalled: p.draftStalled || [],
    viewedNotStarted: p.viewedNotStarted || [],
    untouched: p.untouched || [],
    dimensions: ((res && res.dimensions) || []).map(function (d) {
      return { key: d.key, title: d.title || "", summary: d.aiSummary || d.summary || "", findings: d.findings || [], actions: d.actions || [] };
    })
  };
}

Page({
  data: {
    tab: "report",
    loading: true,
    error: "",
    isAdmin: false,
    report: null,
    aiStatus: "local",
    aiStatusText: "先展示本地规则分析",
    aiError: "",
    aiStale: false,
    noticeDraft: "",
    sendingNotice: false,
    messages: [],
    question: "",
    asking: false,
    transcript: "",
    posting: false,
    updates: [],
    announceTitle: "",
    announceContent: "",
    sending: false,
    recording: false,
    recordSeconds: 0,
    transcribing: false,
    recordStatus: "点击开始录音，结束后会上传并转成可编辑文字"
  },

  onLoad: function (options) {
    var isAdmin = app.globalData.role === "admin";
    this.setData({ isAdmin: isAdmin, tab: isAdmin ? "report" : ((options && options.tab) || "report") });
    this.setupRecorder();
  },

  onShow: function () {
    if (!app.isLogin()) return;
    if (this.data.isAdmin && this.data.tab !== "report") this.setData({ tab: "report" });
    this.loadTab();
  },

  onHide: function () { this.clearAiPoll(); this.stopRecordingIfNeeded(); },
  onUnload: function () { this.clearAiPoll(); this.stopRecordingIfNeeded(); },

  loadTab: function () {
    if (this.data.tab === "report") this.loadReport();
    else if (this.data.tab === "daily") this.loadDaily();
    else this.setData({ loading: false, error: "" });
  },

  switchTab: function (e) {
    if (this.data.isAdmin && e.currentTarget.dataset.tab !== "report") return;
    this.clearAiPoll();
    this.setData({ tab: e.currentTarget.dataset.tab, error: "" });
    this.loadTab();
  },

  loadReport: function () {
    var self = this;
    this.clearAiPoll();
    this.setData({ loading: true, error: "", aiStatus: "local", aiStatusText: "正在加载本地报告", aiError: "", aiStale: false });
    api.getGlobalReportLocal().then(function (res) {
      var report = formatReport(res || {});
      self.setData({
        loading: false,
        report: report,
        aiStatus: report.aiEnabled ? "pending" : "unconfigured",
        aiStatusText: report.aiEnabled ? "本地报告已就绪，AI 洞察生成中" : "未配置 AI，当前展示本地规则分析",
        aiError: report.aiEnabled ? "" : "配置 DEEPSEEK_API_KEY 或 ZHIPU_API_KEY 后可生成 AI 洞察"
      });
      if (report.aiEnabled) self.pollAiReport(0);
    }).catch(function (error) {
      self.setData({ loading: false, error: (error && error.message) || "报告加载失败" });
    });
  },

  pollAiReport: function (attempt) {
    var self = this;
    api.getGlobalReportAi().then(function (res) {
      var report = formatReport(res || {});
      if (res && res.ai) {
        self.setData({
          report: report,
          aiStatus: res.aiPending ? "pending" : "done",
          aiStatusText: res.aiPending ? (res.aiLoadingText || "新报告生成中，暂时显示上一次结果") : "AI 洞察已完成",
          aiError: res.aiError || "",
          aiStale: !!res.aiStale
        });
      } else if (res && res.aiPending) {
        self.setData({ aiStatus: "pending", aiStatusText: res.aiLoadingText || "AI 洞察生成中", aiError: "", aiStale: false });
      } else if (res && res.aiError) {
        self.setData({ report: report, aiStatus: "failed", aiStatusText: "AI 生成失败，已保留本地报告", aiError: res.aiError, aiStale: false });
        return;
      } else if (!report.aiEnabled) {
        self.setData({ aiStatus: "unconfigured", aiStatusText: "未配置 AI，当前展示本地规则分析" });
        return;
      }
      if (res && res.aiPending && attempt < 12) {
        self.__aiPoll = setTimeout(function () { self.pollAiReport(attempt + 1); }, 2500);
      } else if (res && res.aiPending) {
        self.setData({ aiStatusText: "AI 仍在后台生成，可稍后刷新查看" });
      }
    }).catch(function (error) {
      self.setData({ aiStatus: "failed", aiStatusText: "AI 加载失败，本地报告仍可使用", aiError: (error && error.message) || "AI 报告请求失败" });
    });
  },

  clearAiPoll: function () {
    if (this.__aiPoll) clearTimeout(this.__aiPoll);
    this.__aiPoll = null;
  },

  onRetry: function () { this.loadTab(); },

  onGenerateNotice: function () {
    var report = this.data.report || {};
    var count = (report.untouched || []).length + (report.viewedNotStarted || []).length + (report.draftStalled || []).length;
    var time = report.reminderWindow || "今晚方便的时候";
    var text = "各位家长好，本周家校共育任务还有" + count + "位同学尚未正式提交。建议在" + time + "陪孩子完成，若时间紧张可先完成核心步骤并保存草稿。感谢配合。";
    this.setData({ noticeDraft: text });
  },

  onNoticeInput: function (e) { this.setData({ noticeDraft: e.detail.value }); },
  copyNotice: function () {
    var text = (this.data.noticeDraft || "").trim();
    if (!text) return wx.showToast({ title: "请先生成通知模板", icon: "none" });
    wx.setClipboardData({ data: text, success: function () { wx.showToast({ title: "模板已复制", icon: "success" }); } });
  },
  sendGeneratedNotice: function () {
    var self = this;
    var text = (this.data.noticeDraft || "").trim();
    if (!text || this.data.sendingNotice || this.data.isAdmin) return;
    this.setData({ sendingNotice: true });
    api.sendAnnouncement("本周任务提醒", text).then(function (res) {
      self.setData({ sendingNotice: false });
      wx.showToast({ title: "已写入 " + Number(res && res.recipientCount || 0) + " 位家长通知中心", icon: "none", duration: 2500 });
    }).catch(function () { self.setData({ sendingNotice: false }); });
  },

  onQuestionInput: function (e) { this.setData({ question: e.detail.value }); },
  onAsk: function () {
    var self = this;
    var question = (this.data.question || "").trim();
    if (!question || this.data.asking || this.data.isAdmin) return;
    var history = this.data.messages.slice(-6).map(function (item) { return { role: item.role, content: item.content }; });
    var messages = this.data.messages.concat([
      { role: "user", content: question, sources: [], provider: "", error: "" },
      { role: "assistant", content: "", sources: [], provider: "", error: "" }
    ]);
    var assistantIndex = messages.length - 1;
    this.setData({ messages: messages, question: "", asking: true });

    function patchAssistant(patch) {
      var key;
      for (key in patch) {
        var update = {};
        update["messages[" + assistantIndex + "]." + key] = patch[key];
        self.setData(update);
      }
    }
    api.aiChatStream(question, history, {
      onDelta: function (content) {
        var current = self.data.messages[assistantIndex].content || "";
        patchAssistant({ content: current + content });
      },
      onDone: function (meta) {
        patchAssistant({ sources: meta.sources || [], provider: meta.provider || "", error: meta.aiError || "" });
      },
      onStreamError: function (message) { patchAssistant({ error: message }); },
      onFallback: function (res) {
        patchAssistant({ content: res.answer || "暂时没有得到回答", sources: res.sources || [], provider: res.provider || "", error: res.aiError || "" });
      }
    }).then(function () {
      var current = self.data.messages[assistantIndex];
      if (!current.content) patchAssistant({ content: "暂时没有得到回答，请稍后再试" });
      self.setData({ asking: false });
    }).catch(function (error) {
      var current = self.data.messages[assistantIndex];
      patchAssistant({ content: current.content || "这次查询没有完成，请稍后重试。", error: (error && error.message) || "AI 请求失败" });
      self.setData({ asking: false });
    });
  },

  loadDaily: function () {
    var self = this;
    if (this.data.isAdmin) return;
    this.setData({ loading: true, error: "" });
    api.getDailyUpdates(20).then(function (res) {
      self.setData({
        loading: false,
        updates: ((res && res.updates) || []).map(function (u) {
          return {
            id: u.id, studentName: u.student_name || "", summary: u.summary || "", analysis: u.analysis || "",
            parentMessage: u.parent_message || "", tags: util.parseTags(u.tags), recipientCount: u.recipient_count || 0,
            aiStatus: u.ai_status || "", timeText: util.fromNow(u.created_at)
          };
        })
      });
    }).catch(function (error) { self.setData({ loading: false, error: (error && error.message) || "校园观察加载失败" }); });
  },

  onTranscriptInput: function (e) { this.setData({ transcript: e.detail.value }); },
  setupRecorder: function () {
    var self = this;
    if (!wx.getRecorderManager) return;
    this.__recorder = wx.getRecorderManager();
    this.__recorder.onStop(function (res) {
      self.stopRecordTimer();
      self.setData({ recording: false });
      if (!res || !res.tempFilePath) return self.setData({ recordStatus: "录音文件生成失败，请直接输入文字" });
      self.setData({ transcribing: true, recordStatus: "正在上传录音…" });
      api.uploadAttachment(res.tempFilePath, { name: "teacher-observation-" + Date.now() + ".mp3", purpose: "transcription" }).then(function (attachment) {
        self.setData({ recordStatus: "录音已上传，正在转成文字…" });
        return api.transcribeAudio(attachment);
      }).then(function (result) {
        var existing = (self.data.transcript || "").trim();
        self.setData({ transcript: existing ? existing + "\n" + result.text : result.text, transcribing: false, recordStatus: "转写完成，可继续编辑后发布" });
      }).catch(function (error) {
        self.setData({ transcribing: false, recordStatus: (error && error.message) || "语音转写失败，请直接输入文字" });
        wx.showModal({ title: "语音转写未完成", content: (error && error.message) || "请直接输入文字作为降级方案", showCancel: false });
      });
    });
    this.__recorder.onError(function (error) {
      self.stopRecordTimer();
      self.setData({ recording: false, recordStatus: (error && error.errMsg) || "录音失败，请检查麦克风权限" });
    });
  },
  startRecording: function () {
    var self = this;
    if (!this.__recorder || this.data.transcribing) return;
    wx.getSetting({ success: function (setting) {
      function start() {
        self.__recorder.start({ duration: 60000, format: "mp3", sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000 });
        self.setData({ recording: true, recordSeconds: 0, recordStatus: "正在录音，请说出今天的校园观察" });
        self.startRecordTimer();
      }
      if (setting.authSetting["scope.record"] === false) {
        wx.showModal({ title: "需要麦克风权限", content: "请在设置中开启麦克风权限。", confirmText: "去设置", success: function (result) {
          if (result.confirm) wx.openSetting({ success: function (s) { if (s.authSetting["scope.record"]) start(); } });
        } });
      } else if (setting.authSetting["scope.record"] === true) start();
      else wx.authorize({ scope: "scope.record", success: start, fail: function () { self.setData({ recordStatus: "麦克风权限未开启，请直接输入文字" }); } });
    }, fail: function () { self.setData({ recordStatus: "无法检查麦克风权限，请直接输入文字" }); } });
  },
  stopRecording: function () { if (this.__recorder && this.data.recording) this.__recorder.stop(); },
  stopRecordingIfNeeded: function () { if (this.__recorder && this.data.recording) this.__recorder.stop(); this.stopRecordTimer(); },
  startRecordTimer: function () { var self = this; this.stopRecordTimer(); this.__recordTimer = setInterval(function () { self.setData({ recordSeconds: self.data.recordSeconds + 1 }); }, 1000); },
  stopRecordTimer: function () { if (this.__recordTimer) clearInterval(this.__recordTimer); this.__recordTimer = null; },

  onPostDaily: function () {
    var self = this;
    var text = (this.data.transcript || "").trim();
    if (!text || this.data.posting || this.data.transcribing) return wx.showToast({ title: "请先录音转写或输入校园记录", icon: "none" });
    this.setData({ posting: true });
    api.createDailyUpdate(text).then(function (res) {
      self.setData({ posting: false, transcript: "", recordStatus: "发布完成，可继续记录下一条观察" });
      wx.showToast({ title: res && res.recipientCount ? "已写入 " + res.recipientCount + " 位家长通知中心" : "已保存观察记录", icon: "none" });
      self.loadDaily();
    }).catch(function () { self.setData({ posting: false }); });
  },
  onAnnounceInput: function (e) { var patch = {}; patch[e.currentTarget.dataset.key] = e.detail.value; this.setData(patch); },
  onSendAnnounce: function () {
    var self = this;
    var content = (this.data.announceContent || "").trim();
    if (!content || this.data.sending) return wx.showToast({ title: "请填写通知内容", icon: "none" });
    wx.showModal({ title: "发送班级公告", content: "将写入全班家长的通知中心，确定继续吗？", success: function (result) {
      if (!result.confirm) return;
      self.setData({ sending: true });
      api.sendAnnouncement(self.data.announceTitle || "教师通知", content).then(function (res) {
        self.setData({ sending: false, announceContent: "", announceTitle: "" });
        wx.showToast({ title: "已写入 " + Number(res && res.recipientCount || 0) + " 位家长通知中心", icon: "none" });
      }).catch(function () { self.setData({ sending: false }); });
    } });
  }
});
