/**
 * dsa/hash-map.js
 * Open-addressing hash map with linear probing and dynamic resizing.
 *
 * Guarantees O(1) amortised get/set/delete.
 * Resizes (doubles) when load factor > 0.7.
 * Resizes (halves) when load factor < 0.2 and capacity > initial.
 *
 * Used to index all filter rules by ID for O(1) retrieval after Trie/AC match.
 */
'use strict';

const EMPTY   = Symbol('empty');
const DELETED = Symbol('deleted');

export class HashMap {
  /**
   * @param {number} initialCapacity  Must be a power of 2
   */
  constructor(initialCapacity = 256) {
    this._cap     = this._nextPow2(initialCapacity);
    this._size    = 0;
    this._keys    = new Array(this._cap).fill(EMPTY);
    this._values  = new Array(this._cap);
  }

  /**
   * Store a key-value pair.
   * @param {string|number} key
   * @param {*} value
   */
  set(key, value) {
    if (this._size / this._cap > 0.7) this._resize(this._cap * 2);

    let idx = this._hash(key) & (this._cap - 1);
    while (this._keys[idx] !== EMPTY && this._keys[idx] !== DELETED && this._keys[idx] !== key) {
      idx = (idx + 1) & (this._cap - 1);
    }
    if (this._keys[idx] !== key) this._size++;
    this._keys[idx]   = key;
    this._values[idx] = value;
  }

  /**
   * Retrieve a value. Returns undefined if not found.
   * @param {string|number} key
   * @returns {*|undefined}
   */
  get(key) {
    let idx = this._hash(key) & (this._cap - 1);
    while (this._keys[idx] !== EMPTY) {
      if (this._keys[idx] === key) return this._values[idx];
      idx = (idx + 1) & (this._cap - 1);
    }
    return undefined;
  }

  /**
   * Check for key existence.
   * @param {string|number} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a key. Returns true if the key existed.
   * @param {string|number} key
   * @returns {boolean}
   */
  delete(key) {
    let idx = this._hash(key) & (this._cap - 1);
    while (this._keys[idx] !== EMPTY) {
      if (this._keys[idx] === key) {
        this._keys[idx] = DELETED;
        this._size--;
        if (this._cap > 256 && this._size / this._cap < 0.2) {
          this._resize(this._cap >>> 1);
        }
        return true;
      }
      idx = (idx + 1) & (this._cap - 1);
    }
    return false;
  }

  clear() {
    this._keys.fill(EMPTY);
    this._size = 0;
  }

  _hash(key) {
    if (typeof key === 'number') return key;
    // FNV-1a for strings
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h  = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  _resize(newCap) {
    const oldKeys   = this._keys;
    const oldValues = this._values;
    this._cap    = newCap;
    this._size   = 0;
    this._keys   = new Array(newCap).fill(EMPTY);
    this._values = new Array(newCap);
    for (let i = 0; i < oldKeys.length; i++) {
      const k = oldKeys[i];
      if (k !== EMPTY && k !== DELETED) this.set(k, oldValues[i]);
    }
  }

  _nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }

  get size()     { return this._size; }
  get capacity() { return this._cap; }
  get loadFactor() { return this._size / this._cap; }
}
