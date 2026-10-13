/**
 * 家校共育系统 · 小程序入口
 */

var request = require("./utils/api.js");
var state = require("./utils/state.js");

App({
  globalData: {
    token: "",
    user: null, // { account, displayName, role }
    role: "",
    childId: null, // 家长当前选中的孩子
    landingPath: "" // 各角色工作台路径
  },

  onLaunch: function () {
    var token = request.getToken();
    var user = request.getUser();
    if (token && user && user.role) {
      this.globalData.token = token;
      this.globalData.user = user;
      this.globalData.role = user.role;
      try {
        this.globalData.childId = state.getSelectedChildId();
      } catch (e) {}
    }
  },

  /** 保存登录态 */
  setSession: function (token, user) {
    this.globalData.token = token;
    this.globalData.user = user;
    this.globalData.role = user.role;
    try {
      wx.setStorageSync("token", token);
      wx.setStorageSync("user", user);
    } catch (e) {}
  },

  /** 局部更新当前用户信息（如自定义头像），并同步到本地缓存 */
  updateUser: function (patch) {
    var user = Object.assign({}, this.globalData.user || {}, patch || {});
    this.globalData.user = user;
    if (user.role) this.globalData.role = user.role;
    try {
      wx.setStorageSync("user", user);
    } catch (e) {}
    return user;
  },

  clearSession: function () {
    this.globalData.token = "";
    this.globalData.user = null;
    this.globalData.role = "";
    this.globalData.childId = null;
    request.clearAuth();
    state.clearUserState();
  },

  isLogin: function () {
    return !!(this.globalData.token && this.globalData.user);
  },

  /**
   * 页面统一权限守卫。
   * @param {string|string[]} roles 允许的角色；不传表示只要求登录。
   * @returns {boolean} 当前页面是否可以继续加载。
   */
  requireRole: function (roles) {
    if (!this.isLogin()) {
      wx.reLaunch({ url: "/pages/login/login" });
      return false;
    }
    var allowed = Array.isArray(roles) ? roles : (roles ? [roles] : []);
    var current = String(this.globalData.role || "").trim().toLowerCase();
    if (!allowed.length || allowed.indexOf(current) >= 0) return true;
    wx.showToast({ title: "当前账号无权访问此页面", icon: "none" });
    var target = this.landingPath(current);
    setTimeout(function () { wx.reLaunch({ url: target }); }, 500);
    return false;
  },

  /** 角色 → 工作台路径（role 做归一化，避免大小写/空格/中英文差异导致跳回登录页） */
  landingPath: function (role) {
    var r = String(role || "").trim().toLowerCase();
    var map = {
      parent: "/pages/parent/home/home",
      家长: "/pages/parent/home/home",
      student: "/pages/student/home/home",
      学生: "/pages/student/home/home",
      teacher: "/pages/teacher/workbench/workbench",
      教师: "/pages/teacher/workbench/workbench",
      admin: "/pages/admin/overview/overview",
      管理员: "/pages/admin/overview/overview"
    };
    return map[r] || "/pages/login/login";
  },

  /** 当前选中孩子 id（家长端） */
  setChildId: function (id) {
    this.globalData.childId = id || null;
    state.setSelectedChildId(id || null);
  },

  getChildId: function () {
    if (this.globalData.childId) return this.globalData.childId;
    try {
      return state.getSelectedChildId();
    } catch (e) {
      return null;
    }
  }
});

/*
 * 所有页面都在 onShow 进入业务逻辑前执行权限检查，并统一记录停留时长。
 * 角色按路由推导；教师 AI/学生档案是管理员明确允许访问的只读页面。
 */
(function installPageGuard() {
  if (typeof Page !== "function" || Page.__homeSchoolGuarded) return;
  var nativePage = Page;
  var guardedPage = function (definition) {
    definition = definition || {};
    var originalShow = definition.onShow;
    var originalHide = definition.onHide;
    var originalUnload = definition.onUnload;

    function finishDwell(page) {
      if (!page.__dwellStartAt || page.__dwellSent) return;
      page.__dwellSent = true;
      var durationMs = Date.now() - page.__dwellStartAt;
      if (durationMs < 1000) return;
      request.api.track("page_dwell", {
        meta: { page: page.route || "unknown", durationMs: durationMs, leftAt: new Date().toISOString() }
      });
    }

    definition.onShow = function () {
      var route = this.route || "";
      var roles = null;
      if (route.indexOf("pages/parent/") === 0) roles = ["parent"];
      else if (route.indexOf("pages/student/") === 0) roles = ["student"];
      else if (route === "pages/teacher/ai/ai" || route === "pages/teacher/ai/report/report" || route === "pages/teacher/students/students") roles = ["teacher", "admin"];
      else if (route.indexOf("pages/teacher/") === 0) roles = ["teacher"];
      else if (route.indexOf("pages/admin/") === 0) roles = ["admin"];
      else if (route !== "pages/login/login") roles = [];

      if (route === "pages/login/login") {
        if (typeof originalShow === "function") return originalShow.apply(this, arguments);
        return;
      }
      if (!getApp().requireRole(roles)) return;
      this.__dwellStartAt = Date.now();
      this.__dwellSent = false;
      if (typeof originalShow === "function") return originalShow.apply(this, arguments);
    };
    definition.onHide = function () {
      finishDwell(this);
      if (typeof originalHide === "function") return originalHide.apply(this, arguments);
    };
    definition.onUnload = function () {
      finishDwell(this);
      if (typeof originalUnload === "function") return originalUnload.apply(this, arguments);
    };
    return nativePage(definition);
  };
  guardedPage.__homeSchoolGuarded = true;
  Page = guardedPage;
})();
