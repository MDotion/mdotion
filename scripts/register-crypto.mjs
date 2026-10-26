/**
 * Vite 6 needs Web Crypto on globalThis. Some Node versions / IDE terminals
 * (e.g. Node 16 bundled with older tooling) only expose it via node:crypto.
 */
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.getRandomValues) {
  globalThis.crypto = webcrypto;
}
