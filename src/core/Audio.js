import { S } from './State.js';

export const A = { ctx: null, on: true };

// Chrome/Safari criam o contexto 'suspended' sem gesto do usuário; retoma a cada chamada vinda de um gesto.
export function audioResume() {
  if (A.ctx && A.ctx.state === 'suspended') {
    try { var p = A.ctx.resume(); if (p && p.catch) p.catch(function() {}); } catch (e) {}
  }
}

export function audioInit() {
  if (A.ctx) { audioResume(); return; }
  var C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  try { A.ctx = new C(); } catch (e) { return; }
  audioResume();
  
  var nb = A.ctx.createBuffer(1, A.ctx.sampleRate * 2, A.ctx.sampleRate);
  var d = nb.getChannelData(0);
  for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  A.noise = nb;
  
  A.master = A.ctx.createGain(); 
  A.master.gain.value = 0.9; 
  // Limitador no fim da cadeia: sons somados (alarme + explosao + TV de fundo etc.) nao estouram nem distorcem.
  A.limiter = A.ctx.createDynamicsCompressor();
  A.limiter.threshold.value = -8; A.limiter.knee.value = 6; A.limiter.ratio.value = 14;
  A.limiter.attack.value = 0.003; A.limiter.release.value = 0.22;
  A.master.connect(A.limiter); A.limiter.connect(A.ctx.destination);
  
  A.whir = A.ctx.createBufferSource(); 
  A.whir.buffer = nb; 
  A.whir.loop = true;
  A.whirF = A.ctx.createBiquadFilter(); 
  A.whirF.type = 'bandpass'; 
  A.whirF.Q.value = 7;
  A.whirF.frequency.value = 420;
  A.whirG = A.ctx.createGain(); 
  A.whirG.gain.value = 0;
  A.whir.connect(A.whirF); 
  A.whirF.connect(A.whirG); 
  A.whirG.connect(A.master); 
  A.whir.start();
  
  A.hissG = A.ctx.createGain(); 
  A.hissG.gain.value = 0;
  A.hissG.connect(A.master);
}

// Qualquer gesto posterior também destrava o áudio (ex.: aba voltou de background).
['pointerdown', 'keydown', 'touchstart'].forEach(function(ev) {
  window.addEventListener(ev, audioResume, { passive: true });
});

export function ramp(p, v, t) {
  if (!A.ctx) return;
  p.cancelScheduledValues(A.ctx.currentTime);
  p.setTargetAtTime(A.on ? v : 0, A.ctx.currentTime, t || 0.12);
}

// Impacto de plastico/madeira (fita na prateleira, lixeira, deck): "tum" grave com queda de tom + estalo de
// ruido filtrado + cauda curta. Variacao leve de tom a cada chamada, sem alocar alem dos nos da propria nota.
export function clunk() {
  if (!A.ctx || !A.on) return;
  var c = A.ctx, now = c.currentTime, k = 0.9 + Math.random() * 0.25;
  var o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(170 * k, now); o.frequency.exponentialRampToValueAtTime(62 * k, now + 0.12);
  var og = c.createGain(); og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.38, now + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
  o.connect(og); og.connect(A.master); o.start(now); o.stop(now + 0.2);
  var s = c.createBufferSource(); s.buffer = A.noise;
  var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 * k; f.Q.value = 0.9;
  var g = c.createGain(); g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.3, now + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
  s.connect(f); f.connect(g); g.connect(A.master); s.start(now, Math.random() * 1.5); s.stop(now + 0.09);
  var s2 = c.createBufferSource(); s2.buffer = A.noise;
  var f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 320;
  var g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, now + 0.01);
  g2.gain.exponentialRampToValueAtTime(0.22, now + 0.02); g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  s2.connect(f2); f2.connect(g2); g2.connect(A.master); s2.start(now, Math.random() * 1.5); s2.stop(now + 0.26);
}

export function beep(f, d) {
  if (!A.ctx || !A.on) return;
  f = f || 880; d = d || 0.09;
  var o = A.ctx.createOscillator(); o.frequency.value = f;
  var g = A.ctx.createGain(); g.gain.setValueAtTime(0.09, A.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + d);
  o.connect(g); g.connect(A.master); o.start(); o.stop(A.ctx.currentTime + d + 0.02);
}

export function bellDing(pitchMult) {
  if (!A.ctx || !A.on) return;
  var mult = pitchMult || 1.0;
  var now = A.ctx.currentTime;
  // Fundamental metallic tone (C7 ~ 2093 Hz) + chime overtone (~3300 Hz)
  var freqs = [2093 * mult, 3320 * mult, 5200 * mult];
  var gains = [0.22, 0.12, 0.05];
  freqs.forEach(function(f, idx) {
    var o = A.ctx.createOscillator();
    var g = A.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, now);
    g.gain.setValueAtTime(gains[idx], now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (idx === 0 ? 1.4 : 0.9));
    o.connect(g);
    g.connect(A.master);
    o.start(now);
    o.stop(now + 1.45);
  });
}

export function explosionSound() {
  if (!A.ctx || !A.on) return;
  var now = A.ctx.currentTime;
  
  // 1. Sub-grave estrondoso da detonação
  var sub = A.ctx.createOscillator();
  var subGain = A.ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(160, now);
  sub.frequency.exponentialRampToValueAtTime(26, now + 1.4);
  subGain.gain.setValueAtTime(0.9, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
  sub.connect(subGain);
  subGain.connect(A.master);
  sub.start(now);
  sub.stop(now + 2.1);

  // 2. Ruído branco de onda de choque e estilhaços
  if (A.noise) {
    var noise = A.ctx.createBufferSource();
    noise.buffer = A.noise;
    var filter = A.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3600, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 2.2);
    var nGain = A.ctx.createGain();
    nGain.gain.setValueAtTime(0.95, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 2.4);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(A.master);
    noise.start(now);
    noise.stop(now + 2.5);
  }

  // 3. Estilhaços de vidro e ressonância metálica aguda
  var shatterFreqs = [3800, 5200, 6800, 8900];
  shatterFreqs.forEach(function(f, i) {
    var osc = A.ctx.createOscillator();
    var g = A.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f + (Math.random() * 400 - 200), now + i * 0.04);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.6 + i * 0.1);
    g.gain.setValueAtTime(0.2, now + i * 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8 + i * 0.1);
    osc.connect(g);
    g.connect(A.master);
    osc.start(now + i * 0.04);
    osc.stop(now + 0.9 + i * 0.1);
  });
}

export function glitchSound() {
  if (!A.ctx || !A.on) return;
  var now = A.ctx.currentTime;
  for (var i = 0; i < 5; i++) {
    var o = A.ctx.createOscillator();
    var g = A.ctx.createGain();
    o.type = (i % 2 === 0) ? 'sawtooth' : 'square';
    o.frequency.setValueAtTime(450 + Math.random() * 2200, now + i * 0.05);
    g.gain.setValueAtTime(0.14, now + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + (i + 1) * 0.05);
    o.connect(g);
    g.connect(A.master);
    o.start(now + i * 0.05);
    o.stop(now + (i + 1) * 0.05 + 0.01);
  }
}

export function switchClick() {
  if (!A.ctx || !A.on) return;
  var now = A.ctx.currentTime;
  // Mechanical snap: click pop + micro-burst of filtered noise
  var o = A.ctx.createOscillator();
  var g = A.ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(320, now);
  o.frequency.exponentialRampToValueAtTime(80, now + 0.04);
  g.gain.setValueAtTime(0.4, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
  o.connect(g); g.connect(A.master);
  o.start(now); o.stop(now + 0.05);

  if (A.noise) {
    var s = A.ctx.createBufferSource(); s.buffer = A.noise;
    var f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 3;
    var ng = A.ctx.createGain();
    ng.gain.setValueAtTime(0.3, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    s.connect(f); f.connect(ng); ng.connect(A.master);
    s.start(now); s.stop(now + 0.04);
  }
}

export function keyClick() {
  if (!A.ctx || !A.on) return;
  var now = A.ctx.currentTime;
  var o = A.ctx.createOscillator();
  var g = A.ctx.createGain();
  o.frequency.setValueAtTime(1400 + Math.random() * 400, now);
  g.gain.setValueAtTime(0.08, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  o.connect(g); g.connect(A.master);
  o.start(now); o.stop(now + 0.035);
}

export function vcrMotor() {
  if (!A.ctx || !A.on || !A.noise) return;
  var now = A.ctx.currentTime;
  var s = A.ctx.createBufferSource(); s.buffer = A.noise;
  var f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 450; f.Q.value = 5;
  var g = A.ctx.createGain();
  g.gain.setValueAtTime(0.12, now);
  g.gain.linearRampToValueAtTime(0.18, now + 0.2);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  s.connect(f); f.connect(g); g.connect(A.master);
  s.start(now); s.stop(now + 0.6);
}

let lastAudioState = '', lastWatching = false;
export function audioState() {
  if (!A.ctx || (S.vcr === lastAudioState && S.watching === lastWatching)) return;
  lastAudioState = S.vcr;
  lastWatching = S.watching;
  var st = S.vcr;
  if (st === 'ff' || st === 'rew') {
    ramp(A.whirG.gain, 0.04, 0.05);
    A.whirF.frequency.setTargetAtTime(st === 'ff' ? 1200 : 900, A.ctx.currentTime, 0.1);
    ramp(A.hissG.gain, 0);
  } else if (st === 'loading') {
    ramp(A.whirG.gain, 0.02, 0.06);
    A.whirF.frequency.setTargetAtTime(300, A.ctx.currentTime, 0.1);
    ramp(A.hissG.gain, 0);
  } else if (st === 'playing') {
    ramp(A.whirG.gain, 0, 0.2);
    ramp(A.hissG.gain, 0, 0.2); // mute static when video plays
  } else {
    ramp(A.whirG.gain, 0, 0.2);
    ramp(A.hissG.gain, 0, 0.1);
  }
}

// Lata de aluminio: abre (estalo do anel + chiado do gas) e um "tink" metalico com parciais inarmonicas.
export function canSound() {
  if (!A.ctx || !A.on) return;
  var c = A.ctx, now = c.currentTime;
  [[2210, 0.09, 0.0], [3340, 0.06, 0.0], [5120, 0.035, 0.012]].forEach(function(n) {
    var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = n[0];
    var g = c.createGain(), t = now + n[2];
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(n[1], t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.18);
  });
  var o2 = c.createOscillator(); o2.type = 'triangle';
  o2.frequency.setValueAtTime(1400, now); o2.frequency.exponentialRampToValueAtTime(320, now + 0.08);
  var g1 = c.createGain(); g1.gain.setValueAtTime(0.16, now); g1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  o2.connect(g1); g1.connect(A.master); o2.start(now); o2.stop(now + 0.1);
  if (A.noise) {   // chiado do gas: ruido agudo que sobe e some
    var s = c.createBufferSource(); s.buffer = A.noise;
    var f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.setValueAtTime(3000, now + 0.03); f.frequency.linearRampToValueAtTime(5200, now + 0.5);
    var g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, now + 0.03);
    g2.gain.exponentialRampToValueAtTime(0.16, now + 0.07); g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    s.connect(f); f.connect(g2); g2.connect(A.master);
    s.start(now + 0.03, Math.random() * 1.5); s.stop(now + 0.52);
  }
}

// Conquista: dois toques ascendentes curtos (quinta + oitava), brilho de sino.
export function achievementSound() {
  if (!A.ctx || !A.on) return;
  var now = A.ctx.currentTime;
  [[659, 0], [988, 0.11], [1319, 0.22]].forEach(function(n) {
    var o = A.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = n[0];
    var g = A.ctx.createGain(); var t = now + n[1];
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + 0.36);
  });
}

export function gulpSound() {
  if (!A.ctx || !A.on) return;
  var now = A.ctx.currentTime;
  // Dois goles sucessivos (glub, glub)
  [0, 0.26].forEach(function(delay, idx) {
    var t = now + delay;
    var o = A.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(340 - idx * 50, t);
    o.frequency.exponentialRampToValueAtTime(130, t + 0.12);
    var g = A.ctx.createGain();
    g.gain.setValueAtTime(0.26, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + 0.14);
  });
  // Suspiro refrescante "ahh" no final do gole
  if (A.noise) {
    var tAh = now + 0.65;
    var s = A.ctx.createBufferSource(); s.buffer = A.noise;
    var f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 1.8;
    var gAh = A.ctx.createGain();
    gAh.gain.setValueAtTime(0.001, tAh);
    gAh.gain.linearRampToValueAtTime(0.07, tAh + 0.14);
    gAh.gain.exponentialRampToValueAtTime(0.001, tAh + 0.45);
    s.connect(f); f.connect(gAh); gAh.connect(A.master);
    s.start(tAh); s.stop(tAh + 0.5);
  }
}

// Porta de aluminio comercial com vidro temperado fechando e travando atras do jogador.
// Menos subwoofer, mais metal seco: o grave do antigo "baque de 35 Hz" saiu quase todo.
//  1. folha batendo no batente: corpo curto de esquadria (sem cauda grave) + estalo seco do contato
//     + dois modos do vidro temperado vibrando de leve na moldura;
//  2. cilindro/tambor girando: estalos agudos e curtos;
//  3. ferrolho de aco encaixando na contra-testa: pancada metalica media, seca.
export function doorLockSound() {
  if (!A.ctx || !A.on || !A.noise) return;
  var c = A.ctx, now = c.currentTime;

  // 1. impacto da folha no batente: fundamental media e decaimento curtissimo (aluminio nao "boom")
  var thudOsc = c.createOscillator(); thudOsc.type = 'triangle';
  thudOsc.frequency.setValueAtTime(122, now);
  thudOsc.frequency.exponentialRampToValueAtTime(76, now + 0.05);
  var thudGain = c.createGain();
  thudGain.gain.setValueAtTime(0.0001, now);
  thudGain.gain.exponentialRampToValueAtTime(0.15, now + 0.004);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
  thudOsc.connect(thudGain); thudGain.connect(A.master);
  thudOsc.start(now); thudOsc.stop(now + 0.09);

  noiseBurst('bandpass', 540, 1.1, 0.26, 0.05, now);              // batida da esquadria (medio, nao grave)
  noiseBurst('bandpass', 2600, 3, 0.2, 0.018, now);               // contato seco borracha/aluminio
  metalHit(now + 0.004, 352, 0.055, 0.16);                        // vidro temperado vibrando na moldura
  metalHit(now + 0.004, 812, 0.03, 0.09);

  // 2. cilindro/tambor girando: dois estalos curtos e agudos
  var tLock = now + 0.14;
  noiseBurst('bandpass', 4200, 7, 0.16, 0.012, tLock);
  noiseBurst('bandpass', 3100, 6, 0.2, 0.016, tLock + 0.028);
  metalHit(tLock + 0.028, 1760, 0.05, 0.035);                     // tinido agudo do miolo

  // 3. ferrolho de aco na contra-testa: "clack" metalico seco, sem sub-grave
  var tBolt = tLock + 0.055;
  var boltOsc = c.createOscillator(); boltOsc.type = 'triangle';
  boltOsc.frequency.setValueAtTime(205, tBolt);
  boltOsc.frequency.exponentialRampToValueAtTime(118, tBolt + 0.05);
  var boltGain = c.createGain();
  boltGain.gain.setValueAtTime(0.0001, tBolt);
  boltGain.gain.exponentialRampToValueAtTime(0.22, tBolt + 0.004);
  boltGain.gain.exponentialRampToValueAtTime(0.0001, tBolt + 0.08);
  boltOsc.connect(boltGain); boltGain.connect(A.master);
  boltOsc.start(tBolt); boltOsc.stop(tBolt + 0.1);

  noiseBurst('bandpass', 1250, 4, 0.3, 0.035, tBolt);             // aco contra aco
  metalHit(tBolt, 760, 0.1, 0.07);                                // modo da chapa da contra-testa
  metalHit(tBolt + 0.006, 1340, 0.06, 0.05);
}

// Som realista de maçaneta de porta trancada sendo forçada (rattle / jiggle de ferrolho emperrado)
// Tentativa de abrir a porta de vidro trancada. `s` (~0.8..1.8) cresce a cada tentativa: mais forca, mais chocalho.
//  1. a alavanca desce (clique metalico) e a porta bate no trinco: tranco grave da folha inteira;
//  2. a lingueta estala na chapa duas vezes (clack-clack) com tinido metalico;
//  3. o vidro e a moldura ressoam (modos graves com tremolo = chocalho) e a moldura de aluminio faz tiques irregulares.
export function doorJiggleSound(s) {
  if (!A.ctx || !A.on || !A.noise) return;
  var c = A.ctx, now = c.currentTime, str = s == null ? 1 : s;
  // Curva sublinear com teto: a forca cresce 0.8 -> 1.8 mas o ganho so vai de 0.50 a 0.88 (raiz), entao
  // tentativas seguidas ficam mais cheias sem empurrar o limitador mestre (antes era linear e passava de 1.1).
  var u = Math.max(0, Math.min(1, (str - 0.8) / 1));
  var k = Math.min(0.92, 0.5 + 0.38 * Math.sqrt(u));
  function sine(f0, f1, t, dur, gain, tremHz) {
    var o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.85);
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var out = g;
    if (tremHz) {                                                   // tremolo: o vidro "chocalha"
      var tg = c.createGain(); tg.gain.value = 0.55;
      var lfo = c.createOscillator(); lfo.frequency.value = tremHz; var lg = c.createGain(); lg.gain.value = 0.45;
      lfo.connect(lg); lg.connect(tg.gain); g.connect(tg); out = tg; lfo.start(t); lfo.stop(t + dur + 0.02);
    }
    o.connect(g); out.connect(A.master); o.start(t); o.stop(t + dur + 0.02);
  }
  // 1. alavanca + tranco da folha inteira no trinco
  noiseBurst('bandpass', 2300, 4, 0.18, 0.014, now);
  var t1 = now + 0.035;
  sine(95, 44, t1, 0.24, 0.55 * k);
  noiseBurst('lowpass', 260, 0.8, 0.4 * k, 0.1, t1);
  // 2. lingueta: clack-clack
  [0.012, 0.075].forEach(function(dt, i) {
    var t = t1 + dt;
    noiseBurst('bandpass', 2000 + i * 700, 6, (0.34 - i * 0.08) * k, 0.024, t);
    metalHit(t, 1020 + i * 380, (0.09 - i * 0.025) * k, 0.07);
  });
  // 3. vidro e moldura ressoando: a chapa de vidro temperado "chocalha" oca dentro da esquadria de aluminio
  sine(196, 188, t1, 0.9, 0.06 * k, 22);                            // modo oco do painel inteiro
  sine(318, 300, t1, 0.8, 0.105 * k, 27);
  sine(512, 490, t1, 0.65, 0.075 * k, 31);
  sine(838, 800, t1, 0.5, 0.042 * k, 36);
  noiseBurst('bandpass', 430, 7, 0.09 * k, 0.4, t1 + 0.02, 330);     // ar/vidro vibrando na borracha da esquadria
  var n = 5 + Math.round(str * 3), t = t1 + 0.11;
  for (var i = 0; i < n; i++) {                                     // tiques da moldura de aluminio
    var d = 1 - i / (n + 1);
    noiseBurst('bandpass', 3800 + Math.random() * 3200, 5, 0.1 * k * d, 0.014, t);
    t += 0.028 + Math.random() * 0.05;
  }
}

export function pageFlipSound() {
  if (!A.ctx || !A.on) return;
  var now = A.ctx.currentTime;
  if (A.noise) {
    var nSource = A.ctx.createBufferSource();
    nSource.buffer = A.noise;
    var nFilter = A.ctx.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.setValueAtTime(1400, now);
    nFilter.frequency.exponentialRampToValueAtTime(800, now + 0.15);
    nFilter.Q.value = 2.2;
    var nGain = A.ctx.createGain();
    nGain.gain.setValueAtTime(0.38, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    nSource.connect(nFilter); nFilter.connect(nGain); nGain.connect(A.master);
    nSource.start(now); nSource.stop(now + 0.18);
  }
}

// 1. Tense dissonant piano chord sting (horror/mystery impact)
export function tensePianoSting() {
  if (!A.ctx || !A.on) return;
  var now = A.ctx.currentTime;
  var t0 = now;

  // Dissonant low cluster chord: C2 (65.41Hz), C#2 (69.30Hz), F#2 (92.50Hz), G2 (98.00Hz), D#3 (155.56Hz)
  var chord = [65.41, 69.30, 92.50, 98.00, 155.56];

  // Piano hammer / soundboard percussive strike transient
  var thud = A.ctx.createOscillator();
  var thudG = A.ctx.createGain();
  thud.type = 'triangle';
  thud.frequency.setValueAtTime(120, t0);
  thud.frequency.exponentialRampToValueAtTime(35, t0 + 0.07);
  thudG.gain.setValueAtTime(0.35, t0);
  thudG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
  thud.connect(thudG);
  thudG.connect(A.master);
  thud.start(t0);
  thud.stop(t0 + 0.09);

  if (A.noise) {
    var tap = A.ctx.createBufferSource();
    tap.buffer = A.noise;
    var tapF = A.ctx.createBiquadFilter();
    tapF.type = 'bandpass';
    tapF.frequency.value = 850;
    tapF.Q.value = 2.5;
    var tapG = A.ctx.createGain();
    tapG.gain.setValueAtTime(0.22, t0);
    tapG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
    tap.connect(tapF);
    tapF.connect(tapG);
    tapG.connect(A.master);
    tap.start(t0);
    tap.stop(t0 + 0.05);
  }

  // Master bus for resonant piano string sustain
  var stringBus = A.ctx.createGain();
  stringBus.gain.setValueAtTime(0.95, t0);
  stringBus.gain.exponentialRampToValueAtTime(0.0001, t0 + 5.0);
  stringBus.connect(A.master);

  // Dynamic lowpass filter to simulate natural string damping over 5.0s
  var filter = A.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3200, t0);
  filter.frequency.exponentialRampToValueAtTime(260, t0 + 4.8);
  filter.Q.value = 1.5;
  filter.connect(stringBus);

  chord.forEach(function(freq, idx) {
    // 1. Fundamental tone with sharp initial attack
    var osc1 = A.ctx.createOscillator();
    var g1 = A.ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, t0);
    // Slight detune for acoustic chorusing and eerie beating dissonance
    osc1.detune.setValueAtTime((idx % 2 === 0 ? 3.5 : -3.5), t0);

    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.linearRampToValueAtTime(0.18, t0 + 0.005);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 5.0);

    osc1.connect(g1);
    g1.connect(filter);
    osc1.start(t0);
    osc1.stop(t0 + 5.05);

    // 2. Rich resonant overtone (2nd harmonic)
    var osc2 = A.ctx.createOscillator();
    var g2 = A.ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 2, t0);
    osc2.detune.setValueAtTime((idx % 2 === 0 ? -6 : 6), t0);

    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.linearRampToValueAtTime(0.08, t0 + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.2);

    osc2.connect(g2);
    g2.connect(filter);
    osc2.start(t0);
    osc2.stop(t0 + 5.05);

    // 3. Shimmer / bell overtone (3rd harmonic)
    var osc3 = A.ctx.createOscillator();
    var g3 = A.ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3, t0);

    g3.gain.setValueAtTime(0.0001, t0);
    g3.gain.linearRampToValueAtTime(0.04, t0 + 0.004);
    g3.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);

    osc3.connect(g3);
    g3.connect(filter);
    osc3.start(t0);
    osc3.stop(t0 + 5.05);
  });
}

// 2. Terrifying jumpscare audio effect for final climax
export function jumpscareScreamSound() {
  if (!A.ctx || !A.on) return;
  var now = A.ctx.currentTime;
  var t0 = now;
  var dur = 1.8;

  // 1. Deep violent bass impact (sub drop)
  var subOsc = A.ctx.createOscillator();
  var subGain = A.ctx.createGain();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(220, t0);
  subOsc.frequency.exponentialRampToValueAtTime(32, t0 + 0.35);
  subOsc.frequency.linearRampToValueAtTime(24, t0 + dur);
  subGain.gain.setValueAtTime(0.85, t0);
  subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  subOsc.connect(subGain);
  subGain.connect(A.master);
  subOsc.start(t0);
  subOsc.stop(t0 + dur + 0.05);

  // Sub punch transient
  var punchOsc = A.ctx.createOscillator();
  var punchG = A.ctx.createGain();
  punchOsc.type = 'triangle';
  punchOsc.frequency.setValueAtTime(140, t0);
  punchOsc.frequency.exponentialRampToValueAtTime(40, t0 + 0.12);
  punchG.gain.setValueAtTime(0.7, t0);
  punchG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
  punchOsc.connect(punchG);
  punchG.connect(A.master);
  punchOsc.start(t0);
  punchOsc.stop(t0 + 0.16);

  // 2. Piercing harsh screech / scream (FM distorted shrieking oscillator)
  // Carrier oscillator: sweeps down like a terrifying vocal screech
  var carrier = A.ctx.createOscillator();
  var carrierGain = A.ctx.createGain();
  carrier.type = 'sawtooth';
  carrier.frequency.setValueAtTime(1450, t0);
  carrier.frequency.exponentialRampToValueAtTime(680, t0 + dur);

  // Modulator oscillator: produces harsh distorted FM sidebands
  var modulator = A.ctx.createOscillator();
  var modGain = A.ctx.createGain();
  modulator.type = 'square';
  modulator.frequency.setValueAtTime(380, t0);
  modulator.frequency.linearRampToValueAtTime(210, t0 + dur);
  modGain.gain.setValueAtTime(750, t0);
  modGain.gain.exponentialRampToValueAtTime(120, t0 + dur);

  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  // Secondary high shrieker oscillator for piercing resonance
  var shriekOsc = A.ctx.createOscillator();
  var shriekGain = A.ctx.createGain();
  shriekOsc.type = 'sawtooth';
  shriekOsc.frequency.setValueAtTime(3200, t0);
  shriekOsc.frequency.linearRampToValueAtTime(2400, t0 + 0.4);
  shriekOsc.frequency.exponentialRampToValueAtTime(800, t0 + dur);
  shriekGain.gain.setValueAtTime(0.35, t0);
  shriekGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  shriekOsc.connect(shriekGain);

  // WaveShaper distortion node for aggressive saturation
  var shaper = A.ctx.createWaveShaper();
  var curve = new Float32Array(256);
  for (var i = 0; i < 256; i++) {
    var x = (i / 128) - 1;
    curve[i] = Math.tanh(x * 3.2);
  }
  shaper.curve = curve;
  shaper.oversample = '2x';

  // Scream envelope: sudden attack, brief sustain, rapid fade out
  carrierGain.gain.setValueAtTime(0.45, t0);
  carrierGain.gain.setValueAtTime(0.45, t0 + 0.25);
  carrierGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  carrier.connect(carrierGain);
  carrierGain.connect(shaper);
  shriekGain.connect(shaper);

  // Filter emphasizing harsh screaming vocal resonances
  var screamFilter = A.ctx.createBiquadFilter();
  screamFilter.type = 'peaking';
  screamFilter.frequency.setValueAtTime(2200, t0);
  screamFilter.gain.value = 6;
  screamFilter.Q.value = 2.0;

  shaper.connect(screamFilter);
  screamFilter.connect(A.master);

  modulator.start(t0);
  modulator.stop(t0 + dur + 0.05);
  carrier.start(t0);
  carrier.stop(t0 + dur + 0.05);
  shriekOsc.start(t0);
  shriekOsc.stop(t0 + dur + 0.05);

  // 3. Noise glitch burst (sudden violent glitch burst)
  var noiseSource = A.ctx.createBufferSource();
  if (A.noise) {
    noiseSource.buffer = A.noise;
  } else {
    var nb = A.ctx.createBuffer(1, A.ctx.sampleRate * 2, A.ctx.sampleRate);
    var d = nb.getChannelData(0);
    for (var j = 0; j < d.length; j++) d[j] = Math.random() * 2 - 1;
    noiseSource.buffer = nb;
  }
  var nFilter = A.ctx.createBiquadFilter();
  nFilter.type = 'bandpass';
  nFilter.frequency.setValueAtTime(4500, t0);
  nFilter.frequency.exponentialRampToValueAtTime(1200, t0 + 0.8);
  nFilter.Q.value = 3.5;

  var nGain = A.ctx.createGain();
  nGain.gain.setValueAtTime(0.65, t0);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);

  noiseSource.connect(nFilter);
  nFilter.connect(nGain);
  nGain.connect(A.master);
  noiseSource.start(t0);
  noiseSource.stop(t0 + 1.25);

  // Rapid glitch stutter micro-bursts
  for (var k = 0; k < 4; k++) {
    var gOsc = A.ctx.createOscillator();
    var gGain = A.ctx.createGain();
    gOsc.type = 'sawtooth';
    gOsc.frequency.setValueAtTime(1800 + Math.random() * 2400, t0 + k * 0.06);
    gGain.gain.setValueAtTime(0.18, t0 + k * 0.06);
    gGain.gain.exponentialRampToValueAtTime(0.0001, t0 + (k + 1) * 0.06);
    gOsc.connect(gGain);
    gGain.connect(A.master);
    gOsc.start(t0 + k * 0.06);
    gOsc.stop(t0 + (k + 1) * 0.06 + 0.01);
  }
}

// 3. Ethereal, shimmering, majestic chord / chime for secret hero reveal
export function heroChimeSound() {
  if (!A.ctx || !A.on) return;
  var now = A.ctx.currentTime;
  var t0 = now;
  var dur = 3.5;

  // Major 9th ethereal voicing: E4, G#4, B4, D#5, F#5, plus high shimmering octaves B5 and E6
  var notes = [
    { f: 329.63, delay: 0.00, gain: 0.16 }, // E4
    { f: 415.30, delay: 0.04, gain: 0.15 }, // G#4
    { f: 493.88, delay: 0.08, gain: 0.14 }, // B4
    { f: 622.25, delay: 0.12, gain: 0.13 }, // D#5
    { f: 739.99, delay: 0.16, gain: 0.12 }, // F#5
    { f: 987.77, delay: 0.20, gain: 0.09 }, // B5
    { f: 1318.51, delay: 0.24, gain: 0.06 } // E6
  ];

  // LFO for gentle shimmering tremolo and vibrato
  var lfo = A.ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(5.0, t0);

  // Vibrato modulation bus (cents)
  var vibGain = A.ctx.createGain();
  vibGain.gain.setValueAtTime(7.0, t0); // +/- 7 cents subtle vibrato
  lfo.connect(vibGain);

  // Tremolo gain stage
  var tremoloGain = A.ctx.createGain();
  tremoloGain.gain.setValueAtTime(0.78, t0);

  var lfoTremolo = A.ctx.createGain();
  lfoTremolo.gain.setValueAtTime(0.16, t0);
  lfoTremolo.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  lfo.connect(lfoTremolo);
  lfoTremolo.connect(tremoloGain.gain);

  // Master chime bus with warm reverb-like exponential decay over 3.5s
  var chimeBus = A.ctx.createGain();
  chimeBus.gain.setValueAtTime(0.9, t0);
  chimeBus.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  // Warm acoustic lowpass filter
  var warmFilter = A.ctx.createBiquadFilter();
  warmFilter.type = 'lowpass';
  warmFilter.frequency.setValueAtTime(5200, t0);
  warmFilter.frequency.exponentialRampToValueAtTime(1600, t0 + dur);
  warmFilter.Q.value = 1.0;

  chimeBus.connect(tremoloGain);
  tremoloGain.connect(warmFilter);
  warmFilter.connect(A.master);

  lfo.start(t0);
  lfo.stop(t0 + dur + 0.1);

  notes.forEach(function(note) {
    var tStart = t0 + note.delay;
    var noteRemaining = (t0 + dur) - tStart;

    // 1. Warm fundamental tone (sine)
    var osc1 = A.ctx.createOscillator();
    var g1 = A.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(note.f, tStart);
    vibGain.connect(osc1.detune);

    g1.gain.setValueAtTime(0.0001, tStart);
    g1.gain.linearRampToValueAtTime(note.gain, tStart + 0.03);
    g1.gain.exponentialRampToValueAtTime(0.0001, tStart + noteRemaining);

    osc1.connect(g1);
    g1.connect(chimeBus);
    osc1.start(tStart);
    osc1.stop(t0 + dur + 0.05);

    // 2. Shimmering bell chime harmonic (triangle with 2nd harmonic overtone)
    var osc2 = A.ctx.createOscillator();
    var g2 = A.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(note.f * 2, tStart);
    vibGain.connect(osc2.detune);

    g2.gain.setValueAtTime(0.0001, tStart);
    g2.gain.linearRampToValueAtTime(note.gain * 0.45, tStart + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, tStart + noteRemaining * 0.85);

    osc2.connect(g2);
    g2.connect(chimeBus);
    osc2.start(tStart);
    osc2.stop(t0 + dur + 0.05);

    // 3. Bright sparkle overtone (3rd harmonic)
    var osc3 = A.ctx.createOscillator();
    var g3 = A.ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(note.f * 3, tStart);
    vibGain.connect(osc3.detune);

    g3.gain.setValueAtTime(0.0001, tStart);
    g3.gain.linearRampToValueAtTime(note.gain * 0.2, tStart + 0.015);
    g3.gain.exponentialRampToValueAtTime(0.0001, tStart + Math.min(2.2, noteRemaining * 0.65));

    osc3.connect(g3);
    g3.connect(chimeBus);
    osc3.start(tStart);
    osc3.stop(t0 + dur + 0.05);
  });
}

// 4. Escalating horror tension drone for Act 3 approach and sprint
var tensionNodes = null;

export function startTensionRumble(duration) {
  if (!A.ctx || !A.on) return;
  stopTensionRumble();

  var t0 = A.ctx.currentTime;
  var dur = duration || 12.0;

  var osc1 = A.ctx.createOscillator();
  var osc2 = A.ctx.createOscillator();
  var sub = A.ctx.createOscillator();
  var pulse = A.ctx.createOscillator();
  var filter = A.ctx.createBiquadFilter();
  var masterGain = A.ctx.createGain();
  var pulseGain = A.ctx.createGain();

  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(55, t0);
  osc1.frequency.exponentialRampToValueAtTime(165, t0 + dur);

  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(58.27, t0);
  osc2.frequency.exponentialRampToValueAtTime(174.8, t0 + dur);

  sub.type = 'sine';
  sub.frequency.setValueAtTime(45, t0);
  sub.frequency.linearRampToValueAtTime(80, t0 + dur);

  pulse.type = 'sine';
  pulse.frequency.setValueAtTime(2.0, t0);
  pulse.frequency.linearRampToValueAtTime(9.0, t0 + dur);

  pulseGain.gain.setValueAtTime(0.2, t0);
  pulse.connect(pulseGain.gain);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(180, t0);
  filter.frequency.exponentialRampToValueAtTime(1800, t0 + dur);
  filter.Q.value = 3.5;

  masterGain.gain.setValueAtTime(0.001, t0);
  masterGain.gain.linearRampToValueAtTime(0.35, t0 + 2.0);
  masterGain.gain.linearRampToValueAtTime(0.75, t0 + dur);

  osc1.connect(filter);
  osc2.connect(filter);
  sub.connect(filter);
  filter.connect(pulseGain);
  pulseGain.connect(masterGain);
  masterGain.connect(A.master);

  osc1.start(t0);
  osc2.start(t0);
  sub.start(t0);
  pulse.start(t0);
  // Segurança: se ninguém chamar stopTensionRumble, encerra sozinho pouco depois do clímax.
  var tEnd = t0 + dur + 4;
  [osc1, osc2, sub, pulse].forEach(function(o) { o.stop(tEnd); });
  pulse.onended = function() {
    try { masterGain.disconnect(); filter.disconnect(); pulseGain.disconnect(); } catch (e) {}
  };

  tensionNodes = {
    osc1: osc1,
    osc2: osc2,
    sub: sub,
    pulse: pulse,
    masterGain: masterGain
  };
}

export function isTensionActive() { return !!tensionNodes; }

export function stopTensionRumble() {
  if (!tensionNodes || !A.ctx) { tensionNodes = null; return; }
  var n = tensionNodes;
  tensionNodes = null;
  try {
    var now = A.ctx.currentTime;
    n.masterGain.gain.cancelScheduledValues(now);
    n.masterGain.gain.setValueAtTime(Math.max(0.0001, n.masterGain.gain.value), now);
    n.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    // stop() agendado no relógio do áudio (sem setTimeout); o onended do pulse desconecta tudo.
    var tStop = now + 0.12;
    n.osc1.stop(tStop); n.osc2.stop(tStop); n.sub.stop(tStop); n.pulse.stop(tStop);
  } catch (e) {}
}

// Alarme de carro espacial: PannerNode (HRTF) na posicao do carro; o volume cresce ao chegar
// perto e o timbre fica abafado quando o jogador esta dentro da loja. Dura `dur` segundos.
var carAlarm = null;
export function carAlarmStart(dur, pos) {
  if (!A.ctx || !A.on) return;
  carAlarmStop();
  var c = A.ctx, t0 = c.currentTime + 0.02;
  dur = dur || 3;

  var panner = c.createPanner();
  panner.panningModel = 'HRTF';
  // Queda exponencial suave com a distancia: bem alto junto do carro, ~20% a 12 m (dentro da loja) e quase
  // inaudivel a 35 m. O timbre tambem escurece com a distancia (ver carAlarmListener).
  panner.distanceModel = 'exponential';
  panner.refDistance = 2.5; panner.maxDistance = 60; panner.rolloffFactor = 1.1;
  if (panner.positionX) { panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z; }
  else panner.setPosition(pos.x, pos.y, pos.z);

  var muff = c.createBiquadFilter(); muff.type = 'lowpass'; muff.frequency.value = 5500; muff.Q.value = 0.7;
  var out = c.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  // entrada e saida suaves do alarme (sem corte seco)
  var fadeIn = 0.25, fadeOut = Math.min(2.0, dur * 0.3);
  out.gain.linearRampToValueAtTime(0.55, t0 + fadeIn);
  out.gain.setValueAtTime(0.55, t0 + dur - fadeOut);
  out.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  muff.connect(out); out.connect(panner); panner.connect(A.master);

  var nodes = [];
  function voice(type, detune) {
    var o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.detune.value = detune || 0;
    f.type = 'lowpass'; f.frequency.value = 4200;
    g.gain.value = 0.0001;
    o.connect(f); f.connect(g); g.connect(muff);
    nodes.push(o);
    return { o: o, g: g };
  }

  // 1) "bip-bip" curto de disparo (square agudo), 2) sirene em varredura (dente de serra dobrado)
  var chirp = voice('square');
  [0, 0.13].forEach(function(dt) {
    chirp.o.frequency.setValueAtTime(2300, t0 + dt);
    chirp.g.gain.setValueAtTime(0.16, t0 + dt);
    chirp.g.gain.setValueAtTime(0.0001, t0 + dt + 0.07);
  });
  var siren = [voice('sawtooth', 0), voice('sawtooth', 11)];
  var s0 = t0 + 0.32, cycles = Math.floor((dur - 0.6) / 0.6);
  siren.forEach(function(v) {
    v.o.frequency.setValueAtTime(650, s0);
    v.g.gain.setValueAtTime(0.12, s0);
    for (var i = 0; i < cycles; i++) {
      v.o.frequency.exponentialRampToValueAtTime(1450, s0 + i * 0.6 + 0.3);
      v.o.frequency.exponentialRampToValueAtTime(650, s0 + i * 0.6 + 0.6);
    }
    v.g.gain.setValueAtTime(0.0001, s0 + cycles * 0.6);
  });
  // "bip-bip" final
  [dur - 0.26, dur - 0.13].forEach(function(dt) {
    chirp.o.frequency.setValueAtTime(2300, t0 + dt);
    chirp.g.gain.setValueAtTime(0.16, t0 + dt);
    chirp.g.gain.setValueAtTime(0.0001, t0 + dt + 0.07);
  });

  nodes.forEach(function(o) { o.start(t0); o.stop(t0 + dur + 0.05); });
  nodes[nodes.length - 1].onended = function() { try { out.disconnect(); panner.disconnect(); } catch (e) {} if (carAlarm && carAlarm.out === out) carAlarm = null; };
  carAlarm = { out: out, muff: muff, nodes: nodes, pos: pos };
}
export function carAlarmStop() {
  if (!carAlarm || !A.ctx) { carAlarm = null; return; }
  var now = A.ctx.currentTime, c = carAlarm;
  carAlarm = null;
  try {
    c.out.gain.cancelScheduledValues(now);
    c.out.gain.setValueAtTime(c.out.gain.value, now);
    c.out.gain.linearRampToValueAtTime(0.0001, now + 0.4);
    c.nodes.forEach(function(o) { o.stop(now + 0.45); });
  } catch (e) {}
}
// Chamado a cada frame enquanto o alarme toca: posicao/direcao do ouvinte e abafamento
// (dentro da loja o som chega filtrado).
export function carAlarmListener(px, py, pz, fx, fz, inside) {
  if (!A.ctx || !carAlarm) return;
  var L = A.ctx.listener, now = A.ctx.currentTime;
  if (L.positionX) {
    L.positionX.value = px; L.positionY.value = py; L.positionZ.value = pz;
    L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz;
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else { L.setPosition(px, py, pz); L.setOrientation(fx, 0, fz, 0, 1, 0); }
  // Abafamento: dentro da loja o som chega filtrado, e quanto mais longe, mais escuro (absorcao do ar).
  var dx = px - carAlarm.pos.x, dz = pz - carAlarm.pos.z, dist = Math.sqrt(dx * dx + dz * dz);
  var cutoff = (inside ? 1600 : 6000) * Math.max(0.3, 1 - dist / 45);
  carAlarm.muff.frequency.setTargetAtTime(cutoff, now, 0.3);
}

// Ventilador de mesa, em camadas (chamado ~10x por segundo pelo main.js):
//  - sopro de ar: ruido em banda media, com pulsos na frequencia das pas (rate x ~15 Hz, quase um "whup-whup" lento);
//  - motor: dois dentes de serra graves levemente dessintonizados (batimento) cujo tom sobe e desce com a rotacao,
//    entao ligar/desligar tem o gemido de acelerar/desacelerar;
//  - ronco grave de ruido, para dar corpo.
// level 0..1 = volume final (velocidade x distancia x oclusao x mistura); rate 0..1 = velocidade das pas (so o timbre).
var fanHum = null;
export function fanHumUpdate(level, rate) {
  if (!A.ctx || !A.noise) return;
  var c = A.ctx, now = c.currentTime;
  if (!A.on) level = 0;
  if (rate == null) rate = level > 0 ? 1 : 0;
  if (!fanHum) {
    if (level <= 0) return;
    var h = fanHum = {};
    var mk = function(type, freq, q) { var f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; return f; };
    // sopro de ar
    h.air = c.createBufferSource(); h.air.buffer = A.noise; h.air.loop = true;
    h.airBp = mk('bandpass', 700, 0.6);
    h.airG = c.createGain(); h.airG.gain.value = 0;
    h.air.connect(h.airBp); h.airBp.connect(h.airG); h.airG.connect(A.master);
    h.lfo = c.createOscillator(); h.lfo.type = 'sine'; h.lfo.frequency.value = 1;     // pulsos das pas
    h.lfoG = c.createGain(); h.lfoG.gain.value = 0;
    h.lfo.connect(h.lfoG); h.lfoG.connect(h.airG.gain);
    // motor
    h.m1 = c.createOscillator(); h.m1.type = 'sawtooth'; h.m1.frequency.value = 50;
    h.m2 = c.createOscillator(); h.m2.type = 'sawtooth'; h.m2.frequency.value = 51.5;
    h.mLp = mk('lowpass', 240, 0.8);
    h.mG = c.createGain(); h.mG.gain.value = 0;
    h.m1.connect(h.mLp); h.m2.connect(h.mLp); h.mLp.connect(h.mG); h.mG.connect(A.master);
    // ronco
    h.rum = c.createBufferSource(); h.rum.buffer = A.noise; h.rum.loop = true; h.rum.playbackRate.value = 0.6;
    h.rumLp = mk('lowpass', 110, 0.7);
    h.rumG = c.createGain(); h.rumG.gain.value = 0;
    h.rum.connect(h.rumLp); h.rumLp.connect(h.rumG); h.rumG.connect(A.master);
    h.air.start(0, Math.random() * 1.5); h.rum.start(0, Math.random() * 1.5);
    h.lfo.start(); h.m1.start(); h.m2.start();
  }
  var h2 = fanHum, T = 0.12;
  var airLevel = level * 0.05;
  h2.airG.gain.setTargetAtTime(airLevel, now, 0.15);
  h2.lfoG.gain.setTargetAtTime(airLevel * 0.35 * Math.min(1, rate * 1.5), now, 0.15);            // profundidade dos pulsos
  h2.lfo.frequency.setTargetAtTime(Math.max(0.5, rate * 15.3), now, 0.2);                         // 3 pas x ~5 voltas/s no maximo
  h2.airBp.frequency.setTargetAtTime(420 + rate * 780, now, 0.25);
  var mf = 42 + rate * 74;                                                                         // 42 -> 116 Hz
  h2.m1.frequency.setTargetAtTime(mf, now, T);
  h2.m2.frequency.setTargetAtTime(mf * 1.03, now, T);
  h2.mLp.frequency.setTargetAtTime(160 + rate * 200, now, 0.2);
  h2.mG.gain.setTargetAtTime(level * 0.025 * (0.35 + 0.65 * rate), now, 0.15);
  h2.rumG.gain.setTargetAtTime(level * 0.04 * (0.4 + 0.6 * rate), now, 0.2);
}

// ---- Quest do porquinho (entities/Pig.js, entities/Cardboard.js) ----
// vol: 0..1 (distancia/oclusao calculadas por quem chama).
function noiseBurst(type, freq, q, gain, dur, t0, freqEnd) {
  var c = A.ctx, s = c.createBufferSource(); s.buffer = A.noise;
  var f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q || 1;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  var g = c.createGain(); g.gain.setValueAtTime(Math.max(0.0002, gain), t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(A.master);
  s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.02);
}

// Moeda: "plim" metalico curto (duas parciais agudas).
export function coinSound(vol) {
  if (!A.ctx || !A.on) return;
  var c = A.ctx, now = c.currentTime, v = vol == null ? 1 : vol;
  // "pling" de moeda de fliperama: dois tons (B5 -> E6) com brilho harmonico e cauda de sino
  [[988, 0, 0.09], [1319, 0.075, 0.2]].forEach(function(n) {
    [[1, 0.06], [2.01, 0.025], [3.02, 0.012]].forEach(function(h) {
      var o = c.createOscillator(); o.type = h[0] === 1 ? 'square' : 'sine'; o.frequency.value = n[0] * h[0];
      var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 6000;
      var g = c.createGain(), t = now + n[1];
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(h[1] * v + 0.0002, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n[2] + 0.18);
      o.connect(f); f.connect(g); g.connect(A.master); o.start(t); o.stop(t + n[2] + 0.2);
    });
  });
  noiseBurst('highpass', 5000, 1, 0.05 * v, 0.03, now, null);   // estalo metalico do impacto
}

// Grunhido do porquinho: "ROINC" gutural de animal de verdade, nada do "oinc" agudo de desenho (que subia a 310 Hz).
// Cada grunhido: fundamental GRAVE (ataque ~98 Hz, pico do impulso 135 Hz, cauda 75 Hz) em dois dentes de serra
// levemente dessintonizados (a voz); flutter dente-de-serra de 28 -> 20 Hz batendo FORTE na amplitude (o rascado do
// palato mole, a fricao do ar nas vias aereas); tres formantes nasais de focinho em paralelo (F1 laringeal, F2 do
// focinho, F3 coloracao nasal) que descem no fim, fechando o "-NC"; rajada de ruido em ~500 Hz no ataque (o "RRR-")
// e um estalo nasal seco no fecho. `isSecondary` = o "ronc" curto da respiracao, mais grave e abafado.
function pigGrunt(t, vol, dur, k, isSecondary) {
  var c = A.ctx;
  var end = t + dur;
  var base = isSecondary ? 86 : 98;                                 // ataque
  var peak = isSecondary ? 106 : 135;                               // pico do impulso gutural
  var tail = isSecondary ? 66 : 75;                                 // cauda: fechamento da glote
  var f0 = function(o, m) {
    o.frequency.setValueAtTime(base * k * m, t);
    o.frequency.exponentialRampToValueAtTime(peak * k * m, t + dur * 0.25);
    o.frequency.exponentialRampToValueAtTime(tail * k * m, end);
  };
  var o1 = c.createOscillator(); o1.type = 'sawtooth'; f0(o1, 1);
  var o2 = c.createOscillator(); o2.type = 'sawtooth'; f0(o2, 1.025);
  var voice = c.createGain(); voice.gain.value = 0.46;
  var lfo = c.createOscillator(); lfo.type = 'sawtooth';            // dente de serra: cada ciclo "rasga"
  lfo.frequency.setValueAtTime(isSecondary ? 24 : 28, t); lfo.frequency.linearRampToValueAtTime(20, end);
  var lfoG = c.createGain(); lfoG.gain.value = 0.66;                // ronco gutural (antes era 0.38 em senoide)
  lfo.connect(lfoG); lfoG.connect(voice.gain);
  o1.connect(voice); o2.connect(voice);
  var env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.7 * vol), t + 0.018);
  env.gain.setValueAtTime(Math.max(0.0002, 0.7 * vol), t + dur * 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  var forms = [                                            // [freq inicio, freq meio, freq fim (nasal), Q, ganho]
    [400, 455, 300, 4.5, 1],                                        // F1: cavidade laringeal
    [850, 1010, 760, 5.5, 0.7],                                     // F2: ressonancia do focinho
    [1700, 1520, 1050, 4, 0.25]                                     // F3: coloracao nasal superior
  ];
  forms.forEach(function(fm) {
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = fm[3];
    bp.frequency.setValueAtTime(fm[0] * k, t);
    bp.frequency.linearRampToValueAtTime(fm[1] * k, t + dur * 0.3);
    bp.frequency.linearRampToValueAtTime(fm[2] * k, end);                          // fecha no nariz
    var fg = c.createGain(); fg.gain.value = fm[4];
    voice.connect(bp); bp.connect(fg); fg.connect(env);
  });
  env.connect(A.master);
  [o1, o2, lfo].forEach(function(o) { o.start(t); o.stop(end + 0.03); });
  noiseBurst('bandpass', 520, 3.5, 0.12 * vol, 0.06, t, 450);                      // rasgado "RRR-" do ataque
  noiseBurst('bandpass', 480, 5, 0.07 * vol, 0.035, t + 0.035);                    // segundo arranque do flutter
  noiseBurst('lowpass', 400, 1, 0.08 * vol, 0.025, Math.max(t, end - 0.03));       // fechamento nasal seco "-NC"
}

export function oinkSound(vol) {
  if (!A.ctx || !A.on || !A.noise) return;
  var now = A.ctx.currentTime, v = vol == null ? 1 : vol, k = 0.95 + Math.random() * 0.1;
  pigGrunt(now, v, 0.29, k, false);                                 // "ROINC" enfatico
  pigGrunt(now + 0.32, v * 0.6, 0.17, k * 0.85, true);              // "ronc" da respiracao, mais grave e baixo
}

// Vidro quebrando: estalo + chuva de cacos (ruido agudo em rajadas).
export function glassBreakSound(vol) {
  if (!A.ctx || !A.on || !A.noise) return;
  var now = A.ctx.currentTime, v = vol == null ? 1 : vol;
  noiseBurst('highpass', 1800, 0.7, 0.6 * v, 0.12, now);
  noiseBurst('bandpass', 5200, 4, 0.35 * v, 0.5, now + 0.02, 3000);
  for (var i = 0; i < 7; i++) noiseBurst('bandpass', 4000 + Math.random() * 4000, 9, 0.18 * v, 0.06, now + 0.08 + Math.random() * 0.5);
}

// Pneu cantando + motor: ruido filtrado com o pitch subindo e um dente de serra acelerando.
// Retorna {setVol(x), stop()} (o volume acompanha a distancia; stop corta no resetWorld).
export function tireScreechSound(dur, vol) {
  var dummy = { stop: function() {}, setVol: function() {} };
  if (!A.ctx || !A.on || !A.noise) return dummy;
  var c = A.ctx, now = c.currentTime, v = vol == null ? 1 : vol;
  dur = dur || 2.4;
  var out = c.createGain(); out.gain.setValueAtTime(v, now); out.connect(A.master);
  var s = c.createBufferSource(); s.buffer = A.noise; s.loop = true;
  var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
  bp.frequency.setValueAtTime(700, now); bp.frequency.exponentialRampToValueAtTime(2600, now + dur * 0.6);
  bp.frequency.exponentialRampToValueAtTime(1500, now + dur);
  var sg = c.createGain(); sg.gain.setValueAtTime(0.0001, now);
  sg.gain.exponentialRampToValueAtTime(0.5, now + 0.08); sg.gain.setValueAtTime(0.5, now + dur * 0.55);
  sg.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  s.connect(bp); bp.connect(sg); sg.connect(out); s.start(now); s.stop(now + dur + 0.05);
  var o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(55, now); o.frequency.exponentialRampToValueAtTime(190, now + dur * 0.8);
  var of = c.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 700;
  var og = c.createGain(); og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.22, now + 0.15); og.gain.setValueAtTime(0.22, now + dur * 0.7);
  og.gain.exponentialRampToValueAtTime(0.0001, now + dur + 1.2);
  o.connect(of); of.connect(og); og.connect(out); o.start(now); o.stop(now + dur + 1.3);
  var stopped = false;
  o.onended = function() { stopped = true; try { out.disconnect(); } catch (e) {} };
  return {
    setVol: function(x) { if (!stopped) out.gain.setTargetAtTime(Math.max(0.0001, x), c.currentTime, 0.1); },
    stop: function() {
      if (stopped) return;
      stopped = true;
      var t = c.currentTime;
      try {
        out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0.0001, t + 0.15);
        s.stop(t + 0.2); o.stop(t + 0.2);
      } catch (e) {}
    }
  };
}

// ---- Shotgun (entities/Shotgun.js) ----
// Estouro: pancada grave + rajada de ruido; eco: copia filtrada por um delay com realimentacao (mais longa
// do lado de fora, curta e abafada dentro da loja). vol 0..1.
export function shotgunSound(vol, outside) {
  if (!A.ctx || !A.on || !A.noise) return;
  var c = A.ctx, now = c.currentTime, v = vol == null ? 1 : vol;
  var out = c.createGain(); out.gain.value = v; out.connect(A.master);
  var echoIn = c.createGain(); echoIn.gain.value = outside ? 0.45 : 0.28;
  var dl = c.createDelay(1.0); dl.delayTime.value = outside ? 0.32 : 0.11;
  var fb = c.createGain(); fb.gain.value = outside ? 0.42 : 0.3;
  var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = outside ? 1400 : 900;
  echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(out);
  // pancada grave
  var o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(140, now); o.frequency.exponentialRampToValueAtTime(38, now + 0.25);
  var og = c.createGain(); og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.9, now + 0.005); og.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  o.connect(og); og.connect(out); og.connect(echoIn); o.start(now); o.stop(now + 0.4);
  // estalo + rajada de polvora
  [['highpass', 2400, 0.7, 0.55, 0.05], ['lowpass', 3200, 0.8, 0.9, 0.28], ['bandpass', 700, 1.2, 0.5, 0.45]].forEach(function(b) {
    var s = c.createBufferSource(); s.buffer = A.noise;
    var f = c.createBiquadFilter(); f.type = b[0]; f.frequency.setValueAtTime(b[1], now); f.Q.value = b[2];
    if (b[0] === 'lowpass') f.frequency.exponentialRampToValueAtTime(260, now + b[4]);
    var g = c.createGain(); g.gain.setValueAtTime(b[3], now); g.gain.exponentialRampToValueAtTime(0.0001, now + b[4]);
    s.connect(f); f.connect(g); g.connect(out); g.connect(echoIn);
    s.start(now, Math.random() * 1.5); s.stop(now + b[4] + 0.02);
  });
  // solta o eco (laco delay/realimentacao) quando ele ja morreu
  setTimeout(function() { try { out.disconnect(); fb.disconnect(); dl.disconnect(); lp.disconnect(); echoIn.disconnect(); } catch (e) {} }, outside ? 3200 : 1800);
}

// Gatilho sem cartucho (pump=false) / bombear a arma (pump=true): dois cliques metalicos curtos.
export function gunClickSound(pump) {
  if (!A.ctx || !A.on || !A.noise) return;
  var now = A.ctx.currentTime;
  noiseBurst('bandpass', pump ? 1500 : 3200, 6, pump ? 0.35 : 0.25, 0.04, now);
  noiseBurst('bandpass', pump ? 1100 : 2600, 6, pump ? 0.4 : 0.18, 0.05, now + (pump ? 0.16 : 0.05));
}

// ---- Armario, cadeado e chave (entities/Cabinet.js) ----
// Batida metalica: parciais inarmonicas (sino pequeno/chapa) com queda exponencial.
function metalHit(t0, base, vol, dur) {
  var c = A.ctx;
  [[1, 0.5], [2.76, 0.28], [5.4, 0.14]].forEach(function(p) {
    var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = base * p[0];
    var g = c.createGain(); g.gain.setValueAtTime(Math.max(0.0002, vol * p[1]), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur / p[0] * 1.6);
    o.connect(g); g.connect(A.master); o.start(t0); o.stop(t0 + dur + 0.05);
  });
}

// Cadeado trancado: o corpo/arco de aco balanca e bate na CHAPA de ferro do armario (vestiario industrial), cada
// batida mais fraca e mais curta. Nada do antigo "toc" grave de madeira. Cada pancada = ruido ressonante de banda
// metalica caindo de ~1400 para ~760 Hz (chapa fina estalando) + estalo seco do arco + dois modos metalicos
// (880 e 1320 Hz) com decaimento exponencial curto + vibracao de chapa oca morrendo em ~0,15 s.
export function padlockRattleSound(vol) {
  if (!A.ctx || !A.on || !A.noise) return;
  var now = A.ctx.currentTime, v = vol == null ? 1 : vol;
  [[0, 1], [0.12, 0.8], [0.225, 0.58], [0.31, 0.38], [0.375, 0.22]].forEach(function(h, i) {
    var t = now + h[0] + (i ? (Math.random() - 0.5) * 0.012 : 0), k = 0.92 + Math.random() * 0.16, g = h[1] * v;
    noiseBurst('bandpass', 1400 * k, 2.4, 0.3 * g, 0.055, t, 760 * k);                     // chapa fina de aco estalando
    noiseBurst('bandpass', 3200 * k, 3, 0.3 * g, 0.022, t);                                // estalo seco do arco
    metalHit(t, 880 * k, 0.085 * g, 0.05);                                                 // modo metalico baixo
    metalHit(t + 0.004, 1320 * k, 0.055 * g, 0.035);                                       // modo metalico alto
    noiseBurst('bandpass', 600 * k, 8, 0.1 * g, 0.15, t + 0.004);                          // chapa oca vibrando
  });
  noiseBurst('bandpass', 1900, 2, 0.05 * v, 0.14, now + 0.05, 1200);                       // o arco raspando de leve
}

// Chave girando + cadeado abrindo: clique seco e o arco saltando com mola.
export function padlockOpenSound(vol) {
  if (!A.ctx || !A.on || !A.noise) return;
  var c = A.ctx, now = c.currentTime, v = vol == null ? 1 : vol;
  noiseBurst('bandpass', 2600, 4, 0.3 * v, 0.05, now);
  noiseBurst('bandpass', 3400, 6, 0.35 * v, 0.04, now + 0.16);
  var o = c.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(1500, now + 0.17); o.frequency.exponentialRampToValueAtTime(2600, now + 0.3);
  var g = c.createGain(); g.gain.setValueAtTime(0.0001, now + 0.17);
  g.gain.exponentialRampToValueAtTime(0.12 * v + 0.0002, now + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  o.connect(g); g.connect(A.master); o.start(now + 0.17); o.stop(now + 0.45);
}

// Cadeado (ou chave) caindo no chao: pancada metalica + quique menor.
export function padlockDropSound(vol) {
  if (!A.ctx || !A.on || !A.noise) return;
  var now = A.ctx.currentTime, v = vol == null ? 1 : vol;
  metalHit(now, 1180, 0.3 * v, 0.3);
  noiseBurst('lowpass', 420, 0.8, 0.35 * v, 0.12, now);
  metalHit(now + 0.17, 1260, 0.14 * v, 0.18);
  noiseBurst('lowpass', 500, 0.8, 0.14 * v, 0.06, now + 0.17);
}

// Dobradica de armario de ferro oxidado rangendo (atrito metal-metal, estridente), no lugar do rangido de madeira:
// ruido em banda ESTREITA varrendo 1200 -> 1800 Hz, com a tremulacao do eixo "pulando" na ferrugem, mais um
// formante metalico agudo de leve (~2400 -> 3100 Hz) que canta junto com o atrito.
export function cabinetCreakSound(vol) {
  if (!A.ctx || !A.on || !A.noise) return;
  var c = A.ctx, now = c.currentTime, v = vol == null ? 1 : vol, d = 0.95;
  var am = c.createOscillator(); am.type = 'square';                 // tremulacao do atrito (stick-slip)
  am.frequency.setValueAtTime(26, now); am.frequency.linearRampToValueAtTime(41, now + d);
  var amg = c.createGain(); amg.gain.value = 0.45;
  am.connect(amg); am.start(now); am.stop(now + d + 0.05);

  var s = c.createBufferSource(); s.buffer = A.noise; s.loop = true;
  var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 18;
  bp.frequency.setValueAtTime(1200, now);
  bp.frequency.linearRampToValueAtTime(1800, now + d * 0.7);
  bp.frequency.linearRampToValueAtTime(1520, now + d);
  var vca = c.createGain(); vca.gain.value = 0.55; amg.connect(vca.gain);
  var g = c.createGain(); g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.3 * v + 0.0002, now + 0.1); g.gain.setValueAtTime(0.3 * v + 0.0002, now + d * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, now + d);
  s.connect(bp); bp.connect(vca); vca.connect(g); g.connect(A.master);
  s.start(now, Math.random() * 1.5); s.stop(now + d + 0.05);

  var o = c.createOscillator(); o.type = 'sine';                     // formante metalico agudo
  o.frequency.setValueAtTime(2400, now); o.frequency.linearRampToValueAtTime(3100, now + d * 0.7);
  o.frequency.linearRampToValueAtTime(2700, now + d);
  var ovca = c.createGain(); ovca.gain.value = 0.6; amg.connect(ovca.gain);
  var og = c.createGain(); og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.045 * v + 0.0002, now + 0.14); og.gain.setValueAtTime(0.045 * v + 0.0002, now + d * 0.7);
  og.gain.exponentialRampToValueAtTime(0.0001, now + d);
  o.connect(ovca); ovca.connect(og); og.connect(A.master);
  o.start(now); o.stop(now + d + 0.05);
}

// Musiquinha do armario aberto: arpejo alegre de onda quadrada + acorde final com baixo em triangulo (~1,6 s).
export function cabinetJingleSound() {
  if (!A.ctx || !A.on) return;
  var c = A.ctx, now = c.currentTime + 0.02;
  function note(f, t, d, type, vol) {
    var o = c.createOscillator(); o.type = type; o.frequency.value = f;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, now + t);
    g.gain.exponentialRampToValueAtTime(vol, now + t + 0.012);
    g.gain.setValueAtTime(vol, now + t + d * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
    o.connect(lp); lp.connect(g); g.connect(A.master); o.start(now + t); o.stop(now + t + d + 0.03);
  }
  // C5 E5 G5 C6 | A5 C6 | acorde C6 E6 G6
  [[523.25, 0, 0.12], [659.25, 0.11, 0.12], [783.99, 0.22, 0.12], [1046.5, 0.33, 0.2],
   [880, 0.55, 0.1], [1046.5, 0.66, 0.12]].forEach(function(n) { note(n[0], n[1], n[2], 'square', 0.055); });
  [1046.5, 1318.5, 1568].forEach(function(f) { note(f, 0.8, 0.75, 'square', 0.035); });
  [[130.81, 0, 0.3], [196, 0.33, 0.3], [130.81, 0.8, 0.8]].forEach(function(n) { note(n[0], n[1], n[2], 'triangle', 0.16); });
}

// ---- Fogos de artificio (entities/Fireworks.js, final do heroi) ----
// Lancamento: assobio subindo (seno com vibrato) + chiado da polvora (ruido em banda subindo). dur em s, vol 0..1.
export function fireworkLaunchSound(vol, dur) {
  if (!A.ctx || !A.on || !A.noise) return;
  var c = A.ctx, now = c.currentTime, v = vol == null ? 1 : vol;
  dur = dur || 1.3;
  var o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(700, now); o.frequency.exponentialRampToValueAtTime(2600, now + dur);
  var lfo = c.createOscillator(); lfo.frequency.value = 9; var lg = c.createGain(); lg.gain.value = 40;
  lfo.connect(lg); lg.connect(o.frequency);
  var g = c.createGain(); g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.06 * v + 0.0002, now + 0.12);
  g.gain.setValueAtTime(0.06 * v + 0.0002, now + dur * 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g); g.connect(A.master);
  o.start(now); o.stop(now + dur + 0.05); lfo.start(now); lfo.stop(now + dur + 0.05);
  noiseBurst('bandpass', 1400, 2.5, 0.22 * v, dur * 0.9, now, 4200);
}

// Estouro: pancada grave + rajada abafada, depois estalinhos (crepitar) espalhados. big = o foguete da lua.
export function fireworkBangSound(vol, big) {
  if (!A.ctx || !A.on || !A.noise) return;
  var c = A.ctx, now = c.currentTime, v = vol == null ? 1 : vol, k = big ? 1.5 : 1;
  var o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(110, now); o.frequency.exponentialRampToValueAtTime(32, now + 0.5 * k);
  var og = c.createGain(); og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(Math.min(1, 0.55 * v * k) + 0.0002, now + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.6 * k);
  o.connect(og); og.connect(A.master); o.start(now); o.stop(now + 0.65 * k);
  noiseBurst('lowpass', 2600, 0.8, 0.5 * v * k, 0.7 * k, now, 220);
  var n = big ? 26 : 14;
  for (var i = 0; i < n; i++) noiseBurst('highpass', 3000 + Math.random() * 3000, 0.9, 0.12 * v, 0.03, now + 0.25 + Math.random() * 1.1 * k);
}

// Inspiracao contida de susto (prender a respiracao): ruido em passa-banda cuja frequencia sobe,
// ataque rapido, sustentacao curta e corte seco. ~0.75 s, pico 0.13 (mesma faixa do gulpSound/pageFlip).
export function breathHoldSound() {
  if (!A.ctx || !A.on || !A.noise) return;
  var c = A.ctx, now = c.currentTime;
  var s = c.createBufferSource(); s.buffer = A.noise;
  var f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.6;
  f.frequency.setValueAtTime(650, now); f.frequency.exponentialRampToValueAtTime(1900, now + 0.55);
  var g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.13, now + 0.12);
  g.gain.setValueAtTime(0.11, now + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
  s.connect(f); f.connect(g); g.connect(A.master);
  s.start(now, Math.random() * 1.2); s.stop(now + 0.75);
}

// Soltada do ar depois do susto: mais grave, curta e suave que a inspiracao. ~0.5 s, pico 0.08.
export function breathReleaseSound() {
  if (!A.ctx || !A.on || !A.noise) return;
  var c = A.ctx, now = c.currentTime;
  var s = c.createBufferSource(); s.buffer = A.noise;
  var f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1;
  f.frequency.setValueAtTime(900, now); f.frequency.exponentialRampToValueAtTime(380, now + 0.45);
  var g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.08, now + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  s.connect(f); f.connect(g); g.connect(A.master);
  s.start(now, Math.random() * 1.2); s.stop(now + 0.53);
}

// Stinger de camera fechando: swell grave e abafado com leve glissando ascendente que para seco.
// `dur` em segundos (padrao 1.2). Pico 0.2 no ganho final, fontes somam ~2 (abaixo do startTensionRumble, 0.75, e do heroChime/jumpscare).
export function cineZoomSound(dur) {
  if (!A.ctx || !A.on) return;
  var c = A.ctx, now = c.currentTime;
  dur = dur > 0 ? dur : 1.2;
  var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(110, now); lp.frequency.exponentialRampToValueAtTime(420, now + dur);
  var g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.2, now + dur * 0.97);
  g.gain.linearRampToValueAtTime(0.0001, now + dur + 0.03);   // corte seco
  lp.connect(g); g.connect(A.master);
  [[50, 78, 'sawtooth', 0.6], [53, 82, 'sawtooth', 0.5], [38, 55, 'sine', 0.9]].forEach(function(n) {
    var o = c.createOscillator(); o.type = n[2];
    o.frequency.setValueAtTime(n[0], now); o.frequency.exponentialRampToValueAtTime(n[1], now + dur);
    var og = c.createGain(); og.gain.value = n[3];
    o.connect(og); og.connect(lp); o.start(now); o.stop(now + dur + 0.05);
  });
  if (A.noise) {
    var s = c.createBufferSource(); s.buffer = A.noise;
    var nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 240;
    var ng = c.createGain(); ng.gain.value = 0.5;
    s.connect(nf); nf.connect(ng); ng.connect(lp); s.start(now, Math.random() * 1.2); s.stop(now + dur + 0.05);
  }
}
