var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

var DIFFICULTIES = ["简单", "普通", "进阶"];

Page({
  data: {
    loading: true,
    filter: "pending", // pending | approved | rejected | all
    all: [],
    items: [],

    reviewId: null, // 当前展开审核的条目
    comment: "",
    title: "",
    goal: "",
    steps: "",
    duration: 20,
    difficulty: "普通",
    difficulties: DIFFICULTIES,
    submitting: false
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    this.loadData();
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadData(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadData: function (done) {
    var self = this;
    this.setData({ loading: true });
    api
      .getTeacherTaskRequests()
      .then(function (res) {
        var list = (res && res.requests) || [];
        var all = list.map(function (r) {
          var meta = util.requestStatusMeta(r.status);
          return {
            id: r.id,
            title: r.title || "成长关注",
            childName: r.child_name || "",
            grade: r.grade || "",
            parentName: r.parent_name || "",
            caregiver: r.caregiver || "",
            interests: r.interests || "",
            category: r.concern_category || "",
            behavior: r.observed_behavior || r.description || "",
            context: r.context || "",
            frequency: r.frequency || "",
            impact: r.impact || "",
            expectation: r.parent_expectation || r.goal || "",
            constraints: r.family_constraints || "",
            duration: r.duration || 20,
            status: r.status || "pending",
            statusText: meta.text,
            statusColor: meta.color,
            statusBg: meta.bg,
            teacherComment: r.teacher_comment || "",
            taskTitle: r.task_title || "",
            aiPlan: r.ai_plan || "",
            timeText: util.fromNow(r.created_at)
          };
        });
        self.setData({ loading: false, all: all, reviewId: null, comment: "", title: "" });
        self.applyFilter();
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false });
        if (done) done();
      });
  },

  applyFilter: function () {
    var f = this.data.filter;
    var all = this.data.all;
    var items = f === "all" ? all : all.filter(function (i) { return i.status === f; });
    this.setData({ items: items });
  },

  switchFilter: function (e) {
    this.setData({ filter: e.currentTarget.dataset.filter, reviewId: null });
    this.applyFilter();
  },

  openReview: function (e) {
    var id = e.currentTarget.dataset.id;
    var item = this.data.all.filter(function (i) { return i.id === id; })[0];
    this.setData({
      reviewId: id,
      comment: "",
      title: item ? item.title : "",
      goal: item ? item.expectation : "",
      steps: item ? item.behavior : "",
      duration: item ? item.duration : 20,
      difficulty: "普通"
    });
  },

  closeReview: function () {
    this.setData({ reviewId: null });
  },

  onInput: function (e) {
    var patch = {};
    patch[e.currentTarget.dataset.key] = e.detail.value;
    this.setData(patch);
  },

  pickDifficulty: function (e) {
    this.setData({ difficulty: e.currentTarget.dataset.value });
  },

  onReview: function (e) {
    var self = this;
    var decision = e.currentTarget.dataset.decision;
    var id = this.data.reviewId;
    var comment = (this.data.comment || "").trim();

    if (decision === "rejected" && !comment) {
      wx.showToast({ title: "拒绝时请填写原因", icon: "none" });
      return;
    }

    var payload = {
      requestId: id,
      status: decision,
      teacherComment: comment
    };

    if (decision === "approved") {
      payload.title = this.data.title;
      payload.goal = this.data.goal;
      payload.steps = this.data.steps;
      payload.duration = Number(this.data.duration) || 20;
      payload.difficulty = this.data.difficulty;
      payload.type = "家务实践";
    }

    wx.showModal({
      title: decision === "approved" ? "同意实施" : "暂不采纳",
      content: decision === "approved" ? "将为该学生创建一条个性化任务并通知家长" : "家长将收到你的回复",
      success: function (r) {
        if (!r.confirm) return;
        self.setData({ submitting: true });
        api
          .reviewTaskRequest(payload)
          .then(function () {
            self.setData({ submitting: false });
            wx.showToast({ title: "已处理", icon: "success" });
            self.loadData();
          })
          .catch(function () {
            self.setData({ submitting: false });
          });
      }
    });
  }
});
