import { fail, TOUCH, $ } from '../ui/UIManager.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

export const MAX_PIXEL_RATIO = 1.5;
// Celular/tablet (TOUCH): telas de 2x-3x com GPU fraca; 1.25 mantem o visual nitido com ~30% menos pixels que 1.5.
export const TOUCH_MAX_PIXEL_RATIO = 1.25;

export let renderer, cssRenderer;

// Single render mode: native resolution, pixel ratio capped for performance.
export function resizeRenderer(w, h) {
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TOUCH ? TOUCH_MAX_PIXEL_RATIO : MAX_PIXEL_RATIO));
  renderer.setSize(w, h);
  if (cssRenderer) cssRenderer.setSize(w, h);
}

export function initRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    fail('não consegui criar o contexto WebGL:\n' + e.message);
    return false;
  }
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1); // alpha:true comeca em 0; so o "buraco" da tela da TV deve ser transparente
  renderer.shadowMap.enabled = false;
  $('#app').appendChild(renderer.domElement);

  cssRenderer = new CSS3DRenderer();
  $('#css-app').appendChild(cssRenderer.domElement);

  return true;
}

export const G = {
  unit: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
  // Real big-box VHS clamshell cases run ~20 x 31 x 4.2cm (W x H x D).
  tape: new THREE.BoxGeometry(0.20, 0.31, 0.042)
};

export function boxAt(sc, w, h, d, mat, x, y, z, ry) {
  var m = new THREE.Mesh(G.unit, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  m.castShadow = false;
  m.receiveShadow = false;
  sc.add(m);
  return m;
}

export function planeAt(sc, w, h, mat, x, y, z, rx, ry) {
  var m = new THREE.Mesh(G.plane, mat);
  m.scale.set(w, h, 1);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  if (ry) m.rotation.y = ry;
  m.castShadow = false;
  m.receiveShadow = false;
  sc.add(m);
  return m;
}

export function freezeMeshes(root) {
  root.traverse(function(o) {
    if (o.isMesh && !o.userData.dynamic) {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    }
  });
}

var gltfLoader = new GLTFLoader();

// r128 GLTFLoader keeps glTF baseColor/emissive factors as LINEAR values, but
// this renderer outputs linear (no sRGB output encoding), so e.g. #F44336
// would display as a saturated (0.91,0.05,0.03) red and dark tones go muddy.
// Convert factors to display-space (sRGB) once per material and make sampled
// baseColor/emissive maps plain (non-decoded) so they match canvas textures.
function fixGltfColors(root) {
  root.traverse(function(o) {
    if (!o.isMesh || !o.material) return;
    var mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(function(m) {
      if (m.userData.srgbFixed) return;
      m.userData.srgbFixed = true;
      if (m.color) m.color.convertLinearToSRGB();
      if (m.emissive) m.emissive.convertLinearToSRGB();
      ['map', 'emissiveMap'].forEach(function(k) {
        if (m[k]) { m[k].encoding = THREE.LinearEncoding; m[k].needsUpdate = true; }
      });
      m.needsUpdate = true;
    });
  });
  return root;
}

// Loads a .gltf/.glb model, returning a Promise for its root Object3D.
export function loadModel(url) {
  return new Promise(function(resolve, reject) {
    gltfLoader.load(url, function(gltf) { resolve(fixGltfColors(gltf.scene)); }, undefined, reject);
  });
}

export function loadGLTF(url) {
  return new Promise(function(resolve, reject) {
    gltfLoader.load(url, function(gltf) { fixGltfColors(gltf.scene); resolve(gltf); }, undefined, reject);
  });
}

// Sketchfab exports arrive at arbitrary scale/origin. Recenters the model on
// X/Z, rests it on y=0, and uniformly scales it so its footprint width
// matches targetWidth (meters) — so it drops into the scene predictably.
export function fitModel(obj, targetWidth) {
  var box = new THREE.Box3().setFromObject(obj);
  var size = box.getSize(new THREE.Vector3());
  obj.scale.setScalar(targetWidth / (size.x || 1));
  box.setFromObject(obj);
  var center = box.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= box.min.y;
  return obj;
}

// Keeps loaded models visually consistent with the rest of the store's
// crisp, un-filtered PS1-era textures instead of Sketchfab's smooth mipmapping.
export function matchStyle(obj) {
  obj.traverse(function(o) {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      if (o.material) {
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function(m) {
          ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'].forEach(function(k) {
            if (m[k]) { m[k].minFilter = THREE.NearestFilter; m[k].magFilter = THREE.NearestFilter; }
          });
        });
      }
    }
  });
  return obj;
}
