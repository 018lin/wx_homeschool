/**
 * 学习园地（共享动态流）
 * ---------------------------------------------------------------------------
 * 学生发布的学习成果面向全校展示：所有学生、教师、管理员看到的都是同一份列表。
 * 页面放在中性目录 pages/garden 下：app.js 的路由守卫对非 parent/student/teacher/admin
 * 前缀只要求登录，因此三种角色都能进入（家长在页面内拦截）。
 *   - 学生：右下角悬浮「+」发布，可删除自己的成果
 *   - 教师：只读浏览
 *   - 管理员：只读浏览，并可删除违规内容
 */
var app = getApp();
var request = require("../../utils/api.js");
var api = request.api;
var util = require("../../utils/util.js");
var avatar = require("../../utils/avatar.js");
var garden = require("../../utils/learning-garden.js");

var PAGE_LIMIT = 50;
/** 旧版本成果存在本机 storage 里，每次进入最多迁移 5 条，避免一次拉起过多上传请求 */
var MIGRATE_BATCH = 5;

Page({
  data: {
    isStudent: false,
    isAdmin: false,
    loading: true,
    error: "",
    posts: [],
    total: 0
  },

  onShow: function () {
    var role = String((app.globalData.user && app.globalData.user.role) || "");
    if (role !== "student" && role !== "teacher" && role !== "admin") {
      wx.showToast({ title: "当前账号无权访问此页面", icon: "none" });
      setTimeout(function () {
        wx.reLaunch({ url: app.landingPath(role) });
      }, 500);
      return;
    }
    this.setData({
      isStudent: role === "student",
      isAdmin: role === "admin"
    });
    this.loadPosts();
    if (role === "student") this.migrateLocalRecords();
  },

  onPullDownRefresh: function () {
    this.loadPosts(function () {
      wx.stopPullDownRefresh();
    });
  },

  /** 拉取共享动态流 */
  loadPosts: function (done) {
    var self = this;
    this.setData({ loading: true, error: "" });
    api
      .getGardenPosts(PAGE_LIMIT)
      .then(function (res) {
        var posts = ((res && res.posts) || []).map(function (row) {
          return self.mapPost(row);
        });
        self.setData({
          loading: false,
          posts: posts,
          total: Number((res && res.total) || posts.length)
        });
        api.track("student_garden_viewed", { meta: { count: posts.length, role: app.globalData.role } });
      })
      .catch(function () {
        self.setData({ loading: false, error: "学习成果加载失败" });
      })
      .then(function () {
        if (done) done();
      });
  },

  /** 后端行 → 朋友圈式卡片数据 */
  mapPost: function (row) {
    var images = ((row && row.images) || [])
      .map(function (image, index) {
        return { id: String(row.id) + "-" + index, url: (image && image.url) || "" };
      })
      .filter(function (image) { return !!image.url; });
    return {
      id: row.id,
      name: row.student_name || row.display_name || "同学",
      grade: row.grade || "",
      // 本人动态允许回退到本机头像缓存（服务端同步失败时也能看到自己的头像）
      avatar: avatar.resolve(
        { id: row.student_user_id, role: "student", avatarUrl: row.avatar_url || "" },
        !!row.mine
      ),
      content: row.content || "",
      images: images,
      // 微信朋友圈排布：1 张大图、2/4 张两列、3 张及以上三列
      grid: images.length === 1 ? "one" : (images.length === 2 || images.length === 4 ? "two" : "three"),
      timeText: util.fromNow(row.created_at),
      canDelete: !!row.mine || this.data.isAdmin
    };
  },

  goPublish: function () {
    wx.navigateTo({ url: "/pages/student/garden-publish/garden-publish" });
  },

  previewImage: function (e) {
    var current = e.currentTarget.dataset.url;
    var urls = [];
    for (var i = 0; i < this.data.posts.length; i++) {
      var images = this.data.posts[i].images || [];
      if (images.some(function (image) { return image.url === current; })) {
        urls = images.map(function (image) { return image.url; });
        break;
      }
    }
    if (current && urls.length) wx.previewImage({ current: current, urls: urls });
  },

  deletePost: function (e) {
    var self = this;
    var id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.showModal({
      title: "删除这条成果？",
      content: "删除后所有同学都看不到了，且无法恢复。",
      confirmText: "删除",
      confirmColor: "#b42318",
      success: function (result) {
        if (!result.confirm) return;
        api
          .deleteGardenPost(id)
          .then(function () {
            self.setData({
              posts: self.data.posts.filter(function (item) { return Number(item.id) !== id; }),
              total: Math.max(0, self.data.total - 1)
            });
            wx.showToast({ title: "已删除", icon: "success" });
          })
          .catch(function () {});
      }
    });
  },

  /**
   * 把改造前存在本机的旧成果同步到服务端（一次性，逐条进行）。
   * 迁移成功才从本机删除：中途失败则保留剩余数据，下次进入继续。
   */
  migrateLocalRecords: function () {
    var self = this;
    if (this.migrating) return;
    var records = garden.readRecords();
    if (!records.length) return;
    this.migrating = true;

    // readRecords 按时间倒序，迁移时从最早的一条开始，保证园地里的先后顺序不变
    var queue = records.slice().reverse().slice(0, MIGRATE_BATCH);
    var chain = Promise.resolve(0);
    queue.forEach(function (record) {
      chain = chain.then(function (migrated) {
        return self.uploadLocalImages(record).then(function (images) {
          return api.createGardenPost({ content: record.content || "", images: images }).then(function () {
            garden.removeRecord(record.id);
            // 已经同步到服务端，回收本机图片文件，避免占用小程序缓存
            (record.images || []).forEach(garden.removeLocalImage);
            return migrated + 1;
          });
        });
      });
    });

    chain
      .then(function (count) {
        self.migrating = false;
        if (count > 0) self.loadPosts();
      })
      .catch(function () {
        self.migrating = false;
      });
  },

  /** 旧成果里的图片是本机文件路径，需先上传换成服务端可共享的地址 */
  uploadLocalImages: function (record) {
    var images = (record && record.images) || [];
    var attachments = [];
    var sequence = Promise.resolve();
    images.forEach(function (image) {
      sequence = sequence.then(function () {
        if (!image || !image.url) return null;
        return api
          .uploadAttachment(image.url, { purpose: "learning_garden", name: image.name || "学习图片" })
          .then(function (attachment) {
            attachments.push(attachment);
          })
          .catch(function () {
            // 单张图片丢失（用户清理过缓存）不影响整条成果迁移
          });
      });
    });
    return sequence.then(function () {
      return attachments;
    });
  }
});
