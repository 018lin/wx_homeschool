var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

/**
 * 任务分类 → 语义色键（与任务看板 pages/admin/tasks 保持一致）
 */
function getTypeKey(type) {
  if (!type) return "default";
  var t = String(type);
  if (/情绪|情感|心情|社交|人际|友谊|交往|关系/.test(t)) return "emotion";
  if (/观察|探究|实验|调研|调查|研究|发现|探索|科学/.test(t)) return "observation";
  if (/运动|体育|体能|户外|跑步|跳跃|健身|游戏|玩耍|锻炼/.test(t)) return "sport";
  return "default";
}

/** 完成度 → 状态文案与徽标样式 */
function buildStatus(rate, targetCount) {
  if (!targetCount) return { text: "暂无学生", cls: "badge-gray", key: "none" };
  if (rate >= 100) return { text: "已全部完成", cls: "badge-success", key: "done" };
  if (rate > 0) return { text: "进行中", cls: "badge-primary", key: "ongoing" };
  return { text: "尚未开始", cls: "badge-gray", key: "none" };
}

/**
 * 管理员端 · 任务详情
 * ---------------------------------------------------------------------------
 * 由任务看板（pages/admin/tasks）点击任务卡片跳转而来，通过 query 传 id。
 * 展示任务完整内容（目标 / 步骤 / 对话提示 / 材料 / 提交要求 / 兜底方案）
 * 与完成度（百分比进度 + 状态标识），并提供返回任务看板的入口。
 */
Page({
  data: {
    id: null,
    loading: true,
    error: "",
    notFound: false,
    task: null,
    statusText: "",
    statusCls: "",
    statusKey: "none",
    heroSub: ""
  },

  onLoad: function (options) {
    var id = Number(options && options.id);
    if (!id || isNaN(id) || id <= 0) {
      this.setData({ loading: false, notFound: true, heroSub: "任务不存在" });
      return;
    }
    this.setData({ id: id });
  },

  onShow: function () {
    // 全局守卫（app.js 的 installPageGuard）已拦截未登录与非管理员角色，
    // 这里只处理业务异常：参数缺失时不发请求
    if (!this.data.id) return;
    this.loadData();
  },

  onPullDownRefresh: function () {
    if (!this.data.id) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadData(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadData: function (done) {
    var self = this;
    this.setData({ loading: true, error: "", notFound: false });
    api
      .getAdminTaskDetail(this.data.id)
      .then(function (res) {
        var t = (res && res.task) || null;
        if (!t) {
          self.setData({ loading: false, notFound: true, task: null, heroSub: "任务不存在" });
          if (done) done();
          return;
        }

        var targetCount = Number(t.targetCount || 0);
        var completedCount = Number(t.completedCount || 0);
        var draftCount = Number(t.draftCount || 0);
        var rate = targetCount ? Math.round(completedCount / targetCount * 100) : 0;
        var status = buildStatus(rate, targetCount);

        self.setData({
          loading: false,
          notFound: false,
          error: "",
          heroSub: status.text + " · 完成 " + completedCount + "/" + targetCount + " 人",
          statusText: status.text,
          statusCls: status.cls,
          statusKey: status.key,
          task: {
            id: t.id,
            title: t.title || "",
            type: t.type || "",
            typeKey: getTypeKey(t.type),
            weekStart: t.weekStart || "",
            createdAt: util.formatDateTime(t.createdAt),
            duration: t.duration || "",
            difficulty: t.difficulty || "",
            goal: t.goal || "",
            steps: t.steps || "",
            dialogueTips: t.dialogueTips || "",
            materials: t.materials || "",
            submitHint: t.submitHint || "",
            fallbackPlan: t.fallbackPlan || "",
            scope: t.scope || "",
            studentName: t.studentName || "",
            publisherName: t.publisherName || "",
            targetCount: targetCount,
            completedCount: completedCount,
            draftCount: draftCount,
            completionRate: rate,
            donutDeg: Math.max(0, Math.min(360, rate * 3.6)),
            details: (t.details || []).map(function (d) {
              return {
                studentId: d.studentId,
                studentName: d.studentName || "",
                grade: d.grade || "",
                status: d.status || "not_started",
                statusText: d.status === "completed" ? "已完成" : d.status === "draft" ? "草稿" : "未开始",
                statusCls: d.status === "completed" ? "badge-teal" : d.status === "draft" ? "badge-warning" : "badge-gray",
                content: d.content || "",
                submittedAt: util.formatDateTime(d.submittedAt),
                subType: util.subTypeLabel(d.subType)
              };
            })
          }
        });
        if (done) done();
      })
      .catch(function (error) {
        var status = error && error.status;
        // 404：任务已被删除或 id 非法，展示兜底空态而不是报错页
        if (status === 404) {
          self.setData({ loading: false, notFound: true, task: null, heroSub: "任务不存在" });
          if (done) done();
          return;
        }
        self.setData({
          loading: false,
          error: (error && error.message) || "任务详情加载失败",
          heroSub: "加载失败"
        });
        if (done) done();
      });
  },

  onRetry: function () {
    this.loadData();
  },

  /** 兜底也返回看板，保证用户始终有明确出口 */
  goTasks: function () {
    wx.navigateBack({
      delta: 1,
      fail: function () {
        wx.redirectTo({ url: "/pages/admin/tasks/tasks" });
      }
    });
  }
});
