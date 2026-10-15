var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;

Page({
  data: {
    childId: null,
    loading: true,
    student: null,
    suggestions: [],
    aiMeta: null,
    history: null,
    regenVisible: false,
    regenDraft: "",
    regenNote: "",
    regenerating: false
  },

  onLoad: function (options) {
    this.setData({ childId: Number(options.childId) || null });
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    this.loadData();
  },

  applyPayload: function (res, regenNote) {
    if (!res) return;
    var s = res.student || {};
    this.setData({
      loading: false,
      student: {
        id: s.id,
        name: s.name || "",
        grade: s.grade || "",
        gender: s.gender || "",
        age: s.age || "",
        caregiver: s.caregiver || "",
        interests: s.interests ? String(s.interests).split(",").filter(function (x) { return !!x; }) : [],
        familyNote: s.familyNote || "",
        timeAvailable: s.timeAvailable || "",
        taskPreference: s.taskPreference || ""
      },
      suggestions: (res.suggestions || []).map(function (sg) {
        return {
          title: sg.title || "",
          type: sg.type || "",
          duration: sg.duration || 20,
          goal: sg.goal || "",
          steps: sg.steps || "",
          dialogueTips: sg.dialogueTips || "",
          submitHint: sg.submitHint || "",
          rationale: sg.rationale || "",
          source: sg.source || "template",
          aiGenerated: !!sg.aiGenerated,
          aiStatus: sg.aiStatus || ""
        };
      }),
      aiMeta: res.aiMeta || null,
      regenNote: regenNote || "",
      history: res.history || null
    });
  },

  loadData: function () {
    var self = this;
    if (!this.data.childId) return;
    this.setData({ loading: true, regenNote: "" });
    api
      .getStudentSuggestions(this.data.childId)
      .then(function (res) {
        self.applyPayload(res, "");
      })
      .catch(function () {
        self.setData({ loading: false });
      });
  },

  /* ---- 重新生成：教师口述学生情况 → AI 整理 → 重出任务 ---- */
  openRegenModal: function () {
    if (this.data.regenerating) return;
    this.setData({ regenVisible: true, regenDraft: this.data.regenNote || "" });
  },

  closeRegenModal: function () {
    if (this.data.regenerating) return;
    this.setData({ regenVisible: false });
  },

  onRegenInput: function (e) {
    this.setData({ regenDraft: e.detail.value });
  },

  confirmRegen: function () {
    var self = this;
    var note = String(this.data.regenDraft || "").trim();
    if (!note) {
      wx.showToast({ title: "请先描述学生情况", icon: "none" });
      return;
    }
    if (this.data.regenerating || !this.data.childId) return;

    this.setData({ regenerating: true });
    api
      .regenerateStudentSuggestions(this.data.childId, note)
      .then(function (res) {
        self.applyPayload(res, note);
        self.setData({ regenVisible: false });
        var generated = (res && res.suggestions || [])[0];
        wx.showToast({
          title: generated && generated.aiGenerated ? "已按描述重新生成" : "已生成（AI 暂不可用）",
          icon: "none"
        });
      })
      .catch(function () {
        // 请求层已展示具体错误，这里只负责恢复按钮状态。
      })
      .then(function () {
        self.setData({ regenerating: false });
      });
  },

  noop: function () {},

  useSuggestion: function (e) {
    var idx = Number(e.currentTarget.dataset.index);
    var sg = this.data.suggestions[idx];
    if (!sg) return;
    app.globalData.publishDraft = {
      title: sg.title,
      goal: sg.goal,
      steps: sg.steps,
      dialogueTips: sg.dialogueTips,
      submitHint: sg.submitHint,
      duration: sg.duration,
      type: sg.type,
      childId: this.data.childId
    };
    wx.navigateTo({ url: "/pages/teacher/publish/publish" });
  }
});
