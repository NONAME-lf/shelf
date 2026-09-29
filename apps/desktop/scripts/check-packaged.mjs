// Starts the packaged Shelf.app and logs in with a demo user: proves the bundle contains @shelf/shared and chokidar,
// and that the drag-out icon (resources/drag.png) made it into the asar.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR, launchApp, login, rowNames } from './lib/app.mjs';

const macDir = readdirSync(join(APP_DIR, 'release')).find((name) => name.startsWith('mac'));
assert.ok(macDir, 'release/mac* not found — run pnpm -F @shelf/desktop dist:mac first');
const executablePath = join(APP_DIR, 'release', macDir, 'Shelf.app', 'Contents', 'MacOS', 'Shelf');

const { app, page } = await launchApp({ executablePath });
try {
  const iconLoaded = await app.evaluate(({ app: electronApp, nativeImage }) => {
    const icon = nativeImage.createFromPath(`${electronApp.getAppPath()}/resources/drag.png`);
    return !icon.isEmpty();
  });
  assert.ok(iconLoaded, 'resources/drag.png is missing or empty inside the packaged app');

  await login(page, 'artem@shelf.dev');
  const names = await rowNames(page);
  assert.ok(names.includes('Main.kt'), `unexpected table: ${names.join(', ')}`);
  console.log(`packaged app: OK (${names.length} files for artem@shelf.dev, drag icon loaded)`);
} finally {
  await app.close();
}
