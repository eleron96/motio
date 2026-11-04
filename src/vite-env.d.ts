/// <reference types="vite/client" />

// Lingui catalogs compiled by `lingui compile` (src/locales/<lang>/messages.mjs).
declare module '*/messages.mjs' {
  import type { Messages } from '@lingui/core';
  export const messages: Messages;
}
