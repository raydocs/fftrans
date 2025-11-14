/**
 * VibeProxy Manager - Integrated into Tataru Assistant
 *
 * Manages CLIProxyAPI server for OAuth-based AI service access
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const ServerManager = require('./server-manager');
const AuthMonitor = require('./auth-monitor');
const configModule = require('../module/system/config-module');

class VibeProxyManager {
  constructor() {
    this.serverManager = null;
    this.authMonitor = null;
    this.initialized = false;
    this.cliProxyApiPath = null;
    this.resourcesPath = null;
  }

  /**
   * Initialize VibeProxy with bundled resources
   */
  async initialize() {
    if (this.initialized) {
      console.log('[VibeProxy] Already initialized');
      return { success: true, message: 'Already initialized' };
    }

    try {
      // Get resources path (works for both development and production)
      this.resourcesPath = app.isPackaged
        ? path.join(process.resourcesPath, 'vibeproxy')
        : path.join(__dirname, '../../vibeproxy-resources');

      this.cliProxyApiPath = path.join(this.resourcesPath, 'cli-proxy-api.exe');
      const configPath = path.join(this.resourcesPath, 'config.yaml');

      console.log('[VibeProxy] Resources path:', this.resourcesPath);
      console.log('[VibeProxy] Binary path:', this.cliProxyApiPath);
      console.log('[VibeProxy] Config path:', configPath);

      // Check if binary exists
      if (!fs.existsSync(this.cliProxyApiPath)) {
        console.error('[VibeProxy] CLIProxyAPI binary not found at:', this.cliProxyApiPath);
        return {
          success: false,
          message: 'CLIProxyAPI 二进制文件未找到。请重新安装应用。'
        };
      }

      // Verify binary size (should be > 10MB)
      const stats = fs.statSync(this.cliProxyApiPath);
      const fileSizeMB = stats.size / 1024 / 1024;
      console.log(`[VibeProxy] Binary size: ${fileSizeMB.toFixed(2)} MB`);

      if (fileSizeMB < 10) {
        console.error('[VibeProxy] Binary file is too small, may be corrupted');
        return {
          success: false,
          message: 'CLIProxyAPI 二进制文件可能已损坏。请重新安装应用。'
        };
      }

      // Read configuration from config module
      const config = configModule.getConfig();
      const vibeProxyConfig = config.vibeproxy || {};

      console.log('[VibeProxy] Configuration:', {
        port: vibeProxyConfig.port,
        debug: vibeProxyConfig.debug,
        loggingToFile: vibeProxyConfig.loggingToFile,
        requestRetry: vibeProxyConfig.requestRetry
      });

      // Initialize server manager with configuration
      const options = {
        port: parseInt(vibeProxyConfig.port) || 8318,
        debug: vibeProxyConfig.debug || false,
        loggingToFile: vibeProxyConfig.loggingToFile || false,
        requestRetry: parseInt(vibeProxyConfig.requestRetry) || 3
      };

      this.serverManager = new ServerManager(this.cliProxyApiPath, configPath, options);

      // Initialize auth monitor
      this.authMonitor = new AuthMonitor();
      this.authMonitor.start();

      this.initialized = true;
      console.log('[VibeProxy] Initialized successfully');

      return {
        success: true,
        message: 'VibeProxy 初始化成功'
      };

    } catch (error) {
      console.error('[VibeProxy] Initialization error:', error);
      return {
        success: false,
        message: `初始化失败: ${error.message}`
      };
    }
  }

  /**
   * Start the VibeProxy server
   */
  async start() {
    if (!this.initialized) {
      throw new Error('VibeProxy not initialized. Call initialize() first.');
    }

    return await this.serverManager.start();
  }

  /**
   * Stop the VibeProxy server
   */
  async stop() {
    if (!this.initialized || !this.serverManager) {
      return;
    }

    await this.serverManager.stop();
  }

  /**
   * Start authentication for a service
   */
  async startAuth(service) {
    if (!this.initialized) {
      throw new Error('VibeProxy not initialized');
    }

    return await this.serverManager.startAuth(service);
  }

  /**
   * Get server status
   */
  getStatus() {
    if (!this.initialized || !this.serverManager) {
      return { isRunning: false, port: 8318 };
    }

    return {
      isRunning: this.serverManager.isRunning,
      port: this.serverManager.port
    };
  }

  /**
   * Get authentication statuses
   */
  getAuthStatuses() {
    if (!this.initialized || !this.authMonitor) {
      return {
        claude: { isAuthenticated: false, email: null, type: 'claude' },
        codex: { isAuthenticated: false, email: null, type: 'codex' },
        gemini: { isAuthenticated: false, email: null, type: 'gemini' },
        qwen: { isAuthenticated: false, email: null, type: 'qwen' }
      };
    }

    return this.authMonitor.statuses;
  }

  /**
   * Get server logs
   */
  getLogs() {
    if (!this.initialized || !this.serverManager) {
      return [];
    }

    return this.serverManager.getLogs();
  }

  /**
   * Check if VibeProxy is available (binary exists)
   */
  isAvailable() {
    if (!this.initialized || !this.serverManager) {
      return false;
    }

    return fs.existsSync(this.serverManager.cliProxyApiPath);
  }

  /**
   * Register auth status change callback
   */
  onAuthStatusChanged(callback) {
    if (this.authMonitor) {
      this.authMonitor.on('statusChanged', callback);
    }
  }

  /**
   * Cleanup on app quit
   */
  async cleanup() {
    console.log('[VibeProxy] Cleaning up...');

    if (this.serverManager) {
      await this.serverManager.stop();
    }

    if (this.authMonitor) {
      this.authMonitor.stop();
    }

    this.initialized = false;
  }
}

// Export singleton instance
module.exports = new VibeProxyManager();
