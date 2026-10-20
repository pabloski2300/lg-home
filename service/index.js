'use strict';
var Service = require('webos-service');
var pkg = require('./package.json');
var path = require('path');
var exec = require('./lib/exec');
var home = require('./lib/home');
var apps = require('./lib/apps');
var vol = require('./lib/volume');
var config = require('./lib/config');
var jellyfin = require('./lib/jellyfin');
var ha = require('./lib/ha');
var keepalive = require('./lib/keepalive');

// Carpeta de iconos dentro de la propia app (la web solo lee su carpeta).
var ICON_DIR = path.resolve(__dirname, '..', '..', 'applications', 'com.lghome.app', 'icons');

var service = new Service('com.lghome.app.service');

service.register('status', function (message) {
  message.respond({
    returnValue: true,
    root: process.getuid() === 0,
    version: pkg.version
  });
});

service.register('getHome', function (message) {
  home.getHome(exec.lunaSend).then(function (r) {
    message.respond({ returnValue: true, home: r.home, isOurs: r.isOurs });
  }).catch(function (e) {
    exec.log('getHome: ' + e.message);
    message.respond({ returnValue: false, errorText: e.message });
  });
});

service.register('setHome', function (message) {
  var enabled = !!(message.payload && message.payload.enabled);
  home.setHome(exec.lunaSend, enabled).then(function (r) {
    exec.log('setHome(' + enabled + ') -> ' + r.home);
    message.respond({ returnValue: true, home: r.home });
  }).catch(function (e) {
    exec.log('setHome: ' + e.message);
    message.respond({ returnValue: false, errorText: e.message });
  });
});

service.register('listApps', function (message) {
  apps.listApps(exec.lunaSend).then(function (list) {
    message.respond({ returnValue: true, apps: apps.cacheIcons(list, ICON_DIR, { log: exec.log }) });
  }).catch(function (e) {
    exec.log('listApps: ' + e.message);
    message.respond({ returnValue: false, errorText: e.message });
  });
});

service.register('launch', function (message) {
  var p = message.payload || {};
  apps.launch(exec.lunaSend, p.id, p.params).then(function () {
    message.respond({ returnValue: true });
  }).catch(function (e) {
    exec.log('launch ' + p.id + ': ' + e.message);
    message.respond({ returnValue: false, errorText: e.message });
  });
});

service.register('volume', function (message) {
  var p = message.payload || {};
  vol.volume(exec.lunaSend, p.action, p.value).then(function (r) {
    volumeLog.ok();
    message.respond({ returnValue: true, volume: r.volume, muted: r.muted });
  }).catch(function (e) {
    volumeLog('volume ' + p.action + ': ' + e.message);
    message.respond({ returnValue: false, errorText: e.message });
  });
});

var resumeLog = exec.stateLog('resume');
var nowPlayingLog = exec.stateLog('nowPlaying');
var volumeLog = exec.stateLog('volume');

service.register('resume', function (message) {
  jellyfin.fetchResume(config.readConfig(), undefined, resumeLog).then(function (items) {
    message.respond({ returnValue: true, items: items });
  }).catch(function (e) {
    exec.log('resume: ' + e.message);
    message.respond({ returnValue: true, items: [] });
  });
});

service.register('nowPlaying', function (message) {
  ha.fetchNowPlaying(config.readConfig(), undefined, nowPlayingLog).then(function (r) {
    message.respond({ returnValue: true, playing: r.playing, title: r.title, artist: r.artist, image: r.image });
  }).catch(function (e) {
    exec.log('nowPlaying: ' + e.message);
    message.respond({ returnValue: true, playing: false });
  });
});

exec.log('servicio iniciado');
// Sin esto webos-service sale a los 5 s sin peticiones y cada sondeo de la app relanzaba node (~3 s de CPU).
keepalive.keepAlive(service, exec.log);
