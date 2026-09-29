// End-to-end smoke test of the built app against the running API (pnpm stack:up).
// Uses a fresh account so the demo users stay untouched.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, login, registerUser, rowNames, uploadDemoFile } from './lib/app.mjs';

const email = `smoke-${Date.now()}@shelf.dev`;
const token = await registerUser(email, 'Смоук');
for (const name of ['Main.kt', 'geometry.cpp', 'matrix.cpp', 'shelf-logo.png', 'mountains.jpg', 'backup.zip']) {
  await uploadDemoFile(token, name);
}

const shots = process.env.SHELF_SMOKE_DIR ?? (await mkdtemp(join(tmpdir(), 'shelf-smoke-shots-')));
const folder = await mkdtemp(join(tmpdir(), 'shelf-smoke-folder-'));
await writeFile(join(folder, 'smoke-local.txt'), 'created by the smoke test\n');

const { app, page } = await launchApp({ settings: { folderPath: folder } });
try {
  await login(page, email);
  assert.deepEqual(await rowNames(page), ['backup.zip', 'geometry.cpp', 'Main.kt', 'matrix.cpp', 'mountains.jpg', 'shelf-logo.png']);
  console.log('ok  table sorted ascending');

  await page.getByTestId('sort-name').click();
  await page.getByTestId('filter-ONLY_CPP').click();
  assert.deepEqual(await rowNames(page), ['matrix.cpp', 'geometry.cpp']);
  console.log('ok  descending + only .cpp');
  await page.getByTestId('filter-ONLY_PNG').click();
  assert.deepEqual(await rowNames(page), ['shelf-logo.png']);
  console.log('ok  only .png');
  await page.getByTestId('filter-ALL_FILES').click();

  await page.getByTestId('column-uploadedBy').click();
  assert.equal(await page.locator('th', { hasText: 'Хто завантажив' }).count(), 0);
  console.log('ok  column hidden');
  await page.getByTestId('column-uploadedBy').click();

  await page.locator('[data-testid="file-row"][data-name="Main.kt"]').click();
  await page.getByTestId('preview-text').waitFor();
  assert.match(await page.getByTestId('preview-text').innerText(), /Полиця/);
  await page.screenshot({ path: join(shots, '1-preview-kt.png') });
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="file-row"][data-name="mountains.jpg"]').click();
  await page.getByTestId('preview-image').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="file-row"][data-name="backup.zip"]').click();
  await page.getByTestId('preview-unsupported').waitFor();
  await page.keyboard.press('Escape');
  console.log('ok  preview .kt / .jpg / unsupported');

  // An internal drag (no OS files) must not open the upload overlay.
  const dragEnter = (withFiles) =>
    page.evaluate((withFiles) => {
      const zone = document.querySelector('[data-testid="dropzone"]');
      const data = new DataTransfer();
      if (withFiles) data.items.add(new File(['x'], 'outside.txt'));
      else data.setData('text/plain', 'row');
      zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: data }));
    }, withFiles);
  const dropzoneActive = () => page.getByTestId('dropzone').getAttribute('data-active');
  await dragEnter(false);
  assert.equal(await dropzoneActive(), 'false');
  console.log('ok  internal drag ignored by the drop zone');

  // Positive control: a drag with OS files does open it, and leaving closes it again.
  await dragEnter(true);
  assert.equal(await dropzoneActive(), 'true');
  await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="dropzone"]');
    const data = new DataTransfer();
    data.items.add(new File(['x'], 'outside.txt'));
    zone.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: data }));
  });
  assert.equal(await dropzoneActive(), 'false');
  console.log('ok  drag with OS files activates the drop zone and leaving deactivates it');

  // Dragging a row out starts a native drag of a real file; while it runs the drop zone must stay closed.
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="file-row"][data-name="Main.kt"]');
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
  });
  await dragEnter(true);
  assert.equal(await dropzoneActive(), 'false');
  await page.mouse.move(700, 500);
  await page.mouse.move(720, 520);
  await dragEnter(true);
  assert.equal(await dropzoneActive(), 'true');
  await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="dropzone"]');
    const data = new DataTransfer();
    data.items.add(new File(['x'], 'outside.txt'));
    zone.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: data }));
  });
  assert.equal(await dropzoneActive(), 'false');
  console.log('ok  drop zone stays closed during a row drag-out and works again afterwards');

  // Dropping a 51 MB file with a small one: the big one is skipped, the small one uploaded.
  await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="dropzone"]');
    const data = new DataTransfer();
    data.items.add(new File(['val x = 1\n'], 'dropped.kt'));
    data.items.add(new File([new Uint8Array(51 * 1024 * 1024)], 'huge.bin'));
    zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: data }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  });
  await page.getByTestId('notice').waitFor();
  const notice = await page.getByTestId('notice').innerText();
  assert.match(notice, /Завантажено файлів: 1/);
  assert.match(notice, /Більші за 50 МБ і пропущені: huge\.bin/);
  assert.doesNotMatch(notice, /Помилки/);
  await page.locator('[data-testid="file-row"][data-name="dropped.kt"]').waitFor();
  console.log('ok  drop uploads small files and skips files above 50 MB');

  await page.getByTestId('upload-input').setInputFiles({ name: 'picked.txt', mimeType: 'text/plain', buffer: Buffer.from('picked\n') });
  const picked = page.locator('[data-testid="file-row"][data-name="picked.txt"]');
  await picked.waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await picked.getByRole('button', { name: 'Видалити' }).click();
  await picked.waitFor({ state: 'detached' });
  console.log('ok  upload by button and delete');

  await page.getByTestId('sync-run').click();
  await page.getByTestId('sync-report').waitFor({ timeout: 30_000 });
  await page.screenshot({ path: join(shots, '2-sync.png') });
  const local = (await readdir(folder)).filter((name) => !name.startsWith('.')).sort();
  assert.ok(local.includes('Main.kt') && local.includes('smoke-local.txt'));
  await page.locator('[data-testid="file-row"][data-name="smoke-local.txt"]').waitFor();
  console.log('ok  sync downloaded the workspace and uploaded smoke-local.txt');

  await page.getByTestId('logout').click();
  await page.getByTestId('auth-submit').waitFor();
  console.log('ok  logout');
  console.log(`desktop-smoke: OK (screenshots in ${shots})`);
} finally {
  await app.close();
}
