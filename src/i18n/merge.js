// Junta os namespaces de um idioma num único dicionário; chave repetida entre namespaces é erro de programação.
export function merge(locale, parts) {
  const out = {};
  for (const name of Object.keys(parts)) {
    for (const k of Object.keys(parts[name])) {
      if (k in out) throw new Error('[i18n] ' + locale + ': chave duplicada "' + k + '" (namespace ' + name + ')');
      out[k] = parts[name][k];
    }
  }
  return out;
}
