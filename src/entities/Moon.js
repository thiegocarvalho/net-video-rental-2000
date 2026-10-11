import * as THREE from 'three';
import { S } from '../core/State.js';
import { SESSION, onSessionReset } from '../core/World.js';
import { rng } from '../core/Utils.js';
import { t } from '../i18n/index.js';

// Lua do ceu externo (FINAL_GAME_DESIGN §8 / Q15). Desenhada por codigo: esfera low-poly com textura canvas
// procedural (crateras), filtro nearest, sem luz nem neblina (MeshBasic + cor por vertice escurecendo a borda).
//
// Fica "no infinito": o grupo e reposicionado a cada quadro em camera + direcao * DIST e gira para a camera
// (updateMoon, chamado pelo tick). A UV e uma projecao plana da face voltada para a camera, entao o canvas
// aparece sem distorcao (o que se desenha nele e o que se ve).
//
// Duas direcoes: no form inicial (S.phase 'outside'/'boot'/'entering') a lua fica acima do telhado da fachada;
// dentro do jogo ('inside') fica sobre a rua/horizonte (z+), onde acontece o final do heroi. A troca acontece
// com o jogador dentro da loja, olhando para o fundo, entao nunca e vista.
//
// Depois do heroi (SESSION.moonBranded) o canvas ganha a logo do canal (mesmo avatarImg da camiseta do
// customer, crossOrigin anonymous) e o nome, com halo dourado. Sobrevive ao resetWorld; resetSession limpa.

export var TXT = {
  fallbackName: t('ent.moon.fallback_name')     // sem nome do canal (feed ainda nao carregou)
};

var DIST = 60, RADIUS = 5.2, TEX = 512;
var DIR_STREET = new THREE.Vector3(0.24, 0.42, 0.88).normalize();   // sobre o estacionamento, um pouco a esquerda
// acima do telhado, vista do form (a camera do titulo balanca ~13 graus: a lua fica entre o centro e a esquerda)
var DIR_TITLE = new THREE.Vector3(-0.3, 0.53, -0.79).normalize();

var group = null, sphere = null, halo = null, haloMat = null, moonTex = null, moonCanvas = null;
var logoImg = null, logoName = '';
var glow = 0, pulse = 0;
var _cam = new THREE.Vector3();

// Fallback do avatar: mesmo simbolo de "play" de fita da camiseta do customer.
function drawPlay(x, cx, cy, r) {
  x.fillStyle = '#b3201f'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.beginPath();
  x.moveTo(cx - r * 0.32, cy - r * 0.5); x.lineTo(cx + r * 0.56, cy); x.lineTo(cx - r * 0.32, cy + r * 0.5);
  x.closePath(); x.fill();
}

// Canvas da face da lua. Crateras sempre; com SESSION.moonBranded, a logo (logoImg) e o nome do canal.
// logoImg pode ser null ou ainda nao carregado: entra o simbolo de fallback.
export function drawMoonTexture(img, name) {
  var c = moonCanvas || document.createElement('canvas');
  c.width = TEX; c.height = TEX;
  var x = c.getContext('2d'), W = TEX, cx = W / 2, cy = W / 2, R = W / 2, i;
  var rnd = rng(1969);
  x.clearRect(0, 0, W, W);

  // Face da lua em camadas (luz do alto a esquerda): terras altas manchadas, mares escuros de borda irregular,
  // crateras com borda clara e sombra interna, e raios de ejecao de crateras jovens.
  var k = W / 256, light = -0.72;                                 // k: escala em relacao a grade antiga de 256; luz vem de (-,-)
  var g = x.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
  g.addColorStop(0, '#e8e4d4'); g.addColorStop(0.7, '#c3beac'); g.addColorStop(1, '#928d7d');
  x.fillStyle = g; x.fillRect(0, 0, W, W);

  function soft(px, py, rad, rgba) {                              // mancha circular de borda suave
    var gr = x.createRadialGradient(px, py, 0, px, py, rad);
    gr.addColorStop(0, rgba); gr.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
    x.fillStyle = gr; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  for (i = 0; i < 170; i++) {                                     // terras altas: variacao suave de brilho
    var br = (14 + rnd() * 46) * k, bx0 = rnd() * W, by0 = rnd() * W;
    soft(bx0, by0, br, rnd() > 0.5 ? 'rgba(255,255,244,0.07)' : 'rgba(70,64,52,0.075)');
  }

  // mares: manchas escuras grandes de contorno irregular (varios discos suaves sobrepostos por mar)
  var maria = [[0.40, 0.31, 0.15, 12], [0.57, 0.33, 0.085, 7], [0.63, 0.47, 0.10, 8], [0.72, 0.60, 0.07, 6], [0.78, 0.37, 0.05, 5],
               [0.37, 0.66, 0.09, 7], [0.20, 0.50, 0.15, 12], [0.50, 0.50, 0.06, 5]];
  for (i = 0; i < maria.length; i++) {
    var m = maria[i];
    for (var q = 0; q < m[3]; q++) {
      var ang = rnd() * 6.283, dd = Math.sqrt(rnd()) * m[2] * W * 0.6;
      soft(m[0] * W + Math.cos(ang) * dd, m[1] * W + Math.sin(ang) * dd, (m[2] * W) * (0.45 + rnd() * 0.5), 'rgba(74,76,80,0.34)');
    }
  }

  // raios de ejecao (crateras jovens): linhas finas e claras que somem com a distancia
  function rays(px, py, n, len, a) {
    for (var ri = 0; ri < n; ri++) {
      var ra = rnd() * 6.283, rl = len * (0.35 + rnd() * 0.65);
      var gr = x.createLinearGradient(px, py, px + Math.cos(ra) * rl, py + Math.sin(ra) * rl);
      gr.addColorStop(0, 'rgba(246,243,226,' + a + ')'); gr.addColorStop(1, 'rgba(246,243,226,0)');
      x.strokeStyle = gr; x.lineWidth = (0.6 + rnd() * 1.2) * k;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ra) * rl, py + Math.sin(ra) * rl); x.stroke();
    }
  }
  rays(0.45 * W, 0.80 * W, 34, 150 * k, 0.15);                    // "Tycho", ao sul
  rays(0.31 * W, 0.40 * W, 18, 70 * k, 0.12);                     // "Copernicus"
  rays(0.19 * W, 0.34 * W, 9, 42 * k, 0.1);                       // "Kepler"

  // crateras: sombra interna do lado da luz, brilho do lado oposto, borda clara e, nas grandes, pico central
  function crater(px, py, r, mare) {
    x.fillStyle = mare ? 'rgba(52,54,58,0.16)' : 'rgba(86,80,68,0.14)';   // piso so um pouco mais escuro que o entorno
    x.beginPath(); x.arc(px, py, r, 0, 6.283); x.fill();
    x.save(); x.beginPath(); x.arc(px, py, r * 0.97, 0, 6.283); x.clip();
    x.fillStyle = 'rgba(28,26,22,0.34)';                          // sombra: disco deslocado em direcao a luz
    x.beginPath(); x.arc(px + light * r * 0.38, py + light * r * 0.38, r * 0.98, 0, 6.283); x.fill();
    x.fillStyle = 'rgba(238,234,214,0.14)';                       // parede iluminada do lado oposto
    x.beginPath(); x.arc(px - light * r * 0.55, py - light * r * 0.55, r * 0.55, 0, 6.283); x.fill();
    x.restore();
    x.strokeStyle = 'rgba(246,242,224,0.3)'; x.lineWidth = Math.max(1, r * 0.13);
    x.beginPath(); x.arc(px, py, r, 0.3, Math.PI * 1.15); x.stroke();                 // borda clara (lado oposto a luz)
    x.strokeStyle = 'rgba(40,36,30,0.2)'; x.lineWidth = Math.max(1, r * 0.1);
    x.beginPath(); x.arc(px, py, r, Math.PI * 1.3, Math.PI * 1.95); x.stroke();       // borda na sombra
    if (r > 9 * k) { x.fillStyle = 'rgba(244,240,222,0.4)'; x.beginPath(); x.arc(px, py, r * 0.12, 0, 6.283); x.fill(); }
  }
  var bigPos = [[0.45, 0.80, 11], [0.31, 0.40, 9], [0.19, 0.34, 6], [0.58, 0.70, 8], [0.27, 0.24, 7], [0.70, 0.24, 7], [0.83, 0.52, 5], [0.52, 0.18, 6], [0.40, 0.55, 6]];
  for (i = 0; i < bigPos.length; i++) crater(bigPos[i][0] * W, bigPos[i][1] * W, bigPos[i][2] * k, i > 2 && i < 5);
  for (i = 0; i < 80; i++) {                                      // crateras menores espalhadas
    var cr = (1.4 + Math.pow(rnd(), 2.4) * 6) * k;
    var ca = rnd() * 6.283, cd = Math.sqrt(rnd()) * (R - cr - 6);
    crater(cx + Math.cos(ca) * cd, cy + Math.sin(ca) * cd, cr, false);
  }

  // grao PS1: pontos claros/escuros
  for (i = 0; i < 2400; i++) {
    x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,240,0.07)' : 'rgba(0,0,0,0.09)';
    x.fillRect((rnd() * W) | 0, (rnd() * W) | 0, 2, 2);
  }

  if (SESSION.moonBranded) {
    // logo do canal num medalhao dourado, acima do centro
    var ar = W * 0.25, ay = cy - W * 0.06;
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.arc(cx + 3, ay + 4, ar + 10, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#e9b930'; x.beginPath(); x.arc(cx, ay, ar + 8, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#0a0f20'; x.beginPath(); x.arc(cx, ay, ar + 3, 0, Math.PI * 2); x.fill();
    if (img && img.complete && img.naturalWidth) {
      x.save(); x.beginPath(); x.arc(cx, ay, ar, 0, Math.PI * 2); x.clip();
      x.drawImage(img, cx - ar, ay - ar, ar * 2, ar * 2);
      x.restore();
    } else {
      drawPlay(x, cx, ay, ar);
    }
    // nome do canal numa faixa
    var up = String(name || TXT.fallbackName).toUpperCase();
    var by = cy + W * 0.27, bw = W * 0.78, bh = W * 0.13;
    x.fillStyle = '#b3201f'; x.fillRect(cx - bw / 2, by - bh / 2, bw, bh);
    var ks = W / 256;                                              // a face passou de 256 para 512 px: textos e traços acompanham
    x.strokeStyle = '#e9b930'; x.lineWidth = 3 * ks; x.strokeRect(cx - bw / 2, by - bh / 2, bw, bh);
    var px2 = 28 * ks;
    do { x.font = '900 ' + px2 + 'px "Impact", "Arial Black", sans-serif'; px2 -= 1; } while (x.measureText(up).width > bw - 12 * ks && px2 > 9);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineJoin = 'round'; x.lineWidth = 4 * ks; x.strokeStyle = '#05070f'; x.strokeText(up, cx, by + 1);
    x.fillStyle = '#fff'; x.fillText(up, cx, by + 1);
  }
  return c;
}

// Esfera low-poly com UV plana (face +z) e cor por vertice: borda mais escura (Gouraud estilo PS1).
function moonGeometry() {
  var geo = new THREE.SphereGeometry(RADIUS, 16, 12);
  var pos = geo.attributes.position, uv = geo.attributes.uv, n = pos.count, col = new Float32Array(n * 3), i;
  for (i = 0; i < n; i++) {
    var px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    uv.setXY(i, 0.5 + px / (2 * RADIUS), 0.5 + py / (2 * RADIUS));
    var k = 0.5 + 0.5 * Math.sqrt(Math.max(0, pz / RADIUS));
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 1.02;
  }
  uv.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function haloTexture() {
  var c = document.createElement('canvas'), S2 = 128;
  c.width = S2; c.height = S2;
  var x = c.getContext('2d');
  var g = x.createRadialGradient(S2 / 2, S2 / 2, S2 * 0.18, S2 / 2, S2 / 2, S2 / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S2, S2);
  var t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

var HALO_IDLE = new THREE.Color(0x7f93b8), HALO_GOLD = new THREE.Color(0xffc24a);

function applyHalo() {
  var k = SESSION.moonBranded ? 1 : 0;
  haloMat.color.copy(HALO_IDLE).lerp(HALO_GOLD, k);
  haloMat.opacity = Math.min(1, (SESSION.moonBranded ? 0.75 : 0.32) + glow * 0.9);
}

export function buildMoon(scene) {
  moonCanvas = drawMoonTexture(null, '');
  moonTex = new THREE.CanvasTexture(moonCanvas);
  moonTex.minFilter = THREE.NearestFilter; moonTex.magFilter = THREE.NearestFilter;
  moonTex.generateMipmaps = false;

  group = new THREE.Group();
  group.userData.dynamic = true; group.userData.noShot = true;
  sphere = new THREE.Mesh(moonGeometry(), new THREE.MeshBasicMaterial({ map: moonTex, vertexColors: true, fog: false }));
  sphere.userData.dynamic = true;
  group.add(sphere);
  haloMat = new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  halo = new THREE.Mesh(new THREE.PlaneGeometry(RADIUS * 4.2, RADIUS * 4.2), haloMat);
  halo.position.z = -RADIUS * 0.3; halo.userData.dynamic = true;
  group.add(halo);
  applyHalo();
  scene.add(group);
  return group;
}

// Redesenha a face (marca da sessao / logo carregada / nome mudou).
export function refreshMoon() {
  if (!moonTex) return;
  drawMoonTexture(logoImg, logoName);
  moonTex.needsUpdate = true;
  applyHalo();
}

// Chamado quando o avatar do canal carrega ou o nome muda (CustomerEvent.updateHeroEmblemTexture).
export function setMoonLogo(img, name) {
  var changed = img !== logoImg || (name || '') !== logoName;
  logoImg = img || null; logoName = name || '';
  if (changed && SESSION.moonBranded) refreshMoon();
}

// Impacto do foguete (HeroFinale): marca a sessao e acende o halo.
export function brandMoon() {
  SESSION.moonBranded = true;
  glow = 1; pulse = 1;
  refreshMoon();
}

export function isMoonTitlePhase(phase) { return phase !== 'inside'; }

// Direcao (unitaria) da lua para a fase atual e posicao no ceu (mundo) vista de `camera`.
// No HUNT o jogador olha para a fachada: a lua fica sobre o telhado (a troca acontece no fade de entrada).
export function moonDirection() { return isMoonTitlePhase(S.phase) || SESSION.huntMode ? DIR_TITLE : DIR_STREET; }
export function moonPosition(camera, out) {
  return out.copy(camera.position).addScaledVector(moonDirection(), DIST);
}
export var MOON_RADIUS = RADIUS, MOON_DIST = DIST;
export function moonObject() { return group; }

// Todo quadro (antes do render): segue a posicao da camera e gira para ela; brilho/pulso do impacto.
export function updateMoon(camera, dt) {
  if (!group) return;
  moonPosition(camera, group.position);
  camera.getWorldPosition(_cam);
  group.lookAt(_cam);
  if (glow > 0 || pulse > 0) {
    dt = dt || 0.016;
    glow = Math.max(0, glow - dt * 0.6);
    pulse = Math.max(0, pulse - dt * 2.2);
    sphere.scale.setScalar(1 + 0.08 * Math.sin(pulse * Math.PI) * pulse);
    applyHalo();
  }
}

// Novo jogo: a lua volta sem logo.
onSessionReset(function() { glow = 0; pulse = 0; if (sphere) sphere.scale.setScalar(1); refreshMoon(); });
