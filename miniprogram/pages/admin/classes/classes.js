var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;

function emptyForm() {
  return {
    name: "",
    grade: "",
    headTeacherId: null,
    teacherIds: [],
    studentIds: [],
    parentIds: []
  };
}

function toggleId(list, id) {
  var next = (list || []).slice();
  var idx = next.indexOf(id);
  if (idx >= 0) next.splice(idx, 1);
  else next.push(id);
  return next;
}

Page({
  data: {
    loading: true,
    error: "",
    classes: [],
    accounts: { teachers: [], students: [], parents: [] },
    headTeacherOptions: [],
    teacherOptions: [],
    studentOptions: [],
    parentOptions: [],
    mode: null,
    form: emptyForm(),
    submitting: false,
    expandedId: null
  },

  onLoad: function (options) {
    this.pendingCreate = !!(options && String(options.create) === "1");
  },

  onShow: function () {
    if (!app.isLogin()) {
      wx.redirectTo({ url: "/pages/login/login" });
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
    this.setData({ loading: true, error: "" });
    api
      .getAdminClasses()
      .then(function (res) {
        var accounts = (res && res.accounts) || { teachers: [], students: [], parents: [] };
        self.setData(
          {
            loading: false,
            classes: (res && res.classes) || [],
            accounts: accounts
          },
          function () {
            self.refreshOptions();
            if (self.pendingCreate) {
              self.pendingCreate = false;
              self.openCreate();
            }
            if (done) done();
          }
        );
      })
      .catch(function (error) {
        self.setData({ loading: false, error: (error && error.message) || "班级数据加载失败" });
        if (done) done();
      });
  },

  refreshOptions: function () {
    var form = this.data.form;
    var accounts = this.data.accounts || {};
    function mark(list, ids, decorate) {
      var set = {};
      (ids || []).forEach(function (id) {
        set[id] = true;
      });
      return (list || []).map(function (item) {
        var option = Object.assign({}, item);
        if (decorate) decorate(option, item);
        option.selected = !!set[item.id];
        return option;
      });
    }
    this.setData({
      headTeacherOptions: (accounts.teachers || []).map(function (item) {
        return Object.assign({}, item, { active: item.id === form.headTeacherId });
      }),
      teacherOptions: mark(accounts.teachers, form.teacherIds, function (option, item) {
        option.desc = item.subject || item.account || "";
      }),
      studentOptions: mark(accounts.students, form.studentIds, function (option, item) {
        option.desc = item.grade ? item.grade : item.account || "";
      }),
      parentOptions: mark(accounts.parents, form.parentIds, function (option, item) {
        option.desc = item.childLabel || item.account || "";
      })
    });
  },

  openCreate: function () {
    if (!(this.data.accounts.teachers || []).length) {
      wx.showToast({ title: "请先创建教师账号", icon: "none" });
      return;
    }
    this.setData({ mode: "create", form: emptyForm(), expandedId: null }, this.refreshOptions.bind(this));
  },

  closeForm: function () {
    this.setData({ mode: null, form: emptyForm() });
  },

  onFormInput: function (e) {
    var patch = {};
    patch["form." + e.currentTarget.dataset.key] = e.detail.value;
    this.setData(patch);
  },

  pickHeadTeacher: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var form = Object.assign({}, this.data.form);
    form.headTeacherId = id;
    // 负责教师自动纳入任课教师
    if (form.teacherIds.indexOf(id) < 0) form.teacherIds = form.teacherIds.concat([id]);
    this.setData({ form: form }, this.refreshOptions.bind(this));
  },

  toggleTeacher: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var wasSelected = this.data.form.teacherIds.indexOf(id) >= 0;
    var form = Object.assign({}, this.data.form);
    form.teacherIds = toggleId(form.teacherIds, id);
    if (wasSelected && form.headTeacherId === id) form.headTeacherId = null;
    this.setData({ form: form }, this.refreshOptions.bind(this));
  },

  toggleStudent: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var form = Object.assign({}, this.data.form);
    form.studentIds = toggleId(form.studentIds, id);
    this.setData({ form: form }, this.refreshOptions.bind(this));
  },

  toggleParent: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var form = Object.assign({}, this.data.form);
    form.parentIds = toggleId(form.parentIds, id);
    this.setData({ form: form }, this.refreshOptions.bind(this));
  },

  toggleClass: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    this.setData({ expandedId: this.data.expandedId === id ? null : id });
  },

  onSubmit: function () {
    var self = this;
    var form = this.data.form;
    if (!String(form.name || "").trim()) {
      wx.showToast({ title: "请填写班级名称", icon: "none" });
      return;
    }
    if (!form.headTeacherId) {
      wx.showToast({ title: "请选择负责教师", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    api
      .createClass({
        name: String(form.name).trim(),
        grade: String(form.grade || "").trim(),
        headTeacherId: form.headTeacherId,
        teacherIds: form.teacherIds,
        studentIds: form.studentIds,
        parentIds: form.parentIds
      })
      .then(function () {
        self.setData({ submitting: false, mode: null, form: emptyForm() });
        wx.showToast({ title: "已创建班级", icon: "success" });
        self.loadData();
      })
      .catch(function () {
        self.setData({ submitting: false });
      });
  },

  onRetry: function () {
    this.loadData();
  }
});
