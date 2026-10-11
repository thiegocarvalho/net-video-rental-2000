import { hash } from '../core/Utils.js';

// Cena gerada proceduralmente usada em dois lugares: como capa provisória de
// fita antes do thumbnail real carregar (Tape.js) e como "programação" da TV
// simulada enquanto o jogador assiste (ScreenFX.js). Era código duplicado —
// unificado aqui pra não precisar lembrar de corrigir nos dois lugares.
export function proceduralFrame(x,W,H,tp,t){
  var ch=Math.floor(t/42);
  var r=function(k){return hash(tp.seed*13.7+ch*7.3+k);};
  var type=(r(1)*3)|0,hue=(tp.hue+ch*41)%360,sat=tp.sat,i,j;
  var g=x.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'hsl('+hue+' '+sat+'% '+(8+r(2)*10)+'%)');
  g.addColorStop(1,'hsl('+((hue+50)%360)+' '+sat+'% '+(22+r(3)*14)+'%)');
  x.fillStyle=g;x.fillRect(0,0,W,H);
  if(type===0){
    var hz=H*.52;
    x.fillStyle='hsl('+((hue+20)%360)+' 90% 60%)';
    x.beginPath();x.arc(W*.5,hz-H*.06,H*.2,0,6.3);x.fill();
    x.fillStyle='hsl('+hue+' '+sat+'% '+(10+r(2)*8)+'%)';
    for(i=0;i<7;i++)x.fillRect(W*.28,hz-H*.24+i*H*.045,W*.44,H*.018);
    x.fillStyle='hsl('+((hue+200)%360)+' 40% 8%)';x.fillRect(0,hz,W,H-hz);
    x.strokeStyle='hsla('+((hue+180)%360)+' 90% 65%,.75)';x.lineWidth=Math.max(1,W/420);
    for(i=-9;i<=9;i++){x.beginPath();x.moveTo(W/2,hz);x.lineTo(W/2+i*W*.17,H);x.stroke();}
    for(j=0;j<11;j++){var f=(j+(t*.32)%1)/11,y=hz+(H-hz)*f*f;
      x.beginPath();x.moveTo(0,y);x.lineTo(W,y);x.stroke();}
  }else if(type===1){
    for(i=0;i<16;i++){var a=r(10+i);x.globalAlpha=.25;
      x.fillStyle='hsl('+((hue+a*120)%360)+' 80% 60%)';x.beginPath();
      x.arc((a*W+t*12*(a-.5)*4)%W,(hash(a*31)*H+Math.sin(t*.6+i)*H*.1+H)%H,H*.02+a*H*.05,0,6.3);
      x.fill();}
    x.globalAlpha=1;
    var bw=W*.34,bh=H*.18;
    var px=Math.abs(((t*46+r(4)*300)%(2*(W-bw)))-(W-bw));
    var py=Math.abs(((t*31+r(5)*200)%(2*(H-bh)))-(H-bh));
    x.fillStyle='hsl('+((hue+t*20)%360)+' 90% 62%)';x.fillRect(px,py,bw,bh);
    x.fillStyle='#0a0a0a';x.font='900 '+(bh*.5)+'px "Helvetica Neue",Arial';
    x.fillText('PLAY',px+bw*.16,py+bh*.68);
  }else{
    x.save();x.translate(Math.sin(t*1.7)*W*.012,Math.cos(t*1.3)*H*.012);
    x.fillStyle='hsl('+((hue+30)%360)+' '+(sat*.5)+'% 26%)';x.fillRect(-W*.1,H*.58,W*1.2,H*.5);
    x.fillStyle='hsl('+hue+' '+(sat*.4)+'% '+(16+r(6)*8)+'%)';x.fillRect(W*.08,H*.2,W*.3,H*.42);
    x.fillStyle='hsl('+((hue+180)%360)+' 80% '+(45+Math.sin(t*3)*10)+'%)';
    x.fillRect(W*.12,H*.25,W*.22,H*.16);
    x.fillStyle='hsl('+((hue+90)%360)+' 60% 30%)';
    x.beginPath();x.moveTo(W*.72,H*.62);x.lineTo(W*.82,H*.24);x.lineTo(W*.92,H*.62);
    x.closePath();x.fill();
    x.fillStyle='hsl('+((hue+300)%360)+' 70% '+(40+r(7)*20)+'%)';
    x.beginPath();x.arc(W*.55+Math.sin(t*.9)*W*.05,H*.46,H*.09,0,6.3);x.fill();
    x.restore();}
  x.fillStyle='rgba(0,0,0,.2)';x.fillRect(0,0,W,H*.06);x.fillRect(0,H*.94,W,H*.06);
}
