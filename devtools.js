// devtools.js - Main DevTools extension script

// Store settings with defaults
let settings = {
  serverHost: "45.139.76.176",
  serverPort: 20847,
  logLimit: 1000,
  networkLimit: 100,
};

// Debugger state
let isDebuggerAttached = false;
const currentTabId = chrome.devtools.inspectedWindow.tabId;

// Load saved settings
chrome.storage.local.get(["browserLoggerSettings"], (result) => {
  if (result.browserLoggerSettings) {
    settings = { ...settings, ...result.browserLoggerSettings };
  }
});

// Listen for settings updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SETTINGS_UPDATED") {
    settings = message.settings;
  }
});

// Helper to send data to server
async function sendToServer(endpoint, data) {
  try {
    const serverUrl = `http://${settings.serverHost}:${settings.serverPort}${endpoint}`;

    const response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(`HTTP error ${response.status} sending to ${endpoint}`);
    }
  } catch (error) {
    console.error(`Error sending to ${endpoint}:`, error.message);
  }
}

// Validate server identity
async function validateServerIdentity() {
  try {
    const response = await fetch(
      `http://${settings.serverHost}:${settings.serverPort}/.identity`,
      { signal: AbortSignal.timeout(3000) }
    );

    if (!response.ok) return false;

    const identity = await response.json();
    return identity.signature === "browser-logger-24x7";
  } catch (error) {
    console.error("Server validation failed:", error);
    return false;
  }
}

// Clear logs on page navigation
chrome.devtools.network.onNavigated.addListener((url) => {
  console.log("Page navigated - clearing logs");
  sendToServer("/logs", { action: "clear" });
});

// 1. Network request listener
chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (request._resourceType === "xhr" || request._resourceType === "fetch") {
    request.getContent((responseBody) => {
      const entry = {
        type: "network-request",
        url: request.request.url,
        method: request.request.method,
        status: request.response.status,
        requestHeaders: request.request.headers,
        responseHeaders: request.response.headers,
        requestBody: request.request.postData?.text ?? "",
        responseBody: responseBody ?? "",
        timestamp: Date.now(),
      };
      sendToServer("/network", entry);
    });
  }
});

// 2. Debugger attachment for console logs
function attachDebugger() {
  chrome.debugger.getTargets((targets) => {
    const isAlreadyAttached = targets.some(
      (target) => target.tabId === currentTabId && target.attached
    );

    if (isAlreadyAttached) {
      chrome.debugger.detach({ tabId: currentTabId }, () => {
        if (chrome.runtime.lastError) {
          console.log("Error during detach:", chrome.runtime.lastError);
        }
        performAttach();
      });
    } else {
      performAttach();
    }
  });
}

function performAttach() {
  chrome.debugger.attach({ tabId: currentTabId }, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.error("Failed to attach debugger:", chrome.runtime.lastError);
      isDebuggerAttached = false;
      return;
    }

    isDebuggerAttached = true;
    console.log("Debugger attached");

    chrome.debugger.onEvent.addListener(debuggerEventListener);

    // Enable Runtime for console logs
    chrome.debugger.sendCommand(
      { tabId: currentTabId },
      "Runtime.enable",
      {},
      () => {
        if (chrome.runtime.lastError) {
          console.error("Failed to enable runtime:", chrome.runtime.lastError);
        }
      }
    );

    // Enable Network for WebSocket monitoring
    chrome.debugger.sendCommand(
      { tabId: currentTabId },
      "Network.enable",
      {},
      () => {
        if (chrome.runtime.lastError) {
          console.error("Failed to enable network:", chrome.runtime.lastError);
        } else {
          console.log("Network monitoring enabled (WebSocket included)");
        }
      }
    );
  });
}

function detachDebugger() {
  chrome.debugger.onEvent.removeListener(debuggerEventListener);

  chrome.debugger.getTargets((targets) => {
    const isStillAttached = targets.some(
      (target) => target.tabId === currentTabId && target.attached
    );

    if (!isStillAttached) {
      isDebuggerAttached = false;
      return;
    }

    chrome.debugger.detach({ tabId: currentTabId }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Warning during detach:", chrome.runtime.lastError);
      }
      isDebuggerAttached = false;
    });
  });
}

// Track WebSocket connections
const wsConnections = new Map();

// 3. Unified debugger event listener (console + WebSocket)
const debuggerEventListener = (source, method, params) => {
  if (source.tabId !== currentTabId) return;

  // Console: Runtime exceptions
  if (method === "Runtime.exceptionThrown") {
    const entry = {
      type: "console-error",
      message:
        params.exceptionDetails.exception?.description ||
        JSON.stringify(params.exceptionDetails),
      level: "error",
      timestamp: Date.now(),
    };
    sendToServer("/log", entry);
  }

  // Console: API calls (log, warn, error, etc.)
  if (method === "Runtime.consoleAPICalled") {
    const args = params.args || [];
    let formattedMessage = "";

    if (args.length > 0) {
      formattedMessage = args
        .map((arg) => {
          if (arg.type === "string") return arg.value;
          if (arg.type === "object" && arg.preview) return JSON.stringify(arg.preview);
          if (arg.description) return arg.description;
          return arg.value || JSON.stringify(arg);
        })
        .join(" ");
    }

    const entry = {
      type: params.type === "error" ? "console-error" : "console-log",
      level: params.type,
      message: formattedMessage,
      timestamp: Date.now(),
    };
    sendToServer("/log", entry);
  }

  // WebSocket: Connection created
  if (method === "Network.webSocketCreated") {
    wsConnections.set(params.requestId, {
      url: params.url,
      initiator: params.initiator,
      timestamp: Date.now(),
    });
    sendToServer("/websocket", {
      type: "ws-created",
      requestId: params.requestId,
      url: params.url,
      timestamp: Date.now(),
    });
  }

  // WebSocket: Handshake response received
  if (method === "Network.webSocketHandshakeResponseReceived") {
    sendToServer("/websocket", {
      type: "ws-handshake",
      requestId: params.requestId,
      status: params.response?.status,
      headers: params.response?.headers,
      timestamp: Date.now(),
    });
  }

  // WebSocket: Frame received (server → client)
  if (method === "Network.webSocketFrameReceived") {
    const wsInfo = wsConnections.get(params.requestId) || {};
    sendToServer("/websocket", {
      type: "ws-frame-received",
      direction: "incoming",
      requestId: params.requestId,
      url: wsInfo.url,
      opcode: params.response?.opcode,
      payloadData: params.response?.payloadData,
      timestamp: Date.now(),
    });
  }

  // WebSocket: Frame sent (client → server)
  if (method === "Network.webSocketFrameSent") {
    const wsInfo = wsConnections.get(params.requestId) || {};
    sendToServer("/websocket", {
      type: "ws-frame-sent",
      direction: "outgoing",
      requestId: params.requestId,
      url: wsInfo.url,
      opcode: params.response?.opcode,
      payloadData: params.response?.payloadData,
      timestamp: Date.now(),
    });
  }

  // WebSocket: Connection closed
  if (method === "Network.webSocketClosed") {
    const wsInfo = wsConnections.get(params.requestId) || {};
    sendToServer("/websocket", {
      type: "ws-closed",
      requestId: params.requestId,
      url: wsInfo.url,
      timestamp: Date.now(),
    });
    wsConnections.delete(params.requestId);
  }

  // WebSocket: Error
  if (method === "Network.webSocketFrameError") {
    sendToServer("/websocket", {
      type: "ws-error",
      requestId: params.requestId,
      errorMessage: params.errorMessage,
      timestamp: Date.now(),
    });
  }
};

// 4. Create DevTools panel
chrome.devtools.panels.create(
  "Browser Logger Enhanced Bridge",
  "",
  "panel.html",
  (panel) => {
    attachDebugger();

    panel.onShown.addListener((panelWindow) => {
      if (!isDebuggerAttached) {
        attachDebugger();
      }
    });
  }
);

// 5. Element selection listener
chrome.devtools.panels.elements.onSelectionChanged.addListener(() => {
  chrome.devtools.inspectedWindow.eval(
    `(function() {
      const el = $0;
      if (!el) return null;

      const rect = el.getBoundingClientRect();

      return {
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        textContent: el.textContent?.substring(0, 100),
        attributes: Array.from(el.attributes).map(attr => ({
          name: attr.name,
          value: attr.value
        })),
        dimensions: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left
        },
        innerHTML: el.innerHTML.substring(0, 500)
      };
    })()`,
    (result, isException) => {
      if (isException || !result) return;

      sendToServer("/element", {
        type: "selected-element",
        timestamp: Date.now(),
        element: result,
      });
    }
  );
});

// Clean up on unload
window.addEventListener("unload", () => {
  detachDebugger();
});
