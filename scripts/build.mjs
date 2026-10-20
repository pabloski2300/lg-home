import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGeo } from './geo.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'ipk-root');
const { geo, path: geoFrom } = readGeo(root);
console.log(`tiempo: ${geo.city} (${geo.lat}, ${geo.lon}, ${geo.tz}) <- ${geoFrom}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'app'), join(out, 'app'), { recursive: true });
cpSync(join(root, 'service'), join(out, 'service'), {
  recursive: true,
  filter: (src) => !/config\.json$/.test(src),
});

await build({
  entryPoints: [join(root, 'src', 'main.ts')],
  outfile: join(out, 'app', 'main.js'),
  bundle: true,
  format: 'iife',
  define: { __LGHOME_GEO__: JSON.stringify(geo) },
  // chrome68 admite `catch {}` (ES2019) y esbuild lo emitiría; es2017 lo evita
  // para que el bundle pase es-check es2017.
  target: ['chrome68', 'es2017'],
  minify: true,
});
await build({
  entryPoints: [join(root, 'src', 'styles', 'main.css')],
  outfile: join(out, 'app', 'main.css'),
  bundle: true,
  // Fuentes e imágenes viven en app/assets y se copian tal cual: no se empaquetan.
  external: ['assets/*'],
  target: 'chrome68',
  minify: true,
});
console.log('build ok ->', out);
