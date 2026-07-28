// 新增：适配 HF Spaces 端口监听（必须）
const http = require('http');
// 创建极简 HTTP 服务器，仅用于 HF 端口检测
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('斗地主机器人运行中！\n');
});
// 监听 HF 默认端口 7860（平台会自动映射）
server.listen(7860, () => {
  console.log('HTTP 服务已启动，监听端口 7860（适配 HF Spaces）');
});


// 引入Node.js WebSocket库
const WebSocket = require('ws');

// 核心配置：极简指令 + Node.js适配
const CONFIG = {
  server: "wss://hack.chat/chat-ws",
  channel: "lounge",
  botName: "ddz_bot",
  // 指令别名（简写+全写）
  commands: {
    join: { alias: ['j', 'join'], desc: '加入游戏' },       // d j / d join
    start: { alias: ['s', 'start'], desc: '开始游戏' },     // d s / d start
    call: { alias: ['c', 'call'], desc: '叫地主' },         // d c 3 / d call pass
    pass: { alias: ['p', 'pass'], desc: '不出牌' },         // d p / d pass
    status: { alias: ['st', 'status'], desc: '查看状态' },  // d st / d status
    rule: { alias: ['r', 'rule'], desc: '查看规则' },       // d r / d rule
    help: { alias: ['h', 'help'], desc: '查看帮助' },       // d h / d help
    exit: { alias: ['e', 'exit'], desc: '退出游戏' }        // d e / d exit
  },
  debug: true,
  // 限流/超时配置（保留合并，移除长度限制）
  msgMergeDelay: 400,     // 消息合并延迟（ms）
  opTimeout: 60000,       // 玩家操作超时（60秒，修改处1）
  opWarnTime: 50000,      // 操作超时提醒（50秒，修改处1）
  maxRetry: 2,            // 消息发送最大重试次数
  // 游戏规则配置
  maxStraightLen: 12,     // 顺子最大长度（5-12）
  minStraightLen: 5,      // 顺子最小长度
  // 运行时状态
  msgQueue: new Map(),    // 消息队列
  opTimer: null,          // 操作超时定时器
  warnTimer: null         // 超时提醒定时器
};

// 斗地主核心常量
const CARD_CONST = {
  cardValues: {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, '十':10,
    'J': 11, '勾':11,
    'Q': 12, '圈':12,
    'K': 13, '凯':13,
    'A': 14, '尖':14,
    '2': 15, '二':15,
    '小王': 16, '小':16,
    '大王': 17, '大':17
  },
  cardTypes: {
    SINGLE: '单张',
    PAIR: '对子',
    TRIPLE: '三张',
    TRIPLE_ONE: '三带一',
    STRAIGHT: '顺子',
    BOMB: '炸弹',
    KING_BOMB: '王炸'
  },
  cardRules: {
    STRAIGHT: { min: 5, max: 12, step: 1, exclude: ['2','二','小王','小','大王','大'] },
    TRIPLE_ONE: { needTriple: 1, needSingle: 1 }
  }
};

// 机器人核心对象
const bot = {
  ws: null,
  reconnectTimer: null,
  // 游戏状态
  gameState: 'IDLE', // IDLE/WAITING/CALL_LANDLORD/PLAYING/FINISHED
  players: [],       // [{nick: '', cards: [], isLandlord: false, callScore: 0, lastOp: 0}]
  bottomCards: [],   // 底牌
  currentPlayer: '', // 当前操作玩家
  lastPlayed: {      // 上一出牌记录
    player: '', cards: [], type: '', value: 0
  },
  landlordScore: 0,  // 地主叫分
  passCount: 0,      // 连续不出次数
  gameLog: [],       // 游戏日志

  // 初始化（Node.js入口）
  init() {
    console.log(`[${CONFIG.botName}] 斗地主机器人启动中...`);
    this.connect();
  },

  // ===== 1. WebSocket连接（Node.js适配）=====
  connect() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    this.ws = new WebSocket(CONFIG.server);
    
    // 连接成功
    this.ws.on('open', () => {
      console.log(`[${CONFIG.botName}] WebSocket连接成功`);
      clearTimeout(this.reconnectTimer);
      this.joinChannel();
      this.retryPendingMessages(); // 重连后补发消息
      
      if (this.gameState !== 'IDLE') {
        this.sendPublicChat(`机器人重连成功，游戏继续！当前操作：**${this.currentPlayer}**`);
      } else {
        this.sendPublicChat(`斗地主机器人已启动！输入 **d h** 查看帮助`);
      }
    });

    // 接收消息
    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (CONFIG.debug) console.log('收到消息:', msg);

        // 处理聊天消息（排除自身）
        if (msg.cmd === 'chat' && msg.nick !== CONFIG.botName) {
          const text = msg.text.trim();
          this.handleDDZCommands(msg.nick, text);
          this.updatePlayerOpTime(msg.nick);
        }
      } catch (e) {
        console.error('消息解析错误:', e);
      }
    });

    // 连接关闭
    this.ws.on('close', (code, reason) => {
      console.log(`[${CONFIG.botName}] 连接断开（码：${code}），原因：${reason}，10秒后重连`);
      this.reconnectTimer = setTimeout(() => this.connect(), 10000);
    });

    // 连接错误
    this.ws.on('error', (err) => {
      console.error('WebSocket错误:', err);
    });
  },

  // 加入频道
  joinChannel() {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        cmd: "join",
        channel: CONFIG.channel,
        nick: CONFIG.botName
      }));
    }
  },

  // ===== 2. 消息发送系统（移除长度限制，保留合并/重试）=====
  sendPublicChat(text) {
    this._mergeAndSendMessage(null, text);
  },

  sendPrivateChat(nick, text) {
    if (!nick || !text.trim()) return;
    this._mergeAndSendMessage(nick, text);
  },

  // 合并消息并发送（核心防限流）
  _mergeAndSendMessage(nick, text) {
    if (!text.trim()) return;

    // 初始化队列项
    if (!CONFIG.msgQueue.has(nick)) {
      CONFIG.msgQueue.set(nick, {
        text: '',
        timer: null,
        retryCount: 0
      });
    }

    const queueItem = CONFIG.msgQueue.get(nick);
    // 合并消息（换行分隔，不移除长度限制）
    queueItem.text = queueItem.text ? `${queueItem.text}\n${text}` : text;

    // 重置定时器
    if (queueItem.timer) clearTimeout(queueItem.timer);
    queueItem.timer = setTimeout(() => {
      try {
        let sendText = queueItem.text;
        // 构造私信格式
        if (nick) sendText = `/w @${nick} ${sendText}`;

        // 直接发送（移除长度拆分）
        this._sendSingleMessage(sendText, nick, queueItem);
      } catch (e) {
        console.error('消息处理失败:', e);
      } finally {
        CONFIG.msgQueue.delete(nick);
      }
    }, CONFIG.msgMergeDelay);
  },

  // 发送单条消息（带重试，无长度限制）
  _sendSingleMessage(text, nick, queueItem) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      queueItem.retryCount++;
      if (queueItem.retryCount <= CONFIG.maxRetry) {
        setTimeout(() => this._sendSingleMessage(text, nick, queueItem), 1000);
        console.log(`[重试${queueItem.retryCount}] 消息发送失败，稍后重试`);
      } else {
        console.error(`[${nick || '公屏'}] 消息发送失败（重试${CONFIG.maxRetry}次）:`, text.substring(0, 50) + '...');
      }
      return;
    }

    // Node.js下直接发送
    this.ws.send(JSON.stringify({ cmd: "chat", text: text }));
    if (CONFIG.debug) {
      console.log(`发送${nick ? '私信给'+nick : '公屏消息'}:`, text.substring(0, 50) + '...');
    }
  },

  // 重连后补发消息
  retryPendingMessages() {
    Array.from(CONFIG.msgQueue.entries()).forEach(([nick, item]) => {
      if (item.text) this._mergeAndSendMessage(nick, item.text);
    });
  },

  // ===== 3. 指令解析（极简指令+Node.js适配）=====
  handleDDZCommands(nick, text) {
    const parts = text.split(/\s+/).filter(p => p);
    if (parts[0] !== 'd') return;

    const cmdParts = parts.slice(1);
    if (cmdParts.length === 0) {
      this.sendPrivateChat(nick, `错误：指令格式错误！输入 **d h** 查看帮助`);
      return;
    }

    // 匹配预设指令/出牌指令
    const cmdKey = this._matchCommand(cmdParts[0]);
    if (cmdKey) {
      const args = cmdParts.slice(1);
      this._execPresetCommand(nick, cmdKey, args);
    } else {
      // 出牌指令：d 牌1 牌2...
      const playCards = this._normalizeCards(cmdParts);
      this.handlePlayCards(nick, playCards);
    }
  },

  // 匹配指令别名
  _matchCommand(input) {
    for (const [key, cmd] of Object.entries(CONFIG.commands)) {
      if (cmd.alias.includes(input.toLowerCase())) {
        return key;
      }
    }
    return null;
  },

  // 标准化牌型输入（容错）
  _normalizeCards(cardInputs) {
    const standardCards = [];
    const valueMap = new Map();
    
    // 反向映射：权重→标准牌名
    Object.entries(CARD_CONST.cardValues).forEach(([name, val]) => {
      if (!valueMap.has(val) || ['3','4','5','6','7','8','9','10','J','Q','K','A','2','小王','大王'].includes(name)) {
        valueMap.set(val, name);
      }
    });

    // 转换输入为标准牌名
    cardInputs.forEach(input => {
      const val = CARD_CONST.cardValues[input];
      if (val !== undefined) {
        standardCards.push(valueMap.get(val));
      }
    });

    return standardCards;
  },

  // 执行预设指令
  _execPresetCommand(nick, cmdKey, args) {
    switch (cmdKey) {
      case 'join': this.handleJoinGame(nick); break;
      case 'start': this.handleStartGame(nick); break;
      case 'call': this.handleCallLandlord(nick, args[0]); break;
      case 'pass': this.handlePass(nick); break;
      case 'status': this.handleShowStatus(nick); break;
      case 'rule': this.showGameRules(nick); break;
      case 'help': this.showCommandHelp(nick); break;
      case 'exit': this.handleExitGame(nick); break;
      default: this.sendPrivateChat(nick, `错误：未知指令！输入 **d h** 查看帮助`);
    }
  },

  // ===== 4. 游戏指令处理（核心逻辑不变）=====
  // 加入游戏（d j/d join）
  handleJoinGame(nick) {
    if (this.gameState !== 'IDLE' && this.gameState !== 'WAITING') {
      this.sendPrivateChat(nick, `错误：当前游戏已开始，无法加入！`);
      return;
    }

    if (this.players.some(p => p.nick === nick)) {
      this.sendPrivateChat(nick, `成功：你已加入游戏！当前玩家：**${this.players.length}/3**`);
      return;
    }

    this.players.push({
      nick: nick,
      cards: [],
      isLandlord: false,
      callScore: 0,
      lastOp: Date.now()
    });

    this.gameState = 'WAITING';
    this.sendPublicChat(`成功：**${nick}** 加入斗地主游戏！当前：**${this.players.length}/3**`);
    
    if (this.players.length < 3) {
      this.sendPublicChat(`还需要 **${3 - this.players.length}** 人，输入 **d j** 加入`);
    }

    // 新手引导
    this.sendPrivateChat(nick, `成功加入游戏！
- 等待3人齐后输入 **d s** 开始游戏
- 输入 **d r** 查看规则 | **d h** 查看帮助
- 输入 **d e** 可退出游戏`);
  },

  // 开始游戏（d s/d start）
  handleStartGame(nick) {
    if (this.gameState !== 'WAITING') {
      this.sendPrivateChat(nick, `错误：当前无法开始游戏！`);
      return;
    }

    if (this.players.length < 3) {
      this.sendPrivateChat(nick, `错误：玩家不足（当前**${this.players.length}/3**）！`);
      return;
    }

    // 初始化游戏
    this.gameState = 'CALL_LANDLORD';
    this.passCount = 0;
    this.lastPlayed = { player: '', cards: [], type: '', value: 0 };
    this.gameLog = [];

    // 生成+洗牌+发牌
    const allCards = this._generateCards();
    this._shuffleCards(allCards);
    this._dealCards(allCards);

    // 随机选第一个叫地主的玩家
    const firstCallerIdx = Math.floor(Math.random() * 3);
    this.currentPlayer = this.players[firstCallerIdx].nick;

    // 发送通知
    this.sendPublicChat(`斗地主游戏开始！
- 底牌：**${this.bottomCards.join(' ')}**
- 请 **${this.currentPlayer}** 先叫地主！输入 **d c 1/2/3** 叫分，或 **d c pass** 不叫`);
    
    // 私信发手牌
    this.players.forEach(player => {
      const sortedCards = this._sortCards(player.cards);
      this.sendPrivateChat(player.nick, `游戏开始！
你的手牌：**${sortedCards.join(' ')}** (共**${player.cards.length}**张)
当前阶段：**叫地主**
- 叫分：**d c 1/2/3** | 不叫：**d c pass**`);
    });

    // 启动超时定时器
    this._startOpTimeoutTimer();
  },

  // 叫地主（d c/d call）
  handleCallLandlord(nick, scoreStr) {
    if (this.gameState !== 'CALL_LANDLORD') {
      this.sendPrivateChat(nick, `错误：当前不是叫地主阶段！`);
      return;
    }
    if (this.currentPlayer !== nick) {
      this.sendPrivateChat(nick, `错误：请等待 **${this.currentPlayer}** 操作！`);
      return;
    }

    // 解析叫分
    const scoreMap = { '1':1, '2':2, '3':3, 'pass':0, '不叫':0 };
    const score = scoreMap[scoreStr?.toLowerCase()] ?? -1;
    
    if (score === -1) {
      this.sendPrivateChat(nick, `错误：叫分格式错误！
正确格式：**d c 1** / **d c 2** / **d c 3** / **d c pass**`);
      return;
    }

    // 更新叫分
    const playerIdx = this.players.findIndex(p => p.nick === nick);
    this.players[playerIdx].callScore = score;
    this.players[playerIdx].lastOp = Date.now();

    // 公屏通知
    if (score === 0) {
      this.sendPublicChat(`**${nick}** 选择不叫地主！`);
    } else {
      this.sendPublicChat(`**${nick}** 叫了 **${score}** 分！`);
      this.landlordScore = score;
    }

    // 切换下一个玩家
    const nextIdx = (playerIdx + 1) % 3;
    this.currentPlayer = this.players[nextIdx].nick;

    // 检查是否所有玩家都叫完
    const allCalled = this.players.every(p => p.callScore !== 0 || p.callScore === 0);
    if (allCalled) {
      this._determineLandlord();
      return;
    }

    // 提示下一个玩家
    this.sendPublicChat(`请 **${this.currentPlayer}** 叫地主！`);
    this.sendPrivateChat(this.currentPlayer, `轮到你叫地主！
- 叫分：**d c 1/2/3** | 不叫：**d c pass**`);
    this._startOpTimeoutTimer();
  },

  // 不出牌（d p/d pass）
  handlePass(nick) {
    if (this.gameState !== 'PLAYING') {
      this.sendPrivateChat(nick, `错误：当前不是出牌阶段！`);
      return;
    }
    if (this.currentPlayer !== nick) {
      this.sendPrivateChat(nick, `错误：请等待 **${this.currentPlayer}** 操作！`);
      return;
    }

    // 首轮不能pass
    if (this.lastPlayed.cards.length === 0) {
      this.sendPrivateChat(nick, `错误：你是本轮第一个出牌的玩家，不能不出！
你的手牌：**${this._sortCards(this.players.find(p=>p.nick===nick).cards).join(' ')}**`);
      return;
    }

    // 执行pass
    this.passCount++;
    this.players.find(p=>p.nick===nick).lastOp = Date.now();
    
    this.sendPublicChat(`**${nick}** 选择不出！（连续不出：**${this.passCount}**/3）`);
    this.sendPrivateChat(nick, `成功：选择不出！剩余手牌：**${this.players.find(p=>p.nick===nick).cards.length}**张`);

    // 连续3人不出 → 重置本轮
    if (this.passCount >= 3) {
      const lastPlayedPlayer = this.lastPlayed.player; // 保存上一轮最后出牌的玩家
      this.passCount = 0;
      this.lastPlayed = { player: '', cards: [], type: '', value: 0 }; // 清空上一出牌记录
      this.currentPlayer = lastPlayedPlayer; // 切换回最后出牌的玩家
      this.sendPublicChat(`连续3人不出，本轮重置！**${lastPlayedPlayer}** 可出任意牌`);
      // 通知该玩家
      this.sendPrivateChat(lastPlayedPlayer, `本轮重置，你可出任意牌！
你的手牌：**${this._sortCards(this.players.find(p=>p.nick===lastPlayedPlayer).cards).join(' ')}**
- 出牌格式：**d 牌**`);
      this._startOpTimeoutTimer();
      return; // 终止后续的玩家切换逻辑
    }

    // 切换下一个玩家
    this._switchNextPlayer();
  },

  // 出牌（d 牌）核心逻辑
  handlePlayCards(nick, playCards) {
    if (this.gameState !== 'PLAYING') {
      this.sendPrivateChat(nick, `错误：当前不是出牌阶段！`);
      return;
    }
    if (this.currentPlayer !== nick) {
      this.sendPrivateChat(nick, `错误：请等待 **${this.currentPlayer}** 操作！`);
      return;
    }

    const playerIdx = this.players.findIndex(p => p.nick === nick);
    const playerCards = [...this.players[playerIdx].cards];
    playCards = playCards.filter(c => playerCards.includes(c));

    // 空出牌校验
    if (playCards.length === 0) {
      this.sendPrivateChat(nick, `错误：无效出牌！请检查牌型：
你的手牌：**${this._sortCards(playerCards).join(' ')}**
支持牌型示例：
- 顺子：**d 3 4 5 6 7** | 王炸：**d 小王 大王**`);
      return;
    }

    // 检查是否有对应牌
    const missing = playCards.filter(c => !playerCards.includes(c));
    if (missing.length > 0) {
      this.sendPrivateChat(nick, `错误：你没有这些牌：**${missing.join(' ')}**！
你的手牌：**${this._sortCards(playerCards).join(' ')}**`);
      return;
    }

    // 解析牌型
    const cardType = this._analyzeCardType(playCards);
    if (!cardType) {
      this.sendPrivateChat(nick, `错误：牌型不合法！支持：
- 单张 | 对子 | 三张 | 三带一 | 顺子(5-12张) | 炸弹 | 王炸
你的手牌：**${this._sortCards(playerCards).join(' ')}**`);
      return;
    }

    // 校验是否能压过上家（修改处2：仅当当前玩家不是上一轮最后出牌者时才校验）
    if (this.lastPlayed.cards.length > 0 && this.currentPlayer !== this.lastPlayed.player) {
      const canBeat = this._compareCards(cardType, this.lastPlayed);
      if (!canBeat) {
        this.sendPrivateChat(nick, `错误：无法压过上家！
上家出牌：**${this.lastPlayed.cards.join(' ')}** (${this.lastPlayed.type})
你的出牌：**${playCards.join(' ')}** (${cardType.type})`);
        return;
      }
    }

    // 执行出牌
    this.passCount = 0;
    this.lastPlayed = {
      player: nick,
      cards: [...playCards],
      type: cardType.type,
      value: cardType.value
    };

    // 移除已出牌
    playCards.forEach(card => {
      const idx = this.players[playerIdx].cards.indexOf(card);
      this.players[playerIdx].cards.splice(idx, 1);
    });

    this.players[playerIdx].lastOp = Date.now();
    this.gameLog.push({ player: nick, cards: playCards, type: cardType.type });

    // 通知结果
    this.sendPublicChat(`**${nick}** 出了：**${playCards.join(' ')}** (${cardType.type})`);
    this.sendPrivateChat(nick, `成功：出牌成功！
剩余手牌：**${this._sortCards(this.players[playerIdx].cards).join(' ')}** (共**${this.players[playerIdx].cards.length}**张)`);

    // 检查游戏结束
    if (this.players[playerIdx].cards.length === 0) {
      this._gameOver(nick);
      return;
    }

    // 切换下一个玩家
    this._switchNextPlayer();
  },

  // 查看状态（d st/d status）
  handleShowStatus(nick) {
    let statusText = `### 斗地主游戏状态\n`;
    statusText += `当前阶段：**${this._getGameStateText()}**\n`;
    statusText += `玩家列表：\n`;
    
    this.players.forEach(p => {
      statusText += `- **${p.nick}** (${p.cards.length}张) ${p.isLandlord ? '地主' : '农民'}\n`;
    });

    if (this.gameState === 'PLAYING') {
      statusText += `当前操作：**${this.currentPlayer}**\n`;
      statusText += `上一出牌：${this.lastPlayed.player ? `**${this.lastPlayed.player}** - **${this.lastPlayed.cards.join(' ')}**` : '无'}\n`;
      statusText += `连续不出：**${this.passCount}**/3\n`;
    } else if (this.gameState === 'CALL_LANDLORD') {
      statusText += `当前叫地主：**${this.currentPlayer}**\n`;
      statusText += `已叫分数：${this.players.map(p => `**${p.nick}**：${p.callScore || '未叫'}`).join(' | ')}\n`;
    }

    // 私信发详细状态，公屏发简版
    this.sendPrivateChat(nick, statusText);
    this.sendPublicChat(`### 游戏状态
- 当前阶段：**${this._getGameStateText()}** 
- 当前操作：**${this.currentPlayer}** 
- 玩家数：**${this.players.length}**`);
  },

  // 查看规则（d r/d rule）
  showGameRules(nick) {
    const ruleText = `### 斗地主游戏规则
1. 基础规则：
   - 3人游戏：1地主 + 2农民
   - 地主：20张牌（含3张底牌）| 农民：17张牌
   - 先出完牌的阵营获胜
2. 叫地主规则：
   - 可叫1/2/3分或不叫，最高分者为地主
   - 都不叫则随机选地主，默认1分
3. 出牌规则：
   - 支持牌型：单张/对子/三张/三带一/顺子(5-12)/炸弹/王炸
   - 牌型大小：王炸 > 炸弹 > 其他（同牌型比数值）
   - 连续3人不出则本轮重置，最后出牌玩家可出任意牌
4. 胜负规则：
   - 地主赢：得 2×叫分 | 农民赢：地主扣 2×叫分`;
    this.sendPrivateChat(nick, ruleText);
  },

  // 查看帮助（d h/d help）
  showCommandHelp(nick) {
    const helpText = `### 斗地主极简指令帮助
| 指令简写 | 指令全写 | 功能 |
| --- | --- | --- |
| **d j** | **d join** | 加入游戏 |
| **d s** | **d start** | 开始游戏 |
| **d c** | **d call** | 叫地主 |
| **d p** | **d pass** | 不出牌 |
| **d st** | **d status** | 查看状态 |
| **d r** | **d rule** | 查看规则 |
| **d h** | **d help** | 查看帮助 |
| **d e** | **d exit** | 退出游戏 |
| **d 牌** | - | 出牌（核心） |

#### 出牌示例：
- 顺子：**d 3 4 5 6 7**
- 王炸：**d 小王 大王**
- 三带一：**d 5 5 5 7**
- 炸弹：**d 8 8 8 8**`;
    this.sendPrivateChat(nick, helpText);
  },

  // 退出游戏（d e/d exit）
  handleExitGame(nick) {
    const playerIdx = this.players.findIndex(p => p.nick === nick);
    if (playerIdx === -1) {
      this.sendPrivateChat(nick, `错误：你未加入游戏！`);
      return;
    }

    // 移除玩家
    this.players.splice(playerIdx, 1);
    this.sendPublicChat(`**${nick}** 退出了游戏！剩余玩家：**${this.players.length}**`);
    this.sendPrivateChat(nick, `成功：已退出游戏！`);

    // 游戏重置
    if (this.players.length < 2) {
      this._resetGame();
      this.sendPublicChat(`玩家不足，游戏已重置！输入 **d j** 重新加入`);
    } else if (this.currentPlayer === nick) {
      this._switchNextPlayer();
    }
  },

  // ===== 5. 核心游戏逻辑（Node.js适配）=====
  // 生成牌库
  _generateCards() {
    const baseCards = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
    const allCards = [];
    
    // 4套基础牌
    baseCards.forEach(card => {
      for (let i=0; i<4; i++) allCards.push(card);
    });
    
    // 大小王
    allCards.push('小王', '大王');
    return allCards;
  },

  // 洗牌
  _shuffleCards(cards) {
    for (let i = cards.length-1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  },

  // 发牌
  _dealCards(allCards) {
    this.bottomCards = allCards.splice(0, 3);
    this.players.forEach((player, idx) => {
      player.cards = allCards.splice(0, 17);
      player.cards = this._sortCards(player.cards);
    });
  },

  // 确定地主
  _determineLandlord() {
    const maxScore = Math.max(...this.players.map(p => p.callScore));
    let landlordIdx = this.players.findIndex(p => p.callScore === maxScore);

    // 都不叫 → 随机选
    if (maxScore === 0) {
      this.sendPublicChat(`所有玩家都不叫地主，随机选择！`);
      landlordIdx = Math.floor(Math.random() * 3);
      this.landlordScore = 1;
    }

    // 设置地主
    this.players[landlordIdx].isLandlord = true;
    this.players[landlordIdx].cards = [...this.players[landlordIdx].cards, ...this.bottomCards];
    this.players[landlordIdx].cards = this._sortCards(this.players[landlordIdx].cards);

    this.currentPlayer = this.players[landlordIdx].nick;
    this.gameState = 'PLAYING';

    // 通知结果
    this.sendPublicChat(`**${this.players[landlordIdx].nick}** 成为地主！
- 底牌：**${this.bottomCards.join(' ')}**
- 请地主先出牌！输入 **d 牌** 出牌，例：**d 3**`);
    
    // 私信通知
    this.players.forEach(player => {
      if (player.isLandlord) {
        this.sendPrivateChat(player.nick, `你成为地主！
底牌已加入手牌：**${this.bottomCards.join(' ')}**
当前手牌：**${this._sortCards(player.cards).join(' ')}** (共20张)
- 你先出牌，格式：**d 牌**`);
      } else {
        this.sendPrivateChat(player.nick, `你是农民！
地主：**${this.players[landlordIdx].nick}**
你的手牌：**${this._sortCards(player.cards).join(' ')}** (共17张)
- 等待地主出牌后，输入 **d 牌** 出牌 / **d p** 不出`);
      }
    });

    // 启动超时定时器
    this._startOpTimeoutTimer();
  },

  // 解析牌型
  _analyzeCardType(cards) {
    const len = cards.length;
    const valueMap = new Map();
    
    // 统计每张牌的数量
    cards.forEach(card => {
      const val = CARD_CONST.cardValues[card];
      valueMap.set(val, (valueMap.get(val) || 0) + 1);
    });

    const counts = Array.from(valueMap.values());
    const values = Array.from(valueMap.keys()).sort((a,b) => a-b);

    // 王炸
    if (len === 2 && cards.includes('小王') && cards.includes('大王')) {
      return { type: CARD_CONST.cardTypes.KING_BOMB, value: 999 };
    }

    // 炸弹
    if (len === 4 && counts.every(c => c === 4)) {
      return { type: CARD_CONST.cardTypes.BOMB, value: values[0] };
    }

    // 三带一
    if (len === 4 && (counts.includes(3) && counts.includes(1))) {
      const tripleVal = values.find(v => valueMap.get(v) === 3);
      return { type: CARD_CONST.cardTypes.TRIPLE_ONE, value: tripleVal };
    }

    // 三张
    if (len === 3 && counts.every(c => c === 3)) {
      return { type: CARD_CONST.cardTypes.TRIPLE, value: values[0] };
    }

    // 对子
    if (len === 2 && counts.every(c => c === 2)) {
      return { type: CARD_CONST.cardTypes.PAIR, value: values[0] };
    }

    // 单张
    if (len === 1) {
      return { type: CARD_CONST.cardTypes.SINGLE, value: values[0] };
    }

    // 顺子
    if (len >= CONFIG.minStraightLen && len <= CONFIG.maxStraightLen && counts.every(c => c === 1)) {
      let isStraight = true;
      for (let i=1; i<values.length; i++) {
        if (values[i] - values[i-1] !== 1) {
          isStraight = false;
          break;
        }
      }

      if (isStraight && values[values.length-1] <= 14) {
        return { type: CARD_CONST.cardTypes.STRAIGHT, value: values[values.length-1] };
      }
    }

    // 不合法牌型
    return null;
  },

  // 比较牌型大小
  _compareCards(newCard, lastCard) {
    if (newCard.type === CARD_CONST.cardTypes.KING_BOMB) return true;
    if (newCard.type === CARD_CONST.cardTypes.BOMB && lastCard.type !== CARD_CONST.cardTypes.KING_BOMB) return true;
    if (newCard.type === lastCard.type) return newCard.value > lastCard.value;
    return false;
  },

  // 手牌排序
  _sortCards(cards) {
    return cards.sort((a, b) => {
      const valA = CARD_CONST.cardValues[a];
      const valB = CARD_CONST.cardValues[b];
      return valA - valB;
    });
  },

  // 切换下一个玩家
  _switchNextPlayer() {
    const currIdx = this.players.findIndex(p => p.nick === this.currentPlayer);
    const nextIdx = (currIdx + 1) % 3;
    this.currentPlayer = this.players[nextIdx].nick;

    // 通知
    this.sendPublicChat(`请 **${this.currentPlayer}** 出牌！
- 出牌：**d 牌** | 不出：**d p**`);
    this.sendPrivateChat(this.currentPlayer, `轮到你出牌！
上一出牌：${this.lastPlayed.player ? `**${this.lastPlayed.player}** - **${this.lastPlayed.cards.join(' ')}** (${this.lastPlayed.type})` : '无'}
你的手牌：**${this._sortCards(this.players[nextIdx].cards).join(' ')}**
- 出牌：**d 牌** | 不出：**d p**`);

    // 启动超时定时器
    this._startOpTimeoutTimer();
  },

  // 游戏结束
  _gameOver(winerNick) {
    const isLandlordWin = this.players.some(p => p.nick === winerNick && p.isLandlord);
    this.gameState = 'FINISHED';

    // 结算分数
    const score = this.landlordScore * 2;
    
    // 公屏通知
    const resultText = `### 游戏结束！
${isLandlordWin ? 
  `**${winerNick}**（地主）获胜！赢 **${score}** 分` : 
  `**${winerNick}**（农民）获胜！地主扣 **${score}** 分`}

5秒后游戏重置，输入 **d j** 可重新加入`;
    this.sendPublicChat(resultText);

    // 私信通知每个玩家
    this.players.forEach(player => {
      const privateResult = `### 游戏结束！
${isLandlordWin ? 
  `地主**${winerNick}**赢了**${score}**分` : 
  `农民**${winerNick}**赢了！地主扣**${score}**分`}
- 你的身份：${player.isLandlord ? '地主' : '农民'}
- 你剩余手牌：${player.cards.length}张`;
      this.sendPrivateChat(player.nick, privateResult);
    });

    // 重置游戏
    setTimeout(() => this._resetGame(), 5000);
  },

  // 重置游戏状态
  _resetGame() {
    this.gameState = 'IDLE';
    this.players = [];
    this.bottomCards = [];
    this.currentPlayer = '';
    this.lastPlayed = { player: '', cards: [], type: '', value: 0 };
    this.landlordScore = 0;
    this.passCount = 0;
    this.gameLog = [];
    
    clearTimeout(CONFIG.opTimer);
    clearTimeout(CONFIG.warnTimer);
    CONFIG.opTimer = null;
    CONFIG.warnTimer = null;

    this.sendPublicChat(`游戏已重置！输入 **d j** 加入新游戏`);
  },

  // 超时处理
  _startOpTimeoutTimer() {
    clearTimeout(CONFIG.opTimer);
    clearTimeout(CONFIG.warnTimer);

    // 超时提醒（50秒，对应修改后的配置）
    CONFIG.warnTimer = setTimeout(() => {
      this.sendPrivateChat(this.currentPlayer, `操作超时提醒！剩余10秒！
- 请尽快出牌：**d 牌** 或 不出：**d p**`);
    }, CONFIG.opWarnTime);

    // 超时自动pass（60秒，对应修改后的配置）
    CONFIG.opTimer = setTimeout(() => {
      this.sendPublicChat(`**${this.currentPlayer}** 操作超时，自动不出！`);
      this.handlePass(this.currentPlayer);
    }, CONFIG.opTimeout);
  },

  // 更新玩家操作时间
  updatePlayerOpTime(nick) {
    const player = this.players.find(p => p.nick === nick);
    if (player) player.lastOp = Date.now();
    
    if (nick === this.currentPlayer) {
      this._startOpTimeoutTimer();
    }
  },

  // 获取游戏状态文本
  _getGameStateText() {
    const stateMap = {
      'IDLE': '空闲（可加入）',
      'WAITING': '等待玩家（需3人）',
      'CALL_LANDLORD': '叫地主阶段',
      'PLAYING': '出牌阶段',
      'FINISHED': '游戏结束'
    };
    return stateMap[this.gameState] || '未知状态';
  }
};

// 启动机器人（Node.js入口）
bot.init();

// 捕获Node.js进程退出信号
process.on('SIGINT', () => {
  console.log(`[${CONFIG.botName}] 机器人正在退出...`);
  if (bot.ws) {
    bot.ws.close();
  }
  process.exit(0);
});
