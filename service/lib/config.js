'use strict';
// Configuración con credenciales, solo en la TV (fuera del paquete). Si falta o
// está rota se devuelve {} y cada función se desactiva sola.
var fs = require('fs');

var DEFAULT_PATH = '/home/root/.config/lg-home/config.json';

function readConfig(path) {
  try {
    var cfg = JSON.parse(fs.readFileSync(path || DEFAULT_PATH, 'utf8'));
    return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {};
  } catch (e) {
    return {};
  }
}

module.exports = { readConfig: readConfig, DEFAULT_PATH: DEFAULT_PATH };
