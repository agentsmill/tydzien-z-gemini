// Password lock of the published game: PBKDF2-SHA256 turns the password into a key, AES-256-GCM seals the bundle.
// Web Crypto only, so the same file runs in the build (Node) and in the browser.
// game.bin layout: 1 byte version | 16 bytes salt | 12 bytes IV | ciphertext with the GCM tag.

export const ITERATIONS = 600000;
const VERSION = 1;

// The password is said out loud at the workshop and typed on phones: ignore case, diacritics,
// spaces and separators, so "Kot Ma Ale 2026" and "kotmaale2026" are the same.
export function normalizePassword(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁ]/g, 'l')
    .toLowerCase().replace(/[\s_\-–—]+/g, '');
}

export async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizePassword(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function seal(key, salt, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(29 + data.length);
  out[0] = VERSION;
  out.set(salt, 1);
  out.set(iv, 17);
  out.set(data, 29);
  return out;
}

export function readHeader(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== VERSION || bytes.length < 29) throw new Error('Unknown game file');
  return { salt: bytes.slice(1, 17), iv: bytes.slice(17, 29), data: bytes.slice(29) };
}

// Rejects when the key is wrong or the file was changed.
export async function open(key, buffer) {
  const { iv, data } = readHeader(buffer);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data));
}

export async function exportKey(key) {
  return toB64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export function importKey(text) {
  return crypto.subtle.importKey('raw', fromB64(text), { name: 'AES-GCM' }, false, ['decrypt']);
}

export function toB64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

export function fromB64(text) {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}
