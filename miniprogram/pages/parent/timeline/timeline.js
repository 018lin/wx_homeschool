var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    childId: null,
    childName: "",
    items: [],
    count: 0,
    playingUrl: "",
    error: ""
  },

  onLoad: function (options) {
    this.setData({
      childId: Number(options.childId) || app.getChildId()
    });
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
    var childId = this.data.childId;
    if (!childId) {
      this.setData({ loading: false });
      if (done) done();
      return;
    }
    this.setData({ loading: true, error: "" });

    api
      .getTimeline(childId)
      .then(function (res) {
        var raw = (res && res.items) || [];
        var items = raw.map(function (it) {
          var isObs = it.timeline_type === "teacher_observation";
          var attachments = util.parseAttachments(it.attachments).filter(function (a) { return a && a.url; }).map(function (a, index) {
            var type = String(a.type || "").toLowerCase();
            if (!type && /^data:([^;,]+)/i.test(a.url || "")) type = String(a.url).match(/^data:([^;,]+)/i)[1].toLowerCase();
            var kind = type.indexOf("image/") === 0 ? "image" : type.indexOf("audio/") === 0 ? "audio" : type.indexOf("video/") === 0 ? "video" : "file";
            return { id: index + "-" + String(a.url).slice(-16), url: a.url, type: type, kind: kind, name: a.name || "附件" };
          });
          var images = attachments.filter(function (a) { return a.kind === "image"; });
          return {
            id: it.timeline_type + "-" + it.id + (it.feedback_id ? "-" + it.feedback_id : ""),
            isObservation: isObs,
            kindLabel: isObs ? "教师观察" : util.subTypeLabel(it.sub_type),
            title: it.title || (isObs ? "校园观察" : "成长记录"),
            taskType: it.task_type || "",
            content: it.content || "",
            timeText: util.fromNow(it.created_at),
            dateText: util.formatDate(it.created_at),
            teacherName: it.teacher_name || "",
            images: images,
            attachments: attachments,
            imageUrls: images.map(function (a) { return a.url; }),
            feedbackComment: it.feedback_comment || "",
            feedbackTags: util.parseTags(it.feedback_tags),
            analysis: it.observation_analysis || "",
            message: it.observation_message || ""
          };
        });
        self.setData({ loading: false, items: items, count: items.length });
        if (done) done();
      })
      .catch(function (error) {
        self.setData({ loading: false, error: (error && error.message) || "成长记录加载失败" });
        if (done) done();
      });
  },

  previewImage: function (e) {
    var url = e.currentTarget.dataset.url;
    var urls = e.currentTarget.dataset.urls || [url];
    wx.previewImage({ urls: urls, current: url });
  },

  playAudio: function (e) {
    var url = e.currentTarget.dataset.url;
    if (this.__audio && this.data.playingUrl === url) {
      this.__audio.stop();
      this.setData({ playingUrl: "" });
      return;
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
