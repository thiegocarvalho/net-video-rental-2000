import { fail, stage, TOUCH, EL, $, toast, initEL, updateToast, setTxt, setHTML, DEBUG } from './ui/UIManager.js';
import { S } from './core/State.js';
import { audioInit, A, clunk, beep, bellDing, switchClick, keyClick, audioState, canSound, gulpSound, doorLockSound, doorJiggleSound, explosionSound, glitchSound, pageFlipSound, carAlarmStart, carAlarmStop, carAlarmListener, isTensionActive, fanHumUpdate } from './core/Audio.js';
import { setResumeProvider, consumeResume } from './i18n/boot.js';
import { loadRSS, proxyImageUrl, clearFeedCache } from './services/FeedApi.js';
import { makeTape, hydrate, setTapeAvatar, refreshTape } from './entities/Tape.js';
import { insert, act } from './entities/VCR.js';
import { drawFX, syncCRT, hideCRT } from './graphics/ScreenFX.js';
import { initRenderer, renderer, cssRenderer, resizeRenderer, G, loadModel, fitModel, matchStyle } from './graphics/Engine.js';
import { throwCan, throwTape, releaseTape, updateCans, ejectBinTapes } from './entities/ThrownCan.js';
import { blinkState } from './core/Blink.js';
import { unlock, mountAchievementList, unmountAchievementList, setAchievementsPaused } from './core/Achievements.js';
import { onWorldReset, resetWorld, resetSession, markSessionStart, SESSION } from './core/World.js';
import { psxModel } from './scenes/interior/shared.js';
import { pushOut } from './core/Collision.js';
import { createScreenLayer, placeScreenLayer, screenView } from './ui/ScreenLayer.js';
import { updateMix, setDuck, tvVolume, distanceGain, shopOcclusion, mix } from './core/AudioMix.js';
import { ARCADE_URL, GTA_URL } from './core/Config.js';
import { initYtPlayer, ytTick, ytMute, ytUnmute, ytSetVolume, ytPause } from './services/YouTubePlayer.js';
import { placardCanvas, createPaperPoster, bannerCanvas, TXT as TEX } from './graphics/Textures.js';
import { tex, safeDisposeTexture, cmdHash } from './core/Utils.js';
import {
  scene, camera, M, RW, RD,
  solids, interactables, slots,
  posterMeshes, placardTex, placard2Tex, bannerMesh,
  SCRP, screenCtx, screenTex, tvGlow,
  WATCH_POS, WATCH_YAW, setLights, ringBell, corners, updateFan, updateClock, tvGrp,
  setDoorOpen, updateSharePoster, doorLeft, doorRight, doorHitbox, frontWallSolid,
  setPlayingTapeCase, carAlarm, binInfo, binCtl, screenMesh, screenTexMat, screenHoleMat, arcade, compScreen, fan,
  car, recycleBin, shelfBoxes, shelfBoxesReady, streetLamps
} from './scenes/Interior.js';
// Pista do SAFE: a queda do cartaz de indicacao e a revelacao do poster sovietico vivem no proprio modulo que
// monta os dois (scenes/interior/Furnishings.js); Interior.js so re-exporta o que a cena precisa.
import { triggerSharePosterDrop, updateSharePosterDrop } from './scenes/interior/Furnishings.js';
import { initCardboard, updateCardboard, cardboardLabel, useCardboard, HELD_BOX_TARGETS, returnHeldBox, throwHeldBox, inspectLabel, dressBoxHand, cardboardCanEnv } from './entities/Cardboard.js';
import { initPig, updatePig, pigLabel, usePig, closeFile, onFanSwitched } from './entities/Pig.js';
import { initPostitZoom, openPostit, closePostit } from './ui/PostitZoom.js';
import { initCabinet, updateCabinet, cabinetLabel, useCabinet, inspectCabinetTarget, HELD_KEY_TARGETS, dropHeldKey, keyInspectLabel, dressKeyHand, TXT as CAB_TXT } from './entities/Cabinet.js';
import { initShotgun, updateShotgun, shotgunLabel, useShotgun, HELD_GUN_TARGETS, fireShotgun, dropHeldGun, safeCommand, TXT as GUN_TXT } from './entities/Shotgun.js';
import { initCustomer, updateCustomer, updateCustomerBadge, triggerCustomerDirectInteraction, spawnCustomerNow, heroEdgeTick, isHeroActive, isCustomerCineActive } from './entities/CustomerEvent.js';
import { updateMoon } from './entities/Moon.js';
import { initHunt, updateHunt, huntCommand } from './entities/Hunt.js';
import { TXT as FW_TXT } from './entities/Fireworks.js';
import { initTouchControls, touchMove, resetTouchControls } from './ui/TouchControls.js';
import * as THREE from 'three';
import { t, plural } from './i18n/index.js';

// Textos visiveis ao jogador: valores vem do i18n (src/i18n/<locale>/main.js, prefixo 'main.').
// O idioma e fixado no load (trocar recarrega a pagina), entao o objeto e avaliado uma vez. Partes dinamicas viram funcoes.
var SIGNATURE = 'MANUFACTURE BY @THIEGOCARVALHO';   // assinatura: igual em todos os idiomas
// '• <b>Rotulo:</b> texto' (marcacao no codigo, textos no dicionario)
function labeled(labelKey, text) { return '• <b>' + t(labelKey) + '</b> ' + text; }
var TXT = {
  webglFail: t('main.webgl_fail'),
  hand: {
    title: t('main.hand.title'),
    can: t('main.hand.can')
  },
  look: {
    shelfSlotLabel: t('main.look.shelf_slot_label'),
    handsFull: t('main.look.hands_full'),
    take: t('main.look.take'),
    shelfSlot: t('main.look.shelf_slot'),
    storeTape: t('main.look.store_tape'),
    vcr: t('main.look.vcr'),
    playingTag: t('main.look.playing_tag'),
    swapTape: t('main.look.swap_tape'),
    insert: t('main.look.insert'),
    eject: t('main.look.eject'),
    use: t('main.look.use'),
    postit: t('main.look.postit'),
    read: t('main.look.read'),
    tv: t('main.look.tv'),
    mutedTag: t('main.look.muted_tag'),
    watchWithSound: t('main.look.watch_with_sound'),
    watch: t('main.look.watch'),
    fan: t('main.look.fan'),
    turnOff: t('main.look.turn_off'),
    turnOn: t('main.look.turn_on'),
    lightSwitch: t('main.look.light_switch'),
    lightsOn: t('main.look.lights_on'),
    lightsOff: t('main.look.lights_off'),
    bell: t('main.look.bell'),
    ring: t('main.look.ring'),
    computer: t('main.look.computer'),
    access: t('main.look.access'),
    tapeCase: t('main.look.tape_case'),
    fridge: t('main.look.fridge'),
    fridgeSub: t('main.look.fridge_sub'),
    drink: t('main.look.drink'),
    takeCan: t('main.look.take_can'),
    arcade: t('main.look.arcade'),
    arcadeOff: t('main.look.arcade_off'),
    play: t('main.look.play'),
    seeNotice: t('main.look.see_notice'),
    door: t('main.look.door'),
    doorExit: function(n) { return t('main.look.door_exit', { n: n }); },
    leaveStore: t('main.look.leave_store'),
    doorLocked: function(n) { return t('main.look.door_locked') + ' ' + (n > 0 ? t('main.look.door_tries', { n: n }) : ''); },
    tryOpen: t('main.look.try_open'),
    sharePoster: t('main.look.share_poster'),
    sharePosterSub: t('main.look.share_poster_sub'),
    share: t('main.look.share'),
    shelfBoxes: t('main.look.shelf_boxes'),
    shelfBoxesSub: SIGNATURE,
    inspect: t('main.look.inspect'),
    customer: t('main.look.customer'),
    customerSub: t('main.look.customer_sub'),
    talk: t('main.look.talk'),
    trash: t('main.look.trash'),
    discardCan: t('main.look.discard_can')
  },
  toast: {
    pickTapeFirst: t('main.toast.pick_tape_first'),
    handsFullTape: t('main.toast.hands_full_tape'),
    vcrFront: t('main.toast.vcr_front'),
    pickTapeShelf: t('main.toast.pick_tape_shelf'),
    tvFront: t('main.toast.tv_front'),
    caseFront: t('main.toast.case_front'),
    caseOnCounter: t('main.toast.case_on_counter'),
    doorAlreadyBroken: t('main.toast.door_already_broken'),
    computerFront: t('main.toast.computer_front'),
    arcadeOff: t('main.toast.arcade_off'),
    doorLocked1: t('main.toast.door_locked_1'),
    doorLocked2: t('main.toast.door_locked_2'),
    shelfBoxes: t('main.toast.shelf_boxes', { signature: SIGNATURE }),
    cluePoster: t('ent.shotgun.clue'),        // a frase pintada no poster sovietico (mesma chave da pista)
    doorExploded: t('main.toast.door_exploded'),
    binCreaks: t('main.toast.bin_creaks'),
    binCracking: t('main.toast.bin_cracking'),
    binAlmost: t('main.toast.bin_almost'),
    binBroke: t('main.toast.bin_broke'),
    computerBooting: t('main.toast.computer_booting'),
    feedFallback: t('main.toast.feed_fallback'),
    feedCached: t('main.toast.feed_cached'),
    doorLockedBehind: function(handle) { return t('main.toast.door_locked_behind', { handle: handle }); },
    newStock: function(handle) { return t('main.toast.new_stock', { handle: handle }); },
    linkCopiedClipboard: t('main.toast.link_copied_clipboard'),
    linkCopied: t('main.toast.link_copied'),
    autoTracking: t('main.toast.auto_tracking')
  },
  bell: {
    count: function(n) { return n + ' / 25'; },
    overload: t('main.bell.overload'),
    critical: t('main.bell.critical'),
    max: t('main.bell.max')
  },
  sound: { on: t('main.sound.on'), muted: t('main.sound.muted') },
  share: {
    pageTitle: function(handle) { return t('main.share.page_title', { handle: handle }); },
    copy: t('main.share.copy'),
    copied: t('main.share.copied'),
    // Textos ricos por rede: levam o nome do canal ({channel}) e emojis retro (AJUSTES_FINAIS.md §9.3.3)
    whatsapp: function(channel) { return t('main.share.whatsapp', { channel: channel }); },
    telegram: function(channel) { return t('main.share.telegram', { channel: channel }); },
    twitter: function(channel) { return t('main.share.twitter', { channel: channel }); },
    nativeTitle: t('main.share.native_title'),
    nativeText: t('main.share.native_text'),
    ogDescription: function(channel) { return t('main.share.og_description', { channel: channel }); }
  },
  feed: {
    empty: t('main.feed.empty'),
    invalid: t('main.feed.invalid'),
    count: function(n) { return plural('main.feed.count', n); },
    loadFail: t('main.feed.load_fail'),
    error: t('main.feed.error')
  },
  vcr: { end: t('main.vcr.end'), start: t('main.vcr.start') },
  btn: {
    drink: t('main.btn.drink'),
    stow: t('main.btn.stow'),
    exit: t('main.btn.exit'),
    throwIt: t('main.btn.throw'),
    dropTape: t('main.btn.drop_tape'),
    returnBox: t('main.btn.return_box'),
    use: t('main.btn.use'),
    check: t('main.btn.check'),
    turn: t('main.btn.turn'),
    cancel: t('main.btn.cancel'),
    playPause: t('main.btn.play_pause'),
    rewind: t('main.btn.rewind'),
    eject: t('main.btn.eject'),
    forward: t('main.btn.forward'),
    standUp: t('main.btn.stand_up'),
    keyMouse: t('main.btn.key_mouse'),
    keyClick: t('main.btn.key_click')
  },
  term: {
    backTouch: t('main.term.back_touch'),            // botao do rodape no touch (sem [ESC])
    headerTitle: 'RENTAL-OS Terminal v1.996 (C) 1996 RENTAL CORP.',
    headerSpecs: t('main.term.header_specs'),
    headerHint: t('main.term.header_hint', { cmd: '<b>HELP</b>' }),
    prompt: t('ui.term.prompt') + ' ',
    loadingProgram: t('main.term.loading_program'),
    unknown: function(cmd) { return t('main.term.unknown', { cmd: cmd }); },
    dirLines: [
      t('main.term.dir.volume'),
      t('main.term.dir.serial'),
      t('main.term.dir.directory'),
      '',
      ' COMMAND  COM        54.619 09-07-96  10:24a',
      ' CONFIG   SYS           128 09-07-96  10:25a',
      ' AUTOEXEC BAT           256 09-07-96  10:26a',
      ' ZTA      EXE    1.428.096 10-21-97   4:20p',
      ' HELP     EXE        24.512 09-07-96  11:15a',
      t('main.term.dir.secret_file'),
      t('main.term.dir.files'),
      t('main.term.dir.free')
    ],
    emptyStock: t('main.term.empty_stock'),
    needLink: t('main.term.need_link'),
    querying: t('main.term.querying'),
    feedEmpty: t('main.term.feed_empty'),
    loaded: function(n) { return plural('main.term.loaded', n); },
    error: t('main.term.error'),
    cacheCleared: function(n) { return t('main.term.cache_cleared', { n: n }); },
    cacheEmpty: t('main.term.cache_empty'),
    helpPhrase: t('main.term.help_phrase'),
    helpOhNo: t('main.term.help_oh_no'),
    helpDisabled: t('main.term.help_disabled'),
    // Lixo de "kernel panic": nao traduz (e ruido, nao texto).
    glitchLines: [
      '0x80F4A9 ERR_MEM_OVERFLOW: 4F 32 99 A1 %$#&*!',
      'SYNTAX CORRUPTED AT SECTOR 09: [??!¿??#$@&]',
      'SYSTEM_FAILURE: KERNEL PANIC — STACK SMASHED',
      '47 6c 69 74 63 68 20 64 65 74 65 63 74 65 64...',
      '▒░▓█ 7A#9! ERROR DISK FAULT █▓░▒',
      '#@$%^&*&*()!~?><:"{}[]+=_-|/\\ FATAL EXCEPTION'
    ],
    bootLines: [
      'RENTAL-OS BIOS v1.996 (C) 1996 RENTAL CORP.',
      'CPU: 486DX2-66   RAM: 640K OK / 16MB XMS OK',
      t('main.term.boot.drives'),
      t('main.term.boot.port'),
      t('main.term.boot.loading'),
      t('main.term.boot.restarted')
    ]
  },
  // Creditos dinamicos da aba CREDITOS (mesmo formato de Shotgun/Fireworks TXT.credit).
  credits: {
    channelFallback: t('main.credits.channel_fallback'),
    reserveTitle: t('main.credits.reserve_title'),
    reserveBadge: t('main.credits.reserve_badge'),
    reserveLines: ['• ' + t('main.credits.reserve_line')],
    ownerTitle: function(authorUpper) { return t('main.credits.owner_title', { author: authorUpper }); },
    ownerBadge: t('main.credits.owner_badge'),
    ownerChannel: function(author, linkHtml) { return labeled('main.credits.label.channel', author + (linkHtml ? ' · ' + linkHtml : '')); },
    ownerRights: function(author) { return '• ' + t('main.credits.owner_rights', { author: '<b>' + author + '</b>' }); },
    ownerPlayer: '• ' + t('main.credits.owner_player'),
    arcade: {
      title: t('main.credits.arcade.title'),
      badge: '© SNK · INTERNET ARCHIVE',
      lines: [
        labeled('main.credits.label.game', t('main.credits.arcade.game')),
        labeled('main.credits.label.hosting', t('main.credits.arcade.hosting')),
        labeled('main.credits.label.use', t('main.credits.arcade.use'))
      ],
      sourceLabel: t('main.credits.label.source'),
      url: 'https://archive.org/details/arcade_kof97'
    },
    gta: {
      title: t('main.credits.gta.title'),
      badge: '© DMA DESIGN · INTERNET ARCHIVE',
      lines: [
        labeled('main.credits.label.game', t('main.credits.gta.game')),
        labeled('main.credits.label.hosting', t('main.credits.gta.hosting')),
        labeled('main.credits.label.use', t('main.credits.gta.use'))
      ],
      sourceLabel: t('main.credits.label.source'),
      url: 'https://archive.org/details/grand-theft-auto-1997-dma-design'
    }
  }
};

initEL();

if (!initRenderer()) {
  fail(TXT.webglFail);
} else {
  stage('Renderer e UI criados');
  initCustomer(scene, interactables);
}

export var P={pos:new THREE.Vector3(0,1.65,5.5),yaw:0,pitch:0};
// Globais que o proprio jogo le via window (CustomerEvent.js/HeroFinale.js): sempre expostos.
window.P = P;
window.camera = camera;
// Atalhos de depuracao/testes: so com ?debug.
if (DEBUG) {
  window.S = S;
  window.spawnCustomerNow = spawnCustomerNow;
  window.scene = scene;
}
export var keys={};
export var WATCH={pos:WATCH_POS,yaw:WATCH_YAW,pitch:0};
WATCH.pitch=Math.atan2(SCRP.y-WATCH.pos.y,0.44);
export var savedView=null;

function collide(p){
  var R=.34,i;
  for(i=0;i<solids.length;i++) pushOut(solids[i], p, R);

  if (!S.doorExploded) {
    p.x=Math.max(-RW/2+.45,Math.min(RW/2-.45,p.x));
    p.z=Math.max(-RD/2+2+.45,Math.min(RD/2+2-.45,p.z));
  } else {
    // Porta explodida: o vão da porta fica entre x = -0.82 e +0.82 em z = 6.10
    if (p.z <= 6.0) {
      p.z = Math.max(-RD/2+2+.45, p.z);
      if (Math.abs(p.x) > 0.82) {
        p.z = Math.min(RD/2+2-.45, p.z);
        p.x = Math.max(-RW/2+.45, Math.min(RW/2-.45, p.x));
      }
    } else {
      // Exterior (calçada e estacionamento)
      p.x = Math.max(-17.5, Math.min(17.5, p.x));
      p.z = Math.min(26.0, p.z);
      if (p.z < 6.62 && Math.abs(p.x) > 0.82) {
        p.z = 6.62; // Bloqueia atravessar a fachada por fora: a parede de madeira ocupa z 6.12 a 6.24 (a calcada ja e mais larga), mais o raio do jogador e folga para a camera nao entrar na espessura
      }
    }
  }
}

// Espacos da prateleira: alvos invisiveis, um por vaga. So valem para guardar a fita da mao numa vaga vazia.
var slotHitGeo = new THREE.BoxGeometry(0.23, 0.34, 0.12);
slots.forEach(function(sl, i) {
  var hit = new THREE.Mesh(slotHitGeo, M.dark);
  hit.position.copy(sl.world);
  hit.rotation.set(0, sl.ry, 0);
  hit.visible = false;
  hit.userData = { type: 'shelf_slot', idx: i, label: TXT.look.shelfSlotLabel };
  scene.add(hit);
  interactables.push(hit);
});
function slotOccupied(i) {
  var sw = slots[i].world;
  for (var k = 0; k < S.tapes.length; k++) {
    var m = S.tapes[k];
    if (m.visible && m.position.distanceToSquared(sw) < 0.0025) return true;
  }
  return false;
}

// Com algo na mao, so os alvos que fazem sentido para aquele objeto ficam interativos; o resto do
// cenario e ignorado (E sem alvo = soltar a fita / beber a lata).
// Moedas, porquinho e o papel nao ocupam as maos: valem com qualquer item.
var HELD_TAPE_TARGETS = { vcr: 1, tv: 1, shelf_slot: 1, coin: 1, pig: 1, pig_car: 1, rusbe_paper: 1 };
var HELD_CAN_TARGETS = { fridge: 1, trash_can: 1, coin: 1, pig: 1, pig_car: 1, rusbe_paper: 1 };

// Cabine do caixa, de frente para o monitor.
function atComputer() {
  return P.pos.x >= -2.05 && P.pos.x <= -1.10 && P.pos.z >= -1.60 && P.pos.z <= 0.10;
}

var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hovered = null;
var pickHits = [];   // reaproveitado: pick() roda a 20 Hz
function pick(nx, ny){
  if (S.terminalOpen || S.shareModalOpen || S.doorModalOpen || S.playingArcade || S.playingGta || S.fileOpen || S.cutscene || SESSION.huntMode) return null;
  ndc.set(nx || 0, ny || 0);
  ray.setFromCamera(ndc, camera);
  var hits = pickHits;
  hits.length = 0;
  ray.intersectObjects(interactables, false, hits);
  var found = null;
  for (var i = 0; i < hits.length; i++) {
    var obj = hits[i].object;
    var t = obj.userData ? obj.userData.type : null;
    // TV, VCR e estojo da fita: so na frente do balcao
    if ((t === 'tv' || t === 'vcr' || t === 'playing_tape_case') && P.pos.z < 0.35) continue;
    if (S.held && !HELD_TAPE_TARGETS[t]) continue;
    if (S.heldCan && !HELD_CAN_TARGETS[t]) continue;
    if (S.heldBox && !HELD_BOX_TARGETS[t]) continue;
    if (S.heldGun && !HELD_GUN_TARGETS[t]) continue;
    if (S.heldKey && !HELD_KEY_TARGETS[t]) continue;
    // Espaco da prateleira: so com uma fita na mao e a vaga vazia (senao o raio segue para a fita)
    if (t === 'shelf_slot' && (!S.held || slotOccupied(obj.userData.idx))) continue;
    if (t === 'computer' && !atComputer()) continue;
    if (hits[i].distance < 3.2) { found = obj; break; }
  }
  hits.length = 0;   // nao segura referencias ate o proximo pick
  return found;
}

var _escDiv = document.createElement('div');
function esc(t) { _escDiv.textContent = t == null ? '' : String(t); return _escDiv.innerHTML; }
// esc() escapa & < > mas NAO as aspas, entao nao serve dentro de um atributo: um " no
// valor escaparia do atributo e abriria espaco para onerror=/onclick=. Use escAttr ali.
function escAttr(t) { return esc(t).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
var LABEL_NONE = {desc:'',act:''};
function labelFor(o){
  if(!o)return LABEL_NONE;
  var u=o.userData;
  var ext = cardboardLabel(o) || pigLabel(o) || shotgunLabel(o) || cabinetLabel(o);
  if (ext) return ext;
  var L = TXT.look;
  if(u.type==='tape')return {
    desc: '<b>'+esc(u.label)+'</b><br><span class="v">'+esc(u.data.handle)+' · '+esc(u.data.date)+'</span>',
    act: S.held ? L.handsFull : L.take
  };
  if(u.type==='shelf_slot')return { desc: '<b>' + L.shelfSlot + '</b>', act: L.storeTape };
  if(u.type==='vcr')return {
    desc: '<b>' + L.vcr + '</b>' + (S.vcr === 'playing' && S.inDeck ? ' <span class="v">' + L.playingTag + '</span>' : ''),
    act: S.held ? (S.inDeck ? L.swapTape : L.insert) : (S.inDeck ? L.eject : L.use)
  };
  if(u.type==='tv')return {
    desc: '<b>' + L.tv + '</b>' + (S.tvMuted && S.vcr === 'playing' ? ' <span class="warn">' + L.mutedTag + '</span>' : ''),
    act: S.held ? (S.inDeck ? L.swapTape : L.insert) : (S.tvMuted ? L.watchWithSound : L.watch)
  };
  if(u.type==='fan')return { desc: '<b>' + L.fan + '</b>', act: fan.on ? L.turnOff : L.turnOn };
  if(u.type==='postit')return { desc: '<b>' + L.postit + '</b>', act: L.read };
  if(u.type==='lightswitch')return { desc: '<b>' + L.lightSwitch + '</b>', act: S.lightsOff ? L.lightsOn : L.lightsOff };
  if(u.type==='bell')return { desc: '<b>' + L.bell + '</b>', act: L.ring };
  if(u.type==='computer')return { desc: '<b>' + L.computer + '</b>', act: L.access };
  if(u.type==='playing_tape_case')return {
    desc: '<b>' + L.tapeCase + '</b>' + (S.inDeck ? '<br><span class="v">' + esc(S.inDeck.title) + '</span>' : ''),
    act: L.eject
  };
  if(u.type==='fridge')return {
    desc: '<b>' + L.fridge + '</b><br><span class="warn">' + L.fridgeSub + '</span>',
    act: S.heldCan ? L.drink : L.takeCan
  };
  if(u.type==='arcade'){
    var isFriday = (new Date()).getDay() === 5;
    return {
      desc: '<b>' + L.arcade + '</b>' + (isFriday ? '' : '<br><span class="warn">' + L.arcadeOff + '</span>'),
      act: isFriday ? L.play : L.seeNotice
    };
  }
  if(u.type==='frontdoor'){
    var tries = S.doorTries || 0;
    if (tries >= 3) return {
      desc: '<b>' + L.door + '</b><br><span class="v">' + L.doorExit(tries) + '</span>',
      act: L.leaveStore
    };
    return {
      desc: '<b>' + L.door + '</b><br><span class="warn">' + L.doorLocked(tries) + '</span>',
      act: L.tryOpen
    };
  }
  if(u.type==='share_poster')return {
    desc: '<b>' + L.sharePoster + '</b><br><span class="v">' + L.sharePosterSub + '</span>',
    act: L.share
  };
  // Poster sovietico com a pista do SAFE: so da para ler depois que o cartaz de indicacao cai (o cartaz o cobre).
  if(u.type==='clue_poster')return { desc: '<b>' + esc(u.label) + '</b>', act: L.read };
  if(u.type==='shelf_boxes')return {
    desc: '<b>' + L.shelfBoxes + '</b><br><span class="v">' + L.shelfBoxesSub + '</span>',
    act: L.inspect
  };
  if(u.type==='customer')return {
    desc: '<b>' + L.customer + '</b><br><span class="warn">' + L.customerSub + '</span>',
    act: L.talk
  };
  if(u.type==='trash_can')return { desc: '<b>' + L.trash + '</b>', act: S.heldCan ? L.discardCan : L.inspect };
  return LABEL_NONE;
}

export var handMesh = new THREE.Mesh(G.tape, M.black);
handMesh.visible = false;
handMesh.userData.dynamic = true;
camera.add(handMesh);

export var canHandMesh = new THREE.Group();
canHandMesh.visible = false;
canHandMesh.userData.dynamic = true;
camera.add(canHandMesh);
scene.add(camera);

export function setupViewmodelMesh(mesh) {
  mesh.renderOrder = 999;
  mesh.traverse(function(c) {
    if (c.isMesh) {
      c.renderOrder = 999;
      if (c.material) {
        var mats = Array.isArray(c.material) ? c.material : [c.material];
        c.material = mats.map(function(m) {
          var mc = m.clone();
          mc.depthTest = false;
          mc.depthWrite = false;
          mc.transparent = true; // three desenha todos os opacos antes dos transparentes: sem isso cartazes (transparent) cobrem a mao
          return mc;
        });
        if (c.material.length === 1) c.material = c.material[0];
      }
    }
  });
}
setupViewmodelMesh(handMesh);

loadModel('models/soda_can.glb').then(function(canModel) {
  fitModel(canModel, 0.08);
  matchStyle(canModel);
  canModel.traverse(function(c) {
    if (c.isMesh) setupViewmodelMesh(c);
  });
  canHandMesh.add(canModel);
}).catch(function(err) {
  console.warn('Falha ao carregar soda_can.glb:', err);
});

export function takeCan() {
  if (S.held) stow();
  S.heldCan = true;
  canHandMesh.visible = true;
  EL.hand.classList.add('on');
  EL.hand.innerHTML = TXT.hand.title + '<br><b class="v">' + TXT.hand.can + '</b>';
  canSound();
}

var drinkT = 0;

export function drinkCan() {
  if (!S.heldCan || drinkT > 0) return;
  drinkT = 0.001;
  gulpSound();
}

export function stowCan() {
  if (!S.heldCan) return;
  drinkT = 0;
  S.heldCan = false;
  canHandMesh.visible = false;
  EL.hand.classList.remove('on');
}

export function dressHand(t){
  if(S.heldCan) stowCan();
  handMesh.geometry = G.tape;
  handMesh.material = [t.mOpen || M.black, t.mSide || M.black, t.mTop || M.black, t.mBottom || M.black, t.mFront || M.black, t.mBack || M.black].map(function(m) {
    var mc = m.clone();
    mc.depthTest = false;
    mc.depthWrite = false;
    mc.transparent = true; // ver setupViewmodelMesh
    return mc;
  });
  EL.hand.classList.add('on');
  EL.hand.innerHTML=TXT.hand.title+'<br><b class="v">'+esc(t.title)+'</b>';
}
export function stow(){
  if(!S.held)return;
  if(S.inspect)toggleInspect();
  var m=S.held.mesh;m.visible=true;
  m.position.copy(m.userData.home.pos);m.rotation.copy(m.userData.home.rot);
  S.held=null;handMesh.visible=false;EL.hand.classList.remove('on');
  clunk();
}
// Joga a lata: ela voa em arco, quica e some (lixeira = some la dentro; chao = pisca 3x e some).
var throwOrigin = new THREE.Vector3(), throwDir = new THREE.Vector3();
export function throwHeldCan() {
  if (!S.heldCan || drinkT > 0) return;
  camera.getWorldDirection(throwDir);
  throwOrigin.copy(camera.position).addScaledVector(throwDir, 0.4);
  throwOrigin.y -= 0.12;
  if (!throwCan(scene, throwOrigin, throwDir)) return;
  drinkT = 0;
  S.heldCan = false;
  canHandMesh.visible = false;
  EL.hand.classList.remove('on');
  clunk();
}
// Joga a fita da mao: ela nao some, fica no chao (ou empilhada na lixeira).
export function throwHeldTape() {
  if (!S.held) return;
  if (S.inspect) toggleInspect();
  var m = S.held.mesh;
  camera.getWorldDirection(throwDir);
  throwOrigin.copy(camera.position).addScaledVector(throwDir, 0.45);
  throwOrigin.y -= 0.12;
  S.held = null;
  handMesh.visible = false;
  EL.hand.classList.remove('on');
  throwTape(m, throwOrigin, throwDir, scene);
  clunk();
}
var canEnv = {
  solids: solids, bin: binInfo,
  doorOpen: function() { return S.doorExploded; },
  onFloor: function() { clunk(); },
  onBin: function(kind) { if(kind==='tape') unlock('wall_e'); else if(++SESSION.cansInBin>=3) unlock('space_jam'); clunk(); }
};
// Caixa azul de reciclagem entra na fisica dos arremessos (Cardboard.js).
cardboardCanEnv.recycle = recycleBin;
Object.assign(canEnv, cardboardCanEnv);
if (DEBUG) window.canStep = function(dt) { updateCans(dt, canEnv); };   // teste da fisica de itens jogados sem renderizar
initCardboard({ scene: scene, camera: camera, interactables: interactables, recycle: recycleBin, shelfBoxes: shelfBoxes, ready: shelfBoxesReady });
initPig({ scene: scene, camera: camera, interactables: interactables, solids: solids, car: car, carAlarm: carAlarm,
  stopCarAlarm: function() { stopCarAlarm(); }, lockPointer: function() { if (!TOUCH) lockPointer(); } });
initShotgun({ scene: scene, camera: camera, interactables: interactables, bin: binInfo, binGrp: binCtl.grp, streetLamps: streetLamps, car: car,
  recoil: function(a) { P.pitch = Math.min(1.2, P.pitch + a); } });
initPostitZoom({ lockPointer: function() { if (!TOUCH) lockPointer(); } });
initCabinet({ scene: scene, camera: camera, interactables: interactables, solids: solids, lockPointer: function() { if (!TOUCH) lockPointer(); } });
// Modo HUNT (final): cenario, mira e tela final ficam em entities/Hunt.js e ui/FinalScreen.js.
initHunt({ scene: scene, camera: camera, P: P, canvas: renderer.domElement,
  lockPointer: function() { if (!TOUCH) lockPointer(); },
  openDoorGap: function() { openDoorGap(); },
  restart: function() { returnToTitle({ newGame: true }); },
  finalEnv: { renderCredits: function() { renderCredits(); }, channelUrl: function(m) { return channelUrl(m); }, shareUrl: function() { return getShareUrl(); } } });
export function toggleInspect(){
  if(!S.held && !S.heldBox && !S.heldKey){toast(TXT.toast.pickTapeFirst);return;}
  S.inspect=!S.inspect;
  if(S.inspect){S.insRot.x=0;S.insRot.y=0;
    EL.hand.innerHTML=S.held ? '<b class="v">'+esc(S.held.title)+'</b>' : S.heldKey ? keyInspectLabel() : inspectLabel();}
  else if(S.held) dressHand(S.held);
  else if(S.heldKey) dressKeyHand();
  else dressBoxHand();
}

function use(o){
  if(!o) {
    if(S.held) stow();
    else if(S.heldCan) drinkCan();
    else if(S.heldBox) returnHeldBox();
    else if(S.heldKey) dropHeldKey();
    return;
  }
  var u=o.userData;
  if (useCardboard(o) || usePig(o) || useShotgun(o) || useCabinet(o)) return;
  if(u.type==='tape'){
    if(S.heldCan) stowCan();
    if(S.held){toast(TXT.toast.handsFullTape);return;}
    releaseTape(o, binInfo);
    S.held=u.data;o.visible=false;handMesh.visible=true;dressHand(u.data);
    clunk();}
  else if(u.type==='shelf_slot'){
    if(!S.held) return;
    if(S.inspect) toggleInspect();
    var sl=slots[u.idx], sm=S.held.mesh;
    sm.visible=true;
    sm.rotation.order='XYZ';
    sm.position.copy(sl.world);sm.rotation.set(0,sl.ry,0);
    sm.userData.home={pos:sm.position.clone(),rot:sm.rotation.clone()}; // essa vaga passa a ser a casa da fita
    S.held=null;handMesh.visible=false;EL.hand.classList.remove('on');
    clunk();}
  else if(u.type==='fridge'){
    if(S.heldCan) drinkCan();
    else takeCan();}
  else if(u.type==='vcr'){
    if (P.pos.z < 0.35) { toast(TXT.toast.vcrFront); return; }
    if(S.heldCan) stowCan();
    if(S.held) { insert(S.held); if(S.inDeck) enterWatch(); } // se ja houver fita no deck, ela volta sozinha para a prateleira
    else if(S.inDeck) act('eject');
    else toast(TXT.toast.pickTapeShelf);}
  else if(u.type==='tv'){
    if (P.pos.z < 0.35) { toast(TXT.toast.tvFront); return; }
    if(S.heldCan) stowCan();
    if(S.tvMuted) unmuteTv();
    if(S.held) { insert(S.held); if(S.inDeck) enterWatch(); }
    else enterWatch();}
  else if(u.type==='playing_tape_case'){
    if (P.pos.z < 0.35) { toast(TXT.toast.caseFront); return; }
    if(S.inDeck) {
      act('eject');
    } else {
      toast(TXT.toast.caseOnCounter);
    }
  }
  else if(u.type==='fan'){
    fan.on = !fan.on;
    switchClick();
    onFanSwitched(fan.on);
    if(fan.on) unlock('twister');}
  else if(u.type==='lightswitch'){
    S.lightsOff = !S.lightsOff;
    switchClick();
    if(setLights) setLights(!S.lightsOff);
    if(S.lightsOff) unlock('lights_out');}
  else if(u.type==='bell'){
    if(ringBell) ringBell();
    if(S.doorExploded){
      bellDing(1.0);
      toast(TXT.toast.doorAlreadyBroken);
    } else {
      S.bellTaps = (S.bellTaps || 0) + 1;
      if(S.bellTaps < 15){
        bellDing(1.0);
      } else if(S.bellTaps < 25){
        var pitch = 1.0 + (S.bellTaps - 14) * 0.07;
        bellDing(pitch);
        showBellCounter(S.bellTaps);
      } else if(S.bellTaps >= 25){
        bellDing(1.9);
        explodeDoor();
      }
    }
  }
  else if(u.type==='computer'){
    if (!atComputer()) {
      toast(TXT.toast.computerFront);
      return;
    }
    openTerminal();}
  else if(u.type==='arcade'){
    if (!arcade.open) {
      toast(TXT.toast.arcadeOff);   // fora de servico: so o aviso, sem nenhum som
    } else {
      enterArcade();
    }
  }
  else if(u.type==='frontdoor'){
    S.doorTries = (S.doorTries || 0) + 1;
    unlock('home_alone');
    var doorStrength = Math.min(1.8, 0.8 + 0.3 * S.doorTries);
    doorJiggleSound(doorStrength);
    startDoorRattle(doorStrength);
    if(S.doorTries === 1) {
      toast(TXT.toast.doorLocked1);
    } else if(S.doorTries === 2) {
      toast(TXT.toast.doorLocked2);
    } else {
      openDoorModal();
    }
  }
  else if(u.type==='share_poster'){
    openShareModal();}
  else if(u.type==='clue_poster'){
    pageFlipSound();
    toast(TXT.toast.cluePoster);}
  else if(u.type==='postit'){
    openPostit();}
  else if(u.type==='shelf_boxes'){
    clunk();
    toast(TXT.toast.shelfBoxes);}
  else if(u.type==='customer'){
    triggerCustomerDirectInteraction();}
  else if(u.type==='trash_can'){
    if(S.heldCan){
      stowCan();
      clunk();
    } else {
      inspectBin();
    }
  }
}

export function getShareUrl() {
  try {
    var url = new URL(window.location.origin + window.location.pathname);
    if (S.handle && S.handle !== '@canal') {
      url.searchParams.set('c', S.handle);
    } else {
      var currentParams = new URLSearchParams(window.location.search);
      var c = currentParams.get('c') || currentParams.get('channel_id') || currentParams.get('playlist_id');
      if (c) url.searchParams.set('c', c);
    }
    return url.toString();
  } catch(e) {
    return window.location.href;
  }
}

// Torna absoluta qualquer URL (relativa ou nao): og:/twitter: exigem URL absoluta (AJUSTES_FINAIS.md §9.3.2).
function absUrl(u) {
  if (!u) return '';
  try { return new URL(u, window.location.href).toString(); } catch(e) { return ''; }
}
function setMeta(sel, value) {
  if (!value) return;
  var el = document.querySelector(sel);
  if (el) el.setAttribute('content', value);          // setAttribute: nunca innerHTML com dado de feed
}

// Metatags dinamicas por canal/playlist: titulo, descricao, URL canonica e (quando ha) a capa da 1a fita.
export function updateMetaTags(handle, thumb) {
  var ch = handle || S.handle || '@canal';
  var title = TXT.share.pageTitle(ch);
  var desc = TXT.share.ogDescription(ch);
  var url = absUrl(getShareUrl());
  document.title = title;
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[property="og:description"]', desc);
  setMeta('meta[name="twitter:description"]', desc);
  setMeta('meta[property="og:url"]', url);
  var canon = document.querySelector('link[rel=canonical]');
  if (canon && url) canon.setAttribute('href', url);
  var img = absUrl(thumb);
  if (img) {
    setMeta('meta[property="og:image"]', img);
    setMeta('meta[property="og:image:secure_url"]', img);
    setMeta('meta[name="twitter:image"]', img);
  }
}

export function openShareModal() {
  if (S.shareModalOpen) return;
  S.shareModalOpen = true;
  if (document.exitPointerLock) try { document.exitPointerLock(); } catch(e){}

  var modal = document.getElementById('share-modal');
  if (modal) modal.style.display = 'flex';

  var shareUrl = getShareUrl();
  var chElem = document.getElementById('share-channel-name');
  if (chElem) chElem.textContent = S.handle || '@canal';

  var inp = document.getElementById('share-url-input');
  if (inp) inp.value = shareUrl;

  var copyMsg = document.getElementById('share-copy-msg');
  if (copyMsg) copyMsg.style.display = 'none';

  var btnCopy = document.getElementById('share-btn-copy');
  if (btnCopy) {
    btnCopy.textContent = TXT.share.copy;
    btnCopy.style.background = '#0a381a';
  }

  var qrCont = document.getElementById('share-modal-qr');
  if (qrCont && window.QRCode) {
    qrCont.innerHTML = '';
    try {
      new window.QRCode(qrCont, {
        text: shareUrl,
        width: 180,
        height: 180,
        colorDark: '#0e1118',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } catch(e) {
      console.warn('Falha no QRCode do modal:', e);
    }
  }

  var btnNative = document.getElementById('share-btn-native');
  if (btnNative) {
    btnNative.style.display = (navigator && navigator.share) ? 'flex' : 'none';
  }

  bellDing();
}

export function closeShareModal() {
  if (!S.shareModalOpen) return;
  S.shareModalOpen = false;
  var modal = document.getElementById('share-modal');
  if (modal) modal.style.display = 'none';
  if (!TOUCH && S.phase === 'inside' && !S.watching && !S.terminalOpen && !S.playingArcade && !S.playingGta) {
    lockPointer();
  }
}

export function openDoorModal() {
  if (S.doorModalOpen) return;
  S.doorModalOpen = true;
  if (document.exitPointerLock) {
    try { document.exitPointerLock(); } catch(e){}
  }
  var modal = document.getElementById('door-modal');
  if (modal) modal.style.display = 'flex';
  beep(880, 0.08);
}

export function closeDoorModal() {
  if (!S.doorModalOpen) return;
  S.doorModalOpen = false;
  var modal = document.getElementById('door-modal');
  if (modal) modal.style.display = 'none';
  if (!TOUCH && S.phase === 'inside' && !S.watching && !S.terminalOpen && !S.shareModalOpen && !S.playingArcade && !S.playingGta) {
    lockPointer();
  }
}

// Volta ao form. opts.newGame (fim do HUNT): zera tambem a sessao (achievements etc.); senao so o mundo.
export function returnToTitle(opts) {
  if (opts && opts.newGame) resetSession(); else resetWorld({ reason: 'title' });

  S.doorTries = 0;
  S.phase = 'outside';
  if (document.exitPointerLock) {
    try { document.exitPointerLock(); } catch(e){}
  }

  ytPause();

  document.body.classList.remove('playing');
  var hud = document.getElementById('hud');
  if (hud) hud.classList.remove('on');

  var bootEl = document.getElementById('boot');
  if (bootEl) bootEl.style.display = 'flex';
  var cardEl = document.getElementById('card');
  if (cardEl) {
    cardEl.style.transition = 'opacity .4s';
    cardEl.style.opacity = '1';
    cardEl.style.pointerEvents = 'auto';
  }
  var btGo = document.getElementById('btGo');
  if (btGo) btGo.disabled = false;

  // Camera de volta na fachada (as portas ja foram fechadas pelo resetWorld)
  camera.position.set(0, 1.85, 12.2);
  camera.lookAt(0, 2.6, 6.0);
}

export function unmuteTv() {
  S.tvMuted = false;
  var muteInd = document.getElementById('yt-mute-indicator');
  if(muteInd) muteInd.style.display = 'none';
  if(!A.on) {
    A.on = true;
    var sndBtn = document.getElementById('snd');
    if(sndBtn) sndBtn.textContent = TXT.sound.on;
  }
  ytUnmute();
  ytSetVolume(S.watching ? 100 : Math.round(Math.max(0, 100 - (camera.position.distanceTo(SCRP) / 7.0) * 100)));
}
window.unmuteTv = unmuteTv;

export function muteTv() {
  S.tvMuted = true;
  var muteInd = document.getElementById('yt-mute-indicator');
  if(muteInd) muteInd.style.display = 'flex';
  ytMute();
}
if (DEBUG) window.muteTv = muteTv;

export function toggleTvMute() {
  if(S.tvMuted) unmuteTv();
  else muteTv();
}
if (DEBUG) window.toggleTvMute = toggleTvMute;

var currentCatalog = [];

export function setTerminalTab(tab) {
  var pCredits = document.getElementById('term-panel-credits');
  var pCatalog = document.getElementById('term-panel-catalog');
  var pCli = document.getElementById('term-panel-cli');
  var pAch = document.getElementById('term-panel-ach');
  var tabAch = document.getElementById('term-tab-ach');
  var tabCredits = document.getElementById('term-tab-credits');
  var tabCatalog = document.getElementById('term-tab-catalog');
  var tabCli = document.getElementById('term-tab-cli');

  if(pCredits) pCredits.style.display = tab === 'credits' ? 'block' : 'none';
  if(pCatalog) pCatalog.style.display = tab === 'catalog' ? 'flex' : 'none';
  if(pCli) pCli.style.display = tab === 'cli' ? 'block' : 'none';
  if(pAch) pAch.style.display = tab === 'ach' ? 'block' : 'none';
  if(tab === 'ach') mountAchievementList(pAch); else unmountAchievementList();

  function styleTab(btn, active) {
    if(!btn) return;
    btn.style.background = active ? '#0a381a' : '#031308';
    btn.style.color = active ? '#00ff66' : '#18803c';
    btn.style.textShadow = active ? '0 0 5px rgba(0,255,102,0.5)' : 'none';
  }

  styleTab(tabCredits, tab === 'credits');
  styleTab(tabCatalog, tab === 'catalog');
  styleTab(tabCli, tab === 'cli');
  styleTab(tabAch, tab === 'ach');

  if(tab === 'cli') {
    initCliPrompt();
  }
}

var cliInitialized = false;
function initCliPrompt() {
  var history = document.getElementById('term-cli-history');
  var input = document.getElementById('term-cli-input');
  if (history && !cliInitialized) {
    cliInitialized = true;
    history.innerHTML =
      '<div style="color:#00ff66; margin-bottom:4px;">' + TXT.term.headerTitle + '</div>' +
      '<div style="color:#1da84c; margin-bottom:6px;">' + TXT.term.headerSpecs + '</div>' +
      '<div style="color:#ffd700; margin-bottom:8px;">' + TXT.term.headerHint + '</div>';
  }
  if (input && !TOUCH) {   // touch: o teclado virtual so abre quando o jogador toca no prompt
    setTimeout(function() { input.focus(); }, 60);
  }
}

// Hashes DJB2 das tres entradas secretas do terminal (ver cmdHash em core/Utils.js).
// Nomes neutros de proposito: o fonte publicado nao deve revelar o que se digita.
var CMD_GAME = 'b88c934', CMD_VAULT = '7c9dc944', CMD_CHASE = '7c981744';

function runCliCommand(rawCmd) {
  var history = document.getElementById('term-cli-history');
  var input = document.getElementById('term-cli-input');
  var panel = document.getElementById('term-panel-cli');
  if (!history) return;
  if (helpSeq.active) { if (input) input.value = ''; return; }   // sequencia do HELP em curso: entradas ignoradas

  var cmd = (rawCmd || '').trim();
  var cmdLower = cmd.toLowerCase();
  var huntOut = null;

  var line = document.createElement('div');
  line.style.cssText = 'color:#00ff66; margin-top:5px;';
  line.textContent = TXT.term.prompt + cmd;
  history.appendChild(line);

  if (!cmdLower) {
    // so Enter: apenas ecoa o prompt
  } else if (cmdLower === 'cls' || cmdLower === 'clear') {
    history.innerHTML = '';
  // As tres entradas secretas sao comparadas por cmdHash (DJB2) para que a palavra a digitar
  // nao apareca em texto plano no fonte: buscar por ela no DevTools nao acha o easter egg.
  } else if (cmdHash(cmdLower) === CMD_GAME) {
    var out = document.createElement('div');
    out.style.cssText = 'color:#ffd700; margin:4px 0;';
    out.textContent = TXT.term.loadingProgram;
    history.appendChild(out);
    beep(880, 0.1);
    setTimeout(function() {
      openGta();
    }, 550);
  } else if (cmdHash(cmdLower) === CMD_VAULT) {
    var safeRes = safeCommand();
    var out = document.createElement('div');
    out.style.cssText = 'color:' + (safeRes.ok ? '#ffd700' : '#1da84c') + '; margin:4px 0;';
    out.textContent = safeRes.text;
    history.appendChild(out);
    beep(safeRes.ok ? 660 : 340, 0.1);
    if (safeRes.ok) setTimeout(function() { if (S.terminalOpen) closeTerminal(); }, 700);
  } else if (cmdHash(cmdLower) === CMD_CHASE && (huntOut = huntCommand())) {   // so com o armario aberto; senao cai no "desconhecido"
    var out = document.createElement('div');
    out.style.cssText = 'color:#ff5555; margin:4px 0; font-weight:bold;';
    out.textContent = huntOut;
    history.appendChild(out);
    beep(180, 0.2);
  } else if (cmdLower === 'help' || cmdLower === 'ajuda' || cmdLower === '?') {
    if (SESSION.helpUsed) {
      var out = document.createElement('div');
      out.style.cssText = 'color:#ff5555; margin:4px 0;';
      out.textContent = TXT.term.helpDisabled;
      history.appendChild(out);
      beep(220, 0.12);
    } else {
      startHelpSequence(history);
    }
  } else if (cmdLower.replace(/\s+/g, ' ') === 'cache clear') {
    var out = document.createElement('div');
    out.style.cssText = 'color:#ffd700; margin:4px 0;';
    out.textContent = clearCacheText();
    history.appendChild(out);
    beep(1000, 0.06);
  } else if (cmdLower === 'dir') {
    var out = document.createElement('div');
    out.style.cssText = 'color:#22ff77; margin:4px 0; font-size:10.5px;';
    out.innerHTML = TXT.term.dirLines.join('<br>');
    history.appendChild(out);
  } else {
    var out = document.createElement('div');
    out.style.cssText = 'color:#ff5555; margin:3px 0;';
    out.textContent = TXT.term.unknown(cmd);
    history.appendChild(out);
    beep(340, 0.1);
  }

  if (input) input.value = '';
  if (panel) panel.scrollTop = panel.scrollHeight;
}

// HELP de uso unico: digita -> glitch -> reboot do computador -> terminal volta ao inicio.
// helpSeq.active bloqueia entradas e re-disparo; cancelHelpSequence() (closeTerminal/resetWorld) limpa tudo.
var helpSeq = { active: false, timers: [], overlay: null, shakeT: 0, cardTransform: '', cardFilter: '' };

function helpAt(fn, ms) { helpSeq.timers.push(setTimeout(fn, ms)); }

function helpScramble(str, p) {
  var pool = '▒░▓█#@$%&!?/\\<>{}';
  var o = '';
  for (var i = 0; i < str.length; i++) o += (str[i] !== ' ' && str[i] !== '\n' && Math.random() < p) ? pool[(Math.random() * pool.length) | 0] : str[i];
  return o;
}

function cancelHelpSequence() {
  if (!helpSeq.active) return;
  helpSeq.timers.forEach(clearTimeout); helpSeq.timers.length = 0;
  if (helpSeq.shakeT) { clearInterval(helpSeq.shakeT); helpSeq.shakeT = 0; }
  if (helpSeq.overlay && helpSeq.overlay.parentNode) helpSeq.overlay.parentNode.removeChild(helpSeq.overlay);
  helpSeq.overlay = null;
  var card = document.getElementById('term-card');
  if (card) { card.style.transform = helpSeq.cardTransform; card.style.filter = helpSeq.cardFilter; }
  helpSeq.active = false;
  setAchievementsPaused(false);
}

function startHelpSequence(history) {
  if (helpSeq.active) return;
  SESSION.helpUsed = true;                  // marcado no inicio: nao re-dispara nem se cancelarem no meio
  helpSeq.active = true;
  setAchievementsPaused(true);
  var card = document.getElementById('term-card');
  var panel = document.getElementById('term-panel-cli');
  if (card) { helpSeq.cardTransform = card.style.transform; helpSeq.cardFilter = card.style.filter; }
  function scroll() { if (panel) panel.scrollTop = panel.scrollHeight; }

  var out = document.createElement('div');
  out.style.cssText = 'color:#fff; margin:6px 0; font-weight:bold; font-size:12px;';
  history.appendChild(out);

  // 1. digitacao da mensagem inteira; o texto fica na tela, depois "Oh nao..." e so entao o glitch
  var full = TXT.term.helpPhrase, n = 0;
  function typeStep() {
    n++;
    out.textContent = full.slice(0, n);
    keyClick();
    scroll();
    if (n < full.length) helpAt(typeStep, full[n - 1] === '\n' ? 420 : /[.;]/.test(full[n - 1]) ? 300 : 34);   // pausa curta nas frases
    else helpAt(ohNo, 2200);                                                     // tempo para ler
  }
  helpAt(typeStep, 250);

  function ohNo() {
    var tail = '\n\n' + TXT.term.helpOhNo, k = 0;
    function step() {
      k++;
      out.textContent = full + tail.slice(0, k);
      keyClick();
      scroll();
      if (k < tail.length) helpAt(step, 70);
      else helpAt(glitchPhase, 2000);
    }
    step();
  }

  // 2. glitch: texto embaralhado, RGB deslocado, tremor do card, ruido, linhas de erro
  function glitchPhase() {
    var base = out.textContent, t0 = performance.now();
    glitchSound();
    helpSeq.shakeT = setInterval(function() {
      var k = Math.min(1, (performance.now() - t0) / 1400);
      var d = 3 + k * 9, off = 2 + k * 5;
      out.textContent = helpScramble(base, 0.15 + k * 0.7);
      out.style.textShadow = (-off) + 'px 0 #ff0055, ' + off + 'px 0 #00e5ff';
      if (card) {
        card.style.transform = 'translate(' + ((Math.random() - 0.5) * d).toFixed(1) + 'px,' + ((Math.random() - 0.5) * d).toFixed(1) + 'px)';
        card.style.filter = 'hue-rotate(' + ((Math.random() * 120 - 60) | 0) + 'deg) contrast(1.3)';
      }
      if (Math.random() < 0.3) glitchSound();
    }, 55);
    var colors = ['#ff0055', '#00e5ff', '#ffea00', '#ff3333', '#bf55ec'];
    TXT.term.glitchLines.forEach(function(txt, i) {
      helpAt(function() {
        var g = document.createElement('div');
        var c = colors[i % colors.length];
        g.style.cssText = 'color:' + c + '; font-size:10px; font-weight:bold; letter-spacing:1px; text-shadow:0 0 5px ' + c + ';';
        g.textContent = txt;
        history.appendChild(g);
        scroll();
      }, 150 + i * 190);
    });
    helpAt(blackout, 1500);
  }

  // 3. tela preta + beep de POST + boot do RENTAL-OS
  function blackout() {
    clearInterval(helpSeq.shakeT); helpSeq.shakeT = 0;
    if (card) { card.style.transform = helpSeq.cardTransform; card.style.filter = helpSeq.cardFilter; }
    var ov = document.createElement('div');
    ov.style.cssText = 'position:absolute; inset:0; z-index:30; background:#000; color:#22ff77; font-family:var(--mono); font-size:11.5px; line-height:1.5; padding:16px; white-space:pre-wrap; overflow:hidden;';
    if (card) card.appendChild(ov);
    helpSeq.overlay = ov;
    glitchSound();
    helpAt(function() { beep(1000, 0.28); }, 900);                  // beep unico de POST
    TXT.term.bootLines.forEach(function(line, i) {
      helpAt(function() { ov.textContent += (i ? '\n' : '') + line; }, 1500 + i * 380);
    });
    helpAt(finish, 1500 + TXT.term.bootLines.length * 380 + 500);
  }

  // 4. terminal volta ao estado inicial
  function finish() {
    history.innerHTML = '';
    cliInitialized = false;
    setTerminalTab('cli');                                           // recria o cabecalho e foca o input
    var inp = document.getElementById('term-cli-input'); if (inp) inp.value = '';
    cancelHelpSequence();                                            // remove o overlay, restaura o card e retoma os popups
    beep(1100, 0.08);
  }
}

// Contador da campainha (15x a 25x): na 25a a porta explode.
var bellCounterTimer = null;
function showBellCounter(count) {
  var el = document.getElementById('bell-counter');
  var numEl = document.getElementById('bell-counter-num');
  var msgEl = document.getElementById('bell-counter-msg');
  var titleEl = document.getElementById('bell-counter-title');
  if (!el || !numEl) return;

  var t = Math.min(1.0, Math.max(0.0, (count - 15) / 10)); // 0.0 em 15x até 0.9 em 24x
  // Dourado do HUD -> vermelho do HUD
  var color = 'rgb(' + Math.round(212 - t * 48) + ',' + Math.round(173 - t * 123) + ',' + Math.round(74 - t * 31) + ')';

  el.style.display = 'block';
  el.style.setProperty('--bc', color);
  numEl.textContent = TXT.bell.count(count);

  if (msgEl) msgEl.textContent = count < 20 ? TXT.bell.overload : count < 24 ? TXT.bell.critical : TXT.bell.max;

  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');   // pulso a cada toque

  if (bellCounterTimer) clearTimeout(bellCounterTimer);
  bellCounterTimer = setTimeout(function() {
    if (el && !S.doorExploded) el.style.display = 'none';
  }, 3500);
}

// Destrocos da porta explodida
var debrisList = [], debrisGone = false;
var DEBRIS_LIFETIME = 6; // segundos ate os destrocos piscarem (ver core/Blink.js)
var DEBRIS_MATS = {
  glass: new THREE.MeshBasicMaterial({ color: 0x99ddff, transparent: true, opacity: 0.85 }),
  frame: new THREE.MeshLambertMaterial({ color: 0x1f2022 }),
  spark: new THREE.MeshBasicMaterial({ color: 0xffbb00 })
};
var shakeTime = 0;
var sightShake = 0;
// Clarao de cor + tremor quando o jogador ve o cliente: pisca vermelho/ciano e inverte as cores por instantes.
window.sightFX = function() {
  sightShake = 0.5;
  var f = document.getElementById('sight-flash');
  if (f) { f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  var app = document.getElementById('app');
  if (app) { app.classList.remove('sight-glitch'); void app.offsetWidth; app.classList.add('sight-glitch'); }
};
var doorExplodedTime = 0;
function spawnExplosionDebris() {
  var debrisMatGlass = DEBRIS_MATS.glass, debrisMatFrame = DEBRIS_MATS.frame, debrisMatSpark = DEBRIS_MATS.spark;

  for (var i = 0; i < 45; i++) {
    var mat = (i % 3 === 0) ? debrisMatGlass : ((i % 3 === 1) ? debrisMatFrame : debrisMatSpark);
    var size = 0.04 + Math.random() * 0.09;
    var dMesh = new THREE.Mesh(G.unit, mat);
    dMesh.scale.setScalar(size);
    dMesh.position.set(
      (Math.random() - 0.5) * 1.6,
      0.3 + Math.random() * 1.8,
      6.10 + Math.random() * 0.2
    );
    scene.add(dMesh);
    debrisList.push({
      mesh: dMesh,
      size: size,
      vx: (Math.random() - 0.5) * 4.5,
      vy: Math.random() * 4.5 + 1.2,
      vz: Math.random() * 7.0 + 2.5, // para a calcada
      rotX: (Math.random() - 0.5) * 14,
      rotY: (Math.random() - 0.5) * 14
    });
  }
}

if (DEBUG) window.resetExplodedDoor = resetExplodedDoor;
var CAR_ALARM_SECONDS = 10, carAlarmOn = false, carAlarmPos = new THREE.Vector3();
function stopCarAlarm() {
  if (!carAlarmOn) return;
  carAlarmOn = false;
  carAlarm.stop();
  carAlarmStop();
}
export function resetExplodedDoor() {
  S.doorExploded = false;
  doorExplodedTime = 0;
  debrisGone = false;
  stopCarAlarm();

  doorRattle.t = -1;
  if (doorLeft) {
    doorLeft.position.set(-0.84, 0, 6.05);
    doorLeft.rotation.set(0, 0, 0);
    doorLeft.scale.set(1, 1, 1);
    doorLeft.visible = true;
  }
  if (doorRight) {
    doorRight.position.set(0.84, 0, 6.05);
    doorRight.rotation.set(0, 0, 0);
    doorRight.scale.set(1, 1, 1);
    doorRight.visible = true;
  }

  if (doorHitbox) {
    if (interactables.indexOf(doorHitbox) === -1) {
      interactables.push(doorHitbox);
    }
  }

  if (frontWallSolid) {
    frontWallSolid.x2 = RW / 2;
    for (var i = 0; i < solids.length; i++) {
      if (solids[i].id === 'frontWallRight') {
        solids.splice(i, 1);
        break;
      }
    }
  }

  for (var i = 0; i < debrisList.length; i++) {
    scene.remove(debrisList[i].mesh);   // geometria (G.unit) e materiais (DEBRIS_MATS) sao compartilhados: nada a dar dispose
  }
  debrisList = [];
}

// Modo HUNT: so o vao aberto (sem explosao, destrocos, alarme nem toast). O resetWorld fecha de novo.
// Porta trancada: ao tentar abrir, as DUAS folhas inteiras (vidro, moldura e macaneta) levam um tranco no trinco e
// balancam no caixilho: oscilacao amortecida de ~9 Hz (mais forte a cada tentativa) com tremor de vidro solto por cima.
// So com a porta intacta; o resetWorld a devolve ao repouso.
var doorRattle = { t: -1, amp: 0, base: null };
function startDoorRattle(strength) {
  if (!doorLeft || !doorRight) return;
  if (doorRattle.t < 0) doorRattle.base = { l: doorLeft.position.clone(), r: doorRight.position.clone() };   // repouso (so se nao estava balancando)
  doorRattle.t = 0; doorRattle.amp = 0.09 * strength;        // ~0.1 a 0.16 rad (6 a 9 graus) nas pontas livres
}
function updateDoorRattle(dt) {
  if (doorRattle.t < 0 || !doorLeft || !doorRight) return;
  if (S.doorExploded) { doorRattle.t = -1; return; }
  doorRattle.t += dt;
  var T = doorRattle.t, base = doorRattle.base;
  if (T > 1.3) {
    doorRattle.t = -1;
    doorLeft.rotation.y = 0; doorRight.rotation.y = 0;
    if (base) { doorLeft.position.copy(base.l); doorRight.position.copy(base.r); }
    return;
  }
  var e = Math.exp(-2.8 * T), w = 2 * Math.PI * 9 * T;
  var jit = 0.012 * e * (Math.random() - 0.5);                // vidro solto no caixilho
  doorLeft.rotation.y = doorRattle.amp * e * Math.sin(w) + jit;
  doorRight.rotation.y = -doorRattle.amp * e * Math.sin(w + 0.6) - jit;
  if (base) {                                                 // a porta toda dá uma sacudida para frente e para tras
    var push = 0.012 * doorRattle.amp / 0.09 * e * Math.sin(w * 1.3);
    doorLeft.position.z = base.l.z + push; doorRight.position.z = base.r.z + push;
    doorLeft.position.x = base.l.x + jit * 0.5; doorRight.position.x = base.r.x - jit * 0.5;
  }
}

if (DEBUG) { window.doorTry = function() { use(doorHitbox); }; window.doorRattleTick = updateDoorRattle; }   // teste: tentar abrir a porta sem renderizar

function openDoorGap() {
  if (S.doorExploded) return;
  S.doorExploded = true;
  doorExplodedTime = 99; debrisGone = true;          // sem pisca de destrocos nem abafar a TV
  if (doorLeft) doorLeft.visible = false;
  if (doorRight) doorRight.visible = false;
  if (doorHitbox) { var hi = interactables.indexOf(doorHitbox); if (hi !== -1) interactables.splice(hi, 1); }
  if (frontWallSolid) { frontWallSolid.x2 = -0.84; solids.push({ id: 'frontWallRight', x1: 0.84, x2: RW / 2, z1: 5.85, z2: 6.25, h: 4.2 }); }
}

export function explodeDoor() {
  if (S.doorExploded) return;
  S.doorExploded = true;

  var bellEl = document.getElementById('bell-counter');
  if (bellEl) bellEl.style.display = 'none';

  explosionSound();
  // O estrondo dispara o alarme do carro la fora (som + pisca-alerta e farois); sem carro, sem alarme.
  if (!S.carGone) {
    carAlarmOn = true;
    carAlarm.start();
    carAlarmStart(CAR_ALARM_SECONDS, carAlarm.position(carAlarmPos));
  }

  var flashEl = document.getElementById('screen-flash');
  if (flashEl) {
    flashEl.style.display = 'block';
    flashEl.style.opacity = '1';
    setTimeout(function() {
      flashEl.style.opacity = '0';
      setTimeout(function() { flashEl.style.display = 'none'; }, 650);
    }, 90);
  }

  shakeTime = 2.4;

  if (doorLeft && doorRight) {
    doorLeft.rotation.y = Math.PI * 0.75;
    doorLeft.position.z += 0.95;
    doorLeft.position.x -= 0.35;
    doorLeft.position.y = 0.04;
    doorLeft.rotation.x = Math.PI * 0.45;

    doorRight.rotation.y = -Math.PI * 0.75;
    doorRight.position.z += 0.95;
    doorRight.position.x += 0.35;
    doorRight.position.y = 0.04;
    doorRight.rotation.x = -Math.PI * 0.45;
  }

  spawnExplosionDebris();

  if (doorHitbox) {
    doorHitbox.visible = false;
    var idx = interactables.indexOf(doorHitbox);
    if (idx !== -1) interactables.splice(idx, 1);
  }

  if (frontWallSolid) {
    frontWallSolid.x2 = -0.84;
    solids.push({ id: 'frontWallRight', x1: 0.84, x2: RW / 2, z1: 5.85, z2: 6.25, h: 4.2 });
  }

  toast(TXT.toast.doorExploded);
}

// Segredo da lixeira: 15 inspecoes (E ou F de maos vazias) a quebram.
// Ela pisca 3x e some (core/Blink.js), as fitas de dentro sao lancadas para fora e um frango assado aparece no chao
// por 5 s e some do mesmo jeito. returnToTitle() restaura a lixeira.
var BIN_INSPECTS_TO_BREAK = 15, CHICKEN_SECONDS = 5;
var binInspects = 0, binWobble = 0;
var binEgg = { state: 'idle', t: 0 };   // idle | breaking | chicken | done
var chickenMesh = null;
loadModel('models/chicken.glb').then(function(m) {
  fitModel(m, 0.46);
  psxModel(m);
  m.userData.dynamic = true;
  m.visible = false;
  chickenMesh = m;
}).catch(function(err) { console.warn('Falha ao carregar chicken.glb:', err); });

function inspectBin() {
  if (binEgg.state !== 'idle') return;
  binInspects++;
  binWobble = 0.06 + binInspects * 0.008;           // a lixeira balanca mais a cada inspecao
  clunk();
  var left = BIN_INSPECTS_TO_BREAK - binInspects;
  if (left <= 0) { breakBin(); return; }
  if (binInspects === 5) toast(TXT.toast.binCreaks);
  else if (binInspects === 10) toast(TXT.toast.binCracking);
  else if (left <= 2) toast(TXT.toast.binAlmost);
}

function breakBin() {
  binEgg.state = 'breaking'; binEgg.t = 0;
  toast(TXT.toast.binBroke);
  explosionSound();
}

function finishBreakBin() {
  binCtl.grp.visible = false;
  var i = interactables.indexOf(binCtl.hitbox); if (i >= 0) interactables.splice(i, 1);
  var j = solids.indexOf(binCtl.solid); if (j >= 0) solids.splice(j, 1);
  binInfo.active = false;
  ejectBinTapes(binInfo);                               // as fitas sao lancadas para fora
  binEgg.state = 'chicken'; binEgg.t = 0;
  unlock('eat_pray_love');
  if (chickenMesh) {
    chickenMesh.position.set(binInfo.x, 0.0, binInfo.z);
    chickenMesh.rotation.set(0, Math.random() * 6.28, 0);
    chickenMesh.visible = true;
    if (!chickenMesh.parent) scene.add(chickenMesh);
  }
}

function updateBinEgg(dt) {
  if (binWobble > 0.002) {
    binCtl.grp.rotation.z = Math.sin(performance.now() * 0.05) * binWobble;
    binWobble *= Math.pow(0.02, dt);                    // amortece em ~1 s
  } else if (binCtl.grp.rotation.z !== 0) binCtl.grp.rotation.z = 0;
  if (binEgg.state === 'idle' || binEgg.state === 'done') return;
  binEgg.t += dt;
  if (binEgg.state === 'breaking') {
    binWobble = 0.12;
    var b = blinkState(binEgg.t);
    if (b === 2) finishBreakBin();
    else binCtl.grp.visible = b === 1;
  } else if (binEgg.state === 'chicken') {
    if (binEgg.t > CHICKEN_SECONDS) {
      var cb = blinkState(binEgg.t - CHICKEN_SECONDS);
      if (cb === 2) { if (chickenMesh) { chickenMesh.visible = false; scene.remove(chickenMesh); } binEgg.state = 'done'; }
      else if (chickenMesh) chickenMesh.visible = cb === 1;
    }
  }
}

function restoreBin() {
  if (binEgg.state === 'idle' && binInspects === 0) return;
  binCtl.grp.visible = true; binCtl.grp.rotation.z = 0;
  if (interactables.indexOf(binCtl.hitbox) < 0) interactables.push(binCtl.hitbox);
  if (solids.indexOf(binCtl.solid) < 0) solids.push(binCtl.solid);
  binInfo.active = true;
  if (chickenMesh) { chickenMesh.visible = false; scene.remove(chickenMesh); }
  binInspects = 0; binWobble = 0; binEgg.state = 'idle'; binEgg.t = 0;
}

// Jogo secreto (entrada escondida do terminal, CMD_GAME): Grand Theft Auto (1997) roda na TELA 3D DO COMPUTADOR, com o mesmo
// tratamento do fliperama: sem modal, o iframe do archive.org encaixado na tela (ui/ScreenLayer.js), mouse e teclado
// de verdade; ao contrario do fliperama, ao levantar o jogo e encerrado (iframe descarregado).
var gta = { loaded: false, container: null, iframe: null, layer: null };
var gtaExitBtn = document.getElementById('gta-exit');
if (gtaExitBtn) gtaExitBtn.onclick = function() { exitGta(); };
function ensureGtaLayer() {
  if (gta.container) return true;
  if (!compScreen.ready) return false;
  var box = document.createElement('div');
  box.id = 'gta-container';
  box.style.cssText = 'width:640px;height:502px;background:#000;overflow:hidden;opacity:0';
  var fr = document.createElement('iframe');
  fr.id = 'gta-iframe';
  fr.style.cssText = 'position:absolute;left:0;top:11px;width:640px;height:480px;border:0;background:#000';   // 4:3 centralizado
  fr.setAttribute('allow', 'autoplay; fullscreen; gamepad');
  fr.setAttribute('allowfullscreen', '');
  box.appendChild(fr);
  var scan = document.createElement('div');
  scan.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(0,0,0,.18) 0 2px,rgba(0,0,0,0) 2px 4px)';
  box.appendChild(scan);
  (document.getElementById('arcade-layer') || document.body).appendChild(box);
  gta.container = box; gta.iframe = fr;
  gta.layer = createScreenLayer(box, compScreen.geom, 640, 502);
  if (!compScreen.view) compScreen.view = screenView(compScreen.geom, compScreen.normal, 0.72, camera.fov);
  return true;
}
export function focusGta() {
  if (!gta.iframe) return;
  try { gta.iframe.focus(); if (gta.iframe.contentWindow) gta.iframe.contentWindow.focus(); } catch (e) {}
}

export function openGta() {
  if (S.playingGta) return;
  if (S.playingArcade) exitArcade();
  if (S.inspect) toggleInspect();
  if (S.watching) exitWatch();
  if (S.shareModalOpen) closeShareModal();
  if (S.doorModalOpen) closeDoorModal();
  if (!ensureGtaLayer()) { toast(TXT.toast.computerBooting); return; }

  if (S.terminalOpen) {
    // Veio do terminal: continua sentado no computador (a camera ja esta na tela); so troca o que a tela mostra.
    S.terminalOpen = false;
    document.body.classList.remove('terminal-open');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  } else {
    savedView = { pos: P.pos.clone(), yaw: P.yaw, pitch: P.pitch };
    S.terminalMix = 0;
    if (document.exitPointerLock) { try { document.exitPointerLock(); } catch(e){} }
  }
  S.playingGta = true;
  document.body.classList.add('playing-gta');
  EL.cross.style.display = 'none';

  if (!gta.loaded) {
    gta.loaded = true;
    gta.iframe.onload = function() { if (S.playingGta) focusGta(); };
    gta.iframe.src = GTA_URL;
  }
  focusGta();
  // Sem tela cheia aqui: no GTA o ESC e do proprio jogo (sai para o prompt). A saida e o botao #gta-exit.

  beep(750, 0.08);
  setTimeout(function(){ beep(950, 0.1); }, 100);
  if (!S.tvMuted) { S._unmuteTvOnGtaExit = true; ytMute(); }
}

export function exitGta() {
  if (!S.playingGta) return;
  S.playingGta = false;
  document.body.classList.remove('playing-gta');
  EL.cross.style.display = '';

  // Ao levantar, o GTA e ENCERRADO (diferente do fliperama): descarrega o iframe, o monitor volta a tela inicial
  // e para jogar de novo e preciso refazer o caminho (terminal -> entrada escondida).
  if (gta.iframe) {
    try { gta.iframe.blur(); } catch (e) {}
    gta.iframe.onload = null;
    gta.iframe.src = 'about:blank';
    gta.loaded = false;
    gta.container.style.opacity = '0';   // senao ficaria por cima do cartao do terminal
    lastGtaOpacity = '0';
  }
  window.focus();
  leaveGameFullscreen();

  if (savedView) { P.pos.copy(savedView.pos); P.yaw = savedView.yaw; P.pitch = savedView.pitch; }

  if (S._unmuteTvOnGtaExit) {
    S._unmuteTvOnGtaExit = false;
    ytUnmute();
  }

  if (!TOUCH) lockPointer();
}

// Creditos dinamicos (aba CREDITOS): direitos do canal dono dos videos (sempre) e, quando o fliperama esta
// aberto (sexta-feira), os creditos do jogo e do archive.org. Os modelos 3D ficam na lista estatica do HTML.
function creditCard(title, badge, lines) {
  var rows = lines.map(function(l) { return '<div style="color:#22ff77;">' + l + '</div>'; }).join('');
  return '<div style="border:1px solid #14592b; background:#020a05; padding:8px 10px; margin-bottom:8px; border-left:4px solid #ffd700;">' +
    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:8px;"><span style="color:#fff; font-weight:bold;">' + title + '</span>' +
    '<span style="background:#093b1b; color:#ffd700; padding:1px 6px; font-size:10px; border:1px solid #ffd700; white-space:nowrap;">' + badge + '</span></div>' + rows + '</div>';
}
function channelUrl(meta) {
  if (!meta || !meta.id) return null;
  if (/^UC[\w-]{20,}$/.test(meta.id)) return 'https://www.youtube.com/channel/' + meta.id;
  if (/^(PL|UU|OL|FL)[\w-]+$/.test(meta.id)) return 'https://www.youtube.com/playlist?list=' + meta.id;
  return null;
}
function link(url) { return url ? '<a href="' + escAttr(url) + '" target="_blank" rel="noopener" style="color:#00ff66; text-decoration:underline;">' + esc(url) + '</a>' : ''; }
// Cartao no formato {title, badge, lines, sourceLabel, url} (TXT.credits.*, Shotgun/Fireworks TXT.credit).
function sourcedCard(c) {
  return creditCard(c.title, c.badge, c.lines.concat(['• <b>' + c.sourceLabel + '</b> ' + link(c.url)]));
}
function renderCredits() {
  var host = document.getElementById('term-credits-dynamic');
  if (!host) return;
  var C = TXT.credits;
  var meta = S.channelMeta, html = '', sec = '';
  var author = (meta && meta.author) || S.handle || C.channelFallback;
  var isReserve = !meta || meta.id === 'retro_fallback';
  if (isReserve) {
    html += creditCard(C.reserveTitle, C.reserveBadge, C.reserveLines);
  } else {
    var url = channelUrl(meta);
    html += creditCard(C.ownerTitle(esc(String(author == null ? '' : author).toUpperCase())), C.ownerBadge, [
      C.ownerChannel(esc(author), url ? link(url) : ''),
      C.ownerRights(esc(author)),
      C.ownerPlayer]);
  }
  if (arcade.open) sec += sourcedCard(C.arcade);
  sec += sourcedCard(C.gta);
  sec += sourcedCard(GUN_TXT.credit);   // shotgun (easter egg SAFE)
  sec += sourcedCard(FW_TXT.credit);    // foguete do final do heroi: fim da lista
  host.innerHTML = html;
  var secHost = document.getElementById('term-credits-secret');
  if (secHost) secHost.innerHTML = sec;   // secretos no FIM da lista, abaixo dos modelos 3D (HTML estatico)
}

// O terminal do caixa nao e um modal: o cartao #term-card vive numa camada atras do canvas, encaixado na
// tela 3D do computador (ui/ScreenLayer.js, mesma tecnica do fliperama). Mouse e teclado chegam a ele de verdade.
var termLayer = null, termContainer = null, termTouchEl = null;
function ensureTerminalLayer() {
  if (termLayer || termTouchEl) return true;
  var card = document.getElementById('term-card');
  if (TOUCH && card) {
    // Touch: o cartao 640x502 projetado no monitor e pequeno demais. Vai para um overlay DOM em tela cheia
    // (#terminal-touch, visivel com body.terminal-open); mesmos nos, abas, comandos e tratadores do desktop.
    termTouchEl = document.createElement('div');
    termTouchEl.id = 'terminal-touch';
    termTouchEl.appendChild(card);
    document.body.appendChild(termTouchEl);
    var exitBtn = document.getElementById('term-exit');
    if (exitBtn) exitBtn.textContent = TXT.term.backTouch;
    var cliPanel = document.getElementById('term-panel-cli');
    if (cliPanel) cliPanel.addEventListener('click', function(e) {   // tocar no painel abre o teclado no prompt
      var inp = document.getElementById('term-cli-input');
      if (inp && e.target.tagName !== 'INPUT' && e.target.tagName !== 'A') inp.focus();
    });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', function() {
      if (!S.terminalOpen) return;   // teclado abriu/fechou: o prompt continua a vista
      var a = document.activeElement;
      if (a && (a.id === 'term-cli-input' || a.id === 'term-feed')) {
        var pn = document.getElementById('term-panel-cli');
        if (a.id === 'term-cli-input' && pn) pn.scrollTop = pn.scrollHeight;
        try { a.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      }
    });
    if (compScreen.ready && !compScreen.view) compScreen.view = screenView(compScreen.geom, compScreen.normal, 0.72, camera.fov);
    return true;
  }
  if (!compScreen.ready || !card) return false;
  termContainer = document.createElement('div');
  termContainer.id = 'terminal-container';
  termContainer.style.cssText = 'width:640px;height:502px;overflow:hidden;background:#020a05;opacity:0';
  termContainer.appendChild(card);
  (document.getElementById('arcade-layer') || document.body).appendChild(termContainer);
  termLayer = createScreenLayer(termContainer, compScreen.geom, 640, 502);
  compScreen.view = screenView(compScreen.geom, compScreen.normal, 0.72, camera.fov);
  return true;
}

export function openTerminal(){
  if(S.terminalOpen) return;
  if(!ensureTerminalLayer()){ toast(TXT.toast.computerBooting); return; }
  S.terminalOpen = true;resetTouchControls();
  S.terminalMix = 0;
  savedView = { pos: P.pos.clone(), yaw: P.yaw, pitch: P.pitch };
  document.body.classList.add('terminal-open');
  EL.cross.style.display = 'none';
  if(document.exitPointerLock) try { document.exitPointerLock(); } catch(e){}

  // Cada vez que se senta no computador a linha de comandos recomeca limpa (tela inicial)
  cliInitialized = false;
  var cliHist = document.getElementById('term-cli-history'); if (cliHist) cliHist.innerHTML = '';
  setTerminalTab('cli');
  renderCredits();
  renderStock(currentCatalog, S.handle || '@canal');
  beep(1100, 0.08);
}

// Aba ESTOQUE: canal, contagem e lista numerada (sem duracao: o feed nao traz esse dado).
function renderStock(cat, handle) {
  var h = document.getElementById('term-handle');
  if(h) h.textContent = handle;
  var cnt = document.getElementById('term-count');
  if(cnt) cnt.textContent = cat ? cat.length : 0;
  var list = document.getElementById('term-list');
  if(!list) return;
  list.innerHTML = '';
  if(cat && cat.length) {
    cat.forEach(function(t, idx){
      var row = document.createElement('div');
      row.style.cssText = 'padding:3px 4px; border-bottom:1px dotted #14592b; display:flex; justify-content:space-between; gap:10px;';
      row.innerHTML = '<span style="color:#fff;">[' + (idx + 1 < 10 ? '0' : '') + (idx + 1) + '] ' + esc(t.title) + '</span>';
      list.appendChild(row);
    });
  } else {
    list.innerHTML = '<div style="color:#1da84c;">' + TXT.term.emptyStock + '</div>';
  }
}

export function closeTerminal(){
  if(!S.terminalOpen) return;
  cancelHelpSequence();
  S.terminalOpen = false;
  document.body.classList.remove('terminal-open');
  EL.cross.style.display = '';
  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();   // as teclas voltam ao jogo
  if(savedView){ P.pos.copy(savedView.pos); P.yaw = savedView.yaw; P.pitch = savedView.pitch; }
  if(!TOUCH && S.phase === 'inside' && !S.watching && !S.playingArcade && !S.playingGta) {
    lockPointer();
  }
}

function notifyFeedSource(cat) {
  if (cat.isFallback) toast(TXT.toast.feedFallback);
  else if (cat.fromCache) toast(TXT.toast.feedCached);
}

// Remove as fitas do acervo anterior (cena, alvos de interacao, texturas) antes de recriar a prateleira. Sem isso,
// carregar outro canal empilhava fitas novas sobre as velhas na mesma vaga e a mira podia pegar a fita escondida.
function clearShelfTapes() {
  if (S.inspect) toggleInspect();
  if (S.held) { S.held = null; handMesh.visible = false; EL.hand.classList.remove('on'); }
  S.tapes.forEach(function(m) {
    releaseTape(m, binInfo);                       // se estava jogada no chao ou na lixeira
    scene.remove(m);
    var i = interactables.indexOf(m);
    if (i >= 0) interactables.splice(i, 1);
    var t = m.userData && m.userData.data;
    if (t) ['mFront', 'mBack', 'mSide', 'mTop', 'mBottom', 'mOpen'].forEach(function(k) {
      var mat = t[k];
      if (mat) { if (mat.map) safeDisposeTexture(mat.map); mat.dispose(); t[k] = null; }
    });
  });
  S.tapes.length = 0;
  binInfo.pile = 0;
}

// Autoplay: o video mais recente ja entra no VCR e toca na TV em mudo.
function autoplayLatest(latestVideo) {
  if(!latestVideo) return;
  S.inDeck = latestVideo;
  S._lastYtId = null;
  S.vcr = 'playing';
  S.tvMuted = true;
  S.rewound = true;
  S.loadT = 0;
  S.t = 0;
  S.msg = '';
  EL.deck.classList.add('on');
  if(latestVideo.mesh) latestVideo.mesh.visible = false;
  if (setPlayingTapeCase) setPlayingTapeCase(latestVideo);
}

function applyCatalogVisuals(cat) {
  clearShelfTapes();
  var displayCat = cat.slice(0, slots.length);
  placardTex.image = placardCanvas(TEX.titleNew, S.handle, undefined, false);
  placardTex.needsUpdate = true;
  if (placard2Tex) {
    placard2Tex.image = placardCanvas(TEX.titleRetro, S.handle, undefined, true);
    placard2Tex.needsUpdate = true;
  }
  displayCat.forEach(function(t) { makeTape(t, scene, slots, M, interactables); });

  autoplayLatest(cat[0]);
  if (updateCustomerBadge) updateCustomerBadge(S.channelTitle || S.handle);

  var tLoad = new THREE.TextureLoader();
  tLoad.setCrossOrigin('anonymous');

  // Posteres de papel rasgado na parede (3 primeiros videos)
  for (var i = 0; i < 3 && i < cat.length; i++) {
    (function(idx, thumbUrl, title) {
      tLoad.load(thumbUrl, function(loadedTex) {
        var canvas = createPaperPoster(loadedTex.image, title, idx + 1);
        var pTex = tex(canvas);
        pTex.minFilter = THREE.NearestFilter;
        pTex.magFilter = THREE.NearestFilter;
        safeDisposeTexture(posterMeshes[idx].material.map);
        posterMeshes[idx].material.map = pTex;
        posterMeshes[idx].material.color.setHex(0xffffff);
        posterMeshes[idx].material.needsUpdate = true;
      });
    })(i, cat[i].thumbUrl || ('https://i.ytimg.com/vi/' + cat[i].id + '/hqdefault.jpg'), cat[i].title);
  }

  // Avatar e banner oficiais do canal
  if (cat.channelMeta) {
    if (cat.channelMeta.avatar) {
      var avUrl = proxyImageUrl(cat.channelMeta.avatar, 256);
      tLoad.load(avUrl, function(loadedAvatar) {
        setTapeAvatar(loadedAvatar.image);                     // o avatar tambem vai no cabecalho das capas
        S.tapes.forEach(function(m) { if (m.userData && m.userData.data) refreshTape(m.userData.data); });
        placardTex.image = placardCanvas(TEX.titleNew, S.handle, loadedAvatar.image, false);
        placardTex.needsUpdate = true;
        if (placard2Tex) {
          placard2Tex.image = placardCanvas(TEX.titleRetro, S.handle, loadedAvatar.image, true);
          placard2Tex.needsUpdate = true;
        }
      }, undefined, function(e) {
        console.warn('Erro ao carregar textura do avatar:', e);
      });
    }

    if (cat.channelMeta.banner && bannerMesh && bannerMesh.material) {
      var banUrl = proxyImageUrl(cat.channelMeta.banner, 1280);
      tLoad.load(banUrl, function(loadedBanner) {
        var bCanvas = bannerCanvas(loadedBanner.image, S.handle);
        var bTex = tex(bCanvas);
        bTex.minFilter = THREE.NearestFilter;
        bTex.magFilter = THREE.NearestFilter;
        safeDisposeTexture(bannerMesh.material.map);
        bannerMesh.material.map = bTex;
        bannerMesh.material.needsUpdate = true;
      }, undefined, function(e) {
        console.warn('Erro ao carregar textura do banner:', e);
      });
    }
  }

  var currentUrl = getShareUrl();
  if (updateSharePoster) updateSharePoster(currentUrl, S.handle);
  // Capa da 1a fita como og:image (quando o feed a traz): o card do WhatsApp/Twitter mostra o video do canal.
  // (cat[0].thumb e a Image ja baixada, nao uma URL: so entra se vier como string)
  var c0 = cat.length ? cat[0] : null;
  var firstThumb = !c0 ? '' : (typeof c0.thumb === 'string' && c0.thumb) || c0.thumbUrl ||
                              (c0.id ? 'https://i.ytimg.com/vi/' + c0.id + '/hqdefault.jpg' : '');
  updateMetaTags(S.handle, firstThumb);
}

var lastFeedText='';
$('#btGo').onclick=function(){
  var txt=$('#feed').value.trim();
  lastFeedText=txt;
  if(!txt){
    if(EL.status) EL.status.textContent=TXT.feed.empty;
    $('#btGo').disabled=false;
    return;
  }
  var m=txt.match(/@[A-Za-z0-9._-]+/);
  S.handle=m?m[0]:'@canal';
  $('#btGo').disabled=true;
  audioInit();
  var report=function(t){EL.status.textContent=t;};

  loadRSS(txt,report).then(function(cat){
    if(!cat||!cat.length) throw new Error(TXT.feed.invalid);
    currentCatalog = cat;
    S.real=true;
    S.channelMeta = cat.channelMeta || null;
    S.handle=(cat.channelMeta && cat.channelMeta.author) || cat[0].handle;
    report(TXT.feed.count(cat.length));
    applyCatalogVisuals(cat);
    notifyFeedSource(cat);

    setTimeout(function(){walkIn(cat.length);hydrate(cat.slice(0, slots.length));},250);
  }).catch(function(e){
    $('#btGo').disabled=false;
    fail(TXT.feed.loadFail+e.message);
    report(TXT.feed.error + e.message);
    console.error(e);
  });
};

var feedInput = $('#feed');
if(feedInput){
  feedInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      $('#btGo').click();
    }
  });
}

function walkIn(n){
  S.phase='entering';
  $('#card').style.transition='opacity .4s';
  $('#card').style.opacity='0';
  $('#fade').style.opacity='0';

  setDoorOpen(1);

  var duration = 3000;
  var t0 = Date.now();
  var from = camera.position.clone();
  var target = new THREE.Vector3(0, 1.65, 5.2);
  var doorLocked = false;

  (function step(){
    var now = Date.now();
    var progress = Math.min(1, (now - t0) / duration);
    var ease = progress * progress * (3 - 2 * progress);

    var curX = from.x + (target.x - from.x) * ease;
    var curY = from.y + (target.y - from.y) * ease;
    var curZ = from.z + (target.z - from.z) * ease;
    camera.position.set(curX, curY, curZ);
    camera.lookAt(0, 1.6, 0);

    // Portal da porta em z = 6.10: abertas na aproximacao (z > 5.95), fecham suavemente depois de passar.
    if (curZ > 5.95) {
      setDoorOpen(1);
    } else {
      var closeRatio = Math.max(0, Math.min(1, (curZ - 5.25) / (5.95 - 5.25)));
      setDoorOpen(closeRatio);

      if (closeRatio <= 0.05 && !doorLocked) {
        doorLocked = true;
        setDoorOpen(0);
        doorLockSound();
      }
    }

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      if (!doorLocked) {
        doorLocked = true;
        setDoorOpen(0);
        doorLockSound();
      }
      $('#boot').style.display = 'none';
      S.phase = 'inside';
      markSessionStart();
      document.body.classList.add('playing');
      $('#hud').classList.add('on');
      P.pos.set(0, 1.65, 5.2);
      var testCustomer = DEBUG && urlParams.get('test_customer');
      P.yaw = testCustomer ? Math.PI : 0;
      P.pitch = 0;
      if (testCustomer) {
        setTimeout(function(){ spawnCustomerNow(true); }, 200);
      }
      if (!TOUCH) lockPointer();
      toast(TXT.toast.doorLockedBehind(S.handle));
    }
  })();
}

function lockPointer(){
  var el=renderer.domElement;if(!el.requestPointerLock)return;
  try{var r=el.requestPointerLock();if(r&&r.catch)r.catch(function(){});}catch(e){}
}
renderer.domElement.addEventListener('click',function(e){
  if(S.phase!=='inside'||TOUCH||S.inspect||S.fileOpen)return;
  if(S.terminalOpen || S.shareModalOpen || S.doorModalOpen || S.playingArcade || S.playingGta) return;
  if(S.watching){
    if(S.tvMuted) unmuteTv();
    use(pick((e.clientX/window.innerWidth)*2-1,-(e.clientY/window.innerHeight)*2+1));
    return;
  }
  if(document.pointerLockElement!==renderer.domElement){lockPointer();return;}
  if(S.cutscene) return;                    // final do heroi: sem interacao
  if(S.heldGun){ fireShotgun(); return; }   // com a arma na mao o clique atira
  use(hovered);});

document.addEventListener('mousemove',function(e){
  if(document.pointerLockElement!==renderer.domElement)return;
  if(S.doorModalOpen || S.terminalOpen || S.shareModalOpen || S.playingArcade || S.playingGta || S.fileOpen) return;
  if(S.inspect){S.insRot.y+=e.movementX*.008;S.insRot.x+=e.movementY*.008;return;}
  if(S.watching)return;
  if(S.fainted||S.camForced)return;   // camForced: o final do heroi conduz o olhar
  P.yaw-=e.movementX*.0022;
  P.pitch=Math.max(-1.2,Math.min(1.2,P.pitch-e.movementY*.0022));}, { passive: true });
window.addEventListener('pointerdown',function(e){
  if(A && A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
}, { passive: true });
// Touch (ui/TouchControls.js): joystick, arrastar para olhar, toque curto usa o objeto sob o dedo.
function touchBusy(){ return S.phase!=='inside' || S.terminalOpen || S.shareModalOpen || S.doorModalOpen || S.playingArcade || S.playingGta || S.fileOpen || S.cutscene; }
initTouchControls({
  canvas: renderer.domElement, P: P, S: S,
  huntMode: function(){ return !!SESSION.huntMode; },
  canLook: function(){ return !touchBusy() && !S.watching && !S.fainted && !S.camForced; },
  onTap: function(nx, ny){
    if(touchBusy() || S.fainted) return;
    if(S.watching){ if(S.tvMuted) unmuteTv(); use(pick(nx, ny)); return; }
    if(S.inspect || S.heldGun) return;      // com a arma, o tiro e so pelo botao ATIRAR
    var o = pick(nx, ny);
    if(!o) return;
    if((o.userData.type === 'tv' || o.userData.type === 'vcr') && S.tvMuted) unmuteTv();
    use(o);
  }
});
window.addEventListener('keydown',function(e){
  if(S.phase!=='inside')return;
  var k=e.key.toLowerCase();keys[k]=true;
  if(k==='m')$('#snd').click();
  if(S.cutscene || SESSION.huntMode)return;   // final do heroi / HUNT: teclas de acao ignoradas (so o som)
  if(k==='c' && DEBUG){   // [C] chama o cliente: so na depuracao (?debug)
    var isInputActive = (document.activeElement === document.getElementById('term-feed') || document.activeElement === document.getElementById('term-cli-input'));
    if(!isInputActive && !S.terminalOpen && !S.playingGta && !S.playingArcade){
      spawnCustomerNow();
    }
  }

  if(S.doorModalOpen){
    if(k==='e' || k==='enter'){ returnToTitle(); return; }
    if(k==='escape'){ closeDoorModal(); return; }
    return;
  }

  if(S.fileOpen){   // lendo o papel (file ZTA): so E/ESC fecham
    if(k==='e' || k==='escape'){ e.preventDefault(); closeFile(); closePostit(); }
    return;
  }

  if(S.playingGta){
    focusGta();   // todas as teclas (inclusive o ESC) pertencem ao jogo; a saida e so o botao LEVANTAR (mouse)
    return;
  }

  if(S.playingArcade){
    if(k==='escape'){ exitArcade(); return; }
    focusArcade();   // so o ESC e do jogo 3D; as outras teclas pertencem ao emulador
    return;
  }

  if(k==='e' && S.watching) { e.preventDefault(); act('eject'); }   // controle: E ejeta, sem sair do sofa
  if(k==='e') {
    if(!S.watching && !S.terminalOpen && !S.shareModalOpen) {
      if(hovered && (hovered.userData.type === 'tv' || hovered.userData.type === 'vcr') && S.tvMuted) {
        unmuteTv();
      }
      use(hovered);
    }
  }
  if(k==='g' && (S.heldCan || S.held || S.heldBox || S.heldGun || S.heldKey) && !S.watching && !S.terminalOpen && !S.shareModalOpen) { if (S.heldGun) dropHeldGun(); else if (S.heldKey) dropHeldKey(); else if (S.heldCan) throwHeldCan(); else if (S.heldBox) throwHeldBox(); else throwHeldTape(); }
  if(k==='f') {
    if(S.watching) exitWatch();
    else if(S.heldCan) stowCan();
    else if(S.held || S.heldBox || S.heldKey) toggleInspect();
    else if(hovered && hovered.userData.type === 'trash_can') inspectBin();
    else if(inspectCabinetTarget(hovered)) {}
  }

  // Controle remoto da TV: W/Espaco play-pausa, A rebobina, D avanca, E ejeta, S/F levanta.
  if(S.watching) {
    if(k==='s'){e.preventDefault(); exitWatch();}
    else if(S.inDeck) {
      if(k==='w' || k===' '){e.preventDefault();act(S.vcr==='playing'?'pause':'play');}
      if(k==='d'&&S.vcr!=='ff'){e.preventDefault();act('ff',true);}
      if(k==='a'&&S.vcr!=='rew'){e.preventDefault();act('rew',true);}
    }
  }

  if(S.terminalOpen){
    if(k==='escape'){ closeTerminal(); return; }
  }

  if(S.shareModalOpen){
    if(k==='escape'){ closeShareModal(); return; }
  }

  if(k==='escape'){
    if(S.inspect) toggleInspect();
    else if(S.watching) exitWatch();
  }
  if(k==='[')act('trkd');
  if(k===']')act('trku');
});
window.addEventListener('keyup',function(e){
  var k=e.key.toLowerCase();keys[k]=false;
  if(S.watching && S.inDeck) {
    if(k==='d'&&S.vcr==='ff')act('ff',false);
    if(k==='a'&&S.vcr==='rew')act('rew',false);
  }
});
export function enterWatch(){
  if(S.watching)return;
  if(S.inspect)toggleInspect();
  if(S.tvMuted) unmuteTv();
  savedView={pos:P.pos.clone(),yaw:P.yaw,pitch:P.pitch};
  S.watching=true;S.watchMix=0;resetTouchControls();
  document.body.classList.add('watching');
  if(document.exitPointerLock)document.exitPointerLock();
  EL.cross.style.display='none';}
export function exitWatch(){
  if(!S.watching)return;
  S.watching=false;document.body.classList.remove('watching');
  EL.cross.style.display='';
  if(savedView){P.pos.copy(savedView.pos);P.yaw=savedView.yaw;P.pitch=savedView.pitch;}
  if(!TOUCH)lockPointer();}

// Camera de "jogar" derivada da propria tela 3D do gabinete (ver Furnishings.js).
export var ARCADE_VIEW = arcade.view;

// O emulador (iframe de outro dominio) recebe teclado e mouse de verdade: o canvas fica com
// pointer-events:none enquanto se joga (css) e o iframe fica com o foco do teclado. Enquanto ele tem
// o foco o navegador nao entrega NENHUMA tecla a pagina (nem o ESC), entao o ESC e detectado pela saida
// da tela cheia: o navegador sempre avisa a pagina quando o ESC sai do fullscreen.
var arcadeFsRequested = false;   // tela cheia pedida por nos para um jogo (fliperama ou GTA): o ESC sai dela
function requestGameFullscreen() {
  arcadeFsRequested = false;
  if (!TOUCH && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    try {
      var fr = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      arcadeFsRequested = true;
      if (fr && fr.catch) fr.catch(function() { arcadeFsRequested = false; });
    } catch (e) { arcadeFsRequested = false; }
  }
}
function leaveGameFullscreen() {
  if (arcadeFsRequested && document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} }
  arcadeFsRequested = false;
}
export function focusArcade() {
  if (!arcade.iframe) return;
  try { arcade.iframe.focus(); if (arcade.iframe.contentWindow) arcade.iframe.contentWindow.focus(); } catch (e) {}
}

// Comeca a carregar o emulador (uma vez por carga; unloadArcade() o descarrega ao levantar).
export function loadArcade() {
  if (arcade.loaded || !arcade.open || !arcade.iframe) return;
  arcade.loaded = true;
  arcade.iframe.src = ARCADE_URL;
  if (!arcade.loadHooked) { arcade.loadHooked = true; arcade.iframe.addEventListener('load', function() { if (S.playingArcade) focusArcade(); }); }
}
// Silencio fora do uso: o iframe e de outro dominio (sem API de volume), entao a unica forma de calar o jogo e
// descarrega-lo. Ao levantar vira about:blank e, 2 s depois, o embed (mudo, so a imagem) pre-carrega de novo.
function unloadArcade() {
  if (!arcade.loaded || !arcade.iframe) return;
  arcade.loaded = false; arcadeBootT = 0;
  arcade.iframe.src = 'about:blank';
}

export function enterArcade() {
  if (S.playingArcade || !arcade.open) return;
  if (S.inspect) toggleInspect();
  if (S.watching) exitWatch();
  if (S.terminalOpen) closeTerminal();
  if (S.shareModalOpen) closeShareModal();
  if (S.doorModalOpen) closeDoorModal();

  savedView = { pos: P.pos.clone(), yaw: P.yaw, pitch: P.pitch };
  S.playingArcade = true;
  S.arcadeMix = 0;
  document.body.classList.add('playing-arcade');
  if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) {} }  // cursor visivel para clicar no emulador
  EL.cross.style.display = 'none';

  loadArcade();   // normalmente ja carregou sozinho ao entrar na loja; garante se alguem sentar antes
  focusArcade();

  // Tela cheia: e o que permite o ESC sair mesmo com o emulador em foco (ver comentario acima).
  requestGameFullscreen();

  beep(987, 0.08);
  setTimeout(function(){ beep(1318, 0.12); }, 90);
  setTimeout(function(){ beep(1760, 0.18); }, 190);

  // TV muda enquanto joga
  if (!S.tvMuted) { S._unmuteTvOnArcadeExit = true; ytMute(); }
}

export function exitArcade() {
  if (!S.playingArcade) return;
  S.playingArcade = false;
  document.body.classList.remove('playing-arcade');
  EL.cross.style.display = '';

  // Som do archive.org so existe enquanto se joga: ao levantar o iframe e descarregado (perde a partida).
  if (arcade.iframe) { try { arcade.iframe.blur(); } catch (e) {} }
  unloadArcade();
  window.focus();

  if (savedView) {
    P.pos.copy(savedView.pos);
    P.yaw = savedView.yaw;
    P.pitch = savedView.pitch;
  }

  if (S._unmuteTvOnArcadeExit) {
    S._unmuteTvOnArcadeExit = false;
    ytUnmute();
  }

  leaveGameFullscreen();
  if (!TOUCH) lockPointer();
}

// ESC com o emulador em foco: o navegador sai da tela cheia (ou a pagina nao esta em tela cheia e o
// ESC chega normalmente pelo keydown) e avisa a pagina, que entao levanta do fliperama.
document.addEventListener('fullscreenchange', function() {
  if (!document.fullscreenElement && arcadeFsRequested) {
    arcadeFsRequested = false;
    if (S.playingArcade) exitArcade();
    else if (S.playingGta) exitGta();
  }
});
// Clicou fora do emulador (o foco volta para a pagina): devolve o teclado ao jogo.
document.addEventListener('mousedown', function() {
  if (S.playingArcade) setTimeout(focusArcade, 0);
  else if (S.playingGta) setTimeout(focusGta, 0);   // clicou fora do iframe: devolve o teclado ao jogo
});

var clock=new THREE.Clock();
var bob=0,pickAcc=0,fxAcc=0,fpsAcc=0,fpsN=0;
document.addEventListener('visibilitychange',function(){ clock.getDelta(); });
var tvNormal = new THREE.Vector3(0, 0, 1).applyEuler(tvGrp.rotation);
var camFwd = new THREE.Vector3(), toTv = new THREE.Vector3(), toCam = new THREE.Vector3();
var fanHumAcc = 0;
var lastYtOpacity = '', lastMuteDisp = '', lastArcOpacity = '', lastTermOpacity = '', lastGtaOpacity = '', lastCompHole = false, arcContainer = null, arcadeBootT = 0;
var lastGunCross = null;

// Diagnostico de alinhamento da TV (so com ?debug). Compara, em coordenadas de tela, ONDE ESTA O BURACO
// da tela da TV (#crt, posicionado por syncCRT a partir dos cantos projetados da malha 3D) com ONDE ESTA
// o contentor do video (#yt-container, posicionado pelo CSS3DRenderer) e com o IFRAME dentro dele.
// Se cont bate com crt e ifr nao, o problema e o iframe; se cont nao bate com crt, e a camada CSS3D.
var tvDiagEl = null, tvDiagT = 0;
function tvDiag() {
  tvDiagT++; if (tvDiagT % 30) return;                       // ~2 Hz, sem custo por quadro
  if (!tvDiagEl) {
    tvDiagEl = document.createElement('div');
    tvDiagEl.style.cssText = 'position:fixed;left:4px;top:4px;z-index:9999;background:rgba(0,0,0,.88);color:#6f6;'
      + 'font:11px/1.35 ui-monospace,monospace;padding:6px 8px;white-space:pre;pointer-events:none;max-width:96vw';
    document.body.appendChild(tvDiagEl);
  }
  var r = function (el) {
    if (!el) return 'ausente';
    var b = el.getBoundingClientRect();
    return Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height);
  };
  var vv = window.visualViewport;
  var cont = document.getElementById('yt-container');
  var ifr = cont && cont.querySelector('iframe');
  tvDiagEl.textContent =
      'win   ' + window.innerWidth + 'x' + window.innerHeight + '  dpr ' + (window.devicePixelRatio || 1) + '\n'
    + 'vv    ' + (vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) + ' off ' + Math.round(vv.offsetTop) + ' sc ' + vv.scale.toFixed(2) : 'n/a') + '\n'
    + 'canv  ' + r(renderer && renderer.domElement) + '\n'
    + 'cssd  ' + r(cssRenderer && cssRenderer.domElement) + '\n'
    + 'crt   ' + r(EL.crt) + '   <- buraco da TV\n'
    + 'cont  ' + r(cont) + '   <- div do video\n'
    + 'ifr   ' + r(ifr) + '   <- iframe\n'
    + 'ifrAt ' + (ifr ? (ifr.getAttribute('width') + 'x' + ifr.getAttribute('height') + ' off ' + ifr.offsetWidth + 'x' + ifr.offsetHeight) : 'ausente') + '\n'
    + 'fov   ' + camera.fov.toFixed(1) + '  watching ' + (S.watching ? 1 : 0);
}
// These live inside the CSS3D layer and only enter the DOM after the first cssRenderer.render(), so look them up lazily.
var ytEl = null, muteInd = null;
var hudBtns = ['mb1','mb2','mb3','mb4','mb5','mb7'].map(function(id){
  var b = document.getElementById(id);
  return { el: b, keyEl: b && b.querySelector('.mb-key'), lblEl: b && b.querySelector('.mb-lbl'), key: null, lbl: null, on: null, show: null };
});
function setBtn(i, key, lbl, on, show) {
  var c = hudBtns[i];
  if (!c.el) return;
  if (c.show !== show) { c.show = show; c.el.style.display = show ? 'flex' : 'none'; }
  if (c.on !== on) { c.on = on; c.el.classList.toggle('on', on); }
  if (key && c.key !== key) { c.key = key; c.keyEl.textContent = key; }
  if (lbl && c.lbl !== lbl) { c.lbl = lbl; c.lblEl.textContent = lbl; }
}
function shortAngle(a,b){var d=(b-a)%(Math.PI*2);
  if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return d;}

var termClose = document.getElementById('term-close');
if(termClose) termClose.onclick = closeTerminal;
var termExit = document.getElementById('term-exit');
if(termExit) termExit.onclick = closeTerminal;

var tabBtnCredits = document.getElementById('term-tab-credits');
if(tabBtnCredits) tabBtnCredits.onclick = function() { keyClick(); setTerminalTab('credits'); };

var tabBtnCatalog = document.getElementById('term-tab-catalog');
if(tabBtnCatalog) tabBtnCatalog.onclick = function() { keyClick(); setTerminalTab('catalog'); };

var tabBtnAch = document.getElementById('term-tab-ach');
if(tabBtnAch) tabBtnAch.onclick = function() { keyClick(); setTerminalTab('ach'); };

var tabBtnCli = document.getElementById('term-tab-cli');
if(tabBtnCli) tabBtnCli.onclick = function() { keyClick(); setTerminalTab('cli'); };

var termCliInput = document.getElementById('term-cli-input');
if(termCliInput) {
  termCliInput.addEventListener('keydown', function(e) {
    if(e.key === 'Enter') {
      keyClick();
      runCliCommand(termCliInput.value);
    }
  });
}

var termFeedInput = document.getElementById('term-feed');
if(termFeedInput) {
  termFeedInput.addEventListener('keydown', function(e) {
    keyClick();
    if(e.key === 'Enter') {
      var btn = document.getElementById('term-btn-load');
      if(btn) btn.click();
    }
  });
}

var termBtnLoad = document.getElementById('term-btn-load');
if(termBtnLoad) {
  termBtnLoad.onclick = function() {
    var txt = (termFeedInput.value || '').trim();
    if(!txt) {
      var st0 = document.getElementById('term-status');
      if(st0) st0.textContent = TXT.term.needLink;
      return;
    }
    var status = document.getElementById('term-status');
    if(status) status.textContent = TXT.term.querying;
    keyClick();
    termBtnLoad.disabled = true;

    loadRSS(txt, function(t){ if(status) status.textContent = t; }).then(function(newCat){
      termBtnLoad.disabled = false;
      if(!newCat || !newCat.length) throw new Error(TXT.term.feedEmpty);
      currentCatalog = newCat;
      S.real = true;
      S.channelMeta = newCat.channelMeta || null;
      S.handle = (newCat.channelMeta && newCat.channelMeta.author) || newCat[0].handle;
      if(status) status.textContent = TXT.term.loaded(newCat.length);
      applyCatalogVisuals(newCat);
      notifyFeedSource(newCat);
      hydrate(newCat.slice(0, slots.length));
      renderStock(newCat, S.handle);
      beep(1400, 0.1);
      toast(TXT.toast.newStock(S.handle));
    }).catch(function(err){
      termBtnLoad.disabled = false;
      if(status) status.textContent = TXT.term.error + err.message;
      beep(400, 0.2);
    });
  };
}

// Cache do feed (TTL 1 h, services/FeedApi.js): LIMPAR CACHE na aba ESTOQUE e `cache clear` no terminal. A lista em
// uso continua na prateleira; a proxima entrada (ou BUSCAR) consulta a rede de novo.
function clearCacheText() {
  var n = clearFeedCache();
  return n ? TXT.term.cacheCleared(n) : TXT.term.cacheEmpty;
}
var termBtnCache = document.getElementById('term-btn-cache');
if(termBtnCache) {
  termBtnCache.onclick = function() {
    keyClick();
    var st = document.getElementById('term-cache-status');
    if(st) st.textContent = clearCacheText();
    beep(1000, 0.06);
  };
}

// Modal de compartilhamento
var shareModal = document.getElementById('share-modal');
if (shareModal) {
  shareModal.addEventListener('click', function(e) {
    if (e.target === shareModal) closeShareModal();
  });
}
var shareClose = document.getElementById('share-modal-close');
if (shareClose) shareClose.onclick = closeShareModal;
var shareExit = document.getElementById('share-modal-exit');
if (shareExit) shareExit.onclick = closeShareModal;

var shareBtnCopy = document.getElementById('share-btn-copy');
if (shareBtnCopy) {
  var copyFallback = function() {
    var inp = document.getElementById('share-url-input');
    if (inp) { inp.select(); document.execCommand('copy'); }
    toast(TXT.toast.linkCopied);
    triggerSharePosterDrop();
  };
  shareBtnCopy.onclick = function() {
    var shareUrl = getShareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(function() {
        shareBtnCopy.textContent = TXT.share.copied;
        shareBtnCopy.style.background = '#155724';
        var msg = document.getElementById('share-copy-msg');
        if (msg) msg.style.display = 'block';
        keyClick();
        toast(TXT.toast.linkCopiedClipboard);
        triggerSharePosterDrop();
      }).catch(copyFallback);
    } else {
      copyFallback();
    }
  };
}

// Nome do canal usado nos textos de compartilhamento (cai no rotulo neutro antes de carregar um feed).
function shareChannel() { return S.handle || '@canal'; }

var shareBtnWa = document.getElementById('share-btn-whatsapp');
if (shareBtnWa) {
  shareBtnWa.onclick = function() {
    var shareUrl = getShareUrl();
    var txt = encodeURIComponent(TXT.share.whatsapp(shareChannel()) + shareUrl);
    window.open('https://api.whatsapp.com/send?text=' + txt, '_blank');
    triggerSharePosterDrop();
  };
}

var shareBtnTg = document.getElementById('share-btn-telegram');
if (shareBtnTg) {
  shareBtnTg.onclick = function() {
    var shareUrl = getShareUrl();
    var txt = encodeURIComponent(TXT.share.telegram(shareChannel()));
    window.open('https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + txt, '_blank');
    triggerSharePosterDrop();
  };
}

var shareBtnTw = document.getElementById('share-btn-twitter');
if (shareBtnTw) {
  shareBtnTw.onclick = function() {
    var shareUrl = getShareUrl();
    var txt = encodeURIComponent(TXT.share.twitter(shareChannel()) + shareUrl);
    window.open('https://twitter.com/intent/tweet?text=' + txt, '_blank');
    triggerSharePosterDrop();
  };
}

var shareBtnNative = document.getElementById('share-btn-native');
if (shareBtnNative) {
  shareBtnNative.onclick = function() {
    var shareUrl = getShareUrl();
    if (navigator.share) {
      navigator.share({
        title: TXT.share.nativeTitle,
        text: TXT.share.nativeText,
        url: shareUrl
      }).then(function(){ triggerSharePosterDrop(); }).catch(function(){});
    }
  };
}

// Modal da porta trancada (sair = voltar ao titulo)
var doorModal = document.getElementById('door-modal');
if (doorModal) {
  doorModal.addEventListener('click', function(e) {
    if (e.target === doorModal) closeDoorModal();
  });
}
var doorClose = document.getElementById('door-modal-close');
if (doorClose) doorClose.onclick = closeDoorModal;
var doorStay = document.getElementById('door-btn-stay');
if (doorStay) doorStay.onclick = closeDoorModal;
var doorLeave = document.getElementById('door-btn-leave');
if (doorLeave) {
  doorLeave.onclick = function() {
    keyClick();
    returnToTitle();
  };
}

// Retrato no touch: com o FOV vertical fixo (72) o campo horizontal cai para ~37 graus e quase nada cabe na tela.
// Abre o FOV vertical para manter ~58 graus na horizontal (limite 100). Paisagem e desktop: 72, como sempre.
var BASE_FOV = camera.fov;
function fovFor(aspect){
  if(!TOUCH || aspect >= 1) return BASE_FOV;
  var v = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(58) / 2) / aspect) * 180 / Math.PI;
  return Math.min(100, Math.max(BASE_FOV, v));
}
function resize(){
  var w=window.innerWidth,h=window.innerHeight;
  camera.aspect=w/h;
  if(!isHeroActive() && !isCustomerCineActive()) camera.fov=fovFor(camera.aspect);   // o final do heroi e a cutscene do cliente controlam o FOV enquanto rodam
  camera.updateProjectionMatrix();
  resizeRenderer(w,h);
}
window.addEventListener('resize',resize);resize();

// Camera inicial do lado de fora, olhando a fachada
camera.position.set(0, 1.85, 12.2);
camera.lookAt(0, 2.6, 6.0);

function tick(){
  requestAnimationFrame(tick);
  if(document.hidden) return;
  var dt=Math.min(.05,clock.getDelta());
  var now = performance.now();
  if(DEBUG){
    fpsAcc+=dt;fpsN++;
    if(fpsAcc>=.5){setTxt(EL.fps,'fps',Math.round(fpsN/fpsAcc)+' FPS');fpsAcc=0;fpsN=0;}
    tvDiag();
  }
  if(updateClock) updateClock();
  updateSharePosterDrop(dt);   // queda/pisca do cartaz de indicacao depois de compartilhar
  if(S.phase!=='inside'){
    var t=Date.now()*.0002;
    if(S.phase==='outside'||S.phase==='boot'){
      camera.position.set(Math.sin(t)*1.4, 1.85+Math.sin(t*1.7)*.05, 12.2);
      camera.lookAt(0, 2.6, 6.0);
    }
    updateMoon(camera, dt);
    renderer.render(scene, camera);
    return;
  }

  var edgePush=false;   // empurrando a borda z = 26 sem sair do lugar (gatilho do heroi, CustomerEvent.heroEdgeTick)
  updateHunt(dt);       // modo HUNT: jogador parado, mira presa no arco, clientes correndo
  if(!S.watching && !S.playingArcade && !S.playingGta && !S.inspect && !S.terminalOpen && !S.fileOpen){
    if(!S.fainted && !S.cutscene && !SESSION.huntMode){
      var sp=keys['shift']?3.2:1.95;
      var f=(keys['w']?1:0)-(keys['s']?1:0),r=(keys['d']?1:0)-(keys['a']?1:0);
      if(!f && !r && (touchMove.f || touchMove.r)){   // joystick de toque: analogico (velocidade pela inclinacao)
        f=touchMove.f; r=touchMove.r; sp*=Math.min(1, Math.sqrt(f*f+r*r));
      }
      if(f||r){
        var fx0=-Math.sin(P.yaw),fz0=-Math.cos(P.yaw);
        var rx0=Math.cos(P.yaw),rz0=-Math.sin(P.yaw);
        var dx=fx0*f+rx0*r,dz=fz0*f+rz0*r;
        var L=Math.sqrt(dx*dx+dz*dz);
        if(L>0){
          var ox=P.pos.x,oz=P.pos.z;
          P.pos.x+=dx/L*sp*dt;P.pos.z+=dz/L*sp*dt;collide(P.pos);bob+=dt*9;
          edgePush = S.doorExploded && P.pos.z>=25.99 && dz/L>0.3 && Math.hypot(P.pos.x-ox,P.pos.z-oz)<0.35*sp*dt;
        }
      }
      var baseEyeY = (P.pos.z > 9.3) ? 1.50 : 1.65;
      P.pos.y += (baseEyeY + Math.sin(bob)*.018 - P.pos.y) * Math.min(1, dt * 10);
    }
    camera.position.copy(P.pos);
    camera.rotation.set(P.pitch,P.yaw,0,'YXZ');
  }else if(S.watching){
    S.watchMix=Math.min(1,S.watchMix+dt*2.6);
    var ew=1-Math.pow(1-S.watchMix,3);
    camera.position.lerpVectors(savedView.pos,WATCH.pos,ew);
    camera.rotation.set(savedView.pitch+(WATCH.pitch-savedView.pitch)*ew,
      savedView.yaw+shortAngle(savedView.yaw,WATCH.yaw)*ew,0,'YXZ');
  }else if((S.terminalOpen || S.playingGta) && compScreen.view){
    S.terminalMix=Math.min(1,(S.terminalMix||0)+dt*2.6);
    var et=1-Math.pow(1-S.terminalMix,3), tv=compScreen.view;
    camera.position.lerpVectors(savedView.pos,tv.pos,et);
    camera.rotation.set(savedView.pitch+(tv.pitch-savedView.pitch)*et,
      savedView.yaw+shortAngle(savedView.yaw,tv.yaw)*et,0,'YXZ');
  }else if(S.playingArcade){
    S.arcadeMix=Math.min(1,S.arcadeMix+dt*2.6);
    var ea=1-Math.pow(1-S.arcadeMix,3);
    camera.position.lerpVectors(savedView.pos,ARCADE_VIEW.pos,ea);
    camera.rotation.set(savedView.pitch+(ARCADE_VIEW.pitch-savedView.pitch)*ea,
      savedView.yaw+shortAngle(savedView.yaw,ARCADE_VIEW.yaw)*ea,0,'YXZ');
  }

  // Tremor curto ao ver o cliente pela primeira vez (ver CustomerEvent.js: window.sightFX)
  if (sightShake > 0) {
    sightShake = Math.max(0, sightShake - dt);
    var sm = (sightShake / 0.5) * 0.05;
    camera.position.x += (Math.random() - 0.5) * sm;
    camera.position.y += (Math.random() - 0.5) * sm;
    camera.rotation.z += (Math.random() - 0.5) * sm * 0.7;
  }

  // Tremor da explosao da porta
  if (shakeTime > 0) {
    shakeTime = Math.max(0, shakeTime - dt);
    var mag = (shakeTime / 2.4) * 0.12;
    camera.position.x += (Math.random() - 0.5) * mag;
    camera.position.y += (Math.random() - 0.5) * mag;
  }

  carAlarm.update(dt);
  if (carAlarmOn) {
    camera.getWorldDirection(camFwd);
    carAlarmListener(camera.position.x, camera.position.y, camera.position.z, camFwd.x, camFwd.z, camera.position.z < 6.0);
  }
  if (S.doorExploded) {
    doorExplodedTime += dt;
    if (doorExplodedTime > CAR_ALARM_SECONDS) stopCarAlarm();
    if (doorExplodedTime > DEBRIS_LIFETIME && !debrisGone && doorLeft) {
      // Sumico estilo Streets of Rage: pisca 3 vezes (apaga/acende) e na 4a some de vez.
      var bs = blinkState(doorExplodedTime - DEBRIS_LIFETIME);
      if (bs === 2) {
        debrisGone = true;
        doorLeft.visible = false;
        if (doorRight) doorRight.visible = false;
        for (var di = 0; di < debrisList.length; di++) {
          scene.remove(debrisList[di].mesh);
        }
        debrisList = [];
      } else {
        var blinkVisible = bs === 1;
        for (var di = 0; di < debrisList.length; di++) debrisList[di].mesh.visible = blinkVisible;
        doorLeft.visible = blinkVisible;
        if (doorRight) doorRight.visible = blinkVisible;
      }
    }
  }

  updateCans(dt, canEnv);
  updateBinEgg(dt);

  // Fisica dos destrocos da porta
  if (debrisList.length > 0) {
    for (var di = debrisList.length - 1; di >= 0; di--) {
      var deb = debrisList[di];
      deb.vy -= 9.8 * dt;
      deb.mesh.position.x += deb.vx * dt;
      deb.mesh.position.y += deb.vy * dt;
      deb.mesh.position.z += deb.vz * dt;
      deb.mesh.rotation.x += deb.rotX * dt;
      deb.mesh.rotation.y += deb.rotY * dt;
      if (deb.mesh.position.y <= 0.02) {
        deb.mesh.position.y = 0.02;
        deb.vx *= 0.5; deb.vz *= 0.5; deb.vy = -deb.vy * 0.3;
        if (Math.abs(deb.vy) < 0.2) {
          deb.vy = 0; deb.vx = 0; deb.vz = 0;
        }
      }
    }
  }

  S.insMix+=((S.inspect?1:0)-S.insMix)*Math.min(1,dt*8);
  var insE = S.insMix;
  // Inspecao (insE=1): a fita vai para o centro da tela; renderOrder 999 + depthTest off (setupViewmodelMesh)
  // garantem que nada a atravesse.
  handMesh.position.set(.34 * (1 - insE), (-.26 + Math.sin(bob) * .006) * (1 - insE), -.48 * (1 - insE) - .52 * insE);
  handMesh.scale.setScalar(1.15 * (1 - insE) + 1.25 * insE);
  handMesh.rotation.set(.15 * (1 - insE) + S.insRot.x * insE, -.5 * (1 - insE) + S.insRot.y * insE, .08 * (1 - insE));
  updateCardboard(dt, insE, bob);   // caixa na mao + moedas
  updatePig(dt);                    // porquinho, fuga do carro, cacos do vidro
  updateShotgun(dt, bob);           // arma na mao, recuo, clarao, estilhacos das lampadas
  updateCabinet(dt, insE, bob);     // chave na mao, abertura do armario, cadeado caindo, confete

  if (S.heldCan) {
    if (drinkT > 0) {
      drinkT += dt;
      if (drinkT > 1.35) drinkT = 0;
    }

    var restX = 0.26, restY = -0.20 + Math.sin(bob) * 0.007, restZ = -0.36;
    var restRotX = 0.12, restRotY = -0.25, restRotZ = 0.05 + Math.sin(bob * 0.5) * 0.03;

    if (drinkT <= 0) {
      canHandMesh.position.set(restX, restY, restZ);
      canHandMesh.rotation.set(restRotX, restRotY, restRotZ);
    } else {
      var mouthX = 0.08, mouthY = -0.06, mouthZ = -0.20;
      var curX = restX, curY = restY, curZ = restZ;
      var curRotX = restRotX, curRotY = restRotY, curRotZ = restRotZ;

      if (drinkT < 0.35) {
        var p1 = drinkT / 0.35;
        var s1 = p1 * p1 * (3 - 2 * p1);
        curX = restX + (mouthX - restX) * s1;
        curY = restY + (mouthY - restY) * s1;
        curZ = restZ + (mouthZ - restZ) * s1;
        curRotX = restRotX + (0.45 - restRotX) * s1;
        curRotY = restRotY + (-0.10 - restRotY) * s1;
        curRotZ = restRotZ + (-0.02 - restRotZ) * s1;
      } else if (drinkT < 0.95) {
        var p2 = (drinkT - 0.35) / 0.60;
        var gulpBob = Math.sin(p2 * Math.PI * 4) * 0.006;
        curX = mouthX;
        curY = mouthY + gulpBob;
        curZ = mouthZ + gulpBob * 0.5;
        curRotX = 0.45 + (0.95 - 0.45) * Math.sin(p2 * Math.PI);
        curRotY = -0.10;
        curRotZ = -0.02 + gulpBob * 2;
      } else {
        var p3 = (drinkT - 0.95) / 0.40;
        var s3 = p3 * p3 * (3 - 2 * p3);
        curX = mouthX + (restX - mouthX) * s3;
        curY = mouthY + (restY - mouthY) * s3;
        curZ = mouthZ + (restZ - mouthZ) * s3;
        curRotX = 0.45 + (restRotX - 0.45) * s3;
        curRotY = -0.10 + (restRotY - -0.10) * s3;
        curRotZ = -0.02 + (restRotZ - -0.02) * s3;
      }

      canHandMesh.position.set(curX, curY, curZ);
      canHandMesh.rotation.set(curRotX, curRotY, curRotZ);
    }
  }

  if (updateFan) updateFan(dt, now);
  updateDoorRattle(dt);
  fanHumAcc += dt;
  if (fanHumAcc > 0.1) {
    fanHumAcc = 0;
    var fdx = camera.position.x - fan.pos.x, fdz = camera.position.z - fan.pos.z, fd = Math.sqrt(fdx * fdx + fdz * fdz);
    var fanRate = fan.speed / fan.max;
    fanHumUpdate(fanRate * distanceGain(fd, 1.2, 1.3, 10) * shopOcclusion(P.pos.z, S.doorExploded) * mix.duck, fanRate);
  }
  heroEdgeTick(dt, edgePush);
  if (updateCustomer) updateCustomer(dt, camera);

  pickAcc+=dt;
  if(pickAcc>.05){
    pickAcc=0;
    var busyUI = S.watching || S.playingArcade || S.playingGta || S.inspect || S.terminalOpen || S.fileOpen || S.cutscene;
    var o = !busyUI ? pick() : null;
    var info = o ? labelFor(o) : LABEL_NONE;
    if(o!==hovered){
      hovered=o;
      EL.look.classList.toggle('on', !!o);
      EL.cross.classList.toggle('hot',!!o);
    }
    // Reticula da espingarda (#cross.shotgun em css/styles.css): anel de dispersao no lugar do ponto.
    var gunCross = !!S.heldGun;
    if (gunCross !== lastGunCross) { lastGunCross = gunCross; EL.cross.classList.toggle('shotgun', gunCross); }
    if(o) setHTML(EL.look,'look',info.desc);

    var B = TXT.btn;
    if(SESSION.huntMode) {
      setBtn(0, null, null, false, false);
      setBtn(1, null, null, false, false);
      setBtn(2, null, null, false, false);
      setBtn(3, null, null, false, false);
      setBtn(4, null, null, false, false);
    } else if(S.heldCan) {
      setBtn(0, '[E]', B.drink, true, true);
      setBtn(1, '[F]', B.stow, true, true);
      setBtn(2, '[ESC]', B.exit, false, true);
      setBtn(3, '[G]', B.throwIt, true, true);
      setBtn(4, null, null, false, false);
    } else if(!busyUI) {
      // A chave nao pode ser largada (§5.2): nem [E] sem alvo nem [G]/#mb4 aparecem; so [F] examinar.
      var keyStuck = !!(S.heldKey && S.heldKey.kind === 'key');
      if(o) setBtn(0, '[E]', info.act, true, true);
      else if(S.held) setBtn(0, '[E]', B.dropTape, true, true);
      else if(S.heldBox) setBtn(0, '[E]', B.returnBox, true, true);
      else if(S.heldKey && !keyStuck) setBtn(0, '[E]', CAB_TXT.btnDropNote, true, true);
      else setBtn(0, '[E]', B.use, false, true);
      var holding = !!(S.held || S.heldBox || S.heldKey), canDrop = (holding && !keyStuck) || !!S.heldGun;
      var canCheck = holding || !!(o && (o.userData.type === 'cabinet_qr' || o.userData.type === 'trash_can'));
      setBtn(1, '[F]', B.check, canCheck, true);
      setBtn(2, '[ESC]', B.exit, false, true);
      setBtn(3, '[G]', S.heldGun ? GUN_TXT.btnDrop : S.heldKey ? CAB_TXT.btnDrop : B.throwIt, canDrop, canDrop);
      setBtn(4, null, null, false, false);
    } else if(S.inspect) {
      setBtn(0, '[E]', B.use, false, true);
      setBtn(1, '[F]', B.turn, true, true);
      setBtn(2, '[ESC]', B.cancel, true, true);
      setBtn(3, null, null, false, false);
      setBtn(4, null, null, false, false);
    } else if(S.watching) {
      setBtn(0, '[W]', B.playPause, true, true);
      setBtn(1, '[A]', B.rewind, true, true);
      setBtn(2, '[E]', B.eject, true, true);
      setBtn(3, '[D]', B.forward, true, true);
      setBtn(4, '[S]', B.standUp, true, true);
    } else if(S.playingArcade) {
      setBtn(0, null, null, false, false);
      setBtn(1, null, null, false, false);
      setBtn(2, '[ESC]', B.standUp, true, true);
      setBtn(3, null, null, false, false);
      setBtn(4, null, null, false, false);
    } else if(S.terminalOpen) {
      setBtn(0, null, null, false, false);
      setBtn(1, null, null, false, false);
      setBtn(2, '[ESC]', B.exit, true, true);
      setBtn(3, null, null, false, false);
      setBtn(4, null, null, false, false);
    } else if(S.playingGta) {
      setBtn(0, null, null, false, false);
      setBtn(1, null, null, false, false);
      setBtn(2, B.keyMouse, B.standUp, true, true);
      setBtn(3, null, null, false, false);
      setBtn(4, null, null, false, false);
    }
    var gunBtn = !!S.heldGun && (!busyUI || S.cutscene === 'hunt');   // botao de tiro (touch; no HUNT aparece desde a entrada)
    setBtn(5, B.keyClick, GUN_TXT.btnFire, gunBtn, gunBtn);
  }

  if(S.vcr==='loading'){S.vcr='playing';S.msg='';}
  var hasTape = !!(S.inDeck && S.inDeck.id);
  var isTvPlaying = hasTape && S.vcr === 'playing';
  // TV picture stays up while paused/seeking, goes dark when stopped/ejected.
  var tvActive = hasTape && (S.vcr === 'playing' || S.vcr === 'paused' || S.vcr === 'ff' || S.vcr === 'rew');

  if(S.inDeck){
    var dur=S.inDeck.dur;
    if(S.vcr==='playing'){
      S.t+=dt; // corrected against the YouTube clock in ytTick()
      if(S.t>=dur){S.t=dur;S.vcr='stopped';S.msg=TXT.vcr.end;}
    }
    else if(S.vcr==='ff'){
      S.t=Math.min(dur,S.t+dt*16);
      if(S.t>=dur){S.vcr='stopped';S.msg=TXT.vcr.end;}
    }
    else if(S.vcr==='rew'){
      S.t=Math.max(0,S.t-dt*19);
      if(S.t<=0){S.vcr='stopped';S.msg=TXT.vcr.start;}
    }
    S.rewound=S.t<=.5;}
  if(S.trackAuto>0&&S.vcr==='playing'){
    S.trackAuto-=dt*.42;S.tracking*=(1-dt*1.5);
    if(S.trackAuto<=0){S.tracking=0;toast(TXT.toast.autoTracking);}}
  tvGlow.intensity=S.inDeck?(S.vcr==='playing'?.9:.5):.3;

  updateToast(dt);

  var distToTv = camera.position.distanceTo(SCRP);
  camera.getWorldDirection(camFwd);
  toTv.copy(SCRP).sub(camera.position).normalize();
  toCam.copy(camera.position).sub(SCRP).normalize();
  var tvFacing = S.watching || (distToTv < 8.5 && camFwd.dot(toTv) > 0.12 && tvNormal.dot(toCam) > 0.02);
  var tvVisible = tvActive && tvFacing;

  // The CRT overlay and TV screen texture only matter when the TV is near/in view.
  if(S.watching) syncCRT(camera, SCRP, corners);
  else if(S.crtOn) hideCRT();
  if(tvFacing || distToTv < 12){
    fxAcc+=dt;
    if(fxAcc>0.15){fxAcc=0; drawFX(screenCtx, screenTex); }
  }
  audioState();
  updateMoon(camera, dt);
  renderer.render(scene,camera);

  if(!ytEl) ytEl = document.getElementById('yt-container');
  if(!muteInd) muteInd = document.getElementById('yt-mute-indicator');
  var op = tvVisible ? '1' : '0';
  if(ytEl && op !== lastYtOpacity){ lastYtOpacity = op; ytEl.style.opacity = op; screenMesh.material = tvVisible ? screenHoleMat : screenTexMat; }
  // Arcade: o iframe fica numa camada atras do canvas e o vidro vira um buraco enquanto a maquina
  // esta a vista. Fora de vista so escondemos (opacity 0): o jogo continua rodando e baixando.
  var arcVisible = false;
  if(!arcade.loaded && arcade.open && S.phase==='inside'){ arcadeBootT += dt; if(arcadeBootT > 2) loadArcade(); }
  if(arcade.loaded){
    var dA = camera.position.distanceTo(arcade.worldPos);
    toTv.copy(arcade.worldPos).sub(camera.position).normalize();
    toCam.copy(camera.position).sub(arcade.worldPos).normalize();
    arcVisible = S.playingArcade || (dA < 9 && camFwd.dot(toTv) > 0.12 && arcade.normal.dot(toCam) > 0.02);
    if(!arcContainer) arcContainer = arcade.container;
    var aop = arcVisible ? '1' : '0';
    if(aop !== lastArcOpacity){
      lastArcOpacity = aop; arcContainer.style.opacity = aop;
      if(arcade.screenNode) arcade.screenNode.material = arcVisible ? arcade.holeMat : arcade.texMat;
    }
  }
  // Computador: a tela 3D mostra o cartao do terminal (sentado, fora do jogo) ou o GTA (rodando); fora disso, a
  // textura de espera ("CLIQUE OU [E] VER CREDITOS").
  var termVisible = false, gtaVisible = false;
  if(termLayer){
    termVisible = S.terminalOpen && !S.playingGta;
    var top = termVisible ? '1' : '0';
    if(top !== lastTermOpacity){ lastTermOpacity = top; termContainer.style.opacity = top; }
    if(termVisible) placeScreenLayer(termLayer, camera);
  }
  if(gta.loaded){
    var dG = camera.position.distanceTo(compScreen.geom.center);
    toTv.copy(compScreen.geom.center).sub(camera.position).normalize();
    toCam.copy(camera.position).sub(compScreen.geom.center).normalize();
    gtaVisible = S.playingGta || (!S.terminalOpen && dG < 4 && camFwd.dot(toTv) > 0.2 && compScreen.normal.dot(toCam) > 0.1);
    var gop = gtaVisible ? '1' : '0';
    if(gop !== lastGtaOpacity){ lastGtaOpacity = gop; gta.container.style.opacity = gop; }
    if(gtaVisible) placeScreenLayer(gta.layer, camera);
  }
  var wantHole = termVisible || gtaVisible;
  if(compScreen.mesh && wantHole !== lastCompHole){ lastCompHole = wantHole; compScreen.mesh.material = wantHole ? compScreen.holeMat : compScreen.texMat; }
  if(cssRenderer && tvVisible) cssRenderer.render(scene, camera);
  if(arcVisible){
    if(!arcade.layer) arcade.layer = createScreenLayer(arcade.container, { center: arcade.worldPos, right: arcade.right, up: arcade.up, w: arcade.size, h: arcade.size }, 640, 640);
    placeScreenLayer(arcade.layer, camera);
  }

  var md = (isTvPlaying && S.tvMuted) ? 'flex' : 'none';
  if(muteInd && md !== lastMuteDisp){ lastMuteDisp = md; muteInd.style.display = md; }

  initYtPlayer();
  // Mistura: abaixa a TV enquanto toca o alarme, a explosao ou a tensao do cliente
  updateMix(dt);
  setDuck((carAlarmOn || (S.doorExploded && doorExplodedTime < 3) || isTensionActive() || isHeroActive() || isCustomerCineActive()) ? 0.35 : 1);
  ytTick(dt, tvActive, tvVolume(distToTv, P.pos.z, S.doorExploded, S.watching));
}

// Botoes do painel do deck
Array.prototype.forEach.call(document.querySelectorAll('#deck .b'),function(b){
  var a=b.dataset.a;
  b.addEventListener('pointerdown',function(e){e.preventDefault();
    b.classList.add('held');act(a,true);});
  var up=function(){if(!b.classList.contains('held'))return;
    b.classList.remove('held');if(a==='ff'||a==='rew')act(a,false);};
  b.addEventListener('pointerup',up);b.addEventListener('pointerleave',up);
});

function attachMB(id, downFn, upFn) {
  var b = $('#'+id);
  if(!b) return;
  b.addEventListener('pointerdown', function(e){ e.preventDefault(); if(S.cutscene) return; b.classList.add('active'); downFn(); });
  var up = function(){ if(b.classList.contains('active')){ b.classList.remove('active'); if(upFn)upFn(); } };
  b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
}

attachMB('mb1', function(){
  if(S.watching) act(S.vcr==='playing'?'pause':'play');
  else {   // igual ao E do teclado: tocar na TV/VCR tambem tira o som do mudo
    var o = pick();
    if(o && (o.userData.type === 'tv' || o.userData.type === 'vcr') && S.tvMuted) unmuteTv();
    use(o);
  }
});
attachMB('mb2', function(){   // igual ao F do teclado
  if(S.watching) act('rew', true);
  else if(S.heldCan) stowCan();
  else if(S.held || S.heldBox || S.heldKey) toggleInspect();
  else {
    var o = pick();
    if(o && o.userData.type === 'trash_can') inspectBin();
    else inspectCabinetTarget(o);
  }
}, function(){ if(S.watching) act('rew', false); });
attachMB('mb3', function(){
  if(S.playingGta) exitGta();
  else if(S.playingArcade) exitArcade();
  else if(S.watching) act('eject');
  else if(S.inspect) toggleInspect();
});
attachMB('mb7', function(){ if(S.heldGun) fireShotgun(); });
attachMB('mb4', function(){ if(S.watching) act('ff', true); else if(S.heldGun) dropHeldGun(); else if(S.heldKey) dropHeldKey(); else if(S.heldCan) throwHeldCan(); else if(S.heldBox) throwHeldBox(); else if(S.held) throwHeldTape(); }, function(){ if(S.watching) act('ff', false); });
attachMB('mb5', function(){ if(S.watching) exitWatch(); });
// Botao [C] CLIENTE (touch): so na depuracao (?debug); fora dela fica escondido.
if (!DEBUG) { var mb6 = document.getElementById('mb6'); if (mb6) mb6.style.display = 'none'; }
attachMB('mb6', function(){
  if(DEBUG && S.phase === 'inside'){
    spawnCustomerNow();
  }
});

$('#snd').onclick=function(){
  A.on=!A.on;
  $('#snd').textContent=A.on?TXT.sound.on:TXT.sound.muted;
  if(!A.on) muteTv();
  else unmuteTv();
};

// resetWorld(): restauração dos sistemas deste módulo (os demais se registram em seus próprios arquivos:
// VCR.js, ThrownCan.js, CustomerEvent.js). Ordem: UI/mão (-30) -> mundo solto (0) -> fitas/TV/jogador (10+).
// Fliperama e GTA so sao descarregados se o jogador estava jogando (exitArcade/exitGta).
onWorldReset(function() {
  resetTouchControls();
  if (S.doorModalOpen) closeDoorModal();
  if (S.playingArcade) exitArcade();
  if (S.playingGta) exitGta();
  if (S.watching) exitWatch();
  if (S.terminalOpen) closeTerminal();
  if (S.shareModalOpen) closeShareModal();
  if (S.held) stow();                 // devolve a fita e sai do inspect
  if (S.inspect) { S.inspect = false; }
  if (S.heldCan) stowCan();
  drinkT = 0;
  S.fainted = false;
  S.insRot.x = 0; S.insRot.y = 0; S.insMix = 0;
  var app = document.getElementById('app'); if (app) app.classList.remove('sight-glitch');
  var sf = document.getElementById('sight-flash'); if (sf) sf.classList.remove('on');
  var sfl = document.getElementById('screen-flash'); if (sfl) { sfl.style.display = 'none'; sfl.style.opacity = '0'; }
}, -30);

// Porta, campainha, destroços, alarme do carro.
onWorldReset(function() {
  S.bellTaps = 0; S.doorTries = 0;
  if (bellCounterTimer) { clearTimeout(bellCounterTimer); bellCounterTimer = null; }
  var bc = document.getElementById('bell-counter'); if (bc) bc.style.display = 'none';
  shakeTime = 0; sightShake = 0;
  setDoorOpen(0);
  resetExplodedDoor();
});

// Lixeira (quebrada/frango/fitas empilhadas).
onWorldReset(function() { restoreBin(); binInfo.pile = 0; });

// Ventilador e luzes do teto.
onWorldReset(function() {
  fan.on = false; fan.speed = 0;
  S.lightsOff = false;
  if (setLights) setLights(true);
});

// Fitas de volta nas prateleiras + TV de novo em autoplay mudo com o vídeo mais recente.
onWorldReset(function() {
  S.tapes.forEach(function(m) {
    var h = m.userData && m.userData.home;
    releaseTape(m, binInfo);
    m.visible = true;
    if (h) { m.position.copy(h.pos); m.rotation.copy(h.rot); }
  });
  binInfo.pile = 0;
  S.held = null; S.inDeck = null;
  S.tvMuted = true;
  ytMute();
  var mi = document.getElementById('yt-mute-indicator'); if (mi) mi.style.display = 'flex';
  autoplayLatest(currentCatalog[0]);
}, 10);

// Jogador de volta atrás do balcão (no título a câmera é reposicionada por returnToTitle()).
onWorldReset(function(opts) {
  if (opts.reason === 'title' || opts.reason === 'newgame') return;
  P.pos.set(0, 1.65, 5.2); P.yaw = 0; P.pitch = 0;
  camera.position.copy(P.pos); camera.rotation.set(0, 0, 0);
}, 20);

tick();

var urlParams = new URLSearchParams(window.location.search);
var cid = urlParams.get('channel_id') || urlParams.get('playlist_id') || urlParams.get('id') || urlParams.get('c');

// Troca de idioma recarrega a pagina (src/i18n/boot.js): a sessao volta pelo snapshot; o mundo recomeca do inicio.
setResumeProvider(function(){
  var snap = JSON.parse(JSON.stringify(SESSION));
  snap.sessionElapsed = SESSION.sessionStart == null ? null : performance.now() - SESSION.sessionStart;
  snap.sessionStart = null;
  return { session: snap, feed: lastFeedText || ($('#feed') ? $('#feed').value : ''), inside: S.phase === 'inside' };
});
var resume = consumeResume();
if(resume){
  var rs = resume.session || {};
  Object.keys(SESSION).forEach(function(k){ if(k !== 'sessionStart' && k !== 'huntMode' && rs[k] !== undefined) SESSION[k] = rs[k]; });
  if(typeof rs.sessionElapsed === 'number') SESSION.sessionStart = performance.now() - rs.sessionElapsed;
  if(resume.feed) $('#feed').value = resume.feed;
  if(resume.inside && resume.feed) setTimeout(function(){ $('#btGo').click(); }, 100);
} else if(cid){
  $('#feed').value = cid;
  setTimeout(function(){ $('#btGo').click(); }, 100);
}
