/**
 * filters/filter-parser.js
 * Parses Adblock Plus / uBlock Origin filter syntax into normalised rule objects.
 *
 * Supported syntax:
 *   - Basic URL patterns: ||example.com^, /ads/*$script
 *   - Exception rules:   @@||example.com^
 *   - Cosmetic filters:  example.com##.ad-class
 *   - Element hiding:    ##div[data-ad]
 *   - Comment/metadata:  ! Comment line, [Adblock Plus 2.0]
 *
 * Output format (ParsedRule):
 *   {
 *     id:              string,       // SHA-like deterministic ID
 *     type:            'block'|'allow'|'cosmetic'|'redirect',
 *     urlPattern:      string|null,
 *     domain:          string|null,
 *     domainAnchor:    boolean,
 *     resourceTypes:   string[],
 *     domains:         string[],
 *     excludedDomains: string[],
 *     selector:        string|null,  // cosmetic rules only
 *   }
 */
'use strict';

export class FilterParser {
  constructor() {
    this._idCounter = 0;
  }

  /**
   * Parse raw filter list text into an array of ParsedRule objects.
   * @param {string} raw
   * @returns {ParsedRule[]}
   */
  parse(raw) {
    const rules = [];
    const lines = raw.split('\n');

    for (const raw_line of lines) {
      const line = raw_line.trim();
      if (!line || line.startsWith('!') || line.startsWith('[')) continue;

      try {
        const rule = this._parseLine(line);
        if (rule) rules.push(rule);
      } catch {
        // Discard unparseable lines
      }
    }

    return rules;
  }

  _parseLine(line) {
    // Cosmetic filter: domain##selector
    if (line.includes('##') && !line.startsWith('@@')) {
      return this._parseCosmeticRule(line);
    }

    // Exception rule: @@...
    if (line.startsWith('@@')) {
      return this._parseNetworkRule(line.slice(2), 'allow');
    }

    // Snippet / script inject — skip (security boundary)
    if (line.includes('#%#') || line.includes('#@%#')) return null;

    return this._parseNetworkRule(line, 'block');
  }

  _parseNetworkRule(line, type) {
    const dollarIdx = line.lastIndexOf('$');
    let pattern  = line;
    let options  = '';

    if (dollarIdx !== -1 && !line.endsWith('$')) {
      pattern = line.slice(0, dollarIdx);
      options = line.slice(dollarIdx + 1);
    }

    if (!pattern || pattern.length < 4) return null;

    const rule = {
      id:              String(++this._idCounter),
      type,
      urlPattern:      pattern,
      domain:          null,
      domainAnchor:    false,
      resourceTypes:   [],
      domains:         [],
      excludedDomains: [],
      selector:        null,
    };

    // Domain anchor: ||example.com^
    if (pattern.startsWith('||')) {
      rule.domainAnchor = true;
      rule.domain       = pattern.slice(2).replace(/[\^\/].*/, '').toLowerCase();
      rule.urlPattern   = pattern;
    }

    // Parse options: $script,domain=example.com
    if (options) {
      for (const opt of options.split(',')) {
        const trimmed = opt.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('domain=')) {
          const domainStr = trimmed.slice(7);
          for (const d of domainStr.split('|')) {
            if (d.startsWith('~')) {
              rule.excludedDomains.push(d.slice(1));
            } else {
              rule.domains.push(d);
            }
          }
        } else {
          const rt = FilterParser.OPT_TO_RESOURCE_TYPE[trimmed];
          if (rt) rule.resourceTypes.push(rt);
        }
      }
    }

    return rule;
  }

  _parseCosmeticRule(line) {
    const sepIdx = line.indexOf('##');
    const domains  = line.slice(0, sepIdx).split(',').filter(Boolean);
    const selector = line.slice(sepIdx + 2).trim();

    if (!selector) return null;

    return {
      id:              String(++this._idCounter),
      type:            'cosmetic',
      urlPattern:      null,
      domain:          domains[0] || null,
      domainAnchor:    false,
      resourceTypes:   [],
      domains,
      excludedDomains: [],
      selector,
    };
  }

  static get OPT_TO_RESOURCE_TYPE() {
    return {
      'script':           'script',
      'image':            'image',
      'stylesheet':       'stylesheet',
      'object':           'object',
      'xmlhttprequest':   'xmlhttprequest',
      'xhr':              'xmlhttprequest',
      'subdocument':      'sub_frame',
      'document':         'main_frame',
      'ping':             'ping',
      'websocket':        'websocket',
      'media':            'media',
      'font':             'font',
      'other':            'other',
      'popup':            'main_frame',
      '~third-party':     null,
      'third-party':      null,
    };
  }
}
