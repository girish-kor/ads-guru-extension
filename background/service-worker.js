/**
 * background/service-worker.js
 * MV3 Service Worker — Ads Guru Extension
 *
 * Responsibilities:
 *  - Lifecycle management (install / activate / alarm)
 *  - Filter list hydration on startup and scheduled refresh
 *  - Dynamic declarativeNetRequest rule updates
 *  - Message routing between components
 *  - Stats aggregation
 */
'use strict';

import { FilterLoader }    from '../filters/filter-loader.js';
import { RuleEngine }      from './rule-engine.js';
import { Logger }          from '../util/logger.js';
import { StorageManager }  from '../util/storage.js';

const log = new Logger('ServiceWorker');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FILTER_REFRESH_ALARM  = 'filter-refresh';
const FILTER_REFRESH_PERIOD = 60 * 24; // minutes (24 h)
const DYNAMIC_RULE_ID_START = 1000;
const MAX_DYNAMIC_RULES     = 30000;   // Chrome's MV3 limit

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  log.info('Service worker installing…');
  event.waitUntil(
    (async () => {
      await self.skipWaiting();
      await StorageManager.init();
      await hydrateDynamicRules();
      log.info('Install complete.');
    })()
  );
});

// ---------------------------------------------------------------------------
// Activate
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  log.info('Service worker activating…');
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await scheduleFilterRefresh();
      log.info('Activate complete.');
    })()
  );
});

// ---------------------------------------------------------------------------
// Alarm — periodic filter refresh
// ---------------------------------------------------------------------------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FILTER_REFRESH_ALARM) {
    log.info('Alarm fired: refreshing filter lists…');
    await hydrateDynamicRules(true);
  }
});

// ---------------------------------------------------------------------------
// Message routing
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    log.error('Message handler error', err);
    sendResponse({ ok: false, error: err.message });
  });
  return true; // async response
});

// ---------------------------------------------------------------------------
// Tab navigation — inject cosmetic filters
// ---------------------------------------------------------------------------
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  try {
    const rules = await StorageManager.getCosmeticRules(
      new URL(details.url).hostname
    );
    if (rules && rules.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        func: applyCosmeticRules,
        args: [rules],
        world: 'MAIN',
      });
    }
  } catch { /* ignore navigation errors */ }
});

// ---------------------------------------------------------------------------
// Core: hydrate dynamic rules
// ---------------------------------------------------------------------------
async function hydrateDynamicRules(forceRefresh = false) {
  try {
    log.info('Hydrating dynamic rules (forceRefresh=' + forceRefresh + ')');
    const loader = new FilterLoader();
    const networkRules = await loader.loadNetworkRules(forceRefresh);
    const engine = new RuleEngine(DYNAMIC_RULE_ID_START, MAX_DYNAMIC_RULES);
    const dnrRules = engine.compileToDNR(networkRules);

    // Clear existing dynamic rules
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const idsToRemove = existing.map((r) => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: idsToRemove,
      addRules: dnrRules,
    });

    await StorageManager.set('lastRuleUpdate', Date.now());
    await StorageManager.set('ruleCount', dnrRules.length);
    log.info('Dynamic rules updated: ' + dnrRules.length + ' rules active.');
  } catch (err) {
    log.error('hydrateDynamicRules failed', err);
  }
}

// ---------------------------------------------------------------------------
// Schedule periodic refresh
// ---------------------------------------------------------------------------
async function scheduleFilterRefresh() {
  await chrome.alarms.clearAll();
  await chrome.alarms.create(FILTER_REFRESH_ALARM, {
    delayInMinutes: FILTER_REFRESH_PERIOD,
    periodInMinutes: FILTER_REFRESH_PERIOD,
  });
  log.info('Filter refresh alarm scheduled (' + FILTER_REFRESH_PERIOD + ' min).');
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
async function handleMessage(message, _sender) {
  switch (message.type) {
    case 'GET_STATS':
      return {
        ok: true,
        data: await StorageManager.get('stats') || { blocked: 0, allowed: 0 },
      };
    case 'FORCE_REFRESH':
      await hydrateDynamicRules(true);
      return { ok: true };
    case 'GET_RULE_COUNT':
      return { ok: true, count: await StorageManager.get('ruleCount') || 0 };
    case 'REPORT_BLOCK':
      await StorageManager.incrementStat('blocked');
      return { ok: true };
    default:
      return { ok: false, error: 'Unknown message type: ' + message.type };
  }
}

// ---------------------------------------------------------------------------
// Injected function (runs in page context)
// ---------------------------------------------------------------------------
function applyCosmeticRules(selectors) {
  const style = document.createElement('style');
  style.id = '__ads_guru_cosmetic__';
  style.textContent = selectors.join(', ') + ' { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }';
  (document.head || document.documentElement).appendChild(style);
}
