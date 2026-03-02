/**
 * 主入口文件 - 集成所有模块
 */

const WebSocket = require('ws');
const path = require('path');

// 导入模块
const CONFIG = require('./src/config');
const Storage = require('./src/storage');
const MessageHandler = require('./src/utils/messageHandler');
const logger = require('./src/utils/logger');
const { randomPick, randomInt, formatTime, isAdmin } = require('./src/utils/helpers');
const AutoReplyManager = require('./src/utils/autoReply');
const Economy = require('./src/economy');
const GameCommands = require('./src/commands/games');
const BasicCommands = require('./src/commands/basic');

/**
 * 核心Bot类
 */
class SundigBot {
  constructor() {
    this.ws = null;
    this.clientId = Math.random().toString(36).slice(2, 10);
    this.lastSendTime = 0;

    // 存储系统
    this.storage = new Storage(path.join(__dirname, 'data'));

    // 经济系统
    this.economy = null;

    // 消息处理器
    this.messageHandler = null;

    // 命令模块
    this.basicCommands = null;
    this.gameCommands = null;

    // 自动回复系统
    this.autoReply = null;

    // 运行时数据
    this.afkUsers = new Map();
    this.silencedUsers = new Map();
    this.messageHistory = [];
    this.userActivity = new Map();
    this.messageIdMap = new Map();
    this.nextMessageId = 1;
    this.onlineUsers = new Set();
    this.isMuted = false;
    this.stopped = false;

    // 计时器
    this.scheduledIntervals = [];
    this.memoryCleanerId = null;

    // 其他状态
    this.recentMsgTimestamps = [];
    this.lastQuestionReplyTime = 0;
  }

  /**
   * 初始化机器人
   */
  async init() {
    logger.success(`[${CONFIG.core.botName}] 机器人启动中...`);

    // 初始化存储和经济系统
    this.economy = new Economy(this.storage);
    await this.economy.initialize();

    // 创建消息处理器
    this.messageHandler = new MessageHandler(null, this.clientId);

    // 初始化自动回复系统
    this.autoReply = new AutoReplyManager(this.messageHandler, this.storage);
    await this.autoReply.initialize();

    // 初始化命令模块
    this.basicCommands = new BasicCommands(this.messageHandler, this.storage, this.economy);
    this.gameCommands = new GameCommands(this.messageHandler, this.economy.wallet);

    // 连接WebSocket
    this.connectWS();

    // 启动定时器
    this.startTimers();
    this.startMemoryCleaner();

    logger.success(`[✅ ${CONFIG.core.botName}] 机器人启动成功 | 初始发言状态：正常`);
  }

  /**
   * 连接WebSocket
   */
  connectWS() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    this.ws = new WebSocket(CONFIG.core.server);
    this.messageHandler.ws = this.ws;

    this.ws.on('open', () => {
      logger.info(`[连接成功] 频道：${CONFIG.core.channel}`);
      this.joinChannel();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        CONFIG.core.debug && logger.debug(`[接收]`, msg);
        this.handleOfficialCommands(msg);
      } catch (err) {
        logger.error(`[解析失败]`, err.message);
      }
    });

    this.ws.on('close', () => {
      logger.warn(`[连接断开]`);
      this.onlineUsers.clear();
      if (!this.stopped) {
        logger.info(`5秒后重连`);
        setTimeout(() => this.connectWS(), 5000);
      }
    });

    this.ws.on('error', (err) => {
      logger.error(`[WS错误]`, err.message);
    });
  }

  /**
   * 加入频道
   */
  joinChannel() {
    if (this.ws.readyState !== WebSocket.OPEN) return;

    this.messageHandler.sendWSMessage({
      cmd: 'join',
      channel: CONFIG.core.channel,
      nick: CONFIG.core.botName,
      clientId: this.clientId
    });

    this.messageHandler.sendColorCommand();
  }

  /**
   * 处理所有官方指令
   */
  handleOfficialCommands(msg) {
    switch (msg.cmd) {
      case 'chat':
        this.recordMessage(msg);
        if (this.isMuted) {
          if (msg.text.trim() === '!talk on') {
            this.handleCommands(msg, msg.text.trim());
          }
          return;
        }
        if (!this.isSilenced(msg.nick)) {
          this.handleChatMessage(msg);
        }
        break;
      case 'error':
        if (!this.isMuted) {
          this.handleServerError(msg);
        }
        break;
      case 'onlineSet':
        this.updateOnlineUsers(msg.nicks);
        break;
      case 'onlineAdd':
        this.onlineUsers.add(msg.nick);
        if (!this.isMuted) {
          this.sendWelcomeMessage(msg.nick);
        }
        break;
      case 'onlineRemove':
        this.onlineUsers.delete(msg.nick);
        this.afkUsers.delete(msg.nick);
        break;
      default:
        CONFIG.core.debug && logger.debug(`[未处理指令]`, msg.cmd);
    }
  }

  /**
   * 处理聊天消息
   */
  handleChatMessage(msg) {
    if (msg.nick === CONFIG.core.botName) return;

    const text = msg.text.trim();
    if (!text) return;

    // 处理命令
    this.handleCommands(msg, text);

    // 处理AFK@提醒
    this.handleAFKMention(msg);

    // 更新用户活跃度
    this.updateUserActivity(msg.nick);

    // 自动回复处理
    if (this.autoReply) {
      try {
        if (!this.isMuted) {
          const autoReply = this.autoReply.processMessage(text);
          if (autoReply) {
            this.messageHandler.sendChat(autoReply);
            return; // 匹配自动回复后不处理其他逻辑
          }
        }
      } catch (e) {
        logger.error('[自动回复错误]', e.message);
      }
    }

    // 问号应答
    try {
      if (this.isMuted) return;
      if (!text.startsWith(CONFIG.mainBot.cmdPrefix) && /[？?]/.test(text)) {
        const now = Date.now();
        const isJustQuestion = /^[？?]+$/.test(text);
        if (isJustQuestion || !this.lastQuestionReplyTime || now - this.lastQuestionReplyTime > 5000) {
          if (Math.random() <= 0.15) {
            const reply = randomPick(CONFIG.styleTemplates.questionReplies);
            this.messageHandler.sendChat(reply);
            this.lastQuestionReplyTime = now;
          }
        }
      }
    } catch (e) {
      logger.error('[问号处理错误]', e.message);
    }
  }

  /**
   * 处理命令
   */
  handleCommands(msg, text) {
    const [cmdTrigger, ...params] = text.split(/\s+/);

    // 处理游戏命令（d前缀和!money/wallet等）
    if (this.gameCommands.handleGameCommand(msg.nick, text)) {
      return;
    }

    // 处理基础命令（!前缀）
    if (!cmdTrigger.startsWith(CONFIG.mainBot.cmdPrefix)) return;

    const cmdName = cmdTrigger.slice(CONFIG.mainBot.cmdPrefix.length).toLowerCase();

    // 闭嘴状态处理
    if (this.isMuted) {
      if (cmdName === 'talk' && params[0]?.toLowerCase() === 'on') {
        if (isAdmin(msg.trip, CONFIG.mainBot.ADMIN_TRIPCODE)) {
          this.isMuted = false;
          this.messageHandler.sendChat(`张嘴，说话`, true);
          logger.info(`[${CONFIG.core.botName}] 已切换为正常发言状态`);
        } else {
          this.messageHandler.sendChat(`无权限`);
        }
      }
      return;
    }

    try {
      // 基础命令路由
      switch (cmdName) {
        case 'help':
          this.basicCommands.handleHelp(msg, params);
          break;
        case 'roll':
          this.basicCommands.handleRoll(msg, params);
          break;
        case 'afk':
          this.handleAfk(msg, params);
          break;
        case 'online':
          this.basicCommands.handleOnline(msg, params, this.onlineUsers);
          break;
        case 'userinfo':
          this.basicCommands.handleUserinfo(msg, params, this.userActivity, this.messageHistory, this.onlineUsers, this.afkUsers, this.silencedUsers);
          break;
        case 'stats':
          this.basicCommands.handleStats(msg, params, this.userActivity, this.onlineUsers);
          break;
        case 'emoji':
          this.basicCommands.handleEmoji(msg, params);
          break;
        case 'yiyan':
          this.basicCommands.handleYiyan(msg, params);
          break;
        case 'weather':
          this.basicCommands.handleWeather(msg, params);
          break;
        case 'calc':
          this.basicCommands.handleCalc(msg, params);
          break;
        // 股票命令
        case 'stock':
          this.handleStockCommand(msg, params);
          break;
        // 管理员命令
        case 'talk':
          this.handleTalk(msg, params);
          break;
        case 'stop':
          this.handleStop(msg, params);
          break;
        default:
          // 命令不存在，不回复
          break;
      }
    } catch (err) {
      logger.error(`[命令失败] ${cmdTrigger}`, err.message);
      this.messageHandler.sendChat(`执行出错：${err.message.slice(0, 20)}`);
    }
  }

  /**
   * 处理AFK命令
   */
  handleAfk(msg, params) {
    const nick = msg.nick;

    if (params.length > 0) {
      const afkReason = params.join(' ').trim();
      this.afkUsers.set(nick, { time: Date.now(), reason: afkReason });
      this.messageHandler.sendChat(`${nick} 正在${afkReason}...`);
      return;
    }

    if (this.afkUsers.has(nick)) {
      const afkData = this.afkUsers.get(nick);
      const afkMs = Date.now() - (typeof afkData === 'object' ? afkData.time : afkData);
      const afkStr = formatTime(afkMs);
      this.afkUsers.delete(nick);
      this.messageHandler.sendChat(`${nick} 已返回 | 离开：${afkStr}`);
    } else {
      this.afkUsers.set(nick, Date.now());
      this.messageHandler.sendChat(`${nick} AFK`);
    }
  }

  /**
   * 处理AFK@提醒
   */
  handleAFKMention(msg) {
    if (this.isMuted) return;
    const mentionReg = /@(\w+)/g;
    let match;
    while ((match = mentionReg.exec(msg.text)) !== null) {
      const user = match[1];
      if (this.afkUsers.has(user)) {
        const afkData = this.afkUsers.get(user);
        const afkMs = Date.now() - (typeof afkData === 'object' ? afkData.time : afkData);
        const afkStr = formatTime(afkMs);
        this.messageHandler.sendChat(`@${msg.nick}：${user} AFK(${afkStr})`);
      }
    }
  }

  /**
   * 处理股票命令
   */
  async handleStockCommand(msg, params) {
    const subCmd = params[0]?.toLowerCase();
    const nick = msg.nick;

    switch (subCmd) {
      case 'list':
        this.handleStockList();
        break;
      case 'buy':
        await this.handleStockBuy(nick, params);
        break;
      case 'sell':
        await this.handleStockSell(nick, params);
        break;
      case 'portfolio':
        this.handleStockPortfolio(nick);
        break;
      default:
        this.messageHandler.sendChat(`!stock [list|buy|sell|portfolio]`);
    }
  }

  /**
   * 显示股票列表
   */
  handleStockList() {
    const list = this.economy.stock.getMarketList();
    let text = `### 股票市场\n`;
    text += `| 股票 | 名称 | 现价 | 涨跌 |\n`;
    text += `|---|----|----|-|\n`;
    list.forEach(stock => {
      const change = stock.change > 0 ? `📈 +${stock.change.toFixed(2)}` : `📉 ${stock.change.toFixed(2)}`;
      text += `| ${stock.symbol} | ${stock.name} | ${stock.price.toFixed(2)}元 | ${change} ${stock.changePercent} |\n`;
    });
    this.messageHandler.sendChat(text);
  }

  /**
   * 购买股票
   */
  async handleStockBuy(nick, params) {
    if (params.length < 3) {
      this.messageHandler.sendPrivateChat(nick, `格式：!stock buy <股票> <数量>`);
      return;
    }

    const symbol = params[1];
    const quantity = parseInt(params[2]);

    if (isNaN(quantity) || quantity <= 0) {
      this.messageHandler.sendPrivateChat(nick, `数量必须是正整数`);
      return;
    }

    const balance = this.economy.wallet.getBalance(nick);
    const result = await this.economy.stock.buyStock(nick, symbol, quantity, balance);

    if (result.success) {
      await this.economy.wallet.deductBalance(nick, result.cost);
      this.messageHandler.sendPrivateChat(nick, result.message);
    } else {
      this.messageHandler.sendPrivateChat(nick, result.message);
    }
  }

  /**
   * 出售股票
   */
  async handleStockSell(nick, params) {
    if (params.length < 3) {
      this.messageHandler.sendPrivateChat(nick, `格式：!stock sell <股票> <数量>`);
      return;
    }

    const symbol = params[1];
    const quantity = parseInt(params[2]);

    if (isNaN(quantity) || quantity <= 0) {
      this.messageHandler.sendPrivateChat(nick, `数量必须是正整数`);
      return;
    }

    const result = await this.economy.stock.sellStock(nick, symbol, quantity);

    if (result.success) {
      await this.economy.wallet.addBalance(nick, result.revenue);
      this.messageHandler.sendPrivateChat(nick, result.message);
    } else {
      this.messageHandler.sendPrivateChat(nick, result.message);
    }
  }

  /**
   * 查看投资组合
   */
  handleStockPortfolio(nick) {
    const portfolio = this.economy.stock.getPortfolio(nick);

    if (!portfolio) {
      this.messageHandler.sendPrivateChat(nick, `你还没有购买任何股票`);
      return;
    }

    let text = `### 你的投资组合\n`;
    portfolio.holdings.forEach(holding => {
      text += `- ${holding.symbol} ${holding.name}: ${holding.quantity}股 @ ${holding.price.toFixed(2)}元 = ${holding.value.toFixed(2)}元\n`;
    });
    text += `\n总价值：**${portfolio.totalValue.toFixed(2)}**元`;

    this.messageHandler.sendPrivateChat(nick, text);
  }

  /**
   * 处理!talk命令
   */
  handleTalk(msg, params) {
    if (!isAdmin(msg.trip, CONFIG.mainBot.ADMIN_TRIPCODE)) {
      this.messageHandler.sendChat(`无权限`);
      return;
    }

    const action = params[0]?.toLowerCase();
    if (!action || !['on', 'off'].includes(action)) {
      if (this.isMuted) return;
      this.messageHandler.sendChat(`格式错误：!talk on（开启发言） / !talk off（闭嘴）`);
      return;
    }

    if (action === 'off') {
      this.isMuted = true;
      this.messageHandler.sendChat(`闭嘴了，呜呜`, true);
      logger.info(`[${CONFIG.core.botName}] 已切换为闭嘴状态`);
    } else {
      this.isMuted = false;
      this.messageHandler.sendChat(`张嘴，说话`, true);
      logger.info(`[${CONFIG.core.botName}] 已切换为正常发言状态`);
    }
  }

  /**
   * 处理停止命令
   */
  handleStop(msg, _) {
    if (!isAdmin(msg.trip, CONFIG.mainBot.ADMIN_TRIPCODE)) {
      this.messageHandler.sendChat(`无权限`);
      return;
    }

    try {
      this.messageHandler.sendChat('毁灭吧，消失吧。');
    } catch (e) { }

    this.stopped = true;
    setTimeout(() => {
      try {
        this.cleanup();
      } catch (e) { }
    }, 500);
  }

  /**
   * 记录消息
   */
  recordMessage(msg) {
    if (msg.cmd !== 'chat' || msg.nick === CONFIG.core.botName) return;

    const msgObj = {
      id: this.nextMessageId++,
      nick: msg.nick,
      trip: msg.trip || '',
      text: msg.text,
      time: new Date().toISOString()
    };

    this.messageHistory.push(msgObj);
    this.messageIdMap.set(msgObj.id, msgObj);
    this.recentMsgTimestamps.push(Date.now());

    const MAX_TS = 500;
    if (this.recentMsgTimestamps.length > MAX_TS) {
      this.recentMsgTimestamps.splice(0, this.recentMsgTimestamps.length - MAX_TS);
    }

    if (this.messageHistory.length > CONFIG.mainBot.maxMsgHistory) {
      const delMsg = this.messageHistory.shift();
      this.messageIdMap.delete(delMsg.id);
    }
  }

  /**
   * 发送欢迎消息
   */
  sendWelcomeMessage(nick) {
    if (nick === CONFIG.core.botName || this.isMuted) return;
    const welcomeText = `欢迎 ${nick} 加入！发送\`!help\`查看命令哟`;
    this.messageHandler.sendChat(welcomeText);
  }

  /**
   * 禁言判断
   */
  isSilenced(nick) {
    if (!this.silencedUsers.has(nick)) return false;
    const expire = this.silencedUsers.get(nick);
    if (expire === Infinity) return true;
    if (expire > Date.now()) return true;
    this.silencedUsers.delete(nick);
    return false;
  }

  /**
   * 更新用户活跃度
   */
  updateUserActivity(nick) {
    this.userActivity.set(nick, (this.userActivity.get(nick) || 0) + 1);
  }

  /**
   * 处理服务端错误
   */
  handleServerError(msg) {
    const errorMap = {
      'nicknameTaken': '昵称被占',
      'channelInvalid': '频道无效',
      'banned': '被官方封禁',
      'rateLimited': '发送频率过高'
    };
    const text = errorMap[msg.error] || `服务端错误：${msg.error}`;
    logger.error(`[服务端错误]`, text);
    this.messageHandler.sendChat(text);
  }

  /**
   * 更新在线用户
   */
  updateOnlineUsers(nicks) {
    this.onlineUsers = new Set(nicks);
    CONFIG.core.debug && logger.debug(`[在线用户] 共${this.onlineUsers.size}人`);
  }

  /**
   * 启动定时器
   */
  startTimers() {
    // 禁言检查
    const muteId = setInterval(() => this.checkMuteExpire(), CONFIG.mainBot.muteCheckInterval);
    this.scheduledIntervals.push(muteId);

    // 整点报时
    const hourlyId = setInterval(() => {
      try {
        if (this.isMuted) return;
        const now = new Date();
        if (now.getMinutes() === 0 && now.getSeconds() < 10) {
          this.messageHandler.sendChat(`${now.getHours()}点了，喝口水吧`);
        }
      } catch (e) {
        logger.error('[小时提醒错误]', e.message);
      }
    }, 1000);
    this.scheduledIntervals.push(hourlyId);
  }

  /**
   * 检查禁言过期
   */
  checkMuteExpire() {
    if (this.isMuted) return;
    const now = Date.now();
    for (const [user, expire] of this.silencedUsers.entries()) {
      if (expire !== Infinity && expire < now) {
        this.silencedUsers.delete(user);
        this.messageHandler.sendChat(`${user} 禁言已到期`);
      }
    }
  }

  /**
   * 启动内存清理器
   */
  startMemoryCleaner() {
    this.memoryCleanerId = setInterval(() => {
      // 清理过期时间戳
      const expireTime = Date.now() - CONFIG.memory.timestampExpireHours * 3600 * 1000;
      this.recentMsgTimestamps = this.recentMsgTimestamps.filter(ts => ts >= expireTime);

      // 清理过期用户活跃度
      const activeUsers = new Set(this.messageHistory.slice(-CONFIG.mainBot.maxMsgHistory).map(m => m.nick));
      for (const [user] of this.userActivity.entries()) {
        if (!activeUsers.has(user)) {
          this.userActivity.delete(user);
        }
      }
    }, 3600 * 1000);
  }

  /**
   * 清理资源
   */
  cleanup() {
    logger.info(`[${CONFIG.core.botName}] 正在停止...`);

    this.scheduledIntervals.forEach(t => {
      try {
        clearInterval(t);
        clearTimeout(t);
      } catch (e) { }
    });

    if (this.memoryCleanerId) {
      clearInterval(this.memoryCleanerId);
    }

    // 清理自动回复系统
    if (this.autoReply) {
      this.autoReply.cleanup();
    }

    // 清理游戏模块
    if (this.gameCommands) {
      this.gameCommands.cleanup();
    }

    // 清理经济系统
    if (this.economy) {
      this.economy.cleanup();
    }

    // 关闭WebSocket
    this.ws && this.ws.close(1000, 'cleanup');

    logger.success(`[${CONFIG.core.botName}] 已停止`);
  }
}

/**
 * HTTP服务器（用于HF Spaces）
 */
const http = require('http');
const server = http.createServer((req, res) => {
  // 健康检查端点
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }));
    return;
  }

  // 默认响应
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('HackChat Bot 运行中！\n');
});

const PORT = process.env.PORT || 7860;
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`HTTP 服务已启动，监听端口 ${PORT}`);
});

/**
 * 应用入口
 */
const bot = new SundigBot();

// 启动机器人
bot.init().catch(err => {
  logger.error('[启动失败]', err.message);
  process.exit(1);
});

// 进程退出处理
process.on('SIGINT', () => {
  logger.info('\n[收到退出信号] 正在停止机器人...');
  bot.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('\n[收到终止信号] 正在停止机器人...');
  bot.cleanup();
  process.exit(0);
});

module.exports = bot;
