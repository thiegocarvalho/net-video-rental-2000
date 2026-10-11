# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto segue [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Scaffold de i18n em `src/i18n/` (ainda não ligado ao jogo) e `tools/check-i18n.mjs`.
- Arquivos de comunidade: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, templates do GitHub e CI de verificação.

## [0.1.0]

### Adicionado
- Locadora 3D em primeira pessoa (Three.js r128, ES modules, sem build) que transforma o feed de um canal ou playlist do YouTube em fitas VHS numa estante; pegar, inspecionar, inserir no videocassete e assistir na TV de tubo (player do YouTube via CSS3DRenderer).
- Cena exterior (fachada, estacionamento, carro, árvores, postes) e interior com colisões, malhas estáticas fundidas e visual PS1 / Windows 95.
- Terminal do caixa no monitor 3D (abas TERMINAL, ESTOQUE, CRÉDITOS e CONQUISTAS), fliperama KOF '97 nas sextas-feiras e ventilador de mesa interativo.
- Áudio sintetizado com Web Audio, mixagem por distância, oclusão pela porta e ducking.
- Cliente misterioso com cronograma por tempo de jogo, jumpscare e final secreto do herói (fogos, lua com o logo do canal).
- Segredos e conquistas: lixeira quebrável, reciclagem e moedas, porquinho e papel ZTA, arma e comando `safe`, armário com cadeado, modo HUNT, tela final com créditos e compartilhamento.
- `resetWorld()` único e separação entre estado de Mundo e de Sessão.
- Controles de toque (joystick e botões), terminal em tela cheia e FOV retrato para celulares.
- Cache do feed no `localStorage` com TTL de 1 hora e botão LIMPAR CACHE.
- Parâmetros de link direto (`?channel_id=`, `?playlist_id=`, `?id=`, `?c=`) e `?debug`.
- Polimento do HUD, foco visível, atributos de acessibilidade e `data-i18n` no HTML.

### Alterado
- Projeto renomeado para Net Video Rental 2000.
- Globais de depuração e tecla C expostos só com `?debug`.

### Corrigido
- Vários ajustes de texto, colisão, arma, caixas de papelão e contadores do cliente ao longo do desenvolvimento.

[Não lançado]: ../../compare/v0.1.0...HEAD
[0.1.0]: ../../releases/tag/v0.1.0
