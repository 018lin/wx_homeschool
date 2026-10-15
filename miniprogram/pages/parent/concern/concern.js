var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    childId: null,
    tab: "create", // list | create
    loading: true,
    items: [],

    // 表单
    observedBehavior: "",
    context: "",
    frequency: "",
    parentExpectation: "",
    submitting: false
  },

  onLoad: function (options) {
    this.setData({ childId: Number(options.childId) || app.getChildId() });
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    if (this.data.tab === "list") this.loadList();
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadList(function () {
      wx.stopPullDownRefresh();
    });
  },

  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ tab: tab });
    if (tab === "list") this.loadList();
  },

  loadList: function (done) {
    var self = this;
    this.setData({ loading: true });
    api
      .getParentTaskRequests(this.data.childId)
      .then(function (res) {
        var list = (res && res.requests) || [];
        var items = list.map(function (r) {
          var meta = util.requestStatusMeta(r.status);
          return {
            id: r.id,
            title: r.title || "成长关注",
            category: r.concern_category || "",
            behavior: r.observed_behavior || "",
            statusText: meta.text,
            statusColor: meta.color,
            statusBg: meta.bg,
            taskTitle: r.task_title || "",
            teacherComment: r.teacher_comment || "",
            timeText: util.fromNow(r.created_at)
          };
        });
        self.setData({ loading: false, items: items });
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false });
        if (done) done();
      });
  },

  /* ---- 表单 ---- */
  onInput: function (e) {
    var key = e.currentTarget.dataset.key;
    var patch = {};
    patch[key] = e.detail.value;
    this.setData(patch);
  },

  onSubmit: function () {
    var self = this;
    var d = this.data;
    var behavior = (d.observedBehavior || "").trim();

    if (!behavior) {
      wx.showToast({ title: "请描述你观察到的情况", icon: "none" });
      return;
    }
    if (behavior.length < 4) {
      wx.showToast({ title: "请至少写 4 个字描述具体情况", icon: "none" });
      return;
    }

    this.setData({ submitting: true });

    api
      .createParentTaskRequest({
        childId: d.childId,
        observedBehavior: behavior,
        context: d.context,
        frequency: d.frequency,
        parentExpectation: d.parentExpectation
      })
      .then(function (res) {
        self.setData({ submitting: false });
        wx.showToast({ title: (res && res.message) || "已提交给老师", icon: "success", duration: 2000 });
        // 清空表单并回到列表
        self.setData({
          observedBehavior: "",
          context: "",
          frequency: "",
          parentExpectation: "",
          tab: "list"
        });
        self.loadList();
      })
      .catch(function () {
        self.setData({ submitting: false });
      });
  }
});
