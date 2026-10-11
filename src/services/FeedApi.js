import { hash } from '../core/Utils.js';
import { t } from '../i18n/index.js';

export const TXT = {
  emptyInput: t('scn.feed.emptyInput'),
  tapeFallbackTitle: function (n) { return t('scn.feed.tapeFallbackTitle', { n: n }); },
  rssLimit: t('scn.feed.rssLimit'),
  unstableNetwork: t('scn.feed.unstableNetwork'),
  feedUnavailable: t('scn.feed.feedUnavailable'),
  fallbackHandle: '@locadora_retro',
  fallbackAuthor: t('scn.feed.fallbackAuthor'),
  readingPlaylist: function (id) { return t('scn.feed.readingPlaylist', { id: id }); },
  playlistHandle: '@playlist',
  playlistAuthor: t('scn.feed.playlistAuthor'),
  searchingChannel: function (h) { return t('scn.feed.searchingChannel', { handle: h }); },
  channelFound: function (name) { return t('scn.feed.channelFound', { name: name }); },
  connecting: t('scn.feed.connecting'),
  tryingProxy: t('scn.feed.tryingProxy'),
  defaultHandle: '@canal'
};

export const HUES = [[338, 80], [192, 85], [45, 90], [268, 60], [12, 80], [150, 55], [210, 70]];

function strHash(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function formatDate(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

export function cleanDesc(s) {
  return String(s || '').replace(/https?:\/\/\S+/g, '')
    .replace(/#\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 420);
}

export function parseFeedJSON(items, fallbackHandle) {
  if (!items || !items.length) return null;
  return items.map(function(it, i) {
    var seed = strHash(it.id || it.title || ('' + i)) % 10000;
    var hueIdx = Math.floor(hash(seed) * HUES.length);
    var pub = new Date(it.pubDate || Date.now());
    if (isNaN(pub.getTime())) pub = new Date(); // data inválida do proxy
    return {
      idx: i, seed: seed, hue: HUES[hueIdx][0], sat: HUES[hueIdx][1],
      id: it.id || '', title: it.title || TXT.tapeFallbackTitle(i + 1),
      date: formatDate(pub), year: pub.getFullYear(),
      desc: cleanDesc(it.description),
      // duracao real quando a fonte tem (Invidious); o RSS nao traz, entao sobra o tempo de fita deterministico
      dur: it.lengthSeconds > 0 ? Math.round(it.lengthSeconds) : 520 + ((hash(seed * 3.1) * 900) | 0),
      views: Number(it.views) > 0 ? Number(it.views) : 0,
      handle: it.author || fallbackHandle,
      thumb: null, shots: [],
      thumbUrl: it.thumbnail || (it.id ? ('https://i.ytimg.com/vi/' + it.id + '/hqdefault.jpg') : '')
    };
  });
}

function parseVideosXML(xmlText) {
  var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) return [];
  return Array.from(doc.querySelectorAll('entry')).map(function(entry) {
    function txt(sel) { var el = entry.querySelector(sel); return el ? el.textContent : ''; }
    var thumb = entry.querySelector('media\\:thumbnail, thumbnail');
    var stats = entry.querySelector('media\\:statistics, statistics');
    return {
      id: txt('yt\\:videoId, videoId'),
      title: txt('title'),
      pubDate: txt('published'),
      author: txt('author name'),
      thumbnail: thumb ? thumb.getAttribute('url') : '',
      views: stats ? Number(stats.getAttribute('views')) : 0,
      description: txt('media\\:description, description')
    };
  });
}

function fetchViaAllOrigins(url) {
  return fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), 6000)
    .then(function(r) { if (!r.ok) throw new Error(t('scn.feed.proxyStatus', { status: r.status })); return r.text(); })
    .then(function(xml) {
      var entries = parseVideosXML(xml);
      if (!entries.length) throw new Error(t('scn.feed.noItems'));
      return entries;
    });
}

function fetchViaRss2json(url) {
  return fetchWithTimeout('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url), 7000)
    .then(function(r) {
      if (r.status === 429) throw new Error(TXT.rssLimit);
      if (!r.ok) throw new Error(t('scn.feed.rssStatus', { status: r.status }));
      return r.json();
    })
    .then(function(j) {
      if (!j || j.status !== 'ok' || !j.items || !j.items.length) throw new Error(t('scn.feed.emptyFeed'));
      return j.items.map(function(it) {
        var link = String(it.link || '');
        var vid = (link.match(/v=([^&]+)/) || link.match(/youtu\.be\/([^?]+)/) || []);
        return {
          id: vid[1] || '',
          title: it.title,
          pubDate: it.pubDate,
          author: it.author,
          thumbnail: it.thumbnail || (vid[1] ? ('https://i.ytimg.com/vi/' + vid[1] + '/hqdefault.jpg') : ''),
          description: it.description
        };
      });
    });
}

const INVIDIOUS_INSTANCES = [
  'https://invidious.flokinet.to',
  'https://invidious.f5.si'
];

function fetchWithTimeout(url, ms) {
  ms = ms || 6000;
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, ms);
  return fetch(url, { signal: ctrl.signal })
    .finally(function() { clearTimeout(timer); });
}

// Busca JSON de uma instância Invidious; lança em HTTP != 2xx para o chamador tentar a próxima.
function fetchJSON(url, ms) {
  return fetchWithTimeout(url, ms).then(function(r) {
    if (!r.ok) throw new Error(r.status === 429 ? t('scn.feed.httpLimit', { status: r.status }) : t('scn.feed.httpStatus', { status: r.status }));
    return r.json();
  });
}

// Instâncias que falharam nesta sessão vão para o fim da fila, evitando esperar o timeout toda vez.
function instancesByHealth() {
  return INVIDIOUS_INSTANCES.slice().sort(function(a, b) { return (badInstances[a] || 0) - (badInstances[b] || 0); });
}
var badInstances = {};

// Cache do último feed bom (localStorage): lista + metadados do canal (nome, id, URLs do avatar/banner).
// - Dentro do TTL (1 h) a entrada é usada direto, sem nenhum request (recarregar a página não refaz a busca).
// - Vencido: busca de novo; se a rede falhar, o cache vencido ainda serve de reserva (toast "usando lista salva").
// clearFeedCache() (botão LIMPAR CACHE na aba ESTOQUE / comando `cache clear` do terminal) apaga tudo.
var CACHE_PREFIX = 'rentalTube.feed.v1.';
export var CACHE_TTL_MS = 60 * 60 * 1000;
// fresh=true: só devolve se estiver dentro do TTL. O item volta marcado (fromCache = reserva vencida; cacheFresh = TTL).
function cacheRead(key, fresh) {
  try {
    var raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    var o = JSON.parse(raw);
    if (!o || !o.items || !o.items.length) return null;
    var age = Date.now() - (+o.t || 0);
    if (fresh && !(age >= 0 && age < CACHE_TTL_MS)) return null;
    o.items.channelMeta = o.meta || null;
    if (fresh) o.items.cacheFresh = true; else o.items.fromCache = true;
    return o.items;
  } catch (e) { return null; }
}
// Apaga todas as listas salvas. Retorna quantas entradas saíram.
export function clearFeedCache() {
  var n = 0;
  try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && k.indexOf(CACHE_PREFIX) === 0) { localStorage.removeItem(k); n++; }
    }
  } catch (e) {}
  return n;
}
function cacheWrite(key, cat) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), meta: cat.channelMeta || null, items: cat }));
  } catch (e) {}
}

export function proxyImageUrl(url, width) {
  if (!url) return '';
  if (url.startsWith('//')) url = 'https:' + url;
  if (url.includes('wsrv.nl')) return url;
  // Imagens do Google / YouTube sofrem bloqueio de ORB e CORS em canvas WebGL se acessadas direto
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    var wParam = width ? '&w=' + width : '';
    return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + wParam + '&output=jpg';
  }
  return url;
}

function pickLargestImage(arr, targetWidth) {
  if (!arr) return null;
  if (typeof arr === 'string') return proxyImageUrl(arr, targetWidth);
  if (!arr.length) return null;
  var sorted = arr.slice().sort(function(a, b) {
    return (b.width || 0) - (a.width || 0);
  });
  var u = sorted[0].url;
  if (!u) return null;
  return proxyImageUrl(u, targetWidth);
}

function mapInvidiousVideos(videos, defaultAuthor) {
  if (!videos || !videos.length) return [];
  return videos.map(function(v) {
    var vid = v.videoId || v.id || '';
    var thumb = vid ? ('https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg') : '';
    var pubDate = '';
    if (typeof v.published === 'number') {
      pubDate = new Date(v.published * 1000).toISOString();
    } else if (v.published) {
      pubDate = new Date(v.published).toISOString();
    } else {
      pubDate = new Date().toISOString();
    }
    return {
      id: vid,
      title: v.title || '',
      pubDate: pubDate,
      author: v.author || defaultAuthor,
      thumbnail: thumb,
      lengthSeconds: Number(v.lengthSeconds) || 0,
      views: Number(v.viewCount) || 0,
      description: v.description || ''
    };
  });
}

const FALLBACK_CATALOG = [
  { id: 'dQw4w9WgXcQ', title: t('scn.feed.fb01.title'), author: 'Lady Arcade', pubDate: '1996-08-14', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', description: t('scn.feed.fb01.desc') },
  { id: 'L_LUpnjgPso', title: t('scn.feed.fb02.title'), author: 'RetroWave', pubDate: '1995-10-22', thumbnail: 'https://i.ytimg.com/vi/L_LUpnjgPso/hqdefault.jpg', description: t('scn.feed.fb02.desc') },
  { id: 'kXYiU_JCYtU', title: t('scn.feed.fb03.title'), author: 'Arquivo VHS', pubDate: '1994-05-18', thumbnail: 'https://i.ytimg.com/vi/kXYiU_JCYtU/hqdefault.jpg', description: t('scn.feed.fb03.desc') },
  { id: 'fJ9rUzIMcZQ', title: t('scn.feed.fb04.title'), author: 'Video Club', pubDate: '1997-11-05', thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg', description: t('scn.feed.fb04.desc') },
  { id: 'djV11Xbc914', title: t('scn.feed.fb05.title'), author: 'Tokyo Gaming', pubDate: '1994-12-03', thumbnail: 'https://i.ytimg.com/vi/djV11Xbc914/hqdefault.jpg', description: t('scn.feed.fb05.desc') },
  { id: 'kJQP7kiw5Fk', title: t('scn.feed.fb06.title'), author: 'Tech Archives', pubDate: '1995-08-24', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg', description: t('scn.feed.fb06.desc') },
  { id: '2Vv-BfVoq4g', title: t('scn.feed.fb07.title'), author: 'Arcade 90s', pubDate: '1996-03-12', thumbnail: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg', description: t('scn.feed.fb07.desc') },
  { id: '3JZ_D3ELwOQ', title: t('scn.feed.fb08.title'), author: 'Tokyo Drift 90', pubDate: '1998-07-20', thumbnail: 'https://i.ytimg.com/vi/3JZ_D3ELwOQ/hqdefault.jpg', description: t('scn.feed.fb08.desc') },
  { id: 'e-ORhEE9VVg', title: t('scn.feed.fb09.title'), author: 'Cine Studio', pubDate: '1993-09-15', thumbnail: 'https://i.ytimg.com/vi/e-ORhEE9VVg/hqdefault.jpg', description: t('scn.feed.fb09.desc') },
  { id: 'fRegwI3_kHw', title: t('scn.feed.fb10.title'), author: 'Midnight VHS', pubDate: '1995-01-30', thumbnail: 'https://i.ytimg.com/vi/fRegwI3_kHw/hqdefault.jpg', description: t('scn.feed.fb10.desc') },
  { id: 'RgKAFK5djSk', title: t('scn.feed.fb11.title'), author: 'Corporate Video', pubDate: '1996-04-10', thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg', description: t('scn.feed.fb11.desc') },
  { id: 'uelHwf8o7_U', title: t('scn.feed.fb12.title'), author: 'Família 90s', pubDate: '1997-01-15', thumbnail: 'https://i.ytimg.com/vi/uelHwf8o7_U/hqdefault.jpg', description: t('scn.feed.fb12.desc') },
  { id: 'JGwWNGJdvx8', title: t('scn.feed.fb13.title'), author: 'Neon Dreams', pubDate: '1999-12-31', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg', description: t('scn.feed.fb13.desc') },
  { id: 'OPf0YbXqDm0', title: t('scn.feed.fb14.title'), author: 'Retro Byte', pubDate: '1996-06-23', thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg', description: t('scn.feed.fb14.desc') },
  { id: 'l482T0yNkeo', title: t('scn.feed.fb15.title'), author: 'Memória TV', pubDate: '1995-11-19', thumbnail: 'https://i.ytimg.com/vi/l482T0yNkeo/hqdefault.jpg', description: t('scn.feed.fb15.desc') }
];

// Evita requisições duplicadas: chamadas simultâneas com a mesma entrada compartilham a promise.
var inflight = {};

export function loadRSS(txt, report) {
  txt = (txt || '').trim();
  if (!txt) return Promise.reject(new Error(TXT.emptyInput));
  var k = txt.toLowerCase();
  if (inflight[k]) return inflight[k];
  var p = loadRSSImpl(txt, report).finally(function() { delete inflight[k]; });
  inflight[k] = p;
  return p;
}

async function loadRSSImpl(txt, report) {
  var PL = txt.match(/list=([A-Za-z0-9_-]{10,})/) || txt.match(/^(PL[A-Za-z0-9_-]{10,})$/);
  var UC = txt.match(/(UC[A-Za-z0-9_-]{22})/);
  var handleMatch = txt.match(/@([A-Za-z0-9_.-]+)/);

  var playlistId = PL ? PL[1] : null;
  var channelId = UC ? UC[1] : null;
  var queryHandle = handleMatch ? handleMatch[1] : null;

  // Se o usuário colou URL sem @ ou digitou nome direto, tenta extrair ou tratar como busca
  if (!playlistId && !channelId && !queryHandle) {
    var urlCustomMatch = txt.match(/youtube\.com\/(?:c\/|user\/)?([A-Za-z0-9_.-]+)/);
    if (urlCustomMatch && !['watch', 'playlist', 'feed', 'results', 'channel'].includes(urlCustomMatch[1].toLowerCase())) {
      queryHandle = urlCustomMatch[1];
    } else if (!txt.includes('http')) {
      queryHandle = txt;
    }
  }

  // Chave de cache da entrada original (o id resolvido também é gravado abaixo)
  var inputKey = playlistId ? 'pl:' + playlistId : channelId ? 'ch:' + channelId : 'q:' + (queryHandle || txt).toLowerCase();

  // Dentro do TTL: nenhuma requisição (nem do feed nem dos metadados do canal, que vêm juntos na entrada).
  var hit = cacheRead(inputKey, true);
  if (hit) return hit;

  var cat = null;
  try { cat = await fetchFresh(playlistId, channelId, queryHandle, report); } catch (e) { console.warn('Feed falhou:', e); }

  if (cat && cat.length) {
    cacheWrite(inputKey, cat);
    if (cat.channelMeta && cat.channelMeta.id) cacheWrite('id:' + cat.channelMeta.id, cat);
    return cat;
  }

  var cached = cacheRead(inputKey);
  if (cached) {
    report && report(TXT.unstableNetwork);
    return cached;
  }

  // Catálogo retrô de reserva
  report && report(TXT.feedUnavailable);
  var fallbackCat = parseFeedJSON(FALLBACK_CATALOG, TXT.fallbackHandle);
  fallbackCat.channelMeta = { author: TXT.fallbackAuthor, id: 'retro_fallback', avatar: null, banner: null };
  fallbackCat.isFallback = true;
  return fallbackCat;
}

async function fetchPlaylistInvidious(playlistId, report) {
  report && report(TXT.readingPlaylist(playlistId));
  var insts = instancesByHealth();
  for (var i = 0; i < insts.length; i++) {
    try {
      var d = await fetchJSON(insts[i] + '/api/v1/playlists/' + encodeURIComponent(playlistId), 6000);
      var videos = (d && d.videos) || [];
      if (!videos.length) continue;
      var title = d.title || TXT.playlistHandle;
      var cat = parseFeedJSON(mapInvidiousVideos(videos, title), title);
      cat.channelMeta = { author: d.title || TXT.playlistAuthor, id: playlistId, avatar: null, banner: null };
      return cat;
    } catch (e) {
      badInstances[insts[i]] = (badInstances[insts[i]] || 0) + 1;
      console.warn('Invidious playlist em ' + insts[i] + ' falhou:', e);
    }
  }
  return null;
}

// Resolve @handle/nome para channelId via busca Invidious. Retorna {id, thumbs} ou null.
async function resolveHandle(queryHandle, report) {
  report && report(TXT.searchingChannel(queryHandle));
  var insts = instancesByHealth();
  var want = ('@' + queryHandle).toLowerCase();
  for (var i = 0; i < insts.length; i++) {
    try {
      var data = await fetchJSON(insts[i] + '/api/v1/search?q=' + encodeURIComponent('@' + queryHandle) + '&type=channel', 5000);
      if (!Array.isArray(data)) continue;
      var found = data.find(function(c) {
        return c.authorId && c.authorId.startsWith('UC') &&
               (!c.channelHandle || c.channelHandle.toLowerCase() === want || (c.author || '').toLowerCase() === queryHandle.toLowerCase());
      }) || data.find(function(c) { return c.authorId && c.authorId.startsWith('UC'); });
      if (found) {
        report && report(TXT.channelFound(found.author));
        return { id: found.authorId, thumbs: found.authorThumbnails };
      }
    } catch (e) {
      badInstances[insts[i]] = (badInstances[insts[i]] || 0) + 1;
      console.warn('Busca de canal em ' + insts[i] + ' falhou:', e);
    }
  }
  return null;
}

async function fetchChannelInvidious(channelId, initialThumbnails, report) {
  report && report(TXT.connecting);
  var insts = instancesByHealth();
  for (var i = 0; i < insts.length; i++) {
    var inst = insts[i];
    try {
      var ch = await fetchJSON(inst + '/api/v1/channels/' + encodeURIComponent(channelId), 6000);
      var author = ch.author || ('@' + channelId);
      var vids = ch.latestVideos || [];
      if (!vids.length) {
        var vd = await fetchJSON(inst + '/api/v1/channels/' + encodeURIComponent(channelId) + '/videos', 5000);
        vids = (vd && vd.videos) || (Array.isArray(vd) ? vd : []);
      }
      if (!vids.length) continue;
      var cat = parseFeedJSON(mapInvidiousVideos(vids, author), author);
      cat.channelMeta = {
        author: author,
        id: channelId,
        avatar: pickLargestImage(ch.authorThumbnails || initialThumbnails, 256),
        banner: pickLargestImage(ch.authorBanners, 1280)
      };
      return cat;
    } catch (err) {
      badInstances[inst] = (badInstances[inst] || 0) + 1;
      console.warn('Tentativa Invidious em ' + inst + ' falhou:', err);
    }
  }
  return null;
}

// Fallback RSS do YouTube via proxies públicos (allorigins, depois rss2json).
async function fetchRssProxies(playlistId, channelId, initialThumbnails, report) {
  report && report(TXT.tryingProxy);
  var rssUrl = playlistId
    ? 'https://www.youtube.com/feeds/videos.xml?playlist_id=' + playlistId
    : 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId;
  try {
    var entries;
    try { entries = await fetchViaAllOrigins(rssUrl); }
    catch (e1) { entries = await fetchViaRss2json(rssUrl); }
    if (!entries || !entries.length) return null;
    var author = entries[0].author || TXT.defaultHandle;
    var cat = parseFeedJSON(entries, author);
    cat.channelMeta = { author: author, id: channelId || playlistId, avatar: pickLargestImage(initialThumbnails, 256), banner: null };
    return cat;
  } catch (rssErr) {
    console.warn('RSS proxies falharam:', rssErr);
    return null;
  }
}

async function fetchFresh(playlistId, channelId, queryHandle, report) {
  var cat;
  if (playlistId) {
    cat = await fetchPlaylistInvidious(playlistId, report);
    if (cat) return cat;
  }
  var thumbs = null;
  if (!channelId && queryHandle) {
    var r = await resolveHandle(queryHandle, report);
    if (r) { channelId = r.id; thumbs = r.thumbs; }
  }
  if (channelId) {
    cat = await fetchChannelInvidious(channelId, thumbs, report);
    if (cat) return cat;
  }
  if (channelId || playlistId) return fetchRssProxies(playlistId, channelId, thumbs, report);
  return null;
}
