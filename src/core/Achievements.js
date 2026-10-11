// Achievements (FINAL_GAME_DESIGN.md, secao 12). Cada id dispara uma vez por SESSAO: o registro vive em
// SESSION.achievements (sobrevive a resetWorld), entao o popup nunca repete. Tempo = segundos desde sessionStart.
// Todas as strings visíveis internacionalizadas via i18n.
import { S } from './State.js';
import { t } from '../i18n/index.js';
import { DEBUG } from '../ui/UIManager.js';
import { SESSION } from './World.js';
import { achievementSound } from './Audio.js';

var TXT = { unlocked: t('scn.ach.unlocked'), empty: t('scn.ach.empty') };
var POPUP_MS = 4000;

// Icones: caminhos SVG (viewBox 24), reaproveitados entre achievements.
var ICONS = {
  star: 'M12 2l3 7 7 .6-5.3 4.8 1.7 7.4L12 18l-6.4 3.8 1.7-7.4L2 9.6 9 9z',
  bulb: 'M12 2a6 6 0 0 0-3.5 10.9V16h7v-3.1A6 6 0 0 0 12 2zM9 18h6v2H9zM10 21h4v1h-4z',
  door: 'M6 2h12v20H6zM9 4v16h6V4zM13 12h1.5v1.5H13z',
  can: 'M7 3h10v2l1 1v14l-1 1H7l-1-1V6l1-1zM8 8h8v2H8z',
  tape: 'M2 6h20v12H2zM6 9a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM18 9a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  heart: 'M12 21S3 14.5 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 14.5 12 21 12 21z',
  eye: 'M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4z'
};

// Ordem = ordem da tabela. `secret`: so aparece na tabela final, e so se Wanted + Wolf estiverem obtidos.
var REGISTRY = [
  { id: 'lights_out', name: t('scn.ach.lights_out'), icon: 'bulb' },
  { id: 'home_alone', name: t('scn.ach.home_alone'), icon: 'door' },
  { id: 'space_jam', name: t('scn.ach.space_jam'), icon: 'can' },
  { id: 'eat_pray_love', name: t('scn.ach.eat_pray_love'), icon: 'heart' },
  { id: 'wall_e', name: t('scn.ach.wall_e'), icon: 'tape' },
  { id: 'catch_me', name: t('scn.ach.catch_me'), icon: 'star' },
  { id: 'wanted', name: t('scn.ach.wanted'), icon: 'eye' },
  { id: 'wolf', name: t('scn.ach.wolf'), icon: 'star' },
  { id: 'alita', name: t('scn.ach.alita'), icon: 'box' },
  { id: 'inception', name: t('scn.ach.inception'), icon: 'door' },
  { id: 'missing', name: t('scn.ach.missing'), icon: 'eye' },
  { id: 'twister', name: t('scn.ach.twister'), icon: 'star' },
  { id: 'rango', name: t('scn.ach.rango'), icon: 'star' },
  { id: 'cheater', name: t('scn.ach.cheater'), icon: 'star', secret: true }
];
var BY_ID = {};
REGISTRY.forEach(function(a) { BY_ID[a.id] = a; });

export function isUnlocked(id) { return SESSION.achievements[id] !== undefined; }

// ---- popup (fila) ----
var queue = [], showing = false, paused = false, retry = 0, el = null, nameEl = null, iconEl = null, hideT = 0;

export function setAchievementsPaused(p) {
  p = !!p;
  if (p === paused) return;
  paused = p;
  if (!paused) pump();
}

function ensureEl() {
  if (el) return true;
  el = document.getElementById('ach-popup');
  if (!el) return false;
  nameEl = el.querySelector('.ach-name');
  iconEl = el.querySelector('.ach-icon');
  var lbl = el.querySelector('.ach-label'); if (lbl) lbl.textContent = TXT.unlocked;
  return true;
}

function pump() {
  if (showing || !queue.length) return;
  if (paused || S.fainted || !ensureEl()) {          // suspenso (jumpscare/reboot): tenta de novo logo depois
    if (!retry) retry = setTimeout(function() { retry = 0; pump(); }, 400);
    return;
  }
  var a = queue.shift();
  showing = true;
  nameEl.textContent = a.name;
  iconEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + (ICONS[a.icon] || ICONS.star) + '"/></svg>';
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');   // reinicia a animacao
  achievementSound();
  hideT = setTimeout(function() {
    el.classList.remove('on'); showing = false; hideT = 0;
    setTimeout(pump, 350);                           // pequena pausa entre popups
  }, POPUP_MS);
}

// Dispara uma vez por sessao. Retorna true se foi nova.
export function unlock(id) {
  var a = BY_ID[id];
  if (!a || isUnlocked(id)) return false;
  SESSION.achievements[id] = Math.max(0, Math.round((performance.now() - (SESSION.sessionStart == null ? performance.now() : SESSION.sessionStart)) / 1000));
  queue.push(a);
  pump();
  return true;
}

// ---- tabela ----
export function mmss(sec) {
  var m = Math.floor(sec / 60), s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

var GLITCH = '█▒░#%&?/*';
function scramble(name, seed) {
  var out = '';
  for (var i = 0; i < name.length; i++) {
    var ch = name[i];
    if (ch === ' ' || ch === ',' || ch === ':' || ch === '-') { out += ch; continue; }
    var h = ((i * 7 + seed * 13 + name.length * 3) % 5);
    out += h < 2 ? GLITCH[(i * 5 + seed * 3) % GLITCH.length] : ch;   // ~40% das letras trocadas
  }
  return out;
}

// Lista para a tabela: { id, name, icon, got, time } ; `final` inclui CHEATER (se Wanted + Wolf).
export function achievementList(final) {
  var rows = [], seed = 0;
  for (var i = 0; i < REGISTRY.length; i++) {
    var a = REGISTRY[i], got = isUnlocked(a.id);
    if (a.secret && !(final && isUnlocked('wanted') && isUnlocked('wolf'))) continue;
    rows.push({
      id: a.id, icon: a.icon, got: got,
      name: got ? a.name : scramble(a.name, seed++),
      time: got ? mmss(SESSION.achievements[a.id]) : ''
    });
  }
  return rows;
}

// ---- aba CONQUISTAS do terminal: renderiza e anima o glitch dos nao obtidos (para ao desmontar) ----
var glitchT = 0, glitchHost = null, glitchTick = 0;

export function unmountAchievementList() { if (glitchT) clearInterval(glitchT); glitchT = 0; glitchHost = null; }

// final = tabela da tela final do HUNT (ui/FinalScreen.js): inclui CHEATER quando obtido. Retorna { got, total }.
export function mountAchievementList(host, final) {
  unmountAchievementList();
  if (!host) return null;
  glitchHost = host;
  var html = '', got = 0, rows = achievementList(!!final);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]; if (r.got) got++;
    html += '<div class="ach-row' + (r.got ? ' got' : '') + '" data-id="' + r.id + '"><span class="ach-ic"><svg viewBox="0 0 24 24"><path d="' +
      (ICONS[r.icon] || ICONS.star) + '"/></svg></span><span class="ach-rn">' + r.name + '</span><span class="ach-rt">' + r.time + '</span></div>';
  }
  host.innerHTML = '<div class="ach-head">' + got + ' / ' + rows.length + '</div>' + html;
  glitchT = setInterval(function() {
    if (!glitchHost || !glitchHost.offsetParent) return;
    glitchTick++;
    var names = glitchHost.querySelectorAll('.ach-row:not(.got) .ach-rn');
    for (var k = 0; k < names.length; k++) {
      var id = names[k].parentNode.getAttribute('data-id');
      names[k].textContent = scramble(BY_ID[id].name, glitchTick + k);
    }
  }, 160);
  return { got: got, total: rows.length };
}

if (DEBUG) window.unlockAchievement = unlock;   // depuracao (?debug)
