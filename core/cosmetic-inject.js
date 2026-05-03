/*
 * core/cosmetic-inject.js
 * Plain-page cosmetic rule injector for MV3 page-context execution.
 *
 * This file intentionally avoids ES module syntax so it can be injected as a
 * classic script when needed.
 */
'use strict';

(function () {
  const STYLE_ID = '__ads_guru_cosmetic__';

  function applySelectors(selectors) {
    if (!Array.isArray(selectors) || selectors.length === 0) return;

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = selectors.join(', ') +
      ' { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }';
  }

  window.__adsGuruApplyCosmeticRules = applySelectors;
})();
