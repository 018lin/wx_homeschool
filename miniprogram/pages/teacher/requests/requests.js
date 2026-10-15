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
    type: "",
    hasDraft: false, // 本次审核表单是否由 AI 任务草案预填
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
        var list = (res && res.requests) || [];        var all = list.map(function (r) {
          var meta = util.requestStatusMeta(r.status);
          var aiPlan = util.formatAiPlan(r.ai_plan);
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
            aiPlan: aiPlan && (aiPlan.title || (aiPlan.sections && aiPlan.sections.length)) ? aiPlan : null,
            aiPlanText: aiPlan && aiPlan.text ? aiPlan.text : "",
            hasDraft: !!(aiPlan && aiPlan.draft),
            timeText: util.fromNow(r.created_at)
          };
        });
        self.setData({ loading: false, all: all, reviewId: null, comment: "", title: "" });
        self.applyFilter();
        // 打开列表即视为已阅，回到工作台时顶部提示板块恢复为「暂无新的提交」
        if (Number((res && res.newCount) || 0) > 0) {
          api.readTeacherTaskRequests().catch(function () {});
        }
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
    // 关键边界：正式任务必须以「AI 任务草案」为基底预填，绝不直接使用家长原话。
    // 若 AI 草案缺失，只给出通用占位，由教师自行设计任务内容。
    var draft = (item && item.aiPlan && item.aiPlan.draft) || null;
    this.setData({
      reviewId: id,
      comment: "",
      title: draft ? draft.title : "",
      goal: draft ? draft.goal : "",
      steps: draft ? draft.steps : "",
      duration: draft && draft.duration ? draft.duration : 20,
      difficulty: draft && draft.difficulty ? draft.difficulty : "普通",
      type: draft && draft.type ? draft.type : "习惯养成",
      hasDraft: !!draft
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
      payload.type = this.data.type || "习惯养成";
    }

    wx.showModal({
      title: decision === "approved" ? "确认实施并推送" : "暂不采纳",
      content: decision === "approved"
        ? "将按上方内容生成定制任务，并推送到家长端与学生端"
        : "家长将收到你的回复",
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
