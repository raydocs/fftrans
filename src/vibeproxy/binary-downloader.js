'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * CLIProxyAPI Binary Downloader
 * Downloads the CLIProxyAPI executable if it's missing from the installation
 */
class BinaryDownloader {
  constructor() {
    this.downloadUrl = 'https://github.com/router-for-me/CLIProxyAPI/releases/latest/download/cli-proxy-api-windows-amd64.exe';
  }

  /**
   * Download file from URL
   * @param {string} url - Download URL
   * @param {string} dest - Destination file path
   * @returns {Promise<boolean>} - Success status
   */
  async downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
      // Create directory if it doesn't exist
      const dir = path.dirname(dest);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const file = fs.createWriteStream(dest);

      console.log(`[BinaryDownloader] Downloading from: ${url}`);
      console.log(`[BinaryDownloader] Saving to: ${dest}`);

      https.get(url, {
        headers: {
          'User-Agent': 'Tataru-Assistant'
        }
      }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          console.log(`[BinaryDownloader] Redirected to: ${redirectUrl}`);
          file.close();
          fs.unlinkSync(dest);
          this.downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        let lastProgress = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progress = Math.floor((downloadedSize / totalSize) * 100);

          // Log progress every 10%
          if (progress >= lastProgress + 10) {
            console.log(`[BinaryDownloader] Progress: ${progress}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
            lastProgress = progress;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();

          // Verify file size
          const stats = fs.statSync(dest);
          const fileSizeMB = stats.size / 1024 / 1024;

          console.log(`[BinaryDownloader] Download complete: ${fileSizeMB.toFixed(2)} MB`);

          if (stats.size < 1024 * 1024) { // Less than 1MB is suspicious
            console.error('[BinaryDownloader] Error: Downloaded file is too small');
            fs.unlinkSync(dest);
            reject(new Error('Downloaded file is too small (< 1MB)'));
            return;
          }

          resolve(true);
        });

        file.on('error', (err) => {
          file.close();
          fs.unlinkSync(dest);
          reject(err);
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
        reject(err);
      });
    });
  }

  /**
   * Download CLIProxyAPI if it doesn't exist
   * @param {string} targetPath - Target file path
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async ensureBinary(targetPath) {
    try {
      // Check if file already exists
      if (fs.existsSync(targetPath)) {
        const stats = fs.statSync(targetPath);
        const fileSizeMB = stats.size / 1024 / 1024;
        console.log(`[BinaryDownloader] CLIProxyAPI already exists (${fileSizeMB.toFixed(2)} MB)`);

        // Verify it's not corrupted (size check)
        if (stats.size < 1024 * 1024) {
          console.log('[BinaryDownloader] Existing file is too small, re-downloading...');
          fs.unlinkSync(targetPath);
        } else {
          return {
            success: true,
            message: 'CLIProxyAPI binary is ready'
          };
        }
      }

      console.log('[BinaryDownloader] CLIProxyAPI not found, downloading...');

      await this.downloadFile(this.downloadUrl, targetPath);

      return {
        success: true,
        message: 'CLIProxyAPI downloaded successfully'
      };

    } catch (error) {
      console.error('[BinaryDownloader] Download failed:', error);
      return {
        success: false,
        message: `下载失败: ${error.message}`
      };
    }
  }
}

module.exports = BinaryDownloader;
