/**
 * 学习园地：本机历史成果的读取与清理
 * ---------------------------------------------------------------------------
 * 学习园地改为「全校共享动态流」后，成果统一存在服务端（/api/garden/posts）。
 * 本模块只负责两件事：
 *   1. 提供图片数量上限等常量给「发布成果」页；
 *   2. 读取改造前遗留在本机 storage 的旧成果，供 pages/garden 一次性迁移到服务端，
 *      迁移成功后再把对应的本地图片文件删掉。
 */
var util = require("./util.js");

var MAX_IMAGES = 9;
var STORAGE_PREFIX = "student_learning_garden_";

/** 当前登录用户：不同账号共用一台设备时数据互不干扰 */
function currentUserKey() {
  var app = getApp();
  var user = (app && app.globalData && app.globalData.user) || {};
  return String(user.id || user.account || "current");
}

function storageKey() {
  return STORAGE_PREFIX + currentUserKey();
}

function inferImageType(filePath) {
  var ext = String(filePath || "").split("?")[0].split(".").pop().toLowerCase();
  var types = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  };
  return types[ext] || "image/jpeg";
}

function normalizeImage(item, index, fallbackPath) {
  var source = item || {};
  var url = source.url || source.path || fallbackPath || "";
  return {
    id: source.id || (String(Date.now()) + "-" + String(index) + "-" + String(url).slice(-18)),
    url: url,
    type: source.type || inferImageType(fallbackPath || url),
    name: source.name || ("学习图片" + (index + 1)),
    size: Number(source.size || source.fileSize || 0)
  };
}

function normalizeRecord(item) {
  var record = item || {};
  var images = Array.isArray(record.images) ? record.images : [];
  return {
    id: String(record.id || (Date.now() + "-" + Math.random().toString(36).slice(2, 8))),
    content: String(record.content || ""),
    images: images.slice(0, MAX_IMAGES).map(function (image, index) {
      return normalizeImage(image, index, image && image.url);
    }),
    createdAt: record.createdAt || record.created_at || new Date().toISOString(),
    timeText: record.timeText || util.formatDateTime(record.createdAt || record.created_at) || "刚刚"
  };
}

/** 读取本机历史成果，按发布时间倒序 */
function readRecords() {
  var raw = [];
  try {
    raw = wx.getStorageSync(storageKey()) || [];
  } catch (e) {
    raw = [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRecord).sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

/** 删除指定历史成果并本地持久化，返回删除后的列表 */
function removeRecord(id) {
  var target = String(id || "");
  var records = readRecords().filter(function (item) {
    return String(item.id) !== target;
  });
  wx.setStorageSync(storageKey(), records);
  return records;
}

/** 只回收本模块自己落盘的图片文件，不碰用户相册 / 其他页面的临时文件 */
function removeLocalImage(image) {
  var filePath = String(image && image.url || "");
  var root = wx.env && wx.env.USER_DATA_PATH ? String(wx.env.USER_DATA_PATH) : "";
  if (!root || filePath.indexOf(root + "/learning-garden-") !== 0 || !wx.getFileSystemManager) return;
  try {
    wx.getFileSystemManager().unlinkSync(filePath);
  } catch (e) {}
}

module.exports = {
  MAX_IMAGES: MAX_IMAGES,
  storageKey: storageKey,
  normalizeRecord: normalizeRecord,
  readRecords: readRecords,
  removeRecord: removeRecord,
  removeLocalImage: removeLocalImage
};
