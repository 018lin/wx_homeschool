var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");
var avatar = require("../../../utils/avatar.js");

var ROLE_LABEL = { parent: "家长", teacher: "教师", admin: "管理员", student: "学生" };
var POLL_INTERVAL = 6000; // 聊天页轮询拉取新消息

Page({
  data: {
    peerId: 0, peer: {}, peerName: "", peerSub: "", peerInitial: "", peerAvatar: "", peerAvatarOk: true,
    myInitial: "我", myAvatar: "", myAvatarOk: true,
    messages: [], draft: "", canSend: false, sending: false,
    scrollIntoView: "", loading: true
  },

  onLoad: function (options) {
    var user = (app.globalData.user || {});
    var peerId = Number(options && options.peerId);
    this.setData({
      myInitial: String(user.displayName || "我").slice(0, 1),
      myAvatar: avatar.resolve(user, true),
      myAvatarOk: true
    });
    if (!peerId) {
      wx.showToast({ title: "联系人参数无效", icon: "none" });
      setTimeout(function () { wx.navigateBack({ fail: function () {} }); }, 600);
      return;
    }
    this.setData({ peerId: peerId });
    this.loadConversation();
  },

  onShow: function () {
    // 回到本页时同步一次自己的头像（个人页换头像后立即生效）
    var user = app.globalData.user || {};
    this.setData({
      myInitial: String(user.displayName || "我").slice(0, 1),
      myAvatar: avatar.resolve(user, true),
      myAvatarOk: true
    });
    this.startPolling();
  },
  onHide: function () { this.stopPolling(); },
  onUnload: function () { this.stopPolling(); },

  startPolling: function () {
    var self = this;
    if (this.__pollTimer || !this.data.peerId) return;
    this.__pollTimer = setInterval(function () {
      self.loadConversation(true);
    }, POLL_INTERVAL);
  },

  stopPolling: function () {
    if (this.__pollTimer) {
      clearInterval(this.__pollTimer);
      this.__pollTimer = null;
    }
  },

  /** 默认头像图读不出来时回落到首字母色块，避免出现空白头像 */
  onPeerAvatarError: function () {
    this.setData({ peerAvatarOk: false });
  },

  onMyAvatarError: function () {
    this.setData({ myAvatarOk: false });
  },

  loadConversation: function (silent) {
    var self = this;
    var peerId = this.data.peerId;
    if (!peerId) return;
    if (!silent) this.setData({ loading: true });
    api.getMessages(peerId, 300).then(function (res) {
      var peer = (res && res.peer) || {};
      var name = peer.display_name || peer.name || "对方";
      var sub = ROLE_LABEL[peer.role] || "";
      var messages = ((res && res.messages) || []).map(function (item) {
        // 对方是接收方 → 发送方是自己
        return Object.assign({}, item, {
          mine: Number(item.recipient_user_id) === Number(peerId),
          timeText: util.fromNow(item.created_at)
        });
      });
      self.setData({
        loading: false,
        peer: peer,
        peerName: name,
        peerSub: sub,
        peerInitial: String(name).slice(0, 1),
        peerAvatar: avatar.resolve(peer, false),
        peerAvatarOk: true,
        messages: messages,
        scrollIntoView: messages.length ? "msg-" + messages[messages.length - 1].id : ""
      });
      wx.setNavigationBarTitle({ title: name });
      api.markMessagesRead(peerId);
    }).catch(function (error) {
      self.setData({ loading: false });
      if (!silent) wx.showToast({ title: (error && error.message) || "会话加载失败", icon: "none" });
    });
  },

  onDraftInput: function (e) {
    var draft = e.detail.value || "";
    this.setData({ draft: draft, canSend: !!String(draft).trim() });
  },

  send: function () {
    var self = this;
    var content = String(this.data.draft || "").trim();
    if (!content || !this.data.peerId || this.data.sending) return;
    this.setData({ sending: true });
    api.sendMessage(this.data.peerId, content).then(function (res) {
      var item = (res && res.message) || {};
      item.mine = true;
      item.timeText = util.fromNow(item.created_at);
      self.setData({
        draft: "", canSend: false, sending: false,
        messages: self.data.messages.concat([item]),
        scrollIntoView: "msg-" + item.id
      });
    }).catch(function (error) {
      self.setData({ sending: false });
      wx.showToast({ title: (error && error.message) || "发送失败", icon: "none" });
    });
  }
});
