// Intercept console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

function sendLog(level, args) {
  try {
    chrome.runtime.sendMessage({
      type: 'LOG',
      data: {
        type: 'console',
        level: level,
        message: args.map(arg => {
          try {
            if (typeof arg === 'object') {
              return JSON.stringify(arg, null, 2);
            }
            return String(arg);
          } catch (e) {
            return String(arg);
          }
        }).join(' ')
      }
    }).catch(() => {}); // Ignore response errors
  } catch (e) {
    // Extension context may be invalid
  }
}

console.log = function(...args) {
  sendLog('log', args);
  originalConsole.log.apply(console, args);
};

console.error = function(...args) {
  sendLog('error', args);
  originalConsole.error.apply(console, args);
};

console.warn = function(...args) {
  sendLog('warn', args);
  originalConsole.warn.apply(console, args);
};

console.info = function(...args) {
  sendLog('info', args);
  originalConsole.info.apply(console, args);
};

// Catch uncaught errors
window.addEventListener('error', (event) => {
  try {
    chrome.runtime.sendMessage({
      type: 'LOG',
      data: {
        type: 'error',
        level: 'error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      }
    }).catch(() => {});
  } catch (e) {}
});

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  try {
    chrome.runtime.sendMessage({
      type: 'LOG',
      data: {
        type: 'promise_rejection',
        level: 'error',
        message: String(event.reason),
        stack: event.reason?.stack
      }
    }).catch(() => {});
  } catch (e) {}
});

// Listen for DOM access requests from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_DOM') {
    try {
      const selector = message.selector;
      const element = document.querySelector(selector);

      if (!element) {
        sendResponse({ success: false, error: 'Element not found' });
        return;
      }

      const result = {
        success: true,
        innerHTML: element.innerHTML,
        outerHTML: element.outerHTML,
        textContent: element.textContent,
        tagName: element.tagName,
        id: element.id,
        className: element.className
      };

      sendResponse(result);
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (message.type === 'EXECUTE_JS') {
    try {
      // Execute the provided JavaScript code
      const result = eval(message.code);
      sendResponse({ success: true, result: result });
    } catch (error) {
      sendResponse({ success: false, error: error.message, stack: error.stack });
    }
    return true;
  }

  // Phase 2: Click element
  if (message.type === 'CLICK_ELEMENT') {
    try {
      const element = document.querySelector(message.selector);
      if (!element) {
        sendResponse({ success: false, error: 'Element not found', selector: message.selector });
        return true;
      }
      element.click();
      sendResponse({ success: true, action: 'click', selector: message.selector });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  // Phase 2: Type text into element
  if (message.type === 'TYPE_TEXT') {
    try {
      const element = document.querySelector(message.selector);
      if (!element) {
        sendResponse({ success: false, error: 'Element not found', selector: message.selector });
        return true;
      }
      if (message.clear) {
        element.value = '';
      }
      element.focus();
      element.value = (element.value || '') + message.text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      sendResponse({ success: true, action: 'type', selector: message.selector });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  // Phase 2: Scroll page
  if (message.type === 'SCROLL_PAGE') {
    try {
      if (message.selector) {
        const element = document.querySelector(message.selector);
        if (!element) {
          sendResponse({ success: false, error: 'Element not found', selector: message.selector });
          return true;
        }
        element.scrollIntoView({ behavior: message.behavior, block: 'center' });
      } else {
        window.scrollBy({ left: message.x, top: message.y, behavior: message.behavior });
      }
      sendResponse({ success: true, action: 'scroll' });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  // Phase 3: Get localStorage
  if (message.type === 'GET_STORAGE') {
    try {
      if (message.key) {
        const value = localStorage.getItem(message.key);
        sendResponse({ success: true, type: 'localStorage', key: message.key, value });
      } else {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          data[key] = localStorage.getItem(key);
        }
        sendResponse({ success: true, type: 'localStorage', data });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  // Phase 3: Set localStorage
  if (message.type === 'SET_STORAGE') {
    try {
      localStorage.setItem(message.key, message.value);
      sendResponse({ success: true, type: 'localStorage', key: message.key });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
});
