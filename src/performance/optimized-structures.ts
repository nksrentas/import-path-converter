/**
 * Optimized Map implementation with better performance characteristics
 */
export class FastMap<K, V> extends Map<K, V> {
  private keyCache: K[] = [];
  private cacheValid = false;

  set(key: K, value: V): this {
    super.set(key, value);
    this.cacheValid = false;
    return this;
  }

  delete(key: K): boolean {
    const result = super.delete(key);
    if (result) {
      this.cacheValid = false;
    }
    return result;
  }

  clear(): void {
    super.clear();
    this.keyCache = [];
    this.cacheValid = false;
  }

  /**
   * Get all keys as array with caching for better performance
   */
  getKeysArray(): K[] {
    if (!this.cacheValid) {
      this.keyCache = Array.from(this.keys());
      this.cacheValid = true;
    }
    return this.keyCache;
  }

  /**
   * Find key by predicate with early termination
   */
  findKey(predicate: (key: K, value: V) => boolean): K | undefined {
    for (const [key, value] of this) {
      if (predicate(key, value)) {
        return key;
      }
    }
    return undefined;
  }

  /**
   * Batch operations for better performance
   */
  setMany(entries: Array<[K, V]>): void {
    for (const [key, value] of entries) {
      super.set(key, value);
    }
    this.cacheValid = false;
  }
}

/**
 * Trie data structure for efficient prefix matching
 */
export class Trie {
  private root: TrieNode = new TrieNode();

  insert(word: string, value?: any): void {
    let current = this.root;

    for (const char of word) {
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode());
      }
      current = current.children.get(char)!;
    }

    current.isEndOfWord = true;
    if (value !== undefined) {
      current.value = value;
    }
  }

  search(word: string): { found: boolean; value?: any } {
    let current = this.root;

    for (const char of word) {
      if (!current.children.has(char)) {
        return { found: false };
      }
      current = current.children.get(char)!;
    }

    return {
      found: current.isEndOfWord,
      value: current.value,
    };
  }

  startsWith(prefix: string): boolean {
    let current = this.root;

    for (const char of prefix) {
      if (!current.children.has(char)) {
        return false;
      }
      current = current.children.get(char)!;
    }

    return true;
  }

  /**
   * Find all words with given prefix
   */
  findWordsWithPrefix(prefix: string): Array<{ word: string; value?: any }> {
    let current = this.root;

    for (const char of prefix) {
      if (!current.children.has(char)) {
        return [];
      }
      current = current.children.get(char)!;
    }
    const results: Array<{ word: string; value?: any }> = [];
    this.collectWords(current, prefix, results);
    return results;
  }

  private collectWords(
    node: TrieNode,
    currentWord: string,
    results: Array<{ word: string; value?: any }>
  ): void {
    if (node.isEndOfWord) {
      results.push({ word: currentWord, value: node.value });
    }

    for (const [char, childNode] of node.children) {
      this.collectWords(childNode, currentWord + char, results);
    }
  }
}

class TrieNode {
  children = new Map<string, TrieNode>();
  isEndOfWord = false;
  value?: any;
}

/**
 * Optimized Set with additional utility methods
 */
export class FastSet<T> extends Set<T> {
  /**
   * Add multiple items at once
   */
  addMany(items: Iterable<T>): void {
    for (const item of items) {
      this.add(item);
    }
  }

  /**
   * Check if any item matches predicate
   */
  some(predicate: (value: T) => boolean): boolean {
    for (const value of this) {
      if (predicate(value)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if all items match predicate
   */
  every(predicate: (value: T) => boolean): boolean {
    for (const value of this) {
      if (!predicate(value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Find first item matching predicate
   */
  find(predicate: (value: T) => boolean): T | undefined {
    for (const value of this) {
      if (predicate(value)) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Convert to array with caching
   */
  private arrayCache?: T[];
  private cacheValid = false;

  add(value: T): this {
    super.add(value);
    this.cacheValid = false;
    return this;
  }

  delete(value: T): boolean {
    const result = super.delete(value);
    if (result) {
      this.cacheValid = false;
    }
    return result;
  }

  clear(): void {
    super.clear();
    this.arrayCache = undefined;
    this.cacheValid = false;
  }

  toArray(): T[] {
    if (!this.cacheValid || !this.arrayCache) {
      this.arrayCache = Array.from(this);
      this.cacheValid = true;
    }
    return this.arrayCache;
  }
}

/**
 * Bloom filter for fast membership testing with false positives
 */
export class BloomFilter {
  private bitArray: boolean[];
  private hashFunctions: Array<(item: string) => number>;
  private size: number;

  constructor(expectedItems: number, falsePositiveRate: number = 0.01) {
    this.size = Math.ceil((-expectedItems * Math.log(falsePositiveRate)) / Math.log(2) ** 2);
    const hashCount = Math.ceil((this.size / expectedItems) * Math.log(2));

    this.bitArray = new Array(this.size).fill(false);
    this.hashFunctions = this.createHashFunctions(hashCount);
  }

  add(item: string): void {
    for (const hashFn of this.hashFunctions) {
      const index = hashFn(item) % this.size;
      this.bitArray[index] = true;
    }
  }

  mightContain(item: string): boolean {
    for (const hashFn of this.hashFunctions) {
      const index = hashFn(item) % this.size;
      if (!this.bitArray[index]) {
        return false;
      }
    }
    return true;
  }

  private createHashFunctions(count: number): Array<(item: string) => number> {
    const functions: Array<(item: string) => number> = [];

    for (let i = 0; i < count; i++) {
      functions.push((item: string) => {
        let hash = 0;
        for (let j = 0; j < item.length; j++) {
          hash = ((hash << 5) - hash + item.charCodeAt(j) + i) & 0xffffffff;
        }
        return Math.abs(hash);
      });
    }

    return functions;
  }
}

/**
 * LRU Cache with O(1) operations
 */
export class LRUCache<K, V> {
  private capacity: number;
  private cache = new Map<K, { value: V; prev?: Node<K>; next?: Node<K> }>();
  private head?: Node<K>;
  private tail?: Node<K>;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (!node) {
      return undefined;
    }

    this.moveToFront(key);
    return node.value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      const node = this.cache.get(key)!;
      node.value = value;
      this.moveToFront(key);
    } else {
      if (this.cache.size >= this.capacity) {
        this.evictLRU();
      }

      const newNode = { value, prev: undefined, next: this.head };
      if (this.head) {
        this.head.prev = newNode as Node<K>;
      }
      this.head = newNode as Node<K>;

      if (!this.tail) {
        this.tail = this.head;
      }

      this.cache.set(key, newNode);
    }
  }

  private moveToFront(key: K): void {
    const node = this.cache.get(key);
    if (!node || node === this.head) {
      return;
    }

    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
    if (node === this.tail) {
      this.tail = node.prev;
    }

    node.prev = undefined;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node as Node<K>;
    }
    this.head = node as Node<K>;
  }

  private evictLRU(): void {
    if (!this.tail) {
      return;
    }

    let keyToEvict: K | undefined;
    for (const [key, node] of this.cache) {
      if (node === this.tail) {
        keyToEvict = key;
        break;
      }
    }

    if (keyToEvict !== undefined) {
      this.cache.delete(keyToEvict);

      if (this.tail.prev) {
        this.tail.prev.next = undefined;
        this.tail = this.tail.prev;
      } else {
        this.head = this.tail = undefined;
      }
    }
  }

  size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
    this.head = this.tail = undefined;
  }
}

interface Node<K> {
  prev?: Node<K>;
  next?: Node<K>;
}

/**
 * Efficient string matching using Boyer-Moore algorithm
 */
export class StringMatcher {
  private pattern: string;
  private badCharTable: Map<string, number>;

  constructor(pattern: string) {
    this.pattern = pattern;
    this.badCharTable = this.buildBadCharTable(pattern);
  }

  search(text: string): number[] {
    const matches: number[] = [];
    const pattern = this.pattern;
    const patternLength = pattern.length;
    const textLength = text.length;

    let shift = 0;
    while (shift <= textLength - patternLength) {
      let j = patternLength - 1;

      while (j >= 0 && pattern[j] === text[shift + j]) {
        j--;
      }

      if (j < 0) {
        matches.push(shift);
        shift += patternLength;
      } else {
        const badChar = text[shift + j];
        const badCharShift = this.badCharTable.get(badChar) || patternLength;
        shift += Math.max(1, j - badCharShift);
      }
    }

    return matches;
  }

  private buildBadCharTable(pattern: string): Map<string, number> {
    const table = new Map<string, number>();

    for (let i = 0; i < pattern.length - 1; i++) {
      table.set(pattern[i], pattern.length - 1 - i);
    }

    return table;
  }
}
