// End-to-end smoke test of the built web client (next build) against the running API (pnpm stack:up).
// Uses fresh accounts so the demo users stay untouched.
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { api, DEMO_PASSWORD, launchBrowser, login, opfs, registerUser, removeProfile, rowNames, SERVER, startWeb, uploadDemoFile, uploadText } from './lib/web.mjs';

const email = `web-smoke-${Date.now()}@shelf.dev`;
const token = await registerUser(email, 'Веб-смоук');
for (const name of ['Main.kt', 'geometry.cpp', 'matrix.cpp', 'shelf-logo.png', 'mountains.jpg', 'backup.zip']) {
  await uploadDemoFile(token, name);
}
const shots = process.env.SHELF_SMOKE_DIR ?? (await mkdtemp(join(tmpdir(), 'shelf-web-smoke-shots-')));
const row = (page, name) => page.locator(`[data-testid="file-row"][data-name="${name}"]`);
const reportLine = (page, text) => page.getByTestId('sync-report').getByText(text, { exact: true });

const web = await startWeb();
const pageErrors = [];
let main;
try {
  main = await launchBrowser();
  const { page } = main;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // A stored token the server rejects (expired, reset database) leads to the login screen.
  await page.goto('/login');
  await page.evaluate((serverUrl) => {
    const user = { id: 'nobody', email: 'nobody@shelf.dev', displayName: 'Ніхто' };
    localStorage.setItem('shelf.session', JSON.stringify({ serverUrl, token: 'not-a-valid-jwt', user }));
  }, SERVER);
  await page.goto('/workspace');
  await page.waitForURL('**/login');
  await page.getByTestId('auth-submit').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('shelf.session')), null);
  console.log('ok  a rejected token leads to /login');

  await login(page, email);
  assert.equal(new URL(page.url()).pathname, '/workspace');
  assert.deepEqual(await rowNames(page), ['backup.zip', 'geometry.cpp', 'Main.kt', 'matrix.cpp', 'mountains.jpg', 'shelf-logo.png']);
  console.log('ok  login, table sorted ascending');

  await page.getByTestId('sort-name').click();
  await page.getByTestId('filter-ONLY_CPP').click();
  assert.deepEqual(await rowNames(page), ['matrix.cpp', 'geometry.cpp']);
  console.log('ok  descending + only .cpp');
  await page.getByTestId('filter-ONLY_PNG').click();
  assert.deepEqual(await rowNames(page), ['shelf-logo.png']);
  console.log('ok  only .png');
  await page.getByTestId('filter-ALL_FILES').click();
  await page.getByTestId('sort-name').click();

  await page.getByTestId('column-uploadedBy').click();
  assert.equal(await page.locator('th', { hasText: 'Хто завантажив' }).count(), 0);
  console.log('ok  column hidden');
  await page.getByTestId('column-uploadedBy').click();

  await row(page, 'Main.kt').click();
  await page.getByTestId('preview-text').waitFor();
  assert.match(await page.getByTestId('preview-text').innerText(), /Полиця/);
  await page.screenshot({ path: join(shots, '1-preview-kt.png') });
  await page.keyboard.press('Escape');
  await row(page, 'mountains.jpg').click();
  await page.getByTestId('preview-image').waitFor();
  await page.keyboard.press('Escape');
  await row(page, 'backup.zip').click();
  await page.getByTestId('preview-unsupported').waitFor();
  await page.keyboard.press('Escape');
  console.log('ok  preview .kt / .jpg / unsupported');

  // A drag without OS files (a text selection, a link) must not open the upload overlay.
  const drag = (type, withFiles) =>
    page.evaluate(
      ([type, withFiles]) => {
        const zone = document.querySelector('[data-testid="dropzone"]');
        const data = new DataTransfer();
        if (withFiles) data.items.add(new File(['x'], 'outside.txt'));
        else data.setData('text/plain', 'some text');
        zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
      },
      [type, withFiles],
    );
  // React renders drag events asynchronously: wait for the attribute instead of reading it at once.
  const dropzoneBecomes = (active) =>
    page.waitForFunction((active) => document.querySelector('[data-testid="dropzone"]').dataset.active === active, active, {
      timeout: 5_000,
    });
  await drag('dragenter', false);
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId('dropzone').getAttribute('data-active'), 'false');
  console.log('ok  a drag without files is ignored by the drop zone');
  await drag('dragenter', true);
  await dropzoneBecomes('true');
  await drag('dragleave', true);
  await dropzoneBecomes('false');
  console.log('ok  a drag with files activates the drop zone and leaving deactivates it');

  // Dropping a 51 MB file with a small one: the big one is skipped before any request, the small one uploaded.
  await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="dropzone"]');
    const data = new DataTransfer();
    data.items.add(new File(['val x = 1\n'], 'dropped.kt'));
    data.items.add(new File([new Uint8Array(51 * 1024 * 1024)], 'huge.bin'));
    zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: data }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  });
  await page.getByTestId('notice').waitFor();
  assert.equal((await page.getByTestId('notice').innerText()).trim(), 'Завантажено файлів: 1. Більші за 50 МБ і пропущені: huge.bin');
  await row(page, 'dropped.kt').waitFor();
  console.log('ok  drop uploads small files and skips files above 50 MB');

  await page.getByTestId('upload-input').setInputFiles({ name: 'picked.txt', mimeType: 'text/plain', buffer: Buffer.from('picked\n') });
  await row(page, 'picked.txt').waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await row(page, 'picked.txt').getByRole('button', { name: 'Видалити' }).click();
  await row(page, 'picked.txt').waitFor({ state: 'detached' });
  console.log('ok  upload by button and delete');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    row(page, 'Main.kt').getByRole('button', { name: 'Скачати' }).click(),
  ]);
  assert.equal(download.suggestedFilename(), 'Main.kt');
  assert.match(await readFile(await download.path(), 'utf8'), /Полиця/);
  console.log('ok  download saves Main.kt with its content');

  // Synchronization: the stubbed picker binds an OPFS folder that already holds one local file.
  await opfs.write(page, 'smoke-local.txt', 'created by the web smoke test\n');
  await page.getByTestId('sync-run').click();
  await page.getByTestId('sync-report').waitFor({ timeout: 30_000 });
  await page.getByTestId('sync-folder').getByText('shelf-smoke', { exact: true }).waitFor();
  await page.screenshot({ path: join(shots, '2-sync.png') });
  const serverFiles = await api('/workspace/files', { token });
  const local = await opfs.names(page);
  assert.deepEqual(local, serverFiles.map((file) => file.name).sort());
  await row(page, 'smoke-local.txt').waitFor();
  console.log('ok  sync downloaded the workspace and uploaded smoke-local.txt, no swap files left');

  // Downloaded files got the browser's time; the next sync must see them unchanged, not upload them back.
  await page.getByTestId('sync-run').click();
  await reportLine(page, `Без змін: ${serverFiles.length}`).waitFor({ timeout: 30_000 });
  await reportLine(page, 'Завантажено на сервер: 0').waitFor();
  const after = await api('/workspace/files', { token });
  assert.deepEqual(
    after.map((file) => [file.name, file.modifiedAt]),
    serverFiles.map((file) => [file.name, file.modifiedAt]),
  );
  console.log('ok  a second sync changes nothing: downloaded files are not uploaded back');

  // A conflict: both sides changed since the last sync; the user keeps the server version.
  await uploadText(token, 'smoke-local.txt', 'server edit\n');
  await opfs.write(page, 'smoke-local.txt', 'local edit, longer than the server one\n');
  await page.getByTestId('sync-run').click();
  await page.getByTestId('conflict-dialog').waitFor();
  assert.deepEqual(
    await page.getByTestId('conflict-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-name'))),
    ['smoke-local.txt'],
  );
  // the local edit is the newer one, so the dialog preselects it; choosing the server side changes that
  await page.waitForFunction(() => document.querySelector('[data-testid="conflict-LOCAL"]').checked === true);
  assert.equal(await page.getByTestId('conflict-REMOTE').isChecked(), false);
  await page.getByTestId('conflict-REMOTE').check();
  await page.waitForFunction(() => document.querySelector('[data-testid="conflict-REMOTE"]').checked === true);
  await page.screenshot({ path: join(shots, '3-conflict.png') });
  await page.getByTestId('conflict-apply').click();
  await page.getByTestId('conflict-dialog').waitFor({ state: 'hidden' });
  await reportLine(page, 'Конфліктів: 1').waitFor({ timeout: 30_000 });
  assert.equal(await opfs.read(page, 'smoke-local.txt'), 'server edit\n');
  console.log('ok  conflict dialog: the chosen server version replaced the local file');

  // Automatic tracking: polling notices a new local file and uploads it.
  // the checkbox follows the saved binding, so it changes after the click has been stored
  const tracking = (on) =>
    page.waitForFunction((on) => document.querySelector('[data-testid="sync-watch"]').checked === on, on);
  await page.getByTestId('sync-watch').click();
  await tracking(true);
  await opfs.write(page, 'tracked.txt', 'picked up by polling\n');
  await row(page, 'tracked.txt').waitFor({ timeout: 20_000 });
  await page.getByTestId('sync-watch').click();
  await tracking(false);
  console.log('ok  tracking uploaded a new local file');

  // A narrow window: the sidebar hides behind the toggle and opens over the content.
  await page.setViewportSize({ width: 360, height: 740 });
  const sidebar = page.getByTestId('sidebar');
  // the sidebar slides (a short CSS transition): wait for where it ends up
  const sidebarAt = (where) =>
    page.waitForFunction((where) => {
      const box = document.querySelector('[data-testid="sidebar"]').getBoundingClientRect();
      return where === 'hidden' ? box.right <= 0 : box.left >= 0;
    }, where);
  assert.equal(await sidebar.getAttribute('data-open'), 'false');
  await sidebarAt('hidden');
  await page.getByTestId('sidebar-toggle').click();
  assert.equal(await sidebar.getAttribute('data-open'), 'true');
  await sidebarAt('shown');
  await page.getByTestId('sync-panel').waitFor();
  await page.screenshot({ path: join(shots, '4-narrow.png') });
  await page.getByTestId('sidebar-backdrop').click({ position: { x: 340, y: 370 } });
  assert.equal(await sidebar.getAttribute('data-open'), 'false');
  await sidebarAt('hidden');
  await page.setViewportSize({ width: 1280, height: 820 });
  console.log('ok  narrow window: the sidebar opens from the toggle and closes on the backdrop');

  // The folder stays bound to this account across a reload; another account does not inherit it.
  await page.reload();
  await page.getByTestId('sync-folder').getByText('shelf-smoke', { exact: true }).waitFor();
  await page.getByTestId('logout').click();
  await page.getByTestId('auth-submit').waitFor();
  console.log('ok  logout');
  const otherEmail = `web-smoke-other-${Date.now()}@shelf.dev`;
  await page.getByTestId('auth-toggle').click();
  await page.waitForURL('**/register');
  await page.getByTestId('auth-name').fill('Інший');
  await page.getByTestId('auth-email').fill(otherEmail);
  await page.getByTestId('auth-password').fill(DEMO_PASSWORD);
  await page.getByTestId('auth-submit').click();
  await page.getByTestId('file-table').waitFor();
  assert.equal((await page.getByTestId('workspace-owner').innerText()).trim(), 'Інший');
  console.log('ok  registration form creates the account and opens the workspace');
  // Positive signal that the binding lookup is over: the database is open and holds only Artem's record.
  const bindings = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('shelf');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const keys = open.result.transaction('bindings').objectStore('bindings').getAllKeys();
          keys.onsuccess = () => resolve(keys.result.length);
        };
      }),
  );
  assert.equal(bindings, 1);
  await page.waitForTimeout(500);
  assert.equal(await page.getByTestId('sync-folder').innerText(), "Не прив'язано");
  await page.getByTestId('logout').click();
  await login(page, email);
  await page.getByTestId('sync-folder').getByText('shelf-smoke', { exact: true }).waitFor();
  console.log('ok  the bound folder belongs to the account');

  // Without the File System Access API (Firefox, Safari) the sync block explains itself instead.
  let plain;
  try {
    plain = await launchBrowser({ folderPicker: 'none' });
    plain.page.on('pageerror', (error) => pageErrors.push(error.message));
    await login(plain.page, email);
    await plain.page.getByTestId('sync-unsupported').waitFor();
    assert.match(await plain.page.getByTestId('sync-unsupported').innerText(), /Chrome і Edge/);
    assert.equal(await plain.page.getByTestId('sync-run').count(), 0);
    console.log('ok  without the File System Access API the sync block is off with an explanation');
  } finally {
    if (plain) {
      await plain.context.close();
      await removeProfile(plain.profile);
    }
  }

  assert.deepEqual(pageErrors, []);
  console.log(`web-smoke: OK (screenshots in ${shots})`);
} finally {
  try {
    if (main) {
      await main.context.close();
      await removeProfile(main.profile);
    }
  } finally {
    await web.stop();
  }
}
