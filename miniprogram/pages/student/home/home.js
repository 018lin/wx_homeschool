var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    child: null,
    task: null,
    statusText: "",
    statusColor: "",
    statusBg: "",
    locked: false,
    submission: null,
    feedback: null
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    if (app.globalData.role !== "student") {
      wx.showToast({ title: "仅学生账号可访问", icon: "none" });
      setTimeout(function () {
        wx.redirectTo({ url: app.landingPath(app.globalData.role) });
      }, 800);
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
      .getStudentHome()
      .then(function (res) {
        if (!res) return;
        var meta = util.taskStatusMeta(res.taskStatus);
        var task = res.task;
        self.setData({
          loading: false,
          child: res.child || null,
          task: task
            ? {
                id: task.id,
                title: task.title,
                task_type: task.task_type || "",
                difficulty: task.difficulty || "",
                duration: task.duration || "",
                goal: task.goal || "",
                steps: task.steps || "",
                submitHint: task.submit_hint || ""
              }
            : null,
          statusText: meta.text,
          statusColor: meta.color,
          statusBg: meta.bg,
          locked: res.taskStatus === "submitted",
          submission: res.submission || null,
          feedback: res.feedback
            ? {
                comment: res.feedback.comment || "",
                teacherName: res.feedback.teacher_name || "老师",
                timeText: util.fromNow(res.feedback.created_at),
                tags: util.parseTags(res.feedback.tags)
              }
            : null
        });
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false });
        if (done) done();
      });
  },

  goTask: function () {
    var t = this.data.task;
    var c = this.data.child;
    if (!t || !c) return;
    wx.navigateTo({
      url: "/pages/student/task/task?taskId=" + t.id + "&childId=" + c.id
    });
  },

  goGarden: function () {
    wx.navigateTo({ url: "/pages/student/garden/garden" });
  },

  /** 右下角悬浮按钮：写下「我的小心事」 */
  goWorry: function () {
    wx.navigateTo({ url: "/pages/student/worry/worry" });
  }
});
