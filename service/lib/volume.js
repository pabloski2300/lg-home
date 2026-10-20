'use strict';
// Volumen de los altavoces de la TV (com.webos.audio). volumeUp/volumeDown/setVolume
// solo devuelven returnValue, así que tras cada orden se vuelve a leer el estado.
var AUDIO = 'luna://com.webos.audio/';
// getVolume no informa del silencio; este adaptador sí (mute + volume).
var STATUS = 'luna://com.webos.service.apiadapter/audio/getStatus';

function read(luna) {
  return luna(AUDIO + 'getVolume', {}).then(function (r) {
    var v = Number(r && r.volume);
    if (!isFinite(v)) throw new Error('respuesta de volumen no válida');
    return luna(STATUS, {}).then(
      function (s) { return { volume: v, muted: !!(s && s.mute) }; },
      function () { return { volume: v, muted: false }; }
    );
  });
}

function volume(luna, action, value) {
  if (action === 'get') return read(luna);
  if (action === 'up' || action === 'down') {
    return luna(AUDIO + (action === 'up' ? 'volumeUp' : 'volumeDown'), {}).then(function () { return read(luna); });
  }
  if (action === 'set') {
    var n = Number(value);
    if (typeof value === 'boolean' || value === null || value === '' || !isFinite(n)) {
      return Promise.reject(new Error('value debe ser un número'));
    }
    var v = Math.max(0, Math.min(100, Math.round(n)));
    return luna(AUDIO + 'setVolume', { volume: v }).then(function () { return read(luna); });
  }
  return Promise.reject(new Error('acción de volumen desconocida: ' + action));
}

module.exports = { volume: volume };
