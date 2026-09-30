// Helpers for driving the built web client with Playwright's Chromium against the running API.
// The HTTP helpers mirror apps/desktop/scripts/lib/app.mjs.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REPO_DIR = resolve(APP_DIR, '../..');
/** Must be the address the client was built with (NEXT_PUBLIC_API_URL). */
export const SERVER = process.env.SHELF_API ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
/** `next start` listens here; SHELF_WEB_PORT moves it when 3000 is taken by another program. */
export const PORT = Number(process.env.SHELF_WEB_PORT ?? 3000);
export const WEB = process.env.SHELF_WEB ?? `http://localhost:${PORT}`;
export const DEMO_PASSWORD = 'shelf-demo-2026';
/** The directory of the Origin Private File System that the stubbed folder picker returns. */
export const SYNC_DIR = 'shelf-smoke';

const answers = async (url) => {
  try {
    return (await fetch(`${url}/login`)).ok;
  } catch {
    return false;
  }
};

/** Starts `next start` on PORT (after `next build`) unless SHELF_WEB points at a running client. */
export async function startWeb() {
  if (process.env.SHELF_WEB) return { stop: async () => {} };
  if (await answers(WEB)) throw new Error(`${WEB} already answers — stop that server or set SHELF_WEB=${WEB}`);
  const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [nextBin, 'start', '--port', String(PORT)], {
    cwd: APP_DIR,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const deadline = Date.now() + 30_000;
  while (!(await answers(WEB))) {
    if (child.exitCode !== null) throw new Error(`next start exited: ${stderr}`);
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`next start did not answer within 30 s: ${stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return {
    stop: async () => {
      child.kill('SIGTERM');
      const killer = setTimeout(() => child.kill('SIGKILL'), 5_000);
      await exited;
      clearTimeout(killer);
    },
  };
}

/**
 * Chromium with a real temporary profile at the desktop client's default window size. Playwright's
 * default (incognito) contexts crash Chromium when a directory handle is read back from IndexedDB, which
 * the client does on every login. `folderPicker: 'opfs'` replaces the native picker, which Playwright
 * cannot drive, with a directory of the Origin Private File System; 'none' removes the File System
 * Access API as in Firefox or Safari. Close the context, then `removeProfile(profile)`.
 */
export async function launchBrowser({ folderPicker = 'opfs' } = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'shelf-web-profile-'));
  const context = await chromium
    .launchPersistentContext(profile, {
      baseURL: WEB,
      viewport: { width: 1280, height: 820 },
      acceptDownloads: true,
    })
    .catch(async (error) => {
      await removeProfile(profile);
      throw error;
    });
  if (folderPicker === 'opfs') {
    await context.addInitScript((dir) => {
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(dir, { create: true });
    }, SYNC_DIR);
  } else {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true, writable: true });
    });
  }
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, profile };
}

/** Chromium flushes profile files while it shuts down, so wait a moment before deleting the directory. */
export async function removeProfile(profile) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/** The bound folder as the page sees it (the OPFS directory behind the stubbed picker). */
export const opfs = {
  write: (page, name, text) =>
    page.evaluate(
      async ([dir, name, text]) => {
        const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir, { create: true });
        const writable = await (await folder.getFileHandle(name, { create: true })).createWritable();
        await writable.write(text);
        await writable.close();
      },
      [SYNC_DIR, name, text],
    ),
  read: (page, name) =>
    page.evaluate(
      async ([dir, name]) => {
        const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir, { create: true });
        return (await (await folder.getFileHandle(name)).getFile()).text();
      },
      [SYNC_DIR, name],
    ),
  names: (page) =>
    page.evaluate(async (dir) => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir, { create: true });
      const names = [];
      for await (const [name] of folder.entries()) names.push(name);
      return names.sort();
    }, SYNC_DIR),
};

export async function login(page, email, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await page.getByTestId('file-table').waitFor();
  await page
    .waitForFunction(() => document.querySelectorAll('[data-testid="file-row"]').length > 0, null, { timeout: 15_000 })
    .catch(() => undefined);
}

export async function api(path, { token, method = 'GET', json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  if (form) body = form;
  const response = await fetch(`${SERVER}/api${path}`, { method, headers, body });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

export async function registerUser(email, displayName, password = DEMO_PASSWORD) {
  return (await api('/auth/register', { method: 'POST', json: { email, password, displayName } })).accessToken;
}

export async function uploadText(token, name, text) {
  const form = new FormData();
  form.append('file', new Blob([text]), name);
  return api('/workspace/files', { method: 'POST', token, form });
}

export async function uploadDemoFile(token, name) {
  const form = new FormData();
  form.append('file', new Blob([await readFile(join(REPO_DIR, 'tools/demo-files', name))]), name);
  return api('/workspace/files', { method: 'POST', token, form });
}

export const rowNames = (page) =>
  page.getByTestId('file-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-name')));
