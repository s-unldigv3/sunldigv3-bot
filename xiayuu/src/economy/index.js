/**
 * 经济系统模块入口
 */

const Wallet = require('./wallet');
const StockMarket = require('./stock');

class Economy {
  constructor(storage) {
    this.storage = storage;
    this.wallet = new Wallet(storage);
    this.stock = new StockMarket(storage);
  }

  /**
   * 初始化经济系统
   */
  async initialize() {
    await this.wallet.loadWallets();
    await this.stock.initialize();
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.stock.refreshTimer) {
      clearInterval(this.stock.refreshTimer);
    }
  }
}

module.exports = Economy;
