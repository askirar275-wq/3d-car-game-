/* game.js - separate file
   Uses images from ./images/
   Includes lots of console logs for Eruda/debugging
*/

const IMG_PATH = "images/";
const FRUITS = [
  "apple2.png","orange2.png","banana2.png","strawberry2.png",
  "watermelon2.png","mango2.png","papaya2.png","pineapple2.png","pomegranate2.png"
];
const BOMB = "bomb.png";

/* GAME STATE */
let score=0, lives=3, coins=0, level=1;
let running=false, spawnTimer=null, spawnInterval=900;
const active = [];
const area = document.getElementById("gameArea");
const statusEl = document.getElementById("statusText");

console.log('Game script loaded. IMG_PATH=', IMG_PATH, 'FRUITS=', FRUITS);

/* HUD */
function updateHUD(){
  document.getElementById("score").textContent = score;
  document.getElementById("lives").textContent = lives;
  document.getElementById("coins").textContent = coins;
  document.getElementById("level").textContent = level;
  statusEl.textContent = running ? "Running: YES" : "Running: NO";
}

/* UTIL */
function rand(a,b){ return Math.random()*(b-a)+a; }

/* PHYSICS LOOP (rAF) */
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
    // remove if off-screen
    if(f.x < -200 || f.x > area.clientWidth + 200 || f.y < -300){
      if(f.el.parentNode) f.el.parentNode.removeChild(f.el);
      active.splice(i,1);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* SPAWN FRUIT */
function spawnFruit(spec, startX){
  if(!running) return;
  const name = spec || (Math.random()<0.9 ? FRUITS[Math.floor(Math.random()*FRUITS.length)] : BOMB);
  const img = document.createElement("img");
  img.className = "fruit";
  img.src = IMG_PATH + name;
  img.draggable = false;
  // sizing responsive
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
  active.push({el:img, x:x, y:startY, vx: vx, vy: vy, rot:rot, type:name, w:w, h:w});
  console.debug('spawned', name, 'activeCount=', active.length);
}

/* REMOVE ACTIVE */
function removeActiveEl(el){
  for(let i=active.length-1;i>=0;i--){
    if(active[i].el === el){ active.splice(i,1); return; }
  }
}

/* SPLIT FRUIT (halves) */
function splitFruit(el){
  if(!el) return;
  const rect = el.getBoundingClientRect();
  const parent = area.getBoundingClientRect();
  const cx = rect.left + rect.width/2 - parent.left;
  const cy = parent.bottom - (rect.top + rect.height/2);

  // score / bomb logic
  if(el.dataset.type === BOMB){
    lives = Math.max(0, lives-1);
    playBombSound();
    console.warn('Bomb sliced! lives=', lives);
    if(lives<=0) endGame();
    updateHUD();
  } else {
    score += 10; coins += 2; playSliceSound(); updateHUD();
    console.log('Fruit sliced:', el.dataset.type, 'score=', score, 'coins=', coins);
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
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vx * 0.6;
      p.el.style.transform = `translate(${p.x}px, ${-p.y}px) rotate(${p.rot}deg)`;
      p.el.style.opacity = Math.max(0, 1 - (200 - p.y)/180);
      if(p.y < -240){ if(p.el.parentNode) p.el.parentNode.removeChild(p.el); parts.splice(i,1); }
    }
    if(parts.length) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* SLICING - pointer line vs rect */
let isDown=false, points=[];
function addPoint(x,y){ points.push({x,y,ts:Date.now()}); if(points.length>18) points.shift(); if(points.length>=2){ const p1=points[points.length-2], p2=points[points.length-1]; for(const f of Array.from(active)){ const r=f.el.getBoundingClientRect(); if(lineIntersectsRect(p1,p2,r)){ splitFruit(f.el); } } } }
function onDown(e){ isDown=true; points=[]; addPoint(e.clientX,e.clientY); console.debug('pointerdown', e.clientX, e.clientY); }
function onMove(e){ if(!isDown) return; addPoint(e.clientX,e.clientY); }
function onUp(){ isDown=false; points=[]; console.debug('pointerup'); }
function lineIntersectsRect(p1,p2,rect){ if((p1.x<rect.left&&p2.x<rect.left)||(p1.x>rect.right&&p2.x>rect.right)||(p1.y<rect.top&&p2.y<rect.top)||(p1.y>rect.bottom&&p2.y>rect.bottom)) return false; return true; }
window.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

/* CONTROLS */
function startGame(){ if(running) return; running=true; document.getElementById("bigStart").style.display='none'; updateHUD(); if(spawnTimer) clearInterval(spawnTimer); spawnTimer = setInterval(()=>spawnFruit(), Math.max(380, spawnInterval - level*30)); spawnFruit(); console.info('Game started'); }
function pauseGame(){ running = !running; if(!running && spawnTimer){ clearInterval(spawnTimer); spawnTimer=null; } if(running && !spawnTimer){ spawnTimer = setInterval(()=>spawnFruit(), Math.max(380, spawnInterval - level*30)); } updateHUD(); console.info('Pause toggled, running=', running); }
function restartGame(){ for(const f of Array.from(active)){ if(f.el.parentNode) f.el.parentNode.removeChild(f.el); } active.length=0; score=0; lives=3; coins=0; level=1; running=false; document.getElementById("bigStart").style.display='block'; if(spawnTimer){ clearInterval(spawnTimer); spawnTimer=null; } updateHUD(); console.info('Game restarted'); }
function endGame(){ running=false; if(spawnTimer){ clearInterval(spawnTimer); spawnTimer=null; } console.warn('Game Over! Score:', score); alert("Game Over! Score: "+score); restartGame(); }

/* SOUND (small synth) */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audio = AudioCtx ? new AudioCtx() : null;
function playTone(freq, type='sine', dur=0.08, vol=0.08){ if(!audio) return; try{ const now = audio.currentTime; const o = audio.createOscillator(); const g = audio.createGain(); o.type=type; o.frequency.setValueAtTime(freq, now); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now+dur); o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now+dur+0.02);}catch(e){console.debug('audio error', e);} }
function playSliceSound(){ playTone(rand(500,760),'sine',0.06,0.08); }
function playBombSound(){ playTone(120,'sawtooth',0.12,0.16); setTimeout(()=>playTone(80,'sine',0.1,0.08),60); }

/* WIRE BUTTONS */
document.getElementById("startBtn").addEventListener('click', startGame);
document.getElementById("pauseBtn").addEventListener('click', pauseGame);
document.getElementById("restartBtn").addEventListener('click', restartGame);
document.getElementById("bigStart").addEventListener('click', startGame);

/* Periodic debug status for eruda */
setInterval(()=>{
  console.debug('DEBUG STATUS → running:', running, 'spawnTimer:', !!spawnTimer, 'active:', active.length, 'score:', score, 'lives:', lives);
}, 1200);

/* Attempt auto-start (best-effort) */
window.addEventListener('load', ()=> setTimeout(()=> { try { startGame(); } catch(e){ console.warn('autostart failed', e); } }, 300) );

updateHUD();
console.log('Game initialized. Use Eruda (toggle button) to inspect console.');
