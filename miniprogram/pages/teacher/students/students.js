var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;

Page({
  data: {
    loading: true,
    all: [],
    items: [],
    keyword: "",
    isAdmin: false
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    this.setData({ isAdmin: app.globalData.role === "admin" });
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
      .getTeacherStudents()
      .then(function (res) {
        var list = (res && res.students) || [];
        var all = list.map(function (s) {
          return {
            id: s.id,
            name: s.name || "未命名",
            grade: s.grade || "",
            gender: s.gender || "",
            age: s.age || "",
            caregiver: s.caregiver || "",
            interestsArr: s.interests
              ? String(s.interests).split(",").map(function (x) { return x.trim(); }).filter(function (x) { return !!x; })
              : [],
            familyNote: s.familyNote || "",
            timeAvailable: s.timeAvailable || "",
            taskPreference: s.taskPreference || ""
          };
        });
        self.setData({ loading: false, all: all, items: all });
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false });
        if (done) done();
      });
  },

  onSearch: function (e) {
    var kw = (e.detail.value || "").trim();
    var items = kw
      ? this.data.all.filter(function (s) {
          return s.name.indexOf(kw) >= 0 || s.grade.indexOf(kw) >= 0 || s.caregiver.indexOf(kw) >= 0;
        })
      : this.data.all;
    this.setData({ keyword: kw, items: items });
  },

  goSuggestion: function (e) {
    if (this.data.isAdmin) {
      wx.showToast({ title: "管理员当前为只读查看", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/teacher/suggestion/suggestion?childId=" + e.currentTarget.dataset.id });
  }
});
