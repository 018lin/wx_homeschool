/**
 * 管理员端 · 学生小心事：查看全部提交并回复
 */
var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

var MAX_LENGTH = 500;

Page({
  data: {
    loading: true,
    worries: [],
    error: "",
    selectedId: 0,
    replyText: "",
    replyCount: 0,
    maxLength: MAX_LENGTH,
    sending: false
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
    this.loadData(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadData: function (done) {
    var self = this;
    this.setData({ loading: true, error: "" });
    api
      .getAdminWorries(100)
      .then(function (res) {
        var rows = (res && res.worries) || [];
        var selectedId = self.data.selectedId;
        var stillExists = rows.some(function (row) {
          return Number(row.id) === Number(selectedId);
        });
        self.setData({
          loading: false,
          selectedId: stillExists ? selectedId : 0,
          replyText: stillExists ? self.data.replyText : "",
          replyCount: stillExists ? self.data.replyText.length : 0,
          worries: rows.map(function (row) {
            var reply = String(row.reply_content || "");
            return {
              id: row.id,
              studentName: row.student_name || "学生",
              grade: row.grade || "",
              content: row.content || "",
              timeText: util.formatDateTime(row.created_at),
              read: !!row.read_at,
              replyContent: reply,
              replyByName: row.reply_by_name || "管理员",
              replyTimeText: reply ? util.formatDateTime(row.replied_at) : "",
              replyRead: !!row.reply_read_at
            };
          })
        });
        // 详情页打开即视为已阅，回到首页时板块显示「暂无新的提交」
        if (rows.some(function (row) { return !row.read_at; })) {
          api.markAdminWorriesRead().catch(function () {});
        }
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false, error: "小心事加载失败" });
        if (done) done();
      });
  },

  /** 选中某条小心事，展开回复输入框（已回复过则带出原内容便于修改） */
  onSelectItem: function (e) {
    var id = Number(e.currentTarget.dataset.id) || 0;
    if (!id) return;
    if (this.data.selectedId === id) {
      this.closeReply();
      return;
    }
    var target = null;
    for (var i = 0; i < this.data.worries.length; i++) {
      if (Number(this.data.worries[i].id) === id) target = this.data.worries[i];
    }
    var replyText = (target && target.replyContent) || "";
    this.setData({ selectedId: id, replyText: replyText, replyCount: replyText.length });
  },

  onCancelReply: function () {
    this.closeReply();
  },

  /** 阻止回复输入区的点击冒泡到列表项（避免误触发选中/关闭） */
  onFormTap: function () {},

  closeReply: function () {
    this.setData({ selectedId: 0, replyText: "", replyCount: 0 });
  },

  onReplyInput: function (e) {
    var value = e.detail.value || "";
    this.setData({ replyText: value, replyCount: value.length });
  },

  /** 发送回复 */
  onSendReply: function () {
    var self = this;
    var id = this.data.selectedId;
    if (!id) return;
    var content = String(this.data.replyText || "").trim();
    if (!content) {
      wx.showToast({ title: "先写下回复内容吧", icon: "none" });
      return;
    }
    if (content.length > MAX_LENGTH) {
      wx.showToast({ title: "最多 " + MAX_LENGTH + " 个字", icon: "none" });
      return;
    }
    this.setData({ sending: true });
    api
      .replyAdminWorry(id, content)
      .then(function (res) {
        var saved = (res && res.worry) || {};
        var replyTimeText = util.formatDateTime(saved.replied_at) || util.formatDateTime(new Date().toISOString());
        var list = self.data.worries.map(function (item) {
          if (Number(item.id) !== Number(id)) return item;
          return Object.assign({}, item, {
            replyContent: saved.reply_content || content,
            replyByName: saved.reply_by_name || item.replyByName,
            replyTimeText: replyTimeText,
            replyRead: false
          });
        });
        self.setData({
          sending: false,
          selectedId: 0,
          replyText: "",
          replyCount: 0,
          worries: list
        });
        wx.showToast({ title: "回复已发送", icon: "success" });
      })
      .catch(function () {
        self.setData({ sending: false });
      });
  }
});