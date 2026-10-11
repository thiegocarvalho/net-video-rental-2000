// Mistura central dos sons "do mundo": curva de distancia unica, oclusao pela porta da loja e "ducking"
// (a TV abaixa quando toca algo importante: alarme, explosao, tensao do evento do cliente).
// Vale para tudo que o jogo controla (TV do YouTube, alarme, sons procedurais). O iframe do fliperama e
// de outro dominio e nao expoe volume, entao o navegador nao deixa o jogo atenua-lo.

// Ganho 0..1 por distancia: 1 ate `ref`, depois queda exponencial suave e fade a zero perto de `maxD`.
export function distanceGain(d, ref, rolloff, maxD) {
  if (d <= ref) return 1;
  var g = Math.pow(ref / d, rolloff);
  var fadeStart = maxD * 0.7;
  if (d > fadeStart) g *= Math.max(0, (maxD - d) / (maxD - fadeStart));
  return g;
}

// Fonte DENTRO da loja ouvida por quem esta fora: a porta fechada abafa quase tudo; aberta/explodida deixa passar.
export function shopOcclusion(playerZ, doorOpen) {
  if (playerZ <= 6.1) return 1;
  return doorOpen ? 0.7 : 0.1;
}

export var mix = { duck: 1, duckTarget: 1 };
// duckTarget: 1 = normal; menor = abaixa os sons de fundo (TV). Transicao suave a cada quadro.
export function setDuck(target) { mix.duckTarget = target; }
export function updateMix(dt) {
  var k = Math.min(1, dt * (mix.duckTarget < mix.duck ? 6 : 1.5));   // abaixa rapido, volta devagar
  mix.duck += (mix.duckTarget - mix.duck) * k;
}

// Teto do YouTube quando o jogador NAO esta assistindo (0..1): deixa espaco para alarme, passos, porquinho etc.
// A distancia/oclusao/ducking multiplicam por cima. Assistindo (S.watching) vai a 1. Ajuste aqui.
export var TV_UNFOCUSED_CEIL = 0.30;

// Volume 0..100 do YouTube da TV para a distancia/posicao atuais.
export function tvVolume(distToTv, playerZ, doorOpen, watching) {
  var g = watching ? 1 : TV_UNFOCUSED_CEIL * distanceGain(distToTv, 1.8, 1.1, 16) * shopOcclusion(playerZ, doorOpen);
  return Math.round(Math.max(0, Math.min(1, g * mix.duck)) * 100);
}
