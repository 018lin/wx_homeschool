/**
 * 头像统一解析（个人页 / 聊天列表 / 聊天界面共用一套规则）。
 *
 * 优先级：服务端头像（avatarUrl / avatar_url） > 本机缓存 > 角色默认头像。
 * 保证同一个人在任何页面、任何一台设备上都展示同一个真实头像。
 */
var state = require("./state.js");

var ROLE_META = {
  parent: { label: "家长", color: "#0057b8", avatar: "/assets/parents.png" },
  student: { label: "学生", color: "#0f766e", avatar: "/assets/student.png" },
  teacher: { label: "教师", color: "#5e6ad2", avatar: "/assets/teacher.png" },
  admin: { label: "管理员", color: "#8a4b10", avatar: "/assets/admin.png" }
};
var DEFAULT_ROLE_AVATAR = "/assets/admin.png";

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function roleMeta(role) {
  return ROLE_META[normalizeRole(role)] || { label: "用户", color: "#8795a7", avatar: DEFAULT_ROLE_AVATAR };
}

/** 允许传入用户对象，也允许直接传入 id / account 作为缓存键 */
function toUser(user) {
  if (typeof user === "string" || typeof user === "number") return { id: user };
  return user || {};
}

/** 兼容驼峰 / 下划线两种字段命名 */
function pickUrl(user) {
  var u = toUser(user);
  var url = u.avatarUrl || u.avatar_url || "";
  return typeof url === "string" ? url : "";
}

/** 本机头像缓存的归档键 */
function userKey(user) {
  var u = toUser(user);
  return u.id || u.account || "";
}

/**
 * 解析最终要展示的头像地址。
 * @param {object} user 用户对象（id / account / role / avatarUrl|avatar_url）
 * @param {boolean} [useCache] 是否允许回退到本机缓存，仅当前用户需要（服务端同步失败时仍能看到自己的头像）
 */
function resolve(user, useCache) {
  var url = pickUrl(user);
  if (url) return url;
  if (useCache) {
    var cached = state.getAvatar(userKey(user));
    if (cached) return cached;
  }
  return roleMeta(user && user.role).avatar;
}

/** 是否是用户自定义头像（用于「恢复默认头像」等交互判断） */
function hasCustom(user, useCache) {
  if (pickUrl(user)) return true;
  return !!(useCache && state.getAvatar(userKey(user)));
}

/** 写入服务端 + 本机双份缓存，保证换头像后各页面立刻同步 */
function persist(user, url) {
  var key = userKey(user);
  state.setAvatar(key, url || "");
  return url || "";
}

module.exports = {
  ROLE_META: ROLE_META,
  DEFAULT_ROLE_AVATAR: DEFAULT_ROLE_AVATAR,
  roleMeta: roleMeta,
  pickUrl: pickUrl,
  userKey: userKey,
  resolve: resolve,
  hasCustom: hasCustom,
  persist: persist
};