// Liga o i18n ao HTML: traduz o DOM estático, <html lang>, metadados e monta o seletor de idioma.
// Trocar o idioma RECARREGA a página (Fase 1 do I18N_DESIGN.md §7); o que precisa sobreviver vai para
// sessionStorage ('rental_resume') via saveResume() e volta no boot com consumeResume().
// Chamado por um <script type="module"> no index.html, antes de src/main.js. Ver src/i18n/README.md.
import {
  t, getLocale, setLocale, resolveLocale, applyStaticTranslations,
  SUPPORTED, LOCALE_LABELS, URL_PARAM,
} from './index.js';

export const RESUME_KEY = 'rental_resume';

let resumeProvider = null;
let started = false;

/** Guarda um snapshot serializável (JSON) para o próximo carregamento da página. */
export function saveResume(snapshot) {
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(snapshot || {}));
    return true;
  } catch (e) { return false; }
}

/** Lê e APAGA o snapshot salvo por saveResume(). null se não houver (ou se estiver corrompido). */
export function consumeResume() {
  let raw = null;
  try {
    raw = sessionStorage.getItem(RESUME_KEY);
    sessionStorage.removeItem(RESUME_KEY);
  } catch (e) { return null; }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/**
 * main.js registra aqui a função que monta o snapshot no momento da troca de idioma
 * (ex.: () => ({ session: SESSION, inside: S.phase === 'inside' })). O campo do feed (#feed) entra sozinho.
 */
export function setResumeProvider(fn) { resumeProvider = typeof fn === 'function' ? fn : null; }

/** Troca o idioma: salva preferência + snapshot e recarrega mantendo a query string (?lang= é atualizado). */
export function switchLocale(tag) {
  const loc = resolveLocale(tag);
  if (!loc || loc === getLocale()) return false;
  let snap = {};
  if (resumeProvider) {
    try { snap = resumeProvider() || {}; } catch (e) { snap = {}; }
  }
  const feed = document.getElementById('feed');
  if (feed && snap.feed === undefined && feed.value.trim()) snap.feed = feed.value;
  snap.locale = loc;
  saveResume(snap);
  setLocale(loc);
  try {
    const url = new URL(location.href);
    if (url.searchParams.has(URL_PARAM)) {
      url.searchParams.set(URL_PARAM, loc);
      history.replaceState(history.state, '', url.href);
    }
  } catch (e) { /* ignora */ }
  location.reload();
  return true;
}

function setMeta(selector, value) {
  const m = document.querySelector(selector);
  if (m) m.setAttribute('content', value);
}

/**
 * Seletor de idioma: grupo de 3 botões ([PT] [EN] [ES]) com aria-pressed.
 * variant 'boot' (tela inicial, canto do #card) ou 'term' (aba ESTOQUE do terminal, com aviso de reinício).
 */
export function buildLangPicker(variant) {
  const box = document.createElement('div');
  box.className = 'lang-picker lang-' + variant;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', t('ui.lang.aria'));
  if (variant === 'term') {
    const lbl = document.createElement('span');
    lbl.className = 'lang-label';
    lbl.textContent = t('ui.lang.label');
    box.appendChild(lbl);
  }
  const cur = getLocale();
  SUPPORTED.forEach(function (loc) {
    const info = LOCALE_LABELS[loc] || { short: loc, name: loc };
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lang-btn';
    b.lang = loc;
    b.textContent = info.short;
    b.title = info.name;
    b.setAttribute('aria-label', info.name);
    b.setAttribute('aria-pressed', loc === cur ? 'true' : 'false');
    if (loc === cur) b.classList.add('on');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (loc !== getLocale()) switchLocale(loc);
    });
    box.appendChild(b);
  });
  if (variant === 'term') {
    const note = document.createElement('span');
    note.className = 'lang-note';
    note.textContent = t('ui.lang.restart_note');
    box.appendChild(note);
  }
  return box;
}

/** Aplica o idioma ao documento e monta os seletores. Idempotente. */
export function initI18nUI() {
  if (started) return;
  started = true;
  const loc = getLocale();
  document.documentElement.lang = loc;
  applyStaticTranslations(document);
  const og = (LOCALE_LABELS[loc] || {}).og;
  if (og) setMeta('meta[property="og:locale"]', og);

  const card = document.getElementById('card');
  if (card && !card.querySelector('.lang-picker')) card.appendChild(buildLangPicker('boot'));

  // Terminal: logo abaixo do LIMPAR CACHE, na aba ESTOQUE.
  const cacheBtn = document.getElementById('term-btn-cache');
  const row = cacheBtn && cacheBtn.parentNode;
  if (row && row.parentNode && !row.parentNode.querySelector('.lang-picker')) {
    row.parentNode.insertBefore(buildLangPicker('term'), row.nextSibling);
  }
}
