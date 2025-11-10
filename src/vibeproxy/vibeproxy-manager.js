/**
 * VibeProxy Manager - Integrated into Tataru Assistant
 *
 * Manages CLIProxyAPI server for OAuth-based AI service access
 */

const path = require('path');
const { app } = require('electron');
const ServerManager = require('./server-manager');
const AuthMonitor = require('./auth-monitor');
const BinaryDownloader = require('./binary-downloader');

class VibeProxyManager {
  constructor() {
    this.serverManager = null;
    this.authMonitor = null;
    this.initialized = false;
    this.binaryDownloader = new BinaryDownloader();
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

      // Ensure the binary exists (download if missing)
      const downloadResult = await this.binaryDownloader.ensureBinary(this.cliProxyApiPath);
      if (!downloadResult.success) {
        console.error('[VibeProxy] Failed to ensure binary:', downloadResult.message);
        return {
          success: false,
          message: `CLIProxyAPI 不可用: ${downloadResult.message}\n\n请访问 https://github.com/router-for-me/CLIProxyAPI/releases 手动下载`
        };
      }

      // Initialize server manager
      this.serverManager = new ServerManager(this.cliProxyApiPath, configPath);

      // Initialize auth monitor
      this.authMonitor = new AuthMonitor();
      this.authMonitor.start();

      this.initialized = true;
      console.log('[VibeProxy] Initialized successfully');

      return {
        success: true,
        message: 'VibeProxy initialized successfully'
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

    const fs = require('fs');
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
