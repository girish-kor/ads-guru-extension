/**
 * dsa/aho-corasick.js
 * Aho-Corasick multi-pattern string matching automaton.
 *
 * Build:  O(Σ * m)  — Σ = total pattern chars, m = alphabet size
 * Search: O(n + k)  — n = text length, k = number of matches
 *
 * Used for simultaneous matching of thousands of ad-block patterns
 * against request URLs in a single linear scan.
 */
'use strict';

export class AhoCorasick {
  constructor() {
    // goto[state][char] = next state
    this._goto    = [Object.create(null)];
    // fail[state] = failure link
    this._fail    = [0];
    // output[state] = array of matched pattern indices
    this._output  = [[]];
    this._patterns = [];
    this._built   = false;
  }

  /**
   * Build the automaton from an array of pattern strings.
   * Must be called before search().
   * @param {string[]} patterns
   */
  build(patterns) {
    this._patterns = patterns;
    this._goto     = [Object.create(null)];
    this._fail     = [0];
    this._output   = [[]];

    // Phase 1: Insert all patterns (trie construction)
    for (let i = 0; i < patterns.length; i++) {
      this._insert(patterns[i], i);
    }

    // Phase 2: Build failure links (BFS)
    this._buildFailureLinks();

    this._built = true;
  }

  _insert(pattern, patternIdx) {
    let cur = 0;
    for (const ch of pattern) {
      if (this._goto[cur][ch] === undefined) {
        this._goto.push(Object.create(null));
        this._fail.push(0);
        this._output.push([]);
        this._goto[cur][ch] = this._goto.length - 1;
      }
      cur = this._goto[cur][ch];
    }
    this._output[cur].push(patternIdx);
  }

  _buildFailureLinks() {
    const queue = [];

    // Root's children get fail link = 0
    for (const ch of Object.keys(this._goto[0])) {
      const s = this._goto[0][ch];
      this._fail[s] = 0;
      queue.push(s);
    }

    while (queue.length > 0) {
      const r = queue.shift();

      for (const [ch, s] of Object.entries(this._goto[r])) {
        queue.push(s);

        let state = this._fail[r];
        while (state !== 0 && this._goto[state][ch] === undefined) {
          state = this._fail[state];
        }

        this._fail[s] = this._goto[state][ch] !== undefined && this._goto[state][ch] !== s
          ? this._goto[state][ch]
          : 0;

        // Merge output sets
        this._output[s] = [
          ...this._output[s],
          ...this._output[this._fail[s]],
        ];
      }
    }
  }

  /**
   * Search a text string for all pattern occurrences.
   * @param {string} text
   * @returns {Array<{pattern: string, end: number}>}
   */
  search(text) {
    if (!this._built) return [];

    const results = [];
    let cur = 0;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      while (cur !== 0 && this._goto[cur][ch] === undefined) {
        cur = this._fail[cur];
      }

      if (this._goto[cur][ch] !== undefined) {
        cur = this._goto[cur][ch];
      }

      for (const patIdx of this._output[cur]) {
        results.push({
          pattern: this._patterns[patIdx],
          end:     i,
          index:   patIdx,
        });
      }
    }

    return results;
  }

  get patternCount() { return this._patterns.length; }
  get stateCount()   { return this._goto.length; }
}
