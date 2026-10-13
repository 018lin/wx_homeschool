var app = getApp();
var request = require("../../utils/api.js");
var api = request.api;

Page({
  data: {
    account: "",
    password: "",
    showPwd: false,
    loading: false,
    error: ""
  },

  onLoad: function () {
    // 已有登录态直接进入对应工作台
    if (app.isLogin()) {
      wx.redirectTo({ url: app.landingPath(app.globalData.role) });
    }
  },

  onAccountInput: function (e) {
    this.setData({ account: e.detail.value, error: "" });
  },

  onPasswordInput: function (e) {
    this.setData({ password: e.detail.value, error: "" });
  },

  onTogglePwd: function () {
    this.setData({ showPwd: !this.data.showPwd });
  },

  onSubmit: function () {
    var self = this;
    var account = (this.data.account || "").trim();
    var password = this.data.password || "";

    if (!account) return this.setData({ error: "请输入账号" });
    if (account.length < 3) return this.setData({ error: "账号至少 3 个字符" });
    if (!password) return this.setData({ error: "请输入密码" });
    if (password.length < 6) return this.setData({ error: "密码至少 6 位" });

    this.setData({ loading: true, error: "" });

    api
      .login(account, password)
      .then(function (data) {
        self.setData({ loading: false });
        if (!data || !data.token || !data.user) {
          self.setData({ error: "登录失败：返回数据不完整" });
          return;
        }

        var role = data.user.role;
        console.log("[登录成功]", JSON.stringify(data.user));

        var path = app.landingPath(role);
        if (path === "/pages/login/login") {
          self.setData({ error: "登录成功，但账号角色「" + role + "」没有对应工作台" });
          return;
        }

        app.setSession(data.token, data.user);
        wx.showToast({ title: "登录成功", icon: "success" });
        setTimeout(function () {
          wx.redirectTo({ url: path });
        }, 500);
      })
      .catch(function (err) {
        self.setData({ loading: false });
        var msg = (err && err.message) || "账号或密码错误";
        if (err && err.status === 0) msg = "网络异常，请稍后再试";
        else if (err && err.status) msg += "（" + err.status + "）";
        console.log("[登录失败]", err && err.status, msg, err && err.data);
        self.setData({ error: msg });
      });
  }
});
