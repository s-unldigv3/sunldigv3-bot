// 引入 Node.js 核心模块和第三方依赖
const WebSocket = require('ws');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');

// 模拟浏览器的 localStorage（使用文件存储）
class LocalStorageMock {
    constructor(storagePath = './storage.json') {
        this.storagePath = storagePath;
        this.data = {};
        // 加载已有数据
        try {
            if (fs.existsSync(this.storagePath)) {
                this.data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
            }
        } catch (err) {
            this.data = {};
        }
    }

    getItem(key) {
        return this.data[key] || null;
    }

    setItem(key, value) {
        this.data[key] = value;
        // 持久化到文件
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (err) {
            console.error('[LocalStorage 保存失败]', err);
        }
    }

    removeItem(key) {
        delete this.data[key];
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (err) {
            console.error('[LocalStorage 删除失败]', err);
        }
    }

    clear() {
        this.data = {};
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (err) {
            console.error('[LocalStorage 清空失败]', err);
        }
    }
}

// 全局挂载模拟的 localStorage
const localStorage = new LocalStorageMock();

// 配置项（删除原adminPrefix，仅保留必要配置）
const CONFIG = {
    server: "wss://hack.chat/chat-ws", // 官方WS地址，禁止修改
    channel: "lounge", // 机器人频道
    botName: "sunldigv3_bot",
    debug: false, // 调试模式
    // 颜色配置
    color: {
        enable: true, // 是否启用颜色设置
        hex: "#5ee6ed" // 16进制颜色值（必须以#开头）
    },
    // 通用常量
    CONST: {
        ADMIN_TRIPCODE: '2UE++I', // 管理员专属tripcode
        cmdPrefix: '!', // 命令前缀
        sendRateLimit: 200, // 防限流发送间隔（ms）
        muteCheckInterval: 10000, // 禁言检查间隔10秒
        maxMsgHistory: 5000, // 本地消息最大存储量
        latestMsgCount: 5, // 最新消息展示数
        welcomeMsg: "欢迎 %s 加入！发送`!help`查看命令",
        emojiList: ['😀', '😂', '🤣', '😊', '👍', '🎉', '🎁', '🌟', '🚀', '💡', '📚', '🎲', '☁️', '⚡', '❤️'],
        // 模仿风格模板
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
        },
        // 周期发布池设置
        periodic: {
            includeYiyan: true,
            includeStyle: true,
            includeTriviaAuto: false
        }
    }
};

// 命令配置
const CMD_CONFIG = {
    // 公共命令
    help: { trigger: ['help', 'h'], desc: '查看所有可用命令', auth: false, public: true, params: '' },
    roll: { trigger: ['roll'], desc: '掷骰子，支持!roll 1-100自定义范围', auth: false, public: true, params: '[范围(可选)]' },
    afk: { trigger: ['afk'], desc: '设置/取消离开状态(AFK)', auth: false, public: true, params: '' },
    online: { trigger: ['online'], desc: '查看当前频道所有在线用户', auth: false, public: true, params: '' },
    msglist: { trigger: ['msglist'], desc: '查看最新5条消息ID（用于!reply）', auth: false, public: true, params: '' },
    reply: { trigger: ['reply'], desc: '引用历史消息回复', auth: false, public: true, params: '[消息ID] [回复内容]' },
    userinfo: { trigger: ['userinfo'], desc: '查询用户信息', auth: false, public: true, params: '[用户名(可选)]' },
    stats: { trigger: ['stats'], desc: '查看频道活跃度TOP3+在线人数', auth: false, public: true, params: '' },
    save: { trigger: ['save'], desc: '导出本地聊天记录为JSON文件', auth: false, public: true, params: '' },
    clear: { trigger: ['clear'], desc: '清空机器人本地消息历史', auth: false, public: true, params: '' },
    calc: { trigger: ['calc', '计算'], desc: '简易计算器，支持+/*/-/()', auth: false, public: true, params: '[计算式]' },
    weather: { trigger: ['weather', '天气'], desc: '查询城市简易天气', auth: false, public: true, params: '[城市名]' },
    emoji: { trigger: ['emoji', '表情'], desc: '发送随机表情包', auth: false, public: true, params: '' },
    yiyan: { trigger: ['yiyan', '一言'], desc: '随机获取一言（来自 hitokoto）', auth: false, public: true, params: '' },
    // 管理员命令
    specialHelp: { trigger: ['helpadmin'], desc: '查看管理员专属命令', auth: false, public: false, params: '' },
    mute: { trigger: ['mute'], desc: '临时禁言用户', auth: true, public: false, params: '[用户名] [分钟数]' },
    silence: { trigger: ['silence'], desc: '永久禁言用户', auth: true, public: false, params: '[用户名]' },
    unsilence: { trigger: ['unsilence'], desc: '解除用户禁言', auth: true, public: false, params: '[用户名]' },
    con: { trigger: ['con'], desc: '机器人直接输出纯文本内容', auth: true, public: false, params: '[任意文本]' },
    announce: { trigger: ['announce'], desc: '发送频道醒目公告', auth: true, public: false, params: '[公告内容]' },
    pann: { trigger: ['pann'], desc: '管理定时公告：pann add|remove|list|clear', auth: true, public: false, params: '[子命令]' },
    if: { trigger: ['if'], desc: '管理自动回复规则：if add A B N|list|remove|clear', auth: true, public: false, params: '[子命令]' },
    talk: { trigger: ['talk'], desc: '控制机器人发言状态：!talk on|off', auth: true, public: false, params: '[on/off]' },
    stop: { trigger: ['stop'], desc: '停止机器人并退出', auth: true, public: false, params: '' }
};

const bot = {
    // 运行时数据
    ws: null,
    clientId: Math.random().toString(36).slice(2, 10),
    lastSendTime: 0,
    afkUsers: new Map(),
    silencedUsers: new Map(),
    messageHistory: [],
    userActivity: new Map(),
    messageIdMap: new Map(),
    nextMessageId: 1,
    scheduledIntervals: [],
    cmdMap: new Map(),
    onlineUsers: new Set(),
    lastQuestionReplyTime: 0,
    lastHourlyAnnouncement: null,
    recentMsgTimestamps: [],
    periodicTimeoutId: null,
    scheduledAnnouncements: [], // 结构：[{content: '', interval: number, lastSendTime: 0}]
    lastPeriodicSentId: null,
    stopped: false,
    ifRules: [], // 自动回复规则：[{trigger: '', reply: '', probability: number, id: number, isRegex?: boolean}]
    ifTimer: null, // A为空的规则定时器
    isMuted: false, // 是否闭嘴（核心状态：true=仅响应!talk on，false=正常）

    // 初始化入口
    init() {
        this.initCmdMap();
        this.loadIfRules(); // 加载if规则
        this.connectWS();
        this.startTimers();
        console.log(`[✅ ${CONFIG.botName}] 机器人启动 | 初始发言状态：正常`);
    },

    // 初始化命令映射
    initCmdMap() {
        const { cmdPrefix } = CONFIG.CONST;
        Object.entries(CMD_CONFIG).forEach(([cmdKey, config]) => {
            config.trigger.forEach(trigger => {
                const fullTrigger = `${cmdPrefix}${trigger}`;
                this.cmdMap.set(fullTrigger, {
                    key: cmdKey,
                    ...config,
                    handler: this[`handle${cmdKey.charAt(0).toUpperCase() + cmdKey.slice(1)}`]
                });
            });
        });
    },

    // 连接WS服务器（Node.js版本）
    connectWS() {
        if (this.ws) this.ws.close(1000, 'reconnect');
        
        // 创建Node.js的WebSocket客户端
        this.ws = new WebSocket(CONFIG.server);

        this.ws.on('open', () => {
            console.log(`[连接成功] 频道：${CONFIG.channel}`);
            this.joinChannel();
        });

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                CONFIG.debug && console.log(`[接收]`, msg);
                this.handleOfficialCommands(msg);
            } catch (err) {
                console.error(`[解析失败]`, err);
            }
        });

        this.ws.on('close', () => {
            console.log(`[连接关闭]`);
            this.onlineUsers.clear();
            if (!this.stopped) {
                console.log(`5秒后重连`);
                setTimeout(() => this.connectWS(), 5000);
            } else {
                console.log(`[${CONFIG.botName}] 停止状态，不再重连`);
            }
        });

        this.ws.on('error', (err) => {
            console.error(`[WS错误]`, err);
        });
    },

    // 加入频道（仅初始化时发送，不受闭嘴状态影响）
    joinChannel() {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        this.sendWSMessage({
            cmd: 'join',
            channel: CONFIG.channel,
            nick: CONFIG.botName,
            clientId: this.clientId
        }, true, true); // 忽略限流+强制发送（仅加入频道）
        // 发送颜色设置指令
        this.sendColorCommand();
    },

    // 发送颜色设置指令（仅初始化时强制发送）
    sendColorCommand() {
        // 校验配置是否启用且颜色格式合法
        if (!CONFIG.color?.enable) return;
        const colorHex = CONFIG.color.hex?.trim() || '';
        // 验证16进制颜色格式（#开头 + 6位/3位16进制字符）
        const colorReg = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
        if (!colorReg.test(colorHex)) {
            console.error(`[颜色配置错误] 无效的16进制颜色值：${colorHex}`);
            return;
        }
        
        // 发送/color指令（仅初始化时强制发送）
        this.sendWSMessage({
            cmd: 'chat',
            text: `/color ${colorHex}`,
            clientId: this.clientId
        }, true, true); // 忽略限流+强制发送
        CONFIG.debug && console.log(`[颜色设置] 已发送：/color ${colorHex}`);
    },

    // 处理所有官方指令
    handleOfficialCommands(msg) {
        switch (msg.cmd) {
            case 'chat':
                this.recordMessage(msg);
                // 闭嘴状态下，仅处理!talk on命令，其他都跳过
                if (this.isMuted) {
                    const text = msg.text.trim();
                    if (text === '!talk on') {
                        this.handleCommands(msg, text);
                    }
                    return; // 直接返回，不处理其他逻辑
                }
                // 非闭嘴状态，正常处理
                if (!this.isSilenced(msg.nick)) {
                    this.handleChatMessage(msg);
                    this.checkIfRules(msg.text); // 检查if规则匹配
                } else {
                    const remain = Math.ceil((this.silencedUsers.get(msg.nick) - Date.now()) / 60000);
                    this.sendChat(`${msg.nick} 禁言中，剩余${Math.max(remain, 0)}分钟`);
                }
                break;
            case 'error':
                // 闭嘴状态下，不处理错误提示
                if (!this.isMuted) {
                    this.handleServerError(msg);
                }
                break;
            case 'onlineSet':
                this.updateOnlineUsers(msg.nicks);
                break;
            case 'onlineAdd':
                this.onlineUsers.add(msg.nick);
                // 闭嘴状态下，不发送欢迎消息
                if (!this.isMuted) {
                    this.sendWelcomeMessage(msg.nick);
                }
                CONFIG.debug && console.log(`[新用户] ${msg.nick} 加入`);
                break;
            case 'onlineRemove':
                this.onlineUsers.delete(msg.nick);
                this.afkUsers.delete(msg.nick);
                break;
            default:
                CONFIG.debug && console.log(`[未处理指令]`, msg.cmd);
        }
    },

    // 新用户欢迎（受闭嘴状态控制）
    sendWelcomeMessage(nick) {
        if (nick === CONFIG.botName || this.isMuted) return;
        const welcomeText = CONFIG.CONST.welcomeMsg.replace('%s', nick);
        this.sendChat(welcomeText);
    },

    // 处理群聊消息
    handleChatMessage(msg) {
        if (msg.nick === CONFIG.botName) return;
        const text = msg.text.trim();
        if (!text) return;
        this.handleCommands(msg, text);
        this.handleAFKMention(msg);
        this.updateUserActivity(msg.nick);

        // 问号回复逻辑（概率15%，受闭嘴状态控制）
        try {
            if (this.isMuted) return; // 闭嘴状态不回复
            if (!text.startsWith(CONFIG.CONST.cmdPrefix) && /[？?]/.test(text)) {
                const now = Date.now();
                const isJustQuestion = /^[？?]+$/.test(text);
                if (isJustQuestion || !this.lastQuestionReplyTime || now - this.lastQuestionReplyTime > 5000) {
                    // 15%概率回复
                    const randomNum = Math.random();
                    if (randomNum <= 0.15) {
                        const reply = this.pickStyleReply('questionReplies');
                        this.sendChat(reply);
                        this.lastQuestionReplyTime = now;
                    }
                }
            }
        } catch (e) { console.error('[问号处理错误]', e); }
    },

    // 检查if规则匹配（新增正则模式支持）
    checkIfRules(text) {
        if (this.isMuted || !this.ifRules.length) return;
        const trimText = text.trim();
        this.ifRules.forEach(rule => {
            let isMatch = false;
            // 判断是否为正则模式
            if (rule.isRegex) {
                try {
                    // 构建正则表达式，忽略大小写
                    const regex = new RegExp(rule.trigger, 'i');
                    isMatch = regex.test(trimText);
                } catch (e) {
                    console.error('[正则匹配失败]', e);
                    isMatch = false;
                }
            } else {
                // 原有完全匹配逻辑
                isMatch = trimText === rule.trigger;
            }

            if (isMatch) {
                // 按概率发送回复
                const randomNum = Math.random();
                if (randomNum <= rule.probability / 100) {
                    this.sendChat(rule.reply);
                }
            }
        });
    },

    // 加载if规则
    loadIfRules() {
        try {
            const key = `bot_${CONFIG.botName}_ifRules`;
            const raw = localStorage.getItem(key);
            this.ifRules = raw ? JSON.parse(raw) : [];
        } catch (e) {
            this.ifRules = [];
        }
    },

    // 保存if规则
    saveIfRules() {
        try {
            const key = `bot_${CONFIG.botName}_ifRules`;
            localStorage.setItem(key, JSON.stringify(this.ifRules || []));
        } catch (e) {}
    },

    // 运行A为空的if规则定时器（受闭嘴状态控制）
    runEmptyIfTimer() {
        if (this.ifTimer) clearInterval(this.ifTimer);
        this.ifTimer = setInterval(() => {
            if (this.isMuted) return; // 闭嘴状态不执行
            this.ifRules.forEach(rule => {
                if (!rule.trigger || rule.trigger.trim() === '') {
                    const randomNum = Math.random();
                    if (randomNum <= rule.probability / 100) {
                        this.sendChat(rule.reply);
                    }
                }
            });
        }, 10000); // 每10秒检查一次
    },

    // 记录消息
    recordMessage(msg) {
        if (msg.cmd !== 'chat' || msg.nick === CONFIG.botName) return;
        const msgObj = {
            id: this.nextMessageId++,
            nick: msg.nick,
            trip: msg.trip || '', // 记录用户的tripcode
            text: msg.text,
            time: new Date().toISOString()
        };
        this.messageHistory.push(msgObj);
        this.messageIdMap.set(msgObj.id, msgObj);

        // 记录最近消息时间戳
        this.recentMsgTimestamps = this.recentMsgTimestamps || [];
        this.recentMsgTimestamps.push(Date.now());
        const MAX_TS = 500;
        if (this.recentMsgTimestamps.length > MAX_TS) {
            this.recentMsgTimestamps.splice(0, this.recentMsgTimestamps.length - MAX_TS);
        }

        if (this.messageHistory.length > CONFIG.CONST.maxMsgHistory) {
            const delMsg = this.messageHistory.shift();
            this.messageIdMap.delete(delMsg.id);
        }
    },

    // 命令处理（核心修改：闭嘴状态下仅响应!talk on）
    handleCommands(msg, text) {
        const [cmdTrigger, ...params] = text.split(/\s+/);
        const cmdItem = this.cmdMap.get(cmdTrigger);
        
        // 闭嘴状态下，仅处理!talk on命令
        if (this.isMuted) {
            if (cmdTrigger === '!talk' && params[0]?.toLowerCase() === 'on') {
                // 仅允许!talk on突破闭嘴状态
                this.handleTalk(msg, params);
            }
            return; // 其他命令全部跳过
        }

        if (!cmdItem) return;

        try {
            // 核心修改：管理员权限判断改为校验tripcode
            if (cmdItem.auth && !this.hasAdminAuth(msg)) {
                this.sendChat(`无权限，仅tripcode为2UE++I的管理员可执行`);
                return;
            }
            if (cmdItem.params && params.length === 0 && cmdTrigger !== '!help s') {
                this.sendChat(`格式错误，正确：${cmdTrigger} ${cmdItem.params}`);
                return;
            }
            cmdItem.handler.call(this, msg, params);
        } catch (err) {
            console.error(`[命令失败] ${cmdTrigger}`, err);
            this.sendChat(`执行出错：${err.message.slice(0, 20)}`);
        }
    },

    // 发送WS消息（防限流，闭嘴状态下仅!talk on可发送）
    sendWSMessage(data, ignoreLimit = false, ignoreMute = false) {
        if (this.ws.readyState !== WebSocket.OPEN) {
            console.error(`[发送失败] 连接未建立`);
            return;
        }
        // 闭嘴状态下，仅!talk on的回复可发送
        if (this.isMuted && !ignoreMute) {
            CONFIG.debug && console.log(`[发送跳过] 机器人处于闭嘴状态`);
            return;
        }
        const now = Date.now();
        if (!ignoreLimit && now - this.lastSendTime < CONFIG.CONST.sendRateLimit) {
            console.warn(`[限流] 频率过高`);
            return;
        }
        this.ws.send(JSON.stringify(data));
        this.lastSendTime = now;
    },

    // 发送聊天消息（封装）
    sendChat(text, ignoreMute = false) {
        this.sendWSMessage({
            cmd: 'chat',
            text: text,
            clientId: this.clientId
        }, false, ignoreMute);
        CONFIG.debug && console.log(`[发送] ${text} ${ignoreMute ? '(强制发送)' : ''}`);
    },

    // 调试日志
    debugLog(...args) {
        if (CONFIG.debug) console.log(...args);
    },

    // 核心修改：管理员权限判断（仅tripcode为2UE++I的用户）
    hasAdminAuth(msg) {
        // 校验消息中的tripcode是否等于管理员专属tripcode
        return msg.trip === CONFIG.CONST.ADMIN_TRIPCODE;
    },

    // 禁言判断
    isSilenced(nick) {
        if (!this.silencedUsers.has(nick)) return false;
        const expire = this.silencedUsers.get(nick);
        if (expire === Infinity) return true;
        if (expire > Date.now()) return true;
        this.silencedUsers.delete(nick);
        return false;
    },

    // 更新活跃度
    updateUserActivity(nick) {
        this.userActivity.set(nick, (this.userActivity.get(nick) || 0) + 1);
    },

    // AFK@提醒（受闭嘴状态控制）
    handleAFKMention(msg) {
        if (this.isMuted) return;
        const mentionReg = /@(\w+)/g;
        let match;
        while ((match = mentionReg.exec(msg.text)) !== null) {
            const user = match[1];
            if (this.afkUsers.has(user)) {
                const afkMs = Date.now() - this.afkUsers.get(user);
                const afkStr = afkMs > 3600000 ? `${(afkMs / 3600000).toFixed(1)}h` : `${Math.floor(afkMs / 60000)}m`;
                this.sendChat(`@${msg.nick}：${user} AFK(${afkStr})`);
            }
        }
    },

    // 服务端错误处理（受闭嘴状态控制）
    handleServerError(msg) {
        const errorMap = {
            'nicknameTaken': '昵称被占，修改botName',
            'channelInvalid': '频道无效',
            'banned': '被官方封禁',
            'rateLimited': '发送频率过高'
        };
        const text = errorMap[msg.error] || `服务端错误：${msg.error}`;
        console.error(`[服务端错误]`, text);
        this.sendChat(text);
    },

    // 更新在线用户
    updateOnlineUsers(nicks) {
        this.onlineUsers = new Set(nicks);
        CONFIG.debug && console.log(`[在线用户] 共${this.onlineUsers.size}人`, [...this.onlineUsers]);
    },

    // 启动定时器
    startTimers() {
        // 禁言检查
        const muteId = setInterval(() => this.checkMuteExpire(), CONFIG.CONST.muteCheckInterval);
        this.scheduledIntervals.push(muteId);
        this.debugLog(`[定时器启动] 禁言检查`);

        // 每小时整点提醒（修复版，受闭嘴状态控制）
        this.lastHourlyAnnouncement = -1;
        const hourlyId = setInterval(() => {
            try {
                if (this.isMuted) return; // 闭嘴状态不提醒
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const currentSecond = now.getSeconds();
                
                // 整点后10秒内触发，避免重复
                if (currentMinute === 0 && currentSecond >= 0 && currentSecond <= 10) {
                    if (this.lastHourlyAnnouncement !== currentHour) {
                        this.sendChat(`${currentHour}点了，喝口水吧`);
                        this.lastHourlyAnnouncement = currentHour;
                    }
                } else if (currentMinute > 0) {
                    this.lastHourlyAnnouncement = -1; // 重置标记
                }
            } catch (e) { console.error('[小时提醒错误]', e); }
        }, 1000); // 每秒检查，确保不遗漏
        this.scheduledIntervals.push(hourlyId);
        this.debugLog(`[定时器启动] 整点提醒`);

        // 启动A为空的if规则定时器
        this.runEmptyIfTimer();

        // 加载定时公告
        this.loadScheduledAnnouncements();
        this.schedulePeriodicPost();
    },

    // 判断频道是否安静
    isChannelQuiet(windowMinutes = 5, maxMsgs = 2) {
        try {
            const cutoff = Date.now() - windowMinutes * 60 * 1000;
            const recent = (this.recentMsgTimestamps || []).filter(t => t >= cutoff).length;
            return recent <= maxMsgs;
        } catch (e) { return true; }
    },

    // 加载定时公告（适配间隔配置）
    loadScheduledAnnouncements() {
        try {
            const key = `bot_${CONFIG.botName}_scheduledAnnouncements`;
            const raw = localStorage.getItem(key);
            this.scheduledAnnouncements = raw ? JSON.parse(raw) : [];
            // 兼容旧数据格式
            this.scheduledAnnouncements = this.scheduledAnnouncements.map(item => {
                if (typeof item === 'string') {
                    return { content: item, interval: 15, lastSendTime: 0 }; // 默认15分钟间隔
                }
                return { ...item, lastSendTime: item.lastSendTime || 0 };
            });
        } catch (e) {
            this.scheduledAnnouncements = [];
        }
    },

    // 保存定时公告（适配间隔配置）
    saveScheduledAnnouncements() {
        try {
            const key = `bot_${CONFIG.botName}_scheduledAnnouncements`;
            // 移除lastSendTime避免持久化
            const saveData = this.scheduledAnnouncements.map(({ lastSendTime, ...rest }) => rest);
            localStorage.setItem(key, JSON.stringify(saveData || []));
        } catch (e) {}
    },

    // 安排周期性发布（10分钟检查+15%全局概率+一言/smallTalk互斥）
    schedulePeriodicPost() {
        const min = 10 * 60 * 1000; // 10分钟检查一次
        const delay = min;
        if (this.periodicTimeoutId) clearTimeout(this.periodicTimeoutId);
        this.periodicTimeoutId = setTimeout(() => {
            try {
                if (this.isMuted) { // 闭嘴状态跳过所有周期发布
                    this.periodicTimeoutId = null;
                    this.schedulePeriodicPost();
                    return;
                }
                const now = Date.now();
                // 检查定时公告（按间隔发送）
                this.scheduledAnnouncements.forEach(ann => {
                    if (now - ann.lastSendTime >= ann.interval * 60 * 1000) {
                        this.sendChat(ann.content);
                        ann.lastSendTime = now;
                    }
                });

                // 核心逻辑：全局15%概率 + 一言/smallTalk互斥
                const r = Math.random();
                if (r < 0.15) { // 仅15%概率触发
                    // 随机二选一，实现互斥
                    const chooseYiyan = Math.random() > 0.5;
                    if (chooseYiyan && CONFIG.CONST.periodic.includeYiyan) {
                        this.handleYiyan(); // 发送一言
                    } else if (!chooseYiyan && CONFIG.CONST.periodic.includeStyle) {
                        const s = this.pickStyleReply('smallTalkReplies');
                        if (s) this.sendChat(s); // 发送smallTalk（哦哦/了解啦等）
                    }
                }
                // 剩余85%概率不发送这两类内容
            } catch (e) { console.error('[周期发布失败]', e); }
            this.periodicTimeoutId = null;
            this.schedulePeriodicPost();
        }, delay);
        this.debugLog(`[定时器启动] 周期性发布，下一次 ${Math.round(delay/60000)} 分钟后`);
    },

    // 从历史中挑选一条用户消息
    pickRandomPastMessage(maxScan = 500) {
        try {
            const arr = this.messageHistory.slice(-maxScan).filter(m => {
                if (!m || !m.text) return false;
                const t = m.text.trim();
                if (t.length < 3) return false;
                if (t === ',') return false;
                if (t.startsWith(CONFIG.CONST.cmdPrefix)) return false;
                if (/^欢迎\s+/.test(t)) return false;
                if (t.includes('频道公告')) return false;
                return true;
            });
            if (!arr.length) return null;
            let candidate = arr[Math.floor(Math.random() * arr.length)];
            if (this.lastPeriodicSentId && arr.length > 1 && candidate.id === this.lastPeriodicSentId) {
                candidate = arr.find(m => m.id !== this.lastPeriodicSentId) || candidate;
            }
            this.lastPeriodicSentId = candidate.id;
            let text = candidate.text.trim();
            if (text.length > 200) text = text.slice(0,200) + '...';
            return text;
        } catch (e) { return null; }
    },

    // 检查禁言过期（受闭嘴状态控制）
    checkMuteExpire() {
        if (this.isMuted) return; // 闭嘴状态不发送过期提示
        const now = Date.now();
        for (const [user, expire] of this.silencedUsers.entries()) {
            if (expire !== Infinity && expire < now) {
                this.silencedUsers.delete(user);
                this.sendChat(`${user} 禁言已到期`);
            }
        }
    },

    // 清理资源
    cleanup() {
        // 清理定时器
        this.scheduledIntervals.forEach(t => {
            try { clearInterval(t); } catch (e) {}
            try { clearTimeout(t); } catch (e) {}
        });
        if (this.ifTimer) {
            clearInterval(this.ifTimer);
            this.ifTimer = null;
        }
        if (this.periodicTimeoutId) {
            clearTimeout(this.periodicTimeoutId);
            this.periodicTimeoutId = null;
        }

        // 保存数据
        try { this.saveScheduledAnnouncements(); } catch (e) {}
        try { this.saveIfRules(); } catch (e) {}
        this.ws && this.ws.close(1000, 'cleanup');
        console.log(`[${CONFIG.botName}] 已停止`);
    },

    // ====================== 命令处理方法 ======================
    // 帮助（受闭嘴状态控制）
    handleHelp(msg, _) {
        const { cmdPrefix } = CONFIG.CONST;
        const list = Object.entries(CMD_CONFIG)
            .filter(([_, c]) => c.public)
            .map(([_, c]) => `${cmdPrefix}${c.trigger[0]} ${c.params} - ${c.desc}`)
            .join('\n');
        this.sendChat(`**命令列表**\n${list}`);
    },

    // 掷骰子（受闭嘴状态控制）
    handleRoll(msg, params) {
        let min = 1, max = 6;
        if (params.length > 0) {
            const range = params[0].split('-');
            if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
                min = Number(range[0]);
                max = Number(range[1]);
                if (min >= max) {
                    this.sendChat(`范围错误，最小值须小于最大值`);
                    return;
                }
            } else {
                this.sendChat(`格式：!roll 1-100`);
                return;
            }
        }
        const res = Math.floor(Math.random() * (max - min + 1)) + min;
        this.sendChat(`🎲 [${min}-${max}]：${res}`);
    },

    // AFK（受闭嘴状态控制）
    handleAfk(msg, _) {
        const nick = msg.nick;
        if (this.afkUsers.has(nick)) {
            const afkMs = Date.now() - this.afkUsers.get(nick);
            const afkStr = afkMs > 3600000 ? `${(afkMs / 3600000).toFixed(1)}h` : `${Math.floor(afkMs / 60000)}m`;
            this.afkUsers.delete(nick);
            this.sendChat(`${nick} 已返回 | 离开：${afkStr}`);
        } else {
            this.afkUsers.set(nick, Date.now());
            this.sendChat(`${nick} AFK`);
        }
    },

    // 在线用户（受闭嘴状态控制）
    handleOnline(msg, _) {
        if (this.onlineUsers.size === 0) {
            this.sendChat(`无在线用户`);
            return;
        }
        const list = [...this.onlineUsers].sort().join('、');
        this.sendChat(`在线（${this.onlineUsers.size}人）：${list}`);
    },

    // 最新消息ID（受闭嘴状态控制）
    handleMsglist(msg, _) {
        const latest = this.messageHistory.slice(-CONFIG.CONST.latestMsgCount).reverse();
        if (latest.length === 0) {
            this.sendChat(`无消息记录`);
            return;
        }
        const list = latest.map(m => `#${m.id} @${m.nick}：${m.text.slice(0, 20)}`).join('\n');
        this.sendChat(`最近消息：\n${list}`);
    },

    // 引用回复（受闭嘴状态控制）
    handleReply(msg, params) {
        const [idStr, ...content] = params;
        const msgId = Number(idStr);
        const replyText = content.join(' ');
        if (isNaN(msgId) || !replyText) {
            this.sendChat(`格式：!reply 消息ID 内容`);
            return;
        }
        const target = this.messageIdMap.get(msgId);
        if (!target) {
            this.sendChat(`未找到ID ${msgId}`);
            return;
        }
        const text = `> #${target.id} @${target.nick}：${target.text.slice(0,50)}\n@${msg.nick}：${replyText}`;
        this.sendChat(text);
    },

    // 用户信息（受闭嘴状态控制，新增tripcode展示）
    handleUserinfo(msg, params) {
        const target = params[0] || msg.nick;
        // 查找目标用户的最新消息，获取tripcode
        const targetMsg = this.messageHistory.find(m => m.nick === target && m.trip);
        const tripcode = targetMsg?.trip || '未设置';
        
        const hasAct = this.userActivity.has(target);
        const isAfk = this.afkUsers.has(target);
        const isSil = this.isSilenced(target);
        const isPermSil = isSil && this.silencedUsers.get(target) === Infinity;
        const count = this.userActivity.get(target) || 0;
        // 核心修改：管理员判断改为tripcode
        const isAdmin = tripcode === CONFIG.CONST.ADMIN_TRIPCODE;
        const isOnline = this.onlineUsers.has(target);

        if (!hasAct && !isAfk && !isSil) {
            this.sendChat(`无${target}的记录`);
            return;
        }

        const afkTime = isAfk ? Math.floor((Date.now() - this.afkUsers.get(target))/3600000) : 0;
        const silRemain = isSil && !isPermSil ? Math.ceil((this.silencedUsers.get(target)-Date.now())/60000) : 0;
        const text = `**${target}**\n发言：${count}条\nTripcode：${tripcode}\nAFK：${isAfk ? `是（${afkTime}h）` : '否'}\n禁言：${isSil ? (isPermSil ? '永久' : `临时${silRemain}m`) : '否'}\n管理员：${isAdmin ? '是' : '否'}\n在线：${isOnline ? '是' : '否'}`;
        this.sendChat(text);
    },

    // 活跃度统计（受闭嘴状态控制）
    handleStats(msg, _) {
        const top3 = [...this.userActivity.entries()]
            .sort((a,b) => b[1]-a[1])
            .slice(0,3)
            .map(([n,c]) => `${n}：${c}条`)
            .join('、');
        const text = `**统计**\n在线：${this.onlineUsers.size}人\n活跃TOP3：${top3 || '无'}`;
        this.sendChat(text);
    },

    // 导出记录（Node.js版本：保存到本地文件）
    handleSave(msg, _) {
        try {
            const filename = `hackchat_${CONFIG.channel}_${new Date().toISOString().slice(0,10)}.json`;
            fs.writeFileSync(filename, JSON.stringify(this.messageHistory, null, 2), 'utf8');
            this.sendChat(`聊天记录已导出到文件：${filename}`);
        } catch (err) {
            console.error('[导出失败]', err);
            this.sendChat(`聊天记录导出失败`);
        }
    },

    // 清空记录（受闭嘴状态控制）
    handleClear(msg, _) {
        this.messageHistory = [];
        this.messageIdMap.clear();
        this.nextMessageId = 1;
        this.sendChat(`本地消息历史已清空`);
    },

    // 计算器（受闭嘴状态控制）
    handleCalc(msg, params) {
        const calcStr = params.join(' ');
        if (!calcStr) {
            this.sendChat(`格式：!calc 1+2*3`);
            return;
        }
        try {
            const validReg = /^[0-9\+\-\*\/\(\)\.\s]+$/;
            if (!validReg.test(calcStr)) {
                this.sendChat(`仅支持数字+/*/-/()`);
                return;
            }
            const res = eval(calcStr);
            this.sendChat(`==${calcStr}== = ${isNaN(res) ? '无效' : res}`);
        } catch (err) {
            this.sendChat(`计算失败`);
        }
    },

    // 天气查询（受闭嘴状态控制）
    handleWeather(msg, params) {
        const city = params.join(' ');
        if (!city) {
            this.sendChat(`格式：!weather 北京`);
            return;
        }
        fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`)
            .then(res => res.text())
            .then(data => {
                this.sendChat(`${data}`);
            })
            .catch(() => {
                this.sendChat(`天气查询失败`);
            });
    },

    // 随机表情（受闭嘴状态控制）
    handleEmoji(msg, _) {
        const emoji = CONFIG.CONST.emojiList[Math.floor(Math.random() * CONFIG.CONST.emojiList.length)];
        this.sendChat(`${emoji}`);
    },

    // 管理员帮助（受闭嘴状态控制）
    handleSpecialHelp(msg, _) {
        const { cmdPrefix } = CONFIG.CONST;
        const list = Object.entries(CMD_CONFIG)
            .filter(([_, c]) => c.auth)
            .map(([_, c]) => `${cmdPrefix}${c.trigger[0]} ${c.params} - ${c.desc}`)
            .join('\n');
        this.sendChat(`**管理员命令**\n${list}`);
    },

    // 临时禁言（管理员命令，受tripcode权限控制）
    handleMute(msg, params) {
        const [target, minStr] = params;
        const minutes = Number(minStr);
        if (isNaN(minutes) || minutes <= 0) {
            this.sendChat(`分钟数须大于0`);
            return;
        }
        if (target === CONFIG.botName) {
            this.sendChat(`不能禁言机器人自身`);
            return;
        }
        this.silencedUsers.set(target, Date.now() + minutes * 60000);
        this.sendChat(`${target} 禁言${minutes}分钟`);
    },

    // 永久禁言（管理员命令，受tripcode权限控制）
    handleSilence(msg, params) {
        const target = params[0];
        if (target === CONFIG.botName) {
            this.sendChat(`不能禁言机器人自身`);
            return;
        }
        this.silencedUsers.set(target, Infinity);
        this.sendChat(`${target} 永久禁言`);
    },

    // 解除禁言（管理员命令，受tripcode权限控制）
    handleUnsilence(msg, params) {
        const target = params[0];
        if (this.silencedUsers.delete(target)) {
            this.sendChat(`${target} 禁言已解除`);
        } else {
            this.sendChat(`${target} 未被禁言`);
        }
    },

    // !con命令（管理员命令，受tripcode权限控制）
    handleCon(msg, params) {
        const content = params.join(' ');
        if (!content) {
            this.sendChat(`格式：!con 任意纯文本`);
            return;
        }
        this.sendWSMessage({
            cmd: 'chat',
            text: content,
            clientId: this.clientId
        }, true);
    },

    // 频道公告（管理员命令，受tripcode权限控制）
    handleAnnounce(msg, params) {
        const text = params.join(' ');
        if (!text) {
            this.sendChat(`格式：!announce 公告内容`);
            return;
        }
        const announce = `**【频道公告】**\n${text}`;
        this.sendChat(announce);
    },

    // 管理定时公告（管理员命令，受tripcode权限控制）
    handlePann(msg, params) {
        const sub = params[0];
        if (!sub) {
            this.sendChat(`格式：!pann add|remove|list|clear（add格式：!pann add 间隔(分钟) 公告内容）`);
            return;
        }
        
        switch (sub) {
            case 'add':
                const interval = Number(params[1]);
                const content = params.slice(2).join(' ');
                if (isNaN(interval) || interval <= 0 || !content) {
                    this.sendChat(`格式：!pann add 间隔(分钟) 公告内容`);
                    return;
                }
                this.scheduledAnnouncements = this.scheduledAnnouncements || [];
                this.scheduledAnnouncements.push({
                    content,
                    interval,
                    lastSendTime: 0
                });
                this.saveScheduledAnnouncements();
                this.sendChat(`已添加定时公告（间隔${interval}分钟）：${content}`);
                break;
            case 'remove':
                if (!params[1]) {
                    this.sendChat(`格式：!pann remove 索引/部分内容`);
                    return;
                }
                this.scheduledAnnouncements = this.scheduledAnnouncements || [];
                const idx = Number(params[1]);
                if (!isNaN(idx) && idx >= 1 && idx <= this.scheduledAnnouncements.length) {
                    const removed = this.scheduledAnnouncements.splice(idx-1,1)[0];
                    this.saveScheduledAnnouncements();
                    this.sendChat(`已移除公告 #${idx}（间隔${removed.interval}分钟）：${removed.content}`);
                } else {
                    const needle = params[1].trim();
                    let i = this.scheduledAnnouncements.findIndex(a => a.content.trim() === needle);
                    if (i === -1) {
                        const low = needle.toLowerCase();
                        i = this.scheduledAnnouncements.findIndex(a => a.content.toLowerCase().includes(low));
                    }
                    if (i >= 0) {
                        const removed = this.scheduledAnnouncements.splice(i,1)[0];
                        this.saveScheduledAnnouncements();
                        this.sendChat(`已移除公告 #${i+1}（间隔${removed.interval}分钟）：${removed.content}`);
                    } else {
                        this.sendChat(`未找到指定公告，使用 !pann list 查看索引`);
                    }
                }
                break;
            case 'list':
                if (!this.scheduledAnnouncements || this.scheduledAnnouncements.length === 0) {
                    this.sendChat(`无定时公告`);
                    return;
                }
                const list = this.scheduledAnnouncements.map((a,i)=>`${i+1}. [间隔${a.interval}分钟] ${a.content}`).join('\n');
                this.sendChat(`**定时公告**\n${list}`);
                break;
            case 'clear':
                this.scheduledAnnouncements = [];
                this.saveScheduledAnnouncements();
                this.sendChat(`已清空所有定时公告`);
                break;
            default:
                this.sendChat(`未知子命令，使用 add|remove|list|clear`);
        }
    },

    // 处理!if命令（管理员命令，受tripcode权限控制，新增addz正则模式）
    handleIf(msg, params) {
        const sub = params[0];
        if (!sub) {
            this.sendChat(`格式：!if add A B N|addz A B N|list|remove|clear`);
            this.sendChat(`说明：add为普通模式 addz为正则模式`);
            return;
        }

        switch (sub) {
            case 'add':
                // 解析参数：A B N（注意A/B可能包含空格，最后一个参数是概率）
                const probability = Number(params[params.length - 1]);
                if (isNaN(probability) || probability < 0 || probability > 100) {
                    this.sendChat(`概率N必须是0-100的数字`);
                    return;
                }
                const trigger = params.slice(1, -2).join(' ') || params[1] || ''; // A
                const reply = params.slice(-2, -1).join(' ') || ''; // B
                
                if (!reply) {
                    this.sendChat(`格式错误：!if add A B N（B不能为空）`);
                    return;
                }

                const ruleId = Date.now(); // 用时间戳作为唯一ID
                this.ifRules.push({
                    trigger: trigger.trim(),
                    reply: reply.trim(),
                    probability,
                    id: ruleId,
                    isRegex: false // 标记为普通模式
                });
                this.saveIfRules();
                this.sendChat(`已添加自动回复规则：触发词="${trigger || '空'}"，回复="${reply}"，概率=${probability}%`);
                break;
            case 'addz':
                // 新增addz子命令，正则模式
                const regexProbability = Number(params[params.length - 1]);
                if (isNaN(regexProbability) || regexProbability < 0 || regexProbability > 100) {
                    this.sendChat(`概率N必须是0-100的数字`);
                    return;
                }
                const regexTrigger = params.slice(1, -2).join(' ') || params[1] || ''; // 正则表达式
                const regexReply = params.slice(-2, -1).join(' ') || ''; // 回复内容
                
                if (!regexReply) {
                    this.sendChat(`格式错误：!if addz A B N（B不能为空）`);
                    return;
                }

                const regexRuleId = Date.now();
                this.ifRules.push({
                    trigger: regexTrigger.trim(),
                    reply: regexReply.trim(),
                    probability: regexProbability,
                    id: regexRuleId,
                    isRegex: true // 标记为正则模式
                });
                this.saveIfRules();
                this.sendChat(`已添加自动回复规则：正则="${regexTrigger || '空'}"，回复="${regexReply}"，概率=${regexProbability}%`);
                break;
            case 'list':
                if (!this.ifRules.length) {
                    this.sendChat(`无自动回复规则`);
                    return;
                }
                const ifList = this.ifRules.map((r, i) => `${i+1}. ${r.isRegex ? '[正则]' : '[普通]'} 触发词="${r.trigger || '空'}"，回复="${r.reply}"，概率=${r.probability}%`).join('\n');
                this.sendChat(`**自动回复规则**\n${ifList}`);
                break;
            case 'remove':
                const idx = Number(params[1]);
                if (isNaN(idx) || idx < 1 || idx > this.ifRules.length) {
                    this.sendChat(`索引错误，请使用 !if list 查看有效索引`);
                    return;
                }
                const removedRule = this.ifRules.splice(idx-1, 1)[0];
                this.saveIfRules();
                this.sendChat(`已移除自动回复规则：${removedRule.isRegex ? '[正则]' : '[普通]'} 触发词="${removedRule.trigger || '空'}"，回复="${removedRule.reply}"`);
                break;
            case 'clear':
                this.ifRules = [];
                this.saveIfRules();
                this.sendChat(`已清空所有自动回复规则`);
                break;
            default:
                this.sendChat(`未知子命令，使用 add|addz|list|remove|clear`);
        }
    },

    // 处理!talk命令（管理员命令，受tripcode权限控制）
    handleTalk(msg, params) {
        const action = params[0]?.toLowerCase();
        if (!action || !['on', 'off'].includes(action)) {
            // 闭嘴状态下，不发送格式错误提示
            if (this.isMuted) return;
            this.sendChat(`格式错误：!talk on（开启发言） / !talk off（闭嘴）`);
            return;
        }

        if (action === 'off') {
            this.isMuted = true;
            this.sendChat(`闭嘴了，呜呜`, true); // 强制发送
            console.log(`[${CONFIG.botName}] 已切换为闭嘴状态`);
        } else {
            this.isMuted = false;
            this.sendChat(`张嘴，说话`, true); // 强制发送
            console.log(`[${CONFIG.botName}] 已切换为正常发言状态`);
        }
    },

    // 停止机器人（管理员命令，受tripcode权限控制）
    handleStop(msg, _) {
        // 核心修改：校验tripcode权限
        if (!this.hasAdminAuth(msg)) {
            this.sendChat(`无权限，仅tripcode为2UE++I的管理员可执行`);
            return;
        }
        try {
            this.sendChat('毁灭吧，消失吧。');
        } catch (e) {}
        this.stopped = true;
        setTimeout(() => {
            try { this.cleanup(); } catch (e) {}
        }, 500);
    },

    // 风格回复选择器
    pickStyleReply(type) {
        try {
            const pool = (CONFIG.CONST.styleTemplates && CONFIG.CONST.styleTemplates[type]) || [];
            if (!pool.length) return null;
            return pool[Math.floor(Math.random() * pool.length)];
        } catch (e) { return null; }
    },

    // 随机工具
    randomPick(arr) { return arr && arr.length ? arr[Math.floor(Math.random()*arr.length)] : null; },

    // 一言（受闭嘴状态控制）
    async handleYiyan(msg, _) {
        try {
            const res = await fetch('https://v1.hitokoto.cn/?encode=json');
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();
            const text = (data.hitokoto || data.text || '').trim();
            const from = (data.from || data.from_who || '').trim();
            if (!text) {
                this.sendChat('一言获取失败');
                return;
            }
            const out = from ? `${text} —— ${from}` : `${text}`;
            this.sendChat(out);
        } catch (e) {
            console.error('[一言错误]', e);
            this.sendChat('获取一言失败，请稍后重试');
        }
    }
};

// 捕获退出信号，清理资源
process.on('SIGINT', () => {
    console.log('\n[收到退出信号] 正在停止机器人...');
    bot.cleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[收到终止信号] 正在停止机器人...');
    bot.cleanup();
    process.exit(0);
});

// 启动机器人
bot.init();