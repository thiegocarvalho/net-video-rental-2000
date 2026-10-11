import * as THREE from 'three';
import { loadModel } from '../graphics/Engine.js';
import { psxModel } from '../scenes/interior/shared.js';
import { fireworkLaunchSound, fireworkBangSound } from '../core/Audio.js';
import { distanceGain } from '../core/AudioMix.js';
import { t } from '../i18n/index.js';

// Fogos de artificio do final do heroi (FINAL_GAME_DESIGN §8).
//
// Foguete: models/firework.glb (Josh Graham, CC-BY 3.0; credito no fim da aba CREDITOS, ver TXT.credit).
// O modelo vem inclinado: o eixo principal (PCA dos vertices) e alinhado ao +Y e a ponta branca fica para cima.
// Ganha um pouco de emissivo para nao sumir no escuro. Sem o modelo (falha de rede) entra um foguete simples
// (cilindro + cone). Pool fixo de foguetes (clones que compartilham geometria/material).
//
// Rastro e explosoes: particulas aditivas num pool unico (um BufferGeometry + um PointsMaterial compartilhados);
// o foguete da lua usa um segundo pool com pontos maiores (continua visivel a 60 m). Clarões = sprites aditivos.
// Nada e criado durante a cena (sem alocacao por quadro, sem recompilar shaders).

export var TXT = {
  credit: {
    title: t('ent.fireworks.credit.title'),
    badge: 'CC-BY 3.0',
    lines: ['• <b>Firework</b> ' + t('ent.fireworks.credit.line')],
    sourceLabel: t('ent.fireworks.credit.source_label'),
    url: 'https://poly.pizza/m/7ZuN5uYCrbf'
  }
};

var ROCKETS = 8, ROCKET_LEN = 0.9;
var SMALL = 1500, BIG = 500, FLASHES = 6;
var GRAV = 3.2;

function makePool(n, size) {
  var p = {
    n: n, next: 0,
    pos: new Float32Array(n * 3), col: new Float32Array(n * 3), vel: new Float32Array(n * 3),
    base: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), drag: new Float32Array(n)
  };
  p.geo = new THREE.BufferGeometry();
  p.geo.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
  p.geo.setAttribute('color', new THREE.BufferAttribute(p.col, 3));
  p.geo.setDrawRange(0, 0);
  p.mat = new THREE.PointsMaterial({ size: size, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  p.points = new THREE.Points(p.geo, p.mat);
  p.points.frustumCulled = false;
  p.points.userData.dynamic = true;
  return p;
}

function emit(p, x, y, z, vx, vy, vz, r, g, b, life, drag) {
  var i = p.next; p.next = (p.next + 1) % p.n;
  var k = i * 3;
  p.pos[k] = x; p.pos[k + 1] = y; p.pos[k + 2] = z;
  p.vel[k] = vx; p.vel[k + 1] = vy; p.vel[k + 2] = vz;
  p.base[k] = r; p.base[k + 1] = g; p.base[k + 2] = b;
  p.life[i] = life; p.max[i] = life; p.drag[i] = drag || 0;
}

// Sem particulas vivas o pool nao desenha nada (drawRange 0; o shader ja fica compilado desde o load).
function stepPool(p, dt) {
  var alive = 0;
  for (var i = 0; i < p.n; i++) {
    var k = i * 3;
    if (p.life[i] <= 0) { if (p.col[k] || p.col[k + 1] || p.col[k + 2]) { p.col[k] = p.col[k + 1] = p.col[k + 2] = 0; } continue; }
    alive++;
    p.life[i] -= dt;
    var dr = Math.max(0, 1 - p.drag[i] * dt);
    p.vel[k] *= dr; p.vel[k + 2] *= dr;
    p.vel[k + 1] = p.vel[k + 1] * dr - GRAV * dt;
    p.pos[k] += p.vel[k] * dt; p.pos[k + 1] += p.vel[k + 1] * dt; p.pos[k + 2] += p.vel[k + 2] * dt;
    var f = Math.max(0, p.life[i] / p.max[i]);
    var fl = f < 0.35 ? (Math.random() < 0.5 ? 0.25 : 1) : 1;   // crepita no fim
    var a = Math.min(1, f * 1.6) * fl;
    p.col[k] = p.base[k] * a; p.col[k + 1] = p.base[k + 1] * a; p.col[k + 2] = p.base[k + 2] * a;
  }
  p.geo.setDrawRange(0, alive ? p.n : 0);
  if (!alive && !p.dirty) return;
  p.dirty = alive > 0;
  p.geo.attributes.position.needsUpdate = true;
  p.geo.attributes.color.needsUpdate = true;
}

function clearPool(p) {
  p.life.fill(0); p.col.fill(0); p.next = 0; p.dirty = false;
  p.geo.setDrawRange(0, 0);
  p.geo.attributes.color.needsUpdate = true;
}

function flashTexture() {
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  var t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
  return t;
}

// Eixo principal dos vertices (iteracao de potencia na covariancia 3x3).
function principalAxis(obj) {
  var sum = new THREE.Vector3(), n = 0, v = new THREE.Vector3(), pts = [];
  obj.updateMatrixWorld(true);
  obj.traverse(function(o) {
    if (!o.isMesh) return;
    var pa = o.geometry.attributes.position;
    for (var i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); pts.push(v.x, v.y, v.z); sum.add(v); n++; }
  });
  sum.divideScalar(n || 1);
  var c = [0, 0, 0, 0, 0, 0, 0, 0, 0], i;
  for (i = 0; i < pts.length; i += 3) {
    var dx = pts[i] - sum.x, dy = pts[i + 1] - sum.y, dz = pts[i + 2] - sum.z;
    c[0] += dx * dx; c[1] += dx * dy; c[2] += dx * dz; c[4] += dy * dy; c[5] += dy * dz; c[8] += dz * dz;
  }
  c[3] = c[1]; c[6] = c[2]; c[7] = c[5];
  var ax = new THREE.Vector3(0.1, 1, 0.1);
  for (i = 0; i < 40; i++) {
    ax.set(c[0] * ax.x + c[1] * ax.y + c[2] * ax.z, c[3] * ax.x + c[4] * ax.y + c[5] * ax.z, c[6] * ax.x + c[7] * ax.y + c[8] * ax.z).normalize();
  }
  if (ax.y < 0) ax.negate();   // a ponta (cone branco) fica no alto do modelo original
  return ax;
}

function fallbackRocket() {
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 6), new THREE.MeshLambertMaterial({ color: 0xd8261c, emissive: 0x401008 }));
  var tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 6), new THREE.MeshLambertMaterial({ color: 0xf2f2f2, emissive: 0x303030 }));
  var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4), new THREE.MeshLambertMaterial({ color: 0xc89040 }));
  body.position.y = 0.12; tip.position.y = 0.37; stick.position.set(0.06, -0.2, 0);
  g.add(body); g.add(tip); g.add(stick);
  return g;
}

export function createFireworks(scene) {
  var root = new THREE.Group();
  root.userData.dynamic = true; root.userData.noShot = true;
  scene.add(root);

  var small = makePool(SMALL, 0.34), big = makePool(BIG, 1.1);
  root.add(small.points); root.add(big.points);

  var flashMat = [], flashes = [], i;
  var ftex = flashTexture();
  for (i = 0; i < FLASHES; i++) {
    var fm = new THREE.SpriteMaterial({ map: ftex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    var sp = new THREE.Sprite(fm); sp.visible = false; sp.userData.dynamic = true;
    root.add(sp); flashMat.push(fm);
    flashes.push({ sprite: sp, life: 0, max: 1, size: 1 });
  }

  // foguetes: pivo (orientado pela velocidade) > modelo (eixo alinhado ao +Y)
  var rockets = [];
  for (i = 0; i < ROCKETS; i++) {
    var pivot = new THREE.Group(); pivot.visible = false; pivot.userData.dynamic = true;
    var head = new THREE.Sprite(flashMat[0].clone()); head.userData.dynamic = true;
    head.material.color.setRGB(1, 0.85, 0.55); head.material.opacity = 0.9;
    root.add(head); head.visible = false;
    var model = fallbackRocket(); pivot.add(model);
    root.add(pivot);
    rockets.push({ pivot: pivot, model: model, head: head, active: false, t: 0, dur: 1, big: false,
      from: new THREE.Vector3(), ctrl: new THREE.Vector3(), to: new THREE.Vector3(), pos: new THREE.Vector3(),
      color: [1, 1, 1], onArrive: null, emitAcc: 0 });
  }

  loadModel('models/firework.glb').then(function(src) {
    psxModel(src);
    src.traverse(function(o) {
      if (!o.isMesh || !o.material || !o.material.emissive) return;
      var c = o.material.color;
      if (Math.min(c.r, c.g, c.b) > 0.8) {
        // ponta branca: difusa + 35% de emissiva estourava em branco chapado sob a luz do heroi; menos das duas
        // mantem o sombreado do cone (polimento 16.1, so material: o GLB fica como veio)
        o.material.emissive.copy(c).multiplyScalar(0.22);
        c.multiplyScalar(0.78);
      } else o.material.emissive.copy(c).multiplyScalar(0.35);
    });
    var axis = principalAxis(src);
    var holder = new THREE.Group();
    holder.add(src);
    src.quaternion.setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0));
    holder.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(holder), size = box.getSize(new THREE.Vector3());
    holder.scale.setScalar(ROCKET_LEN / (size.y || 1));
    holder.updateMatrixWorld(true);
    box.setFromObject(holder);
    var ctr = box.getCenter(new THREE.Vector3());
    holder.position.sub(ctr);                          // pivo no centro do foguete
    rockets.forEach(function(r) {
      r.pivot.remove(r.model);
      r.model = holder.clone();
      r.pivot.add(r.model);
    });
  }).catch(function(err) { console.warn('Fallback: falha ao carregar firework.glb:', err); });

  var _v = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), camPos = new THREE.Vector3();
  var camera = null;

  function vol(pos) { return camera ? distanceGain(camera.position.distanceTo(pos), 8, 1, 90) : 0.6; }

  function flash(pos, size, r, g, b, life) {
    var best = flashes[0];
    for (var k = 0; k < flashes.length; k++) if (flashes[k].life <= 0) { best = flashes[k]; break; }
    best.sprite.position.copy(pos); best.sprite.visible = true;
    best.sprite.material.color.setRGB(r, g, b);
    best.life = best.max = life || 0.5; best.size = size;
  }

  // Explosao esferica de particulas coloridas. color = [r,g,b] 0..1.
  function burst(pos, color, opts) {
    opts = opts || {};
    var n = opts.count || 110, speed = opts.speed || 6.5, isBig = !!opts.big, pool = isBig ? big : small;
    for (var k = 0; k < n; k++) {
      var u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      var sp2 = speed * (0.75 + Math.random() * 0.3);
      var mix = Math.random() < 0.2 ? 1 : 0;           // algumas faiscas brancas
      emit(pool, pos.x, pos.y, pos.z, s * Math.cos(a) * sp2, u * sp2, s * Math.sin(a) * sp2,
        color[0] + (1 - color[0]) * mix, color[1] + (1 - color[1]) * mix, color[2] + (1 - color[2]) * mix,
        1.3 + Math.random() * 0.9, 1.6);
    }
    if (isBig) {                                        // nucleo dourado extra no pool pequeno
      for (k = 0; k < 160; k++) {
        var u2 = Math.random() * 2 - 1, a2 = Math.random() * Math.PI * 2, s2 = Math.sqrt(1 - u2 * u2), q = speed * 0.6 * Math.random();
        emit(small, pos.x, pos.y, pos.z, s2 * Math.cos(a2) * q, u2 * q, s2 * Math.sin(a2) * q, 1, 0.85, 0.45, 1 + Math.random(), 1.2);
      }
    }
    flash(pos, opts.flash || 7, color[0] * 0.5 + 0.5, color[1] * 0.5 + 0.5, color[2] * 0.5 + 0.5, isBig ? 0.9 : 0.45);
    fireworkBangSound(vol(pos) * (isBig ? 1.2 : 1), isBig);
  }

  // Lanca um foguete de `from` ate `to` (curva: sobe primeiro, depois vai ao alvo). onArrive(pos) no fim;
  // sem onArrive explode com `color`. big = foguete da lua (rastro grosso).
  function launch(from, to, opts) {
    opts = opts || {};
    var r = null;
    for (var k = 0; k < rockets.length; k++) if (!rockets[k].active) { r = rockets[k]; break; }
    if (!r) return null;
    r.active = true; r.t = 0; r.dur = opts.dur || 1.4; r.big = !!opts.big;
    r.color = opts.color || [1, 0.8, 0.3]; r.onArrive = opts.onArrive || null; r.emitAcc = 0;
    r.from.copy(from); r.to.copy(to);
    r.ctrl.set(from.x + (to.x - from.x) * 0.15, from.y + (to.y - from.y) * 0.85, from.z + (to.z - from.z) * 0.15);
    r.pos.copy(from);
    r.pivot.position.copy(from); r.pivot.visible = true; r.head.visible = true;
    fireworkLaunchSound(vol(from), r.dur);
    return r;
  }

  function curve(r, s, out) {
    var a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
    return out.set(a * r.from.x + b * r.ctrl.x + c * r.to.x, a * r.from.y + b * r.ctrl.y + c * r.to.y, a * r.from.z + b * r.ctrl.z + c * r.to.z);
  }

  function update(dt, cam) {
    camera = cam;
    if (cam) cam.getWorldPosition(camPos);
    for (var k = 0; k < rockets.length; k++) {
      var r = rockets[k];
      if (!r.active) continue;
      r.t += dt;
      var u = Math.min(1, r.t / r.dur), s = Math.pow(u, 1.35);
      _v.copy(r.pos);
      curve(r, s, r.pos);
      _d.copy(r.pos).sub(_v);
      if (_d.lengthSq() > 1e-8) r.pivot.quaternion.setFromUnitVectors(_up, _d.normalize());
      r.pivot.position.copy(r.pos);
      r.head.position.copy(r.pos);
      var dist = cam ? camPos.distanceTo(r.pos) : 10;
      r.head.scale.setScalar(Math.max(0.35, dist * (r.big ? 0.035 : 0.025)));
      // rastro: faiscas laranja caindo atras do foguete
      r.emitAcc += dt * (r.big ? 110 : 70);
      while (r.emitAcc >= 1) {
        r.emitAcc -= 1;
        emit(small, r.pos.x, r.pos.y, r.pos.z, (Math.random() - 0.5) * 0.6, -0.4 - Math.random() * 0.6, (Math.random() - 0.5) * 0.6,
          1, 0.55 + Math.random() * 0.3, 0.2, 0.45 + Math.random() * 0.35, 2);
        if (r.big && Math.random() < 0.4) emit(big, r.pos.x, r.pos.y, r.pos.z, 0, -0.2, 0, 0.85, 0.5, 0.18, 0.8, 1);
      }
      if (u >= 1) {
        r.active = false; r.pivot.visible = false; r.head.visible = false;
        if (r.onArrive) r.onArrive(r.pos); else burst(r.pos, r.color);
      }
    }
    for (k = 0; k < flashes.length; k++) {
      var f = flashes[k];
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.sprite.visible = false; f.sprite.material.opacity = 0; continue; }
      var e = f.life / f.max;
      f.sprite.material.opacity = e;
      f.sprite.scale.setScalar(f.size * (1.3 - 0.3 * e));
    }
    stepPool(small, dt); stepPool(big, dt);
  }

  function reset() {
    rockets.forEach(function(r) { r.active = false; r.pivot.visible = false; r.head.visible = false; r.onArrive = null; });
    flashes.forEach(function(f) { f.life = 0; f.sprite.visible = false; f.sprite.material.opacity = 0; });
    clearPool(small); clearPool(big);
  }

  return { launch: launch, burst: burst, flash: flash, update: update, reset: reset };
}
