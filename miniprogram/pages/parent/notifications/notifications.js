var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");
var state = require("../../../utils/state.js");

var TYPE_META = {
  announcement: { label: "班级通知", cls: "badge-primary" },
  teacher_daily_update: { label: "校园观察", cls: "badge-teal" },
  parent_task_request: { label: "成长关注", cls: "badge-warning" },
  task_reminder: { label: "任务提醒", cls: "badge-warning" }
};

Page({
  data: {
    loading: true,
    items: [],
    unreadCount: 0,
    subscribeConfigured: false,
    subscribeTemplateId: "",
    subscribing: false,
    subscribeStatus: ""
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    this.loadData();
    this.loadSubscribeConfig();
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadData(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadData: function (done) {
    var self = this;
    this.setData({ loading: true });
    api
      .getNotifications(20)
      .then(function (res) {
        var list = (res && res.notifications) || [];
        var hidden = state.getNotificationHidden();
        var items = list.filter(function (n) { return !hidden[String(n.id)]; }).map(function (n) {
          var meta = TYPE_META[n.type] || { label: "通知", cls: "badge-gray" };
          return {
            id: n.id,
            typeLabel: meta.label,
            typeCls: meta.cls,
            title: n.title || "",
            content: n.content || "",
            sender: n.sender_name || "",
            timeText: util.fromNow(n.created_at),
            unread: !n.read_at
          };
        });
        self.setData({
          loading: false,
          items: items,
          unreadCount: Number((res && res.unreadCount) || 0)
        });
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false });
        if (done) done();
      });
  },

  loadSubscribeConfig: function () {
    var self = this;
    api.getWechatSubscriptionConfig().then(function (res) {
      self.setData({
        subscribeConfigured: !!(res && res.configured && res.bindingConfigured && res.templateId),
        subscribeTemplateId: res && res.templateId || "",
        subscribeStatus: res && res.configured ? "可开启微信订阅提醒" : "微信订阅消息尚未配置，站内通知不受影响"
      });
    }).catch(function (error) {
      self.setData({ subscribeStatus: (error && error.message) || "订阅配置读取失败" });
    });
  },

  onEnableSubscribe: function () {
    var self = this;
    if (!this.data.subscribeConfigured || this.data.subscribing) return;
    this.setData({ subscribing: true, subscribeStatus: "正在绑定微信身份…" });
    wx.login({
      success: function (login) {
        if (!login.code) {
          self.setData({ subscribing: false, subscribeStatus: "微信登录未返回凭证" });
          return;
        }
        api.bindWechat(login.code).then(function () {
          self.setData({ subscribeStatus: "请确认订阅授权…" });
          wx.requestSubscribeMessage({
            tmplIds: [self.data.subscribeTemplateId],
            success: function (result) {
              var status = result[self.data.subscribeTemplateId];
              self.setData({ subscribing: false, subscribeStatus: status === "accept" ? "已授权一次微信订阅提醒" : "未授权微信订阅提醒，可继续使用站内通知" });
            },
            fail: function (error) {
              self.setData({ subscribing: false, subscribeStatus: (error && error.errMsg) || "订阅授权未完成" });
            }
          });
        }).catch(function (error) {
          self.setData({ subscribing: false, subscribeStatus: (error && error.message) || "微信身份绑定失败" });
        });
      },
      fail: function (error) {
        self.setData({ subscribing: false, subscribeStatus: (error && error.errMsg) || "微信登录失败" });
      }
    });
  },

  onTapItem: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var idx = e.currentTarget.dataset.index;
    if (!this.data.items[idx] || !this.data.items[idx].unread) return;
    api.readNotification(id).then(function () {
      var key = "items[" + idx + "].unread";
      var patch = {};
      patch[key] = false;
      var unread = Math.max(0, self.data.unreadCount - 1);
      patch.unreadCount = unread;
      self.setData(patch);
    });
  },

  onReadAll: function () {
    var self = this;
    if (!this.data.unreadCount) return;
    wx.showModal({
      title: "全部标记已读",
      content: "确定将所有通知标记为已读吗？",
      success: function (r) {
        if (!r.confirm) return;
        api.readAllNotifications().then(function () {
          var items = self.data.items.map(function (i) {
            return Object.assign({}, i, { unread: false });
          });
          self.setData({ items: items, unreadCount: 0 });
          wx.showToast({ title: "已全部标记", icon: "success" });
        });
      }
    });
  },

  onHideItem: function (e) {
    var id = String(e.currentTarget.dataset.id);
    var hidden = state.getNotificationHidden();
    hidden[id] = true;
    state.setNotificationHidden(hidden);
    this.setData({ items: this.data.items.filter(function (item) { return String(item.id) !== id; }) });
  }
});
