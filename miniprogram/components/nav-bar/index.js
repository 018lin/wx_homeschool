/* 各角色底部导航 */
var TABS = {
  parent: [
    { key: "home", label: "首页", url: "/pages/parent/home/home" },
    { key: "feedback", label: "教师反馈", url: "/pages/parent/feedback/feedback" },
    { key: "timeline", label: "成长档案", url: "/pages/parent/timeline/timeline" },
    { key: "messages", label: "交流", url: "/pages/messages/messages" },
    { key: "mine", label: "我的", url: "/pages/mine/mine" }
  ],
  student: [
    { key: "home", label: "我的任务", url: "/pages/student/home/home" },
    { key: "messages", label: "交流", url: "/pages/messages/messages" },
    { key: "mine", label: "我的", url: "/pages/mine/mine" }
  ],
  teacher: [
    { key: "workbench", label: "工作台", url: "/pages/teacher/workbench/workbench" },
    { key: "students", label: "学生", url: "/pages/teacher/students/students" },
    { key: "submissions", label: "批阅", url: "/pages/teacher/submissions/submissions" },
    { key: "overview", label: "班级", url: "/pages/teacher/overview/overview" },
    { key: "messages", label: "交流", url: "/pages/messages/messages" },
    { key: "mine", label: "我的", url: "/pages/mine/mine" }
  ],
  /* 管理员端：入口从 7 项收敛为 5 项，图标 + 文案，AI 洞察居中微凸起 */
  admin: [
    { key: "overview", label: "概览", icon: "grid", url: "/pages/admin/overview/overview" },
    { key: "tasks", label: "任务", icon: "list", url: "/pages/admin/tasks/tasks" },
    { key: "ai", label: "AI 洞察", icon: "ai", url: "/pages/teacher/ai/ai", center: true },
    { key: "contact", label: "家校交流", icon: "talk", url: "/pages/messages/messages" },
    { key: "mine", label: "我的", icon: "user", url: "/pages/mine/mine" }
  ]
};

Component({
  properties: {
    role: { type: String, value: "" },
    active: { type: String, value: "" }
  },

  data: {
    tabs: [],
    iconMode: false
  },

  observers: {
    role: function (role) {
      var tabs = TABS[role] || [];
      this.setData({
        tabs: tabs,
        iconMode: tabs.some(function (item) {
          return !!item.icon;
        })
      });
    }
  },

  methods: {
    onTap: function (e) {
      var item = e.currentTarget.dataset.item;
      if (!item || item.key === this.data.active) return;
      if (!item.url) return;
      wx.redirectTo({
        url: item.url,
        fail: function () {
          wx.switchTab({ url: item.url, fail: function () {} });
        }
      });
    }
  }
});
