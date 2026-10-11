// Verifica que todos os dicionários de src/i18n têm as mesmas chaves e placeholders do pt-BR.
// Uso: node tools/check-i18n.mjs   (Node puro, sem dependências)
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n');
const files = readdirSync(dir).filter(function (f) { return /^[a-z]{2,3}-[A-Z]{2}\.js$/.test(f); });
const SOURCE = 'pt-BR.js';
if (!files.includes(SOURCE)) { console.error('pt-BR.js não encontrado'); process.exit(1); }

const load = async function (f) { return (await import(pathToFileURL(join(dir, f)).href)).default; };
const holders = function (s) { return (String(s).match(/\{\w+\}/g) || []).sort().join(','); };

const src = await load(SOURCE);
let errors = 0;
for (const f of files) {
  if (f === SOURCE) continue;
  const d = await load(f);
  for (const k of Object.keys(src)) {
    if (!(k in d)) { console.error(f + ': falta a chave ' + k); errors++; }
    else if (holders(d[k]) !== holders(src[k])) { console.error(f + ': placeholders diferentes em ' + k); errors++; }
  }
  for (const k of Object.keys(d)) {
    if (!(k in src)) { console.error(f + ': chave extra ' + k); errors++; }
  }
}
if (errors) { console.error(errors + ' problema(s).'); process.exit(1); }
console.log('i18n OK: ' + files.length + ' dicionários, ' + Object.keys(src).length + ' chaves.');
