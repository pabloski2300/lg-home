'use strict';
// Lista de apps instaladas (launch points) y lanzamiento de apps.
var fs = require('fs');
var path = require('path');
var LM = 'luna://com.webos.applicationManager/';

// Fuera de la cuadrícula: nosotros, el dock, los inicios de LG y las entradas
// HDMI que ya son píldoras en la pantalla principal.
var EXCLUDED = [
  'com.lghome.app',
  'youtube.leanback.v4', 'spotify-beehive', 'org.jellyfin.webos',
  'com.webos.app.fullhome', 'com.webos.app.home',
  'com.webos.app.hdmi1', 'com.webos.app.hdmi2'
];

function listApps(luna) {
  return luna(LM + 'listLaunchPoints', {}).then(function (res) {
    var lps = (res && res.launchPoints) || [];
    var out = [];
    for (var i = 0; i < lps.length; i++) {
      var lp = lps[i];
      if (!lp || !lp.id || lp.visible === false || EXCLUDED.indexOf(lp.id) !== -1) continue;
      out.push({ id: lp.id, title: String(lp.title || lp.id), icon: lp.largeIcon || lp.icon || '' });
    }
    return out;
  });
}

function launch(luna, id, params) {
  if (!id || typeof id !== 'string') return Promise.reject(new Error('falta el id de la app'));
  var body = { id: id };
  if (params && typeof params === 'object') body.params = params;
  return luna(LM + 'launch', body);
}

// El motor web de la app no puede leer iconos de otras carpetas de la TV (file:// ajeno
// falla), así que se copian a una carpeta dentro de la propia app y se devuelve la ruta
// relativa. Si un icono no se puede copiar se deja vacío (la app pinta una letra).
var ICON_ROOTS = ['/media/', '/usr/palm/', '/mnt/otncabi/'];
var ICON_EXT = /\.(png|jpe?g|svg|webp)$/i;

// opts: { fs, log(msg), roots } (inyectables para los tests). Solo se copian ficheros de
// imagen cuya ruta real cuelga de las raíces de apps de la TV.
function cacheIcons(list, dir, opts) {
  opts = opts || {};
  var f = opts.fs || fs;
  var log = opts.log || function () {};
  var roots = opts.roots || ICON_ROOTS;
  var failed = 0;
  var firstErr = '';
  function fail(e) { failed++; if (!firstErr) firstErr = String((e && e.message) || e); }
  try { f.mkdirSync(dir); } catch (e) { if (!e || e.code !== 'EEXIST') fail(e); }
  var out = list.map(function (a) {
    var res = { id: a.id, title: a.title, icon: '' };
    if (!a.icon) return res;
    try {
      var real = f.realpathSync(a.icon);
      var ok = ICON_EXT.test(real) && roots.some(function (r) { return real.indexOf(r) === 0; });
      if (!ok) return res;
      var name = a.id.replace(/[^A-Za-z0-9._-]/g, '_') + path.extname(real).toLowerCase();
      var dest = path.join(dir, name);
      var same = false;
      try { same = f.statSync(dest).size === f.statSync(real).size; } catch (e) { same = false; }
      if (!same) {
        var tmp = dest + '.tmp';
        f.copyFileSync(real, tmp);
        f.renameSync(tmp, dest);
      }
      res.icon = 'icons/' + name;
    } catch (e) { fail(e); }
    return res;
  });
  if (failed) log('cacheIcons: ' + failed + ' fallo(s); primero: ' + firstErr);
  return out;
}

module.exports = {
  cacheIcons: cacheIcons, EXCLUDED: EXCLUDED, listApps: listApps, launch: launch };
