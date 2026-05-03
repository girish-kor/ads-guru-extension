/**
 * background/rule-engine.js
 * Compiles parsed filter rules into Chrome declarativeNetRequest (DNR) format.
 *
 * Rule priority scheme:
 *   1  — allowlist (exception) rules  (highest)
 *   10 — block rules
 *   20 — redirect rules
 *   30 — modifyHeaders rules
 */
'use strict';

export class RuleEngine {
  /**
   * @param {number} idStart   First rule ID to assign (avoid static rule collisions)
   * @param {number} maxRules  Chrome's per-extension dynamic rule cap
   */
  constructor(idStart, maxRules) {
    this._idStart  = idStart;
    this._maxRules = maxRules;
    this._idCursor = idStart;
  }

  /**
   * Compile an array of parsed filter objects into DNR rules.
   * @param {ParsedRule[]} parsedRules
   * @returns {chrome.declarativeNetRequest.Rule[]}
   */
  compileToDNR(parsedRules) {
    const dnrRules = [];

    for (const rule of parsedRules) {
      if (this._idCursor - this._idStart >= this._maxRules) {
        console.warn('[RuleEngine] Max rule cap reached, truncating at', this._maxRules);
        break;
      }

      const compiled = this._compileOne(rule);
      if (compiled) {
        compiled.id = this._idCursor++;
        dnrRules.push(compiled);
      }
    }

    return dnrRules;
  }

  _compileOne(rule) {
    try {
      if (rule.type === 'block') return this._buildBlockRule(rule);
      if (rule.type === 'allow') return this._buildAllowRule(rule);
      if (rule.type === 'redirect') return this._buildRedirectRule(rule);
      return null;
    } catch {
      return null; // discard malformed rules silently
    }
  }

  _buildBlockRule(rule) {
    return {
      priority: 10,
      action: { type: 'block' },
      condition: this._buildCondition(rule),
    };
  }

  _buildAllowRule(rule) {
    return {
      priority: 1,
      action: { type: 'allow' },
      condition: this._buildCondition(rule),
    };
  }

  _buildRedirectRule(rule) {
    return {
      priority: 20,
      action: {
        type: 'redirect',
        redirect: { url: 'data:text/plain,' },
      },
      condition: this._buildCondition(rule),
    };
  }

  _buildCondition(rule) {
    const condition = {};

    // URL filter
    if (rule.urlPattern) {
      condition.urlFilter = this._sanitizePattern(rule.urlPattern);
    }

    // Resource types
    if (rule.resourceTypes && rule.resourceTypes.length > 0) {
      condition.resourceTypes = rule.resourceTypes.filter(
        (t) => RuleEngine.VALID_RESOURCE_TYPES.has(t)
      );
    }

    // Domain restrictions
    if (rule.domains && rule.domains.length > 0) {
      condition.initiatorDomains = rule.domains;
    }
    if (rule.excludedDomains && rule.excludedDomains.length > 0) {
      condition.excludedInitiatorDomains = rule.excludedDomains;
    }

    // isUrlFilterCaseSensitive defaults to false (good for ad patterns)
    condition.isUrlFilterCaseSensitive = false;

    return condition;
  }

  /** Convert Adblock Plus filter syntax to DNR urlFilter syntax */
  _sanitizePattern(pattern) {
    // DNR uses | for start/end anchors, || for domain anchors, * for wildcard
    // ABP uses the same syntax, but we strip unsupported regex characters
    return pattern
      .replace(/\^/g, '|')        // ^ separator → | in DNR
      .replace(/\$/g, '')          // strip option markers already parsed
      .replace(/[()[\]{}+?\\]/g, '') // strip unsupported regex chars
      .substring(0, 2048);          // DNR urlFilter max length
  }

  static get VALID_RESOURCE_TYPES() {
    return new Set([
      'main_frame', 'sub_frame', 'stylesheet', 'script',
      'image', 'font', 'object', 'xmlhttprequest', 'ping',
      'csp_report', 'media', 'websocket', 'webtransport',
      'webbundle', 'other',
    ]);
  }
}
