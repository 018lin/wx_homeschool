var app = getApp();
var request = require("../../utils/api.js");
var api = request.api;
var agreement = require("../../utils/agreement-content.js");

Page({
  data: {
    account: "",
    password: "",
    showPwd: false,
    agreed: false,
    agreementVisible: false,
    agreementDoc: "user-agreement",
    accountFocus: false,
    pwdFocus: false,
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

  onToggleAgree: function () {
    this.setData({ agreed: !this.data.agreed });
  },

  /** 点击协议名称 → 打开对应弹窗查看全文 */
  onOpenAgreement: function (e) {
    var doc = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.doc) || "user-agreement";
    this.setData({ agreementDoc: doc, agreementVisible: true, error: "" });
  },

  /** 弹窗内点「同意并继续」→ 视为已同意并关闭弹窗 */
  onAgreementConfirm: function () {
    this.setData({ agreementVisible: false, agreed: true, error: "" });
  },

  /** 点「关闭」或遮罩 → 只关弹窗，不改同意态 */
  onCloseAgreement: function () {
    this.setData({ agreementVisible: false });
  },

  onFieldFocus: function () {
    this.setData({ accountFocus: true });
  },

  onPwdFocus: function () {
    this.setData({ pwdFocus: true });
  },

  onFieldBlur: function () {
    this.setData({ accountFocus: false, pwdFocus: false });
  },

  onSubmit: function () {
    var self = this;
    var account = (this.data.account || "").trim();
    var password = this.data.password || "";

    if (!account) return this.setData({ error: "请输入账号" });
    if (account.length < 3) return this.setData({ error: "账号至少 3 个字符" });
    if (!password) return this.setData({ error: "请输入密码" });
    if (password.length < 6) return this.setData({ error: "密码至少 6 位" });
    if (!this.data.agreed) {
      this.setData({ error: "请先阅读并勾选同意《用户协议》与《隐私政策》" });
      return;
    }

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

        // 记录本次同意的协议版本与时间，便于协议升版后区分新旧用户
        try {
          wx.setStorageSync("agreementAccepted", {
            version: agreement.VERSION,
            at: Date.now()
          });
        } catch (e) {}

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