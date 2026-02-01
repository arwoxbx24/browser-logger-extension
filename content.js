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
