#!/usr/bin/env node
// Measurements behind the stage 4 comparison of the desktop and web clients (docs/reports/stage4-comparison.md).
//
//   node tools/compare-clients.mjs loc        # TypeScript lines per package and the shared part of each client
//   node tools/compare-clients.mjs artefacts  # .dmg, Shelf.app and app.asar sizes; size of the web build output
//   node tools/compare-clients.mjs web-load   # bytes of the first load of /login and /workspace of the published site
//   node tools/compare-clients.mjs startup    # packaged app and published site: from the start to the login form
//   node tools/compare-clients.mjs sync       # first sync of the 10 demo files into an empty folder, local stack
//
// Before `artefacts`, `startup` and `sync`: pnpm -F @shelf/shared build && pnpm -F @shelf/desktop dist:mac;
// before `sync` also pnpm -F @shelf/web build (with the local API address) and a running, seeded stack.
// Environment: RUNS (3); SHELF_SITE, SHELF_SITE_API, SHELF_SITE_EMAIL, SHELF_SITE_PASSWORD for the published
// system (only a login and reading); SHELF_API and SHELF_WEB_PORT as in the UI scripts of both clients. `sync` writes
// data (a throwaway account with the demo files) and therefore refuses any API but localhost / 127.0.0.1.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = Number(process.env.RUNS ?? 3);
const SITE = process.env.SHELF_SITE ?? 'https://shelf-opal-two.vercel.app';
const SITE_API = process.env.SHELF_SITE_API ?? 'https://shelf-api-l989.onrender.com';
const SITE_EMAIL = process.env.SHELF_SITE_EMAIL ?? 'artem@shelf.dev';
const SITE_PASSWORD = process.env.SHELF_SITE_PASSWORD ?? 'shelf-demo-2026';
const DEMO_DIR = join(ROOT, 'tools/demo-files');
const DESKTOP_LIB = '../apps/desktop/scripts/lib/app.mjs';
const WEB_LIB = '../apps/web/scripts/lib/web.mjs';

// Playwright is a dependency of both clients, not of the repository root.
const { chromium } = createRequire(join(ROOT, 'apps/web/package.json'))('playwright');

const MiB = 1024 * 1024;
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const mib = (bytes) => `${(bytes / MiB).toFixed(1)} MiB`;
const ms = (value) => `${Math.round(value)} ms`;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const series = (label, values) =>
  console.log(`${label}: ${values.map(ms).join(', ')} → median ${ms(median(values))}`);

// ---------------------------------------------------------------------------------------------- loc

const PACKAGES = [
  ['@shelf/shared', 'packages/shared/src'],
  ['@shelf/ui', 'packages/ui/src'],
  ['@shelf/desktop', 'apps/desktop/src'],
  ['@shelf/web', 'apps/web/src'],
  ['@shelf/api', 'apps/api/src'],
];
/** Test files and test helpers (src/test/, src/main/test/). */
const isTest = (path) => /\.(test|spec)\.tsx?$/.test(path) || path.includes('/test/');
/** Like `wc -l`: the number of line feeds. */
const linesOf = (path) => readFileSync(join(ROOT, path), 'utf8').split('\n').length - 1;

function loc() {
  const rows = {};
  for (const [name, dir] of PACKAGES) {
    const files = execFileSync('git', ['ls-files', '-z', '--', dir], { cwd: ROOT, encoding: 'utf8' })
      .split('\0')
      .filter((path) => /\.tsx?$/.test(path));
    const source = files.filter((path) => !isTest(path));
    const tests = files.filter(isTest);
    const sum = (list) => list.reduce((total, path) => total + linesOf(path), 0);
    rows[name] = { dir, files: source.length, lines: sum(source), testFiles: tests.length, testLines: sum(tests) };
  }
  console.log('package          source files  lines   test files  lines');
  for (const [name, row] of Object.entries(rows)) {
    console.log(`${name.padEnd(16)} ${String(row.files).padStart(12)} ${String(row.lines).padStart(6)} ${String(row.testFiles).padStart(12)} ${String(row.testLines).padStart(6)}`);
  }
  const common = rows['@shelf/shared'].lines + rows['@shelf/ui'].lines;
  for (const client of ['@shelf/desktop', '@shelf/web']) {
    const own = rows[client].lines;
    const total = common + own;
    console.log(`${client}: ${total} lines = shared + ui ${common} (${((100 * common) / total).toFixed(1)} %) + own ${own} (${((100 * own) / total).toFixed(1)} %)`);
  }
}

// ---------------------------------------------------------------------------------------- artefacts

/** Sum of the sizes of regular files (symlinks inside the .app are not followed). */
function treeBytes(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) return 0;
  if (!info.isDirectory()) return info.size;
  return readdirSync(path).reduce((total, name) => total + treeBytes(join(path, name)), 0);
}

function releaseDir() {
  const release = join(ROOT, 'apps/desktop/release');
  assert.ok(existsSync(release), 'apps/desktop/release not found — run pnpm -F @shelf/desktop dist:mac first');
  return release;
}

function packagedApp() {
  const release = releaseDir();
  const macDir = readdirSync(release).find((name) => name.startsWith('mac'));
  assert.ok(macDir, 'release/mac* not found — run pnpm -F @shelf/desktop dist:mac first');
  return join(release, macDir, 'Shelf.app');
}

function artefacts() {
  const release = releaseDir();
  for (const name of readdirSync(release).filter((name) => /\.(dmg|zip)$/.test(name))) {
    const bytes = lstatSync(join(release, name)).size;
    console.log(`${name}: ${bytes} B (${mib(bytes)})`);
  }
  const app = packagedApp();
  const parts = {
    'Shelf.app': app,
    'Electron Framework.framework': join(app, 'Contents/Frameworks/Electron Framework.framework'),
    'app.asar (the app itself)': join(app, 'Contents/Resources/app.asar'),
  };
  for (const [label, path] of Object.entries(parts)) {
    const bytes = treeBytes(path);
    console.log(`${label}: ${bytes} B (${mib(bytes)})`);
  }
  const renderer = join(ROOT, 'apps/desktop/out/renderer/assets');
  if (existsSync(renderer)) console.log(`desktop renderer bundle (out/renderer/assets): ${kib(treeBytes(renderer))}`);
  const staticDir = join(ROOT, 'apps/web/.next/static');
  if (existsSync(staticDir)) console.log(`web build output .next/static: ${kib(treeBytes(staticDir))}`);
}

// ------------------------------------------------------------------------------------- web helpers

/** A free Render service sleeps: ask /api/health until an answer comes back within a second. */
async function wakeServer(api) {
  const deadline = Date.now() + 180_000;
  for (;;) {
    const started = performance.now();
    const ok = await fetch(`${api}/api/health`).then((response) => response.ok, () => false);
    const took = performance.now() - started;
    if (ok && took < 1000) return console.log(`${api}/api/health answered in ${ms(took)}`);
    if (Date.now() > deadline) throw new Error(`${api} did not wake up within 3 minutes`);
    await new Promise((done) => setTimeout(done, 2000));
  }
}

/** Chromium with an empty temporary profile, i.e. an empty HTTP cache (the web UI scripts do the same). */
async function freshChromium() {
  const profile = await mkdtemp(join(tmpdir(), 'shelf-compare-'));
  const context = await chromium.launchPersistentContext(profile, { viewport: { width: 1280, height: 820 } });
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    context,
    page,
    close: async () => {
      await context.close();
      await new Promise((done) => setTimeout(done, 500));
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

/**
 * Counts what the page receives over the network through the DevTools protocol with the cache disabled:
 * encodedDataLength of Network.loadingFinished is what DevTools shows as «transferred» (headers included).
 */
async function trafficMeter(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  let requests = new Map();
  let lastEvent = performance.now();
  const touch = () => (lastEvent = performance.now());
  cdp.on('Network.requestWillBeSent', (event) => {
    touch();
    if (event.request.url.startsWith('data:')) return;
    requests.set(event.requestId, { url: event.request.url, type: event.type ?? 'Other', bytes: 0, decoded: 0, done: false });
  });
  cdp.on('Network.dataReceived', (event) => {
    touch();
    const request = requests.get(event.requestId);
    if (request) request.decoded += event.dataLength;
  });
  cdp.on('Network.loadingFinished', (event) => {
    touch();
    const request = requests.get(event.requestId);
    if (request) Object.assign(request, { bytes: event.encodedDataLength, done: true });
  });
  cdp.on('Network.loadingFailed', (event) => {
    touch();
    const request = requests.get(event.requestId);
    if (request) Object.assign(request, { done: true, failed: true });
  });
  return {
    /** Waits until nothing is in flight and the network has been quiet for `quietMs`. */
    async idle(quietMs = 1000) {
      const deadline = performance.now() + 30_000;
      while (performance.now() < deadline) {
        const busy = [...requests.values()].some((request) => !request.done);
        if (!busy && performance.now() - lastEvent > quietMs) return;
        await new Promise((done) => setTimeout(done, 100));
      }
      throw new Error('the network did not go quiet within 30 s');
    },
    /** Returns the requests counted so far and starts a new count. */
    take() {
      const taken = [...requests.values()];
      requests = new Map();
      return taken;
    },
  };
}

function printTraffic(label, requests) {
  const apiHost = new URL(SITE_API).host;
  const groups = new Map();
  for (const request of requests) {
    const key = new URL(request.url).host === apiHost ? `API ${request.type}` : request.type;
    const group = groups.get(key) ?? { count: 0, bytes: 0, decoded: 0 };
    group.count += 1;
    group.bytes += request.bytes;
    group.decoded += request.decoded;
    groups.set(key, group);
  }
  const total = requests.reduce((sum, request) => sum + request.bytes, 0);
  const decoded = requests.reduce((sum, request) => sum + request.decoded, 0);
  console.log(`${label}: ${requests.length} requests, ${total} B transferred (${kib(total)}), ${kib(decoded)} after decompression`);
  for (const [key, group] of [...groups].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${key.padEnd(16)} ${String(group.count).padStart(3)} × → ${kib(group.bytes).padStart(11)} (${kib(group.decoded)} decoded)`);
  }
}

async function waitForRows(page) {
  await page.getByTestId('file-table').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="file-row"]').length > 0, null, { timeout: 30_000 });
}

// ---------------------------------------------------------------------------------------- web-load

async function webLoad() {
  await wakeServer(SITE_API);
  const browser = await freshChromium();
  try {
    const { context, page } = browser;
    const meter = await trafficMeter(context, page);
    await page.goto(`${SITE}/login`);
    await page.getByTestId('auth-submit').waitFor();
    await meter.idle();
    printTraffic('/login, first load', meter.take());

    // Only a login and reading: nothing in the demo space is changed.
    await page.getByTestId('auth-email').fill(SITE_EMAIL);
    await page.getByTestId('auth-password').fill(SITE_PASSWORD);
    await page.getByTestId('auth-submit').click();
    await waitForRows(page);
    await meter.idle();
    printTraffic('login → /workspace (in-page transition)', meter.take());

    await page.reload();
    await waitForRows(page);
    await meter.idle();
    const rows = await page.getByTestId('file-row').count();
    printTraffic(`/workspace, full load with the stored session (${rows} rows)`, meter.take());
  } finally {
    await browser.close();
  }
}

// ----------------------------------------------------------------------------------------- startup

async function startup() {
  const { closeApp, launchApp } = await import(DESKTOP_LIB);
  const executablePath = join(packagedApp(), 'Contents/MacOS/Shelf');
  const desktop = [];
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    const { app, userData } = await launchApp({ executablePath }); // resolves when the login form is visible
    const took = performance.now() - started;
    try {
      await closeApp(app);
    } finally {
      await rm(userData, { recursive: true, force: true });
    }
    desktop.push(took);
  }
  series('desktop, packaged Shelf.app: launch → login form visible', desktop);

  await wakeServer(SITE_API);
  const first = [];
  const repeat = [];
  for (let run = 0; run < RUNS; run += 1) {
    const browser = await freshChromium(); // the browser is already running when the user opens the address
    try {
      let started = performance.now();
      await browser.page.goto(`${SITE}/login`, { waitUntil: 'commit' });
      await browser.page.getByTestId('auth-submit').waitFor();
      first.push(performance.now() - started);
      // the same address once more in a new tab: the browser cache now holds the scripts and styles
      const again = await browser.context.newPage();
      started = performance.now();
      await again.goto(`${SITE}/login`, { waitUntil: 'commit' });
      await again.getByTestId('auth-submit').waitFor();
      repeat.push(performance.now() - started);
    } finally {
      await browser.close();
    }
  }
  series(`web, ${SITE}/login, empty cache: navigation → login form visible`, first);
  series(`web, ${SITE}/login, repeated visit (browser cache)`, repeat);
}

// -------------------------------------------------------------------------------------------- sync

/** `sync` registers an account and uploads files: it may only talk to the local stack. */
const LOCAL_API = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/;

async function sync() {
  const desktopLib = await import(DESKTOP_LIB);
  const webLib = await import(WEB_LIB);
  for (const server of [desktopLib.SERVER, webLib.SERVER]) assert.match(server, LOCAL_API, 'sync writes data: local stack only');
  const healthy = await fetch(`${desktopLib.SERVER}/api/health`).then((response) => response.ok, () => false);
  if (!healthy) throw new Error(`the local API ${desktopLib.SERVER} does not answer /api/health — start it with pnpm stack:up`);
  const names = (await readdir(DEMO_DIR)).filter((name) => !name.startsWith('.')).sort();
  assert.equal(names.length, 10, `expected 10 demo files, found ${names.length}`);
  const bytes = names.reduce((sum, name) => sum + lstatSync(join(DEMO_DIR, name)).size, 0);

  // A throwaway account keeps the demo users untouched. It stays on the local stack afterwards: nothing deletes
  // accounts through the API, only pnpm stack:reset (which wipes all data) removes it.
  const email = `compare-${Date.now()}@shelf.dev`;
  const token = await desktopLib.registerUser(email, 'Порівняння');
  for (const name of names) await desktopLib.uploadDemoFile(token, name);
  console.log(`${email}: ${names.length} demo files, ${bytes} B, local API ${desktopLib.SERVER}`);
  const downloaded = (page) => page.getByTestId('sync-report').getByText(`Скачано з сервера: ${names.length}`, { exact: true });

  const executablePath = join(packagedApp(), 'Contents/MacOS/Shelf');
  const desktop = [];
  for (let run = 0; run < RUNS; run += 1) {
    const folder = await mkdtemp(join(tmpdir(), 'shelf-compare-folder-'));
    const { app, page, userData } = await desktopLib.launchApp({ executablePath, bind: { token, folderPath: folder } });
    try {
      await desktopLib.login(page, email);
      assert.equal(await page.getByTestId('file-row').count(), names.length);
      const started = performance.now();
      await page.getByTestId('sync-run').click();
      await downloaded(page).waitFor({ timeout: 60_000 });
      desktop.push(performance.now() - started);
      const local = (await readdir(folder)).filter((name) => !name.startsWith('.'));
      assert.equal(local.length, names.length, `desktop folder holds ${local.join(', ')}`);
    } finally {
      await desktopLib.closeApp(app);
      await rm(folder, { recursive: true, force: true });
      await rm(userData, { recursive: true, force: true });
    }
  }
  series(`desktop, packaged Shelf.app: «Синхронізувати» → report, ${names.length} files downloaded`, desktop);

  const server = await webLib.startWeb();
  const web = [];
  try {
    for (let run = 0; run < RUNS; run += 1) {
      const { context, page, profile } = await webLib.launchBrowser(); // new profile: an empty OPFS folder
      try {
        await webLib.login(page, email);
        assert.equal(await page.getByTestId('file-row').count(), names.length);
        await page.getByRole('button', { name: 'Обрати папку' }).click();
        await page.getByTestId('sync-folder').getByText(webLib.SYNC_DIR, { exact: true }).waitFor();
        const started = performance.now();
        await page.getByTestId('sync-run').click();
        await downloaded(page).waitFor({ timeout: 60_000 });
        web.push(performance.now() - started);
        const local = await webLib.opfs.names(page);
        assert.equal(local.length, names.length, `OPFS folder holds ${local.join(', ')}`);
      } finally {
        await context.close();
        await webLib.removeProfile(profile);
      }
    }
  } finally {
    await server.stop();
  }
  series(`web, next start on ${webLib.WEB}, OPFS folder: «Синхронізувати» → report, ${names.length} files downloaded`, web);
}

// ---------------------------------------------------------------------------------------------- main

const commands = { loc, artefacts, 'web-load': webLoad, startup, sync };
const command = commands[process.argv[2]];
if (!command) {
  console.error(`usage: node tools/compare-clients.mjs ${Object.keys(commands).join('|')}`);
  process.exit(2);
}
console.log(`# ${process.argv[2]} — ${new Date().toISOString()}, node ${process.version}, ${process.platform}/${process.arch}`);
await command();
