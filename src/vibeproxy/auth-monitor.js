const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

class AuthMonitor extends EventEmitter {
  constructor() {
    super();
    this.authDir = path.join(os.homedir(), '.cli-proxy-api');
    this.watcher = null;
    this.statuses = {
      claude: { isAuthenticated: false, email: null, type: 'claude' },
      codex: { isAuthenticated: false, email: null, type: 'codex' },
      gemini: { isAuthenticated: false, email: null, type: 'gemini' },
      qwen: { isAuthenticated: false, email: null, type: 'qwen' }
    };
  }

  start() {
    // 确保目录存在
    if (!fs.existsSync(this.authDir)) {
      try {
        fs.mkdirSync(this.authDir, { recursive: true });
        console.log(`[AuthMonitor] Created auth directory: ${this.authDir}`);
      } catch (error) {
        console.error(`[AuthMonitor] Failed to create auth directory: ${error.message}`);
        return;
      }
    }

    console.log(`[AuthMonitor] Watching auth directory: ${this.authDir}`);

    // 监听 JSON 文件变化
    this.watcher = chokidar.watch(
      path.join(this.authDir, '*.json'),
      {
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        },
        usePolling: true, // Windows 上使用轮询更可靠
        interval: 1000
      }
    );

    this.watcher
      .on('add', (filePath) => {
        console.log(`[AuthMonitor] File added: ${path.basename(filePath)}`);
        this.checkStatus();
      })
      .on('change', (filePath) => {
        console.log(`[AuthMonitor] File changed: ${path.basename(filePath)}`);
        this.checkStatus();
      })
      .on('unlink', (filePath) => {
        console.log(`[AuthMonitor] File removed: ${path.basename(filePath)}`);
        this.checkStatus();
      })
      .on('error', (error) => {
        console.error(`[AuthMonitor] Watcher error: ${error.message}`);
      });

    // 初始检查
    this.checkStatus();
  }

  async checkStatus() {
    try {
      // 重置所有状态
      Object.keys(this.statuses).forEach(key => {
        this.statuses[key] = {
          isAuthenticated: false,
          email: null,
          type: key,
          expired: null
        };
      });

      // 检查目录是否存在
      if (!fs.existsSync(this.authDir)) {
        this.emit('statusChanged', this.statuses);
        return;
      }

      // 读取目录中的所有 JSON 文件
      let files;
      try {
        files = fs.readdirSync(this.authDir);
      } catch (error) {
        console.error(`[AuthMonitor] Failed to read directory: ${error.message}`);
        this.emit('statusChanged', this.statuses);
        return;
      }

      const jsonFiles = files.filter(f => f.endsWith('.json'));
      console.log(`[AuthMonitor] Found ${jsonFiles.length} auth file(s)`);

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.authDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);

          if (data.type) {
            const type = data.type.toLowerCase();

            if (this.statuses[type]) {
              this.statuses[type] = {
                isAuthenticated: true,
                email: data.email || null,
                type: type,
                expired: data.expired ? new Date(data.expired) : null
              };

              console.log(`[AuthMonitor] Found ${type} auth: ${data.email || 'unknown'}`);
            }
          }
        } catch (error) {
          console.error(`[AuthMonitor] Error reading ${file}: ${error.message}`);
        }
      }

      // 触发状态变化事件
      this.emit('statusChanged', this.statuses);

    } catch (error) {
      console.error(`[AuthMonitor] Error checking status: ${error.message}`);
    }
  }

  getStatus(service) {
    return this.statuses[service] || { isAuthenticated: false, email: null };
  }

  getAllStatuses() {
    return this.statuses;
  }

  stop() {
    if (this.watcher) {
      console.log('[AuthMonitor] Stopping file watcher...');
      this.watcher.close();
      this.watcher = null;
    }
  }
}

module.exports = AuthMonitor;
