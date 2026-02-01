// Browser Logger Enhanced Browser Bridge - Panel Script v2.1.0

// Default settings
let settings = {
  serverHost: '45.139.76.176',
  serverPort: 20847,
  logLimit: 1000,
  networkLimit: 500,
  consoleLogs: true,
  networkRequests: true,
  websocket: true,
  elementSelection: true,
  autoClear: false,
  logFilter: 'all',
  urlFilter: ''
};

// Stats
let stats = {
  logs: 0,
  errors: 0,
  network: 0
};

// Load saved settings
function loadSettings() {
  chrome.storage.local.get(['arwoxSettings'], (result) => {
    if (result.arwoxSettings) {
      settings = { ...settings, ...result.arwoxSettings };
      applySettingsToUI();
    }
  });
}

// Apply settings to UI
function applySettingsToUI() {
  document.getElementById('server-host').value = settings.serverHost;
  document.getElementById('server-port').value = settings.serverPort;
  document.getElementById('log-limit').value = settings.logLimit;
  document.getElementById('network-limit').value = settings.networkLimit;
  document.getElementById('log-filter').value = settings.logFilter;
  document.getElementById('url-filter').value = settings.urlFilter || '';

  // Update toggles
  updateToggle('toggle-console', settings.consoleLogs);
  updateToggle('toggle-network', settings.networkRequests);
  updateToggle('toggle-websocket', settings.websocket);
  updateToggle('toggle-element', settings.elementSelection);
  updateToggle('toggle-autoclear', settings.autoClear);

  // Update preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    const isActive = btn.dataset.host === settings.serverHost;
    btn.classList.toggle('active', isActive);
  });
}

function updateToggle(id, value) {
  const toggle = document.getElementById(id);
  if (toggle) {
    toggle.classList.toggle('active', value);
  }
}

// Save settings
function saveSettings() {
  settings.serverHost = document.getElementById('server-host').value;
  settings.serverPort = parseInt(document.getElementById('server-port').value);
  settings.logLimit = parseInt(document.getElementById('log-limit').value);
  settings.networkLimit = parseInt(document.getElementById('network-limit').value);
  settings.logFilter = document.getElementById('log-filter').value;
  settings.urlFilter = document.getElementById('url-filter').value;

  chrome.storage.local.set({ arwoxSettings: settings }, () => {
    showStatus('server-status', 'Settings saved!', 'success');

    // Notify devtools.js about settings update
    chrome.runtime.sendMessage({
      type: 'SETTINGS_UPDATED',
      settings: settings
    });
  });
}

// Test connection
async function testConnection() {
  const host = document.getElementById('server-host').value;
  const port = document.getElementById('server-port').value;
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('connection-status');

  statusDot.className = 'status-dot connecting';
  statusText.textContent = 'Connecting...';

  try {
    const response = await fetch(`http://${host}:${port}/.identity`, {
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      if (data.signature === 'browser-logger-24x7') {
        statusDot.className = 'status-dot connected';
        statusText.textContent = `Connected to ${host}`;
        showStatus('server-status', 'Connection successful!', 'success');
        fetchStats();
      } else {
        throw new Error('Invalid server signature');
      }
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Disconnected';
    showStatus('server-status', `Connection failed: ${error.message}`, 'error');
  }
}

// Fetch stats from server
async function fetchStats() {
  try {
    const host = settings.serverHost;
    const port = settings.serverPort;

    const response = await fetch(`http://${host}:${port}/`, {
      signal: AbortSignal.timeout(3000)
    });

    const html = await response.text();

    // Parse stats from HTML
    const logMatch = html.match(/Console Logs: (\d+)/);
    const errorMatch = html.match(/Errors: <span[^>]*>(\d+)/);
    const networkMatch = html.match(/Network Requests: (\d+)/);

    if (logMatch) document.getElementById('log-count').textContent = logMatch[1];
    if (errorMatch) document.getElementById('error-count').textContent = errorMatch[1];
    if (networkMatch) document.getElementById('network-count').textContent = networkMatch[1];

  } catch (error) {
    console.error('Failed to fetch stats:', error);
  }
}

// Show status message
function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status-msg show ${type}`;

  setTimeout(() => {
    el.className = 'status-msg';
  }, 3000);
}

// Capture screenshot
function captureScreenshot() {
  chrome.devtools.inspectedWindow.eval(
    `(function() {
      return document.documentElement.outerHTML.length;
    })()`,
    async (result, isException) => {
      if (isException) {
        showStatus('server-status', 'Screenshot failed', 'error');
        return;
      }

      // Use chrome.tabs to capture
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, async (dataUrl) => {
        if (chrome.runtime.lastError) {
          showStatus('server-status', 'Screenshot failed: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        try {
          const response = await fetch(`http://${settings.serverHost}:${settings.serverPort}/screenshot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'screenshot',
              timestamp: Date.now(),
              data: dataUrl
            })
          });

          if (response.ok) {
            showStatus('server-status', 'Screenshot captured!', 'success');
          } else {
            throw new Error('Server error');
          }
        } catch (error) {
          showStatus('server-status', 'Failed to send screenshot', 'error');
        }
      });
    }
  );
}

// Export logs
async function exportLogs() {
  try {
    const response = await fetch(`http://${settings.serverHost}:${settings.serverPort}/logs`);
    const logs = await response.json();

    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `arwox-logs-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showStatus('server-status', 'Logs exported!', 'success');
  } catch (error) {
    showStatus('server-status', 'Export failed: ' + error.message, 'error');
  }
}

// Clear all logs
async function clearLogs() {
  try {
    await fetch(`http://${settings.serverHost}:${settings.serverPort}/clear`, {
      method: 'DELETE'
    });

    document.getElementById('log-count').textContent = '0';
    document.getElementById('error-count').textContent = '0';
    document.getElementById('network-count').textContent = '0';

    showStatus('server-status', 'All logs cleared!', 'success');
  } catch (error) {
    showStatus('server-status', 'Clear failed: ' + error.message, 'error');
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // Test connection on load
  setTimeout(testConnection, 500);

  // Update stats every 3 seconds
  setInterval(fetchStats, 3000);

  // Event listeners
  document.getElementById('test-connection').addEventListener('click', testConnection);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('reconnect-btn').addEventListener('click', testConnection);
  document.getElementById('capture-screenshot').addEventListener('click', captureScreenshot);
  document.getElementById('export-logs').addEventListener('click', exportLogs);
  document.getElementById('clear-logs').addEventListener('click', clearLogs);

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('server-host').value = btn.dataset.host;
      document.getElementById('server-port').value = btn.dataset.port;

      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Toggle switches
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      const setting = toggle.dataset.setting;
      settings[setting] = toggle.classList.contains('active');

      chrome.storage.local.set({ arwoxSettings: settings });
      chrome.runtime.sendMessage({
        type: 'SETTINGS_UPDATED',
        settings: settings
      });
    });
  });

  // Auto-save on input change
  ['log-limit', 'network-limit', 'log-filter', 'url-filter'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveSettings);
  });
});
