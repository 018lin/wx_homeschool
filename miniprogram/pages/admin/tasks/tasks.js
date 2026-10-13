var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    allTasks: [],
    tasks: [],
    studentCount: 0,
    expanded: null,
    filter: "all",
    filterCounts: { all: 0, incomplete: 0, completed: 0 },
    error: ""
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
    this.setData({ loading: true, error: "" });
    api
      .getAdminTasks(100)
      .then(function (res) {
        if (!res) return;
        var allTasks = (res.tasks || []).map(function (t) {
            return {
              id: t.id,
              title: t.title || "",
              type: t.type || "",
              weekStart: t.weekStart || "",
              createdAt: util.formatDateTime(t.createdAt),
              duration: t.duration || "",
              scope: t.scope || "",
              studentName: t.studentName || "",
              publisherName: t.publisherName || "",
              targetCount: t.targetCount || 0,
              completedCount: t.completedCount || 0,
              draftCount: t.draftCount || 0,
              completionRate: t.completionRate || 0,
              details: (t.details || []).map(function (d) {
                return {
                  studentId: d.studentId,
                  studentName: d.studentName || "",
                  grade: d.grade || "",
                  status: d.status || "not_started",
                  statusText: d.status === "completed" ? "已完成" : d.status === "draft" ? "草稿" : "未开始",
                  statusCls: d.status === "completed" ? "badge-teal" : d.status === "draft" ? "badge-warning" : "badge-gray",
                  content: d.content || "",
                  submittedAt: util.formatDateTime(d.submittedAt),
                  subType: d.subType || ""
                };
              })
            };
          });
        self.setData({
          loading: false,
          studentCount: Number(res.studentCount || 0),
          allTasks: allTasks,
          filterCounts: {
            all: allTasks.length,
            incomplete: allTasks.filter(function (task) { return task.completedCount < task.targetCount; }).length,
            completed: allTasks.filter(function (task) { return task.targetCount > 0 && task.completedCount === task.targetCount; }).length
          }
        }, function () {
          self.applyFilter();
        });
        if (done) done();
      })
      .catch(function (error) {
        self.setData({ loading: false, error: (error && error.message) || "任务看板加载失败" });
        if (done) done();
      });
  },

  toggle: function (e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ expanded: this.data.expanded === id ? null : id });
  },

  switchFilter: function (e) {
    this.setData({ filter: e.currentTarget.dataset.filter, expanded: null });
    this.applyFilter();
  },

  applyFilter: function () {
    var mode = this.data.filter;
    var tasks = this.data.allTasks.filter(function (task) {
      if (mode === "incomplete") return task.completedCount < task.targetCount;
      if (mode === "completed") return task.targetCount > 0 && task.completedCount === task.targetCount;
      return true;
    });
    this.setData({ tasks: tasks });
  },

  onRetry: function () { this.loadData(); }
});
