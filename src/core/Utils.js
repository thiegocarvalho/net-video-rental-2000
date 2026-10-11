import * as THREE from 'three';

export function cv(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
// tex(canvas, repeatX, repeatY, opts) or tex(canvas, opts).
// Default: smooth (Linear mag, trilinear mipmapped min, anisotropy 4).
// opts.pixel -> crisp Nearest (tiny sprites / LED displays).
// opts.dynamic -> Linear, no mipmaps (canvases redrawn every frame).
export function tex(c,rx,ry,opts){
  if(rx&&typeof rx==='object'){opts=rx;rx=1;ry=1;}
  rx=rx||1;ry=ry||1;opts=opts||{};
  var t=new THREE.CanvasTexture(c);
  if(rx!==1||ry!==1){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry);}
  else t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  if(opts.pixel){
    t.generateMipmaps=false;
    t.magFilter=t.minFilter=THREE.NearestFilter;
    t.anisotropy=1;
  }else if(opts.dynamic){
    t.generateMipmaps=false;
    t.magFilter=t.minFilter=THREE.LinearFilter;
    t.anisotropy=1;
  }else{
    t.generateMipmaps=true;
    t.magFilter=THREE.LinearFilter;
    t.minFilter=THREE.LinearMipmapLinearFilter;
    t.anisotropy=4; // clamped by three to the GPU maximum
  }
  return t;
}
export function hash(n){var v=Math.sin(n*127.1)*43758.5453;return v-Math.floor(v);}
// Seeded PRNG (mulberry32) so procedural textures are identical every load.
export function rng(seed){
  var a=(seed|0)||1;
  return function(){
    a=(a+0x6D2B79F5)|0;
    var t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
var _rnd=rng(1337);
export function speck(x,w,h,n,a){
  x.globalAlpha=a;
  for(var i=0;i<n;i++){
    x.fillStyle=_rnd()>.5?'#000':'#fff';
    x.fillRect((_rnd()*w)|0,(_rnd()*h)|0,1,1);
  }
  x.globalAlpha=1;
}
// 4x4 ordered (Bayer) dither overlay: cheap pattern fill, no per-pixel loop.
var _bayer=null;
export function dither(x,w,h,a){
  if(!_bayer){
    var m=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5],b=cv(4,4),bx=b.getContext('2d');
    for(var i=0;i<16;i++){
      var v=m[i]/15;
      bx.fillStyle=v>.5?'rgba(255,255,255,'+((v-.5)*2)+')':'rgba(0,0,0,'+((.5-v)*2)+')';
      bx.fillRect(i%4,(i/4)|0,1,1);
    }
    _bayer=bx.createPattern(b,'repeat');
  }
  x.save();x.globalAlpha=a;x.fillStyle=_bayer;x.fillRect(0,0,w,h);x.restore();
}
// Downscale an image/canvas into a small power-of-two canvas and posterize it.
export function pixelate(img,w,h,levels){
  var c=cv(w,h),x=c.getContext('2d');
  x.imageSmoothingEnabled=true;
  coverImg(x,img,0,0,w,h);
  if(levels){
    var d=x.getImageData(0,0,w,h),p=d.data,s=255/(levels-1);
    for(var i=0;i<p.length;i+=4){
      p[i]=Math.round(p[i]/s)*s;p[i+1]=Math.round(p[i+1]/s)*s;p[i+2]=Math.round(p[i+2]/s)*s;
    }
    x.putImageData(d,0,0);
  }
  return c;
}
var _cache={};
export function cached(key,fn){return _cache[key]||(_cache[key]=fn());}
export function wrapLines(x, txt, W, font, maxLines) {
  x.font = font;
  var words = String(txt).split(/\s+/), lines = [], cur = '';
  for (var i = 0; i < words.length; i++) {
    var t = cur ? cur + ' ' + words[i] : words[i];
    if (x.measureText(t).width > W && cur) {
      lines.push(cur);
      cur = words[i];
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  if (maxLines && lines.length > maxLines) {
    lines.length = maxLines;
    if (lines[maxLines - 1] && !lines[maxLines - 1].endsWith('…')) {
      lines[maxLines - 1] = lines[maxLines - 1] + '…';
    }
  }
  for (var j = 0; j < lines.length; j++) {
    if (x.measureText(lines[j]).width > W) {
      while (lines[j].length > 3 && x.measureText(lines[j] + '…').width > W) {
        lines[j] = lines[j].slice(0, -1);
      }
      lines[j] = lines[j] + '…';
    }
  }
  return lines;
}
export function coverImg(x,img,dx,dy,dw,dh){
  var sc=Math.max(dw/img.width,dh/img.height),w=img.width*sc,h=img.height*sc;
  x.drawImage(img,dx+(dw-w)/2,dy+(dh-h)/2,w,h);
}

export function safeDisposeTexture(t) {
  if (t && typeof t.dispose === 'function') {
    try { t.dispose(); } catch (e) {}
  }
}

// DJB2 em hex. Serve para comparar as entradas secretas do terminal sem deixar a
// palavra digitavel em texto plano no fonte (uma busca por ela no DevTools nao acha nada).
export function cmdHash(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return (h >>> 0).toString(16);
}
