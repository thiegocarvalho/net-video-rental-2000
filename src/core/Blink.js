// Sumiço estilo Streets of Rage: o objeto apaga/acende 3 vezes e some de vez na 4ª.
// Usado pelos destroços da porta e pela lata de refrigerante jogada.
export var BLINK_STEP = 0.12;   // segundos por passo
export var BLINK_STEPS = 6;     // 6 passos = 3 piscadas; o 7º é o sumiço

// t = segundos desde o início do pisca. Retorna 0 (apagado), 1 (aceso) ou 2 (sumiu).
export function blinkState(t) {
  var i = Math.floor(t / BLINK_STEP);
  if (i >= BLINK_STEPS) return 2;
  return (i % 2 === 1) ? 1 : 0;
}
