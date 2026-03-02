/**
 * 日志模块
 */

const CONFIG = require('../config');

class Logger {
  log(...args) {
    console.log(...args);
  }

  info(...args) {
    console.log('[INFO]', ...args);
  }

  warn(...args) {
    console.warn('[WARN]', ...args);
  }

  error(...args) {
    console.error('[ERROR]', ...args);
  }

  debug(...args) {
    if (CONFIG.core.debug) {
      console.log('[DEBUG]', ...args);
    }
  }

  success(...args) {
    console.log('[✅]', ...args);
  }
}

module.exports = new Logger();
