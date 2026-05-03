/**
 * dsa/bloom-filter.js
 * Space-efficient probabilistic data structure for fast URL pre-filtering.
 *
 * False positive rate: (1 - e^(-kn/m))^k
 *   k = hash functions, n = inserted elements, m = bit array size
 *
 * At k=7, m=1M bits, n=100K items: FPR ≈ 0.8%  (acceptable; confirmed by Trie/AC)
 *
 * No false negatives — if mayContain() returns false, the URL is guaranteed
 * to not match any filter rule. This eliminates expensive downstream checks.
 */
'use strict';

export class BloomFilter {
  /**
   * @param {number} bits        Bit-array size (powers of 2 for fast modulo)
   * @param {number} hashCount   Number of independent hash functions
   */
  constructor(bits = 1 << 20, hashCount = 7) {
    this._m     = bits;
    this._k     = hashCount;
    this._bits  = new Uint8Array(Math.ceil(bits / 8));
    this._count = 0;
  }

  /**
   * Insert an element.
   * @param {string} item
   */
  add(item) {
    for (let i = 0; i < this._k; i++) {
      const pos = this._hash(item, i);
      this._bits[pos >>> 3] |= (1 << (pos & 7));
    }
    this._count++;
  }

  /**
   * Check membership. Returns false → definitely not present.
   * Returns true → probably present (verify with exact structure).
   * @param {string} item
   * @returns {boolean}
   */
  mayContain(item) {
    for (let i = 0; i < this._k; i++) {
      const pos = this._hash(item, i);
      if ((this._bits[pos >>> 3] & (1 << (pos & 7))) === 0) return false;
    }
    return true;
  }

  /**
   * FNV-1a hash with seed mixing for independent hash functions.
   * @param {string} str
   * @param {number} seed
   * @returns {number} position in [0, m)
   */
  _hash(str, seed) {
    let h = 2166136261 ^ (seed * 16777619);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h  = (h * 16777619) >>> 0; // force 32-bit unsigned
    }
    return h % this._m;
  }

  /**
   * Estimated false positive rate given current load.
   */
  get falsePositiveRate() {
    const exponent = -this._k * this._count / this._m;
    return Math.pow(1 - Math.exp(exponent), this._k);
  }

  get itemCount()  { return this._count; }
  get bitCount()   { return this._m; }

  /** Serialize to base64 for chrome.storage persistence. */
  serialize() {
    return btoa(String.fromCharCode(...this._bits));
  }

  static deserialize(b64, bits, hashCount) {
    const bf   = new BloomFilter(bits, hashCount);
    const raw  = atob(b64);
    for (let i = 0; i < raw.length; i++) {
      bf._bits[i] = raw.charCodeAt(i);
    }
    return bf;
  }
}
