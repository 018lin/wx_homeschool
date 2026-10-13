var app = getApp();
var request = require("../../utils/api.js");
var api = request.api;
var util = require("../../utils/util.js");

var ROLE_LABEL = { parent: "家长", teacher: "教师", admin: "管理员", student: "学生" };

function mapContact(item) {
  item = item || {};
  return {
    id: Number(item.id), account: item.account || "", name: item.display_name || item.name || "联系人",
    role: item.role || "", roleLabel: ROLE_LABEL[item.role] || "用户", initial: String(item.display_name || item.name || "联").slice(0, 1), unreadCount: Number(item.unreadCount || 0),
    lastContent: item.lastContent || "", lastAt: item.lastAt || ""
  };
}

Page({
  data: {
    role: "", loading: true, keyword: "", contacts: [], filteredContacts: [], conversations: [],
    activePeer: {}, messages: [], draft: "", canSend: false, sending: false, scrollIntoView: ""
  },

  onShow: function () {
    if (!app.isLogin()) { wx.redirectTo({ url: "/pages/login/login" }); return; }
    this.setData({ role: app.globalData.role || "" });
    this.loadData();
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadData(function () { wx.stopPullDownRefresh(); });
  },

  loadData: function (done) {
    var self = this;
    this.setData({ loading: true });
    api.getMessages(null, 300).then(function (res) {
      var contacts = (res && res.contacts || []).map(mapContact);
      var conversations = (res && res.conversations || []).map(mapContact);
      var currentId = self.data.activePeer.id;
      var active = contacts.filter(function (item) { return item.id === currentId; })[0] || {};
      self.setData({ loading: false, contacts: contacts, conversations: conversations, activePeer: active }, function () {
        self.applyFilter();
        if (active.id) self.loadConversation(active.id, true);
      });
      if (done) done();
    }).catch(function (error) {
      self.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || "消息加载失败", icon: "none" });
      if (done) done();
    });
  },

  applyFilter: function () {
    var keyword = String(this.data.keyword || "").toLowerCase();
    var list = this.data.contacts.filter(function (item) {
      return !keyword || [item.name, item.account, item.roleLabel].join(" ").toLowerCase().indexOf(keyword) >= 0;
    });
    this.setData({ filteredContacts: list });
  },

  onSearch: function (e) { this.setData({ keyword: (e.detail.value || "").trim() }); this.applyFilter(); },

  openPeer: function (e) {
    var peer = mapContact(e.currentTarget.dataset.peer);
    if (!peer.id) return;
    this.setData({ activePeer: peer, messages: [], scrollIntoView: "" });
    this.loadConversation(peer.id);
  },

  loadConversation: function (peerId, silent) {
    var self = this;
    api.getMessages(peerId, 300).then(function (res) {
      var messages = (res && res.messages || []).map(function (item) {
        return Object.assign({}, item, { mine: Number(item.recipient_user_id) === Number(peerId), timeText: util.fromNow(item.created_at) });
      });
      self.setData({ messages: messages, scrollIntoView: messages.length ? "msg-" + messages[messages.length - 1].id : "" });
      api.markMessagesRead(peerId);
      self.updateUnread(peerId);
    }).catch(function (error) {
      if (!silent) wx.showToast({ title: (error && error.message) || "会话加载失败", icon: "none" });
    });
  },

  updateUnread: function (peerId) {
    var contacts = this.data.contacts.map(function (item) { return item.id === peerId ? Object.assign({}, item, { unreadCount: 0 }) : item; });
    this.setData({ contacts: contacts }, this.applyFilter);
  },

  refreshConversation: function () { if (this.data.activePeer.id) this.loadConversation(this.data.activePeer.id); },
  onDraftInput: function (e) { var draft = e.detail.value || ""; this.setData({ draft: draft, canSend: !!String(draft).trim() }); },

  send: function () {
    var self = this;
    var content = String(this.data.draft || "").trim();
    if (!content || !this.data.activePeer.id || this.data.sending) return;
    this.setData({ sending: true });
    api.sendMessage(this.data.activePeer.id, content).then(function (res) {
      var item = res && res.message || {};
      item.mine = true;
      item.timeText = util.fromNow(item.created_at);
      self.setData({ draft: "", canSend: false, sending: false, messages: self.data.messages.concat([item]), scrollIntoView: "msg-" + item.id });
    }).catch(function (error) {
      self.setData({ sending: false });
      wx.showToast({ title: (error && error.message) || "发送失败", icon: "none" });
    });
  }
});
