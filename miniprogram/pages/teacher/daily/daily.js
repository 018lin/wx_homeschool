var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    error: "",
    transcript: "",
    charCount: 0,
    recording: false,
    recordSeconds: 0,
    transcribing: false,
    uploadProgress: 0,
    publishing: false,
    voiceBackendState: "checking",
    statusTone: "idle",
    statusText: "正在检查语音服务…",
    lastPublished: null,
    recent: []
  },

  onLoad: function () {
    this.setupRecorder();
  },

  onShow: function () {
    if (!app.isLogin()) return;
    this.loadRecent();
    this.checkVoiceBackend();
  },

  onHide: function () {
    this.stopRecordingIfNeeded();
  },

  onUnload: function () {
    this.stopRecordingIfNeeded();
  },

  onPullDownRefresh: function () {
    this.loadRecent(function () { wx.stopPullDownRefresh(); });
  },

  loadRecent: function (done) {
    var self = this;
    this.setData({ loading: true, error: "" });
    api.getDailyUpdates(5).then(function (res) {
      self.setData({
        loading: false,
        recent: ((res && res.updates) || []).map(function (item) {
          return {
            id: item.id,
            studentName: item.student_name || "全班",
            summary: item.summary || "",
            timeText: util.fromNow(item.created_at),
            recipientCount: Number(item.recipient_count || 0),
            aiStatus: item.ai_status === "ai" ? "AI 已整理" : "本地已整理"
          };
        })
      });
      if (done) done();
    }).catch(function (error) {
      self.setData({ loading: false, error: (error && error.message) || "校园观察记录加载失败" });
      if (done) done();
    });
  },

  onRetry: function () {
    this.loadRecent();
  },

  checkVoiceBackend: function () {
    var self = this;
    this.setData({ voiceBackendState: "checking", statusTone: "processing", statusText: "正在检查语音服务…" });
    api.getUploadStatus().then(function (res) {
      if (res && res.configured) {
        self.setData({ voiceBackendState: "ready", statusTone: "idle", statusText: "点击开始说，也可以直接输入文字" });
        return;
      }
      self.setData({
        voiceBackendState: "unconfigured",
        statusTone: "error",
        statusText: "语音上传暂不可用：服务端尚未配置对象存储，可直接输入文字发布"
      });
    }).catch(function (error) {
      var isOutdated = error && (error.status === 404 || String(error.message || "").indexOf("接口不存在") >= 0);
      self.setData({
        voiceBackendState: isOutdated ? "outdated" : "unknown",
        statusTone: isOutdated ? "error" : "idle",
        statusText: isOutdated
          ? "线上后端版本未更新，语音接口尚未部署；当前可直接输入文字发布"
          : "暂时无法检查语音服务，可重试录音或直接输入文字"
      });
    });
  },

  onTranscriptInput: function (e) {
    var value = e.detail.value || "";
    this.setData({ transcript: value, charCount: value.length });
  },

  setupRecorder: function () {
    var self = this;
    if (!wx.getRecorderManager) {
      this.setData({ statusTone: "error", statusText: "当前微信基础库不支持录音，请直接输入文字" });
      return;
    }
    this.__recorder = wx.getRecorderManager();
    this.__recorder.onStart(function () {
      self.setData({ recording: true, statusTone: "recording", statusText: "正在录音，说完后点击停止" });
      self.startRecordTimer();
    });
    this.__recorder.onStop(function (result) {
      self.stopRecordTimer();
      self.setData({ recording: false });
      if (!result || !result.tempFilePath) {
        self.setData({ statusTone: "error", statusText: "录音文件生成失败，请直接输入文字" });
        return;
      }
      self.uploadAndTranscribe(result.tempFilePath);
    });
    this.__recorder.onError(function (error) {
      self.stopRecordTimer();
      self.setData({
        recording: false,
        transcribing: false,
        statusTone: "error",
        statusText: (error && error.errMsg) || "录音失败，请检查麦克风权限"
      });
    });
  },

  startRecording: function () {
    var self = this;
    if (!this.__recorder || this.data.transcribing || this.data.publishing) return;
    if (this.data.voiceBackendState === "checking") {
      wx.showToast({ title: "正在检查语音服务，请稍候", icon: "none" });
      return;
    }
    if (this.data.voiceBackendState === "outdated") {
      wx.showModal({
        title: "线上后端尚未更新",
        content: "当前 Render 服务缺少附件上传和语音转写接口。请先部署最新版 server.js；暂时可以直接输入文字并发布。",
        showCancel: false
      });
      return;
    }
    if (this.data.voiceBackendState === "unconfigured") {
      wx.showModal({
        title: "语音上传尚未配置",
        content: "服务端需要配置对象存储后才能上传录音；暂时可以直接输入文字并发布。",
        showCancel: false
      });
      return;
    }
    wx.getSetting({
      success: function (setting) {
        function start() {
          self.setData({ recordSeconds: 0, statusTone: "recording", statusText: "正在启动麦克风…" });
          self.__recorder.start({
            duration: 60000,
            format: "mp3",
            sampleRate: 16000,
            numberOfChannels: 1,
            encodeBitRate: 48000
          });
        }
        if (setting.authSetting["scope.record"] === false) {
          wx.showModal({
            title: "需要麦克风权限",
            content: "请在小程序设置中开启麦克风权限；也可以直接输入文字记录。",
            confirmText: "去设置",
            success: function (result) {
              if (!result.confirm) return;
              wx.openSetting({
                success: function (opened) {
                  if (opened.authSetting["scope.record"]) start();
                  else self.setData({ statusTone: "error", statusText: "麦克风权限未开启，请直接输入文字" });
                }
              });
            }
          });
        } else if (setting.authSetting["scope.record"] === true) {
          start();
        } else {
          wx.authorize({
            scope: "scope.record",
            success: start,
            fail: function () {
              self.setData({ statusTone: "error", statusText: "未获得麦克风权限，请直接输入文字" });
            }
          });
        }
      },
      fail: function () {
        self.setData({ statusTone: "error", statusText: "无法检查麦克风权限，请直接输入文字" });
      }
    });
  },

  stopRecording: function () {
    if (this.__recorder && this.data.recording) {
      this.setData({ statusText: "录音结束，正在生成文件…" });
      this.__recorder.stop();
    }
  },

  stopRecordingIfNeeded: function () {
    if (this.__recorder && this.data.recording) this.__recorder.stop();
    this.stopRecordTimer();
  },

  startRecordTimer: function () {
    var self = this;
    this.stopRecordTimer();
    this.__recordTimer = setInterval(function () {
      self.setData({ recordSeconds: self.data.recordSeconds + 1 });
    }, 1000);
  },

  stopRecordTimer: function () {
    if (this.__recordTimer) clearInterval(this.__recordTimer);
    this.__recordTimer = null;
  },

  uploadAndTranscribe: function (filePath) {
    var self = this;
    this.setData({ transcribing: true, uploadProgress: 0, statusTone: "processing", statusText: "正在上传录音…" });
    api.uploadAttachment(filePath, {
      name: "teacher-observation-" + Date.now() + ".mp3",
      purpose: "transcription",
      onProgress: function (progress) {
        self.setData({ uploadProgress: progress, statusText: "正在上传录音 " + progress + "%" });
      }
    }).then(function (attachment) {
      self.setData({ statusText: "录音已上传，正在转成文字…" });
      return api.transcribeAudio(attachment);
    }).then(function (result) {
      var oldText = (self.data.transcript || "").trim();
      var transcript = oldText ? oldText + "\n" + result.text : result.text;
      self.setData({
        transcript: transcript,
        charCount: transcript.length,
        transcribing: false,
        statusTone: "success",
        statusText: "转写完成，可修改文字后整理发布"
      });
    }).catch(function (error) {
      var isMissingApi = error && (error.status === 404 || String(error.message || "").indexOf("接口不存在") >= 0 || String(error.message || "").indexOf("尚未部署") >= 0);
      self.setData({
        transcribing: false,
        statusTone: "error",
        voiceBackendState: isMissingApi ? "outdated" : self.data.voiceBackendState,
        statusText: isMissingApi ? "线上后端版本未更新，语音接口尚未部署" : ((error && error.message) || "录音转写失败，请直接输入文字")
      });
      wx.showModal({
        title: isMissingApi ? "线上后端尚未更新" : "语音转写未完成",
        content: isMissingApi
          ? "请部署包含 /api/uploads 和 /api/teacher/transcribe 的最新版后端。当前可直接输入文字发布。"
          : ((error && error.message) || "请直接输入文字作为降级方案"),
        showCancel: false
      });
    });
  },

  onPublish: function () {
    var self = this;
    var transcript = (this.data.transcript || "").trim();
    if (!transcript) {
      wx.showToast({ title: "请先录音或输入校园观察", icon: "none" });
      return;
    }
    if (this.data.recording || this.data.transcribing || this.data.publishing) return;
    this.setData({ publishing: true, statusTone: "processing", statusText: "AI 正在整理并匹配家长…" });
    api.createDailyUpdate(transcript).then(function (res) {
      var update = (res && res.update) || {};
      var recipientCount = Number(res && res.recipientCount || 0);
      self.setData({
        publishing: false,
        transcript: "",
        charCount: 0,
        statusTone: "success",
        statusText: recipientCount ? "已整理，并写入 " + recipientCount + " 位家长的通知中心" : "已保存观察记录，暂未匹配到可通知的家长",
        lastPublished: {
          studentName: update.student_name || "全班",
          summary: update.summary || transcript,
          recipientCount: recipientCount
        }
      });
      self.loadRecent();
    }).catch(function (error) {
      self.setData({
        publishing: false,
        statusTone: "error",
        statusText: (error && error.message) || "整理发布失败，请稍后重试"
      });
    });
  }
});
