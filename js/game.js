/* FRUIT CUT GAME - LARGE FRUITS + FULL ARC FIXED */

const IMG_PATH = "images/";

const FRUITS = [
  "apple.png","banana.png","orange.png","strawberry.png",
  "watermelon.png","mango.png","papaya.png","pineapple.png","pomegranate.png"
];
const BOMB = "bomb.png";

let score=0,lives=3,coins=0,level=1;
let running=false,spawnTimer=null,spawnInterval=1200;
const active=[];const area=document.getElementById("gameArea");
const statusText=document.getElementById("statusText");

/* ---------- HUD ---------- */
function updateHUD(){
  document.getElementById("score").textContent=score;
  document.getElementById("lives").textContent=lives;
  document.getElementById("coins").textContent=coins;
  document.getElementById("level").textContent=level;
  document.getElementById("combo").textContent="x1";
  statusText.textContent=running?"Running: YES":"Running: NO";
}
function rand(a,b){return Math.random()*(b-a)+a;}

/* ---------- Physics Loop ---------- */
let last=performance.now();
function loop(t){
  const dt=Math.min(40,t-last)/16.666;
  last=t;

  const areaHeight = area.clientHeight;

  for(let i=active.length-1;i>=0;i--){
    const f=active[i];

    // gravity
    f.vy -= 0.38 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.vx * 0.8 * dt;

    // top bounce limiter
    if(f.y > areaHeight - 40){
      f.y = areaHeight - 40;
      f.vy = -Math.abs(f.vy)*0.55; // bounce a little
    }

    f.el.style.transform=`translate(${f.x}px, ${-f.y}px) rotate(${f.rot}deg)`;

    // remove if off-screen
    if(f.x < -200 || f.x > area.clientWidth + 200 || f.y < -300){
      if(f.el.parentNode) f.el.remove();
      active.splice(i,1);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- Spawn Fruit ---------- */
function spawnFruit(){
  if(!running)return;

  const name=Math.random()<0.9?FRUITS[Math.floor(Math.random()*FRUITS.length)]:BOMB;
  const img=document.createElement("img");
  img.className="fruit";
  img.src=IMG_PATH+name;
  img.draggable=false;

  const ar=area.getBoundingClientRect();
  // bigger fruits
  const w=Math.max(80, Math.min(130, ar.width*0.22));
  img.style.width=w+"px";

  // random x position
  const x=rand(40, ar.width-w-40);
  const startY=-150;
  img.style.left=x+"px";
  img.style.bottom=startY+"px";
  img.dataset.type=name;
  area.appendChild(img);

  // upward throw velocity → enough to reach top
  const vy = 24 + Math.random()*6; // more powerful upward throw
  const vx = rand(-3.0,3.0);
  const rot = rand(-25,25);

  active.push({el:img,x:x,y:startY,vx:vx,vy:vy,rot:rot,type:name});
}

/* ---------- Slice Fruit ---------- */
function splitFruit(el){
  if(!el)return;

  if(el.dataset.type===BOMB){
    lives=Math.max(0,lives-1);
    playBombSound();
    if(lives<=0)endGame();
  }else{
    score+=10;coins+=2;
    playSliceSound();
  }
  updateHUD();

  el.remove();
  active.splice(active.findIndex(f=>f.el===el),1);
}

/* ---------- Slice Detection ---------- */
let isDown=false,points=[];
function addPoint(x,y){
  points.push({x,y});
  if(points.length>18)points.shift();

  if(points.length>=2){
    const p1=points[points.length-2],p2=points[points.length-1];
    for(const f of Array.from(active)){
      const r=f.el.getBoundingClientRect();
      if(lineIntersectsRect(p1,p2,r))splitFruit(f.el);
    }
  }
}
function onDown(e){isDown=true;points=[];addPoint(e.clientX,e.clientY);}
function onMove(e){if(!isDown)return;addPoint(e.clientX,e.clientY);}
function onUp(){isDown=false;points=[];}
function lineIntersectsRect(p1,p2,rect){
  if((p1.x<rect.left&&p2.x<rect.left)||(p1.x>rect.right&&p2.x>rect.right)||(p1.y<rect.top&&p2.y<rect.top)||(p1.y>rect.bottom&&p2.y>rect.bottom))return false;
  return true;
}
window.addEventListener("pointerdown",onDown);
window.addEventListener("pointermove",onMove);
window.addEventListener("pointerup",onUp);

/* ---------- Controls ---------- */
function startGame(){
  if(running)return;
  running=true;
  document.getElementById("bigStart").style.display="none";
  if(spawnTimer)clearInterval(spawnTimer);
  spawnTimer=setInterval(()=>spawnFruit(),900);
  spawnFruit();
  updateHUD();
}
function pauseGame(){
  running=!running;
  if(!running&&spawnTimer){clearInterval(spawnTimer);spawnTimer=null;}
  if(running&&!spawnTimer){spawnTimer=setInterval(()=>spawnFruit(),900);}
  updateHUD();
}
function restartGame(){
  active.forEach(f=>f.el.remove());
  active.length=0;
  score=0;lives=3;coins=0;level=1;running=false;
  document.getElementById("bigStart").style.display="block";
  if(spawnTimer){clearInterval(spawnTimer);spawnTimer=null;}
  updateHUD();
}
function endGame(){
  running=false;
  if(spawnTimer){clearInterval(spawnTimer);spawnTimer=null;}
  alert("Game Over! Score: "+score);
  restartGame();
}

/* ---------- Sounds ---------- */
const AudioCtx=window.AudioContext||window.webkitAudioContext;
const audio=AudioCtx?new AudioCtx():null;
function playTone(freq,type='sine',dur=0.08,vol=0.08){
  if(!audio)return;
  try{
    const now=audio.currentTime;
    const o=audio.createOscillator();
    const g=audio.createGain();
    o.type=type;
    o.frequency.setValueAtTime(freq,now);
    g.gain.setValueAtTime(vol,now);
    g.gain.exponentialRampToValueAtTime(0.0001,now+dur);
    o.connect(g);
    g.connect(audio.destination);
    o.start(now);
    o.stop(now+dur+0.02);
  }catch(e){}
}
function playSliceSound(){playTone(rand(520,760),"sine",0.06,0.08);}
function playBombSound(){playTone(120,"sawtooth",0.12,0.16);setTimeout(()=>playTone(80,"sine",0.1,0.08),60);}

/* ---------- Buttons ---------- */
document.getElementById("startBtn").addEventListener("click",startGame);
document.getElementById("pauseBtn").addEventListener("click",pauseGame);
document.getElementById("restartBtn").addEventListener("click",restartGame);
document.getElementById("bigStart").addEventListener("click",startGame);

updateHUD();
