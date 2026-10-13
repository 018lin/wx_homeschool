var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    stats: null,
    generatedAt: ""
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
    this.setData({ loading: true });
    api
      .getAdminOverview()
      .then(function (res) {
        if (!res) return;
        // 只保留概览统计所需字段，减少 setData 数据量
        self.setData({
          loading: false,
          generatedAt: util.formatDateTime(res.generatedAt),
          stats: res.stats || null
        });
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false });
        if (done) done();
      });
  },

  goAccounts: function () {
    wx.navigateTo({ url: "/pages/admin/accounts/accounts" });
  },
  goClasses: function () {
    wx.navigateTo({ url: "/pages/admin/classes/classes" });
  }
});
