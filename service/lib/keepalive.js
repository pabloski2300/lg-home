'use strict';
// Mantiene el servicio residente mientras la TV está encendida.
//
// webos-service 0.0.1 (/usr/lib/node_modules/webos-service/lib/activitymanager.js en la TV)
// hace process.exit(0) cuando pasan `idleTimeout` segundos (5 por defecto) sin actividades
// abiertas. Cada petición crea una actividad y la completa al responder, así que entre dos
// sondeos de la app el servicio moría y la siguiente llamada pagaba ~3 s de arranque de node.
// La forma soportada de evitarlo es abrir una actividad propia y no completarla nunca:
// activityManager.create(nombre) la registra en com.webos.service.activitymanager, `_add`
// para el temporizador y, mientras haya alguna abierta, `_remove` no lo vuelve a armar.
// Es el mismo patrón que usa el servicio del Homebrew Channel. No hay bucles ni temporizadores:
// cuando la TV entra en reposo el proceso se congela con el resto del sistema.
function keepAlive(service, log) {
  var am = service && service.activityManager;
  if (!am || typeof am.create !== 'function') {
    log('keepAlive: sin activityManager; el servicio saldrá al quedar inactivo');
    return;
  }
  am.create('keepAlive', function (activity) {
    if (activity && activity.returnValue === false) {
      log('keepAlive: no se pudo crear la actividad: ' + (activity.errorText || 'error desconocido'));
      return;
    }
    log('keepAlive: actividad ' + (activity && activity.activityId) + ' (el servicio queda residente)');
  });
}

module.exports = { keepAlive: keepAlive };
