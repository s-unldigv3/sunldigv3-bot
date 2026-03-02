/**
 * 消息处理模块
 */

const CONFIG = require('../config');
const logger = require('./logger');

class MessageHandler {
  constructor(ws, clientId) {
    this.ws = ws;
    this.clientId = clientId;
    this.lastSendTime = 0;
    this.msgQueue = new Map();
  }

  /**
   * 发送聊天消息
   */
  sendChat(text, ignoreMute = false) {
    if (!text) return;

    if (this.ws.readyState !== 1) {
      logger.warn('[发送失败] WebSocket未连接');
      return;
    }

    const now = Date.now();
    if (now - this.lastSendTime < CONFIG.mainBot.sendRateLimit) {
      logger.warn('[限流] 频率过高');
      return;
    }

    this.ws.send(JSON.stringify({
      cmd: 'chat',
      text: text,
      clientId: this.clientId
    }));

    this.lastSendTime = now;
    CONFIG.core.debug && logger.debug(`[发送] ${text.substring(0, 50)}`);
  }

  /**
   * 发送私信
   */
  sendPrivateChat(nick, text) {
    if (!nick || !text) return;
    this.sendChat(`/w @${nick} ${text}`);
  }

  /**
   * 发送WebSocket消息
   */
  sendWSMessage(data) {
    if (this.ws.readyState !== 1) {
      logger.error('[发送失败] 连接未建立');
      return;
    }

    this.ws.send(JSON.stringify(data));
    logger.debug('[WebSocket消息已发送]', data);
  }

  /**
   * 发送颜色设置
   */
  sendColorCommand(colorHex = CONFIG.mainBot.color.hex) {
    if (!CONFIG.mainBot.color.enable) return;

    const colorReg = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
    if (!colorReg.test(colorHex)) {
      logger.error(`[颜色配置错误] 无效的16进制颜色值：${colorHex}`);
      return;
    }

    this.sendWSMessage({
      cmd: 'chat',
      text: `/color ${colorHex}`,
      clientId: this.clientId
    });

    logger.info(`[颜色设置] 已发送：/color ${colorHex}`);
  }
}

module.exports = MessageHandler;
