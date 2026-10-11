# Net Video Rental 2000 — Internacionalização (i18n)

**Status: implementado e ativo.** Este documento deixou de ser planejamento — o i18n está no ar em `pt-BR` (fonte), `en-GB` e `es-ES`, e passou a ser a **referência de arquitetura** do sistema. Cada seção continua dizendo **como foi feito**, **o que existe no código** e **os desafios**; as decisões antes marcadas com ❓ já foram tomadas (§12).

> Convenções do projeto continuam valendo (`CLAUDE.md`): ES modules sem bundler, Three.js r128, Conventional Commits sem co-autoria.

> **Estado da implementação** (✅ = feito; detalhes de uso em `src/i18n/README.md`):
> - ✅ Core: `src/i18n/index.js` com `t()`, `plural()` (= `tn`), detecção `?lang=` > `localStorage` > `navigator` > `pt-BR`, `applyStaticTranslations()` (= `applyDom`).
> - ✅ Dicionários por namespace (`src/i18n/<locale>/{ui,main,entities,scenes}.js` + agregadores) e `tools/check-i18n.mjs` (obrigatório antes de commitar).
> - ✅ `index.html` inteiro com `data-i18n*` (inclui `<meta>`, aria-labels, placeholders, cartões de ajuda, créditos estáticos, modais).
> - ✅ Seletor de idioma (tela inicial e aba ESTOQUE), reload com `rental_resume` (`src/i18n/boot.js`); `main.js` já registra o snapshot (`setResumeProvider`) e o consome no boot (`consumeResume`).
> - ✅ **Nenhuma string visível vive fora de `src/i18n/`**: HUD, toasts, terminal, créditos dinâmicos, conquistas, telas finais, texturas de canvas (placas, calendário, cartazes, bilhete) e todos os módulos de `entities/`.
> - ✅ Cobertura das features finais, incluindo as chaves mais recentes: `ui.hud.hint_keys` / `ui.hud.hint_touch`, toda a família `ui.actions.*` (botões do HUD móvel: `use`, `inspect`, `exit`, `play_pause`, `rewind`, …), `ent.cabinet.cant_drop_key` (a chave do armário não pode ser largada) e `ent.shotgun.clue` + `ent.shotgun.clue_poster_label` (a pista SAFE no pôster brutalista soviético revelado sob o cartaz de indicação).
> - Diferenças do plano: dicionários importados estaticamente (sem top-level await, §3.3: são pequenos e a detecção é síncrona); `data-i18n-html` com lista branca de tags para marcação simples do próprio repositório (§3.2/D4).
> - Fora de escopo por decisão (não é dívida): pseudo-locale, pôsteres por idioma (§6.1), `fmtDate`/`onLangChange` (Fase 2) e READMEs em inglês/espanhol.

---

## Sumário

1. [Idiomas e escopo](#1-idiomas-e-escopo)
2. [Diagnóstico do código atual](#2-diagnóstico-do-código-atual)
3. [Arquitetura](#3-arquitetura)
4. [Detecção do idioma](#4-detecção-do-idioma)
5. [O que traduzir e o que NÃO traduzir](#5-o-que-traduzir-e-o-que-não-traduzir)
6. [Desafios técnicos](#6-desafios-técnicos)
7. [Troca de idioma em jogo](#7-troca-de-idioma-em-jogo)
8. [Qualidade e ferramentas](#8-qualidade-e-ferramentas)
9. [Encaixe com o `FINAL_GAME_DESIGN.md`](#9-encaixe-com-o-final_game_designmd)
10. [Roteiro de implementação](#10-roteiro-de-implementação)
11. [Novo idioma e documentação](#11-novo-idioma-e-documentação)
12. [Perguntas em aberto](#12-perguntas-em-aberto)

---

## 1. Idiomas e escopo

| Código | Idioma | Papel |
|---|---|---|
| `pt-BR` | Português (Brasil) | idioma-fonte e fallback de chaves |
| `en-GB` | Inglês (Reino Unido) | |
| `es-ES` | Espanhol (Espanha) | |

Variantes caem na família: `en-*` → `en-GB`, `es-*` → `es-ES`, `pt-*` → `pt-BR`. Qualquer outro idioma → `pt-BR`. LTR apenas (sem árabe/hebraico).

---

## 2. Diagnóstico do código atual

Medição feita no código (linhas contendo caracteres acentuados, aproximação do volume de texto em português):

| Arquivo | Linhas c/ PT | Tipo de texto |
|---|---|---|
| `src/main.js` | ~86 (47 chamadas `toast`) | toasts, descrições de interação (`labelFor`), terminal/CLI, créditos, datas |
| `src/graphics/Textures.js` | ~81 | **texto desenhado em canvas** (calendário, neon, placas, avisos); `WEEKDAYS_PT`, meses |
| `index.html` | ~50 | HUD estático, form inicial, painéis do terminal, ajuda |
| `src/entities/CustomerEvent.js` | ~50 | camiseta ("FÃ Nº 1"), toasts |
| `src/scenes/interior/*.js` | ~110 | placas, rótulos, textos de props |
| `src/services/FeedApi.js` | ~23 | mensagens de erro, gêneros |
| demais | ~50 | `Audio.js` (comentários), `Tape.js`, `VCR.js` (OSD), `ScreenFX.js` |

Totais úteis: **57 `toast(`**, **112 `fillText(`**, 42 `innerHTML/textContent` em `main.js`, `lang="pt-BR"` fixo no `<html>`, e `WEEKDAYS_PT`/`wkPt`/`mnPt` fixos em `main.js` e `Textures.js`. Ordem de grandeza: **~350–450 strings** (ainda aumenta com os passos do `FINAL_GAME_DESIGN.md`).

---

## 3. Arquitetura

### 3.1 Estrutura

```text
src/i18n/
  index.js     detecção, carregamento, t(), tn(), fmtDate(), onLangChange()
  pt-BR.js     export default { chave: 'texto', ... }
  en-GB.js
  es-ES.js
tools/
  i18n-check.mjs   (script Node opcional: compara conjuntos de chaves)
```

Dicionários **planos** (`'hud.grab'`), agrupados por prefixo (`hud.`, `toast.`, `term.`, `tex.`, `ach.`, `credits.`, `customer.`, `file.`). Chave = identificador estável em inglês; **nunca** o próprio texto em português.

### 3.2 API

```js
t('toast.pickup', { name })        // interpolação: "Pegou: {name}"
tn('inventory.count', n)           // plural via Intl.PluralRules: chaves '.one' / '.other'
fmtDate(date, { weekday:'long', day:'numeric', month:'long' })   // Intl.DateTimeFormat(lang)
onLangChange(fn)                   // ver §7
getLang(), setLang(code)
```

- Interpolação por `{nome}`; sem `eval`, sem template engine.
- **Sem HTML nos dicionários.** Hoje há descrições do tipo `'<b>Fliperama</b><br><span class="warn">…</span>'` (`labelFor`). Separar em chaves de texto puro e deixar a marcação no código (ou `data-i18n` + `textContent`). Evita XSS e quebra de marcação por tradutor.
- Chave ausente no idioma ativo → cai no `pt-BR`; ausente também lá → devolve a própria chave (visível, fácil de achar). Em `?debug`, `console.warn` por chave faltante (uma vez).

### 3.3 Carregamento: **top-level await** (ponto crítico)

As cenas são construídas **no momento em que o módulo é importado** (`Interior.js`, `Exterior.js`, texturas procedurais em `Textures.js`). Logo `t()` precisa ter o dicionário pronto antes de qualquer um deles avaliar.

Solução: `src/i18n/index.js` usa **top-level await** (`const dict = (await import('./' + lang + '.js')).default`). Como todo módulo que usa `t()` importa `i18n/index.js` estaticamente, o navegador só avalia esses módulos depois que o await resolve. Suporte: Chrome 89+, Firefox 89+, Safari 15+ — compatível com o resto do projeto (import map).

- Carrega só o dicionário ativo + `pt-BR` (fallback). Os outros ficam sem baixar.
- A detecção do idioma tem que ser **síncrona** (§4), senão atrasaria o boot.

---

## 4. Detecção do idioma

Ordem de prioridade:

1. `?lang=en-GB` (links diretos, testes; também aceita `en`, `es`, `pt`). ✅ Válido, vira a preferência salva.
2. `localStorage('rental_lang')` — escolha explícita do jogador.
3. `navigator.languages` (primeiro que casar com uma família suportada).
4. `pt-BR`.

**Mudança em relação ao rascunho anterior: remover a geolocalização por IP.** Motivos:
- IP indica **país, não idioma** (turista, VPN, brasileiro morando na Espanha → idioma errado).
- Requisição a terceiro: **privacidade (LGPD/GDPR)**, aviso de cookies/consentimento, CORS, limite de requisições, ponto de falha, e atraso no boot. Incompatível com "sem backend, projeto aberto".
- `navigator.languages` já resolve quase todos os casos. A escolha manual cobre o resto.

`<html lang>` é atualizado em runtime (`document.documentElement.lang`) e o `<title>` também. ✅ (`initI18nUI()`; o `<title>` é só o nome do jogo e não muda; `<meta description>`, `og:*`, `twitter:*` e `og:locale` são traduzidos.)

---

## 5. O que traduzir e o que NÃO traduzir

### 5.1 Traduzir
- **HUD e DOM** (`index.html` via `data-i18n="chave"` / `data-i18n-title`, aplicado por `applyDom()`), form inicial, painéis do terminal, ajuda, descrições de interação, toasts, OSD do VCR/TV.
- **Texto desenhado em canvas** (inclui o que aparece sobre objetos 3D: caixas, fliperama, cartaz, placas): letreiro neon, calendário/placas, avisos do fliperama, camiseta do customer, capa/lombada das fitas (gênero), arquivo (papel) RUSBE, emblema/placas do herói e achievements.
- **Datas** via `Intl.DateTimeFormat` (acaba com `WEEKDAYS_PT`, `wkPt`, `mnPt`).
- **Achievements, créditos (rótulos), mensagens do terminal, HELP.**
- **Gêneros das fitas** (`FeedApi.js`): continuam atribuídos por `hash(índice)` (determinístico); só o **rótulo** vem de `t('genre.' + id)`. A capa de uma mesma fita não pode mudar de arte ao trocar de idioma.

### 5.2 NÃO traduzir (decisão deliberada)
- **Comandos secretos do terminal:** `zta`, `safe`, `hunt` são **iguais em todos os idiomas** (são chave de easter egg). Só os comandos "públicos" ganham alias (`help`/`ajuda`/`ayuda`).
- **Os `.glb` não têm texto pintado** (conferido: 13 dos 14 modelos só usam cores sólidas; o `car.glb` tem um PNG de 936 bytes, sem texto). Todo texto que aparece sobre os objetos (carimbo das caixas, telas do fliperama, cartaz, calendário, notas, placas) é **canvas gerado pelo código** e entra no i18n normal (§5.1), sem tocar em nenhum modelo de terceiros. Exceção: o carimbo "MANUFACTURE BY @THIEGOCARVALHO" é uma assinatura e fica igual em todos os idiomas.
- **Nomes próprios e créditos legais:** nomes de autores, títulos de modelos, licenças, nome do canal e **títulos dos vídeos** (vêm do YouTube) ficam como vieram. Só os rótulos ao redor são traduzidos.
- **Nome do jogo** ("Net Video Rental 2000"): fixo.
- **Áudio:** é síntese Web Audio sem fala; nada a traduzir.

---

## 6. Desafios técnicos

| # | Desafio | Onde dói | Solução |
|---|---|---|---|
| D1 | **Ordem de avaliação dos módulos** (cena montada no import) | `Interior.js`, `Exterior.js`, `Textures.js` | top-level await em `i18n/index.js` (§3.3) |
| D2 | **Texto em canvas muda de largura** (EN/ES costumam ser 15–30% maiores) | `Textures.js` (112 `fillText`), camiseta, placas | usar sempre `fitText`/`wrapLines` (já existem em `Utils.js`/`CustomerEvent.js`) em vez de coordenadas fixas; testar com pseudo-locale (§8) |
| D3 | **Texturas cacheadas** (`cached()` em `Utils.js`) | qualquer textura com texto | incluir o idioma na chave do cache **ou** garantir que a troca recarrega a página (§7) |
| D4 | **HTML dentro de strings** (`labelFor`, créditos, ajuda) | `main.js`, `index.html` | chaves de texto puro; marcação no código; nada de `innerHTML` com texto de dicionário |
| D5 | **Plural e gênero** ("1 fita / 2 fitas", "Pegou a/o …") | contadores, toasts | `tn()` com `Intl.PluralRules`; frases escritas sem concordância dependente de gênero ("Item: {name}") |
| D6 | **Datas e calendário** | `Textures.js` (`WEEKDAYS_PT`, semana/mês), `main.js` (toast de data) | `Intl.DateTimeFormat`/`Intl.RelativeTimeFormat`; início da semana (`Intl.Locale.weekInfo` não é universal) → tabela própria por idioma (en-GB e es-ES começam na segunda) |
| D7 | **Strings montadas por concatenação** (`'Semana ' + n + ' • ' + d + ' dias'`) | `Textures.js`, `main.js` | uma chave com placeholders por frase; ordem das palavras muda entre idiomas |
| D8 | **Glifos** (`ñ ¿ ¡ ç ã`) em fontes de canvas/CSS | HUD, texturas | fonte `sans-serif` já cobre; validar no canvas com a fonte pixelada se existir |
| D9 | **Fliperama só funciona na sexta** (`getDay()===5`) | `Calendar.js` | lógica independe de idioma; só os **avisos** traduzem |
| D10 | **Reset do mundo/sessão** (§7) | `World.js` | idioma é preferência do jogador, **não** é Mundo nem Sessão: vive em `localStorage` e sobrevive a tudo |
| D11 | **Dicionário crescendo à mão** (3 arquivos sincronizados) | todos | script `i18n-check` + convenção de PR (§8) |
| D12 | **Pôsteres com texto na imagem** | `posters/` | variantes por idioma só onde há texto, com fallback automático (§6.1) |
| D13 | **Terminal: parser de comandos** em PT | `main.js` (~700) | tabela `{ canonical: 'help', aliases: ['help','ajuda','ayuda','?'] }`, saída via `t()` |
| D14 | **Feed/erros de rede** | `FeedApi.js` | mensagens de erro viram chaves; `rss2json` devolve texto cru → não traduzir mensagens de terceiros |

### 6.1 Pôsteres e imagens
Hoje só existem `poster1.jpeg` e `poster2.jpeg`. Convenção: `posters/poster1.jpeg` (padrão, pt-BR) e `posters/en-GB/poster1.jpeg`, `posters/es-ES/…` **apenas quando a arte tem texto**. O carregador tenta a pasta do idioma e, em `onerror`, cai no padrão. Assim não triplicamos o peso do repositório sem necessidade, e o QR/arte sem texto é compartilhado.

---

## 7. Troca de idioma em jogo

O rascunho anterior propunha `window.location.reload()` direto. Problemas: **perde a sessão** (achievements e tempos do `SESSION`, §2 do `FINAL_GAME_DESIGN.md`), o canal carregado e a posição do jogador.

Proposta em duas fases:

**Fase 1 (recomendada, simples e segura): recarregar, mas sem perder nada.** ✅ Implementada em `src/i18n/boot.js` (`switchLocale`, `saveResume`, `consumeResume`, `setResumeProvider`); a restauração do `SESSION` depende da integração no `main.js`.
1. Antes do reload: `sessionStorage.setItem('rental_resume', JSON.stringify({ session: SESSION, channel: <id/URL do feed> }))`.
2. `localStorage.setItem('rental_lang', code)` e `location.reload()` mantendo `?channel_id=…`/`?playlist_id=…` na URL.
3. No boot, se existir `rental_resume`: restaura `SESSION` e reentra direto na locadora (sem o form), consumindo a chave.
4. O mundo recomeça do estado inicial — aceitável e coerente (é o mesmo efeito de um `resetWorld()`). O seletor avisa: "Trocar o idioma reinicia a locadora."

**Fase 2 (opcional, depois): troca ao vivo.**
- `onLangChange(fn)`: cada módulo registra o que refazer (DOM via `applyDom()`; texturas de canvas recriadas com `needsUpdate`; letreiro, calendário, camiseta, papel RUSBE).
- Exige que **toda** textura com texto seja reconstruível (D3) e que os `dispose()` sejam corretos (§16.2 do `FINAL_GAME_DESIGN.md`). Só vale o esforço se a Fase 1 incomodar.

**Seletor:**
- Aba **ESTOQUE** do terminal (como já planejado) **e** no **form inicial** (primeira impressão; quem chega com idioma errado precisa trocar antes de entrar). ✅ Botões `PT` / `EN` / `ES` (código em texto, nome do idioma no `aria-label`/`title`), `aria-pressed`, foco visível, 44 px no touch.
- **Não usar emoji de bandeira**: no Windows o Chrome não renderiza bandeiras (aparecem as letras "GB"/"ES"/"BR"). Usar o código em texto (`[ PT-BR ]`) ou bandeiras em CSS/pixel-art.

```text
[ IDIOMA / LANGUAGE / IDIOMA ]
 > [ PT-BR ] Português (Brasil)   *ativo*
 > [ EN-GB ] English (UK)
 > [ ES-ES ] Español (España)

Trocar o idioma reinicia a locadora.
```

(Os próprios nomes dos idiomas **não** são traduzidos: cada um aparece na sua língua.)

---

## 8. Qualidade e ferramentas

- **`tools/i18n-check.mjs`** (Node, sem dependências): compara as chaves de `en-GB`/`es-ES` com `pt-BR` e lista **faltantes**, **sobrando** e **placeholders divergentes** (`{name}` presente em um e não no outro). Não é "build"; roda à mão ou em CI no futuro.
- **Varredura de strings soltas:** script de grep para achar acentos/literais em `toast(`, `fillText(`, `innerHTML` fora de `i18n/` (ajuda a não regredir).
- **Pseudo-locale `?lang=pseudo`** (só com `?debug`): troca cada texto por uma versão +40% mais comprida e acentuada (`[!!! Ñéxt tåpé !!!]`). Revela estouro de layout em HUD e canvas **sem** precisar de tradutor.
- **Fallback visível em debug:** chave faltante aparece como `⟦chave⟧`.
- **Capturas por idioma:** reaproveitar os scripts de screenshot (puppeteer) para fotografar HUD, terminal, calendário, neon e camiseta nos 3 idiomas; revisar overflow.
- **Revisão de tradução:** `en-GB` e `es-ES` revisados por falante nativo antes do lançamento; marcar no PR quais chaves são tradução automática.

---

## 9. Encaixe com o `FINAL_GAME_DESIGN.md`

**Decisão original: o i18n era a ÚLTIMA etapa** (item 13 do §15 do `FINAL_GAME_DESIGN.md`), depois de todas as features, do polimento e da documentação em português — com todo texto novo **concentrado** (um objeto/constante por módulo, como `TERM_TXT` no terminal e a tabela em `Achievements.js`) para a migração ser mecânica. **Essa etapa foi executada:** a migração em bloco aconteceu e o `TXT` de cada módulo hoje é só um mapa de chamadas `t()`.

Regras que **continuam valendo** para toda feature nova:
- Nenhuma string visível fora de `src/i18n/` — o texto nasce com chave nos três dicionários.
- Nada de strings montadas por concatenação (D7): frases inteiras com valores em `{placeholders}`.
- Data/plural sempre via `Intl` (`plural()`), mesmo em português.
- `node tools/check-i18n.mjs` tem de passar antes do commit.

Regra a partir do i18n em diante: **nenhuma string visível ao jogador entra em arquivo `.js`/`.html` fora de `src/i18n/`**.

---

## 10. Roteiro de implementação

Um commit por passo (Conventional Commits).

1. ✅ (parcial: sem TLA, `fmtDate`, `onLangChange` e pseudo-locale) `feat(i18n): core` — `index.js` (TLA, detecção síncrona, `t`, `tn`, `fmtDate`, `onLangChange`, `applyDom`), 3 dicionários, `<html lang>`, `?lang`, pseudo-locale em `?debug`.
2. `refactor(i18n): hud e dom` — (✅ `index.html`; o resto é a migração dos `TXT`) `index.html` com `data-i18n`, `labelFor`, toasts, OSD, terminal (parser com aliases), créditos (rótulos).
3. `refactor(i18n): cenário` — `Textures.js` (neon, calendário, placas), camiseta, fitas/gêneros, avisos do fliperama, datas com `Intl`; `fitText`/`wrapLines` nos pontos de overflow.
4. ✅ `feat(i18n): seletor` — botões no form e na aba ESTOQUE, `rental_resume` (sessão sobrevive ao reload), aviso de reinício.
5. `feat(i18n): pôsteres` — carregador com subpasta + fallback.
6. ✅ (parcial: `tools/check-i18n.mjs`) `chore(i18n): ferramentas` — `tools/i18n-check.mjs`, varredura de strings soltas.
7. `docs`: `README.md`, `README.en.md`, `README.es.md`, atualizar `CLAUDE.md` (regra: sem string visível fora de `i18n/`).

Esforço relativo: passos 2 e 3 concentram ~80% do trabalho (muitas ocorrências espalhadas; ideal para subagentes por arquivo com um modelo menor, revisados em seguida).

---

## 11. Novo idioma e documentação

### Adicionar um idioma (ex.: `fr-FR`)
1. Copiar `pt-BR.js` para `fr-FR.js` e traduzir os valores.
2. Registrar em `SUPPORTED` e no mapa de famílias em `i18n/index.js`; incluir a tabela de início de semana/formato de data se divergir.
3. Adicionar o botão do seletor (nome do idioma na própria língua).
4. Rodar `i18n-check`, o pseudo-locale e as capturas de tela.

### README
Três arquivos na raiz: `README.md` (pt-BR, padrão), `README.en.md`, `README.es.md`, com links de troca no topo e as mesmas imagens/estrutura. Mantê-los sincronizados é parte do checklist de lançamento.

---

## 12. Perguntas em aberto

| # | Pergunta | Sugestão |
|---|---|---|
| I1 | Remover a geolocalização por IP? | **sim** (§4) |
| I2 | Troca de idioma: Fase 1 (reload preservando sessão) ou ir direto à troca ao vivo? | Fase 1 |
| I3 | Quem revisa `en-GB` e `es-ES`? | falante nativo antes do lançamento |
| I4 | Texto sobre objetos 3D? | já resolvido: é canvas do código, traduz normalmente; só a assinatura "MANUFACTURE BY" fica fixa |
| I5 | Comandos secretos (`zta`, `safe`, `hunt`) iguais em todos os idiomas? | sim |
| I6 | Pôsteres: quais têm texto e precisam de variante? | levantar quando o passo 5 chegar (hoje são só 2) |
| I7 | Quando entra o i18n? | decidido: por último (§9) |
| I8 | Idioma no form inicial além do terminal? | sim |
