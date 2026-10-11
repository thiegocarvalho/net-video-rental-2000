# src/i18n

Internacionalização do jogo, sem build. Idioma-fonte: `pt-BR`; também `en-GB` e `es-ES`. O plano completo está em `I18N_DESIGN.md`.

## Estrutura

```text
src/i18n/
  index.js            t(), plural(), detecção, setLocale(), applyStaticTranslations(), LOCALE_LABELS
  boot.js             liga o i18n ao HTML: initI18nUI(), seletor de idioma, saveResume()/consumeResume()
  merge.js            junta os namespaces de um idioma (chave repetida entre namespaces = erro)
  pt-BR.js            agregador: merge('pt-BR', { ui, main, entities, scenes })
  en-GB.js, es-ES.js  idem
  pt-BR/              dicionários por namespace (fonte: toda chave nova nasce aqui)
    ui.js             index.html, HUD estático, seletor de idioma (prefixo ui.* e chaves legadas)
    main.js           textos de src/main.js
    entities.js       textos de src/entities/*
    scenes.js         textos de src/scenes/*, graphics/*, services/*
  en-GB/, es-ES/      os mesmos 4 arquivos, traduzidos
```

Cada namespace usa o próprio prefixo de chave para não colidir com os outros (o `merge()` recusa duplicatas).

## API (`index.js`)

```js
import { t, plural, getLocale } from './i18n/index.js';

t('toast.pickup', { name: 'Matrix' });   // "Pegou: Matrix"
plural('inventory.count', 3);            // usa inventory.count.one / .other (Intl.PluralRules); {n} automático
getLocale();                             // 'pt-BR' | 'en-GB' | 'es-ES'
```

Detecção (síncrona, no carregamento do módulo): `?lang=` na URL > `localStorage('rental_lang')` > `navigator.languages` > `pt-BR`. `?lang=` aceita a tag completa ou só a família (`?lang=es`, `?lang=en-US`) e, se válido, vira a preferência salva. Variantes: `en-*` -> `en-GB`, `es-*` -> `es-ES`, `pt-*` -> `pt-BR`. Chave ausente: cai no `pt-BR` e depois devolve a própria chave (com `console.warn` uma vez).

O idioma é fixo durante a vida da página: os módulos podem avaliar `t()` no load (`var TXT = { a: t('x.a') }`). Trocar o idioma **recarrega** a página (Fase 1 do `I18N_DESIGN.md` §7).

## HTML estático (`applyStaticTranslations`)

`index.html` marca os textos com atributos; `initI18nUI()` aplica o dicionário no boot:

| Atributo | Efeito |
| --- | --- |
| `data-i18n="k"` | `textContent` |
| `data-i18n-aria="k"` | `aria-label` |
| `data-i18n-attr="placeholder:k1;content:k2"` | atributos quaisquer (placeholders, `<meta content>`) |
| `data-i18n-html="k"` | conteúdo com marcação simples, ver abaixo |

O texto em pt-BR continua escrito no HTML (é o que aparece se o JS falhar); o dicionário pt-BR tem de ser idêntico a ele.

**`data-i18n-html`** existe para os cartões de ajuda e frases com `<b>`/teclas (`<span class="kc">`) no meio. Regras:
- Só para chaves do próprio repositório. Nunca passe dado externo (título de vídeo, nome de canal, URL) por ele.
- O valor passa por uma lista branca: `b`, `i`, `em`, `strong`, `small`, `br` e `span`, só com o atributo `class`. Qualquer outra tag vira texto; outros atributos são removidos.
- Prefira `data-i18n` dividindo a frase em trechos quando a marcação for só um elemento com `id` que o código preenche (ex.: `ui.share.invite_pre` + `#share-channel-name` + `ui.share.invite_post`).
- Nos dicionários, as chaves com HTML estão comentadas como `data-i18n-html`. Fora delas, **sem HTML nos valores**.

Elementos que o `main.js` reescreve em tempo de execução (rótulos de `#mAct`, número/mensagem da campainha, `#term-handle`, `#term-count`) **não** levam `data-i18n`, para que uma nova chamada a `applyStaticTranslations()` não apague o texto dinâmico.

## Boot, seletor e retomada (`boot.js`)

`index.html` chama, num `<script type="module">` **antes** de `src/main.js`:

```js
import { initI18nUI } from './src/i18n/boot.js';
initI18nUI();
```

`initI18nUI()` (idempotente): define `<html lang>`, traduz o DOM estático e `og:locale`, e monta o seletor `[PT] [EN] [ES]` no canto do `#card` (tela inicial) e na aba ESTOQUE do terminal (abaixo de LIMPAR CACHE, com o aviso "Trocar o idioma reinicia a locadora."). Os botões têm `aria-pressed`, `lang`, nome do idioma no `aria-label`/`title` e foco visível; no touch ficam com 44 px.

Ao clicar num idioma, `switchLocale(loc)`:
1. monta um snapshot: o que o provedor registrado devolver + `feed` (valor do `#feed`, se o provedor não mandou) + `locale`;
2. grava em `sessionStorage('rental_resume')` (`saveResume`);
3. `setLocale(loc)` (salva em `localStorage`);
4. se a URL tiver `?lang=`, troca o valor por `loc` (o resto da query string fica igual);
5. `location.reload()`.

### Como o `main.js` deve integrar

```js
import { setResumeProvider, consumeResume } from './i18n/boot.js';

// 1) No boot, antes de decidir entre o form e a loja:
var resume = consumeResume();   // lê e APAGA; null se não houver
if (resume) {
  // resume.session -> restaurar SESSION (só campos serializáveis)
  // resume.feed    -> $('#feed').value = resume.feed  (e, se resume.inside, clicar em #btGo para reentrar)
}

// 2) Uma vez, depois que SESSION e S existirem:
setResumeProvider(function () {
  return {
    session: JSON.parse(JSON.stringify(SESSION)),   // só o que for serializável
    feed: $('#feed').value,                         // link da entrada; se o canal foi trocado pelo terminal (#term-feed), mande o atual
    inside: S.phase === 'inside',
  };
});
```

`saveResume(obj)` e `consumeResume()` são genéricas (JSON em `sessionStorage`); o formato do snapshot é decidido pelo `main.js`. O mundo recomeça do estado inicial após o reload (efeito igual a um `resetWorld()`); a sessão (conquistas, tempo) volta pelo snapshot.

Outras exportações: `switchLocale(tag)`, `buildLangPicker('boot' | 'term')`, `RESUME_KEY`.

## Adicionar um idioma (ex.: `fr-FR`)

1. Crie a pasta `src/i18n/fr-FR/` copiando os 4 arquivos de `pt-BR/` (`ui.js`, `main.js`, `entities.js`, `scenes.js`) e traduza só os valores. Mantenha as chaves, os `{placeholders}` e a marcação das chaves `data-i18n-html`. Use as categorias de plural do idioma (`.one`, `.few`, `.many`, `.other`...). Deixe no topo de cada arquivo o aviso de revisão por falante nativo.
2. Crie o agregador `src/i18n/fr-FR.js` igual a `pt-BR.js`, trocando o locale e os caminhos (`merge('fr-FR', { ui, main, entities, scenes })`).
3. Em `index.js`: importe o agregador, adicione em `DICTIONARIES`, a família em `FAMILY` (`fr: 'fr-FR'`) e o rótulo em `LOCALE_LABELS` (`{ short: 'FR', name: 'Français (France)', og: 'fr_FR' }`). O seletor ganha o botão sozinho.
4. Rode `node tools/check-i18n.mjs`: ele encontra qualquer `xx-YY.js` em `src/i18n/` e compara chaves e placeholders com o `pt-BR` (não precisa ser editado, a menos que o nome do arquivo fuja do padrão `xx-YY.js`).
5. Abra o jogo com `?lang=fr` e confira tela inicial, HUD, terminal e texturas com texto (desktop e celular).
6. Peça revisão de um falante nativo.

## Ao escrever texto novo

- Chave estável em inglês no namespace do arquivo que a usa (`ui.share.title`, `toast.pickup`), nunca o texto como chave. Crie primeiro no `pt-BR/<namespace>.js`, depois nos outros idiomas.
- Strings com valores viram `{placeholders}` e `t('k', { name })`; plurais com `plural()`, nunca `n === 1 ? ... : ...`.
- Frase inteira numa chave (a ordem das palavras muda entre idiomas); não concatene pedaços traduzidos.
- No HTML, `data-i18n*`; no código, `t()`. Comandos digitáveis do terminal, nome do jogo, nomes próprios, autores/licenças e textos de `?debug` não traduzem.
