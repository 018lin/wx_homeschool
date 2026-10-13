/* 各角色底部导航 */
var TABS = {
  parent: [
    { key: "home", label: "首页", url: "/pages/parent/home/home" },
    { key: "feedback", label: "教师反馈", url: "/pages/parent/feedback/feedback" },
    { key: "timeline", label: "成长档案", url: "/pages/parent/timeline/timeline" },
    { key: "concern", label: "成长关注", url: "/pages/parent/concern/concern" },
    { key: "mine", label: "我的", url: "/pages/mine/mine" }
  ],
  student: [
    { key: "home", label: "我的任务", url: "/pages/student/home/home" },
    { key: "mine", label: "我的", url: "/pages/mine/mine" }
  ],
  teacher: [
    { key: "workbench", label: "工作台", url: "/pages/teacher/workbench/workbench" },
    { key: "students", label: "学生", url: "/pages/teacher/students/students" },
    { key: "submissions", label: "批阅", url: "/pages/teacher/submissions/submissions" },
    { key: "overview", label: "班级", url: "/pages/teacher/overview/overview" },
    { key: "mine", label: "我的", url: "/pages/mine/mine" }
  ],
  admin: [
    { key: "overview", label: "概览", url: "/pages/admin/overview/overview" },
    { key: "accounts", label: "账号", url: "/pages/admin/accounts/accounts" },
    { key: "tasks", label: "任务", url: "/pages/admin/tasks/tasks" },
    { key: "timeline", label: "时间线", url: "/pages/admin/timeline/timeline" },
    { key: "ai", label: "AI 洞察", url: "/pages/teacher/ai/ai" },
    { key: "students", label: "学生档案", url: "/pages/teacher/students/students" },
    { key: "mine", label: "我的", url: "/pages/mine/mine" }
  ]
};

Component({
  properties: {
    role: { type: String, value: "" },
    active: { type: String, value: "" }
  },

  data: {
    tabs: []
  },

  observers: {
    role: function (role) {
      this.setData({ tabs: TABS[role] || [] });
    }
  },

  methods: {
    onTap: function (e) {
      var item = e.currentTarget.dataset.item;
      if (!item || item.key === this.data.active) return;
      wx.redirectTo({
        url: item.url,
        fail: function () {
          wx.switchTab({ url: item.url, fail: function () {} });
        }
      });
    }
  }
});
