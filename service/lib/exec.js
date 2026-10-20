'use strict';
// Utilidades compartidas del servicio (Node 8, CommonJS).
var fs = require('fs');
var cp = require('child_process');

var LOG_FILE = process.env.LG_HOME_LOG || '/tmp/lg-home.log';
// /tmp es tmpfs (RAM) en webOS: el log no puede crecer sin límite.
var MAX_LOG_BYTES = 256 * 1024;

// Registrador con tope: al pasar de maxBytes se vacía el fichero y se sigue.
function createLogger(file, maxBytes) {
  return function (msg) {
    try {
      var size = 0;
      try { size = fs.statSync(file).size; } catch (e) { size = 0; }
      if (size > maxBytes) fs.writeFileSync(file, '');
      fs.appendFileSync(file, new Date().toISOString() + ' ' + String(msg) + '\n');
    } catch (e) { /* el log nunca debe romper el servicio */ }
  };
}

// Añade una línea con hora al log. Nunca pasar credenciales.
var log = createLogger(LOG_FILE, MAX_LOG_BYTES);

// Registro por cambio de estado para fuentes que se consultan en bucle (HA, Jellyfin,
// volumen): solo anota el primer fallo (o un fallo distinto) y la recuperación.
// Devuelve fn(msg) para los fallos (el mensaje ya lleva su prefijo), con fn.ok() para los éxitos.
function createStateLog(write) {
  var last = {};
  return function stateLog(key) {
    var fail = function (msg) {
      var m = String(msg);
      if (last[key] === m) return;
      last[key] = m;
      write(m);
    };
    fail.ok = function () {
      if (last[key] === undefined) return;
      delete last[key];
      write(key + ': recuperado');
    };
    return fail;
  };
}
var stateLog = createStateLog(log);

// Ejecuta luna-send y devuelve el JSON; rechaza si returnValue === false.
function lunaSend(uri, payload, timeoutMs) {
  var timeout = timeoutMs || 8000;
  return new Promise(function (resolve, reject) {
    var args = ['-n', '1', '-w', String(timeout), uri, JSON.stringify(payload || {})];
    cp.execFile('luna-send', args, { timeout: timeout + 2000 }, function (err, stdout) {
      if (err) { reject(err); return; }
      var res;
      try { res = JSON.parse(String(stdout).trim().split('\n')[0]); }
      catch (e) { reject(new Error('respuesta no JSON de ' + uri)); return; }
      if (res && res.returnValue === false) {
        reject(new Error(res.errorText || ('fallo en ' + uri)));
        return;
      }
      resolve(res);
    });
  });
}

module.exports = {
  log: log, lunaSend: lunaSend, stateLog: stateLog,
  createLogger: createLogger, createStateLog: createStateLog, MAX_LOG_BYTES: MAX_LOG_BYTES
};
