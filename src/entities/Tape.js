import * as THREE from 'three';
import { cv, tex, hash, wrapLines, coverImg, speck, pixelate, cached } from '../core/Utils.js';
import { G, loadModel } from '../graphics/Engine.js';
import { proceduralFrame } from '../graphics/PlaceholderArt.js';
import { S } from '../core/State.js';
import { t, getLocale } from '../i18n/index.js';

// Box art is laid out in a 320x512 logical space and rasterised into a
// power-of-two canvas (front 512x1024, back 512x1024); the 5:8 face stretches
// it back, keeping correct proportions.
var CW = 320, CH = 512, PW = 512, PH = 1024, BW = 512, BH = 1024;
export var TXT = {
  catalog: t('ent.tape.catalog'),
  defaultHandle: t('ent.tape.default_handle'),
  defaultTitleFront: t('ent.tape.default_title_front'),
  rentalBand: t('ent.tape.rental_band'),
  defaultDate: t('ent.tape.default_date'),
  vhs: t('ent.tape.vhs'),
  hifiStereo: t('ent.tape.hifi_stereo'),
  rating: t('ent.tape.rating'),
  defaultTitleBack: t('ent.tape.default_title_back'),
  defaultChannel: t('ent.tape.default_channel'),
  defaultDesc: t('ent.tape.default_desc'),
  synopsis: t('ent.tape.synopsis'),
  specs: t('ent.tape.specs'),
  specChannel: t('ent.tape.spec_channel'),
  specDate: t('ent.tape.spec_date'),
  specRuntime: t('ent.tape.spec_runtime'),
  specViews: t('ent.tape.spec_views'),
  specCode: t('ent.tape.spec_code'),
  specFormat: t('ent.tape.spec_format'),
  formatValue: t('ent.tape.format_value'),
  beKind: t('ent.tape.be_kind'),
  rewind: t('ent.tape.rewind'),
  defaultId: t('ent.tape.default_id'),
  volume: t('ent.tape.volume')
};

// Avatar do canal (o mesmo que vai no crachá e na camiseta): entra no cabeçalho da capa
// assim que main.js o carrega; antes disso as fitas usam só o nome.
var channelAvatar = null;
export function setTapeAvatar(img) { channelAvatar = img || null; }

function hhmmss(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  var h = (sec / 3600) | 0, m = ((sec % 3600) / 60) | 0, ss = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(ss).padStart(2, '0');
}
function groupNum(n) {
  try { return Number(n).toLocaleString(getLocale()); } catch (e) { return String(n); }
}
// Primeira frase da descrição, para a chamada da capa.
function tagline(d) {
  var m = String(d || '').match(/^.{12,150}?[.!?](\s|$)/);
  return (m ? m[0] : String(d || '').slice(0, 120)).trim();
}

var SANS = '"Helvetica Neue",Arial,sans-serif', MONO = '"Courier New",monospace';

function target(c, w, h, sx, sy) {
  c = c || cv(w, h);
  var x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, c.width, c.height);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.scale(sx, sy || 1);
  return { c: c, x: x };
}

// Grime pass: darkened edges, scuffed corners/folds, dither + grain.
function wornEdges(x, W, H, seed) {
  var g = x.createRadialGradient(W / 2, H / 2, H * .32, W / 2, H / 2, H * .7);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.4)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  x.fillStyle = 'rgba(232,224,204,.8)';
  x.fillRect(0, 0, 4, 12); x.fillRect(0, 0, 12, 4);
  x.fillRect(W - 4, 0, 4, 12); x.fillRect(W - 12, 0, 12, 4);
  x.fillRect(0, H - 12, 4, 12); x.fillRect(0, H - 4, 12, 4);
  x.fillRect(W - 4, H - 12, 4, 12); x.fillRect(W - 12, H - 4, 12, 4);
  for (var i = 0; i < 7; i++) {
    var py = Math.floor(hash(seed * 4.3 + i * 2.1) * H);
    var pw = 2 + Math.floor(hash(seed + i) * 3);
    var ph = 3 + Math.floor(hash(seed * 2 + i) * 8);
    x.fillRect(0, py, pw, ph);
    x.fillRect(W - pw, (py + 40) % H, pw, ph);
  }
  // fold crease + sticker-residue stain
  x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(0, Math.floor(H * (.3 + hash(seed) * .4)), W, 2);
  x.fillStyle = 'rgba(150,120,60,.12)';
  x.beginPath(); x.arc(hash(seed * 3) * W, hash(seed * 5) * H, 14 + hash(seed * 7) * 22, 0, 6.3); x.fill();
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  speck(x, x.canvas.width, x.canvas.height, x.canvas.width * x.canvas.height / 260, .07);
  x.restore();
}

function drawFrame(x, tp, dx, dy, dw, dh, t, img) {
  x.save(); x.beginPath(); x.rect(dx, dy, dw, dh); x.clip();
  if (img) coverImg(x, img, dx, dy, dw, dh);
  else { x.translate(dx, dy); proceduralFrame(x, dw, dh, tp, t); }
  x.restore();
  x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 3; x.strokeRect(dx, dy, dw, dh);
  x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1; x.strokeRect(dx + 1.5, dy + 1.5, dw - 3, dh - 3);
}

function fitText(x, s, maxW) {
  if (x.measureText(s).width <= maxW) return s;
  while (s.length > 3 && x.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function outlined(x, s, px, py, fill, outline, lw) {
  x.lineJoin = 'round'; x.lineWidth = lw; x.strokeStyle = outline;
  x.strokeText(s, px, py); x.fillStyle = fill; x.fillText(s, px, py);
}

// Capa: a arte do vídeo ocupa o topo inteiro em 16:9 (a miniatura é cortada sem as tarjas
// pretas), o título cai sobre o degradê e o rodapé traz a ficha de locação. Tudo o que aparece
// — canal, título, chamada, data, duração — vem do vídeo.
export function frontCanvas(t, c) {
  var r = target(c, PW, PH, PW / CW, PH / CH); c = r.c; var x = r.x;
  // A face plana da luva so comeca em u=0.047 (15 px deste canvas) do lado da lombada: medido na
  // geometria de vhs_tape_basic. Fundo sangra 0..CW; conteudo fica em [SL, SR] e se centra em MID.
  var SL = 22, SR = CW - 13, contentW = SR - SL, MID = (SL + SR) / 2;
  var HEAD = 46, HERO = 180, heroBot = HEAD + HERO;
  var base = 'hsl(' + t.hue + ' ' + t.sat + '% 24%)';

  // Luva lisa: nada de segunda camada da arte por baixo — a miniatura so aparece na faixa dela,
  // senao parece que a imagem esta atravessando a capa.
  x.fillStyle = base; x.fillRect(0, 0, CW, CH);
  var g = x.createLinearGradient(0, heroBot, 0, CH);
  g.addColorStop(0, base);
  g.addColorStop(.5, 'hsl(' + t.hue + ' ' + Math.round(t.sat * .8) + '% 14%)');
  g.addColorStop(1, '#08080a');
  x.fillStyle = g; x.fillRect(0, heroBot, CW, CH - heroBot);

  // ---- cabeçalho: avatar + nome do canal + número de catálogo ----
  x.fillStyle = '#0a0a0c'; x.fillRect(0, 0, CW, HEAD);
  var avR = 13, avX = SL + avR, avY = HEAD / 2 - 1;
  x.save(); x.beginPath(); x.arc(avX, avY, avR, 0, 6.3); x.clip();
  if (channelAvatar) coverImg(x, channelAvatar, avX - avR, avY - avR, avR * 2, avR * 2);
  else { x.fillStyle = '#ffd700'; x.fillRect(avX - avR, avY - avR, avR * 2, avR * 2); }
  x.restore();
  x.strokeStyle = '#ffd700'; x.lineWidth = 1.5;
  x.beginPath(); x.arc(avX, avY, avR, 0, 6.3); x.stroke();

  x.textAlign = 'start'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#ffffff'; x.font = '900 14px ' + SANS;
  var nameX = avX + avR + 8;
  x.fillText(fitText(x, (t.handle || TXT.defaultHandle).toUpperCase(), SR - nameX - 44), nameX, avY + 5);

  x.textAlign = 'end'; x.fillStyle = '#ffd700'; x.font = '700 10px ' + MONO;
  x.fillText(TXT.catalog.replace('{n}', String(t.idx + 1).padStart(2, '0')), SR, avY + 4);
  x.fillStyle = '#ffd700'; x.fillRect(0, HEAD - 2, CW, 2);

  // ---- arte do vídeo, sangrando nas laterais ----
  x.save(); x.beginPath(); x.rect(0, HEAD, CW, HERO); x.clip();
  if (t.thumb) coverImg(x, t.thumb, 0, HEAD, CW, HERO);
  else { x.save(); x.translate(0, HEAD); proceduralFrame(x, CW, HERO, t, 12 + t.seed * 3); x.restore(); }
  var fade = x.createLinearGradient(0, heroBot - 64, 0, heroBot);
  fade.addColorStop(0, 'hsl(' + t.hue + ' ' + t.sat + '% 24% / 0)');
  fade.addColorStop(1, base);
  x.fillStyle = fade; x.fillRect(0, heroBot - 64, CW, 64);
  x.restore();

  // ---- título e chamada, centrados entre a arte e a tarja (o bloco encolhe com o texto) ----
  var rawTitle = (t.title || TXT.defaultTitleFront).toUpperCase();
  var titleSize = rawTitle.length > 58 ? 17 : rawTitle.length > 32 ? 21 : 26;
  var lines = wrapLines(x, rawTitle, contentW - 6, '900 ' + titleSize + 'px ' + SANS, 3);
  var lineH = titleSize + 5;
  var tg = tagline(t.desc);
  var tgLines = tg ? wrapLines(x, tg, contentW - 10, 'italic 600 11px ' + SANS, 3) : [];
  var blockH = lines.length * lineH + (tgLines.length ? 12 + tgLines.length * 14 : 0);
  var ty = Math.max(heroBot - 26, heroBot + (392 - heroBot - blockH) / 2) + titleSize * .85;

  x.textAlign = 'center'; x.font = '900 ' + titleSize + 'px ' + SANS;
  lines.forEach(function (L, i) {
    var ly = Math.round(ty + i * lineH);
    x.fillStyle = 'rgba(0,0,0,.65)'; x.fillText(L, MID + 2, ly + 3);
    outlined(x, L, MID, ly, '#ffe500', '#8a1010', 3);
    x.fillStyle = '#ffe500'; x.fillText(L, MID, ly);
  });

  // ---- chamada: primeira frase da descrição do vídeo ----
  var cy = Math.round(ty + lines.length * lineH) + 12;
  x.fillStyle = 'rgba(255,255,255,.78)'; x.font = 'italic 600 11px ' + SANS;
  tgLines.forEach(function (L, i) { x.fillText(L, MID, cy + i * 14); });

  // ---- tarja de locação ----
  x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(SL, 398, contentW, 22);
  x.strokeStyle = 'rgba(255,215,0,.5)'; x.lineWidth = 1; x.strokeRect(SL + .5, 398.5, contentW - 1, 21);
  x.fillStyle = '#ffd700'; x.font = '700 10px ' + MONO;
  x.fillText(TXT.rentalBand, MID, 413);

  // ---- rodapé: ficha curta + selos ----
  x.fillStyle = '#060608'; x.fillRect(0, 432, CW, CH - 432);
  x.fillStyle = '#c2382f'; x.fillRect(0, 432, CW, 2);
  x.textAlign = 'start'; x.fillStyle = '#b8c0c8'; x.font = '700 9px ' + MONO;
  var rows = [
    [TXT.specChannel, t.handle || TXT.defaultChannel],
    [TXT.specDate, t.date || TXT.defaultDate],
    [TXT.specRuntime, hhmmss(t.dur)]
  ];
  rows.forEach(function (row, i) {
    var ry = 450 + i * 14;
    x.fillStyle = '#7d858d'; x.fillText(row[0], SL, ry);
    x.fillStyle = '#d6dde3'; x.fillText(fitText(x, row[1], 118), SL + 58, ry);
  });

  var bx = SR - 52;
  x.fillStyle = '#e8e2cf'; x.fillRect(bx, 440, 52, 28);
  x.fillStyle = '#0a0a0a'; x.font = '900 15px ' + SANS; x.textAlign = 'center';
  x.fillText(TXT.vhs, bx + 26, 456);
  x.font = '700 7px ' + SANS; x.fillText(TXT.hifiStereo, bx + 26, 465);
  x.strokeStyle = '#37e2ff'; x.lineWidth = 2; x.strokeRect(bx, 472, 52, 20);
  x.fillStyle = '#37e2ff'; x.font = '900 12px ' + SANS;
  x.fillText(TXT.rating, bx + 26, 487);

  wornEdges(x, CW, CH, t.seed);
  return c;
}

// Contracapa: três quadros do próprio vídeo, a sinopse (descrição) e a ficha técnica
// com canal, data, duração, exibições e o código do vídeo.
export function backCanvas(t, c) {
  var r = target(c, BW, BH, BW / CW, BH / CH); c = r.c; var x = r.x;
  // Espelho da frente: aqui a face plana acaba em u=0.953 (15 px antes da direita do canvas).
  var SL = 16, SR = CW - 24, contentW = SR - SL;

  x.fillStyle = 'hsl(' + t.hue + ' ' + Math.round(t.sat * .3) + '% 11%)';
  x.fillRect(0, 0, CW, CH);

  // ---- faixa do título ----
  x.fillStyle = 'hsl(' + t.hue + ' ' + Math.round(t.sat * .55) + '% 20%)';
  x.fillRect(0, 0, CW, 64);
  x.fillStyle = '#ffd700'; x.fillRect(0, 62, CW, 2);
  x.textAlign = 'start'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#fff';
  wrapLines(x, (t.title || TXT.defaultTitleBack).toUpperCase(), contentW, '900 15px ' + SANS, 2)
    .forEach(function (L, i) { x.fillText(L, SL, 24 + i * 17); });
  x.fillStyle = '#37e2ff'; x.font = '700 10px ' + MONO;
  x.fillText(fitText(x, (t.handle || TXT.defaultChannel) + '  ·  ' + (t.date || TXT.defaultDate), contentW), SL, 56);

  // ---- três quadros do vídeo ----
  var sw = (contentW - 12) / 3, sh = Math.round(sw * 9 / 16);
  for (var i = 0; i < 3; i++) {
    drawFrame(x, t, SL + i * (sw + 6), 74, sw, sh, t.dur * (.25 + i * .3), t.shots[i] || null);
  }
  var y = 74 + sh + 24;

  // ---- sinopse (flui com o tamanho real da descrição) ----
  x.fillStyle = '#ffd700'; x.font = '700 9px ' + MONO;
  x.fillText(TXT.synopsis, SL, y);
  x.fillStyle = 'rgba(255,215,0,.35)'; x.fillRect(SL + 56, y - 4, contentW - 56, 1);
  y += 16;
  x.fillStyle = '#dde2e6';
  var descLines = wrapLines(x, t.desc || TXT.defaultDesc, contentW, '600 11px ' + SANS, 7);
  descLines.forEach(function (L, idx) { x.fillText(L, SL, y + idx * 13); });
  var gapTop = y + descLines.length * 13;

  // ---- ficha técnica: encostada no rodapé, para o vazio ficar todo na sinopse ----
  var specs = [
    [TXT.specChannel, t.handle || TXT.defaultChannel],
    [TXT.specDate, t.date || TXT.defaultDate],
    [TXT.specRuntime, hhmmss(t.dur)]
  ];
  if (t.views) specs.push([TXT.specViews, groupNum(t.views)]);
  specs.push([TXT.specCode, t.id || TXT.defaultId]);
  specs.push([TXT.specFormat, TXT.formatValue]);

  y = 386 - specs.length * 14;

  // sinopse curta deixa um claro no meio: preenche com a marca do canal, bem apagada
  var gapH = (y - 26) - gapTop;
  if (gapH > 46) {
    var wm = Math.min(118, gapH - 14), wx = SL + contentW / 2, wy = gapTop + gapH / 2;
    x.save(); x.globalAlpha = .1;
    if (channelAvatar) {
      x.beginPath(); x.arc(wx, wy, wm / 2, 0, 6.3); x.clip();
      coverImg(x, channelAvatar, wx - wm / 2, wy - wm / 2, wm, wm);
    } else {
      x.fillStyle = '#ffd700'; x.textAlign = 'center';
      x.font = '900 ' + Math.round(wm * .6) + 'px ' + SANS;
      x.fillText(TXT.vhs, wx, wy + wm * .2);
      x.textAlign = 'start';
    }
    x.restore();
  }

  x.fillStyle = '#ffd700'; x.font = '700 9px ' + MONO;
  x.fillText(TXT.specs, SL, y - 16);
  x.fillStyle = 'rgba(255,215,0,.35)'; x.fillRect(SL + 76, y - 20, contentW - 76, 1);
  x.font = '700 10px ' + MONO;
  specs.forEach(function (row, idx) {
    var ry = y + idx * 14;
    x.fillStyle = '#7d858d'; x.fillText(row[0], SL, ry);
    x.fillStyle = '#e4e9ed'; x.textAlign = 'end';
    x.fillText(fitText(x, row[1], contentW - 92), SR, ry);
    x.textAlign = 'start';
    x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(SL, ry + 4, contentW, 1);
  });

  // ---- rodapé: código de barras, selo de rebobinar e a faixa da loja ----
  x.save(); x.translate(SR - 42, 428); x.rotate(-.1);
  x.strokeStyle = '#ff2d78'; x.lineWidth = 2; x.strokeRect(-44, -14, 88, 28);
  x.fillStyle = '#ff2d78'; x.font = '700 10px ' + MONO; x.textAlign = 'center';
  x.fillText(TXT.beKind, 0, -1); x.fillText(TXT.rewind, 0, 11);
  x.restore();

  x.fillStyle = '#e8e2cf'; x.fillRect(SL, 408, 138, 44);
  x.fillStyle = '#0a0a0a'; var bx = SL + 6, k;
  for (k = 0; k < 36 && bx < SL + 130; k++) {
    var w = 1 + ((hash(t.seed + k) * 3) | 0);
    x.fillRect(bx, 412, w, 26); bx += w + 1 + ((hash(t.seed * 3 + k) * 2) | 0);
  }
  x.font = '700 10px ' + MONO; x.textAlign = 'start';
  x.fillText(fitText(x, t.id || TXT.defaultId, 126), SL + 6, 448);

  x.fillStyle = '#0a0a0c'; x.fillRect(0, 470, CW, CH - 470);
  x.fillStyle = '#ffd700'; x.fillRect(0, 470, CW, 2);
  x.fillStyle = '#8f98a1'; x.font = '700 9px ' + MONO;
  x.fillText(fitText(x, (t.handle || TXT.defaultChannel).toUpperCase(), contentW - 60), SL, 489);
  x.textAlign = 'end'; x.fillStyle = '#ffd700';
  x.fillText(TXT.catalog.replace('{n}', String(t.idx + 1).padStart(2, '0')), SR, 489);
  x.textAlign = 'start';

  wornEdges(x, CW, CH, t.seed * 1.7);
  return c;
}

// Lombada (48x256 lógico): título girado, canal no pé e o número de catálogo.
export function sideCanvas(t, c) {
  // Dos 48 px logicos da lombada so o miolo x 12..36 cai na face plana (u 0.25..0.75 na geometria
  // de vhs_tape_basic); o resto curva para as quinas. Texto centrado em x=24, sem passar de +-12.
  var r = target(c, 128, 512, 128 / 48, 2); c = r.c; var x = r.x;
  x.fillStyle = '#0e0f12'; x.fillRect(0, 0, 48, 256);
  x.fillStyle = '#c2382f'; x.fillRect(0, 0, 48, 16);
  x.fillStyle = '#ffd700'; x.fillRect(0, 16, 48, 4);

  x.textAlign = 'start'; x.textBaseline = 'alphabetic';
  var label = (t.title || TXT.vhs).toUpperCase(), size = 14;
  x.font = '900 ' + size + 'px ' + SANS;
  while (size > 9 && x.measureText(label).width > 160) { size--; x.font = '900 ' + size + 'px ' + SANS; }
  label = fitText(x, label, 160);
  x.save();
  x.translate(24 + size * .35, 206); x.rotate(-Math.PI / 2);
  x.fillStyle = '#000'; x.fillText(label, 2, 2);
  outlined(x, label, 0, 0, '#ffe500', '#7a1010', 2);
  x.fillStyle = '#ffe500'; x.fillText(label, 0, 0);
  x.restore();

  x.fillStyle = '#0a0a0c'; x.fillRect(0, 216, 48, 40);
  x.fillStyle = '#e8e2cf'; x.font = '900 11px ' + SANS; x.textAlign = 'center';
  x.fillText(TXT.vhs, 24, 230);
  x.fillStyle = '#7d858d'; x.font = '700 8px ' + MONO;
  x.fillText(TXT.volume.replace('{n}', String(t.idx + 1).padStart(2, '0')), 24, 241);
  x.fillStyle = '#ffd700'; x.fillRect(14, 247, 20, 2);

  x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  speck(x, 128, 512, 300, .08);
  x.restore();
  return c;
}

// Plain black plastic faces: identical for every tape, so one cached canvas each.
function plastic(key, w, h, inset) {
  return cached('tape:' + key, function () {
    var c = cv(w, h), x = c.getContext('2d');
    x.fillStyle = '#101114'; x.fillRect(0, 0, w, h);
    if (inset) { x.fillStyle = '#08080a'; x.fillRect(inset[0], inset[1], w - inset[0] * 2, h - inset[1] * 2); }
    speck(x, w, h, w * h / 40, .06);
    return c;
  });
}
export function topCanvas() { return plastic('top', 256, 64); }
export function bottomCanvas() { return plastic('bottom', 256, 64); }

// Redraw art in place on the existing canvases (no new textures/canvases).
export function refreshTape(t) {
  if (!t.mFront) return;
  [[t.mFront, frontCanvas], [t.mBack, backCanvas], [t.mSide, sideCanvas]].forEach(function (p) {
    var m = p[0].map; p[1](t, m.image); m.needsUpdate = true;
  });
  t.mesh.userData.label = t.title;
  if (window.setPlayingTapeCase && S.inDeck && (S.inDeck === t || S.inDeck.id === t.id)) {
    window.setPlayingTapeCase(t);
  }
}

export function loadImg(url) {
  return new Promise(function (res) {
    var im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = function () { res(im); };
    im.onerror = function () { res(null); };
    im.src = url;
  });
}

var HYDRATE_CONCURRENCY = 4, hydrateRun = 0;

// As imagens do YouTube vêm 4:3 com tarjas pretas; corta o miolo 16:9 antes de reduzir
// (posterize leve de 48 níveis) para o JPEG inteiro poder ser coletado.
function crop169(im) {
  var sh = Math.min(im.height, im.width * 9 / 16);
  if (im.height - sh < 2) return im;
  var c = cv(im.width, Math.round(sh)), x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(im, 0, Math.round((im.height - sh) / 2), im.width, Math.round(sh), 0, 0, c.width, c.height);
  return c;
}
function small(im, w, h) {
  if (!im) return null;
  try { return pixelate(crop169(im), w, h, 48); } catch (e) { return null; }
}

export function hydrate(list) {
  var run = ++hydrateRun, i = 0;
  function one(t) {
    if (run !== hydrateRun || !t || !t.id || t.hydrated) return Promise.resolve();
    t.hydrated = true;
    var base = 'https://i.ytimg.com/vi/' + t.id + '/';
    return loadImg(t.thumbUrl || base + 'hqdefault.jpg').then(function (im) {
      if (run !== hydrateRun) return null;
      var s = small(im, 240, 135);
      if (s) t.thumb = s;
      return Promise.all([base + '1.jpg', base + '2.jpg', base + '3.jpg'].map(loadImg));
    }).then(function (sh) {
      if (!sh) return;
      var shots = sh.map(function (im) { return small(im, 128, 72); }).filter(Boolean);
      if (shots.length) t.shots = shots;
      refreshTape(t);
    }).catch(function () { t.hydrated = false; });
  }
  function worker() {
    if (run !== hydrateRun || i >= list.length) return Promise.resolve();
    return one(list[i++]).then(worker);
  }
  var workers = [];
  for (var k = 0; k < HYDRATE_CONCURRENCY; k++) workers.push(worker());
  return Promise.all(workers);
}

var CASE_SHEEN = { shininess: 25, specular: 0x282c30 };

export function makeTape(t, scene, slots, M, interactables) {
  var slot = slots[t.idx]; if (!slot) return null;
  t.mFront = new THREE.MeshPhongMaterial(Object.assign({ map: tex(frontCanvas(t)) }, CASE_SHEEN));
  t.mBack = new THREE.MeshPhongMaterial(Object.assign({ map: tex(backCanvas(t)) }, CASE_SHEEN));
  t.mSide = new THREE.MeshPhongMaterial(Object.assign({ map: tex(sideCanvas(t)) }, CASE_SHEEN));
  t.mTop = new THREE.MeshPhongMaterial(Object.assign({ map: tex(topCanvas(t)) }, CASE_SHEEN));
  t.mBottom = new THREE.MeshPhongMaterial(Object.assign({ map: tex(bottomCanvas()) }, CASE_SHEEN));
  // Lado do fecho da luva: sem textura. A faixa e estreita e so a metade do meio cai na face plana,
  // entao qualquer arte ali aparece esticada na quina e lida como a capa atravessando o estojo.
  t.mOpen = new THREE.MeshPhongMaterial(Object.assign({ color: 0x101114 }, CASE_SHEEN));

  // 6 faces texturizadas da luva de papelão autêntica:
  // [+X aberto, -X lombada, +Y topo, -Y base, +Z frente, -Z verso]
  var m = new THREE.Mesh(G.tape, [t.mOpen, t.mSide, t.mTop, t.mBottom, t.mFront, t.mBack]);
  m.castShadow = true; m.receiveShadow = true;
  m.position.copy(slot.world);
  m.rotation.set(0, slot.ry, 0);
  m.userData = {
    type: 'tape', data: t, label: t.title, dynamic: true,
    home: { pos: m.position.clone(), rot: m.rotation.clone() }
  };
  scene.add(m);
  interactables.push(m);
  S.tapes.push(m);
  t.mesh = m;
  return t;
}

export function initVhsTapeModel() {
  loadModel('models/vhs_tape_basic.glb').then(function(root) {
    var sourceGeom = null;
    root.traverse(function(node) {
      if (node.isMesh && node.geometry && !sourceGeom) {
        sourceGeom = node.geometry;
      }
    });
    if (!sourceGeom) return;

    var posAttr = sourceGeom.attributes.position;
    var idxAttr = sourceGeom.index;
    if (!posAttr || !idxAttr) return;

    var posArr = [];
    for (var i = 0; i < posAttr.count; i++) {
      posArr.push([posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)]);
    }
    var idxArr = [];
    for (var j = 0; j < idxAttr.count; j++) {
      idxArr.push(idxAttr.getX(j));
    }

    var rawMinX = -0.525, rawMaxX = 0.545, rawW = rawMaxX - rawMinX;
    var rawMinY = -0.760, rawMaxY = 0.760, rawH = rawMaxY - rawMinY;
    var rawMinZ = -0.090, rawMaxZ = 0.190, rawD = rawMaxZ - rawMinZ;
    var rawCenX = (rawMinX + rawMaxX) / 2;
    var rawCenY = (rawMinY + rawMaxY) / 2;
    var rawCenZ = (rawMinZ + rawMaxZ) / 2;

    var TW = 0.20, TH = 0.31, TD = 0.042;
    var buckets = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };

    for (var k = 0; k < idxArr.length; k += 3) {
      var p0 = posArr[idxArr[k]], p1 = posArr[idxArr[k + 1]], p2 = posArr[idxArr[k + 2]];
      var v0 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      var v1 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      var n = [
        v0[1] * v1[2] - v0[2] * v1[1],
        v0[2] * v1[0] - v0[0] * v1[2],
        v0[0] * v1[1] - v0[1] * v1[0]
      ];
      var len = Math.hypot(n[0], n[1], n[2]);
      var ny = len > 1e-6 ? n[1] / len : 0;
      var nz = len > 1e-6 ? n[2] / len : 0;
      var nx = len > 1e-6 ? n[0] / len : 0;
      var midZ = (p0[2] + p1[2] + p2[2]) / 3;
      var midX = (p0[0] + p1[0] + p2[0]) / 3;

      // A arte so entra no PLANO da capa e no do verso. A regra antiga aceitava qualquer triangulo
      // com nz > 0.4, entao a aba que dobra para dentro no lado do fecho tambem recebia o material da
      // frente: como o UV vem so do x, ela repetia a faixa direita da capa num painel interno (o
      // "vertice interno" que aparecia ao olhar de lado). Quinas, abas e a parede interna vao para o
      // material 0, que e liso.
      var mat = 0;
      if (ny > 0.65) mat = 2; // Topo
      else if (ny < -0.65) mat = 3; // Base
      else if (nx > 0.5) mat = 1; // Lombada (X+ cru), com as quinas arredondadas dela
      else if (nz > 0.9 && midZ > 0.15) mat = 4; // Frente: so o plano z = rawMaxZ
      else if (nz < -0.9 && midZ < -0.05) mat = 5; // Verso: so o plano z = rawMinZ
      else mat = 0; // Fecho, abas e paredes internas: sem textura

      buckets[mat].push([p0, p1, p2]);
    }

    var positions = [], uvs = [];
    var customGeom = new THREE.BufferGeometry();
    var vertOffset = 0;

    for (var m = 0; m < 6; m++) {
      var tris = buckets[m];
      var start = vertOffset;
      var count = tris.length * 3;
      customGeom.addGroup(start, count, m);

      for (var t = 0; t < tris.length; t++) {
        var tri = [tris[t][0], tris[t][2], tris[t][1]]; // Invert winding for mirrored X
        for (var v = 0; v < 3; v++) {
          var p = tri[v];
          var sx = -((p[0] - rawCenX) / rawW) * TW;
          var sy = ((p[1] - rawCenY) / rawH) * TH;
          var sz = ((p[2] - rawCenZ) / rawD) * TD;
          positions.push(sx, sy, sz);

          var u = 0, u_v = 0;
          if (m === 4) { // Front
            u = (rawMaxX - p[0]) / rawW;
            u_v = (p[1] - rawMinY) / rawH;
          } else if (m === 5) { // Back
            u = (p[0] - rawMinX) / rawW;
            u_v = (p[1] - rawMinY) / rawH;
          } else if (m === 1) { // Spine
            u = (p[2] - rawMinZ) / rawD;
            u_v = (p[1] - rawMinY) / rawH;
          } else if (m === 0) { // Open
            u = 1 - (p[2] - rawMinZ) / rawD;
            u_v = (p[1] - rawMinY) / rawH;
          } else if (m === 2) { // Top
            u = (rawMaxX - p[0]) / rawW;
            u_v = (p[2] - rawMinZ) / rawD;
          } else { // Bottom
            u = (rawMaxX - p[0]) / rawW;
            u_v = 1 - (p[2] - rawMinZ) / rawD;
          }
          uvs.push(Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, u_v)));
          vertOffset++;
        }
      }
    }

    customGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    customGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    customGeom.computeVertexNormals();

    G.tape = customGeom;
    if (S.tapes && S.tapes.length) {
      S.tapes.forEach(function(tapeMesh) {
        tapeMesh.geometry = customGeom;
      });
    }
  }).catch(function(err) {
    console.warn('Falha ao processar modelo vhs_tape_basic para as prateleiras:', err);
  });
}

initVhsTapeModel();

