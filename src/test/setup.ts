import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const testWindow = (globalThis as typeof globalThis & { jsdom?: { window: Window } }).jsdom?.window;
if (testWindow) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: testWindow.localStorage,
  });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
