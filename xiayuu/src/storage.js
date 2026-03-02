/**
 * 存储管理模块 - 统一管理所有JSON文件
 */

const fs = require('fs-extra');
const path = require('path');
const { Mutex } = require('async-mutex');

class Storage {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.mutex = new Mutex();
    this.cache = {};
    
    // 创建数据目录
    fs.ensureDirSync(this.dataDir);
  }

  /**
   * 获取文件路径
   */
  getFilePath(fileName) {
    return path.join(this.dataDir, `${fileName}.json`);
  }

  /**
   * 读取数据
   */
  async read(fileName, defaultValue = {}) {
    const release = await this.mutex.acquire();
    try {
      const filePath = this.getFilePath(fileName);
      
      // 检查缓存
      if (this.cache[fileName]) {
        return this.cache[fileName];
      }

      if (await fs.pathExists(filePath)) {
        const data = await fs.readJSON(filePath);
        this.cache[fileName] = data;
        return data;
      }
      
      this.cache[fileName] = defaultValue;
      return defaultValue;
    } catch (err) {
      console.error(`[存储] 读取${fileName}失败:`, err.message);
      return defaultValue;
    } finally {
      release();
    }
  }

  /**
   * 写入数据
   */
  async write(fileName, data) {
    const release = await this.mutex.acquire();
    try {
      const filePath = this.getFilePath(fileName);
      await fs.writeJSON(filePath, data, { spaces: 2 });
      this.cache[fileName] = data;
    } catch (err) {
      console.error(`[存储] 写入${fileName}失败:`, err.message);
    } finally {
      release();
    }
  }

  /**
   * 同步读取（兼容旧代码）
   */
  getSync(fileName, defaultValue = {}) {
    const filePath = this.getFilePath(fileName);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readJSONSync(filePath);
        this.cache[fileName] = data;
        return data;
      }
      return defaultValue;
    } catch (err) {
      console.error(`[存储] 同步读取${fileName}失败:`, err.message);
      return defaultValue;
    }
  }

  /**
   * 同步写入（兼容旧代码）
   */
  setSync(fileName, data) {
    const filePath = this.getFilePath(fileName);
    try {
      fs.writeJSONSync(filePath, data, { spaces: 2 });
      this.cache[fileName] = data;
    } catch (err) {
      console.error(`[存储] 同步写入${fileName}失败:`, err.message);
    }
  }

  /**
   * 清空缓存
   */
  clearCache(fileName) {
    if (fileName) {
      delete this.cache[fileName];
    } else {
      this.cache = {};
    }
  }

  /**
   * 删除文件
   */
  async delete(fileName) {
    const release = await this.mutex.acquire();
    try {
      const filePath = this.getFilePath(fileName);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        this.clearCache(fileName);
      }
    } catch (err) {
      console.error(`[存储] 删除${fileName}失败:`, err.message);
    } finally {
      release();
    }
  }
}

module.exports = Storage;
