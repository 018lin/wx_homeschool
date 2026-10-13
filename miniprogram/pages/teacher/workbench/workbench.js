var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    task: null,
    weekStart: "",
    recent: []
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
      .getTeacherOverview()
      .then(function (ov) {
        ov = ov || {};
        var task = ov.task;
        var submissions = ov.submissions || [];

        var recent = submissions.slice(0, 5).map(function (s) {
          return {
            id: s.id,
            childName: s.child_name || "学生",
            title: s.title || "",
            content: util.truncate(s.content || "", 60),
            timeText: util.fromNow(s.created_at),
            feedbackCount: Number(s.feedback_count || 0)
          };
        });

        self.setData({
          loading: false,
          weekStart: ov.weekStart || "",
          task: task
            ? {
                id: task.id,
                title: task.title,
                task_type: task.task_type || "",
                difficulty: task.difficulty || "",
                duration: task.duration || "",
                goal: task.goal || ""
              }
            : null,
          recent: recent
        });
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false });
        if (done) done();
      });
  },

  goPublish: function () {
    wx.navigateTo({ url: "/pages/teacher/publish/publish" });
  },
  goSubmissions: function () {
    wx.navigateTo({ url: "/pages/teacher/submissions/submissions" });
  },
  goDaily: function () {
    wx.navigateTo({ url: "/pages/teacher/daily/daily" });
  }
});
