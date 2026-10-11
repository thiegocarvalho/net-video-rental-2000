import { t } from '../i18n/index.js';
import { cv, tex, speck, wrapLines, hash, coverImg, rng, cached } from '../core/Utils.js';

function seq(prefix, n) { var out = []; for (var i = 0; i < n; i++) out.push(t(prefix + '.' + i)); return out; }

export const TXT = {
  posterHeader: '★ RENTAL VHS ★',
  posterDefaultTitle: t('scn.tex.posterDefaultTitle'),
  posterFooter: t('scn.tex.posterFooter'),
  shareQrFallback: 'QR CODE',
  shareStep1: t('scn.tex.shareStep1'),
  shareStep2: t('scn.tex.shareStep2'),
  shareCopyLink: t('scn.tex.shareCopyLink'),
  shareVip: t('scn.tex.shareVip'),
  shareClub1: t('scn.tex.shareClub1'),
  shareClub2: t('scn.tex.shareClub2'),
  shareExclusive: t('scn.tex.shareExclusive'),
  boxHeavyDuty: '↑ ↑  HEAVY DUTY PACKAGING · HANDLE WITH CARE  ↑ ↑',
  boxManufactureBy: 'MANUFACTURE BY',
  boxMaker: '@THIEGOCARVALHO',
  boxQc1: 'QC INSPECTED & CERTIFIED · LOT #001-TC',
  boxQc2: 'VHS SUPPLIES & EQUIPMENT · FACTORY SEALED',
  boxBarcode: '*TC-RENTAL-BOX*',
  boxRecycle1: t('scn.tex.boxRecycle1'),
  boxRecycle2: t('scn.tex.boxRecycle2'),
  stampApproved: t('scn.tex.stampApproved'),
  stampQc: 'QC PASS',
  stampOfficial: t('scn.tex.stampOfficial'),
  placardNoAvatar: 'VHS',
  sealRetro1: t('scn.tex.sealRetro1'), seal1: t('scn.tex.seal1'),
  sealRetro2: t('scn.tex.sealRetro2'), seal2: t('scn.tex.seal2'),
  sealRetro3: t('scn.tex.sealRetro3'), seal3: t('scn.tex.seal3'),
  tagRetro: t('scn.tex.tagRetro'),
  tagNew: t('scn.tex.tagNew'),
  titleRetro: t('scn.tex.titleRetro'),
  titleNew: t('scn.tex.titleNew'),
  defaultHandle: '@canal',
  sectionOfficial: t('scn.tex.sectionOfficial'),
  bannerDefault: 'NET VIDEO RENTAL 2000',
  bannerTagline: t('scn.tex.bannerTagline'),
  ledQuartz: 'QUARTZ',
  ledDate: 'DATE',
  videoLabel: 'VIDEO 1',
  weekdaysShort: seq('scn.tex.weekdayShort', 7),
  monthsShort: seq('scn.tex.monthShort', 12),
  weekdaysLong: seq('scn.tex.weekdayLong', 7),
  monthsLong: seq('scn.tex.monthLong', 12),
  weekdayInitials: seq('scn.tex.weekdayInitial', 7),
  weekStart: parseInt(t('scn.tex.weekStart'), 10) || 0,
  calTodayIs: t('scn.tex.calTodayIs'),
  calBrand: 'AT•A•GLANCE®',
  calWeekDays: function (week, days) { return t('scn.tex.calWeekDays', { week: week, days: days }); },
  maintenance1: t('scn.tex.maintenance1'),
  maintenance2: t('scn.tex.maintenance2'),
  comeBack1: t('scn.tex.comeBack1'),
  comeBack2: t('scn.tex.comeBack2'),
  termCredits: t('scn.tex.termCredits'),
  termCredits1: t('scn.tex.termCredits1'),
  termCredits2: t('scn.tex.termCredits2'),
  termCredits3: '• GATEWAY PC / TV / VCR / TAPE',
  termPrompt: t('scn.tex.termPrompt'),
  // Pôster soviético: estêncil de norma e carimbo. Não se traduzem (SAFE é o comando do terminal).
  sovietSerial: '№ 2000-XX · 1974',
  sovietWords: 'КАРТОФЕЛЬ · ПЕЧЬ · ГРУЗОВИК',   // batata, forno, caminhao: ruido tipografico, nao e frase
  sovietStamp: 'SAFE'
};

// Strip of masking tape (shared by posters, arcade sign and poster back).
function drawTape(x, tx, ty, rot, len, wid, alpha, edge) {
  len = len || 24; wid = wid || 10; alpha = alpha || .88;
  x.save();
  x.translate(tx, ty);
  x.rotate(rot);
  x.fillStyle = 'rgba(238, 226, 192, ' + alpha + ')';
  x.fillRect(-len / 2, -wid / 2, len, wid);
  x.strokeStyle = edge || 'rgba(195, 180, 140, 0.6)';
  x.lineWidth = 0.8;
  x.strokeRect(-len / 2, -wid / 2, len, wid);
  x.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  x.beginPath();
  x.moveTo(-len / 4, -wid / 2); x.lineTo(-len / 4 + 2, wid / 2);
  x.stroke();
  x.restore();
}

// Shrinks the font until `text` fits maxW (never below minPx); returns the px used.
function fitFont(x, text, maxW, px, fontFn, minPx) {
  minPx = minPx || 8;
  x.font = fontFn(px);
  while (px > minPx && x.measureText(text).width > maxW) { px -= 1; x.font = fontFn(px); }
  return px;
}


export function createPaperPoster(img, title, seed) {
  var W = 320, H = 180;
  var c = cv(512, 288), x = c.getContext('2d');
  x.scale(512 / W, 288 / H);
  x.imageSmoothingQuality = 'high';
  seed = seed || 1;

  x.clearRect(0, 0, W, H);
  var pad = 10;
  var w = W - pad * 2, h = H - pad * 2;

  x.save();
  x.beginPath();
  x.moveTo(pad, pad);
  for (var px = pad; px <= W - pad; px += 8) {
    var jY = (hash(seed * 1.3 + px * 0.7) - 0.5) * 3;
    x.lineTo(px, pad + jY);
  }
  for (var py = pad; py <= H - pad; py += 8) {
    var jX = (hash(seed * 2.7 + py * 0.9) - 0.5) * 3;
    x.lineTo(W - pad + jX, py);
  }
  for (var px = W - pad; px >= pad; px -= 8) {
    var tear = (px < pad + 35) ? (hash(seed * 5.1 + px) * 4) : 0;
    var jY = (hash(seed * 3.9 + px * 0.8) - 0.5) * 3 - tear;
    x.lineTo(px, H - pad + jY);
  }
  for (var py = H - pad; py >= pad; py -= 8) {
    var jX = (hash(seed * 4.3 + py * 0.7) - 0.5) * 3;
    x.lineTo(pad + jX, py);
  }
  x.closePath();

  x.fillStyle = 'rgba(0,0,0,0.22)';
  x.fill();

  x.save();
  x.clip();

  x.fillStyle = '#eee4cf';
  x.fillRect(pad - 4, pad - 4, w + 8, h + 8);

  if (img) {
    x.globalAlpha = 0.93;
    coverImg(x, img, pad, pad, w, h);
    x.globalAlpha = 1;
    x.fillStyle = 'rgba(235, 215, 175, 0.18)';
    x.fillRect(pad, pad, w, h);
  } else {
    var hues = [345, 205, 35];
    var bgHue = hues[seed % hues.length];
    x.fillStyle = 'hsl(' + bgHue + ' 55% 24%)';
    x.fillRect(pad, pad, w, h);

    x.strokeStyle = 'rgba(255,255,255,0.08)';
    x.lineWidth = 5;
    for (var i = -W; i < W * 2; i += 18) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke();
    }

    x.fillStyle = '#ff2d78';
    x.font = '900 17px "Helvetica Neue",Arial';
    x.fillText(TXT.posterHeader, pad + 14, pad + 28);

    x.fillStyle = '#ffffff';
    wrapLines(x, (title || TXT.posterDefaultTitle).toUpperCase(), w - 24, '700 13px "Courier New",monospace', 3)
      .forEach(function(l, idx) { x.fillText(l, pad + 14, pad + 56 + idx * 17); });

    x.fillStyle = '#37e2ff';
    x.font = '900 11px "Helvetica Neue",Arial';
    x.fillText(TXT.posterFooter, pad + 14, H - pad - 12);
  }

  speck(x, W, H, 1600, 0.08);

  var cx = W / 2, cy = H / 2;
  x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(cx, pad); x.lineTo(cx, H - pad); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.16)';
  x.beginPath(); x.moveTo(cx + 1, pad); x.lineTo(cx + 1, H - pad); x.stroke();

  x.strokeStyle = 'rgba(0,0,0,0.22)';
  x.beginPath(); x.moveTo(pad, cy); x.lineTo(W - pad, cy); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.16)';
  x.beginPath(); x.moveTo(pad, cy + 1); x.lineTo(W - pad, cy + 1); x.stroke();

  x.restore(); // Fecha o clip do papel
  x.restore();

  drawTape(x, pad + 4, pad + 4, -0.65);
  drawTape(x, W - pad - 4, pad + 4, 0.65);
  drawTape(x, pad + 4, H - pad - 4, 0.65);
  drawTape(x, W - pad - 4, H - pad - 4, -0.65);
  drawTape(x, W / 2, pad - 2, (hash(seed) - 0.5) * 0.2, 20, 8);

  return c;
}

export function createRetroSharePoster(canvas, url, channelHandle, seed) {
  canvas = canvas || cv(600, 900);
  // Portrait 2:3 poster, authored in a 600x900 space and scaled to whatever canvas is given.
  // Estilo cartaz de locadora dos anos 90: raios (sunburst) escuros, titulo amarelo contornado com sombra magenta,
  // explosao atras do "acesso exclusivo", QR como adesivo com sombra dura e laterais de rolo de filme.
  var LW = 600, LH = 900;
  var x = canvas.getContext('2d');
  x.setTransform(canvas.width / LW, 0, 0, canvas.height / LH, 0, 0);
  x.imageSmoothingQuality = 'high';
  var CX = LW / 2, INK = '#0b0816', YEL = '#ffd21f', MAG = '#e6007e', RED = '#e8201c', CYAN = '#18d4e0';
  var SANS = function (w) { return function (px) { return w + ' ' + px + 'px "Helvetica Neue", Arial, sans-serif'; }; };
  var MONO = function (w) { return function (px) { return w + ' ' + px + 'px "Courier New", monospace'; }; };
  var textW = 500;
  var qrSize = 322, qrBoxX = (LW - qrSize) / 2, qrBoxY = 424, qrPad = 14;

  // Centered text, largest size <= px that fits maxW.
  function fitC(text, px, fontFn, base, maxW) {
    x.textAlign = 'center';
    fitFont(x, text, maxW, px, fontFn, 10);
    x.fillText(text, CX, base);
  }
  // Poster lettering: slanted, black outline, hard magenta offset shadow, flat fill.
  function bang(text, px, base, maxW, fill, slant) {
    x.save();
    x.translate(CX, base);
    x.transform(1, 0, -(slant || 0.1), 1, 0, 0);
    x.textAlign = 'center'; x.lineJoin = 'round';
    fitFont(x, text, maxW, px, SANS('900'), 10);
    x.lineWidth = 13; x.strokeStyle = MAG; x.fillStyle = MAG;
    x.strokeText(text, 6, 7); x.fillText(text, 6, 7);
    x.strokeStyle = INK; x.strokeText(text, 0, 0);
    x.fillStyle = fill; x.fillText(text, 0, 0);
    x.restore();
  }
  function star(cx, cy, rxO, ryO, rxI, ryI, n) {
    x.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = i / (n * 2) * Math.PI * 2, o = i % 2 === 0;
      var px = cx + Math.cos(a) * (o ? rxO : rxI), py = cy + Math.sin(a) * (o ? ryO : ryI);
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
  }

  // ---- background: night purple with sunburst rays + vignette ----
  x.fillStyle = '#1a1140'; x.fillRect(0, 0, LW, LH);
  x.fillStyle = 'rgba(122,60,200,.30)';
  for (var ri = 0; ri < 24; ri++) {
    var a0 = ri / 24 * Math.PI * 2, a1 = a0 + Math.PI / 24;
    x.beginPath(); x.moveTo(CX, 330); x.lineTo(CX + Math.cos(a0) * 1100, 330 + Math.sin(a0) * 1100); x.lineTo(CX + Math.cos(a1) * 1100, 330 + Math.sin(a1) * 1100); x.closePath(); x.fill();
  }
  var vg = x.createRadialGradient(CX, 380, 120, CX, 450, 640);
  vg.addColorStop(0, 'rgba(255,60,160,.20)'); vg.addColorStop(1, 'rgba(5,2,16,.65)');
  x.fillStyle = vg; x.fillRect(0, 0, LW, LH);
  // halftone dots, bottom
  x.fillStyle = 'rgba(24,212,224,.14)';
  for (var hy = 0; hy < 10; hy++) for (var hx = 0; hx < 30; hx++) {
    var hr = 1 + hy * 0.38; x.beginPath(); x.arc(40 + hx * 18 + (hy % 2) * 9, 700 + hy * 18, hr, 0, 6.3); x.fill();
  }
  speck(x, LW, LH, 2200, .05);

  // ---- film-strip sides ----
  x.fillStyle = '#07050f'; x.fillRect(0, 0, 34, LH); x.fillRect(LW - 34, 0, 34, LH);
  x.fillStyle = '#d8cfb4';
  for (var fy = 14; fy < LH - 10; fy += 44) { x.fillRect(10, fy, 14, 22); x.fillRect(LW - 24, fy, 14, 22); }

  // ---- checker strip + VIP ribbon ----
  for (var cxx = 34; cxx < LW - 34; cxx += 19) {
    x.fillStyle = (((cxx - 34) / 19) % 2 === 0) ? YEL : INK; x.fillRect(cxx, 22, 19, 14);
    x.fillStyle = (((cxx - 34) / 19) % 2 === 0) ? INK : YEL; x.fillRect(cxx, 36, 19, 14);
  }
  x.fillStyle = RED; x.fillRect(34, 56, LW - 68, 34);
  x.fillStyle = INK; x.fillRect(34, 90, LW - 68, 3);
  x.fillStyle = YEL;
  fitC(TXT.shareVip, 22, MONO('900'), 80, textW - 20);

  // ---- headline ----
  bang(TXT.shareClub1, 76, 178, textW - 20, YEL, 0.1);
  bang(TXT.shareClub2, 100, 270, textW - 40, '#ffffff', 0.1);

  // ---- starburst with the "exclusive access" line, channel handle underneath ----
  x.save(); x.translate(CX, 340); x.rotate(-0.035);
  star(0, 0, 262, 40, 236, 31, 30);
  x.fillStyle = YEL; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.lineJoin = 'round'; x.stroke();
  x.fillStyle = INK; x.textAlign = 'center';
  fitFont(x, TXT.shareExclusive, 400, 22, MONO('900'), 10);
  x.fillText(TXT.shareExclusive, 0, 8);
  x.restore();
  bang((channelHandle || '@canal').toUpperCase(), 32, 398, textW - 20, CYAN, 0.06);

  // ---- QR sticker: hard magenta shadow, thick black border, clean white quiet zone ----
  x.fillStyle = MAG; x.fillRect(qrBoxX + 16, qrBoxY + 16, qrSize, qrSize);
  x.fillStyle = '#ffffff'; x.fillRect(qrBoxX, qrBoxY, qrSize, qrSize);
  x.strokeStyle = INK; x.lineWidth = 10; x.strokeRect(qrBoxX - 5, qrBoxY - 5, qrSize + 10, qrSize + 10);

  var qrDrawn = false;
  if (typeof window !== 'undefined' && window.QRCode) {
    try {
      var tmp = document.createElement('div');
      new window.QRCode(tmp, { text: url || window.location.href, width: qrSize - qrPad * 2, height: qrSize - qrPad * 2, colorDark: '#111', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
      var qcv = tmp.querySelector('canvas');
      if (qcv) {
        x.imageSmoothingEnabled = false; // keep QR modules razor sharp
        x.drawImage(qcv, qrBoxX + qrPad, qrBoxY + qrPad, qrSize - qrPad * 2, qrSize - qrPad * 2);
        x.imageSmoothingEnabled = true;
        qrDrawn = true;
      }
    } catch (e) {}
  }
  if (!qrDrawn) {
    x.fillStyle = '#0e1118'; x.fillRect(qrBoxX + qrPad, qrBoxY + qrPad, qrSize - qrPad * 2, qrSize - qrPad * 2);
    x.fillStyle = '#ffffff'; x.font = '900 24px "Courier New", monospace'; x.textAlign = 'center';
    x.fillText(TXT.shareQrFallback, CX, qrBoxY + qrSize / 2);
  }

  // ---- steps on a dark label, copy-link bar in yellow ----
  x.fillStyle = 'rgba(7,5,15,.88)'; x.fillRect(50, 768, textW, 62);
  x.strokeStyle = CYAN; x.lineWidth = 3; x.strokeRect(50, 768, textW, 62);
  x.fillStyle = '#ffffff';
  fitC(TXT.shareStep1, 21, SANS('800'), 794, textW - 24);
  fitC(TXT.shareStep2, 21, SANS('800'), 820, textW - 24);
  x.fillStyle = YEL; x.fillRect(50, 842, textW, 34);
  x.strokeStyle = INK; x.lineWidth = 4; x.strokeRect(50, 842, textW, 34);
  x.fillStyle = INK;
  fitC(TXT.shareCopyLink, 21, MONO('900'), 866, textW - 40);

  // ---- Wear: everything below is clipped to stay OUTSIDE the QR box (and its shadow) ----
  x.save();
  x.beginPath();
  x.rect(0, 0, LW, LH);
  x.rect(qrBoxX - 12, qrBoxY - 12, qrSize + 34, qrSize + 34);
  x.clip('evenodd');

  // fold creases (dark + light edge)
  function crease(x1, y1, x2, y2) {
    x.lineWidth = 2; x.strokeStyle = 'rgba(0,0,0,.35)';
    x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.22)';
    x.beginPath(); x.moveTo(x1 + 2, y1 + 2); x.lineTo(x2 + 2, y2 + 2); x.stroke();
  }
  crease(0, 450, LW, 453);
  crease(300, 0, 297, LH);

  // faded ink patches over the lettering, grease smudge, coffee ring
  x.fillStyle = 'rgba(255,255,255,.10)';
  x.beginPath(); x.ellipse(430, 150, 95, 34, -.15, 0, 6.3); x.fill();
  x.beginPath(); x.ellipse(150, 250, 70, 24, .2, 0, 6.3); x.fill();
  x.strokeStyle = 'rgba(190,140,70,.30)'; x.lineWidth = 5;
  x.beginPath(); x.arc(96, 640, 34, 0.3, 5.6); x.stroke();
  x.fillStyle = 'rgba(0,0,0,.14)';
  x.beginPath(); x.ellipse(540, 560, 40, 90, .1, 0, 6.3); x.fill();

  // scuffs and scratches
  x.lineWidth = 1.5;
  for (var si = 0; si < 16; si++) {
    var sx = hash((seed || 1) * 7.1 + si) * LW, sy = hash((seed || 1) * 3.3 + si * 1.7) * LH, sl = 14 + hash(si * 2.9) * 40;
    x.strokeStyle = (si % 2) ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.30)';
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + sl, sy + (hash(si * 5.3) - 0.5) * 18); x.stroke();
  }
  // darkened edges
  var g = x.createLinearGradient(0, LH, 0, LH - 90); g.addColorStop(0, 'rgba(0,0,0,.40)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, LH - 90, LW, 90);
  x.restore();

  // torn top-right corner (transparent: the poster plane uses alphaTest)
  x.save();
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  x.moveTo(LW - 70, 0); x.lineTo(LW - 54, 10); x.lineTo(LW - 44, 6); x.lineTo(LW - 30, 22); x.lineTo(LW - 18, 20);
  x.lineTo(LW - 8, 38); x.lineTo(LW, 52); x.lineTo(LW, 0); x.closePath(); x.fill();
  x.restore();
  x.setTransform(1, 0, 0, 1, 0, 0);
}

// Pôster brutalista soviético / construtivista russo: a pista do easter egg SAFE (AJUSTES_FINAIS.md §4.2).
// Fica na parede do fundo ATRÁS do cartaz de indicação (Furnishings.js) e só aparece quando aquele cai.
// Papel amarelado encardido (mofo, ferrugem, vincos, fibra), tinta vermelho escarlate desbotado e preto fuligem;
// moldura industrial chanfrada, faixas diagonais de advertência, emblema geométrico angular no topo e
// tipografia condensada em CAIXA ALTA com faixas de destaque invertidas. A frase vem do i18n (quem chama passa).
// Desenhado num espaço lógico de 600x900 e escalado para o canvas recebido (512x768 por padrão).
export function createSovietCluePoster(canvas, phrase, seed) {
  canvas = canvas || cv(512, 768);
  var LW = 600, LH = 900, x = canvas.getContext('2d'), r = rng((seed || 17) * 131 + 7), i;
  x.setTransform(canvas.width / LW, 0, 0, canvas.height / LH, 0, 0);
  x.imageSmoothingQuality = 'high';
  var PAPER = '#cbbd9e', RED = '#8b2222', INK = '#181614', CREAM = '#e8dfc7';
  var COND = function (w) { return function (px) { return w + ' ' + px + 'px Impact, "Arial Black", "Arial Narrow", sans-serif'; }; };
  var txt = String(phrase || '').toUpperCase();

  // ---- papel encardido ----
  x.fillStyle = PAPER; x.fillRect(0, 0, LW, LH);
  var pg = x.createLinearGradient(0, 0, LW * 0.6, LH);
  pg.addColorStop(0, 'rgba(231,219,185,.55)'); pg.addColorStop(0.45, 'rgba(203,189,158,0)'); pg.addColorStop(1, 'rgba(112,90,56,.38)');
  x.fillStyle = pg; x.fillRect(0, 0, LW, LH);
  for (i = 0; i < 16; i++) {                                  // mofo esverdeado e ferrugem
    var mx = r() * LW, my = r() * LH, mr = 16 + r() * 72;
    x.fillStyle = r() > 0.45 ? 'rgba(96,88,52,' + (0.05 + r() * 0.09).toFixed(3) + ')'
                             : 'rgba(142,76,30,' + (0.05 + r() * 0.1).toFixed(3) + ')';
    x.beginPath(); x.ellipse(mx, my, mr, mr * (0.45 + r() * 0.6), r() * 3, 0, 6.3); x.fill();
  }
  for (i = 0; i < 5; i++) {                                   // vincos: um lado claro, o outro na sombra
    var vy = 70 + i * 160 + r() * 50;
    x.fillStyle = 'rgba(255,250,232,.26)'; x.fillRect(0, vy, LW, 2);
    x.fillStyle = 'rgba(70,56,32,.22)'; x.fillRect(0, vy + 2, LW, 3);
  }
  var vx = 190 + r() * 60;                                    // um vinco vertical (o cartaz foi dobrado)
  x.fillStyle = 'rgba(255,250,232,.2)'; x.fillRect(vx, 0, 2, LH);
  x.fillStyle = 'rgba(70,56,32,.18)'; x.fillRect(vx + 2, 0, 3, LH);
  for (i = 0; i < 70; i++) {                                  // fibra do papel
    x.fillStyle = r() > 0.5 ? 'rgba(255,248,226,.16)' : 'rgba(92,74,46,.14)';
    x.fillRect(r() * LW, r() * LH, 6 + r() * 34, 1);
  }
  speck(x, LW, LH, 2400, 0.07);

  // ---- moldura industrial chanfrada ----
  x.fillStyle = INK; x.fillRect(0, 0, LW, 26); x.fillRect(0, LH - 26, LW, 26);
  x.fillRect(0, 0, 26, LH); x.fillRect(LW - 26, 0, 26, LH);
  x.fillStyle = RED; x.fillRect(26, 26, LW - 52, 9); x.fillRect(26, LH - 35, LW - 52, 9);
  x.fillRect(26, 35, 9, LH - 70); x.fillRect(LW - 35, 35, 9, LH - 70);
  x.fillStyle = 'rgba(255,250,232,.22)';                      // chanfro: luz no alto e na esquerda
  x.fillRect(26, 26, LW - 52, 2); x.fillRect(26, 26, 2, LH - 52);
  [[26, 26], [LW - 26, 26], [26, LH - 26], [LW - 26, LH - 26]].forEach(function (c, k) {   // cantos cortados
    x.fillStyle = INK; x.save(); x.translate(c[0], c[1]); x.rotate(k * Math.PI / 2);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(34, 0); x.lineTo(0, 34); x.closePath(); x.fill(); x.restore();
  });

  // ---- emblema geometrico no topo ----
  // Sem estrela nem sigla de estado: so uma placa com barras decrescentes, que le como marca
  // industrial generica. O cirilico abaixo e ruido tipografico (palavras soltas, sem sentido junto).
  var SX = LW / 2, SY = 196;
  x.save(); x.translate(SX, SY + 10); x.globalAlpha = 0.5; x.fillStyle = INK;   // barras angulares, atras
  x.rotate(-0.22); x.fillRect(-150, -6, 300, 14);
  x.rotate(0.44); x.fillRect(-150, -6, 300, 14);
  x.restore();
  x.save(); x.translate(SX, SY);
  x.fillStyle = INK; x.fillRect(-143, -57, 304, 132);         // sombra dura deslocada
  x.fillStyle = RED; x.fillRect(-152, -66, 304, 132);         // placa
  x.fillStyle = CREAM;                                        // tres barras grossas decrescentes
  x.fillRect(-128, -42, 256, 20);
  x.fillRect(-128, -10, 196, 20);
  x.fillRect(-128, 22, 136, 20);
  x.fillStyle = 'rgba(24,22,20,.5)';                          // cunha diagonal: faceta construtivista
  x.beginPath(); x.moveTo(152, -66); x.lineTo(152, 66); x.lineTo(66, 66); x.closePath(); x.fill();
  x.restore();
  x.textAlign = 'center';
  x.font = COND('700')(25);
  x.fillStyle = 'rgba(24,22,20,.62)';
  x.fillText(TXT.sovietWords, SX, SY + 112);

  // ---- faixa diagonal de advertência ----
  function hazard(y, h) {
    x.save();
    x.beginPath(); x.rect(44, y, LW - 88, h); x.clip();
    x.fillStyle = INK; x.fillRect(44, y, LW - 88, h);
    x.fillStyle = PAPER;
    for (var d = -h; d < LW; d += 36) { x.beginPath(); x.moveTo(44 + d, y + h); x.lineTo(44 + d + 18, y + h); x.lineTo(44 + d + 18 + h, y); x.lineTo(44 + d + h, y); x.closePath(); x.fill(); }
    x.restore();
  }
  hazard(322, 18);
  hazard(LH - 150, 18);

  // ---- barras geométricas grossas e a frase ----
  // A frase é quebrada em linhas; a 1a e a 3a saem em vermelho/preto sobre o papel, as pares em creme sobre bloco vermelho.
  var maxW = LW - 150;
  var lines = wrapLines(x, txt, maxW, COND('900')(56), 4);
  var y = 400, lh = 0;
  lines.forEach(function (ln, k) {
    var px = fitFont(x, ln, maxW, 60, COND('900'), 18);
    lh = Math.round(px * 1.16);
    var inv = k % 2 === 1;
    if (inv) {
      x.fillStyle = RED; x.fillRect(58, y - lh + 8, LW - 116, lh + 6);
      x.fillStyle = 'rgba(24,22,20,.5)'; x.fillRect(58, y + 12, LW - 116, 4);
    }
    x.textAlign = 'center';
    x.font = COND('900')(px);
    x.fillStyle = inv ? 'rgba(24,22,20,.45)' : 'rgba(24,22,20,.3)';
    x.fillText(ln, LW / 2 + 4, y + 4);                        // sombra de impressão desalinhada
    x.fillStyle = inv ? CREAM : (k === 0 ? RED : INK);
    x.fillText(ln, LW / 2, y);
    y += lh + 22;
  });

  // ---- rodapé: barras, estêncil e carimbo ----
  x.fillStyle = INK; x.fillRect(58, LH - 118, LW - 116, 12);
  x.fillStyle = RED; x.fillRect(58, LH - 102, (LW - 116) * 0.62, 7);
  x.textAlign = 'center';
  x.font = COND('700')(22);
  x.fillStyle = 'rgba(24,22,20,.72)';
  x.fillText(TXT.sovietSerial, LW / 2, LH - 62);
  x.save();                                                    // carimbo redondo desbotado, torto
  x.translate(LW - 132, LH - 232); x.rotate(-0.26); x.globalAlpha = 0.42;
  x.strokeStyle = RED; x.lineWidth = 7;
  x.beginPath(); x.arc(0, 0, 58, 0, 6.3); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 46, 0, 6.3); x.stroke();
  x.fillStyle = RED; x.font = COND('900')(30); x.textAlign = 'center';
  x.fillText(TXT.sovietStamp, 0, 11);
  x.restore();

  // ---- envelhecimento final: tinta descascada, sujeira nas quinas e cantos escuros ----
  for (i = 0; i < 90; i++) {                                   // tinta falhando (papel aparecendo por cima da tinta)
    x.fillStyle = 'rgba(203,189,158,' + (0.25 + r() * 0.5).toFixed(2) + ')';
    x.fillRect(r() * LW, r() * LH, 1 + r() * 5, 1 + r() * 4);
  }
  var cg = x.createRadialGradient(LW / 2, LH / 2, LH * 0.3, LW / 2, LH / 2, LH * 0.72);
  cg.addColorStop(0, 'rgba(40,30,16,0)'); cg.addColorStop(1, 'rgba(40,30,16,.42)');
  x.fillStyle = cg; x.fillRect(0, 0, LW, LH);
  x.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

// Fundo da caixa de papelao pequena (a que se troca por moeda): simbolo de reciclagem (3 setas em triangulo) e o texto
// "pode ser reciclada por 1 moeda", em tinta marrom-escura de carimbo. Textura quadrada, transparente fora da tinta.
export function cardboardBottomCanvas() {
  var W = 512, H = 512, c = cv(W, H), x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  var ink = '#3a2412';
  x.strokeStyle = ink; x.fillStyle = ink; x.lineJoin = 'round'; x.lineCap = 'round';
  x.lineWidth = 7; x.strokeRect(36, 36, W - 72, H - 72);                      // moldura do carimbo
  x.lineWidth = 2.5; x.strokeRect(50, 50, W - 100, H - 100);
  // simbolo de reciclagem: 3 setas seguindo as arestas de um triangulo
  var cx = W / 2, cy = 190, R = 98, a0 = -Math.PI / 2, i;
  var V = [0, 1, 2].map(function(k) { var a = a0 + k * Math.PI * 2 / 3; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
  x.lineWidth = 20;
  for (i = 0; i < 3; i++) {
    var A = V[i], B = V[(i + 1) % 3];
    var sx = A[0] + (B[0] - A[0]) * 0.16, sy = A[1] + (B[1] - A[1]) * 0.16;
    var ex = A[0] + (B[0] - A[0]) * 0.70, ey = A[1] + (B[1] - A[1]) * 0.70;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(ex, ey); x.stroke();
    var ang = Math.atan2(B[1] - A[1], B[0] - A[0]);                           // ponta da seta
    x.save(); x.translate(ex, ey); x.rotate(ang);
    x.beginPath(); x.moveTo(30, 0); x.lineTo(-6, -26); x.lineTo(-6, 26); x.closePath(); x.fill();
    x.restore();
  }
  x.textAlign = 'center';
  x.font = '900 40px "Arial Black", Impact, sans-serif';
  x.fillText(TXT.boxRecycle1, W / 2, 370, W - 130);
  x.font = '900 52px "Arial Black", Impact, sans-serif';
  x.fillText(TXT.boxRecycle2, W / 2, 436, W - 130);
  return c;
}

export function cardboardStampCanvas() {
  var W = 1024, H = 640;
  var c = cv(W, H), x = c.getContext('2d');
  x.clearRect(0, 0, W, H);

  x.save();
  x.translate(W / 2, H / 2);
  x.rotate(-0.02);
  x.translate(-W / 2, -H / 2);

  var pad = 36;
  var w = W - pad * 2, h = H - pad * 2;


  var mPad = pad + 20;
  var mW = w - 40, mH = h - 40;
  var ink = '#0c0e12'; // Tinta preta sólida de alto contraste
  var inkFaded = '#2a2e36';

  x.strokeStyle = ink;
  x.lineWidth = 6;
  x.strokeRect(mPad, mPad, mW, mH);

  x.lineWidth = 2;
  x.strokeRect(mPad + 8, mPad + 8, mW - 16, mH - 16);

  var cSize = 28;
  x.fillStyle = ink;
  x.fillRect(mPad, mPad, cSize, 6);
  x.fillRect(mPad, mPad, 6, cSize);
  x.fillRect(W - mPad - cSize, mPad, cSize, 6);
  x.fillRect(W - mPad - 6, mPad, 6, cSize);
  x.fillRect(mPad, H - mPad - 6, cSize, 6);
  x.fillRect(mPad, H - mPad - cSize, 6, cSize);
  x.fillRect(W - mPad - cSize, H - mPad - 6, cSize, 6);
  x.fillRect(W - mPad - 6, H - mPad - cSize, 6, cSize);

  x.beginPath();
  x.moveTo(mPad + 16, mPad + 62);
  x.lineTo(W - mPad - 16, mPad + 62);
  x.lineWidth = 3;
  x.stroke();

  x.font = '900 21px "Courier New", monospace';
  x.textAlign = 'center';
  x.fillStyle = ink;
  x.fillText(TXT.boxHeavyDuty, W / 2, mPad + 44);

  x.font = '900 42px "Arial Black", "Helvetica Neue", Impact, sans-serif';
  x.fillText(TXT.boxManufactureBy, W / 2, mPad + 138);

  x.font = '900 68px "Arial Black", Impact, sans-serif';
  x.fillText(TXT.boxMaker, W / 2, mPad + 224);

  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(mPad + 16, mPad + 264);
  x.lineTo(W - mPad - 16, mPad + 264);
  x.stroke();

  x.font = '700 22px "Courier New", monospace';
  x.fillStyle = inkFaded;
  x.fillText(TXT.boxQc1, W / 2, mPad + 308);
  x.fillText(TXT.boxQc2, W / 2, mPad + 346);

  var barY = H - mPad - 94;
  var barH = 50;
  x.fillStyle = ink;
  for (var bx = mPad + 80; bx < W - mPad - 80; bx += 8) {
    var val = hash(bx * 4.3);
    if (val > 0.22) {
      x.fillRect(bx, barY, (val > 0.65 ? 5 : 2.5), barH);
    }
  }
  x.font = '700 18px "Courier New", monospace';
  x.fillText(TXT.boxBarcode, W / 2, H - mPad - 24);

  x.save();
  x.translate(W - mPad - 96, mPad + 175);
  x.rotate(0.22);
  x.strokeStyle = 'rgba(195, 28, 28, 0.88)';
  x.fillStyle = 'rgba(195, 28, 28, 0.88)';
  x.lineWidth = 4;
  x.beginPath();
  x.arc(0, 0, 52, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 1.5;
  x.beginPath();
  x.arc(0, 0, 46, 0, Math.PI * 2);
  x.stroke();
  x.font = '900 13px "Arial Black", sans-serif';
  x.fillText(TXT.stampApproved, 0, -18);
  x.font = '900 17px "Arial Black", sans-serif';
  x.fillText(TXT.stampQc, 0, 4);
  x.font = '900 12px "Courier New", monospace';
  x.fillText(TXT.stampOfficial, 0, 24);
  x.restore();

  x.restore();
  x.setTransform(1, 0, 0, 1, 0, 0);
  speck(x, W, H, 1400, 0.06);
  return c;
}

// Tileable surface textures: small POT canvases, seeded (deterministic), a
// shared limited-ish palette, Bayer dither + grime. Canvases are cached.
function tile(key, size, paint) {
  return cached('tile:' + key, function () {
    var c = cv(size, size), x = c.getContext('2d');
    var k = size / 128;               // art is authored on a 128 logical grid
    x.save(); x.scale(k, k);
    paint(x, 128, rng(key.length * 977 + size), key);
    x.restore();
    // fine per-pixel grain, tiled from a small cached noise pattern
    x.globalAlpha = .1; x.fillStyle = grainPattern(x); x.fillRect(0, 0, size, size);
    x.globalAlpha = 1;
    return c;
  });
}
var _grain = null;
function grainPattern(x) {
  if (!_grain) {
    var g = cv(64, 64), gx = g.getContext('2d'), d = gx.createImageData(64, 64), r = rng(4242);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = r() > .5 ? 255 : 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = (r() * 90) | 0;
    }
    gx.putImageData(d, 0, 0);
    _grain = g;
  }
  return x.createPattern(_grain, 'repeat');
}
function stains(x, S, r, n, rgb, maxA, rMin, rMax) {
  for (var i = 0; i < n; i++) {
    var px = r() * S, py = r() * S, rad = rMin + r() * (rMax - rMin);
    x.fillStyle = 'rgba(' + rgb + ',' + (maxA * (.4 + r() * .6)).toFixed(3) + ')';
    // draw wrapped so tiling stays seamless
    for (var ox = -S; ox <= S; ox += S) for (var oy = -S; oy <= S; oy += S) {
      if (px + ox + rad < 0 || px + ox - rad > S || py + oy + rad < 0 || py + oy - rad > S) continue;
      x.beginPath(); x.ellipse(px + ox, py + oy, rad, rad * (.5 + r() * .5), r() * 3, 0, 6.3); x.fill();
    }
  }
}

// Retângulo desenhado com wrap nas bordas (mantém o tile contínuo).
function wrapRect(x, S, px, py, w, h) {
  for (var ox = -S; ox <= S; ox += S) for (var oy = -S; oy <= S; oy += S) {
    if (px + ox + w < 0 || px + ox > S || py + oy + h < 0 || py + oy > S) continue;
    x.fillRect(px + ox, py + oy, w, h);
  }
}
// Rachadura em zigue-zague (passos em pixel, sem suavização), com wrap.
function crack(x, S, r, rgb, a, len) {
  var px = (r() * S) | 0, py = (r() * S) | 0, dx = r() > .5 ? 1 : 0;
  x.fillStyle = 'rgba(' + rgb + ',' + a + ')';
  for (var i = 0; i < len; i++) {
    wrapRect(x, S, ((px % S) + S) % S, ((py % S) + S) % S, 1, 1);
    if (dx) { px++; if (r() > .55) py += r() > .5 ? 1 : -1; } else { py++; if (r() > .55) px += r() > .5 ? 1 : -1; }
  }
}

// Carpete de locadora: azul-marinho escuro com "confete" miudo e discreto (tracinhos e formas bem pequenas em tons
// apagados de azul, mostarda, vermelho e verde), trama fina e fios soltos. Para nao formar um padrao de manchas, o tile e
// grande (512 px = ~74 cm, repetido 7x6), SEM manchas largas (que repetiam a cada 37 cm e formavam uma grade) e a
// variacao e toda fina e aleatoria; so ha uma sujeira muito leve e pequena.
export function carpetTex() {
  var c = cached('tile:carpet4', function() {
    var S = 512, cv2 = cv(S, S), x = cv2.getContext('2d'), r = rng(8821);
    x.fillStyle = '#141c2b'; x.fillRect(0, 0, S, S);
    var cols = ['#254b77', '#b98a2c', '#9c3333', '#2c6c57', '#3b6c9e'];
    for (var i = 0; i < 780; i++) {                                   // tracinhos pequenos
      x.globalAlpha = .38 + r() * .1; x.fillStyle = cols[(r() * cols.length) | 0];
      wrapRect(x, S, (r() * S) | 0, (r() * S) | 0, 3 + ((r() * 5) | 0), r() > .7 ? 6 : 3);
    }
    for (var m = 0; m < 300; m++) {                                   // formas minusculas: ponto, losango, triangulo
      var cx = r() * S, cy = r() * S, sz = 2.8 + r() * 3.2, kind = (r() * 3) | 0;
      x.globalAlpha = .32 + r() * .1; x.fillStyle = cols[(r() * cols.length) | 0];
      for (var ox = -S; ox <= S; ox += S) for (var oy = -S; oy <= S; oy += S) {
        if (cx + ox + sz < 0 || cx + ox - sz > S || cy + oy + sz < 0 || cy + oy - sz > S) continue;
        x.beginPath();
        if (kind === 0) x.arc(cx + ox, cy + oy, sz * .7, 0, 6.3);
        else if (kind === 1) { x.moveTo(cx + ox, cy + oy - sz); x.lineTo(cx + ox + sz * .8, cy + oy); x.lineTo(cx + ox, cy + oy + sz); x.lineTo(cx + ox - sz * .8, cy + oy); }
        else { x.moveTo(cx + ox, cy + oy - sz); x.lineTo(cx + ox + sz, cy + oy + sz * .8); x.lineTo(cx + ox - sz, cy + oy + sz * .8); }
        x.closePath(); x.fill();
      }
    }
    x.globalAlpha = .07; x.fillStyle = '#000';                        // trama do tecido
    for (var yy = 0; yy < S; yy += 8) for (var xx = ((yy / 8) % 2) * 4; xx < S; xx += 8) x.fillRect(xx, yy, 4, 4);
    x.globalAlpha = .2; x.fillStyle = '#9aa6b8';                      // fios claros soltos
    for (var j = 0; j < 360; j++) wrapRect(x, S, (r() * S) | 0, (r() * S) | 0, 2, 2 + ((r() * 5) | 0));
    x.globalAlpha = 1;
    stains(x, S, r, 10, '8,8,12', .07, 3, 7);                         // sujeira leve e pequena, sem manchas largas
    speck(x, S, S, 3200, .12);
    x.globalAlpha = .1; x.fillStyle = grainPattern(x); x.fillRect(0, 0, S, S); x.globalAlpha = 1;
    return cv2;
  });
  return tex(c, 7, 6);
}

// Fachada de ripas verticais. O tile cobre ~4 m x 4,2 m (16 tabuas de 25 cm, 512 px) e e usado sem repeticao vertical e
// com ~4 repeticoes na parede de 16 m: antes o tile era de ~2 m e se repetia 8x2, entao as manchas e os nos formavam uma
// grade visivel. As manchas largas ficaram poucas, grandes e fracas; o resto da variacao e fino e aleatorio.
// rx, ry = repeticoes por face (parede de 16 m: 4,1; para outras pecas use largura/4 e altura/4,2 para manter a escala).
export function woodSidingTex(rx, ry) {
  var c = cached('tile:siding2', function() {
    var S = 512, cv2 = cv(S, S), x = cv2.getContext('2d'), r = rng(31337), PW = 32, i, k;
    x.fillStyle = '#6a4424'; x.fillRect(0, 0, S, S);
    for (i = 0; i < S; i += PW) {
      x.fillStyle = 'rgba(30,14,6,.7)'; x.fillRect(i, 0, 3, S);                 // fresta entre tabuas
      x.fillStyle = 'rgba(255,200,140,.14)'; x.fillRect(i + 3, 0, 2, S);
      x.fillStyle = r() > .5 ? 'rgba(255,190,120,' + (r() * .09).toFixed(3) + ')' : 'rgba(10,5,2,' + (r() * .14).toFixed(3) + ')';   // tom proprio
      x.fillRect(i + 5, 0, PW - 5, S);
      for (k = 0; k < 24; k++) { x.fillStyle = 'rgba(40,22,10,' + (.16 + r() * .14).toFixed(2) + ')'; x.fillRect(i + 5 + ((r() * (PW - 7)) | 0), (r() * S) | 0, 1.5, 10 + ((r() * 46) | 0)); }
      for (k = 0; k < 14; k++) { x.fillStyle = 'rgba(200,150,95,' + (.08 + r() * .08).toFixed(2) + ')'; x.fillRect(i + 5 + ((r() * (PW - 7)) | 0), (r() * S) | 0, 1.5, 14 + ((r() * 50) | 0)); }
    }
    for (var n = 0; n < 12; n++) {                                              // nos
      var nx = (r() * (S - 16)) | 0, ny = (r() * (S - 16)) | 0;
      x.fillStyle = 'rgba(25,12,5,.5)'; x.fillRect(nx, ny, 7, 11);
      x.fillStyle = 'rgba(80,48,24,.55)'; x.fillRect(nx + 2, ny + 2, 3, 7);
    }
    x.fillStyle = 'rgba(20,12,8,.5)';                                           // pregos, em fileiras irregulares
    for (i = 0; i < S; i += PW) for (var q = 0; q < 8; q++) x.fillRect(i + 8 + ((r() * 14) | 0), q * 64 + 10 + ((r() * 40) | 0), 3, 2);
    for (var st = 0; st < 7; st++) {                                            // poucas manchas largas e fracas
      var sx = r() * S, sy = r() * S, rad = 26 + r() * 40, ox, oy;
      x.fillStyle = 'rgba(20,14,8,' + (.05 + r() * .06).toFixed(3) + ')';
      for (ox = -S; ox <= S; ox += S) for (oy = -S; oy <= S; oy += S) { x.beginPath(); x.ellipse(sx + ox, sy + oy, rad * .6, rad, 0, 0, 6.3); x.fill(); }
    }
    stains(x, S, r, 3, '90,110,70', .035, 20, 44);                              // mofo, bem sutil
    speck(x, S, S, 2600, .08);
    x.globalAlpha = .1; x.fillStyle = grainPattern(x); x.fillRect(0, 0, S, S); x.globalAlpha = 1;
    return cv2;
  });
  return tex(c, rx || 4, ry || 1);
}

export function shingleTex() {
  return tex(tile('shingle', 256, function (x, S, r) {
    x.fillStyle = '#26282d'; x.fillRect(0, 0, S, S);
    for (var row = 0; row < S; row += 16) {
      var off = ((row / 16) % 2) * 16;
      x.fillStyle = 'rgba(8,10,12,.8)'; x.fillRect(0, row, S, 2);
      for (var k = 0; k < S; k += 32) {
        x.fillRect(k + off, row, 2, 16);
        x.fillStyle = 'hsl(220 6% ' + (13 + ((r() * 7) | 0)) + '%)'; x.fillRect(k + off + 2, row + 2, 30, 14);
        // granulado e telhas gastas/claras
        x.fillStyle = 'rgba(255,255,255,' + (r() * .06).toFixed(3) + ')'; x.fillRect(k + off + 2, row + 2, 30, 3);
        if (r() > .86) { x.fillStyle = 'rgba(60,80,50,.22)'; x.fillRect(k + off + 4, row + 6, 24, 9); }  // musgo
        x.fillStyle = 'rgba(8,10,12,.8)';
      }
    }
    stains(x, S, r, 4, '0,0,0', .16, 8, 18);
    speck(x, S, S, 900, .14);
  }), 10, 3);
}


// Parede: tinta lisa creme (simples e funcional), com textura de rolo bem sutil e uma junta de gesso quase invisivel.
export function wallTex() {
  return tex(tile('wall2', 256, function (x, S, r) {
    x.fillStyle = '#d4cab3'; x.fillRect(0, 0, S, S);
    for (var i = 0; i < 520; i++) {                                  // textura de rolo
      x.fillStyle = r() > .5 ? 'rgba(255,250,236,.07)' : 'rgba(110,94,66,.06)';
      wrapRect(x, S, (r() * S) | 0, (r() * S) | 0, 2 + ((r() * 3) | 0), 2);
    }
    x.fillStyle = 'rgba(90,76,54,.09)'; x.fillRect(0, 0, 1, S);       // junta de placa de gesso
    x.fillStyle = 'rgba(255,250,236,.08)'; x.fillRect(1, 0, 1, S);
    stains(x, S, r, 2, '255,250,236', .05, 12, 26);                  // variacao de tom suave
  }), 6, 3);
}

export function laminateTex() {
  return tex(tile('laminate', 256, function (x, S, r) {
    x.fillStyle = '#6d5138'; x.fillRect(0, 0, S, S);
    for (var i = 0; i < 90; i++) {
      x.globalAlpha = .08 + r() * .12; x.fillStyle = r() > .5 ? '#3a2a1c' : '#a67c4e';
      x.fillRect(0, (r() * S) | 0, S, 1 + ((r() * 2) | 0));
    }
    x.globalAlpha = 1;
    // tábuas horizontais com junta alternada e tom próprio
    for (var row = 0; row < S; row += 32) {
      x.fillStyle = r() > .5 ? 'rgba(200,150,100,' + (r() * .1).toFixed(3) + ')' : 'rgba(10,5,2,' + (r() * .16).toFixed(3) + ')';
      x.fillRect(0, row, S, 32);
      x.fillStyle = 'rgba(25,15,8,.6)'; x.fillRect(0, row, S, 1);
      x.fillStyle = 'rgba(255,220,170,.1)'; x.fillRect(0, row + 1, S, 1);
      var jx = (r() * S) | 0; x.fillStyle = 'rgba(25,15,8,.6)'; x.fillRect(jx, row, 1, 32);
    }
    x.fillStyle = 'rgba(25,15,8,.55)'; x.fillRect(0, 0, 1, S); x.fillRect(S / 2, 0, 1, S);
    // riscos de uso e nós
    for (var c = 0; c < 10; c++) crack(x, S, r, '210,170,120', .18, 6 + ((r() * 14) | 0));
    for (var n = 0; n < 4; n++) { var nx = (r() * S) | 0, ny = (r() * S) | 0; x.fillStyle = 'rgba(25,14,7,.5)'; wrapRect(x, S, nx, ny, 4, 3); }
    stains(x, S, r, 5, '15,10,6', .18, 5, 12);
    speck(x, S, S, 400, .08);
  }), 3, 1);
}

// Tampo do balcao: madeira escura lisa (nogueira), so com as juntas entre tabuas e um brilho leve de verniz.
export function counterTopTex() {
  return tex(tile('counter5', 128, function (x, S, r) {
    x.fillStyle = '#3d291a'; x.fillRect(0, 0, S, S);
    var rows = 4, rh = S / rows;
    for (var row = 0; row < rows; row++) {                           // so as juntas entre tabuas
      x.fillStyle = 'rgba(8,4,2,.5)'; x.fillRect(0, row * rh, S, 1);
    }
    x.fillStyle = 'rgba(255,225,185,.08)'; x.fillRect(0, 0, S, S * .5);   // brilho leve do verniz
  }), 4, 2);
}

// Frente do balcao: lambri cinza-ardosia liso, ripas verticais so com o friso, rodape escuro e moldura clara.
export function counterPanelTex() {
  return tex(tile('counterpanel4', 128, function (x, S) {
    var N = 8, pw = S / N;
    x.fillStyle = '#53585e'; x.fillRect(0, 0, S, S);
    for (var i = 0; i < N; i++) {
      x.fillStyle = 'rgba(8,10,14,.5)'; x.fillRect(i * pw, 0, 1, S);
    }
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, S * .86, S, S * .14);
    x.fillStyle = 'rgba(214,220,228,.2)'; x.fillRect(0, 0, S, 2);
  }), 4, 1);
}

// Madeira das prateleiras de fitas: nogueira melaminica escura e uniforme (combina com a testeira), so com veios finos e
// retos ao longo da tabua e poros discretos. Sem nos nem rabiscos: as faces sao esticadas e qualquer detalhe grande vira
// borrao. (A testeira continua com laminateTex.)
export function shelfWoodTex() {
  return tex(tile('shelfwood2', 256, function (x, S, r) {
    x.fillStyle = '#5c3f2a'; x.fillRect(0, 0, S, S);
    for (var i = 0; i < 120; i++) {                                   // veios finos e quase retos (tom claro ou escuro)
      var y = r() * S, dark = r() > .5;
      x.fillStyle = dark ? 'rgba(28,16,8,' + (.06 + r() * .1).toFixed(3) + ')' : 'rgba(176,128,86,' + (.04 + r() * .07).toFixed(3) + ')';
      x.fillRect(0, y, S, .5 + r() * 1.1);
    }
    for (var b = 0; b < 8; b++) {                                     // faixas largas de tom, bem suaves
      x.fillStyle = r() > .5 ? 'rgba(120,84,52,.07)' : 'rgba(20,10,4,.09)';
      x.fillRect(0, r() * S, S, 6 + r() * 22);
    }
    for (var p = 0; p < 90; p++) {                                    // poros
      x.fillStyle = 'rgba(20,10,4,' + (.12 + r() * .12).toFixed(3) + ')';
      wrapRect(x, S, (r() * S) | 0, (r() * S) | 0, 2 + ((r() * 6) | 0), 1);
    }
    x.fillStyle = 'rgba(200,150,105,.1)'; x.fillRect(0, 0, S, 2);      // bisel: borda clara em cima
    x.fillStyle = 'rgba(10,5,2,.28)'; x.fillRect(0, S - 2, S, 2);      // e escura embaixo
    speck(x, S, S, 220, .05);
  }), 2, 1);
}

export function ceilingTileTex() {
  return tex(tile('ceiling', 256, function (x, S, r) {
    x.fillStyle = '#d6d1c3'; x.fillRect(0, 0, S, S);
    speck(x, S, S, 800, .09);
    x.fillStyle = 'rgba(90,80,70,.14)';
    for (var i = 0; i < 40; i++) x.fillRect((r() * S) | 0, (r() * S) | 0, 2 + ((r() * 5) | 0), 1);
    // furinhos de forro acústico
    x.fillStyle = 'rgba(70,62,52,.3)';
    for (var h2 = 0; h2 < 110; h2++) x.fillRect((r() * S) | 0, (r() * S) | 0, 1, 1);
    stains(x, S, r, 3, '110,85,40', .14, 6, 12);
    stains(x, S, r, 1, '120,90,40', .2, 10, 16);    // mancha de goteira
    var h = S / 2;
    [0, h].forEach(function (p) {
      x.fillStyle = '#aaa597'; x.fillRect(p - 2, 0, 4, S); x.fillRect(0, p - 2, S, 4);
      x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(p + 1, 0, 1, S); x.fillRect(0, p + 1, S, 1);
      x.fillStyle = 'rgba(50,44,38,.5)'; x.fillRect(p - 3, 0, 1, S); x.fillRect(0, p - 3, S, 1);
    });
    x.fillStyle = '#aaa597'; x.fillRect(S - 2, 0, 2, S); x.fillRect(0, S - 2, S, 2);
    // sujeira acumulada junto aos perfis
    [0, h].forEach(function (p) {
      for (var q = 0; q < 24; q++) {
        x.fillStyle = 'rgba(70,60,48,.12)';
        wrapRect(x, S, (p + 4 + ((r() * 10) | 0)) % S, (r() * S) | 0, 1, 3 + ((r() * 8) | 0));
        wrapRect(x, S, (r() * S) | 0, (p + 4 + ((r() * 10) | 0)) % S, 3 + ((r() * 8) | 0), 1);
      }
    });
  }), 4, 6);
}

export function concreteTex() {
  return tex(tile('concrete', 256, function (x, S, r) {
    x.fillStyle = '#4b4f52'; x.fillRect(0, 0, S, S);
    // placas com tons ligeiramente diferentes
    [[0, 0], [S / 2, 0], [0, S / 2], [S / 2, S / 2]].forEach(function (p) {
      x.fillStyle = r() > .5 ? 'rgba(255,255,255,' + (r() * .05).toFixed(3) + ')' : 'rgba(0,0,0,' + (r() * .08).toFixed(3) + ')';
      x.fillRect(p[0], p[1], S / 2, S / 2);
    });
    stains(x, S, r, 10, '20,20,18', .16, 8, 20);
    stains(x, S, r, 6, '255,255,255', .05, 8, 16);
    stains(x, S, r, 3, '8,8,6', .3, 4, 9);          // óleo
    stains(x, S, r, 3, '90,100,60', .1, 6, 12);       // musgo/umidade
    // pedrinhas de agregado
    for (var g = 0; g < 160; g++) { x.fillStyle = r() > .5 ? 'rgba(150,150,145,.35)' : 'rgba(20,22,24,.4)'; wrapRect(x, S, (r() * S) | 0, (r() * S) | 0, 1 + ((r() * 2) | 0), 1 + ((r() * 2) | 0)); }
    for (var c = 0; c < 4; c++) crack(x, S, r, '8,8,8', .6, 20 + ((r() * 40) | 0));
    speck(x, S, S, 1800, .13);
    x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(0, 0, S, 2); x.fillRect(0, 0, 2, S); x.fillRect(S / 2, 0, 2, S);
    x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(0, 2, S, 1); x.fillRect(2, 0, 1, S);
  }), 14, 14);
}

export function brickTex() {
  return tex(tile('brick', 256, function (x, S, r) {
    x.fillStyle = '#2a2d33'; x.fillRect(0, 0, S, S);
    for (var row = 0; row < 8; row++) for (var k = -1; k < 5; k++) {
      var off = (row % 2) * 15;
      x.fillStyle = 'hsl(220 8% ' + (15 + ((r() * 8) | 0)) + '%)'; x.fillRect(k * 30 + off + 1, row * 16 + 1, 28, 14);
      if (r() > .8) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(k * 30 + off + 1, row * 16 + 1, 28, 14); }
      x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(k * 30 + off + 1, row * 16 + 1, 28, 1);
    }
    for (var c = 0; c < 4; c++) crack(x, S, r, '0,0,0', .5, 8 + ((r() * 18) | 0));
    stains(x, S, r, 5, '0,0,0', .2, 8, 18);
    stains(x, S, r, 3, '70,90,60', .1, 8, 16);
    speck(x, S, S, 500, .1);
  }), 4, 2);
}

// Aglomerado/MDF claro das prateleiras e móveis: grão fino + riscos, quase
// branco para o tint do material (color) continuar mandando na cor.
export function mdfTex() {
  return tex(tile('mdf', 64, function (x, S, r) {
    x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, S, S);
    for (var i = 0; i < 34; i++) { x.fillStyle = r() > .5 ? 'rgba(120,110,95,.09)' : 'rgba(255,255,255,.12)'; x.fillRect(0, (r() * S) | 0, S, 1); }
    for (var c = 0; c < 4; c++) crack(x, S, r, '90,80,70', .22, 5 + ((r() * 9) | 0));
    stains(x, S, r, 3, '90,80,60', .08, 3, 8);
    speck(x, S, S, 160, .08);
  }), 1, 1);
}

export function blockbusterSignCanvas() {
  var c = cv(1024, 256), x = c.getContext('2d');
  x.fillStyle = '#001b44';
  x.fillRect(0, 0, 1024, 256);
  x.strokeStyle = '#ffe800';
  x.lineWidth = 6;
  x.strokeRect(8, 8, 1008, 240);

  function draw3DText(txt, cx, cy, font) {
    x.font = font;
    x.textAlign = 'center';
    for (var d = 10; d > 0; d--) {
      x.fillStyle = (d > 5) ? '#000814' : '#002878';
      x.fillText(txt, cx + d, cy + d);
    }
    x.strokeStyle = '#00143a';
    x.lineWidth = 10;
    x.strokeText(txt, cx, cy);
    x.fillStyle = '#ffe800';
    x.fillText(txt, cx, cy);
    x.fillStyle = '#fff9a6';
    x.fillText(txt, cx, cy - 2);
    x.textAlign = 'start';
  }

  draw3DText('NET VIDEO', 512, 105, '900 92px "Helvetica Neue",Arial,sans-serif');
  draw3DText('RENTAL 2000', 512, 215, '900 115px "Helvetica Neue",Arial,sans-serif');

  speck(x, 1024, 256, 900, 0.06);
  return c;
}

// retro (4o parametro, opcional): true = paleta/selos do acervo retro; omitido, decide pelo titulo recebido.
export function placardCanvas(a, b, avatarImg, retro) {
  var W = 1024, H = 220;
  var c = cv(1024, 256), x = c.getContext('2d');
  x.scale(1, 256 / H); // authored on 1024x220, rasterised on a power-of-two canvas
  var isRetro = typeof retro === 'boolean' ? retro : String(a || '').toUpperCase() === TXT.titleRetro.toUpperCase();

  // Paleta de cores temática autêntica de locadora dos anos 90:
  // - LANÇAMENTOS: Azul Blockbuster Safira profundo + Dourado/Amarelo vibrante + Branco
  // - ACERVO RETRÔ: Borgonha Deluxe / Vinho escuro + Ouro Envelhecido / Âmbar + Marfim
  var bgTop = isRetro ? '#26050e' : '#041633';
  var bgMid = isRetro ? '#4a0f1e' : '#0c2c5c';
  var bgBot = isRetro ? '#1c0309' : '#051836';
  var goldMain = isRetro ? '#e5ad4b' : '#ffd000';
  var goldLight = isRetro ? '#fff3d1' : '#fff754';
  var goldDark = isRetro ? '#b87c26' : '#cc9900';
  var subTextColor = isRetro ? '#ffd8a8' : '#7ecbff';
  var shadowColor = isRetro ? '#120104' : '#020b17';

  var bgGrad = x.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, bgTop);
  bgGrad.addColorStop(0.5, bgMid);
  bgGrad.addColorStop(1, bgBot);
  x.fillStyle = bgGrad;
  x.fillRect(0, 0, W, H);

  x.save();
  x.strokeStyle = 'rgba(255,255,255,0.028)';
  x.lineWidth = 1.5;
  for (var px = -H; px < W + H; px += 22) {
    x.beginPath();
    x.moveTo(px, 0);
    x.lineTo(px + H, H);
    x.stroke();
  }
  x.restore();

  x.fillStyle = goldMain;
  x.fillRect(0, 0, W, 10);
  x.fillStyle = goldLight;
  x.fillRect(0, 1, W, 2);
  x.fillStyle = shadowColor;
  x.fillRect(0, 10, W, 2);

  x.fillStyle = shadowColor;
  x.fillRect(0, H - 12, W, 2);
  x.fillStyle = goldMain;
  x.fillRect(0, H - 10, W, 10);
  x.fillStyle = goldDark;
  x.fillRect(0, H - 2, W, 2);

  x.strokeStyle = goldMain;
  x.lineWidth = 2;
  x.strokeRect(8, 16, W - 16, H - 32);

  x.strokeStyle = 'rgba(255,255,255,0.15)';
  x.lineWidth = 1;
  x.strokeRect(11, 19, W - 22, H - 38);

  var cornerSz = 14;
  [[12, 20], [W - 12 - cornerSz, 20], [12, H - 20 - cornerSz], [W - 12 - cornerSz, H - 20 - cornerSz]].forEach(function(pos) {
    x.fillStyle = goldMain;
    x.fillRect(pos[0], pos[1], cornerSz, cornerSz);
    x.fillStyle = shadowColor;
    x.fillRect(pos[0] + 3, pos[1] + 3, cornerSz - 6, cornerSz - 6);
  });

  var avCenterX = 92, avCenterY = H / 2, avRadius = 64;

  x.save();
  x.beginPath();
  x.arc(avCenterX, avCenterY, avRadius + 5, 0, Math.PI * 2);
  x.fillStyle = 'rgba(0,0,0,0.6)';
  x.fill();

  x.beginPath();
  x.arc(avCenterX, avCenterY, avRadius, 0, Math.PI * 2);
  x.fillStyle = goldMain;
  x.fill();

  x.beginPath();
  x.arc(avCenterX, avCenterY, avRadius - 4, 0, Math.PI * 2);
  x.fillStyle = shadowColor;
  x.fill();

  x.beginPath();
  x.arc(avCenterX, avCenterY, avRadius - 7, 0, Math.PI * 2);
  x.fillStyle = '#ffffff';
  x.fill();
  x.clip();

  if (avatarImg) {
    coverImg(x, avatarImg, avCenterX - (avRadius - 7), avCenterY - (avRadius - 7), (avRadius - 7) * 2, (avRadius - 7) * 2);
  } else {
    x.fillStyle = isRetro ? '#380a14' : '#081d3d';
    x.fillRect(avCenterX - 60, avCenterY - 60, 120, 120);
    x.fillStyle = goldMain;
    x.font = '900 42px "Helvetica Neue",Arial,sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(TXT.placardNoAvatar, avCenterX, avCenterY);
    x.textAlign = 'start';
    x.textBaseline = 'alphabetic';
  }
  x.restore();

  x.beginPath();
  x.arc(avCenterX, avCenterY, avRadius - 7, 0, Math.PI * 2);
  x.strokeStyle = goldLight;
  x.lineWidth = 2.5;
  x.stroke();

  var sealCenterX = W - 98, sealCenterY = H / 2, sealRadius = 58;
  x.save();
  x.beginPath();
  x.arc(sealCenterX, sealCenterY, sealRadius + 4, 0, Math.PI * 2);
  x.fillStyle = 'rgba(0,0,0,0.5)';
  x.fill();

  x.beginPath();
  x.arc(sealCenterX, sealCenterY, sealRadius, 0, Math.PI * 2);
  x.fillStyle = 'rgba(0,0,0,0.55)';
  x.fill();
  x.strokeStyle = goldMain;
  x.lineWidth = 3.5;
  x.stroke();

  x.beginPath();
  x.arc(sealCenterX, sealCenterY, sealRadius - 7, 0, Math.PI * 2);
  x.strokeStyle = goldLight;
  x.lineWidth = 1.5;
  x.setLineDash([4, 3]);
  x.stroke();
  x.setLineDash([]);

  x.textAlign = 'center';
  x.fillStyle = goldLight;
  x.font = '700 11px "Helvetica Neue",Arial,sans-serif';
  x.fillText(isRetro ? TXT.sealRetro1 : TXT.seal1, sealCenterX, sealCenterY - 22);

  x.fillStyle = '#ffffff';
  x.font = '900 18px "Impact",Arial,sans-serif';
  x.fillText(isRetro ? TXT.sealRetro2 : TXT.seal2, sealCenterX, sealCenterY + 1);

  x.fillStyle = goldMain;
  x.font = '700 11px "Helvetica Neue",Arial,sans-serif';
  x.fillText(isRetro ? TXT.sealRetro3 : TXT.seal3, sealCenterX, sealCenterY + 22);
  x.textAlign = 'start';
  x.restore();

  var textStartX = 188;
  var maxTextWidth = W - textStartX - 190;

  var tagText = isRetro
    ? TXT.tagRetro
    : TXT.tagNew;
  x.save();
  x.font = '800 12px "Helvetica Neue",Arial,sans-serif';
  var tagMetrics = x.measureText(tagText);
  var tagW = Math.min(tagMetrics.width + 24, maxTextWidth);
  var tagH = 22;
  var tagY = 28;

  x.fillStyle = 'rgba(0,0,0,0.45)';
  x.beginPath();
  if (x.roundRect) {
    x.roundRect(textStartX, tagY, tagW, tagH, 6);
  } else {
    x.rect(textStartX, tagY, tagW, tagH);
  }
  x.fill();
  x.strokeStyle = goldMain;
  x.lineWidth = 1.2;
  x.stroke();

  x.fillStyle = goldLight;
  x.fillText(tagText, textStartX + 12, tagY + 15);
  x.restore();

  var titleText = String(a || (isRetro ? TXT.titleRetro : TXT.titleNew)).toUpperCase();
  var titleFontSize = 48;
  x.font = '900 ' + titleFontSize + 'px "Impact","Arial Black",sans-serif';

  while (x.measureText(titleText).width > maxTextWidth && titleFontSize > 28) {
    titleFontSize -= 2;
    x.font = '900 ' + titleFontSize + 'px "Impact","Arial Black",sans-serif';
  }

  var titleY = 110;

  x.fillStyle = shadowColor;
  x.fillText(titleText, textStartX + 3, titleY + 4);
  x.fillStyle = 'rgba(0,0,0,0.8)';
  x.fillText(titleText, textStartX + 2, titleY + 2);

  var textGrad = x.createLinearGradient(0, titleY - titleFontSize, 0, titleY);
  textGrad.addColorStop(0, goldLight);
  textGrad.addColorStop(0.55, goldMain);
  textGrad.addColorStop(1, goldDark);
  x.fillStyle = textGrad;
  x.fillText(titleText, textStartX, titleY);

  x.strokeStyle = 'rgba(255,255,255,0.7)';
  x.lineWidth = 1;
  x.strokeText(titleText, textStartX, titleY);

  var rawHandle = String(b || TXT.defaultHandle);
  var channelName = rawHandle.replace(/^@/, '');
  var subText = TXT.sectionOfficial + channelName.toUpperCase();

  var subY = 142;
  x.save();
  x.font = '700 18px "Helvetica Neue",Arial,sans-serif';
  var subW = Math.min(x.measureText(subText).width + 24, maxTextWidth);
  var subH = 30;

  x.fillStyle = 'rgba(0, 0, 0, 0.40)';
  x.beginPath();
  if (x.roundRect) {
    x.roundRect(textStartX, subY, subW, subH, 4);
  } else {
    x.rect(textStartX, subY, subW, subH);
  }
  x.fill();
  x.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  x.lineWidth = 1;
  x.stroke();

  x.fillStyle = '#ffffff';
  x.fillText(TXT.sectionOfficial, textStartX + 10, subY + 21);
  var offsetPrefix = x.measureText(TXT.sectionOfficial).width;
  x.fillStyle = subTextColor;
  x.font = '800 18px "Helvetica Neue",Arial,sans-serif';
  x.fillText(channelName.toUpperCase(), textStartX + 10 + offsetPrefix, subY + 21);
  x.restore();

  x.fillStyle = goldMain;
  x.fillRect(textStartX, 184, Math.min(220, maxTextWidth * 0.4), 3);
  x.fillStyle = goldLight;
  x.fillRect(textStartX, 184, 45, 3);

  var sheen = x.createLinearGradient(0, 0, 0, 90);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  x.fillStyle = sheen;
  x.fillRect(0, 0, W, 90);

  speck(x, W, H, 350, 0.02);

  return c;
}

export function bannerCanvas(bannerImg, title) {
  var W = 1024, H = 288;
  var c = cv(1024, 256), x = c.getContext('2d');
  x.scale(1, 256 / H); // authored on 1024x288, rasterised on a power-of-two canvas
  x.fillStyle = '#0a171d';
  x.fillRect(0, 0, W, H);

  if (bannerImg) {
    coverImg(x, bannerImg, 8, 8, W - 16, H - 16);
    x.fillStyle = 'rgba(235, 215, 175, 0.10)';
    x.fillRect(8, 8, W - 16, H - 16);
  } else {
    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f0518');
    g.addColorStop(0.5, '#240a3f');
    g.addColorStop(1, '#08171e');
    x.fillStyle = g;
    x.fillRect(8, 8, W - 16, H - 16);

    x.fillStyle = '#ff1d58';
    x.beginPath();
    x.arc(W / 2, H / 2 + 20, 100, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#240a3f';
    for (var i = 0; i < 5; i++) {
      x.fillRect(W / 2 - 110, H / 2 + 20 + i * 15, 220, 4 + i * 2);
    }

    x.strokeStyle = 'rgba(55,226,255,0.4)';
    x.lineWidth = 2;
    x.beginPath();
    for (var i = -W; i < W * 2; i += 60) {
      x.moveTo(W / 2, H / 2 + 20); x.lineTo(i, H);
    }
    x.stroke();
    for (var j = 0; j < 5; j++) {
      var jy = H / 2 + 20 + j * 20 + (j * j * 1.5);
      if (jy < H) {
        x.beginPath(); x.moveTo(8, jy); x.lineTo(W - 8, jy); x.stroke();
      }
    }

    x.fillStyle = '#ffffff';
    x.font = '900 68px "Helvetica Neue",Arial,sans-serif';
    x.textAlign = 'center';
    x.shadowColor = '#ff2d78';
    x.shadowBlur = 15;
    fitFont(x, title || TXT.bannerDefault, W - 100, 68, function (px) { return '900 ' + px + 'px "Helvetica Neue",Arial,sans-serif'; }, 20);
    x.fillText(title || TXT.bannerDefault, W / 2, 114);
    x.shadowBlur = 0;

    x.fillStyle = '#37e2ff';
    x.font = '700 24px "Courier New",monospace';
    x.fillText(TXT.bannerTagline, W / 2, 230);
    x.textAlign = 'start';
  }

  x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(8, H / 2); x.lineTo(W - 8, H / 2); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.12)';
  x.beginPath(); x.moveTo(8, H / 2 + 2); x.lineTo(W - 8, H / 2 + 2); x.stroke();

  function grommet(gx, gy) {
    x.beginPath(); x.arc(gx, gy, 8, 0, 6.3);
    x.fillStyle = '#9e8c68'; x.fill();
    x.beginPath(); x.arc(gx, gy, 4, 0, 6.3);
    x.fillStyle = '#111'; x.fill();
  }
  for (var gx = 24; gx <= W - 24; gx += (W - 48) / 4) {
    grommet(gx, 16);
    grommet(gx, H - 16);
  }

  speck(x, W, H, 2400, 0.06);

  x.strokeStyle = '#1b2226'; x.lineWidth = 8;
  x.strokeRect(4, 4, W - 8, H - 8);
  x.strokeStyle = '#ffd700'; x.lineWidth = 2.5;
  x.strokeRect(10, 10, W - 20, H - 20);

  return c;
}

export function digitalLedClockCanvas(existingCanvas, date, showColon) {
  var W = 256, H = 128;
  var c = existingCanvas || cv(W, H), x = c.getContext('2d');
  var d = date || new Date();
  if (showColon === undefined) showColon = true;

  x.fillStyle = '#0e0204';
  x.fillRect(0, 0, W, H);

  x.fillStyle = 'rgba(255, 0, 20, 0.025)';
  for (var sy = 0; sy < H; sy += 2) {
    x.fillRect(0, sy, W, 1);
  }

  x.strokeStyle = 'rgba(40, 5, 8, 0.8)';
  x.lineWidth = 4;
  x.strokeRect(6, 6, W - 12, H - 12);

  var WEEKDAYS = TXT.weekdaysShort;
  var MONTHS = TXT.monthsShort;
  var wDay = WEEKDAYS[d.getDay()];
  var dayNum = (d.getDate() < 10 ? '0' : '') + d.getDate();
  var mName = MONTHS[d.getMonth()];
  var dateStr = wDay + ' · ' + dayNum + ' ' + mName;

  x.fillStyle = 'rgba(255, 160, 160, 0.35)';
  x.font = '600 7px "Courier New", monospace';
  x.textAlign = 'left';
  x.fillText(TXT.ledQuartz, 22, 23);
  x.textAlign = 'right';
  x.fillText(TXT.ledDate, W - 22, 23);

  x.save();
  x.font = '800 13px "Lucida Console", "Courier New", monospace';
  x.textAlign = 'center';
  x.fillStyle = 'rgba(70, 8, 12, 0.30)';
  x.fillText('888 · 88 888', W / 2, 23);
  x.shadowColor = '#ff1122';
  x.shadowBlur = 8;
  x.fillStyle = '#ff283b';
  x.fillText(dateStr, W / 2, 23);
  x.restore();

  x.strokeStyle = 'rgba(60, 6, 10, 0.7)';
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(18, 33);
  x.lineTo(W - 18, 33);
  x.stroke();

  var SEGMENTS = {
    '0': [1,1,1,1,1,1,0],
    '1': [0,1,1,0,0,0,0],
    '2': [1,1,0,1,1,0,1],
    '3': [1,1,1,1,0,0,1],
    '4': [0,1,1,0,0,1,1],
    '5': [1,0,1,1,0,1,1],
    '6': [1,0,1,1,1,1,1],
    '7': [1,1,1,0,0,0,0],
    '8': [1,1,1,1,1,1,1],
    '9': [1,1,1,1,0,1,1]
  };

  var hrs = d.getHours();
  var mins = d.getMinutes();
  var hStr = (hrs < 10 ? '0' : '') + hrs;
  var mStr = (mins < 10 ? '0' : '') + mins;
  var digits = [hStr[0], hStr[1], mStr[0], mStr[1]];

  var dw = 34, dh = 64, th = 6, gap = 2;
  var halfH = dh / 2;
  var startX = 32, startY = 42;
  var digitPositions = [startX, startX + 44, startX + 114, startX + 158];

  function drawDigit(numChar, dx, dy) {
    var segs = SEGMENTS[numChar] || SEGMENTS['8'];
    x.save();
    x.transform(1, 0, -0.07, 1, dx, dy);

    for (var s = 0; s < 7; s++) {
      var lit = segs[s] === 1;
      if (lit) {
        x.shadowColor = '#ff1122';
        x.shadowBlur = 10;
        x.fillStyle = '#ff2233';
      } else {
        x.shadowColor = 'transparent';
        x.shadowBlur = 0;
        x.fillStyle = 'rgba(70, 8, 12, 0.28)'; // Segmento apagado visível no fundo
      }

      var sx = 0, sy = 0, sw = 0, sh = 0;
      if (s === 0) { // a: topo
        sx = th + gap; sy = 0; sw = dw - 2 * th - 2 * gap; sh = th;
      } else if (s === 1) { // b: vertical superior direito
        sx = dw - th; sy = th + gap; sw = th; sh = halfH - th - 2 * gap;
      } else if (s === 2) { // c: vertical inferior direito
        sx = dw - th; sy = halfH + gap; sw = th; sh = halfH - th - 2 * gap;
      } else if (s === 3) { // d: base
        sx = th + gap; sy = dh - th; sw = dw - 2 * th - 2 * gap; sh = th;
      } else if (s === 4) { // e: vertical inferior esquerdo
        sx = 0; sy = halfH + gap; sw = th; sh = halfH - th - 2 * gap;
      } else if (s === 5) { // f: vertical superior esquerdo
        sx = 0; sy = th + gap; sw = th; sh = halfH - th - 2 * gap;
      } else if (s === 6) { // g: meio
        sx = th + gap; sy = halfH - th / 2; sw = dw - 2 * th - 2 * gap; sh = th;
      }
      x.fillRect(sx, sy, sw, sh);
    }
    x.restore();
  }

  for (var i = 0; i < 4; i++) {
    drawDigit(digits[i], digitPositions[i], startY);
  }

  x.save();
  x.transform(1, 0, -0.07, 1, startX + 90, startY);
  if (showColon) {
    x.shadowColor = '#ff1122';
    x.shadowBlur = 10;
    x.fillStyle = '#ff2233';
  } else {
    x.shadowColor = 'transparent';
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(70, 8, 12, 0.28)';
  }
  x.fillRect(0, 18, 6, 6);
  x.fillRect(0, 42, 6, 6);
  x.restore();

  if (hrs >= 12) {
    x.save();
    x.shadowColor = '#ff1122';
    x.shadowBlur = 8;
    x.fillStyle = '#ff2233';
    x.beginPath();
    x.arc(startX + 12, startY + dh - 4, 3, 0, Math.PI * 2);
    x.fill();
    x.restore();
    x.fillStyle = 'rgba(255, 180, 180, 0.45)';
    x.font = '700 7px "Courier New", monospace';
    x.fillText('PM', startX + 17, startY + dh - 1);
  }

  return c;
}

export function wallCalendarCanvas(existingCanvas, date) {
  var W = 512, H = 640;
  var c = existingCanvas || cv(W, H), x = c.getContext('2d');
  var d = date || new Date();

  var dayNum = d.getDate();
  var monthIdx = d.getMonth();
  var year = d.getFullYear();
  var dayOfWeekIdx = d.getDay();

  var WEEKDAYS_PT = TXT.weekdaysLong;
  var MONTHS_PT = TXT.monthsLong;

  var startOfYear = new Date(year, 0, 1);
  var dayOfYear = Math.floor((d - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
  var isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  var totalDaysYear = isLeap ? 366 : 365;
  var daysRemaining = totalDaysYear - dayOfYear;

  var strDayOfYear = (dayOfYear < 100 ? (dayOfYear < 10 ? '00' : '0') : '') + dayOfYear;
  var strDaysRemaining = (daysRemaining < 100 ? (daysRemaining < 10 ? '00' : '0') : '') + daysRemaining;

  var oneJan = new Date(year, 0, 1);
  var numberOfDays = Math.floor((d - oneJan) / (24 * 60 * 60 * 1000));
  var weekNum = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);

  x.clearRect(0, 0, W, H);

  function roundRect(ctx, rx, ry, rw, rh, r) {
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
    ctx.lineTo(rx + rw, ry + rh - r);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();
  }

  x.fillStyle = '#1c1e22';
  roundRect(x, 10, 10, W - 20, H - 20, 18);
  x.fill();
  x.strokeStyle = '#2d3036';
  x.lineWidth = 3;
  x.stroke();

  x.beginPath();
  x.arc(W / 2, 34, 11, 0, Math.PI * 2);
  x.fillStyle = '#0d0e10';
  x.fill();
  x.strokeStyle = '#363940';
  x.lineWidth = 2.5;
  x.stroke();

  x.fillStyle = '#dcdfe3';
  x.font = '900 68px "Arial Black", "Impact", "Helvetica Neue", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(TXT.calTodayIs, W / 2, 88);

  var padX = 24, padY = 138, padW = W - 48, padH = H - 162;

  x.fillStyle = '#0a0b0d';
  roundRect(x, padX + 2, padY + 4, padW, padH, 10);
  x.fill();
  x.fillStyle = '#e2dfd9';
  roundRect(x, padX + 1, padY + 2, padW, padH, 10);
  x.fill();
  x.fillStyle = '#faf8f5';
  roundRect(x, padX, padY, padW, padH, 10);
  x.fill();

  x.fillStyle = 'rgba(0,0,0,0.015)';
  for (var py = padY; py < padY + padH; py += 3) {
    x.fillRect(padX, py, padW, 1);
  }

  function drawPin(px, py) {
    x.beginPath();
    x.arc(px, py + 2, 13, 0, Math.PI * 2);
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.fill();
    var grad = x.createRadialGradient(px - 4, py - 4, 2, px, py, 13);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#ebe9e4');
    grad.addColorStop(1, '#cfccc4');
    x.beginPath();
    x.arc(px, py, 12, 0, Math.PI * 2);
    x.fillStyle = grad;
    x.fill();
    x.strokeStyle = '#bab7ad';
    x.lineWidth = 1.5;
    x.stroke();
  }
  drawPin(padX + 28, padY + 28);
  drawPin(padX + padW - 28, padY + 28);

  var numStr = String(dayNum);
  x.font = '900 178px "Arial Black", "Impact", "Helvetica", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  var numY = padY + 112;

  x.fillStyle = '#d4d2cc';
  x.fillText(numStr, W / 2 + 8, numY + 8);
  x.fillStyle = '#080808';
  x.fillText(numStr, W / 2, numY);

  x.font = '800 11px "Helvetica Neue", Arial, sans-serif';
  x.fillStyle = '#1c1c1c';
  x.fillText(TXT.calBrand, W / 2, padY + 208);

  var lineY = padY + 222;
  x.strokeStyle = '#080808';
  x.lineWidth = 2.5;
  x.beginPath();
  x.moveTo(padX + 16, lineY);
  x.lineTo(padX + padW - 16, lineY);
  x.stroke();

  x.font = '800 14px "Arial Black", monospace, sans-serif';
  x.fillStyle = '#111';
  x.textAlign = 'left';
  x.fillText(strDayOfYear, padX + 16, lineY - 8);
  x.textAlign = 'right';
  x.fillText(strDaysRemaining, padX + padW - 16, lineY - 8);

  var colLeftX = padX + 18;
  x.textAlign = 'left';
  x.fillStyle = '#080808';
  x.font = '900 29px "Arial Black", "Helvetica", sans-serif';
  x.fillText(WEEKDAYS_PT[dayOfWeekIdx], colLeftX, lineY + 36);

  x.font = '900 27px "Arial Black", "Helvetica", sans-serif';
  x.fillText(MONTHS_PT[monthIdx], colLeftX, lineY + 70);

  x.font = '900 38px "Arial Black", "Helvetica", sans-serif';
  x.fillText(String(year), colLeftX, lineY + 116);

  var daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  x.font = '700 10.5px "Helvetica Neue", Arial, sans-serif';
  x.fillStyle = '#555';
  x.fillText(TXT.calWeekDays(weekNum, daysInMonth), colLeftX, lineY + 138);

  var miniX = padX + padW - 180;
  var miniY = lineY + 14;
  var miniW = 164;
  var miniH = 132;

  x.fillStyle = '#f2efe9';
  roundRect(x, miniX, miniY, miniW, miniH, 6);
  x.fill();
  x.strokeStyle = '#dcd8ce';
  x.lineWidth = 1;
  x.stroke();

  x.fillStyle = '#1a1a1a';
  x.font = '800 10.5px "Arial Black", sans-serif';
  x.textAlign = 'center';
  x.fillText(MONTHS_PT[monthIdx].toUpperCase() + ' ' + year, miniX + miniW / 2, miniY + 15);

  var headers = TXT.weekdayInitials;
  var colW = miniW / 7;
  x.font = '700 9px "Arial", sans-serif';
  for (var hi = 0; hi < 7; hi++) {
    var wd = (hi + TXT.weekStart) % 7;
    x.fillStyle = (wd === 0 || wd === 6) ? '#b32424' : '#444';
    x.fillText(headers[wd], miniX + hi * colW + colW / 2, miniY + 30);
  }

  x.strokeStyle = '#ccc7bb';
  x.lineWidth = 0.8;
  x.beginPath();
  x.moveTo(miniX + 6, miniY + 35);
  x.lineTo(miniX + miniW - 6, miniY + 35);
  x.stroke();

  var firstDayOfMonth = (new Date(year, monthIdx, 1).getDay() - TXT.weekStart + 7) % 7;
  x.font = '700 9.5px "Arial", sans-serif';

  for (var day = 1; day <= daysInMonth; day++) {
    var curCol = (firstDayOfMonth + day - 1) % 7;
    var curRow = Math.floor((firstDayOfMonth + day - 1) / 7);
    var cellCenterX = miniX + curCol * colW + colW / 2;
    var cellCenterY = miniY + 46 + curRow * 15;

    if (day === dayNum) {
      x.fillStyle = '#d32f2f';
      x.beginPath();
      x.arc(cellCenterX, cellCenterY - 0.5, 7, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#ffffff';
      x.fillText(String(day), cellCenterX, cellCenterY + 3);
    } else {
      x.fillStyle = (((curCol + TXT.weekStart) % 7) === 0 || ((curCol + TXT.weekStart) % 7) === 6) ? '#a03030' : '#222';
      x.fillText(String(day), cellCenterX, cellCenterY + 3);
    }
  }

  return c;
}

// Tela do fliperama ainda sem jogo carregado: um CRT apagado (vidro escuro com um brilho fraco no centro).
// O jogo de verdade aparece pelo iframe do emulador assim que alguem senta pela primeira vez.
export function arcadeScreenCanvas() {
  var c = cv(128, 128), x = c.getContext('2d');
  x.fillStyle = '#05070a';
  x.fillRect(0, 0, 128, 128);
  var g = x.createRadialGradient(64, 64, 4, 64, 64, 80);
  g.addColorStop(0, 'rgba(60,80,95,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(0,0,0,0.25)';
  for (var y = 0; y < 128; y += 3) x.fillRect(0, y, 128, 1);   // linhas do tubo
  return c;
}

export function arcadeOutOfOrderCanvas() {
  var c = cv(256, 256), x = c.getContext('2d');
  x.fillStyle = '#080a10';
  x.fillRect(0, 0, 256, 256);

  var pad = 60; // Diminui o cartaz
  x.fillStyle = 'rgba(0,0,0,0.45)';
  x.fillRect(pad + 4, pad + 6, 256 - pad * 2, 256 - pad * 2);

  x.fillStyle = '#f4eedb';
  x.fillRect(pad, pad, 256 - pad * 2, 256 - pad * 2);

  x.fillStyle = 'rgba(130, 110, 80, 0.15)';
  for (let i=0; i<25; i++) {
     x.beginPath();
     x.arc(pad + hash(i*3.1+1)*(256-pad*2), pad + hash(i*5.3+2)*(256-pad*2), hash(i*7.7+3)*12, 0, Math.PI*2);
     x.fill();
  }

  drawTape(x, pad + 6, pad + 6, -0.65, 36, 12, .9);
  drawTape(x, 256 - pad - 6, pad + 6, 0.65, 36, 12, .9);
  drawTape(x, pad + 6, 256 - pad - 6, 0.65, 36, 12, .9);
  drawTape(x, 256 - pad - 6, 256 - pad - 6, -0.65, 36, 12, .9);

  x.strokeStyle = 'rgba(196, 32, 32, 0.8)';
  x.lineWidth = 2.5;
  x.strokeRect(pad + 8, pad + 8, 256 - pad * 2 - 16, 256 - pad * 2 - 16);

  x.textAlign = 'center';
  x.fillStyle = '#b01010';
  x.font = '14px sans-serif';
  x.fillText('☠️', 128, pad + 30);

  x.font = '900 13px "Arial Black", Impact, sans-serif';
  x.fillText(TXT.maintenance1, 128, pad + 52);
  x.fillText(TXT.maintenance2, 128, pad + 68);

  x.fillStyle = '#111';
  x.font = '700 11px "Courier New", monospace';
  x.fillText(TXT.comeBack1, 128, pad + 94);
  x.fillText(TXT.comeBack2, 128, pad + 108);

  speck(x, 256, 256, 1500, 0.15);
  return c;
}

export function terminalScreenCanvas() {
  var c = cv(256, 192), x = c.getContext('2d');
  x.fillStyle = '#061a10'; x.fillRect(0, 0, 256, 192);

  x.fillStyle = 'rgba(0,0,0,0.35)';
  for (var y = 0; y < 192; y += 3) {
    x.fillRect(0, y, 256, 1);
  }

  x.shadowColor = '#00ff66';
  x.shadowBlur = 4;
  x.fillStyle = '#22ff77';
  x.font = '700 11px "Courier New",monospace';
  x.fillText('RENTAL-OS v1.996 [COM1 READY]', 12, 22);
  x.fillText('==============================', 12, 34);
  x.fillStyle = '#10cc55';
  x.font = '600 9.5px "Courier New",monospace';
  x.fillText(TXT.termCredits, 12, 48);
  x.fillText(TXT.termCredits1, 12, 62);
  x.fillText(TXT.termCredits2, 12, 76);
  x.fillText(TXT.termCredits3, 12, 90);
  x.fillText('------------------------------', 12, 104);
  x.fillStyle = '#33ff88';
  x.font = '700 10px "Courier New",monospace';
  x.fillText(TXT.termPrompt, 12, 122);

  x.fillStyle = '#33ff88';
  x.fillRect(12, 134, 8, 12);
  x.shadowBlur = 0;

  var g = x.createRadialGradient(128, 96, 60, 128, 96, 135);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 192);

  x.strokeStyle = 'rgba(0,255,100,0.25)';
  x.lineWidth = 4;
  x.strokeRect(2, 2, 252, 188);

  return c;
}

// Verso branco de papel cartão com fita adesiva nas 4 quinas
export function posterBackCanvas() {
  var W = 256, H = 512;
  var c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#f3efe6';
  x.fillRect(0, 0, W, H);

  // Sutil mancha de cola e desgaste
  x.fillStyle = 'rgba(0,0,0,0.03)';
  x.fillRect(10, 10, W - 20, H - 20);

  speck(x, W, H, 1400, 0.05);

  // 4 pedaços de fita adesiva transparente nas quinas
  drawTape(x, 18, 18, Math.PI / 4, 44, 20, .55, 'rgba(255,255,255,.35)');
  drawTape(x, W - 18, 18, -Math.PI / 4, 44, 20, .55, 'rgba(255,255,255,.35)');
  drawTape(x, 18, H - 18, -Math.PI / 4, 44, 20, .55, 'rgba(255,255,255,.35)');
  drawTape(x, W - 18, H - 18, Math.PI / 4, 44, 20, .55, 'rgba(255,255,255,.35)');

  return c;
}

