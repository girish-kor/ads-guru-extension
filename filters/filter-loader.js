/**
 * filters/filter-loader.js
 * Downloads, caches, and refreshes public ad-block filter lists.
 *
 * Primary filter sources:
 *   - EasyList           (adblock rule standard)
 *   - EasyPrivacy        (tracking protection)
 *   - uBlock Origin      (uBO-specific filters)
 *   - uBlock Filters     (uBO extended filters)
 *   - AdGuard Base       (AdGuard base filter)
 *   - AdGuard Tracking   (AdGuard tracking filter)
 *   - Peter Lowe's List  (ads & tracking combined)
 *   - Malware Domain     (malware domains)
 *
 * Caching strategy:
 *   - Chrome Storage (chrome.storage.local) — persists across sessions
 *   - TTL: 24 hours per list
 *   - Fallback: bundled static rules if all fetches fail
 */
'use strict';

import { FilterParser }   from './filter-parser.js';
import { StorageManager } from '../util/storage.js';
import { Logger }         from '../util/logger.js';

const log = new Logger('FilterLoader');

export class FilterLoader {
  static get FILTER_LISTS() {
    return [
      {
        id:   'easylist',
        name: 'EasyList',
        url:  'https://easylist.to/easylist/easylist.txt',
        ttl:  86400000, // 24h in ms
      },
      {
        id:   'easyprivacy',
        name: 'EasyPrivacy',
        url:  'https://easylist.to/easylist/easyprivacy.txt',
        ttl:  86400000,
      },
      {
        id:   'ublock-filters',
        name: 'uBlock Origin Filters',
        url:  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
        ttl:  86400000,
      },
      {
        id:   'ublock-unbreak',
        name: 'uBlock Unbreak',
        url:  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt',
        ttl:  86400000,
      },
      {
        id:   'ublock-privacy',
        name: 'uBlock Privacy',
        url:  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
        ttl:  86400000,
      },
      {
        id:   'adguard-base',
        name: 'AdGuard Base',
        url:  'https://filters.adtidy.org/extension/chromium/filters/2.txt',
        ttl:  86400000,
      },
      {
        id:   'adguard-tracking',
        name: 'AdGuard Tracking',
        url:  'https://filters.adtidy.org/extension/chromium/filters/3.txt',
        ttl:  86400000,
      },
      {
        id:   'peter-lowe',
        name: 'Peter Lowe Ads+Tracking',
        url:  'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext',
        ttl:  86400000,
      },
    ];
  }

  constructor() {
    this._parser = new FilterParser();
  }

  /**
   * Load and parse network rules from all filter lists.
   * @param {boolean} forceRefresh  Bypass TTL cache
   * @returns {Promise<ParsedRule[]>}
   */
  async loadNetworkRules(forceRefresh = false) {
    const allRules = [];
    const now      = Date.now();

    for (const list of FilterLoader.FILTER_LISTS) {
      try {
        const rules = await this._loadList(list, now, forceRefresh);
        for (const rule of rules) {
          allRules.push(rule);
        }
        log.info('[' + list.name + '] Loaded ' + rules.length + ' rules.');
      } catch (err) {
        if (FilterLoader._isAbortError(err)) {
          log.info('[' + list.name + '] Load aborted; skipping this refresh cycle.');
        } else {
          log.error('[' + list.name + '] Failed to load: ' + err.message);
        }
      }
    }

    log.info('Total rules loaded: ' + allRules.length);
    return allRules;
  }

  async _loadList(list, now, forceRefresh) {
    const cacheKey  = 'filter_raw_' + list.id;
    const tsKey     = 'filter_ts_'  + list.id;

    if (!forceRefresh) {
      const ts = await StorageManager.get(tsKey);
      if (ts && (now - ts) < list.ttl) {
        const raw = await StorageManager.get(cacheKey);
        if (raw) {
          log.debug('[' + list.name + '] Serving from cache.');
          return this._parser.parse(raw);
        }
      }
    }

    const raw = await this._fetchWithRetry(list.url, 3);
    try {
      await StorageManager.set(cacheKey, raw);
      await StorageManager.set(tsKey, now);
    } catch (err) {
      // Large lists can exceed chrome.storage quotas; treat cache writes as best-effort.
      log.warn('[' + list.name + '] Cache write skipped: ' + err.message);
    }
    return this._parser.parse(raw);
  }

  async _fetchWithRetry(url, retries) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
      try {
        const resp = await fetch(url, {
          cache:   'no-store',
          headers: { 'Accept': 'text/plain' },
          signal:  AbortSignal.timeout(15000),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.text();
      } catch (err) {
        lastErr = err;
        if (FilterLoader._isAbortError(err)) {
          throw err;
        }
        await this._sleep(1000 * (i + 1));
      }
    }
    throw lastErr;
  }

  static _isAbortError(err) {
    return Boolean(
      err && (
        err.name === 'AbortError' ||
        /aborted a request|signal timed out|The operation was aborted/i.test(err.message || '')
      )
    );
  }

  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
}
