var app = getApp();
var request = require("../../../utils/api.js");
var api = request.api;

var CAREGIVERS = ["妈妈", "爸爸", "祖辈", "其他亲属", "家人轮流", "其他"];
var PREFERENCES = ["低负担", "短时长", "高参与度", "长时长"];
var INTERESTS = ["阅读", "运动", "绘画手工", "音乐", "科学实验", "动物自然", "棋类", "做饭家务", "其他"];
var GRADES = ["小班", "中班", "大班", "一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "初一", "初二", "初三"];
var TIMES = ["工作日晚间", "周末白天", "周末均可", "时间较少", "其他"];

Page({
  data: {
    childName: "",
    gender: "",
    age: "",
    caregiver: [],
    caregiverOther: "",
    taskPreference: "",
    interests: [],
    interestOther: "",
    grade: "",
    familyNote: "",
    timeAvailable: "",
    timeChoice: "",
    timeOther: "",

    caregivers: CAREGIVERS,
    preferences: PREFERENCES,
    interestList: INTERESTS,
    grades: GRADES,
    timeOptions: TIMES,
    submitting: false
  },

  onShow: function () {
    if (!app.isLogin()) wx.redirectTo({ url: "/pages/login/login" });
  },

  pickGender: function (e) {
    this.setData({ gender: e.currentTarget.dataset.value });
  },

  toggleCaregiver: function (e) {
    var v = e.currentTarget.dataset.value;
    var list = this.data.caregiver.slice();
    var i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    else list.push(v);
    this.setData({ caregiver: list });
  },

  pickGrade: function (e) {
    var v = e.currentTarget.dataset.value;
    this.setData({ grade: this.data.grade === v ? "" : v });
  },

  pickPreference: function (e) {
    this.setData({ taskPreference: e.currentTarget.dataset.value });
  },

  toggleInterest: function (e) {
    var v = e.currentTarget.dataset.value;
    var list = this.data.interests.slice();
    var i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    else list.push(v);
    this.setData({ interests: list });
  },

  pickTime: function (e) {
    this.setData({ timeChoice: e.currentTarget.dataset.value });
  },

  onInput: function (e) {
    var key = e.currentTarget.dataset.key;
    var patch = {};
    patch[key] = e.detail.value;
    this.setData(patch);
  },

  onSubmit: function () {
    var self = this;
    var d = this.data;

    if (!d.childName.trim()) return wx.showToast({ title: "请填写孩子昵称", icon: "none" });
    if (d.gender !== "男" && d.gender !== "女") return wx.showToast({ title: "请选择孩子性别", icon: "none" });
    var age = Number(d.age);
    if (!age || age < 3 || age > 18) return wx.showToast({ title: "请填写 3-18 之间的年龄", icon: "none" });
    var caregivers = d.caregiver.filter(function (item) { return item !== "其他"; });
    if (d.caregiver.indexOf("其他") >= 0 && d.caregiverOther.trim()) caregivers.push(d.caregiverOther.trim());
    if (!caregivers.length) return wx.showToast({ title: "请选择主要陪伴人", icon: "none" });
    var timeAvailable = d.timeChoice === "其他" ? d.timeOther.trim() : d.timeChoice;
    if (!timeAvailable) return wx.showToast({ title: d.timeChoice === "其他" ? "请填写具体可用时间" : "请选择每周可用时间", icon: "none" });
    var interests = d.interests.filter(function (item) { return item !== "其他"; });
    if (d.interests.indexOf("其他") >= 0 && d.interestOther.trim()) interests.push(d.interestOther.trim());
    if (!interests.length) return wx.showToast({ title: "请至少选择一个孩子兴趣", icon: "none" });
    if (!d.taskPreference) return wx.showToast({ title: "请选择任务类型偏好", icon: "none" });

    this.setData({ submitting: true });

    api
      .submitQuestionnaire({
        childName: d.childName.trim(),
        gender: d.gender,
        age: age,
        caregiver: caregivers,
        caregiverOther: d.caregiverOther.trim(),
        taskPreference: d.taskPreference,
        interests: interests,
        grade: d.grade,
        familyNote: d.familyNote,
        timeAvailable: timeAvailable
      })
      .then(function (res) {
        self.setData({ submitting: false });
        wx.showToast({ title: "档案已创建", icon: "success" });
        // 清掉旧选中孩子，让首页重新拉取
        app.setChildId(null);
        setTimeout(function () {
          wx.navigateBack({
            fail: function () {
              wx.redirectTo({ url: "/pages/parent/home/home" });
            }
          });
        }, 800);
      })
      .catch(function () {
        self.setData({ submitting: false });
      });
  },

  // 跳过（档案为选填，不填也可正常使用系统）
  goBack: function () {
    wx.navigateBack({
      fail: function () {
        wx.redirectTo({ url: "/pages/parent/home/home" });
      }
    });
  }
});
