/**
 * 斗地主游戏模块
 */

const CONFIG = require('../../config');
const CurrencySystem = require('./currency');
const logger = require('../../utils/logger');

const CARD_CONST = {
  cardValues: {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, '十': 10,
    'J': 11, '勾': 11,
    'Q': 12, '圈': 12,
    'K': 13, '凯': 13,
    'A': 14, '尖': 14,
    '2': 15, '二': 15,
    '小王': 16, '小': 16,
    '大王': 17, '大': 17
  },
  cardTypes: {
    SINGLE: '单张',
    PAIR: '对子',
    TRIPLE: '三张',
    TRIPLE_ONE: '三带一',
    STRAIGHT: '顺子',
    BOMB: '炸弹',
    KING_BOMB: '王炸'
  }
};

class DDZGame {
  constructor(messageHandler, wallet) {
    this.messageHandler = messageHandler;
    this.wallet = wallet;
    this.currency = new CurrencySystem(wallet);

    // 游戏状态
    this.gameState = 'IDLE';
    this.players = [];
    this.bottomCards = [];
    this.currentPlayer = '';
    this.lastPlayed = { player: '', cards: [], type: '', value: 0 };
    this.landlordScore = 0;
    this.passCount = 0;
    this.gameLog = [];
    this.opTimer = null;
    this.warnTimer = null;
  }

  /**
   * 处理DDZ命令
   */
  handleCommand(nick, text) {
    const parts = text.split(/\s+/).filter(p => p);
    if (parts[0] !== 'd') return false;

    const cmdParts = parts.slice(1);
    if (cmdParts.length === 0) {
      this.messageHandler.sendPrivateChat(nick, `错误：指令格式错误！输入 **d h** 查看帮助`);
      return true;
    }

    const cmdKey = this._matchCommand(cmdParts[0]);
    if (cmdKey) {
      const args = cmdParts.slice(1);
      this._execCommand(nick, cmdKey, args);
    } else {
      const playCards = this._normalizeCards(cmdParts);
      this.handlePlayCards(nick, playCards);
    }

    return true;
  }

  // ===== 命令处理 =====

  _matchCommand(input) {
    const commands = {
      join: ['j', 'join'],
      start: ['s', 'start'],
      call: ['c', 'call'],
      pass: ['p', 'pass'],
      status: ['st', 'status'],
      rule: ['r', 'rule'],
      help: ['h', 'help'],
      list: ['list', 'l'],
      exit: ['e', 'exit']
    };

    for (const [key, aliases] of Object.entries(commands)) {
      if (aliases.includes(input.toLowerCase())) return key;
    }
    return null;
  }

  _execCommand(nick, cmdKey, args) {
    switch (cmdKey) {
      case 'join': this.handleJoinGame(nick); break;
      case 'start': this.handleStartGame(nick); break;
      case 'call': this.handleCallLandlord(nick, args[0]); break;
      case 'pass': this.handlePass(nick); break;
      case 'status': this.handleShowStatus(nick); break;
      case 'rule': this.showGameRules(nick); break;
      case 'help': this.showCommandHelp(nick); break;
      case 'exit': this.handleExitGame(nick); break;
      case 'list': this.handlePlayerList(nick); break;
      default: this.messageHandler.sendPrivateChat(nick, '未知指令');
    }
  }

  handleJoinGame(nick) {
    if (this.gameState !== 'IDLE' && this.gameState !== 'WAITING') {
      this.messageHandler.sendPrivateChat(nick, `错误：当前游戏已开始，无法加入！`);
      return;
    }

    if (this.players.some(p => p.nick === nick)) {
      this.messageHandler.sendPrivateChat(nick, `成功：你已加入游戏！当前玩家：**${this.players.length}/3**`);
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
    this.messageHandler.sendChat(`成功：**${nick}** 加入斗地主游戏！当前：**${this.players.length}/3**`);

    if (this.players.length < 3) {
      this.messageHandler.sendChat(`还需要 **${3 - this.players.length}** 人，输入 **d j** 加入`);
    }

    this.messageHandler.sendPrivateChat(nick, `成功加入游戏！
- 等待3人齐后输入 **d s** 开始游戏
- 输入 **d r** 查看规则 | **d h** 查看帮助
- 输入 **d e** 可退出游戏`);
  }

  handleStartGame(nick) {
    if (this.gameState !== 'WAITING') {
      this.messageHandler.sendPrivateChat(nick, `错误：当前无法开始游戏！`);
      return;
    }

    if (this.players.length < 3) {
      this.messageHandler.sendPrivateChat(nick, `错误：玩家不足（当前**${this.players.length}/3**）！`);
      return;
    }

    this.gameState = 'CALL_LANDLORD';
    this.passCount = 0;
    this.lastPlayed = { player: '', cards: [], type: '', value: 0 };
    this.gameLog = [];

    const allCards = this._generateCards();
    this._shuffleCards(allCards);
    this._dealCards(allCards);

    const firstCallerIdx = Math.floor(Math.random() * 3);
    this.currentPlayer = this.players[firstCallerIdx].nick;

    this.messageHandler.sendChat(`斗地主游戏开始！
- 底牌：**${this.bottomCards.join(' ')}**
- 请 **${this.currentPlayer}** 先叫地主！输入 **d c 1/2/3** 叫分，或 **d c pass** 不叫`);

    this.players.forEach(player => {
      const sortedCards = this._sortCards(player.cards);
      this.messageHandler.sendPrivateChat(player.nick, `游戏开始！
你的手牌：**${sortedCards.join(' ')}** (共**${player.cards.length}**张)
当前阶段：**叫地主**
- 叫分：**d c 1/2/3** | 不叫：**d c pass**`);
    });

    this._startOpTimeoutTimer();
  }

  handleCallLandlord(nick, scoreStr) {
    if (this.gameState !== 'CALL_LANDLORD') {
      this.messageHandler.sendPrivateChat(nick, `错误：当前不是叫地主阶段！`);
      return;
    }
    if (this.currentPlayer !== nick) {
      this.messageHandler.sendPrivateChat(nick, `错误：请等待 **${this.currentPlayer}** 操作！`);
      return;
    }

    const scoreMap = { '1': 1, '2': 2, '3': 3, 'pass': 0, '不叫': 0 };
    const score = scoreMap[scoreStr?.toLowerCase()] ?? -1;

    if (score === -1) {
      this.messageHandler.sendPrivateChat(nick, `错误：叫分格式错误！
正确格式：**d c 1** / **d c 2** / **d c 3** / **d c pass**`);
      return;
    }

    const playerIdx = this.players.findIndex(p => p.nick === nick);
    this.players[playerIdx].callScore = score;
    this.players[playerIdx].lastOp = Date.now();

    if (score === 0) {
      this.messageHandler.sendChat(`**${nick}** 选择不叫地主！`);
    } else {
      this.messageHandler.sendChat(`**${nick}** 叫了 **${score}** 分！`);
      this.landlordScore = score;
    }

    const nextIdx = (playerIdx + 1) % 3;
    this.currentPlayer = this.players[nextIdx].nick;

    const allCalled = this.players.every(p => p.callScore !== 0 || p.callScore === 0);
    if (allCalled) {
      this._determineLandlord();
      return;
    }

    this.messageHandler.sendChat(`请 **${this.currentPlayer}** 叫地主！`);
    this.messageHandler.sendPrivateChat(this.currentPlayer, `轮到你叫地主！
- 叫分：**d c 1/2/3** | 不叫：**d c pass**`);
    this._startOpTimeoutTimer();
  }

  handlePass(nick) {
    if (this.gameState !== 'PLAYING') {
      this.messageHandler.sendPrivateChat(nick, `错误：当前不是出牌阶段！`);
      return;
    }
    if (this.currentPlayer !== nick) {
      this.messageHandler.sendPrivateChat(nick, `错误：请等待 **${this.currentPlayer}** 操作！`);
      return;
    }

    if (this.lastPlayed.cards.length === 0) {
      this.messageHandler.sendPrivateChat(nick, `错误：你是本轮第一个出牌的玩家，不能不出！
你的手牌：**${this._sortCards(this.players.find(p => p.nick === nick).cards).join(' ')}**`);
      return;
    }

    this.passCount++;
    this.players.find(p => p.nick === nick).lastOp = Date.now();

    this.messageHandler.sendChat(`**${nick}** 选择不出！（连续不出：**${this.passCount}**/3）`);
    this.messageHandler.sendPrivateChat(nick, `成功：选择不出！剩余手牌：**${this.players.find(p => p.nick === nick).cards.length}**张`);

    if (this.passCount >= 3) {
      const lastPlayedPlayer = this.lastPlayed.player;
      this.passCount = 0;
      this.lastPlayed = { player: '', cards: [], type: '', value: 0 };
      this.currentPlayer = lastPlayedPlayer;
      this.messageHandler.sendChat(`连续3人不出，本轮重置！**${lastPlayedPlayer}** 可出任意牌`);
      this.messageHandler.sendPrivateChat(lastPlayedPlayer, `本轮重置，你可出任意牌！
你的手牌：**${this._sortCards(this.players.find(p => p.nick === lastPlayedPlayer).cards).join(' ')}**
- 出牌格式：**d 牌**`);
      this._startOpTimeoutTimer();
      return;
    }

    this._switchNextPlayer();
  }

  handlePlayCards(nick, playCards) {
    if (this.gameState !== 'PLAYING') {
      this.messageHandler.sendPrivateChat(nick, `错误：当前不是出牌阶段！`);
      return;
    }
    if (this.currentPlayer !== nick) {
      this.messageHandler.sendPrivateChat(nick, `错误：请等待 **${this.currentPlayer}** 操作！`);
      return;
    }

    const playerIdx = this.players.findIndex(p => p.nick === nick);
    const playerCards = [...this.players[playerIdx].cards];
    playCards = playCards.filter(c => playerCards.includes(c));

    if (playCards.length === 0) {
      this.messageHandler.sendPrivateChat(nick, `错误：无效出牌！请检查牌型：
你的手牌：**${this._sortCards(playerCards).join(' ')}**`);
      return;
    }

    const missing = playCards.filter(c => !playerCards.includes(c));
    if (missing.length > 0) {
      this.messageHandler.sendPrivateChat(nick, `错误：你没有这些牌：**${missing.join(' ')}**！`);
      return;
    }

    const cardType = this._analyzeCardType(playCards);
    if (!cardType) {
      this.messageHandler.sendPrivateChat(nick, `错误：牌型不合法！`);
      return;
    }

    if (this.lastPlayed.cards.length > 0 && this.currentPlayer !== this.lastPlayed.player) {
      const canBeat = this._compareCards(cardType, this.lastPlayed);
      if (!canBeat) {
        this.messageHandler.sendPrivateChat(nick, `错误：无法压过上家！`);
        return;
      }
    }

    this.passCount = 0;
    this.lastPlayed = {
      player: nick,
      cards: [...playCards],
      type: cardType.type,
      value: cardType.value
    };

    playCards.forEach(card => {
      const idx = this.players[playerIdx].cards.indexOf(card);
      this.players[playerIdx].cards.splice(idx, 1);
    });

    this.players[playerIdx].lastOp = Date.now();
    this.gameLog.push({ player: nick, cards: playCards, type: cardType.type });

    this.messageHandler.sendChat(`**${nick}** 出了：**${playCards.join(' ')}** (${cardType.type})`);
    this.messageHandler.sendPrivateChat(nick, `成功：出牌成功！
剩余手牌：**${this._sortCards(this.players[playerIdx].cards).join(' ')}** (共**${this.players[playerIdx].cards.length}**张)`);

    if (this.players[playerIdx].cards.length === 0) {
      this._gameOver(nick);
      return;
    }

    this._switchNextPlayer();
  }

  handleShowStatus(nick) {
    let statusText = `### 斗地主游戏状态\n`;
    statusText += `当前阶段：**${this._getGameStateText()}**\n`;
    statusText += `玩家列表：\n`;

    this.players.forEach(p => {
      statusText += `- **${p.nick}** (${p.cards.length}张) ${p.isLandlord ? '地主' : '农民'}\n`;
    });

    this.messageHandler.sendPrivateChat(nick, statusText);
    this.messageHandler.sendChat(`### 游戏状态 | 当前：**${this.currentPlayer}** | 玩家：**${this.players.length}**`);
  }

  handlePlayerList(nick) {
    if (this.players.length === 0) {
      this.messageHandler.sendPrivateChat(nick, '当前没有玩家');
      return;
    }

    const list = this.players.map(p => `${p.nick} (${p.cards.length}张)`).join('、');
    this.messageHandler.sendPrivateChat(nick, `当前玩家(${this.players.length}): ${list}`);
  }

  handleExitGame(nick) {
    const playerIdx = this.players.findIndex(p => p.nick === nick);
    if (playerIdx === -1) {
      this.messageHandler.sendPrivateChat(nick, `错误：你未加入游戏！`);
      return;
    }

    this.players.splice(playerIdx, 1);
    this.messageHandler.sendChat(`**${nick}** 退出了游戏！剩余玩家：**${this.players.length}**`);
    this.messageHandler.sendPrivateChat(nick, `成功：已退出游戏！`);

    if (this.players.length < 2) {
      this._resetGame();
      this.messageHandler.sendChat(`玩家不足，游戏已重置！`);
    } else if (this.currentPlayer === nick) {
      this._switchNextPlayer();
    }
  }

  showGameRules(nick) {
    const ruleText = `### 斗地主游戏规则\n
1. 基础规则：3人游戏，1地主+2农民
2. 叫地主：可叫1/2/3分，最高分者为地主
3. 出牌：支持单张/对子/三张/三带一/顺子/炸弹/王炸
4. 胜负：先出完牌的阵营获胜`;
    this.messageHandler.sendPrivateChat(nick, ruleText);
  }

  showCommandHelp(nick) {
    const helpText = `### 斗地主指令帮助\n
**d j** - 加入游戏
**d s** - 开始游戏
**d c 1/2/3** - 叫地主
**d c pass** - 不叫
**d 牌** - 出牌
**d p** - 不出
**d st** - 查看状态
**d e** - 退出游戏
**d list** - 玩家列表
**d r** - 查看规则`;
    this.messageHandler.sendPrivateChat(nick, helpText);
  }

  // ===== 核心游戏逻辑 =====

  _generateCards() {
    const baseCards = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    const allCards = [];
    baseCards.forEach(card => {
      for (let i = 0; i < 4; i++) allCards.push(card);
    });
    allCards.push('小王', '大王');
    return allCards;
  }

  _shuffleCards(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  }

  _dealCards(allCards) {
    this.bottomCards = allCards.splice(0, 3);
    this.players.forEach((player, idx) => {
      player.cards = allCards.splice(0, 17);
      player.cards = this._sortCards(player.cards);
    });
  }

  _sortCards(cards) {
    return cards.sort((a, b) => {
      const valA = CARD_CONST.cardValues[a];
      const valB = CARD_CONST.cardValues[b];
      return valA - valB;
    });
  }

  _normalizeCards(cardInputs) {
    const standardCards = [];
    const valueMap = new Map();

    Object.entries(CARD_CONST.cardValues).forEach(([name, val]) => {
      if (!valueMap.has(val) || ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王'].includes(name)) {
        valueMap.set(val, name);
      }
    });

    cardInputs.forEach(input => {
      const val = CARD_CONST.cardValues[input];
      if (val !== undefined) {
        standardCards.push(valueMap.get(val));
      }
    });

    return standardCards;
  }

  _analyzeCardType(cards) {
    const len = cards.length;
    const valueMap = new Map();

    cards.forEach(card => {
      const val = CARD_CONST.cardValues[card];
      valueMap.set(val, (valueMap.get(val) || 0) + 1);
    });

    const counts = Array.from(valueMap.values());
    const values = Array.from(valueMap.keys()).sort((a, b) => a - b);

    if (len === 2 && cards.includes('小王') && cards.includes('大王')) {
      return { type: CARD_CONST.cardTypes.KING_BOMB, value: 999 };
    }

    if (len === 4 && counts.every(c => c === 4)) {
      return { type: CARD_CONST.cardTypes.BOMB, value: values[0] };
    }

    if (len === 4 && (counts.includes(3) && counts.includes(1))) {
      const tripleVal = values.find(v => valueMap.get(v) === 3);
      return { type: CARD_CONST.cardTypes.TRIPLE_ONE, value: tripleVal };
    }

    if (len === 3 && counts.every(c => c === 3)) {
      return { type: CARD_CONST.cardTypes.TRIPLE, value: values[0] };
    }

    if (len === 2 && counts.every(c => c === 2)) {
      return { type: CARD_CONST.cardTypes.PAIR, value: values[0] };
    }

    if (len === 1) {
      return { type: CARD_CONST.cardTypes.SINGLE, value: values[0] };
    }

    if (len >= CONFIG.ddzBot.minStraightLen && len <= CONFIG.ddzBot.maxStraightLen && counts.every(c => c === 1)) {
      let isStraight = true;
      for (let i = 1; i < values.length; i++) {
        if (values[i] - values[i - 1] !== 1) {
          isStraight = false;
          break;
        }
      }

      if (isStraight && values[values.length - 1] <= 14) {
        return { type: CARD_CONST.cardTypes.STRAIGHT, value: values[values.length - 1] };
      }
    }

    return null;
  }

  _compareCards(newCard, lastCard) {
    if (newCard.type === CARD_CONST.cardTypes.KING_BOMB) return true;
    if (newCard.type === CARD_CONST.cardTypes.BOMB && lastCard.type !== CARD_CONST.cardTypes.KING_BOMB) return true;
    if (newCard.type === lastCard.type) return newCard.value > lastCard.value;
    return false;
  }

  _determineLandlord() {
    const maxScore = Math.max(...this.players.map(p => p.callScore));
    let landlordIdx = this.players.findIndex(p => p.callScore === maxScore);

    if (maxScore === 0) {
      this.messageHandler.sendChat(`所有玩家都不叫地主，随机选择！`);
      landlordIdx = Math.floor(Math.random() * 3);
      this.landlordScore = 1;
    }

    this.players[landlordIdx].isLandlord = true;
    this.players[landlordIdx].cards = [...this.players[landlordIdx].cards, ...this.bottomCards];
    this.players[landlordIdx].cards = this._sortCards(this.players[landlordIdx].cards);

    this.currentPlayer = this.players[landlordIdx].nick;
    this.gameState = 'PLAYING';

    this.messageHandler.sendChat(`**${this.players[landlordIdx].nick}** 成为地主！`);

    this.players.forEach(player => {
      if (player.isLandlord) {
        this.messageHandler.sendPrivateChat(player.nick, `你成为地主！
底牌：**${this.bottomCards.join(' ')}**
手牌：**${this._sortCards(player.cards).join(' ')}** (共20张)
- 你先出牌！`);
      } else {
        this.messageHandler.sendPrivateChat(player.nick, `地主：**${this.players[landlordIdx].nick}**
你的手牌：**${this._sortCards(player.cards).join(' ')}** (共17张)`);
      }
    });

    this._startOpTimeoutTimer();
  }

  async _gameOver(winnerNick) {
    const isLandlordWin = this.players.some(p => p.nick === winnerNick && p.isLandlord);
    this.gameState = 'FINISHED';

    const score = this.landlordScore * 2;

    const resultText = `### 游戏结束！
${isLandlordWin ?
      `**${winnerNick}**（地主）获胜！` :
      `**${winnerNick}**（农民）获胜！`}

5秒后重置，输入 **d j** 可重新加入`;
    this.messageHandler.sendChat(resultText);

    // 发放奖励
    for (const player of this.players) {
      if (player.nick === winnerNick) {
        const reward = await this.currency.awardDDZWin(player.nick, player.isLandlord);
        this.messageHandler.sendPrivateChat(player.nick, `获胜奖励：+${reward}元！`);
      } else {
        const reward = await this.currency.awardDDZParticipation(player.nick);
        this.messageHandler.sendPrivateChat(player.nick, `参与奖励：+${reward}元！`);
      }
    }

    setTimeout(() => this._resetGame(), 5000);
  }

 _resetGame() {
    this.gameState = 'IDLE';
    this.players = [];
    this.bottomCards = [];
    this.currentPlayer = '';
    this.lastPlayed = { player: '', cards: [], type: '', value: 0 };
    this.landlordScore = 0;
    this.passCount = 0;
    this.gameLog = [];

    clearTimeout(this.opTimer);
    clearTimeout(this.warnTimer);
    this.opTimer = null;
    this.warnTimer = null;

    this.messageHandler.sendChat(`游戏已重置！输入 **d j** 加入新游戏`);
  }

  _switchNextPlayer() {
    const currIdx = this.players.findIndex(p => p.nick === this.currentPlayer);
    const nextIdx = (currIdx + 1) % 3;
    this.currentPlayer = this.players[nextIdx].nick;

    this.messageHandler.sendChat(`请 **${this.currentPlayer}** 出牌！`);
    this.messageHandler.sendPrivateChat(this.currentPlayer, `轮到你出牌！
你的手牌：**${this._sortCards(this.players[nextIdx].cards).join(' ')}**`);

    this._startOpTimeoutTimer();
  }

  _startOpTimeoutTimer() {
    clearTimeout(this.opTimer);
    clearTimeout(this.warnTimer);

    this.warnTimer = setTimeout(() => {
      this.messageHandler.sendPrivateChat(this.currentPlayer, `操作超时提醒！剩余10秒！`);
    }, CONFIG.ddzBot.opWarnTime);

    this.opTimer = setTimeout(() => {
      this.messageHandler.sendChat(`**${this.currentPlayer}** 操作超时，自动不出！`);
      this.handlePass(this.currentPlayer);
    }, CONFIG.ddzBot.opTimeout);
  }

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

  cleanup() {
    clearTimeout(this.opTimer);
    clearTimeout(this.warnTimer);
  }
}

module.exports = DDZGame;
