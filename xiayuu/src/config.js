/**
 * 全局配置文件
 */

module.exports = {
  // 核心配置
  core: {
    server: "wss://hack.chat/chat-ws",
    channel: "lounge",
    botName: "xiayuu",
    debug: false
  },

  // 主机器人配置
  mainBot: {
    color: {
      enable: true,
      hex: "#FFE4E1"
    },
    sendRateLimit: 1000,
    muteCheckInterval: 10000,
    maxMsgHistory: 5000,
    latestMsgCount: 5,
    cmdPrefix: '!',
    ADMIN_TRIPCODE: '2UE++I'
  },

  // 斗地主机器人配置
  ddzBot: {
    msgMergeDelay: 400,
    opTimeout: 60000,
    opWarnTime: 50000,
    maxRetry: 2,
    maxStraightLen: 12,
    minStraightLen: 5
  },

  // 货币系统配置
  currency: {
    startAmount: 1000, // 新玩家初始货币
    ddzWinReward: 100, // 斗地主赢得的奖励
    ddzLossReward: 50, // 斗地主参与奖励
    stockInitialFund: 5000 // 股票初始资金
  },

  // 股票市场配置
  stock: {
    refreshInterval: 600000, // 股票刷新间隔（10分钟）
    volatility: 0.15, // 波动率
    stockSymbols: [
      { symbol: '🍕', name: '披萨币', basePrice: 100 },
      { symbol: '🚀', name: '火箭币', basePrice: 50 },
      { symbol: '🎮', name: '游戏币', basePrice: 75 },
      { symbol: '📚', name: '知识币', basePrice: 120 },
      { symbol: '🌙', name: '月球币', basePrice: 30 },
      { symbol: '⚡', name: '闪电币', basePrice: 180 },
      { symbol: '🎨', name: '艺术币', basePrice: 200 },
      { symbol: '🌊', name: '海洋币', basePrice: 45 },
      { symbol: '🔥', name: '火焰币', basePrice: 95 },
      { symbol: '❄️', name: '冰雪币', basePrice: 85 }
    ]
  },

  // 留言配置
  ly: {
    expireDays: 7,
    storageKey: 'bot_sunldigv3_bot_lyMessages'
  },

  // 内存清理配置
  memory: {
    timestampExpireHours: 1,
    userActivityExpireHours: 24
  },

  // 常量
  EMOJI_LIST: ['😀', '😂', '🤣', '😊', '👍', '🎉', '🎁', '🌟', '🚀', '💡', '📚', '🎲', '☁️', '⚡', '❤️'],

  // 样式模板
  styleTemplates: {
    questionReplies: [
      '我也很不解', '这问题把我问懵了', '同感，谁能解释一下', '?',
      '我就是一个小机器人，也很困惑', '？', '这……我需要查阅我的小百科'
    ],
    exclaimReplies: [
      '嘿嘿，这也太精彩了吧', '哎呦，不错哦', '哈哈，这波我给满分'
    ],
    greetingReplies: [
      '嗨，大家好呀～', '在的，有事喊我', '你好呀，今天也要加油哦'
    ],
    smallTalkReplies: [
      '嗯哼~', '哦哦', '了解啦'
    ]
  }
};
