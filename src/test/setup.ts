import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

const createMemoryStorage = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  };
};

const hasValidLocalStorage = () => {
  const storage = window.localStorage as Storage | undefined;
  return Boolean(
    storage
      && typeof storage.getItem === "function"
      && typeof storage.setItem === "function"
      && typeof storage.removeItem === "function"
      && typeof storage.clear === "function",
  );
};

if (!hasValidLocalStorage()) {
  Object.defineProperty(window, "localStorage", {
    writable: true,
    value: createMemoryStorage(),
  });
}

const htmlElementProto = window.HTMLElement.prototype as HTMLElement & {
  hasPointerCapture?: (pointerId: number) => boolean;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

if (typeof htmlElementProto.hasPointerCapture !== "function") {
  htmlElementProto.hasPointerCapture = () => false;
}

if (typeof htmlElementProto.setPointerCapture !== "function") {
  htmlElementProto.setPointerCapture = () => {};
}

if (typeof htmlElementProto.releasePointerCapture !== "function") {
  htmlElementProto.releasePointerCapture = () => {};
}

if (typeof htmlElementProto.scrollIntoView !== "function") {
  htmlElementProto.scrollIntoView = () => {};
}

// jsdom has no ResizeObserver, and Radix's scroll area subscribes to one the
// moment it mounts — without this, any test that renders a scrollable panel
// dies in a layout effect rather than on an assertion. Nothing is ever
// observed in jsdom, so a no-op is the honest stand-in.
if (typeof (window as Window & { ResizeObserver?: unknown }).ResizeObserver !== "function") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  });
}

// jsdom ships no PointerEvent, and Testing Library then falls back to a plain
// Event — which drops clientX/clientY, so pointer-driven gestures (the mobile
// swipe deck, the menu sheet's drag-to-dismiss) look like zero-distance moves.
// MouseEvent already carries the coordinates; only pointerId has to be added.
if (typeof (window as Window & { PointerEvent?: unknown }).PointerEvent !== "function") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "touch";
    }
  }

  Object.defineProperty(window, "PointerEvent", {
    writable: true,
    configurable: true,
    value: PointerEventPolyfill,
  });
}
