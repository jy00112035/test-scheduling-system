import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    store: new Map<string, string>(),
    getItem(key: string) {
      return this.store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      this.store.set(key, value);
    },
    removeItem(key: string) {
      this.store.delete(key);
    },
    clear() {
      this.store.clear();
    },
  },
});
