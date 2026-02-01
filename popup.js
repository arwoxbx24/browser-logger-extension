// Browser Logger Enhanced - Popup Script v2.1

// FIXED SERVER - no configuration needed
const SERVER_HOST = '45.139.76.176';
const SERVER_PORT = 20847;
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

// Clear old settings and set correct ones
chrome.storage.local.set({
  arwoxSettings: {
    serverHost: SERVER_HOST,
    serverPort: SERVER_PORT
  }
});

// DOM elements
const serverDot = document.getElementById('server-dot');
const serverStatus = document.getElementById('server-status');
const debugDot = document.getElementById('debug-dot');
const debugStatus = document.getElementById('debug-status');
const logsCount = document.getElementById('logs-count');
const networkCount = document.getElementById('network-count');
const toast = document.getElementById('toast');

// Set correct values in UI
document.getElementById('server-host').value = SERVER_HOST;
document.getElementById('server-port').value = SERVER_PORT;

// Test connection on load
testConnection();
fetchStats();

// Update stats every 3 seconds
setInterval(fetchStats, 3000);

// Test connection
async function testConnection() {
  serverDot.className = 'status-dot pending';
  serverStatus.textContent = 'Connecting...';

  try {
    const response = await fetch(`${SERVER_URL}/.identity`, {
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      const data = await response.json();
      if (data.signature === 'browser-logger-24x7') {
        serverDot.className = 'status-dot ok';
        serverStatus.textContent = 'Connected';
        showToast('Connected!', 'success');
        return true;
      }
    }
    throw new Error('Invalid server');
  } catch (e) {
    serverDot.className = 'status-dot error';
    serverStatus.textContent = 'Disconnected';
    showToast('Connection failed', 'error');
    return false;
  }
}

// Fetch stats from server
async function fetchStats() {
  try {
    const [logsRes, networkRes] = await Promise.all([
      fetch(`${SERVER_URL}/logs`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${SERVER_URL}/network`, { signal: AbortSignal.timeout(2000) })
    ]);

    if (logsRes.ok) {
      const logs = await logsRes.json();
      logsCount.textContent = logs.length;
    }
    if (networkRes.ok) {
      const network = await networkRes.json();
      networkCount.textContent = network.length;
    }

    // Check debugger status
    chrome.runtime.sendMessage({ type: 'GET_DEBUGGER_STATUS' }, (response) => {
      if (response && response.attached) {
        debugDot.className = 'status-dot ok';
        debugStatus.textContent = 'Attached';
      } else {
        debugDot.className = 'status-dot';
        debugStatus.textContent = 'Not attached';
      }
    });

  } catch (e) {
    // Silently fail
  }
}

// Save settings
function saveSettings() {
  const btn = document.getElementById('save-settings');
  setButtonLoading(btn, true);

  const host = document.getElementById('server-host').value;
  const port = parseInt(document.getElementById('server-port').value);

  chrome.storage.local.set({
    arwoxSettings: { serverHost: host, serverPort: port }
  }, () => {
    setButtonLoading(btn, false);
    setButtonState(btn, 'success', 'Saved!');
    showToast('Settings saved', 'success');
  });
}

// Clear logs
async function clearLogs() {
  const btn = document.getElementById('clear-logs');
  setButtonLoading(btn, true);

  try {
    await fetch(`${SERVER_URL}/clear`, { method: 'DELETE' });
    logsCount.textContent = '0';
    networkCount.textContent = '0';
    setButtonLoading(btn, false);
    setButtonState(btn, 'success', 'Cleared!');
    showToast('All logs cleared', 'success');
  } catch (e) {
    setButtonLoading(btn, false);
    setButtonState(btn, 'error', 'Failed');
    showToast('Failed to clear logs', 'error');
  }
}

// Capture screenshot
function captureScreenshot() {
  const btn = document.getElementById('capture-screenshot');
  setButtonLoading(btn, true);

  chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (response) => {
    setButtonLoading(btn, false);

    if (chrome.runtime.lastError) {
      setButtonState(btn, 'error', 'Error');
      showToast('Screenshot failed: ' + chrome.runtime.lastError.message, 'error');
      return;
    }

    if (response && response.success) {
      setButtonState(btn, 'success', 'Sent!');
      showToast('Screenshot captured!', 'success');
    } else {
      setButtonState(btn, 'error', 'Failed');
      showToast('Failed: ' + (response?.error || 'Unknown error'), 'error');
    }
  });
}

// Button helpers
function setButtonLoading(btn, loading) {
  const textEl = btn.querySelector('.btn-text');
  if (loading) {
    btn.classList.add('loading');
    btn.dataset.originalText = textEl.textContent;
    textEl.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.classList.remove('loading');
  }
}

function setButtonState(btn, state, text) {
  const textEl = btn.querySelector('.btn-text');
  btn.classList.add(state);
  textEl.textContent = text;

  setTimeout(() => {
    btn.classList.remove(state);
    textEl.textContent = btn.dataset.originalText || text;
  }, 1500);
}

// Toast notification
function showToast(message, type) {
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.className = 'toast';
  }, 2500);
}

// Event listeners
document.getElementById('test-connection').addEventListener('click', testConnection);
document.getElementById('save-settings').addEventListener('click', saveSettings);
document.getElementById('clear-logs').addEventListener('click', clearLogs);
document.getElementById('capture-screenshot').addEventListener('click', captureScreenshot);
