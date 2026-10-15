var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

/**
 * 任务分类 → 卡片语义色键
 * - emotion     暖粉橙（情绪、心情、社交、人际）
 * - observation 天蓝   （观察、探究、实验、调研）
 * - sport       薄荷绿 （运动、体育、户外、游戏）
 * - default     蓝紫   （兜底）
 */
function getTypeKey(type) {
  if (!type) return "default";
  var t = String(type);
  if (/情绪|情感|心情|社交|人际|友谊|交往|关系/.test(t)) return "emotion";
  if (/观察|探究|实验|调研|调查|研究|发现|探索|科学/.test(t)) return "observation";
  if (/运动|体育|体能|户外|跑步|跳跃|健身|游戏|玩耍|锻炼/.test(t)) return "sport";
  return "default";
}

/** 形如 2026-10-12 简化为 10-12，去掉前导零、去掉年份，方便卡片排版 */
function shortDate(str) {
  if (!str) return "";
  var s = String(str);
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    var mo = String(parseInt(m[2], 10));
    var d = String(parseInt(m[3], 10));
    return mo + "-" + d;
  }
  return s;
}

Page({
  data: {
    loading: true,
    allTasks: [],
    tasks: [],
    studentCount: 0,
    filter: "all",
    filterCounts: { all: 0, incomplete: 0, completed: 0 },
    error: "",
    // 页头由全局 app-header 组件渲染，状态栏安全距离由组件内部计算
    heroSub: "家校共育 · 让成长被看见"
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    if (app.globalData.role !== "admin") {
      wx.showToast({ title: "仅管理员账号可访问", icon: "none" });
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
    this.setData({ loading: true, error: "" });
    api
      .getAdminTasks(100)
      .then(function (res) {
        if (!res) return;
        var allTasks = (res.tasks || []).map(function (t) {
            var completionRate = Number(t.completionRate || 0);
            var targetCount = Number(t.targetCount || 0);
            var completedCount = Number(t.completedCount || 0);
            return {
              id: t.id,
              title: t.title || "",
              type: t.type || "",
              typeKey: getTypeKey(t.type),
              weekStart: t.weekStart || "",
              weekStartShort: shortDate(t.weekStart),
              createdAt: util.formatDateTime(t.createdAt),
              duration: t.duration || "",
              scope: t.scope || "",
              studentName: t.studentName || "",
              publisherName: t.publisherName || "",
              targetCount: targetCount,
              completedCount: completedCount,
              draftCount: Number(t.draftCount || 0),
              completionRate: completionRate,
              donutDeg: Math.max(0, Math.min(360, completionRate * 3.6)),
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
        var counts = {
          all: allTasks.length,
          incomplete: allTasks.filter(function (task) { return task.completedCount < task.targetCount; }).length,
          completed: allTasks.filter(function (task) { return task.targetCount > 0 && task.completedCount === task.targetCount; }).length
        };
        self.setData({
          loading: false,
          studentCount: Number(res.studentCount || 0),
          allTasks: allTasks,
          filterCounts: counts
        }, function () {
          self.syncHeroSub(counts);
          self.applyFilter();
        });
        if (done) done();
      })
      .catch(function (error) {
        self.setData({ loading: false, error: (error && error.message) || "任务看板加载失败" });
        if (done) done();
      });
  },

  /** 头图副标题：概括任务概况，无任务时回落到品牌标语 */
  syncHeroSub: function (counts) {
    counts = counts || this.data.filterCounts;
    var studentCount = this.data.studentCount || 0;
    var parts = [];
    if (studentCount) parts.push(studentCount + " 名学生");
    if (counts && counts.all) parts.push("共 " + counts.all + " 个任务");
    this.setData({
      heroSub: parts.length ? parts.join(" · ") : "家校共育 · 让成长被看见"
    });
  },

  /** 整卡可点击：跳转任务详情页，携带任务唯一标识 id */
  goDetail: function (e) {
    var id = e && e.currentTarget ? e.currentTarget.dataset.id : null;
    if (!id) {
      wx.showToast({ title: "缺少任务标识", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/admin/task-detail/task-detail?id=" + id });
  },

  switchFilter: function (e) {
    this.setData({ filter: e.currentTarget.dataset.filter });
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

  onRetry: function () { this.loadData(); },

  /** 顶部分段：切换到成长时间线 */
  goTimeline: function () {
    wx.redirectTo({ url: "/pages/admin/timeline/timeline" });
  }
});