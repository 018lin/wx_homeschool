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
    history: null
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

  loadData: function () {
    var self = this;
    if (!this.data.childId) return;
    this.setData({ loading: true });
    api
      .getStudentSuggestions(this.data.childId)
      .then(function (res) {
        if (!res) return;
        var s = res.student || {};
        self.setData({
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
          history: res.history || null
        });
      })
      .catch(function () {
        self.setData({ loading: false });
      });
  },

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
