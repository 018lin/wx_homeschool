var app = getApp();
var request = require("../../utils/api.js");
var api = request.api;

var ROLE_META = {
  parent: { label: "家长", color: "#0057b8", avatar: "/assets/parents.png" },
  student: { label: "学生", color: "#0f766e", avatar: "/assets/student.png" },
  teacher: { label: "教师", color: "#5e6ad2", avatar: "/assets/teacher.png" },
  admin: { label: "管理员", color: "#8a4b10", avatar: "/assets/admin.png" }
};

Page({
  data: {
    user: null,
    avatarImage: "/assets/admin.png",
    roleLabel: "",
    roleColor: "#0057b8"
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    var user = app.globalData.user || {};
    var role = String(user.role || "").trim().toLowerCase();
    var meta = ROLE_META[role] || { label: "用户", color: "#8795a7", avatar: "" };
    this.setData({
      user: user,
      avatarImage: meta.avatar,
      roleLabel: meta.label,
      roleColor: meta.color
    });
  },

  onLogout: function () {
    var self = this;
    wx.showModal({
      title: "退出登录",
      content: "确定要退出当前账号吗？",
      success: function (r) {
        if (!r.confirm) return;
        api
          .logout()
          .catch(function () {})
          .then(function () {
            app.clearSession();
            wx.reLaunch({ url: "/pages/login/login" });
          });
      }
    });
  }
});
