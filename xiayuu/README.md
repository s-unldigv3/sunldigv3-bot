# xiayuu

一个功能完整的HackChat频道机器人，包含斗地主游戏、货币系统和股票市场。

## 📁 项目结构

```
sunldigv3-bot/
├── index.js                          # 主入口文件
├── index.js.bak                      # 原始备份
├── package.json                      # 项目依赖
│
├── src/                              # 源代码目录
│   ├── config.js                     # 全局配置文件
│   ├── storage.js                    # 存储管理模块（JSON文件操作）
│   │
│   ├── utils/                        # 工具模块
│   │   ├── logger.js                 # 日志模块
│   │   ├── messageHandler.js         # 消息处理器
│   │   └── helpers.js                # 通用帮助函数
│   │
│   ├── economy/                      # 经济系统模块
│   │   ├── index.js                  # 经济系统入口
│   │   ├── wallet.js                 # 钱包系统（货币管理）
│   │   └── stock.js                  # 股票市场系统
│   │
│   └── commands/                     # 命令模块
│       ├── basic.js                  # 基础命令（roll、weather等）
│       │
│       └── games/                    # 游戏命令模块
│           ├── index.js              # 游戏命令入口
│           ├── ddz.js                # 斗地主游戏
│           └── currency.js           # 游戏货币奖励系统
│
├── data/                             # 数据存储目录
│   ├── storage.json                  # 用户localStorage数据
│   ├── wallets.json                  # 用户钱包余额
│   ├── stocks.json                   # 股票市场数据
│   └── portfolios.json               # 用户投资组合
│
└── 配置.txt                          # 自动回复规则配置文件
```

## 🎮 功能特性

### 1. **基础命令**
- `!help` - 查看所有可用命令
- `!roll [范围]` - 掷骰子（支持自定义范围）
- `!afk [状态]` - 设置离线状态
- `!online` - 查看在线用户
- `!userinfo [用户]` - 查询用户信息
- `!stats` - 频道活跃度统计
- `!calc <表达式>` - 简易计算器
- `!weather <城市>` - 查看天气
- `!emoji` - 随机表情
- `!yiyan` - 获取一言

### 2. **斗地主游戏** 🎲
使用 `d` 前缀的指令系统：
- `d j / d join` - 加入游戏
- `d s / d start` - 开始游戏
- `d c 1/2/3` - 叫地主
- `d c pass` - 不叫
- `d <牌>` - 出牌（如 `d 3 4 5`）
- `d p / d pass` - 不出
- `d st / d status` - 查看游戏状态
- `d r / d rule` - 查看规则
- `d h / d help` - 查看帮助
- `d list` - 查看玩家列表
- `d e / d exit` - 退出游戏

**游戏特点：**
- 3人游戏模式（1地主+2农民）
- 支持各种牌型：单张、对子、三张、三带一、顺子、炸弹、王炸
- 自动超时处理（60秒无操作自动不出）
- 完整的游戏日志记录

### 3. **货币系统** 💰
- `!money` - 查看你的余额
- `!money top` - 查看排行榜
- `!wallet transfer <用户> <金额>` - 转账给其他玩家

**特点：**
- 新玩家初始 1000 金币
- 斗地主赢得 100 金币奖励（地主翻倍）
- 参与奖励 50 金币
- 所有数据自动保存到 `data/wallets.json`

### 4. **股票市场** 📈
一个充满创意的股票系统，包含奇怪的虚拟股票：
- 🍕 披萨币 (基础价格100)
- 🚀 火箭币 (基础价格50)
- 🎮 游戏币 (基础价格75)
- 📚 知识币 (基础价格120)
- 🌙 月球币 (基础价格30)
- ⚡ 闪电币 (基础价格180)
- 🎨 艺术币 (基础价格200)
- 🌊 海洋币 (基础价格45)
- 🔥 火焰币 (基础价格95)
- ❄️ 冰雪币 (基础价格85)

**命令：**
- `!stock list` - 查看所有股票及行情
- `!stock buy <股票> <数量>` - 购买股票
- `!stock sell <股票> <数量>` - 出售股票
- `!stock portfolio` - 查看你的投资组合

**特点：**
- 股价每10分钟自动刷新（波动±15%）
- 支持做多或做空（波动后可能亏损）
- 详细的投资组合统计
- 所有数据自动保存

### 5. **管理员命令** 🔐
仅限tripcode为`2UE++I`的管理员使用：
- `!talk on/off` - 控制机器人发言
- `!stop` - 停止机器人

## 🚀 快速开始

### 安装依赖
```bash
npm install ws fs-extra async-mutex node-fetch
```

### 修改配置
编辑 `src/config.js`：
- `core.channel` - 要加入的频道名
- `core.botName` - 机器人昵称
- `mainBot.ADMIN_TRIPCODE` - 管理员tripcode
- `currency.startAmount` - 新玩家初始货币
- `stock.volatility` - 股票波动率

### 启动机器人
```bash
node index.js
```

## 📊 数据存储

所有数据都以JSON格式保存在 `data/` 目录：

- **storage.json** - 主要存储（留言、自动回复等）
- **wallets.json** - 用户钱包数据
  ```json
  {
    "用户名": {
      "balance": 1250,
      "totalEarned": 1500,
      "totalSpent": 250,
      "lastUpdated": 1640000000000
    }
  }
  ```
- **stocks.json** - 股票定价和历史
- **portfolios.json** - 用户的股票持仓

## 🎯 模块化架构

### 核心类
- **SundigBot** - 主Bot类，管理所有系统
- **Economy** - 经济系统总入口
- **Wallet** - 用户钱包管理
- **StockMarket** - 股票市场
- **DDZGame** - 斗地主游戏引擎
- **GameCommands** - 游戏命令路由
- **BasicCommands** - 基础命令
- **Storage** - 文件统一存储管理
- **MessageHandler** - WebSocket消息处理
- **Logger** - 日志输出

### 通信流程
```
WebSocket消息
    ↓
handleOfficialCommands()
    ↓
handleChatMessage/handleCommands()
    ↓
GameCommands / BasicCommands / Economy
    ↓
MessageHandler发送回复
```

## 🔧 配置选项

### 货币配置 (`src/config.js`)
```javascript
currency: {
  startAmount: 1000,        // 新玩家初始金额
  ddzWinReward: 100,       // 斗地主赢得奖励
  ddzLossReward: 50,       // 参与奖励
  stockInitialFund: 5000   // 股票初始资金（保留）
}
```

### 股票配置
```javascript
stock: {
  refreshInterval: 600000,  // 10分钟刷新一次
  volatility: 0.15,        // 波动率 ±15%
  stockSymbols: [...]      // 股票列表
}
```

### DDZ游戏配置
```javascript
ddzBot: {
  opTimeout: 60000,        // 操作超时时间
  opWarnTime: 50000,       // 超时前警告时间
  maxStraightLen: 12,      // 顺子最大长度
  minStraightLen: 5        // 顺子最小长度
}
```

## 💡 原理说明

### 货币系统
- 每位玩家有独立钱包，初始1000元
- 所有交易记录在案（收入/支出）
- 支持玩家间转账
- 进度自动保存

### 股票市场
- 使用高斯随机波动模型
- 每个股票有历史价格记录（最近100条）
- 支持做多和做空
- 无涨跌停限制，真实模拟市场波动

### 斗地主游戏
- 完整的牌型识别系统（7种牌型）
- 玩家操作超时自动处理
- 游戏结束自动发放奖励
- 支持多局连续游戏

## 🐛 调试

启用调试模式，编辑 `src/config.js`：
```javascript
core: {
  debug: true  // 启用详细日志
}
```

## 📝 自动回复规则

```
!if add 触发词 回复内容 概率(0-100)
!if add awa 阿瓦 25
!if add @bot_name 自动回复 100
```

## 🔌 扩展开发

### 添加新命令

1. 在 `src/commands/` 下创建新模块
2. 在 `handleCommands()` 中添加路由
3. 继承现有的 `MessageHandler` 和 `logger`

### 添加新的经济系统

1. 在 `src/economy/` 创建新模块
2. 在 `Economy` 类中引入并初始化
3. 通过 `this.economy` 访问

## 📦 依赖列表

- **ws** - WebSocket客户端
- **fs-extra** - 文件系统增强
- **async-mutex** - 异步互斥锁（并发控制）
- **node-fetch** - HTTP请求（可选，用于天气查询）

## ⚖️ 许可证

MIT License - 可自由修改和使用

## 🙏 致谢

基于sunldigv3-bot
---

**最后更新**：2026年03月02日

**版本**：2.0.0