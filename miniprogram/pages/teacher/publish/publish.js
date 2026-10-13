var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;

var TYPES = ["阅读", "习惯养成", "学科应用", "情绪社交", "家务实践", "运动健身", "观察探究"];
var DIFFICULTIES = ["简单", "普通", "进阶"];
var DURATIONS = [10, 20, 30, 45, 60];

Page({
  data: {
    types: TYPES,
    difficulties: DIFFICULTIES,
    durations: DURATIONS,

    students: [],
    studentNames: [],
    studentIndex: 0, // 0 = 全班

    childId: null,
    title: "",
    goal: "",
    steps: "",
    dialogueTips: "",
    submitHint: "",
    duration: 20,
    type: "阅读",
    difficulty: "普通",
    materials: "",
    fallbackPlan: "",

    submitting: false,
    generating: false,
    fromSuggestion: false
  },

  onLoad: function () {
    // 从「任务建议」页带入的草稿
    var draft = app.globalData.publishDraft || null;
    if (draft) {
      app.globalData.publishDraft = null;
      this.setData({
        title: draft.title || "",
        goal: draft.goal || "",
        steps: draft.steps || "",
        dialogueTips: draft.dialogueTips || "",
        submitHint: draft.submitHint || "",
        duration: draft.duration || 20,
        type: draft.type || "阅读",
        childId: draft.childId || null,
        fromSuggestion: true
      });
    }
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    this.loadStudents();
  },

  loadStudents: function () {
    var self = this;
    api
      .getTeacherStudents()
      .then(function (res) {
        var list = (res && res.students) || [];
        var names = ["全班学生"].concat(
          list.map(function (s) {
            return s.name + (s.grade ? " · " + s.grade : "");
          })
        );
        // 若带入了 childId，定位到对应选项
        var idx = 0;
        if (self.data.childId) {
          for (var i = 0; i < list.length; i++) {
            if (list[i].id === self.data.childId) {
              idx = i + 1;
              break;
            }
          }
        }
        self.setData({ students: list, studentNames: names, studentIndex: idx });
      })
      .catch(function () {});
  },

  onPickStudent: function (e) {
    var idx = Number(e.detail.value);
    var childId = idx === 0 ? null : this.data.students[idx - 1].id;
    this.setData({ studentIndex: idx, childId: childId });
  },

  pickType: function (e) {
    this.setData({ type: e.currentTarget.dataset.value });
  },
  pickDifficulty: function (e) {
    this.setData({ difficulty: e.currentTarget.dataset.value });
  },
  pickDuration: function (e) {
    this.setData({ duration: Number(e.currentTarget.dataset.value) });
  },
  onInput: function (e) {
    var patch = {};
    patch[e.currentTarget.dataset.key] = e.detail.value;
    this.setData(patch);
  },

  onGenerateTask: function () {
    var self = this;
    var childId = this.data.childId;
    if (this.data.generating) return;
    if (!childId) {
      wx.showToast({ title: "请先选择具体学生", icon: "none" });
      return;
    }

    this.setData({ generating: true });
    api.generatePersonalTask(childId).then(function (res) {
      var suggestions = (res && res.suggestions) || [];
      var generated = suggestions.filter(function (item) { return item && item.aiGenerated; })[0] || suggestions[1] || suggestions[0];
      if (!generated) {
        wx.showToast({ title: "暂时没有生成结果，请稍后重试", icon: "none" });
        return;
      }
      self.setData({
        title: generated.title || "",
        goal: generated.goal || "",
        steps: generated.steps || "",
        dialogueTips: generated.dialogueTips || "",
        submitHint: generated.submitHint || "",
        duration: Number(generated.duration) || self.data.duration,
        type: generated.type || self.data.type
      });
      wx.showToast({ title: generated.aiGenerated ? "AI 任务已生成" : "个性任务已生成", icon: "success" });
    }).catch(function () {
      // 请求层已展示具体错误，这里只负责恢复按钮状态。
    }).then(function () {
      self.setData({ generating: false });
    });
  },

  onSubmit: function () {
    var self = this;
    var d = this.data;
    if (!d.title.trim()) {
      wx.showToast({ title: "请填写任务标题", icon: "none" });
      return;
    }

    var isPersonal = !!d.childId;
    var tip = isPersonal
      ? "将为学生「" + (d.students[d.studentIndex - 1] || {}).name + "」发布个性化任务"
      : "将发布/更新本周全班任务（同一周重复发布会覆盖原任务）";

    wx.showModal({
      title: "确认发布",
      content: tip,
      success: function (r) {
        if (!r.confirm) return;
        self.setData({ submitting: true });
        api
          .publishTask({
            title: d.title.trim(),
            childId: d.childId || undefined,
            goal: d.goal,
            steps: d.steps,
            dialogueTips: d.dialogueTips,
            submitHint: d.submitHint,
            duration: d.duration,
            type: d.type,
            difficulty: d.difficulty,
            materials: d.materials,
            fallbackPlan: d.fallbackPlan
          })
          .then(function () {
            self.setData({ submitting: false });
            wx.showToast({ title: "发布成功", icon: "success" });
            setTimeout(function () {
              wx.navigateBack({
                fail: function () {
                  wx.redirectTo({ url: "/pages/teacher/workbench/workbench" });
                }
              });
            }, 800);
          })
          .catch(function () {
            self.setData({ submitting: false });
          });
      }
    });
  }
});
