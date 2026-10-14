/**
 * 管理员端 · 学生小心事详情：展示所有提交内容
 */
var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    worries: [],
    error: ""
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
      .getAdminWorries(100)
      .then(function (res) {
        var rows = (res && res.worries) || [];
        self.setData({
          loading: false,
          worries: rows.map(function (row) {
            return {
              id: row.id,
              studentName: row.student_name || "学生",
              grade: row.grade || "",
              content: row.content || "",
              timeText: util.formatDateTime(row.created_at),
              read: !!row.read_at
            };
          })
        });
        // 详情页打开即视为已阅，回到首页时板块显示「暂无新的提交」
        if (rows.some(function (row) { return !row.read_at; })) {
          api.markAdminWorriesRead().catch(function () {});
        }
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false, error: "小心事加载失败" });
        if (done) done();
      });
  }
});
