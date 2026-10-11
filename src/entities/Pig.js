// Porquinho do lado de fora + fuga com o carro + file "ZTA" (FINAL_GAME_DESIGN.md, secoes 4.2 e 5).
//
// - O porquinho (models/pig.glb) fica ao lado da porta do motorista do carro (carGrp de scenes/Exterior.js).
//   E com menos de 3 moedas: pulinho + grunhido. E com 3: entrega -> achievement Wolf -> pigEscape().
// - pigEscape({ breakGlass }) e reutilizavel (passo 7, shotgun: breakGlass=false, porquinho ja dentro do carro):
//   pula e quebra o vidro lateral do jeep (cacos que piscam e somem apos 6 s), entra, farois acendem, pneu canta,
//   o carro arranca em curva e some na neblina do horizonte. O OBB do carro sai de `solids` quando ele arranca;
//   no fim: S.carGone = true, pig.state = 'gone' e os ouvintes de onCarGone(fn) sao chamados (passo 8: chave
//   em CAR_SPOT).
// - Papel ZTA: comeca em cima da estante de fitas mais perto da porta (cornija, y~2.4). O ventilador do balcao
//   comeca desligado; ligar (main.js -> onFanSwitched) derruba o papel no corredor, com a camera acompanhando
//   (S.camForced so no olhar). No chao, E abre a tela de "file" (DOM, estilo Resident Evil; E/ESC/clique fecha) e,
//   depois de lido, o papel pisca 3x e some (core/Blink.js). E a unica dica do comando `zta`; o resetWorld o
//   devolve a estante.
// - pig.state: 'outside' | 'inside_car' (passo 7: shotgun ativa, use setPigInCar) | 'escaping' | 'gone'.
// - resetWorld(): porquinho, carro (pose, farois, OBB), vidro, cacos, papel (estante) e file voltam ao inicial.
import * as THREE from 'three';
import { loadModel, fitModel, G } from '../graphics/Engine.js';
import { psxModel, nearestTex } from '../scenes/interior/shared.js';
import { cv, hash } from '../core/Utils.js';
import { S } from '../core/State.js';
import { onWorldReset, SESSION } from '../core/World.js';
import { blinkState } from '../core/Blink.js';
import { unlock } from '../core/Achievements.js';
import { oinkSound, glassBreakSound, tireScreechSound, pageFlipSound } from '../core/Audio.js';
import { distanceGain } from '../core/AudioMix.js';
import { toast, TOUCH } from '../ui/UIManager.js';
import { getCoins, spendCoins, COINS_NEEDED } from './Cardboard.js';
import { t } from '../i18n/index.js';

// Textos visíveis internacionalizados via i18n.
var TXT = {
  pigName: t('ent.pig.pig_name'),
  actPoke: t('ent.pig.act_poke'),
  actGive: t('ent.pig.act_give'),
  paperName: t('ent.pig.paper_name'),
  actRead: t('ent.pig.act_read'),
  fileLine: t('ent.pig.file_line'),
  fileCmd: t('ent.pig.file_cmd'),
  fileWord: t('ent.pig.file_word'),
  fileClose: t('ent.pig.file_close'),
  fileCloseTouch: t('ent.pig.file_close_touch'),
  wontLeave: t('ent.pig.wont_leave')
};

// Onde o carro estava (o passo 8 expoe a chave aqui). Igual a pose inicial de carGrp em Exterior.js.
export var CAR_SPOT = { x: 5.10, z: 15.20 };

var GROUND_Y = -0.15;                                   // asfalto do estacionamento
var PIG_LOCAL = new THREE.Vector3(1.55, 0, 0.25);       // ao lado da porta do motorista (+x local do carro)
// Papel ZTA: fica em cima da estante de fitas mais perto da porta (a de z=4, ver Interior.js; topo da cornija a
// y~2.395, borda da frente em x~-2.055). Ligar o ventilador o derruba no corredor; depois de lido ele some.
var PAPER_SHELF = new THREE.Vector3(-2.15, 2.402, 4.0);
var PAPER_FLOOR = new THREE.Vector3(-1.45, 0.03, 3.55);
// Fases da queda (paperT parte de -PAPER_FALL_DELAY): o vento faz a folha tremer; ela e arrastada ate a borda e tomba
// (T_SLIDE); cai balancando como uma folha (T_FALL), desacelerando perto do chao; no chao desliza e assenta (T_SETTLE).
var PAPER_FALL_DELAY = 0.9, T_SLIDE = 0.85, T_FALL = 2.3, T_SETTLE = 0.6;
var PAPER_EDGE_DX = 0.30;                                  // quanto a folha anda para fora da cornija antes de tombar
var PAPER_SLIDE_ON_FLOOR = new THREE.Vector3(0.20, 0, 0.07);   // deslize final no chao (termina em PAPER_FLOOR)
var WINDOW_LOCAL = new THREE.Vector3(0.64, 1.6, -0.04);  // centro do vidro lateral (+x) do jeep (medido no jeep.glb ja escalado)
var SEAT_LOCAL = new THREE.Vector3(0.28, 1.13, -0.08);  // pes do porquinho na almofada do banco do motorista (os encostos dos bancos foram removidos em Exterior.js); medido no jeep.glb
var SEAT_SCALE = 1;                                     // mesmo tamanho de fora do carro
var SHARD_LIFETIME = 6;                                 // como os destrocos da porta

export var pig = { state: 'outside' };

var env = null;          // { scene, camera, interactables, solids, car, carAlarm, stopCarAlarm, lockPointer }
var pigGrp = new THREE.Group(), pigModel = null, pigHit = null;
var carPigHit = null;    // alvo na cabine enquanto o porquinho esta dentro do carro (shotgun): E -> "nao quer sair"
pigGrp.userData.dynamic = true;
pigGrp.userData.noShot = true;
var pigHome = { pos: new THREE.Vector3(), rotY: 0 };
var hop = 0;             // tempo restante do pulinho de reacao (HOP_TIME -> 0)
var HOP_TIME = 0.8;
var pigRig = new THREE.Group();   // pivo nos pes: squash/stretch e olhar sem mexer no GLB (pigModel fica dentro)
var look = 0, lookPitch = 0;      // olhar suavizado (yaw relativo ao home, pitch)
var enterAnim = null;             // porquinho pulando para dentro do carro (setPigInCar)
var snuffleT = 2.5;               // proximo "fungado" (cabecada) do idle
var paper = null, paperPivot = null, fileEl = null;
var paperState = 'shelf';   // shelf | falling | floor | read | gone
var paperT = 0, paperRead = false, paperRelease = false, paperLanded = false;
var shards = [], shardT = -1;
var shardMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.8 });
var escape = null;       // estado da animacao de fuga
var listeners = [];
var tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3();

// Clone do modelo do porquinho (ja ajustado: 0.42 m de largura, pes em y=0, Lambert nearest) para outros modulos, ex.: os
// porquinhos do HUNT (Hunt.js). null enquanto o GLB nao carregou. Materiais e geometria sao compartilhados.
export function pigRunnerModel() { return pigModel ? pigModel.clone(true) : null; }

// Ouvinte do fim da fuga (o carro sumiu). Retorna funcao para desregistrar.
export function onCarGone(fn) {
  listeners.push(fn);
  return function() { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

function carLocalToWorld(local, out) {
  env.car.grp.updateMatrixWorld(true);
  return env.car.grp.localToWorld(out.copy(local));
}

function paperCanvas() {
  var c = cv(64, 80), g = c.getContext('2d');
  g.fillStyle = '#cbbf98'; g.fillRect(0, 0, 64, 80);
  for (var i = 0; i < 260; i++) {                        // manchas de papel velho
    var h = hash(i + 11);
    g.fillStyle = 'rgba(90,70,40,' + (0.05 + hash(i + 3) * 0.12) + ')';
    g.fillRect((h * 64) | 0, (hash(i * 7 + 1) * 80) | 0, 2, 2);
  }
  // linhas de caneta a mao: tracos ondulados com altura/inclinacao irregulares (nao retas de regua)
  g.strokeStyle = 'rgba(25,38,95,.78)'; g.lineWidth = 1.4; g.lineCap = 'round'; g.lineJoin = 'round';
  for (var y = 13; y < 41; y += 6) {
    var len = 32 + ((hash(y) * 12) | 0), x0 = 8 + hash(y + 4) * 3, yy = y + (hash(y * 3) - 0.5) * 1.5;
    g.beginPath(); g.moveTo(x0, yy);
    var gapAt = 12 + hash(y + 2) * 8;                                     // espaco entre palavras
    for (var x = x0 + 2; x < x0 + len; x += 1.8) {
      var wy = yy + Math.sin(x * 1.5 + y) * (0.5 + hash(x * 3 + y) * 0.7) + (x - x0) * (hash(y + 9) - 0.5) * 0.03;
      if (Math.abs(x - x0 - gapAt) < 1.8 || Math.abs(x - x0 - gapAt * 2.1) < 1.8) g.moveTo(x, wy); else g.lineTo(x, wy);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(150,20,20,.9)'; g.lineWidth = 2.2;                 // a palavra, em caneta vermelha
  g.beginPath(); g.moveTo(8, 50);
  for (var xr = 10; xr < 36; xr += 2) g.lineTo(xr, 49 + Math.sin(xr * 1.3) * 1.6 - (xr % 6 < 3 ? 1.5 : 0));
  g.stroke();
  g.strokeStyle = 'rgba(80,60,30,.5)'; g.beginPath(); g.moveTo(0, 30); g.lineTo(64, 36); g.stroke();
  return c;
}

// main.js chama uma vez, com a cena pronta.
export function initPig(opts) {
  env = opts;
  var car = env.car;
  // pose do porquinho: ao lado da porta do motorista, olhando para a loja
  carLocalToWorld(PIG_LOCAL, pigHome.pos); pigHome.pos.y = GROUND_Y;
  pigHome.rotY = Math.atan2(0 - pigHome.pos.x, 6.1 - pigHome.pos.z);
  pigGrp.position.copy(pigHome.pos); pigGrp.rotation.y = pigHome.rotY;
  env.scene.add(pigGrp);
  pigHit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  pigHit.position.y = 0.27;
  pigHit.userData = { type: 'pig', label: TXT.pigName };
  pigGrp.add(pigHit);
  pigGrp.add(pigRig);
  env.interactables.push(pigHit);
  loadModel('models/pig.glb').then(function(m) {
    fitModel(m, 0.42);
    psxModel(m);
    pigModel = m;
    pigRig.add(m);
  }).catch(function(err) { console.warn('Falha ao carregar pig.glb:', err); });

  // papel no chao
  // Acima das faixas amarelas (y -0.14, MeshBasic): altura + polygonOffset + renderOrder evitam z-fighting/sumico.
  var pm = new THREE.MeshLambertMaterial({ map: nearestTex(paperCanvas()), color: 0x9a968c,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });   // o poste estoura o papel em branco
  paper = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.42), pm);
  paper.renderOrder = 2;
  paper.userData = { type: 'rusbe_paper', label: TXT.paperName };
  paperPivot = new THREE.Group();
  paperPivot.userData.dynamic = true;
  paper.userData.dynamic = true;
  paperPivot.add(paper);
  env.scene.add(paperPivot);
  resetPaper();

  // cabine do carro: alvo de interacao so com o porquinho dentro (setPigInCar)
  carPigHit = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 1.9), new THREE.MeshBasicMaterial({ visible: false }));
  carPigHit.position.set(0, 1.35, 0);
  carPigHit.userData = { type: 'pig_car', label: TXT.pigName };
  car.body.add(carPigHit);

  buildFileOverlay();
}

// ---- papel ZTA: estante -> chao -> some depois de lido ----
function setPaperInteractable(on) {
  var i = env.interactables.indexOf(paper);
  if (on && i < 0) env.interactables.push(paper);
  else if (!on && i >= 0) env.interactables.splice(i, 1);
}

function resetPaper() {
  endPaperFollow();
  paperT = 0; paperRead = false; paperRelease = false; paperLanded = false;
  if (SESSION.paperGone) {                                      // ja lido: nao volta para lugar nenhum (so em novo jogo)
    paperState = 'gone'; paperPivot.visible = false; setPaperInteractable(false);
    return;
  }
  paperState = 'shelf';
  paperPivot.visible = true;
  paperPivot.position.copy(PAPER_SHELF);
  paperPivot.rotation.set(0, -Math.PI / 2, 0);                  // lado de cima do papel voltado para o corredor (+x)
  paper.position.set(0, 0, 0.0);
  paper.rotation.set(-Math.PI / 2 - 0.12, 0, 0);                // deitado, com a ponta da frente caindo um pouco
  setPaperInteractable(false);
}

// Camera acompanha o papel: vira para a estante assim que o ventilador liga, segue a queda e segura um instante no
// chao. S.camForced trava so o olhar (mouse/toque); o jogador ainda anda.
var paperFollow = { on: false, t: 0, rest: -1 };
var PFOLLOW_RATE = 4.5, PFOLLOW_HOLD = 1.0, PFOLLOW_MAX = 8;
function shortAngle(a, b) { var d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function startPaperFollow() {
  var P = window.P;
  if (!P || S.phase !== 'inside' || S.watching || S.terminalOpen || S.playingArcade || S.playingGta || S.fileOpen || S.cutscene || S.camForced || S.inspect) return;
  paperFollow.on = true; paperFollow.t = 0; paperFollow.rest = -1;
  S.camForced = true;
}
function endPaperFollow() {
  if (!paperFollow.on) return;
  paperFollow.on = false;
  S.camForced = false;
}
function updatePaperFollow(dt) {
  var P = window.P;
  paperFollow.t += dt;
  if (!P || paperFollow.t > PFOLLOW_MAX || paperState === 'read' || paperState === 'gone') { endPaperFollow(); return; }
  if (paperState === 'floor') {
    if (paperFollow.rest < 0) paperFollow.rest = 0;
    paperFollow.rest += dt;
    if (paperFollow.rest > PFOLLOW_HOLD) { endPaperFollow(); return; }
  }
  var pp = paperPivot.position, dx = pp.x - P.pos.x, dz = pp.z - P.pos.z, dy = pp.y - P.pos.y;
  var ty = Math.atan2(-dx, -dz), tp = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.hypot(dx, dz))));
  var k = 1 - Math.exp(-PFOLLOW_RATE * dt);
  P.yaw += shortAngle(P.yaw, ty) * k;
  P.pitch += (tp - P.pitch) * k;
}

// main.js avisa quando o ventilador muda; ligado, o vento derruba o papel (so a primeira vez).
export function onFanSwitched(on) {
  if (on && paperState === 'shelf') { paperState = 'falling'; paperT = -PAPER_FALL_DELAY; startPaperFollow(); }
}

function updatePaper(dt) {
  if (!paperPivot) return;
  if (paperFollow.on) updatePaperFollow(dt);
  if (paperState === 'falling') {
    paperT += dt;
    var BASE = -Math.PI / 2 - 0.12;                                // deitada na estante, ponta da frente caindo um pouco
    var edgeX = PAPER_SHELF.x + PAPER_EDGE_DX, fy = PAPER_FLOOR.y;
    var landX = PAPER_FLOOR.x - PAPER_SLIDE_ON_FLOOR.x, landZ = PAPER_FLOOR.z - PAPER_SLIDE_ON_FLOOR.z;
    if (paperT < 0) {                                              // as pas pegam velocidade: a ponta treme, cada vez mais
      var w = 1 + paperT / PAPER_FALL_DELAY;
      paper.rotation.x = BASE + Math.sin(paperT * 38) * 0.04 * w;
      paper.rotation.z = Math.sin(paperT * 23) * 0.03 * w;
      paperPivot.position.y = PAPER_SHELF.y + Math.abs(Math.sin(paperT * 31)) * 0.012 * w;
      return;
    }
    if (paperT < T_SLIDE) {                                        // arrastada ate a borda, sobe a ponta, tomba
      var a1 = paperT / T_SLIDE;
      paperPivot.position.x = PAPER_SHELF.x + PAPER_EDGE_DX * a1 * a1;
      paperPivot.position.y = PAPER_SHELF.y + Math.sin(a1 * Math.PI) * 0.03;
      var tip = Math.max(0, (a1 - 0.45) / 0.55);
      paper.rotation.x = BASE - 0.9 * tip * tip + Math.sin(paperT * 30) * 0.04 * (1 - tip);
      paper.rotation.z = Math.sin(paperT * 21) * 0.05;
      if (a1 > 0.55 && !paperRelease) { paperRelease = true; pageFlipSound(); }
    } else if (paperT < T_SLIDE + T_FALL) {                        // queda de folha: pendulo + giro, devagar perto do chao
      var u = (paperT - T_SLIDE) / T_FALL, damp = Math.pow(1 - u, 0.6);
      var f = 1 - Math.pow(1 - u, 1.6);                             // desce rapido no inicio e flutua no fim
      var ph = u * Math.PI * 2 * 1.7;
      paperPivot.position.y = fy + (PAPER_SHELF.y - fy) * (1 - f) + 0.02 * Math.sin(u * 40) * damp;
      paperPivot.position.x = edgeX + (landX - edgeX) * (0.5 * u + 0.5 * f) + Math.sin(ph) * 0.2 * damp;
      paperPivot.position.z = PAPER_SHELF.z + (landZ - PAPER_SHELF.z) * u + Math.sin(ph * 0.8) * 0.17 * damp;
      paperPivot.rotation.y = -Math.PI / 2 + u * 2.1 + Math.sin(ph) * 0.35 * damp;
      paper.rotation.x = BASE - 0.9 * (1 - u) + Math.sin(ph) * 0.75 * damp;   // balanca para um lado e para o outro (comeca em 0)
      paper.rotation.z = -Math.sin(ph * 1.3) * 0.55 * damp;
    } else {                                                       // pousou: desliza, quica de leve e assenta
      var c = Math.min(1, (paperT - T_SLIDE - T_FALL) / T_SETTLE), cs = 1 - Math.pow(1 - c, 3);
      if (!paperLanded) { paperLanded = true; pageFlipSound(); }
      paperPivot.position.x = landX + PAPER_SLIDE_ON_FLOOR.x * cs;
      paperPivot.position.z = landZ + PAPER_SLIDE_ON_FLOOR.z * cs;
      paperPivot.position.y = fy + 0.035 * Math.exp(-7 * c) * Math.abs(Math.sin(c * 15));
      paperPivot.rotation.y = -Math.PI / 2 + 2.1 + 0.18 * cs;
      paper.rotation.x = -Math.PI / 2 - 0.12 * (1 - cs) + (1 - cs) * 0.25 * Math.sin(c * 17);
      paper.rotation.z = (1 - cs) * 0.2 * Math.sin(c * 13);
      if (c >= 1) {
        paperState = 'floor';
        paperPivot.position.copy(PAPER_FLOOR);
        paper.rotation.set(-Math.PI / 2, 0, 0);
        setPaperInteractable(true);
      }
    }
  } else if (paperState === 'read') {                           // lido: pisca 3x e some do chao (core/Blink.js)
    paperT += dt;
    var b = blinkState(paperT);
    if (b === 2) { paperState = 'gone'; SESSION.paperGone = true; paperPivot.visible = false; }
    else paperPivot.visible = b === 1;
  }
}

// ---- file ZTA ----
function buildFileOverlay() {
  if (fileEl) return;
  fileEl = document.createElement('div');
  fileEl.id = 'rusbe-file';
  var paperDiv = document.createElement('div'); paperDiv.className = 'file-paper';
  var l1 = document.createElement('p'); l1.className = 'file-line'; l1.textContent = TXT.fileLine;
  var lc = document.createElement('p'); lc.className = 'file-line file-cmd'; lc.textContent = TXT.fileCmd;
  var l2 = document.createElement('p'); l2.className = 'file-word'; l2.textContent = TXT.fileWord;
  paperDiv.appendChild(l1); paperDiv.appendChild(lc); paperDiv.appendChild(l2);
  var hint = document.createElement('div'); hint.className = 'file-hint'; hint.textContent = TOUCH ? TXT.fileCloseTouch : TXT.fileClose;
  fileEl.appendChild(paperDiv); fileEl.appendChild(hint);
  fileEl.addEventListener('click', function() { closeFile(); });
  document.body.appendChild(fileEl);
}

export function openFile() {
  if (S.fileOpen) return;
  S.fileOpen = true;
  if (S.inspect) S.inspect = false;
  if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) {} }
  fileEl.classList.add('on');
  pageFlipSound();
}

export function closeFile() {
  if (!S.fileOpen || !fileEl || !fileEl.classList.contains('on')) return;   // o QR do armario tambem usa S.fileOpen
  S.fileOpen = false;
  fileEl.classList.remove('on');
  pageFlipSound();
  if (paperRead && paperState === 'floor') { paperState = 'read'; paperT = 0; setPaperInteractable(false); }
  if (env && env.lockPointer && S.phase === 'inside') env.lockPointer();
}

// ---- interacao (main.js) ----
export function pigLabel(o) {
  var t = o.userData.type;
  if (t === 'pig') {
    var n = getCoins();
    return { desc: '<b>' + TXT.pigName + '</b>' + (n > 0 && n < COINS_NEEDED ? '<br><span class="v">' + n + '/' + COINS_NEEDED + '</span>' : ''),
             act: n >= COINS_NEEDED ? TXT.actGive : TXT.actPoke };
  }
  if (t === 'rusbe_paper') return { desc: '<b>' + TXT.paperName + '</b>', act: TXT.actRead };
  if (t === 'pig_car') return { desc: '<b>' + TXT.pigName + '</b>', act: getCoins() >= COINS_NEEDED ? TXT.actGive : TXT.actPoke };
  return null;
}

export function usePig(o) {
  var t = o.userData.type;
  if (t === 'rusbe_paper') { paperRead = true; openFile(); return true; }
  if (t === 'pig_car') { if (pig.state === 'inside_car') toast(TXT.wontLeave); return true; }
  if (t !== 'pig') return false;
  if (pig.state !== 'outside') return true;
  if (getCoins() >= COINS_NEEDED) {
    spendCoins();
    unlock('wolf');
    pigEscape();
  } else {
    hop = HOP_TIME;
    oinkSound(volAt(pigGrp.position));
  }
  return true;
}

function volAt(p) {
  var c = env.camera.position;
  return distanceGain(Math.hypot(c.x - p.x, c.z - p.z), 2.5, 1.1, 45);
}

// Passo 7 (shotgun): porquinho dentro do carro, de janelas fechadas (sem interacao) ou de volta para fora.
// Porquinho sentado no banco: filho do corpo do carro, entao balanca e anda junto com ele na fuga.
function seatPig() {
  env.car.body.add(pigGrp);
  pigGrp.position.copy(SEAT_LOCAL);
  pigGrp.rotation.set(0, 0, 0);
  pigGrp.scale.setScalar(SEAT_SCALE);
  pigGrp.visible = true;
  resetRig();
}

function unseatPig() {
  if (pigGrp.parent !== env.scene) env.scene.add(pigGrp);
  pigGrp.scale.setScalar(1);
}

// Passo 7 (shotgun): porquinho dentro do carro (sentado no banco, visivel pelas janelas) ou de volta para fora.
export function setPigInCar(inCar) {
  if (pig.state === 'escaping' || pig.state === 'gone') return;
  if (inCar && pig.state === 'inside_car') return;
  var fromOutside = pig.state === 'outside' && pigGrp.visible && pigGrp.parent === env.scene;
  pig.state = inCar ? 'inside_car' : 'outside';
  setPigInteractable(!inCar);
  setCarPigInteractable(inCar);
  enterAnim = null;
  if (inCar) {
    if (fromOutside && pigModel) {                // pulinho para dentro do carro e senta
      enterAnim = { t: 0, from: pigGrp.position.clone(), seat: carLocalToWorld(SEAT_LOCAL, new THREE.Vector3()) };
      oinkSound(volAt(pigGrp.position));
    } else seatPig();
  } else {
    unseatPig();
    pigGrp.visible = true;
    pigGrp.position.copy(pigHome.pos); pigGrp.rotation.set(0, pigHome.rotY, 0);
    resetRig();
  }
}

function wrapAngle(a) { return a - Math.PI * 2 * Math.round(a / (Math.PI * 2)); }

// Primeiro tiro com o porquinho dentro do carro: ele grunhe e se assusta no banco (pula, balanca a cabeca, treme).
var startleT = -1, STARTLE_TIME = 1.3;
export function pigStartled() {
  if (pig.state !== 'inside_car' || enterAnim || !pigModel) return;
  startleT = 0;
  oinkSound(volAt(carLocalToWorld(SEAT_LOCAL, tmpW)));            // pigGrp.position e local ao carro: o volume usa a posicao do mundo
}

function updateStartle(dt) {
  startleT += dt;
  if (startleT >= STARTLE_TIME) {
    startleT = -1;
    pigGrp.position.y = SEAT_LOCAL.y;
    pigRig.rotation.y = 0; pigRig.rotation.z = 0;
    return false;
  }
  var e = 1 - startleT / STARTLE_TIME;
  var hop = Math.abs(Math.sin(startleT * Math.PI * 2.4)) * 0.14 * e;
  pigGrp.position.y = SEAT_LOCAL.y + hop;
  squash(1 + 0.1 * Math.sin(startleT * 26) * e + (hop > 0.02 ? 0.08 * e : 0));
  pigRig.rotation.y = Math.sin(startleT * 13) * 0.7 * e;          // vira a cabeca de um lado para o outro
  pigRig.rotation.z = Math.sin(startleT * 31) * 0.1 * e;          // tremida
  return true;
}

function resetRig() {
  startleT = -1;
  pigRig.scale.set(1, 1, 1); pigRig.rotation.set(0, 0, 0); pigRig.position.set(0, 0, 0);
  look = 0; lookPitch = 0; hop = 0;
}

// squash/stretch preservando volume: sy = altura; xz = 1/sqrt(sy)
function squash(sy) {
  var xz = 1 / Math.sqrt(sy);
  pigRig.scale.set(xz, sy, xz);
}

function setCarPigInteractable(on) {
  if (!carPigHit) return;
  var i = env.interactables.indexOf(carPigHit);
  if (on && i < 0) env.interactables.push(carPigHit);
  else if (!on && i >= 0) env.interactables.splice(i, 1);
}

function setPigInteractable(on) {
  var i = env.interactables.indexOf(pigHit);
  if (on && i < 0) env.interactables.push(pigHit);
  else if (!on && i >= 0) env.interactables.splice(i, 1);
}

// ---- fuga ----
// breakGlass=false: o porquinho ja esta dentro do carro (passo 7) e o vidro fica inteiro.
export function pigEscape(opts) {
  opts = opts || {};
  var breakGlass = opts.breakGlass !== false;
  if (!env || S.carGone || escape) return false;
  if (env.stopCarAlarm) env.stopCarAlarm();          // o alarme nao continua tocando num carro que vai embora
  setPigInteractable(false);
  setCarPigInteractable(false);
  pig.state = 'escaping';
  escape = { phase: breakGlass ? 'wind' : 'ignite', t: 0, breakGlass: breakGlass,
             from: pigGrp.position.clone(), win: carLocalToWorld(WINDOW_LOCAL, new THREE.Vector3()),
             seat: carLocalToWorld(SEAT_LOCAL, new THREE.Vector3()),
             heading: env.car.home.rotY, speed: 0, dist: 0, screech: null, solidOut: false };
  if (breakGlass) {
    pigGrp.visible = true;
    pigGrp.rotation.y = Math.atan2(escape.win.x - escape.from.x, escape.win.z - escape.from.z);
    oinkSound(volAt(pigGrp.position));
  }                                                   // ja dentro: continua sentado no banco (filho do carro)
  return true;
}

function shatterGlass() {
  if (env.car.glass) env.car.glass.visible = false;                // o vidro some; os cacos voam
  var w = carLocalToWorld(WINDOW_LOCAL, tmpW), rot = env.car.home.rotY;
  var nx = Math.cos(rot), nz = -Math.sin(rot);         // +x local do carro em coordenadas de mundo
  var fx = Math.sin(rot), fz = Math.cos(rot);
  for (var i = 0; i < 34; i++) {
    var m = new THREE.Mesh(G.unit, shardMat);
    var s = 0.025 + Math.random() * 0.06;
    m.scale.set(s, s * (0.4 + Math.random()), 0.006);
    var along = (Math.random() - 0.5) * 0.8, up = (Math.random() - 0.5) * 0.45;
    m.position.set(w.x + fx * along, w.y + up, w.z + fz * along);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    m.userData.dynamic = true;
    env.scene.add(m);
    var sp = 1.2 + Math.random() * 2.6;
    shards.push({ mesh: m, vx: nx * sp + (Math.random() - 0.5), vy: 0.6 + Math.random() * 2.2, vz: nz * sp + (Math.random() - 0.5),
                  rx: (Math.random() - 0.5) * 16, ry: (Math.random() - 0.5) * 16 });
  }
  shardT = 0;
  glassBreakSound(volAt(w));
}

function clearShards() {
  // geometria (G.unit) e material (shardMat) sao compartilhados entre as quebras: nada a dar dispose
  for (var i = 0; i < shards.length; i++) env.scene.remove(shards[i].mesh);
  shards.length = 0;
  shardT = -1;
}

function updateShards(dt) {
  if (shardT < 0) return;
  shardT += dt;
  for (var i = 0; i < shards.length; i++) {
    var d = shards[i], p = d.mesh.position;
    if (d.vx === 0 && d.vy === 0 && d.vz === 0) continue;
    d.vy -= 9.8 * dt;
    p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
    d.mesh.rotation.x += d.rx * dt; d.mesh.rotation.y += d.ry * dt;
    var fy = (p.z < 9.3 ? 0 : GROUND_Y) + 0.01;
    if (p.y <= fy) {
      p.y = fy; d.vx *= 0.4; d.vz *= 0.4; d.vy = -d.vy * 0.25;
      if (Math.abs(d.vy) < 0.3) { d.vx = d.vy = d.vz = 0; d.mesh.rotation.x = -Math.PI / 2; }
    }
  }
  if (shardT > SHARD_LIFETIME) {
    var b = blinkState(shardT - SHARD_LIFETIME);
    if (b === 2) clearShards();
    else for (var k = 0; k < shards.length; k++) shards[k].mesh.visible = b === 1;
  }
}

function removeCarSolid() {
  (env.car.solids || [env.car.solid]).forEach(function(sd) {
    var i = env.solids.indexOf(sd);
    if (i >= 0) env.solids.splice(i, 1);
  });
}

function updateEscape(dt) {
  var e = escape, car = env.car;
  e.t += dt;
  if (e.phase === 'wind') {                               // antecipacao: agacha e treme antes do pulo
    var w = Math.min(1, e.t / 0.3);
    squash(1 - 0.32 * w * w);
    pigRig.rotation.z = Math.sin(e.t * 55) * 0.05 * w;
    if (w >= 1) { e.phase = 'jump'; e.t = 0; pigRig.rotation.z = 0; }
  } else if (e.phase === 'jump') {                        // pulo ate a janela (parabola)
    var s = Math.min(1, e.t / 0.7);
    pigGrp.position.lerpVectors(e.from, e.win, s);
    pigGrp.position.y += Math.sin(Math.PI * s) * 0.7 - 0.22 * s;   // chega com a barriga na altura do vidro
    pigGrp.rotation.x = -0.5 * s;
    squash(s < 0.25 ? 1 + 0.28 * (1 - s / 0.25) : 1 + 0.06 * Math.sin(Math.PI * s));   // estica na decolagem
    if (s >= 1) { shatterGlass(); e.phase = 'enter'; e.t = 0; }
  } else if (e.phase === 'enter') {                       // mergulha para dentro
    var s2 = Math.min(1, e.t / 0.35);
    squash(s2 < 0.3 ? 0.72 + 0.28 * (s2 / 0.3) : 1);   // impacto no vidro: achata e volta
    tmpV.copy(e.win); tmpV.y -= 0.22;
    pigGrp.position.lerpVectors(tmpV, e.seat, s2);
    pigGrp.scale.setScalar(1 + (SEAT_SCALE - 1) * s2);
    if (s2 >= 1) { seatPig(); e.phase = 'ignite'; e.t = 0; }
  } else if (e.phase === 'ignite') {                      // farois acendem
    if (e.t >= 0.5 && !e.lit) { e.lit = true; env.carAlarm.headlights(true); }
    if (e.t >= 1.0) {
      e.phase = 'screech'; e.t = 0;
      e.screech = tireScreechSound(3.2, volAt(car.grp.position));
    }
  } else if (e.phase === 'screech') {                     // pneu cantando parado: o carro treme
    car.body.rotation.z = Math.sin(e.t * 60) * 0.012;
    car.body.rotation.x = -0.025 * Math.min(1, e.t / 0.3);
    if (e.t >= 0.7) { e.phase = 'drive'; e.t = 0; removeCarSolid(); e.solidOut = true; }
  } else if (e.phase === 'drive') {                       // arranca em curva e some na neblina
    e.speed = Math.min(19, e.speed + dt * (e.t < 1.5 ? 7.5 : 5));
    var turn = Math.min(1, e.speed / 4);
    var yawRate = e.t < 1.1 ? 0.55 : (e.t < 2.5 ? -0.6 : 0);
    e.heading += yawRate * turn * dt;
    var step = e.speed * dt;
    car.grp.position.x += Math.sin(e.heading) * step;
    car.grp.position.z += Math.cos(e.heading) * step;
    car.grp.rotation.y = e.heading;
    e.dist += step;
    car.body.rotation.z = -yawRate * turn * 0.07;
    car.body.rotation.x = Math.max(-0.04, -0.04 + e.t * 0.03);
    if (e.screech) e.screech.setVol(volAt(car.grp.position));
    if (e.dist > 85) finishEscape();
  }
}

function finishEscape() {
  var car = env.car;
  car.grp.visible = false;
  env.carAlarm.headlights(false);
  if (escape && escape.screech) escape.screech.stop();
  if (escape && !escape.solidOut) removeCarSolid();
  escape = null;
  S.carGone = true;
  pig.state = 'gone';
  var list = listeners.slice();
  for (var i = 0; i < list.length; i++) {
    try { list[i](); } catch (err) { console.error('[onCarGone] falha:', err); }
  }
}

// Modo HUNT (Hunt.js): carro e porquinho fora de cena (o vao do estacionamento fica livre). Sem S.carGone: a chave
// nao aparece. O resetWorld() devolve tudo.
export function setHuntStage() {
  if (!env) return;
  if (escape && escape.screech) escape.screech.stop();
  escape = null; enterAnim = null;
  env.car.grp.visible = false;
  removeCarSolid();
  env.carAlarm.headlights(false);
  pigGrp.visible = false;
  setPigInteractable(false);
  setCarPigInteractable(false);
}

// Chamado a cada quadro pelo main.js.
export function updatePig(dt) {
  if (!env) return;
  if (escape) updateEscape(dt);
  updateShards(dt);
  updatePaper(dt);
  if (enterAnim) updateEnter(dt);
  if (pig.state === 'outside' && pigModel) updateIdle(dt);
  else if (pig.state === 'inside_car' && !enterAnim && pigModel) {
    if (startleT < 0 || !updateStartle(dt)) squash(1 + Math.sin(performance.now() * 0.0022) * 0.022);   // sentado: respira e olha para a frente do carro
  }
}

function updateEnter(dt) {
  var a = enterAnim;
  a.t += dt;
  var s = Math.min(1, a.t / 0.5);
  pigGrp.position.lerpVectors(a.from, a.seat, s);
  pigGrp.position.y += Math.sin(Math.PI * s) * 0.6;
  pigGrp.scale.setScalar(1 + (SEAT_SCALE - 1) * s);
  squash(s < 0.2 ? 1 - 0.25 * (s / 0.2) : 1 + 0.2 * Math.sin(Math.PI * s));
  if (s >= 1) { enterAnim = null; seatPig(); }
}

function updateIdle(dt) {
  var t = performance.now() * 0.001, y0 = pigHome.pos.y;
  // olhar sempre para o jogador, em qualquer direcao (360 graus, sem limite de distancia) + cabecada de fungar
  var c = env.camera.position, dx = c.x - pigGrp.position.x, dz = c.z - pigGrp.position.z;
  var want = wrapAngle(Math.atan2(dx, dz) - pigHome.rotY), wantPitch = 0;
  snuffleT -= dt;
  if (snuffleT < 0) snuffleT = 3 + hash((t * 13) | 0) * 4;
  if (snuffleT < 0.6 && hop <= 0) wantPitch = 0.16 * Math.sin(Math.PI * snuffleT / 0.6) * (0.6 + 0.4 * Math.sin(snuffleT * 40));
  var k = 1 - Math.exp(-5 * dt);
  look = wrapAngle(look + wrapAngle(want - look) * k);
  lookPitch += (wantPitch - lookPitch) * (1 - Math.exp(-14 * dt));
  pigRig.rotation.y = look;
  pigRig.rotation.x = lookPitch;
  if (hop > 0) {
    hop = Math.max(0, hop - dt);
    var e = HOP_TIME - hop, sy = 1, h = 0;
    if (e < 0.14) sy = 1 - 0.3 * (e / 0.14);                           // antecipacao: agacha
    else if (e < 0.55) {                                                // salto + estica
      var u = (e - 0.14) / 0.41;
      h = Math.sin(Math.PI * u) * 0.2;
      sy = 1 + 0.16 * Math.sin(Math.PI * Math.min(1, u * 1.4));
    } else if (e < 0.7) sy = 0.78 + 0.22 * ((e - 0.55) / 0.15);         // impacto no chao
    else sy = 1 + 0.04 * Math.sin((e - 0.7) * 40) * (1 - (e - 0.7) / 0.1);
    pigGrp.position.y = y0 + h;
    squash(sy);
    pigRig.rotation.z = Math.sin(e * 22) * 0.07;
  } else {
    pigGrp.position.y = y0;
    var br = Math.sin(t * 2.2);
    squash(1 + br * 0.022);                                             // respiracao
    pigRig.rotation.z = Math.sin(t * 0.9) * 0.025;                      // balanco leve
  }
}

// resetWorld: carro, porquinho, vidro, cacos, papel e file de volta ao inicio.
onWorldReset(function() {
  if (!env) return;
  closeFile();
  if (escape && escape.screech) escape.screech.stop();
  escape = null; enterAnim = null; resetRig();
  var car = env.car, h = car.home;
  car.grp.visible = true;
  car.grp.position.set(h.x, h.y, h.z);
  car.grp.rotation.set(0, h.rotY, 0);
  car.body.rotation.set(0, 0, 0); car.body.position.set(0, 0, 0);
  env.carAlarm.headlights(false);
  (car.solids || [car.solid]).forEach(function(sd) { if (env.solids.indexOf(sd) < 0) env.solids.push(sd); });
  if (env.car.glass) env.car.glass.visible = true;
  clearShards();
  S.carGone = false;
  pig.state = 'outside';
  unseatPig();
  pigGrp.visible = true;
  pigGrp.position.copy(pigHome.pos);
  pigGrp.rotation.set(0, pigHome.rotY, 0);
  pigGrp.scale.setScalar(1);
  setPigInteractable(true);
  setCarPigInteractable(false);
  resetPaper();
});
