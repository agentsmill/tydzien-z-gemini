// Password screen of the published game (replaces js/main.js in dist/index.html).
// Opens game.bin with the password, runs the game, and keeps the key on this device. Settings can forget it.
import { deriveKey, readHeader, open, exportKey, importKey, toB64 } from './gate-crypto.js';

const KEY_STORE = 'tzg:key';
const stage = document.querySelector('.stage');
const viewHost = document.querySelector('[data-role="view"]');

// Same fit as js/engine/phone.js (phone mode); the game takes over on start.
function fit() {
  const scale = Math.min(1, (window.innerHeight - 48) / 866, (window.innerWidth - 32) / 412);
  stage.style.setProperty('--phone-scale', String(Math.max(0.5, scale)));
}
window.addEventListener('resize', fit);
fit();

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function remembered() {
  try { return JSON.parse(localStorage.getItem(KEY_STORE)); } catch { return null; }
}
function remember(value) {
  try { localStorage.setItem(KEY_STORE, JSON.stringify(value)); } catch { /* private mode: ask again next time */ }
}
function forget() {
  try { localStorage.removeItem(KEY_STORE); } catch { /* nothing stored */ }
}

function showMessage(text) {
  viewHost.replaceChildren(el('section', { class: 'view onboarding' },
    el('div', { class: 'oneui-header' }, el('h1', {}, 'Coś poszło nie tak'), el('p', {}, text))));
}

async function run(bytes) {
  window.removeEventListener('resize', fit);
  viewHost.replaceChildren();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
  try {
    await import(url);
  } catch {
    showMessage('Gra nie wystartowała. Odśwież stronę.');
  }
}

function showForm(buffer, salt) {
  const input = el('input', {
    class: 'field', type: 'password', autocomplete: 'current-password', autocapitalize: 'none',
    spellcheck: 'false', placeholder: 'Hasło', 'aria-label': 'Hasło do gry',
  });
  const error = el('p', { class: 'small danger gate-error', role: 'alert' });
  const button = el('button', { class: 'btn btn-block', type: 'submit' }, 'Odblokuj');
  const form = el('form', { class: 'stack' }, input, error, button);
  viewHost.replaceChildren(el('section', { class: 'view onboarding view-enter' },
    el('div', { class: 'oneui-header' }, el('h1', {}, 'Wpisz hasło'), el('p', {}, 'Hasło do gry dostaniesz od osoby prowadzącej warsztaty.')),
    el('div', { class: 'scroll' }, form)));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!input.value.trim()) return input.focus();
    button.disabled = true;
    button.textContent = 'Sprawdzam…';
    error.textContent = '';
    let bytes = null;
    try {
      const key = await deriveKey(input.value, salt);
      bytes = await open(key, buffer);
      remember({ salt: toB64(salt), key: await exportKey(key) });
    } catch {
      button.disabled = false;
      button.textContent = 'Odblokuj';
      error.textContent = 'Nieprawidłowe hasło. Spróbuj jeszcze raz.';
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
      input.select();
      return;
    }
    run(bytes);
  });
  setTimeout(() => input.focus({ preventScroll: true }), 350);
}

async function boot() {
  let buffer;
  let salt;
  try {
    const response = await fetch('game.bin', { cache: 'no-cache' });
    if (!response.ok) throw new Error(String(response.status));
    buffer = await response.arrayBuffer();
    salt = readHeader(buffer).salt;
  } catch {
    showMessage('Nie udało się wczytać gry. Sprawdź połączenie i odśwież stronę.');
    return;
  }
  const saved = remembered();
  if (saved && saved.salt === toB64(salt)) {
    let bytes = null;
    try {
      bytes = await open(await importKey(saved.key), buffer);
    } catch {
      forget();
    }
    if (bytes) return run(bytes);
  } else if (saved) {
    forget();
  }
  showForm(buffer, salt);
}

boot();
