/**
 * 钱包系统 - 玩家货币管理
 */

const CONFIG = require('../config');
const { formatNumber } = require('../utils/helpers');

class Wallet {
  constructor(storage) {
    this.storage = storage;
    this.wallets = {}; // {nick: {balance: 0, totalEarned: 0, totalSpent: 0, lastUpdated: 0}}
  }

  /**
   * 加载钱包数据
   */
  async loadWallets() {
    this.wallets = await this.storage.read('wallets', {});
  }

  /**
   * 保存钱包数据
   */
  async saveWallets() {
    await this.storage.write('wallets', this.wallets);
  }

  /**
   * 获取或创建钱包
   */
  getWallet(nick) {
    if (!this.wallets[nick]) {
      this.wallets[nick] = {
        balance: CONFIG.currency.startAmount,
        totalEarned: CONFIG.currency.startAmount,
        totalSpent: 0,
        lastUpdated: Date.now()
      };
    }
    return this.wallets[nick];
  }

  /**
   * 获取余额
   */
  getBalance(nick) {
    return this.getWallet(nick).balance;
  }

  /**
   * 增加余额
   */
  async addBalance(nick, amount, reason = '') {
    const wallet = this.getWallet(nick);
    wallet.balance += amount;
    wallet.totalEarned += amount;
    wallet.lastUpdated = Date.now();
    await this.saveWallets();
    return wallet.balance;
  }

  /**
   * 减少余额
   */
  async deductBalance(nick, amount, reason = '') {
    const wallet = this.getWallet(nick);
    if (wallet.balance < amount) {
      return false; // 余额不足
    }
    wallet.balance -= amount;
    wallet.totalSpent += amount;
    wallet.lastUpdated = Date.now();
    await this.saveWallets();
    return true;
  }

  /**
   * 转账
   */
  async transfer(fromNick, toNick, amount) {
    if (!await this.deductBalance(fromNick, amount)) {
      return false;
    }
    await this.addBalance(toNick, amount);
    return true;
  }

  /**
   * 获取钱包信息
   */
  getWalletInfo(nick) {
    const wallet = this.getWallet(nick);
    return {
      nick,
      balance: formatNumber(wallet.balance),
      totalEarned: formatNumber(wallet.totalEarned),
      totalSpent: formatNumber(wallet.totalSpent),
      netProfit: formatNumber(wallet.totalEarned - wallet.totalSpent)
    };
  }

  /**
   * 获取排行榜
   */
  getLeaderboard(limit = 10) {
    return Object.entries(this.wallets)
      .map(([nick, wallet]) => ({ nick, balance: wallet.balance }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);
  }
}

module.exports = Wallet;
