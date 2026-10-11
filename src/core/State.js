export const S = {
  phase: 'outside', handle: '@canal', tapes: [], held: null, inDeck: null, vcr: 'empty',
  msg: '', tracking: 0, trackAuto: 0, rewound: true, watching: false, watchMix: 0, loadT: 0, t: 0,
  inspect: false, insRot: {x:0, y:0}, insMix: 0, real: false, crtOn: false,
  lightsOff: false,tvMuted: true,
  shareModalOpen: false, terminalOpen: false,
  doorTries: 0, doorModalOpen: false,
  playingArcade: false, arcadeMix: 0,
  bellTaps: 0, doorExploded: false, playingGta: false,
  heldBox: null, coins: 0, carGone: false, fileOpen: false,   // quest do porquinho (Cardboard.js / Pig.js)
  heldGun: null,   // shotgun na mao (entities/Shotgun.js)
  heldKey: null,   // chave do armario na mao (entities/Cabinet.js)
  cutscene: false, camForced: false,   // final do heroi (HeroFinale.js): sem WASD/interacao; camForced = olhar preso no foguete
  fainted: false, channelTitle: '', channelMeta: null, _lastYtId: null
};
