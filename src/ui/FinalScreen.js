// Tela final do HUNT (FINAL_GAME_DESIGN.md, secoes 11 e 12.4). Overlay DOM em tela cheia no estilo do HUD
// (painel escuro, acento dourado), montado na primeira abertura e reaproveitado:
//   - resultado do HUNT + tempo total da sessao;
//   - tabela de conquistas (Achievements.mountAchievementList(host, true): obtidas com mm:ss, nao obtidas com o nome
//     embaralhado e animado, CHEATER no fim so se obtido);
//   - o canal que o jogador estava assistindo (S.channelMeta: avatar, nome, link);
//   - creditos rolando: o MESMO conteudo da aba CREDITOS do terminal (env.renderCredits() preenche o painel e ele
//     e copiado sem os ids). Rolagem automatica; clique, roda do mouse, toque ou E pulam para o fim;
//   - COMPARTILHAR (Web Share API; sem ela, copia texto + link para a area de transferencia);
//   - RECOMECAR: fecha, desmonta tudo e chama onClose (main.js: returnToTitle({newGame:true})).
// Textos visiveis em TXT; frases com placeholders {x} e formas de plural (zero/one/other), sem concatenacao.
import { S } from '../core/State.js';
import { t } from '../i18n/index.js';
import { SESSION } from '../core/World.js';
import { mountAchievementList, unmountAchievementList, mmss } from '../core/Achievements.js';
import { TOUCH } from './UIManager.js';

export var TXT = {
  titles: {
    win: t('scn.final.title.win'),
    ammo: t('scn.final.title.ammo'),
    escaped: t('scn.final.title.escaped'),
    quit: t('scn.final.title.quit')
  },
  result: {
    zero: t('scn.final.result.zero'),
    one: t('scn.final.result.one'),
    other: t('scn.final.result.other')
  },
  time: t('scn.final.time'),
  achTitle: t('scn.final.achTitle'),
  channelTitle: t('scn.final.channelTitle'),
  channelOpen: t('scn.final.channelOpen'),
  channelNone: t('scn.final.channelNone'),
  creditsTitle: t('scn.final.creditsTitle'),
  skip: t('scn.final.skip'),
  skipTouch: t('scn.final.skipTouch'),
  share: t('scn.final.share'),
  copied: t('scn.final.copied'),
  copyFail: t('scn.final.copyFail'),
  restart: t('scn.final.restart'),
  shareTitle: 'Net Video Rental 2000',
  shareText: {
    zero: t('scn.final.shareText.zero'),
    one: t('scn.final.shareText.one'),
    other: t('scn.final.shareText.other')
  },
  clipboard: '{text}\n{url}'
};

var CREDITS_SPEED = 26;   // px/s

function fmt(str, vars) { return String(str).replace(/\{(\w+)\}/g, function(m, k) { return vars[k] != null ? vars[k] : m; }); }
function plural(forms, n) { return n === 0 && forms.zero ? forms.zero : n === 1 ? forms.one : forms.other; }
function sessionTime() {
  if (SESSION.sessionStart == null) return mmss(0);
  return mmss(Math.max(0, Math.round((performance.now() - SESSION.sessionStart) / 1000)));
}

var root = null, els = {}, open = false, opts = null, score = null, timeStr = '';
var rollRaf = 0, rollAuto = false, rollLast = 0, rollPos = 0, shareResetT = 0;

function build() {
  if (root) return;
  root = document.createElement('div');
  root.id = 'final-screen';
  root.innerHTML =
    '<div class="fs-wrap">' +
      '<header class="fs-head"><div class="fs-title"></div><div class="fs-result"></div><div class="fs-time"></div></header>' +
      '<div class="fs-grid">' +
        '<section class="fs-col fs-left">' +
          '<div class="fs-panel fs-channel"><div class="fs-h fs-channel-h"></div>' +
            '<div class="fs-ch-row"><img class="fs-avatar" alt=""><div class="fs-ch-info"><div class="fs-ch-name"></div>' +
            '<a class="fs-ch-link" target="_blank" rel="noopener"></a></div></div></div>' +
          '<div class="fs-panel fs-ach"><div class="fs-h fs-ach-h"></div><div class="fs-ach-list"></div></div>' +
        '</section>' +
        '<section class="fs-col fs-right">' +
          '<div class="fs-panel fs-credits-panel"><div class="fs-h fs-cred-h"><span class="fs-cred-t"></span><button class="fs-skip"></button></div>' +
            '<div class="fs-credits"><div class="fs-roll"></div></div></div>' +
        '</section>' +
      '</div>' +
      '<footer class="fs-foot"><button class="fs-btn fs-share"></button><button class="fs-btn fs-restart"></button></footer>' +
    '</div>';
  var q = function(s) { return root.querySelector(s); };
  els = {
    title: q('.fs-title'), result: q('.fs-result'), time: q('.fs-time'),
    chH: q('.fs-channel-h'), avatar: q('.fs-avatar'), chName: q('.fs-ch-name'), chLink: q('.fs-ch-link'),
    achH: q('.fs-ach-h'), achList: q('.fs-ach-list'),
    credT: q('.fs-cred-t'), skip: q('.fs-skip'), credits: q('.fs-credits'), roll: q('.fs-roll'),
    share: q('.fs-share'), restart: q('.fs-restart')
  };
  els.chH.textContent = TXT.channelTitle;
  els.chLink.textContent = TXT.channelOpen;
  els.achH.textContent = TXT.achTitle;
  els.credT.textContent = TXT.creditsTitle;
  els.skip.textContent = TOUCH ? TXT.skipTouch : TXT.skip;
  els.share.textContent = TXT.share;
  els.restart.textContent = TXT.restart;
  els.avatar.addEventListener('error', function() { els.avatar.style.display = 'none'; });
  els.skip.addEventListener('click', function(e) { e.stopPropagation(); skipCredits(); });
  els.credits.addEventListener('click', skipCredits);
  els.credits.addEventListener('wheel', stopRoll, { passive: true });
  els.credits.addEventListener('touchstart', stopRoll, { passive: true });
  els.share.addEventListener('click', share);
  els.restart.addEventListener('click', close);
  document.body.appendChild(root);
}

function onKey(e) {
  if (!open) return;
  var k = (e.key || '').toLowerCase();
  if (k === 'e') { e.preventDefault(); skipCredits(); }
  e.stopPropagation();                  // nada chega ao jogo enquanto a tela final esta aberta
}

// ---- creditos ----
function fillCredits() {
  var env = (opts && opts.env) || {};
  if (env.renderCredits) env.renderCredits();
  var src = document.getElementById('term-panel-credits');
  els.roll.innerHTML = src ? src.innerHTML : '';
  var ided = els.roll.querySelectorAll('[id]');
  for (var i = 0; i < ided.length; i++) ided[i].removeAttribute('id');
}
function startRoll() {
  stopRoll();
  rollPos = 0; els.credits.scrollTop = 0;
  rollAuto = true; rollLast = performance.now();
  rollRaf = requestAnimationFrame(rollStep);
}
function rollStep(now) {
  rollRaf = 0;
  if (!rollAuto || !open) return;
  var dt = Math.min(0.1, (now - rollLast) / 1000); rollLast = now;
  var max = els.credits.scrollHeight - els.credits.clientHeight;
  rollPos = Math.min(max, rollPos + CREDITS_SPEED * dt);
  els.credits.scrollTop = rollPos;
  if (rollPos >= max && max > 0) { rollAuto = false; return; }
  rollRaf = requestAnimationFrame(rollStep);
}
function stopRoll() { rollAuto = false; if (rollRaf) cancelAnimationFrame(rollRaf); rollRaf = 0; }
function skipCredits() {
  stopRoll();
  els.credits.scrollTop = els.credits.scrollHeight;
  root.classList.add('fs-skipped');
}

// ---- canal ----
function channelUrlOf(meta) { var env = (opts && opts.env) || {}; return env.channelUrl ? env.channelUrl(meta) : null; }
function fillChannel() {
  var meta = S.channelMeta;
  var reserve = !meta || meta.id === 'retro_fallback';
  els.chName.textContent = reserve ? TXT.channelNone : (meta.author || S.channelTitle || S.handle || '');
  var url = reserve ? null : channelUrlOf(meta);
  els.chLink.style.display = url ? '' : 'none';
  if (url) els.chLink.href = url; else els.chLink.removeAttribute('href');
  if (meta && meta.avatar) { els.avatar.style.display = ''; els.avatar.src = meta.avatar; }
  else { els.avatar.style.display = 'none'; els.avatar.removeAttribute('src'); }
}

// ---- compartilhar ----
function shareText() {
  return fmt(plural(TXT.shareText, score.got), { got: score.got, total: score.total, time: timeStr });
}
function flashShare(label) {
  els.share.textContent = label;
  if (shareResetT) clearTimeout(shareResetT);
  shareResetT = setTimeout(function() { shareResetT = 0; els.share.textContent = TXT.share; }, 1800);
}
function copyText(txt) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(txt).then(function() { return true; }, function() { return legacyCopy(txt); });
  }
  return Promise.resolve(legacyCopy(txt));
}
function legacyCopy(txt) {
  try {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}
function share() {
  var env = (opts && opts.env) || {};
  var text = shareText(), url = env.shareUrl ? env.shareUrl() : location.href;
  if (navigator.share) {
    navigator.share({ title: TXT.shareTitle, text: text, url: url }).catch(function(err) {
      if (err && err.name === 'AbortError') return;          // o jogador cancelou o painel
      copyText(fmt(TXT.clipboard, { text: text, url: url })).then(function(ok) { flashShare(ok ? TXT.copied : TXT.copyFail); });
    });
    return;
  }
  copyText(fmt(TXT.clipboard, { text: text, url: url })).then(function(ok) { flashShare(ok ? TXT.copied : TXT.copyFail); });
}

// ---- abrir / fechar ----
// o = { hits, total, outcome: 'win'|'ammo'|'escaped'|'quit', env: { renderCredits, channelUrl, shareUrl }, onClose }
export function openFinalScreen(o) {
  build();
  opts = o || {};
  open = true;
  timeStr = sessionTime();
  els.title.textContent = TXT.titles[opts.outcome] || TXT.titles.quit;
  els.result.textContent = fmt(plural(TXT.result, opts.hits || 0), { n: opts.hits || 0, total: opts.total || 0 });
  els.time.textContent = fmt(TXT.time, { time: timeStr });
  score = mountAchievementList(els.achList, true) || { got: 0, total: 0 };
  fillChannel();
  fillCredits();
  els.share.textContent = TXT.share;
  root.classList.remove('fs-skipped');
  document.body.classList.add('final-open');
  root.classList.add('on');
  window.addEventListener('keydown', onKey, true);
  startRoll();
}

export function closeFinalScreen() {
  if (!open) return;
  open = false;
  stopRoll();
  if (shareResetT) { clearTimeout(shareResetT); shareResetT = 0; }
  window.removeEventListener('keydown', onKey, true);
  unmountAchievementList();
  root.classList.remove('on');
  document.body.classList.remove('final-open');
  els.roll.innerHTML = '';
}

function close() {
  var cb = opts && opts.onClose;
  closeFinalScreen();
  opts = null;
  if (cb) cb();
}

export function isFinalScreenOpen() { return open; }
