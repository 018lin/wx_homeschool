var app = getApp();
var request = require("../../utils/api.js");
var api = request.api;
var avatar = require("../../utils/avatar.js");

var AVATAR_SIZE = 320; // 裁剪后边长（px）
var AVATAR_URL_LIMIT = 500000; // 与后端 MAX_AVATAR_URL_LENGTH 对齐

function mimeOf(filePath) {
  return String(filePath || "").toLowerCase().indexOf(".png") >= 0 ? "image/png" : "image/jpeg";
}

/** 用离屏 canvas 把原图居中裁剪成正方形，避免原图过大无法存库 */
function cropToSquare(filePath) {
  return new Promise(function (resolve) {
    function fallback() { resolve({ path: filePath, cropped: false }); }
    if (!wx.createOffscreenCanvas) return fallback();
    var canvas;
    try {
      canvas = wx.createOffscreenCanvas({ type: "2d", width: AVATAR_SIZE, height: AVATAR_SIZE });
    } catch (e) {
      return fallback();
    }
    var ctx = canvas.getContext("2d");
    var image = canvas.createImage();
    image.onload = function () {
      var width = image.width || AVATAR_SIZE;
      var height = image.height || AVATAR_SIZE;
      var side = Math.min(width, height);
      ctx.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
      ctx.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      wx.canvasToTempFilePath({
        canvas: canvas,
        fileType: "jpg",
        quality: 0.8,
        success: function (r) { resolve({ path: (r && r.tempFilePath) || filePath, cropped: true }); },
        fail: fallback
      });
    };
    image.onerror = fallback;
    image.src = filePath;
  });
}

/** 兜底：离屏 canvas 不可用时用系统压缩 */
function compressFallback(filePath) {
  return new Promise(function (resolve) {
    if (!wx.compressImage) return resolve(filePath);
    wx.compressImage({
      src: filePath,
      quality: 50,
      success: function (r) { resolve((r && r.tempFilePath) || filePath); },
      fail: function () { resolve(filePath); }
    });
  });
}

/** 新密码规则：6-64 位，且必须同时包含字母和数字 */
function checkNewPassword(f) {
  if (!f.oldPassword) return { ok: false, error: "请输入原密码" };
  if (!f.newPassword) return { ok: false, error: "请输入新密码" };
  if (f.newPassword.length < 6) return { ok: false, error: "新密码至少 6 位" };
  if (f.newPassword.length > 64) return { ok: false, error: "新密码不能超过 64 位" };
  if (!/[A-Za-z]/.test(f.newPassword) || !/[0-9]/.test(f.newPassword)) {
    return { ok: false, error: "新密码需同时包含字母和数字" };
  }
  if (!f.confirmPassword) return { ok: false, error: "请再次输入新密码" };
  if (f.confirmPassword !== f.newPassword) return { ok: false, error: "两次输入的新密码不一致" };
  if (f.newPassword === f.oldPassword) return { ok: false, error: "新密码不能与原密码相同" };
  return { ok: true, error: "" };
}

function emptyPwdForm() {
  return { oldPassword: "", newPassword: "", confirmPassword: "" };
}

function readAsBase64(filePath) {
  return new Promise(function (resolve, reject) {
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      encoding: "base64",
      success: function (r) { resolve(r.data || ""); },
      fail: function (e) { reject(e); }
    });
  });
}

Page({
  data: {
    user: null,
    avatarImage: avatar.DEFAULT_ROLE_AVATAR,
    defaultAvatar: avatar.DEFAULT_ROLE_AVATAR,
    hasCustomAvatar: false,
    uploading: false,
    roleLabel: "",
    roleColor: "#0057b8",
    isAdmin: false,
    agreementVisible: false,
    agreementDoc: "user-agreement",
    pwdModalVisible: false,
    pwdSubmitting: false,
    pwdForm: { oldPassword: "", newPassword: "", confirmPassword: "" },
    showPwd: { old: false, new: false, confirm: false },
    pwdError: ""
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    var user = app.globalData.user || {};
    var meta = avatar.roleMeta(user.role);
    // 服务端头像优先，其次本机缓存，最后回落到角色默认头像
    var custom = avatar.hasCustom(user, true);
    this.setData({
      user: user,
      defaultAvatar: meta.avatar,
      avatarImage: custom ? avatar.resolve(user, true) : meta.avatar,
      hasCustomAvatar: custom,
      roleLabel: meta.label,
      roleColor: meta.color,
      isAdmin: user.role === "admin"
    });
    this.syncAvatar();
  },

  cacheKey: function () {
    return avatar.userKey(app.globalData.user);
  },

  /** 以服务端头像为准同步一次；后端未部署时静默保留本机头像 */
  syncAvatar: function () {
    var self = this;
    api.getMe().then(function (res) {
      var remote = res && res.user;
      if (!remote) return;
      if (avatar.hasCustom(remote, false)) {
        var url = avatar.persist(self.cacheKey(), avatar.pickUrl(remote));
        self.setData({
          user: app.updateUser({ avatarUrl: url }),
          avatarImage: url,
          hasCustomAvatar: true
        });
      } else if (avatar.hasCustom(self.cacheKey(), true)) {
        // 服务端为空但本机有缓存（同步失败场景），保留本机头像
        self.setData({
          avatarImage: avatar.resolve(self.cacheKey(), true),
          hasCustomAvatar: true
        });
      } else {
        self.setData({
          user: app.updateUser({ avatarUrl: "" }),
          avatarImage: self.data.defaultAvatar,
          hasCustomAvatar: false
        });
      }
    }).catch(function () {});
  },

  /** 点击头像 → 拍照 / 相册 / 恢复默认 */
  onTapAvatar: function () {
    var self = this;
    if (this.data.uploading) return;
    var items = ["拍照", "从相册选择"];
    if (this.data.hasCustomAvatar) items.push("恢复默认头像");
    wx.showActionSheet({
      itemList: items,
      success: function (r) {
        if (r.tapIndex === 0) self.pickImage("camera");
        else if (r.tapIndex === 1) self.pickImage("album");
        else self.restoreDefault();
      },
      fail: function () {}
    });
  },

  pickImage: function (source) {
    var self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: [source],
      sizeType: ["compressed"],
      success: function (res) {
        var file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        self.uploadAvatar(file.tempFilePath);
      },
      fail: function () {}
    });
  },

  uploadAvatar: function (filePath) {
    var self = this;
    var applied = false;
    this.setData({ uploading: true });
    wx.showLoading({ title: "上传中", mask: true });
    cropToSquare(filePath)
      .then(function (result) {
        return result.cropped ? Promise.resolve(result.path) : compressFallback(result.path);
      })
      .then(function (ready) {
        return readAsBase64(ready).then(function (base64) {
          if (!base64) throw new Error("读取图片失败，请重试");
          return "data:" + mimeOf(ready) + ";base64," + base64;
        });
      })
      .then(function (url) {
        if (url.length > AVATAR_URL_LIMIT) throw new Error("图片过大，请重新选择更小的图片");
        applied = true;
        self.applyAvatar(url);
        return api.updateMyAvatar(url);
      })
      .then(function () {
        wx.hideLoading();
        self.setData({ uploading: false });
        wx.showToast({ title: "头像已更新", icon: "success" });
      })
      .catch(function (error) {
        wx.hideLoading();
        self.setData({ uploading: false });
        var msg = (error && error.message) || "头像更新失败";
        if (applied) msg = "本机已生效，服务器同步失败";
        wx.showToast({ title: msg, icon: "none", duration: 2500 });
      });
  },

  applyAvatar: function (url) {
    avatar.persist(this.cacheKey(), url);
    this.setData({
      user: app.updateUser({ avatarUrl: url }),
      avatarImage: url,
      hasCustomAvatar: true
    });
  },

  restoreDefault: function () {
    avatar.persist(this.cacheKey(), "");
    this.setData({
      user: app.updateUser({ avatarUrl: "" }),
      avatarImage: this.data.defaultAvatar,
      hasCustomAvatar: false
    });
    api.updateMyAvatar("").catch(function () {});
    wx.showToast({ title: "已恢复默认头像", icon: "success" });
  },

  /* ================= 修改密码 ================= */

  noop: function () {},

  onOpenPassword: function () {
    if (this.data.isAdmin) {
      wx.showToast({ title: "管理员账号不支持在此修改密码", icon: "none", duration: 2500 });
      return;
    }
    this.setData({
      pwdModalVisible: true,
      pwdSubmitting: false,
      pwdForm: emptyPwdForm(),
      showPwd: { old: false, new: false, confirm: false },
      pwdError: ""
    });
  },

  onClosePassword: function () {
    if (this.data.pwdSubmitting) return;
    this.setData({
      pwdModalVisible: false,
      pwdForm: emptyPwdForm(),
      showPwd: { old: false, new: false, confirm: false },
      pwdError: ""
    });
  },

  onPwdInput: function (e) {
    var key = e.currentTarget.dataset.key;
    var form = this.data.pwdForm;
    form[key] = e.detail.value || "";
    // 只在用户已开始填写时提示，避免一打开就飘红
    var check = checkNewPassword(form);
    var showError = !check.ok && (form.oldPassword || form.newPassword || form.confirmPassword);
    this.setData({
      pwdForm: form,
      pwdError: showError ? check.error : ""
    });
  },

  onTogglePwd: function (e) {
    var key = e.currentTarget.dataset.key;
    var showPwd = this.data.showPwd;
    showPwd[key] = !showPwd[key];
    this.setData({ showPwd: showPwd });
  },

  onSubmitPassword: function () {
    var self = this;
    if (this.data.pwdSubmitting) return;
    var form = this.data.pwdForm;
    var check = checkNewPassword(form);
    if (!check.ok) {
      this.setData({ pwdError: check.error });
      wx.showToast({ title: check.error, icon: "none", duration: 2500 });
      return;
    }
    this.setData({ pwdSubmitting: true, pwdError: "" });
    wx.showLoading({ title: "提交中", mask: true });
    api
      .changePassword({
        oldPassword: form.oldPassword,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword
      })
      .then(function () {
        wx.hideLoading();
        self.setData({
          pwdSubmitting: false,
          pwdModalVisible: false,
          pwdForm: emptyPwdForm(),
          showPwd: { old: false, new: false, confirm: false },
          pwdError: ""
        });
        wx.showToast({ title: "密码修改成功，请重新登录", icon: "none", duration: 2000 });
        setTimeout(function () {
          app.clearSession();
          wx.reLaunch({ url: "/pages/login/login" });
        }, 1200);
      })
      .catch(function (error) {
        wx.hideLoading();
        var msg = (error && error.message) || "密码修改失败，请稍后重试";
        self.setData({ pwdSubmitting: false, pwdError: msg });
        wx.showToast({ title: msg, icon: "none", duration: 2500 });
      });
  },

  /** 查看协议全文：登录后仍可随时查阅，无需重新阅读才能登录 */
  onOpenAgreement: function (e) {
    var doc = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.doc) || "user-agreement";
    this.setData({ agreementDoc: doc, agreementVisible: true });
  },

  onCloseAgreement: function () {
    this.setData({ agreementVisible: false });
  },

  onLogout: function () {
    var self = this;
    wx.showModal({
      title: "退出登录",
      content: "确定要退出当前账号吗？",
      success: function (r) {
        if (!r.confirm) return;
        api
          .logout()
          .catch(function () {})
          .then(function () {
            app.clearSession();
            wx.reLaunch({ url: "/pages/login/login" });
          });
      }
    });
  }
});
