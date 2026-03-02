/**
 * 股票市场系统
 */

const CONFIG = require('../config');
const { randomInt, formatNumber, formatPercent } = require('../utils/helpers');

class StockMarket {
  constructor(storage) {
    this.storage = storage;
    this.stocks = {}; // {symbol: {price: 0, history: [], volatility: 0}}
    this.portfolios = {}; // {nick: {symbol: count, ...}}
    this.refreshTimer = null;
  }

  /**
   * 初始化股票市场
   */
  async initialize() {
    // 加载或初始化股票
    const savedStocks = await this.storage.read('stocks', null);
    if (savedStocks) {
      this.stocks = savedStocks;
    } else {
      this.initializeStocks();
      await this.storage.write('stocks', this.stocks);
    }

    // 加载投资组合
    this.portfolios = await this.storage.read('portfolios', {});

    // 启动定时刷新
    this.startAutoRefresh();
  }

  /**
   * 初始化股票
   */
  initializeStocks() {
    CONFIG.stock.stockSymbols.forEach(stock => {
      this.stocks[stock.symbol] = {
        name: stock.name,
        basePrice: stock.basePrice,
        price: stock.basePrice,
        history: [stock.basePrice],
        volatility: CONFIG.stock.volatility,
        lastUpdate: Date.now()
      };
    });
  }

  /**
   * 刷新股价
   */
  refreshPrices() {
    Object.values(this.stocks).forEach(stock => {
      // 随机波动 (-15% 到 +15%)
      const changePercent = (Math.random() - 0.5) * 2 * stock.volatility;
      const newPrice = stock.price * (1 + changePercent);
      
      // 价格不能低于基础价格的50%
      stock.price = Math.max(newPrice, stock.basePrice * 0.5);
      stock.history.push(stock.price);

      // 仅保留最近100条记录
      if (stock.history.length > 100) {
        stock.history.shift();
      }

      stock.lastUpdate = Date.now();
    });
  }

  /**
   * 启动自动刷新
   */
  startAutoRefresh() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    
    this.refreshTimer = setInterval(async () => {
      this.refreshPrices();
      await this.storage.write('stocks', this.stocks);
    }, CONFIG.stock.refreshInterval);
  }

  /**
   * 购买股票
   */
  async buyStock(nick, symbol, quantity, balance) {
    if (!this.stocks[symbol]) {
      return { success: false, message: '不存在的股票' };
    }

    const stock = this.stocks[symbol];
    const totalCost = stock.price * quantity;

    if (balance < totalCost) {
      return { success: false, message: `余额不足，需要${formatNumber(totalCost)}元` };
    }

    // 初始化投资组合
    if (!this.portfolios[nick]) {
      this.portfolios[nick] = {};
    }

    // 购买股票
    this.portfolios[nick][symbol] = (this.portfolios[nick][symbol] || 0) + quantity;
    await this.storage.write('portfolios', this.portfolios);

    return {
      success: true,
      cost: totalCost,
      message: `成功购买${quantity}股${stock.name}，花费${formatNumber(totalCost)}元`
    };
  }

  /**
   * 出售股票
   */
  async sellStock(nick, symbol, quantity) {
    if (!this.stocks[symbol]) {
      return { success: false, message: '不存在的股票' };
    }

    if (!this.portfolios[nick] || !this.portfolios[nick][symbol]) {
      return { success: false, message: '你没有这支股票' };
    }

    const owned = this.portfolios[nick][symbol];
    if (owned < quantity) {
      return { success: false, message: `只拥有${owned}股，无法出售${quantity}股` };
    }

    const stock = this.stocks[symbol];
    const revenue = stock.price * quantity;

    this.portfolios[nick][symbol] -= quantity;
    if (this.portfolios[nick][symbol] === 0) {
      delete this.portfolios[nick][symbol];
    }

    await this.storage.write('portfolios', this.portfolios);

    return {
      success: true,
      revenue: revenue,
      message: `成功出售${quantity}股${stock.name}，获得${formatNumber(revenue)}元`
    };
  }

  /**
   * 获取投资组合
   */
  getPortfolio(nick) {
    if (!this.portfolios[nick] || Object.keys(this.portfolios[nick]).length === 0) {
      return null;
    }

    const portfolio = this.portfolios[nick];
    let totalValue = 0;
    const holdings = [];

    Object.entries(portfolio).forEach(([symbol, quantity]) => {
      const stock = this.stocks[symbol];
      if (stock) {
        const value = stock.price * quantity;
        totalValue += value;
        holdings.push({
          symbol,
          name: stock.name,
          quantity,
          price: stock.price,
          value: value
        });
      }
    });

    return {
      holdings,
      totalValue
    };
  }

  /**
   * 获取股票信息
   */
  getStockInfo(symbol) {
    if (!this.stocks[symbol]) return null;

    const stock = this.stocks[symbol];
    const prevPrice = stock.history[stock.history.length - 2] || stock.price;
    const change = stock.price - prevPrice;
    const changePercent = change / prevPrice;

    return {
      symbol,
      name: stock.name,
      price: stock.price,
      change,
      changePercent,
      basePrice: stock.basePrice
    };
  }

  /**
   * 获取所有股票列表
   */
  getMarketList() {
    return Object.entries(this.stocks).map(([symbol, stock]) => {
      const prevPrice = stock.history[stock.history.length - 2] || stock.price;
      const change = stock.price - prevPrice;
      const changePercent = change / prevPrice;
      
      return {
        symbol,
        name: stock.name,
        price: parseFloat(stock.price.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        changePercent: formatPercent(changePercent)
      };
    });
  }
}

module.exports = StockMarket;
