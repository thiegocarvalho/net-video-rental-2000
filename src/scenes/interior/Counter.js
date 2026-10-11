import * as THREE from 'three';
import { t } from '../../i18n/index.js';
import { boxAt, planeAt, loadModel, fitModel, freezeMeshes } from '../../graphics/Engine.js';
import { tex, pixelate, safeDisposeTexture } from '../../core/Utils.js';
import { terminalScreenCanvas, TXT as TEX_TXT } from '../../graphics/Textures.js';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { psxModel, addPropSolid, mergeModel } from './shared.js';
import { frontCanvas, sideCanvas, topCanvas, loadImg } from '../../entities/Tape.js';

var TXT = {
  computer: t('scn.counter.computer'),
  bell: t('scn.counter.bell'),
  vcr: t('scn.counter.vcr'),
  tv: t('scn.counter.tv'),
  tapeCase: t('scn.counter.tapeCase'),
  tapeCover: function (title) { return t('scn.counter.tapeCover', { title: title }); },
  tapeDefault: t('scn.counter.tapeDefault'),
  fan: t('scn.counter.fan'),
  muteTitle: t('scn.counter.muteTitle')
};

// Balcão de atendimento + combo TV retrô + computador do caixa
// Totalmente procedurais em Three.js no estilo PS1, leves, modulares e fiéis às fotos de referência.
export function buildCounter(scene, M, ctx) {
  var CZ = 0.30, CTOP = 1.06;
  var topY = CTOP + 0.03; // Altura do centro do tampo (espessura 0.06m -> topo em 1.12m)

  // BALCÃO INTEGRADO EM L (Um único móvel contínuo para atendimento e caixa)
  // 1. ALA FRONTAL (Front Wing - balcão principal contínuo da parede esquerda até o corredor)
  // Corpo de madeira (x: -2.60 a +1.45, z: -0.08 a +0.68)
  boxAt(scene, 4.05, CTOP, 0.76, M.counterBody, -0.575, CTOP / 2, CZ);
  // Tampo de fórmica contínuo (x: -2.60 a +1.45, z: -0.13 a +0.73)
  boxAt(scene, 4.05, 0.06, 0.86, M.counterTop, -0.575, topY, CZ);

  // 2. ALA LATERAL (Return Wing - conectada por trás da ala frontal, ao longo da parede esquerda)
  // Corpo de madeira (x: -2.60 a -1.84, z: -1.80 a -0.13)
  boxAt(scene, 0.76, CTOP, 1.67, M.counterBody, -2.22, CTOP / 2, -0.965);
  // Tampo de fórmica lateral (x: -2.60 a -1.74, z: -1.80 a -0.13)
  boxAt(scene, 0.86, 0.06, 1.67, M.counterTop, -2.17, topY, -0.965);

  // Colisões físicas em L perfeitamente contínuas
  ctx.solids.push({ x1: -2.60, x2: 1.45, z1: CZ - 0.43, z2: CZ + 0.43, h: topY + 0.03 }); // superficie do tampo (1.12)
  ctx.solids.push({ x1: -2.60, x2: -1.74, z1: -1.80, z2: CZ - 0.43, h: topY + 0.03 });

  // 1. COMPUTADOR / TERMINAL DO CAIXA (Gateway 2000 PC por Charlie via poly.pizza)
  // Instalado na ala lateral do balcão em L, voltado para o operador
  var compGrp = new THREE.Group();
  compGrp.position.set(-2.17, CTOP + 0.06, -0.95);
  compGrp.rotation.y = Math.PI / 2; // Tela e teclado voltados para +X (para o interior do caixa)
  scene.add(compGrp);

  var greenScreenMat = new THREE.MeshBasicMaterial({ map: tex(terminalScreenCanvas()) });

  var compScale = 8.5;
  // Tela do computador como superficie de HTML (ver ui/ScreenLayer.js): geometria medida do plano verde.
  var compScreen = {
    ready: false, mesh: null, texMat: greenScreenMat,
    holeMat: new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0 }),
    geom: { center: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), w: 0, h: 0 },
    normal: new THREE.Vector3(), pxW: 640, pxH: 502, view: null
  };
  loadModel('models/retro_computer.glb').then(function(model) {
    model.scale.set(compScale, compScale, compScale);
    model.position.set(0, 0, 0);
    psxModel(model);
    model.traverse(function(node) {
      if (node.isMesh) {
        node.castShadow = false;
        node.receiveShadow = false;
        if (node.name === 'screentext') {
          node.visible = false;
        }
        if (node.material) {
          var mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach(function(m) {
            if (m.name === 'M_screen_brightblue') {
              m.color.setHex(0x061a10);
            }
          });
        }
      }
    });
    mergeModel(model);   // 1 malha por material (o 'screentext' invisivel fica de fora)

    // Tela de fósforo verde com terminal operacional do caixa
    var scrW = 0.0370;
    var scrH = 0.0290;
    var scrMesh = new THREE.Mesh(new THREE.PlaneGeometry(scrW, scrH), greenScreenMat);
    scrMesh.position.set(-0.0010, 0.05118, 0.0175);
    scrMesh.rotation.x = -0.136; // Inclinação CRT autêntica do monitor
    model.add(scrMesh);

    compGrp.add(model);
    scrMesh.updateWorldMatrix(true, false);
    var cm = scrMesh.matrixWorld, cg = compScreen.geom;
    cg.center.setFromMatrixPosition(cm);
    cg.right.set(1, 0, 0).transformDirection(cm);
    cg.up.set(0, 1, 0).transformDirection(cm);
    compScreen.normal.crossVectors(cg.right, cg.up).normalize();
    cg.w = scrW * compScale; cg.h = scrH * compScale;
    compScreen.mesh = scrMesh;
    compScreen.ready = true;
    addPropSolid(ctx, model);
  }).catch(function(err) {
    console.warn('Falha ao carregar retro_computer.glb:', err);
  });

  var compHit = boxAt(compGrp, 0.95, 0.65, 0.60, M.dark, 0, 0.32, 0.10);
  compHit.visible = false;
  compHit.userData = { type: 'computer', label: TXT.computer };
  ctx.interactables.push(compHit);

  // 2. CAMPAINHA DE ATENDIMENTO (Desk Bell via poly.pizza - Jarlan Perez)
  var bellGrp = new THREE.Group();
  bellGrp.position.set(0.20, CTOP + 0.06, CZ + 0.05);
  scene.add(bellGrp);

  var bellModel = null;
  var bellRestY = 0;
  var bellBaseScale = new THREE.Vector3(1, 1, 1);
  loadModel('models/service_bell.glb').then(function(model) {
    fitModel(model, 0.13);
    psxModel(model);
    bellRestY = model.position.y;
    bellBaseScale.copy(model.scale);
    bellGrp.add(model);
    bellModel = model;
    addPropSolid(ctx, model);
  }).catch(function(err) {
    console.warn('Falha ao carregar service_bell.glb:', err);
    boxAt(bellGrp, 0.12, 0.015, 0.12, M.dark, 0, 0.0075, 0);
    boxAt(bellGrp, 0.09, 0.035, 0.09, M.trim, 0, 0.03, 0);
  });

  var bellHit = boxAt(bellGrp, 0.16, 0.15, 0.16, M.dark, 0, 0.06, 0);
  bellHit.visible = false;
  bellHit.userData = { type: 'bell', label: TXT.bell };
  ctx.interactables.push(bellHit);

  function ringBell() {
    if (bellModel) {
      // Pressiona a campainha suavemente para baixo sem nunca afundar a base abaixo do tampo
      bellModel.scale.set(bellBaseScale.x * 1.05, bellBaseScale.y * 0.84, bellBaseScale.z * 1.05);
      bellModel.position.y = bellRestY * 0.84;
      setTimeout(function() {
        if (bellModel) {
          bellModel.scale.copy(bellBaseScale);
          bellModel.position.y = bellRestY;
        }
      }, 120);
    }
  }

  // 3. COMBO TV RETRÔ (Modelo Justin Randall via poly.pizza) + VCR
  // Posicionada mais à esquerda no balcão, próxima da parede
  var tvGrp = new THREE.Group();
  tvGrp.position.set(-1.45, CTOP + 0.06, CZ);
  tvGrp.rotation.y = 0.12; // Leve inclinação suave para o cliente
  scene.add(tvGrp);

  var tvScale = 0.72;
  loadModel('models/old_tv.glb').then(function(model) {
    model.rotation.y = Math.PI; // Rotaciona 180° ANTES de ajustar a escala e centralizar
    fitModel(model, tvScale);
    psxModel(model);
    mergeModel(model);   // ~50 malhas -> 1 por material (estatico: a TV nunca se mexe)
    tvGrp.add(model);
    freezeMeshes(model);
    addPropSolid(ctx, tvGrp); // TV + videocassete em cima
  }).catch(function(err) {
    console.warn('Falha ao carregar old_tv.glb:', err);
  });

  // Aparelho de Videocassete VCR Procedural (Low-Poly) Posicionado no Topo da TV
  var vcrDeckGrp = new THREE.Group();
  var vcrTopY = 0.728; // Topo do gabinete de madeira da TV
  var vcrDeckH = 0.076;
  vcrDeckGrp.position.set(0.00, vcrTopY + vcrDeckH / 2, -0.04);
  tvGrp.add(vcrDeckGrp);

  boxAt(vcrDeckGrp, 0.44, vcrDeckH, 0.28, M.dark, 0, 0, 0);
  boxAt(vcrDeckGrp, 0.435, vcrDeckH - 0.006, 0.015, M.plast, 0, 0, 0.14);
  boxAt(vcrDeckGrp, 0.442, 0.006, 0.018, M.trim, 0, vcrDeckH / 2 - 0.003, 0.14);
  boxAt(vcrDeckGrp, 0.442, 0.006, 0.018, M.trim, 0, -vcrDeckH / 2 + 0.003, 0.14);

  boxAt(vcrDeckGrp, 0.03, 0.008, 0.03, M.trim, -0.17, -vcrDeckH / 2 - 0.004, -0.09);
  boxAt(vcrDeckGrp, 0.03, 0.008, 0.03, M.trim, 0.17, -vcrDeckH / 2 - 0.004, -0.09);
  boxAt(vcrDeckGrp, 0.03, 0.008, 0.03, M.trim, -0.17, -vcrDeckH / 2 - 0.004, 0.09);
  boxAt(vcrDeckGrp, 0.03, 0.008, 0.03, M.trim, 0.17, -vcrDeckH / 2 - 0.004, 0.09);

  // Porta/Abertura de inserção da fita VHS (Lado esquerdo do deck)
  var slotW = 0.205, slotH = 0.032;
  var slotLocalX = -0.08, slotLocalY = 0.004;
  boxAt(vcrDeckGrp, slotW + 0.012, slotH + 0.008, 0.01, M.dark, slotLocalX, slotLocalY, 0.144);
  boxAt(vcrDeckGrp, slotW, slotH, 0.006, M.trim, slotLocalX, slotLocalY, 0.147);
  boxAt(vcrDeckGrp, 0.16, 0.003, 0.002, M.lamp, slotLocalX, slotLocalY + 0.009, 0.151);

  // Display digital LCD / contador verde (Lado direito)
  boxAt(vcrDeckGrp, 0.11, 0.026, 0.006, M.black, 0.12, 0.008, 0.146);
  boxAt(vcrDeckGrp, 0.065, 0.010, 0.002, new THREE.MeshBasicMaterial({ color: 0x00ff66 }), 0.12, 0.008, 0.150);

  boxAt(vcrDeckGrp, 0.020, 0.020, 0.006, M.trim, -0.19, 0.008, 0.147);
  boxAt(vcrDeckGrp, 0.006, 0.006, 0.004, new THREE.MeshBasicMaterial({ color: 0x22ff44 }), -0.19, -0.014, 0.149);

  // Botões de transporte sob o display (Eject, Rew, Play, FF, Stop)
  for (var bi = -2; bi <= 2; bi++) {
    boxAt(vcrDeckGrp, 0.017, 0.012, 0.006, M.trim, 0.12 + bi * 0.022, -0.016, 0.148);
  }

  var vcrHitbox = boxAt(tvGrp, 0.46, 0.12, 0.30, M.dark, vcrDeckGrp.position.x, vcrDeckGrp.position.y, vcrDeckGrp.position.z);
  vcrHitbox.visible = false;
  vcrHitbox.userData = { type: 'vcr', label: TXT.vcr };
  ctx.interactables.push(vcrHitbox);

  var vcrLocalPos = new THREE.Vector3(
    vcrDeckGrp.position.x + slotLocalX,
    vcrDeckGrp.position.y + slotLocalY,
    vcrDeckGrp.position.z + 0.15
  );

  // D. Tela CRT (Canvas / Estática / OSD) perfeitamente posicionada no tubo de vidro da TV
  var SCR = { w: 0.662, h: 0.528, x: 0.004, y: 0.434, z: 0.246 };

  var screenCanvas = document.createElement('canvas');
  screenCanvas.width = 256; screenCanvas.height = 256;
  
  var screenCtx = screenCanvas.getContext('2d'), screenTex = tex(screenCanvas);
  
  // Desenha tela azul fixa para cobrir a textura de listras do modelo 3D
  screenCtx.fillStyle = '#0a1f6b';
  screenCtx.fillRect(0, 0, 256, 256);
  screenCtx.font = '900 24px "Courier New", monospace';
  screenCtx.fillStyle = '#00ff00';
  screenCtx.textAlign = 'right';
  screenCtx.fillText(TEX_TXT.videoLabel, 246, 30);
  screenTex.needsUpdate = true;

  // O vidro curvo do old_tv.glb chega a z=0.256 no centro (0.239 nas bordas); o plano precisa ficar a frente dele.
  var SCREEN_BULGE = 0.018;
  // Dois materiais para o vidro: com a textura (tela azul/estatica) ou "buraco" (alpha 0, sem blending),
  // por onde o video do YouTube, na camada CSS3D atras do canvas, aparece.
  var screenTexMat = new THREE.MeshBasicMaterial({ map: screenTex });
  var screenHoleMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0 });
  var screenMesh = planeAt(tvGrp, SCR.w, SCR.h, screenTexMat, SCR.x, SCR.y, SCR.z + SCREEN_BULGE);
  var tvGlow = new THREE.PointLight(0x9fd8ff, .3, 3); tvGlow.position.set(SCR.x, SCR.y, SCR.z + .4);
  tvGrp.add(tvGlow);

  // E. YouTube CSS3D Player integrado (preenche 100% da área do tubo CRT)
  var ytContainer = document.createElement('div');
  ytContainer.id = 'yt-container';
  ytContainer.style.cssText = 'position:relative;width:640px;height:510px;background:#000;overflow:hidden;border-radius:26px;opacity:0;transition:opacity .2s';

  var ytPlayer = document.createElement('div');
  ytPlayer.id = 'yt-player';
  ytPlayer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;filter:saturate(.92) contrast(1.04) brightness(.96)';
  ytContainer.appendChild(ytPlayer);

  var ytScan = document.createElement('div');
  ytScan.style.cssText = 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;background:repeating-linear-gradient(to bottom,rgba(0,0,0,.35) 0 2px,rgba(255,255,255,0) 2px 4px)';
  ytContainer.appendChild(ytScan);

  var ytVignette = document.createElement('div');
  ytVignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 100% at 50% 45%,rgba(255,255,255,.06),rgba(0,0,0,.45) 78%,rgba(0,0,0,.75))';
  ytContainer.appendChild(ytVignette);

  // Sinal / Indicador visual de MUDO sobre o player na TV (ícone pixel-art OSD retrô idêntico à referência)
  var ytMuteIndicator = document.createElement('div');
  ytMuteIndicator.id = 'yt-mute-indicator';
  ytMuteIndicator.title = TXT.muteTitle;
  ytMuteIndicator.style.cssText = 'position:absolute;top:20px;right:24px;z-index:20;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;user-select:none;filter:drop-shadow(0 0 2px rgba(255,255,255,0.9)) drop-shadow(0 0 6px rgba(255,255,255,0.45));transition:transform .15s, opacity .15s;opacity:0.92;';
  ytMuteIndicator.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28" width="46" height="54" fill="#ffffff" style="image-rendering:pixelated;shape-rendering:crispEdges;display:block;"><rect x="2" y="1" width="2" height="1"/><rect x="2" y="2" width="2" height="1"/><rect x="3" y="3" width="2" height="1"/><rect x="3" y="4" width="2" height="1"/><rect x="4" y="5" width="2" height="1"/><rect x="14" y="5" width="2" height="1"/><rect x="4" y="6" width="2" height="1"/><rect x="12" y="6" width="4" height="1"/><rect x="10" y="7" width="2" height="1"/><rect x="14" y="7" width="2" height="1"/><rect x="2" y="8" width="8" height="1"/><rect x="14" y="8" width="2" height="1"/><rect x="2" y="9" width="1" height="1"/><rect x="8" y="9" width="1" height="1"/><rect x="14" y="9" width="2" height="1"/><rect x="2" y="10" width="1" height="1"/><rect x="8" y="10" width="1" height="1"/><rect x="14" y="10" width="2" height="1"/><rect x="2" y="11" width="1" height="1"/><rect x="8" y="11" width="1" height="1"/><rect x="14" y="11" width="2" height="1"/><rect x="2" y="12" width="1" height="1"/><rect x="8" y="12" width="1" height="1"/><rect x="14" y="12" width="2" height="1"/><rect x="2" y="13" width="1" height="1"/><rect x="8" y="13" width="1" height="1"/><rect x="14" y="13" width="2" height="1"/><rect x="2" y="14" width="1" height="1"/><rect x="8" y="14" width="1" height="1"/><rect x="14" y="14" width="2" height="1"/><rect x="2" y="15" width="1" height="1"/><rect x="8" y="15" width="1" height="1"/><rect x="14" y="15" width="2" height="1"/><rect x="2" y="16" width="1" height="1"/><rect x="8" y="16" width="1" height="1"/><rect x="14" y="16" width="2" height="1"/><rect x="2" y="17" width="1" height="1"/><rect x="8" y="17" width="1" height="1"/><rect x="14" y="17" width="2" height="1"/><rect x="2" y="18" width="8" height="1"/><rect x="14" y="18" width="2" height="1"/><rect x="10" y="19" width="2" height="1"/><rect x="14" y="19" width="2" height="1"/><rect x="12" y="20" width="4" height="1"/><rect x="14" y="21" width="4" height="1"/><rect x="16" y="22" width="2" height="1"/><rect x="17" y="23" width="2" height="1"/><rect x="17" y="24" width="2" height="1"/><rect x="18" y="25" width="2" height="1"/><rect x="18" y="26" width="2" height="1"/></svg>';
  ytMuteIndicator.addEventListener('mouseenter', function() {
    ytMuteIndicator.style.transform = 'scale(1.15)';
    ytMuteIndicator.style.opacity = '1';
  });
  ytMuteIndicator.addEventListener('mouseleave', function() {
    ytMuteIndicator.style.transform = 'scale(1.0)';
    ytMuteIndicator.style.opacity = '0.92';
  });
  ytMuteIndicator.addEventListener('click', function(e) {
    e.stopPropagation();
    if (window.unmuteTv) window.unmuteTv();
  });
  ytContainer.appendChild(ytMuteIndicator);

  var cssObj = new CSS3DObject(ytContainer);
  cssObj.position.set(SCR.x, SCR.y, SCR.z);
  cssObj.scale.set(SCR.w / 640, SCR.h / 510, 1);
  tvGrp.add(cssObj);

  var tvBody = boxAt(tvGrp, 0.74, 0.76, 0.64, M.dark, 0, 0.38, 0);
  tvBody.visible = false;
  tvBody.userData = { type: 'tv', label: TXT.tv };
  screenMesh.userData = { type: 'tv', label: TXT.tv };
  ctx.interactables.push(tvBody);
  ctx.interactables.push(screenMesh);

  // Capa da Fita em Reprodução repousada sobre o balcão
  // Interagir com esta capa é o mesmo que pressionar EJETAR
  var caseGeo = new THREE.BoxGeometry(0.14, 0.028, 0.22);
  var caseDefaultMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
  var tapeCaseMesh = new THREE.Mesh(caseGeo, caseDefaultMat);
  tapeCaseMesh.position.set(-0.88, CTOP + 0.06 + 0.014, CZ + 0.08);
  tapeCaseMesh.rotation.y = 0.26;
  tapeCaseMesh.visible = false;
  tapeCaseMesh.userData = { type: 'playing_tape_case', label: TXT.tapeCase };
  scene.add(tapeCaseMesh);
  ctx.interactables.push(tapeCaseMesh);

  var activeCaseTape = null;
  // Materiais do estojo criados uma vez; apenas os mapas sao trocados (e descartados).
  var caseMats = null;
  function caseSetMap(mat, canvas) {
    var old = mat.map;
    if (old && old.image === canvas) { old.needsUpdate = true; return; }
    mat.map = tex(canvas);
    mat.needsUpdate = true;
    safeDisposeTexture(old);
  }
  function updateCaseTexture(tape) {
    if (!tape || tape !== activeCaseTape) return;
    try {
      if (!caseMats) {
        caseMats = [0, 1, 2, 3, 4, 5].map(function(i) {
          // 0 = lado do fecho e 3 = base ficam lisos, sem mapa (ver Tape.js)
          return (i === 0 || i === 3) ? new THREE.MeshLambertMaterial({ color: 0x121316 }) : new THREE.MeshLambertMaterial();
        });
        tapeCaseMesh.material = caseMats;
      }
      caseSetMap(caseMats[1], sideCanvas(tape));
      caseSetMap(caseMats[2], frontCanvas(tape)); // Face superior voltada para cima
      var tCan = topCanvas(tape);
      caseSetMap(caseMats[4], tCan);
      caseSetMap(caseMats[5], tCan);
    } catch(e) {
      console.warn('Erro ao atualizar arte do estojo:', e);
    }
  }

  function setPlayingTapeCase(tape) {
    if (!tape) {
      activeCaseTape = null;
      tapeCaseMesh.visible = false;
      return;
    }
    activeCaseTape = tape;
    tapeCaseMesh.visible = true;
    tapeCaseMesh.userData.label = TXT.tapeCover(tape.title ? tape.title.slice(0, 26) : TXT.tapeDefault);
    
    updateCaseTexture(tape);

    // Se o thumbnail ainda não estiver baixado, faz o download e reaplica
    if (!tape.thumb && (tape.thumbUrl || tape.id)) {
      var thumbUrl = tape.thumbUrl || ('https://i.ytimg.com/vi/' + tape.id + '/hqdefault.jpg');
      loadImg(thumbUrl).then(function(img) {
        if (img && activeCaseTape === tape) {
          tape.thumb = pixelate(img, 128, 88, 16);
          updateCaseTexture(tape);
        }
      });
    }
  }
  window.setPlayingTapeCase = setPlayingTapeCase;

  tvGrp.updateMatrixWorld(true);
  var SCRP = new THREE.Vector3(SCR.x, SCR.y, SCR.z).applyMatrix4(tvGrp.matrixWorld);
  // Zoom muito maior e mais próximo da TV (0.44m de distância, centralizado na tela)
  var watchPosLocal = new THREE.Vector3(SCR.x, SCR.y, SCR.z + 0.44);
  var WATCH_POS = watchPosLocal.applyMatrix4(tvGrp.matrixWorld);
  var WATCH_YAW = tvGrp.rotation.y;

  var halfW = SCR.w / 2, halfH = SCR.h / 2;
  var tl = new THREE.Vector3(SCR.x - halfW, SCR.y + halfH, SCR.z).applyMatrix4(tvGrp.matrixWorld);
  var tr = new THREE.Vector3(SCR.x + halfW, SCR.y + halfH, SCR.z).applyMatrix4(tvGrp.matrixWorld);
  var br = new THREE.Vector3(SCR.x + halfW, SCR.y - halfH, SCR.z).applyMatrix4(tvGrp.matrixWorld);
  var bl = new THREE.Vector3(SCR.x - halfW, SCR.y - halfH, SCR.z).applyMatrix4(tvGrp.matrixWorld);
  var corners = [tl, tr, br, bl];
  corners.tl = tl;
  corners.tr = tr;
  corners.br = br;
  corners.bl = bl;

  // 4. VENTILADOR DE MESA RETRÔ NO BALCÃO (J-Toastie via poly.pizza)
  // Posicionado na ponta direita do balcão (x = 1.20m), logo ao lado da passagem para o caixa
  var fanGrp = new THREE.Group();
  fanGrp.position.set(1.20, CTOP + 0.06, CZ);
  fanGrp.rotation.y = -Math.PI / 4;
  fanGrp.userData.dynamic = true;
  scene.add(fanGrp);

  var fanBladeNode = null;
  // Estado do ventilador: liga/desliga com inercia (as pas aceleram e desaceleram); speed em rad/s.
  var FAN_MAX = 32;
  var fanCtl = { on: false, speed: 0, max: FAN_MAX, pos: fanGrp.position };   // comeca desligado: ligar derruba o papel do comando ZTA da estante (Pig.js)
  loadModel('models/fan.glb').then(function(model) {
    fitModel(model, 0.30);
    model.traverse(function(node) {
      if (node.isMesh) {
        node.castShadow = false;
        node.receiveShadow = false;
        if (node.material && node.material.map) {
          node.material.map.magFilter = THREE.NearestFilter;
          node.material.map.minFilter = THREE.NearestFilter;
        }
      }
      if (node.name === 'Plane') {
        fanBladeNode = node;
        fanBladeNode.userData.dynamic = true;
      }
    });
    fanGrp.add(model);
    addPropSolid(ctx, model);
    // Alvo de interacao medido do modelo (no espaco do grupo, sem a posicao/rotacao dele)
    var sp = fanGrp.position.clone(), sr = fanGrp.rotation.y;
    fanGrp.position.set(0, 0, 0); fanGrp.rotation.y = 0; fanGrp.updateMatrixWorld(true);
    var fb = new THREE.Box3().setFromObject(model), fs = fb.getSize(new THREE.Vector3()), fc = fb.getCenter(new THREE.Vector3());
    fanGrp.position.copy(sp); fanGrp.rotation.y = sr; fanGrp.updateMatrixWorld(true);
    var fanHit = boxAt(fanGrp, fs.x + 0.06, fs.y + 0.04, fs.z + 0.06, M.dark, fc.x, fc.y, fc.z);
    fanHit.visible = false;
    fanHit.userData = { type: 'fan', label: TXT.fan };
    ctx.interactables.push(fanHit);
  }).catch(function(err) {
    console.warn('Falha ao carregar modelo do ventilador:', err);
  });

  function updateFan(dt) {
    var target = fanCtl.on ? FAN_MAX : 0;
    fanCtl.speed += (target - fanCtl.speed) * Math.min(1, dt * (fanCtl.on ? 2.2 : 0.8));   // sobe rapido, desacelera devagar
    if (!fanCtl.on && fanCtl.speed < 0.05) fanCtl.speed = 0;
    if (fanBladeNode && fanCtl.speed > 0) fanBladeNode.rotation.z += dt * fanCtl.speed;
  }

  return {
    SCR: SCR,
    SCRP: SCRP,
    screenCanvas: screenCanvas,
    screenCtx: screenCtx,
    screenTex: screenTex,
    screenMesh: screenMesh,
    compScreen: compScreen,
    screenTexMat: screenTexMat,
    screenHoleMat: screenHoleMat,
    tvGlow: tvGlow,
    WATCH_POS: WATCH_POS,
    WATCH_YAW: WATCH_YAW,
    ringBell: ringBell,
    tvGrp: tvGrp,
    vcrLocalPos: vcrLocalPos,
    corners: corners,
    updateFan: updateFan,
    fan: fanCtl,
    setPlayingTapeCase: setPlayingTapeCase
  };
}
