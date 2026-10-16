var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    task: null,
    weekStart: "",
    recent: [],
    // 家长「成长关注」未读条数，用于顶部提示板块
    concernsNewCount: 0,
    concernNoticeText: "暂无新的提交"
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

    this.loadConcerns();
  },

  /** 顶部板块：家长成长关注未读条数（静默失败，不影响工作台其他内容） */
  loadConcerns: function () {
    var self = this;
    api
      .getTeacherTaskRequests("pending", 1)
      .then(function (res) {
        var count = Number((res && res.newCount) || 0);
        self.setData({
          concernsNewCount: count,
          concernNoticeText: count ? "有" + count + "条新提交" : "暂无新的提交"
        });
      })
      .catch(function () {
        self.setData({ concernsNewCount: 0, concernNoticeText: "暂无新的提交" });
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
  },
  /** 顶部板块：进入家长成长关注审核 */
  goConcerns: function () {
    wx.navigateTo({ url: "/pages/teacher/requests/requests" });
  },
  /** 学习园地：学生发布的共享成果，教师只读浏览 */
  goGarden: function () {
    wx.navigateTo({ url: "/pages/garden/garden" });
  }
});
