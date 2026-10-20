import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const ha = require('../../service/lib/ha.js');
const playing = JSON.parse(readFileSync('tests/fixtures/ha-spotify-playing.json', 'utf8'));
const paused = JSON.parse(readFileSync('tests/fixtures/ha-spotify-paused.json', 'utf8'));

const CFG = { ha: { url: 'http://ha.local:8123', token: 'TOK', spotifyEntity: 'media_player.spotify' } };

describe('fetchNowPlaying', () => {
  it('playing con título, artista y portada', async () => {
    const seen: any[] = [];
    const get = (url: string, headers: any) => { seen.push({ url, headers }); return Promise.resolve(playing); };
    const r = await ha.fetchNowPlaying(CFG, get);
    expect(seen[0].url).toBe('http://ha.local:8123/api/states/media_player.spotify');
    expect(seen[0].headers.Authorization).toBe('Bearer TOK');
    expect(r).toEqual({
      playing: true, title: 'Chandelier', artist: 'Sia',
      image: 'http://ha.local:8123/api/media_player_proxy/media_player.spotify?token=REDACTED&cache=0123456789abcdef',
    });
  });

  it('paused → playing false', async () => {
    expect(await ha.fetchNowPlaying(CFG, () => Promise.resolve(paused))).toEqual({ playing: false });
  });

  it('sin config ha → playing false sin red', async () => {
    let calls = 0;
    const get = () => { calls++; return Promise.resolve(playing); };
    expect(await ha.fetchNowPlaying({}, get)).toEqual({ playing: false });
    expect(await ha.fetchNowPlaying({ ha: { url: 'http://x', token: '', spotifyEntity: 'e' } }, get)).toEqual({ playing: false });
    expect(await ha.fetchNowPlaying({ ha: { url: 'http://x', token: 't', spotifyEntity: '' } }, get)).toEqual({ playing: false });
    expect(calls).toBe(0);
  });

  it('401 o error → playing false', async () => {
    expect(await ha.fetchNowPlaying(CFG, () => Promise.reject(new Error('HTTP 401')))).toEqual({ playing: false });
  });

  it('sin entity_picture → sin image; sin título ni artista → cadenas vacías', async () => {
    const body = { state: 'playing', attributes: {} };
    expect(await ha.fetchNowPlaying(CFG, () => Promise.resolve(body))).toEqual({ playing: true, title: '', artist: '' });
  });
});
