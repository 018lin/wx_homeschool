/**
 * 小程序公共持久状态。
 * 这里统一管理跨页面状态，禁止页面直接使用 Web 的 localStorage。
 */

var KEYS = {
  selectedChildId: "selectedChildId",
  legacyChildId: "childId",
  notificationHidden: "notificationHidden",
  taskFit: "taskFitFeedback"
};

function get(key, fallback) {
  try {
    var value = wx.getStorageSync(key);
    return value === "" || value === undefined || value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function set(key, value) {
  try {
    if (value === undefined || value === null || value === "") wx.removeStorageSync(key);
    else wx.setStorageSync(key, value);
  } catch (e) {}
}

function getSelectedChildId() {
  var value = get(KEYS.selectedChildId, null);
  if (!value) {
    value = get(KEYS.legacyChildId, null);
    if (value) set(KEYS.selectedChildId, value);
  }
  return value ? Number(value) : null;
}

function setSelectedChildId(id) {
  set(KEYS.selectedChildId, id || null);
  // 清理旧版本键，避免两个来源不一致。
  try { wx.removeStorageSync(KEYS.legacyChildId); } catch (e) {}
}

function getNotificationHidden() {
  return get(KEYS.notificationHidden, {});
}

function setNotificationHidden(value) {
  set(KEYS.notificationHidden, value || {});
}

function getTaskFit(childId, taskId) {
  var map = get(KEYS.taskFit, {});
  return map[String(childId) + ":" + String(taskId)] || "";
}

function setTaskFit(childId, taskId, choice) {
  var map = get(KEYS.taskFit, {});
  map[String(childId) + ":" + String(taskId)] = choice;
  set(KEYS.taskFit, map);
}

function clearUserState() {
  [KEYS.selectedChildId, KEYS.legacyChildId, KEYS.notificationHidden, KEYS.taskFit].forEach(function (key) {
    try { wx.removeStorageSync(key); } catch (e) {}
  });
}

module.exports = {
  get: get,
  set: set,
  getSelectedChildId: getSelectedChildId,
  setSelectedChildId: setSelectedChildId,
  getNotificationHidden: getNotificationHidden,
  setNotificationHidden: setNotificationHidden,
  getTaskFit: getTaskFit,
  setTaskFit: setTaskFit,
  clearUserState: clearUserState
};
