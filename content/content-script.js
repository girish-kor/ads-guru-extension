/**
 * content/content-script.js
 * Injected at document_start into every frame.
 *
 * Content scripts in MV3 are classic scripts, so this file must remain
 * self-contained and avoid ESM import syntax.
 */
'use strict';

class Logger {
  constructor(namespace) {
    this._ns = namespace;
  }

  debug(...args) { console.debug('[AdsGuru][' + this._ns + '][DEBUG]', ...args); }
  info(...args)  { console.log('[AdsGuru][' + this._ns + '][INFO]', ...args); }
  warn(...args)  { console.warn('[AdsGuru][' + this._ns + '][WARN]', ...args); }
  error(...args) { console.error('[AdsGuru][' + this._ns + '][ERROR]', ...args); }
}

class DomFilter {
  constructor() {
    this._defaultSelectors = [
      '[id*="ad_"],[id*="_ad"],[id*="-ad"],[id*="ad-"]',
      '[class*="ad_"],[class*="_ad"],[class*="-ad"],[class*="ad-"]',
      '[class*="adsense"],[class*="adslot"],[class*="adunit"]',
      '[id*="banner-ad"],[id*="ad-banner"],[id*="advertisement"]',
      '[data-ad-slot],[data-ad-client],[data-ad-unit-id]',
      'ins.adsbygoogle',
      'iframe[src*="doubleclick.net"]',
      'iframe[src*="googlesyndication.com"]',
      'iframe[src*="amazon-adsystem.com"]',
      'div[id^="google_ads_"]',
      'div[id^="div-gpt-ad"]',
      '.sponsored-content,.promoted-content,.native-ad',
      '[aria-label="Sponsored"],[aria-label="Advertisement"]',
    ];

    this._customSelectors = [];
    this._observer = null;
  }

  applyHideRules(selectors) {
    this._customSelectors = Array.isArray(selectors) ? selectors : [];
    this._injectStyle([...this._defaultSelectors, ...this._customSelectors]);
  }

  _injectStyle(selectors) {
    const id = '__ads_guru_dom__';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = selectors.join(',\n') +
      ' { display: none !important; visibility: hidden !important; ' +
      'opacity: 0 !important; pointer-events: none !important; ' +
      'max-height: 0 !important; overflow: hidden !important; }';
  }

  startMutationObserver() {
    this._injectStyle(this._defaultSelectors);

    if (this._observer || typeof MutationObserver === 'undefined' || !document.documentElement) {
      return;
    }

    this._observer = new MutationObserver((mutations) => {
      const allSelectors = [...this._defaultSelectors, ...this._customSelectors];

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;

          for (const selector of allSelectors) {
            try {
              if (node.matches && node.matches(selector)) {
                node.style.cssText = 'display:none!important;visibility:hidden!important;';
                break;
              }
            } catch {
              // Ignore invalid selector edge cases.
            }
          }
        }
      }
    });

    this._observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  }
}

const log = new Logger('ContentScript');
const dom = new DomFilter();

// ---------------------------------------------------------------------------
// 1. Script blocking — intercept inline scripts before execution
// ---------------------------------------------------------------------------
(function installScriptBlocker() {
  const blocked = [
    /adsbygoogle/i,
    /googletag/i,
    /doubleclick/i,
    /adnxs\.com/i,
    /amazon-adsystem/i,
    /outbrain/i,
    /taboola/i,
    /criteo/i,
    /moatads/i,
    /scorecard.*research/i,
    /quantserve/i,
    /chartbeat/i,
  ];

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName === 'SCRIPT') {
          const src = node.src || node.textContent || '';
          for (const pattern of blocked) {
            if (pattern.test(src)) {
              node.remove();
              log.debug('Blocked script: ' + src.substring(0, 80));
              chrome.runtime.sendMessage({ type: 'REPORT_BLOCK' }).catch(() => {});
              break;
            }
          }
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList:  true,
    subtree:    true,
  });
})();

// ---------------------------------------------------------------------------
// 2. Cosmetic filter application
// ---------------------------------------------------------------------------
(async function applyCosmeticFilters() {
  try {
    const hostname = window.location.hostname;
    const response = await chrome.runtime.sendMessage({
      type: 'GET_COSMETIC_RULES',
      hostname,
    });
    if (response && response.selectors) {
      dom.applyHideRules(response.selectors);
    }
  } catch {
    // Service worker may not be ready on first paint; DOM filter handles fallback
  }
  dom.startMutationObserver();
})();

// ---------------------------------------------------------------------------
// 3. Anti-anti-adblock: neutralise common detection vectors
// ---------------------------------------------------------------------------
(function patchAdBlockDetection() {
  // Spoof bait elements that detector scripts probe
  const bait = document.createElement('div');
  bait.setAttribute('class', 'ad-banner ads adsbox advertisement');
  bait.setAttribute('id', 'ad_banner');
  bait.style.cssText = 'width:1px;height:1px;position:absolute;top:-9999px;left:-9999px;';
  document.documentElement.appendChild(bait);

  // Patch navigator to remove adblock signals
  try {
    Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' });
  } catch {}

  // Override AdSense initialiser to a no-op
  Object.defineProperty(window, 'adsbygoogle', {
    get: () => ({ push: () => {} }),
    set: () => {},
    configurable: true,
  });
  Object.defineProperty(window, 'googletag', {
    get: () => ({
      cmd: { push: (fn) => { try { fn(); } catch {} } },
      defineSlot: () => ({ addService: () => ({}) }),
      pubads: () => ({
        enableSingleRequest: () => {},
        refresh: () => {},
        setTargeting: () => {},
      }),
      enableServices: () => {},
      display: () => {},
    }),
    set: () => {},
    configurable: true,
  });
})();
