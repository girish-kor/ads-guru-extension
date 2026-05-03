/**
 * core/filter-engine.js
 * Central orchestrator integrating all DSA structures for request evaluation.
 *
 * Evaluation pipeline for a given URL:
 *   1. BloomFilter  — O(k) probabilistic pre-check (no false negatives)
 *   2. Trie         — O(m) exact domain / prefix matching
 *   3. AhoCorasick  — O(n + m) multi-pattern substring matching
 *   4. HashMap      — O(1) rule index lookup for full rule retrieval
 *   5. LRUCache     — O(1) memoisation of recent (url → verdict) pairs
 *
 * Returns: { blocked: boolean, rule: RuleObject|null, matchedBy: string }
 */
'use strict';

import { Trie }         from '../dsa/trie.js';
import { AhoCorasick }  from '../dsa/aho-corasick.js';
import { BloomFilter }  from '../dsa/bloom-filter.js';
import { LRUCache }     from '../dsa/lru-cache.js';
import { HashMap }      from '../dsa/hash-map.js';
import { Logger }       from '../util/logger.js';

const log = new Logger('FilterEngine');

export class FilterEngine {
  /**
   * @param {object} opts
   * @param {number} opts.bloomBits        Bloom filter bit-array size
   * @param {number} opts.bloomHashCount   Number of independent hash functions
   * @param {number} opts.lruCapacity      LRU cache size for verdict memoisation
   */
  constructor({
    bloomBits      = 1 << 20,  // 1 M bits ≈ 128 KB
    bloomHashCount = 7,
    lruCapacity    = 2048,
  } = {}) {
    this._bloom    = new BloomFilter(bloomBits, bloomHashCount);
    this._trie     = new Trie();
    this._ac       = new AhoCorasick();
    this._index    = new HashMap(65536);
    this._cache    = new LRUCache(lruCapacity);
    this._ready    = false;
  }

  // --------------------------------------------------------------------------
  // Build the engine from parsed rules
  // --------------------------------------------------------------------------
  async build(parsedRules) {
    log.info('Building filter engine with ' + parsedRules.length + ' rules…');
    const t0 = performance.now();

    const patterns = [];

    for (const rule of parsedRules) {
      const key = rule.urlPattern || rule.domain || '';
      if (!key) continue;

      // Bloom filter — insert normalised pattern
      this._bloom.add(key.toLowerCase());

      // Trie — insert domain-anchor rules
      if (rule.domainAnchor && rule.domain) {
        this._trie.insert(rule.domain.toLowerCase(), rule.id);
      }

      // Aho-Corasick — collect all patterns for batch build
      patterns.push({ pattern: key, id: rule.id });

      // HashMap — rule store
      this._index.set(rule.id, rule);
    }

    // Build Aho-Corasick automaton after inserting all patterns
    this._ac.build(patterns.map((p) => p.pattern));

    this._ready = true;
    const elapsed = (performance.now() - t0).toFixed(1);
    log.info('Filter engine built in ' + elapsed + ' ms.');
  }

  // --------------------------------------------------------------------------
  // Evaluate a URL
  // --------------------------------------------------------------------------
  evaluate(url) {
    if (!this._ready) return { blocked: false, rule: null, matchedBy: 'not-ready' };

    const normalised = url.toLowerCase().replace(/^https?:\/\//, '');

    // L1: LRU Cache
    const cached = this._cache.get(normalised);
    if (cached !== null) {
      return cached;
    }

    // L2: Bloom Filter — fast reject
    if (!this._bloom.mayContain(normalised)) {
      const verdict = { blocked: false, rule: null, matchedBy: 'bloom-miss' };
      this._cache.set(normalised, verdict);
      return verdict;
    }

    // L3: Trie — domain/prefix matching
    const hostname = this._extractHostname(normalised);
    const trieMatch = this._trie.longestPrefixMatch(hostname);
    if (trieMatch !== null) {
      const rule = this._index.get(trieMatch);
      const verdict = { blocked: rule.type === 'block', rule, matchedBy: 'trie' };
      this._cache.set(normalised, verdict);
      return verdict;
    }

    // L4: Aho-Corasick — substring pattern matching
    const acMatches = this._ac.search(normalised);
    if (acMatches.length > 0) {
      // Use first match (patterns are ordered by priority during build)
      const verdict = { blocked: true, rule: null, matchedBy: 'aho-corasick', patterns: acMatches };
      this._cache.set(normalised, verdict);
      return verdict;
    }

    // No match
    const miss = { blocked: false, rule: null, matchedBy: 'no-match' };
    this._cache.set(normalised, miss);
    return miss;
  }

  _extractHostname(url) {
    try {
      return new URL('https://' + url).hostname;
    } catch {
      return url.split('/')[0];
    }
  }

  get isReady() { return this._ready; }
}
