import * as THREE from 'three';
import { loadGLTF, matchStyle } from '../graphics/Engine.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  breathHoldSound,
  breathReleaseSound,
  cineZoomSound,
  tensePianoSting,
  startTensionRumble,
  stopTensionRumble,
  jumpscareScreamSound,
  heroChimeSound,
  explosionSound,
  doorJiggleSound,
  clunk
} from '../core/Audio.js';
import { setDoorOpen } from '../scenes/Interior.js';
import { S } from '../core/State.js';
import { SESSION, onWorldReset, resetWorld } from '../core/World.js';
import { toast, DEBUG } from '../ui/UIManager.js';
import { createRig } from './CustomerRig.js';
import { createHeroFinale } from './HeroFinale.js';
import { setMoonLogo } from './Moon.js';
import { t } from '../i18n/index.js';

var TXT = {
  shirtDefaultName: t('ent.customer.shirt_default_name'),
  tapeBrand: t('ent.customer.tape_brand'),
  tapeLabel: t('ent.customer.tape_label')
};

// Evento Narrativo: O Fã Misterioso / Cliente da Fita Atrasada
//
// Aparições lá fora. Cada uma tem 6 s de "olhar": o contador só anda enquanto o jogador REALMENTE o vê (frustum +
// raios até cabeça/peito/ombros/joelhos contra malhas opacas: árvore, carro ou parede na frente não contam). Perder
// a visão PAUSA o contador (não zera: olhadas curtas somam). Nenhum timer de sumiço roda antes da primeira visão; uma
// cena não vista (ou vista mas fora da vista agora) só é trocada pela próxima marca do cronograma. Na primeira visão:
// nota de piano, tremor de tela e um clarão de cor.
//   1. Espiando de trás do tronco de uma árvore, longe: sai devagar, segura o olhar e recua para trás do tronco.
//   2. Parado no meio do estacionamento.              3. Ao lado do carro.        (2 e 3 somem de repente)
//   4. Na frente da loja, segurando a fita: completados os 6 s ele CORRE até o jogador, quebra a porta, jumpscare e
//      reinício (o clímax).
// Rota Secreta: pós-explosão da porta (campainha 25x), jogador 5 s empurrando a borda da rua (z = 26): o herói na luz,
// fogos e a lua com a logo do canal (HeroFinale.js).

export var customerGroup = new THREE.Group();
customerGroup.userData.noShot = true;   // fora do HUNT o tiro da shotgun ignora o customer (Shotgun.js)
customerGroup.visible = false;
if (DEBUG) window.customerGroup = customerGroup;   // depuracao (?debug)

var characterMesh = null;
var badgeMesh = null;
var badgeTex = null;
var tapeInHand = null;
var bones = {};
var baseBonesRot = {};
var modelScale = 1;
var baseHipsY = 0;

// Dados de repouso por osso (para poses em espaço do personagem) e geometria da perna
var boneRest = {};
var thighLen = 0.61, shinLen = 0.63;

// Máquina de estados
var state = 'WAITING';
var sceneIndex = 0;          // 0..2: arvore, agachado ao lado do carro, frente da loja
var sightAcc = 0, sightHits = 0, missHits = 0;
var inSight = false;         // visao atual com histerese (2 amostras seguidas para ganhar/perder, ~0,3 s)
var SIGHT_SECONDS = 6;       // segundos de olhar real ate a cena terminar
var isLoaded = false;
// Cronograma ENCADEADO (s), pelo tempo de jogo da VIDA atual: a arvore aos 0:30 e, dai em diante, cada aparicao
// so e marcada quando a anterior TERMINA (ele sumiu de vez), +30 s. Assim a sequencia e sempre arvore -> agachado
// ao lado do carro -> frente da loja, com 30 s de calmaria entre uma e outra, nao importa quanto o jogador demorou
// para notar cada uma. O relogio so conta com o jogador dentro da loja e zera no resetWorld().
var FIRST_AT = 30, GAP = 30;
var clock = 0, nextAt = FIRST_AT, sceneQueue = 0;
var seenByPlayer = false;
var seenTimer = 0;           // olhar restante: so desconta com inSight (pausa fora da vista)

// Cena da arvore: espiada parametrizada (0 = escondido atras do tronco, 1 = inclinado para fora).
var TREE = { x: -3.5, z: 30.5, r: 0.22 };   // pinheiro do esconderijo (Exterior.js makePineTree(-3.5, 30.5))
var PEEK_UNSEEN = 0.5;       // antes de ser visto: so cabeca e ombro para fora
var PEEK_SHIFT = 0.22;       // passo lateral (m) com a espiada toda
// Atras do carro ele nao atravessa o estacionamento: o corpo roda sobre os proprios pes e so a cabeca e o
// tronco contornam a quina. O passo lateral e curto (meio metro em 1,5 s) e vem junto com a inclinacao, entao
// le como "se debrucar para olhar", nao como deslizar.
var CAR_PEEK_SHIFT = 0.55;
var CAR_PEEK_DELAY = 2.4;    // segundos escondido por inteiro antes de comecar a espiar
var CAR_PEEK_OUT = 0.9;      // quanto ele mostra por conta propria (cabeca e tronco fora da lataria)
var RETREAT_TIME = 1.6;
var RETREAT_TURN = 1.4;      // giro (rad) para ficar de perfil no fim do recuo
var CAR = { x: 5.10, z: 15.20, r: 1.30 };   // jeep de Exterior.js (carInfo.home) e o raio util da lataria
var CAR_DUCK_SLIDE = 0.8;    // quanto ele afunda ainda mais atras da lataria ao se esconder
var peek = 0, peekVel = 0;
var exitT = -1;              // >= 0: recuando para tras do tronco
var exitFrom = 0, exitRotFrom = 0, exitRotTo = 0;
var hideBase = new THREE.Vector3(), hideFrom = new THREE.Vector3(), hideTo = new THREE.Vector3();
var hideRotY = Math.PI;
var animTime = 0;
var sceneT = 0;              // tempo desde que a cena atual comecou (a espiada do carro e roteirizada por ele)
var avatarImg = null;

// ---- Cutscene de aparicao ----------------------------------------------------------------------
// Quando o jogador pega o cliente BEM no meio do campo de visao, a camera e tomada: o olhar fecha nele, o FOV
// aperta e a tela ganha cor/desfoque (overlay #grade). Ele entao recua para o esconderijo, tudo se desfaz e o
// jogador volta a mandar. A arvore usa a versao amarelada e tensa; o carro, so um zoom suave, sem cor.
// fov: quanto fecha (ele esta a ~26 m na arvore e a ~11 m no carro, dai o aperto bem maior na arvore).
// amt/blur: a tinta tem de deixar ver o sujeito — passando disso vira so uma tela mostarda.
var CINE = {
  yellow: { inT: 2.4, holdT: 2.2, outT: 2.0, fov: 21, amt: 0.10, sep: 0.30, blur: 1.2, tint: '#d8a227' },
  soft:   { inT: 2.0, holdT: 1.6, outT: 1.7, fov: 42, amt: 0.00, sep: 0.00, blur: 0.9, tint: '#8a9bb4' }
};
var CENTER_DOT = 0.90;       // "bem dentro do campo de visao": perto do meio da tela, nao de canto de olho
var cine = null;             // { c, t, phase, baseFov, yaw0, pitch0, yaw, pitch, el }
var centerHits = 0;
var _cineV = new THREE.Vector3();

// Rota Secreta do Herói (FINAL_GAME_DESIGN §8): 5 s empurrando a borda z = 26 do mapa (ver heroEdgeTick).
var HERO_EDGE_SECONDS = 5;
var heroEdgeTimer = 0;
var finale = null;
var heroSilhouetteMat = new THREE.MeshBasicMaterial({ color: 0x020204, skinning: true });   // r128: skinning e flag do material
var heroFadeMat = new THREE.MeshBasicMaterial({ color: 0xfff2b8, transparent: true, opacity: 1, depthWrite: false, skinning: true });
var originalMaterials = [];

// Objetos reutilizáveis (evita alocação por frame)
var _tmpV = new THREE.Vector3();
var _tmpCamDir = new THREE.Vector3();
var _tmpMat = new THREE.Matrix4();
var _frustum = new THREE.Frustum();
var _domCache = {};
var fadeDirty = false;       // true enquanto o cliente está escurecendo a tela por proximidade
var jumpscareTimer = null;   // setTimeout do reinício pós-desmaio
var heroResetTimer = null;   // setTimeout do reset depois do fade do herói
var hudPrevDisplay = '';

function el(id) {
  var e = _domCache[id];
  if (!e) { e = document.getElementById(id); if (e) _domCache[id] = e; }
  return e;
}

// Camiseta do cliente: UMA textura 1024x512 que envolve o tronco (a costura fica na lateral esquerda).
//   x=768 (u .75): FRENTE, so o logo do canal (ou so o nome, quando o canal nao tem logo). As costas ficam lisas.
function fitText(ctx, text, maxW, startPx, font) {
  var px = startPx;
  do { ctx.font = font(px); px -= 2; } while (ctx.measureText(text).width > maxW && px > 10);
}
// Divide o nome em ate 2 linhas, cortando no espaco mais proximo do meio (nomes curtos ficam em 1 linha).
function nameLines(name) {
  if (name.length <= 11 || name.indexOf(' ') < 0) return [name];
  var mid = name.length / 2, best = -1, i;
  for (i = 0; i < name.length; i++) if (name[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return [name.slice(0, best), name.slice(best + 1)];
}
export function createCustomerTorsoCanvas(channelName) {
  var W = 1024, H = 512;
  var c = document.createElement('canvas');
  c.width = W; c.height = H;
  var ctx = c.getContext('2d');
  var name = (channelName || S.channelTitle || S.handle || TXT.shirtDefaultName).toUpperCase();

  // Tecido liso: o resto da camiseta nao tem nada (nem gola, nem barra, nem costas).
  ctx.fillStyle = '#17203a'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (var y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);          // trama

  // ----- FRENTE (x=768): o logo do canal, ou so o nome quando nao ha logo -----
  var fx = 768;
  ctx.textAlign = 'center';
  if (avatarImg && avatarImg.complete && avatarImg.naturalWidth) {
    var ar = 118, ay = 246;
    ctx.save(); ctx.beginPath(); ctx.arc(fx, ay, ar, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatarImg, fx - ar, ay - ar, ar * 2, ar * 2);
    ctx.restore();
  } else {
    var fl = nameLines(name), fy = fl.length === 1 ? 274 : 232;
    for (var fi = 0; fi < fl.length; fi++) {
      fitText(ctx, fl[fi], 320, fl.length === 1 ? 86 : 70,
        function(px) { return '900 ' + px + 'px "Impact", "Arial Black", sans-serif'; });
      ctx.fillStyle = '#ffffff'; ctx.fillText(fl[fi], fx, fy);
      fy += 78;
    }
  }
  return c;
}

function buildTeeGeometry(chestY) {
  var rows = [        // y,    rx,    meia-profundidade frente, tras
    { y: 0.98, rx: 0.170, zf: 0.140, zb: 0.140 },
    { y: 1.08, rx: 0.163, zf: 0.135, zb: 0.138 },
    { y: 1.18, rx: 0.175, zf: 0.145, zb: 0.142 },
    { y: 1.26, rx: 0.192, zf: 0.160, zb: 0.145 },
    { y: 1.31, rx: 0.208, zf: 0.160, zb: 0.145 }
  ];
  var SEG = 48, pos = [], uv = [], idx = [], r, sI;
  for (r = 0; r < rows.length; r++) {
    for (sI = 0; sI <= SEG; sI++) {
      var th2 = (sI / SEG - 0.75) * Math.PI * 2;                       // u=.75 => theta 0 (frente); u=.25 => costas
      var cs = Math.cos(th2), sn = Math.sin(th2);
      var row = rows[r], pad = 0.012;
      pos.push((row.rx + pad) * sn, row.y - chestY, (cs >= 0 ? row.zf + pad : row.zb + pad) * cs - 0.008);
      uv.push(sI / SEG, r / (rows.length - 1));
    }
  }
  for (r = 0; r < rows.length - 1; r++) {
    for (sI = 0; sI < SEG; sI++) {
      var a0 = r * (SEG + 1) + sI, a1 = a0 + 1, b0 = a0 + SEG + 1, b1 = b0 + 1;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// A lua (entities/Moon.js) usa o mesmo avatar da camiseta como logo depois do heroi.
export function updateHeroEmblemTexture(name) {
  setMoonLogo(avatarImg, name || S.channelTitle || S.handle);
}

export function updateCustomerBadge(name) {
  // O avatar carrega mesmo antes do personagem (a lua tambem depende dele).
  if (S.channelMeta && S.channelMeta.avatar && (!avatarImg || avatarImg.src !== S.channelMeta.avatar)) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      if (img !== avatarImg) return;                  // trocou de canal no meio do carregamento
      if (badgeMesh) {
        var c = createCustomerTorsoCanvas(name);
        if (badgeTex) {
          badgeTex.image = c;
          badgeTex.needsUpdate = true;
        }
      }
      updateHeroEmblemTexture(name);
    };
    avatarImg = img;
    img.src = S.channelMeta.avatar;
  }
  updateHeroEmblemTexture(name);
  if (!badgeMesh) return;

  var canvas = createCustomerTorsoCanvas(name);
  if (badgeTex) {
    badgeTex.image = canvas;
    badgeTex.needsUpdate = true;
  } else {
    badgeTex = new THREE.CanvasTexture(canvas);
    badgeTex.minFilter = THREE.LinearFilter;
    badgeTex.magFilter = THREE.LinearFilter;
    badgeMesh.material.map = badgeTex;
    badgeMesh.material.needsUpdate = true;
  }
}

// Ossos do esqueleto Mixamo pelo nome exato sem o prefixo (evita pegar 'HeadTop_End' como cabeca ou a ponta do
// dedo mindinho como mao). Tambem usado pelos clones do modo HUNT (Hunt.js), cada um com o proprio rig.
var BONE_MAP = {
  Hips: 'hips', Spine: 'spine', Spine1: 'spine1', Spine2: 'spine2', Neck: 'neck', Head: 'head',
  LeftArm: 'leftArm', LeftForeArm: 'leftForeArm', LeftHand: 'leftHand',
  RightArm: 'rightArm', RightForeArm: 'rightForeArm', RightHand: 'rightHand',
  LeftUpLeg: 'leftUpLeg', LeftLeg: 'leftLeg', RightUpLeg: 'rightUpLeg', RightLeg: 'rightLeg',
  LeftShoulder: 'leftShoulder', RightShoulder: 'rightShoulder', LeftFoot: 'leftFoot', RightFoot: 'rightFoot'
};
export function mapCustomerBones(root, out) {
  out = out || {};
  root.traverse(function(node) {
    if (!node.isBone) return;
    var key = BONE_MAP[node.name.replace(/^mixamorig:?/, '')];
    if (key) out[key] = node;
  });
  return out;
}

// Molde intocado do personagem (com camiseta e fita), clonado ANTES de o rig posar os ossos: os clones do HUNT
// (SkeletonUtils.clone, geometria/materiais compartilhados) partem da mesma pose de repouso que o customer normal.
var template = null;
export function customerTemplate() { return template ? { model: template, scale: modelScale } : null; }

export function initCustomer(scene, interactables) {
  sceneRef = scene;
  scene.add(customerGroup);
  finale = createHeroFinale({
    scene: scene,
    group: customerGroup,
    setLook: heroLook,
    pose: function(n) { animateSkeletal(n, animTime); },
    snap: function() { if (rig) rig.snap(); },
    chime: heroChimeSound,
    player: function() { return window.P; },
    // Logo do canal para o emblema do fim (se o canal nao tiver, o nome vira o emblema).
    emblem: function() { return { img: avatarImg, name: S.channelTitle || S.handle || TXT.shirtDefaultName }; },
    finish: finishHero
  });

  loadGLTF('models/character.glb').then(function(gltf) {
    var model = gltf.scene;
    characterMesh = model;
    matchStyle(model);

    var box = new THREE.Box3().setFromObject(model);
    var h = (box.max.y - box.min.y) || 1;
    modelScale = 1.72 / h;
    model.scale.set(modelScale, modelScale, modelScale);
    model.position.y = -box.min.y * modelScale;

    // Guarda referências aos materiais originais para alternância de silhueta
    originalMaterials = [];
    model.traverse(function(node) {
      if (node.isMesh || node.isSkinnedMesh) {
        node.frustumCulled = false;
        originalMaterials.push({ node: node, mat: node.material });
      }
      if (node.isBone) {
        baseBonesRot[node.name] = node.rotation.clone();
      }
    });
    mapCustomerBones(model, bones);

    // Pose de repouso (T-pose): guarda a rotação local de cada osso e a rotação
    // de mundo (em espaço do modelo) do pai. Assim conseguimos girar os ossos em
    // eixos do PERSONAGEM (X = lado esquerdo, Y = cima, Z = frente), sem depender
    // dos eixos locais malucos do Mixamo.
    model.updateMatrixWorld(true);
    Object.keys(bones).forEach(function(k) {
      var b = bones[k];
      var pq = new THREE.Quaternion();
      if (b.parent) b.parent.getWorldQuaternion(pq);
      boneRest[k] = {
        rest: b.quaternion.clone(),
        parent: pq.clone(),
        parentInv: pq.clone().invert()
      };
    });
    if (bones.leftLeg) thighLen = bones.leftLeg.position.length();
    if (bones.leftLeg && bones.leftLeg.children.length) {
      var foot = bones.leftLeg.children.find(function(c) { return c.isBone; });
      if (foot) shinLen = foot.position.length();
    }

    if (bones.hips) baseHipsY = bones.hips.position.y;

    // Fita VHS na mão direita
    var invSc = 1 / modelScale;
    var tapeGrp = new THREE.Group();
    var vhsGeo = new THREE.BoxGeometry(0.12 * invSc, 0.19 * invSc, 0.035 * invSc);
    var vhsMat = new THREE.MeshLambertMaterial({ color: 0x18181c });
    var vhsBody = new THREE.Mesh(vhsGeo, vhsMat);
    tapeGrp.add(vhsBody);

    var labelGeo = new THREE.PlaneGeometry(0.09 * invSc, 0.14 * invSc);
    var lCanvas = document.createElement('canvas');
    lCanvas.width = 128; lCanvas.height = 192;
    var lx = lCanvas.getContext('2d');
    lx.fillStyle = '#ececf0'; lx.fillRect(0, 0, 128, 192);
    lx.fillStyle = '#cc0033'; lx.fillRect(0, 0, 128, 36);
    lx.fillStyle = '#ffffff'; lx.font = 'bold 18px monospace'; lx.textAlign = 'center';
    lx.fillText(TXT.tapeBrand, 64, 25);
    lx.fillStyle = '#111111'; lx.font = 'bold 16px sans-serif';
    lx.fillText(TXT.tapeLabel, 64, 85);
    lx.fillStyle = '#000000'; lx.fillRect(20, 115, 88, 20);

    var labelTex = new THREE.CanvasTexture(lCanvas);
    var labelMat = new THREE.MeshBasicMaterial({ map: labelTex, polygonOffset: true, polygonOffsetFactor: -1 });
    var labelMesh = new THREE.Mesh(labelGeo, labelMat);
    labelMesh.position.z = 0.0185 * invSc;
    tapeGrp.add(labelMesh);

    tapeGrp.position.set(0.03 * invSc, 0.14 * invSc, 0.04 * invSc);
    tapeGrp.rotation.set(0.4, 0.1, 0.2);

    if (bones.rightHand) bones.rightHand.add(tapeGrp);
    else model.add(tapeGrp);
    tapeInHand = tapeGrp;

    // Camiseta com estampa do canal (frente: avatar + nome; costas: nome + numero), presa ao osso do peito
    var chestBone = bones.spine1 || bones.spine2 || bones.spine;
    badgeTex = new THREE.CanvasTexture(createCustomerTorsoCanvas(S.channelTitle || S.handle));
    badgeTex.minFilter = THREE.LinearFilter;
    badgeTex.magFilter = THREE.LinearFilter;
    badgeTex.wrapS = THREE.RepeatWrapping;
    model.updateMatrixWorld(true);
    var chestY = chestBone ? new THREE.Vector3().setFromMatrixPosition(chestBone.matrixWorld).y : 1.16;
    badgeMesh = new THREE.Mesh(buildTeeGeometry(chestY), new THREE.MeshBasicMaterial({ map: badgeTex, color: 0xb8b8b8, side: THREE.DoubleSide }));
    badgeMesh.scale.setScalar(invSc);
    badgeMesh.frustumCulled = false;
    if (chestBone) chestBone.add(badgeMesh); else model.add(badgeMesh);

    template = SkeletonUtils.clone(model);
    customerGroup.add(model);
    rig = createRig(bones, customerGroup, modelScale);

    isLoaded = true;
  }).catch(function(err) {
    console.warn('Falha ao carregar character.glb:', err);
  });
}

// Cenas e visibilidade
// Posicoes no mundo (a loja esta em z<6; o estacionamento comeca em z=9.3; o carro em (5.1, 15.2)).
var SCENES = [
  { id: 'TREE',  pos: [-3.85, -0.14, 30.2], rotY: Math.PI,        pose: 'PEEK_TREE',   cine: 'yellow' },
  // A lataria do jeep (medida na cena: x 4.02..6.18, y 0.71..1.71, z 14.05..16.35) ocupa o arco 0.330..0.579 rad
  // visto de dentro da loja. Ele fica agachado ENCOSTADO atras dela (0.3 m alem do para-choque) no angulo 0.40,
  // bem no miolo do arco: ali a lataria o cobre inteiro, com folga. A espiada leva cabeca e tronco ate ~0.30,
  // fora da quina, e o recuo recolhe tudo de volta.
  { id: 'CAR',   pos: [5.10,  -0.14, 16.67], rotY: Math.PI + 0.400, pose: 'CROUCH_PEEK', cine: 'soft' },
  { id: 'FRONT', pos: [0.9,   -0.14, 12.0], rotY: Math.PI,        pose: 'SHOW_TAPE',   final: true }
];
var sceneRef = null, camRef = null;
var occluders = [], occTimer = 99;
var _rc = new THREE.Raycaster(), _rcO = new THREE.Vector3(), _rcD = new THREE.Vector3(), _rcT = new THREE.Vector3();

// Meshes opacos que podem esconder o cliente (sem hitboxes invisiveis, vidros, brilhos, a mao do jogador, o proprio cliente).
function refreshOccluders() {
  occluders.length = 0;
  if (!sceneRef) return;
  sceneRef.traverse(function(o) {
    if (!o.isMesh) return;
    for (var a = o; a; a = a.parent) {
      if (!a.visible || a === customerGroup || a === camRef || a.isCamera) return;
    }
    if (o.userData && o.userData.type) return;                   // alvos de interacao
    var m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.opacity < 0.9 || m.transparent && m.opacity < 1 || m.blending === THREE.AdditiveBlending) return;
    occluders.push(o);
  });
}

// O jogador "tem o cliente no campo de visao": ao menos um ponto do CORPO POSADO (cabeca, peito, ombros, joelhos,
// pelos ossos e nao pela origem do grupo) dentro do frustum/cone e sem nada opaco no caminho. Assim a cabeca
// espiando de tras do tronco conta, e o corpo escondido atras dele nao.
var SIGHT_BONES = ['head', 'spine2', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
// Agachado atras do carro so valem cabeca e peito: ha um vao embaixo da lataria por onde um joelho apareceria,
// e um joelho de relance nao e "ver o cliente". Isso tambem casa com a cena — o que ele mostra e cabeca e tronco.
var SIGHT_BONES_CROUCH = ['head', 'spine2'];
function sightBones() { return SCENES[sceneIndex] && SCENES[sceneIndex].id === 'CAR' ? SIGHT_BONES_CROUCH : SIGHT_BONES; }
// Devolve o MAIOR cosseno entre a direcao da camera e os ossos visiveis (-1 = nenhum a vista). Assim o mesmo
// teste serve para "esta na tela" (>= 0.58) e para "esta bem no meio da tela" (>= CENTER_DOT).
function sightDot(camera) {
  if (!customerGroup.visible || !camera) return -1;
  occTimer += 0.15;
  if (occTimer > 1.5) { occTimer = 0; refreshOccluders(); }
  camera.getWorldDirection(_tmpCamDir);
  _tmpMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_tmpMat);
  _rcO.copy(camera.position);
  var best = -1, LIST = sightBones();
  for (var i = 0; i < LIST.length; i++) {
    var b = bones[LIST[i]];
    if (!b) continue;
    _rcT.setFromMatrixPosition(b.matrixWorld);
    if (i === 0) _rcT.y += 0.08;                     // osso da cabeca nasce na nuca: mira o rosto
    if (!_frustum.containsPoint(_rcT)) continue;
    _rcD.subVectors(_rcT, _rcO);
    var d = _rcD.length();
    if (d < 0.2 || d > 60) continue;
    _rcD.divideScalar(d);
    var dot = _rcD.dot(_tmpCamDir);
    if (dot < 0.58 || dot <= best) continue;         // visao frontal / periferica confortavel
    _rc.set(_rcO, _rcD);
    _rc.far = Math.max(0.1, d - 0.05);
    if (_rc.intersectObjects(occluders, false).length === 0) best = dot;
  }
  return best;
}

// Amostra a visao a cada 0,15 s com histerese e dispara primeira visao / perda / retomada.
function sampleSight(dt, camera, sc) {
  sightAcc += dt;
  if (sightAcc < 0.15) return;
  sightAcc = 0;
  var dot = sightDot(camera);
  if (dot >= 0.58) { sightHits++; missHits = 0; } else { missHits++; sightHits = 0; }
  centerHits = dot >= CENTER_DOT ? centerHits + 1 : 0;
  if (!inSight && sightHits >= 2) {                  // dois testes seguidos: nao dispara por um relance
    inSight = true;
    if (!seenByPlayer) onFirstSight(sc);
    else if (sc.final && seenTimer > 0) startTensionRumble(seenTimer + 5.0);   // tensao recomeca ao voltar a olhar
  } else if (inSight && missHits >= 2) {
    inSight = false;
    if (sc.final && seenTimer > 0) stopTensionRumble();   // contador pausado: a tensao para junto
  }
}

// Ponto atras do tronco em relacao a camera (o tronco entre os dois) e o giro para encara-la.
function treeHideSpot(camera, out) {
  var cx = camera ? camera.position.x : 0, cz = camera ? camera.position.z : 0;
  var dx = TREE.x - cx, dz = TREE.z - cz, n = Math.hypot(dx, dz) || 1;
  dx /= n; dz /= n;
  out.set(TREE.x + dx * (TREE.r + 0.17), -0.14, TREE.z + dz * (TREE.r + 0.17));
  return Math.atan2(-dx, -dz);
}

// Esconderijo da cena do carro: igual ao do tronco, mas com a lataria no lugar da arvore. Ele nasce agachado
// atras do carro em relacao ao jogador e e a espiada (passo lateral) que o traz para fora da silhueta.
function carHideSpot(camera, out, extra) {
  var cx = camera ? camera.position.x : 0, cz = camera ? camera.position.z : 0;
  var dx = CAR.x - cx, dz = CAR.z - cz, n = Math.hypot(dx, dz) || 1;
  dx /= n; dz /= n;
  var r = CAR.r + (extra || 0);
  out.set(CAR.x + dx * r, -0.14, CAR.z + dz * r);
  return Math.atan2(-dx, -dz);
}

function hideSpot(camera, out) {
  return SCENES[sceneIndex].id === 'CAR' ? carHideSpot(camera, out) : treeHideSpot(camera, out);
}

function smooth01(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
// Smootherstep: derivada zero nas duas pontas. O zoom nao "arranca" nem "bate" no fim.
function smooth2(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (x * 6 - 15) + 10); }
function shortAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// ---- Cutscene: a camera e tomada e devolvida ----------------------------------------------------
// Ponto que a camera mira: o rosto (o osso da cabeca nasce na nuca).
function headWorld(out) {
  var b = bones.head;
  if (b) { out.setFromMatrixPosition(b.matrixWorld); out.y += 0.1; }
  else out.set(customerGroup.position.x, customerGroup.position.y + 1.55, customerGroup.position.z);
  return out;
}

function startCine(kind, camera) {
  if (cine || !camera || !window.P) return;
  var c = CINE[kind]; if (!c) return;
  cine = {
    c: c, t: 0, phase: 'in', baseFov: camera.fov,
    yaw0: window.P.yaw, pitch0: window.P.pitch,
    yaw: window.P.yaw, pitch: window.P.pitch,
    el: el('grade')
  };
  S.camForced = true;                 // trava o olhar do mouse/toque
  S.cutscene = 'customer';            // trava WASD, E, clique e o HUD
  if (cine.el) {
    cine.el.style.setProperty('--g-tint', c.tint);
    cine.el.style.setProperty('--g-amt', '0');
    cine.el.style.setProperty('--g-sep', '0');
    cine.el.style.setProperty('--g-blur', '0px');
    cine.el.classList.add('on');
  }
  // O medo e sustentado: o drone de tensao segura a cena inteira, a respiracao presa marca a entrada e o
  // swell grave acompanha o fechamento do zoom. O alivio so vem quando ele recua.
  startTensionRumble(c.inT + c.holdT + c.outT);
  breathHoldSound();
  cineZoomSound(c.inT + c.holdT);
}

// restore=true sai na marra (reset/zerar cena); senao e o fim natural do recuo.
function endCine(restore) {
  if (!cine) return;
  var cam = camRef || window.camera;
  if (cam) { cam.fov = cine.baseFov; cam.updateProjectionMatrix(); }
  stopTensionRumble();
  if (cine.el) {
    cine.el.classList.remove('on');
    cine.el.style.setProperty('--g-amt', '0');
    cine.el.style.setProperty('--g-sep', '0');
    cine.el.style.setProperty('--g-blur', '0px');
  }
  // Corte seco (reset do mundo): devolve o olhar exatamente onde o jogador o tinha deixado.
  if (restore && window.P) { window.P.yaw = cine.yaw0; window.P.pitch = cine.pitch0; }
  S.camForced = false;
  if (S.cutscene === 'customer') S.cutscene = false;
  cine = null;
  centerHits = 0;
}

// main.js consulta para nao reescrever o FOV no resize e para abaixar a TV enquanto a cena roda.
export function isCustomerCineActive() { return !!cine; }

// Roda todo quadro enquanto a cutscene esta ativa. Devolve true se ainda esta mandando na camera.
function updateCine(dt, camera) {
  if (!cine || !camera) return false;
  var c = cine.c;
  cine.t += dt;

  // alvo: encarar o rosto dele
  headWorld(_cineV);
  var dx = _cineV.x - camera.position.x, dy = _cineV.y - camera.position.y, dz = _cineV.z - camera.position.z;
  var n = Math.hypot(dx, dy, dz) || 1;
  var tgtYaw = Math.atan2(-dx, -dz), tgtPitch = Math.asin(Math.max(-1, Math.min(1, dy / n)));

  var e;
  if (cine.phase === 'in') {
    e = smooth2(cine.t / c.inT);
    if (cine.t >= c.inT) { cine.phase = 'hold'; cine.t = 0; }
  } else if (cine.phase === 'hold') {
    e = 1;
    if (cine.t >= c.holdT) {                       // fim do olhar: ele recua e a camera comeca a voltar
      cine.phase = 'out'; cine.t = 0;
      cine.outYaw = cine.yaw; cine.outPitch = cine.pitch;
      tensePianoSting();                           // a batida seca no instante em que ele comeca a recuar
      breathReleaseSound();
      if (state === 'SCENE') startRetreat();
    }
  } else {
    e = 1 - smooth2(cine.t / c.outT);
    if (cine.t >= c.outT) { endCine(true); return false; }
  }

  // Olhar: do ponto onde o jogador estava ate o rosto dele (e de volta no 'out'). Escreve em P.yaw/P.pitch
  // (padrao de Shotgun.js/Pig.js) e nao em camera.rotation: assim, quando o controle volta, o quadro seguinte de
  // main.js ja aplica o mesmo olhar e nao ha salto.
  var fromYaw = cine.phase === 'out' ? cine.outYaw : cine.yaw0;
  var fromPitch = cine.phase === 'out' ? cine.outPitch : cine.pitch0;
  var toYaw = cine.phase === 'out' ? cine.yaw0 : tgtYaw;
  var toPitch = cine.phase === 'out' ? cine.pitch0 : tgtPitch;
  var k = cine.phase === 'out' ? 1 - e : e;
  cine.yaw = fromYaw + shortAngle(toYaw - fromYaw) * k;
  cine.pitch = Math.max(-1.2, Math.min(1.2, fromPitch + (toPitch - fromPitch) * k));
  if (window.P) { window.P.yaw = cine.yaw; window.P.pitch = cine.pitch; }
  camera.rotation.set(cine.pitch, cine.yaw, 0, 'YXZ');

  // zoom e tratamento de cor acompanham a mesma curva
  camera.fov = cine.baseFov + (c.fov - cine.baseFov) * e;
  camera.updateProjectionMatrix();
  if (cine.el) {
    cine.el.style.setProperty('--g-amt', (c.amt * e).toFixed(3));
    cine.el.style.setProperty('--g-sep', (c.sep * e).toFixed(3));
    cine.el.style.setProperty('--g-blur', (c.blur * e).toFixed(2) + 'px');
  }
  return true;
}

// Espiada da arvore: mola criticamente amortecida (comeca e termina devagar, sem estalo) ate o alvo; no recuo,
// smoothstep ate 0 enquanto desliza para tras do tronco (relativo a posicao atual do jogador) e so entao some.
function updatePeek(dt) {
  var car = SCENES[sceneIndex].id === 'CAR';
  if (exitT >= 0) {
    exitT += dt;
    var e = smooth01(exitT / RETREAT_TIME);
    peek = exitFrom * (1 - e); peekVel = 0;
    hideBase.lerpVectors(hideFrom, hideTo, e);
    var dr = exitRotTo - exitRotFrom;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    hideRotY = exitRotFrom + dr * e;
    // na segunda metade vira de perfil (de costas para o lado por onde espiou): o corpo cabe atras do tronco
    customerGroup.rotation.y = hideRotY - (car ? 0.5 : RETREAT_TURN) * smooth01((exitT / RETREAT_TIME - 0.35) / 0.65);
    if (exitT >= RETREAT_TIME + 0.35) { vanishScene(); return; }   // ja escondido: some sem ninguem ver
  } else {
    // Arvore: ja nasce meio para fora (cabeca e ombro), para o jogador reparar. Carro: nasce ESCONDIDO por
    // inteiro atras da lataria e, passado CAR_PEEK_DELAY, poe devagar a cabeca e o tronco para fora — e se
    // recolhe de novo no recuo. A mola e mais lenta nele: o movimento tem de ser de quem espia, nao de quem pula.
    var w = seenByPlayer ? (car ? 1.5 : 2.4) : (car ? 1.0 : 1.3);
    var target = car ? (seenByPlayer ? 1 : (sceneT > CAR_PEEK_DELAY ? CAR_PEEK_OUT : 0))
                     : (seenByPlayer ? 1 : PEEK_UNSEEN);
    peekVel += (w * w * (target - peek) - 2 * w * peekVel) * Math.min(dt, 0.05);
    peek += peekVel * Math.min(dt, 0.05);
    customerGroup.rotation.y = hideRotY;
  }
  // passo lateral ao longo da esquerda do personagem: (cos rotY, 0, -sin rotY)
  var shift = car ? CAR_PEEK_SHIFT : PEEK_SHIFT;
  customerGroup.position.set(hideBase.x + Math.cos(hideRotY) * peek * shift, hideBase.y,
    hideBase.z - Math.sin(hideRotY) * peek * shift);
}

function startRetreat() {
  exitT = 0;
  exitFrom = peek;
  hideFrom.copy(hideBase);
  exitRotFrom = hideRotY;
  if (SCENES[sceneIndex].id === 'CAR') { hideTo.copy(hideFrom); exitRotTo = hideRotY; }   // recolhe o tronco, sem sair do lugar
  else exitRotTo = hideSpot(camRef, hideTo);
}

// Animações Procedurais dos Ossos
var rig = null, lastDt = 0.016;
var POSE_ALIAS = { IDLE_STIFF: 'IDLE', T_POSE: 'IDLE', WALK_SLOW: 'WALK', HERO_POSE: 'HERO_ARMS_UP', PEEK_CAR: 'LEAN_CAR' };

// Direcao do jogador no referencial do personagem (yaw: esquerda +; pitch: cima +), para a cabeca acompanhar.
function lookAtPlayer(out) {
  if (!camRef) { out.yaw = 0; out.pitch = 0; return out; }
  _tmpV.copy(camRef.position);
  customerGroup.worldToLocal(_tmpV);
  out.yaw = Math.atan2(_tmpV.x, _tmpV.z);
  out.pitch = Math.atan2(_tmpV.y - 1.55, Math.hypot(_tmpV.x, _tmpV.z));
  return out;
}
var _look = { yaw: 0, pitch: 0 };

function animateSkeletal(mode, t, k) {
  if (!rig) return;
  lookAtPlayer(_look);
  rig.update(lastDt, POSE_ALIAS[mode] || mode, _look.yaw, _look.pitch, k);
}

// Limpa estado transitório antes de iniciar/reiniciar um ato (também usado pelo atalho de debug).
function clearTransient() {
  stopTensionRumble();
  endCine(true);
  centerHits = 0;
  customerGroup.userData.doorSmashed = false;
  seenByPlayer = false;
  seenTimer = 0;
  inSight = false;
  sightAcc = 0; sightHits = 0; missHits = 0;
  exitT = -1;
  peek = 0; peekVel = 0;
}

// Aparencia do heroi: 'silhouette' (negro, sem camiseta/fita), 'color' (original) ou 'light' (branco dourado dissolvendo, k=opacidade).
function heroLook(mode, k) {
  var mat = mode === 'silhouette' ? heroSilhouetteMat : mode === 'light' ? heroFadeMat : null;
  if (mode === 'light') { heroFadeMat.opacity = k; }
  originalMaterials.forEach(function(item) { item.node.material = mat || item.mat; });
  var vis = mode === 'color';
  if (badgeMesh) badgeMesh.visible = vis;
  if (tapeInHand) tapeInHand.visible = vis;
}

// Volta a rota secreta do herói ao estado inicial (reinício / atalho de debug).
function resetHero(opts) {
  heroEdgeTimer = 0;
  finale.reset(window.camera, opts);
  heroLook('color', 1);
}

// Gatilho do heroi (main.js, todo quadro): pushing = input de movimento empurrando a borda z = 26 sem sair do
// lugar (clamp do collide()). 5 s continuos disparam a cena; soltar/afastar zera. So com a porta explodida, fora de
// modais e uma vez por sessao (depois da lua marcada nao dispara mais).
function heroBlocked() {
  return !!(S.terminalOpen || S.watching || S.playingArcade || S.playingGta || S.inspect || S.shareModalOpen || S.doorModalOpen || S.fileOpen || S.fainted || S.cutscene);
}
// Ilusao de fuga: empurrando a borda do mapa o jogador nao sai do lugar, mas a camera balanca como numa corrida
// (passada cada vez mais forte, leve rolagem e FOV abrindo). A sensacao e de estar escapando — ate ele olhar para
// tras e ver que nada mudou. Tudo e aditivo sobre a camera do quadro (main.js ja a posicionou a partir de P).
var ESCAPE_BOB = 0.055, ESCAPE_FOV = 7;
var escapeFov = 0;                                      // FOV de antes de empurrar (para devolver intacto)
function escapeIllusion(k) {
  var cam = window.camera;
  if (!cam) return;
  if (!escapeFov) escapeFov = cam.fov;
  var ph = heroEdgeTimer * 9.2;
  cam.position.y += Math.sin(ph) * ESCAPE_BOB * k;
  cam.position.x += Math.sin(ph * 0.5) * ESCAPE_BOB * 0.6 * k;
  cam.rotation.z += Math.sin(ph * 0.5 + 0.7) * 0.022 * k;
  var want = escapeFov + ESCAPE_FOV * k;
  if (Math.abs(cam.fov - want) > 0.05) { cam.fov = want; cam.updateProjectionMatrix(); }
}

export function heroEdgeTick(dt, pushing) {
  if (!pushing || !finale || state === 'HERO' || state === 'HERO_DONE' || !S.doorExploded || S.phase !== 'inside' ||
      SESSION.moonBranded || SESSION.huntMode || heroBlocked()) {
    heroEdgeTimer = 0;
    if (escapeFov) {                                    // soltou a borda: devolve o FOV intacto
      var cam = window.camera;
      if (cam) { cam.fov = escapeFov; cam.updateProjectionMatrix(); }
      escapeFov = 0;
    }
    return;
  }
  heroEdgeTimer += dt;
  escapeIllusion(Math.min(1, heroEdgeTimer / HERO_EDGE_SECONDS));
  if (heroEdgeTimer >= HERO_EDGE_SECONDS && window.camera) {
    window.camera.fov = escapeFov || window.camera.fov;   // a cena do heroi assume o FOV a partir do normal
    window.camera.updateProjectionMatrix();
    heroEdgeTimer = 0; escapeFov = 0;
    startHeroSequence(window.camera);
  }
}
export function isHeroActive() { return state === 'HERO'; }

// Zera o escurecimento por proximidade (uma vez), sem tocar na transição do reinício.
function clearProximityFade() {
  if (!fadeDirty) return;
  fadeDirty = false;
  var f = el('fade');
  if (f) f.style.opacity = '0';
}

// Loop Principal de Atualização
export function updateCustomer(dt, camera) {
  camRef = camera;
  lastDt = dt;
  animTime += dt;

  // ROTA SECRETA: Medalha de Herói + Lua (gatilho em heroEdgeTick). Roda mesmo com o customer desligado na
  // sessão (o impacto na lua o desliga) e termina no resetWorld().
  if (state === 'HERO') {
    if (!finale.update(dt, camera)) state = 'HERO_DONE';
    return;
  }
  if (state === 'HERO_DONE') return;

  if (!isLoaded) return;

  // Sessão: depois do herói (ou no modo HUNT) o customer não aparece mais (sobrevive ao resetWorld).
  if (SESSION.customerDisabled || SESSION.huntMode) {
    if (customerGroup.visible) customerGroup.visible = false;
    return;
  }

  // Porta explodida: sem atos hostis (as quests de fora acontecem sem ameaça).
  if (S.doorExploded) {
    if (customerGroup.visible || state !== 'WAITING') {
      customerGroup.visible = false;
      clearTransient();
      clearProximityFade();
      state = 'WAITING';
    }
    return;
  }

  // APARICOES: arvore -> estacionamento -> carro (somem 6 s depois de vistos) -> frente da loja (clímax)
  // Relogio da vida: so corre com o jogador dentro da loja.
  if (S.phase === 'inside') clock += dt;
  // Marca vencida: inicia a cena. A anterior so e substituida se o jogador nao a esta vendo agora (nunca vista, ou
  // vista e fora da vista com o contador pausado): troca sem ninguem ver. Vendo-a, ela termina o proprio olhar e a
  // nova entra em seguida. O recuo da arvore e a cena final nunca sao cortados.
  if (sceneQueue < SCENES.length && state === 'WAITING' && clock >= nextAt) startScene(sceneQueue++);

  if (state === 'WAITING') {
    // aguarda a proxima marca do cronograma

  } else if (state === 'SCENE') {
    var sc = SCENES[sceneIndex];
    sceneT += dt;
    if (cine) updateCine(dt, camera);
    if (sc.id === 'TREE' || sc.id === 'CAR') { updatePeek(dt); if (state !== 'SCENE') return; }
    // na cena final, nos ultimos 0,6 s antes de disparar ele se agacha em postura de bote (antecipacao)
    animateSkeletal(sc.final && seenByPlayer && seenTimer < 0.6 ? 'LUNGE' : sc.pose, animTime, peek);
    if (exitT < 0 && !cine) {
      sampleSight(dt, camera, sc);
      // Sem timer nenhum antes da primeira visao; depois, o olhar so desconta enquanto ele esta a vista.
      if (seenByPlayer && inSight && seenTimer > 0) seenTimer = Math.max(0, seenTimer - dt);
      // Pego BEM no meio da tela (duas amostras seguidas): a camera e tomada e a cutscene roda. O seenTimer
      // continua como rede de seguranca para quem so o vir de canto de olho e nunca o encarar.
      if (sc.cine && seenByPlayer && centerHits >= 2 && !playerBusy()) startCine(sc.cine, camera);
      else if (seenByPlayer && seenTimer <= 0) {
        // frente da loja: olhar completo -> corre, mas espera o jogador sair de qualquer UI
        if (sc.final) { if (!playerBusy()) startCharge(); }
        else startRetreat();                         // arvore / carro: recua ate sumir atras do esconderijo
      }
    }

  } else if (state === 'ACT_3_SPRINT') {
    // Corrida insana perseguindo o jogador
    var sprintSpeed = 6.8;

    animateSkeletal('RUN', animTime);
    if (rig) rig.advanceGait(sprintSpeed * dt, true);

    if (camera) {
      var dx = camera.position.x - customerGroup.position.x;
      var dz = camera.position.z - customerGroup.position.z;
      var distToCam = Math.sqrt(dx * dx + dz * dz);

      // Vai direto para o jogador (sem colisão com móveis de propósito: evita travar o jumpscare)
      if (distToCam > 0.03) {
        customerGroup.position.x += (dx / distToCam) * sprintSpeed * dt;
        customerGroup.position.z += (dz / distToCam) * sprintSpeed * dt;
      }
      // Rotação: vira para o jogador rápido, mas sem estalo
      if (distToCam > 0.1) {
        var dyaw = Math.atan2(dx, dz) - customerGroup.rotation.y;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        customerGroup.rotation.y += dyaw * (1 - Math.exp(-dt * 10));
      }

      if (distToCam < 1.15) {
        stopTensionRumble();
        triggerJumpscareClimax();
      }
    } else {
      customerGroup.position.z -= sprintSpeed * dt;
    }

    // Bate e estilhaça a porta de vidro
    if (customerGroup.position.z <= 6.35 && !customerGroup.userData.doorSmashed) {
      customerGroup.userData.doorSmashed = true;
      explosionSound();
      doorJiggleSound();
      clunk();
      setDoorOpen(1.0);

      var flash = el('screen-flash');
      if (flash) {
        flash.style.display = 'block';
        flash.style.opacity = '0.9';
        setTimeout(function() {
          flash.style.opacity = '0';
          setTimeout(function() { flash.style.display = 'none'; }, 200);
        }, 120);
      }
    }

  } else if (state === 'ACT_3_JUMPSCARE') {
    // Jumpscare ativo, simulando desmaio
    animateSkeletal('LUNGE', animTime); // bote final
    
    if (window.P) {
      window.P.pitch = Math.max(-1.5, window.P.pitch - dt * 2.5); // Olhar para baixo (caindo)
      window.P.pos.y = Math.max(0.15, window.P.pos.y - dt * 6.0); // Cair no chão
    }
    
    // Escurecimento progressivo do desmaio
    var fade = el('fade');
    if (fade) {
      var currentOpacity = parseFloat(fade.style.opacity) || 0;
      currentOpacity = Math.min(1.0, currentOpacity + dt * 2.5);
      fade.style.background = '#000000';
      fade.style.opacity = currentOpacity.toString();
    }
  }

  // Efeito global: A tela escurece sempre que o cliente (monstro) chega perto
  if (state !== 'ACT_3_JUMPSCARE') {
    var fadeEl = el('fade');
    if (fadeEl) {
      var darkens = state === 'ACT_3_SPRINT' || (state === 'SCENE' && SCENES[sceneIndex].final && seenByPlayer);
      if (customerGroup.visible && camera && darkens) {
        var fdx = camera.position.x - customerGroup.position.x;
        var fdz = camera.position.z - customerGroup.position.z;
        var fdist = Math.sqrt(fdx * fdx + fdz * fdz);
        if (fdist <= 18.0) {
          var darkness = Math.max(0, Math.min(1.0, 1.0 - (fdist - 0.5) / 17.5));
          fadeEl.style.transition = 'none';
          fadeEl.style.background = '#000000';
          fadeEl.style.opacity = darkness.toFixed(3);
          fadeDirty = true;
        } else clearProximityFade();
      } else clearProximityFade();
    }
  }
}

// Laboratorio de animacao (testes, so com ?debug): congela a maquina de estados e deixa o teste posar o personagem.
if (DEBUG) window.customerLab = {
  show: function(x, z, rotY) { state = 'LAB'; customerGroup.position.set(x, -0.14, z); customerGroup.rotation.y = rotY || 0; customerGroup.visible = true; },
  bones: function() { return bones; },
  axes: function() {
    var inv = customerGroup.getWorldQuaternion(new THREE.Quaternion()).invert(), out = {}, q = new THREE.Quaternion(), p = new THREE.Vector3();
    customerGroup.updateMatrixWorld(true);
    Object.keys(bones).forEach(function(k) {
      bones[k].getWorldQuaternion(q); q.premultiply(inv);
      var f = function(v) { return v.applyQuaternion(q).toArray().map(function(n) { return +n.toFixed(2); }); };
      bones[k].getWorldPosition(p); customerGroup.worldToLocal(p);
      out[k] = { x: f(new THREE.Vector3(1, 0, 0)), y: f(new THREE.Vector3(0, 1, 0)), z: f(new THREE.Vector3(0, 0, 1)), pos: p.toArray().map(function(n) { return +n.toFixed(2); }) };
    });
    return out;
  },
  pose: function(name, dt, yaw, pitch, k) { if (rig) rig.update(dt || 0.016, name, yaw || 0, pitch || 0, k); },
  gait: function(d, running) { if (rig) rig.advanceGait(d, running); },
  poses: function() { return rig ? rig.poses : []; }
};

// Estado interno para testes/depuracao
if (DEBUG) window.customerDebug = function() { return { state: state, scene: sceneIndex, seen: seenByPlayer, inSight: inSight, seenTimer: +seenTimer.toFixed(2), peek: +peek.toFixed(2), retreat: +exitT.toFixed(2), occluders: occluders.length, visible: customerGroup.visible }; };

function startScene(i) {
  clearTransient();
  sceneIndex = i;
  sceneT = 0;
  var sc = SCENES[i];
  state = 'SCENE';
  occTimer = 99;                                     // refaz a lista de obstaculos
  if (sc.id === 'TREE') {
    hideRotY = treeHideSpot(camRef || window.camera, hideBase);   // nasce escondido atras do tronco (peek 0)
    customerGroup.position.copy(hideBase);
    customerGroup.rotation.y = hideRotY;
  } else {
    customerGroup.position.set(sc.pos[0], sc.pos[1], sc.pos[2]);
    customerGroup.rotation.y = sc.rotY;
    if (sc.id === 'CAR') {                            // agachado na quina traseira do carro, de frente para a loja
      hideBase.set(sc.pos[0], sc.pos[1], sc.pos[2]);
      hideRotY = sc.rotY;
      peek = 0; peekVel = 0;                          // comeca inteiramente escondido atras da lataria
    }
  }
  customerGroup.visible = true;
  if (rig) rig.snap();                               // primeira pose sem herdar a anterior (sem transicao visivel)
}

// Primeira vez que o jogador o ve: piano, tremor de tela e clarao de cor; o olhar de 6 s comeca agora.
function onFirstSight(sc) {
  seenByPlayer = true;
  seenTimer = SIGHT_SECONDS;
  tensePianoSting();
  // Nas cenas com cutscene o susto fica por conta dela (zoom + cor + respiracao): o glitch vermelho/ciano do
  // sightFX atropelaria o clima contido. Na cena final ele continua.
  if (!sc.cine && window.sightFX) window.sightFX();
  if (sc.final) startTensionRumble(SIGHT_SECONDS + 5.0);
}

// Some de repente (sem T-pose nem glitch) e passa para a proxima cena.
function vanishScene() {
  customerGroup.visible = false;
  stopTensionRumble();
  clearProximityFade();
  endCine(true);
  seenByPlayer = false;
  state = 'WAITING';
  nextAt = clock + GAP;                               // a proxima aparicao so e marcada agora que esta acabou
}

// Jogador usando alguma UI (terminal, TV, fliperama/GTA, inspecao, modais): o ataque final espera.
function playerBusy() {
  return !!(S.terminalOpen || S.watching || S.playingArcade || S.playingGta || S.inspect || S.shareModalOpen || S.doorModalOpen || S.fileOpen);
}

// Depuracao (?debug): avanca o relogio da vida sem esperar.
if (DEBUG) {
  window.customerClock = {
    get t() { return clock; },
    get next() { return nextAt; },
    advance: function(sec) { clock += sec; },
    set: function(sec) { clock = sec; }
  };
}

function startCharge() {
  state = 'ACT_3_SPRINT';
}

function startHeroSequence(camera) {
  clearTransient();
  state = 'HERO';
  finale.start(camera);
}

function triggerJumpscareClimax() {
  state = 'ACT_3_JUMPSCARE';
  S.fainted = true;
  jumpscareScreamSound();

  // Reset do fade para podermos animar manualmente no updateCustomer
  var fade = el('fade');
  if (fade) {
    fade.style.transition = 'none';
  }
  fadeDirty = false;

  // Desativa HUD temporariamente no blackout
  var hud = el('hud');
  if (hud) { hudPrevDisplay = hud.style.display; hud.style.display = 'none'; }

  if (jumpscareTimer) clearTimeout(jumpscareTimer);
  jumpscareTimer = setTimeout(function() {
    jumpscareTimer = null;
    resetStoreAfterNightmare();
  }, 2500);
}

// Atalho de Depuração / Teste com a Tecla [C] (main.js so chama com ?debug)
// Pula diretamente para o próximo Ato da narrativa!
var debugActIndex = 0;
export function spawnCustomerNow(specificAct) {
  if (specificAct !== undefined) debugActIndex = specificAct;
  else debugActIndex = (debugActIndex % (SCENES.length + 1)) + 1;

  if (state === 'HERO' || state === 'HERO_DONE') { resetHero(); state = 'WAITING'; }
  else if (debugActIndex !== SCENES.length + 1) resetHero();
  if (debugActIndex >= 1 && debugActIndex <= SCENES.length) {
    toast('[DEBUG C] CENA ' + debugActIndex + ': ' + SCENES[debugActIndex - 1].id);
    startScene(debugActIndex - 1);
  } else if (debugActIndex === SCENES.length + 1) {
    toast('[DEBUG C] ROTA SECRETA: Medalha de Herói + Lua');
    // leva o jogador para a borda da rua (z = 26), olhando o horizonte, e dispara a cena nova
    if (window.camera && window.P) {
      window.P.pos.set(Math.max(-17.5, Math.min(17.5, window.P.pos.x)), 1.5, 26);
      window.P.yaw = Math.PI; window.P.pitch = 0.12;
      window.camera.position.copy(window.P.pos);
      window.camera.rotation.set(window.P.pitch, window.P.yaw, 0, 'YXZ');
      startHeroSequence(window.camera);
    }
  }
}

export function triggerCustomerDirectInteraction() {
  spawnCustomerNow();
}

// Fim do herói: fade para preto -> resetWorld() -> acorda dentro da locadora, sem o customer pelo resto da sessão.
// Chamado pelo HeroFinale 0,6 s depois do impacto na lua (o olhar continua preso na lua durante o fade).
function finishHero() {
  SESSION.customerDisabled = true;
  var fade = el('fade');
  if (fade) { fade.style.transition = 'opacity 1.2s ease-in'; fade.style.opacity = '1'; }
  if (heroResetTimer) clearTimeout(heroResetTimer);
  heroResetTimer = setTimeout(function() {
    heroResetTimer = null;
    resetWorld({ reason: 'hero' });
    wakeUp();
  }, 1400);
}

// Clareia a tela devagar (acordando) e devolve a HUD.
function wakeUp() {
  var fade = el('fade');
  if (fade) {
    fade.style.transition = 'opacity 3.0s ease-out';
    fade.style.opacity = '0';
  }
  var hud = el('hud');
  if (hud) hud.style.display = hudPrevDisplay || 'block';
}

// Restauração do customer dentro do resetWorld(): timers, estado, herói, tensão sonora.
onWorldReset(function(opts) {
  if (jumpscareTimer) { clearTimeout(jumpscareTimer); jumpscareTimer = null; }
  if (heroResetTimer) { clearTimeout(heroResetTimer); heroResetTimer = null; }
  clearTransient();
  fadeDirty = false;
  if (finale) resetHero(opts); else heroEdgeTimer = 0;
  state = 'WAITING';
  sceneIndex = 0;
  clock = 0; nextAt = FIRST_AT; sceneQueue = 0;
  customerGroup.visible = false;
  S.fainted = false;
  // Pesadelo/herói mantêm a tela preta: wakeUp() faz o fade-in. Nos demais casos limpa na hora.
  if (opts.reason !== 'nightmare' && opts.reason !== 'hero') {
    var fade = el('fade');
    if (fade && fade.style.opacity !== '0') { fade.style.transition = 'none'; fade.style.opacity = '0'; }
    var hud = el('hud');
    if (hud && hud.style.display === 'none') hud.style.display = hudPrevDisplay || 'block';
  }
});

// Depois do jumpscare: reset único do mundo e o jogador acorda atrás do balcão.
export function resetStoreAfterNightmare() {
  resetWorld({ reason: 'nightmare' });
  wakeUp();
}
if (DEBUG) window.resetStoreAfterNightmare = resetStoreAfterNightmare;   // depuracao (?debug)
