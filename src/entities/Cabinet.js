// Armario, cadeado e chave (FINAL_GAME_DESIGN.md, secao 10; achievement Inception da secao 12).
//
// - O armario e DE FERRO, desenhado por codigo (boxAt/planeAt; chapas de aco rebitadas, ferrugem e ferragens pesadas),
//   encostado na parede direita onde ficavam as caixas de papelao (buildCabinet, chamado por
//   scenes/interior/Furnishings.js). As partes fixas entram no mergeStatic; a porta e um pivo na dobradica
//   (userData.dynamic).
// - Cadeado (models/padlock.glb, CC-BY 3.0 Garrett LeFever) preso no hasp da porta. E sem a chave: toast curto +
//   tinido de metal + o cadeado balanca.
// - Chave (models/key.glb, CC0 Quaternius) caida sob o carro (CAR_SPOT de Pig.js): invisivel e sem hitbox ate o
//   carro ir embora (onCarGone / S.carGone). No chao ela cintila (glint estilo RE2, sprite aditivo) para nao
//   passar despercebida no asfalto escuro. E pega (ocupa as maos, S.heldKey), F inspeciona (toggleInspect do
//   main.js) e, uma vez na mao, NAO pode mais ser largada: G ou E sem alvo so recusam (sem risco de soft-lock).
// - Chave na mao + E no armario: o arco do cadeado salta, o cadeado cai, a porta abre, confete (1 InstancedMesh
//   reaproveitado, ~3 s) + musiquinha -> unlock('inception') e SESSION.cabinetOpened = true (sessao).
// - Dentro, preso ao fundo: um bilhete escrito a mao ("acabou, voce chegou ao fim - celebracao"). E/F o pega (ocupa as
//   maos, S.heldKey = noteObj com kind 'note', mesmo mecanismo da chave); F inspeciona e, virando o papel, o VERSO diz
//   que tudo e uma simulacao e manda escrever HUNT no terminal. G ou E sem alvo devolvem o bilhete ao fundo do armario.
// - resetWorld(): armario fechado com cadeado, chave escondida sob o carro, confete apagado. SESSION fica.
import * as THREE from 'three';
import { boxAt, planeAt, loadModel, fitModel } from '../graphics/Engine.js';
import { psxModel, nearestTex } from '../scenes/interior/shared.js';
import { tex } from '../core/Utils.js';
import { cv, hash } from '../core/Utils.js';
import { S } from '../core/State.js';
import { EL, toast, TOUCH } from '../ui/UIManager.js';
import { onWorldReset, SESSION } from '../core/World.js';
import { unlock } from '../core/Achievements.js';
import { clunk, beep, pageFlipSound, padlockRattleSound, padlockOpenSound, padlockDropSound, cabinetCreakSound, cabinetJingleSound } from '../core/Audio.js';
import { CAR_SPOT, onCarGone } from './Pig.js';
import { t } from '../i18n/index.js';

// Textos visíveis internacionalizados via i18n. Sem frases montadas por concatenacao.
export var TXT = {
  cabinetName: t('ent.cabinet.cabinet_name'),
  lockedTag: t('ent.cabinet.locked_tag'),
  locked: t('ent.cabinet.locked'),
  actOpen: t('ent.cabinet.act_open'),
  actClose: t('ent.cabinet.act_close'),
  actUnlock: t('ent.cabinet.act_unlock'),
  keyName: t('ent.cabinet.key_name'),
  keyDesc: t('ent.cabinet.key_desc'),
  inHand: t('ent.cabinet.in_hand'),
  actTake: t('ent.cabinet.act_take'),
  btnDropKey: t('ent.cabinet.btn_drop_key'),
  btnDropNote: t('ent.cabinet.btn_drop_note'),
  btnDrop: t('ent.cabinet.btn_drop'),
  noteName: t('ent.cabinet.note_name'),
  noteDesc: t('ent.cabinet.note_desc'),
  noteFront: t('ent.cabinet.note_front'),
  noteBack: t('ent.cabinet.note_back'),
  cantDropKey: t('ent.cabinet.cant_drop_key')
};

// Medidas no espaco local do armario (frente = +Z local, voltada para o corredor = -X do mundo).
// z = 1.85: reespaçamento da parede direita (AJUSTES_FINAIS.md §3) — 0.75 m do balcão e 0.58 m da máquina
// de refrigerante. cab.solid deriva de CAB.z, então a colisão acompanha.
var CAB = { x: 2.31, z: 1.85, w: 0.74, h: 1.86, d: 0.48, t: 0.03 };
var DOOR = { y0: 0.10, h: 1.72, w: 0.72, t: 0.03 };
var OPEN_ANGLE = 1.8;            // rad (~103 graus)
var HASP_Y = 1.18;
var LOCK_W = 0.06;               // largura do cadeado (m)
var KEY_GROUND_Y = -0.15;        // asfalto do estacionamento
var CONFETTI_N = 140, CONFETTI_LIFE = 3.0;
var NOTE_PLANE_W = 0.26, NOTE_PLANE_H = 0.33;     // papel (m); no fundo e na mao

var hitMat = new THREE.MeshBasicMaterial({ visible: false });
var env = null;                  // { scene, camera, interactables, solids, lockPointer }

var cab = { state: 'locked', t: 0, grp: null, door: null, hit: null, note: null, solid: null, doorSolid: null,
            celebrated: false, creaked: false };
var lock = { grp: null, shackle: null, shackleY: 0, home: null, falling: false, rested: false, bounced: false,
             vel: new THREE.Vector3(), spin: 0, jiggle: 0 };
var key = { kind: 'key', state: 'hidden', pivot: null, hit: null, proto: null, glint: null, glintT: 0 };   // hidden | floor | held | used
// Brilho cintilante estilo Resident Evil 2 (PS1) sobre a chave caida no asfalto escuro (AJUSTES_FINAIS.md §5.1):
// ciclo de 2 s, apagado quase todo o tempo e uma piscada rapida de 0.4 s.
var GLINT_CYCLE = 2.0, GLINT_FLASH = 0.4, GLINT_Y = 0.04, GLINT_MIN = 0.08, GLINT_MAX = 0.18, GLINT_PEAK = 0.95;
var keyHand = new THREE.Group();
keyHand.visible = false;
keyHand.userData.dynamic = true;

// Bilhete do fundo do armario: item pegavel como a chave (S.heldKey = noteObj, kind 'note'); frente e verso manuscritos.
var noteObj = { kind: 'note', state: 'wall' };       // wall | held
var noteHand = new THREE.Group();
noteHand.visible = false;
noteHand.userData.dynamic = true;
var noteTex = { front: null, back: null, frontCv: null, backCv: null };
var tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3();

// ---- texturas ----
// Chapa de ferro/aco pintada, de superficie LISA: tinta cinza-chumbo com brilho suave, juntas de chapa com rebites e so um
// pouco de ferrugem e de desgaste (poucas estrias, poucos riscos) perto do chao. `kind`: 'body' (carcaca) ou 'door' (porta, borda rebitada).
function ironCanvas(seed, kind) {
  var W = 128, H = 256, c = cv(W, H), g = c.getContext('2d'), i;
  var gr0 = g.createLinearGradient(0, 0, W, 0);
  gr0.addColorStop(0, '#4d5359'); gr0.addColorStop(0.5, '#5e656c'); gr0.addColorStop(1, '#4b5157');
  g.fillStyle = gr0; g.fillRect(0, 0, W, H);
  var sheen = g.createLinearGradient(0, 0, 0, H);            // brilho suave de tinta: faixa clara no alto, escurece embaixo
  sheen.addColorStop(0, 'rgba(255,255,255,.07)'); sheen.addColorStop(0.45, 'rgba(255,255,255,.02)'); sheen.addColorStop(1, 'rgba(0,0,0,.1)');
  g.fillStyle = sheen; g.fillRect(0, 0, W, H);
  for (i = 0; i < 26; i++) {                                 // quase nenhuma textura de escova
    g.fillStyle = hash(i * 3 + seed) > 0.5 ? 'rgba(255,255,255,' + (0.015 + hash(i + seed) * 0.02).toFixed(3) + ')' : 'rgba(0,0,0,' + (0.02 + hash(i * 7 + seed) * 0.03).toFixed(3) + ')';
    g.fillRect(0, (hash(i * 5 + seed) * H) | 0, W, 1);
  }
  var inset = kind === 'door' ? 7 : 0;
  if (kind === 'door') {                                     // porta: moldura rebitada em volta e reforco horizontal
    g.strokeStyle = 'rgba(15,17,20,.8)'; g.lineWidth = 2; g.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.strokeRect(inset + 2, inset + 2, W - inset * 2 - 4, H - inset * 2 - 4);
    g.fillStyle = 'rgba(12,14,17,.7)'; g.fillRect(inset + 4, (H * 0.5) | 0, W - inset * 2 - 8, 3);      // reforco do meio
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(inset + 4, ((H * 0.5) | 0) + 3, W - inset * 2 - 8, 1);
  } else {                                                   // carcaca: junta de chapa a cada 128 px (por tile) com rebites
    g.fillStyle = 'rgba(12,14,17,.7)'; g.fillRect(0, 0, W, 2); g.fillRect(0, H - 2, W, 2);
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, 2, W, 1);
    g.fillStyle = 'rgba(12,14,17,.55)'; g.fillRect(W / 2, 0, 1, H);                   // junta vertical
  }
  for (i = 0; i < 4; i++) {                                  // ferrugem escorrendo (pouca, perto de baixo)
    var rx = hash(i * 13 + seed) * W, ry = hash(i * 17 + seed) * H * 0.7, rl = 30 + hash(i * 19 + seed) * 120;
    var rg = g.createLinearGradient(0, ry, 0, ry + rl);
    rg.addColorStop(0, 'rgba(140,70,28,' + (0.04 + hash(i + seed) * 0.07).toFixed(2) + ')'); rg.addColorStop(1, 'rgba(110,50,20,0)');
    g.fillStyle = rg; g.fillRect(rx, ry, 2 + hash(i * 23 + seed) * 5, rl);
  }
  for (i = 0; i < 7; i++) {                                  // poucas manchas de ferrugem e tinta descascada
    var px = hash(i * 29 + seed) * W, py = H * (0.45 + hash(i * 31 + seed) * 0.55), pr = 2 + hash(i * 37 + seed) * 7;
    g.fillStyle = 'rgba(' + (hash(i + 9) > 0.5 ? '120,60,24' : '78,64,52') + ',' + (0.1 + hash(i * 41 + seed) * 0.14).toFixed(2) + ')';
    g.beginPath(); g.ellipse(px, py, pr, pr * (0.5 + hash(i * 43) * 0.5), hash(i * 47) * 3, 0, 6.3); g.fill();
  }
  g.lineWidth = 1;
  for (i = 0; i < 7; i++) {                                  // poucos arranhoes claros (metal exposto)
    var sx = hash(i * 17 + seed) * W, sy = hash(i * 19 + seed) * H;
    g.strokeStyle = 'rgba(210,214,220,' + (0.08 + hash(i * 13 + seed) * 0.14).toFixed(2) + ')';
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (hash(i * 23) - 0.5) * 22, sy + (hash(i * 29) - 0.5) * 8); g.stroke();
  }
  var gr = g.createLinearGradient(0, H * 0.72, 0, H);        // sujeira perto do chao
  gr.addColorStop(0, 'rgba(18,14,10,0)'); gr.addColorStop(1, 'rgba(18,14,10,.5)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return c;
}

// Textura do glint (64x64): halo circular dourado/esbranquicado no centro e uma cruz de 4 pontas finas,
// as duas com decaimento suave de opacidade. Fundo preto: o material e aditivo, preto nao soma nada.
function glintCanvas() {
  var N = 64, c = cv(N, N), g = c.getContext('2d'), h = N / 2;
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  var halo = g.createRadialGradient(h, h, 0, h, h, h * 0.52);
  halo.addColorStop(0, 'rgba(255,252,236,1)');
  halo.addColorStop(0.35, 'rgba(255,228,150,.55)');
  halo.addColorStop(1, 'rgba(120,88,20,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(h, h, h * 0.52, 0, 6.3); g.fill();
  g.globalCompositeOperation = 'lighter';
  [[1, 0], [0, 1]].forEach(function(d) {                      // duas pontas finas (vertical + horizontal)
    var gr = g.createLinearGradient(h - d[0] * h, h - d[1] * h, h + d[0] * h, h + d[1] * h);
    gr.addColorStop(0, 'rgba(255,240,190,0)');
    gr.addColorStop(0.42, 'rgba(255,248,222,.85)');
    gr.addColorStop(0.5, 'rgba(255,255,245,1)');
    gr.addColorStop(0.58, 'rgba(255,248,222,.85)');
    gr.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = gr;
    var w = 3;
    g.fillRect(d[0] ? 0 : h - w / 2, d[1] ? 0 : h - w / 2, d[0] ? N : w, d[1] ? N : w);
  });
  return c;
}

function buildGlint() {
  if (key.glint) return key.glint;
  var mat = new THREE.SpriteMaterial({
    map: nearestTex(glintCanvas()), color: 0xffffff,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true, opacity: 0
  });
  var sp = new THREE.Sprite(mat);
  sp.position.y = GLINT_Y;
  sp.scale.setScalar(GLINT_MIN);
  sp.userData.noShot = true;                                  // nao e alvo de tiro
  sp.userData.dynamic = true;                                 // escala/opacidade animam a cada quadro
  sp.visible = false;
  key.glint = sp;
  return sp;
}

// Ciclo do glint: GLINT_CYCLE - GLINT_FLASH apagado, depois meia senoide de opacidade com a escala acompanhando.
function updateGlint(dt) {
  var sp = key.glint;
  if (!sp) return;
  if (key.state !== 'floor') {
    if (sp.visible) { sp.visible = false; sp.material.opacity = 0; }
    return;
  }
  key.glintT = (key.glintT + dt) % GLINT_CYCLE;
  var into = key.glintT - (GLINT_CYCLE - GLINT_FLASH);
  if (into < 0) {
    if (sp.visible) { sp.visible = false; sp.material.opacity = 0; }
    return;
  }
  var k = Math.sin(Math.PI * (into / GLINT_FLASH));           // 0 -> 1 -> 0
  sp.visible = true;
  sp.material.opacity = GLINT_PEAK * k;
  sp.scale.setScalar(GLINT_MIN + (GLINT_MAX - GLINT_MIN) * k);
}

// ---- bilhete manuscrito (frente e verso) ----
// Escrito a mao em caneta: fonte manuscrita (Caveat, Google Fonts), cada linha com leve rotacao/deslocamento. A fonte pode
// chegar depois das texturas: redesenha quando carregar. Frente: o titulo em marcador vermelho; verso: caneta azul.
var NOTE_W = 256, NOTE_H = 324;
function paperBase(g) {
  g.fillStyle = '#e4dcc4'; g.fillRect(0, 0, NOTE_W, NOTE_H);
  for (var i = 0; i < 260; i++) {
    g.fillStyle = 'rgba(110,90,60,' + (0.04 + hash(i + 77) * 0.08).toFixed(3) + ')';
    g.fillRect((hash(i * 3 + 5) * NOTE_W) | 0, (hash(i * 7 + 2) * NOTE_H) | 0, 2, 2);
  }
  g.fillStyle = 'rgba(120,100,70,.1)';                      // dobra do meio
  g.fillRect(0, NOTE_H / 2, NOTE_W, 1);
}
function writeLines(g, text, y0, step, px, color, seed, maxW) {
  g.textAlign = 'center'; g.fillStyle = color;
  text.split('\n').forEach(function(ln, i) {
    var size = px;
    g.font = '700 ' + size + 'px "Caveat", "Segoe Print", "Bradley Hand", cursive';
    var w = g.measureText(ln).width;
    if (w > maxW) { size = Math.floor(size * maxW / w); g.font = '700 ' + size + 'px "Caveat", "Segoe Print", "Bradley Hand", cursive'; }
    g.save();
    g.translate(NOTE_W / 2 + (hash(i * 3 + seed) - 0.5) * 10, y0 + i * step + (hash(i * 5 + seed + 1) - 0.5) * 5);
    g.rotate((hash(i * 7 + seed + 2) - 0.5) * 0.07);
    g.fillText(ln, 0, 0);
    g.restore();
  });
}
function drawNoteFront(c) {
  var g = c.getContext('2d');
  paperBase(g);
  var lines = TXT.noteFront.split('\n');
  writeLines(g, lines[0] || '', 92, 0, 70, '#a31818', 11, NOTE_W - 36);                       // "ACABOU!" grande, marcador vermelho
  writeLines(g, lines.slice(1).join('\n'), 158, 52, 44, '#14224f', 21, NOTE_W - 34);         // o resto, caneta azul
  g.strokeStyle = '#a31818'; g.lineWidth = 3; g.lineCap = 'round';                           // sublinhado torto
  g.beginPath(); g.moveTo(34, 108); for (var k = 1; k <= 8; k++) g.lineTo(34 + k * 24, 108 + Math.sin(k * 1.9) * 3 + k * 0.4); g.stroke();
  g.fillStyle = 'rgba(214,200,150,.85)';                                                      // fita crepe nos cantos
  g.save(); g.translate(26, 14); g.rotate(-0.5); g.fillRect(-26, -8, 52, 16); g.restore();
  g.save(); g.translate(NOTE_W - 26, 14); g.rotate(0.5); g.fillRect(-26, -8, 52, 16); g.restore();
}
function drawNoteBack(c) {
  var g = c.getContext('2d');
  paperBase(g);
  writeLines(g, TXT.noteBack, 70, 44, 36, '#14224f', 5, NOTE_W - 30);
  g.fillStyle = 'rgba(214,200,150,.55)';                                                      // restos da fita
  g.save(); g.translate(26, 14); g.rotate(-0.5); g.fillRect(-26, -8, 52, 16); g.restore();
}
function buildNoteTextures() {
  noteTex.frontCv = cv(NOTE_W, NOTE_H); noteTex.backCv = cv(NOTE_W, NOTE_H);
  drawNoteFront(noteTex.frontCv); drawNoteBack(noteTex.backCv);
  noteTex.front = tex(noteTex.frontCv); noteTex.back = tex(noteTex.backCv);
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    document.fonts.load('700 44px "Caveat"').then(function() {
      drawNoteFront(noteTex.frontCv); drawNoteBack(noteTex.backCv);
      noteTex.front.needsUpdate = true; noteTex.back.needsUpdate = true;
    }).catch(function() {});
  }
}

// ---- construcao (Furnishings.js, durante a montagem do interior) ----
export function buildCabinet(scene, M, ctx) {
  var ironTex = tex(ironCanvas(3, 'body')), doorTex = tex(ironCanvas(8, 'door'));      // suaves (linear): chapa lisa, sem pixelado
  var wood = new THREE.MeshLambertMaterial({ map: ironTex, color: 0xd2d6da });          // carcaca (o nome "wood" ficou do codigo antigo)
  var woodDark = new THREE.MeshLambertMaterial({ map: ironTex, color: 0x93999f });      // tampo, prateleira e molduras
  var doorMat = new THREE.MeshLambertMaterial({ map: doorTex, color: 0xdde0e3 });       // porta: chapa com borda rebitada
  var inner = new THREE.MeshLambertMaterial({ map: ironTex, color: 0x4a4f54 });         // interior mais escuro
  var metal = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
  var metalDark = new THREE.MeshLambertMaterial({ color: 0x2e3135 });
  var w = CAB.w, h = CAB.h, d = CAB.d, t = CAB.t, bodyH = h - 0.08, bodyY = 0.08 + bodyH / 2;

  var grp = new THREE.Group();
  grp.position.set(CAB.x, 0, CAB.z);
  grp.rotation.y = -Math.PI / 2;                             // frente (+Z local) para o corredor (-X do mundo)
  scene.add(grp);
  cab.grp = grp;

  // carcaca
  boxAt(grp, w, bodyH, t, wood, 0, bodyY, -d / 2 + t / 2);                      // fundo
  boxAt(grp, t, bodyH, d, wood, -w / 2 + t / 2, bodyY, 0);                      // laterais
  boxAt(grp, t, bodyH, d, wood, w / 2 - t / 2, bodyY, 0);
  boxAt(grp, w + 0.04, 0.035, d + 0.05, woodDark, 0, h + 0.0175, 0.012);        // tampo com beiral
  boxAt(grp, w - 0.04, 0.08, d - 0.04, M.trim, 0, 0.04, 0);                      // rodape
  boxAt(grp, w - 2 * t, t, d - t, wood, 0, 0.08 + t / 2, t / 2);                 // piso interno
  boxAt(grp, w - 2 * t, 0.022, d - t - 0.03, woodDark, 0, 0.92, t / 2 - 0.015);  // prateleira
  // interior escuro (fundo e laterais)
  var inH = h - 0.08 - t, inY = 0.08 + t + inH / 2;
  planeAt(grp, w - 2 * t, inH, inner, 0, inY, -d / 2 + t + 0.002);
  planeAt(grp, d - t, inH, inner, -w / 2 + t + 0.002, inY, t / 2, 0, Math.PI / 2);
  planeAt(grp, d - t, inH, inner, w / 2 - t - 0.002, inY, t / 2, 0, -Math.PI / 2);
  // dobradicas (lado da parede do fundo da loja)
  [0.30, 0.95, 1.60].forEach(function(y) { boxAt(grp, 0.034, 0.13, 0.03, metalDark, -w / 2 + 0.008, y, d / 2 + 0.02); });   // dobradicas pesadas (3)

  // porta: pivo na dobradica
  var door = new THREE.Group();
  door.position.set(-w / 2 + 0.01, 0, d / 2 + DOOR.t / 2 + 0.002);
  door.userData.dynamic = true;
  grp.add(door);
  cab.door = door;
  function dbox(bw, bh, bd, mat, x, y, z) { var m = boxAt(door, bw, bh, bd, mat, x, y, z); m.userData.dynamic = true; return m; }
  var DW = DOOR.w, fz = DOOR.t / 2 + 0.006, midY = DOOR.y0 + DOOR.h / 2;
  dbox(DW, DOOR.h, DOOR.t, doorMat, DW / 2, midY, 0);                              // chapa de ferro (borda rebitada na textura)
  dbox(DW - 0.08, 0.03, 0.014, metalDark, DW / 2, DOOR.y0 + DOOR.h * 0.52, fz);   // barra de reforco do meio
  dbox(0.03, DOOR.h - 0.14, 0.014, metalDark, 0.05, midY, fz);                      // cantoneiras verticais
  dbox(0.03, DOOR.h - 0.14, 0.014, metalDark, DW - 0.05, midY, fz);
  // puxador
  var hx = DW - 0.085;
  dbox(0.03, 0.18, 0.018, metal, hx, 0.98, DOOR.t / 2 + 0.034);                    // puxador de barra de ferro
  dbox(0.014, 0.014, 0.032, metal, hx, 0.91, DOOR.t / 2 + 0.016);
  dbox(0.014, 0.014, 0.032, metal, hx, 1.05, DOOR.t / 2 + 0.016);
  // hasp: placa na porta + argola (U horizontal) por onde passa o arco do cadeado
  var sx = DW - 0.04, sz = DOOR.t / 2 + 0.008;
  dbox(0.13, 0.045, 0.008, metalDark, DW - 0.08, HASP_Y, DOOR.t / 2 + 0.004);
  dbox(0.008, 0.012, 0.03, metal, sx - 0.013, HASP_Y, sz + 0.015);
  dbox(0.008, 0.012, 0.03, metal, sx + 0.013, HASP_Y, sz + 0.015);
  dbox(0.034, 0.012, 0.008, metal, sx, HASP_Y, sz + 0.03);

  // cadeado (assincrono)
  var lg = new THREE.Group();
  lg.userData.dynamic = true;
  lg.position.set(sx + 0.016, HASP_Y, sz + 0.016);           // y final ajustado quando o modelo chega
  door.add(lg);
  lock.grp = lg;
  lock.home = { pos: lg.position.clone(), rot: lg.rotation.clone() };
  loadModel('models/padlock.glb').then(function(m) {
    psxModel(m);
    var turn = new THREE.Group();
    turn.rotation.y = -Math.PI / 2;                          // frente do modelo (+X, buraco da chave) -> +Z
    turn.add(m);
    var fit = new THREE.Group();
    fit.add(turn);
    fitModel(fit, LOCK_W);
    var best = -Infinity;                                    // o arco e a malha mais alta
    m.traverse(function(o) {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      if (o.geometry.boundingBox.min.y > best) { best = o.geometry.boundingBox.min.y; lock.shackle = o; }
    });
    if (lock.shackle) lock.shackleY = lock.shackle.position.y;
    var bb = new THREE.Box3().setFromObject(fit);
    var lockH = bb.max.y - bb.min.y;
    lg.add(fit);
    lock.home.pos.y = HASP_Y + 0.012 - lockH;                // topo do arco passando na argola
    if (lock.grp.parent === door) lg.position.y = lock.home.pos.y;
  }).catch(function(err) { console.warn('Falha ao carregar padlock.glb:', err); });

  // Bilhete preso ao fundo (alvo so com a porta aberta): frente e verso (dois planos costas com costas; o verso so
  // aparece na mao, virando o papel na inspecao). Escrito a mao, ver drawNoteFront/drawNoteBack.
  buildNoteTextures();
  var frontMat = new THREE.MeshLambertMaterial({ map: noteTex.front, emissive: 0x2a2a2a, emissiveMap: noteTex.front });
  cab.note = planeAt(grp, NOTE_PLANE_W, NOTE_PLANE_H, frontMat, -0.04, 1.36, -d / 2 + t + 0.006);
  cab.note.userData = { type: 'cabinet_note', label: TXT.noteName };

  // alvo de interacao + colisao (jogador e itens arremessados)
  cab.hit = boxAt(grp, w + 0.04, h, d + 0.09, hitMat, 0, h / 2, 0.045);
  cab.hit.visible = false;
  cab.hit.userData = { type: 'cabinet', label: TXT.cabinetName };
  ctx.interactables.push(cab.hit);
  var front = CAB.x - d / 2 - DOOR.t - 0.01;
  cab.solid = { x1: front, x2: 2.60, z1: CAB.z - w / 2 - 0.01, z2: CAB.z + w / 2 + 0.01, h: h + 0.035 };
  ctx.solids.push(cab.solid);
  return cab;
}

// ---- chave ----
loadModel('models/key.glb').then(function(m) {
  psxModel(m);
  fitModel(m, 0.075);                                        // deitada: ~0.18 m de comprimento (em Z)
  key.proto = m;
  if (key.pivot) key.pivot.add(m.clone());
  buildKeyHand();
}).catch(function(err) { console.warn('Falha ao carregar key.glb:', err); });

// Igual ao viewmodel de Cardboard.js/Shotgun.js: o item na mao desenha por cima de tudo.
function viewmodel(obj) {
  obj.traverse(function(c) {
    if (!c.isMesh) return;
    c.renderOrder = 999;
    var mats = Array.isArray(c.material) ? c.material : [c.material];
    var cl = mats.map(function(mm) { var mc = mm.clone(); mc.depthTest = false; mc.depthWrite = false; mc.transparent = true; return mc; });
    c.material = cl.length === 1 ? cl[0] : cl;
    c.frustumCulled = false;
  });
  return obj;
}

function buildKeyHand() {
  if (!key.proto || keyHand.children.length) return;
  var up = new THREE.Group();
  up.rotation.x = Math.PI / 2;                               // em pe, face plana para a camera
  var vm = viewmodel(key.proto.clone());
  var bb = new THREE.Box3().setFromObject(vm), c = bb.getCenter(new THREE.Vector3());
  vm.position.sub(c);                                        // gira em volta do proprio centro na inspecao
  up.add(vm);
  keyHand.add(up);
}

function setKeyInteractable(on) {
  if (!env || !key.hit) return;
  var i = env.interactables.indexOf(key.hit);
  if (on && i < 0) env.interactables.push(key.hit);
  else if (!on && i >= 0) env.interactables.splice(i, 1);
}

function placeKeyOnFloor() {
  if (!key.pivot) return;
  key.state = 'floor';
  key.glintT = 0;
  key.pivot.position.set(CAR_SPOT.x, KEY_GROUND_Y + 0.004, CAR_SPOT.z);
  key.pivot.rotation.set(0, 0.9, 0);
  key.pivot.visible = true;
  setKeyInteractable(true);
}

function hideKey() {
  key.state = 'hidden';
  if (key.pivot) key.pivot.visible = false;
  if (key.glint) { key.glint.visible = false; key.glint.material.opacity = 0; }
  setKeyInteractable(false);
}

function setHandLabel() {
  if (!EL.hand) return;
  EL.hand.classList.add('on');
  EL.hand.innerHTML = TXT.inHand + '<br><b class="v">' + (S.heldKey && S.heldKey.kind === 'note' ? TXT.noteName : TXT.keyName) + '</b>';
}

function takeKey() {
  if (S.held || S.heldCan || S.heldBox || S.heldGun || S.heldKey || key.state !== 'floor') return;
  setKeyInteractable(false);
  key.pivot.visible = false;
  key.state = 'held';
  if (key.glint) { key.glint.visible = false; key.glint.material.opacity = 0; }   // coletada: o brilho acaba
  S.heldKey = key;
  buildKeyHand();
  keyHand.visible = true;
  setHandLabel();
  clunk();
}

function dropHand() {
  if (S.inspect) S.inspect = false;
  S.heldKey = null;
  keyHand.visible = false;
  noteHand.visible = false;
  if (EL.hand) EL.hand.classList.remove('on');
}

// G ou E sem alvo: o bilhete volta ao fundo do armario.
// A CHAVE nao pode mais ser largada (AJUSTES_FINAIS.md §5.2): uma vez coletada, fica na mao ate abrir o cadeado
// (senao e facil esquece-la num canto escuro e travar a progressao). So recusa, com toast e beep.
export function dropHeldKey() {
  if (!S.heldKey) return;
  if (S.heldKey.kind === 'note') {
    dropHand();
    returnNote();
    pageFlipSound();
    return;
  }
  toast(TXT.cantDropKey);
  beep(320, 0.08);
}

export function keyInspectLabel() {
  if (S.heldKey && S.heldKey.kind === 'note') return '<b class="v">' + TXT.noteName + '</b><br><span class="v">' + TXT.noteDesc + '</span>';
  return '<b class="v">' + TXT.keyName + '</b><br><span class="v">' + TXT.keyDesc + '</span>';
}
export function dressKeyHand() { setHandLabel(); }

// ---- abrir o armario ----
function startUnlock() {
  dropHand();                                                // a chave e consumida
  key.state = 'used';
  cab.state = 'opening'; cab.t = 0; cab.celebrated = false; cab.creaked = false;
  var i = env.interactables.indexOf(cab.hit);
  if (i >= 0) env.interactables.splice(i, 1);
  padlockOpenSound();
}

function detachLock() {
  if (!lock.grp || lock.falling) return;
  lock.falling = true; lock.rested = false; lock.bounced = false;
  env.scene.attach(lock.grp);
  cab.grp.updateMatrixWorld(true);
  tmpV.set(0, 0, 1).transformDirection(cab.grp.matrixWorld);   // para fora do armario
  lock.vel.copy(tmpV).multiplyScalar(0.7); lock.vel.y = 0.5;
  lock.spin = 7;
}

function updateLock(dt) {
  if (lock.jiggle > 0 && !lock.falling) {
    lock.jiggle = Math.max(0, lock.jiggle - dt);
    lock.grp.rotation.z = Math.sin(lock.jiggle * 60) * 0.25 * lock.jiggle / 0.35;
  }
  if (!lock.falling || lock.rested) return;
  var g = lock.grp, p = g.position;
  lock.vel.y -= 9.8 * dt;
  p.addScaledVector(lock.vel, dt);
  g.rotation.x += lock.spin * dt;
  if (p.y <= 0.008) {
    p.y = 0.008;
    if (!lock.bounced && Math.abs(lock.vel.y) > 1.2) {
      lock.bounced = true;
      lock.vel.y = -lock.vel.y * 0.3; lock.vel.x *= 0.4; lock.vel.z *= 0.4; lock.spin *= 0.4;
      padlockDropSound(1);
    } else {
      lock.rested = true;
      g.rotation.set(-Math.PI / 2, g.rotation.y, g.rotation.z);   // deitado de costas
    }
  }
}

function addDoorSolid() {
  cab.door.updateMatrixWorld(true);
  var bb = new THREE.Box3().setFromObject(cab.door.children[0]);
  cab.doorSolid = { x1: bb.min.x - 0.01, x2: bb.max.x + 0.01, z1: bb.min.z - 0.01, z2: bb.max.z + 0.01, h: bb.max.y };
  env.solids.push(cab.doorSolid);
}

function removeDoorSolid() {
  if (!cab.doorSolid) return;
  var si = env.solids.indexOf(cab.doorSolid);
  if (si >= 0) env.solids.splice(si, 1);
  cab.doorSolid = null;
}

// Fechar e reabrir a porta depois de destrancada. A porta escancarada ocupa ~0.7 m do corredor,
// entao sem isso ela vira uma parede permanente entre o balcao e o resto da loja.
// O solido sai no inicio do fechamento e so volta com a porta parada de novo na posicao aberta:
// assim o jogador nunca fica presa nela no meio da animacao.
function startDoorSwing(opening) {
  removeDoorSolid();
  cab.state = opening ? 'reopening' : 'closing';
  cab.t = 0;
  cab.swingFrom = cab.door.rotation.y;
  cab.swingTo = opening ? -OPEN_ANGLE : 0;
  cabinetCreakSound(1);
  if (!opening) setNoteInteractable(false);
}

function updateDoorSwing(dt) {
  cab.t += dt;
  var s = Math.min(1, cab.t / 0.9);
  s = 1 - Math.pow(1 - s, 3);
  cab.door.rotation.y = cab.swingFrom + (cab.swingTo - cab.swingFrom) * s;
  if (s < 1) return;
  if (cab.state === 'reopening') {
    cab.state = 'open';
    addDoorSolid();
    setNoteInteractable(true);
  } else {
    cab.state = 'shut';
  }
}

function celebrate() {
  cab.celebrated = true;
  cab.grp.updateMatrixWorld(true);
  var o = cab.grp.localToWorld(tmpW.set(0, 1.45, CAB.d / 2 + 0.15));
  var dir = tmpV.set(0, 0, 1).transformDirection(cab.grp.matrixWorld);
  burstConfetti(o, dir);
  cabinetJingleSound();
  SESSION.cabinetOpened = true;
  unlock('inception');
  setNoteInteractable(true);
}

function updateOpening(dt) {
  cab.t += dt;
  var t = cab.t;
  if (lock.shackle) lock.shackle.position.y = lock.shackleY + Math.min(1, t / 0.25) * 0.1;   // arco salta
  if (t >= 0.35) detachLock();
  if (t >= 0.55) {
    if (!cab.creaked) { cab.creaked = true; cabinetCreakSound(1); }
    var s = Math.min(1, (t - 0.55) / 1.1);
    s = 1 - Math.pow(1 - s, 3);
    cab.door.rotation.y = -OPEN_ANGLE * s;
  }
  if (t >= 0.8 && !cab.celebrated) celebrate();
  if (t >= 1.65 && cab.celebrated) {
    cab.door.rotation.y = -OPEN_ANGLE;
    cab.state = 'open';
    addDoorSolid();
  }
}

// ---- confete: 1 InstancedMesh (1 draw call), buffers reaproveitados entre aberturas ----
var confetti = null, cf = null, dummy = new THREE.Object3D();
var PAL = [0xff3b3b, 0xffd23b, 0x3bd1ff, 0x5cff6a, 0xff6ad5, 0xffffff, 0xff9a2e];
function ensureConfetti() {
  if (confetti) return;
  confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.032, 0.02), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONFETTI_N);
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  var col = new THREE.Color();
  for (var i = 0; i < CONFETTI_N; i++) { col.setHex(PAL[i % PAL.length]); confetti.setColorAt(i, col); }
  confetti.frustumCulled = false;
  confetti.visible = false;
  confetti.userData.dynamic = true;
  confetti.userData.noShot = true;
  cf = { pos: new Float32Array(CONFETTI_N * 3), vel: new Float32Array(CONFETTI_N * 3), rot: new Float32Array(CONFETTI_N * 3),
         spin: new Float32Array(CONFETTI_N * 3), rest: new Uint8Array(CONFETTI_N), t: -1 };
  env.scene.add(confetti);
}

function burstConfetti(origin, dir) {
  ensureConfetti();
  var sideX = -dir.z, sideZ = dir.x;                          // horizontal, perpendicular a frente
  for (var i = 0; i < CONFETTI_N; i++) {
    var k = i * 3, a = (Math.random() - 0.5) * 0.6, sp = 1.0 + Math.random() * 2.4, side = (Math.random() - 0.5) * 2.6;
    cf.pos[k] = origin.x + sideX * a; cf.pos[k + 1] = origin.y + (Math.random() - 0.5) * 0.5; cf.pos[k + 2] = origin.z + sideZ * a;
    cf.vel[k] = dir.x * sp + sideX * side; cf.vel[k + 1] = 1.2 + Math.random() * 2.6; cf.vel[k + 2] = dir.z * sp + sideZ * side;
    cf.rot[k] = Math.random() * 6.28; cf.rot[k + 1] = Math.random() * 6.28; cf.rot[k + 2] = Math.random() * 6.28;
    cf.spin[k] = (Math.random() - 0.5) * 16; cf.spin[k + 1] = (Math.random() - 0.5) * 16; cf.spin[k + 2] = (Math.random() - 0.5) * 8;
    cf.rest[i] = 0;
  }
  cf.t = 0;
  confetti.visible = true;
}

function updateConfetti(dt) {
  if (!cf || cf.t < 0) return;
  cf.t += dt;
  if (cf.t >= CONFETTI_LIFE) { confetti.visible = false; cf.t = -1; return; }
  var sc = cf.t > CONFETTI_LIFE - 0.6 ? (CONFETTI_LIFE - cf.t) / 0.6 : 1, drag = Math.max(0, 1 - 1.7 * dt);
  for (var i = 0; i < CONFETTI_N; i++) {
    var k = i * 3;
    if (!cf.rest[i]) {
      cf.vel[k + 1] = Math.max(-1.1, cf.vel[k + 1] - 2.8 * dt);  // cai devagar, como papel
      cf.vel[k] *= drag; cf.vel[k + 2] *= drag;
      cf.pos[k] += (cf.vel[k] + Math.sin(cf.t * 7 + i) * 0.25) * dt;
      cf.pos[k + 1] += cf.vel[k + 1] * dt;
      cf.pos[k + 2] += (cf.vel[k + 2] + Math.cos(cf.t * 6 + i * 1.7) * 0.25) * dt;
      cf.rot[k] += cf.spin[k] * dt; cf.rot[k + 1] += cf.spin[k + 1] * dt; cf.rot[k + 2] += cf.spin[k + 2] * dt;
      if (cf.pos[k + 1] <= 0.004) { cf.pos[k + 1] = 0.004; cf.rest[i] = 1; cf.rot[k] = -Math.PI / 2; cf.rot[k + 1] = 0; }
    }
    dummy.position.set(cf.pos[k], cf.pos[k + 1], cf.pos[k + 2]);
    dummy.rotation.set(cf.rot[k], cf.rot[k + 1], cf.rot[k + 2]);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    confetti.setMatrixAt(i, dummy.matrix);
  }
  confetti.instanceMatrix.needsUpdate = true;
}

// ---- bilhete: pegar, inspecionar (virar para ler o verso) e devolver ----
function setNoteInteractable(on) {
  if (!env || !cab.note) return;
  var i = env.interactables.indexOf(cab.note);
  if (on && i < 0 && noteObj.state === 'wall' && cab.state !== 'locked') env.interactables.push(cab.note);
  else if (!on && i >= 0) env.interactables.splice(i, 1);
}

// Papel de duas faces na mao: plano da frente e plano do verso (costas com costas), desenhados por cima de tudo (viewmodel).
function buildNoteHand() {
  if (noteHand.children.length || !noteTex.front) return;
  var grp = new THREE.Group();
  var geo = new THREE.PlaneGeometry(NOTE_PLANE_W, NOTE_PLANE_H);
  var front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: noteTex.front }));
  var back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: noteTex.back }));
  front.position.z = 0.0008; back.position.z = -0.0008; back.rotation.y = Math.PI;
  grp.add(front); grp.add(back);
  noteHand.add(viewmodel(grp));
}

function takeNote() {
  if (S.held || S.heldCan || S.heldBox || S.heldGun || S.heldKey || noteObj.state !== 'wall') return;
  noteObj.state = 'held';
  setNoteInteractable(false);
  cab.note.visible = false;
  S.heldKey = noteObj;
  buildNoteHand();
  noteHand.visible = true;
  setHandLabel();
  pageFlipSound();
}

function returnNote() {
  noteObj.state = 'wall';
  cab.note.visible = true;
  setNoteInteractable(true);
}

// ---- ligacoes com main.js ----
// Com a chave na mao so estes alvos valem (moedas/porquinho/papel nao ocupam as maos).
export var HELD_KEY_TARGETS = { cabinet: 1, coin: 1, pig: 1, pig_car: 1, rusbe_paper: 1 };

export function cabinetLabel(o) {
  var t = o.userData.type;
  if (t === 'cabinet') {
    if (cab.state === 'open') return { desc: '<b>' + TXT.cabinetName + '</b>', act: TXT.actClose };
    if (cab.state === 'shut') return { desc: '<b>' + TXT.cabinetName + '</b>', act: TXT.actOpen };
    if (cab.state !== 'locked') return { desc: '<b>' + TXT.cabinetName + '</b>', act: '' };
    return { desc: '<b>' + TXT.cabinetName + '</b><br><span class="warn">' + TXT.lockedTag + '</span>',
             act: S.heldKey && S.heldKey.kind === 'key' ? TXT.actUnlock : TXT.actOpen };
  }
  if (t === 'cabinet_key') return { desc: '<b>' + TXT.keyName + '</b>', act: TXT.actTake };
  if (t === 'cabinet_note') return { desc: '<b>' + TXT.noteName + '</b>', act: TXT.actTake };
  return null;
}

// E num alvo. Retorna true se tratou.
export function useCabinet(o) {
  var t = o.userData.type;
  if (t === 'cabinet') {
    if (cab.state === 'open') { startDoorSwing(false); return true; }     // fecha, liberando o corredor
    if (cab.state === 'shut') { startDoorSwing(true); return true; }      // reabre (ja destrancado)
    if (cab.state !== 'locked') return true;                              // durante as animacoes, ignora
    if (S.heldKey && S.heldKey.kind === 'key') startUnlock();
    else { toast(TXT.locked); padlockRattleSound(1); lock.jiggle = 0.35; }
    return true;
  }
  if (t === 'cabinet_key') { takeKey(); return true; }
  if (t === 'cabinet_note') { takeNote(); return true; }
  return false;
}

// F num alvo (sem nada na mao): pega o bilhete (a inspecao, com F, vem depois, com ele na mao). Retorna true se tratou.
export function inspectCabinetTarget(o) {
  if (o && o.userData.type === 'cabinet_note') { takeNote(); return true; }
  return false;
}

// main.js chama uma vez, com a cena pronta.
export function initCabinet(opts) {
  env = opts;
  opts.camera.add(keyHand);
  opts.camera.add(noteHand);
  key.pivot = new THREE.Group();
  key.pivot.userData.dynamic = true;
  key.pivot.visible = false;
  if (key.proto) key.pivot.add(key.proto.clone());
  key.hit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.34), hitMat);
  key.hit.position.y = 0.06;
  key.hit.userData = { type: 'cabinet_key', label: TXT.keyName };
  key.pivot.add(key.hit);
  key.pivot.add(buildGlint());                               // cintilacao que chama o olhar no asfalto escuro
  opts.scene.add(key.pivot);
  onCarGone(function() { if (key.state === 'hidden') placeKeyOnFloor(); });
  if (S.carGone) placeKeyOnFloor();                          // o carro ja tinha ido embora
}

// Chamado a cada quadro pelo main.js (insE = mistura do modo inspecao, como a fita/caixa).
export function updateCabinet(dt, insE, bob) {
  if (S.heldKey && S.heldKey.kind === 'note') {              // papel: maior na inspecao (para ler a letra) e gira com o mouse
    var kn = 1 - insE;
    noteHand.position.set(.2 * kn, (-.18 + Math.sin(bob) * .006) * kn, -.44 * kn - .3 * insE);
    noteHand.scale.setScalar(1 * kn + 0.9 * insE);
    noteHand.rotation.set(.12 * kn + S.insRot.x * insE, -.3 * kn + S.insRot.y * insE, .08 * kn);
  } else if (S.heldKey) {
    var k = 1 - insE;
    keyHand.position.set(.24 * k, (-.21 + Math.sin(bob) * .006) * k, -.42 * k - .3 * insE);
    keyHand.scale.setScalar(1 * k + 1.3 * insE);
    keyHand.rotation.set(.2 * k + S.insRot.x * insE, -.5 * k + S.insRot.y * insE, .15 * k);
  }
  updateGlint(dt);
  if (cab.state === 'opening') updateOpening(dt);
  else if (cab.state === 'closing' || cab.state === 'reopening') updateDoorSwing(dt);
  if (lock.grp) updateLock(dt);
  updateConfetti(dt);
}

// resetWorld: armario fechado com cadeado, chave escondida sob o carro, bilhete de volta ao fundo, confete apagado.
// SESSION.cabinetOpened permanece (libera o HUNT na sessao).
onWorldReset(function() {
  if (S.heldKey) dropHand();
  S.heldKey = null; keyHand.visible = false; noteHand.visible = false;
  noteObj.state = 'wall'; if (cab.note) cab.note.visible = true;
  hideKey();
  if (!env || !cab.grp) return;
  cab.state = 'locked'; cab.t = 0; cab.celebrated = false; cab.creaked = false;
  cab.door.rotation.y = 0;
  removeDoorSolid();
  if (env.interactables.indexOf(cab.hit) < 0) env.interactables.push(cab.hit);
  var qi = env.interactables.indexOf(cab.note); if (qi >= 0) env.interactables.splice(qi, 1);
  if (lock.grp) {
    if (lock.grp.parent !== cab.door) cab.door.add(lock.grp);
    lock.grp.position.copy(lock.home.pos); lock.grp.rotation.copy(lock.home.rot);
    lock.falling = false; lock.rested = false; lock.jiggle = 0;
  }
  if (lock.shackle) lock.shackle.position.y = lock.shackleY;
  if (confetti) { confetti.visible = false; cf.t = -1; }
});
