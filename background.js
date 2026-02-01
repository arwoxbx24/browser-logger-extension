// Browser Logger Enhanced - Background Script v2.1

const SERVER_HOST = '45.139.76.176';
const SERVER_PORT = 20847;
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

let logs = [];
let lastVersion = null;

// ========== HOT-RELOAD via Polling ==========
async function checkForUpdates() {
  try {
    const response = await fetch(SERVER_URL + '/version', {
      signal: AbortSignal.timeout(2000)
    });
    if (response.ok) {
      const data = await response.json();
      if (lastVersion && lastVersion !== data.version) {
        console.log('[ARWOX] New version detected, reloading...');
        chrome.runtime.reload();
      }
      lastVersion = data.version;
    }
  } catch (e) {
    // Server offline, ignore
  }
}

// Check for updates every 5 seconds
setInterval(checkForUpdates, 5000);
checkForUpdates();

// ========== Message Handler ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Screenshot capture
  if (message.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, async (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      try {
        const response = await fetch(SERVER_URL + '/screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'screenshot',
            timestamp: Date.now(),
            data: dataUrl
          })
        });

        sendResponse({ success: response.ok, error: response.ok ? null : 'Server error' });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    });
    return true;
  }

  // Debugger status
  if (message.type === 'GET_DEBUGGER_STATUS') {
    chrome.debugger.getTargets((targets) => {
      const attached = targets.some(t => t.attached);
      sendResponse({ attached });
    });
    return true;
  }

  // Log handling
  if (message.type === 'LOG') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      url: sender.tab?.url || 'unknown',
      tabId: sender.tab?.id,
      ...message.data
    };
    logs.push(logEntry);
    sendToServer('/log', logEntry);
    sendResponse({ success: true });
  }

  if (message.type === 'GET_LOGS') {
    sendResponse({ logs });
  }

  if (message.type === 'CLEAR_LOGS') {
    logs = [];
    sendResponse({ success: true });
  }

  if (message.type === 'SETTINGS_UPDATED') {
    sendResponse({ success: true });
  }

  return true;
});

// ========== Network Error Listener ==========
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'network_error',
      url: details.url,
      error: details.error,
      tabId: details.tabId
    };
    logs.push(logEntry);
    sendToServer('/log', logEntry);
  },
  { urls: ['<all_urls>'] }
);

// ========== Send to Server ==========
async function sendToServer(endpoint, data) {
  try {
    await fetch(SERVER_URL + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (e) {
    // Server offline, ignore
  }
}
