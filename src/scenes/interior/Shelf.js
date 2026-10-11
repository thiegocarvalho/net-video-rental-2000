import * as THREE from 'three';
import { t } from '../../i18n/index.js';
import { boxAt, planeAt, loadModel, fitModel } from '../../graphics/Engine.js';
import { stampMaterial, bottomStampMaterial, psxModel } from './shared.js';

var TXT = { tapeStock: t('scn.shelf.tapeStock') };

// A prateleira de fitas — geometria, acabamento (rodapé/moldura/tábuas/testeira),
// física de repouso das fitas e a luz de destaque quente.
//
// ctx = {solids, interactables, slots} — arrays compartilhados que o
// orquestrador (Interior.js) cria e passa pra cada construtor de móvel.
export function buildShelf(scene, M, ctx, cx, cz, ry, cols, rows, placardMat) {
  var g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry;
  scene.add(g); g.updateMatrixWorld(true);

  // Altura elevada para colocar todas as fitas no ângulo de visão nobre do jogador
  // Base com caixas de papelão na prateleira inferior (0.38m) + 3 prateleiras de fitas (0.42m cada)
  var shelfBaseH = 0.38;
  var shelfStep = 0.42;
  var H = shelfBaseH + rows * shelfStep + 0.38; // ~2.02m de altura
  var W = cols * .235 + .16, D = .36, r, c;

  boxAt(g, W, H, .05, M.shelfWood, 0, H / 2, -D / 2);
  boxAt(g, .06, H, D, M.shelfWood, -W / 2, H / 2, 0);
  boxAt(g, .06, H, D, M.shelfWood, W / 2, H / 2, 0);
  // Rodapé da base do móvel
  boxAt(g, W - .02, .07, D - .02, M.trim, 0, .035, 0);

  // Testeira integrada superior (Header Canopy de Locadora)
  if (placardMat) {
    var headerH = 0.32;
    var headerY = H + headerH / 2;
    var overhang = 0.05;

    // Fundo da testeira
    boxAt(g, W, headerH, 0.05, M.wood, 0, headerY, -D / 2);

    // Laterais da testeira com profundidade estendida para suportar a marquise
    boxAt(g, 0.06, headerH, D + overhang, M.wood, -W / 2, headerY, overhang / 2);
    boxAt(g, 0.06, headerH, D + overhang, M.wood, W / 2, headerY, overhang / 2);

    // Moldura intermediária de acabamento na junção do topo da prateleira com a testeira
    boxAt(g, W + 0.04, 0.035, D + 0.04, M.trim, 0, H + 0.015, overhang / 2);
    boxAt(g, W + 0.05, 0.012, D + 0.05, M.mdf2, 0, H + 0.035, overhang / 2);

    // Grupo da testeira/luminoso com leve inclinação frontal voltada para a visão do jogador
    var marqueeGrp = new THREE.Group();
    marqueeGrp.position.set(0, headerY - 0.005, D / 2 + 0.015);
    marqueeGrp.rotation.x = 0.09; // ~5.1° de inclinação voltada para o chão
    g.add(marqueeGrp);

    var placardW = W - 0.07;
    var placardH = headerH - 0.065;

    // Caixa interna escura embutida da moldura do luminoso
    boxAt(marqueeGrp, placardW + 0.03, placardH + 0.03, 0.035, M.dark, 0, 0, -0.01);

    // Frisos de fixação e contorno metálico do acrílico
    boxAt(marqueeGrp, placardW + 0.035, 0.016, 0.042, M.trim, 0, placardH / 2 + 0.01, 0);
    boxAt(marqueeGrp, placardW + 0.035, 0.016, 0.042, M.trim, 0, -placardH / 2 - 0.01, 0);
    boxAt(marqueeGrp, 0.016, placardH + 0.035, 0.042, M.trim, -placardW / 2 - 0.01, 0, 0);
    boxAt(marqueeGrp, 0.016, placardH + 0.035, 0.042, M.trim, placardW / 2 + 0.01, 0, 0);

    // O painel/banner luminoso embutido na face frontal da testeira
    var placardMesh = planeAt(marqueeGrp, placardW, placardH, placardMat, 0, 0, 0.012);
    placardMesh.userData.dynamic = true;

    // Cornija / moldura superior escalonada coroando o topo da gôndola
    boxAt(g, W + 0.06, 0.03, D + overhang + 0.04, M.wood, 0, H + headerH + 0.01, overhang / 2);
    boxAt(g, W + 0.09, 0.04, D + overhang + 0.07, M.trim, 0, H + headerH + 0.035, overhang / 2);
  } else {
    boxAt(g, W + .05, .05, D + .05, M.trim, 0, H + .06, 0);
  }

  // Prateleira inferior (Tábua da base onde repousam as caixas de papelão)
  boxAt(g, W, .04, D, M.shelfWood, 0, shelfBaseH, 0);
  boxAt(g, W, .05, .025, M.trim, 0, shelfBaseH + .005, D / 2 - .008);

  // Caixas de papelão na primeira prateleira (Quaternius via poly.pizza - bs6ikOeTrR)
  // Com carimbo industrial oficial "MANUFACTURE BY @THIEGOCARVALHO"
  var shelfStampMat = stampMaterial();
  var shelfBottomMat = bottomStampMaterial();

  var boxCount = cols; // Uma caixa por coluna na base
  var boxW = 0.21;
  // Cada caixa vira um item pegavel (entities/Cardboard.js): registra modelo + carimbo + o hitbox antigo.
  var boxesReady = loadModel('models/single_box.glb').then(function(baseBoxModel) {
    fitModel(baseBoxModel, boxW);
    psxModel(baseBoxModel);
    // Medidas reais da caixa (com origem em 0): o carimbo cola na face frontal, centrado na altura da face.
    var boxBB = new THREE.Box3().setFromObject(baseBoxModel), boxSz = boxBB.getSize(new THREE.Vector3());
    var stW = Math.min(0.15, boxSz.x * 0.72), stH = stW * 0.095 / 0.15;
    if (stH > boxSz.y * 0.85) { stH = boxSz.y * 0.85; stW = stH * 0.15 / 0.095; }

    for (var bi = 0; bi < boxCount; bi++) {
      var boxInstance = baseBoxModel.clone(true);
      var bx = -W / 2 + 0.20 + bi * 0.235;
      var by = shelfBaseH + 0.02; // Apoiada na tábua inferior
      var bz = 0.01;
      boxInstance.position.set(bx, by, bz);
      g.add(boxInstance);

      // Carimbo oficial na face frontal de cada caixa da prateleira
      // +0.004 em Z sobre a face (evita z-fighting)
      var sPlane = planeAt(g, stW, stH, shelfStampMat, bx + (boxBB.min.x + boxBB.max.x) / 2, by + (boxBB.min.y + boxBB.max.y) / 2, bz + boxBB.max.z + 0.004, 0, 0);
      sPlane.userData.dynamic = true;
      // Fundo da caixa: simbolo de reciclagem + "pode ser reciclada por 1 moeda" (so se ve com a caixa na mao/virada).
      // O plano olha para baixo, com o topo do texto para tras: le-se de frente olhando de baixo para cima.
      var stB = Math.min(boxSz.x, boxSz.z) * 0.82;
      var bPlane = planeAt(g, stB, stB, shelfBottomMat, bx + (boxBB.min.x + boxBB.max.x) / 2, by + boxBB.min.y - 0.003, bz + (boxBB.min.z + boxBB.max.z) / 2, 0, 0);
      bPlane.rotation.set(Math.PI / 2, 0, Math.PI);
      bPlane.userData.dynamic = true;
      if (ctx.shelfBoxes) ctx.shelfBoxes.push({ model: boxInstance, stamp: sPlane, stamp2: bPlane, shelf: g, hit: shelfBoxHit });
    }
  }).catch(function(err) {
    console.warn('Falha ao carregar single_box.glb na prateleira:', err);
  });

  // Hitbox de inspeção das caixas da prateleira
  var shelfBoxHit = boxAt(g, W - 0.08, 0.30, D - 0.05, M.dark, 0, shelfBaseH + 0.15, 0);
  shelfBoxHit.visible = false;
  shelfBoxHit.userData = { type: 'shelf_boxes', label: TXT.tapeStock };
  ctx.interactables.push(shelfBoxHit);
  if (ctx.shelfBoxReady) ctx.shelfBoxReady.push(boxesReady);

  // Prateleiras superiores para as fitas VHS (elevadas para o campo de visão perfeito)
  for (r = 0; r < rows; r++) {
    var plankY = shelfBaseH + 0.38 + r * shelfStep;
    boxAt(g, W, .04, D, M.shelfWood, 0, plankY, 0);
    boxAt(g, W, .05, .025, M.trim, 0, plankY + .005, D / 2 - .008);
  }
  // Tábua do teto da gôndola
  boxAt(g, W, .04, D, M.shelfWood, 0, H, 0);

  // Slots das fitas: preenchidos apenas nas prateleiras superiores (de cima para baixo)
  for (r = rows - 1; r >= 0; r--) {
    for (c = 0; c < cols; c++) {
      var tapeShelfTop = shelfBaseH + 0.38 + r * shelfStep + 0.02;
      var p = new THREE.Vector3(-W / 2 + .2 + c * .235, tapeShelfTop + 0.155, .02);
      ctx.slots.push({ world: g.localToWorld(p.clone()), ry: ry });
    }
  }

  // Luz de destaque quente nas capas, tipo iluminação de vitrine.
  var shelfLamp = boxAt(g, W * .82, .03, .05, M.warmLamp, 0, H + .01, D / 2 - .02);
  // É a luminária em si, bem colada na luz — não deve nem receber nem lançar
  // sombra sobre si mesma (o segundo caso corrompia o shadow map da luz).
  shelfLamp.receiveShadow = false;
  shelfLamp.castShadow = false;

  // (sem luz propria: a iluminacao vem dos pontos de teto — limite de luzes PS1)

  var half = W / 2 + .1;
  ctx.solids.push(Math.abs(Math.sin(ry)) > .5
    ? { x1: cx - .36, x2: cx + .36, z1: cz - half, z2: cz + half, h: 2.3 }
    : { x1: cx - half, x2: cx + half, z1: cz - .36, z2: cz + .36, h: 2.3 });
  return g;
}
