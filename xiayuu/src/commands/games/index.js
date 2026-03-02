/**
 * 游戏命令模块入口
 */

const DDZGame = require('./ddz');
const CurrencySystem = require('./currency');

class GameCommands {
  constructor(messageHandler, wallet) {
    this.ddz = new DDZGame(messageHandler, wallet);
    this.currency = new CurrencySystem(wallet);
    this.messageHandler = messageHandler;
    this.wallet = wallet;
  }

  /**
   * 处理游戏命令
   */
  handleGameCommand(nick, text) {
    // 斗地主命令
    if (text.startsWith('d ') || text === 'd') {
      return this.ddz.handleCommand(nick, text);
    }

    // 钱包命令
    if (text.startsWith('!money') || text.startsWith('!wallet')) {
      this.handleWallet(nick, text);
      return true;
    }

    return false;
  }

  /**
   * 处理钱包命令
   */
  handleWallet(nick, text) {
    const params = text.split(/\s+/).slice(1);
    const balance = this.wallet.getBalance(nick);

    if (params.length === 0) {
      const info = this.wallet.getWalletInfo(nick);
      this.messageHandler.sendPrivateChat(nick, `### 你的钱包
余额：**${info.balance}**元
总收入：**${info.totalEarned}**元
总支出：**${info.totalSpent}**元
净收益：**${info.netProfit}**元`);
      return;
    }

    const subCmd = params[0].toLowerCase();
    switch (subCmd) {
      case 'top':
      case 'rank':
        this.showLeaderboard();
        break;
      case 'transfer':
        this.handleTransfer(nick, params);
        break;
      default:
        this.messageHandler.sendChat(`!wallet [top|transfer]`);
    }
  }

  /**
   * 显示排行榜
   */
  showLeaderboard() {
    const board = this.wallet.getLeaderboard(10);
    if (board.length === 0) {
      this.messageHandler.sendChat(`暂无数据`);
      return;
    }

    let text = `### 货币排行榜 TOP 10\n`;
    board.forEach((entry, idx) => {
      text += `${idx + 1}. **${entry.nick}** - ${entry.balance}元\n`;
    });
    this.messageHandler.sendChat(text);
  }

  /**
   * 处理转账
   */
  async handleTransfer(nick, params) {
    if (params.length < 3) {
      this.messageHandler.sendPrivateChat(nick, `格式：!wallet transfer <用户> <金额>`);
      return;
    }

    const toNick = params[1];
    const amount = parseInt(params[2]);

    if (isNaN(amount) || amount <= 0) {
      this.messageHandler.sendPrivateChat(nick, `金额必须是正整数`);
      return;
    }

    const result = await this.wallet.transfer(nick, toNick, amount);
    if (result) {
      this.messageHandler.sendPrivateChat(nick, `成功向 @${toNick} 转账 ${amount}元`);
      this.messageHandler.sendPrivateChat(toNick, `@${nick} 向你转账 ${amount}元`);
    } else {
      this.messageHandler.sendPrivateChat(nick, `转账失败：余额不足`);
    }
  }

  cleanup() {
    this.ddz.cleanup();
  }
}

module.exports = GameCommands;
