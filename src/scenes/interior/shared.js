import * as THREE from 'three';
import { G, matchStyle } from '../../graphics/Engine.js';
import { tex, cv, cached } from '../../core/Utils.js';
import { cardboardStampCanvas, cardboardBottomCanvas } from '../../graphics/Textures.js';

// Helpers compartilhados pelos construtores de cena (PS1: texturas nearest,
// materiais Lambert/Basic, geometria estatica fundida por material).

// Textura de canvas com filtro nearest (tex() ja faz isso); atalho com cache por chave.
export function nearestTex(canvas) {
  var t = tex(canvas);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// Carimbo "MANUFACTURE BY" compartilhado por caixas da prateleira e do chao:
// um canvas, uma textura, um material (antes: 3 de cada).
export function stampMaterial() {
  return cached('stampMat', function() {
    return new THREE.MeshLambertMaterial({
      map: nearestTex(cardboardStampCanvas()),
      transparent: true,
      alphaTest: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  });
}

// Carimbo do fundo da caixa pequena de papelao ("pode ser reciclada por 1 moeda" + simbolo), ver Shelf.js/Cardboard.js.
export function bottomStampMaterial() {
  return cached('bottomStampMat', function() {
    return new THREE.MeshLambertMaterial({
      map: nearestTex(cardboardBottomCanvas()),
      transparent: true,
      alphaTest: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  });
}

// Reduz um canvas desenhado em tamanho grande (Textures.js desenha em px fixos)
// para um canvas pequeno POT, sem suavizacao. Reutiliza `dst` se informado.
export function shrinkInto(src, w, h, dst) {
  dst = dst || cv(w, h);
  var x = dst.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.clearRect(0, 0, w, h);
  x.drawImage(src, 0, 0, src.width, src.height, 0, 0, w, h);
  return dst;
}

// Modelos GLB: filtro nearest + troca PBR (Standard/Physical/Phong) por Lambert.
var _lambertCache = new Map();
// Caixa de colisao de um adereco (TV, computador, ventilador...) medida do proprio modelo.
// Entra em ctx.solids com `y0` (base) e `h` (topo): so os itens arremessados usam; `prop: true`
// faz o collide() do jogador ignorar (o jogador nao alcanca o que esta em cima do balcao).
export function addPropSolid(ctx, obj, pad) {
  pad = pad == null ? 0.015 : pad;
  obj.updateWorldMatrix(true, true);
  var box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return null;
  var s = { x1: box.min.x - pad, x2: box.max.x + pad, z1: box.min.z - pad, z2: box.max.z + pad,
            y0: box.min.y, h: box.max.y + pad, prop: true };
  ctx.solids.push(s);
  return s;
}

export function psxModel(model) {
  matchStyle(model);
  model.traverse(function(o) {
    if (!o.isMesh || !o.material) return;
    // Sem normais o Lambert nao recebe luz nenhuma (ex.: car.glb) e o modelo fica preto.
    if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    var conv = function(m) {
      if (!(m.isMeshStandardMaterial || m.isMeshPhongMaterial)) return m;
      var c = _lambertCache.get(m);
      if (!c) {
        c = new THREE.MeshLambertMaterial({
          map: m.map || null, color: m.color ? m.color.clone() : 0xffffff,
          emissive: m.emissive ? m.emissive.clone() : 0x000000,
          emissiveMap: m.emissiveMap || null,
          transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest,
          side: m.side, vertexColors: m.vertexColors
        });
        c.name = m.name;
        _lambertCache.set(m, c);
        m.dispose();
      }
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  return model;
}

// Funde uma lista de malhas que usam O MESMO material (qualquer BufferGeometry, indexada ou nao) em uma
// unica malha filha de `parent`, no espaco local dele, e remove as originais. Usado para o que mergeStatic
// nao cobre: pecas de GLB estaticos, luminarias/halos/faixas de sombra, pinheiros e postes.
// Atributos fundidos: position, normal, uv e color (os dois ultimos so se TODAS as malhas os tiverem).
// Retorna a malha nova (ou a unica da lista, sem mexer, se houver so uma).
var _mm = new THREE.Matrix4(), _mInv = new THREE.Matrix4(), _mN = new THREE.Matrix3(), _mv = new THREE.Vector3();
export function mergeMeshes(list, parent) {
  if (!list || !list.length) return null;
  if (list.length === 1) return list[0];
  var mat = list[0].material;
  parent.updateWorldMatrix(true, false);
  _mInv.copy(parent.matrixWorld).invert();
  var hasUv = true, hasCol = true, nv = 0, ni = 0;
  list.forEach(function(o) {
    var g = o.geometry;
    if (!g.attributes.uv) hasUv = false;
    if (!g.attributes.color) hasCol = false;
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  });
  var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
  var uv = hasUv ? new Float32Array(nv * 2) : null, col = hasCol ? new Float32Array(nv * 3) : null;
  var idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), vo = 0, io = 0;
  list.forEach(function(o) {
    o.updateWorldMatrix(true, false);
    _mm.multiplyMatrices(_mInv, o.matrixWorld);
    _mN.getNormalMatrix(_mm);
    var g = o.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color, I = g.index;
    for (var i = 0; i < P.count; i++) {
      _mv.fromBufferAttribute(P, i).applyMatrix4(_mm).toArray(pos, (vo + i) * 3);
      if (N) _mv.fromBufferAttribute(N, i).applyMatrix3(_mN).normalize().toArray(nor, (vo + i) * 3);
      if (uv) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); }
      if (col) { col[(vo + i) * 3] = C.getX(i); col[(vo + i) * 3 + 1] = C.getY(i); col[(vo + i) * 3 + 2] = C.getZ(i); }
    }
    if (I) for (var j = 0; j < I.count; j++) idx[io + j] = I.getX(j) + vo;
    else for (var k = 0; k < P.count; k++) idx[io + k] = k + vo;
    io += I ? I.count : P.count; vo += P.count;
  });
  var bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bg.setIndex(new THREE.BufferAttribute(idx, 1));
  bg.computeBoundingSphere();
  bg.computeBoundingBox();
  var mesh = new THREE.Mesh(bg, mat);
  mesh.name = 'merged';
  mesh.renderOrder = list[0].renderOrder;
  mesh.visible = list[0].visible;
  mesh.castShadow = mesh.receiveShadow = false;
  parent.add(mesh);
  list.forEach(function(o) {
    if (o.parent) o.parent.remove(o);
    // geometria propria (nao compartilhada G.unit/G.plane) vira lixo: libera
    if (o.geometry !== G.unit && o.geometry !== G.plane && !o.geometry.userData.shared) o.geometry.dispose();
  });
  return mesh;
}

// GLB estatico: funde as malhas de cada material em uma (old_tv.glb tinha ~50 draw calls, 8 materiais).
// Ignora invisiveis, transparentes, materiais em array, skinned/morph, `userData.dynamic` e o que `skip(o)`
// devolver true. Retorna { before, after } (malhas candidatas / malhas resultantes).
export function mergeModel(root, skip) {
  root.updateMatrixWorld(true);
  var groups = new Map();
  root.traverse(function(o) {
    if (!o.isMesh || o.isSkinnedMesh || !o.visible || Array.isArray(o.material) || !o.material) return;
    if (o.material.transparent || o.userData.dynamic || o.morphTargetInfluences) return;
    if (!o.geometry.attributes.position || (o.geometry.groups && o.geometry.groups.length > 1)) return;
    for (var p = o.parent; p && p !== root; p = p.parent) if (p.userData.dynamic || !p.visible) return;
    if (skip && skip(o)) return;
    var key = o.material.uuid + (o.geometry.attributes.uv ? 'u' : '') + (o.geometry.attributes.color ? 'c' : '');
    var g = groups.get(key);
    if (!g) groups.set(key, g = []);
    g.push(o);
  });
  var before = 0, after = 0;
  groups.forEach(function(list) { before += list.length; after++; if (list.length > 1) mergeMeshes(list, root); });
  return { before: before, after: after };
}

// Funde caixas/planos estaticos (G.unit / G.plane) em uma BufferGeometry por
// material e por "balde" (interior / exterior, para manter o frustum culling).
// Ignora: dinamicos, invisiveis (hitboxes), com userData.type, transparentes,
// materiais com polygonOffset e materiais em array. Retorna {merged, removed}.
export function mergeStatic(root, bucketOf) {
  root.updateMatrixWorld(true);
  var groups = new Map(), victims = [];
  root.traverse(function(o) {
    if (!o.isMesh || !o.visible || o.parent == null) return;
    if (o.geometry !== G.unit && o.geometry !== G.plane) return;
    var m = o.material;
    if (!m || Array.isArray(m) || m.transparent || m.polygonOffset) return;
    if (o.userData.dynamic || o.userData.type || o.renderOrder) return;
    for (var p = o.parent; p; p = p.parent) if (p.userData && p.userData.dynamic) return;
    var key = m.uuid + '|' + bucketOf(o);
    var g = groups.get(key);
    if (!g) groups.set(key, g = { mat: m, items: [] });
    g.items.push(o);
    victims.push(o);
  });
  var nm = new THREE.Matrix3(), v = new THREE.Vector3();
  groups.forEach(function(g) {
    var nv = 0, ni = 0;
    g.items.forEach(function(o) { nv += o.geometry.attributes.position.count; ni += o.geometry.index.count; });
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    var idx = new Uint32Array(ni), vo = 0, io = 0;
    g.items.forEach(function(o) {
      var geo = o.geometry, P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, I = geo.index;
      nm.getNormalMatrix(o.matrixWorld);
      for (var i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld).toArray(pos, (vo + i) * 3);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize().toArray(nor, (vo + i) * 3);
        uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i);
      }
      for (var j = 0; j < I.count; j++) idx[io + j] = I.getX(j) + vo;
      vo += P.count; io += I.count;
    });
    var bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    bg.setIndex(new THREE.BufferAttribute(idx, 1));
    bg.computeBoundingSphere();
    var mesh = new THREE.Mesh(bg, g.mat);
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.name = 'merged';
    root.add(mesh);
  });
  victims.forEach(function(o) { o.parent.remove(o); });
  return { merged: groups.size, removed: victims.length };
}
