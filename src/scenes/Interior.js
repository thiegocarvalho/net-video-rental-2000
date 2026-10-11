import * as THREE from 'three';
import { freezeMeshes } from '../graphics/Engine.js';
import { carpetTex, wallTex, laminateTex, ceilingTileTex, counterTopTex, counterPanelTex, shelfWoodTex, mdfTex } from '../graphics/Textures.js';
import { buildRoomShell } from './interior/RoomShell.js';
import { buildShelf } from './interior/Shelf.js';
import { buildCounter } from './interior/Counter.js';
import { buildFurnishings } from './interior/Furnishings.js';
import { buildExterior } from './Exterior.js';
import { mergeStatic } from './interior/shared.js';

// Orquestrador: monta o interior da loja e o exterior unificado no mesmo mapa
export var RW = 5.2, RD = 8.2, RH = 4.2;

export var scene = new THREE.Scene();
scene.background = new THREE.Color(0x020305); // Céu mais escuro
scene.fog = new THREE.FogExp2(0x06070a, 0.034); // Neblina leve: escurece o fundo da loja e a rua
var moonLight = new THREE.DirectionalLight(0x2b3d54, 0.3);
var ambientLight = new THREE.AmbientLight(0x0a1018, 0.8);
scene.add(ambientLight);
moonLight.position.set(-10, 15, 10);
scene.add(moonLight);
export var camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);

var mdfMap = mdfTex();
export var M = {
  wall: new THREE.MeshLambertMaterial({ map: wallTex(), color: 0xc4c0b3 }),
  floor: new THREE.MeshLambertMaterial({ map: carpetTex() }),
  ceil: new THREE.MeshLambertMaterial({ map: ceilingTileTex(), color: 0xd2cdbf, side: THREE.DoubleSide }),
  mdf: new THREE.MeshLambertMaterial({ map: mdfMap, color: 0xe6e1d4 }),
  mdf2: new THREE.MeshLambertMaterial({ map: mdfMap, color: 0xcfc9ba }),
  wood: new THREE.MeshLambertMaterial({ map: laminateTex() }),                // testeiras e demais
  shelfWood: new THREE.MeshLambertMaterial({ map: shelfWoodTex() }),         // corpo das prateleiras de fitas
  counterBody: new THREE.MeshLambertMaterial({ map: counterPanelTex() }),    // frente do balcao
  counterTop: new THREE.MeshLambertMaterial({ map: counterTopTex() }),
  dark: new THREE.MeshLambertMaterial({ color: 0x2a2b2d }),
  plast: new THREE.MeshLambertMaterial({ color: 0xd6d0bc }),
  black: new THREE.MeshLambertMaterial({ color: 0x141416 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff3d6, fog: false }),
  trim: new THREE.MeshLambertMaterial({ color: 0x1c1f22 }),
  warmLamp: new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
};

// Estado compartilhado que os construtores de móveis preenchem: colisão
// (solids), alvos de clique/raycast (interactables) e posições na prateleira
// onde as fitas entram (slots). Passado explicitamente pra cada construtor
// em vez de cada um importar/mutar um global escondido.
export var solids = [], interactables = [], slots = [];
// shelfBoxes: caixas de papelao da prateleira de baixo (viram itens em entities/Cardboard.js).
export var shelfBoxes = [];
var ctx = { solids: solids, interactables: interactables, slots: slots, shelfBoxes: shelfBoxes, shelfBoxReady: [] };

var shell = buildRoomShell(scene, M, RW, RD, RH, ctx);
export var setLights = shell.setLights;
export function setDoorOpen(r) { if(shell.setDoorOpen) shell.setDoorOpen(r); }
export var doorLeft = shell.doorLeft;
export var doorRight = shell.doorRight;
export var doorHitbox = shell.doorHitbox;
export var frontWallSolid = shell.frontWallSolid;

var furnishings = buildFurnishings(scene, M, ctx);
export var posterMeshes = furnishings.posterMeshes;
export var placardTex = furnishings.placardTex;
export var placard2Tex = furnishings.placard2Tex;
export var bannerMesh = furnishings.bannerMesh;
export var deskPlaqueMesh = furnishings.deskPlaqueMesh;
export var updateClock = furnishings.updateClock;
export var updateSharePoster = furnishings.updateSharePoster;
export var sharePosterMesh = furnishings.sharePosterMesh;
export var binInfo = furnishings.binInfo;
export var binCtl = furnishings.binCtl;
export var arcade = furnishings.arcade;

var counter = buildCounter(scene, M, ctx);
export var SCR = counter.SCR;
export var SCRP = counter.SCRP;
export var screenCanvas = counter.screenCanvas;
export var screenCtx = counter.screenCtx;
export var screenTex = counter.screenTex;
export var screenMesh = counter.screenMesh;
export var compScreen = counter.compScreen;
export var screenTexMat = counter.screenTexMat;
export var screenHoleMat = counter.screenHoleMat;
export var tvGlow = counter.tvGlow;
export var WATCH_POS = counter.WATCH_POS;
export var WATCH_YAW = counter.WATCH_YAW;
export var ringBell = counter.ringBell;
export var tvGrp = counter.tvGrp;
export var vcrLocalPos = counter.vcrLocalPos;
export var corners = counter.corners;
export var updateFan = counter.updateFan;
export var fan = counter.fan;
export var setPlayingTapeCase = counter.setPlayingTapeCase;

// Prateleira 1 (Lançamentos - 15 fitas com testeira integrada)
buildShelf(scene, M, ctx, -RW / 2 + .28, 2.0, Math.PI / 2, 5, 3, furnishings.placardMat);
// Prateleira 2 (Acervo Retrô - 15 fitas com testeira integrada)
buildShelf(scene, M, ctx, -RW / 2 + .28, 4.0, Math.PI / 2, 5, 3, furnishings.placard2Mat);
// Resolve quando os modelos das caixas das duas prateleiras carregaram (falha de rede: resolve com o que houver).
export var shelfBoxesReady = Promise.all(ctx.shelfBoxReady.map(function(p) { return p.catch(function() {}); }));

// Fachada externa estilo Blockbuster + calçada + estacionamento integrados no mapa
var exterior = buildExterior(scene, M, ctx);
export var carAlarm = exterior.carAlarm;
export var car = exterior.car;
export var recycleBin = exterior.recycle;
export var streetLamps = exterior.streetLamps;

// Funde caixas/planos estaticos em 1 malha por material (interior x exterior).
mergeStatic(scene, function(o) { return o.matrixWorld.elements[14] > 6.3 ? 'ext' : 'int'; });

freezeMeshes(scene);
