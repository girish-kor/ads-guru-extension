/**
 * util/storage.js
 * Unified chrome.storage.local wrapper with async/await interface.
 *
 * Provides:
 *  - get / set / delete with promise wrapping
 *  - init() for first-run defaults
 *  - incrementStat() for atomic-ish stats updates
 *  - getCosmeticRules() for per-hostname cosmetic rule retrieval
 */
'use strict';

export class StorageManager {
  static async init() {
    const existing = await StorageManager.get('__initialized__');
    if (existing) return;
    await chrome.storage.local.set({
      '__initialized__': true,
      'stats':           { blocked: 0, allowed: 0 },
      'allowlist':       [],
      'logLevel':        'INFO',
      'ruleCount':       0,
    });
  }

  static get(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[key]);
        }
      });
    });
  }

  static set(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  static delete(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(key, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  static async incrementStat(stat) {
    const stats = (await StorageManager.get('stats')) || { blocked: 0, allowed: 0 };
    stats[stat] = (stats[stat] || 0) + 1;
    await StorageManager.set('stats', stats);
  }

  static async getCosmeticRules(hostname) {
    // Cosmetic rules are stored keyed by domain fragments
    const allCosmeticKeys = await new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        resolve(Object.keys(items).filter((k) => k.startsWith('cosm_')));
      });
    });

    const selectors = [];
    for (const key of allCosmeticKeys) {
      const domain = key.slice(5); // strip 'cosm_'
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        const rules = await StorageManager.get(key);
        if (Array.isArray(rules)) selectors.push(...rules);
      }
    }
    return selectors;
  }

  static async storeCosmeticRules(rulesByDomain) {
    const entries = {};
    for (const [domain, selectors] of Object.entries(rulesByDomain)) {
      entries['cosm_' + domain] = selectors;
    }
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(entries, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }
}
