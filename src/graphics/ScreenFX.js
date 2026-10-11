import { S } from '../core/State.js';
import { t } from '../i18n/index.js';
import { EL, dcache, setTxt, TOUCH } from '../ui/UIManager.js';
import { TXT as TEX_TXT } from './Textures.js';
import * as THREE from 'three';

export var TXT = {
  mutedKeys: t('scn.fx.mutedKeys'),
  mutedTouch: t('scn.fx.mutedTouch'),
  noTape: t('scn.fx.noTape'),
  tracking: function (q) { return 'TRACKING ' + (q > 0 ? '+' : '') + q; }
};

var fx = document.getElementById('fx'), fxc = fx ? fx.getContext('2d') : null, FW = 480, FH = 360;

export function fmt(t) {
  var s = Math.max(0, Math.floor(t));
  return ('' + ((s / 60) | 0)).padStart(2, '0') + ':' + ('' + (s % 60)).padStart(2, '0');
}

export var OSDMAP = {
  playing: 'PLAY',
  paused: 'PAUSE',
  ff: 'FF >>',
  rew: '<< REW',
  stopped: 'STOP'
};

function blueScreen(x, W, H) {
  x.fillStyle = '#0a1f6b';
  x.fillRect(0, 0, W, H);
  x.font = '700 20px "Courier New", monospace';
  x.fillStyle = '#00ff00';
  x.textAlign = 'right';
  x.fillText(TEX_TXT.videoLabel, W - 30, 40);
}

var lastTape = null, lastSt = null, drawn = false;
var lastTk = NaN, lastTkShown = 0, lastSec = -1, lastLcd = -1;

export function drawFX(screenCtx, screenTex) {
  var st = S.vcr, tp = S.inDeck;

  // So redesenha a textura da TV quando o estado muda.
  if (!drawn || tp !== lastTape || st !== lastSt) {
    drawn = true; lastTape = tp; lastSt = st;

    if (!tp) {
      if (fxc) {
        fxc.clearRect(0, 0, FW, FH);
        blueScreen(fxc, FW, FH);
      }
      if (screenCtx && screenTex) {
        screenCtx.fillStyle = '#0a1f6b';
        screenCtx.fillRect(0, 0, 256, 256);
        screenCtx.font = '700 20px "Courier New", monospace';
        screenCtx.fillStyle = '#00ff00';
        screenCtx.textAlign = 'right';
        screenCtx.fillText(TEX_TXT.videoLabel, 246, 30);
        screenTex.needsUpdate = true;
      }
    } else if (st === 'playing') {
      // O player real do YouTube ja cobre a tela em 3D.
      if (fxc) {
        fxc.fillStyle = '#000';
        fxc.fillRect(0, 0, FW, FH);
      }
      if (screenCtx && screenTex) {
        screenTex.needsUpdate = true;
      }
    } else if (st === 'paused') {
      if (fxc) {
        fxc.fillStyle = '#0a1020';
        fxc.fillRect(0, 0, FW, FH);
      }
      if (screenCtx && screenTex) {
        screenCtx.fillStyle = '#0a1020';
        screenCtx.fillRect(0, 0, 256, 256);
        screenTex.needsUpdate = true;
      }
    } else if (st === 'stopped') {
      if (fxc) {
        fxc.fillStyle = '#050508';
        fxc.fillRect(0, 0, FW, FH);
      }
      if (screenCtx && screenTex) {
        screenCtx.fillStyle = '#050508';
        screenCtx.fillRect(0, 0, 256, 256);
        screenTex.needsUpdate = true;
      }
    } else {
      // ff / rew
      if (fxc) {
        fxc.fillStyle = '#0a1f6b';
        fxc.fillRect(0, 0, FW, FH);
      }
      if (screenCtx && screenTex) {
        screenCtx.fillStyle = '#0a1f6b';
        screenCtx.fillRect(0, 0, 256, 256);
        screenTex.needsUpdate = true;
      }
    }
  }

  // OSD estilo VCR: so escreve no DOM quando o valor muda
  var muted = S.tvMuted && st === 'playing';
  var mode = S.msg ? S.msg : (tp ? (OSDMAP[st] || '') : '');
  setTxt(EL.osdMode, 'm', mode);
  var blink = !!S.msg || st === 'paused' || st === 'ff' || st === 'rew';
  if (dcache.mb !== blink) { dcache.mb = blink; EL.osdMode.classList.toggle('blink', blink); }

  var sec = tp ? Math.floor(Math.max(0, S.t)) : -1;
  if (sec !== lastSec) {
    lastSec = sec;
    EL.osdCounter.textContent = sec < 0 ? '' : '0:' + fmt(sec);
    var lcd = sec < 0 ? '- - - -' : ('' + (sec % 10000)).padStart(4, '0');
    EL.deckLcd.textContent = lcd;
  }

  // Tracking: so aparece por ~2.5s depois de ajustar
  var tkq = Math.round(S.tracking * 10);
  var now = performance.now();
  if (tkq !== lastTk) { if (!isNaN(lastTk)) lastTkShown = now; lastTk = tkq; }
  var msg = '';
  if (muted) msg = TOUCH ? TXT.mutedTouch : TXT.mutedKeys;
  else if (!tp) msg = TXT.noTape;
  else if (now - lastTkShown < 2500) msg = TXT.tracking(tkq);
  setTxt(EL.osdMsg, 'g', msg);

  if (dcache.tk !== S.tracking) { dcache.tk = S.tracking; EL.trkDot.style.left = (50 + S.tracking * 46).toFixed(1) + '%'; }
}

export function hideCRT() {
  if (S.crtOn) { S.crtOn = false; EL.crt.classList.remove('on'); }
}

var v3 = new THREE.Vector3(), fwdV = new THREE.Vector3(), pts = [[0, 0], [0, 0], [0, 0], [0, 0]];
export function syncCRT(camera, SCRP, corners) {
  if (S.phase !== 'inside' || S.inspect || !S.watching || !corners) { hideCRT(); return; }
  camera.getWorldDirection(fwdV);
  var dist = camera.position.distanceTo(SCRP);
  if (fwdV.z < .18 || dist > 4.6) { hideCRT(); return; }
  for (var i = 0; i < 4; i++) {
    v3.copy(corners[i]).project(camera);
    if (v3.z > 1) { hideCRT(); return; }
    pts[i][0] = (v3.x * .5 + .5) * window.innerWidth;
    pts[i][1] = (-v3.y * .5 + .5) * window.innerHeight;
  }
  var p0 = pts[0], p1 = pts[1], p2 = pts[2], p3 = pts[3];
  var dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0], dx3 = p0[0] - p1[0] + p2[0] - p3[0];
  var dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1], dy3 = p0[1] - p1[1] + p2[1] - p3[1];
  var den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-6) { hideCRT(); return; }
  var a13 = (dx3 * dy2 - dy3 * dx2) / den, a23 = (dx1 * dy3 - dy1 * dx3) / den;
  var a11 = p1[0] - p0[0] + a13 * p1[0], a21 = p3[0] - p0[0] + a23 * p3[0], a31 = p0[0];
  var a12 = p1[1] - p0[1] + a13 * p1[1], a22 = p3[1] - p0[1] + a23 * p3[1], a32 = p0[1];
  EL.crt.style.transform = 'matrix3d(' + a11 + ',' + a12 + ',0,' + a13 + ',' + a21 + ',' + a22 + ',0,' + a23 +
    ',0,0,1,0,' + a31 + ',' + a32 + ',0,1) scale(' + (1 / 640) + ',' + (1 / 480) + ')';
  if (!S.crtOn) { S.crtOn = true; EL.crt.classList.add('on'); }
  var bl = (Math.max(0, Math.min(1, (dist - 1.5) / 3)) * 1.1).toFixed(2);
  if (dcache.bl !== bl) { dcache.bl = bl; EL.crt.style.filter = 'blur(' + bl + 'px)'; }
}
