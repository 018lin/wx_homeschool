var app = getApp();
var request = require("../../../../utils/api.js");
var api = request.api;
var util = require("../../../../utils/util.js");

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
    announceTitle: "",
    announceContent: "",
    sending: false
  },

  onLoad: function () {
    this.setData({ isAdmin: app.globalData.role === "admin" });
  },

  onShow: function () {
    if (!app.isLogin()) return;
    if (this.__loaded) return; // 从「校园观察」返回时不重复拉取，下拉可手动刷新
    this.__loaded = true;
    this.loadReport();
  },

  onPullDownRefresh: function () {
    this.loadReport(function () { wx.stopPullDownRefresh(); });
  },

  onHide: function () { this.clearAiPoll(); },
  onUnload: function () { this.clearAiPoll(); },

  loadReport: function (done) {
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
      if (done) done();
    }).catch(function (error) {
      self.setData({ loading: false, error: (error && error.message) || "报告加载失败" });
      if (done) done();
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

  onRetry: function () { this.loadReport(); },

  /* ---------- 家长通知 ---------- */
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

  /* ---------- 班级公告 ---------- */
  onAnnounceInput: function (e) {
    var patch = {};
    patch[e.currentTarget.dataset.key] = e.detail.value;
    this.setData(patch);
  },

  onSendAnnounce: function () {
    var self = this;
    var content = (this.data.announceContent || "").trim();
    if (this.data.isAdmin) return wx.showToast({ title: "管理员为只读模式，不能代发通知", icon: "none" });
    if (!content || this.data.sending) return wx.showToast({ title: "请填写通知内容", icon: "none" });
    wx.showModal({
      title: "发送班级公告",
      content: "将写入全班家长的通知中心，确定继续吗？",
      success: function (result) {
        if (!result.confirm) return;
        self.setData({ sending: true });
        api.sendAnnouncement(self.data.announceTitle || "教师通知", content).then(function (res) {
          self.setData({ sending: false, announceContent: "", announceTitle: "" });
          wx.showToast({ title: "已写入 " + Number(res && res.recipientCount || 0) + " 位家长通知中心", icon: "none" });
        }).catch(function () { self.setData({ sending: false }); });
      }
    });
  },

  goDaily: function () { wx.navigateTo({ url: "/pages/teacher/daily/daily" }); },
  goAsk: function () { wx.navigateBack(); }
});