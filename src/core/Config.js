// Fonte do emulador do fliperama: pagina EMBED do archive.org (so o player, sem cabecalho nem rodape da pagina
// "details"). O embed sempre comeca mudo e nao tem controle de volume; o som so passa a existir depois do clique
// em "Click to Begin", que o jogador da dentro do fliperama. Ao levantar, main.js descarrega o iframe (silencio).
export var ARCADE_URL = 'https://archive.org/embed/arcade_kof97';

// O embed ocupa o iframe inteiro (player 4:3 sem faixas do site): iframe 640x480 centralizado verticalmente no
// quadrado 640x640 da tela; o jogo ocupa y 0..480 do iframe. As faixas pretas do Furnishings.js so cobrem o que
// sobra acima e abaixo do 4:3.
export var ARCADE_IFRAME_TOP = 80;
export var ARCADE_IFRAME_LEFT = 0;
export var ARCADE_GAME_TOP = 0, ARCADE_GAME_BOTTOM = 480;   // em y do iframe

// Jogo secreto do terminal (entrada escondida, ver CMD_GAME em main.js): pagina de incorporacao do archive.org (DOSBox). O jogo roda na
// tela 3D do computador; so comeca a carregar depois que alguem digita o comando.
export var GTA_URL = 'https://archive.org/embed/grand-theft-auto-1997-dma-design';

