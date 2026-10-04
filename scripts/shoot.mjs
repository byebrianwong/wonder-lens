// Saves snapshots of the ride from the dev server's /shot.html (see src/dev/shot.ts), with their stats.
// usage: npm run dev, then: node scripts/shoot.mjs <out_dir> "name|w=anderson&z=-200&yaw=30" "name2|..."
// Needs Playwright with Chromium. Claude Code cloud sessions have it installed globally at /opt/node-tools;
// elsewhere, install it (npm i -D playwright) or set PLAYWRIGHT to its index.mjs.
const pw = await import(process.env.PLAYWRIGHT ?? 'playwright').catch(() => import('/opt/node-tools/node_modules/playwright/index.mjs'));
const { chromium } = pw;
const [, , outDir, ...specs] = process.argv;
const base = process.env.BASE ?? 'http://localhost:5173/shot.html';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const spec of specs) {
  const [name, query] = spec.split('|');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  const t0 = Date.now();
  try {
    await page.goto(`${base}?${query}`, { timeout: 120000 });
    await page.waitForFunction(() => window.__done, null, { timeout: 300000, polling: 500 });
    const info = await page.evaluate(() => window.__done);
    await page.locator('canvas').screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
    console.log(name, JSON.stringify(info), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) { console.log(name, 'FAILED', e.message.split('\n')[0]); }
  for (const e of errs.slice(0, 8)) console.log('   ', e.slice(0, 300));
  await page.close();
}
await browser.close();
