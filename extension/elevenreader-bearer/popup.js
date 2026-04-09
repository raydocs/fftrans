'use strict';
/* global chrome */

function formatTime(ms) {
  if (!ms) return '—';
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function updateUI() {
  chrome.runtime.sendMessage({ type: 'get-state' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      document.getElementById('val-connection').textContent = '—';
      document.getElementById('val-connection').className = 'value disconnected';
      return;
    }

    const connEl = document.getElementById('val-connection');
    connEl.textContent = response.connected ? 'Connected' : 'Disconnected';
    connEl.className = `value ${response.connected ? 'connected' : 'disconnected'}`;

    const captureEl = document.getElementById('val-last-capture');
    captureEl.textContent = response.lastBearerSentAt ? formatTime(response.lastBearerSentAt) : '—';

    const statusEl = document.getElementById('val-token-status');
    const status = response.lastTokenStatus || 'none';
    statusEl.textContent = status === 'none' ? '—' : status;
    statusEl.className = `value ${status}`;

    const bufferEl = document.getElementById('val-buffered');
    bufferEl.textContent = response.hasPendingBearer ? 'Yes (waiting for connection)' : 'No';
  });
}

document.getElementById('btn-refresh').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'trigger-refresh' });
  document.getElementById('btn-refresh').textContent = 'Refresh triggered...';
  setTimeout(() => {
    document.getElementById('btn-refresh').textContent = 'Refresh Token Now';
  }, 2000);
});

updateUI();
setInterval(updateUI, 2000);
