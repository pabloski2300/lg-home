'use strict';
// GET que devuelve JSON, con http/https de Node 8. Los errores nunca incluyen
// las cabeceras (pueden llevar claves).
var http = require('http');
var https = require('https');
var urlmod = require('url');

var MAX_BYTES = 2 * 1024 * 1024;

function getJson(url, headers, timeoutMs) {
  var limit = timeoutMs || 5000;
  return new Promise(function (resolve, reject) {
    var u;
    try { u = urlmod.parse(url); } catch (e) { reject(new Error('URL no válida')); return; }
    var lib = u.protocol === 'https:' ? https : http;
    var done = false;
    var req;
    var timer = setTimeout(function () { end(new Error('tiempo agotado')); }, limit); // plazo total
    function end(err, val) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err && req) req.abort();
      if (err) reject(err); else resolve(val);
    }
    req = lib.get({
      protocol: u.protocol, hostname: u.hostname, port: u.port, path: u.path,
      headers: Object.assign({ Accept: 'application/json' }, headers || {})
    }, function (res) {
      var chunks = [];
      var size = 0;
      res.on('data', function (c) {
        size += c.length;
        if (size > MAX_BYTES) { end(new Error('respuesta demasiado grande')); return; }
        chunks.push(c);
      });
      res.on('end', function () {
        if (res.statusCode < 200 || res.statusCode >= 300) { end(new Error('HTTP ' + res.statusCode)); return; }
        try { end(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { end(new Error('respuesta no es JSON')); }
      });
      res.on('error', function (e) { end(new Error(e.code || 'error de lectura')); });
    });
    req.on('error', function (e) { end(new Error(e.code || 'error de red')); });
  });
}

module.exports = { getJson: getJson, MAX_BYTES: MAX_BYTES };
