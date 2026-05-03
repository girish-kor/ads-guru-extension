/**
 * core/request-interceptor.js
 * Intercepts network requests using the FilterEngine.
 *
 * In MV3, actual network blocking is done via declarativeNetRequest.
 * This module handles:
 *  - Dynamic rule updates based on real-time filter evaluations
 *  - Request logging and stats
 *  - Allowlist management
 */
'use strict';

import { FilterEngine }   from './filter-engine.js';
import { StorageManager } from '../util/storage.js';
import { Logger }         from '../util/logger.js';

const log = new Logger('RequestInterceptor');

export class RequestInterceptor {
  constructor() {
    this._engine    = new FilterEngine();
    this._allowlist = new Set();
    this._stats     = { blocked: 0, allowed: 0, evaluated: 0 };
  }

  async init(parsedRules) {
    await this._engine.build(parsedRules);
    const stored = await StorageManager.get('allowlist') || [];
    this._allowlist = new Set(stored);
    log.info('RequestInterceptor ready. Allowlist: ' + this._allowlist.size + ' domains.');
  }

  /**
   * Evaluate a request URL and return a blocking decision.
   * Called from the service worker for dynamic rule evaluation.
   */
  evaluate(url, initiatorHostname) {
    this._stats.evaluated++;

    // Allowlist check
    if (this._allowlist.has(initiatorHostname)) {
      this._stats.allowed++;
      return { action: 'allow', reason: 'allowlist' };
    }

    const result = this._engine.evaluate(url);

    if (result.blocked) {
      this._stats.blocked++;
      StorageManager.incrementStat('blocked').catch(() => {});
      return { action: 'block', reason: result.matchedBy, rule: result.rule };
    }

    this._stats.allowed++;
    return { action: 'allow', reason: result.matchedBy };
  }

  allowDomain(domain) {
    this._allowlist.add(domain);
    StorageManager.set('allowlist', [...this._allowlist]).catch(() => {});
  }

  disallowDomain(domain) {
    this._allowlist.delete(domain);
    StorageManager.set('allowlist', [...this._allowlist]).catch(() => {});
  }

  getStats() { return { ...this._stats }; }
}
