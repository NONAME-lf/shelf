// Helpers for driving the built desktop app with Playwright's Electron support.
import { _electron as electron } from 'playwright';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REPO_DIR = resolve(APP_DIR, '../..');
export const SERVER = process.env.SHELF_API ?? 'http://localhost:4000';
export const DEMO_PASSWORD = 'shelf-demo-2026';

export async function launchApp({ settings = {}, executablePath } = {}) {
  const userData = await mkdtemp(join(tmpdir(), 'shelf-e2e-'));
  await writeFile(
    join(userData, 'settings.json'),
    JSON.stringify({ serverUrl: SERVER, folderPath: null, watch: false, ...settings }),
  );
  const env = { ...process.env, SHELF_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE; // would start Electron as plain Node without the app API
  const app = await electron.launch(executablePath ? { executablePath, env } : { args: [APP_DIR], env });
  const page = await app.firstWindow();
  await page.getByTestId('auth-submit').waitFor({ timeout: 30_000 });
  return { app, page, userData };
}

export async function login(page, email, password = DEMO_PASSWORD) {
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await page.getByTestId('file-table').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="file-row"]').length > 0, null, { timeout: 15_000 }).catch(() => undefined);
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

export async function loginUser(email, password = DEMO_PASSWORD) {
  return (await api('/auth/login', { method: 'POST', json: { email, password } })).accessToken;
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
