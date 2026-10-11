// Controles de toque (so com TOUCH; no desktop nada aqui e ligado).
// - #stick: joystick analogico de movimento. touchMove.f/r (-1..1) e somado ao WASD no loop de main.js.
// - Arrastar na tela (fora do joystick e dos botoes): olhar; no inspect gira o item na mao.
// - Toque curto na tela: usa o objeto sob o dedo (env.onTap).
// - Multitouch: cada dedo e um pointerId; joystick e olhar funcionam ao mesmo tempo.
// - No HUNT (env.huntMode()) nada daqui age: Hunt.js tem os proprios tratadores de mira.
// - Teclado virtual: --kb (px cobertos pelo teclado, via visualViewport) para os paineis subirem.
// - Aviso de paisagem (retrato, uma vez, sem bloquear) e botao de tela cheia opcional.
import { TOUCH, toast } from './UIManager.js';
import { t } from '../i18n/index.js';

export var TXT = {
  rotateHint: t('ui.touch.rotate_hint'),
  fullscreen: t('ui.touch.fullscreen'),
  fullscreenExit: t('ui.touch.fullscreen_exit')
};

export var touchMove = { f: 0, r: 0 };

var LOOK_SENS = 0.0048;      // rad por px arrastado (o HUNT usa 0.0045)
var INSPECT_SENS = 0.012;
var TAP_MAX_MS = 280, TAP_MAX_PX = 12;
var KNOB_TRAVEL = 40;        // px (igual ao Hunt.js)
var DEAD = 0.12;             // zona morta do joystick

var stick = { id: -1, cx: 0, cy: 0, r: 1 };
var look = { id: -1, x: 0, y: 0, x0: 0, y0: 0, t0: 0, moved: 0 };
var knob = null;

function setKnob(dx, dy) {
  if (!knob) knob = document.getElementById('knob');
  if (knob) knob.style.transform = dx || dy ? 'translate(' + (dx * KNOB_TRAVEL).toFixed(1) + 'px,' + (dy * KNOB_TRAVEL).toFixed(1) + 'px)' : '';
}

function releaseStick() {
  stick.id = -1; touchMove.f = 0; touchMove.r = 0; setKnob(0, 0);
}

// Solta joystick e olhar (troca de estado: assistir TV, terminal, cutscene, reset...).
export function resetTouchControls() {
  if (!TOUCH) return;
  if (stick.id >= 0) releaseStick();
  look.id = -1;
}

// env: { canvas, P, S, huntMode(), canLook(), onTap(nx, ny) }
export function initTouchControls(env) {
  if (!TOUCH) return;
  var stickEl = document.getElementById('stick');
  var canvas = env.canvas;

  function moveStick(e) {
    var dx = (e.clientX - stick.cx) / stick.r, dy = (e.clientY - stick.cy) / stick.r, l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; l = 1; }
    setKnob(dx, dy);
    // zona morta radial, depois reescala para 0..1
    var k = l < DEAD ? 0 : (l - DEAD) / (1 - DEAD) / (l || 1);
    touchMove.f = -dy * k;
    touchMove.r = dx * k;
  }

  if (stickEl) stickEl.addEventListener('pointerdown', function(e) {
    if (env.huntMode()) return;            // HUNT: o #stick mira (Hunt.js)
    e.preventDefault();
    if (stick.id >= 0) return;
    var rc = stickEl.getBoundingClientRect();
    stick.id = e.pointerId; stick.cx = rc.left + rc.width / 2; stick.cy = rc.top + rc.height / 2; stick.r = rc.width / 2;
    moveStick(e);
  });

  // Passivos: nenhum destes chama preventDefault, entao liberam a thread de composicao
  // (o do #stick, que cancela o scroll, continua nao-passivo de proposito).
  canvas.addEventListener('pointerdown', function(e) {
    if (e.pointerType === 'mouse' || env.huntMode() || look.id >= 0) return;
    look.id = e.pointerId; look.x = look.x0 = e.clientX; look.y = look.y0 = e.clientY;
    look.t0 = performance.now(); look.moved = 0;
  }, { passive: true });

  window.addEventListener('pointermove', function(e) {
    if (e.pointerId === stick.id) { moveStick(e); return; }
    if (e.pointerId !== look.id) return;
    var dx = e.clientX - look.x, dy = e.clientY - look.y;
    look.x = e.clientX; look.y = e.clientY;
    look.moved = Math.max(look.moved, Math.hypot(e.clientX - look.x0, e.clientY - look.y0));
    if (env.huntMode()) return;
    var S = env.S, P = env.P;
    if (S.inspect) { S.insRot.y += dx * INSPECT_SENS; S.insRot.x += dy * INSPECT_SENS; return; }
    if (!env.canLook()) return;
    P.yaw -= dx * LOOK_SENS;
    P.pitch = Math.max(-1.2, Math.min(1.2, P.pitch - dy * LOOK_SENS));
  }, { passive: true });

  function end(e) {
    if (e.pointerId === stick.id) releaseStick();
    if (e.pointerId === look.id) {
      look.id = -1;
      if (e.type === 'pointerup' && look.moved < TAP_MAX_PX && performance.now() - look.t0 < TAP_MAX_MS && !env.huntMode())
        env.onTap((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    }
  }
  window.addEventListener('pointerup', end, { passive: true });
  window.addEventListener('pointercancel', end, { passive: true });
  window.addEventListener('blur', resetTouchControls);

  // Menu de toque longo / selecao fora dos campos de texto
  document.addEventListener('contextmenu', function(e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'A')) return;
    e.preventDefault();
  });

  watchKeyboard();
  setupFullscreenButton();
  setupRotateHint();
}

// Altura coberta pelo teclado virtual (visualViewport) em --kb, e a altura visivel em --vvh.
function watchKeyboard() {
  var vv = window.visualViewport;
  var root = document.documentElement;
  if (!vv) return;
  var last = '';
  function upd() {
    var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    var key = kb + '/' + Math.round(vv.height);
    if (key === last) return;
    last = key;
    root.style.setProperty('--kb', kb + 'px');
    root.style.setProperty('--vvh', Math.round(vv.height) + 'px');
    document.body.classList.toggle('kb-open', kb > 80);
  }
  vv.addEventListener('resize', upd);
  vv.addEventListener('scroll', upd);
  upd();
}

function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }

function setupFullscreenButton() {
  var de = document.documentElement;
  var req = de.requestFullscreen || de.webkitRequestFullscreen;
  if (!req || !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) return;   // iPhone: sem API
  var btn = document.createElement('button');
  btn.id = 'fs-btn';
  btn.type = 'button';
  btn.textContent = TXT.fullscreen;
  document.body.appendChild(btn);
  btn.addEventListener('click', function() {
    try {
      if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        var r = req.call(de, { navigationUI: 'hide' });
        if (r && r.catch) r.catch(function() {});
      }
    } catch (e) {}
  });
  function sync() { btn.textContent = fsElement() ? TXT.fullscreenExit : TXT.fullscreen; }
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
}

// Retrato: uma sugestao (toast) ao entrar na loja; nunca bloqueia.
function setupRotateHint() {
  var shown = false;
  var mq = window.matchMedia ? window.matchMedia('(orientation: portrait)') : null;
  function check() {
    if (shown || !document.body.classList.contains('playing')) return;
    shown = true;
    if (mq && mq.matches) setTimeout(function() { toast(TXT.rotateHint); }, 1200);
  }
  try { new MutationObserver(check).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
}
