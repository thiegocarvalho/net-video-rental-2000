import * as THREE from 'three';

// Coloca um elemento HTML "dentro" de uma tela 3D (TV do fliperama, monitor do computador...).
// O elemento mora numa camada ATRAS do canvas; a tela 3D vira um "buraco" (material alpha 0) e, a cada
// quadro, calculamos o matrix3d (homografia) que encaixa o retangulo de pxW x pxH do elemento nos 4 cantos
// projetados da tela. Sem CSS3D aninhado: o mouse e o teclado chegam ao elemento de verdade.
//
// geom: { center, right, up : THREE.Vector3 (mundo, right/up unitarios), w, h : tamanho da tela em metros }

var _cs = new THREE.Vector3();
var SIGNS = [[-1, 1], [1, 1], [1, -1], [-1, -1]];   // TL, TR, BR, BL

export function createScreenLayer(el, geom, pxW, pxH) {
  el.style.position = 'absolute';
  el.style.left = '0'; el.style.top = '0';
  el.style.transformOrigin = '0 0';
  return {
    el: el, geom: geom, pxW: pxW, pxH: pxH,
    pose: new Float64Array(18), corners: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    xs: [0, 0, 0, 0], ys: [0, 0, 0, 0]
  };
}

// Posiciona o elemento para a camera atual. Retorna false se a tela esta atras da camera.
// So recalcula (e reescreve o estilo) quando a camera ou a janela mudaram desde a ultima vez.
export function placeScreenLayer(layer, camera) {
  var W = window.innerWidth, H = window.innerHeight;
  var me = camera.matrixWorld.elements, same = layer.pose[16] === W && layer.pose[17] === H, k;
  for (k = 0; same && k < 16; k++) if (me[k] !== layer.pose[k]) same = false;
  if (same) return true;

  var g = layer.geom, hw = g.w / 2, hh = g.h / 2, xs = layer.xs, ys = layer.ys, i, v;
  for (i = 0; i < 4; i++) {
    v = layer.corners[i].copy(g.center).addScaledVector(g.right, SIGNS[i][0] * hw).addScaledVector(g.up, SIGNS[i][1] * hh);
    _cs.copy(v).applyMatrix4(camera.matrixWorldInverse);
    if (_cs.z > -camera.near) return false;            // atras da camera
    v.project(camera);
    xs[i] = (v.x * 0.5 + 0.5) * W; ys[i] = (-v.y * 0.5 + 0.5) * H;
  }
  for (k = 0; k < 16; k++) layer.pose[k] = me[k];
  layer.pose[16] = W; layer.pose[17] = H;

  var sx = xs[0] - xs[1] + xs[2] - xs[3], sy = ys[0] - ys[1] + ys[2] - ys[3], a, b, c, d, e, f, gg, hq;
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) {
    a = xs[1] - xs[0]; b = xs[3] - xs[0]; c = xs[0]; d = ys[1] - ys[0]; e = ys[3] - ys[0]; f = ys[0]; gg = 0; hq = 0;
  } else {
    var dx1 = xs[1] - xs[2], dx2 = xs[3] - xs[2], dy1 = ys[1] - ys[2], dy2 = ys[3] - ys[2], den = dx1 * dy2 - dx2 * dy1;
    gg = (sx * dy2 - dx2 * sy) / den; hq = (dx1 * sy - sx * dy1) / den;
    a = xs[1] - xs[0] + gg * xs[1]; b = xs[3] - xs[0] + hq * xs[3]; c = xs[0];
    d = ys[1] - ys[0] + gg * ys[1]; e = ys[3] - ys[0] + hq * ys[3]; f = ys[0];
  }
  var pw = layer.pxW, ph = layer.pxH;
  layer.el.style.transform = 'matrix3d(' + [a / pw, d / pw, 0, gg / pw, b / ph, e / ph, 0, hq / ph, 0, 0, 1, 0, c, f, 0, 1].join(',') + ')';
  return true;
}

// Camera "sentado": em frente a tela, olhando para ela. `fill` = fracao da altura da vista que a tela ocupa.
export function screenView(geom, normal, fillFraction, fovDeg) {
  var dist = (geom.h / fillFraction) / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  return {
    pos: geom.center.clone().addScaledVector(normal, dist),
    yaw: Math.atan2(normal.x, normal.z),
    pitch: -Math.asin(normal.y)
  };
}
