// Captura de la pantalla principal en el PC, a 1920×1080, con el bridge falso.
// Uso: node scripts/shot.mjs            -> dist/shots/home.png
//      node scripts/shot.mjs --all      -> además dist/shots/home-bg1..6.png (un fondo cada una)
//      node scripts/shot.mjs --clock12 -> reloj de 12 h
//      node scripts/shot.mjs --focus=up -> pulsa ↑ antes de capturar (foco en las entradas)
//      node scripts/shot.mjs --resume  -> con la fila «Seguir viendo» (fixture de Jellyfin, imágenes de relleno)
//      node scripts/shot.mjs --nowplaying -> con «Qué suena» (Spotify simulado, portada de relleno)
//      node scripts/shot.mjs --settings -> abre «Ajustes» (engranaje + OK) y guarda dist/shots/settings.png
//      node scripts/shot.mjs --apps    -> abre «Más apps» (tecla 4) y guarda dist/shots/apps.png
// Requiere `npm run build` antes. Usa Edge o Chrome instalados (playwright-core).
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const requireCjs = createRequire(import.meta.url);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'dist', 'ipk-root', 'app');
const outDir = join(root, 'dist', 'shots');
if (!existsSync(join(appDir, 'index.html'))) {
  console.error('ERROR: no existe dist/ipk-root/app. Ejecuta antes: npm run build');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const all = args.includes('--all');
const clock12 = args.includes('--clock12'); // reloj de 12 h (para comprobar que no choca con el tiempo)
const wxCode = (args.find((a) => a.startsWith('--wxcode=')) || '').slice(9); // fuerza el codigo WMO actual
const appsShot = args.includes('--apps');
const settingsShot = args.includes('--settings');
const resumeShot = args.includes('--resume'); // fila «Seguir viendo» con la fixture de Jellyfin
const nowShot = args.includes('--nowplaying'); // «Qué suena» simulado
const focusArg = (args.find((a) => a.startsWith('--focus=')) || '').slice(8);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^([\\/])+/, '');
  const file = join(appDir, path || 'index.html');
  if (!file.startsWith(appDir) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/index.html';

// Bridge falso: todas las llamadas responden bien (lanzar apps incluido).
// listApps sale de la fixture real de launch points (por el mismo filtro del servicio),
// con iconos de relleno (letra sobre color) porque los de la TV son rutas locales de ella.
async function mockApps() {
  const lp = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'launchpoints.json'), 'utf8'));
  const list = await requireCjs('../service/lib/apps.js').listApps(() => Promise.resolve(lp));
  return list.map((a, i) => {
    const hue = (i * 47) % 360;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112"><rect width="112" height="112" fill="hsl(' + hue + ',55%,38%)"/><text x="56" y="76" font-size="58" font-family="Arial" font-weight="700" text-anchor="middle" fill="#fff">' + a.title.charAt(0).toUpperCase() + '</text></svg>';
    return { id: a.id, title: a.title, icon: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
  });
}
const APPS_JSON = JSON.stringify(await mockApps());
// «Seguir viendo»: la fixture pasa por el mismo mapeo que usa el servicio.
const RESUME_JSON = JSON.stringify(resumeShot
  ? await requireCjs('../service/lib/jellyfin.js').fetchResume(
      { jellyfin: { url: 'http://jellyfin.test', apiKey: 'x', userId: 'u' } },
      () => Promise.resolve(JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'jellyfin-resume.json'), 'utf8'))))
  : []);
const MOCK = `(() => {
  const APPS = ${APPS_JSON};
  const RESUME = ${RESUME_JSON};
  const NOW = ${nowShot ? "{ returnValue: true, playing: true, title: 'Chandelier', artist: 'Sia', image: 'http://ha.test/cover.svg' }" : "{ returnValue: true, playing: false }"};
  window.PalmServiceBridge = function () {
    this.onservicecallback = null;
    this.call = (uri, params) => {
      const self = this;
      console.log('[mock] ' + uri + ' ' + params);
      const res = uri.endsWith('/listApps') ? { returnValue: true, apps: APPS }
        : uri.endsWith('/volume') ? { returnValue: true, volume: 35, muted: false }
        : uri.endsWith('/status') ? { returnValue: true, root: true, version: '0.1.0' }
        : uri.endsWith('/getHome') ? { returnValue: true, home: 'com.lghome.app', isOurs: true }
        : uri.endsWith('/nowPlaying') ? NOW
        : uri.endsWith('/resume') ? { returnValue: true, items: RESUME } : { returnValue: true };
      setTimeout(() => { if (self.onservicecallback) self.onservicecallback(JSON.stringify(res)); }, 0);
    };
    this.cancel = function () { this.onservicecallback = null; };
  };
})();`;

async function launchBrowser() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel }); } catch (e) { /* probar el siguiente */ }
  }
  return chromium.launch(); // Chromium de PLAYWRIGHT_BROWSERS_PATH (p. ej. /opt/pw-browsers)
}

const browser = await launchBrowser();
async function shoot(file, bgIndex) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.addInitScript(MOCK);
  // Open-Meteo falso: la respuesta guardada en tests/fixtures, para capturas deterministas.
  if (clock12) await page.addInitScript("localStorage.setItem('lghome.settings', JSON.stringify({ clock24: false }))");
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: (() => { const j = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'open-meteo.json'), 'utf8')); if (wxCode) j.current_weather.weathercode = Number(wxCode); return JSON.stringify(j); })() }));
  // Portadas de relleno (degradado + letra) en lugar de pedirlas a Jellyfin.
  await page.route('http://jellyfin.test/**', (route) => {
    const tag = route.request().url().split('tag=')[1] || '?';
    const hue = (tag.charCodeAt(3) * 37) % 360;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="169"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + hue + ',50%,45%)"/><stop offset="1" stop-color="hsl(' + ((hue + 60) % 360) + ',55%,22%)"/></linearGradient></defs><rect width="300" height="169" fill="url(#g)"/></svg>';
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  });
  await page.route('http://ha.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8a33d"/><stop offset="1" stop-color="#7a1f5c"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/></svg>' }));
  if (bgIndex !== undefined) {
    await page.addInitScript(`Date.now = () => ${bgIndex} * 3600000 + 1000;`);
  }
  await page.goto(url);
  await page.waitForSelector('#app[data-ready="1"]');
  await page.evaluate(() => document.fonts.ready);
  if (resumeShot) await page.waitForSelector('.rcard');
  if (nowShot) await page.waitForSelector('.nowplaying .np-t');
  if (focusArg === 'up') await page.keyboard.press('ArrowUp');
  if (focusArg === 'resume') { await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight'); }
  if (focusArg === 'right') await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.weather .wx-day'));
  await page.waitForTimeout(2600); // fundido de entrada del fondo
  if (appsShot) {
    await page.keyboard.press('4');
    await page.waitForSelector('.apps.open .app');
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(700);
    file = file.replace('home.png', 'apps.png');
  }
  if (settingsShot) {
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.settings.open .srow');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(700);
    file = file.replace('home.png', 'settings.png');
  }
  await page.screenshot({ path: file });
  await page.close();
  console.log('captura ->', file);
}

try {
  await shoot(join(outDir, 'home.png'));
  if (all) for (let i = 0; i < 6; i++) await shoot(join(outDir, `home-bg${i + 1}.png`), i);
} finally {
  await browser.close();
  server.close();
}
