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
    childNames: [],
    childIndex: 0,
    childId: null,
    allItems: [],
    items: [],
    typeOptions: ["全部类型"],
    typeIndex: 0
  },

  onShow: function () {
    if (!app.isLogin()) return;
    this.loadChildrenAndFeedback();
  },

  onPullDownRefresh: function () {
    var self = this;
    this.setData({ refreshing: true });
    this.loadChildrenAndFeedback().then(function () {
      self.setData({ refreshing: false });
      wx.stopPullDownRefresh();
    });
  },

  loadChildrenAndFeedback: function () {
    var self = this;
    this.setData({ loading: true, error: "" });
    return api.getHome(this.data.childId || app.getChildId()).then(function (home) {
      var children = (home && home.children) || [];
      var selected = home && home.child;
      if (!selected && children.length) selected = children[0];
      if (!selected) {
        self.setData({ loading: false, children: [], childNames: [], allItems: [], items: [] });
        return null;
      }
      app.setChildId(selected.id);
      var index = children.findIndex(function (child) { return Number(child.id) === Number(selected.id); });
      self.setData({
        children: children,
        childNames: children.map(function (child) { return child.name + (child.grade ? " · " + child.grade : ""); }),
        childIndex: index < 0 ? 0 : index,
        childId: selected.id
      });
      return self.loadFeedback(selected.id);
    }).catch(function (error) {
      self.setData({ loading: false, error: (error && error.message) || "教师反馈加载失败" });
    });
  },

  loadFeedback: function (childId) {
    var self = this;
    return api.getTimeline(childId).then(function (res) {
      var feedbackItems = ((res && res.items) || []).filter(function (item) {
        return item.timeline_type === "submission" && item.feedback_id && String(item.feedback_comment || "").trim();
      }).map(function (item) {
        return {
          id: item.id + "-" + item.feedback_id,
          taskTitle: item.title || "成长任务",
          taskType: item.task_type || "其他",
          taskContent: item.content || "（本次没有文字记录）",
          teacherName: item.teacher_name || "老师",
          feedbackTime: util.formatDateTime(item.feedback_at || item.created_at),
          feedbackRelative: util.fromNow(item.feedback_at || item.created_at),
          comment: item.feedback_comment || "",
          tags: util.parseTags(item.feedback_tags)
        };
      });
      var types = [];
      feedbackItems.forEach(function (item) {
        if (types.indexOf(item.taskType) < 0) types.push(item.taskType);
      });
      self.setData({
        loading: false,
        error: "",
        allItems: feedbackItems,
        typeOptions: ["全部类型"].concat(types),
        typeIndex: 0,
        items: feedbackItems
      });
      api.track("feedback_page_viewed", { childId: childId, meta: { count: feedbackItems.length } });
      if (feedbackItems.length) {
        api.track("feedback_read", {
          childId: childId,
          meta: { feedbackIds: feedbackItems.map(function (item) { return item.id; }) }
        });
      }
    }).catch(function (error) {
      self.setData({ loading: false, error: (error && error.message) || "教师反馈加载失败" });
    });
  },

  onPickChild: function (e) {
    var index = Number(e.detail.value) || 0;
    var child = this.data.children[index];
    if (!child) return;
    app.setChildId(child.id);
    this.setData({ childIndex: index, childId: child.id, loading: true, error: "" });
    this.loadFeedback(child.id);
  },

  onPickType: function (e) {
    var index = Number(e.detail.value) || 0;
    var type = this.data.typeOptions[index];
    var items = index === 0 ? this.data.allItems : this.data.allItems.filter(function (item) {
      return item.taskType === type;
    });
    this.setData({ typeIndex: index, items: items });
  },

  onRetry: function () {
    this.loadChildrenAndFeedback();
  }
});
