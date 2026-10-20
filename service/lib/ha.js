'use strict';
// «Qué suena» en Spotify, a través de Home Assistant. Nunca lanza: sin
// configuración o con cualquier error devuelve { playing: false }.
var getJson = require('./http').getJson;

function fetchNowPlaying(cfg, get, log) {
  var ha = cfg && cfg.ha;
  if (!ha || !ha.url || !ha.token || !ha.spotifyEntity) return Promise.resolve({ playing: false });
  var base = String(ha.url).replace(/\/+$/, '');
  var url = base + '/api/states/' + encodeURIComponent(ha.spotifyEntity);
  return (get || getJson)(url, { Authorization: 'Bearer ' + ha.token }).then(function (res) {
    if (log && log.ok) log.ok();
    if (!res || res.state !== 'playing') return { playing: false };
    var a = res.attributes || {};
    var out = {
      playing: true,
      title: typeof a.media_title === 'string' ? a.media_title : '',
      artist: typeof a.media_artist === 'string' ? a.media_artist : ''
    };
    // entity_picture es una ruta relativa con su propio token temporal en la query
    if (typeof a.entity_picture === 'string' && a.entity_picture) {
      out.image = /^https?:\/\//.test(a.entity_picture) ? a.entity_picture : base + a.entity_picture;
    }
    return out;
  }).catch(function (e) {
    if (log) log('nowPlaying: ' + (e && e.message));
    return { playing: false };
  });
}

module.exports = { fetchNowPlaying: fetchNowPlaying };
