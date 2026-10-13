var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    filter: "all", // all | pending | done
    all: [],
    items: [],
    counts: { all: 0, pending: 0, done: 0 }
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
      .then(function (res) {
        var list = (res && res.submissions) || [];
        var all = list.map(function (s) {
          return {
            id: s.id,
            childName: s.child_name || "学生",
            grade: s.grade || "",
            title: s.title || "",
            content: util.truncate(s.content || "", 70),
            subType: util.subTypeLabel(s.sub_type),
            timeText: util.fromNow(s.created_at),
            feedbackCount: Number(s.feedback_count || 0)
          };
        });
        var pending = all.filter(function (i) { return !i.feedbackCount; });
        self.setData({
          loading: false,
          all: all,
          counts: { all: all.length, pending: pending.length, done: all.length - pending.length }
        });
        self.applyFilter();
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false });
        if (done) done();
      });
  },

  applyFilter: function () {
    var f = this.data.filter;
    var all = this.data.all;
    var items = f === "pending"
      ? all.filter(function (i) { return !i.feedbackCount; })
      : f === "done"
      ? all.filter(function (i) { return i.feedbackCount; })
      : all;
    this.setData({ items: items });
  },

  switchFilter: function (e) {
    this.setData({ filter: e.currentTarget.dataset.filter });
    this.applyFilter();
  },

  goDetail: function (e) {
    wx.navigateTo({ url: "/pages/teacher/submission-detail/submission-detail?id=" + e.currentTarget.dataset.id });
  }
});
