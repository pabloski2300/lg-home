import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ipkRoot = join(root, 'dist', 'ipk-root');

// Con Node nuevo ares-package puede dejar mtimes 1970 en el tar; webOS 5 los rechaza.
// Ponemos una fecha real en todos los ficheros y directorios antes de empaquetar.
function touchAll(dir, when) {
  utimesSync(dir, when, when);
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) touchAll(p, when);
    else utimesSync(p, when, when);
  }
}
touchAll(ipkRoot, new Date());

const bin = join(root, 'node_modules', '@webos-tools', 'cli', 'bin', 'ares-package.js');
execFileSync(
  process.execPath,
  [bin, join(ipkRoot, 'app'), join(ipkRoot, 'service'), '-o', join(root, 'dist')],
  { stdio: 'inherit' },
);
const version = JSON.parse(readFileSync(join(root, 'app', 'appinfo.json'), 'utf8')).version;
console.log('ipk ->', join(root, 'dist', `com.lghome.app_${version}_all.ipk`));
