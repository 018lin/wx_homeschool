var app = getApp();
var request = require("../../utils/api.js");
var api = request.api;
var util = require("../../utils/util.js");
var avatar = require("../../utils/avatar.js");

var ROLE_LABEL = { parent: "家长", teacher: "教师", admin: "管理员", student: "学生" };
var ROLE_ORDER = { teacher: 0, parent: 1, admin: 2, student: 3 };

/** 把最近会话按对方 id 建索引，便于合并进联系人列表 */
function buildConversationMap(conversations) {
  var map = {};
  (conversations || []).forEach(function (item) {
    item = item || {};
    map[Number(item.peerId)] = {
      lastContent: item.lastContent || "",
      lastAt: item.lastAt || "",
      unreadCount: Number(item.unreadCount || 0)
    };
  });
  return map;
}

function mapContact(item, convMap) {
  item = item || {};
  var id = Number(item.id);
  var conv = convMap[id] || {};
  var name = item.display_name || item.name || "联系人";
  var role = String(item.role || "").trim().toLowerCase();
  // 服务端返回的头像优先，没有自定义头像时回落到角色默认头像
  var custom = avatar.hasCustom(item, false);
  return {
    id: id,
    account: item.account || "",
    name: name,
    role: role,
    roleLabel: ROLE_LABEL[role] || "用户",
    initial: String(name).slice(0, 1),
    avatar: avatar.resolve(item, false),
    hasCustomAvatar: custom,
    unreadCount: Number(conv.unreadCount || 0),
    lastContent: conv.lastContent || "",
    lastAt: conv.lastAt || "",
    lastAtText: conv.lastAt ? util.fromNow(conv.lastAt) : ""
  };
}

Page({
  data: {
    role: "", loading: true, keyword: "", filteredContacts: []
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
    if (!this.data.loading) this.setData({ loading: true });
    api.getMessages(null, 300).then(function (res) {
      var convMap = buildConversationMap(res && res.conversations);
      var contacts = ((res && res.contacts) || []).map(function (item) {
        return mapContact(item, convMap);
      });
      // 有最近消息的排前面（按时间倒序），其余按角色顺序
      contacts.sort(function (a, b) {
        if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
        if (a.lastAt) return -1;
        if (b.lastAt) return 1;
        var ra = ROLE_ORDER[a.role] !== undefined ? ROLE_ORDER[a.role] : 9;
        var rb = ROLE_ORDER[b.role] !== undefined ? ROLE_ORDER[b.role] : 9;
        if (ra !== rb) return ra - rb;
        return a.id - b.id;
      });
      // 头像是 base64 数据，体积较大；原始数据只留在实例上，避免 setData 时重复一份
      this.contacts = contacts;
      self.setData({ loading: false }, function () {
        self.applyFilter();
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
    var list = (this.contacts || []).filter(function (item) {
      return !keyword || [item.name, item.account, item.roleLabel].join(" ").toLowerCase().indexOf(keyword) >= 0;
    });
    this.setData({ filteredContacts: list });
  },

  onSearch: function (e) {
    this.setData({ keyword: (e.detail.value || "").trim() });
    this.applyFilter();
  },

  clearSearch: function () {
    this.setData({ keyword: "" });
    this.applyFilter();
  },

  /** 点击联系人 → 进入聊天页 */
  openPeer: function (e) {
    var peerId = Number(e.currentTarget.dataset.id);
    if (!peerId) return;
    wx.navigateTo({ url: "/pages/messages/chat/chat?peerId=" + peerId });
  }
});
