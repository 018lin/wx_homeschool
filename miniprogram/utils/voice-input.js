/**
 * 家校共育系统 · 小程序语音输入
 *
 * 把「录音 → 上传 → 服务端转写 → 回填文字」封装成可复用模块，
 * 供「AI 洞察」和「今日成长记录」两处共用，支持两种触发方式：
 *   1. hold：按住说话（bindlongpress / bindtouchstart 开始，bindtouchend 结束）
 *   2. tap ：点击开始 / 停止
 *
 * 录音依赖服务端 /api/uploads + /api/teacher/transcribe（智谱 ASR），
 * 未配置时会通过 onState 回调上报，前端负责降级提示。
 */

var api = require("./api.js");

var MAX_DURATION = 60000;      // 单次最长 60 秒
var MIN_DURATION = 500;        // 低于该时长视为误触，不做转写

function noop() {}

/**
 * 创建一个语音输入控制器
 * @param {object} options
 *   mode            "hold"（长按，默认）| "tap"（点击）
 *   maxDuration     单次录音时长上限（毫秒）
 *   prompt          转写前的提示文案
 *   onState(state, payload) 状态变化：checking / idle / recording / transcribing / success / error
 *   onText(text)    转写完成，text 为识别出的文字
 *   onTick(seconds) 录音计时（仅 hold/tap 录音中触发）
 *   scopeGuard(text, resolve) 未就绪时的降级提示
 *   isBusy()        返回 true 时禁止开始录音（例如正在提交其他请求）
 */
function createVoiceInput(options) {
  options = options || {};
  var mode = options.mode === "tap" ? "tap" : "hold";
  var maxDuration = options.maxDuration || MAX_DURATION;
  var onState = options.onState || noop;
  var onText = options.onText || noop;
  var onTick = options.onTick || noop;
  var scopeGuard = options.scopeGuard || noop;

  var recorder = null;
  var timer = null;
  var seconds = 0;
  var recording = false;
  /* 权限弹窗与 recorder.onStart 之间存在时间差，用 starting 防止重复 start 触发 */
  var starting = false;
  /* 用户在权限弹窗返回前就已松手：start 成功后需要立刻停止 */
  var pendingStop = false;
  var transcribing = false;
  var backendState = "idle";   // idle | checking | ready | unconfigured | outdated | unknown
  var destroyed = false;

  function clearTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function setBackendState(state) {
    backendState = state;
  }

  function setupRecorder() {
    if (!wx.getRecorderManager) {
      setBackendState("unsupported");
      onState("error", { message: "当前微信版本不支持录音，请直接输入文字" });
      return null;
    }
    if (recorder) return recorder;
    recorder = wx.getRecorderManager();
    recorder.onStart(function () {
      recording = true;
      starting = false;
      seconds = 0;
      onTick(0);
      onState("recording", {});
      clearTimer();
      timer = setInterval(function () {
        seconds += 1;
        onTick(seconds);
      }, 1000);
      /* 用户已提前松手，录到立刻停 */
      if (pendingStop) {
        pendingStop = false;
        try { recorder.stop(); } catch (error) { pendingStop = false; }
      }
    });
    recorder.onStop(function (result) {
      recording = false;
      starting = false;
      clearTimer();
      onTick(0);
      if (destroyed) return;
      if (!result || !result.tempFilePath || seconds * 1000 < MIN_DURATION) {
        onState("idle", { message: "说话时间太短，已取消" });
        return;
      }
      uploadAndTranscribe(result.tempFilePath);
    });
    recorder.onError(function (error) {
      recording = false;
      starting = false;
      transcribing = false;
      clearTimer();
      onTick(0);
      onState("error", { message: (error && error.errMsg) || "录音失败，请检查麦克风权限", keepBackend: true });
    });
    return recorder;
  }

  function uploadAndTranscribe(filePath) {
    transcribing = true;
    onState("transcribing", {});
    api.uploadAttachment(filePath, {
      name: "voice-input-" + Date.now() + ".mp3",
      purpose: "transcription"
    }).then(function (attachment) {
      return api.transcribeAudio(attachment);
    }).then(function (result) {
      transcribing = false;
      var text = String((result && result.text) || "").trim();
      if (!text) {
        onState("error", { message: "没有识别到文字，请再说一次或直接输入文字", keepBackend: true });
        return;
      }
      onText(text);
      onState("success", { message: "已转成文字，可继续编辑" });
    }).catch(function (error) {
      transcribing = false;
      var message = (error && error.message) || "语音转文字失败，请直接输入文字";
      var outdated = error && (error.status === 404 ||
        String(message).indexOf("接口不存在") >= 0 || String(message).indexOf("尚未部署") >= 0);
      var unconfigured = error && (error.status === 503 ||
        String(message).indexOf("未配置") >= 0 || String(message).indexOf("尚未配置") >= 0);
      if (outdated) setBackendState("outdated");
      else if (unconfigured) setBackendState("unconfigured");
      onState("error", { message: outdated ? "线上后端版本未更新，语音接口尚未部署" : message });
    });
  }

  /** 检查服务端语音能力，未就绪时给出可执行的降级提示 */
  function checkBackend() {
    setBackendState("checking");
    onState("checking", {});
    return api.getUploadStatus().then(function (res) {
      if (destroyed) return;
      if (res && res.configured) {
        setBackendState("ready");
        onState("idle", {});
      } else {
        setBackendState("unconfigured");
        onState("error", { message: "语音转写尚未配置，可直接输入文字", keepBackend: true });
      }
    }).catch(function (error) {
      if (destroyed) return;
      var outdated = error && (error.status === 404 || String(error.message || "").indexOf("接口不存在") >= 0);
      setBackendState(outdated ? "outdated" : "unknown");
      onState("idle", {});
    });
  }

  /** 请求麦克风权限后开始录音 */
  function ensurePermission(onGranted) {
    wx.getSetting({
      success: function (setting) {
        var auth = (setting && setting.authSetting) || {};
        if (auth["scope.record"] === true) return onGranted();
        if (auth["scope.record"] === false) {
          wx.showModal({
            title: "需要麦克风权限",
            content: "请在小程序设置中开启麦克风权限；也可以直接输入文字。",
            confirmText: "去设置",
            success: function (result) {
              if (!result.confirm) return;
              wx.openSetting({
                success: function (opened) {
                  var next = (opened && opened.authSetting) || {};
                  if (next["scope.record"]) onGranted();
                  else onState("error", { message: "麦克风权限未开启，请直接输入文字", keepBackend: true });
                }
              });
            }
          });
          return;
        }
        wx.authorize({
          scope: "scope.record",
          success: onGranted,
          fail: function () {
            onState("error", { message: "未获得麦克风权限，请直接输入文字", keepBackend: true });
          }
        });
      },
      fail: function () {
        onState("error", { message: "无法检查麦克风权限，请直接输入文字", keepBackend: true });
      }
    });
  }

  function start() {
    if (destroyed || recording || starting || transcribing) return;
    if (options.isBusy && options.isBusy()) {
      wx.showToast({ title: "请稍候，正在处理中", icon: "none" });
      return;
    }
    if (backendState === "checking") {
      wx.showToast({ title: "正在检查语音服务，请稍候", icon: "none" });
      return;
    }
    if (backendState === "unconfigured" || backendState === "outdated" || backendState === "unsupported") {
      scopeGuard(backendState);
      return;
    }
    var manager = setupRecorder();
    if (!manager) return;
    /* 权限弹窗期间先占位，避免 touchstart/longpress 重复触发 recorder.start */
    starting = true;
    ensurePermission(function () {
      if (destroyed) { starting = false; return; }
      try {
        manager.start({
          duration: maxDuration,
          format: "mp3",
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000
        });
      } catch (error) {
        starting = false;
        onState("error", { message: "录音启动失败，请重试或直接输入文字", keepBackend: true });
      }
    });
  }

  function stop() {
    /* 权限弹窗还未返回时，用户已松手：等 start 回调后再立即停止 */
    if (starting) {
      starting = false;
      pendingStop = true;
      return;
    }
    if (!recorder || !recording) return;
    recorder.stop();
  }

  return {
    mode: mode,
    setup: setupRecorder,
    checkBackend: checkBackend,
    start: start,
    stop: stop,
    toggle: function () {
      if (recording) stop();
      else start();
    },
    isRecording: function () { return recording; },
    isTranscribing: function () { return transcribing; },
    backendState: function () { return backendState; },
    /** 页面隐藏/卸载时安全收尾，避免录音被系统中断后状态卡死 */
    release: function () {
      clearTimer();
      pendingStop = false;
      starting = false;
      if (recorder && recording) {
        try { recorder.stop(); } catch (error) {}
      }
      recording = false;
    },
    destroy: function () {
      destroyed = true;
      this.release();
      recorder = null;
    }
  };
}

module.exports = { createVoiceInput: createVoiceInput };
