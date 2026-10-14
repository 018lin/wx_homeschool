/**
 * 我的小心事：学生写下心事并发送给管理员，同时查看管理员的回复
 */
var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

var MAX_LENGTH = 500;

Page({
  data: {
    content: "",
    count: 0,
    maxLength: MAX_LENGTH,
    submitting: false,
    sent: false,
    sentAt: "",
    loadingList: true,
    listError: "",
    list: [],
    newReplyCount: 0
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
    this.loadList();
  },

  onPullDownRefresh: function () {
    this.loadList(function () {
      wx.stopPullDownRefresh();
    });
  },

  /** 拉取自己提交过的心事与对应回复 */
  loadList: function (done) {
    var self = this;
    this.setData({ loadingList: true, listError: "" });
    api
      .getStudentWorries(50)
      .then(function (res) {
        var rows = (res && res.worries) || [];
        var newReplyCount = Number(res && res.newReplyCount || 0);
        self.setData({
          loadingList: false,
          newReplyCount: newReplyCount,
          list: rows.map(function (row) {
            var reply = String(row.reply_content || "");
            return {
              id: row.id,
              content: row.content || "",
              timeText: util.formatDateTime(row.created_at),
              replyContent: reply,
              replyByName: row.reply_by_name || "管理员",
              replyTimeText: reply ? util.formatDateTime(row.replied_at) : "",
              replyUnread: !!reply && !row.reply_read_at
            };
          })
        });
        // 本次已看到回复内容，回到该页时不再提示「你有新的回复」
        if (newReplyCount > 0) {
          api.readStudentWorryReplies().catch(function () {});
        }
        if (done) done();
      })
      .catch(function () {
        self.setData({ loadingList: false, listError: "小心事加载失败" });
        if (done) done();
      });
  },

  /** 点击顶部提示，滚动到下方的心事列表 */
  onTapReplyNotice: function () {
    wx.pageScrollTo({ selector: "#worry-list", duration: 300 });
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
        self.loadList();
      })
      .catch(function () {
        self.setData({ submitting: false });
      });
  }
});