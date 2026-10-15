/**
 * 管理员端 · 家长成长关注：查看家长提交的关注内容与老师处理结果
 */
var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    error: "",
    filter: "all", // all | pending | approved | rejected
    filters: [
      { key: "all", label: "全部" },
      { key: "pending", label: "待回复" },
      { key: "approved", label: "已处理" },
      { key: "rejected", label: "未采纳" }
    ],
    all: [],
    items: []
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
      .getAdminParentTaskRequests(100)
      .then(function (res) {
        var rows = (res && res.requests) || [];
        var all = rows.map(function (row) {
          var meta = util.requestStatusMeta(row.status);
          return {
            id: row.id,
            childName: row.child_name || "学生",
            grade: row.grade || "",
            parentName: row.parent_name || "家长",
            title: row.title || "成长关注",
            category: row.concern_category || "",
            behavior: row.observed_behavior || "",
            context: row.context || "",
            frequency: row.frequency || "",
            impact: row.impact || "",
            expectation: row.parent_expectation || "",
            constraints: row.family_constraints || "",
            duration: Number(row.duration || 20),
            status: row.status || "pending",
            statusText: meta.text,
            statusColor: meta.color,
            statusBg: meta.bg,
            teacherComment: row.teacher_comment || "",
            taskTitle: row.task_title || "",
            timeText: util.fromNow(row.created_at)
          };
        });
        self.setData({ loading: false, all: all });
        self.applyFilter();
        // 打开列表即视为已阅，回到首页时顶部板块显示「暂无新的提交」
        if (Number((res && res.newCount) || 0) > 0) {
          api.markAdminParentTaskRequestsRead().catch(function () {});
        }
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false, error: "成长关注加载失败" });
        if (done) done();
      });
  },

  switchFilter: function (e) {
    this.setData({ filter: e.currentTarget.dataset.filter });
    this.applyFilter();
  },

  applyFilter: function () {
    var f = this.data.filter;
    var all = this.data.all || [];
    var items = f === "all" ? all : all.filter(function (item) {
      return item.status === f;
    });
    this.setData({ items: items });
  }
});
