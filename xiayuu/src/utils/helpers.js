/**
 * 通用帮助函数
 */

/**
 * 随机选择
 */
function randomPick(arr) {
  return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

/**
 * 随机数
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 格式化时间
 */
function formatTime(ms) {
  if (ms > 3600000) return `${(ms / 3600000).toFixed(1)}h`;
  if (ms > 60000) return `${Math.floor(ms / 60000)}m`;
  return `${Math.floor(ms / 1000)}s`;
}

/**
 * 延迟
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 数字格式化（添加千位符）
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 百分比格式化
 */
function formatPercent(num) {
  return (num * 100).toFixed(2) + '%';
}

/**
 * 检查是否为Admin
 */
function isAdmin(tripcode, adminTripcode) {
  return tripcode === adminTripcode;
}

module.exports = {
  randomPick,
  randomInt,
  formatTime,
  sleep,
  formatNumber,
  formatPercent,
  isAdmin
};
