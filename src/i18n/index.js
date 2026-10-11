// i18n: t(), plural(), detecção do idioma e tradução do HTML estático. Ver src/i18n/README.md e I18N_DESIGN.md.
// Dicionários são importados estaticamente (pequenos); a detecção é síncrona, antes de qualquer cena montar texto.
import ptBR from './pt-BR.js';
import enGB from './en-GB.js';
import esES from './es-ES.js';

export const SOURCE_LOCALE = 'pt-BR';
export const STORAGE_KEY = 'rental_lang';
export const URL_PARAM = 'lang';
export const DICTIONARIES = { 'pt-BR': ptBR, 'en-GB': enGB, 'es-ES': esES };
export const SUPPORTED = Object.keys(DICTIONARIES);

// Família de idioma -> locale suportado (en-US, en-AU... -> en-GB etc.)
const FAMILY = { pt: 'pt-BR', en: 'en-GB', es: 'es-ES' };

// Rótulos do seletor de idioma: cada idioma no próprio idioma (não traduzir). og = og:locale.
export const LOCALE_LABELS = {
  'pt-BR': { short: 'PT', name: 'Português (Brasil)', og: 'pt_BR' },
  'en-GB': { short: 'EN', name: 'English (UK)', og: 'en_GB' },
  'es-ES': { short: 'ES', name: 'Español (España)', og: 'es_ES' },
};

let current = SOURCE_LOCALE;
const warned = new Set();

/** Converte qualquer tag BCP-47 ('en-US', 'es', 'pt_PT') num locale suportado, ou null. */
export function resolveLocale(tag) {
  if (!tag || typeof tag !== 'string') return null;
  const norm = tag.replace('_', '-');
  const exact = SUPPORTED.find(function (l) { return l.toLowerCase() === norm.toLowerCase(); });
  if (exact) return exact;
  return FAMILY[norm.split('-')[0].toLowerCase()] || null;
}

function readStored() {
  try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
}

/** Valor de ?lang= na URL da página (bruto), ou null. */
export function urlLocaleParam() {
  try { return new URLSearchParams(location.search).get(URL_PARAM); } catch (e) { return null; }
}

/** Ordem: ?lang= > localStorage > navigator.languages > pt-BR. */
export function detectLocale() {
  const fromUrl = resolveLocale(urlLocaleParam());
  if (fromUrl) return fromUrl;
  const stored = resolveLocale(readStored());
  if (stored) return stored;
  const langs = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
  for (let i = 0; i < langs.length; i++) {
    const r = resolveLocale(langs[i]);
    if (r) return r;
  }
  return SOURCE_LOCALE;
}

export function getLocale() { return current; }

/** Troca o idioma. Salva a preferência (persist=false para não salvar) e emite 'localechange'. */
export function setLocale(tag, persist) {
  const loc = resolveLocale(tag);
  if (!loc) return false;
  const changed = loc !== current;
  current = loc;
  if (persist !== false) {
    try { localStorage.setItem(STORAGE_KEY, loc); } catch (e) { /* ignora */ }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = loc;
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('localechange', { detail: { locale: loc } }));
  }
  return true;
}

function has(dict, key) { return !!dict && Object.prototype.hasOwnProperty.call(dict, key); }

function lookup(key) {
  const d = DICTIONARIES[current];
  if (has(d, key)) return d[key];
  const src = DICTIONARIES[SOURCE_LOCALE];
  if (has(src, key)) return src[key];
  if (!warned.has(key)) {
    warned.add(key);
    if (typeof console !== 'undefined') console.warn('[i18n] chave ausente:', key);
  }
  return key;
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, function (m, name) {
    return name in params ? String(params[name]) : m;
  });
}

/** t('toast.pickup', { name }) -> texto com {placeholders} preenchidos. */
export function t(key, params) { return interpolate(lookup(key), params); }

/**
 * plural('inventory.count', 3) usa as chaves 'inventory.count.<categoria>'
 * (zero/one/two/few/many/other) conforme Intl.PluralRules; cai em '.other'.
 * {n} é preenchido automaticamente com o número.
 */
export function plural(key, n, params) {
  const full = key + '.' + new Intl.PluralRules(current).select(n);
  const ok = has(DICTIONARIES[current], full) || has(DICTIONARIES[SOURCE_LOCALE], full);
  return interpolate(lookup(ok ? full : key + '.other'), Object.assign({ n: n }, params));
}

// data-i18n-html: só estas tags (e só o atributo class) sobrevivem; o resto vira texto.
const HTML_TAGS = { B: 1, I: 1, EM: 1, STRONG: 1, SMALL: 1, BR: 1, SPAN: 1 };

function sanitizeInto(el, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  (function clean(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (c) {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1 || !HTML_TAGS[c.tagName]) {
        node.replaceChild(document.createTextNode(c.textContent || ''), c);
        return;
      }
      Array.prototype.slice.call(c.attributes).forEach(function (a) {
        if (a.name !== 'class') c.removeAttribute(a.name);
      });
      clean(c);
    });
  })(tpl.content);
  el.replaceChildren(tpl.content);
}

/**
 * Traduz o HTML estático sob root:
 *  [data-i18n="k"]       -> textContent
 *  [data-i18n-html="k"]  -> conteúdo com marcação simples (b, i, em, strong, small, br, span[class]); valor do
 *                           dicionário do repositório, nunca de dado externo
 *  [data-i18n-aria="k"]  -> aria-label
 *  [data-i18n-attr="placeholder:k1;content:k2"] -> atributos quaisquer
 */
export function applyStaticTranslations(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach(function (el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  scope.querySelectorAll('[data-i18n-html]').forEach(function (el) {
    sanitizeInto(el, t(el.getAttribute('data-i18n-html')));
  });
  scope.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  scope.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
    el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
      const i = pair.indexOf(':');
      if (i > 0) el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
    });
  });
}

current = detectLocale();
// ?lang= válido vira a preferência salva (links diretos continuam valendo depois de tirar o parâmetro).
if (resolveLocale(urlLocaleParam())) {
  try { localStorage.setItem(STORAGE_KEY, current); } catch (e) { /* ignora */ }
}
