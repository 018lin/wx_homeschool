var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");
var voiceInput = require("../../../utils/voice-input.js");

/* 把接口返回的草稿/已发送记录映射成清单项 */
function mapUpdate(item) {
  var status = item.status === "draft" ? "draft" : "sent";
  var recipients = (item.recipients || []).map(function (person) {
    return {
      userId: Number(person.userId),
      name: person.name || "家长",
      relation: person.relation || "家长",
      childNames: person.childNames || [],
      childNameText: person.childNameText || ""
    };
  });
  return {
    id: Number(item.id),
    studentName: item.student_name || "全班",
    summary: item.summary || "",
    parentMessage: item.parent_message || item.summary || "",
    tags: (item.tags || "").split(",").filter(Boolean),
    recordDate: item.record_date || util.dateKey(new Date()),
    isDraft: status === "draft",
    isAutoSent: item.status === "auto_sent",
    statusText: status === "draft"
      ? "待校对"
      : (item.status === "auto_sent" ? "已自动发送 " + (item.sent_at || "").slice(11, 16) : "已确认发送 " + (item.sent_at || "").slice(11, 16)),
    timeText: util.fromNow(item.created_at),
    recipients: recipients,
    recipientCount: recipients.length || Number(item.recipient_count || 0),
    recipientText: recipients.length
      ? recipients.map(function (person) { return person.name + (person.childNameText ? "（" + person.childNameText + "）" : ""); }).join("、")
      : "未设置推送对象",
    /* 早期记录只存了推送人数、没存推送对象明细，这里标记出来，避免出现「8 位家长」却没有名字的错位 */
    recipientDetailMissing: !recipients.length && !(item.recipient_ids || []).length && Number(item.recipient_count || 0) > 0,
    aiStatus: item.ai_status === "ai" ? "AI 已整理" : "本地已整理"
  };
}

/* 把后端返回的推送对象来源翻译成教师能看懂的提示，
 * 区分「按学生家长自动匹配」「没认出学生推给全部可见家长」「认出学生但没绑家长」「暂无可推送家长」。 */
function describeRecipientMatch(source, draft) {
  var prefix = "已加入待校对清单";
  if (source === "teacher") {
    return prefix + "，推送对象以您指定为准：" + draft.recipientText;
  }
  if (source === "ai-all-visible") {
    return prefix + "，未从口述中认出学生姓名，已暂推给全部可见家长（" +
      draft.recipientCount + " 位），请「校对推送对象」确认";
  }
  if (source === "ai-student-no-parent") {
    return draft.recipientCount
      ? prefix + "，认出学生但未绑定家长，已暂推给全部可见家长（" + draft.recipientCount + " 位），请「校对推送对象」确认"
      : prefix + "，认出学生但该学生没有绑定家长，请「校对推送对象」指定";
  }
  if (source === "none" || !draft.recipientCount) {
    return prefix + "，未匹配到家长，请点击「校对推送对象」指定";
  }
  return prefix + "，AI 已按学生匹配，将推送给：" + draft.recipientText;
}

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
    creating: false,
    voiceBackendState: "checking",
    statusTone: "idle",
    statusText: "正在检查语音服务…",
    /* 待校对清单 */
    drafts: [],
    sentList: [],
    autoSendTime: "18:00",
    draftCount: 0,
    confirming: false,
    /* 编辑弹层 */
    editing: null,
    recipientOptions: [],
    recipientLoading: false,
    recipientError: "",
    saving: false
  },

  onLoad: function () {
    this.setupRecorder();
  },

  onShow: function () {
    if (!app.isLogin()) return;
    this.loadList();
    this.checkVoiceBackend();
  },

  onHide: function () {
    this.stopRecordingIfNeeded();
  },

  onUnload: function () {
    if (this.__voice) {
      this.__voice.destroy();
      this.__voice = null;
    }
  },

  onPullDownRefresh: function () {
    this.loadList(function () { wx.stopPullDownRefresh(); });
  },

  onRetry: function () {
    this.loadList();
  },

  /* ---------- 列表 ---------- */
  loadList: function (done) {
    var self = this;
    this.setData({ loading: true, error: "" });
    api.getDailyUpdates(30).then(function (res) {
      var items = ((res && res.updates) || []).map(mapUpdate);
      self.setData({
        loading: false,
        drafts: items.filter(function (item) { return item.isDraft; }),
        sentList: items.filter(function (item) { return !item.isDraft; }).slice(0, 10),
        autoSendTime: (res && res.autoSendTime) || "18:00",
        draftCount: Number((res && res.draftCount) || 0)
      });
      if (done) done();
    }).catch(function (error) {
      self.setData({ loading: false, error: (error && error.message) || "成长记录加载失败" });
      if (done) done();
    });
  },

  /* ---------- 录入（语音 / 文字） ---------- */
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
        statusText: "语音上传暂不可用：服务端尚未配置语音转写，可直接输入文字"
      });
    }).catch(function (error) {
      var isOutdated = error && (error.status === 404 || String(error.message || "").indexOf("接口不存在") >= 0);
      self.setData({
        voiceBackendState: isOutdated ? "outdated" : "unknown",
        statusTone: isOutdated ? "error" : "idle",
        statusText: isOutdated
          ? "线上后端版本未更新，语音接口尚未部署；当前可直接输入文字"
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
    this.__voice = voiceInput.createVoiceInput({
      mode: "tap",
      maxDuration: 60000,
      isBusy: function () { return self.data.creating; },
      onTick: function (seconds) { self.setData({ recordSeconds: seconds, uploadProgress: 0 }); },
      onText: function (text) { self.appendVoiceText(text); },
      onState: function (state, payload) {
        if (state === "recording") {
          self.setData({ recording: true, statusTone: "recording", statusText: "正在录音，说完后点击停止" });
        } else if (state === "transcribing") {
          self.setData({ recording: false, transcribing: true, uploadProgress: 10, statusTone: "processing", statusText: "正在上传并转写…" });
        } else if (state === "success") {
          self.setData({
            transcribing: false,
            uploadProgress: 100,
            statusTone: "success",
            statusText: "转写完成，可修改文字后加入待校对清单"
          });
        } else if (state === "error") {
          var outdated = payload && String(payload.message || "").indexOf("尚未部署") >= 0;
          self.setData({
            transcribing: false,
            statusTone: "error",
            voiceBackendState: outdated ? "outdated" : self.data.voiceBackendState,
            statusText: (payload && payload.message) || "录音转写失败，请直接输入文字"
          });
        } else if (state === "idle") {
          self.setData({ transcribing: false });
          if (payload && payload.message) self.setData({ statusTone: "idle", statusText: payload.message });
        } else if (state === "checking") {
          self.setData({ statusTone: "processing", statusText: "正在检查语音服务…" });
        }
      },
      scopeGuard: function (backendState) {
        wx.showModal({
          title: backendState === "outdated" ? "线上后端尚未更新" : "语音转写暂不可用",
          content: backendState === "outdated"
            ? "当前 Render 服务缺少附件上传和语音转写接口，暂时可以直接输入文字。"
            : "服务端需要配置语音转写密钥后才能上传录音，暂时可以直接输入文字。",
          showCancel: false
        });
      }
    });
    this.__voice.setup();
  },

  appendVoiceText: function (text) {
    var value = String(text || "").trim();
    if (!value) return;
    var current = String(this.data.transcript || "").replace(/\s+$/, "");
    var transcript = current ? current + "\n" + value : value;
    this.setData({ transcript: transcript, charCount: transcript.length, recordSeconds: 0 });
  },

  startRecording: function () {
    if (this.__voice) this.__voice.start();
  },

  stopRecording: function () {
    if (this.__voice) this.__voice.stop();
  },

  stopRecordingIfNeeded: function () {
    if (this.__voice) this.__voice.release();
  },

  /* ---------- 新建记录 → 进入待校对清单（不直接发送） ---------- */
  onCreate: function () {
    var self = this;
    var transcript = (this.data.transcript || "").trim();
    if (!transcript) {
      wx.showToast({ title: "请先录音或输入校园观察", icon: "none" });
      return;
    }
    if (this.data.recording || this.data.transcribing || this.data.creating) return;
    this.setData({ creating: true, statusTone: "processing", statusText: "AI 正在整理，并匹配要通知的家长…" });
    api.createDailyUpdate({ transcript: transcript }).then(function (res) {
      var payload = res || {};
      var draft = mapUpdate(payload.update || {});
      var source = payload.recipientSource || "";
      self.setData({
        creating: false,
        transcript: "",
        charCount: 0,
        statusTone: source === "none" ? "error" : "success",
        statusText: describeRecipientMatch(source, draft)
      });
      self.loadList();
      wx.showToast({
        title: source === "none" ? "未匹配到家长，请校对推送对象" : "已加入待校对清单",
        icon: "none",
        duration: 2500
      });
    }).catch(function (error) {
      self.setData({
        creating: false,
        statusTone: "error",
        statusText: (error && error.message) || "整理失败，请稍后重试"
      });
    });
  },

  /* ---------- 校对：编辑推送对象与文案 ---------- */
  onEditDraft: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var target = null;
    for (var i = 0; i < this.data.drafts.length; i++) {
      if (this.data.drafts[i].id === id) target = this.data.drafts[i];
    }
    if (!target) return;
    var selected = target.recipients.map(function (person) { return person.userId; });
    this.setData({
      editing: {
        id: target.id,
        studentName: target.studentName,
        summary: target.summary,
        parentMessage: target.parentMessage,
        selected: selected,
        selectedCount: selected.length
      },
      recipientOptions: [],
      recipientLoading: true,
      recipientError: "",
      saving: false
    });
    this.loadRecipientOptions(selected);
  },

  /* 拉取可推送家长清单。失败/空结果都要给出明确状态，不能让弹窗一直停在「正在加载」。 */
  loadRecipientOptions: function (selected) {
    var self = this;
    var checkedIds = (selected || []).map(Number);
    this.setData({ recipientLoading: true, recipientError: "" });
    api.getDailyUpdateRecipients().then(function (res) {
      var seen = {};
      var options = ((res && res.options) || []).map(function (item) {
        var userId = Number(item.userId);
        return {
          userId: userId,
          name: item.name || "家长",
          relation: item.relation || "家长",
          childId: Number(item.childId),
          childName: item.childName || "学生",
          checked: checkedIds.indexOf(userId) >= 0
        };
      }).filter(function (item) {
        /* 同一家长可能绑定多个孩子，这里按家长去重，避免重复勾选 */
        if (seen[item.userId]) return false;
        seen[item.userId] = true;
        return true;
      });
      /* 弹窗已关闭时不再回写，避免把状态写到下一个弹窗上 */
      if (!self.data.editing) return;
      self.setData({ recipientOptions: options, recipientLoading: false, recipientError: "" });
    }).catch(function (error) {
      if (!self.data.editing) return;
      var message = (error && error.message) || "可推送家长加载失败";
      var outdated = error && (error.status === 404 || String(message).indexOf("接口不存在") >= 0);
      self.setData({
        recipientOptions: [],
        recipientLoading: false,
        recipientError: outdated
          ? "线上后端尚未更新该接口，请稍后重试或先联系管理员"
          : message
      });
    });
  },

  onRetryRecipients: function () {
    var editing = this.data.editing;
    if (!editing) return;
    this.loadRecipientOptions(editing.selected || []);
  },

  onEditCancel: function () {
    this.setData({ editing: null, recipientOptions: [], recipientLoading: false, recipientError: "", saving: false });
  },

  onToggleRecipient: function (e) {
    var userId = Number(e.currentTarget.dataset.id);
    var editing = this.data.editing;
    if (!editing) return;
    var selected = (editing.selected || []).slice();
    var index = selected.indexOf(userId);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(userId);
    this.setData({
      "editing.selected": selected,
      "editing.selectedCount": selected.length,
      recipientOptions: this.data.recipientOptions.map(function (option) {
        return Object.assign({}, option, { checked: selected.indexOf(option.userId) >= 0 });
      })
    });
  },

  onEditMessageInput: function (e) {
    this.setData({ "editing.parentMessage": e.detail.value || "" });
  },

  onEditSummaryInput: function (e) {
    this.setData({ "editing.summary": e.detail.value || "" });
  },

  onEditSave: function () {
    var self = this;
    var editing = this.data.editing;
    if (!editing || this.data.saving) return;
    var parentMessage = String(editing.parentMessage || "").trim();
    var summary = String(editing.summary || "").trim();
    if (!parentMessage) {
      wx.showToast({ title: "请填写发送给家长的内容", icon: "none" });
      return;
    }
    if (!summary) {
      wx.showToast({ title: "请填写记录摘要", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    api.updateDailyUpdate(editing.id, {
      summary: summary,
      parentMessage: parentMessage,
      recipientIds: editing.selected || []
    }).then(function (res) {
      self.setData({ editing: null, recipientOptions: [], recipientLoading: false, recipientError: "", saving: false, statusTone: "success", statusText: "校对内容已保存" });
      var updated = mapUpdate(((res && res.update) || {}));
      var drafts = self.data.drafts.map(function (item) {
        return item.id === updated.id ? updated : item;
      });
      self.setData({ drafts: drafts, draftCount: drafts.length });
    }).catch(function (error) {
      self.setData({ saving: false });
      wx.showToast({ title: (error && error.message) || "保存失败，请重试", icon: "none", duration: 2500 });
    });
  },

  /* ---------- 确认无误后发送 ---------- */
  onConfirmOne: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    this.confirmDrafts([id], "确认这条记录无误并发送给家长？");
  },

  /* 阻止弹层内部点击冒泡到遮罩 */
  noop: function () {},

  onConfirmAll: function () {
    var self = this;
    var ids = this.data.drafts.map(function (item) { return item.id; });
    if (!ids.length) {
      wx.showToast({ title: "没有待校对的记录", icon: "none" });
      return;
    }
    this.confirmDrafts(ids, "确认今天 " + ids.length + " 条记录均无误，发送给对应家长？");
  },

  confirmDrafts: function (ids, content) {
    var self = this;
    wx.showModal({
      title: "确认无误",
      content: content,
      confirmText: "确认发送",
      success: function (result) {
        if (!result.confirm) return;
        self.setData({ confirming: true, statusTone: "processing", statusText: "正在发送给家长…" });
        api.confirmDailyUpdates({ ids: ids }).then(function (res) {
          var sent = ((res && res.sent) || []).length;
          var count = Number((res && res.recipientCount) || 0);
          self.setData({
            confirming: false,
            statusTone: "success",
            statusText: sent
              ? "已确认无误，发送给 " + count + " 位家长"
              : "发送失败：所选记录没有推送对象，请先校对推送对象"
          });
          if (!sent) {
            wx.showToast({ title: "请先设置推送对象", icon: "none", duration: 2500 });
          }
          self.loadList();
        }).catch(function (error) {
          self.setData({
            confirming: false,
            statusTone: "error",
            statusText: (error && error.message) || "发送失败，请稍后重试"
          });
        });
      }
    });
  },

  onDeleteDraft: function (e) {
    var self = this;
    var id = Number(e.currentTarget.dataset.id);
    wx.showModal({
      title: "删除记录",
      content: "删除后这条待校对记录将不再推送，确定继续吗？",
      confirmText: "删除",
      success: function (result) {
        if (!result.confirm) return;
        api.deleteDailyUpdate(id).then(function () {
          var drafts = self.data.drafts.filter(function (item) { return item.id !== id; });
          self.setData({ drafts: drafts, draftCount: drafts.length, statusTone: "idle", statusText: "已删除该记录" });
        }).catch(function (error) {
          wx.showToast({ title: (error && error.message) || "删除失败", icon: "none" });
        });
      }
    });
  }
});
