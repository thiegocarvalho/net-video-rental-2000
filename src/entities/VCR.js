import * as THREE from 'three';
import { S } from '../core/State.js';
import { EL, toast } from '../ui/UIManager.js';
import { clunk, vcrMotor } from '../core/Audio.js';
import { dressHand, handMesh, toggleInspect } from '../main.js';
import { onWorldReset } from '../core/World.js';
import { tvGrp, vcrLocalPos, M, setPlayingTapeCase } from '../scenes/Interior.js';
import { t } from '../i18n/index.js';

export var TXT = {
  rewindReminder: t('ent.vcr.rewind_reminder'),
  pause: t('ent.vcr.pause'),
  fastForward: t('ent.vcr.fast_forward'),
  rewinding: t('ent.vcr.rewinding')
};

var tapeGeom = new THREE.BoxGeometry(0.185, 0.024, 0.115);
var deckTapeMesh = new THREE.Mesh(tapeGeom, M.black);
deckTapeMesh.visible = false;
deckTapeMesh.userData.dynamic = true;
if (tvGrp) tvGrp.add(deckTapeMesh);
// Trava as animações de entrada/saída: impede insert duplo e eject durante a animação.
var busy = false;
var gen = 0;   // muda no reset: cancela animacoes de insert/eject em andamento

function setDeckMaterials(t) {
  deckTapeMesh.material = [M.dark, M.dark, t.mFront || M.dark, t.mBack || M.dark, t.mSide || M.dark, M.dark];
  deckTapeMesh.visible = true;
  deckTapeMesh.rotation.set(0, 0, 0);
}

// Anima 0..1 em `ms` via rAF; usa o próprio relógio (o timestamp do rAF pode ser anterior ao t0).
function tween(ms, step, done) {
  var t0 = performance.now(), g = gen;
  var anim = function() {
    if (g !== gen) return;   // resetWorld() cancelou a animacao
    var progress = Math.max(0, Math.min(1, (performance.now() - t0) / ms));
    step(progress);
    if (progress < 1) requestAnimationFrame(anim); else done();
  };
  requestAnimationFrame(anim);
}

function toShelf(t) {
  t.mesh.visible = true;
  t.mesh.position.copy(t.mesh.userData.home.pos);
  t.mesh.rotation.copy(t.mesh.userData.home.rot);
}

// Devolve a fita ejetada para a mão do jogador, ou para a prateleira se a mão já estiver ocupada.
function giveBack(t) {
  if (S.held) toShelf(t);
  else { S.held = t; dressHand(t); handMesh.visible = true; }
}

function finishInsert(t, onComplete) {
  S.inDeck = t;
  S.vcr = 'playing';
  S.loadT = 0;
  S.t = 0;
  S.rewound = false;
  S.tracking = 0;
  S.trackAuto = 0;
  S._lastYtId = null; // força o main a recarregar o vídeo mesmo se for a mesma fita
  EL.deck.classList.add('on');
  S.msg = '';
  if (onComplete) onComplete();
}

export function insert(t, onComplete){
  if (!t || busy) return;
  // Ja tem fita no deck: ela volta sozinha para a prateleira e depois entra a nova.
  if (S.inDeck) {
    if (S.inDeck === t) return;
    eject({ toShelf: true, then: function() { insert(t, onComplete); } });
    return;
  }
  if (S.inspect) toggleInspect();
  S.held = null; handMesh.visible = false; EL.hand.classList.remove('on');
  if (setPlayingTapeCase) setPlayingTapeCase(t);

  if (deckTapeMesh && vcrLocalPos) {
    busy = true;
    setDeckMaterials(t);
    var startZ = vcrLocalPos.z + 0.16;
    var slotZ = vcrLocalPos.z - 0.11;
    deckTapeMesh.position.set(vcrLocalPos.x, vcrLocalPos.y, startZ);
    vcrMotor();
    tween(480, function(progress) {
      if (progress < 0.72) {
        deckTapeMesh.position.z = startZ - (progress / 0.72) * (startZ - slotZ);
        deckTapeMesh.position.y = vcrLocalPos.y;
      } else {
        deckTapeMesh.position.z = slotZ;
        deckTapeMesh.position.y = vcrLocalPos.y - ((progress - 0.72) / 0.28) * 0.022;
      }
    }, function() {
      busy = false;
      clunk();
      deckTapeMesh.visible = false;
      finishInsert(t, onComplete);
    });
  } else {
    clunk();
    finishInsert(t, onComplete);
  }
}

// opts.toShelf: a fita vai direto para a prateleira (troca de fita); opts.then roda ao terminar.
export function eject(opts){
  if (!S.inDeck || busy) return;
  opts = opts || {};
  var done = function(t) {
    if (opts.toShelf) toShelf(t); else giveBack(t);
    if (opts.then) opts.then();
  };
  var t = S.inDeck;
  if (!S.rewound) toast(TXT.rewindReminder);
  S.inDeck = null; S.vcr = 'empty'; EL.deck.classList.remove('on'); S.msg = '';
  S.t = 0; S.tracking = 0; S.trackAuto = 0;
  if (setPlayingTapeCase) setPlayingTapeCase(null);

  if (deckTapeMesh && vcrLocalPos) {
    busy = true;
    setDeckMaterials(t);
    var slotZ = vcrLocalPos.z - 0.11;
    var ejectedZ = vcrLocalPos.z + 0.08;
    deckTapeMesh.position.set(vcrLocalPos.x, vcrLocalPos.y - 0.022, slotZ);
    vcrMotor();
    tween(480, function(progress) {
      if (progress < 0.28) {
        deckTapeMesh.position.y = (vcrLocalPos.y - 0.022) + (progress / 0.28) * 0.022;
        deckTapeMesh.position.z = slotZ;
      } else {
        deckTapeMesh.position.y = vcrLocalPos.y;
        deckTapeMesh.position.z = slotZ + ((progress - 0.28) / 0.72) * (ejectedZ - slotZ);
      }
    }, function() {
      busy = false;
      clunk();
      deckTapeMesh.visible = false;
      done(t);
    });
  } else {
    clunk();
    done(t);
  }
}

export function act(a, down){
  if (a === 'trku') { S.tracking = Math.min(1, S.tracking + .12); return; }
  if (a === 'trkd') { S.tracking = Math.max(-1, S.tracking - .12); return; }
  if (a === 'eject') { eject(); return; }
  if (!S.inDeck || busy) return;
  if (a === 'play') {
    if (S.t >= S.inDeck.dur - 0.05) S.t = 0; // fim da fita: play recomeça em vez de parar na hora
    S.vcr = 'playing'; S.msg = '';
  } else if (a === 'pause') {
    if (S.vcr === 'paused') { act('play'); return; }
    if (S.vcr !== 'playing') return;
    S.vcr = 'paused'; S.msg = TXT.pause;
  } else if (a === 'stop') {
    S.vcr = 'stopped'; S.msg = '';
  } else if (a === 'ff' || a === 'rew') {
    if (down === false) { if (S.vcr === a) act('play'); return; } // soltar o botão só vale se ainda estiver nesse modo
    S.vcr = a; S.msg = a === 'ff' ? TXT.fastForward : TXT.rewinding;
  }
}

// resetWorld(): cancela animacoes em andamento e esvazia o deck (a TV volta ao autoplay no resetter de main.js).
onWorldReset(function() {
  gen++;
  busy = false;
  deckTapeMesh.visible = false;
  S.inDeck = null; S.vcr = 'empty'; S.msg = '';
  S.t = 0; S.tracking = 0; S.trackAuto = 0; S.rewound = true; S.loadT = 0;
  EL.deck.classList.remove('on');
  if (setPlayingTapeCase) setPlayingTapeCase(null);
}, -10);
