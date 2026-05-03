/**
 * tests/browsing-simulation.test.js
 * Simulates real-world browsing URL evaluation with known ad/safe URL lists.
 */
import { describe, it, assert, assertEquals } from './test-runner.js';
import { BloomFilter } from '../dsa/bloom-filter.js';
import { Trie }        from '../dsa/trie.js';
import { AhoCorasick } from '../dsa/aho-corasick.js';

// Known ad-serving domains (should be blocked)
const AD_URLS = [
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://www.googletagmanager.com/gtag/js?id=UA-1234',
  'https://doubleclick.net/ddm/clk/123;abc',
  'https://cdn.adnxs.com/pb/prebid.js',
  'https://secure.adnxs.com/ttj?id=123',
  'https://a.moatads.com/adserver/track',
  'https://sb.scorecardresearch.com/beacon.js',
  'https://s.taboola.com/images/nextarticle-v2.js',
  'https://cdn.criteo.com/js/criteo.js',
  'https://widgets.outbrain.com/outbrain.js',
];

// Known safe URLs (should NOT be blocked)
const SAFE_URLS = [
  'https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js',
  'https://fonts.googleapis.com/css2?family=Inter',
  'https://www.gstatic.com/firebasejs/9.0.0/firebase-app.js',
  'https://storage.googleapis.com/public-assets/logo.png',
  'https://api.github.com/repos/user/repo',
  'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js',
];

// Known ad patterns from EasyList
const AD_PATTERNS = [
  'googlesyndication',
  'doubleclick',
  'adnxs',
  'moatads',
  'scorecardresearch',
  'taboola',
  'criteo',
  'outbrain',
  'adsbygoogle',
  'googletagmanager',
];

describe('Browsing Simulation — URL Classification', () => {
  const bf = new BloomFilter(1 << 18, 7);
  const t  = new Trie();
  const ac = new AhoCorasick();

  // Populate structures
  for (const p of AD_PATTERNS) {
    bf.add(p);
    t.insert(p, true);
  }
  ac.build(AD_PATTERNS);

  it('BloomFilter correctly identifies all known ad URLs', () => {
    let hits = 0;
    for (const url of AD_URLS) {
      const normalised = url.toLowerCase().replace(/^https?:\/\//, '');
      // At least one pattern should trigger bloom
      const hit = AD_PATTERNS.some((p) => bf.mayContain(p) && normalised.includes(p));
      if (hit) hits++;
    }
    assert(hits === AD_URLS.length, 'All ' + AD_URLS.length + ' ad URLs should trigger bloom, got ' + hits);
  });

  it('AhoCorasick matches all known ad URL patterns', () => {
    for (const url of AD_URLS) {
      const normalised = url.toLowerCase();
      const matches    = ac.search(normalised);
      assert(matches.length > 0, 'AC should match ad URL: ' + url);
    }
  });

  it('AhoCorasick does not match safe URLs', () => {
    for (const url of SAFE_URLS) {
      const normalised = url.toLowerCase();
      const matches    = ac.search(normalised);
      assertEquals(matches.length, 0, 'AC should NOT match safe URL: ' + url);
    }
  });

  it('Trie correctly resolves domain-anchored ad patterns', () => {
    const adDomains  = ['doubleclick', 'adnxs', 'scorecardresearch'];
    for (const d of adDomains) {
      t.insert(d, true);
      const match = t.longestPrefixMatch(d + '.net/path');
      assert(match !== null, 'Trie should match: ' + d);
    }
  });

  it('Produces < 2% false positives on safe URLs', () => {
    let fp = 0;
    for (const url of SAFE_URLS) {
      const normalised = url.toLowerCase().replace(/^https?:\/\//, '');
      const acMatches  = ac.search(normalised);
      if (acMatches.length > 0) fp++;
    }
    const fpr = fp / SAFE_URLS.length;
    assert(fpr < 0.02, 'FPR on safe URLs: ' + (fpr * 100).toFixed(1) + '% (limit: 2%)');
    console.log('  → FPR on safe URLs: ' + (fpr * 100).toFixed(1) + '%');
  });
});
