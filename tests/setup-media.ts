// jsdom no implementa la reproducción de medios: evitamos el ruido «Not implemented».
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () { /* nada */ };
}
