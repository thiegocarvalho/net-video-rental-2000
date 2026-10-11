// i18n: src/i18n/index.js resolve o idioma de forma sincrona no load, entao t() ja vale aqui.
// Este modulo NAO e importado por src/i18n/* (sem ciclo).
import { t } from '../i18n/index.js';

export const DIAG = document.getElementById('diag');
export const STAGES = [];
export let FAILED = false;

// Diagnostics are only shown with ?debug (or when boot fails).
// Em desenvolvimento (localhost / 127.0.0.1 / file://) basta ?debug, que e o que o
// CLAUDE.md documenta e o que os scripts de teste usam. Publicado, ?debug sozinho nao
// vale mais nada: exige ?debug=<DEBUG_TOKEN>, senao qualquer visitante liga as trapacas
// (unlockAchievement, customerLab, huntDebug, SESSION) so editando a URL.
// Isto e obscuridade, nao seguranca: o token esta no fonte do cliente e quem ler o bundle
// o encontra. Serve para que o jogador casual nao caia nelas sem querer.
const DEBUG_TOKEN = 'vx9000';
export let DEBUG = false;
try {
  const q = new URLSearchParams(location.search);
  const h = location.hostname;
  const dev = !h || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || location.protocol === 'file:';
  DEBUG = q.has('debug') && (dev || q.get('debug') === DEBUG_TOKEN);
} catch(e) {}
if (DEBUG) document.body.classList.add('debug');

export function stage(s){
  STAGES.push(s);
  if(DEBUG && DIAG) DIAG.textContent = STAGES.join('\n');
}

export function fail(msg){
  FAILED = true;
  if(!DIAG) return;
  DIAG.className = 'bad';
  DIAG.textContent = STAGES.join('\n') + '\n\n>>> PAROU AQUI:\n' + msg;
}

export const $ = function(s){return document.querySelector(s);};

export let TOUCH = false;
try { TOUCH = window.matchMedia('(pointer:coarse)').matches; } catch(e) { TOUCH = 'ontouchstart' in window; }
if (TOUCH) document.body.classList.add('touch');

export const EL = {};

export function initEL() {
  Object.assign(EL, {
    osdMode: $('#osdMode'), osdCounter: $('#osdCounter'), osdMsg: $('#osdMsg'),
    deckLcd: $('#deckLcd'), trkDot: $('#trkDot'), look: $('#look'), cross: $('#cross'),
    hand: $('#hand'), toast: $('#toast'), crt: $('#crt'), deck: $('#deck'), status: $('#status'), fps: $('#fps')
  });
}

export const dcache = {};
export function setTxt(el,k,v){if(dcache[k]!==v){dcache[k]=v;el.textContent=v;}}
export function setHTML(el,k,v){if(dcache[k]!==v){dcache[k]=v;el.innerHTML=v;}}

// Pickup-style notices: stacked children of #toast, fade out via CSS animation.
export function toast(t){
  if(!EL.toast) return;
  var box = EL.toast;
  var last = box.lastElementChild;
  if (last && last.textContent === t) { // same text: restart its life instead of stacking
    last.style.animation = 'none'; void last.offsetWidth; last.style.animation = '';
    return;
  }
  var d = document.createElement('div');
  d.className = 't';
  d.textContent = t;
  d.addEventListener('animationend', function(){ d.remove(); });
  box.appendChild(d);
  while (box.children.length > 3) box.firstElementChild.remove();
}

// Textos visíveis internacionalizados via i18n.
export var TXT = {
  hintTouch: t('ui.hud.hint_touch'),
  hintKeys: t('ui.hud.hint_keys')
};

// Controls hint: shown once for a few seconds when the player enters the store.
(function(){
  var hint = document.getElementById('hint'), shown = false;
  if (!hint) return;
  function check(){
    if (shown || !document.body.classList.contains('playing')) return;
    shown = true;
    hint.textContent = TOUCH ? TXT.hintTouch : TXT.hintKeys;
    hint.classList.add('on');
    setTimeout(function(){ hint.classList.remove('on'); }, 7000);
  }
  try { new MutationObserver(check).observe(document.body, {attributes:true, attributeFilter:['class']}); } catch(e) {}
})();

export function updateToast(dt) {} // lifetime handled by CSS animation
