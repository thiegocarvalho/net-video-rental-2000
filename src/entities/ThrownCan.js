import * as THREE from 'three';
import { loadModel, fitModel } from '../graphics/Engine.js';
import { psxModel } from '../scenes/interior/shared.js';
import { blinkState } from '../core/Blink.js';
import { onWorldReset } from '../core/World.js';
import { inside, bounceOff } from '../core/Collision.js';

// Latas jogadas pelo jogador: voam, quicam, e ou caem na lixeira (somem lá dentro) ou
// ficam no chão e somem piscando 3 vezes.
var MAX_STEP = 0.012;
var CONTACT = 0.05;   // raio de contato do item com uma superficie (centro a esta altura = tocando)
// Altura da superficie do chao: salao e calcada em 0.0; estacionamento (asfalto) em -0.15.
function floorAt(z) { return z < 9.3 ? 0 : -0.15; }
var GRAVITY = 9.8, REST_WAIT = 1.2, MAX_CANS = 6;
var ROOM = { x1: -2.55, x2: 2.55, z1: -2.0, z2: 6.05 };

var proto = null;
loadModel('models/soda_can.glb').then(function(m) {
  fitModel(m, 0.08);
  psxModel(m);
  proto = m;
}).catch(function(err) { console.warn('Falha ao carregar soda_can.glb (lata jogada):', err); });

var cans = [];
var TAPE_THICK = 0.045, BIN_FLOOR = 0.06;   // espessura da fita deitada / fundo da lixeira

// Fitas jogadas: sao as proprias malhas da prateleira. Nao somem: ficam onde caem
// (chao ou empilhadas dentro da lixeira, que tem capacidade limitada).
export function throwTape(mesh, origin, dir, scene) {
  mesh.visible = true;
  mesh.position.copy(origin);
  mesh.rotation.order = 'XYZ';
  cans.push({
    mesh: mesh, scene: scene, kind: 'tape', state: 'fly', restT: 0, inBin: false,
    vx: dir.x * 5.5, vy: dir.y * 5.5 + 1.4, vz: dir.z * 5.5,
    spin: 7 + Math.random() * 3
  });
}

// Caixas de papelao (entities/Cardboard.js): como a fita, nao somem sozinhas; a lixeira comum as rejeita
// (quicam para fora) e a caixa azul de reciclagem (env.recycle) as engole enquanto aceitar.
// mesh = grupo com origem no centro da caixa; halfH = meia altura (para assentar no chao).
export function throwBox(mesh, origin, dir, scene, halfH, speed) {
  var sp = speed == null ? 4.6 : speed;
  mesh.visible = true;
  mesh.position.copy(origin);
  mesh.rotation.order = 'XYZ';
  cans.push({
    mesh: mesh, scene: scene, kind: 'box', state: 'fly', restT: 0, halfH: halfH || 0.06,
    vx: dir.x * sp, vy: dir.y * sp + (speed == null ? 1.2 : 0), vz: dir.z * sp,
    spin: speed == null ? 5 + Math.random() * 3 : 1.5
  });
}

// Itens genericos (shotgun, entities/Shotgun.js): como a caixa, quicam para fora das lixeiras e nunca somem
// sozinhos; opts.onRest(mesh) avisa quando assentam (quem chama decide se pisca e some).
export function throwItem(mesh, origin, dir, scene, halfH, speed, opts) {
  var sp = speed == null ? 4.6 : speed;
  mesh.visible = true;
  mesh.position.copy(origin);
  mesh.rotation.order = 'XYZ';
  releaseTape(mesh, NO_PILE);
  cans.push({
    mesh: mesh, scene: scene, kind: 'item', state: 'fly', restT: 0, halfH: halfH || 0.05,
    vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp, spin: (opts && opts.spin) || 2.5,
    onRest: opts && opts.onRest
  });
}
var NO_PILE = { pile: 0 };

// Impulso de um tiro (entities/Shotgun.js): o item (fita/caixa/lata/item) volta a voar com a velocidade `vel`.
// Se ainda nao estava na fisica (fita na prateleira), entra como `kind`. bin = binInfo (pilha de fitas).
export function kickItem(mesh, kind, vel, scene, bin, halfH) {
  var c = null;
  for (var i = 0; i < cans.length; i++) if (cans[i].mesh === mesh) { c = cans[i]; break; }
  if (!c) {
    c = { mesh: mesh, scene: scene, kind: kind, state: 'fly', restT: 0, inBin: false, halfH: halfH || 0.06, vx: 0, vy: 0, vz: 0, spin: 0 };
    mesh.rotation.order = 'XYZ';
    cans.push(c);
  }
  if (c.inBin) { c.inBin = false; if (bin && bin.pile > 0) bin.pile--; c.mesh.position.y += 0.3; }
  if (c.state === 'rest' || c.state === 'bin') c.mesh.rotation.order = 'XYZ';
  if (c.state !== 'recycle') c.state = 'fly';
  c.restT = 0;
  c.mesh.visible = true;
  c.vx = vel.x; c.vy = vel.y; c.vz = vel.z;
  c.spin = 8 + Math.random() * 6;
  c.mesh.position.y += 0.02;   // descola da superficie para nao assentar no mesmo passo
  return true;
}

// Item da fisica cuja malha e `obj` ou um ancestral dele (ou null).
export function physicsItemOf(obj) {
  for (var o = obj; o; o = o.parent) {
    for (var i = 0; i < cans.length; i++) if (cans[i].mesh === o) return cans[i];
  }
  return null;
}

// Chamado ao pegar uma fita/caixa do chao/lixeira: ela deixa de ser controlada pela fisica.
export function releaseTape(mesh, bin) {
  for (var i = 0; i < cans.length; i++) {
    if (cans[i].mesh === mesh) {
      if (cans[i].inBin && bin.pile > 0) bin.pile--;
      cans.splice(i, 1);
      return;
    }
  }
}

export function throwCan(scene, origin, dir) {
  if (!proto) return false;
  var mesh = proto.clone();
  mesh.position.copy(origin);
  mesh.userData.dynamic = true;
  scene.add(mesh);
  if (cans.length >= MAX_CANS) removeCan(cans[0], scene);
  cans.push({
    mesh: mesh, scene: scene, state: 'fly', restT: 0,
    vx: dir.x * 6.5, vy: dir.y * 6.5 + 1.6, vz: dir.z * 6.5,
    spin: 9 + Math.random() * 4
  });
  return true;
}

function removeCan(c, scene) {
  c.dead = true;
  scene.remove(c.mesh);
  var i = cans.indexOf(c);
  if (i >= 0) cans.splice(i, 1);
}

// env: { solids, bin: {x,z,topY,r}, doorOpen(), onFloor(), onBin() }
export function updateCans(dt, env) {
  var steps = Math.max(1, Math.ceil(dt / MAX_STEP)), h = dt / steps;   // passos curtos: nada atravessa coisas finas
  for (var i = cans.length - 1; i >= 0; i--) {
    var c = cans[i], m = c.mesh;

    if (c.state === 'rest') {
      if (c.kind === 'tape' || c.kind === 'box' || c.kind === 'item') continue;
      c.restT += dt;
      if (c.restT > REST_WAIT) {
        var b = blinkState(c.restT - REST_WAIT);
        if (b === 2) { removeCan(c, c.scene); continue; }
        m.visible = b === 1;
      }
      continue;
    }
    for (var k = 0; k < steps && !c.dead && c.state !== 'rest'; k++) stepFlight(c, h, env);
  }
}

function stepFlight(c, dt, env) {
  var m = c.mesh, p = m.position;
  var px = p.x, py = p.y, pz = p.z;
  c.vy -= GRAVITY * dt;
  p.x += c.vx * dt; p.y += c.vy * dt; p.z += c.vz * dt;
  m.rotation.x += c.spin * dt;

  var isBox = c.kind === 'box' || c.kind === 'item';   // item generico (shotgun): rejeitado pelas lixeiras como a caixa
  var bin = env.bin, dx = p.x - bin.x, dz = p.z - bin.z;
  var overBin = bin.active !== false && dx * dx + dz * dz < bin.r * bin.r;
  var rbins = env.recycle ? env.recycle.bins : null;

  if (c.state === 'recycle') {             // caiu numa caixa de reciclagem: afunda puxado para o centro e e consumido
    var cb = c.bin;
    c.vx = (cb.x - p.x) * 4; c.vz = (cb.z - p.z) * 4;
    if (p.y < cb.topY - 0.35) { finishRecycle(c, env); }
    return;
  }
  if (isBox) {
    // caixas de reciclagem: entra pela boca enquanto ela aceitar; ocupada, devolve (quica para fora)
    if (rbins && c.vy < 0) {
      for (var bi = 0; bi < rbins.length; bi++) {
        var rc = rbins[bi];
        if (p.y > rc.topY + CONTACT || p.y <= rc.topY - 0.3) continue;
        var rdx = p.x - rc.x, rdz = p.z - rc.z;
        if (rdx * rdx + rdz * rdz >= rc.r * rc.r) continue;
        if (c.kind === 'box' && env.recycleAccepts && env.recycleAccepts(rc)) {
          c.state = 'recycle'; c.bin = rc; c.vx *= 0.2; c.vz *= 0.2; c.vy = Math.min(c.vy, -0.5);
          return;
        }
        rejectBounce(c, p, rc.x, rc.z, rc.topY, rc.out, env);
        return;
      }
    }
    // lixeira comum: papelao nao entra, quica para fora (sem empilhar dentro)
    if (overBin && c.vy < 0 && p.y <= bin.topY + CONTACT && p.y > bin.topY - 0.3) {
      rejectBounce(c, p, bin.x, bin.z, bin.topY, null, env);
      return;
    }
    overBin = false;
  }
  var binFull = c.kind === 'tape' && bin.pile >= Math.floor((bin.topY - 0.31 - BIN_FLOOR) / TAPE_THICK);

  if (c.state === 'bin') {
    // dentro da lixeira: puxa para o centro
    c.vx = -dx * 4; c.vz = -dz * 4;
    if (c.kind === 'tape') {
      var bottom = BIN_FLOOR + bin.pile * TAPE_THICK + TAPE_THICK / 2;
      if (p.y <= bottom) {   // pousa empilhada
        p.y = bottom; c.vx = c.vy = c.vz = 0;
        p.x = bin.x + (Math.random() - 0.5) * 0.08; p.z = bin.z + (Math.random() - 0.5) * 0.08;
        m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, Math.random() * 6.28, 0);
        c.state = 'rest'; c.inBin = true; bin.pile++;
        env.onBin(c.kind);
      }
    } else if (p.y < bin.topY - 0.4) { removeCan(c, c.scene); env.onBin(c.kind); }
    return;
  }
  if (overBin && !binFull && c.vy < 0 && p.y <= bin.topY && p.y > bin.topY - 0.3) {
    c.state = 'bin'; c.vx *= 0.2; c.vz *= 0.2;
    return;
  }

  // paredes: dentro da loja ficam os limites do salao; a fachada (z 6.05..6.3) so deixa passar pela
  // abertura da porta explodida. Fora da loja o terreno e livre (ate o limite do jogador).
  var open = env.doorOpen() && Math.abs(p.x) < 0.8;
  if (p.z <= 6.05) {
    if (p.x < ROOM.x1 || p.x > ROOM.x2) { p.x = px; c.vx *= -0.4; }
    if (p.z < ROOM.z1) { p.z = pz; c.vz *= -0.4; }
  } else if (Math.abs(p.x) > 17.5) { p.x = px; c.vx *= -0.4; }
  if (p.z > ROOM.z2 && p.z < 6.3 && !open) { p.z = pz; c.vz *= -0.4; }

  // moveis: cada solido tem a altura do topo (h) e, nos adereços, a base (y0). De lado o item
  // ricocheteia; vindo de cima ele POUSA no topo (balcao, caixas, TV...). A lixeira so bloqueia
  // abaixo da boca: por cima o item passa.
  for (var s = 0; s < env.solids.length; s++) {
    var r = env.solids[s], top = r.h || 2.0, topC = top + CONTACT;
    if (p.y >= topC || p.y < (r.y0 || 0) || p.x <= r.x1 || p.x >= r.x2 || p.z <= r.z1 || p.z >= r.z2) continue;
    if (!inside(r, p.x, p.z)) continue;                 // dentro do AABB mas fora da caixa girada
    var isBinSolid = bin.x > r.x1 && bin.x < r.x2 && bin.z > r.z1 && bin.z < r.z2;
    if (isBinSolid && !isBox) { if (p.y > bin.topY) continue; }
    else if (py >= topC) {                              // veio de cima: pousa no topo
      if (isBox && (isBinSolid || r.mouth)) {           // caixa na borda da lixeira/caixa azul: quica para fora
        rejectBounce(c, p, isBinSolid ? bin.x : r.bin.x, isBinSolid ? bin.z : r.bin.z, top, r.mouth ? r.bin.out : null, env);
        return;
      }
      p.y = topC; settle(c, top, env);
      return;
    }
    bounceOff(r, c, p, px, pz, 0.4);
    c.spin *= 0.7; env.onFloor();
    break;
  }

  // teto da loja
  if (p.y > 4.0 && p.z < 6.1) { p.y = 4.0; c.vy = -Math.abs(c.vy) * 0.3; }

  var floorY = floorAt(p.z);
  if (p.y <= floorY + CONTACT) { p.y = floorY + CONTACT; settle(c, floorY, env); }
}

// Item tocou uma superficie horizontal em `y` (chao ou topo de um movel): quica ou, se lento, assenta.
function settle(c, y, env) {
  var m = c.mesh, p = m.position;
  if (Math.abs(c.vy) > 1.2) {
    c.vy *= -0.35; c.vx *= 0.6; c.vz *= 0.6; c.spin *= 0.6;
    env.onFloor();
    return;
  }
  c.state = 'rest'; c.restT = 0; c.vx = c.vy = c.vz = 0;
  if (c.kind === 'box' || c.kind === 'item') {    // caixa assentada de pe / item deitado, girado ao acaso
    m.rotation.order = 'XYZ'; m.rotation.set(0, Math.random() * 6.28, 0);
    p.y = y + c.halfH + 0.002;
    if (env.onBoxRest) env.onBoxRest(m);
    if (c.onRest) c.onRest(m);
  } else if (c.kind === 'tape') {   // fita deitada, frente para cima, apoiada na superficie
    m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, Math.random() * 6.28, 0);
    p.y = y + TAPE_THICK / 2 + 0.002;
  } else {
    m.rotation.set(0, m.rotation.y, Math.PI / 2); // lata deitada: o raio dela e 0.035
    p.y = y + 0.037;
  }
}

// Papelao rejeitado: sobe de novo e e empurrado para fora da boca (direcao `out` {x,z} se dada, senao radial).
function rejectBounce(c, p, cx, cz, topY, out, env) {
  var nx = p.x - cx, nz = p.z - cz, L = Math.sqrt(nx * nx + nz * nz);
  if (out) { nx = out.x; nz = out.z; } else if (L < 1e-3) { nx = 0; nz = 1; } else { nx /= L; nz /= L; }
  p.y = topY + CONTACT + 0.02;
  c.vy = 2.6; c.vx = nx * 1.7; c.vz = nz * 1.7; c.spin = 6;
  if (env.onReject) env.onReject(c.kind); else env.onFloor();
}

function finishRecycle(c, env) {
  c.dead = true;
  c.mesh.visible = false;
  var i = cans.indexOf(c);
  if (i >= 0) cans.splice(i, 1);
  if (env.onRecycle) env.onRecycle(c.mesh, c.bin);
}

// A lixeira quebrou: as fitas empilhadas la dentro sao lancadas para cima e para os lados.
export function ejectBinTapes(bin) {
  var n = 0;
  for (var i = 0; i < cans.length; i++) {
    var c = cans[i];
    if (c.kind !== 'tape' || !c.inBin) continue;
    var a = Math.random() * Math.PI * 2, sp = 1.4 + Math.random() * 1.8;
    c.inBin = false; c.state = 'fly'; c.restT = 0;
    c.mesh.rotation.order = 'XYZ';
    c.vx = Math.cos(a) * sp; c.vz = Math.sin(a) * sp; c.vy = 3.4 + Math.random() * 1.8;
    c.spin = 6 + Math.random() * 5;
    c.mesh.position.y += 0.35;
    n++;
  }
  bin.pile = 0;
  return n;
}

// resetWorld(): latas somem; as fitas jogadas so deixam de ser controladas pela fisica
// (quem as devolve a prateleira e o resetter das fitas em main.js).
onWorldReset(function() {
  for (var i = cans.length - 1; i >= 0; i--) {
    var c = cans[i];
    c.dead = true;
    if (!c.kind) c.scene.remove(c.mesh);   // clone da lata: compartilha geometria/material com o proto (fitas/caixas: resetters proprios)
  }
  cans.length = 0;
}, -20);
