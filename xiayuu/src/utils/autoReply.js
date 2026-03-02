/**
 * 自动回复管理模块
 * 支持普通触发词、正则表达式和定时公告
 */

const logger = require('./logger');
const { randomInt } = require('./helpers');

class AutoReplyManager {
  constructor(messageHandler, storage) {
    this.messageHandler = messageHandler;
    this.storage = storage;
    this.ifRules = [];           // 普通触发规则
    this.regexRules = [];        // 正则表达式规则
    this.pannRules = [];         // 定时公告规则
    this.pannIntervals = {};     // 存储公告定时器ID
    this.enabled = true;         // 全局启用/禁用开关
  }

  /**
   * 初始化自动回复系统
   */
  async initialize() {
    try {
      const rules = await this.storage.read('autoReply', {
        ifRules: [],
        regexRules: [],
        pannRules: []
      });

      this.ifRules = rules.ifRules || [];
      this.regexRules = rules.regexRules || [];
      this.pannRules = rules.pannRules || [];

      logger.success(`[AutoReply] 已加载 ${this.ifRules.length} 条普通规则, ${this.regexRules.length} 条正则规则, ${this.pannRules.length} 条公告规则`);

      // 启动定时公告
      this.startAnnouncements();

      return true;
    } catch (error) {
      logger.error(`[AutoReply] 初始化失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 处理消息的自动回复
   * @param {string} text - 消息文本
   * @returns {string|null} - 回复文本，如果没有匹配则返回null
   */
  processMessage(text) {
    if (!this.enabled || !text) return null;

    // 优先检查普通规则（精确匹配更可靠）
    for (const rule of this.ifRules) {
      if (text.includes(rule.trigger)) {
        if (Math.random() * 100 < rule.probability) {
          logger.debug(`[AutoReply] 触发普通规则: ${rule.trigger} -> ${rule.reply}`);
          return rule.reply;
        }
      }
    }

    // 再检查正则表达式规则
    for (const rule of this.regexRules) {
      try {
        const regex = new RegExp(rule.trigger);
        if (regex.test(text)) {
          if (Math.random() * 100 < rule.probability) {
            logger.debug(`[AutoReply] 触发正则规则: ${rule.trigger} -> ${rule.reply}`);
            return rule.reply;
          }
        }
      } catch (error) {
        logger.warn(`[AutoReply] 正则表达式错误: ${rule.trigger}`);
      }
    }

    return null;
  }

  /**
   * 启动定时公告
   */
  startAnnouncements() {
    for (const rule of this.pannRules) {
      const intervalMs = rule.interval * 60 * 1000; // 转换为毫秒
      
      // 初始延迟随机化，避免所有公告同时发送
      const initialDelay = randomInt(0, Math.min(intervalMs, 300000));
      
      const timeoutId = setTimeout(() => {
        // 发送首次公告
        if (this.enabled) {
          this.messageHandler.sendChat(rule.content);
          logger.info(`[AutoReply] 发送定时公告(${rule.id}): ${rule.content.substring(0, 30)}...`);
        }

        // 设置循环发送
        const intervalId = setInterval(() => {
          if (this.enabled) {
            this.messageHandler.sendChat(rule.content);
            logger.info(`[AutoReply] 发送定时公告(${rule.id}): ${rule.content.substring(0, 30)}...`);
          }
        }, intervalMs);

        this.pannIntervals[`interval_${rule.id}`] = intervalId;
      }, initialDelay);

      this.pannIntervals[`timeout_${rule.id}`] = timeoutId;
    }

    logger.success(`[AutoReply] 已启动 ${this.pannRules.length} 条定时公告`);
  }

  /**
   * 停止定时公告
   */
  stopAnnouncements() {
    for (const [key, id] of Object.entries(this.pannIntervals)) {
      clearTimeout(id);
      clearInterval(id);
    }
    this.pannIntervals = {};
    logger.info(`[AutoReply] 已停止所有定时公告`);
  }

  /**
   * 启用自动回复
   */
  enable() {
    this.enabled = true;
    logger.info(`[AutoReply] 自动回复已启用`);
  }

  /**
   * 禁用自动回复
   */
  disable() {
    this.enabled = false;
    logger.info(`[AutoReply] 自动回复已禁用`);
  }

  /**
   * 添加普通规则
   */
  async addIfRule(trigger, reply, probability = 50) {
    const rule = {
      id: (this.ifRules.length > 0 ? Math.max(...this.ifRules.map(r => r.id)) : 0) + 1,
      trigger,
      reply,
      probability,
      isRegex: false
    };

    this.ifRules.push(rule);
    await this.saveRules();
    logger.success(`[AutoReply] 已添加普通规则: ${trigger}`);
    return rule;
  }

  /**
   * 添加正则规则
   */
  async addRegexRule(trigger, reply, probability = 50) {
    const rule = {
      id: (this.regexRules.length > 0 ? Math.max(...this.regexRules.map(r => r.id)) : 100) + 1,
      trigger,
      reply,
      probability,
      isRegex: true
    };

    this.regexRules.push(rule);
    await this.saveRules();
    logger.success(`[AutoReply] 已添加正则规则: ${trigger}`);
    return rule;
  }

  /**
   * 添加定时公告
   */
  async addPannRule(content, intervalMinutes = 60) {
    const rule = {
      id: (this.pannRules.length > 0 ? Math.max(...this.pannRules.map(r => r.id)) : 0) + 1,
      interval: intervalMinutes,
      content
    };

    this.pannRules.push(rule);
    await this.saveRules();

    // 立即启动该公告的定时器
    const intervalMs = intervalMinutes * 60 * 1000;
    const initialDelay = randomInt(0, Math.min(intervalMs, 300000));

    const timeoutId = setTimeout(() => {
      if (this.enabled) {
        this.messageHandler.sendChat(rule.content);
      }

      const intervalId = setInterval(() => {
        if (this.enabled) {
          this.messageHandler.sendChat(rule.content);
        }
      }, intervalMs);

      this.pannIntervals[`interval_${rule.id}`] = intervalId;
    }, initialDelay);

    this.pannIntervals[`timeout_${rule.id}`] = timeoutId;

    logger.success(`[AutoReply] 已添加定时公告: ${content.substring(0, 30)}...`);
    return rule;
  }

  /**
   * 删除规则
   */
  async removeRule(ruleId, type = 'if') {
    const targetArray = type === 'regex' ? this.regexRules : type === 'pann' ? this.pannRules : this.ifRules;
    const index = targetArray.findIndex(r => r.id === ruleId);

    if (index !== -1) {
      const removed = targetArray.splice(index, 1);

      // 如果是公告规则，清耳其定时器
      if (type === 'pann') {
        clearTimeout(this.pannIntervals[`timeout_${ruleId}`]);
        clearInterval(this.pannIntervals[`interval_${ruleId}`]);
        delete this.pannIntervals[`timeout_${ruleId}`];
        delete this.pannIntervals[`interval_${ruleId}`];
      }

      await this.saveRules();
      logger.success(`[AutoReply] 已删除${type}规则: ID ${ruleId}`);
      return removed[0];
    }

    return null;
  }

  /**
   * 更新规则
   */
  async updateRule(ruleId, updates, type = 'if') {
    const targetArray = type === 'regex' ? this.regexRules : type === 'pann' ? this.pannRules : this.ifRules;
    const rule = targetArray.find(r => r.id === ruleId);

    if (rule) {
      Object.assign(rule, updates);
      await this.saveRules();
      logger.success(`[AutoReply] 已更新规则: ID ${ruleId}`);
      return rule;
    }

    return null;
  }

  /**
   * 获取所有规则统计
   */
  getStats() {
    return {
      ifRulesCount: this.ifRules.length,
      regexRulesCount: this.regexRules.length,
      pannRulesCount: this.pannRules.length,
      enabled: this.enabled
    };
  }

  /**
   * 保存规则到文件
   */
  async saveRules() {
    try {
      await this.storage.write('autoReply', {
        ifRules: this.ifRules,
        regexRules: this.regexRules,
        pannRules: this.pannRules
      });
    } catch (error) {
      logger.error(`[AutoReply] 保存规则失败: ${error.message}`);
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.stopAnnouncements();
    logger.info(`[AutoReply] 自动回复模块已清理`);
  }
}

module.exports = AutoReplyManager;
