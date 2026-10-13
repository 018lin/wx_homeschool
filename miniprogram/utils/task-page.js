var app = getApp();
var request = require("./api.js");
var api = request.api;
var util = require("./util.js");
var state = require("./state.js");

var MAX_ATTACHMENTS = 6;
var MAX_FILE_SIZE = 15 * 1024 * 1024;
var CHECK_OPTIONS = ["完成全部步骤", "孩子主动参与", "有交流互动", "孩子提出想法"];

function attachmentKind(type) {
  type = String(type || "").toLowerCase();
  if (type.indexOf("image/") === 0) return "image";
  if (type.indexOf("audio/") === 0) return "audio";
  if (type.indexOf("video/") === 0) return "video";
  return "file";
}

function inferMime(filePath, kind) {
  var ext = String(filePath || "").split("?")[0].split(".").pop().toLowerCase();
  var types = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm"
  };
  return types[ext] || (kind === "image" ? "image/jpeg" : kind === "audio" ? "audio/mpeg" : "video/mp4");
}

function normalizeAttachment(item, index) {
  var type = String(item && item.type || "");
  if (!type && item && /^data:([^;,]+)/i.test(item.url || "")) type = String(item.url).match(/^data:([^;,]+)/i)[1];
  return {
    id: String(index) + "-" + String(item && item.url || "").slice(-24),
    url: item && item.url || "",
    type: type,
    kind: attachmentKind(type),
    name: item && item.name || "附件" + (index + 1),
    size: Number(item && item.size || 0),
    sizeText: item && item.size ? Math.max(1, Math.round(Number(item.size) / 1024)) + " KB" : "历史附件"
  };
}

function createTaskPage(mode) {
  var isStudentPage = mode === "student";
  return {
    data: {
      loading: true,
      error: "",
      taskId: null,
      childId: null,
      childName: "",
      task: null,
      statusText: "",
      statusColor: "",
      statusBg: "",
      locked: false,
      content: "",
      subType: "text",
      checkOptions: CHECK_OPTIONS,
      checks: [],
      attachments: [],
      uploading: false,
      uploadProgress: 0,
      recording: false,
      recordSeconds: 0,
      playingUrl: "",
      submitting: false,
      feedback: null,
      fitChoice: "",
      showFit: !isStudentPage
    },

    onLoad: function (options) {
      this.setData({ taskId: Number(options.taskId) || null, childId: Number(options.childId) || app.getChildId() });
      this.__formInteracted = false;
      this.__submittedThisSession = false;
      this.__savedThisSession = false;
      this.__submitEnteredTracked = false;
      this.setupRecorder();
    },

    onShow: function () {
      if (!app.isLogin()) return;
      this.loadData();
    },

    onHide: function () { this.stopRecorderIfNeeded(); },

    onUnload: function () {
      this.stopRecorderIfNeeded();
      if (!this.data.locked && this.__formInteracted && !this.__savedThisSession && !this.__submittedThisSession) {
        api.track("submit_abandoned", {
          childId: this.data.childId,
          taskId: this.data.taskId,
          meta: { subType: this.data.subType, hasAttachments: !!this.data.attachments.length }
        });
      }
      if (this.__audio) this.__audio.destroy();
    },

    loadData: function () {
      var self = this;
      var pending = isStudentPage ? api.getStudentHome() : api.getHome(this.data.childId);
      this.setData({ loading: true, error: "" });
      pending.then(function (res) {
        if (!res || !res.task) {
          self.setData({ loading: false, task: null });
          return;
        }
        var task = res.task;
        var meta = util.taskStatusMeta(res.taskStatus);
        var locked = res.taskStatus === "submitted" || res.taskStatus === "done";
        var childId = (res.child && res.child.id) || self.data.childId;
        var attachments = [];
        var checks = [];
        var content = "";
        if (res.submission) {
          attachments = util.parseAttachments(res.submission.attachments).map(normalizeAttachment);
          content = res.submission.content || "";
          if (res.submission.sub_type === "check") {
            checks = CHECK_OPTIONS.filter(function (option) { return content.indexOf(option) >= 0; });
          }
        }
        self.setData({
          loading: false,
          task: {
            id: task.id,
            title: task.title,
            task_type: task.task_type || "",
            difficulty: task.difficulty || "",
            duration: task.duration || "",
            goal: task.goal || "",
            steps: task.steps || "",
            dialogueTips: task.dialogue_tips || "",
            submitHint: task.submit_hint || "",
            materials: task.materials || "",
            fallbackPlan: task.fallback_plan || ""
          },
          childName: (res.child && res.child.name) || "",
          statusText: meta.text,
          statusColor: meta.color,
          statusBg: meta.bg,
          locked: locked,
          taskId: task.id,
          childId: childId,
          content: content,
          subType: (res.submission && res.submission.sub_type) || "text",
          checks: checks,
          attachments: attachments,
          fitChoice: !isStudentPage ? state.getTaskFit(childId, task.id) : ""
        });
        if (res.feedback) {
          self.setData({ feedback: {
            comment: res.feedback.comment || "",
            teacherName: res.feedback.teacher_name || "老师",
            timeText: util.fromNow(res.feedback.created_at),
            tags: util.parseTags(res.feedback.tags)
          } });
        }
        if (!self.__submitEnteredTracked && !locked) {
          self.__submitEnteredTracked = true;
          api.track("submit_page_entered", { childId: childId, taskId: task.id });
        }
      }).catch(function (error) {
        self.setData({ loading: false, error: (error && error.message) || "任务加载失败" });
      });
    },

    onRetry: function () { this.loadData(); },
    onContentInput: function (e) { this.__formInteracted = true; this.__savedThisSession = false; this.setData({ content: e.detail.value }); },
    setSubType: function (e) {
      if (this.data.locked || this.data.uploading || this.data.recording) return;
      this.__formInteracted = true;
      this.__savedThisSession = false;
      this.setData({ subType: e.currentTarget.dataset.type });
    },
    toggleCheck: function (e) {
      var value = e.currentTarget.dataset.value;
      var list = this.data.checks.slice();
      var index = list.indexOf(value);
      if (index >= 0) list.splice(index, 1); else list.push(value);
      this.__formInteracted = true;
      this.__savedThisSession = false;
      this.setData({ checks: list });
    },
    remainingSlots: function () { return Math.max(0, MAX_ATTACHMENTS - this.data.attachments.length); },
    validateFile: function (file) {
      var size = Number(file.size || file.fileSize || 0);
      if (size > MAX_FILE_SIZE) {
        wx.showToast({ title: "单个附件不能超过 15MB", icon: "none" });
        return false;
      }
      return true;
    },

    uploadFiles: function (files, kind) {
      var self = this;
      files = (files || []).slice(0, this.remainingSlots()).filter(function (file) { return self.validateFile(file); });
      if (!files.length) return;
      this.__formInteracted = true;
      this.__savedThisSession = false;
      this.setData({ uploading: true, uploadProgress: 0 });
      var uploaded = [];
      var sequence = Promise.resolve();
      files.forEach(function (file, index) {
        sequence = sequence.then(function () {
          var filePath = file.tempFilePath || file.path;
          var extension = String(filePath).split("?")[0].split(".").pop();
          return api.uploadAttachment(filePath, {
            name: kind + "-" + Date.now() + "-" + (index + 1) + "." + extension,
            purpose: "submission",
            onProgress: function (progress) {
              self.setData({ uploadProgress: Math.round((index * 100 + progress) / files.length) });
            }
          }).then(function (attachment) {
            if (!attachment.type) attachment.type = inferMime(filePath, kind);
            uploaded.push(normalizeAttachment(attachment, self.data.attachments.length + uploaded.length));
          });
        });
      });
      sequence.then(function () {
        self.setData({ uploading: false, uploadProgress: 100, attachments: self.data.attachments.concat(uploaded), subType: kind });
      }).catch(function (error) {
        self.setData({ uploading: false });
        wx.showModal({ title: "附件上传失败", content: (error && error.message) || "请检查网络后重试", showCancel: false });
      });
    },

    chooseImage: function () {
      var self = this;
      var remain = this.remainingSlots();
      if (!remain) return wx.showToast({ title: "最多添加 6 个附件", icon: "none" });
      wx.chooseMedia({ count: remain, mediaType: ["image"], sizeType: ["compressed"], success: function (res) { self.uploadFiles(res.tempFiles, "image"); } });
    },
    chooseVideo: function () {
      var self = this;
      if (!this.remainingSlots()) return wx.showToast({ title: "最多添加 6 个附件", icon: "none" });
      wx.chooseMedia({ count: 1, mediaType: ["video"], maxDuration: 60, success: function (res) { self.uploadFiles(res.tempFiles, "video"); } });
    },

    setupRecorder: function () {
      var self = this;
      if (!wx.getRecorderManager) return;
      this.__recorder = wx.getRecorderManager();
      this.__recorder.onStop(function (res) {
        self.stopRecordTimer();
        self.setData({ recording: false });
        if (res && res.tempFilePath) self.uploadFiles([{ tempFilePath: res.tempFilePath, size: res.fileSize }], "audio");
      });
      this.__recorder.onError(function (error) {
        self.stopRecordTimer();
        self.setData({ recording: false });
        wx.showModal({ title: "录音失败", content: (error && error.errMsg) || "请检查麦克风权限", showCancel: false });
      });
    },
    startRecording: function () {
      var self = this;
      if (!this.remainingSlots()) return wx.showToast({ title: "最多添加 6 个附件", icon: "none" });
      if (!this.__recorder) return wx.showToast({ title: "当前基础库不支持录音", icon: "none" });
      wx.getSetting({ success: function (setting) {
        function start() {
          self.__recorder.start({ duration: 60000, format: "mp3", sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000 });
          self.__formInteracted = true;
          self.__savedThisSession = false;
          self.setData({ recording: true, recordSeconds: 0, subType: "audio" });
          self.startRecordTimer();
        }
        if (setting.authSetting["scope.record"] === false) {
          wx.showModal({ title: "需要麦克风权限", content: "请在设置中允许使用麦克风后重试。", confirmText: "去设置", success: function (result) {
            if (result.confirm) wx.openSetting({ success: function (s) { if (s.authSetting["scope.record"]) start(); } });
          } });
        } else if (setting.authSetting["scope.record"] === true) start();
        else wx.authorize({ scope: "scope.record", success: start, fail: function () { wx.showToast({ title: "未获得麦克风权限", icon: "none" }); } });
      }, fail: function () { wx.showToast({ title: "无法检查麦克风权限", icon: "none" }); } });
    },
    stopRecording: function () { if (this.__recorder && this.data.recording) this.__recorder.stop(); },
    stopRecorderIfNeeded: function () { if (this.__recorder && this.data.recording) this.__recorder.stop(); this.stopRecordTimer(); },
    startRecordTimer: function () {
      var self = this;
      this.stopRecordTimer();
      this.__recordTimer = setInterval(function () { self.setData({ recordSeconds: self.data.recordSeconds + 1 }); }, 1000);
    },
    stopRecordTimer: function () { if (this.__recordTimer) clearInterval(this.__recordTimer); this.__recordTimer = null; },

    previewImage: function (e) {
      var url = e.currentTarget.dataset.url;
      var urls = this.data.attachments.filter(function (item) { return item.kind === "image"; }).map(function (item) { return item.url; });
      wx.previewImage({ urls: urls, current: url });
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
    removeAttachment: function (e) {
      var list = this.data.attachments.slice();
      list.splice(Number(e.currentTarget.dataset.index), 1);
      this.__formInteracted = true;
      this.__savedThisSession = false;
      this.setData({ attachments: list });
    },

    chooseFit: function (e) {
      var choice = e.currentTarget.dataset.choice;
      if (this.data.fitChoice || isStudentPage) return;
      state.setTaskFit(this.data.childId, this.data.taskId, choice);
      this.setData({ fitChoice: choice });
      api.track("task_fit_feedback", { childId: this.data.childId, taskId: this.data.taskId, meta: { choice: choice } });
      wx.showToast({ title: "已记录你的评价", icon: "success" });
    },
    buildContent: function () {
      var text = String(this.data.content || "").trim();
      if (this.data.subType === "check") return this.data.checks.length ? "打卡：" + this.data.checks.join("；") : "";
      if (!text && this.data.attachments.length) {
        var labels = { image: "图片", audio: "语音", video: "视频" };
        return "已提交" + (labels[this.data.subType] || "附件") + "记录";
      }
      return text;
    },
    onSubmit: function (status) {
      var self = this;
      if (this.data.locked || this.data.submitting || this.data.uploading || this.data.recording) return;
      var content = this.buildContent();
      if (!content && !this.data.attachments.length) {
        wx.showToast({ title: this.data.subType === "check" ? "请至少勾选一个打卡项" : "请填写内容或添加附件", icon: "none" });
        return;
      }
      this.setData({ submitting: true });
      api.submitWork({
        taskId: this.data.taskId,
        childId: this.data.childId,
        content: content,
        subType: this.data.subType,
        status: status,
        attachments: this.data.attachments.map(function (item) { return { url: item.url, type: item.type, name: item.name, size: item.size }; })
      }).then(function () {
        self.__submittedThisSession = status === "submitted";
        self.__savedThisSession = true;
        self.setData({ submitting: false });
        wx.showToast({ title: status === "draft" ? "草稿已保存" : "提交成功", icon: "success" });
        if (status === "draft") setTimeout(function () { self.loadData(); }, 500);
        else setTimeout(function () {
          wx.navigateBack({ fail: function () { wx.redirectTo({ url: isStudentPage ? "/pages/student/home/home" : "/pages/parent/home/home" }); } });
        }, 700);
      }).catch(function () { self.setData({ submitting: false }); });
    },
    onSaveDraft: function () { this.onSubmit("draft"); },
    onConfirmSubmit: function () {
      var self = this;
      if (this.data.submitting || this.data.uploading || this.data.recording) return;
      wx.showModal({ title: "确认提交", content: "正式提交后将不能再修改，确定提交吗？", success: function (result) { if (result.confirm) self.onSubmit("submitted"); } });
    }
  };
}

module.exports = createTaskPage;
