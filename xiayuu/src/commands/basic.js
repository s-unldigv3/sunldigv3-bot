/**
 * 基础命令模块
 */

const CONFIG = require('../config');
const { randomPick, formatNumber } = require('../utils/helpers');

class BasicCommands {
  constructor(messageHandler, storage, economy) {
    this.messageHandler = messageHandler;
    this.storage = storage;
    this.economy = economy;
  }

  /**
   * 帮助命令
   */
  handleHelp(msg, _) {
    const { cmdPrefix } = CONFIG.mainBot;
    const list = `xiayuu会的可多啦！
  **公共命令**
${cmdPrefix}help - 查看所有命令
${cmdPrefix}roll [范围] - 掷骰子
${cmdPrefix}afk [状态] - 设置AFK状态
${cmdPrefix}online - 查看在线用户
${cmdPrefix}userinfo [用户名] - 查看用户信息
${cmdPrefix}stats - 查看频道统计
${cmdPrefix}emoji - 随机表情
${cmdPrefix}yiyan - 一言
${cmdPrefix}weather <城市> - 查看天气
${cmdPrefix}calc <表达式> - 计算器

**游戏命令**
d help - 斗地主帮助
!money - 查看余额
!wallet top - 货币排行榜
!stock list - 股票列表
!stock buy <股票> <数量> - 购买股票
!stock sell <股票> <数量> - 出售股票
!stock portfolio - 查看投资组合

**管理员命令**
${cmdPrefix}helpadmin - 查看管理员命令`;

    this.messageHandler.sendChat(`**命令列表**\n${list}`);
  }

  /**
   * 掷骰子
   */
  handleRoll(msg, params) {
    let min = 1, max = 6;
    if (params.length > 0) {
      const range = params[0].split('-');
      if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
        min = Number(range[0]);
        max = Number(range[1]);
        if (!Number.isInteger(min) || !Number.isInteger(max)) {
          this.messageHandler.sendChat(`范围必须为整数`);
          return;
        }
        if (min >= max) {
          this.messageHandler.sendChat(`范围错误，最小值须小于最大值`);
          return;
        }
      }
    }
    const res = Math.floor(Math.random() * (max - min + 1)) + min;
    this.messageHandler.sendChat(`🎲 [${min}-${max}]：${res}`);
  }

  /**
   * AFK操作
   */
  handleAfk(msg, params) {
    // 实现由主Bot处理
    return { nick: msg.nick, params };
  }

  /**
   * 在线用户
   */
  handleOnline(msg, _, onlineUsers) {
    if (onlineUsers.size === 0) {
      this.messageHandler.sendChat(`当前频道暂无在线用户`);
      return;
    }

    const userList = [...onlineUsers].join('、');
    this.messageHandler.sendChat(`**当前在线用户**（共${onlineUsers.size}人）：\n${userList}`);
  }

  /**
   * 用户信息
   */
  handleUserinfo(msg, params, userActivity, messageHistory, onlineUsers, afkUsers, silencedUsers) {
    const target = params[0] || msg.nick;
    const targetMsg = messageHistory.find(m => m.nick === target && m.trip);
    const tripcode = targetMsg?.trip || '未设置';

    const hasAct = userActivity.has(target);
    const isAfk = afkUsers.has(target);
    const isSil = false; // 简化版，由主Bot处理
    const count = userActivity.get(target) || 0;
    const isOnline = onlineUsers.has(target);

    if (!hasAct && !isAfk && !isSil) {
      this.messageHandler.sendChat(`无${target}的记录`);
      return;
    }

    const text = `**${target}**\n发言：${count}条\nTripcode：${tripcode}\n在线：${isOnline ? '是' : '否'}`;
    this.messageHandler.sendChat(text);
  }

  /**
   * 统计信息
   */
  handleStats(msg, _, userActivity, onlineUsers) {
    const top3 = [...userActivity.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n, c]) => `${n}：${c}条`)
      .join('、');
    const text = `**统计**\n在线：${onlineUsers.size}人\n活跃TOP3：${top3 || '无'}`;
    this.messageHandler.sendChat(text);
  }

  /**
   * 随机表情
   */
  handleEmoji(msg, _) {
    const emoji = randomPick(CONFIG.EMOJI_LIST);
    this.messageHandler.sendChat(`${emoji}`);
  }

  /**
   * 一言
   */
  async handleYiyan(msg, _) {
    try {
      const fetch = require('node-fetch');
      const res = await fetch('https://v1.hitokoto.cn/?encode=json');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const text = (data.hitokoto || data.text || '').trim();
      const from = (data.from || data.from_who || '').trim();
      if (!text) {
        this.messageHandler.sendChat('一言获取失败');
        return;
      }
      const out = from ? `${text} —— ${from}` : `${text}`;
      this.messageHandler.sendChat(out);
    } catch (e) {
      this.messageHandler.sendChat('获取一言失败，请稍后重试');
    }
  }

  /**
   * 天气查询
   */
  async handleWeather(msg, params) {
    const city = params.join(' ');
    if (!city) {
      this.messageHandler.sendChat(`格式：!weather 北京`);
      return;
    }
    try {
      const fetch = require('node-fetch');
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`);
      const data = await res.text();
      if (!data || data.trim() === '') {
        this.messageHandler.sendChat(`未查询到${city}的天气信息`);
        return;
      }
      this.messageHandler.sendChat(`${data}`);
    } catch (e) {
      this.messageHandler.sendChat(`天气查询失败`);
    }
  }

  /**
   * 计算器
   */
  handleCalc(msg, params) {
    const calcStr = params.join(' ');
    if (!calcStr) {
      this.messageHandler.sendChat(`格式：!calc 1+2*3`);
      return;
    }
    try {
      if (calcStr.length > 100) {
        this.messageHandler.sendChat(`表达式过长（最大100字符）`);
        return;
      }
      const validReg = /^[0-9\+\-\*\/\(\)\.\s]+$/;
      if (!validReg.test(calcStr)) {
        this.messageHandler.sendChat(`仅支持数字和运算符 +/*-/()  `);
        return;
      }
      const res = eval(calcStr);
      this.messageHandler.sendChat(`计算结果：${calcStr} = ${isNaN(res) ? '无效' : res}`);
    } catch (err) {
      this.messageHandler.sendChat(`计算失败`);
    }
  }
}

module.exports = BasicCommands;
