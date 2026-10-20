'use strict';
// Registro de LG Home como pantalla de inicio (defaultApps.home).
var APP_ID = 'com.lghome.app';
var LG_HOME = 'com.webos.app.fullhome';
var SETTINGS = 'luna://com.webos.settingsservice/';

function readDefaultApps(luna) {
  return luna(SETTINGS + 'getSystemSettings', { category: 'general', keys: ['defaultApps'] })
    .then(function (res) {
      var apps = res && res.settings && res.settings.defaultApps;
      if (!apps || typeof apps !== 'object') {
        throw new Error('no se pudo leer defaultApps');
      }
      return apps;
    });
}

function getHome(luna) {
  return readDefaultApps(luna).catch(function () { return {}; }).then(function (apps) {
    var home = apps.home || LG_HOME;
    return { home: home, isOurs: home === APP_ID };
  });
}

function setHome(luna, enabled) {
  var target = enabled ? APP_ID : LG_HOME;
  return readDefaultApps(luna).then(function (apps) {
    var merged = {};
    Object.keys(apps).forEach(function (k) { merged[k] = apps[k]; });
    merged.home = target;
    return luna(SETTINGS + 'setSystemSettings', {
      category: 'general',
      settings: { defaultApps: merged }
    });
  }).then(function () { return { home: target }; });
}

module.exports = { APP_ID: APP_ID, LG_HOME: LG_HOME, getHome: getHome, setHome: setHome };
