// Reset do mundo e estado de sessao (ver FINAL_GAME_DESIGN.md, secao 2).
//
// Duas camadas de estado:
//  - MUNDO (`S.*` e o estado interno de cada sistema): volta ao inicial a cada resetWorld().
//  - SESSAO (`SESSION.*`): sobrevive ao resetWorld(); so resetSession() (novo jogo) a zera.
//
// Cada sistema registra a propria restauracao com onWorldReset(fn, order) no momento em que e criado;
// resetWorld() chama todas, da menor `order` para a maior (empate = ordem de registro). Este modulo nao
// importa nada, entao qualquer arquivo pode depender dele sem criar ciclos.
//
// Ordens usadas: -30 UI/entradas abertas e itens na mao, -20 fisica de itens arremessados,
// -10 deck/VCR, 0 mundo "solto" (default), 10 reposicionar o que depende dos anteriores (fitas, TV, jogador).

function freshSession() {
  return {
    achievements: {},          // id -> { t } (tempo de sessao em que foi obtido)
    sessionStart: null,         // definido na 1a entrada na loja (markSessionStart); sobrevive aos resets
    moonBranded: false,        // a lua mantem a logo do canal depois do heroi
    huntMode: false,           // modo HUNT ativo (guarda: sem customer)
    customerDisabled: false,   // o customer nao aparece mais (heroi concluido)
    helpUsed: false,           // HELP do terminal e de uso unico
    cabinetOpened: false,      // libera o HUNT mesmo com o armario fechado de novo apos o reset
    cansInBin: 0,              // latas descartadas na lixeira (contador da sessao)
    paperGone: false,          // o papel do comando ZTA ja foi lido e sumiu: nao volta para lugar nenhum (so em novo jogo)
    sharePosterFallen: false   // o cartaz de indicacao descolou e sumiu (compartilhamento concluido): o poster
                               // sovietico com a pista do SAFE fica a vista pelo resto da sessao, mesmo apos reset
  };
}

export var SESSION = freshSession();

// Chamado ao fim do walkIn: so a primeira entrada da sessao marca o inicio do relogio dos achievements.
export function markSessionStart() { if (SESSION.sessionStart == null) SESSION.sessionStart = performance.now(); }

var resetters = [];
var sessionResetters = [];

// Registra a restauracao de um sistema. fn(opts) recebe { reason } de resetWorld(opts).
// Retorna uma funcao que desregistra.
export function onWorldReset(fn, order) {
  var r = { fn: fn, order: order || 0, seq: resetters.length };
  resetters.push(r);
  resetters.sort(function(a, b) { return a.order - b.order || a.seq - b.seq; });
  return function() { var i = resetters.indexOf(r); if (i >= 0) resetters.splice(i, 1); };
}

// Registra algo a limpar so quando a sessao inteira recomeca (novo jogo).
export function onSessionReset(fn) { sessionResetters.push(fn); }

// reason: 'nightmare' (jumpscare) | 'hero' (fim do heroi) | 'title' (voltou ao form) | 'debug'.
export function resetWorld(opts) {
  opts = opts || {};
  var list = resetters.slice();    // um resetter pode (des)registrar outro sem estragar a iteracao
  for (var i = 0; i < list.length; i++) {
    try { list[i].fn(opts); } catch (e) { console.error('[resetWorld] falha em um resetter:', e); }
  }
}

// Novo jogo: zera a sessao (e o mundo, que nao pode sobreviver a ela).
export function resetSession(opts) {
  var fresh = freshSession();
  for (var k in SESSION) delete SESSION[k];
  Object.assign(SESSION, fresh);
  for (var i = 0; i < sessionResetters.length; i++) {
    try { sessionResetters[i](); } catch (e) { console.error('[resetSession] falha:', e); }
  }
  resetWorld(Object.assign({ reason: 'newgame' }, opts || {}));
}

// Atalhos de depuracao/testes (o jogo importa as funcoes; nada le estes globais): so com ?debug.
if (/[?&]debug\b/.test(location.search)) {
  window.resetWorld = resetWorld;
  window.SESSION = SESSION;
}
