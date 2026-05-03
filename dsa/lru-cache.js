/**
 * dsa/lru-cache.js
 * O(1) get/set LRU Cache using a doubly-linked list + HashMap.
 *
 * Used to memoize recent (URL → verdict) evaluations in FilterEngine,
 * and to cache recently-seen DOM nodes in DomFilter.
 */
'use strict';

class DLLNode {
  constructor(key, value) {
    this.key   = key;
    this.value = value;
    this.prev  = null;
    this.next  = null;
  }
}

export class LRUCache {
  /**
   * @param {number} capacity  Maximum number of entries
   */
  constructor(capacity) {
    if (capacity < 1) throw new RangeError('LRUCache capacity must be >= 1');
    this._cap  = capacity;
    this._map  = new Map();
    // Sentinel nodes (head=MRU end, tail=LRU end)
    this._head = new DLLNode(null, null);
    this._tail = new DLLNode(null, null);
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._hits   = 0;
    this._misses = 0;
  }

  /**
   * Retrieve a value by key. Returns null on miss.
   * @param {*} key
   * @returns {*|null}
   */
  get(key) {
    const node = this._map.get(key);
    if (!node) { this._misses++; return null; }
    this._hits++;
    this._moveToFront(node);
    return node.value;
  }

  /**
   * Insert or update a key-value pair.
   * @param {*} key
   * @param {*} value
   */
  set(key, value) {
    const existing = this._map.get(key);
    if (existing) {
      existing.value = value;
      this._moveToFront(existing);
      return;
    }

    const node = new DLLNode(key, value);
    this._map.set(key, node);
    this._addToFront(node);

    if (this._map.size > this._cap) {
      const lru = this._tail.prev;
      this._removeNode(lru);
      this._map.delete(lru.key);
    }
  }

  /** Remove a key from the cache. */
  delete(key) {
    const node = this._map.get(key);
    if (!node) return false;
    this._removeNode(node);
    this._map.delete(key);
    return true;
  }

  /** Remove all entries. */
  clear() {
    this._map.clear();
    this._head.next = this._tail;
    this._tail.prev = this._head;
  }

  _addToFront(node) {
    node.prev        = this._head;
    node.next        = this._head.next;
    this._head.next.prev = node;
    this._head.next  = node;
  }

  _removeNode(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  _moveToFront(node) {
    this._removeNode(node);
    this._addToFront(node);
  }

  get size()      { return this._map.size; }
  get capacity()  { return this._cap; }
  get hitRate()   {
    const total = this._hits + this._misses;
    return total === 0 ? 0 : this._hits / total;
  }
}
