/**
 * 发布学习成果
 * ---------------------------------------------------------------------------
 * 图片在「发布」时才上传（避免选了不发的图片占用上传配额），
 * 文字与图片通过 POST /api/garden/posts 存入服务端，发布后全校学生、教师、管理员可见。
 */
var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var garden = require("../../../utils/learning-garden.js");

var MAX_IMAGES = garden.MAX_IMAGES;
var MAX_CONTENT = 1000;

function extensionOf(filePath) {
  var name = String(filePath || "").split("?")[0];
  var dot = name.lastIndexOf(".");
  var ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return ["jpg", "jpeg", "png", "webp"].indexOf(ext) >= 0 ? ext : "jpg";
}

Page({
  data: {
    maxImages: MAX_IMAGES,
    maxContent: MAX_CONTENT,
    content: "",
    /** [{ id, url: 本机临时路径（用于预览）, filePath, extension, attachment }] */
    images: [],
    /** 发布时上传图片的进度（0-100），仅用于提示文案 */
    uploadProgress: 0,
    submitting: false
  },

  onShow: function () {
    if (app.globalData.role !== "student") {
      wx.showToast({ title: "仅学生账号可发布成果", icon: "none" });
      setTimeout(function () {
        wx.redirectTo({ url: app.landingPath(app.globalData.role) });
      }, 800);
    }
  },

  onContentInput: function (e) {
    this.setData({ content: e.detail.value });
  },

  remainingSlots: function () {
    return Math.max(0, MAX_IMAGES - this.data.images.length);
  },

  validateImage: function (file) {
    var size = Number(file && (file.size || file.fileSize) || 0);
    // 后端单文件上限 2MB（/api/uploads）
    if (size > 2 * 1024 * 1024) {
      wx.showToast({ title: "单张图片不能超过 2MB", icon: "none" });
      return false;
    }
    return true;
  },

  chooseImages: function () {
    var self = this;
    var remain = this.remainingSlots();
    if (this.data.submitting) return;
    if (!remain) {
      wx.showToast({ title: "最多上传 " + MAX_IMAGES + " 张图片", icon: "none" });
      return;
    }

    var onSuccess = function (res) {
      var files = (res && res.tempFiles) || [];
      if (!files.length && res && res.tempFilePaths) {
        files = res.tempFilePaths.map(function (path) { return { tempFilePath: path }; });
      }
      self.addImages(files.slice(0, remain));
    };
    var onFail = function (error) {
      if (error && error.errMsg && error.errMsg.indexOf("cancel") >= 0) return;
      wx.showToast({ title: "选择图片失败，请重试", icon: "none" });
    };

    // chooseMedia 需要较新的基础库，老机型回退 chooseImage
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: remain,
        mediaType: ["image"],
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
        success: onSuccess,
        fail: onFail
      });
    } else {
      wx.chooseImage({
        count: remain,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
        success: onSuccess,
        fail: onFail
      });
    }
  },

  addImages: function (files) {
    var self = this;
    var added = [];
    (files || []).forEach(function (file) {
      if (added.length >= self.remainingSlots()) return;
      if (!self.validateImage(file)) return;
      var filePath = file.tempFilePath || file.path;
      if (!filePath) return;
      added.push({
        id: filePath + "#" + Date.now() + "-" + added.length,
        url: filePath,
        filePath: filePath,
        extension: extensionOf(filePath),
        size: Number(file.size || file.fileSize || 0),
        attachment: null
      });
    });
    if (added.length) this.setData({ images: this.data.images.concat(added) });
  },

  previewImage: function (e) {
    var current = e.currentTarget.dataset.url;
    var urls = (this.data.images || []).map(function (item) { return item.url; });
    if (current && urls.length) wx.previewImage({ current: current, urls: urls });
  },

  removeImage: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    var images = this.data.images.slice();
    if (index < 0 || index >= images.length) return;
    images.splice(index, 1);
    this.setData({ images: images });
  },

  /** 串行上传尚未上传的图片，返回可提交给服务端的附件数组 */
  uploadPendingImages: function () {
    var self = this;
    var images = this.data.images.slice();
    var sequence = Promise.resolve();
    images.forEach(function (image, index) {
      sequence = sequence.then(function () {
        // 上次发布失败留下的已上传图片直接复用，避免重复上传
        if (image.attachment || !image.filePath) return null;
        return api
          .uploadAttachment(image.filePath, {
            purpose: "learning_garden",
            name: "learning-garden-" + Date.now() + "-" + (index + 1) + "." + image.extension,
            onProgress: function (progress) {
              self.setData({ uploadProgress: Math.round((index * 100 + progress) / images.length) });
            }
          })
          .then(function (attachment) {
            image.attachment = attachment;
          });
      });
    });
    return sequence.then(function () {
      self.setData({ images: images });
      return images
        .map(function (image) { return image.attachment; })
        .filter(function (attachment) { return !!attachment; });
    });
  },

  submitPost: function () {
    var self = this;
    var content = String(this.data.content || "").trim();
    if (!content && !this.data.images.length) {
      wx.showToast({ title: "请写点文字或添加图片", icon: "none" });
      return;
    }
    if (this.data.submitting) return;
    if (content.length > MAX_CONTENT) {
      wx.showToast({ title: "文字不能超过 " + MAX_CONTENT + " 个字", icon: "none" });
      return;
    }

    var imageCount = this.data.images.length;

    this.setData({ submitting: true, uploadProgress: 0 });
    this.uploadPendingImages()
      .then(function (attachments) {
        return api.createGardenPost({ content: content, images: attachments });
      })
      .then(function () {
        api.track("student_garden_record_saved", {
          meta: { contentLength: content.length, imageCount: imageCount }
        });
        self.setData({ submitting: false, content: "", images: [] });
        wx.showToast({ title: "已发布", icon: "success" });
        setTimeout(function () {
          if (getCurrentPages().length > 1) wx.navigateBack();
          else wx.redirectTo({ url: "/pages/garden/garden" });
        }, 900);
      })
      .catch(function (error) {
        var message = (error && error.message) || "发布失败，请稍后重试";
        self.setData({ submitting: false });
        // 401/403 已由请求层统一提示，这里只补网络与校验类错误
        if (!error || (error.status !== 401 && error.status !== 403)) {
          wx.showModal({ title: "发布失败", content: message, showCancel: false });
        }
      });
  }
});
