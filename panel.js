// Browser Logger DevTools - Panel Script v2.2.0

const SERVER_HOST = '45.139.76.176';
const SERVER_PORT = 20847;
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

let settings = {
  serverHost: SERVER_HOST,
  serverPort: SERVER_PORT,
  consoleLogs: true,
  networkRequests: true,
  websocket: true
};

// ========== ACTIVITY LOG ==========
function logActivity(action, result, isOk = true) {
  const log = document.getElementById('activity-log');
  const time = new Date().toLocaleTimeString('ru-RU');

  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <span class="activity-time">${time}</span>
    <span class="activity-action">${action}</span>
    <span class="activity-result ${isOk ? 'ok' : 'fail'}">${result}</span>
  `;

  // Add at top
  if (log.firstChild) {
    log.insertBefore(item, log.firstChild);
  } else {
    log.appendChild(item);
  }

  // Keep max 20 items
  while (log.children.length > 20) {
    log.removeChild(log.lastChild);
  }
}

// ========== TOAST ==========
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

// ========== BUTTON STATE ==========
function setButtonState(btn, state, text = null) {
  const originalText = btn.dataset.originalText || btn.textContent;
  btn.dataset.originalText = originalText;

  btn.classList.remove('loading', 'success', 'error');

  if (state === 'loading') {
    btn.classList.add('loading');
    btn.textContent = text || 'Loading...';
  } else if (state === 'success') {
    btn.classList.add('success');
    btn.textContent = text || 'Done!';
    setTimeout(() => {
      btn.classList.remove('success');
      btn.textContent = originalText;
    }, 2000);
  } else if (state === 'error') {
    btn.classList.add('error');
    btn.textContent = text || 'Error!';
    setTimeout(() => {
      btn.classList.remove('error');
      btn.textContent = originalText;
    }, 2000);
  } else {
    btn.textContent = originalText;
  }
}

// ========== TEST CONNECTION ==========
async function testConnection() {
  const btn = document.getElementById('test-connection');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('connection-status');

  setButtonState(btn, 'loading', 'Testing...');
  statusDot.className = 'status-dot connecting';
  statusText.textContent = 'Connecting...';
  logActivity('Test Connection', 'Starting...');

  try {
    const host = document.getElementById('server-host').value;
    const port = document.getElementById('server-port').value;

    const response = await fetch(`http://${host}:${port}/.identity`, {
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      if (data.signature === 'browser-logger-24x7') {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Connected';
        setButtonState(btn, 'success', 'Connected!');
        showToast('Connected to server!', 'success');
        logActivity('Test Connection', 'SUCCESS - Server online', true);
        fetchStats();
        return true;
      }
    }
    throw new Error('Invalid server');
  } catch (error) {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Disconnected';
    setButtonState(btn, 'error', 'Failed!');
    showToast('Connection failed: ' + error.message, 'error');
    logActivity('Test Connection', 'FAILED - ' + error.message, false);
    return false;
  }
}

// ========== FETCH STATS ==========
async function fetchStats() {
  try {
    const [logsRes, networkRes] = await Promise.all([
      fetch(`${SERVER_URL}/logs`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${SERVER_URL}/network`, { signal: AbortSignal.timeout(2000) })
    ]);

    if (logsRes.ok) {
      const logs = await logsRes.json();
      document.getElementById('log-count').textContent = logs.length;
      const errors = logs.filter(l => l.level === 'error').length;
      document.getElementById('error-count').textContent = errors;
    }
    if (networkRes.ok) {
      const network = await networkRes.json();
      document.getElementById('network-count').textContent = network.length;
    }
  } catch (e) {
    // Silent fail
  }
}

// ========== SAVE SETTINGS ==========
function saveSettings() {
  const btn = document.getElementById('save-settings');
  setButtonState(btn, 'loading', 'Saving...');

  settings.serverHost = document.getElementById('server-host').value;
  settings.serverPort = parseInt(document.getElementById('server-port').value);

  chrome.storage.local.set({ arwoxSettings: settings }, () => {
    setButtonState(btn, 'success', 'Saved!');
    showToast('Settings saved!', 'success');
    logActivity('Save Settings', 'SUCCESS', true);
  });
}

// ========== CAPTURE SCREENSHOT ==========
async function captureScreenshot() {
  const btn = document.getElementById('capture-screenshot');
  setButtonState(btn, 'loading', 'Capturing...');
  logActivity('Screenshot', 'Capturing...');

  try {
    // Use chrome.tabs.captureVisibleTab via background script
    chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, async (response) => {
      if (chrome.runtime.lastError) {
        setButtonState(btn, 'error', 'Failed!');
        showToast('Screenshot failed: ' + chrome.runtime.lastError.message, 'error');
        logActivity('Screenshot', 'FAILED - ' + chrome.runtime.lastError.message, false);
        return;
      }

      if (response && response.success) {
        setButtonState(btn, 'success', 'Sent!');
        showToast('Screenshot captured and sent!', 'success');
        logActivity('Screenshot', 'SUCCESS - Sent to server', true);
      } else {
        setButtonState(btn, 'error', 'Failed!');
        showToast('Screenshot failed: ' + (response?.error || 'Unknown'), 'error');
        logActivity('Screenshot', 'FAILED - ' + (response?.error || 'Unknown'), false);
      }
    });
  } catch (error) {
    setButtonState(btn, 'error', 'Failed!');
    showToast('Screenshot failed: ' + error.message, 'error');
    logActivity('Screenshot', 'FAILED - ' + error.message, false);
  }
}

// ========== EXPORT LOGS ==========
async function exportLogs() {
  const btn = document.getElementById('export-logs');
  setButtonState(btn, 'loading', 'Exporting...');
  logActivity('Export Logs', 'Starting...');

  try {
    const response = await fetch(`${SERVER_URL}/logs`);
    const logs = await response.json();

    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `browser-logs-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
    setButtonState(btn, 'success', 'Downloaded!');
    showToast(`Exported ${logs.length} logs!`, 'success');
    logActivity('Export Logs', `SUCCESS - ${logs.length} logs`, true);
  } catch (error) {
    setButtonState(btn, 'error', 'Failed!');
    showToast('Export failed: ' + error.message, 'error');
    logActivity('Export Logs', 'FAILED - ' + error.message, false);
  }
}

// ========== CLEAR LOGS ==========
async function clearLogs() {
  const btn = document.getElementById('clear-logs');
  setButtonState(btn, 'loading', 'Clearing...');
  logActivity('Clear Logs', 'Clearing...');

  try {
    await fetch(`${SERVER_URL}/clear`, { method: 'DELETE' });

    document.getElementById('log-count').textContent = '0';
    document.getElementById('error-count').textContent = '0';
    document.getElementById('network-count').textContent = '0';

    setButtonState(btn, 'success', 'Cleared!');
    showToast('All logs cleared!', 'success');
    logActivity('Clear Logs', 'SUCCESS', true);
  } catch (error) {
    setButtonState(btn, 'error', 'Failed!');
    showToast('Clear failed: ' + error.message, 'error');
    logActivity('Clear Logs', 'FAILED - ' + error.message, false);
  }
}

// ========== INITIALIZE ==========
document.addEventListener('DOMContentLoaded', () => {
  // Set initial values
  document.getElementById('server-host').value = SERVER_HOST;
  document.getElementById('server-port').value = SERVER_PORT;

  // Test connection on load
  setTimeout(() => {
    testConnection();
    logActivity('Panel Loaded', 'DevTools panel ready', true);
  }, 500);

  // Update stats every 3 seconds
  setInterval(fetchStats, 3000);

  // Event listeners
  document.getElementById('test-connection').addEventListener('click', testConnection);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('capture-screenshot').addEventListener('click', captureScreenshot);
  document.getElementById('export-logs').addEventListener('click', exportLogs);
  document.getElementById('clear-logs').addEventListener('click', clearLogs);

  // Toggle switches
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      const setting = toggle.dataset.setting;
      settings[setting] = toggle.classList.contains('active');

      chrome.storage.local.set({ arwoxSettings: settings });
      logActivity('Toggle ' + setting, toggle.classList.contains('active') ? 'ON' : 'OFF', true);
    });
  });
});
