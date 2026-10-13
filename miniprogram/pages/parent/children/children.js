var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    children: [],
    currentChildId: null,
    showAdd: false,
    newName: "",
    newGrade: "",
    saving: false
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    this.loadData();
  },

  loadData: function () {
    var self = this;
    this.setData({ loading: true });
    api
      .getHome()
      .then(function (res) {
        if (!res) return;
        var children = (res.children || []).map(function (c) {
          return {
            id: c.id,
            name: c.name,
            grade: c.grade || "未填年级",
            gender: c.gender || "",
            age: c.age || "",
            interestsArr: c.interests
              ? String(c.interests)
                  .split(",")
                  .map(function (s) { return s.trim(); })
                  .filter(function (s) { return !!s; })
              : []
          };
        });
        self.setData({
          loading: false,
          children: children,
          currentChildId: (res.child && res.child.id) || null
        });
      })
      .catch(function () {
        self.setData({ loading: false });
      });
  },

  onSelect: function (e) {
    var id = e.currentTarget.dataset.id;
    app.setChildId(id);
    this.setData({ currentChildId: id });
    wx.showToast({ title: "已切换", icon: "success" });
    setTimeout(function () {
      wx.navigateBack({
        fail: function () {
          wx.redirectTo({ url: "/pages/parent/home/home" });
        }
      });
    }, 500);
  },

  toggleAdd: function () {
    this.setData({ showAdd: !this.data.showAdd });
  },

  onInput: function (e) {
    var patch = {};
    patch[e.currentTarget.dataset.key] = e.detail.value;
    this.setData(patch);
  },

  onAdd: function () {
    var self = this;
    var name = (this.data.newName || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写孩子姓名", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    api
      .addChild(name, this.data.newGrade)
      .then(function (res) {
        self.setData({ saving: false, newName: "", newGrade: "", showAdd: false });
        wx.showToast({ title: "已添加", icon: "success" });
        if (res && res.child && res.child.id) app.setChildId(res.child.id);
        self.loadData();
      })
      .catch(function () {
        self.setData({ saving: false });
      });
  }
});
