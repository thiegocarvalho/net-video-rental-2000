import * as THREE from 'three';
import { t } from '../../i18n/index.js';
import { boxAt, planeAt, loadModel, fitModel } from '../../graphics/Engine.js';
import { cv, tex, cached, hash } from '../../core/Utils.js';
import { nearestTex, shrinkInto, psxModel } from './shared.js';
import { buildCabinet } from '../../entities/Cabinet.js';
import { arcadeOpen } from '../../core/Calendar.js';
import { ARCADE_IFRAME_LEFT, ARCADE_IFRAME_TOP, ARCADE_GAME_TOP, ARCADE_GAME_BOTTOM } from '../../core/Config.js';
import { placardCanvas, digitalLedClockCanvas, wallCalendarCanvas, createPaperPoster, bannerCanvas, arcadeScreenCanvas, arcadeOutOfOrderCanvas, createRetroSharePoster, createSovietCluePoster } from '../../graphics/Textures.js';
import { blinkState } from '../../core/Blink.js';
import { S } from '../../core/State.js';
import { onWorldReset, SESSION } from '../../core/World.js';
import { pageFlipSound } from '../../core/Audio.js';

var TXT = {
  sharePoster: t('scn.furn.sharePoster'),
  postitLabel: t('scn.furn.postitLabel'),
  postitLines: [t('scn.furn.postit1'), t('scn.furn.postit2'), t('scn.furn.postit3'), t('scn.furn.postit4')],
  bin: t('scn.furn.bin'),
  fridge: t('scn.furn.fridge'),
  arcade: t('scn.furn.arcade'),
  banner: 'NET VIDEO RENTAL 2000',
  placardNew: t('scn.tex.titleNew'),
  placardRetro: t('scn.tex.titleRetro'),
  handle: '@canal',
  // Pista do easter egg SAFE: o cartaz soviético atrás do cartaz de indicação (AJUSTES_FINAIS.md §4).
  cluePoster: t('ent.shotgun.clue_poster_label'),
  clueText: t('ent.shotgun.clue')
};

// Queda do cartaz de indicação (AJUSTES_FINAIS.md §4.3): ao compartilhar, ele descola da parede, tomba
// no piso, descansa ~1.5 s, pisca 3x (core/Blink.js) e some de vez, revelando o pôster soviético atrás.
// Estado de MUNDO com persistência de SESSÃO: SESSION.sharePosterFallen mantém o cartaz fora depois do resetWorld().
var SP_REST = 1.5;                                   // s deitado no chão antes de piscar
var SP_FLOOR_Y = 0.02, SP_FLOOR_Z = -1.45;           // onde o cartaz assenta: deitado, inteiro à frente do rodapé
var sharePoster = { mesh: null, interactables: null, state: 'wall', t: 0, vy: 0, home: null, z0: 0 };

function sharePosterUnhook() {
  var list = sharePoster.interactables, m = sharePoster.mesh;
  if (!list || !m) return;
  var i = list.indexOf(m);
  if (i >= 0) list.splice(i, 1);
}

// Chamado por main.js quando QUALQUER compartilhamento conclui com sucesso. Idempotente: cai uma vez só.
// A queda fica ARMADA e só começa quando o modal de compartilhamento sai da frente (senão ninguém a vê).
export function triggerSharePosterDrop() {
  var m = sharePoster.mesh;
  if (!m || sharePoster.state !== 'wall') return;
  SESSION.sharePosterFallen = true;
  sharePoster.state = 'armed';
  sharePoster.t = 0;
  sharePoster.vy = 0;
  sharePosterUnhook();                               // já descolando, não é mais clicável
}

function startSharePosterFall() {
  var m = sharePoster.mesh;
  sharePoster.state = 'falling';
  sharePoster.t = 0;
  sharePoster.vy = 0;
  // Sai do congelamento do freezeMeshes(): daqui para frente o transform muda a cada quadro.
  m.userData.dynamic = true;
  m.matrixAutoUpdate = true;
}

// Pula direto para o fim (cartaz sumido): usado quando a sessão diz que ele já caiu e o mundo é resetado.
function sharePosterFinish() {
  var m = sharePoster.mesh;
  sharePoster.state = 'gone';
  sharePoster.t = 0;
  if (!m) return;
  m.visible = false;
  sharePosterUnhook();
}

// Volta o cartaz para a parede (resetWorld sem compartilhamento concluído na sessão).
function sharePosterRestore() {
  var m = sharePoster.mesh;
  sharePoster.state = 'wall';
  sharePoster.t = 0;
  sharePoster.vy = 0;
  if (!m || !sharePoster.home) return;
  m.position.copy(sharePoster.home.pos);
  m.rotation.copy(sharePoster.home.rot);
  m.visible = true;
  m.updateMatrix();
  if (sharePoster.interactables && sharePoster.interactables.indexOf(m) < 0) sharePoster.interactables.push(m);
}

// Chamado a cada quadro pelo main.js. Física de cartolina: tomba para a frente, quica de leve e assenta.
export function updateSharePosterDrop(dt) {
  var st = sharePoster.state, m = sharePoster.mesh;
  if (!m || st === 'wall' || st === 'gone') return;
  if (st === 'armed') {
    if (S.shareModalOpen) return;                                            // espera o modal sair da frente
    startSharePosterFall();
    return;
  }
  if (st === 'falling') {
    sharePoster.t += dt;
    sharePoster.vy -= 7.2 * dt;                                            // mais leve que a gravidade: é papel
    m.position.y += sharePoster.vy * dt;
    var k = Math.min(1, sharePoster.t / 0.62);                             // progresso do tombo
    m.rotation.x = -Math.PI / 2 * (k * k * (3 - 2 * k));                   // deita no piso (smoothstep)
    m.position.z = sharePoster.z0 + (SP_FLOOR_Z - sharePoster.z0) * k;     // desliza para fora da parede
    m.rotation.z = Math.sin(sharePoster.t * 7.5) * 0.12 * (1 - k);         // oscilação de folha solta
    m.position.x = sharePoster.home.pos.x + Math.sin(sharePoster.t * 5.1) * 0.03 * (1 - k);
    if (m.position.y <= SP_FLOOR_Y) {
      m.position.y = SP_FLOOR_Y;
      m.position.z = SP_FLOOR_Z;
      m.rotation.set(-Math.PI / 2, 0, 0.07);
      sharePoster.state = 'rest';
      sharePoster.t = 0;
      pageFlipSound();                                                     // papel batendo no piso
    }
    return;
  }
  if (st === 'rest') {
    sharePoster.t += dt;
    if (sharePoster.t >= SP_REST) { sharePoster.state = 'blink'; sharePoster.t = 0; }
    return;
  }
  // 'blink': 3 piscadas e sumiço definitivo
  sharePoster.t += dt;
  var b = blinkState(sharePoster.t);
  if (b === 2) { sharePosterFinish(); return; }
  m.visible = b === 1;
}

onWorldReset(function() {
  if (!sharePoster.mesh) return;
  if (SESSION.sharePosterFallen) sharePosterFinish();
  else sharePosterRestore();
}, 0);

// Tudo que é "decoração menor" da loja: fliperama, prateleira de doces,
// pôsteres, placa de lançamentos, relógio, placa de "seja gentil" e a
// lixeira. Cada peça é pequena o bastante pra não merecer um arquivo próprio,
// mas fica junto aqui — não misturado com balcão/prateleira/estrutura.
export function buildFurnishings(scene, M, ctx) {
  // Pôsteres rasgados de papel com fita crepe nas paredes
  function makePosterMat(seed, defaultTitle) {
    var pTex = nearestTex(createPaperPoster(null, defaultTitle, seed));
    return new THREE.MeshLambertMaterial({
      map: pTex,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.FrontSide
    });
  }

  var posterMeshes = [];
  // Banner de baixo posicionado mais para a esquerda (x = -0.55) abaixo do banner principal
  posterMeshes.push(planeAt(scene, 1.60, 0.90, makePosterMat(1, t('scn.furn.poster1')), 0.25, 2.05, -2.07));
  // Banners posicionados na parede direita, trazidos mais para a esquerda (mais próximos do balcão)
  posterMeshes.push(planeAt(scene, 1.55, 0.86, makePosterMat(2, t('scn.furn.poster2')), 2.58, 2.48, 0.60, 0, -Math.PI / 2));
  posterMeshes.push(planeAt(scene, 1.55, 0.86, makePosterMat(3, t('scn.furn.poster3')), 2.58, 1.40, 0.60, 0, -Math.PI / 2));
  posterMeshes.forEach(function(p) { p.userData.dynamic = true; });

  // 1. Cartaz do Último Vídeo (centro, 16:9 = mesma proporção do canvas de createPaperPoster)

  // 2. Cartaz Retrô com QR Code (direita, retrato 2:3, ao lado do cartaz do vídeo)
  // Desenho em 600x900 (createRetroSharePoster) num canvas de trabalho;
  // a textura da GPU e um 512x512 nearest, so reescrito quando a URL/handle muda.
  var shareWork = cv(600, 900);
  var sharePosterCanvas = cv(512, 768);
  var sharePosterTex = nearestTex(sharePosterCanvas);
  var lastShareKey = null;

  function updateSharePoster(url, channelName) {
    var key = url + '|' + channelName + '|' + (typeof window !== 'undefined' && window.QRCode ? 1 : 0);
    if (key === lastShareKey) return;
    lastShareKey = key;
    createRetroSharePoster(shareWork, url, channelName);
    shrinkInto(shareWork, 512, 768, sharePosterCanvas);
    sharePosterTex.needsUpdate = true;
  }
  updateSharePoster(typeof window !== 'undefined' ? window.location.href : '', '@canal');

  var sharePosterMat = new THREE.MeshLambertMaterial({
    map: sharePosterTex,
    transparent: true,
    alphaTest: 0.05,
    side: THREE.FrontSide
  });

  // 2.1. Pôster brutalista soviético com a pista do SAFE: MESMO x/y do cartaz de indicação, 4 mm mais colado na
  // parede (a parede do fundo é z = -2.1). Enquanto o cartaz de indicação está pendurado ele cobre este por
  // inteiro; quando cai (triggerSharePosterDrop) a pista fica à vista. Estático: material próprio, textura própria.
  var CLUE_Z = -2.074;
  var cluePosterTex = nearestTex(createSovietCluePoster(cv(512, 768), TXT.clueText));
  var cluePosterMesh = planeAt(scene, 0.72, 1.08, new THREE.MeshLambertMaterial({ map: cluePosterTex }), 1.62, 2.05, CLUE_Z);
  cluePosterMesh.userData = { type: 'clue_poster', label: TXT.cluePoster };   // userData.type: fora do mergeStatic

  var sharePosterMesh = planeAt(scene, 0.72, 1.08, sharePosterMat, 1.62, 2.05, -2.07); // retrato 2:3
  sharePosterMesh.userData = { type: 'share_poster', label: TXT.sharePoster };
  if (ctx && ctx.interactables) {
    ctx.interactables.push(cluePosterMesh);
    ctx.interactables.push(sharePosterMesh);
  }
  sharePoster.mesh = sharePosterMesh;
  sharePoster.interactables = ctx && ctx.interactables ? ctx.interactables : null;
  sharePoster.home = { pos: sharePosterMesh.position.clone(), rot: sharePosterMesh.rotation.clone() };
  sharePoster.z0 = sharePosterMesh.position.z;
  if (SESSION.sharePosterFallen) sharePosterFinish();           // trocou de idioma/recarregou com a sessão já marcada


  // Faixa / Banner oficial ampliado na parede do fundo (acima da TV/balcão)
  var bannerTex = nearestTex(cached('banner0', function() { return bannerCanvas(null, TXT.banner); }));
  var bannerMesh = planeAt(scene, 4.5, 1.25, new THREE.MeshLambertMaterial({ map: bannerTex }), 0, 3.32, -2.07);
  bannerMesh.userData.dynamic = true;

  // Frisos metálicos de fixação superior e inferior da faixa
  boxAt(scene, 4.56, 0.035, 0.03, M.trim, 0, 3.32 + 0.63, -2.06);
  boxAt(scene, 4.56, 0.035, 0.03, M.trim, 0, 3.32 - 0.63, -2.06);

  // Texturas e materiais das testeiras das duas prateleiras (luminosos translúcidos de acrílico)
  var placardTex = nearestTex(cached('placardTex', function() { return placardCanvas(TXT.placardNew, TXT.handle, undefined, false); }));
  var placardMat = new THREE.MeshLambertMaterial({
    map: placardTex,
    emissive: new THREE.Color(0x383838),
    emissiveMap: placardTex
  });

  var placard2Tex = nearestTex(cached('placard2Tex', function() { return placardCanvas(TXT.placardRetro, TXT.handle, undefined, true); }));
  var placard2Mat = new THREE.MeshLambertMaterial({
    map: placard2Tex,
    emissive: new THREE.Color(0x383838),
    emissiveMap: placard2Tex
  });

  // 3. Relógio Digital e Calendário (Esquerda, x = -1.5)
  var leftBoardGrp = new THREE.Group();
  leftBoardGrp.position.set(-1.5, 2.05, -2.07);
  scene.add(leftBoardGrp);

  var corkMat = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });
  boxAt(leftBoardGrp, 0.96, 1.0, 0.02, corkMat, 0, 0, 0);
  boxAt(leftBoardGrp, 1.0, 1.04, 0.015, M.dark, 0, 0, 0); // Moldura

  var clockGrp = new THREE.Group();
  clockGrp.position.set(0, 0.29, 0.015);
  leftBoardGrp.add(clockGrp);

  boxAt(clockGrp, 0.76, 0.28, 0.05, M.dark, 0, 0, 0);
  boxAt(clockGrp, 0.78, 0.015, 0.055, M.mdf2, 0, 0.14, 0);
  boxAt(clockGrp, 0.78, 0.015, 0.055, M.mdf2, 0, -0.14, 0);

  var clockWork = cv(256, 128);          // desenho em px fixos
  var clockCanvasElem = cv(128, 64);     // textura real (nearest)
  var clockTex = nearestTex(clockCanvasElem);

  var clockMat = new THREE.MeshBasicMaterial({ map: clockTex });
  var clockMesh = planeAt(clockGrp, 0.68, 0.24, clockMat, 0, 0, 0.026);
  clockMesh.userData.dynamic = true;

  var calendarGrp = new THREE.Group();
  calendarGrp.position.set(-0.17, -0.12, 0.015);
  leftBoardGrp.add(calendarGrp);

  var calW = 0.42, calH = 0.38;
  boxAt(calendarGrp, calW, calH, 0.012, M.dark, 0, 0, 0);
  boxAt(calendarGrp, 0.012, 0.012, 0.024, M.trim, 0, calH / 2 - 0.026, 0.006);

  var calWork = cv(512, 640);            // desenho em px fixos
  var calCanvasElem = cv(256, 256);      // textura real (nearest)
  var calTex = nearestTex(calCanvasElem);

  var calMat = new THREE.MeshLambertMaterial({ map: calTex });
  var calMesh = planeAt(calendarGrp, calW - 0.002, calH - 0.002, calMat, 0, 0, 0.007);
  calMesh.userData.dynamic = true;

  var lastClockSec = -1;
  var lastCalDay = -1;
  function updateClock(force) {
    var now = new Date();
    var s = now.getSeconds();
    if (!force && s === lastClockSec) return;
    lastClockSec = s;
    digitalLedClockCanvas(clockWork, now, s % 2 === 0);
    shrinkInto(clockWork, 128, 64, clockCanvasElem);
    clockTex.needsUpdate = true;

    // Atualização diária automática do calendário se virar meia-noite
    if (force || now.getDate() !== lastCalDay) {
      lastCalDay = now.getDate();
      wallCalendarCanvas(calWork, now);
      shrinkInto(calWork, 256, 256, calCanvasElem);
      calTex.needsUpdate = true;
    }
  }
  updateClock(true);

  
  var postItGrp = new THREE.Group();
  postItGrp.position.set(0.28, -0.14, 0.025);
  postItGrp.rotation.z = -0.15; // Levemente inclinado
  leftBoardGrp.add(postItGrp);

  var piW = 0.28, piH = 0.28;
  var piCanvas = cv(256, 256);
  var pix = piCanvas.getContext('2d');
  // Caneta azul a mao: fonte manuscrita (Google Fonts), cada linha com leve rotacao/deslocamento e um sublinhado torto.
  // A fonte pode chegar depois da textura: redesenha quando carregar (piTex.needsUpdate).
  function drawPostIt() {
    pix.fillStyle = '#fdf485';
    pix.fillRect(0, 0, 256, 256);
    pix.fillStyle = 'rgba(190,170,60,.18)';
    pix.fillRect(0, 232, 256, 24);                                   // borda inferior mais escura (cola)
    pix.fillStyle = '#db4848';
    pix.fillRect(0, 30, 256, 2);
    pix.fillStyle = '#0a1a5c';
    pix.textAlign = 'center';
    var lines = TXT.postitLines;
    lines.forEach(function (ln, i) {
      var px = 44;
      pix.font = '700 ' + px + 'px "Caveat", "Segoe Print", "Bradley Hand", cursive';
      var w = pix.measureText(ln).width;
      if (w > 214) { px = Math.floor(px * 214 / w); pix.font = '700 ' + px + 'px "Caveat", "Segoe Print", "Bradley Hand", cursive'; }
      pix.save();
      pix.translate(128 + (hash(i * 3 + 1) - 0.5) * 10, 84 + i * 40 + (hash(i * 5 + 2) - 0.5) * 5);
      pix.rotate((hash(i * 7 + 3) - 0.5) * 0.09);
      pix.fillText(ln, 0, 0);
      pix.restore();
    });
    pix.strokeStyle = '#0a1a5c'; pix.lineWidth = 3; pix.lineCap = 'round';   // sublinhado a mao, ondulado
    pix.beginPath();
    var uy = 84 + lines.length * 40 - 14;
    pix.moveTo(70, uy);
    for (var k = 1; k <= 10; k++) pix.lineTo(70 + k * 12, uy + Math.sin(k * 1.7) * 2.5 + k * 0.4);
    pix.stroke();
    pix.fillStyle = '#cc2222';
    pix.beginPath(); pix.arc(128, 16, 10, 0, Math.PI*2); pix.fill();
    pix.fillStyle = '#ffaaaa';
    pix.beginPath(); pix.arc(125, 13, 3, 0, Math.PI*2); pix.fill();
  }
  drawPostIt();

  var piTex = nearestTex(piCanvas);
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    document.fonts.load('700 44px "Caveat"').then(function () { drawPostIt(); piTex.needsUpdate = true; }).catch(function () {});
  }
  
  var piMat = new THREE.MeshLambertMaterial({ map: piTex, side: THREE.FrontSide });
  planeAt(postItGrp, piW, piH, piMat, 0, 0, 0);
  
  var piHit = boxAt(postItGrp, 0.30, 0.30, 0.02, M.dark, 0, 0, -0.01);
  piHit.visible = false;
  piHit.userData = { type: 'postit', label: TXT.postitLabel };
  if (ctx && ctx.interactables) {
    ctx.interactables.push(piHit);
  }


  // Lixeira retrô perto da entrada (Zsky via poly.pizza)
  var binGrp = new THREE.Group();
  binGrp.position.set(-2.2, 0, 5.6);
  binGrp.scale.setScalar(1.5); // maior para dar pra acertar a lata
  scene.add(binGrp);
  // Boca da lixeira em coordenadas de mundo (refinada depois que o modelo carrega).
  var binInfo = { x: -2.2, z: 5.6, topY: 1.0, r: 0.3, pile: 0 }; // pile = fitas empilhadas dentro

  loadModel('models/trash_can.glb').then(function(model) {
    fitModel(model, 0.45);
    model.scale.y *= 1.4;
    psxModel(model);
    var binMat = new THREE.MeshLambertMaterial({ color: 0x303336 });
    model.traverse(function(node) {
      if (node.isMesh && node.material) node.material = binMat;
    });
    binGrp.add(model);
    binGrp.updateMatrixWorld(true);
    var bb = new THREE.Box3().setFromObject(model);
    binInfo.topY = bb.max.y;
    binInfo.r = Math.min(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 * 0.8; // 80%: so conta se cair mesmo na boca
  }).catch(function(err) {
    console.warn('Falha ao carregar trash_can.glb:', err);
  });

  var binHitbox = boxAt(binGrp, 0.48, 0.82, 0.48, M.dark, 0, 0.41, 0);
  binHitbox.visible = false;
  binHitbox.userData = { type: 'trash_can', label: TXT.bin };
  if (ctx && ctx.interactables) {
    ctx.interactables.push(binHitbox);
  }
  var binSolid = { x1: -2.56, x2: -1.84, z1: 5.24, z2: 5.96, h: 1.0 };   // lixeira: o item entra pela boca (ver ThrownCan)
  if (ctx && ctx.solids) {
    ctx.solids.push(binSolid);
  }
  // Controle da lixeira para o segredo (15 inspecoes: quebra, solta as fitas e aparece o frango; ver main.js)
  var binCtl = { grp: binGrp, hitbox: binHitbox, solid: binSolid, info: binInfo };

  // Armario trancado com cadeado (entities/Cabinet.js), na parede direita antes da maquina de refrigerante.
  // O credito "MANUFACTURE BY" continua nas caixas da prateleira de baixo (Shelf.js).
  buildCabinet(scene, M, ctx);

  // Geladeira de Refrigerante / Vending Machine (dook via poly.pizza)
  var fridgeGrp = new THREE.Group();
  fridgeGrp.position.set(2.04, 0, 3.35);
  fridgeGrp.rotation.y = -Math.PI / 2; // Encostada na parede direita, voltada para o corredor
  scene.add(fridgeGrp);

  loadModel('models/vending_machine.glb').then(function(model) {
    fitModel(model, 1.08); // Altura aumentada para ~2.08m
    psxModel(model);
    fridgeGrp.add(model);
  }).catch(function(err) {
    console.warn('Falha ao carregar vending_machine.glb:', err);
  });

  var fridgeHitbox = boxAt(fridgeGrp, 1.10, 2.10, 1.15, M.dark, 0, 1.05, 0);
  fridgeHitbox.visible = false;
  fridgeHitbox.userData = { type: 'fridge', label: TXT.fridge };
  ctx.interactables.push(fridgeHitbox);
  ctx.solids.push({ x1: 1.45, x2: 2.60, z1: 2.80, z2: 3.90, h: 2.1 }); // maquina de refrigerante
  // Gabinete de Fliperama / Arcade Machine (J-Toastie via poly.pizza)
  // Posicionado com espaçamento generoso ao lado da máquina de refrigerante
  var arcadeGrp = new THREE.Group();
  arcadeGrp.position.set(2.08, 0, 4.95);
  arcadeGrp.rotation.y = Math.PI; // Frente voltada para o corredor (-X)
  scene.add(arcadeGrp);

  var arcadeScale = 0.733; // Altura de ~1.90m
  var isOpen = arcadeOpen();
  var arcadeScreenCanvasElem = isOpen ? arcadeScreenCanvas() : arcadeOutOfOrderCanvas();
  var arcadeTex = tex(arcadeScreenCanvasElem);
  arcadeTex.wrapT = THREE.RepeatWrapping;
  arcadeTex.repeat.y = -1;
  arcadeTex.offset.y = 1;
  var arcadeScreenMat = new THREE.MeshBasicMaterial({ map: arcadeTex });

  // --- Tela do arcade: o emulador (iframe do archive.org) vive numa camada CSS3D atras do canvas, como a
  // TV: o vidro vira um "buraco" (holeMat) por onde o jogo aparece, e o jogo segue rodando mesmo quando
  // o jogador sai da frente da maquina. Geometria do plano GameScreen_Plane do GLB (unidades do modelo):
  // centro (0.3203, 1.8882, -0.0048), normal (0.9990, 0.0452, 0), 0.78 x 0.78, escala do modelo 0.733.
  var SCREEN_CENTER = new THREE.Vector3(0.3203, 1.8882, -0.0048).multiplyScalar(arcadeScale);
  var SCREEN_NORMAL = new THREE.Vector3(0.99898, 0.045199, 0).normalize();
  var SCREEN_SIZE = 0.78 * arcadeScale;            // ~0.572 m (quase quadrada)
  var arcade = {
    open: isOpen, loaded: false, screenNode: null,
    texMat: arcadeScreenMat, holeMat: new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0 }),
    container: null, iframe: null,
    worldPos: new THREE.Vector3(), normal: new THREE.Vector3(),
    view: { pos: new THREE.Vector3(), yaw: 0, pitch: 0 }
  };
  arcadeGrp.updateMatrixWorld(true);
  arcade.worldPos.copy(SCREEN_CENTER).applyMatrix4(arcadeGrp.matrixWorld);
  arcade.normal.copy(SCREEN_NORMAL).transformDirection(arcadeGrp.matrixWorld);
  // Camera de "jogar": em frente a tela, olhando para ela (a tela ocupa ~70% da altura da vista)
  arcade.view.pos.copy(arcade.worldPos).addScaledVector(arcade.normal, 0.55);
  arcade.view.yaw = Math.atan2(arcade.normal.x, arcade.normal.z);
  arcade.view.pitch = -Math.asin(arcade.normal.y);

  if (isOpen) {
    var box = document.createElement('div');
    box.id = 'arcade-container';
    box.style.cssText = 'position:absolute;width:640px;height:640px;background:#000;overflow:hidden;opacity:0;transition:opacity .2s';
    var frame = document.createElement('iframe');
    frame.id = 'arcade-iframe';
    // 4:3 centralizado na tela quase quadrada; o src so e definido na primeira vez que o jogador senta
    frame.style.cssText = 'position:absolute;left:' + ARCADE_IFRAME_LEFT + 'px;top:' + ARCADE_IFRAME_TOP + 'px;width:640px;height:480px;border:0;background:#000';
    frame.setAttribute('allow', 'autoplay; fullscreen; gamepad');
    frame.setAttribute('allowfullscreen', '');
    box.appendChild(frame);
    // Faixas pretas sobre a barra do Internet Archive (topo) e o texto abaixo do jogo (rodape); deixam o clique passar
    var maskTop = ARCADE_IFRAME_TOP + ARCADE_GAME_TOP - 2, maskBottom = 640 - (ARCADE_IFRAME_TOP + ARCADE_GAME_BOTTOM + 2);
    [['top:0;height:' + maskTop + 'px'], ['bottom:0;height:' + maskBottom + 'px']].forEach(function(m) {
      var mask = document.createElement('div');
      mask.style.cssText = 'position:absolute;left:0;width:100%;background:#000;pointer-events:none;' + m[0];
      box.appendChild(mask);
    });
    var scan = document.createElement('div');
    scan.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(0,0,0,.2) 0 2px,rgba(0,0,0,0) 2px 4px)';
    box.appendChild(scan);
    arcade.container = box; arcade.iframe = frame;

    // Camada simples ATRAS do canvas (#arcade-layer): a cada quadro o main.js calcula o matrix3d que encaixa
    // este quadrado de 640x640 nos 4 cantos projetados da tela 3D. Sem CSS3D aninhado, o clique do mouse
    // chega ao iframe (o teste de clique do navegador nao acha elementos dentro do CSS3D).
    box.style.position = 'absolute'; box.style.left = '0'; box.style.top = '0'; box.style.transformOrigin = '0 0';
    box.style.pointerEvents = 'none';
    (document.getElementById('arcade-layer') || document.body).appendChild(box);
    arcade.right = new THREE.Vector3(0, 0, -1).applyQuaternion(arcadeGrp.quaternion);   // direita do plano, no mundo
    arcade.up = new THREE.Vector3().crossVectors(arcade.normal, arcade.right);           // cima do plano, no mundo
    arcade.size = SCREEN_SIZE;
  }

  loadModel('models/arcade_machine.glb').then(function(model) {
    model.scale.set(arcadeScale, arcadeScale, arcadeScale);
    model.position.set(0, 0, 0);
    psxModel(model);
    model.traverse(function(node) {
      if (node.isMesh && (node.name === 'GameScreen_Plane' || (node.material && node.material.name === 'VideoGame'))) {
        node.material = arcadeScreenMat;
        arcade.screenNode = node;
      }
    });
    arcadeGrp.add(model);
  }).catch(function(err) {
    console.warn('Falha ao carregar arcade_machine.glb:', err);
  });

  var arcadeGlow = new THREE.PointLight(0x00f0ff, 0.35, 2.8);
  arcadeGlow.position.set(0.50, 1.45, 0);
  arcadeGrp.add(arcadeGlow);

  var arcadeHitbox = boxAt(arcadeGrp, 0.95, 1.95, 0.75, M.dark, 0.15, 0.98, 0);
  arcadeHitbox.visible = false;
  arcadeHitbox.userData = { type: 'arcade', label: TXT.arcade };
  ctx.interactables.push(arcadeHitbox);
  ctx.solids.push({ x1: 1.48, x2: 2.60, z1: 4.58, z2: 5.32, h: 1.95 }); // arcade

  return {
    posterMeshes: posterMeshes,
    placardTex: placardTex,
    placard2Tex: placard2Tex,
    placardMat: placardMat,
    placard2Mat: placard2Mat,
    bannerMesh: bannerMesh,
    deskPlaqueMesh: null,
    updateClock: updateClock,
    updateSharePoster: updateSharePoster,
    sharePosterMesh: sharePosterMesh,
    binInfo: binInfo,
    binCtl: binCtl,
    arcade: arcade
  };
}
