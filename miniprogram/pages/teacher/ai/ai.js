var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var voiceInput = require("../../../utils/voice-input.js");

/* 开场引导问题，对应 DeepSeek / ChatGPT 移动端的推荐问法 */
var SUGGESTS = [
  "哪些学生最近参与度下降了？",
  "本周任务完成情况如何？",
  "哪些学生卡在草稿阶段需要跟进？",
  "帮我写一条本周家长提醒"
];

var seq = 0;
/* 每次提问分配一个 runId，避免上一轮流式回调写脏新会话 */
var runId = 0;

Page({
  data: {
    isAdmin: false,
    messages: [],
    draft: "",
    canSend: false,
    asking: false,
    anchorId: "tail-a",
    suggests: SUGGESTS,
    /* 长按语音输入 */
    voiceRecording: false,
    voiceTranscribing: false,
    voiceSeconds: 0,
    voiceHint: "按住说话，说完自动转成文字",
    voiceError: ""
  },

  onLoad: function () {
    this.setData({ isAdmin: app.globalData.role === "admin" });
    this.setupVoice();
  },

  onShow: function () {
    if (this.__voice && !this.__voice.isRecording() && !this.__voice.isTranscribing()) {
      this.__voice.checkBackend();
    }
  },

  onHide: function () {
    if (this.__voice) this.__voice.release();
  },

  onUnload: function () {
    this.__unloaded = true;
    if (this.__voice) {
      this.__voice.destroy();
      this.__voice = null;
    }
  },

  onInput: function (e) {
    var draft = e.detail.value || "";
    this.setData({ draft: draft, canSend: !!String(draft).trim() });
  },

  /* ============ 长按语音输入 ============ */
  setupVoice: function () {
    var self = this;
    this.__voice = voiceInput.createVoiceInput({
      mode: "hold",
      maxDuration: 60000,
      isBusy: function () { return self.data.asking; },
      onTick: function (seconds) { self.setData({ voiceSeconds: seconds }); },
      onText: function (text) { self.appendVoiceText(text); },
      onState: function (state, payload) {
        var patch = { voiceError: "" };
        if (state === "recording") {
          patch.voiceRecording = true;
          patch.voiceHint = "正在聆听，松开发送…";
        } else if (state === "transcribing") {
          patch.voiceRecording = false;
          patch.voiceTranscribing = true;
          patch.voiceHint = "正在转成文字…";
        } else if (state === "success") {
          patch.voiceRecording = false;
          patch.voiceTranscribing = false;
          patch.voiceHint = "已转成文字，可继续编辑";
        } else if (state === "error") {
          patch.voiceRecording = false;
          patch.voiceTranscribing = false;
          patch.voiceHint = "按住说话，说完自动转成文字";
          if (!payload || !payload.keepBackend) patch.voiceError = (payload && payload.message) || "";
        } else if (state === "idle") {
          patch.voiceRecording = false;
          patch.voiceTranscribing = false;
          if (payload && payload.message) patch.voiceHint = payload.message;
          else patch.voiceHint = "按住说话，说完自动转成文字";
        } else if (state === "checking") {
          patch.voiceHint = "正在检查语音服务…";
        }
        self.setData(patch);
      },
      scopeGuard: function (backendState) {
        wx.showModal({
          title: backendState === "outdated" ? "线上后端尚未更新" : "语音转写暂不可用",
          content: backendState === "outdated"
            ? "当前 Render 服务缺少附件上传和语音转写接口，暂时请直接输入文字。"
            : "服务端需要配置语音转写密钥后才能使用，暂时请直接输入文字。",
          showCancel: false
        });
      }
    });
    this.__voice.setup();
    this.__voice.checkBackend();
  },

  /* 识别结果追加到输入框：已有内容则换行续写 */
  appendVoiceText: function (text) {
    var value = String(text || "").trim();
    if (!value) return;
    var current = String(this.data.draft || "").replace(/\s+$/, "");
    var draft = current ? current + "\n" + value : value;
    this.setData({
      draft: draft.slice(0, 1200),
      canSend: true,
      voiceSeconds: 0
    });
  },

  onVoicePressStart: function () {
    if (!this.__voice) return;
    wx.hideKeyboard();
    this.__voice.start();
  },

  onVoicePressEnd: function () {
    if (!this.__voice) return;
    this.__voice.stop();
  },

  /* 手指移出按钮区域视为取消 */
  onVoicePressCancel: function () {
    if (!this.__voice) return;
    this.__voice.stop();
  },

  /* 吞掉麦克风按钮自身的 tap，避免松手后被判为「点击开始录音」而重新录音 */
  noop: function () {},

  onVoiceErrorTap: function () {
    this.setData({ voiceError: "" });
    if (this.__voice) this.__voice.checkBackend();
  },

  /* 点击引导问题：直接提问 */
  onPickSuggest: function (e) {
    this.setData({ draft: e.currentTarget.dataset.q || "", canSend: true });
    this.ask();
  },

  send: function () { this.ask(); },

  ask: function () {
    var self = this;
    var question = String(this.data.draft || "").trim();
    if (!question || this.data.asking) return;

    var history = this.data.messages
      .filter(function (item) { return item.content; })
      .slice(-6)
      .map(function (item) { return { role: item.role, content: item.content }; });

    var messages = this.data.messages.concat([
      { key: "m" + (++seq), role: "user", content: question, sources: [], provider: "", error: "" },
      { key: "m" + (++seq), role: "assistant", content: "", question: question, sources: [], provider: "", error: "" }
    ]);
    var assistantIndex = messages.length - 1;
    var myRun = ++runId;

    this.setData({
      messages: messages,
      draft: "",
      canSend: false,
      asking: true
    });
    wx.hideKeyboard();
    this.scrollToTail(true);

    /* 只接受当前这一轮、且页面未销毁的回调 */
    function alive() { return !self.__unloaded && myRun === runId; }
    function current() { return alive() ? self.data.messages[assistantIndex] : null; }

    function patchAssistant(patch) {
      if (!current()) return;
      var base = "messages[" + assistantIndex + "].";
      var update = {};
      update[base + "content"] = patch.content || "";
      update[base + "sources"] = patch.sources || [];
      update[base + "provider"] = patch.provider || "";
      update[base + "error"] = patch.error || "";
      self.setData(update);
      self.scrollToTail(false);
    }

    api.aiChatStream(question, history, {
      onDelta: function (content) {
        var msg = current();
        if (!msg) return;
        patchAssistant({
          content: (msg.content || "") + content,
          sources: msg.sources || [],
          provider: msg.provider || "",
          error: ""
        });
      },
      onDone: function (meta) {
        var msg = current();
        if (!msg) return;
        patchAssistant({
          content: msg.content || "暂时没有得到回答，请稍后再试",
          sources: (meta && meta.sources) || msg.sources || [],
          provider: (meta && meta.provider) || msg.provider || "",
          error: (meta && meta.aiError) || msg.error || ""
        });
      },
      onStreamError: function (message) {
        var msg = current();
        if (!msg) return;
        patchAssistant({ content: msg.content, sources: msg.sources, provider: msg.provider, error: message });
      },
      onFallback: function (res) {
        patchAssistant({
          content: (res && res.answer) || "暂时没有得到回答",
          sources: (res && res.sources) || [],
          provider: (res && res.provider) || "",
          error: (res && res.aiError) || ""
        });
      }
    }).then(function () {
      self.finish(assistantIndex, myRun);
    }).catch(function (error) {
      var msg = current();
      if (msg) {
        patchAssistant({
          content: msg.content || "这次查询没有完成，请稍后重试。",
          sources: msg.sources || [],
          provider: msg.provider || "",
          error: (error && error.message) || "AI 请求失败"
        });
      }
      self.finish(assistantIndex, myRun);
    });
  },

  finish: function (assistantIndex, myRun) {
    if (this.__unloaded || myRun !== runId) return;
    var current = this.data.messages[assistantIndex];
    if (!current) return;
    if (!current.content) {
      var key = "messages[" + assistantIndex + "].content";
      var update = {};
      update[key] = "暂时没有得到回答，请稍后再试";
      this.setData(update);
    }
    this.setData({ asking: false });
    this.scrollToTail(true);
  },

  /* 重新回答：用该条 AI 消息对应的问题重新提问 */
  onRetry: function (e) {
    if (this.data.asking) return;
    var question = this.findMessage(e.currentTarget.dataset.key).question || "";
    if (!question) return;
    this.setData({ draft: question, canSend: true });
    this.ask();
  },

  onCopy: function (e) {
    var text = String(this.findMessage(e.currentTarget.dataset.key).content || "");
    if (!text) return wx.showToast({ title: "还没有可复制的内容", icon: "none" });
    wx.setClipboardData({
      data: text,
      success: function () { wx.showToast({ title: "已复制", icon: "success" }); }
    });
  },

  findMessage: function (key) {
    var list = this.data.messages || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return {};
  },

  onNewChat: function () {
    var self = this;
    if (!this.data.messages.length) return;
    wx.showModal({
      title: "开始新会话",
      content: "将清空当前对话记录，确定继续吗？",
      success: function (res) {
        if (!res.confirm) return;
        runId++; // 作废仍在流式中的那一轮
        self.setData({ messages: [], draft: "", canSend: false, asking: false });
        self.scrollToTail(true);
      }
    });
  },

  goReport: function () { wx.navigateTo({ url: "/pages/teacher/ai/report/report" }); },
  goDaily: function () { wx.navigateTo({ url: "/pages/teacher/daily/daily" }); },

  /* scroll-into-view 需要值变化才会触发，用两个锚点交替实现流式追加时的跟底 */
  scrollToTail: function (immediate) {
    if (this.__scrollPending) return;
    var self = this;
    this.__scrollPending = true;
    setTimeout(function () {
      self.__scrollPending = false;
      var next = self.data.anchorId === "tail-a" ? "tail-b" : "tail-a";
      self.setData({ anchorId: next });
    }, immediate ? 0 : 60);
  }
});