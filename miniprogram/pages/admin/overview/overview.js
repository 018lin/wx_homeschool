var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

function emptyClassForm() {
  return { id: null, name: "", grade: "", headTeacherId: null };
}

Page({
  data: {
    loading: true,
    stats: null,
    generatedAt: "",
    // 页头由全局 app-header 组件渲染，状态栏安全距离由组件内部计算
    heroSub: "家校共育 · 让成长被看见",
    // 学生「我的小心事」未读条数，用于首页顶部板块
    worriesNewCount: 0,
    // 家长「成长关注」未读条数，用于首页顶部板块
    concernsNewCount: 0,
    // 已有班级列表与详情/编辑弹窗
    classes: [],
    classesLoading: true,
    teacherOptions: [],
    classModalVisible: false,
    activeClass: null,
    classEditMode: false,
    classForm: emptyClassForm(),
    classSubmitting: false
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    if (app.globalData.role !== "admin") {
      wx.showToast({ title: "仅管理员账号可访问", icon: "none" });
      setTimeout(function () {
        wx.redirectTo({ url: app.landingPath(app.globalData.role) });
      }, 800);
      return;
    }
    this.loadData();
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadData(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadData: function (done) {
    var self = this;
    this.setData({ loading: true });
    api
      .getAdminOverview()
      .then(function (res) {
        if (!res) return;
        // 只保留概览统计所需字段，减少 setData 数据量
        self.setData(
          {
            loading: false,
            generatedAt: util.formatDateTime(res.generatedAt),
            stats: res.stats || null
          },
          function () {
            self.syncHeroSub();
          }
        );
        if (done) done();
      })
      .catch(function () {
        self.setData({ loading: false });
        if (done) done();
      });
    this.loadClasses();
    this.loadWorries();
    this.loadConcerns();
  },

  /** 顶部板块：学生小心事未读条数（静默失败，不影响首页其他内容） */
  loadWorries: function () {
    var self = this;
    api
      .getAdminWorries(1)
      .then(function (res) {
        self.setData({ worriesNewCount: Number((res && res.newCount) || 0) });
      })
      .catch(function () {
        self.setData({ worriesNewCount: 0 });
      });
  },

  /** 顶部板块：家长成长关注未读条数（静默失败，不影响首页其他内容） */
  loadConcerns: function () {
    var self = this;
    api
      .getAdminParentTaskRequests(1)
      .then(function (res) {
        self.setData({ concernsNewCount: Number((res && res.newCount) || 0) });
      })
      .catch(function () {
        self.setData({ concernsNewCount: 0 });
      });
  },

  /** 加载已有班级（含教师账号，供弹窗内编辑负责教师） */
  loadClasses: function () {
    var self = this;
    this.setData({ classesLoading: true });
    api
      .getAdminClasses()
      .then(function (res) {
        var classes = (res && res.classes) || [];
        var teachers = (res && res.accounts && res.accounts.teachers) || [];
        var patch = {
          classesLoading: false,
          classes: classes,
          teacherOptions: teachers
        };
        // 弹窗处于打开状态时，同步最新数据，保证编辑后详情即时刷新
        var active = self.data.activeClass;
        if (active) {
          var latest = classes.filter(function (c) {
            return c.id === active.id;
          })[0];
          if (latest) patch.activeClass = latest;
        }
        self.setData(patch, function () {
          self.syncHeroSub();
        });
      })
      .catch(function () {
        self.setData({ classesLoading: false });
      });
  },

  /** 头图副标题：概括全校规模，无数据时回落到品牌标语 */
  syncHeroSub: function () {
    var stats = this.data.stats;
    var classes = this.data.classes || [];
    var parts = [];
    if (classes.length) parts.push(classes.length + " 个班级");
    if (stats && stats.studentCount) parts.push(stats.studentCount + " 名学生");
    this.setData({
      heroSub: parts.length ? parts.join(" · ") : "家校共育 · 让成长被看见"
    });
  },

  /** 毛玻璃首页键：回到当前角色的工作台首页（已在首页则回到顶部） */
  goAccounts: function () {
    wx.navigateTo({ url: "/pages/admin/accounts/accounts" });
  },
  goClasses: function () {
    wx.navigateTo({ url: "/pages/admin/classes/classes" });
  },
  /** 顶部板块：进入学生小心事详情 */
  goWorries: function () {
    wx.navigateTo({ url: "/pages/admin/worries/worries" });
  },
  /** 顶部板块：进入家长成长关注详情 */
  goConcerns: function () {
    wx.navigateTo({ url: "/pages/admin/concerns/concerns" });
  },
  /** 学习园地：全校学生发布的学习成果，管理员可浏览并删除不当内容 */
  goGarden: function () {
    wx.navigateTo({ url: "/pages/garden/garden" });
  },

  /* ---------- 班级详情弹窗 ---------- */
  openClassModal: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var item = (this.data.classes || []).filter(function (c) {
      return c.id === id;
    })[0];
    if (!item) return;
    this.setData({
      classModalVisible: true,
      activeClass: item,
      classEditMode: false,
      classForm: emptyClassForm()
    });
  },

  closeClassModal: function () {
    this.setData({
      classModalVisible: false,
      activeClass: null,
      classEditMode: false,
      classForm: emptyClassForm(),
      classSubmitting: false
    });
  },

  /** 阻止弹窗内点击/滚动冒泡（空实现） */
  noop: function () {},

  openClassEdit: function () {
    var c = this.data.activeClass;
    if (!c) return;
    this.setData({
      classEditMode: true,
      classForm: {
        id: c.id,
        name: c.name || "",
        grade: c.grade || "",
        headTeacherId: c.headTeacherId || null
      }
    });
  },

  cancelClassEdit: function () {
    this.setData({ classEditMode: false, classForm: emptyClassForm() });
  },

  onClassFormInput: function (e) {
    var patch = {};
    patch["classForm." + e.currentTarget.dataset.key] = e.detail.value;
    this.setData(patch);
  },

  pickClassHeadTeacher: function (e) {
    this.setData({ "classForm.headTeacherId": Number(e.currentTarget.dataset.id) });
  },

  submitClassEdit: function () {
    var self = this;
    var form = this.data.classForm;
    var cls = this.data.activeClass;
    if (!cls) return;
    if (!String(form.name || "").trim()) {
      wx.showToast({ title: "请填写班级名称", icon: "none" });
      return;
    }
    if (!form.headTeacherId) {
      wx.showToast({ title: "请选择负责教师", icon: "none" });
      return;
    }
    // 保留现有成员名单，仅更新基本信息与负责教师
    var teacherIds = (cls.teachers || []).map(function (t) {
      return t.id;
    });
    if (teacherIds.indexOf(form.headTeacherId) < 0) teacherIds.push(form.headTeacherId);
    var payload = {
      name: String(form.name).trim(),
      grade: String(form.grade || "").trim(),
      headTeacherId: form.headTeacherId,
      teacherIds: teacherIds,
      studentIds: (cls.students || []).map(function (s) {
        return s.id;
      }),
      parentIds: (cls.parents || []).map(function (p) {
        return p.id;
      })
    };
    this.setData({ classSubmitting: true });
    api
      .updateClass(form.id, payload)
      .then(function () {
        self.setData({ classSubmitting: false, classEditMode: false });
        wx.showToast({ title: "已保存修改", icon: "success" });
        // 重新加载班级列表，同步列表与弹窗内的详情
        self.loadClasses();
      })
      .catch(function () {
        self.setData({ classSubmitting: false });
      });
  }
});
