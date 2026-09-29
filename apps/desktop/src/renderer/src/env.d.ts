/// <reference types="vite/client" />
import type { ShelfBridge } from '../../shared/ipc';

declare global {
  interface Window {
    shelf: ShelfBridge;
  }
}

export {};
