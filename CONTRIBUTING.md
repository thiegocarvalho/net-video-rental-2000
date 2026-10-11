# Contribuindo para o Net Video Rental 2000

Obrigado pelo interesse! O jogo é um projeto puramente frontend em JavaScript puro e **Three.js r128**, em módulos ES carregados direto pelo navegador: **não há build, bundler, `package.json` nem lint**. Ao participar, você concorda em seguir o [Código de Conduta](CODE_OF_CONDUCT.md).

Licença: [GNU General Public License v3.0 (GPLv3)](LICENSE).

Para a arquitetura, leia o `CLAUDE.md` e o `FINAL_GAME_DESIGN.md`; para internacionalização, `I18N_DESIGN.md` e `src/i18n/README.md`.

## 1. Rodando localmente

O jogo precisa ser servido por HTTP (CORS de texturas e modelos), não por `file://`:

```bash
npx http-server -p 8080 -c-1
```

Abra `http://localhost:8080/`. Links diretos: `?channel_id=UC...`, `?playlist_id=PL...`, `?id=...`, `?c=...`.

Use **`?debug`** para ver `#fps`/`#diag` e habilitar os globais de teste (`window.S`, `resetWorld`, `spawnCustomerNow`, tecla C etc.). Scripts de teste devem carregar com `?debug`.

## 2. Verificações antes do PR

Não há suíte de testes. Rode:

```bash
node --check --input-type=module < src/caminho/do/arquivo.js   # sintaxe de cada arquivo alterado
node tools/check-i18n.mjs                                      # dicionários com as mesmas chaves
```

O workflow `.github/workflows/check.yml` faz as duas coisas em todos os arquivos. Teste também no navegador, com `?debug`.

## 3. Convenções

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `chore:`), pequenos e focados. Mensagens em português.
- **Estética**: PS1 / Windows 95. Baixo poligonismo, texturas pequenas com `THREE.NearestFilter`, névoa, paleta suja. Não há modo de baixa resolução: o visual vem da arte, não do render.
- **Desempenho**: evite alocações por frame e escritas redundantes no DOM. Malhas estáticas são fundidas por `mergeStatic()`; **tudo cujo transform muda depois da construção precisa de `userData.dynamic = true`**.
- **Colisão**: mobiliário novo ganha entrada em `solids` (com `h`); clicáveis vão em `interactables`.
- **Estado**: novo estado de mundo registra um resetter com `onWorldReset(fn, order)` em `core/World.js`; não restaure à mão.
- **Não edite** `patch_*.js` nem `scratch/`: são resíduos de scripts pontuais.
- **Modelos 3D**: use como fornecidos (sem decalques ou textos adicionados), coloque em `models/` com um `.credits.txt` ao lado (autor, link, licença CC0 ou CC-BY) e atualize os créditos do README.

## 4. Adicionando decorações

Em `src/scenes/interior/Furnishings.js` (ou no builder correspondente):

```js
loadModel('models/meu_objeto.glb').then(function (mdl) {
  fitModel(mdl, ALTURA_DESEJADA);
  psxModel(mdl);          // Lambert + filtro nearest
  mdl.position.set(X, Y, Z);
  scene.add(mdl);
});
```

Para peças primitivas use `boxAt(scene, w, h, d, material, x, y, z, [rotY])` e `planeAt(...)`.

## 5. Internacionalização

Idiomas: `pt-BR` (fonte), `en-GB` e `es-ES`. Tudo fica em `src/i18n/` (detalhes em `src/i18n/README.md`; plano em `I18N_DESIGN.md`):

```text
src/i18n/index.js              t(), plural(), detecção (?lang= > localStorage > navegador > pt-BR)
src/i18n/boot.js               traduz o index.html, seletor de idioma, saveResume()/consumeResume()
src/i18n/<locale>.js           agregador do idioma (merge dos namespaces)
src/i18n/<locale>/ui.js        index.html e interface (prefixo ui.*)
src/i18n/<locale>/main.js      src/main.js
src/i18n/<locale>/entities.js  src/entities/*
src/i18n/<locale>/scenes.js    cenas, texturas e serviços
```

Regras para texto visível ao jogador:

- **Nenhuma string visível fica fora de `src/i18n/`.** No código use `t('chave', { params })` e `plural('chave', n)`; no HTML, `data-i18n`, `data-i18n-aria`, `data-i18n-attr` ou, só para marcação simples do próprio repositório, `data-i18n-html`.
- Chave nova nasce no `pt-BR/<namespace>.js` do arquivo que a usa, com o prefixo daquele namespace; depois vá para `en-GB` e `es-ES`. Mesmos `{placeholders}` em todos.
- Frases inteiras por chave (sem concatenar pedaços), sem HTML nos valores (exceto as chaves de `data-i18n-html`).
- Não traduza: comandos digitáveis do terminal, nome do jogo, nomes próprios, autores e licenças, textos de `?debug`, logs de console.
- Textos em canvas mudam de largura entre idiomas: use `wrapLines`/ajuste de fonte e confira com `?lang=en` e `?lang=es`.

### Traduzindo ou adicionando um idioma

1. Crie `src/i18n/<locale>/` com cópias de `pt-BR/{ui,main,entities,scenes}.js` e traduza só os valores (deixe o aviso de revisão no topo).
2. Crie o agregador `src/i18n/<locale>.js` (igual ao `pt-BR.js`, com o novo locale).
3. Registre em `src/i18n/index.js`: import, `DICTIONARIES`, `FAMILY` e `LOCALE_LABELS` (o seletor ganha o botão sozinho).
4. `node tools/check-i18n.mjs` (descobre os agregadores `xx-YY.js` sozinho) e teste no navegador com `?lang=<código>`, no desktop e no celular.

Traduções novas precisam de revisão de falante nativo; marque no PR quais chaves ainda não foram revisadas.

## 6. Pull requests

Descreva a mudança e como testar, preencha o checklist do template e mantenha o PR pequeno. Para relatos de segurança, veja o [SECURITY.md](SECURITY.md).
