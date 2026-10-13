var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;
var util = require("../../../utils/util.js");

var ROLES = [
  { key: "teacher", label: "教师" },
  { key: "student", label: "学生" },
  { key: "parent", label: "家长" }
];

function emptyForm() {
  return {
    id: null,
    role: "teacher",
    account: "",
    password: "",
    displayName: "",
    phone: "",
    email: "",
    subject: "",
    employeeNo: "",
    grade: "",
    gender: "",
    age: "",
    caregiver: "",
    interests: "",
    familyNote: "",
    parentAccount: "",
    relation: "家长"
  };
}

Page({
  data: {
    loading: true,
    tab: "all",
    teachers: [],
    parents: [],
    students: [],
    visibleTeachers: [],
    visibleParents: [],
    visibleStudents: [],
    allAccounts: [],
    keyword: "",
    filteredCount: 0,
    error: "",

    mode: null, // null | create | edit
    roles: ROLES,
    form: emptyForm(),
    submitting: false
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
      .getAdminAccounts()
      .then(function (res) {
        if (!res) return;
        var teachers = (res.teachers || []).map(function (t) {
            return {
              id: t.id,
              account: t.account,
              name: t.display_name || "",
              phone: t.phone || "",
              email: t.email || "",
              subject: t.subject || "",
              employeeNo: t.employee_no || "",
              timeText: util.formatDate(t.created_at)
            };
          });
        var parents = (res.parents || []).map(function (p) {
            return {
              id: p.id,
              account: p.account,
              name: p.display_name || "",
              phone: p.phone || "",
              email: p.email || "",
              childCount: Number(p.child_count || 0),
              timeText: util.formatDate(p.created_at)
            };
          });
        var students = (res.students || []).map(function (s) {
            return {
              id: s.id,
              account: s.account,
              name: s.display_name || s.name || "",
              phone: s.phone || "",
              email: s.email || "",
              grade: s.grade || "",
              gender: s.gender || "",
              age: s.age || "",
              caregiver: s.caregiver || "",
              interests: s.interests || "",
              familyNote: s.family_note || "",
              parentAccount: s.parent_account || "",
              parentRelation: s.parent_relation || "",
              childId: s.child_id || null,
              timeText: util.formatDate(s.created_at)
            };
          });
        self.setData({
          loading: false,
          teachers: teachers,
          parents: parents,
          students: students
        }, function () {
          self.applyFilters();
        });
        if (done) done();
      })
      .catch(function (error) {
        self.setData({ loading: false, error: (error && error.message) || "账号目录加载失败" });
        if (done) done();
      });
  },

  switchTab: function (e) {
    this.setData({ tab: e.currentTarget.dataset.tab, mode: null });
    this.applyFilters();
  },

  onSearch: function (e) {
    this.setData({ keyword: (e.detail.value || "").trim() });
    this.applyFilters();
  },

  applyFilters: function () {
    var keyword = String(this.data.keyword || "").toLowerCase();
    function match(item) {
      if (!keyword) return true;
      return [item.name, item.account, item.grade].some(function (value) {
        return String(value || "").toLowerCase().indexOf(keyword) >= 0;
      });
    }
    var teachers = this.data.teachers.filter(match);
    var students = this.data.students.filter(match);
    var parents = this.data.parents.filter(match);
    var all = teachers.map(function (item) { return Object.assign({ key: "teacher-" + item.id, role: "teacher", roleLabel: "教师" }, item); })
      .concat(students.map(function (item) { return Object.assign({ key: "student-" + item.id, role: "student", roleLabel: "学生" }, item); }))
      .concat(parents.map(function (item) { return Object.assign({ key: "parent-" + item.id, role: "parent", roleLabel: "家长" }, item); }));
    var count = this.data.tab === "teachers" ? teachers.length : this.data.tab === "students" ? students.length : this.data.tab === "parents" ? parents.length : all.length;
    this.setData({ visibleTeachers: teachers, visibleStudents: students, visibleParents: parents, allAccounts: all, filteredCount: count });
  },

  /* ---------- 表单 ---------- */
  openCreate: function () {
    var role = this.data.tab === "students" ? "student" : this.data.tab === "parents" ? "parent" : "teacher";
    var form = emptyForm();
    form.role = role;
    this.setData({ mode: "create", form: form });
  },

  openEdit: function (e) {
    var requestedRole = e.currentTarget.dataset.role;
    var tab = requestedRole === "teacher" ? "teachers" : requestedRole === "student" ? "students" : requestedRole === "parent" ? "parents" : this.data.tab;
    var id = e.currentTarget.dataset.id;
    var list = tab === "teachers" ? this.data.teachers : tab === "students" ? this.data.students : this.data.parents;
    var item = list.filter(function (i) { return i.id === id; })[0];
    if (!item) return;
    var role = tab === "teachers" ? "teacher" : tab === "students" ? "student" : "parent";
    var form = emptyForm();
    form.id = item.id;
    form.role = role;
    form.account = item.account || "";
    form.displayName = item.name || "";
    form.phone = item.phone || "";
    form.email = item.email || "";
    if (role === "teacher") {
      form.subject = item.subject || "";
      form.employeeNo = item.employeeNo || "";
    } else if (role === "student") {
      form.grade = item.grade || "";
      form.gender = item.gender || "";
      form.age = item.age || "";
      form.caregiver = item.caregiver || "";
      form.interests = item.interests || "";
      form.familyNote = item.familyNote || "";
      form.parentAccount = item.parentAccount || "";
      form.relation = item.parentRelation || "家长";
    }
    this.setData({ mode: "edit", form: form });
  },

  closeForm: function () {
    this.setData({ mode: null, form: emptyForm() });
  },

  /** 阻止弹窗内点击/滚动冒泡（空实现） */
  noop: function () {},

  pickRole: function (e) {
    this.setData({ "form.role": e.currentTarget.dataset.value });
  },

  pickGender: function (e) {
    this.setData({ "form.gender": e.currentTarget.dataset.value });
  },

  onFormInput: function (e) {
    var key = "form." + e.currentTarget.dataset.key;
    var patch = {};
    patch[key] = e.detail.value;
    this.setData(patch);
  },

  onSubmit: function () {
    var self = this;
    var f = this.data.form;
    var isEdit = this.data.mode === "edit";

    if (!f.account.trim() || f.account.trim().length < 3) {
      wx.showToast({ title: "账号至少 3 个字符", icon: "none" });
      return;
    }
    if (!isEdit && (!f.password || f.password.length < 6)) {
      wx.showToast({ title: "密码至少 6 位", icon: "none" });
      return;
    }
    if (isEdit && f.password && f.password.length < 6) {
      wx.showToast({ title: "新密码至少 6 位", icon: "none" });
      return;
    }
    if (!f.displayName.trim()) {
      wx.showToast({ title: "请填写姓名", icon: "none" });
      return;
    }
    if (f.role === "student" && !isEdit && !f.grade.trim()) {
      wx.showToast({ title: "请填写学生年级", icon: "none" });
      return;
    }

    var payload = {
      role: f.role,
      account: f.account.trim(),
      displayName: f.displayName.trim(),
      phone: f.phone,
      email: f.email
    };
    if (f.password) payload.password = f.password;

    if (f.role === "teacher") {
      payload.subject = f.subject;
      payload.employeeNo = f.employeeNo;
    } else if (f.role === "student") {
      payload.grade = f.grade;
      payload.gender = f.gender;
      payload.age = f.age === "" || f.age == null ? null : Number(f.age);
      payload.caregiver = f.caregiver;
      payload.interests = f.interests;
      payload.familyNote = f.familyNote;
      payload.parentAccount = f.parentAccount;
      payload.relation = f.relation;
    }

    this.setData({ submitting: true });

    var p = isEdit ? api.updateAccount(f.id, payload) : api.createAccount(payload);
    p.then(function () {
      self.setData({ submitting: false, mode: null, form: emptyForm() });
      wx.showToast({ title: isEdit ? "已保存" : "已创建", icon: "success" });
      self.loadData();
    }).catch(function () {
      self.setData({ submitting: false });
    });
  },

  onDelete: function () {
    var self = this;
    var form = this.data.form || {};
    if (this.data.mode !== "edit" || !form.id) return;
    wx.showModal({
      title: "删除账号",
      content: "确定删除“" + (form.displayName || form.account) + "”吗？删除后将无法登录，登录会话、绑定关系及相关记录会被清理。",
      confirmText: "删除",
      confirmColor: "#b42318",
      success: function (result) {
        if (!result.confirm) return;
        self.setData({ submitting: true });
        api.deleteAccount(form.id).then(function () {
          self.setData({ submitting: false, mode: null, form: emptyForm() });
          wx.showToast({ title: "已删除账号", icon: "success" });
          self.loadData();
        }).catch(function () {
          self.setData({ submitting: false });
        });
      }
    });
  },

  onRetry: function () { this.loadData(); }
});
