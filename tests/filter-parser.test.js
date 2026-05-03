/**
 * tests/filter-parser.test.js
 * Validates EasyList / ABP / uBO filter rule parsing correctness.
 */
import { describe, it, assert, assertEquals } from './test-runner.js';
import { FilterParser } from '../filters/filter-parser.js';

const SAMPLE_RULES = `
! EasyList sample — comment line
[Adblock Plus 2.0]
||doubleclick.net^
||googlesyndication.com^$script,image
@@||safe-ads.example.com^
example.com##.ad-banner
##div[data-ad-slot]
||taboola.com^$third-party
||moatads.com^$script,xmlhttprequest
/ads/*$image
`.trim();

describe('FilterParser', () => {
  const parser = new FilterParser();
  const rules  = parser.parse(SAMPLE_RULES);

  it('skips comment and metadata lines', () => {
    assert(!rules.some((r) => r.urlPattern && r.urlPattern.startsWith('!')));
    assert(!rules.some((r) => r.urlPattern && r.urlPattern.startsWith('[')));
  });

  it('parses block rule for ||doubleclick.net^', () => {
    const rule = rules.find((r) => r.domain === 'doubleclick.net');
    assert(rule, 'rule should exist');
    assertEquals(rule.type, 'block');
    assertEquals(rule.domainAnchor, true);
  });

  it('parses exception rule (@@) as allow type', () => {
    const rule = rules.find((r) => r.type === 'allow');
    assert(rule, 'allow rule should exist');
    assert(rule.urlPattern.includes('safe-ads'));
  });

  it('parses resource type options', () => {
    const rule = rules.find((r) => r.domain === 'googlesyndication.com');
    assert(rule);
    assert(rule.resourceTypes.includes('script'), 'script type');
    assert(rule.resourceTypes.includes('image'),  'image type');
  });

  it('parses cosmetic rule with domain', () => {
    const rule = rules.find((r) => r.type === 'cosmetic' && r.domain === 'example.com');
    assert(rule, 'cosmetic rule should exist');
    assertEquals(rule.selector, '.ad-banner');
  });

  it('parses global cosmetic rule (no domain)', () => {
    const rule = rules.find((r) => r.type === 'cosmetic' && !r.domain);
    assert(rule, 'global cosmetic rule should exist');
    assertEquals(rule.selector, 'div[data-ad-slot]');
  });

  it('handles 50K line synthetic list', () => {
    let synthetic = '';
    for (let i = 0; i < 50000; i++) {
      synthetic += '||adserver' + i + '.com^\n';
    }
    const t0  = Date.now();
    const res = parser.parse(synthetic);
    const ms  = Date.now() - t0;
    assertEquals(res.length, 50000);
    assert(ms < 3000, 'parsing 50K rules should complete in < 3s, took ' + ms + 'ms');
  });
});
