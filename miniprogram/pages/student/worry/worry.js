/**
 * 我的小心事：学生写下心事并发送给管理员
 */
var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;

var MAX_LENGTH = 500;

Page({
  data: {
    content: "",
    count: 0,
    maxLength: MAX_LENGTH,
    submitting: false,
    sent: false,
    sentAt: ""
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    // 从提交成功状态返回时重置表单，允许再次提交
    if (this.data.sent) {
      this.setData({ content: "", count: 0, sent: false, sentAt: "" });
    }
  },

  onInput: function (e) {
    var value = e.detail.value || "";
    this.setData({ content: value, count: value.length });
  },

  /** 确认发送 */
  onSend: function () {
    var self = this;
    var content = String(this.data.content || "").trim();
    if (!content) {
      wx.showToast({ title: "先写下你的小心事吧", icon: "none" });
      return;
    }
    if (content.length > MAX_LENGTH) {
      wx.showToast({ title: "最多 " + MAX_LENGTH + " 个字", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    api
      .submitWorry(content)
      .then(function () {
        self.setData({
          submitting: false,
          sent: true,
          sentAt: new Date().toLocaleTimeString(),
          content: "",
          count: 0
        });
        wx.showToast({ title: "已发送给老师", icon: "success" });
      })
      .catch(function () {
        self.setData({ submitting: false });
      });
  }
});
