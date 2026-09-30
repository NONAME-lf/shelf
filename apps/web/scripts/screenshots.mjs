// Captures the stage 3 report screenshots of the web client. Precondition: a fresh stack with demo data:
//   pnpm stack:reset && pnpm stack:up && pnpm seed
// then `pnpm -F @shelf/web screenshots` (SHELF_WEB_PORT moves the client off a busy port 3000).
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// The sidebar shows the name of the bound folder, so it is called Shelf instead of the smoke test's folder.
process.env.SHELF_SYNC_DIR = 'Shelf';
const { api, launchBrowser, login, opfs, REPO_DIR, removeProfile, startWeb, SYNC_DIR, uploadText } = await import('./lib/web.mjs');

const OUT = join(REPO_DIR, 'docs/reports/img/stage3');
const PROD_WEB = 'https://shelf-opal-two.vercel.app';
const PROD_API = 'https://shelf-api-l989.onrender.com';
const EMAIL = 'artem@shelf.dev';
const PASSWORD = 'shelf-demo-2026';
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
// Crops in CSS pixels (device scale 2): the forms without the empty background, the Swagger column.
const FORM_CLIP = { x: 390, y: 100, width: 500, height: 588 };
const SWAGGER_CLIP = { x: 265, y: 0, width: 750, height: 712 };

await mkdir(OUT, { recursive: true });
const token = (await api('/auth/login', { method: 'POST', json: { email: EMAIL, password: PASSWORD } })).accessToken;

const shooter = (page) => async (name, clip) => {
  await page.mouse.move(DESKTOP.width - 180, DESKTOP.height - 20); // park the pointer on empty space
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${name}.png`), clip });
  console.log(`saved ${name}.png`);
};
const rowOf = (page, name) => page.locator(`[data-testid="file-row"][data-name="${name}"]`);

const clearFolder = (page) =>
  page.evaluate(async (dir) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(dir, { recursive: true }).catch(() => undefined);
  }, SYNC_DIR);

const web = await startWeb();
let main;
let plain;
let prod;
try {
  main = await launchBrowser({ viewport: DESKTOP, deviceScaleFactor: 2 });
  const { page } = main;
  const shot = shooter(page);
  const row = (name) => rowOf(page, name);
  await page.goto('/login');
  await clearFolder(page);
  await opfs.write(page, 'lab-notes.txt', 'Нотатки до лабораторної: перевірити синхронізацію.\n');

  await page.getByTestId('auth-email').fill(EMAIL);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await shot('01-login', FORM_CLIP);
  await page.getByTestId('auth-toggle').click();
  await page.waitForURL('**/register');
  await page.getByTestId('auth-name').fill('Олена');
  await page.getByTestId('auth-email').fill('olena@shelf.dev');
  await shot('02-register', FORM_CLIP);
  await login(page, EMAIL);
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
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="preview-image"]');
    return img && (img.tagName !== 'IMG' || (img.complete && img.naturalWidth > 0));
  });
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
  await page.waitForFunction(() => document.querySelector('[data-testid="dropzone"]').dataset.active === 'true');
  await shot('11-upload-dnd');
  await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="dropzone"]');
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__shelfDrop }));
  });
  await row('Greeting.kt').waitFor();
  await page.getByTestId('notice').waitFor();
  await shot('12-upload-done');
  await page.getByTestId('notice').getByRole('button').click();

  await page.getByTestId('sync-run').click();
  await page.getByTestId('sync-report').waitFor({ timeout: 30_000 });
  await row('lab-notes.txt').waitFor();
  await page.getByTestId('sync-folder').getByText(SYNC_DIR, { exact: true }).waitFor();
  await shot('13-sync-first');

  // A conflict: another version of todo.txt is uploaded, then the local one is edited later.
  await uploadText(token, 'todo.txt', '- здати етап 3\n- змінено у веб-клієнті\n');
  await opfs.write(page, 'todo.txt', '- здати етап 3\n- змінено локально на ноутбуці, дописано ще рядок\n');
  await page.getByTestId('sync-run').click();
  await page.getByTestId('conflict-dialog').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="conflict-LOCAL"]').checked === true);
  await shot('14-conflict');
  await page.getByTestId('conflict-apply').click();
  await page.getByTestId('conflict-dialog').waitFor({ state: 'hidden' });
  await page.getByTestId('sync-report').filter({ hasText: 'Конфліктів: 1' }).waitFor({ timeout: 30_000 });
  await shot('15-sync-report');

  await page.getByTestId('sync-watch').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="sync-watch"]').checked === true);
  await page.waitForTimeout(800);
  await opfs.write(page, 'watched.kt', 'fun watched() = true\n');
  await row('watched.kt').waitFor({ timeout: 30_000 });
  await shot('16-watch');
  await page.getByTestId('sync-watch').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="sync-watch"]').checked === false);

  await page.setViewportSize(MOBILE);
  const sidebarAt = (where) =>
    page.waitForFunction((where) => {
      const box = document.querySelector('[data-testid="sidebar"]').getBoundingClientRect();
      return where === 'hidden' ? box.right <= 0 : box.left >= 0;
    }, where);
  await sidebarAt('hidden');
  const mobileShot = async (name) => {
    await page.mouse.move(MOBILE.width - 20, MOBILE.height - 20); // empty space below the table
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`saved ${name}.png`);
  };
  await mobileShot('17-mobile');
  await page.getByTestId('sidebar-toggle').click();
  await sidebarAt('shown');
  await page.getByTestId('sync-panel').waitFor();
  await mobileShot('18-mobile-menu');
  await page.setViewportSize(DESKTOP);

  // Without the File System Access API (Firefox, Safari) the sync block explains itself instead.
  plain = await launchBrowser({ folderPicker: 'none', viewport: DESKTOP, deviceScaleFactor: 2 });
  await login(plain.page, EMAIL);
  await plain.page.getByTestId('sync-unsupported').waitFor();
  await shooter(plain.page)('19-unsupported');

  // Production is only looked at: logging in creates no data.
  prod = await launchBrowser({ viewport: DESKTOP, deviceScaleFactor: 2 });
  const prodPage = prod.page;
  await prodPage.goto(`${PROD_WEB}/login`);
  await prodPage.getByTestId('auth-email').fill(EMAIL);
  await prodPage.getByTestId('auth-password').fill(PASSWORD);
  await prodPage.getByTestId('auth-submit').click();
  await prodPage.getByTestId('file-table').waitFor({ timeout: 90_000 });
  await rowOf(prodPage, 'Main.kt').waitFor({ timeout: 90_000 });
  await shooter(prodPage)('20-prod-workspace');
  await prodPage.goto(`${PROD_API}/api/docs`);
  await prodPage.waitForSelector('.swagger-ui .opblock', { timeout: 90_000 });
  await prodPage.evaluate(() => {
    document.body.style.zoom = '0.5'; // fit the whole endpoint list on the page
  });
  await prodPage.waitForTimeout(500);
  await prodPage.screenshot({ path: join(OUT, '21-prod-swagger.png'), clip: SWAGGER_CLIP });
  console.log('saved 21-prod-swagger.png');
} finally {
  for (const browser of [prod, plain, main]) {
    if (!browser) continue;
    try {
      await browser.context.close();
    } finally {
      await removeProfile(browser.profile);
    }
  }
  await web.stop();
}
