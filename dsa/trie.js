/**
 * dsa/trie.js
 * Compressed Trie for domain-anchor URL prefix matching.
 *
 * Complexity:
 *   insert:             O(m)  — m = key length
 *   longestPrefixMatch: O(m)
 *   Space:              O(n * Σ) — n = keys, Σ = alphabet
 *
 * Stored values: rule IDs (for lookup in HashMap)
 */
'use strict';

class TrieNode {
  constructor() {
    this.children = Object.create(null); // avoid prototype pollution
    this.value    = null;  // rule ID at terminal node
    this.isEnd    = false;
  }
}

export class Trie {
  constructor() {
    this._root = new TrieNode();
    this._size = 0;
  }

  /**
   * Insert a key with an associated value.
   * @param {string} key
   * @param {*} value
   */
  insert(key, value) {
    let node = this._root;
    for (let i = 0; i < key.length; i++) {
      const ch = key[i];
      if (!node.children[ch]) {
        node.children[ch] = new TrieNode();
      }
      node = node.children[ch];
    }
    if (!node.isEnd) this._size++;
    node.isEnd = true;
    node.value = value;
  }

  /**
   * Exact match lookup.
   * @param {string} key
   * @returns {*|null}
   */
  search(key) {
    const node = this._traverse(key);
    return (node && node.isEnd) ? node.value : null;
  }

  /**
   * Find the longest key that is a prefix of the given string.
   * Used for domain-anchor matching: "ad.example.com" matches "ad.example.com".
   * @param {string} str
   * @returns {*|null}
   */
  longestPrefixMatch(str) {
    let node   = this._root;
    let last   = null;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (!node.children[ch]) break;
      node = node.children[ch];
      if (node.isEnd) last = node.value;
    }

    return last;
  }

  /**
   * Returns true if any stored key is a prefix of str.
   */
  hasPrefix(str) {
    return this.longestPrefixMatch(str) !== null;
  }

  _traverse(key) {
    let node = this._root;
    for (let i = 0; i < key.length; i++) {
      const ch = key[i];
      if (!node.children[ch]) return null;
      node = node.children[ch];
    }
    return node;
  }

  get size() { return this._size; }

  /** Serialize the trie to a plain object (for storage). */
  serialize() {
    return JSON.stringify(this._serializeNode(this._root));
  }

  _serializeNode(node) {
    const out = { e: node.isEnd, v: node.value, c: {} };
    for (const [ch, child] of Object.entries(node.children)) {
      out.c[ch] = this._serializeNode(child);
    }
    return out;
  }

  /** Restore from serialized form. */
  static deserialize(json) {
    const t    = new Trie();
    const data = JSON.parse(json);
    t._root    = Trie._deserializeNode(data);
    return t;
  }

  static _deserializeNode(data) {
    const node    = new TrieNode();
    node.isEnd    = data.e;
    node.value    = data.v;
    for (const [ch, childData] of Object.entries(data.c)) {
      node.children[ch] = Trie._deserializeNode(childData);
    }
    return node;
  }
}
