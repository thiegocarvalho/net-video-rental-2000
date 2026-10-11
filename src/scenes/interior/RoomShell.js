import * as THREE from 'three';
import { t } from '../../i18n/index.js';
import { boxAt, planeAt, G } from '../../graphics/Engine.js';
import { cached } from '../../core/Utils.js';
import { nearestTex, mergeMeshes, mergeModel } from './shared.js';
import { posterBackCanvas } from '../../graphics/Textures.js';

var TXT = {
  doorLocked: t('scn.shell.doorLocked'),
  lightSwitch: t('scn.shell.lightSwitch')
};

// TUNABLES DE ILUMINACAO (interior). Mexa so aqui.
var LIGHT_HEMI_SKY = 0xa9a79c;      // hemisferio: cima (fluorescente rebatido no forro)
var LIGHT_HEMI_GROUND = 0x3a3128;   // hemisferio: baixo (carpete escuro)
var LIGHT_HEMI_ON = 0.44, LIGHT_HEMI_OFF = 0.07;
var LIGHT_AMBIENT_COLOR = 0x2b2822;
var LIGHT_AMBIENT_ON = 0.30, LIGHT_AMBIENT_OFF = 0.05;
var LIGHT_CEIL_COLOR = 0xfff3dc;    // fluorescente quente (~4000K)
var LIGHT_CEIL_ON = 0.78, LIGHT_CEIL_RANGE = 8.5, LIGHT_CEIL_DECAY = 2;
var LIGHT_SHELF_COLOR = 0xffd9a8, LIGHT_SHELF_ON = 0.28, LIGHT_SHELF_RANGE = 4.2;
var LIGHT_COUNTER_COLOR = 0xffe2b8, LIGHT_COUNTER_ON = 0.45, LIGHT_COUNTER_RANGE = 4.8;
var LIGHT_GLOW_COLOR = 0xffe6bd;    // cor dos halos/poças falsas
var LIGHT_CEIL_GLOW = 0.32;         // opacidade do halo no forro
var LIGHT_FLOOR_POOL = 0.10;        // opacidade da poça no carpete
var LIGHT_STREET_SPILL = 0.06;      // luz fria da vitrine no chao
var LIGHT_WALL_TOP_SHADE = 0.55;    // escurecimento do topo das paredes (0-1)
var LIGHT_WALL_BOTTOM_SHADE = 0.35; // escurecimento do rodape
var LIGHT_FLOOR_EDGE_SHADE = 0.45;  // escurecimento das bordas do chao
var LIGHT_ENTRANCE_ON = 0.8;        // lampada externa sobre a porta

// --- helpers de luz falsa ---
function radialTex() {
  return cached('glowRadial', function() {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  });
}
function glowMat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    map: radialTex(), color: color, transparent: true, opacity: opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
}
function edgeTex() {
  return cached('edgeShade', function() {
    var c = document.createElement('canvas'); c.width = 4; c.height = 32;
    var x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 32);
    return new THREE.CanvasTexture(c);
  });
}
function shadeMat(strength) {
  return new THREE.MeshBasicMaterial({
    map: edgeTex(), transparent: true, opacity: strength, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
}
// Faixa de sombra: lado escuro = +Y local do plano.
function shadeBand(parent, w, h, mat, x, y, z, rx, ry, rz) {
  var m = new THREE.Mesh(G.plane, mat);
  m.scale.set(w, h, 1);
  m.position.set(x, y, z);
  m.rotation.set(rx || 0, ry || 0, rz || 0, 'YXZ');
  m.renderOrder = 1;
  parent.add(m);
  if (mat.userData.bands) mat.userData.bands.push(m);
  return m;
}
function addShading(scene, RW, RD, RH) {
  var top = shadeMat(LIGHT_WALL_TOP_SHADE), bot = shadeMat(LIGHT_WALL_BOTTOM_SHADE), flo = shadeMat(LIGHT_FLOOR_EDGE_SHADE);
  // Faixas do mesmo material viram 1 malha no fim (10 draw calls -> 3). Mesmo preto/opacidade e
  // sem escrita de profundidade: a sobreposicao nos cantos da o mesmo resultado em qualquer ordem.
  [top, bot, flo].forEach(function(m) { m.userData.bands = []; });
  var topH = 1.3, botH = 0.7, e = 0.012;
  var zc = 2, // centro da sala em z
      walls = [
        { w: RW, x: 0, z: -2.1 + e, ry: 0 },
        { w: RD, x: -RW / 2 + e, z: zc, ry: Math.PI / 2 },
        { w: RD, x: RW / 2 - e, z: zc, ry: -Math.PI / 2 }
      ];
  walls.forEach(function(d) {
    shadeBand(scene, d.w, topH, top, d.x, RH - topH / 2, d.z, 0, d.ry, 0);
    shadeBand(scene, d.w, botH, bot, d.x, botH / 2, d.z, 0, d.ry, Math.PI);
  });
  shadeBand(scene, RW, topH, top, 0, RH - topH / 2, 6.1 - e, 0, Math.PI, 0); // frente (acima da vitrine)
  // Bordas do chao (sombra aponta para a parede)
  var fw = 1.1;
  [
    { w: RW, ry: 0, x: 0, z: -2.1 + fw / 2 },
    { w: RD, ry: Math.PI / 2, x: -RW / 2 + fw / 2, z: zc },
    { w: RD, ry: -Math.PI / 2, x: RW / 2 - fw / 2, z: zc }
  ].forEach(function(d) {
    var g = new THREE.Group();
    g.position.set(d.x, 0.011, d.z);
    g.rotation.y = d.ry;
    scene.add(g);
    // dentro do grupo: plano deitado, escuro para -Z local
    shadeBand(g, d.w, fw, flo, 0, 0, 0, -Math.PI / 2, 0, 0);
  });
  [top, bot, flo].forEach(function(m) { mergeMeshes(m.userData.bands, scene); delete m.userData.bands; });
}

// A "casca" da loja: paredes, chão, teto, rodapés, a porta de funcionários e
// a iluminação geral do teto. Nenhum móvel entra aqui — só a estrutura fixa
// do ambiente.
export function buildRoomShell(scene, M, RW, RD, RH, ctx) {
  // Chão/teto/paredes só recebem sombra, não lançam — são superfícies enormes
  // bem perto das luzes de teto, e deixá-las lançar sombra também gera
  // artefatos grandes (baixa precisão do shadow map tão perto da luz).
  [
    planeAt(scene, RW, RD, M.floor, 0, 0, 2, -Math.PI / 2),
    planeAt(scene, RW, RD, M.ceil, 0, RH, 2, Math.PI / 2),
    planeAt(scene, RW, RH, M.wall, 0, RH / 2, -2.1),
    // Parede superior frontal (acima da vitrine de vidro, de y=2.6 até o teto)
    planeAt(scene, RW, RH - 2.6, M.wall, 0, 2.6 + (RH - 2.6) / 2, 6.1, 0, Math.PI),
    planeAt(scene, RD, RH, M.wall, -RW / 2, RH / 2, 2, 0, Math.PI / 2),
    planeAt(scene, RD, RH, M.wall, RW / 2, RH / 2, 2, 0, -Math.PI / 2)
  ].forEach(function(p) { p.castShadow = false; });

  // Rodapés
  boxAt(scene, RW - .05, .09, .04, M.trim, 0, .045, -2.07);
  boxAt(scene, .04, .09, RD - .05, M.trim, -RW / 2 + .03, .045, 2);
  boxAt(scene, .04, .09, RD - .05, M.trim, RW / 2 - .03, .045, 2);

  // Vitrine e porta da frente (z=6.1) — vidros 100% transparentes e esquadrias vazadas
  var frameM = new THREE.MeshLambertMaterial({ color: 0x1f2125 });
  var clearGlassM = new THREE.MeshBasicMaterial({
    color: 0x8cb2cc,
    transparent: true,
    opacity: 0.10,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  // Esquadrias estruturais (perfis metálicos vazados)
  // Viga superior e soleira inferior
  boxAt(scene, RW, 0.08, 0.10, frameM, 0, 2.61, 6.1);
  boxAt(scene, RW, 0.04, 0.12, frameM, 0, 0.02, 6.1);
  // Pilares verticais das extremidades e batentes da porta
  boxAt(scene, 0.08, 2.6, 0.10, frameM, -2.56, 1.30, 6.1);
  boxAt(scene, 0.08, 2.6, 0.10, frameM, 2.56, 1.30, 6.1);
  boxAt(scene, 0.06, 2.6, 0.10, frameM, -0.87, 1.30, 6.1);
  boxAt(scene, 0.06, 2.6, 0.10, frameM, 0.87, 1.30, 6.1);
  // Bandeira superior da porta
  boxAt(scene, 1.68, 0.05, 0.08, frameM, 0, 2.15, 6.1);

  // Travessas intermediárias nas janelas laterais e rodapés de vitrine
  boxAt(scene, 1.62, 0.04, 0.06, frameM, -1.72, 1.15, 6.1);
  boxAt(scene, 1.62, 0.04, 0.06, frameM, 1.72, 1.15, 6.1);
  boxAt(scene, 1.62, 0.35, 0.08, M.trim, -1.72, 0.175, 6.1);
  boxAt(scene, 1.62, 0.35, 0.08, M.trim, 1.72, 0.175, 6.1);

  // Vidros límpidos fixos (bandeira superior e janelas laterais)
  planeAt(scene, 1.68, 0.40, clearGlassM, 0, 2.38, 6.1);
  planeAt(scene, 1.62, 2.20, clearGlassM, -1.72, 1.45, 6.1);
  planeAt(scene, 1.62, 2.20, clearGlassM, 1.72, 1.45, 6.1);

  // PORTA DUPLA ARTICULADA DE ENTRADA (Abre na animação e tranca após passar)
  var leafW = 0.83, leafH = 2.11;

  // Folha Esquerda (Pivô na esquadria esquerda em x = -0.84, z = 6.10)
  var doorLeft = new THREE.Group();
  doorLeft.position.set(-0.84, 0, 6.10);
  doorLeft.userData.dynamic = true;
  scene.add(doorLeft);

  planeAt(doorLeft, leafW, leafH, clearGlassM, leafW / 2, leafH / 2, 0);
  boxAt(doorLeft, leafW, 0.04, 0.04, frameM, leafW / 2, leafH - 0.02, 0);
  boxAt(doorLeft, leafW, 0.10, 0.04, frameM, leafW / 2, 0.05, 0);
  boxAt(doorLeft, 0.04, leafH, 0.04, frameM, 0.02, leafH / 2, 0);
  boxAt(doorLeft, 0.04, leafH, 0.04, frameM, leafW - 0.02, leafH / 2, 0);
  boxAt(doorLeft, 0.03, 0.45, 0.06, M.plast, leafW - 0.06, 1.15, 0);
  // Cilindro da trava metálica
  boxAt(doorLeft, 0.025, 0.06, 0.05, M.dark, leafW - 0.01, 0.98, 0);

  // Folha Direita (Pivô na esquadria direita em x = +0.84, z = 6.10)
  var doorRight = new THREE.Group();
  doorRight.position.set(0.84, 0, 6.10);
  doorRight.userData.dynamic = true;
  scene.add(doorRight);

  planeAt(doorRight, leafW, leafH, clearGlassM, -leafW / 2, leafH / 2, 0);
  boxAt(doorRight, leafW, 0.04, 0.04, frameM, -leafW / 2, leafH - 0.02, 0);
  boxAt(doorRight, leafW, 0.10, 0.04, frameM, -leafW / 2, 0.05, 0);
  boxAt(doorRight, 0.04, leafH, 0.04, frameM, -0.02, leafH / 2, 0);
  boxAt(doorRight, 0.04, leafH, 0.04, frameM, -leafW + 0.02, leafH / 2, 0);
  boxAt(doorRight, 0.03, 0.45, 0.06, M.plast, -leafW + 0.06, 1.15, 0);
  boxAt(doorRight, 0.025, 0.06, 0.05, M.dark, -leafW + 0.01, 0.98, 0);
  // Cada folha: as 4 travessas da esquadria (mesmo material) viram 1 malha no espaco da folha (move junto)
  mergeModel(doorLeft); mergeModel(doorRight);

  function setDoorOpen(ratio) {
    ratio = Math.max(0, Math.min(1, ratio));
    doorLeft.rotation.y = (Math.PI / 2.2) * ratio;
    doorRight.rotation.y = (-Math.PI / 2.2) * ratio;
  }
  setDoorOpen(1); // Inicia aberta para a animação de entrada

  // Hitbox de clique da porta fechada/trancada
  var doorHitbox = boxAt(scene, 1.68, 2.15, 0.25, frameM, 0, 1.075, 6.10);
  doorHitbox.visible = false;
  doorHitbox.userData = { type: 'frontdoor', label: TXT.doorLocked };
  if (ctx && ctx.interactables) {
    ctx.interactables.push(doorHitbox);
  }

  // Lâmpada de entrada externa sobre a porta (ilumina a calçada em frente à vitrine à noite)
  var entranceLight = new THREE.PointLight(0xfffae8, LIGHT_ENTRANCE_ON * 1.6, 8, 2);
  entranceLight.position.set(0, 2.7, 6.9);
  scene.add(entranceLight);

  // Pôster grudado na vitrine de vidro:
  // - Escolha aleatória entre as imagens da pasta posters/ a cada carregamento
  // - Lado de fora (+Z): imagem frontal do pôster de cinema
  // - Lado de dentro (-Z): verso branco de papel cartão com fita adesiva
  var posterList = ['posters/poster1.jpeg', 'posters/poster2.jpeg'];
  var chosenPoster = posterList[Math.floor(Math.random() * posterList.length)];
  var posterW = 0.55, posterH = 0.85;
  var posterX = 1.68, posterY = 2.0;

  var frontTex = new THREE.TextureLoader().load(chosenPoster);
  frontTex.minFilter = THREE.NearestFilter;
  frontTex.magFilter = THREE.NearestFilter;
  var posterFrontM = new THREE.MeshLambertMaterial({ map: frontTex, side: THREE.FrontSide });
  var posterFrontMesh = planeAt(scene, posterW, posterH, posterFrontM, posterX, posterY, 6.102);
  posterFrontMesh.userData.dynamic = true;

  var backTex = nearestTex(cached('posterBack', posterBackCanvas));
  var posterBackM = new THREE.MeshLambertMaterial({ map: backTex, side: THREE.FrontSide });
  var posterBackMesh = planeAt(scene, posterW, posterH, posterBackM, posterX, posterY, 6.096, 0, Math.PI);
  posterBackMesh.userData.dynamic = true;

  // Barreira física invisível para não atravessar o vidro enquanto anda pela loja
  var frontWallSolid = { id: 'frontWall', x1: -RW / 2, x2: RW / 2, z1: 5.85, z2: 6.25, h: 4.2 };
  ctx.solids.push(frontWallSolid);

  // Iluminacao PS1: poucas luzes reais (3 de teto + 2 "poças" de luz) e o
  // resto falso (fixtures emissivas, glows aditivos, faixas de sombra nas
  // paredes/chao). Ajuste tudo pelas constantes LIGHT_* no topo do arquivo.
  var hemiL = new THREE.HemisphereLight(LIGHT_HEMI_SKY, LIGHT_HEMI_GROUND, LIGHT_HEMI_ON);
  scene.add(hemiL);

  var ambientL = new THREE.AmbientLight(LIGHT_AMBIENT_COLOR, LIGHT_AMBIENT_ON);
  scene.add(ambientL);

  var panels = [];
  var lightSources = [];
  var fakeGlows = []; // glows/pocas aditivas: somem quando as luzes apagam
  var halos = [], pools = [];
  var haloMat = glowMat(LIGHT_GLOW_COLOR, LIGHT_CEIL_GLOW), poolMat = glowMat(LIGHT_GLOW_COLOR, LIGHT_FLOOR_POOL);

  // Luminaria fluorescente de teto (visual apenas; a luz real e compartilhada)
  function ceilingTroffer(x, z) {
    var trofferGrp = new THREE.Group();
    trofferGrp.position.set(x, RH, z);
    scene.add(trofferGrp);

    var trofferW = 0.68, trofferD = 1.50, trofferH = 0.08;
    boxAt(trofferGrp, trofferW, trofferH, trofferD, M.plast, 0, -trofferH / 2, 0);
    boxAt(trofferGrp, trofferW - 0.06, 0.01, trofferD - 0.06, M.dark, 0, -trofferH + 0.02, 0);

    var lampMat = M.lamp;
    var panel = planeAt(trofferGrp, trofferW - 0.10, trofferD - 0.10, lampMat, 0, -trofferH + 0.01, 0, Math.PI / 2);
    panel.userData.dynamic = true;
    panels.push(panel);

    var tube1 = boxAt(trofferGrp, 0.04, 0.025, trofferD - 0.16, lampMat, -0.14, -trofferH + 0.005, 0);
    var tube2 = boxAt(trofferGrp, 0.04, 0.025, trofferD - 0.16, lampMat, 0.14, -trofferH + 0.005, 0);
    tube1.userData.dynamic = true;
    tube2.userData.dynamic = true;
    panels.push(tube1);
    panels.push(tube2);

    // Halo no forro ao redor da luminaria (falso, aditivo)
    var halo = new THREE.Mesh(G.plane, haloMat);
    halo.scale.set(2.0, 2.9, 1);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(x, RH - 0.012, z);
    scene.add(halo);
    halos.push(halo);
  }

  // 6 luminarias visuais em 2 fileiras, 3 pontos de luz reais no eixo central
  [-0.5, 2.0, 4.5].forEach(function(z) {
    ceilingTroffer(-1.25, z);
    ceilingTroffer(1.25, z);
    var pl = new THREE.PointLight(LIGHT_CEIL_COLOR, LIGHT_CEIL_ON, LIGHT_CEIL_RANGE, LIGHT_CEIL_DECAY);
    pl.position.set(0, RH - 0.45, z);
    pl.userData.on = LIGHT_CEIL_ON;
    scene.add(pl);
    lightSources.push(pl);

    // Poça de luz no carpete sob cada par de luminarias
    var pool = new THREE.Mesh(G.plane, poolMat);
    pool.scale.set(4.2, 3.4, 1);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.013, z);
    scene.add(pool);
    pools.push(pool);
  });
  // Luminarias (paineis + tubos), halos e pocas: 1 malha cada (18 + 6 + 3 draw calls -> 3). Os glows sao
  // aditivos (ordem irrelevante); o setLights troca o material/visibilidade da malha fundida.
  panels = [mergeMeshes(panels, scene)];
  fakeGlows.push(mergeMeshes(halos, scene), mergeMeshes(pools, scene));

  // Poças extras (2 luzes reais baratas): prateleiras e balcao/TV
  [
    { c: LIGHT_SHELF_COLOR, i: LIGHT_SHELF_ON, r: LIGHT_SHELF_RANGE, x: -1.0, y: 2.9, z: 3.0 },
    { c: LIGHT_COUNTER_COLOR, i: LIGHT_COUNTER_ON, r: LIGHT_COUNTER_RANGE, x: 0.2, y: 2.9, z: -1.0 }
  ].forEach(function(d) {
    var l = new THREE.PointLight(d.c, d.i, d.r, 2);
    l.position.set(d.x, d.y, d.z);
    l.userData.on = d.i;
    scene.add(l);
    lightSources.push(l);
  });

  // Sombras falsas: faixas escuras no topo/rodape das paredes e nas bordas do
  // chao dao queda de luz e cantos escuros sem custo de luz real.
  addShading(scene, RW, RD, RH);

  // Brilho de entrada: luz fria da rua entrando pela vitrine (falso)
  var streetSpill = new THREE.Mesh(G.plane, glowMat(0x7f9fd0, LIGHT_STREET_SPILL));
  streetSpill.scale.set(4.6, 2.2, 1);
  streetSpill.rotation.x = -Math.PI / 2;
  streetSpill.position.set(0, 0.014, 5.6);
  scene.add(streetSpill);
  fakeGlows.push(streetSpill);

  // Interruptor de Luz na parede atrás do balcão, próximo ao canto
  var switchGrp = new THREE.Group();
  switchGrp.position.set(2.32, 1.35, -2.06);
  switchGrp.rotation.y = 0;
  scene.add(switchGrp);

  boxAt(switchGrp, 0.09, 0.13, 0.015, M.plast, 0, 0, 0);
  var switchRocker = boxAt(switchGrp, 0.025, 0.045, 0.02, M.dark, 0, 0, 0.008);
  switchRocker.rotation.x = -0.3;
  switchRocker.userData.dynamic = true;

  var switchHitbox = boxAt(switchGrp, 0.18, 0.22, 0.08, M.dark, 0, 0, 0);
  switchHitbox.visible = false;
  switchHitbox.userData = { type: 'lightswitch', label: TXT.lightSwitch };

  if (ctx && ctx.interactables) {
    ctx.interactables.push(switchHitbox);
  }

  function setLights(on) {
    lightSources.forEach(function(l) { l.intensity = on ? l.userData.on : 0.0; });
    ambientL.intensity = on ? LIGHT_AMBIENT_ON : LIGHT_AMBIENT_OFF;
    hemiL.intensity = on ? LIGHT_HEMI_ON : LIGHT_HEMI_OFF;
    fakeGlows.forEach(function(g) { g.visible = on; });
    panels.forEach(function(p) { p.material = on ? M.lamp : M.dark; });
    switchRocker.rotation.x = on ? -0.3 : 0.3;
  }

  return {
    lightSources: lightSources,
    setLights: setLights,
    doorLeft: doorLeft,
    doorRight: doorRight,
    setDoorOpen: setDoorOpen,
    doorHitbox: doorHitbox,
    frontWallSolid: frontWallSolid
  };
}

