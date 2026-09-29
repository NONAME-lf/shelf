// Captures the stage 2 report screenshots. Precondition: a fresh stack with demo data:
//   pnpm stack:reset && pnpm stack:up && pnpm seed
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchApp, login, loginUser, REPO_DIR, SERVER, uploadText } from './lib/app.mjs';

const OUT = join(REPO_DIR, 'docs/reports/img/stage2');
await mkdir(OUT, { recursive: true });
const folder = await mkdtemp('/tmp/Shelf-') // a short, readable path for the sidebar;
await writeFile(join(folder, 'lab-notes.txt'), 'Нотатки до лабораторної: перевірити синхронізацію.\n');

// Report crops in CSS pixels (the images are taken at device scale 2): the login and registration
// forms without the empty background, the Swagger column without its side margins.
const FORM_CLIP = { x: 390, y: 100, width: 500, height: 588 };
const SWAGGER_CLIP = { x: 265, y: 0, width: 750, height: 712 };

const { app, page } = await launchApp({ settings: { folderPath: folder } });
const shot = async (name, clip) => {
  await page.mouse.move(1100, 780); // park the pointer on empty space: no leftover row hover
  await page.evaluate(() => document.activeElement?.blur()); // and drop focus left from a closed dialog
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${name}.png`), clip });
  console.log(`saved ${name}.png`);
};
const row = (name) => page.locator(`[data-testid="file-row"][data-name="${name}"]`);

try {
  await page.getByTestId('auth-email').fill('artem@shelf.dev');
  await page.getByTestId('auth-password').fill('shelf-demo-2026');
  await shot('01-login', FORM_CLIP);
  await page.getByTestId('auth-toggle').click();
  await page.getByTestId('auth-name').fill('Олена');
  await page.getByTestId('auth-email').fill('olena@shelf.dev');
  await shot('02-register', FORM_CLIP);
  await page.getByTestId('auth-toggle').click();
  await login(page, 'artem@shelf.dev');
  await shot('03-workspace');

  await page.getByTestId('sort-name').click();
  await shot('04-sort-desc');
  await page.getByTestId('sort-name').click();
  await page.getByTestId('filter-ONLY_CPP').click();
  await shot('05-filter-cpp');
  await page.getByTestId('filter-ONLY_PNG').click();
  await shot('06-filter-png');
  await page.getByTestId('filter-ALL_FILES').click();

  await page.getByTestId('column-size').click();
  await page.getByTestId('column-uploadedBy').click();
  await shot('07-columns');
  await page.getByTestId('column-size').click();
  await page.getByTestId('column-uploadedBy').click();

  await row('Main.kt').click();
  await page.getByTestId('preview-text').waitFor();
  await shot('08-preview-kt');
  await page.keyboard.press('Escape');
  await row('mountains.jpg').click();
  await page.getByTestId('preview-image').waitFor();
  await shot('09-preview-jpg');
  await page.keyboard.press('Escape');
  await row('backup.zip').click();
  await page.getByTestId('preview-unsupported').waitFor();
  await shot('10-preview-none');
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="dropzone"]');
    window.__shelfDrop = new DataTransfer();
    window.__shelfDrop.items.add(new File(['fun greet(name: String) = "Привіт, $name!"\n'], 'Greeting.kt'));
    zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: window.__shelfDrop }));
  });
  await shot('11-upload-dnd');
  await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="dropzone"]');
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__shelfDrop }));
  });
  await row('Greeting.kt').waitFor();
  await shot('12-upload-done');
  await page.getByTestId('notice').getByRole('button').click();

  await page.getByTestId('sync-run').click();
  await page.getByTestId('sync-report').waitFor({ timeout: 30_000 });
  await row('lab-notes.txt').waitFor();
  await shot('13-sync-first');

  // A conflict: edit todo.txt locally, then upload another version as if from another device.
  await writeFile(join(folder, 'todo.txt'), '- здати етап 2\n- змінено локально на ноутбуці\n');
  const localTime = new Date(Date.now() - 5 * 60_000);
  await utimes(join(folder, 'todo.txt'), localTime, localTime);
  await uploadText(await loginUser('artem@shelf.dev'), 'todo.txt', '- здати етап 2\n- змінено у веб-клієнті\n');
  await page.getByTestId('sync-run').click();
  await page.getByTestId('conflict-dialog').waitFor();
  await shot('14-conflict');
  await page.getByTestId('conflict-apply').click();
  await page.getByTestId('sync-report').filter({ hasText: 'Конфліктів: 1' }).waitFor({ timeout: 30_000 });
  await shot('15-sync-report');

  await page.getByTestId('sync-watch').click();
  await page.waitForTimeout(800);
  await writeFile(join(folder, 'watched.kt'), 'fun watched() = true\n');
  await row('watched.kt').waitFor({ timeout: 30_000 });
  await shot('16-watch');

  const nextWindow = app.waitForEvent('window');
  await app.evaluate(async ({ BrowserWindow }, url) => {
    const window = new BrowserWindow({ width: 1280, height: 820, show: true });
    await window.loadURL(url);
  }, `${SERVER}/api/docs`);
  const swagger = await nextWindow;
  await swagger.waitForSelector('.swagger-ui .opblock', { timeout: 30_000 });
  await swagger.evaluate(() => { document.body.style.zoom = '0.5'; }); // fit the whole endpoint list on the page
  await swagger.waitForTimeout(500);
  await swagger.screenshot({ path: join(OUT, '17-swagger.png'), clip: SWAGGER_CLIP });
  console.log('saved 17-swagger.png');
} finally {
  await app.close();
  await rm(folder, { recursive: true, force: true });
}
