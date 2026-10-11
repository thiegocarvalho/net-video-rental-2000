// Carimba uma versao nos assets para o GitHub Pages.
//
// O Pages serve tudo com Cache-Control: max-age=600 e nao da para mudar o cabecalho, entao sem isto
// cada publicacao tem uma janela de 10 minutos servindo arquivo velho (o Safari costuma segurar mais).
//
// Nao ha bundler e nao queremos um: em vez de reescrever os imports dos modulos, geramos um IMPORT MAP
// que aponta cada URL de modulo para ela mesma + ?v=<versao>. Import map remapeia tambem o especificador
// relativo resolvido de dentro de um modulo, entao um unico mapa versiona o grafo inteiro sem que
// nenhum arquivo de src/ precise mudar.
//
// Roda SO no CI (.github/workflows/deploy-pages.yml), sobre a copia que vai para o artefato. O index.html
// do repositorio continua limpo e o desenvolvimento local segue em modulos ES puros, sem etapa de build.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const VERSION = (process.env.GITHUB_SHA || '').slice(0, 10) || String(Date.now());
const REPO = (process.env.GITHUB_REPOSITORY || '').split('/')[1];
const BASE = REPO ? `/${REPO}/` : '/';

function listJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listJs(p, out);
    else if (name.endsWith('.js')) out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out;
}

const modules = listJs(join(ROOT, 'src'));
if (!modules.length) { console.error('stamp-cache: nenhum modulo em src/'); process.exit(1); }

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');

// 1. Import map: acrescenta uma entrada por modulo, preservando os specifiers do three que ja existem.
const mapMatch = html.match(/<script type="importmap">\s*([\s\S]*?)\s*<\/script>/);
if (!mapMatch) { console.error('stamp-cache: import map nao encontrado em index.html'); process.exit(1); }
const map = JSON.parse(mapMatch[1]);
for (const m of modules) map.imports[`${BASE}${m}`] = `${BASE}${m}?v=${VERSION}`;
html = html.replace(mapMatch[0], `<script type="importmap">\n${JSON.stringify(map, null, 2)}\n  </script>`);

// 2. Entradas que o import map NAO cobre: src de <script> e href de <link> sao URLs de fetch, nao
//    especificadores de import, entao levam a query direto.
let stamped = 0;
html = html.replace(/\b(src|href)="((?:\.\/)?(?:src|css|libs)\/[^"?#]+)"/g, (all, attr, url) => {
  stamped++;
  return `${attr}="${url}?v=${VERSION}"`;
});

writeFileSync(join(ROOT, 'index.html'), html);
console.log(`stamp-cache: versao ${VERSION}, base ${BASE}, ${modules.length} modulos no import map, ${stamped} refs diretas carimbadas.`);
