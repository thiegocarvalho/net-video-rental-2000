import { S } from '../core/State.js';
import { A } from '../core/Audio.js';

// YouTube IFrame glue for the in-scene TV. window.ytPlayer / window.ytReady are
// kept as globals for compatibility with other modules.

// The API calls onYouTubeIframeAPIReady when its script finishes, but main.js is
// a deferred ES module and usually has not run yet, so the callback can be
// missed. initYtPlayer() polls for YT.Player instead; this is only a backup.
window.onYouTubeIframeAPIReady = function() { window.ytApiReady = true; };

var SYNC_INTERVAL = 0.25;
var syncAcc = 0;
var seekAcc = 0;
var lastVol = -1;
var lastQuality = '';

function player() { return window.ytReady ? window.ytPlayer : null; }

export function initYtPlayer() {
  if (window.ytPlayer) return;
  if (typeof YT === 'undefined' || !YT.Player) return;
  if (!document.getElementById('yt-player')) return;
  window.ytPlayer = new YT.Player('yt-player', {
    height: '100%',
    width: '100%',
    videoId: '',
    playerVars: { autoplay: 1, mute: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, showinfo: 0, iv_load_policy: 3 },
    events: {
      onReady: function(event) {
        window.ytReady = true;
        try {
          event.target.mute();
          if (S.vcr === 'playing' && S.inDeck && S.inDeck.id) {
            var vid = String(S.inDeck.id).replace('yt:video:', '');
            S._lastYtId = vid;
            event.target.loadVideoById(vid);
            event.target.playVideo();
          }
        } catch (e) { /* player not ready yet */ }
      }
    }
  });
}

export function ytMute() {
  var p = window.ytPlayer;
  if (p && p.mute) { try { p.mute(); } catch (e) {} }
}
export function ytUnmute() {
  var p = window.ytPlayer;
  if (p && p.unMute) { try { p.unMute(); } catch (e) {} }
}
export function ytSetVolume(v) {
  var p = window.ytPlayer;
  if (p && p.setVolume) { try { p.setVolume(v); lastVol = v; } catch (e) {} }
}
export function ytPause() {
  var p = window.ytPlayer;
  if (p && p.pauseVideo) { try { p.pauseVideo(); } catch (e) {} }
}

// Called every frame; does real work at ~4 Hz. `tvPlaying` = deck has a YouTube
// tape and S.vcr === 'playing'. `targetVol` (0..100) vem de core/AudioMix.js (distancia, porta, ducking).
export function ytTick(dt, tvPlaying, targetVol) {
  var p = player();
  if (!p) return;
  syncAcc += dt;
  seekAcc += dt;
  if (syncAcc < SYNC_INTERVAL) return;
  syncAcc = 0;

  var deck = S.inDeck;
  var hasTape = !!(deck && deck.id);
  var state = p.getPlayerState ? p.getPlayerState() : -1;

  if (!hasTape) {
    if (state === 1 || state === 2 || state === 3) p.stopVideo();
    return;
  }

  if (S.vcr === 'playing') {
    var vid = String(deck.id).replace('yt:video:', '');
    if (S._lastYtId !== vid) {
      S._lastYtId = vid;
      p.mute();
      p.loadVideoById(vid);
      if (!S.tvMuted && A.on) p.unMute();
      p.playVideo();
      return;
    }
    if (state !== 1 && state !== 3) {
      if (S.tvMuted) p.mute();
      p.playVideo();
    } else if (state === 1) {
      var yt = p.getCurrentTime();
      if (yt !== undefined && yt >= 0) S.t = yt;
    }
  } else if (S.vcr === 'paused') {
    if (state === 1 || state === 3) p.pauseVideo();
  } else if (S.vcr === 'stopped') {
    if (state === 1 || state === 2 || state === 3) p.stopVideo();
  } else if ((S.vcr === 'ff' || S.vcr === 'rew') && seekAcc >= SYNC_INTERVAL) {
    seekAcc = 0;
    p.seekTo(S.t, true);
  }

  if (!tvPlaying) return;
  if (S.tvMuted || !A.on) {
    if (p.isMuted && !p.isMuted()) p.mute();
  } else {
    if (p.isMuted && p.isMuted()) p.unMute();
    var q = S.watching ? 'hd1080' : 'small';
    // fade: o volume anda no maximo 15 pontos por passo de 0,25 s (sem saltos ao andar ou quando a mistura muda)
    var cur = lastVol < 0 ? targetVol : lastVol;
    var vol = Math.abs(targetVol - cur) <= 15 ? targetVol : cur + (targetVol > cur ? 15 : -15);
    if (vol !== lastVol) { p.setVolume(vol); lastVol = vol; }
    if (q !== lastQuality) { p.setPlaybackQuality(q); lastQuality = q; }
  }
}
