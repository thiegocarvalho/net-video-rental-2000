// Caixas de papelao da prateleira de baixo + caixa azul de reciclagem + moedas (FINAL_GAME_DESIGN.md, secao 4.1).
//
// - Todas as caixas da prateleira de baixo (as duas gondolas) sao itens: E pega (ocupa as maos; fita/lata
//   precisam ser largadas antes, o pick() de main.js ja filtra), F inspeciona no mesmo modo da fita
//   (toggleInspect), G arremessa (fisica de entities/ThrownCan.js), E sem alvo devolve a caixa a prateleira.
// - A caixa azul (prop procedural do lado de fora) aceita 3 papeloes so a azul (vermelha=plastico e verde=vidro rejeitam): cada um faz uma moeda
//   saltar; do 4o em diante ela devolve a caixa (quica para fora, como a lixeira comum). 1o papelao: Alita.
// - Moedas nao ocupam as maos: E pega e soma no contador do HUD (x/3, so aparece com >= 1).
// - resetWorld(): caixas de volta as prateleiras, caixa azul vazia, moedas somem, contador zera.
import * as THREE from 'three';
import { boxAt, planeAt, loadModel, fitModel } from '../graphics/Engine.js';
import { psxModel, nearestTex } from '../scenes/interior/shared.js';
import { cv } from '../core/Utils.js';
import { S } from '../core/State.js';
import { EL } from '../ui/UIManager.js';
import { onWorldReset } from '../core/World.js';
import { unlock } from '../core/Achievements.js';
import { clunk, coinSound } from '../core/Audio.js';
import { throwBox, releaseTape } from './ThrownCan.js';
import { t } from '../i18n/index.js';

// Textos visíveis internacionalizados via i18n.
var TXT = {
  boxName: t('ent.cardboard.box_name'),
  boxStamp: t('ent.cardboard.box_stamp'),
  recycleName: t('ent.cardboard.recycle_name'),
  recycleLabel: t('ent.cardboard.recycle_label'),
  recyclePlastic: t('ent.cardboard.recycle_plastic'),
  recycleGlass: t('ent.cardboard.recycle_glass'),
  labelPlastic: t('ent.cardboard.label_plastic'),
  labelGlass: t('ent.cardboard.label_glass'),
  recycleWrong: t('ent.cardboard.recycle_wrong'),
  recycleWrongGlass: t('ent.cardboard.recycle_wrong_glass'),
  recycleFull: t('ent.cardboard.recycle_full'),
  coinName: t('ent.cardboard.coin_name'),
  coinsHud: t('ent.cardboard.coins_hud'),
  inHand: t('ent.cardboard.in_hand'),
  actTake: t('ent.cardboard.act_take'),
  actDeposit: t('ent.cardboard.act_deposit'),
  actReturn: t('ent.cardboard.act_return')
};

export var COINS_NEEDED = 3;      // moedas para o porquinho
var RECYCLE_CAPACITY = 3;         // a lixeira azul de papelao aceita 3 caixas (1 moeda cada)

var _escDiv = document.createElement('div');
function esc(t) { _escDiv.textContent = t == null ? '' : String(t); return _escDiv.innerHTML; }

// Caixa azul de reciclagem (procedural). Chamada por scenes/Exterior.js durante a montagem do mapa: as partes
// estaticas entram no mergeStatic do exterior. Retorna a "boca" no formato do binInfo (ThrownCan.js).
// Tres lixeiras de coleta seletiva na calcada (no lugar das antigas caixas de jornal), cores da coleta seletiva:
// azul = papel/papelao (aceita 3 caixas), vermelha = plastico e verde = vidro (rejeitam papelao: a caixa quica).
var RB = { z: 7.5, w: 0.62, h: 0.92, d: 0.5, holeW: 0.46, holeD: 0.3, xs: [-2.4, -1.6, -0.8], colors: [0xc92a2a, 0x1f56b0, 0x0ca678], kinds: ['plastic', 'paper', 'glass'] };
function buildOneBin(scene, ctx, x, colorHex, kind) {
  var blue = new THREE.MeshLambertMaterial({ color: colorHex });
  var blueDark = new THREE.MeshLambertMaterial({ color: new THREE.Color(colorHex).multiplyScalar(0.7).getHex() });
  var inner = new THREE.MeshLambertMaterial({ color: 0x0b0d10 });
  var z = RB.z, w = RB.w, h = RB.h, d = RB.d, t = 0.04;
  var bodyH = h - 0.05;
  // corpo: 4 paredes + fundo interno escuro (a boca mostra o interior fundo e sem luz)
  boxAt(scene, w, bodyH, t, blue, x, bodyH / 2, z + d / 2 - t / 2);
  boxAt(scene, w, bodyH, t, blue, x, bodyH / 2, z - d / 2 + t / 2);
  boxAt(scene, t, bodyH, d - 2 * t, blue, x - w / 2 + t / 2, bodyH / 2, z);
  boxAt(scene, t, bodyH, d - 2 * t, blue, x + w / 2 - t / 2, bodyH / 2, z);
  boxAt(scene, w - 2 * t, 0.02, d - 2 * t, inner, x, 0.3, z);
  boxAt(scene, w + 0.02, 0.04, d + 0.02, blueDark, x, 0.02, z);                 // rodape
  // tampa com a abertura retangular (4 frisos em volta do buraco)
  var lidY = h - 0.025, sideW = (w + 0.04 - RB.holeW) / 2, sideD = (d + 0.04 - RB.holeD) / 2;
  boxAt(scene, sideW, 0.05, d + 0.04, blueDark, x - (RB.holeW + sideW) / 2, lidY, z);
  boxAt(scene, sideW, 0.05, d + 0.04, blueDark, x + (RB.holeW + sideW) / 2, lidY, z);
  boxAt(scene, RB.holeW, 0.05, sideD, blueDark, x, lidY, z - (RB.holeD + sideD) / 2);
  boxAt(scene, RB.holeW, 0.05, sideD, blueDark, x, lidY, z + (RB.holeD + sideD) / 2);
  // etiqueta frontal
  var c = cv(128, 32), g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(colorHex).getHexString(); g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#e8eef8'; g.font = 'bold 20px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(kind === 'paper' ? TXT.recycleLabel : kind === 'plastic' ? TXT.labelPlastic : TXT.labelGlass, 64, 17);
  var labelMat = new THREE.MeshLambertMaterial({ map: nearestTex(c) });
  planeAt(scene, 0.42, 0.105, labelMat, x, 0.66, z + d / 2 + 0.002);

  var hit = boxAt(scene, w, h, d, blue, x, h / 2, z);
  hit.visible = false;
  var bin = { x: x, z: z, topY: h, r: 0.2, out: { x: 0, z: 1 }, hit: hit, kind: kind, cap: kind === 'paper' ? RECYCLE_CAPACITY : 0, used: 0 };
  hit.userData = { type: 'recycle_bin', label: kind === 'paper' ? TXT.recycleName : kind === 'plastic' ? TXT.recyclePlastic : TXT.recycleGlass, bin: bin };
  ctx.interactables.push(hit);
  bin.solid = { x1: x - w / 2, x2: x + w / 2, z1: z - d / 2, z2: z + d / 2, h: h, mouth: true, bin: bin };
  ctx.solids.push(bin.solid);
  return bin;
}
export function buildRecycleBin(scene, ctx) {
  var bins = RB.xs.map(function(x, i) { return buildOneBin(scene, ctx, x, RB.colors[i], RB.kinds[i]); });
  return { bins: bins, accepted: 0 };
}

// Estado do modulo
var env = null;          // { scene, camera, interactables, recycle }
var boxes = [];          // { pivot, hit, home:{pos,rot}, halfH, state: 'shelf'|'held'|'free'|'recycled' }
var shelfHits = [];      // hitboxes antigos 'shelf_boxes' (saem de interactables quando as caixas viram itens)
var boxHand = new THREE.Group();   // a caixa na mao (viewmodel, filho da camera)
boxHand.visible = false;
boxHand.userData.dynamic = true;
var hitMat = new THREE.MeshBasicMaterial({ visible: false });
var coinProto = null, coinHitGeo = new THREE.SphereGeometry(0.17, 6, 4);
var coins = [];          // { grp, hit, state: 'pop'|'idle', vx, vy, vz, t, baseY }
var counterEl = null, lastCounter = '';
var throwOrigin = new THREE.Vector3(), throwDir = new THREE.Vector3();
var NO_BIN = { pile: 0 };   // releaseTape so mexe na pilha da lixeira para fitas

loadModel('models/coin.glb').then(function(m) {
  fitModel(m, 0.13);
  psxModel(m);
  // centraliza na altura para girar em volta do proprio eixo
  var bb = new THREE.Box3().setFromObject(m);
  m.position.y -= (bb.max.y + bb.min.y) / 2;
  coinProto = m;
}).catch(function(err) { console.warn('Falha ao carregar coin.glb:', err); });

// Igual ao setupViewmodelMesh do main.js (copia para nao criar import circular): a mao desenha por cima de tudo.
function viewmodel(obj) {
  obj.traverse(function(c) {
    if (!c.isMesh) return;
    c.renderOrder = 999;
    var mats = Array.isArray(c.material) ? c.material : [c.material];
    var cl = mats.map(function(m) { var mc = m.clone(); mc.depthTest = false; mc.depthWrite = false; mc.transparent = true; return mc; });
    c.material = cl.length === 1 ? cl[0] : cl;
    c.frustumCulled = false;
  });
  return obj;
}

// main.js chama uma vez, com a cena pronta.
export function initCardboard(opts) {
  env = opts;
  opts.camera.add(boxHand);
  ensureCounter();
  opts.ready.then(function() { setupBoxes(opts.shelfBoxes); });
}

function setupBoxes(list) {
  var scene = env.scene, v = new THREE.Vector3();
  list.forEach(function(rec) {
    if (shelfHits.indexOf(rec.hit) < 0) shelfHits.push(rec.hit);
    rec.shelf.updateMatrixWorld(true);
    // pivo no centro da caixa (para girar no ar), sem rotacao para medir o tamanho local
    var pivot = new THREE.Group();
    scene.add(pivot);
    var bb = new THREE.Box3().setFromObject(rec.model);
    bb.getCenter(v);
    pivot.position.copy(v);
    pivot.updateMatrixWorld(true);
    pivot.attach(rec.model);
    pivot.attach(rec.stamp);
    if (rec.stamp2) pivot.attach(rec.stamp2);                        // fundo da caixa (reciclagem)
    // o pivo nasce sem rotacao: o Box3 do mundo ja esta alinhado aos eixos dele
    var size = bb.getSize(new THREE.Vector3());
    pivot.userData.dynamic = true; rec.model.userData.dynamic = true; rec.stamp.userData.dynamic = true; if (rec.stamp2) rec.stamp2.userData.dynamic = true;
    var hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hitMat);
    hit.scale.set(size.x + 0.02, size.y + 0.04, size.z + 0.03);
    var b = { pivot: pivot, hit: hit, halfH: size.y / 2, state: 'shelf',
              home: { pos: pivot.position.clone(), rot: pivot.rotation.clone() } };
    hit.userData = { type: 'cardboard', box: b, label: TXT.boxName };
    pivot.add(hit);
    boxes.push(b);
    env.interactables.push(hit);
  });
  shelfHits.forEach(function(h) { var i = env.interactables.indexOf(h); if (i >= 0) env.interactables.splice(i, 1); });
  if (boxes.length && !boxHand.children.length) buildHandModel(boxes[0]);
}

function buildHandModel(b) {
  var vm = new THREE.Group();
  b.pivot.children.forEach(function(c) { if (c !== b.hit) vm.add(c.clone()); });
  viewmodel(vm);
  boxHand.add(vm);
}

function setInteractable(b, on) {
  var i = env.interactables.indexOf(b.hit);
  if (on && i < 0) env.interactables.push(b.hit);
  else if (!on && i >= 0) env.interactables.splice(i, 1);
}

function setHandLabel() {
  if (!EL.hand) return;
  EL.hand.classList.add('on');
  EL.hand.innerHTML = TXT.inHand + '<br><b class="v">' + esc(TXT.boxName) + '</b>';
}

// ---- caixa na mao ----
function takeBox(b) {
  if (S.held || S.heldCan || S.heldBox) return;
  releaseTape(b.pivot, NO_BIN);   // se estava voando/no chao: sai da fisica
  b.state = 'held';
  b.pivot.visible = false;
  setInteractable(b, false);
  S.heldBox = b;
  boxHand.visible = true;
  setHandLabel();
  clunk();
}

function dropHand() {
  if (S.inspect) S.inspect = false;
  S.heldBox = null;
  boxHand.visible = false;
  if (EL.hand) EL.hand.classList.remove('on');
}

// E sem alvo: a caixa volta para o seu lugar na prateleira (como a fita).
export function returnHeldBox() {
  var b = S.heldBox;
  if (!b) return;
  dropHand();
  putHome(b);
  clunk();
}

function putHome(b) {
  releaseTape(b.pivot, NO_BIN);
  b.pivot.position.copy(b.home.pos);
  b.pivot.rotation.copy(b.home.rot);
  b.pivot.visible = true;
  b.state = 'shelf';
  setInteractable(b, true);
}

// G: arremessa a caixa da mao.
export function throwHeldBox() {
  var b = S.heldBox;
  if (!b) return;
  env.camera.getWorldDirection(throwDir);
  throwOrigin.copy(env.camera.position).addScaledVector(throwDir, 0.45);
  throwOrigin.y -= 0.12;
  dropHand();
  launch(b, throwOrigin, throwDir, null);
  clunk();
}

function launch(b, origin, dir, speed) {
  b.state = 'free';
  setInteractable(b, true);
  throwBox(b.pivot, origin, dir, env.scene, b.halfH, speed);
}

// E na caixa azul com a caixa na mao: solta a caixa sobre a boca (a fisica decide se entra ou quica).
function depositHeldBox(rc) {
  var b = S.heldBox;
  if (!b) return;
  dropHand();
  throwOrigin.set(rc.x, rc.topY + 0.3, rc.z);
  throwDir.set(0, -1, 0);
  launch(b, throwOrigin, throwDir, 0.4);
}

// Mao da caixa a cada quadro (mesma pose/inspecao da fita; insE = mistura do modo inspecao).
function updateHand(insE, bob) {
  var k = 1 - insE;
  boxHand.position.set(.27 * k, (-.25 + Math.sin(bob) * .006) * k, -.5 * k - .58 * insE);
  boxHand.scale.setScalar(.85 * k + 1.05 * insE);
  boxHand.rotation.set(.18 * k + S.insRot.x * insE, -.45 * k + S.insRot.y * insE, .06 * k);
}

export function inspectLabel() {
  return '<b class="v">' + esc(TXT.boxName) + '</b><br><span class="v">' + esc(TXT.boxStamp) + '</span>';
}
export function dressBoxHand() { setHandLabel(); }

// ---- caixa azul: ganchos da fisica (main.js junta no canEnv) ----
export var cardboardCanEnv = {
  recycle: null,
  recycleAccepts: function(bin) { return !!env && bin.used < bin.cap; },
  onRecycle: function(mesh, bin) {
    var b = null;
    for (var i = 0; i < boxes.length; i++) if (boxes[i].pivot === mesh) { b = boxes[i]; break; }
    if (b) { b.state = 'recycled'; setInteractable(b, false); }
    bin.used++;
    env.recycle.accepted++;
    clunk();
    spawnCoin(bin);
    if (env.recycle.accepted === 1) unlock('alita');
  },
  onReject: function() { clunk(); }
};

// ---- moedas ----
function spawnCoin(rc) {
  if (!coinProto) return;
  var grp = new THREE.Group();
  grp.add(coinProto.clone());
  grp.position.set(rc.x, rc.topY + 0.12, rc.z);
  grp.userData.dynamic = true;
  grp.userData.noShot = true;   // o tiro atravessa a moeda (Shotgun.js)
  var hit = new THREE.Mesh(coinHitGeo, hitMat);
  grp.add(hit);
  var c = { grp: grp, hit: hit, state: 'pop', t: 0, baseY: 0,
            vx: (Math.random() - 0.5) * 1.0, vy: 3.3, vz: 1.5 + Math.random() * 0.5 };
  hit.userData = { type: 'coin', coin: c, label: TXT.coinName };
  env.scene.add(grp);
  env.interactables.push(hit);
  coins.push(c);
  coinSound(0.6);
}

function floorAt(z) { return z < 9.3 ? 0 : -0.15; }

function removeCoin(c) {
  env.scene.remove(c.grp);
  var i = env.interactables.indexOf(c.hit); if (i >= 0) env.interactables.splice(i, 1);
  var j = coins.indexOf(c); if (j >= 0) coins.splice(j, 1);
}

function takeCoin(c) {
  removeCoin(c);
  S.coins = Math.min(COINS_NEEDED, S.coins + 1);
  coinSound(1);
  refreshCounter();
}

function updateCoins(dt) {
  for (var i = 0; i < coins.length; i++) {
    var c = coins[i], p = c.grp.position;
    c.t += dt;
    c.grp.rotation.y += dt * (c.state === 'pop' ? 9 : 2.6);
    if (c.state === 'pop') {
      c.vy -= 9.8 * dt;
      p.x += c.vx * dt; p.y += c.vy * dt; p.z += c.vz * dt;
      var rest = floorAt(p.z) + 0.16;
      if (p.y <= rest && c.vy < 0) {
        p.y = rest;
        if (Math.abs(c.vy) > 1.4) { c.vy *= -0.35; c.vx *= 0.5; c.vz *= 0.5; coinSound(0.25); }
        else { c.state = 'idle'; c.baseY = rest; c.t = 0; }
      }
    } else {
      p.y = c.baseY + Math.sin(c.t * 2.4) * 0.025;     // flutua girando, como item de jogo
    }
  }
}

// ---- contador no HUD (x/3, so com >= 1 moeda) ----
function ensureCounter() {
  if (counterEl) return;
  var hud = document.getElementById('hud');
  if (!hud) return;
  counterEl = document.createElement('div');
  counterEl.id = 'coin-counter';
  hud.appendChild(counterEl);
}
export function refreshCounter() {
  ensureCounter();
  if (!counterEl) return;
  var txt = S.coins > 0 ? TXT.coinsHud + ' ' + S.coins + '/' + COINS_NEEDED : '';
  if (txt === lastCounter) return;
  lastCounter = txt;
  if (txt) counterEl.innerHTML = '<i class="coin-ico"></i>' + esc(txt);
  counterEl.classList.toggle('on', !!txt);
}

export function getCoins() { return S.coins; }
// Entrega ao porquinho: as moedas saem do contador.
export function spendCoins() { S.coins = 0; refreshCounter(); }

// ---- ligacoes com main.js ----
// Rotulo do alvo (null = nao e deste modulo).
export function cardboardLabel(o) {
  var u = o.userData;
  if (u.type === 'cardboard') return { desc: '<b>' + esc(TXT.boxName) + '</b><br><span class="v">' + esc(TXT.boxStamp) + '</span>', act: TXT.actTake };
  if (u.type === 'recycle_bin') {
    var bn = u.bin, full = !!(bn && bn.cap && bn.used >= bn.cap);
    var wrong = bn && !bn.cap ? (bn.kind === 'plastic' ? TXT.recycleWrong : TXT.recycleWrongGlass) : '';
    return { desc: '<b>' + esc(u.label) + '</b>' + (full ? '<br><span class="warn">' + esc(TXT.recycleFull) + '</span>' : wrong ? '<br><span class="warn">' + esc(wrong) + '</span>' : ''),
             act: S.heldBox ? TXT.actDeposit : '' };
  }
  if (u.type === 'coin') return { desc: '<b>' + esc(TXT.coinName) + '</b>', act: TXT.actTake };
  return null;
}

// E num alvo. Retorna true se tratou.
export function useCardboard(o) {
  var u = o.userData;
  if (u.type === 'cardboard') { takeBox(u.box); return true; }
  if (u.type === 'coin') { takeCoin(u.coin); return true; }
  if (u.type === 'recycle_bin') { if (S.heldBox) depositHeldBox(u.bin); return true; }
  return false;
}

// Alvos validos com uma caixa na mao (o resto do cenario e ignorado pelo pick()).
export var HELD_BOX_TARGETS = { recycle_bin: 1, coin: 1, pig: 1, pig_car: 1, rusbe_paper: 1 };

// Caixa cuja malha e `obj` ou um descendente do pivo (tiro da shotgun): { state, pivot, halfH } ou null.
export function boxOf(obj) {
  for (var o = obj; o; o = o.parent) {
    for (var i = 0; i < boxes.length; i++) if (boxes[i].pivot === o) return boxes[i];
  }
  return null;
}

export function updateCardboard(dt, insE, bob) {
  if (S.heldBox) updateHand(insE, bob);
  if (coins.length) updateCoins(dt);
}

// resetWorld: tudo de volta (depois da fisica, -20, que ja soltou as caixas).
onWorldReset(function() {
  if (S.heldBox) dropHand();
  S.heldBox = null; boxHand.visible = false;
  for (var i = 0; i < boxes.length; i++) putHome(boxes[i]);
  while (coins.length) removeCoin(coins[0]);
  if (env) { env.recycle.accepted = 0; env.recycle.bins.forEach(function(b) { b.used = 0; }); }
  S.coins = 0;
  refreshCounter();
});
