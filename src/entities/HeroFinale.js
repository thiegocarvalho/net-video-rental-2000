import * as THREE from 'three';
import { S } from '../core/State.js';
import { SESSION } from '../core/World.js';
import { unlock } from '../core/Achievements.js';
import { createFireworks } from './Fireworks.js';
import { moonPosition, moonDirection, brandMoon, moonObject, MOON_RADIUS, MOON_DIST } from './Moon.js';

// Final secreto: "Medalha de Heroi + Lua" (FINAL_GAME_DESIGN §8).
//
// Disparo: CustomerEvent.heroEdgeTick (5 s empurrando a borda z = 26 do mapa, porta explodida, sessao sem lua marcada).
// Linha do tempo (~15 s):
//   1. ENTRADA   (0-2,2 s)   barras de cinema + vinheta; a coluna de luz cai no horizonte (z 34) e a silhueta do customer
//                            aparece de frente para o jogador. Se uma arvore tapa a lua, a camera desliza de lado (so aqui).
//   2. POSE      (2,2-4,4 s) clarao, faiscas, acorde; silhueta em HERO_ARMS_UP e depois HERO_STAND.
//   3. FOGOS     (4,4-9,8 s) 6 foguetes (models/firework.glb) sobem do chao atras dele e explodem em cores.
//   4. FOGUETE DA LUA (9,8 s) sobe do lado da silhueta e voa ate a lua. CAMERA OBRIGATORIA: posicao parada, so o olhar
//                            segue o foguete (slerp), FOV fecha um pouco; mouse/WASD/interacao bloqueados (S.cutscene /
//                            S.camForced; o pointer lock nao e solto).
//   5. IMPACTO               explosao dourada, lua ganha logo/nome do canal (SESSION.moonBranded) + halo, Rango,
//                            SESSION.customerDisabled. O olhar segura 0,6 s na lua e host.finish() faz o fade -> resetWorld.
// Antes do passo 4 o mouse olha livre; WASD e interacao ficam bloqueados a cena inteira.
// reset() (resetWorld no meio ou no fim) cancela tudo: particulas, foguetes, overlays, FOV, flags de entrada.
//
// O host (CustomerEvent.js) fornece: grupo do personagem, poses, aparencia (silhueta/cor/luz), som, jogador e finish().

var TAU = Math.PI * 2;
function clamp01(t) { return Math.max(0, Math.min(1, t)); }
function ease(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

var EDGE_Z = 26, HERO_Z = 34, TREE_X = -3.5, TREE_CLEAR = 2.6;
// approach: a luz vem de longe, fraquissima, ate parar na frente do jogador; beam: o estouro em que ela fica
// forte e o customer aparece. O foguete final nao vai mais a lua: ele sobe dentro da coluna de luz.
var T = { approach: 4.6, beam: 4.6, stand: 6.2, fwStart: 6.8, fwGap: 0.8, hitLaunch: 11.4, hitDur: 2.0, hold: 2.2, dolly: 2.0 };
var LIGHT_FAR = 52;          // de quanto mais longe (em z) a luz comeca a se aproximar
var EMBLEM_Y = 6.0;          // altura em que o foguete acerta a coluna e o emblema fica
// Fogos de exibicao: [dx relativo a silhueta, z de lancamento, altura da explosao, cor]
var SHOW = [
  [-6, 39, 9.5, [1, 0.25, 0.2]],
  [5, 40, 11, [0.35, 0.6, 1]],
  [-1.5, 42, 12, [0.35, 1, 0.45]],
  [8, 38.5, 9, [1, 0.85, 0.25]],
  [-8.5, 41, 10.5, [0.85, 0.4, 1]],
  [2.5, 38.5, 10, [1, 0.55, 0.15]]
];
var GOLD = [1, 0.82, 0.35];
var FORCE_RATE = 4.5, FOV_ZOOM = 32;

function canvasTex(w, h, draw) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

// Coluna de luz: brilhante perto do chao, some para cima, bordas laterais suaves.
function beamTexture() {
  return canvasTex(128, 512, function(ctx, w, h) {
    var img = ctx.createImageData(w, h), d = img.data, x, y;
    for (y = 0; y < h; y++) {
      var vy = 0.12 + 0.88 * Math.pow(y / h, 1.35);                 // y=0 topo (fraco), y=h chao (forte)
      for (x = 0; x < w; x++) {
        var ex = 1 - Math.abs(x / (w - 1) - 0.5) * 2;               // 1 no centro, 0 nas bordas
        var a = Math.pow(Math.max(0, ex), 1.7) * vy;
        var i = (y * w + x) * 4;
        d[i] = 255; d[i + 1] = 238; d[i + 2] = 170; d[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function haloTexture() {
  return canvasTex(256, 256, function(ctx, w, h) {
    var g = ctx.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,236,150,0.85)');
    g.addColorStop(0.6, 'rgba(255,170,40,0.35)'); g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

export function createHeroFinale(host) {
  var scene = host.scene;
  var root = new THREE.Group(); root.visible = false; root.userData.noShot = true; root.userData.dynamic = true; scene.add(root);
  var fx = new THREE.Group(); fx.userData.dynamic = true; root.add(fx);           // segue o heroi

  var light = new THREE.PointLight(0xffe08a, 0, 34, 2); light.position.set(0, 3.4, 0); fx.add(light);

  var beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  var beam = new THREE.Group(), i;
  for (i = 0; i < 3; i++) {
    var pl = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 16), beamMat);
    pl.position.y = 8; pl.rotation.y = i * Math.PI / 3; pl.userData.dynamic = true; beam.add(pl);
  }
  fx.add(beam);

  var groundMat = new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.05; ground.userData.dynamic = true; fx.add(ground);

  // poeira subindo na coluna
  var DUST = 140, dustPos = new Float32Array(DUST * 3), dustSeed = new Float32Array(DUST * 3);
  for (i = 0; i < DUST; i++) {
    dustSeed[i * 3] = Math.random() * TAU; dustSeed[i * 3 + 1] = 0.15 + Math.random() * 1.15; dustSeed[i * 3 + 2] = 0.12 + Math.random() * 0.35;
    dustPos[i * 3 + 1] = Math.random() * 9;
  }
  var dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  var dustMat = new THREE.PointsMaterial({ size: 0.07, color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  var dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; fx.add(dust);

  // faiscas da revelacao (em volta da silhueta)
  var SP = 190, spPos = new Float32Array(SP * 3), spCol = new Float32Array(SP * 3), spVel = new Float32Array(SP * 3), spLife = new Float32Array(SP);
  var spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
  var spMat = new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  var sparks = new THREE.Points(spGeo, spMat); sparks.frustumCulled = false; root.add(sparks);

  // Emblema do canal: fica no lugar da luz depois que o foguete a acerta. Logo do canal se houver; senao, o nome.
  // Translucido de proposito (o pedido: "tudo em opacidade").
  var emblemMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide });
  var emblem = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), emblemMat);
  emblem.visible = false; emblem.frustumCulled = false; emblem.userData.dynamic = true; root.add(emblem);

  function buildEmblem() {
    var e = host.emblem ? host.emblem() : null;
    var img = e && e.img, name = ((e && e.name) || '').toUpperCase();
    var tex = canvasTex(512, 512, function(ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      if (img && img.complete && img.naturalWidth) {
        ctx.save(); ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.4, 0, TAU); ctx.clip();
        ctx.drawImage(img, w * 0.1, h * 0.1, w * 0.8, h * 0.8);
        ctx.restore();
      } else {                                                   // sem logo: so o nome, nada rebuscado
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var words = name.split(' '), lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [name];
        var px = 120;
        do { ctx.font = '900 ' + px + 'px "Impact","Arial Black",sans-serif'; px -= 4; }
        while (px > 24 && lines.some(function(L) { return ctx.measureText(L).width > w * 0.9; }));
        ctx.fillStyle = '#fff6d8';
        var y0 = h / 2 - (lines.length - 1) * px * 0.6;
        for (var i2 = 0; i2 < lines.length; i2++) ctx.fillText(lines[i2], w / 2, y0 + i2 * px * 1.2);
      }
    });
    if (emblemMat.map) emblemMat.map.dispose();
    emblemMat.map = tex; emblemMat.needsUpdate = true;
  }

  var fw = createFireworks(scene);

  var cine = null, flashEl = null;
  function ensureOverlay() {
    cine = document.getElementById('hero-cine');
    if (!cine) {
      cine = document.createElement('div'); cine.id = 'hero-cine';
      cine.innerHTML = '<b class="vig"></b><i class="bar top"></i><i class="bar bot"></i><u class="flash"></u>';
      document.body.appendChild(cine);
    }
    flashEl = cine.querySelector('.flash');
  }
  function flashScreen() { if (flashEl) { flashEl.classList.remove('pop'); void flashEl.offsetWidth; flashEl.classList.add('pop'); } }

  var active = false, t = 0, baseFov = 0, revealed = false, nextShow = 0, hitRocket = null, impactT = -1, finishing = false;
  var dollyFrom = 0, dollyTo = 0, heroX = 0, popTimer = null;
  var _v = new THREE.Vector3(), _moon = new THREE.Vector3(), _hit = new THREE.Vector3(), _from = new THREE.Vector3(), _to = new THREE.Vector3();
  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), camLook = new THREE.Quaternion(), _look = new THREE.Vector3();
  var _rc = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _sph = new THREE.Sphere();
  var occ = [];

  function customerPos(out) { return host.group.getWorldPosition(out); }

  function burstSparks(n, speed, up) {
    customerPos(_v);
    var k = 0;
    for (var s = 0; s < SP && k < n; s++) {
      if (spLife[s] > 0) continue;
      var a = Math.random() * TAU, e = Math.random() * 1.2 - 0.2, sp = speed * (0.4 + Math.random() * 0.8);
      spPos[s * 3] = _v.x + (Math.random() - 0.5) * 0.4; spPos[s * 3 + 1] = _v.y + 1.1 + Math.random() * 0.7; spPos[s * 3 + 2] = _v.z + (Math.random() - 0.5) * 0.4;
      spVel[s * 3] = Math.cos(a) * sp; spVel[s * 3 + 1] = e * sp + up; spVel[s * 3 + 2] = Math.sin(a) * sp;
      spLife[s] = 1.6 + Math.random() * 1.2; k++;
    }
  }

  function updateSparks(dt) {
    for (var s = 0; s < SP; s++) {
      if (spLife[s] <= 0) { spCol[s * 3] = spCol[s * 3 + 1] = spCol[s * 3 + 2] = 0; continue; }
      spLife[s] -= dt;
      spVel[s * 3 + 1] -= 1.8 * dt;
      spPos[s * 3] += spVel[s * 3] * dt; spPos[s * 3 + 1] += spVel[s * 3 + 1] * dt; spPos[s * 3 + 2] += spVel[s * 3 + 2] * dt;
      var f = clamp01(spLife[s] / 1.4);
      spCol[s * 3] = f; spCol[s * 3 + 1] = f * 0.82; spCol[s * 3 + 2] = f * 0.35;
    }
    spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
  }

  function updateDust(dt, vis) {
    dustMat.opacity = vis * 0.9;
    for (var d = 0; d < DUST; d++) {
      var y = dustPos[d * 3 + 1] + (0.25 + dustSeed[d * 3 + 2]) * dt;
      if (y > 9) y -= 9;
      dustSeed[d * 3] += dt * 0.5;
      var r = dustSeed[d * 3 + 1] * (0.6 + 0.4 * (y / 9));
      dustPos[d * 3] = Math.cos(dustSeed[d * 3]) * r; dustPos[d * 3 + 1] = y; dustPos[d * 3 + 2] = Math.sin(dustSeed[d * 3]) * r;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  function setFov(camera, f) {
    if (!camera || !baseFov) return;
    var v = baseFov - f;
    if (Math.abs(camera.fov - v) > 0.02) { camera.fov = v; camera.updateProjectionMatrix(); }
  }

  // Malhas opacas alem da borda (arvores etc.) que podem tapar a lua: lista feita uma vez por cena.
  function collectOccluders() {
    occ.length = 0;
    var skip = [root, host.group, moonObject()];
    scene.traverse(function(o) {
      if (!o.isMesh || !o.visible) return;
      for (var a = o; a; a = a.parent) { if (skip.indexOf(a) >= 0 || !a.visible) return; }
      var m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent || m.blending === THREE.AdditiveBlending) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      _sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      if (_sph.center.z + _sph.radius > EDGE_Z) occ.push(o);
    });
  }
  function moonClearFrom(x, y, z) {
    var dir = moonDirection();
    _o.set(x, y, z);
    for (var k = 0; k < 5; k++) {
      // centro e 4 pontos da borda (cima/baixo/lados, ~70% do raio)
      var ox = k === 1 ? 0.7 : k === 2 ? -0.7 : 0, oy = k === 3 ? 0.7 : k === 4 ? -0.7 : 0;
      _v.copy(_o).addScaledVector(dir, MOON_DIST);
      _v.x += ox * MOON_RADIUS * dir.z; _v.z -= ox * MOON_RADIUS * dir.x; _v.y += oy * MOON_RADIUS;
      _d.copy(_v).sub(_o); var len = _d.length(); _d.divideScalar(len);
      _rc.set(_o, _d); _rc.far = len - MOON_RADIUS;
      if (_rc.intersectObjects(occ, false).length) return false;
    }
    return true;
  }
  // x mais perto do jogador (ate 5 m) de onde a lua aparece inteira.
  function clearX(px, y, z) {
    collectOccluders();
    for (var s = 0; s <= 10; s++) {
      for (var sg = -1; sg <= 1; sg += 2) {
        var x = px + sg * s * 0.5;
        if (x < -17.2 || x > 17.2) continue;
        if (moonClearFrom(x, y, z)) return x;
        if (s === 0) break;
      }
    }
    return px;
  }

  function lookAtSmooth(camera, target, k) {
    _m.lookAt(camera.position, target, camera.up);
    _q.setFromRotationMatrix(_m);
    camLook.slerp(_q, k);
    camera.quaternion.copy(camLook);
  }

  function start(camera) {
    ensureOverlay();
    var P = host.player();
    active = true; t = 0; revealed = false; nextShow = 0; hitRocket = null; impactT = -1; finishing = false;
    S.cutscene = 'hero'; S.camForced = false;
    baseFov = camera.fov;
    dollyFrom = P.pos.x;
    dollyTo = clearX(P.pos.x, P.pos.y, P.pos.z);
    heroX = Math.max(-14, Math.min(14, dollyTo));
    if (Math.abs(heroX - TREE_X) < TREE_CLEAR) heroX = dollyTo + (dollyTo >= TREE_X ? 5 : -5);   // a arvore do esconderijo nao tapa a silhueta
    host.group.position.set(heroX, -0.14, HERO_Z);
    host.group.rotation.y = Math.atan2(dollyTo - heroX, P.pos.z - HERO_Z);
    host.group.visible = false;                 // ele so aparece quando a luz fica forte
    host.setLook('silhouette', 1);
    root.visible = true;
    fx.position.set(heroX, 0, HERO_Z + LIGHT_FAR);   // a luz comeca la longe e vem chegando
    emblem.visible = false; emblemMat.opacity = 0; emblem.scale.setScalar(1);
    buildEmblem();
    spLife.fill(0);
    fw.reset();
    cine.classList.add('on');
    host.chime();
  }

  function launchShow(i) {
    var s = SHOW[i];
    _from.set(heroX + s[0], 0.15, s[1]);
    _to.set(heroX + s[0] * 1.15 + (Math.random() - 0.5), s[2], s[1] + 1);
    fw.launch(_from, _to, { dur: 1.25 + Math.random() * 0.35, color: s[3] });
  }

  // O ultimo foguete sobe dentro da coluna de luz, logo acima dele.
  function launchBeamRocket(camera) {
    customerPos(_v);
    _hit.set(_v.x, EMBLEM_Y, _v.z);
    _from.set(heroX + 1.4, 0.2, HERO_Z + 0.6);
    hitRocket = fw.launch(_from, _hit, { dur: T.hitDur, big: true, onArrive: impact });
    S.camForced = true;
    camLook.copy(camera.quaternion);
  }

  function impact(pos) {
    impactT = t;
    hitRocket = null;
    emblem.position.copy(pos);
    emblem.visible = true;
    // A lua so e marcada no fim (host.finish, durante o fade): se fosse agora, apareceria com a mesma logo ao
    // lado do emblema e os dois brigariam na mesma tela.
    SESSION.customerDisabled = true;
    fw.burst(pos, GOLD, { big: true, count: 200, speed: 20, flash: 16 });   // rapido: abre e deixa a logo a vista
    flashScreen();
    host.chime();
    // o popup do Rango aparece normalmente, acima do fade do fim (so ele: o resto do HUD fica escondido)
    document.body.classList.add('hero-top');
    if (popTimer) clearTimeout(popTimer);
    popTimer = setTimeout(function() { popTimer = null; document.body.classList.remove('hero-top'); }, 4600);
    unlock('rango');
  }

  // dt em segundos; true enquanto a cena roda (inclusive durante o fade final, ate o resetWorld chamar reset()).
  function update(dt, camera) {
    if (!active) return false;
    t += dt;
    var P = host.player();

    // deslize lateral (so na entrada) para a lua ficar a vista
    if (t <= T.dolly + dt && dollyTo !== dollyFrom) P.pos.x = dollyFrom + (dollyTo - dollyFrom) * ease(t / T.dolly);

    customerPos(_v);
    host.group.rotation.y = Math.atan2(camera.position.x - _v.x, camera.position.z - _v.z);

    // A luz vem de longe: comeca quase invisivel e so perto do fim fica forte (curva puxada para o fim).
    var app = ease(t / T.approach);
    if (!revealed) fx.position.z = HERO_Z + LIGHT_FAR * (1 - app);
    var intro = Math.pow(app, 2.6);
    var fade = impactT >= 0 ? 1 - ease((t - impactT) / 1.1) : 1;    // depois do estouro a luz se apaga
    beamMat.opacity = 0.85 * intro * fade; groundMat.opacity = 0.6 * intro * fade;
    light.intensity = (revealed ? (3.0 + Math.sin(t * 3) * 0.3) * fade : 3.4 * intro);
    updateDust(dt, intro * fade);

    if (!revealed && t >= T.beam) {
      revealed = true;
      fx.position.z = HERO_Z;
      host.group.visible = true;                  // a luz fica forte e ele esta ali, na frente
      if (host.snap) host.snap();
      burstSparks(150, 4.2, 1.6);
      flashScreen();
      host.chime();
    }

    if (impactT >= 0) {                           // o que acertou a luz deixou o emblema do canal, translucido
      var ke = ease(clamp01((t - impactT) / 1.1));
      emblemMat.opacity = 0.88 * ke;
      emblem.scale.setScalar(0.7 + 0.3 * ke);
      emblem.lookAt(camera.position);
    }
    if (t < T.beam) host.pose('IDLE');
    else if (impactT >= 0) host.pose('HERO_WAVE');
    else if (t < T.stand || t >= T.hitLaunch) host.pose('HERO_ARMS_UP');
    else host.pose('HERO_STAND');
    if (revealed && t < T.beam + 4 && Math.random() < dt * 10) burstSparks(2, 1.6, 1.2);

    while (nextShow < SHOW.length && t >= T.fwStart + nextShow * T.fwGap) launchShow(nextShow++);
    if (t >= T.hitLaunch && !hitRocket && impactT < 0) launchBeamRocket(camera);

    if (S.camForced) {
      var k = 1 - Math.exp(-FORCE_RATE * dt);
      if (hitRocket && hitRocket.active) _look.copy(hitRocket.pos);
      else _look.copy(emblem.position);
      lookAtSmooth(camera, _look, k);
      var z = impactT >= 0 ? 1 : ease((t - T.hitLaunch) / T.hitDur);
      setFov(camera, FOV_ZOOM * z);
    }

    if (impactT >= 0 && !finishing && t - impactT >= T.hold) {
      finishing = true;
      brandMoon();                                // marca a lua para o resto da sessao, ja sob o fade
      host.finish();
    }

    fw.update(dt, camera);
    updateSparks(dt);
    return true;
  }

  // resetWorld (fim normal ou no meio da cena): tudo volta ao estado de antes.
  function reset(camera, opts) {
    var reason = opts && opts.reason;
    if (reason !== 'hero') {
      if (popTimer) { clearTimeout(popTimer); popTimer = null; }
      document.body.classList.remove('hero-top');
    }
    spLife.fill(0); updateSparks(0);
    fw.reset();
    var cam = camera || window.camera;
    if (cam && baseFov) { cam.fov = baseFov; cam.updateProjectionMatrix(); }
    baseFov = 0;
    if (active || root.visible) {
      host.group.visible = false;
      host.setLook('color', 1);
    }
    active = false; hitRocket = null; impactT = -1; finishing = false; revealed = false;
    emblem.visible = false; emblemMat.opacity = 0;
    root.visible = false;
    beamMat.opacity = 0; groundMat.opacity = 0; dustMat.opacity = 0; light.intensity = 0;
    if (S.cutscene === 'hero') S.cutscene = false;
    S.camForced = false;
    if (cine) cine.classList.remove('on');
  }

  return { start: start, update: update, reset: reset, isActive: function() { return active; } };
}
