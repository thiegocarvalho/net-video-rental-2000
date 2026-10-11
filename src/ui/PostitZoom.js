// Zoom do post-it do quadro de cortica (Furnishings.js, alvo 'postit'): overlay DOM com o mesmo padrao do papel ZTA
// (entities/Pig.js) e do QR do armario (entities/Cabinet.js): S.fileOpen pausa movimento/mira/pick; E/ESC/clique fecham.
import { S } from '../core/State.js';
import { TOUCH } from './UIManager.js';
import { pageFlipSound } from '../core/Audio.js';
import { hash } from '../core/Utils.js';
import { t } from '../i18n/index.js';

var TXT = {
  lines: [t('scn.furn.postit1'), t('scn.furn.postit2'), t('scn.furn.postit3'), t('scn.furn.postit4')],
  close: t('ui.postit.close'),
  closeTouch: t('ui.postit.close_touch')
};

var env = null, el = null, isOn = false;

export function initPostitZoom(opts) { env = opts; }

function build() {
  if (el) return;
  el = document.createElement('div');
  el.id = 'postit-zoom';
  var note = document.createElement('div'); note.className = 'pz-note';
  TXT.lines.forEach(function(ln, i) {
    var d = document.createElement('div'); d.className = 'pz-line'; d.textContent = ln;
    d.style.transform = 'translateX(' + ((hash(i * 3 + 1) - 0.5) * 14).toFixed(1) + 'px) rotate(' + ((hash(i * 7 + 3) - 0.5) * 3.2).toFixed(2) + 'deg)';
    note.appendChild(d);
  });
  var under = document.createElement('div'); under.className = 'pz-under';
  note.appendChild(under);
  var hint = document.createElement('div'); hint.className = 'file-hint'; hint.textContent = TOUCH ? TXT.closeTouch : TXT.close;
  el.appendChild(note); el.appendChild(hint);
  el.addEventListener('click', function() { closePostit(); });
  document.body.appendChild(el);
}

export function openPostit() {
  if (S.fileOpen) return;
  build();
  S.fileOpen = true; isOn = true;
  if (S.inspect) S.inspect = false;
  if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) {} }
  el.classList.add('on');
  pageFlipSound();
}

export function closePostit() {
  if (!isOn) return;
  isOn = false; S.fileOpen = false;
  el.classList.remove('on');
  pageFlipSound();
  if (env && env.lockPointer && S.phase === 'inside') env.lockPointer();
}
