var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    greeting: "你好",
    userName: "",
    todayText: "",
    children: [],
    currentChildId: null,
    task: null,
    feedback: null,
    timeline: { taskCount: 0, workCount: 0 },
    engagement: null,
    parentTaskRequest: null,
    unreadCount: 0
  },

  onLoad: function () {
    var user = app.globalData.user || {};
    var hour = new Date().getHours();
    var greeting = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
    var d = new Date();
    var week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    this.setData({
      greeting: greeting,
      userName: user.displayName || "家长",
      todayText: d.getMonth() + 1 + "月" + d.getDate() + "日 · 周" + week
    });
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

        // 首次登录且无孩子 → 引导填写问卷
        if (res.needQuestionnaire) {
          wx.redirectTo({ url: "/pages/parent/questionnaire/questionnaire" });
          return;
        }

        var child = res.child || {};
        if (child && child.id) {
          app.setChildId(child.id);
        }

        var children = (res.children || []).map(function (c) {
          return { id: c.id, name: c.name, grade: c.grade || "" };
        });

        self.setData({
          children: children,
          currentChildId: child.id || null,
          task: self.buildTask(res.task, res.taskStatus),
          feedback: self.buildFeedback(res.feedback),
          timeline: res.timeline || { taskCount: 0, workCount: 0 },
          engagement: self.buildEngagement(res.engagement),
          parentTaskRequest: self.buildRequest(res.parentTaskRequest),
          unreadCount: Number(res.unreadCount || 0)
        });

        api.track("task_card_viewed", {
          childId: child.id,
          taskId: res.task && res.task.id
        });
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

  buildEngagement: function (eng) {
    if (!eng) return null;
    return {
      score: eng.score || 0,
      level: eng.level || "",
      recommendation: eng.recommendation || "",
      color: util.engagementColor(eng.status)
    };
  },

  buildRequest: function (req) {
    if (!req) return null;
    var meta = util.requestStatusMeta(req.status);
    return {
      id: req.id,
      title: req.title || "成长关注",
      teacher_comment: req.teacher_comment || "",
      statusText: meta.text,
      statusColor: meta.color,
      statusBg: meta.bg
    };
  },

  onSwitchChild: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.currentChildId) return;
    app.setChildId(id);
    this.loadData();
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

  goEngagement: function () {
    wx.navigateTo({ url: "/pages/parent/engagement/engagement?childId=" + this.data.currentChildId });
  },

  goNotifications: function () {
    wx.navigateTo({ url: "/pages/parent/notifications/notifications" });
  },

  goChildren: function () {
    wx.navigateTo({ url: "/pages/parent/children/children" });
  }
});
