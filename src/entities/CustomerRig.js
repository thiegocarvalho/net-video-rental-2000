import * as THREE from 'three';

// Animacao procedural do cliente (esqueleto Mixamo de character.glb).
//
// Cada osso longo e posado por DIRECAO, em coordenadas do corpo (x = esquerda do personagem, y = cima,
// z = para frente), mais uma torcao (twist) em torno do proprio eixo. Isso e muito mais facil de escrever do que
// angulos de Euler por osso: "o antebraço aponta para frente e para cima" e um vetor.
//   - torso (spine*) e pernas ficam no referencial dos quadris; cabeca e bracos no referencial do peito (spine2),
//     entao inclinar o corpo leva bracos e cabeca junto;
//   - os pes sao absolutos no mundo (ficam retos no chao);
//   - as direcoes alvo sao suavizadas (transicao entre poses, sem cortes secos).
// Os passos (gait) avancam pela DISTANCIA percorrida, entao os pes nao deslizam no chao.

var CHAIN = ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
  'leftShoulder', 'leftArm', 'leftForeArm', 'leftHand', 'rightShoulder', 'rightArm', 'rightForeArm', 'rightHand',
  'leftUpLeg', 'leftLeg', 'leftFoot', 'rightUpLeg', 'rightLeg', 'rightFoot'];
// Em que referencial cada osso posado e definido
var FRAME = {
  hips: 'world', spine: 'hips', spine1: 'hips', spine2: 'hips',
  neck: 'spine2', head: 'spine2',
  leftArm: 'spine2', leftForeArm: 'spine2', rightArm: 'spine2', rightForeArm: 'spine2',
  leftUpLeg: 'hips', leftLeg: 'hips', rightUpLeg: 'hips', rightLeg: 'hips',
  leftFoot: 'world', rightFoot: 'world'
};

var TAU = Math.PI * 2;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Direcao de um membro pendurado: (fwd, out) a partir de "reto para baixo". side = +1 esquerdo, -1 direito.
// out = afastar para o lado (PI/2 = horizontal, > PI/2 = acima da horizontal); fwd = girar para frente.
function limbVec(out3, side, fwd, out) {
  return out3.set(side * Math.sin(out), -Math.cos(out) * Math.cos(fwd), Math.cos(out) * Math.sin(fwd));
}
// Direcao de um eixo "para cima": inclinado para frente (lean) e para o lado esquerdo (side).
function upVec(out3, lean, side) {
  return out3.set(Math.sin(side), Math.cos(side) * Math.cos(lean), Math.cos(side) * Math.sin(lean)).normalize();
}

export function createRig(bones, group, modelScale) {
  var rest = {}, cur = {}, tgt = {}, i, k;
  var groupInv = new THREE.Quaternion();
  var q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qt = new THREE.Quaternion(), qw = new THREE.Quaternion(), qp = new THREE.Quaternion();
  var v = new THREE.Vector3(), v2 = new THREE.Vector3();
  var delta = { hips: new THREE.Quaternion(), spine2: new THREE.Quaternion() };
  var hipsBase = bones.hips ? bones.hips.position.clone() : new THREE.Vector3();
  var inv = 1 / (modelScale || 1);

  group.updateMatrixWorld(true);
  for (i = 0; i < CHAIN.length; i++) {
    k = CHAIN[i];
    var b = bones[k];
    if (!b) continue;
    var W0 = new THREE.Quaternion();
    b.getWorldQuaternion(W0);
    var dir = new THREE.Vector3(0, 1, 0).applyQuaternion(W0).normalize();
    rest[k] = { W0: W0, W0inv: W0.clone().invert(), dir: dir, local: b.quaternion.clone() };
    cur[k] = { d: dir.clone(), t: 0 };
    tgt[k] = { d: dir.clone(), t: 0, on: false };
  }

  var gait = 0;                                  // fase do passo (radianos)
  var poseName = 'IDLE', time = 0, hipsOff = { x: 0, y: 0, z: 0 };
  var ctx = { lookYaw: 0, lookPitch: 0, k: 1 };
  var blendT = 0, snapNext = false;

  // ---------- auxiliares de escrita das poses ----------
  function set(k, x, y, z, twist) { var t = tgt[k]; if (!t) return; t.d.set(x, y, z).normalize(); t.t = twist || 0; t.on = true; }
  function limb(k, side, fwd, out, twist) { var t = tgt[k]; if (!t) return; limbVec(t.d, side, fwd, out); t.t = twist || 0; t.on = true; }
  // Torso inteiro: lean (frente +), side (esquerda +), twist (virar para a esquerda +). Distribui pelos 3 ossos.
  function torso(lean, side, twist) {
    var parts = [['spine', 0.4], ['spine1', 0.75], ['spine2', 1.0]];
    for (var p = 0; p < 3; p++) {
      var t = tgt[parts[p][0]]; if (!t) continue;
      upVec(t.d, lean * parts[p][1], side * parts[p][1]); t.t = twist * parts[p][1]; t.on = true;
    }
  }
  // Cabeca: inclinar para frente (+), para o lado (+ esquerda), virar (+ esquerda), mais o olhar para o jogador.
  function head(lean, side, twist, lookW) {
    lookW = lookW === undefined ? 1 : lookW;
    var y = ctx.lookYaw * lookW, p = ctx.lookPitch * lookW;
    var t = tgt.neck;
    if (t) { upVec(t.d, lean * 0.4 - p * 0.3, side * 0.4); t.t = twist * 0.4 + y * 0.35; t.on = true; }
    t = tgt.head;
    if (t) { upVec(t.d, lean * 0.7 - p * 0.7, side * 0.8); t.t = twist * 0.7 + y * 0.65; t.on = true; }
  }
  function arm(side, fwd, out, elbowFwd, elbowOut) {
    var s = side > 0 ? 'left' : 'right';
    limb(s + 'Arm', side, fwd, out);
    limb(s + 'ForeArm', side, elbowFwd, elbowOut === undefined ? out * 0.6 : elbowOut);
  }
  // Perna: coxa balanca para frente (fwd), joelho dobra (knee >= 0), afasta lateral (spread)
  function leg(side, fwd, knee, spread) {
    var s = side > 0 ? 'left' : 'right';
    limb(s + 'UpLeg', side, fwd, spread);
    limb(s + 'Leg', side, fwd - knee, spread);
  }
  function feet(pitch) {                         // mantem os pes retos no chao; pitch = ponta para baixo
    var names = ['leftFoot', 'rightFoot'];
    for (var f = 0; f < 2; f++) {
      var t = tgt[names[f]], r = rest[names[f]]; if (!t || !r) continue;
      t.d.copy(r.dir);
      if (pitch) { t.d.y -= Math.sin(pitch) * 0.6; t.d.normalize(); }
      t.t = 0; t.on = true;
    }
  }

  // ---------- poses ----------
  function standing(t, o) {
    o = o || {};
    var breath = Math.sin(t * 1.7) * 0.012, sway = Math.sin(t * 0.7) * 0.02;
    torso((o.lean || 0.03) + breath, (o.side || 0) + sway, o.twist || 0);
    head(o.headLean === undefined ? -0.02 : o.headLean, o.headSide || 0, 0, o.look);
    arm(1, 0.06, 0.16, 0.30, 0.12);
    arm(-1, 0.06, 0.16, 0.30, 0.12);
    leg(1, 0.02, 0.03, 0.06);
    leg(-1, -0.02, 0.03, 0.06);
    feet(0);
    hipsOff.y = -Math.abs(breath) * 0.2;
  }

  var POSES = {
    IDLE: function(t) { standing(t); },
    STARE: function(t) {                         // parado, olhando fixo; cabeca levemente inclinada
      standing(t, { lean: -0.02, headSide: 0.18, headLean: 0.05, side: 0 });
    },
    // Espiando de tras do tronco (o tronco fica a frente dele). ctx.k = quanto espia: 0 = encolhido atras do
    // tronco, 1 = tronco e cabeca inclinados para fora pela esquerda. CustomerEvent anima k com easing e desloca o
    // grupo de lado junto; a cabeca sempre acompanha o jogador.
    PEEK_TREE: function(t) {
      // Movimento secundario continuo: respiracao, oscilacao lenta do peso e micro-giros da cabeca em
      // frequencias diferentes. Sem isso a pose congela e parece travada, que e o pior efeito possivel
      // para alguem que esta espiando.
      var k = ctx.k;
      var br = Math.sin(t * 1.35) * 0.022;                           // respiracao
      var sway = Math.sin(t * 0.43) * 0.030 + Math.sin(t * 0.71) * 0.014;   // peso indo e voltando
      var creep = Math.sin(t * 0.27) * 0.05 * k;                     // o corpo avanca e recua de leve na espiada
      torso(0.10 + 0.04 * k + br, 0.42 * k + sway + creep, 0.12 * k + Math.sin(t * 0.33) * 0.03);
      head(0.05 - 0.04 * k + Math.sin(t * 0.91) * 0.02, -0.16 * k + Math.sin(t * 0.58) * 0.025, 0, 1);
      // mao esquerda apoiada na beirada do tronco: cotovelo para fora, antebraco para frente e para dentro
      // (k baixo: braco recolhido junto ao corpo, nada aparece pela beirada)
      arm(1, 0.1 + 0.15 * k + br * 0.5, 0.12 + 0.48 * k, 0.4 + 1.6 * k, -0.1 - 0.4 * k);
      arm(-1, 0.06, 0.05 + 0.06 * k, 0.4 + br, 0.02);  // braco de dentro rente ao corpo (fica atras do tronco)
      leg(1, 0.03, 0.06, 0.06 + 0.16 * k);       // perna de fora abre para o lado
      leg(-1, -0.03, 0.05 + 0.08 * k, 0.05);
      feet(0);
      hipsOff.x = sway * 0.5;
      hipsOff.y = -Math.abs(br) * 0.25;
    },
    LEAN_CAR: function(t) {                      // ao lado do carro: peso numa perna, mao no quadril, cabeca inclinada
      var s = Math.sin(t * 0.8) * 0.015;
      torso(-0.04 + s, -0.08, -0.10);
      head(0.04, 0.12, 0.1, 1);
      arm(1, 0.05, 0.20, 0.25, 0.15);
      arm(-1, 0.0, 0.62, 0.0, 0.05);             // mao no quadril (cotovelo para fora)
      limb('rightForeArm', -1, 0.9, 0.05);
      leg(1, 0.02, 0.02, 0.08);
      leg(-1, 0.05, 0.22, 0.14);
      feet(0);
    },
    // Agachado atras do carro, espiando por cima/pela lateral. ctx.k = quanto aparece: 0 = encolhido
    // (so o alto da cabeca), 1 = tronco e cabeca inclinados para fora. Agachamento sempre ligado: coxa quase
    // horizontal, canela em pe, quadris baixos (os pes ficam retos no chao por feet()).
    CROUCH_PEEK: function(t) {
      // Agachado atras do carro: os pes NAO saem do lugar. Quem espia e o tronco, que se inclina forte para a
      // lateral levando a cabeca para fora da lataria, e volta. k = 0 recolhido atras do carro, k = 1 inclinado.
      var k = ctx.k;
      var br = Math.sin(t * 2.1) * 0.016;                            // respiracao curta de quem esta tenso
      var sway = Math.sin(t * 0.47) * 0.022 + Math.sin(t * 0.79) * 0.011;
      var creep = Math.sin(t * 0.31) * 0.04 * k;
      // joelhos juntos a frente, tronco por cima deles. Joelho aberto demais vira pose comica.
      torso(0.40 + br + 0.05 * k, 0.78 * k + sway + creep, 0.16 * k);
      head(-0.20 - 0.06 * k + Math.sin(t * 0.87) * 0.02, 0.10 * k + Math.sin(t * 0.61) * 0.02, 0, 1);
      // antebracos apoiados nos joelhos; o de fora acompanha a inclinacao da espiada
      arm(1, 0.72 + 0.26 * k, 0.06 + 0.20 * k, 1.55, 0.02);
      arm(-1, 0.70, 0.05, 1.60 + br, 0.02);
      leg(1, 1.24, 1.52, 0.11);
      leg(-1, 1.20, 1.56, 0.10);
      feet(0);
      hipsOff.x = 0.22 * k + sway * 0.4;                             // transferencia de peso, nao passo
      hipsOff.y = -0.42 + br * 0.3 + 0.04 * k;
      hipsOff.z = -0.06;
    },
    SHOW_TAPE: function(t) {                     // mostra a fita para o jogador
      var s = Math.sin(t * 1.3);
      torso(0.10 + s * 0.01, 0.0, 0.0);
      head(0.12, 0.05, 0, 1);
      arm(-1, 0.85, 0.28, 1.75, 0.10);           // braco direito esticado com a fita para frente
      arm(1, 0.04, 0.12, 0.3, 0.1);
      leg(1, 0.03, 0.04, 0.07);
      leg(-1, -0.03, 0.04, 0.07);
      feet(0);
    },
    WALK: function(t) { walkCycle(0.5, 0.35, 0.10, 0.20, 0.18, 0.5); },
    RUN: function(t) { walkCycle(1.15, 1.55, 0.42, 0.40, 0.56, 1.0); },
    LUNGE: function(t) {                         // bote final (jumpscare): braços para frente
      torso(0.5, 0, 0);
      head(0.25, 0, 0, 0.6);
      arm(1, 1.45, 0.12, 1.5, 0.10);
      arm(-1, 1.45, 0.12, 1.5, 0.10);
      leg(1, 0.55, 0.9, 0.08);
      leg(-1, -0.45, 0.25, 0.08);
      feet(0);
    },
    HERO_ARMS_UP: function(t) {
      var s = Math.sin(t * 1.4) * 0.03;
      torso(-0.06, 0, 0);
      head(-0.12, 0, 0, 0.5);
      arm(1, 0.15 + s, 2.55, 0.15 + s, 2.7);
      arm(-1, 0.15 - s, 2.55, 0.15 - s, 2.7);
      leg(1, 0.0, 0.0, 0.14);
      leg(-1, 0.0, 0.0, 0.14);
      feet(0);
    },
    HERO_STAND: function(t) {                    // pose firme, peito aberto, um punho no peito
      torso(-0.08, 0, 0.10);
      head(-0.08, 0.05, 0, 0.5);
      arm(1, 0.0, 0.24, 0.0, 0.2);
      arm(-1, 0.55, 0.3, 2.1, 0.0);
      leg(1, 0.02, 0.02, 0.12);
      leg(-1, -0.02, 0.02, 0.12);
      feet(0);
    },
    HERO_WAVE: function(t) {
      var w = Math.sin(t * 7) * 0.25;
      torso(-0.05, 0, 0.05);
      head(-0.05, 0.1, 0, 0.5);
      arm(-1, 0.1, 2.35, 0.1, 2.3 + w);          // braco direito acenando acima da cabeca
      arm(1, 0.04, 0.2, 0.2, 0.1);
      leg(1, 0.0, 0.0, 0.12);
      leg(-1, 0.0, 0.0, 0.12);
      feet(0);
    }
  };

  // Ciclo de caminhada/corrida preso a fase `gait`. A = amplitude da coxa, K = dobra do joelho, B = balanco do braço.
  function walkCycle(A, K, B, twistAmt, leanAmt, bobScale) {
    var s = Math.sin(gait), c = Math.cos(gait);
    var lean = leanAmt, side = 0;
    torso(lean, side + s * 0.02, -s * twistAmt * 0.6);
    head(-lean * 0.7, 0, s * twistAmt * 0.25, 0.7);
    // pernas: a esquerda balanca para frente quando sin > 0
    leg(1, A * s, K * Math.max(0, c) + 0.10 * bobScale, 0.05);
    leg(-1, -A * s, K * Math.max(0, -c) + 0.10 * bobScale, 0.05);
    feet(0);
    var running = bobScale > 0.8;
    // bracos opostos as pernas; cotovelo mais dobrado na corrida
    var eb = running ? 1.45 : 0.45;
    arm(1, -B * 2.2 * s, 0.14, -B * 2.2 * s + eb * (0.7 + 0.3 * Math.max(0, -s)), 0.12);
    arm(-1, B * 2.2 * s, 0.14, B * 2.2 * s + eb * (0.7 + 0.3 * Math.max(0, s)), 0.12);
    // na corrida a canela da perna de tras dobra forte logo depois que o pe sai do chao (calcanhar sobe ate o
    // quadril) e o corpo tem fase de voo: o quadril sobe duas vezes por passada, mais alto que na caminhada.
    if (running) {
      var kickL = Math.max(0, -c), kickR = Math.max(0, c);
      limb('leftLeg', 1, A * s - (K * Math.max(0, c) + 0.10 * bobScale) - 0.95 * kickL * kickL, 0.05);
      limb('rightLeg', -1, -A * s - (K * Math.max(0, -c) + 0.10 * bobScale) - 0.95 * kickR * kickR, 0.05);
      hipsOff.y = Math.cos(2 * gait) * 0.055 - 0.03;
    } else {
      hipsOff.y = Math.cos(2 * gait) * 0.03 * bobScale - 0.01;
    }
    hipsOff.x = 0;
  }

  // ---------- atualizacao ----------
  function frameDelta(name, out) {
    var b = bones[name];
    b.getWorldQuaternion(out).premultiply(groupInv).multiply(rest[name].W0inv);
    return out;
  }

  function solveBone(k, dModel, twist) {
    var b = bones[k], r = rest[k];
    qa.setFromUnitVectors(r.dir, dModel);
    if (twist) { qt.setFromAxisAngle(dModel, twist); qa.premultiply(qt); }
    qw.copy(qa).multiply(r.W0);
    b.parent.updateWorldMatrix(true, false);
    b.parent.getWorldQuaternion(qp).premultiply(groupInv).invert();
    b.quaternion.copy(qp).multiply(qw);
    b.updateWorldMatrix(false, false);
  }

  // dt em segundos. poseName escolhe a pose; ctx.look* vem do jogador; k = intensidade da pose (0..1, padrao 1;
  // hoje so a PEEK_TREE usa). Retorna nada.
  function update(dt, name, lookYaw, lookPitch, k) {
    if (!bones.hips) return;
    time += dt;
    ctx.lookYaw = clamp(lookYaw || 0, -1.15, 1.15);
    ctx.lookPitch = clamp(lookPitch || 0, -0.5, 0.5);
    ctx.k = k === undefined ? 1 : clamp(k, 0, 1);
    if (name !== poseName) { poseName = name; blendT = 0; }
    blendT += dt;
    for (i = 0; i < CHAIN.length; i++) { if (tgt[CHAIN[i]]) tgt[CHAIN[i]].on = false; }
    hipsOff.x = hipsOff.y = hipsOff.z = 0;
    (POSES[poseName] || POSES.IDLE)(time);

    group.updateMatrixWorld(true);
    group.getWorldQuaternion(groupInv).invert();
    // suavizacao das direcoes; logo depois de trocar de pose a taxa sobe aos poucos (sai da pose anterior sem estalo)
    var rate = (poseName === 'WALK' || poseName === 'RUN' ? 16 : 7) * Math.min(1, 0.3 + blendT / 0.5);
    var f = snapNext ? 1 : 1 - Math.exp(-dt * rate);
    snapNext = false;

    // quadris: posicao (balanco/altura) e orientacao reta
    bones.hips.position.set(hipsBase.x + hipsOff.x * inv, hipsBase.y + hipsOff.y * inv, hipsBase.z + hipsOff.z * inv);
    bones.hips.quaternion.copy(rest.hips.local);
    bones.hips.updateWorldMatrix(false, true);
    frameDelta('hips', delta.hips);

    for (i = 1; i < CHAIN.length; i++) {
      k = CHAIN[i];
      var b = bones[k], T = tgt[k], C = cur[k], R = rest[k];
      if (!b || !R) continue;
      if (!T.on) {
        // sem alvo: segue o pai (volta a pose de repouso local)
        b.quaternion.copy(R.local);
        b.updateWorldMatrix(false, false);
        if (k === 'spine2') frameDelta('spine2', delta.spine2);
        continue;
      }
      // suaviza a direcao e a torcao
      C.d.lerp(T.d, f).normalize();
      C.t += (T.t - C.t) * f;
      // direcao no referencial do corpo -> modelo
      v.copy(C.d);
      var fr = FRAME[k];
      if (fr === 'hips') v.applyQuaternion(delta.hips);
      else if (fr === 'spine2') v.applyQuaternion(delta.spine2);
      var tw = C.t;
      solveBone(k, v, tw);
      if (k === 'spine2') frameDelta('spine2', delta.spine2);
    }
  }

  return {
    update: update,
    advanceGait: function(dist, running) { gait = (gait + dist / (running ? 3.4 : 1.55) * TAU) % (TAU * 100); },
    resetGait: function() { gait = 0; },
    snap: function() { snapNext = true; },     // o proximo update vai direto a pose (personagem acabou de aparecer)
    poses: Object.keys(POSES),
    rest: rest
  };
}
