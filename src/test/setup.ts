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

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

const nativeGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element: Element, pseudoElement?: string | null) =>
  nativeGetComputedStyle(element, pseudoElement ? null : pseudoElement);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
