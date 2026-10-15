var app = getApp();

/**
 * 全局沉浸式页头（与管理员工作台 pages/admin/overview 一脉相承）
 * ---------------------------------------------------------------------------
 * 所有页面统一 navigationStyle: custom 后，顶部导航栏由本组件接管：
 *   - variant="hero"  渐变弧形头图（默认），用于绝大多数内容页
 *   - variant="flat"  渐变但底部不裁弧，用于全屏对话页（chat / ai）
 *   - variant="ghost" 透明占位，仅撑出状态栏高度，用于登录页等自带背景的页面
 *
 * 组件内部自行完成状态栏安全距离与微信胶囊避让的计算，
 * 页面无需再重复写 statusBarHeight / barHeight / capsuleGap。
 */
Component({
  properties: {
    // 主标题
    title: { type: String, value: "" },
    // 副标题（可为空）
    sub: { type: String, value: "" },
    // 左侧按钮形态：home 首页键 / back 返回键 / none 无按钮
    mode: { type: String, value: "home" },
    // 头部形态：hero 弧形 / flat 平底 / ghost 透明占位
    variant: { type: String, value: "hero" }
  },

  data: {
    statusBarHeight: 20,
    barHeight: 44,
    capsuleGap: 96
  },

  lifetimes: {
    attached: function () {
      this.measure();
    }
  },

  methods: {
    /** 测量状态栏高度、导航条高度与右侧胶囊避让宽度 */
    measure: function () {
      var info = null;
      try {
        info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      } catch (e) {
        info = null;
      }
      var patch = {
        statusBarHeight: (info && info.statusBarHeight) || 20,
        barHeight: 44,
        capsuleGap: 96
      };
      try {
        var rect = wx.getMenuButtonBoundingClientRect();
        if (rect && rect.width) {
          var windowWidth = (info && info.windowWidth) || 375;
          patch.barHeight = (rect.bottom - rect.top) || 32;
          patch.capsuleGap = Math.max(0, Math.round(windowWidth - rect.left + 8));
        }
      } catch (e) {}
      this.setData(patch);
    },

    onTapNav: function () {
      if (this.data.mode === "back") {
        this.goBack();
        return;
      }
      if (this.data.mode === "home") {
        this.goHome();
      }
    },

    /** 返回：栈内有上一页就返回，否则回到本角色工作台 */
    goBack: function () {
      var pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 });
        return;
      }
      wx.reLaunch({ url: app.landingPath(app.globalData.role) });
    },

    /** 首页：已在工作台则回到顶部，否则重定向到本角色工作台 */
    goHome: function () {
      var target = app.landingPath(app.globalData.role);
      var pages = getCurrentPages();
      var current = pages.length ? "/" + pages[pages.length - 1].route : "";
      if (current === target) {
        wx.pageScrollTo({ scrollTop: 0, duration: 200 });
        return;
      }
      wx.reLaunch({ url: target });
    }
  }
});