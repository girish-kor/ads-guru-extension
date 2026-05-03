/**
 * content/dom-filter.js
 * High-performance DOM mutation observer for cosmetic ad element removal.
 *
 * Uses:
 *  - CSS class/id/attribute pattern matching
 *  - MutationObserver with batched processing (rAF / IdleCallback fallback)
 *  - LRU cache to avoid re-processing unchanged subtrees
 */
'use strict';

import { LRUCache } from '../dsa/lru-cache.js';

export class DomFilter {
  constructor() {
    // Generic ad selectors — applied universally (cosmetic defaults)
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
    this._processedCache = new LRUCache(512);
    this._observer = null;
    this._pendingNodes = [];
    this._raf = null;
  }

  // --------------------------------------------------------------------------
  // Apply hide rules — inject a <style> tag
  // --------------------------------------------------------------------------
  applyHideRules(selectors) {
    this._customSelectors = selectors;
    this._injectStyle([...this._defaultSelectors, ...selectors]);
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

  // --------------------------------------------------------------------------
  // MutationObserver — batched via requestIdleCallback / rAF
  // --------------------------------------------------------------------------
  startMutationObserver() {
    // Inject defaults immediately
    this._injectStyle(this._defaultSelectors);

    this._observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this._pendingNodes.push(node);
          }
        }
      }
      this._scheduleFlush();
    });

    this._observer.observe(document.documentElement, {
      childList:  true,
      subtree:    true,
      attributes: false,
    });
  }

  _scheduleFlush() {
    if (this._raf) return;
    const flush = () => {
      this._raf = null;
      this._flushPending();
    };
    if (typeof requestIdleCallback !== 'undefined') {
      this._raf = requestIdleCallback(flush, { timeout: 100 });
    } else {
      this._raf = requestAnimationFrame(flush);
    }
  }

  _flushPending() {
    if (this._pendingNodes.length === 0) return;
    const nodes = this._pendingNodes.splice(0);
    const allSelectors = [...this._defaultSelectors, ...this._customSelectors];

    for (const node of nodes) {
      // Skip already-processed nodes
      const key = node.id || node.className || node.tagName;
      if (this._processedCache.get(key)) continue;
      this._processedCache.set(key, true);

      // Re-inject style to catch dynamically added containers
      for (const selector of allSelectors) {
        try {
          if (node.matches && node.matches(selector)) {
            node.style.cssText = 'display:none!important;visibility:hidden!important;';
          }
        } catch {}
      }
    }
  }

  stopMutationObserver() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }
}
