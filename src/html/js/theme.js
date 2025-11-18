'use strict';

/*
 * Theme Manager
 * Handles theme application and switching across all windows
 */

const { ipcRenderer } = require('electron');

/**
 * Apply theme to document
 * @param {string} theme - 'dark' or 'light'
 */
function setTheme(theme) {
  const validTheme = theme === 'light' ? 'light' : 'dark';

  // Set data-theme attribute for custom CSS variables
  document.documentElement.setAttribute('data-theme', validTheme);

  // Set data-bs-theme attribute for Bootstrap components
  document.documentElement.setAttribute('data-bs-theme', validTheme);

  // Store in memory for quick access
  window.__currentTheme = validTheme;
}

/**
 * Get current theme
 * @returns {string} Current theme ('dark' or 'light')
 */
function getTheme() {
  return window.__currentTheme || 'dark';
}

// ================================================
// INITIALIZATION
// ================================================

/**
 * Apply initial theme on page load
 * Uses IIFE to execute immediately and prevent flash
 */
(async function applyInitialTheme() {
  try {
    // Get theme from config
    const theme = await ipcRenderer.invoke('get-theme');
    setTheme(theme);
  } catch (error) {
    console.error('[theme.js] Failed to load theme:', error);
    // Fallback to dark theme
    setTheme('dark');
  }
})();

// ================================================
// EVENT LISTENERS
// ================================================

/**
 * Listen for theme changes from other windows
 * When user changes theme in settings, all windows update
 */
ipcRenderer.on('set-theme', (event, theme) => {
  setTheme(theme);
});

/**
 * Listen for config changes that might include theme
 */
ipcRenderer.on('change-ui-text', async () => {
  try {
    const theme = await ipcRenderer.invoke('get-theme');
    setTheme(theme);
  } catch (error) {
    console.error('[theme.js] Failed to apply theme on config change:', error);
  }
});

// ================================================
// EXPORTS (for use in other scripts)
// ================================================

// Expose theme functions globally for other scripts
window.themeManager = {
  setTheme,
  getTheme
};
