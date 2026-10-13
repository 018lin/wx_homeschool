var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

Page({
  data: {
    loading: true,
    refreshing: false,
    error: "",
    children: [],
    childNames: ["全部孩子"],
    childIndex: 0,
    childId: null,
    rangeNames: ["近 30 天", "近 90 天", "全部"],
    rangeDays: [30, 90, 0],
    rangeIndex: 1,
    kind: "all",
    allItems: [],
    items: [],
    stats: null,
    trend: [],
    trendTotal: 0,
    ranking: [],
    generatedAt: ""
  },

  onShow: function () { if (app.isLogin()) this.loadData(); },
  onPullDownRefresh: function () { var self = this; this.loadData().then(function () { wx.stopPullDownRefresh(); self.setData({ refreshing: false }); }); },

  loadData: function () {
    var self = this;
    if (this.data.refreshing) return Promise.resolve();
    this.setData({ loading: !this.data.allItems.length, refreshing: true, error: "" });
    return api.getAdminTimeline(null, 500).then(function (res) {
      var children = res.children || [];
      var items = (res.items || []).map(function (item) {
        var feedback = item.feedback;
        return {
          id: item.id,
          childId: item.childId,
          kind: item.kind,
          kindLabel: item.kindLabel || "",
          kindCls: item.kind === "observation" ? "badge-teal" : "badge-primary",
          studentName: item.studentName || "",
          grade: item.grade || "",
          title: item.title || "",
          taskType: item.taskType || "",
          content: item.content || "",
          analysis: item.analysis || "",
          teacherName: item.teacherName || "",
          rawCreatedAt: item.createdAt,
          createdAt: util.formatDateTime(item.createdAt),
          tags: util.parseTags(item.tags),
          feedback: feedback ? {
            comment: feedback.comment || "",
            tags: util.parseTags(feedback.tags),
            teacherName: feedback.teacherName || "",
            createdAt: util.formatDateTime(feedback.createdAt)
          } : null
        };
      });
      self.setData({
        loading: false,
        refreshing: false,
        generatedAt: util.formatDateTime(res.generatedAt),
        children: children,
        childNames: ["全部孩子"].concat(children.map(function (child) { return child.name + (child.grade ? " · " + child.grade : ""); })),
        allItems: items
      }, function () { self.applyFilters(); });
    }).catch(function (error) {
      self.setData({ loading: false, refreshing: false, error: (error && error.message) || "成长时间线加载失败" });
    });
  },

  applyFilters: function () {
    var self = this;
    var childId = this.data.childId;
    var kind = this.data.kind;
    var days = this.data.rangeDays[this.data.rangeIndex];
    var cutoff = days ? Date.now() - days * 86400000 : 0;
    var items = this.data.allItems.filter(function (item) {
      if (childId && Number(item.childId) !== Number(childId)) return false;
      if (kind !== "all" && item.kind !== kind) return false;
      if (cutoff && util.parseTime(item.rawCreatedAt) < cutoff) return false;
      return true;
    });
    var students = {};
    items.forEach(function (item) { if (item.childId) students[item.childId] = true; });
    this.setData({
      items: items,
      stats: {
        timelineCount: items.length,
        activeStudentCount: Object.keys(students).length,
        submissionCount: items.filter(function (item) { return item.kind === "submission"; }).length,
        observationCount: items.filter(function (item) { return item.kind === "observation"; }).length,
        feedbackCount: items.filter(function (item) { return !!item.feedback; }).length
      },
      trend: self.buildTrend(items),
      trendTotal: items.filter(function (item) { return util.parseTime(item.rawCreatedAt) >= Date.now() - 7 * 86400000; }).length,
      ranking: self.buildRanking(items)
    });
  },

  buildTrend: function (items) {
    var days = [];
    var max = 1;
    for (var offset = 6; offset >= 0; offset--) {
      var date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      var next = date.getTime() + 86400000;
      var count = items.filter(function (item) {
        var time = util.parseTime(item.rawCreatedAt);
        return time >= date.getTime() && time < next;
      }).length;
      max = Math.max(max, count);
      days.push({ label: (date.getMonth() + 1) + "/" + date.getDate(), count: count, height: 0 });
    }
    return days.map(function (day) { day.height = Math.max(6, Math.round(day.count / max * 100)); return day; });
  },

  buildRanking: function (items) {
    var counts = {};
    items.forEach(function (item) {
      if (!item.childId) return;
      var key = String(item.childId);
      if (!counts[key]) counts[key] = { childId: item.childId, name: item.studentName || "学生", count: 0 };
      counts[key].count++;
    });
    var rows = Object.keys(counts).map(function (key) { return counts[key]; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8);
    var max = rows.length ? rows[0].count : 1;
    return rows.map(function (row, index) { row.rank = index + 1; row.percent = Math.round(row.count / max * 100); return row; });
  },

  onPickChild: function (e) {
    var index = Number(e.detail.value) || 0;
    this.setData({ childIndex: index, childId: index ? this.data.children[index - 1].id : null });
    this.applyFilters();
  },
  onPickRange: function (e) { this.setData({ rangeIndex: Number(e.detail.value) || 0 }); this.applyFilters(); },
  switchKind: function (e) { this.setData({ kind: e.currentTarget.dataset.kind }); this.applyFilters(); },
  onRefresh: function () { this.loadData(); },
  onRetry: function () { this.loadData(); }
});
