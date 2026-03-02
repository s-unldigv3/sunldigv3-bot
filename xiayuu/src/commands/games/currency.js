/**
 * 货币系统 - 游戏中的奖励管理
 */

const CONFIG = require('../../config');

class CurrencySystem {
  constructor(wallet) {
    this.wallet = wallet;
  }

  /**
   * 斗地主胜利奖励
   */
  async awardDDZWin(nick, isLandlord = false) {
    const reward = isLandlord ? 
      CONFIG.currency.ddzWinReward * 2 : 
      CONFIG.currency.ddzWinReward;
    
    await this.wallet.addBalance(nick, reward, 'DDZ_WIN');
    return reward;
  }

  /**
   * 斗地主参与奖励
   */
  async awardDDZParticipation(nick) {
    const reward = CONFIG.currency.ddzLossReward;
    await this.wallet.addBalance(nick, reward, 'DDZ_PARTICIPATION');
    return reward;
  }

  /**
   * 获取游戏统计
   */
  getGameStats(nick) {
    const wallet = this.wallet.getWallet(nick);
    return {
      balance: wallet.balance,
      totalEarned: wallet.totalEarned,
      totalSpent: wallet.totalSpent
    };
  }
}

module.exports = CurrencySystem;
