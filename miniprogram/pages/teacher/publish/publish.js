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
        // 后端（Postgres/SQLite）返回的 id 可能是字符串，而 childId 来自
        // Number(options.childId) 是数字；不归一化会让下面的严格比较定位失败，
        // picker 仍显示「全班学生」，点一键生成时却带着 draft 的 childId 去请求。
        var list = ((res && res.students) || []).map(function (s) {
          return Object.assign({}, s, { id: Number(s.id) });
        });
        var names = ["全班学生"].concat(
          list.map(function (s) {
            return s.name + (s.grade ? " · " + s.grade : "");
          })
        );
        // 若带入了 childId，定位到对应选项
        var idx = 0;
        var wantId = Number(self.data.childId) || 0;
        if (wantId) {
          for (var i = 0; i < list.length; i++) {
            if (list[i].id === wantId) {
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
    this.setData({ studentIndex: idx, childId: childId || null });
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
    var childId = Number(this.data.childId) || 0;
    if (this.data.generating) return;
    if (!childId) {
      // 一键生成只能针对具体学生（AI 需要单个学生档案）。这里明确告知，
      // 避免教师以为「按钮坏了 / AI 不可用」。
      wx.showToast({ title: "请先在上方选择具体学生", icon: "none", duration: 2000 });
      return;
    }
    if (!this.data.students.length) {
      wx.showToast({ title: "暂无可选学生，请先在班级中绑定学生", icon: "none", duration: 2500 });
      return;
    }

    this.setData({ generating: true });
    api.generatePersonalTask(childId).then(function (res) {
      var suggestions = (res && res.suggestions) || [];
      var generated = suggestions.filter(function (item) { return item && item.aiGenerated; })[0] || suggestions[0];
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
      // 区分「真AI 生成」与「AI 不可用时的本地兜底」，避免教师误以为用上了 AI。
      wx.showToast({
        title: generated.aiGenerated ? "AI 任务已生成" : "AI 暂不可用，已用本地规则生成",
        icon: "none",
        duration: 2500
      });
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

    var isPersonal = !!Number(d.childId);
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
