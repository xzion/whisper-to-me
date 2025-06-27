// Debug utility for Whisper To Me Chrome Extension
// Set DEBUG to true to enable console logging for development/debugging
// Set DEBUG to false to silence debug logs for production release
const DEBUG = false;

// Debug logging utilities - available globally
// Use globalThis for compatibility with both content scripts and service workers
(typeof window !== 'undefined' ? window : globalThis).debug = {
  // Debug logging - only shown when DEBUG is true
  log: (...args) => {
    if (DEBUG) {
      console.log(...args);
    }
  },
  
  // Error logging - always shown (critical for troubleshooting)
  error: (...args) => {
    console.error(...args);
  },
  
  // Warning logging - always shown (important issues)
  warn: (...args) => {
    console.warn(...args);
  }
};