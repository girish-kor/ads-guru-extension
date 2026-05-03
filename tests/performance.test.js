/**
 * tests/performance.test.js
 * End-to-end performance benchmark: filter engine build + URL evaluation.
 */
import { performance } from 'perf_hooks';
import { describe, it, assert } from './test-runner.js';
import { AhoCorasick }  from '../dsa/aho-corasick.js';
import { BloomFilter }  from '../dsa/bloom-filter.js';
import { Trie }         from '../dsa/trie.js';
import { FilterParser } from '../filters/filter-parser.js';
import { RuleEngine }   from '../background/rule-engine.js';

// Generate synthetic rules (simulates real EasyList volume)
function generateSyntheticRules(count) {
  const domains = [
    'doubleclick.net','googlesyndication.com','adnxs.com',
    'moatads.com','scorecardresearch.com','criteo.com',
    'outbrain.com','taboola.com','amazon-adsystem.com',
    'ads.twitter.com','facebook.com/tr','linkedin.com/px',
  ];
  let raw = '';
  for (let i = 0; i < count; i++) {
    const d = domains[i % domains.length];
    raw += '||' + 'sub' + i + '.' + d + '^\n';
  }
  return raw;
}

describe('Filter Pipeline Performance', () => {
  const parser   = new FilterParser();
  const engine   = new RuleEngine(1000, 30000);

  it('parses 10K rules in < 1s', () => {
    const raw = generateSyntheticRules(10000);
    const t0  = performance.now();
    const res = parser.parse(raw);
    const ms  = performance.now() - t0;
    assert(ms < 1000, 'Parse took ' + ms.toFixed(1) + 'ms (limit: 1000ms)');
    console.log('  → Parsed ' + res.length + ' rules in ' + ms.toFixed(1) + 'ms');
  });

  it('compiles 10K rules to DNR in < 2s', () => {
    const raw    = generateSyntheticRules(10000);
    const parsed = parser.parse(raw);
    const t0     = performance.now();
    const dnr    = engine.compileToDNR(parsed);
    const ms     = performance.now() - t0;
    assert(ms < 2000, 'Compile took ' + ms.toFixed(1) + 'ms (limit: 2000ms)');
    console.log('  → Compiled ' + dnr.length + ' DNR rules in ' + ms.toFixed(1) + 'ms');
  });

  it('BloomFilter: 100K inserts in < 300ms', () => {
    const bf = new BloomFilter(1 << 20, 7);
    const t0 = performance.now();
    for (let i = 0; i < 100000; i++) bf.add('adserver' + i + '.com');
    const ms = performance.now() - t0;
    assert(ms < 300, 'BloomFilter inserts took ' + ms.toFixed(1) + 'ms (limit: 300ms)');
    console.log('  → 100K BloomFilter inserts in ' + ms.toFixed(1) + 'ms');
  });

  it('AhoCorasick: build 5K patterns + search 10K URLs in < 3s', () => {
    const ac       = new AhoCorasick();
    const patterns = Array.from({ length: 5000 }, (_, i) => 'adpat' + i);
    ac.build(patterns);

    const urls = Array.from({ length: 10000 }, (_, i) =>
      'https://cdn' + (i % 100) + '.example.com/adpat' + (i % 5000) + '/track.js'
    );

    const t0 = performance.now();
    let totalMatches = 0;
    for (const url of urls) totalMatches += ac.search(url).length;
    const ms = performance.now() - t0;

    assert(ms < 3000, 'AC search took ' + ms.toFixed(1) + 'ms (limit: 3000ms)');
    console.log('  → 10K AC searches (' + totalMatches + ' matches) in ' + ms.toFixed(1) + 'ms');
  });

  it('Trie: build 50K entries + 100K lookups in < 500ms', () => {
    const t = new Trie();
    for (let i = 0; i < 50000; i++) t.insert('domain' + i + '.com', i);

    const t0 = performance.now();
    for (let i = 0; i < 100000; i++) t.search('domain' + (i % 50000) + '.com');
    const ms = performance.now() - t0;

    assert(ms < 500, 'Trie lookups took ' + ms.toFixed(1) + 'ms (limit: 500ms)');
    console.log('  → 100K Trie lookups in ' + ms.toFixed(1) + 'ms');
  });
});
