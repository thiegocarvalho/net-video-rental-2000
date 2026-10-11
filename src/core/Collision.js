// Solidos: retangulos alinhados aos eixos {x1,x2,z1,z2,h,y0?,prop?} ou caixas ORIENTADAS (carro, que
// esta girado) {obb:true,cx,cz,hx,hz,rot,h}. Os dois guardam x1..z2 (para descartar rapido).
// rot = rotation.y do objeto no Three: x = lx*cos + lz*sin ; z = -lx*sin + lz*cos.

export function makeObb(cx, cz, hx, hz, rot, h) {
  var c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  var ex = hx * c + hz * s, ez = hx * s + hz * c;   // AABB que envolve a caixa girada
  return { obb: true, cx: cx, cz: cz, hx: hx, hz: hz, rot: rot, cos: Math.cos(rot), sin: Math.sin(rot),
           x1: cx - ex, x2: cx + ex, z1: cz - ez, z2: cz + ez, h: h };
}

export function toLocal(s, x, z, out) {
  var dx = x - s.cx, dz = z - s.cz;
  out.x = dx * s.cos - dz * s.sin;
  out.z = dx * s.sin + dz * s.cos;
  return out;
}

export function toWorldDir(s, lx, lz, out) {   // direcao/offset local -> mundo (sem translacao)
  out.x = lx * s.cos + lz * s.sin;
  out.z = -lx * s.sin + lz * s.cos;
  return out;
}

var _l = { x: 0, z: 0 }, _w = { x: 0, z: 0 };

// Empurra o ponto p (jogador, raio R) para fora do solido. Retorna true se mexeu.
export function pushOut(s, p, R) {
  if (s.prop) return false;
  if (!s.obb) {
    if (!(p.x > s.x1 - R && p.x < s.x2 + R && p.z > s.z1 - R && p.z < s.z2 + R)) return false;
    var dl = Math.abs(p.x - (s.x1 - R)), dr = Math.abs(p.x - (s.x2 + R));
    var db = Math.abs(p.z - (s.z1 - R)), df = Math.abs(p.z - (s.z2 + R));
    var m = Math.min(dl, dr, db, df);
    if (m === dl) p.x = s.x1 - R; else if (m === dr) p.x = s.x2 + R;
    else if (m === db) p.z = s.z1 - R; else p.z = s.z2 + R;
    return true;
  }
  toLocal(s, p.x, p.z, _l);
  if (!(Math.abs(_l.x) < s.hx + R && Math.abs(_l.z) < s.hz + R)) return false;
  var px = s.hx + R - Math.abs(_l.x), pz = s.hz + R - Math.abs(_l.z);
  if (px < pz) _l.x = (_l.x < 0 ? -1 : 1) * (s.hx + R); else _l.z = (_l.z < 0 ? -1 : 1) * (s.hz + R);
  toWorldDir(s, _l.x, _l.z, _w);
  p.x = s.cx + _w.x; p.z = s.cz + _w.z;
  return true;
}

// O ponto (x,z) esta dentro do solido (sem raio)?
export function inside(s, x, z) {
  if (!s.obb) return x > s.x1 && x < s.x2 && z > s.z1 && z < s.z2;
  toLocal(s, x, z, _l);
  return Math.abs(_l.x) < s.hx && Math.abs(_l.z) < s.hz;
}

// Item (c: {vx,vz}) saiu pela lateral de s ao ir de (px,pz) para p: repoe a posicao e reflete a velocidade.
export function bounceOff(s, c, p, px, pz, k) {
  if (!s.obb) {
    var inX = px > s.x1 && px < s.x2;
    if (inX) { p.z = pz; c.vz *= -k; } else { p.x = px; c.vx *= -k; }
    return;
  }
  toLocal(s, px, pz, _l);
  var cameThroughZ = Math.abs(_l.x) < s.hx;       // antes estava alinhado em x -> bateu na face de z
  p.x = px; p.z = pz;
  var vlx = c.vx * s.cos - c.vz * s.sin, vlz = c.vx * s.sin + c.vz * s.cos;
  if (cameThroughZ) vlz *= -k; else vlx *= -k;
  toWorldDir(s, vlx, vlz, _w);
  c.vx = _w.x; c.vz = _w.z;
}
