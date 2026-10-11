import { makeObb } from '../core/Collision.js';
import * as THREE from 'three';
import { boxAt, planeAt, loadModel, fitModel } from '../graphics/Engine.js';
import { concreteTex, blockbusterSignCanvas, woodSidingTex, shingleTex, brickTex } from '../graphics/Textures.js';
import { tex } from '../core/Utils.js';
import { psxModel, mergeMeshes } from './interior/shared.js';
import { buildRecycleBin } from '../entities/Cardboard.js';
import { buildMoon } from '../entities/Moon.js';

// Fachada da locadora estilo Blockbuster
// Totalmente integrada no mesmo mapa, com alinhamento perfeito de vértices,
// iluminação suave e letreiro 3D desobstruído sobre o telhado inclinado.
export function buildExterior(scene, M, ctx) {
  var RW = 5.2; // Largura do vão central da vitrine (-2.6 a +2.6)

  // 1. Calçada frontal de concreto (z=6.1 a z=9.3, y=0.0 no topo nivelada com a loja)
  var concreteM = new THREE.MeshLambertMaterial({ map: concreteTex() });
  var curbM = new THREE.MeshLambertMaterial({ color: 0x6e7278 });

  // Calçada: topo em y=0.0 (perfeitamente alinhada com o chão da loja, sem degrau recortando o vidro)
  var sidewalk = boxAt(scene, 38, 0.15, 3.2, concreteM, 0, -0.075, 7.7);
  sidewalk.castShadow = false;
  sidewalk.receiveShadow = true;
  var curb = boxAt(scene, 38, 0.17, 0.14, curbM, 0, -0.07, 9.3);
  curb.castShadow = false;

  // 2. Asfalto do estacionamento (z=9.3 a z=40, y=-0.15)
  var asphaltM = new THREE.MeshLambertMaterial({ color: 0x2c2f37 });
  var parkingLot = planeAt(scene, 80, 36, asphaltM, 0, -0.15, 27, -Math.PI / 2);
  parkingLot.castShadow = false;
  parkingLot.receiveShadow = true;

  // Listras amarelas de vagas de estacionamento
  var stripeM = new THREE.MeshBasicMaterial({ color: 0xebcb34 });
  for (var i = -5; i <= 5; i++) {
    var pLine = planeAt(scene, 0.16, 5.2, stripeM, i * 3.4, -0.14, 15.2, -Math.PI / 2);
    pLine.rotation.z = 0.28;
    pLine.receiveShadow = false;
  }

  // 3. Fachada de cedro com ripas verticais e rodapé de tijolo
  // escala unica da fachada: o tile cobre 4 m x 4,2 m; cada peca usa largura/4 x altura/4,2 repeticoes
  var woodMat = new THREE.MeshLambertMaterial({ map: woodSidingTex(16 / 4, 4.2 / 4.2) });                 // paredes de 16 x 4,2 m
  var woodHeaderMat = new THREE.MeshLambertMaterial({ map: woodSidingTex(RW / 4, 1.55 / 4.2) });          // bandeira de 5,2 x 1,55 m
  var woodSoffitMat = new THREE.MeshLambertMaterial({ map: woodSidingTex(38 / 4, 1.10 / 4.2) });         // beiral de 38 x 1,1 m
  var brickMat = new THREE.MeshLambertMaterial({ map: brickTex() });

  // Lado Esquerdo (-18.6 a -2.6): altura 4.2, alinhamento exterior em z=6.18
  var leftWall = boxAt(scene, 16.0, 4.2, 0.12, woodMat, -10.6, 2.1, 6.18);
  leftWall.castShadow = false; leftWall.receiveShadow = false;
  var leftBrick = boxAt(scene, 16.0, 0.35, 0.16, brickMat, -10.6, 0.175, 6.20);
  leftBrick.castShadow = false;

  // Lado Direito (+2.6 a +18.6): altura 4.2, alinhamento exterior em z=6.18
  var rightWall = boxAt(scene, 16.0, 4.2, 0.12, woodMat, 10.6, 2.1, 6.18);
  rightWall.castShadow = false; rightWall.receiveShadow = false;
  var rightBrick = boxAt(scene, 16.0, 0.35, 0.16, brickMat, 10.6, 0.175, 6.20);
  rightBrick.castShadow = false;

  // Bandeira superior da fachada sobre a vitrine (exterior em z=6.18, de y=2.65 a 4.20)
  var headerWall = boxAt(scene, RW, 1.55, 0.12, woodHeaderMat, 0, 3.425, 6.18);
  headerWall.castShadow = false; headerWall.receiveShadow = false;

  // 4. Telhado mansarda inclinado estilo Blockbuster - 100% EXTERNO
  // O grupo roofGrp define a inclinação exata (-0.617 rad ~ 35.3°) da parede exterior (z=6.18, y=4.20)
  // até o beiral sobre a calçada (z=7.28, y=2.65).
  var roofGrp = new THREE.Group();
  roofGrp.position.set(0, 3.425, 6.73);
  roofGrp.rotation.x = -0.617;
  scene.add(roofGrp);

  var shingleMat = new THREE.MeshLambertMaterial({ map: shingleTex() });
  var roofSlope = boxAt(roofGrp, 38, 1.90, 0.12, shingleMat, 0, 0, 0);
  roofSlope.castShadow = false; roofSlope.receiveShadow = false;

  // 5. Letreiro 3D estilo Blockbuster montado no mesmo ângulo da cobertura, sem clipping
  var signBackerM = new THREE.MeshLambertMaterial({ color: 0x001438 });
  var signBacker = boxAt(roofGrp, 6.8, 1.35, 0.08, signBackerM, 0, 0, 0.10);
  signBacker.castShadow = false;

  var signMat = new THREE.MeshBasicMaterial({ map: tex(blockbusterSignCanvas()) });
  planeAt(roofGrp, 6.6, 1.25, signMat, 0, 0, 0.145);

  // Forro inferior do beiral (soffit) fechando horizontalmente por baixo do telhado
  var soffit = boxAt(scene, 38, 0.06, 1.10, woodSoffitMat, 0, 2.65, 6.73);
  soffit.castShadow = false; soffit.receiveShadow = false;

  // Friso / testeira escura de acabamento na ponta frontal do beiral
  var fascia = boxAt(scene, 38, 0.12, 0.06, M.dark, 0, 2.65, 7.30);
  fascia.castShadow = false; fascia.receiveShadow = false;

  // (letreiro e vitrine: sem SpotLights proprios — limite de luzes PS1; letreiro e Basic)

  // 6. As tres caixas da calcada sao as caixas de reciclagem de papelao (entities/Cardboard.js)
  var recycle = buildRecycleBin(scene, ctx);

  // 7. Postes de iluminação na calçada, junto ao meio-fio (fora das vagas e da pista).
  // O braço avança sobre o estacionamento para a luz alcançar os carros.
  var bulbM = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
  var lampPosts = [];
  function makeStreetLamp(x, intensity, range) {
    var postZ = 8.85, lightZ = 10.5;
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.8, 8), M.dark);
    post.position.set(x, 2.9, postZ);
    scene.add(post);
    lampPosts.push(post);

    boxAt(scene, 0.05, 0.05, lightZ - postZ + 0.3, M.dark, x, 5.75, (postZ + lightZ) / 2);
    boxAt(scene, 0.22, 0.10, 0.42, M.dark, x, 5.68, lightZ);

    var lamp = new THREE.PointLight(0xffdf98, intensity, range, 2);
    lamp.position.set(x, 5.5, lightZ);
    scene.add(lamp);

    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), bulbM);
    bulb.position.copy(lamp.position);
    bulb.userData.noShot = true;   // o tiro na lampada e testado a parte (entities/Shotgun.js)
    scene.add(bulb);

    if (ctx && ctx.solids) {
      ctx.solids.push({ x1: x - 0.15, x2: x + 0.15, z1: postZ - 0.15, z2: postZ + 0.15, h: 6 });
    }
    // light/bulb/onMat/intensity: a shotgun apaga a lampada e o resetWorld acende de novo.
    // isFrontLamp: so estas duas contam para o Wanted / fuga do porquinho (a arma tem 6 cartuchos e o lote tem 8 postes).
    return { light: lamp, bulb: bulb, onMat: bulbM, intensity: intensity, off: false, isFrontLamp: true };
  }
  var streetLamps = [
    makeStreetLamp(-6.8, 3.0, 20),
    makeStreetLamp(6.8, 2.6, 20) // do lado do carro estacionado
  ];
  // Postes do lado oposto da loja (fundo do estacionamento e laterais, entre os pinheiros). A cena ja tem muitas luzes de
  // verdade (15 PointLights + 2 SpotLights, todas pesam em todos os materiais), entao estes postes iluminam "de mentira":
  // halo cruzado, cone de luz esfumacado e poco de luz no asfalto, tudo aditivo, estatico e sem custo de iluminacao.
  var farLampMats = (function() {
    var mkTex = function(w, h, paint) { var c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); };
    var haloT = mkTex(64, 64, function(g, w, h) { var r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.3, 'rgba(255,220,150,.45)'); r.addColorStop(1, 'rgba(255,210,140,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
    var coneT = mkTex(8, 64, function(g, w, h) { var r = g.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(255,225,165,.55)'); r.addColorStop(0.55, 'rgba(255,215,150,.16)'); r.addColorStop(1, 'rgba(255,210,140,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
    var poolT = mkTex(128, 128, function(g, w, h) {
      var r = g.createRadialGradient(64, 64, 0, 64, 64, 62);
      for (var i = 0; i <= 10; i++) { var t = i / 10; r.addColorStop(t, 'rgba(255,226,160,' + (0.5 * Math.exp(-t * t * 3.6) * (1 - t * t * t)).toFixed(3) + ')'); }
      g.fillStyle = r; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';           // um pouco de fumaca/irregularidade
      var sd = 11, rn = function() { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      for (var k = 0; k < 18; k++) { var px = 20 + rn() * 88, py = 20 + rn() * 88, pr = 8 + rn() * 14, pg = g.createRadialGradient(px, py, 0, px, py, pr); pg.addColorStop(0, 'rgba(0,0,0,' + (0.1 + rn() * 0.15).toFixed(2) + ')'); pg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = pg; g.fillRect(px - pr, py - pr, pr * 2, pr * 2); }
    });
    var add = function(map, op) { return new THREE.MeshBasicMaterial({ map: map, transparent: true, opacity: op || 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }); };
    return { halo: add(haloT), cone: add(coneT, 0.5), pool: add(poolT), haloGeo: new THREE.PlaneGeometry(2.0, 2.0), coneGeo: new THREE.CylinderGeometry(0.18, 2.7, 5.6, 18, 1, true), poolGeo: new THREE.PlaneGeometry(10, 10) };
  })();
  var farBulbM = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
  // A lampada e os efeitos ficam como malhas proprias de cada poste (o mergeMeshes abaixo so funde os mastros, e o
  // mergeStatic de Interior.js pula material transparente / renderOrder != 0): da para apagar um poste sozinho com
  // visible = false, sem malha extra nem custo novo. Nada aqui se move, entao o freezeMeshes nao atrapalha.
  function makeFarLamp(x, z, armDir) {              // armDir: +1 ou -1 (para onde o braco aponta em z)
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.8, 8), M.dark);
    post.position.set(x, 2.76, z);
    scene.add(post); lampPosts.push(post);
    var lz = z + armDir * 1.6;
    boxAt(scene, 0.05, 0.05, 1.9, M.dark, x, 5.62, z + armDir * 0.8);
    boxAt(scene, 0.22, 0.10, 0.42, M.dark, x, 5.55, lz);
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), farBulbM);   // material proprio: trocado so neste poste ao quebrar
    // noShot: o tiro na lampada e testado a parte (lampOnRay em entities/Shotgun.js, com tolerancia do chumbo),
    // igual aos 2 postes da calcada; o raycast nao precisa ver a esfera.
    bulb.position.set(x, 5.38, lz); bulb.userData.noShot = true;
    scene.add(bulb);
    var halos = [];
    [0, Math.PI / 2].forEach(function(ry) {            // halo: dois planos cruzados (visivel de qualquer lado)
      var h = new THREE.Mesh(farLampMats.haloGeo, farLampMats.halo);
      h.position.copy(bulb.position); h.rotation.y = ry; h.renderOrder = 3; h.userData.noShot = true; scene.add(h);
      halos.push(h);
    });
    var cone = new THREE.Mesh(farLampMats.coneGeo, farLampMats.cone);       // topo estreito na lampada, abre ate o chao
    cone.position.set(x, 5.38 - 2.8, lz); cone.renderOrder = 2; cone.userData.noShot = true; scene.add(cone);
    var pool = new THREE.Mesh(farLampMats.poolGeo, farLampMats.pool);
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, -0.13, lz); pool.renderOrder = 2; pool.userData.noShot = true;
    pool.material.polygonOffset = true; pool.material.polygonOffsetFactor = -2; pool.material.polygonOffsetUnits = -2;
    scene.add(pool);
    if (ctx && ctx.solids) ctx.solids.push({ x1: x - 0.15, x2: x + 0.15, z1: z - 0.15, z2: z + 0.15, h: 6 });
    // sem light: a iluminacao destes postes e so aditiva; a shotgun apaga a lampada e esconde halo/cone/poca
    return { bulb: bulb, onMat: farBulbM, haloMeshes: halos, cone: cone, pool: pool, off: false, isFrontLamp: false };
  }
  [[-14, 37], [-5, 37], [5, 37], [14, 37]].forEach(function(p) { streetLamps.push(makeFarLamp(p[0], p[1], -1)); });   // fundo do lote, bracos para a loja
  [[-21, 24, 1], [21, 24, 1]].forEach(function(p) { streetLamps.push(makeFarLamp(p[0], p[1], -1)); });                 // laterais, entre os pinheiros
  mergeMeshes(lampPosts, scene);   // todos os mastros -> 1 draw call

  // 8. Jeep low-poly estacionado na vaga (Alex Safayan via poly.pizza; para-brisa e vidros laterais translucidos)
  var carGrp = new THREE.Group();
  carGrp.position.set(5.10, -0.14, 15.20);
  carGrp.rotation.y = 0.28;
  scene.add(carGrp);

  // O corpo do carro fica num grupo proprio (origem no chao, no centro) para balancar com o impacto.
  var carBody = new THREE.Group();
  carGrp.add(carBody);

  // Alarme do carro: pisca-alerta com a forma e a posicao das lanternas do modelo. Coordenadas do carro (origem no
  // chao, no centro; frente em +z), medidas no jeep.glb ja escalado pelo fitModel (1.85 m de largura):
  //   farois redondos 0.19 m em (+-0.41, 1.07, 1.64); faroletes do arco 0.21 m em (+-0.27, 2.21, 0.29); setas
  //   redondas 0.08 m no para-choque (+-0.49, 0.92, 1.63); lanternas retangulares 0.12x0.08 m em (+-0.54, 1.18, -1.38).
  // Cada pisca fica ~1.5 cm a frente do vidro/lente, para nao brigar com a malha do modelo.
  var CAR_ALARM_LIGHT_SECONDS = 10, CAR_SHAKE_SECONDS = 2.2;
  var carAlarm = (function() {
    var lightT = -1, shakeT = -1, lamps = [];
    var glow = new THREE.PointLight(0xff8a1a, 0, 6, 2);
    glow.position.set(0, 1.2, 0);
    carGrp.add(glow);
    var tailLit = new THREE.Color(0xff2a1a), tailDark = new THREE.Color(0x5a0e08);         // lanternas: vermelho
    var signalLit = new THREE.Color(0xffa020), signalDark = new THREE.Color(0x7a3a08);     // setas: ambar
    var headLit = new THREE.Color(0xfff2c0), headDark = new THREE.Color(0x55554f);
    // Halo de luz: disco macio aditivo por tras de cada lanterna acesa (so aparece com ela acesa).
    var haloTex = (function() {
      var cvs = document.createElement('canvas'); cvs.width = cvs.height = 64;
      var g = cvs.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cvs);
    })();
    function lamp(geo, x, y, z, lit, dark, haloSize, haloColor) {
      var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: dark.clone(), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.y = z > 0 ? 0 : Math.PI;
      m.visible = false;
      carBody.add(m);
      var h = new THREE.Mesh(new THREE.PlaneGeometry(haloSize, haloSize), new THREE.MeshBasicMaterial({
        map: haloTex, color: haloColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      h.position.set(x, y, z + (z > 0 ? 0.03 : -0.03));
      h.rotation.y = m.rotation.y;
      h.renderOrder = 3;
      h.visible = false;
      carBody.add(h);
      lamps.push({ mesh: m, halo: h, on: false, lit: lit, dark: dark });
    }
    var headDisc = new THREE.CircleGeometry(0.095, 20), roofDisc = new THREE.CircleGeometry(0.105, 20);
    var signalDisc = new THREE.CircleGeometry(0.04, 12), tailRect = new THREE.PlaneGeometry(0.13, 0.09);
    [-1, 1].forEach(function(sx) {
      lamp(headDisc,   0.41 * sx, 1.07, 1.715, headLit, headDark, 0.75, 0xfff2c0);     // farois redondos
      lamp(roofDisc,   0.27 * sx, 2.21, 0.415, headLit, headDark, 0.62, 0xfff2c0);     // faroletes do arco de seguranca
      lamp(signalDisc, 0.49 * sx, 0.92, 1.66, signalLit, signalDark, 0.26, 0xffa020);  // setas no para-choque (ambar)
      lamp(tailRect,   0.54 * sx, 1.18, -1.395, tailLit, tailDark, 0.42, 0xff2a1a);    // lanternas traseiras (vermelho)
    });
    function setLit(lit) {
      lamps.forEach(function(l) { l.on = lit; l.mesh.material.color.copy(lit ? l.lit : l.dark); l.halo.visible = lit && l.mesh.visible; });
      glow.intensity = lit ? 1.6 : 0;
    }
    function show(v) { lamps.forEach(function(l) { l.mesh.visible = v; l.halo.visible = v && l.on; }); }
    function resetBody() { carBody.rotation.set(0, 0, 0); carBody.position.y = 0; }
    // Farois/lanternas acesos fixos (fuga do porquinho, ver entities/Pig.js): mesmas malhas do alarme + uma luz
    // a frente do carro, criada ja aqui com intensidade 0 (luz nova em tempo de jogo recompila os shaders).
    var headGlow = new THREE.PointLight(0xfff2c0, 0, 16, 2);
    headGlow.position.set(0, 0.7, 4.2);                    // a frente do carro, baixo: ilumina o asfalto a frente
    carGrp.add(headGlow);
    var tailGlow = new THREE.PointLight(0xff2a1a, 0, 7, 2);
    tailGlow.position.set(0, 1.1, -2.2);                   // brilho vermelho atras: tinge o asfalto entre o carro e a loja
    carGrp.add(tailGlow);
    // Fachos dos farois: dois holofotes para a frente, so acesos na fuga (tambem criados aqui, desligados).
    var beams = [-1, 1].map(function(sx) {
      var b = new THREE.SpotLight(0xfff2c0, 0, 30, 0.78, 0.6, 1);
      b.position.set(0.41 * sx, 1.07, 1.8);
      b.target.position.set(0.41 * sx, 0, 7);              // mira para baixo (~8 graus): um facho raso quase nao acende o chao
      carGrp.add(b); carGrp.add(b.target);
      return b;
    });
    // Poco de luz no asfalto a frente (aditivo, gradiente alongado): garante que o chao pareca iluminado mesmo com a
    // neblina e o facho em angulo raso. Filho do carro, entao acompanha a fuga.
    var pool = (function() {
      // Luz "esfumacada": nucleo gaussiano suave + nuvens de fumaca irregulares que apagam pedacos, para nao parecer
      // um disco desenhado no chao (bordas dissolvem por completo antes de chegar a borda da textura).
      var W = 128, H = 256, cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
      var g = cvs.getContext('2d');
      g.save(); g.translate(W / 2, H * 0.34); g.scale(1, 2.0);
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.48);
      for (var i = 0; i <= 12; i++) { var t = i / 12; gr.addColorStop(t, 'rgba(255,238,185,' + (0.62 * Math.exp(-t * t * 4.2) * (1 - t * t * t)).toFixed(3) + ')'); }
      g.fillStyle = gr; g.fillRect(-W / 2, -H * 0.34, W, H);
      g.restore();
      var seed = 7;
      var rnd = function() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      g.globalCompositeOperation = 'destination-out';
      for (var j = 0; j < 46; j++) {                              // puffs de fumaca apagando pedacos
        var px = W * (0.2 + 0.6 * rnd()), py = H * (0.08 + 0.8 * rnd()), pr = 8 + rnd() * 20;
        var pg = g.createRadialGradient(px, py, 0, px, py, pr);
        pg.addColorStop(0, 'rgba(0,0,0,' + (0.1 + rnd() * 0.22).toFixed(2) + ')'); pg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = pg; g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
      g.globalCompositeOperation = 'lighter';
      for (var k = 0; k < 22; k++) {                              // e puffs claros espalhando luz
        var qx = W * (0.25 + 0.5 * rnd()), qy = H * (0.12 + 0.55 * rnd()), qr = 10 + rnd() * 22;
        var qg = g.createRadialGradient(qx, qy, 0, qx, qy, qr);
        qg.addColorStop(0, 'rgba(255,235,180,' + (0.05 + rnd() * 0.07).toFixed(2) + ')'); qg.addColorStop(1, 'rgba(255,235,180,0)');
        g.fillStyle = qg; g.fillRect(qx - qr, qy - qr, qr * 2, qr * 2);
      }
      var m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 14), new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(cvs), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.02, 8.8);
      m.renderOrder = 2;
      m.visible = false;
      carBody.add(m);
      return m;
    })();
    return {
      headlights: function(on) {
        lightT = -1;
        show(on); setLit(on); glow.intensity = 0;
        headGlow.intensity = on ? 8 : 0;
        tailGlow.intensity = on ? 2.4 : 0;
        beams.forEach(function(b) { b.intensity = on ? 16 : 0; });
        pool.visible = on;
      },
      position: function(out) { return carGrp.getWorldPosition(out).setY(0.9); },
      start: function() { lightT = 0; shakeT = 0; show(true); setLit(true); },
      stop: function() { lightT = -1; shakeT = -1; setLit(false); show(false); resetBody(); },
      update: function(dt) {
        if (lightT >= 0) {
          lightT += dt;
          if (lightT >= CAR_ALARM_LIGHT_SECONDS) { lightT = -1; setLit(false); show(false); }
          else setLit(((lightT / 0.25) | 0) % 2 === 0); // 2 Hz
        }
        if (shakeT >= 0) {
          shakeT += dt;
          if (shakeT >= CAR_SHAKE_SECONDS) { shakeT = -1; resetBody(); return; }
          // suspensao amortecida: balanco lateral + cabecada + quique, ~3 Hz decaindo
          var e = Math.exp(-shakeT * 2.4), w = 6.2832 * 3.0 * shakeT;
          carBody.rotation.z = 0.05 * e * Math.sin(w);
          carBody.rotation.x = 0.03 * e * Math.sin(w + 1.3);
          carBody.position.y = 0.03 * e * Math.abs(Math.sin(w * 0.5));
        }
      }
    };
  })();

  // car: usado pela fuga do porquinho (entities/Pig.js). home = pose inicial para o resetWorld; glass = vidro lateral
  // (+x, lado do porquinho) que ele quebra, separado do resto do vidro do modelo ao carregar.
  var carInfo = { grp: carGrp, body: carBody, solid: null, glass: null, home: { x: 5.10, y: -0.14, z: 15.20, rotY: 0.28 } };

  // Separa de `mesh` os triangulos escolhidos por `pick(cx, cy, cz)` (centroide em coordenadas cruas do modelo).
  function splitTriangles(mesh, pick) {
    var g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, idx = g.index;
    var tris = (idx ? idx.count : pos.count) / 3, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    var keep = [], take = [];
    for (var t = 0; t < tris; t++) {
      var i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld); b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld); c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
      ((pick((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3)) ? take : keep).push([i0, i1, i2]);
    }
    function build(list) {
      var P = new Float32Array(list.length * 9), N = nor ? new Float32Array(list.length * 9) : null, U = uv ? new Float32Array(list.length * 6) : null;
      list.forEach(function(tri, k) {
        for (var q = 0; q < 3; q++) {
          var v = tri[q];
          P[k * 9 + q * 3] = pos.getX(v); P[k * 9 + q * 3 + 1] = pos.getY(v); P[k * 9 + q * 3 + 2] = pos.getZ(v);
          if (N) { N[k * 9 + q * 3] = nor.getX(v); N[k * 9 + q * 3 + 1] = nor.getY(v); N[k * 9 + q * 3 + 2] = nor.getZ(v); }
          if (U) { U[k * 6 + q * 2] = uv.getX(v); U[k * 6 + q * 2 + 1] = uv.getY(v); }
        }
      });
      var ng = new THREE.BufferGeometry();
      ng.setAttribute('position', new THREE.BufferAttribute(P, 3));
      if (N) ng.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      if (U) ng.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      return ng;
    }
    return { keep: build(keep), take: build(take), count: take.length };
  }

  loadModel('models/jeep.glb').then(function(carModel) {
    // o GLB traz um plano branco de chao, bem mais largo que o jeep: sai antes de medir/escalar
    var ground = [];
    carModel.traverse(function(o) { if (o.isMesh && new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).x > 1.2) ground.push(o); });
    ground.forEach(function(o) { if (o.parent) o.parent.remove(o); });
    // vidro lateral do lado do porquinho (+x): vira malha propria para sumir quando ele quebra
    carModel.updateMatrixWorld(true);
    var glassMesh = null;
    carModel.traverse(function(o) { if (!glassMesh && o.isMesh && o.material && o.material.name === 'mat24') glassMesh = o; });
    if (glassMesh) {
      var sp = splitTriangles(glassMesh, function(cx, cy) { return cx > 0.15 && cy > 0.05; });
      if (sp.count) {
        glassMesh.geometry = sp.keep;
        var pane = new THREE.Mesh(sp.take, glassMesh.material);
        pane.position.copy(glassMesh.position); pane.quaternion.copy(glassMesh.quaternion); pane.scale.copy(glassMesh.scale);
        glassMesh.parent.add(pane);
        carInfo.glass = pane;
      }
    }
    fitModel(carModel, 1.85);
    // Sem encosto nos bancos: o porquinho senta na almofada do motorista (Pig.js) e o encosto/apoio de cabeca o
    // atravessava. Triangulos do encosto saem por posicao (coordenadas do carro, o modelo ainda sem pai).
    carModel.updateMatrixWorld(true);
    var seatBacks = [];
    carModel.traverse(function(o) { if (o.isMesh) seatBacks.push(o); });
    seatBacks.forEach(function(o) {
      var sp2 = splitTriangles(o, function(cx, cy, cz) { return Math.abs(cx) <= 0.5 && cy >= 1.16 && cy <= 2.0 && cz >= -0.32 && cz <= -0.1; });
      if (sp2.count) { o.geometry.dispose(); o.geometry = sp2.keep; }
    });
    psxModel(carModel);
    // ambiente + hemisferio + poste somam >1 e estouram a pintura em branco: compensa no material
    carModel.traverse(function(o) { if (o.isMesh && o.material && o.material.color) o.material.color.multiplyScalar(0.7); });
    carBody.add(carModel);
  }).catch(function(err) {
    console.warn('Fallback: falha ao carregar jeep.glb:', err);
  });

  // Colisao do jeep: caixas orientadas (giradas como o carro), cada uma com a altura do topo daquele trecho, para
  // itens jogados pousarem no capo, no teto, na cacamba e no estepe em vez de flutuar numa caixa unica alta.
  // Medidas em coordenadas do carro: [centro z, meia-largura x, meia-profundidade z, altura do topo].
  var CAR_BOXES = [
    [0.0,   0.94, 1.88, 0.95],    // chassi e rodas (todo o comprimento)
    [1.275, 0.86, 0.575, 1.40],   // capo
    [-0.05, 0.66, 0.75, 2.0],     // cabine (teto/arco de seguranca)
    [-1.15, 0.86, 0.35, 1.28],    // cacamba traseira
    [-1.75, 0.40, 0.25, 1.78]     // estepe
  ];
  var CAR_X = 5.10, CAR_Z = 15.20, CAR_ROT = 0.28, cs = Math.cos(CAR_ROT), sn = Math.sin(CAR_ROT);
  carInfo.solids = CAR_BOXES.map(function(b) {
    // centro da caixa no mundo: o carro gira em y; x = lx*cos + lz*sin, z = -lx*sin + lz*cos (lx = 0)
    return makeObb(CAR_X + b[0] * sn, CAR_Z + b[0] * cs, b[1], b[2], CAR_ROT, b[3]);
  });
  carInfo.solid = carInfo.solids[0];
  if (ctx && ctx.solids) carInfo.solids.forEach(function(sd) { ctx.solids.push(sd); });
  carGrp.userData.dynamic = true; carBody.userData.dynamic = true;   // o carro vai embora (Pig.js: pigEscape)

  // 9. Pinheiros no horizonte
  var trunkM = new THREE.MeshLambertMaterial({ color: 0x2b1c11 });
  var foliageM = new THREE.MeshLambertMaterial({ color: 0x102417 });
  var treeParts = { trunk: [], foliage: [] };
  function makePineTree(tx, tz, h) {
    h = h || 7.5;
    var treeGrp = new THREE.Group();
    treeGrp.position.set(tx, -0.14, tz);
    scene.add(treeGrp);

    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, h * 0.35, 5), trunkM);
    trunk.position.y = h * 0.175;
    treeGrp.add(trunk);
    treeParts.trunk.push(trunk);
    var cone1 = new THREE.Mesh(new THREE.ConeGeometry(2.4, h * 0.45, 5), foliageM);
    cone1.position.y = h * 0.45;
    treeGrp.add(cone1);
    treeParts.foliage.push(cone1);
    var cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.6, h * 0.42, 5), foliageM);
    cone2.position.y = h * 0.70;
    treeGrp.add(cone2);
    treeParts.foliage.push(cone2);
  }

  // Pinheiros nas bordas do terreno, atras da calcada e das vagas
  makePineTree(-3.5, 30.5, 9.0);   // arvore do esconderijo do cliente (cena 1, ver CustomerEvent.js)
  makePineTree(-24, 12, 9.5);
  makePineTree(-27, 23, 8.0);
  makePineTree(-22, 34, 10.0);
  makePineTree(24, 11, 9.0);
  makePineTree(27, 22, 11.0);
  makePineTree(22, 33, 8.5);
  makePineTree(-9, 42, 9.5);
  makePineTree(9, 43, 10.5);
  // 9 pinheiros (27 draw calls) -> 2: troncos e copas fundidos
  mergeMeshes(treeParts.trunk, scene);
  mergeMeshes(treeParts.foliage, scene);

  // 10. Lua procedural no ceu (sempre presente; ganha a logo do canal depois do heroi, ver entities/Moon.js).
  buildMoon(scene);

  return { carAlarm: carAlarm, recycle: recycle, streetLamps: streetLamps, car: carInfo };
}
