/**
 * tests/dsa.test.js
 * Unit tests for all DSA implementations.
 * Run: node --input-type=module < tests/dsa.test.js
 */
import { describe, it, assert, assertEquals, benchmark } from './test-runner.js';
import { Trie }        from '../dsa/trie.js';
import { AhoCorasick } from '../dsa/aho-corasick.js';
import { BloomFilter } from '../dsa/bloom-filter.js';
import { LRUCache }    from '../dsa/lru-cache.js';
import { HashMap }     from '../dsa/hash-map.js';

// ---------------------------------------------------------------------------
describe('Trie', () => {
  it('inserts and searches exact key', () => {
    const t = new Trie();
    t.insert('ads.example.com', 42);
    assertEquals(t.search('ads.example.com'), 42);
  });

  it('returns null for missing key', () => {
    const t = new Trie();
    t.insert('ads.example.com', 1);
    assertEquals(t.search('safe.example.com'), null);
  });

  it('longestPrefixMatch returns deepest matching prefix', () => {
    const t = new Trie();
    t.insert('doubleclick', 1);
    t.insert('doubleclick.net', 2);
    assertEquals(t.longestPrefixMatch('doubleclick.net/ads/'), 2);
  });

  it('handles large insertions', () => {
    const t = new Trie();
    for (let i = 0; i < 10000; i++) t.insert('domain' + i + '.com', i);
    assertEquals(t.size, 10000);
    assertEquals(t.search('domain9999.com'), 9999);
  });

  it('serialize/deserialize roundtrip', () => {
    const t = new Trie();
    t.insert('test.com', 99);
    const t2 = Trie.deserialize(t.serialize());
    assertEquals(t2.search('test.com'), 99);
  });
});

// ---------------------------------------------------------------------------
describe('AhoCorasick', () => {
  it('finds single pattern in text', () => {
    const ac = new AhoCorasick();
    ac.build(['googletag', 'adnxs']);
    const r = ac.search('loading googletag.js');
    assert(r.length > 0, 'should match googletag');
    assertEquals(r[0].pattern, 'googletag');
  });

  it('finds multiple overlapping patterns', () => {
    const ac = new AhoCorasick();
    ac.build(['ad', 'ads', 'adserver']);
    const r = ac.search('adserver.example.com');
    assert(r.length >= 3, 'should match ad, ads, adserver');
  });

  it('returns empty array for no matches', () => {
    const ac = new AhoCorasick();
    ac.build(['doubleclick', 'taboola']);
    const r = ac.search('cdn.safe-content.org/image.png');
    assertEquals(r.length, 0);
  });

  it('handles empty patterns array', () => {
    const ac = new AhoCorasick();
    ac.build([]);
    const r = ac.search('anything');
    assertEquals(r.length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('BloomFilter', () => {
  it('reports possible membership after add', () => {
    const bf = new BloomFilter(1 << 16, 7);
    bf.add('doubleclick.net');
    assert(bf.mayContain('doubleclick.net'), 'should contain');
  });

  it('never produces false negatives', () => {
    const bf = new BloomFilter(1 << 18, 7);
    const items = Array.from({ length: 1000 }, (_, i) => 'adserver' + i + '.com');
    for (const item of items) bf.add(item);
    for (const item of items) {
      assert(bf.mayContain(item), 'false negative for ' + item);
    }
  });

  it('serialize/deserialize roundtrip', () => {
    const bf = new BloomFilter(1 << 16, 7);
    bf.add('test-domain.net');
    const bf2 = BloomFilter.deserialize(bf.serialize(), 1 << 16, 7);
    assert(bf2.mayContain('test-domain.net'));
  });

  it('FPR increases with more items', () => {
    const bf = new BloomFilter(1 << 14, 7);
    for (let i = 0; i < 5000; i++) bf.add('item' + i);
    assert(bf.falsePositiveRate > 0);
  });
});

// ---------------------------------------------------------------------------
describe('LRUCache', () => {
  it('get returns null on miss', () => {
    const c = new LRUCache(10);
    assertEquals(c.get('missing'), null);
  });

  it('stores and retrieves values', () => {
    const c = new LRUCache(10);
    c.set('key1', { blocked: true });
    assertEquals(c.get('key1').blocked, true);
  });

  it('evicts LRU item when at capacity', () => {
    const c = new LRUCache(3);
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    c.set('d', 4); // should evict 'a'
    assertEquals(c.get('a'), null);
    assertEquals(c.get('d'), 4);
  });

  it('moves accessed item to MRU', () => {
    const c = new LRUCache(3);
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    c.get('a');    // access 'a' → promote to MRU
    c.set('d', 4); // should evict 'b' (now LRU), not 'a'
    assertEquals(c.get('a'), 1);
    assertEquals(c.get('b'), null);
  });
});

// ---------------------------------------------------------------------------
describe('HashMap', () => {
  it('set/get round trip', () => {
    const m = new HashMap(16);
    m.set('rule_1', { type: 'block' });
    assertEquals(m.get('rule_1').type, 'block');
  });

  it('has returns correct membership', () => {
    const m = new HashMap(16);
    m.set(42, 'hello');
    assert(m.has(42));
    assert(!m.has(99));
  });

  it('delete removes key', () => {
    const m = new HashMap(16);
    m.set('x', 1);
    m.delete('x');
    assertEquals(m.get('x'), undefined);
    assertEquals(m.size, 0);
  });

  it('handles 100k insertions with correct retrieval', () => {
    const m = new HashMap(256);
    for (let i = 0; i < 100000; i++) m.set('key' + i, i);
    assertEquals(m.get('key99999'), 99999);
    assertEquals(m.get('key0'), 0);
    assertEquals(m.size, 100000);
  });
});

// ---------------------------------------------------------------------------
describe('Performance Benchmarks', () => {
  it('Trie: 100K lookups', () => {
    const t = new Trie();
    for (let i = 0; i < 1000; i++) t.insert('domain' + i + '.com', i);
    const result = benchmark('Trie.search', (i) => t.search('domain' + (i % 1000) + '.com'));
    assert(result.opsPerSec > 500000, 'Trie should exceed 500K ops/sec');
  });

  it('BloomFilter: 1M lookups', () => {
    const bf = new BloomFilter(1 << 20, 7);
    for (let i = 0; i < 50000; i++) bf.add('pattern' + i);
    const result = benchmark('BloomFilter.mayContain', (i) => bf.mayContain('pattern' + (i % 50000)), 100000);
    assert(result.opsPerSec > 400000, 'BloomFilter should exceed 400K ops/sec');
  });

  it('LRUCache: 500K get/set', () => {
    const c = new LRUCache(512);
    const result = benchmark('LRUCache.set+get', (i) => { c.set('k' + (i % 512), i); c.get('k' + (i % 512)); }, 50000);
    assert(result.opsPerSec > 500000, 'LRUCache should exceed 500K ops/sec');
  });

  it('HashMap: 1M get operations', () => {
    const m = new HashMap(65536);
    for (let i = 0; i < 10000; i++) m.set('r' + i, i);
    const result = benchmark('HashMap.get', (i) => m.get('r' + (i % 10000)), 100000);
    assert(result.opsPerSec > 2000000, 'HashMap should exceed 2M ops/sec');
  });
});
