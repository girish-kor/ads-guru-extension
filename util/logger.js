/**
 * util/logger.js
 * Structured, level-filtered logger for extension components.
 *
 * Log levels (ascending severity): DEBUG < INFO < WARN < ERROR
 * Controlled by chrome.storage 'logLevel' key (defaults to 'INFO').
 */
'use strict';

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export class Logger {
  /**
   * @param {string} namespace  Component identifier shown in log prefix
   */
  constructor(namespace) {
    this._ns    = namespace;
    this._level = LEVELS.INFO;
    // Read persisted log level (best-effort, async)
    try {
      chrome.storage.local.get('logLevel', (r) => {
        if (r && r.logLevel) this._level = LEVELS[r.logLevel] ?? LEVELS.INFO;
      });
    } catch {}
  }

  debug(...args) { this._log('DEBUG', ...args); }
  info(...args)  { this._log('INFO',  ...args); }
  warn(...args)  { this._log('WARN',  ...args); }
  error(...args) { this._log('ERROR', ...args); }

  _log(level, ...args) {
    if ((LEVELS[level] ?? 0) < this._level) return;
    const prefix = '[AdsGuru][' + this._ns + '][' + level + ']';
    switch (level) {
      case 'DEBUG': console.debug(prefix, ...args); break;
      case 'INFO':  console.log(prefix,   ...args); break;
      case 'WARN':  console.warn(prefix,  ...args); break;
      case 'ERROR': console.error(prefix, ...args); break;
    }
  }

  setLevel(level) {
    this._level = LEVELS[level] ?? LEVELS.INFO;
  }
}
