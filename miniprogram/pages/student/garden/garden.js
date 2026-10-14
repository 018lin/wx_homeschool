/**
 * 学习园地（占位页）
 * 后续学习作品展示、点赞、同伴互评等功能在此页扩展。
 */
var app = getApp();

Page({
  data: {},

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
  }
});
