'use strict';
// «Seguir viendo» de Jellyfin. Las imágenes no necesitan autenticación.
var getJson = require('./http').getJson;

var TICKS_PER_MINUTE = 600000000; // 1 tick = 100 ns

function subtitleOf(it) {
  if (it.Type === 'Episode') {
    var n = '';
    if (it.ParentIndexNumber != null && it.IndexNumber != null) n = 'T' + it.ParentIndexNumber + ' E' + it.IndexNumber;
    if (n && it.SeriesName) return n + ' · ' + it.SeriesName;
    return n || it.SeriesName || '';
  }
  return it.ProductionYear ? String(it.ProductionYear) : '';
}

function mapItem(base, it) {
  var run = Number(it.RunTimeTicks) || 0;
  var pos = Number(it.UserData && it.UserData.PlaybackPositionTicks) || 0;
  var tag = it.ImageTags && it.ImageTags.Primary;
  return {
    id: it.Id,
    title: it.Name || '',
    subtitle: subtitleOf(it),
    progress: run > 0 ? Math.min(1, Math.max(0, pos / run)) : 0,
    minutesLeft: run > pos ? Math.round((run - pos) / TICKS_PER_MINUTE) : 0,
    image: tag ? base + '/Items/' + it.Id + '/Images/Primary?maxHeight=300&tag=' + encodeURIComponent(tag) : null
  };
}

// cfg = contenido completo de config.json. Nunca lanza: sin configuración o con
// error de red devuelve [].
function fetchResume(cfg, get, log) {
  var jf = cfg && cfg.jellyfin;
  if (!jf || !jf.url || !jf.apiKey || !jf.userId) return Promise.resolve([]);
  var base = String(jf.url).replace(/\/+$/, '');
  var url = base + '/Users/' + encodeURIComponent(jf.userId) +
    '/Items/Resume?Limit=8&MediaTypes=Video&Fields=PrimaryImageAspectRatio';
  // Jellyfin 12 solo acepta esta cabecera (X-Emby-Token y ?api_key dan 401).
  return (get || getJson)(url, { Authorization: 'MediaBrowser Token="' + jf.apiKey + '"' }).then(function (res) {
    if (log && log.ok) log.ok();
    var list = res && Array.isArray(res.Items) ? res.Items : [];
    return list.filter(function (it) { return it && it.Id; }).map(function (it) { return mapItem(base, it); });
  }).catch(function (e) {
    if (log) log('resume: ' + (e && e.message));
    return [];
  });
}

module.exports = { fetchResume: fetchResume };
