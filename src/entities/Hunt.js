// Modo HUNT, o final do jogo (FINAL_GAME_DESIGN.md, secao 11; Q8 = arco de mira de ~120 graus).
//
// - Entrada escondida do terminal (CMD_CHASE em main.js): so com SESSION.cabinetOpened (senao e "comando desconhecido"). huntCommand() faz
//   glitch + fade para preto, resetWorld({reason:'hunt'}) (mundo limpo, terminal fechado, itens guardados) e monta o
//   cenario: jogador PARADO em HUNT_POS (no estacionamento, logo depois da calcada, olhando a porta: dali as rotas
//   cabem no arco de 120 graus), porta aberta (vao, env.openDoorGap), carro e porquinho fora (Pig.setHuntStage),
//   lua sobre a fachada (Moon.moonDirection), shotgun na mao com 6 tiros (Shotgun.armShotgunForHunt).
//   SESSION.huntMode = true desliga o customer normal (cronograma, jumpscare, "visto") e o heroi.
// - Mira: mouse com pointer lock; o yaw/pitch do jogador e puxado de volta (mola) para dentro do arco e tem um
//   limite duro um pouco alem dele. Touch: arrastar na tela ou o #stick (velocidade) e o botao ATIRAR (#mb7).
//   Sem pointer lock no desktop o HUNT PAUSA (overlay com CONTINUAR/DESISTIR): ESC nao vira trapaca.
// - 6 PORQUINHOS saem da loja trotando (pulinhos com squash/stretch), intervalos de 1-1,6 s, velocidade crescente,
//   rotas para os dois lados. POOL de 3 clones do modelo do porquinho (Pig.pigRunnerModel(): geometria e materiais
//   compartilhados): no maximo 3 vivos na tela, entao as levas se sobrepoem. Quem sai do arco (ou chega ao fim da
//   rota) "passou". Acerto = cilindro do corpo contra o raio do tiro (Shotgun.setShotHook), so se nenhum cenario
//   estiver na frente: o porquinho grunhe, vira de barriga para cima pulando e pisca (Blink.js) ate sumir.
// - Fim: 6 resolvidos ou municao acabou -> tela final (ui/FinalScreen.js). 6 abatidos -> unlock('missing');
//   Wanted + Wolf -> unlock('cheater'). Fechar a tela final = returnToTitle({newGame:true}) (sessao zerada).
// - Regra de reinicio: o HUNT so recomeca depois da tela final (que zera a sessao, e com ela cabinetOpened). Um
//   resetWorld() no meio (debug, volta ao titulo) cancela tudo (timers, listeners, pool escondido) e abre a tela
//   final com o placar parcial; a unica saida continua sendo o botao RECOMECAR.
import * as THREE from 'three';
import { S } from '../core/State.js';
import { SESSION, onWorldReset, resetWorld } from '../core/World.js';
import { unlock, isUnlocked } from '../core/Achievements.js';
import { blinkState } from '../core/Blink.js';
import { glitchSound, oinkSound, beep } from '../core/Audio.js';
import { TOUCH, DEBUG } from '../ui/UIManager.js';
import { armShotgunForHunt, setShotHook, shotgunAmmo } from './Shotgun.js';
import { setHuntStage, pigRunnerModel } from './Pig.js';
import { openFinalScreen, isFinalScreenOpen } from '../ui/FinalScreen.js';
import { t } from '../i18n/index.js';

// Textos visíveis internacionalizados via i18n. Sem frases montadas por concatenacao.
export var TXT = {
  termStart: t('ent.hunt.term_start'),
  banner: t('ent.hunt.banner'),
  intro: t('ent.hunt.intro'),
  hintMouse: t('ent.hunt.hint_mouse'),
  hintTouch: t('ent.hunt.hint_touch'),
  pauseTitle: t('ent.hunt.pause_title'),
  pauseResume: t('ent.hunt.pause_resume'),
  pauseHint: t('ent.hunt.pause_hint'),
  pauseQuit: t('ent.hunt.pause_quit'),
  waiting: t('ent.hunt.waiting')
};

var TOTAL = 6;
var POOL_SIZE = 3;                                   // no maximo 3 porquinhos vivos na tela
var HUNT_POS = new THREE.Vector3(0, 1.5, 14.0);     // de pe no estacionamento, de frente para a porta (z 6.1)
var YAW_ARC = 60 * Math.PI / 180;                    // meio arco de mira (120 graus no total)
var YAW_HARD = 68 * Math.PI / 180;                   // limite duro (a mola puxa de volta para YAW_ARC)
var PITCH_MIN = -0.42, PITCH_MAX = 0.62, PITCH_HARD = 0.08;
var PASS_ANGLE = 57 * Math.PI / 180;                 // saiu do arco (visto do jogador): passou
var PIG_SCALE = 1.7;                                 // o porquinho do HUNT e maior que o da loja, para ser visto dos 8 m
var PIG_H = 0.449 * PIG_SCALE;                       // altura do modelo (0.449 m na escala de loja)
var HIT_RADIUS = 0.5, HIT_TOP = 1.0;                 // corpo = cilindro (tolerancia do chumbo e dos pulinhos incluida)
var SPEEDS = [3.4, 3.8, 4.2, 4.7, 5.2, 5.8];         // m/s, crescente
var GAPS = [1.1, 1.6, 1.0, 1.5, 1.0];                // s entre saidas (levas se sobrepoem)
var FIRST_DELAY = 1.2;
var FALL_TIME = 0.55, BLINK_AFTER = 1.0;
var END_DELAY = 1.6;
// Rotas (x, z) depois da porta; o comeco e dentro da loja. Lados alternados, retas pela calcada, diagonais pelo
// estacionamento e zigue-zagues. Evitam as caixas de reciclagem (x -2.7..-0.5, z 7.25..7.75) e os postes (x +-6.8, z 8.85).
var ROUTES = [
  [[0.35, 7.1], [2.4, 7.7], [11, 7.9]],
  [[-0.2, 7.1], [-0.8, 8.3], [-11, 8.4]],
  [[0.3, 7.2], [1.6, 9.0], [5.0, 10.3], [12, 11.0]],
  [[-0.3, 7.2], [-0.6, 8.7], [-4.2, 10.4], [-12, 11.4]],
  [[0.0, 7.2], [-0.4, 8.7], [2.8, 8.9], [12, 8.0]],
  [[0.0, 7.2], [1.9, 8.1], [-0.8, 8.9], [-3.6, 8.5], [-12, 8.1]]
];

var env = null;     // { scene, camera, P, canvas, lockPointer(), openDoorGap(), restart(), finalEnv }
var state = 'idle'; // idle | intro | play | ending | final
var hunt = null;    // placar da rodada atual
var pool = [];      // { root, tilt, body, rig, state, ... }
var timers = [];
var paused = false;
var hud = null, pips = [], pauseEl = null, bannerEl = null;
var listeners = [];
var touchAim = { id: -1, x: 0, y: 0 }, stickAim = { id: -1, x: 0, y: 0, cx: 0, cy: 0, r: 1 };
var lastShot = null;
var tmpAxis = new THREE.Vector3();

function later(fn, ms) { var id = setTimeout(function() { var i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); fn(); }, ms); timers.push(id); return id; }
function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers.length = 0; }
function listen(el, ev, fn, opts) { if (!el) return; el.addEventListener(ev, fn, opts); listeners.push([el, ev, fn, opts]); }
function unlistenAll() { for (var i = 0; i < listeners.length; i++) { var l = listeners[i]; l[0].removeEventListener(l[1], l[2], l[3]); } listeners.length = 0; }
function fadeEl() { return document.getElementById('fade'); }

export function initHunt(opts) { env = opts; }
export function isHuntActive() { return state !== 'idle'; }

// Terminal: retorna o texto a imprimir, ou null = comando desconhecido (sem o armario aberto nesta sessao).
export function huntCommand() {
  if (!SESSION.cabinetOpened || state !== 'idle' || isFinalScreenOpen() || !env) return null;
  startHunt();
  return TXT.termStart;
}

// ---------------------------------------------------------------- transicao de entrada
function startHunt() {
  state = 'intro';
  S.cutscene = 'hunt';
  glitchSound();
  later(glitchSound, 260);
  if (window.sightFX) window.sightFX();
  var f = fadeEl();
  if (f) { f.style.background = '#000'; f.style.transition = 'opacity .55s ease-in'; f.style.opacity = '1'; }
  later(stage, 700);
}

function stage() {
  resetWorld({ reason: 'hunt' });         // mundo do inicio: terminal fechado, maos vazias, fitas no lugar
  var f = fadeEl();
  if (f) { f.style.transition = 'none'; f.style.opacity = '1'; }   // o reset do customer limpou o fade
  SESSION.huntMode = true;
  S.cutscene = 'hunt';
  state = 'intro';
  document.body.classList.add('hunt-mode');
  hunt = { spawned: 0, hits: 0, passed: 0, results: [], spawnT: FIRST_DELAY, endT: -1, outcome: '' };
  env.openDoorGap();
  setHuntStage();
  armShotgunForHunt();
  setShotHook(onShot);
  var P = env.P;
  P.pos.copy(HUNT_POS); P.yaw = 0; P.pitch = 0.04;
  env.camera.position.copy(P.pos); env.camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
  ensurePool();
  buildHud();
  attachInput();
  later(function() { if (f) { f.style.transition = 'opacity .9s ease-out'; f.style.opacity = '0'; } }, 60);
  showBanner(true);
  if (!TOUCH && env.lockPointer) env.lockPointer();
  later(function() { showBanner(false); if (state === 'intro') { state = 'play'; S.cutscene = false; } }, 1700);
}

// ---------------------------------------------------------------- pool de porquinhos
// Cada porquinho: root (posicao/yaw) > tilt (gira em torno do CENTRO do corpo, na queda) > body (escala + pulinhos) > modelo.
function ensurePool() {
  if (pool.length >= POOL_SIZE) return true;
  while (pool.length < POOL_SIZE) {
    var model = pigRunnerModel();
    if (!model) return false;               // pig.glb ainda carregando: update() tenta de novo
    var root = new THREE.Group(), tilt = new THREE.Group(), body = new THREE.Group();
    root.userData.dynamic = tilt.userData.dynamic = body.userData.dynamic = true;
    root.userData.noShot = true;            // o tiro normal atravessa; o HUNT testa o cilindro (onShot)
    body.scale.setScalar(PIG_SCALE); body.position.y = -PIG_H / 2;
    tilt.position.y = PIG_H / 2;
    body.add(model); tilt.add(body); root.add(tilt);
    root.visible = false;
    env.scene.add(root);
    pool.push({ root: root, tilt: tilt, body: body, state: 'idle', idx: -1, route: null, seg: 0, speed: 0, t: 0, phase: 0,
      slide: new THREE.Vector3(), flip: 1 });
  }
  return true;
}

function freeRunner() { for (var i = 0; i < pool.length; i++) if (pool[i].state === 'idle') return pool[i]; return null; }

function groundY(z) { return z > 9.3 ? -0.14 : 0; }

function spawn(idx) {
  var r = freeRunner();
  if (!r) return false;
  var side = idx % 2 ? -1 : 1;
  var start = [side * 0.3, 2.6 + (idx % 3) * 0.4];             // dentro da loja, atras do vao da porta
  r.route = [start, [side * 0.15, 6.2]].concat(ROUTES[idx % ROUTES.length]);
  r.seg = 1; r.idx = idx; r.speed = SPEEDS[idx] || SPEEDS[SPEEDS.length - 1]; r.t = 0;
  r.state = 'run';
  r.root.position.set(start[0], groundY(start[1]), start[1]);
  r.root.rotation.set(0, Math.atan2(r.route[1][0] - start[0], r.route[1][1] - start[1]), 0);
  r.tilt.quaternion.identity(); r.tilt.position.y = PIG_H / 2;
  r.body.position.set(0, -PIG_H / 2, 0); r.body.rotation.set(0, 0, 0); r.body.scale.setScalar(PIG_SCALE);
  r.phase = idx * 1.7; r.flip = idx % 2 ? -1 : 1;
  r.root.visible = true;
  hunt.results[idx] = 'run';
  refreshHud();
  return true;
}

function release(r) {
  r.state = 'idle';
  r.root.visible = false;
  r.tilt.quaternion.identity(); r.tilt.position.y = PIG_H / 2;
}

// Trote: pulinhos (|sin|), cabecada para frente e para tras, balanco lateral e squash/stretch (o modelo e rigido).
function trot(r, dt) {
  r.phase += r.speed * dt * 3.1;
  var s = Math.sin(r.phase), a = Math.abs(s);
  r.body.position.y = -PIG_H / 2 + a * 0.2;
  r.body.rotation.x = Math.sin(r.phase * 2) * 0.09;
  r.body.rotation.z = s * 0.07;
  var sq = 1 + 0.06 * Math.cos(r.phase * 2);
  r.body.scale.set(PIG_SCALE / Math.sqrt(sq), PIG_SCALE * sq, PIG_SCALE / Math.sqrt(sq));
}

function resolve(r, how) {
  if (r.idx >= 0) hunt.results[r.idx] = how;
  if (how === 'hit') hunt.hits++; else hunt.passed++;
  refreshHud();
  if (hunt.hits === TOTAL) unlock('missing');
}

function updateRunner(r, dt) {
  var p = r.root.position;
  if (r.state === 'run') {
    var step = r.speed * dt;
    while (step > 0 && r.seg < r.route.length) {
      var w = r.route[r.seg], dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz);
      if (d <= step) { p.x = w[0]; p.z = w[1]; step -= d; r.seg++; continue; }
      p.x += dx / d * step; p.z += dz / d * step; step = 0;
      var want = Math.atan2(dx, dz), cur = r.root.rotation.y;
      var da = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
      r.root.rotation.y = cur + da * Math.min(1, dt * 12);
    }
    p.y = groundY(p.z);
    trot(r, dt);
    // fora do arco (visto do jogador) ou fim da rota: passou
    var ang = Math.atan2(Math.abs(p.x - HUNT_POS.x), HUNT_POS.z - p.z);
    if (r.seg >= r.route.length || (p.z > 6.6 && ang > PASS_ANGLE)) { resolve(r, 'pass'); release(r); }
  } else if (r.state === 'down') {
    r.t += dt;
    var k = Math.min(1, r.t / FALL_TIME);
    tmpAxis.set(0, 0, 1);                                        // gira de barriga para cima em torno do eixo do corpo
    r.tilt.quaternion.setFromAxisAngle(tmpAxis, r.flip * k * k * Math.PI);
    r.tilt.position.y = PIG_H / 2 + Math.sin(Math.PI * k) * 0.45;   // e pula ao ser atingido
    r.body.position.set(0, -PIG_H / 2, 0); r.body.rotation.set(0, 0, 0); r.body.scale.setScalar(PIG_SCALE);
    var sl = Math.max(0, 1 - r.t / 0.5);
    p.x += r.slide.x * sl * dt; p.z += r.slide.z * sl * dt;
    p.y = groundY(p.z);
    if (r.t > FALL_TIME + BLINK_AFTER) {
      var b = blinkState(r.t - FALL_TIME - BLINK_AFTER);
      if (b === 2) release(r); else r.root.visible = b === 1;
    }
  }
}

// ---------------------------------------------------------------- tiro
// Raio contra o cilindro vertical do corpo: menor t > 0 com a altura dentro do corpo.
function rayCylinder(o, d, r) {
  var p = r.root.position, ox = o.x - p.x, oz = o.z - p.z;
  var a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return Infinity;
  var b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - HIT_RADIUS * HIT_RADIUS;
  var disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  var sq = Math.sqrt(disc), ts = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)];
  for (var i = 0; i < 2; i++) {
    var t = ts[i];
    if (t <= 0) continue;
    var y = o.y + d.y * t - p.y;
    if (y >= 0.05 && y <= HIT_TOP) return t;
  }
  return Infinity;
}

function onShot(origin, dir, sceneDist) {
  if (state !== 'play' && state !== 'ending') return false;
  var best = null, bestT = Infinity;
  for (var i = 0; i < pool.length; i++) {
    var r = pool[i];
    if (r.state !== 'run') continue;
    var t = rayCylinder(origin, dir, r);
    if (t < bestT) { bestT = t; best = r; }
  }
  if (DEBUG) lastShot = { t: bestT === Infinity ? -1 : +bestT.toFixed(2), scene: sceneDist === Infinity ? -1 : +sceneDist.toFixed(2) };
  if (!best || bestT > sceneDist + 0.05) return false;   // o cenario (vitrine, poste, parede) segurou o tiro
  knockDown(best, dir);
  return true;
}

function knockDown(r, dir) {
  r.state = 'down'; r.t = 0;
  r.slide.set(dir.x, 0, dir.z).normalize().multiplyScalar(2.2);      // e empurrado na direcao do tiro
  oinkSound(0.55);                                                   // guincho do porquinho atingido
  resolve(r, 'hit');
}

// ---------------------------------------------------------------- mira
function clampAim(dt) {
  var P = env.P;
  // mola suave para dentro do arco + limite duro
  if (P.yaw > YAW_ARC) P.yaw += (YAW_ARC - P.yaw) * Math.min(1, dt * 10);
  else if (P.yaw < -YAW_ARC) P.yaw += (-YAW_ARC - P.yaw) * Math.min(1, dt * 10);
  P.yaw = Math.max(-YAW_HARD, Math.min(YAW_HARD, P.yaw));
  if (P.pitch > PITCH_MAX) P.pitch += (PITCH_MAX - P.pitch) * Math.min(1, dt * 10);
  else if (P.pitch < PITCH_MIN) P.pitch += (PITCH_MIN - P.pitch) * Math.min(1, dt * 10);
  P.pitch = Math.max(PITCH_MIN - PITCH_HARD, Math.min(PITCH_MAX + PITCH_HARD, P.pitch));
  P.pos.copy(HUNT_POS);
}

function attachInput() {
  unlistenAll();
  var cv = env.canvas;
  // touch: arrastar em qualquer lugar da tela mira (relativo)
  // Passivos: so o #stick abaixo cancela o scroll; estes nao chamam preventDefault.
  listen(cv, 'pointerdown', function(e) {
    if (e.pointerType === 'mouse' || touchAim.id >= 0) return;
    touchAim.id = e.pointerId; touchAim.x = e.clientX; touchAim.y = e.clientY;
  }, { passive: true });
  listen(window, 'pointermove', function(e) {
    if (e.pointerId === touchAim.id && state !== 'final') {
      var P = env.P;
      P.yaw -= (e.clientX - touchAim.x) * 0.0045;
      P.pitch -= (e.clientY - touchAim.y) * 0.0045;
      touchAim.x = e.clientX; touchAim.y = e.clientY;
    }
    if (e.pointerId === stickAim.id) moveStick(e);
  }, { passive: true });
  var endTouch = function(e) {
    if (e.pointerId === touchAim.id) touchAim.id = -1;
    if (e.pointerId === stickAim.id) { stickAim.id = -1; stickAim.x = stickAim.y = 0; setKnob(0, 0); }
  };
  listen(window, 'pointerup', endTouch, { passive: true });
  listen(window, 'pointercancel', endTouch, { passive: true });
  // #stick: velocidade de mira
  var stick = document.getElementById('stick');
  listen(stick, 'pointerdown', function(e) {
    e.preventDefault();
    var rc = stick.getBoundingClientRect();
    stickAim.id = e.pointerId; stickAim.cx = rc.left + rc.width / 2; stickAim.cy = rc.top + rc.height / 2; stickAim.r = rc.width / 2;
    moveStick(e);
  });
  listen(document, 'pointerlockchange', function() { syncPause(); });
}

function moveStick(e) {
  var dx = (e.clientX - stickAim.cx) / stickAim.r, dy = (e.clientY - stickAim.cy) / stickAim.r, l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  stickAim.x = dx; stickAim.y = dy;
  setKnob(dx, dy);
}
var knobEl = null;
function setKnob(dx, dy) {
  var k = knobEl || (knobEl = document.getElementById('knob'));
  if (k) k.style.transform = dx || dy ? 'translate(' + (dx * 40).toFixed(1) + 'px,' + (dy * 40).toFixed(1) + 'px)' : '';
}

// ---------------------------------------------------------------- pausa (desktop sem pointer lock)
function wantsPause() {
  if (TOUCH || (state !== 'play' && state !== 'intro')) return false;
  if (DEBUG && window.huntDebug && window.huntDebug.noPause) return false;
  return document.pointerLockElement !== env.canvas;
}
function syncPause() {
  var p = wantsPause();
  if (p === paused) return;
  paused = p;
  if (pauseEl) pauseEl.classList.toggle('on', paused);
}

// ---------------------------------------------------------------- HUD
function buildHud() {
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'hunt-hud';
    var row = document.createElement('div'); row.className = 'hunt-pips';
    for (var i = 0; i < TOTAL; i++) { var s = document.createElement('i'); row.appendChild(s); pips.push(s); }
    hud.appendChild(row);
    var hint = document.createElement('div'); hint.className = 'hunt-hint';
    hint.textContent = TOUCH ? TXT.hintTouch : TXT.hintMouse;
    hud.appendChild(hint);
    (document.getElementById('hud') || document.body).appendChild(hud);

    bannerEl = document.createElement('div');
    bannerEl.id = 'hunt-banner';
    var t = document.createElement('div'); t.className = 'hb-title'; t.textContent = TXT.banner;
    var s2 = document.createElement('div'); s2.className = 'hb-sub'; s2.textContent = TXT.intro;
    bannerEl.appendChild(t); bannerEl.appendChild(s2);
    (document.getElementById('hud') || document.body).appendChild(bannerEl);

    pauseEl = document.createElement('div');
    pauseEl.id = 'hunt-pause';
    pauseEl.innerHTML = '<div class="hp-card"><div class="hp-title"></div><div class="hp-hint"></div>' +
      '<div class="hp-btns"><button class="hp-resume"></button><button class="hp-quit"></button></div></div>';
    pauseEl.querySelector('.hp-title').textContent = TXT.pauseTitle;
    pauseEl.querySelector('.hp-hint').textContent = TXT.pauseHint;
    pauseEl.querySelector('.hp-resume').textContent = TXT.pauseResume;
    pauseEl.querySelector('.hp-quit').textContent = TXT.pauseQuit;
    pauseEl.querySelector('.hp-resume').addEventListener('click', function(e) { e.stopPropagation(); if (env.lockPointer) env.lockPointer(); });
    pauseEl.querySelector('.hp-quit').addEventListener('click', function(e) { e.stopPropagation(); if (state === 'play' || state === 'intro') finish('quit', 0); });
    pauseEl.addEventListener('click', function() { if (env.lockPointer) env.lockPointer(); });
    document.body.appendChild(pauseEl);
  }
  hud.classList.add('on');
  refreshHud();
}
var lastHud = '';
function refreshHud() {
  if (!hud || !hunt) return;
  var key = hunt.results.join(',');
  if (key === lastHud) return;
  lastHud = key;
  for (var i = 0; i < pips.length; i++) pips[i].className = hunt.results[i] || '';
}
function showBanner(on) { if (bannerEl) bannerEl.classList.toggle('on', !!on); }

// ---------------------------------------------------------------- loop
export function updateHunt(dt) {
  if (state === 'idle' || state === 'final' || !hunt) return;
  clampAim(dt);
  if (stickAim.id >= 0) { env.P.yaw -= stickAim.x * 1.7 * dt; env.P.pitch -= stickAim.y * 1.2 * dt; }
  syncPause();
  if (paused) return;
  if (!ensurePool()) return;
  for (var i = 0; i < pool.length; i++) if (pool[i].state !== 'idle') updateRunner(pool[i], dt);
  if (state === 'play') {
    if (hunt.spawned < TOTAL) {
      hunt.spawnT -= dt;
      if (hunt.spawnT <= 0 && spawn(hunt.spawned)) {
        hunt.spawned++;
        hunt.spawnT = GAPS[(hunt.spawned - 1) % GAPS.length];
      }
    }
    if (hunt.hits + hunt.passed >= TOTAL) finish(hunt.hits === TOTAL ? 'win' : 'escaped', END_DELAY);
    else if (shotgunAmmo() <= 0) finish('ammo', END_DELAY);
  }
}

function finish(outcome, delay) {
  if (state === 'ending' || state === 'final') return;
  state = 'ending';
  hunt.outcome = outcome;
  S.cutscene = 'hunt';
  later(openFinal, Math.round(delay * 1000));
}

function openFinal() {
  if (state === 'final') return;
  state = 'final';
  S.cutscene = 'hunt';
  setShotHook(null);
  unlistenAll();
  touchAim.id = -1; stickAim.id = -1; setKnob(0, 0);
  paused = false;
  if (pauseEl) pauseEl.classList.remove('on');
  if (hud) hud.classList.remove('on');
  showBanner(false);
  for (var i = 0; i < pool.length; i++) if (pool[i].state !== 'idle') release(pool[i]);
  if (isUnlocked('wanted') && isUnlocked('wolf')) unlock('cheater');
  if (document.exitPointerLock) try { document.exitPointerLock(); } catch (e) {}
  beep(520, 0.12);
  var h = hunt || { hits: 0, outcome: 'quit' };
  openFinalScreen({ hits: h.hits, total: TOTAL, outcome: h.outcome || 'quit', env: env.finalEnv, onClose: env.restart });
}

// Limpa tudo o que o HUNT montou (timers, listeners, clones no pool, HUD, gancho do tiro). Nada e destruido: o pool
// fica escondido para a proxima sessao (geometria/materiais sao do molde compartilhado, sem dispose).
function cleanup() {
  clearTimers();
  unlistenAll();
  setShotHook(null);
  touchAim.id = -1; stickAim.id = -1; stickAim.x = stickAim.y = 0; setKnob(0, 0);
  for (var i = 0; i < pool.length; i++) release(pool[i]);
  paused = false;
  if (pauseEl) pauseEl.classList.remove('on');
  if (hud) hud.classList.remove('on');
  showBanner(false);
  lastHud = '';
  document.body.classList.remove('hunt-mode');
  if (S.cutscene === 'hunt') S.cutscene = false;
}

onWorldReset(function(opts) {
  if (opts.reason === 'hunt') return;                  // a propria montagem do cenario
  var interrupted = state === 'intro' || state === 'play' || state === 'ending';
  cleanup();
  if (interrupted && opts.reason !== 'newgame' && hunt) {
    // regra: o HUNT nao recomeca sem passar pela tela final (placar parcial, mesma saida RECOMECAR)
    if (!hunt.outcome) hunt.outcome = 'quit';
    state = 'ending';
    openFinal();
    return;
  }
  if (state === 'final' && opts.reason !== 'newgame') { S.cutscene = 'hunt'; return; }   // tela final aberta continua
  state = 'idle';
  hunt = null;
  SESSION.huntMode = false;
}, -25);

if (DEBUG) {
  window.huntDebug = {
    noPause: false,
    get state() { return state; },
    get hunt() { return hunt; },
    get lastShot() { return lastShot; },
    pool: function() { return pool.map(function(r) { return { state: r.state, idx: r.idx, x: +r.root.position.x.toFixed(2), z: +r.root.position.z.toFixed(2), visible: r.root.visible }; }); },
    alive: function() { return pool.filter(function(r) { return r.state !== 'idle'; }).length; },
    // mira no corpo do porquinho vivo mais adiantado (testes)
    aimAt: function(i) {
      var r = pool.filter(function(q) { return q.state === 'run'; })[i || 0];
      if (!r) return false;
      var P = env.P, p = r.root.position;
      var dx = p.x - P.pos.x, dy = p.y + 0.4 - P.pos.y, dz = p.z - P.pos.z;
      P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return true;
    }
  };
}
