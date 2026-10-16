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
    /** 老师依据家长反馈定制的专属任务 */
    isCustomTask: false,
    customTaskNotice: "",
    locked: false,
    submission: null,
    feedback: null,
    /** 老师未读回复数：驱动首页顶部信息提示模块 */
    newReplyCount: 0,
    worryNoticeText: "加载中…"
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
          isCustomTask: !!res.isCustomTask,
          customTaskNotice: res.customTaskNotice || "",
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
      })
      .catch(function () {
        self.setData({ loading: false });
      })
      .then(function () {
        // 首页顶部提示与任务数据一起刷新完毕后再结束下拉刷新
        return self.loadWorryNotice();
      })
      .then(function () {
        if (done) done();
      });
  },

  /**
   * 拉取老师未读回复数，驱动首页顶部信息提示模块。
   * 这里只取计数、不标记已读：学生进入「我的小心事」真正看到回复后才会标记，
   * 从而保证提示只在首页顶部出现、且看过之后才消失。
   */
  loadWorryNotice: function () {
    var self = this;
    this.setData({ worryNoticeText: "加载中…" });
    return api
      .getStudentWorries(1)
      .then(function (res) {
        var count = Number((res && res.newReplyCount) || 0);
        self.setData({
          newReplyCount: count,
          worryNoticeText: count
            ? "老师回复了你的 " + count + " 条小心事，点击查看"
            : "暂无新的回复，有心事可以写给老师"
        });
      })
      .catch(function () {
        self.setData({ newReplyCount: 0, worryNoticeText: "点这里写下你的小心事" });
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
    // 学习园地是学生 / 教师 / 管理员共享的动态流，入口统一指向 pages/garden
    wx.redirectTo({ url: "/pages/garden/garden" });
  },

  /** 右下角悬浮按钮：写下「我的小心事」 */
  goWorry: function () {
    wx.navigateTo({ url: "/pages/student/worry/worry" });
  }
});
