var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

/** {陪伴人: 人数} → [{label, count}] */
function objToList(obj) {
  if (!obj) return [];
  return Object.keys(obj).map(function (k) {
    return { label: k, count: obj[k] };
  }).sort(function (a, b) { return b.count - a.count; });
}

Page({
  data: {
    loading: true,
    stats: null,
    task: null,
    personalTasks: [],
    insights: [],
    unsubmitted: [],
    caregiverDist: [],
    interestDist: [],
    engagementSummary: null,
    engagementRows: [],
    reminderTemplate: "",
    reminding: false,
    error: ""
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    this.loadData();
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadData(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadData: function (done) {
    var self = this;
    this.setData({ loading: true, error: "" });
    api
      .getAiOverview()
      .then(function (res) {
        if (!res) return;
        var task = res.task;
        self.setData({
          loading: false,
          stats: res.stats || null,
          task: task
            ? {
                id: task.id,
                title: task.title || "",
                task_type: task.task_type || "",
                duration: task.duration || "",
                goal: task.goal || ""
              }
            : null,
          personalTasks: res.personalTasks || [],
          insights: res.insights || [],
          unsubmitted: (res.unsubmittedStudents || []).map(function (student) {
            return { id: student.id, name: student.name || "学生", grade: student.grade || "" };
          }),
          caregiverDist: objToList(res.caregiverDistribution),
          interestDist: objToList(res.interestDistribution),
          engagementSummary: res.engagementSummary || null,
          engagementRows: (res.engagementRows || []).map(function (r) {
            var eng = r.engagement || {};
            return {
              childId: r.childId,
              childName: r.childName || "",
              caregiver: r.caregiver || "",
              enabled: !!r.enabled,
              score: eng.score || 0,
              level: eng.level || "",
              color: util.engagementColor(eng.status)
            };
          })
        });
        if (done) done();
      })
      .catch(function (error) {
        self.setData({ loading: false, error: (error && error.message) || "班级概览加载失败" });
        if (done) done();
      });
  },

  goPublish: function () {
    wx.navigateTo({ url: "/pages/teacher/publish/publish" });
  },

  onRetry: function () { this.loadData(); },

  generateReminder: function () {
    var count = this.data.unsubmitted.length;
    if (!count) return wx.showToast({ title: "当前没有未提交学生", icon: "none" });
    var taskName = this.data.task ? this.data.task.title : "本周家校共育任务";
    this.setData({ reminderTemplate: "家长您好，「" + taskName + "」尚未正式提交。请在方便时陪孩子完成；如果时间紧张，可先完成核心步骤并保存草稿。感谢配合。" });
  },

  onReminderInput: function (e) { this.setData({ reminderTemplate: e.detail.value }); },

  copyReminder: function () {
    var text = (this.data.reminderTemplate || "").trim();
    if (!text) return wx.showToast({ title: "请先生成提醒模板", icon: "none" });
    wx.setClipboardData({ data: text, success: function () { wx.showToast({ title: "提醒模板已复制", icon: "success" }); } });
  },

  sendReminder: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var name = e.currentTarget.dataset.name || "该学生";
    if (!id) return;
    this.dispatchReminder([id], "提醒 " + name + " 的家长");
  },

  sendAllReminders: function () {
    var ids = this.data.unsubmitted.map(function (student) { return student.id; });
    if (!ids.length) return wx.showToast({ title: "当前没有未提交学生", icon: "none" });
    this.dispatchReminder(ids, "批量提醒 " + ids.length + " 位学生的家长");
  },

  dispatchReminder: function (childIds, actionName) {
    var self = this;
    var text = (this.data.reminderTemplate || "").trim();
    if (!text) {
      this.generateReminder();
      text = (this.data.reminderTemplate || "").trim();
    }
    if (!text || this.data.reminding) return;
    wx.showModal({
      title: actionName,
      content: "提醒会写入对应家长的通知中心；微信订阅消息仅在服务端已配置且家长已授权时发送。",
      success: function (result) {
        if (!result.confirm) return;
        self.setData({ reminding: true });
        api.sendTargetedNotification({
          childIds: childIds,
          taskId: self.data.task && self.data.task.id,
          title: "本周任务提醒",
          content: text
        }).then(function (res) {
          self.setData({ reminding: false });
          var delivery = (res && res.delivery) || {};
          var detail = "已写入 " + Number(delivery.inApp || 0) + " 位家长的通知中心。";
          detail += delivery.wechatConfigured ? " 微信订阅消息成功 " + Number(delivery.wechatSent || 0) + " 条。" : " 微信订阅消息尚未配置。";
          if (delivery.wechatErrors && delivery.wechatErrors.length) detail += " 另有 " + delivery.wechatErrors.length + " 条因未授权或接口错误未送达。";
          wx.showModal({ title: "提醒已处理", content: detail, showCancel: false });
        }).catch(function () { self.setData({ reminding: false }); });
      }
    });
  }
});
