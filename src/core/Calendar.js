// O fliperama so funciona na sexta-feira (nos outros dias fica "fora de servico").
// Para testar em qualquer dia: ?arcade=on (ou ?arcade=off para forcar o aviso de manutencao).
export function arcadeOpen() {
  var q = new URLSearchParams(window.location.search).get('arcade');
  if (q === 'on') return true;
  if (q === 'off') return false;
  return new Date().getDay() === 5;
}
