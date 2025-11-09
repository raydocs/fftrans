const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ServerManager {
  constructor(cliProxyApiPath, configPath) {
    this.cliProxyApiPath = cliProxyApiPath;
    this.configPath = configPath;
    this.process = null;
    this.isRunning = false;
    this.port = 8318;
    this.logs = [];
    this.maxLogs = 1000;
  }

  async start() {
    if (this.isRunning) {
      this.addLog('[Server] Already running');
      return true;
    }

    // 检查二进制文件是否存在
    if (!fs.existsSync(this.cliProxyApiPath)) {
      this.addLog(`[Server] ❌ Error: cli-proxy-api.exe not found at ${this.cliProxyApiPath}`);
      this.addLog('[Server] Please download CLIProxyAPI from: https://github.com/router-for-me/CLIProxyAPI/releases');
      return false;
    }

    // 检查配置文件
    if (!fs.existsSync(this.configPath)) {
      this.addLog(`[Server] ❌ Error: config.yaml not found at ${this.configPath}`);
      return false;
    }

    return new Promise((resolve) => {
      try {
        this.addLog('[Server] Starting CLIProxyAPI server...');

        this.process = spawn(this.cliProxyApiPath, [
          '--config', this.configPath
        ], {
          windowsHide: true, // 隐藏控制台窗口
          env: process.env
        });

        // 监听标准输出
        this.process.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            this.addLog(`[Server] ${output}`);
          }
        });

        // 监听错误输出
        this.process.stderr.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            this.addLog(`[Server] ⚠️ ${output}`);
          }
        });

        // 监听进程退出
        this.process.on('close', (code) => {
          this.isRunning = false;
          this.addLog(`[Server] Stopped with exit code: ${code}`);
          this.process = null;
        });

        // 监听进程错误
        this.process.on('error', (err) => {
          this.addLog(`[Server] ❌ Failed to start: ${err.message}`);
          this.isRunning = false;
          resolve(false);
        });

        // 等待服务器启动
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.isRunning = true;
            this.addLog(`[Server] ✓ Started successfully on port ${this.port}`);
            this.addLog(`[Server] API endpoint: http://localhost:${this.port}`);
            resolve(true);
          } else {
            this.addLog('[Server] ⚠️ Server exited before becoming ready');
            resolve(false);
          }
        }, 1500);

      } catch (error) {
        this.addLog(`[Server] ❌ Exception: ${error.message}`);
        this.isRunning = false;
        resolve(false);
      }
    });
  }

  async stop() {
    if (!this.process || !this.isRunning) {
      this.isRunning = false;
      return;
    }

    return new Promise((resolve) => {
      const pid = this.process.pid;
      this.addLog(`[Server] Stopping server (PID: ${pid})...`);

      this.process.once('close', () => {
        this.isRunning = false;
        this.process = null;
        this.addLog('[Server] ✓ Stopped successfully');
        resolve();
      });

      // Windows: 使用 taskkill 强制结束进程树
      if (process.platform === 'win32') {
        const killProcess = spawn('taskkill', ['/pid', pid.toString(), '/f', '/t']);

        killProcess.on('error', (err) => {
          console.error(`[Server] Kill error: ${err.message}`);
        });

        killProcess.on('close', () => {
          // 给一点时间让进程清理
          setTimeout(() => {
            if (this.process) {
              this.process = null;
              this.isRunning = false;
            }
            resolve();
          }, 500);
        });
      } else {
        // 其他平台使用 SIGTERM
        this.process.kill('SIGTERM');

        // 2秒后如果还没结束，强制 SIGKILL
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.addLog('[Server] ⚠️ Force killing process...');
            this.process.kill('SIGKILL');
          }
        }, 2000);
      }
    });
  }

  async startAuth(service) {
    if (!fs.existsSync(this.cliProxyApiPath)) {
      return {
        success: false,
        message: 'CLI Proxy API binary not found'
      };
    }

    const commands = {
      'claude': ['-claude-login'],
      'codex': ['-codex-login'],
      'gemini': ['-login'],
      'qwen': ['-qwen-login']
    };

    if (!commands[service]) {
      return {
        success: false,
        message: `Unknown service: ${service}`
      };
    }

    const args = [
      '--config', this.configPath,
      ...commands[service]
    ];

    this.addLog(`[Auth] Starting ${service} authentication...`);

    return new Promise((resolve) => {
      const authProcess = spawn(this.cliProxyApiPath, args, {
        windowsHide: false, // 显示认证窗口
        env: process.env
      });

      authProcess.stdout.on('data', (data) => {
        console.log(`[Auth ${service}]`, data.toString());
      });

      authProcess.stderr.on('data', (data) => {
        console.error(`[Auth ${service} Error]`, data.toString());
      });

      authProcess.on('error', (err) => {
        this.addLog(`[Auth] ❌ Failed to start ${service} auth: ${err.message}`);
        resolve({
          success: false,
          message: `Failed to start authentication: ${err.message}`
        });
      });

      // 等待一秒检查进程是否正常启动
      setTimeout(() => {
        if (!authProcess.killed) {
          this.addLog(`[Auth] ✓ ${service} authentication process started`);
          resolve({
            success: true,
            message: `🌐 Browser should open for ${service} authentication.\n\nPlease complete the login process in your browser.\n\nThe app will automatically detect when you're authenticated.`
          });
        } else {
          this.addLog(`[Auth] ❌ ${service} authentication process failed to start`);
          resolve({
            success: false,
            message: 'Authentication process failed to start'
          });
        }
      }, 1000);
    });
  }

  addLog(message) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const logLine = `[${timestamp}] ${message}`;

    this.logs.push(logLine);

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    console.log(logLine);
  }

  getLogs() {
    return this.logs;
  }
}

module.exports = ServerManager;
