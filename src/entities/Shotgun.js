// Easter egg SAFE: a shotgun (FINAL_GAME_DESIGN.md, secao 6; achievements da secao 12).
//
// - Pista: poster brutalista sovietico sob o cartaz de indicacao, na parede do fundo da loja (scenes/interior/Furnishings.js).
// - Terminal `safe` (main.js): safeCommand() -> o terminal fecha e a arma CAI no meio da loja (fisica de
//   ThrownCan.js, kind 'item'). Uma vez por vida do mundo; depois o comando responde algo neutro.
// - E pega (ocupa as maos). Clique esquerdo (ou #mb7 no touch) atira: 6 tiros, sem recarga. HUD #shell-counter
//   so com a arma na mao. G larga: com balas ela fica no chao (pode pegar de novo); sem balas pisca e some.
// - Tiro = raio da camera. Fitas/latas/caixas soltas levam impulso; superficies levam marca de tiro (32 em
//   anel, geometria/material compartilhados); lixeira e caixas na prateleira seguram o tiro sem marca; o
//   customer, moedas e o porquinho sao atravessados. Vitrine: o vidro leva a marca e segura o tiro (Q12).
// - Lampadas dos postes (so do lado de fora): todos os 8 postes do lote apagam com estilhacos (os 2 da calcada tem
//   PointLight de verdade; os 6 distantes tem halo/cone/poca aditivos). As 2 da calcada apagadas com o porquinho no
//   carro (e o carro ainda la) -> pigEscape({breakGlass:false}) + Wanted; os distantes nao contam (6 cartuchos, 8 postes).
// - Porquinho blindado: ao ativar o `safe` no terminal (safeCommand), se o carro existe, setPigInCar(true); ele so
//   sai quando as balas acabam. Tiro no carro com ele dentro -> "SAO BLINDADAS" + Catch Me If You Can. Balas acabaram (contando a arma largada,
//   Q13) sem as 2 lampadas -> setPigInCar(false).
// - resetWorld(): arma, municao, marcas, lampadas, estilhacos e a flag "ja entregue" voltam ao inicial.
import * as THREE from 'three';
import { loadModel, fitModel, G } from '../graphics/Engine.js';
import { psxModel, nearestTex } from '../scenes/interior/shared.js';
import { cv, hash } from '../core/Utils.js';
import { S } from '../core/State.js';
import { EL, toast } from '../ui/UIManager.js';
import { onWorldReset } from '../core/World.js';
import { unlock } from '../core/Achievements.js';
import { blinkState } from '../core/Blink.js';
import { clunk, shotgunSound, gunClickSound, glassBreakSound } from '../core/Audio.js';
import { distanceGain } from '../core/AudioMix.js';
import { throwItem, kickItem, physicsItemOf, releaseTape } from './ThrownCan.js';
import { boxOf } from './Cardboard.js';
import { pig, setPigInCar, pigEscape, pigStartled } from './Pig.js';
import { t } from '../i18n/index.js';

// Textos visíveis internacionalizados via i18n. Sem frases montadas por concatenacao.
export var TXT = {
  gunName: t('ent.shotgun.gun_name'),
  inHand: t('ent.shotgun.in_hand'),
  actTake: t('ent.shotgun.act_take'),
  noAmmo: t('ent.shotgun.no_ammo'),
  termOk: t('ent.shotgun.term_ok'),
  termUsed: t('ent.shotgun.term_used'),
  btnFire: t('ent.shotgun.btn_fire'),
  btnDrop: t('ent.shotgun.btn_drop'),
  credit: {
    title: t('ent.shotgun.credit.title'),
    badge: 'CC0 1.0',
    lines: ['• <b>' + t('ent.shotgun.credit.author') + '</b> Pichuliru', '• <b>' + t('ent.shotgun.credit.use') + '</b> ' + t('ent.shotgun.credit.use_text')],
    sourceLabel: t('ent.shotgun.credit.source_label'),
    url: 'https://poly.pizza/m/NfQETBKOiw'
  }
};

var MAG = 6;                          // cartuchos, sem recarga
var GUN_LEN = 0.86;                   // comprimento da arma (m)
var DROP_POS = new THREE.Vector3(0.1, 3.5, 2.1);   // meio da loja, perto do teto
var MAX_DECALS = 32;
var DECAL_LIFE = 20;                   // segundos ate a marca de tiro piscar 3x e sumir (core/Blink.js)
var DECAL_SIZE = 0.26;                 // marca de tiro (m)
var LAMP_RADIUS = 0.38;               // tolerancia minima ate o centro da lampada (espalhamento do chumbo)
// A tolerancia cresce com a distancia, senao ela encolhe em ANGULO e os 6 postes do fundo do lote
// (20-30 m) viram alvo de ~10 px, lendo como "o jogo nao registrou o tiro" em vez de "errei".
// tan(2.7 graus): da a mesma mira que os 2 postes da calcada sempre tiveram, a ~8 m.
var LAMP_SPREAD = 0.047;
var OUTSIDE_Z = 6.3;                  // so se acerta as lampadas do lado de fora (a vitrine segura o tiro)

var env = null;   // { scene, camera, interactables, bin, binGrp, streetLamps, car, recoil(rad) }
var gun = { state: 'none', ammo: MAG, delivered: false };
// state: 'none' (ainda nao entregue) | 'floor' (no mundo: caindo ou parada) | 'held' | 'vanishing' | 'gone'

var proto = null, protoSize = new THREE.Vector3(), muzzleLocal = new THREE.Vector3();
var pivot = null, pivotHit = null, halfH = 0.05;
var handGun = new THREE.Group();
handGun.visible = false;
handGun.userData.dynamic = true;
var handModel = null, handTurn = null, handPump = null, handShell = null, flashMesh = null, flashLight = null;
var pumpTravel = 0, shellOut = false, ejected = true;
var casing = null, casingT = 0, casingV = new THREE.Vector3(), casingSpin = new THREE.Vector3();
var hitMat = new THREE.MeshBasicMaterial({ visible: false });
var dropTimer = 0, vanishT = 0, cooldown = 0, kickT = 0, flashT = 0, pumpT = -1;
var shellEl = null, shellIcons = [], lastShells = -1;
var NO_PILE = { pile: 0 };

var ray = new THREE.Raycaster(), CENTER = new THREE.Vector2(0, 0);
var tmpV = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpVel = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
var Z_AXIS = new THREE.Vector3(0, 0, 1);
var targets = [];

// ---- modelo (CC0, models/shotgun.glb) ----
// O GLB e um SkinnedMesh em pose de repouso; o Lambert do psxModel nao tem `skinning`, entao a geometria crua e
// desenhada como malha comum (mesmo formato). Crua: comprimento em Y (cano em +Y), bomba/coronha para -Z. Aqui ela e
// reorientada para cano em +X e altura em +Y, e o fitModel mede o comprimento em X.
// Separa a malha em corpo / fuste (osso Pump) / cartucho da camara (osso Shell) pelo osso dominante de cada vertice,
// para animar fuste e cartucho como pecas rigidas sem skinning. Triangulo vai para o grupo do primeiro vertice.
function splitByBone(o) {
  var g = o.geometry, bones = o.skeleton && o.skeleton.bones;
  var si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  if (!bones || !si || !sw) return { body: g };
  var cls = [], i, q;
  for (i = 0; i < si.count; i++) {
    var best = 0, bw = -1;
    for (q = 0; q < 4; q++) { var w = sw.array[i * 4 + q]; if (w > bw) { bw = w; best = si.array[i * 4 + q]; } }
    var nm = bones[best] ? bones[best].name : '';
    cls.push(nm === 'Pump' ? 1 : nm === 'Shell' ? 2 : 0);
  }
  var idx = g.index ? g.index.array : null;
  var tris = (idx ? idx.length : g.attributes.position.count) / 3;
  var lists = [[], [], []];
  for (var t0 = 0; t0 < tris; t0++) lists[cls[idx ? idx[t0 * 3] : t0 * 3]].push(t0);
  var names = ['body', 'pump', 'shell'], out = {};
  var pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (var k = 0; k < 3; k++) {
    var L = lists[k];
    if (!L.length) continue;
    var P = new Float32Array(L.length * 9), N = nor ? new Float32Array(L.length * 9) : null, U = uv ? new Float32Array(L.length * 6) : null;
    for (var a = 0; a < L.length; a++) {
      for (var c = 0; c < 3; c++) {
        var v = idx ? idx[L[a] * 3 + c] : L[a] * 3 + c, o9 = a * 9 + c * 3;
        P[o9] = pos.getX(v); P[o9 + 1] = pos.getY(v); P[o9 + 2] = pos.getZ(v);
        if (N) { N[o9] = nor.getX(v); N[o9 + 1] = nor.getY(v); N[o9 + 2] = nor.getZ(v); }
        if (U) { U[a * 6 + c * 2] = uv.getX(v); U[a * 6 + c * 2 + 1] = uv.getY(v); }
      }
    }
    var ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(P, 3));
    if (N) ng.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (U) ng.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    out[names[k]] = ng;
  }
  return out;
}

loadModel('models/shotgun.glb').then(function(m) {
  psxModel(m);
  var orient = new THREE.Group();
  var partGroups = { body: orient, pump: new THREE.Group(), shell: new THREE.Group() };
  partGroups.pump.name = 'gun_pump'; partGroups.shell.name = 'gun_shell';
  orient.add(partGroups.pump); orient.add(partGroups.shell);
  m.traverse(function(o) {
    if (!o.isMesh) return;
    var parts = splitByBone(o);
    for (var key in parts) {
      var mm = new THREE.Mesh(parts[key], o.material);
      mm.castShadow = mm.receiveShadow = false;
      partGroups[key].add(mm);
    }
  });
  // colunas = para onde vao os eixos crus X, Y, Z
  var basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  orient.quaternion.setFromRotationMatrix(basis);
  var fit = new THREE.Group();
  fit.add(orient);
  fitModel(fit, GUN_LEN);
  var bb = new THREE.Box3().setFromObject(fit);
  fit.position.y -= (bb.max.y + bb.min.y) / 2;            // origem no centro (gira em volta de si)
  bb.setFromObject(fit);
  bb.getSize(protoSize);
  muzzleLocal.set(bb.max.x, bb.max.y - protoSize.y * 0.18, 0);
  proto = fit;
  buildHand();
}).catch(function(err) { console.warn('Falha ao carregar shotgun.glb:', err); });

// A arma na mao desenha por cima de tudo (renderOrder alto), mas testa profundidade contra si mesma: sem isso as
// partes se desenham na ordem dos materiais e o fuste aparece por cima do cano ("por dentro" da arma). Antes dela,
// `depthReset` (quad em tela cheia, so profundidade no plano far) apaga o Z do cenario para ela nao sumir em paredes.
var depthReset = null;
function makeDepthReset() {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.99999,1.0);}',
    fragmentShader: 'void main(){gl_FragColor=vec4(0.0);}',
    depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, colorWrite: false, transparent: true }));
  m.renderOrder = 998;
  m.frustumCulled = false;
  m.userData.noShot = true;
  return m;
}

function viewmodel(obj) {
  obj.traverse(function(c) {
    if (!c.isMesh) return;
    c.renderOrder = 999;
    var mats = Array.isArray(c.material) ? c.material : [c.material];
    var cl = mats.map(function(m) { var mc = m.clone(); mc.depthTest = true; mc.depthWrite = true; mc.transparent = true; return mc; });
    c.material = cl.length === 1 ? cl[0] : cl;
    c.frustumCulled = false;
  });
  return obj;
}

function flashCanvas() {
  var c = cv(64, 64), g = c.getContext('2d');
  var gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,190,80,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = gr;
  g.beginPath();
  for (var i = 0; i < 16; i++) {                      // estrela irregular de 8 pontas
    var a = i / 16 * Math.PI * 2, r = i % 2 ? 10 : 22 + hash(i + 5) * 9;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  return c;
}

// Cartucho vazio ejetado a direita ao bombear: corpo vermelho + base de latao, no espaco da mao (escala da arma).
function buildCasing() {
  if (casing) return;
  var r = protoSize.x * 0.011, h = protoSize.x * 0.07;
  var mk = function(col) { return new THREE.MeshBasicMaterial({ color: col, transparent: true, depthTest: true, depthWrite: true }); };
  casing = new THREE.Group();
  var body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h * 0.72, 8), mk(0xb01c14)); body.position.y = h * 0.14;
  var base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.08, h * 0.28, 8), mk(0xd4a72c)); base.position.y = -h * 0.36;
  casing.add(body); casing.add(base);
  casing.traverse(function(c) { if (c.isMesh) { c.renderOrder = 999; c.frustumCulled = false; } });
  casing.visible = false;
  casing.userData.noShot = true;
  handGun.add(casing);
}

function ejectCasing() {
  if (!casing || !handTurn || !handModel) return;
  tmpV.set(-0.05, 0.03, 0.04).multiplyScalar(protoSize.x / handModel.scale.x);   // janela de ejecao (lado direito do receptor), no espaco local do modelo: a escala volta com handModel.matrix
  tmpV.applyMatrix4(handModel.matrix).applyMatrix4(handTurn.matrix);
  casing.position.copy(tmpV);
  casing.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
  casingV.set(0.55 + Math.random() * 0.25, 0.55 + Math.random() * 0.2, 0.12 + Math.random() * 0.1).multiplyScalar(GUN_LEN);
  casingSpin.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24);
  casingT = 0.9;
  casing.visible = true;
}

var HAND_ROLL = 0;                                     // a reorientacao em `orient` ja deixa o cano em cima e o fuste marrom embaixo; nao rolar
function buildHand() {
  if (handModel || !proto) return;
  var turn = new THREE.Group();
  turn.rotation.y = Math.PI / 2;                       // cano (+X) para a frente da camera (-Z)
  handModel = viewmodel(proto.clone());
  handModel.rotation.x = HAND_ROLL;                    // giro em torno do cano (eixo X do modelo); 0 = arma em pe
  turn.add(handModel);
  handTurn = turn;
  handPump = handModel.getObjectByName('gun_pump');
  handShell = handModel.getObjectByName('gun_shell');
  pumpTravel = protoSize.x * 0.16 / proto.scale.x;     // curso do fuste (unidades cruas do modelo; o eixo do cano e Y cru)
  buildCasing();
  flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({
    map: nearestTex(flashCanvas()), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  flashMesh.renderOrder = 1000;
  flashMesh.frustumCulled = false;
  flashMesh.position.copy(muzzleLocal).applyAxisAngle(new THREE.Vector3(1, 0, 0), HAND_ROLL).x += 0.12;   // boca do cano ja com o giro da arma
  flashMesh.rotation.y = -Math.PI / 2;                 // de frente para a camera
  flashMesh.visible = false;
  turn.add(flashMesh);
  depthReset = makeDepthReset();
  handGun.add(depthReset);
  handGun.add(turn);
}

// ---- marcas de tiro (anel de MAX_DECALS) ----
function decalCanvas() {
  var c = cv(64, 64), g = c.getContext('2d');
  function hole(x, y, r, k) {
    g.fillStyle = 'rgba(150,140,120,.35)'; g.beginPath(); g.arc(x, y, r + 1.6, 0, 6.283); g.fill();   // lasca clara em volta
    g.fillStyle = 'rgba(8,7,6,.95)'; g.beginPath(); g.arc(x + (hash(k) - 0.5), y, r, 0, 6.283); g.fill();
  }
  g.fillStyle = 'rgba(20,16,12,.45)'; g.beginPath(); g.arc(32, 32, 17, 0, 6.283); g.fill();          // fuligem
  hole(32, 32, 7, 1);
  for (var i = 0; i < 10; i++) {                       // chumbo espalhado
    var a = hash(i * 13 + 3) * 6.283, d = 11 + hash(i * 5 + 9) * 16;
    hole(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 2.2 + hash(i + 40) * 1.6, i + 2);
  }
  return c;
}
var decalGeo = new THREE.PlaneGeometry(DECAL_SIZE, DECAL_SIZE);
var decalMat = new THREE.MeshBasicMaterial({ map: nearestTex(decalCanvas()), transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
var decals = [], decalNext = 0;

function placeDecal(point, normal, parent) {
  var d = decals[decalNext];
  if (!d) {
    d = new THREE.Mesh(decalGeo, decalMat);
    d.userData.dynamic = true; d.userData.noShot = true;
    d.renderOrder = 2;                                   // depois de cartazes/vidros transparentes no mesmo plano
    decals[decalNext] = d;
  }
  decalNext = (decalNext + 1) % MAX_DECALS;
  if (d.parent) d.parent.remove(d);
  d.position.copy(point).addScaledVector(normal, 0.004);
  d.quaternion.copy(tmpQ.setFromUnitVectors(Z_AXIS, normal));
  d.rotateZ(Math.random() * 6.283);
  d.scale.setScalar(1);
  d.userData.age = 0;
  env.scene.add(d);
  if (parent) { d.updateMatrixWorld(true); parent.attach(d); }   // segue o objeto (carro, porta)
  d.visible = true;
}

function clearDecals() {
  for (var i = 0; i < decals.length; i++) { decals[i].visible = false; if (decals[i].parent) decals[i].parent.remove(decals[i]); }
  decalNext = 0;
}

// ---- estilhacos da lampada ----
var shardMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8 });
var bulbOffMat = new THREE.MeshLambertMaterial({ color: 0x3a3a34 });
var shards = [];
function spawnShards(pos) {
  for (var i = 0; i < 16; i++) {
    var m = new THREE.Mesh(G.unit, shardMat);
    var s = 0.02 + Math.random() * 0.035;
    m.scale.set(s, s * (0.5 + Math.random()), 0.006);
    m.position.copy(pos);
    m.userData.dynamic = true; m.userData.noShot = true;
    env.scene.add(m);
    var a = Math.random() * 6.283, sp = 0.8 + Math.random() * 2.2;
    shards.push({ mesh: m, t: 0, vx: Math.cos(a) * sp, vy: Math.random() * 1.5, vz: Math.sin(a) * sp, r: (Math.random() - 0.5) * 18 });
  }
}
function updateShards(dt) {
  for (var i = shards.length - 1; i >= 0; i--) {
    var d = shards[i], p = d.mesh.position;
    d.t += dt;
    if (d.vx || d.vy || d.vz) {
      d.vy -= 9.8 * dt;
      p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
      d.mesh.rotation.x += d.r * dt; d.mesh.rotation.y += d.r * 0.7 * dt;
      var fy = (p.z < 9.3 ? 0 : -0.15) + 0.008;
      if (p.y <= fy) { p.y = fy; d.vx = d.vy = d.vz = 0; d.mesh.rotation.set(-Math.PI / 2, 0, d.r); }
    }
    if (d.t > 2.2) {
      var b = blinkState(d.t - 2.2);
      if (b === 2) { env.scene.remove(d.mesh); shards.splice(i, 1); }
      else d.mesh.visible = b === 1;
    }
  }
}
function clearShards() {
  for (var i = 0; i < shards.length; i++) env.scene.remove(shards[i].mesh);   // G.unit e shardMat sao compartilhados
  shards.length = 0;
}

// ---- HUD: 6 cartuchos (so com a arma na mao) ----
function ensureShells() {
  if (shellEl) return;
  var hud = document.getElementById('hud');
  if (!hud) return;
  shellEl = document.createElement('div');
  shellEl.id = 'shell-counter';
  for (var i = 0; i < MAG; i++) { var s = document.createElement('i'); s.className = 'shell'; shellEl.appendChild(s); shellIcons.push(s); }
  hud.appendChild(shellEl);
}
function refreshShells() {
  ensureShells();
  if (!shellEl) return;
  var n = S.heldGun ? gun.ammo : -1;
  if (n === lastShells) return;
  lastShells = n;
  shellEl.classList.toggle('on', n >= 0);
  for (var i = 0; i < shellIcons.length; i++) shellIcons[i].classList.toggle('spent', i >= n);
}

// ---- arma no mundo ----
function ensurePivot() {
  if (pivot || !proto) return !!pivot;
  pivot = new THREE.Group();
  pivot.userData.dynamic = true;
  pivot.userData.noShot = true;
  var lie = new THREE.Group();
  lie.rotation.x = Math.PI / 2;                        // deitada de lado no chao
  lie.add(proto.clone());
  pivot.add(lie);
  halfH = protoSize.z / 2;
  pivotHit = new THREE.Mesh(new THREE.BoxGeometry(protoSize.x + 0.1, 0.22, protoSize.y + 0.12), hitMat);
  pivotHit.userData = { type: 'shotgun', label: TXT.gunName };
  pivot.add(pivotHit);
  return true;
}

function setInteractable(on) {
  if (!pivotHit) return;
  var i = env.interactables.indexOf(pivotHit);
  if (on && i < 0) env.interactables.push(pivotHit);
  else if (!on && i >= 0) env.interactables.splice(i, 1);
}

function removeFromWorld() {
  if (!pivot) return;
  releaseTape(pivot, NO_PILE);
  setInteractable(false);
  if (pivot.parent) pivot.parent.remove(pivot);
}

// ---- camera acompanha a arma caindo (comando safe) ----
// O olhar (P.yaw/P.pitch) vira suave para a arma; S.camForced trava mouse/toque so no olhar, o resto segue livre.
var follow = { on: false, t: 0, rest: -1 };
var FOLLOW_RATE = 5, FOLLOW_HOLD = 0.9, FOLLOW_MAX = 6;
function shortAngle(a, b) { var d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function startFollow() {
  var P = window.P;
  if (!P || S.phase !== 'inside' || S.watching || S.terminalOpen || S.playingArcade || S.playingGta || S.fileOpen || S.cutscene || S.camForced || S.inspect) return;
  follow.on = true; follow.t = 0; follow.rest = -1;
  S.camForced = true;
}
function endFollow() {
  if (!follow.on) return;
  follow.on = false;
  S.camForced = false;
}
function updateFollow(dt) {
  var P = window.P;
  follow.t += dt;
  if (!P || !pivot || gun.state === 'held' || gun.state === 'none' || gun.state === 'gone' || follow.t > FOLLOW_MAX) { endFollow(); return; }
  if (follow.rest >= 0) { follow.rest += dt; if (follow.rest > FOLLOW_HOLD) { endFollow(); return; } }
  var dx = pivot.position.x - P.pos.x, dz = pivot.position.z - P.pos.z, dy = pivot.position.y - P.pos.y;
  var ty = Math.atan2(-dx, -dz), tp = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.hypot(dx, dz))));
  var k = 1 - Math.exp(-FOLLOW_RATE * dt);
  P.yaw += shortAngle(P.yaw, ty) * k;
  P.pitch += (tp - P.pitch) * k;
}

function onGunRest() {
  if (follow.on && follow.rest < 0) follow.rest = 0;
  if (gun.state === 'floor' && gun.ammo <= 0) { gun.state = 'vanishing'; vanishT = 0; setInteractable(false); }
}

function spawnFalling() {
  dropTimer = 0;
  if (!ensurePivot()) { dropTimer = setTimeout(spawnFalling, 400); return; }   // o GLB ainda nao chegou
  env.scene.add(pivot);
  pivot.visible = true;
  gun.state = 'floor';
  setInteractable(true);
  tmpV.set(0.12, -1, 0.08).normalize();
  throwItem(pivot, DROP_POS, tmpV, env.scene, halfH, 0.8, { onRest: onGunRest, spin: 3.5 });
  startFollow();
}

// Comando `safe` do terminal. Retorna { ok, text } (main.js imprime o texto e, se ok, fecha o terminal).
export function safeCommand() {
  if (gun.delivered) return { ok: false, text: TXT.termUsed };
  gun.delivered = true;
  if (!S.carGone) setPigInCar(true);                    // ativar o safe tranca o porquinho no carro ate as balas acabarem
  dropTimer = setTimeout(spawnFalling, 1100);           // cai depois que o terminal fecha
  return { ok: true, text: TXT.termOk };
}

function setHandLabel() {
  if (!EL.hand) return;
  EL.hand.classList.add('on');
  EL.hand.innerHTML = TXT.inHand + '<br><b class="v">' + TXT.gunName + '</b>';
}

function takeGun() {
  if (S.held || S.heldCan || S.heldBox || S.heldGun || gun.state !== 'floor') return;
  releaseTape(pivot, NO_PILE);                           // sai da fisica
  setInteractable(false);
  pivot.visible = false;
  gun.state = 'held';
  S.heldGun = gun;
  buildHand();
  handGun.visible = true;
  kickT = 0; flashT = 0;
  setHandLabel();
  refreshShells();
  gunClickSound(true);
}

function dropHand() {
  S.heldGun = null;
  handGun.visible = false;
  if (flashMesh) flashMesh.visible = false;
  if (flashLight) flashLight.intensity = 0;
  if (EL.hand) EL.hand.classList.remove('on');
  refreshShells();
}

// G: larga a arma. Com balas fica no chao (pode pegar de novo); sem balas pisca e some ao assentar.
export function dropHeldGun() {
  if (!S.heldGun) return;
  dropHand();
  var cam = env.camera;
  cam.getWorldDirection(tmpN);
  tmpV.copy(cam.position).addScaledVector(tmpN, 0.5); tmpV.y -= 0.2;
  gun.state = 'floor';
  pivot.visible = true;
  if (!pivot.parent) env.scene.add(pivot);
  setInteractable(gun.ammo > 0);
  throwItem(pivot, tmpV, tmpN, env.scene, halfH, 2.4, { onRest: onGunRest, spin: 4 });
  clunk();
}

// ---- tiro ----
// Classifica a malha atingida. null = o raio atravessa (customer, moeda, invisiveis, mao, etc.).
function classify(obj) {
  if (!obj.isMesh) return null;
  var m = obj.material;
  if (!m || (Array.isArray(m) ? m[0] && m[0].visible === false : m.visible === false)) return null;
  var dyn = null;
  for (var o = obj; o; o = o.parent) {
    if (!o.visible || o.userData.noShot || o === env.camera) return null;
    if (o === env.binGrp) return { kind: 'absorb' };     // a lixeira nao e afetada (quebra so pelas 15 inspecoes)
    if (env.car && o === env.car.grp) return { kind: 'car' };
    if (o.userData.type === 'tape' && S.tapes.indexOf(o) >= 0) return { kind: 'tape', mesh: o };
    if (!dyn && o.userData.dynamic) dyn = o;
  }
  var b = boxOf(obj);
  if (b) return b.state === 'free' ? { kind: 'box', box: b } : { kind: 'absorb' };   // caixa na prateleira: segura
  var c = physicsItemOf(obj);
  if (c) return c.kind ? { kind: 'absorb' } : { kind: 'can', entry: c };
  return { kind: 'surface', parent: dyn };
}

function kickVel(dir, sp, up) { return tmpVel.set(dir.x * sp, dir.y * sp + up, dir.z * sp); }

function hitTape(mesh, dir, point) {
  kickItem(mesh, 'tape', kickVel(dir, 6.5, 2.2), env.scene, env.bin);
  // espalhamento do chumbo: fitas vizinhas do ponto de impacto tambem voam
  for (var i = 0; i < S.tapes.length; i++) {
    var t = S.tapes[i];
    if (t === mesh || !t.visible || t.position.distanceToSquared(point) > 0.1) continue;
    kickItem(t, 'tape', kickVel(dir, 4.5 + Math.random() * 2, 1.6 + Math.random()), env.scene, env.bin);
  }
}

function lampOnRay(origin, dir, maxT) {
  if (env.camera.position.z < OUTSIDE_Z) return null;   // de dentro da loja nao alcanca os postes
  var best = null, bestT = Infinity;
  for (var i = 0; i < env.streetLamps.length; i++) {
    var L = env.streetLamps[i];
    if (L.off) continue;
    tmpV.copy(L.bulb.position).sub(origin);
    var t = tmpV.dot(dir);
    if (t <= 0 || t > maxT + 0.5 || t > bestT) continue;
    var r = Math.max(LAMP_RADIUS, t * LAMP_SPREAD);
    if (tmpV.lengthSq() - t * t < r * r) { best = L; bestT = t; }
  }
  return best;
}

function isFrontLamp(L) { return L.isFrontLamp; }
function lampIsOff(L) { return L.off; }

// Serve os 2 postes da calcada (PointLight de verdade) e os 6 distantes (halo/cone/poca aditivos, sem luz).
function breakLamp(L) {
  L.off = true;
  if (L.light) L.light.intensity = 0;
  L.bulb.material = bulbOffMat;
  if (L.haloMeshes) L.haloMeshes.forEach(hideMesh);
  if (L.cone) L.cone.visible = false;
  if (L.pool) L.pool.visible = false;
  spawnShards(L.bulb.position);
  var c = env.camera.position;
  glassBreakSound(distanceGain(Math.hypot(c.x - L.bulb.position.x, c.z - L.bulb.position.z), 3, 1.1, 40));
  // Wanted so com as 2 lampadas DA CALCADA apagadas (a arma tem 6 cartuchos para 8 postes: os distantes nao contam),
  // o carro ainda la e o porquinho trancado nele (Q: depois das moedas nao vale)
  var frontOff = env.streetLamps.filter(isFrontLamp).every(lampIsOff);
  if (frontOff && pig.state === 'inside_car' && !S.carGone) {
    pigEscape({ breakGlass: false });
    unlock('wanted');
  }
}

function hideMesh(m) { m.visible = false; }
function showMesh(m) { m.visible = true; }

function shoot() {
  var cam = env.camera;
  cam.updateMatrixWorld(true);
  ray.setFromCamera(CENTER, cam);
  ray.far = 70;
  var origin = ray.ray.origin, dir = ray.ray.direction;
  targets.length = 0;
  var ch = env.scene.children;
  for (var i = 0; i < ch.length; i++) {
    var o = ch[i];
    if (o !== cam && o.visible && !o.userData.noShot && !o.isLight) targets.push(o);
  }
  var hits = ray.intersectObjects(targets, true), hit = null, cls = null;
  for (var k = 0; k < hits.length; k++) {
    cls = classify(hits[k].object);
    if (cls) { hit = hits[k]; break; }
  }
  // Modo HUNT (Hunt.js): os alvos correndo sao testados a parte (corpo = cilindro); o cenario mais perto segura o tiro.
  if (shotHook && shotHook(origin, dir, hit ? hit.distance : Infinity)) return;
  var lamp = lampOnRay(origin, dir, hit ? hit.distance : Infinity);
  if (lamp) { breakLamp(lamp); return; }
  if (!hit) return;
  var p = hit.point;
  if (cls.kind === 'tape') { hitTape(cls.mesh, dir, p); return; }
  if (cls.kind === 'box') { kickItem(cls.box.pivot, 'box', kickVel(dir, 4.2, 1.6), env.scene, env.bin, cls.box.halfH); return; }
  if (cls.kind === 'can') { kickItem(cls.entry.mesh, null, kickVel(dir, 7, 2.2), env.scene, env.bin); return; }
  if (cls.kind === 'absorb') return;
  // superficie: marca de tiro orientada pela normal (virada para quem atirou)
  if (hit.face) tmpN.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
  else tmpN.copy(dir).negate();
  if (tmpN.dot(dir) > 0) tmpN.negate();
  if (cls.kind === 'car') {
    placeDecal(p, tmpN, env.car.body);
    if (pig.state === 'inside_car') { unlock('catch_me'); pigStartled(); }   // tiro no carro com ele dentro: achievement (sem aviso) e o porquinho se assusta
    return;
  }
  placeDecal(p, tmpN, cls.parent);
}

// ---- modo HUNT (Hunt.js) ----
var shotHook = null;
// fn(origin, dir, sceneHitDistance) -> true consome o tiro (sem marca). null desliga.
export function setShotHook(fn) { shotHook = fn || null; }
export function shotgunAmmo() { return gun.ammo; }
// Arma direto na mao com o pente cheio (sem cair do teto e sem a logica do porquinho). O resetWorld a recolhe.
export function armShotgunForHunt() {
  if (S.heldGun) dropHand();
  if (dropTimer) { clearTimeout(dropTimer); dropTimer = 0; }
  removeFromWorld();
  gun.ammo = MAG; gun.delivered = true; gun.state = 'held';
  cooldown = 0; kickT = 0; flashT = 0; pumpT = -1;
  S.heldGun = gun;
  buildHand();
  handGun.visible = true;
  setHandLabel();
  refreshShells();
  gunClickSound(true);
}

// Clique esquerdo (main.js) / botao ATIRAR no touch.
export function fireShotgun() {
  if (!S.heldGun || cooldown > 0) return;
  if (gun.ammo <= 0) { gunClickSound(false); toast(TXT.noAmmo); cooldown = 0.3; return; }
  gun.ammo--;
  cooldown = 0.85; kickT = 0.001; flashT = 0.07; pumpT = 0.38; ejected = false;
  refreshShells();
  if (flashMesh) { flashMesh.visible = true; flashMesh.rotation.z = Math.random() * 6.283; }
  if (flashLight) {
    env.camera.getWorldDirection(tmpN);
    flashLight.position.copy(env.camera.position).addScaledVector(tmpN, 0.9);
    flashLight.intensity = 2.4;
  }
  shotgunSound(1, env.camera.position.z > OUTSIDE_Z);
  if (env.recoil) env.recoil(0.07);
  shoot();
  if (gun.ammo === 0) {
    pumpT = -1;
    toast(TXT.noAmmo);
    // acabou a municao do mundo sem as 2 lampadas: o porquinho sai do carro
    if (pig.state === 'inside_car') setPigInCar(false);
  }
}

// ---- ligacoes com main.js ----
export var HELD_GUN_TARGETS = { coin: 1, pig: 1, pig_car: 1, rusbe_paper: 1 };

export function shotgunLabel(o) {
  if (o.userData.type !== 'shotgun') return null;
  return { desc: '<b>' + TXT.gunName + '</b><br><span class="v">' + gun.ammo + '/' + MAG + '</span>', act: TXT.actTake };
}

export function useShotgun(o) {
  if (o.userData.type !== 'shotgun') return false;
  takeGun();
  return true;
}

export function initShotgun(opts) {
  env = opts;
  opts.camera.add(handGun);
  // luz do clarao criada ja agora (luz nova em tempo de jogo recompila os shaders)
  flashLight = new THREE.PointLight(0xffc070, 0, 7, 2);
  opts.scene.add(flashLight);
  ensureShells();
}

// Marcas de tiro: depois de DECAL_LIFE segundos piscam 3x e somem (como os outros objetos que desaparecem).
function updateDecals(dt) {
  for (var i = 0; i < decals.length; i++) {
    var d = decals[i];
    if (!d || !d.visible) continue;
    d.userData.age += dt;
    if (d.userData.age <= DECAL_LIFE) continue;
    var b = blinkState(d.userData.age - DECAL_LIFE);
    if (b === 2) { d.visible = false; if (d.parent) d.parent.remove(d); }
    else d.visible = b === 1;
  }
}

export function updateShotgun(dt, bob) {
  updateDecals(dt);
  if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
  if (flashT > 0) {
    flashT -= dt;
    if (flashT <= 0) { if (flashMesh) flashMesh.visible = false; if (flashLight) flashLight.intensity = 0; }
  }
  if (pumpT > 0) { pumpT -= dt; if (pumpT <= 0) { pumpT = -1; if (S.heldGun) gunClickSound(true); } }
  if (S.heldGun) {
    var k = 0, pump = 0;
    if (kickT > 0) {
      kickT += dt;
      k = Math.max(0, 1 - kickT / 0.22);
      if (kickT > 0.3 && kickT < 0.7) pump = Math.sin((kickT - 0.3) / 0.4 * Math.PI);   // bombeia
      if (kickT > 0.8) kickT = 0;
    }
    handGun.position.set(0.24, -0.26 + Math.sin(bob) * 0.006 + k * 0.03 - pump * 0.01, -0.44 + k * 0.1);
    handGun.rotation.set(0.02 + k * 0.28, -0.06, -0.03 + pump * 0.05);
    if (gun.ammo > 0) shellOut = false;                                  // municao nova na camara
    if (handPump) handPump.position.y = -pumpTravel * pump;              // fuste desliza para tras e volta
    if (kickT === 0) ejected = true;
    else if (!ejected && kickT > 0.5) { ejected = true; shellOut = gun.ammo <= 0; ejectCasing(); }
    if (handShell) handShell.visible = !shellOut;
    handGun.scale.setScalar(0.58);
  }
  if (gun.state === 'vanishing') {
    vanishT += dt;
    var b = blinkState(vanishT);
    if (b === 2) { removeFromWorld(); gun.state = 'gone'; }
    else if (pivot) pivot.visible = b === 1;
  }
  if (follow.on) updateFollow(dt);
  if (casingT > 0) {
    casingT -= dt;
    if (casingT <= 0) casing.visible = false;
    else {
      casingV.y -= GUN_LEN * 4.2 * dt;                                   // gravidade
      casing.position.addScaledVector(casingV, dt);
      casing.rotation.x += casingSpin.x * dt; casing.rotation.y += casingSpin.y * dt; casing.rotation.z += casingSpin.z * dt;
    }
  }
  if (shards.length) updateShards(dt);
}

// resetWorld: arma, municao, marcas, lampadas e a flag de entrega de volta ao inicio (a pista fica).
onWorldReset(function() {
  shotHook = null;
  if (dropTimer) { clearTimeout(dropTimer); dropTimer = 0; }
  if (S.heldGun) dropHand();
  S.heldGun = null;
  removeFromWorld();
  gun.state = 'none'; gun.ammo = MAG; gun.delivered = false;
  cooldown = 0; kickT = 0; flashT = 0; pumpT = -1; vanishT = 0;
  endFollow();
  casingT = 0; shellOut = false; ejected = true;
  if (casing) casing.visible = false;
  if (flashMesh) flashMesh.visible = false;
  if (flashLight) flashLight.intensity = 0;
  refreshShells();
  if (!env) return;
  clearDecals();
  clearShards();
  // acende os 8 postes de novo (os distantes voltam pelos efeitos aditivos; L.intensity so existe nos da calcada)
  env.streetLamps.forEach(function(L) {
    L.off = false;
    L.bulb.material = L.onMat;
    if (L.light) L.light.intensity = L.intensity;
    if (L.haloMeshes) L.haloMeshes.forEach(showMesh);
    if (L.cone) L.cone.visible = true;
    if (L.pool) L.pool.visible = true;
  });
});
