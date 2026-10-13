var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    id: null,
    loading: true,
    submission: null,
    task: null,
    feedbacks: [],
    images: [],
    attachments: [],
    playingUrl: "",
    error: "",

    comment: "",
    tags: "",
    saving: false,
    generating: false
  },

  onLoad: function (options) {
    this.setData({ id: Number(options.id) || null });
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
    if (!this.data.id) return;
    this.setData({ loading: true, error: "" });
    api
      .getSubmissionDetail(this.data.id)
      .then(function (res) {
        if (!res) return;
        var s = res.submission || {};
        var t = res.task || {};
        var attachments = util.parseAttachments(s.attachments).filter(function (a) { return a && a.url; }).map(function (a, index) {
          var type = String(a.type || "").toLowerCase();
          if (!type && /^data:([^;,]+)/i.test(a.url || "")) type = String(a.url).match(/^data:([^;,]+)/i)[1].toLowerCase();
          var kind = type.indexOf("image/") === 0 ? "image" : type.indexOf("audio/") === 0 ? "audio" : type.indexOf("video/") === 0 ? "video" : "file";
          return { id: index + "-" + String(a.url).slice(-16), url: a.url, type: type, kind: kind, name: a.name || "附件" };
        });
        var images = attachments.filter(function (a) { return a.kind === "image"; }).map(function (a) { return a.url; });

        self.setData({
          loading: false,
          submission: {
            id: s.id,
            childId: s.childId,
            childName: s.childName || "学生",
            grade: s.grade || "",
            content: s.content || "",
            subType: util.subTypeLabel(s.subType),
            createdAt: util.formatDateTime(s.createdAt)
          },
          task: {
            title: t.title || "",
            type: t.type || "",
            weekStart: t.weekStart || "",
            duration: t.duration || "",
            goal: t.goal || "",
            steps: t.steps || "",
            submitHint: t.submitHint || ""
          },
          images: images,
          attachments: attachments,
          feedbacks: (res.feedbacks || []).map(function (f) {
            return {
              id: f.id,
              comment: f.comment || "",
              tags: util.parseTags(f.tags),
              teacherName: f.teacher_name || "老师",
              timeText: util.formatDateTime(f.created_at)
            };
          })
        });
      })
      .catch(function (error) {
        self.setData({ loading: false, error: (error && error.message) || "提交详情加载失败" });
      });
  },

  onInput: function (e) {
    var patch = {};
    patch[e.currentTarget.dataset.key] = e.detail.value;
    this.setData(patch);
  },

  onAiFeedback: function () {
    var self = this;
    this.setData({ generating: true });
    api
      .generateAiFeedback(this.data.id)
      .then(function (res) {
        self.setData({ generating: false });
        if (!res || !res.feedback) return;
        var fb = res.feedback;
        self.setData({ comment: fb.comment || "", tags: fb.tags || "" });
        if (fb.warning) {
          wx.showToast({ title: fb.warning, icon: "none", duration: 2500 });
        } else {
          wx.showToast({ title: "已生成草稿，可修改后保存", icon: "none" });
        }
      })
      .catch(function () {
        self.setData({ generating: false });
      });
  },

  onSaveFeedback: function () {
    var self = this;
    var comment = (this.data.comment || "").trim();
    if (!comment) {
      wx.showToast({ title: "请填写点评内容", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    api
      .saveFeedback(this.data.id, comment, this.data.tags)
      .then(function () {
        self.setData({ saving: false });
        wx.showToast({ title: "点评已发送", icon: "success" });
        self.loadData();
      })
      .catch(function () {
        self.setData({ saving: false });
      });
  },

  previewImage: function (e) {
    wx.previewImage({ urls: this.data.images, current: e.currentTarget.dataset.url });
  },

  playAudio: function (e) {
    var url = e.currentTarget.dataset.url;
    if (this.__audio && this.data.playingUrl === url) {
      this.__audio.stop(); this.setData({ playingUrl: "" }); return;
    }
    if (this.__audio) this.__audio.destroy();
    var self = this;
    this.__audio = wx.createInnerAudioContext();
    this.__audio.src = url;
    this.__audio.onEnded(function () { self.setData({ playingUrl: "" }); });
    this.__audio.onError(function () { self.setData({ playingUrl: "" }); wx.showToast({ title: "音频播放失败", icon: "none" }); });
    this.__audio.play();
    this.setData({ playingUrl: url });
  },

  onUnload: function () {
    if (this.__audio) this.__audio.destroy();
  },

  onRetry: function () {
    this.loadData();
  }
});
