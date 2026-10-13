var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

var FEEDBACK_CHOICES = ["判断准确", "基本符合", "不太符合", "完全不符合"];

Page({
  data: {
    childId: null,
    loading: true,
    child: null,
    engagement: null,
    enabled: true,
    collected: [],
    notCollected: [],
    choices: FEEDBACK_CHOICES,
    feedbacked: false,
    tab: "result" // result | privacy
  },

  onLoad: function (options) {
    this.setData({ childId: Number(options.childId) || app.getChildId() });
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    this.loadData();
  },

  loadData: function () {
    var self = this;
    this.setData({ loading: true });
    api
      .getEngagement(this.data.childId)
      .then(function (res) {
        if (!res) return;
        var eng = res.engagement || {};
        self.setData({
          loading: false,
          child: res.child,
          enabled: !!res.enabled,
          collected: res.collected || [],
          notCollected: res.notCollected || [],
          engagement: {
            score: eng.score || 0,
            level: eng.level || "",
            status: eng.status || "",
            confidence: eng.confidence || "",
            recommendation: eng.recommendation || "",
            evidence: eng.evidence || [],
            windowDays: eng.windowDays || 30,
            color: util.engagementColor(eng.status),
            counts: eng.counts || {}
          }
        });
      })
      .catch(function () {
        self.setData({ loading: false });
      });
  },

  switchTab: function (e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  onToggleEnabled: function (e) {
    var self = this;
    var enabled = e.detail.value; // switch 的布尔值
    this.setData({ enabled: enabled });
    api
      .setEngagementPreference(this.data.childId, enabled)
      .then(function () {
        wx.showToast({ title: enabled ? "已开启关注分析" : "已关闭关注分析", icon: "none" });
        self.loadData();
      })
      .catch(function () {
        self.setData({ enabled: !enabled });
      });
  },

  onFeedback: function (e) {
    var self = this;
    var choice = e.currentTarget.dataset.value;
    api
      .sendEngagementFeedback(this.data.childId, choice)
      .then(function () {
        self.setData({ feedbacked: true });
        wx.showToast({ title: "感谢你的反馈", icon: "success" });
      });
  }
});
