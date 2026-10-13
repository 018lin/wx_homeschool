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
    expandedId: null,
    // 编辑模式：当前成员与可添加账号
    editMembers: { teachers: [], students: [], parents: [] },
    addableTeachers: [],
    addableStudents: [],
    addableParents: []
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
            if (self.data.mode === "edit") self.refreshEditMembers();
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

  openEdit: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var item = (this.data.classes || []).filter(function (c) {
      return c.id === id;
    })[0];
    if (!item) return;
    var form = {
      id: item.id,
      name: item.name || "",
      grade: item.grade || "",
      headTeacherId: item.headTeacherId || null,
      teacherIds: (item.teachers || []).map(function (t) {
        return t.id;
      }),
      studentIds: (item.students || []).map(function (s) {
        return s.id;
      }),
      parentIds: (item.parents || []).map(function (p) {
        return p.id;
      })
    };
    this.setData({ mode: "edit", form: form, expandedId: null }, function () {
      this.refreshOptions();
      this.refreshEditMembers();
    }.bind(this));
  },

  closeForm: function () {
    this.setData({
      mode: null,
      form: emptyForm(),
      editMembers: { teachers: [], students: [], parents: [] },
      addableTeachers: [],
      addableStudents: [],
      addableParents: []
    });
  },

  /** 编辑模式：按表单中的成员名单计算「当前成员」与「可添加账号」 */
  refreshEditMembers: function () {
    var form = this.data.form;
    var accounts = this.data.accounts || {};
    var inClass = {};
    form.teacherIds.concat(form.studentIds, form.parentIds).forEach(function (id) {
      inClass[id] = true;
    });
    function current(list, ids, decorate) {
      var set = {};
      (ids || []).forEach(function (id) {
        set[id] = true;
      });
      return (list || [])
        .filter(function (item) {
          return set[item.id];
        })
        .map(function (item) {
          var member = Object.assign({}, item);
          if (decorate) decorate(member, item);
          return member;
        });
    }
    function addable(list, decorate) {
      return (list || [])
        .filter(function (item) {
          return !inClass[item.id];
        })
        .map(function (item) {
          var option = Object.assign({}, item);
          if (decorate) decorate(option, item);
          return option;
        });
    }
    this.setData({
      editMembers: {
        teachers: current(accounts.teachers, form.teacherIds, function (m, item) {
          m.desc = item.subject || item.account || "";
          m.isHead = item.id === form.headTeacherId;
        }),
        students: current(accounts.students, form.studentIds, function (m, item) {
          m.desc = item.grade ? item.grade : item.account || "";
        }),
        parents: current(accounts.parents, form.parentIds, function (m, item) {
          m.desc = item.childLabel || item.account || "";
        })
      },
      addableTeachers: addable(accounts.teachers, function (o, item) {
        o.desc = item.subject || item.account || "";
      }),
      addableStudents: addable(accounts.students, function (o, item) {
        o.desc = item.grade ? item.grade : item.account || "";
      }),
      addableParents: addable(accounts.parents, function (o, item) {
        o.desc = item.childLabel || item.account || "";
      })
    });
  },

  /** 编辑模式：移除现有成员（负责教师需先更换） */
  removeMember: function (e) {
    var role = e.currentTarget.dataset.role;
    var id = Number(e.currentTarget.dataset.id);
    var form = Object.assign({}, this.data.form);
    if (role === "teacher") {
      if (form.headTeacherId === id) {
        wx.showToast({ title: "请先更换负责教师后再移除", icon: "none" });
        return;
      }
      form.teacherIds = form.teacherIds.filter(function (x) {
        return x !== id;
      });
    } else if (role === "student") {
      form.studentIds = form.studentIds.filter(function (x) {
        return x !== id;
      });
    } else {
      form.parentIds = form.parentIds.filter(function (x) {
        return x !== id;
      });
    }
    this.setData({ form: form }, function () {
      this.refreshOptions();
      this.refreshEditMembers();
    }.bind(this));
  },

  /** 编辑模式：添加新成员 */
  addMember: function (e) {
    var role = e.currentTarget.dataset.role;
    var id = Number(e.currentTarget.dataset.id);
    var form = Object.assign({}, this.data.form);
    var key = role === "teacher" ? "teacherIds" : role === "student" ? "studentIds" : "parentIds";
    if (form[key].indexOf(id) < 0) form[key] = form[key].concat([id]);
    this.setData({ form: form }, function () {
      this.refreshOptions();
      this.refreshEditMembers();
    }.bind(this));
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
    this.setData({ form: form }, function () {
      this.refreshOptions();
      if (this.data.mode === "edit") this.refreshEditMembers();
    }.bind(this));
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
    var isEdit = this.data.mode === "edit";
    if (!String(form.name || "").trim()) {
      wx.showToast({ title: "请填写班级名称", icon: "none" });
      return;
    }
    if (!form.headTeacherId) {
      wx.showToast({ title: "请选择负责教师", icon: "none" });
      return;
    }
    var payload = {
      name: String(form.name).trim(),
      grade: String(form.grade || "").trim(),
      headTeacherId: form.headTeacherId,
      teacherIds: form.teacherIds,
      studentIds: form.studentIds,
      parentIds: form.parentIds
    };
    this.setData({ submitting: true });
    var promise = isEdit ? api.updateClass(form.id, payload) : api.createClass(payload);
    promise
      .then(function () {
        self.setData({ submitting: false, mode: null, form: emptyForm() });
        wx.showToast({ title: isEdit ? "已保存修改" : "已创建班级", icon: "success" });
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
