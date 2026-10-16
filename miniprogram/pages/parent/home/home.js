var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    children: [],
    currentChildId: null,
    task: null,
    feedback: null,
    parentTaskRequest: null
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
    var childId = app.getChildId();
    self.setData({ loading: true });

    api
      .getHome(childId)
      .then(function (res) {
        self.setData({ loading: false });
        if (!res) return;

        var child = res.child || {};
        if (child && child.id) {
          app.setChildId(child.id);
        }

        var children = (res.children || []).map(function (c) {
          return { id: c.id, name: c.name, grade: c.grade || "" };
        });

        var request = self.buildRequest(res.parentTaskRequest);
        self.setData({
          children: children,
          currentChildId: child.id || null,
          task: self.buildTask(res.task, res.taskStatus),
          feedback: self.buildFeedback(res.feedback),
          parentTaskRequest: request
        });

        if (child.id) {
          api.track("task_card_viewed", {
            childId: child.id,
            taskId: res.task && res.task.id
          });
        }
      })
      .catch(function (err) {
        self.setData({ loading: false });
        console.log("[家长首页加载失败]", err && err.status, err && err.message);
        wx.showToast({
          title: (err && err.message) || "加载失败",
          icon: "none",
          duration: 2500
        });
      })
      .then(function () {
        if (done) done();
      });
  },

  buildTask: function (task, status) {
    if (!task) return null;
    var meta = util.taskStatusMeta(status);
    return {
      id: task.id,
      title: task.title,
      goal: task.goal || "",
      type: task.task_type || "",
      difficulty: task.difficulty || "",
      duration: task.duration || "",
      statusText: meta.text,
      statusColor: meta.color,
      statusBg: meta.bg
    };
  },

  buildFeedback: function (fb) {
    if (!fb) return null;
    return {
      comment: fb.comment || "",
      teacherName: fb.teacher_name || "老师",
      taskTitle: fb.task_title || "",
      timeText: util.fromNow(fb.created_at),
      tags: util.parseTags(fb.tags)
    };
  },

  buildRequest: function (req) {
    if (!req) return null;
    var meta = util.requestStatusMeta(req.status);
    return {
      id: req.id,
      title: req.title || "成长关注",
      taskTitle: req.task_title || "",
      teacher_comment: req.teacher_comment || "",
      statusText: meta.text,
      statusColor: meta.color,
      statusBg: meta.bg
    };
  },

  goTask: function () {
    var t = this.data.task;
    if (!t) return;
    wx.navigateTo({
      url: "/pages/parent/task/task?taskId=" + t.id + "&childId=" + this.data.currentChildId
    });
  },

  goTimeline: function () {
    wx.navigateTo({ url: "/pages/parent/timeline/timeline?childId=" + this.data.currentChildId });
  },

  goConcern: function () {
    wx.navigateTo({ url: "/pages/parent/concern/concern?childId=" + this.data.currentChildId });
  },

  goChildren: function () {
    wx.navigateTo({ url: "/pages/parent/children/children" });
  },

  goQuestionnaire: function () {
    wx.navigateTo({ url: "/pages/parent/questionnaire/questionnaire" });
  }
});
