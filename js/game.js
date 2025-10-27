/* game.js - tuned for your Hindi-named images */

const IMG_PATH = "images/";
// filenames shown in your repo screenshots (if different, edit these)
const FRUITS = [
  "सेब.png",
  "नारंगी.png",
  "केला.png",
  "स्ट्रॉबेरी.png",
  "तरबूज़.png",
  "आम.png",
  "पपीता.png",
  "अनानास.png",
  "अनार.png"
];
const BOMB = "बम.png";

/* state */
let score=0, lives=3, coins=0, level=1;
let running=false, spawnTimer=null, spawnInterval=900;
const active = [];
const area = document.getElementById("gameArea");
const statusEl = document.getElementById("statusText");

function updateHUD(){
  document.getElementById("score").textContent = score;
  document.getElementById("lives").textContent = lives;
  document.getElementById("coins").textContent = coins;
  document.getElementById("level").textContent = level;
  statusEl.textContent = running ? "Running: YES" : "Running: NO";
}
function rand(a,b){ return Math.random()*(b-a)+a; }

/* main physics loop */
let last = performance.now();
function loop(t){
  const dt = Math.min(40, t-last)/16.666;
  last = t;
  for(let i=active.length-1;i>=0;i--){
    const f = active[i];
    f.vy -= 0.36 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.vx * 0.8 * dt;
    f.el.style.transform = `translate(${f.x}px, ${-f.y}px) rotate(${f.rot}deg)`;
    if(f.x < -200 || f.x > area.clientWidth + 200 || f.y < -300){
      if(f.el.parentNode) f.el.parentNode.removeChild(f.el);
      active.splice(i,1);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* spawn */
function spawnFruit(spec, startX){
  if(!running) return;
  const name = spec || (Math.random()<0.9 ? FRUITS[Math.floor(Math.random()*FRUITS.length)] : BOMB);
  const img = document.createElement("img");
  img.className = "fruit";
  img.src = IMG_PATH + name;
  img.draggable = false;

  const ar = area.getBoundingClientRect();
  const w = Math.max(48, Math.min(96, ar.width * 0.13));
  img.style.width = w + "px";

  const x = (typeof startX === 'number') ? startX : rand(16, Math.max(40, ar.width - w - 16));
  const startY = -120;
  img.style.left = x + "px";
  img.style.bottom = (startY - 20) + "px";
  img.style.transform = `translate(${x}px, ${-startY}px)`;

  img.dataset.type = name;
  area.appendChild(img);

  const vy = 10 + Math.random()*6;
  const vx = rand(-2.2,2.2);
  const rot = rand(-25,25);
  active.push({el:img, x:x, y:startY, vx:vx, vy:vy, rot:rot, type:name, w:w, h:w});
}

/* remove helper */
function removeActiveEl(el){
  for(let i=active.length-1;i>=0;i--){
    if(active[i].el === el){ active.splice(i,1); return; }
  }
}

/* split into halves */
function splitFruit(el){
  if(!el) return;
  const rect = el.getBoundingClientRect();
  const parent = area.getBoundingClientRect();
  const cx = rect.left + rect.width/2 - parent.left;
  const cy = parent.bottom - (rect.top + rect.height/2);

  if(el.dataset.type === BOMB){
    lives = Math.max(0, lives-1);
    playBombSound();
    if(lives <= 0) endGame();
    updateHUD();
  } else {
    score += 10; coins += 2; playSliceSound(); updateHUD();
  }

  if(el.parentNode) el.parentNode.removeChild(el);
  removeActiveEl(el);

  const left = document.createElement("img");
  const right = document.createElement("img");
  left.className = "piece"; right.className = "piece";
  left.src = right.src = el.src;
  left.style.width = rect.width + "px"; left.style.height = rect.height + "px";
  right.style.width = rect.width + "px"; right.style.height = rect.height + "px";
  left.style.left = cx + "px"; left.style.top = (parent.height - cy) + "px";
  right.style.left = cx + "px"; right.style.top = (parent.height - cy) + "px";
  left.style.clipPath = "inset(0 50% 0 0)"; right.style.clipPath = "inset(0 0 0 50%)";
  area.appendChild(left); area.appendChild(right);

  let l = {el:left, x:cx, y:cy, vx:-2 - Math.random()*2, vy:8 + Math.random()*3, rot:-rand(10,60)};
  let r = {el:right, x:cx, y:cy, vx:2 + Math.random()*2, vy:8 + Math.random()*3, rot:rand(10,60)};
  const parts = [l,r];
  function step(){
    for(let i=parts.length-1;i>=0;i--){
      const p = parts[i];
      p.vy -= 0.34;
      p.x += p.vx; p.y += p.vy; p.rot += p.vx * 0.6;
      p.el.style.transform = `translate(${p.x}px, ${-p.y}px) rotate(${p.rot}deg)`;
      p.el.style.opacity = Math.max(0, 1 - (200 - p.y)/180);
      if(p.y < -240){ if(p.el.parentNode) p.el.parentNode.removeChild(p.el); parts.splice(i,1); }
    }
    if(parts.length) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* slicing detection */
let isDown=false, points=[];
function addPoint(x,y){ points.push({x,y,ts:Date.now()}); if(points.length>18) points.shift(); if(points.length>=2){ const p1=points[points.length-2], p2=points[points.length-1]; for(const f of Array.from(active)){ const r=f.el.getBoundingClientRect(); if(lineIntersectsRect(p1,p2,r)){ splitFruit(f.el); } } } }
function onDown(e){ isDown=true; points=[]; addPoint(e.clientX,e.clientY); }
function onMove(e){ if(!isDown) return; addPoint(e.clientX,e.clientY); }
function onUp(){ isDown=false; points=[]; }
function lineIntersectsRect(p1,p2,rect){ if((p1.x<rect.left&&p2.x<rect.left)||(p1.x>rect.right&&p2.x>rect.right)||(p1.y<rect.top&&p2.y<rect.top)||(p1.y>rect.bottom&&p2.y>rect.bottom)) return false; return true; }
window.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

/* controls */
function startGame(){ if(running) return; running=true; document.getElementById("bigStart").style.display='none'; updateHUD(); if(spawnTimer) clearInterval(spawnTimer); spawnTimer = setInterval(()=>spawnFruit(), Math.max(380, spawnInterval - level*30)); spawnFruit(); }
function pauseGame(){ running = !running; if(!running && spawnTimer){ clearInterval(spawnTimer); spawnTimer=null; } if(running && !spawnTimer){ spawnTimer = setInterval(()=>spawnFruit(), Math.max(380, spawnInterval - level*30)); } updateHUD(); }
function restartGame(){ for(const f of Array.from(active)){ if(f.el.parentNode) f.el.parentNode.removeChild(f.el); } active.length=0; score=0; lives=3; coins=0; level=1; running=false; document.getElementById("bigStart").style.display='block'; if(spawnTimer){ clearInterval(spawnTimer); spawnTimer=null; } updateHUD(); }
function endGame(){ running=false; if(spawnTimer){ clearInterval(spawnTimer); spawnTimer=null; } alert("Game Over! Score: "+score); restartGame(); }

/* audio synth */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audio = AudioCtx ? new AudioCtx() : null;
function playTone(freq, type='sine', dur=0.08, vol=0.08){ if(!audio) return; try{ const now = audio.currentTime; const o = audio.createOscillator(); const g = audio.createGain(); o.type=type; o.frequency.setValueAtTime(freq, now); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now+dur); o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now+dur+0.02);}catch(e){} }
function playSliceSound(){ playTone(rand(500,760),'sine',0.06,0.08); }
function playBombSound(){ playTone(120,'sawtooth',0.12,0.16); setTimeout(()=>playTone(80,'sine',0.1,0.08),60); }

/* wire buttons */
document.getElementById("startBtn").addEventListener('click', startGame);
document.getElementById("pauseBtn").addEventListener('click', pauseGame);
document.getElementById("restartBtn").addEventListener('click', restartGame);
document.getElementById("bigStart").addEventListener('click', startGame);

/* debug heartbeat (console/eruda) */
setInterval(()=>{ console.debug('STATUS', {running, spawn:!!spawnTimer, active: active.length, score, lives}); }, 1200);

updateHUD();
