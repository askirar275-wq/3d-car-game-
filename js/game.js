/* game.js - Next version: combo, trail, shop, ceiling-bounce */
/* Edit FRUITS array if your image filenames are different (Hindi names). */

const IMG_PATH = "../images/"; // from js/ folder to images/
const FRUITS = [
  "apple.png","orange.png","banana.png","strawberry.png",
  "watermelon.png","mango.png","papaya.png","pineapple.png","pomegranate.png"
];
const BOMB = "bomb.png";

/* Game state */
let score=0, lives=3, coins=0, level=1;
let running=false, spawnTimer=null, spawnInterval=900;
const active = [];
const area = document.getElementById("gameArea");
const statusText = document.getElementById("statusText");

/* Combo */
let lastSliceAt = 0, comboCount = 0;
const COMBO_WINDOW = 600; // ms
const COMBO_BONUS = 5; // extra per combo step

/* Shop data */
const SHOP_ITEMS = [
  { id:'bg-wood', name:'Wood background', price:30, className:'bg-wood' },
  { id:'bg-lake', name:'Lake background', price:50, className:'bg-lake' },
  { id:'bg-mountain', name:'Mountains', price:80, className:'bg-mountain' }
];
let owned = {}; // store purchased ids

/* Trail */
const trailCanvas = document.getElementById('trailCanvas');
const ctx = trailCanvas.getContext && trailCanvas.getContext('2d');
let trailPoints = [];
const TRAIL_LIFE = 400; // ms
const TRAIL_MAX_POINTS = 40;

/* utils */
function rand(a,b){ return Math.random()*(b-a)+a; }
function updateHUD(){
  document.getElementById("score").textContent = score;
  document.getElementById("lives").textContent = lives;
  document.getElementById("coins").textContent = coins;
  document.getElementById("level").textContent = level;
  document.getElementById("combo").textContent = comboCount + 'x';
  statusText.textContent = running ? "Running: YES" : "Running: NO";
}

/* resize trail canvas to area */
function resize() {
  const r = area.getBoundingClientRect();
  trailCanvas.width = Math.floor(r.width);
  trailCanvas.height = Math.floor(r.height);
  trailCanvas.style.width = r.width + 'px';
  trailCanvas.style.height = r.height + 'px';
  trailCanvas.style.left = r.left + 'px';
  trailCanvas.style.top = r.top + 'px';
  trailCanvas.style.position = 'absolute';
}
window.addEventListener('resize', resize);
setTimeout(resize,200);

/* physics loop with ceiling clamp */
let last = performance.now();
function loop(t){
  const dt = Math.min(40, t-last)/16.666;
  last = t;
  const areaRect = area.getBoundingClientRect();
  const maxY = areaRect.height - 30; // keep margin from top

  for(let i=active.length-1;i>=0;i--){
    const f = active[i];
    // gravity
    f.vy -= 0.36 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.vx * 0.8 * dt;

    // ceiling clamp / gentle bounce so they don't go off-screen
    if(f.y > maxY){
      f.y = maxY;
      // invert and damp velocity upward slightly
      f.vy = Math.min(f.vy, -Math.abs(f.vy)*0.55 - 2);
    }

    f.el.style.transform = `translate(${f.x}px, ${-f.y}px) rotate(${f.rot}deg)`;

    // off-screen bottom / sides cleanup
    if(f.x < -200 || f.x > areaRect.width + 200 || f.y < -300){
      if(f.el.parentNode) f.el.parentNode.removeChild(f.el);
      active.splice(i,1);
    }
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* spawn fruit */
function spawnFruit(spec, startX){
  if(!running) return;
  const name = spec || (Math.random() < 0.9 ? FRUITS[Math.floor(Math.random()*FRUITS.length)] : BOMB);
  const img = document.createElement('img');
  img.className = 'fruit';
  img.src = IMG_PATH + name;
  img.draggable = false;

  const r = area.getBoundingClientRect();
  const w = Math.max(46, Math.min(96, r.width * 0.13));
  img.style.width = w + 'px';

  const x = (typeof startX === 'number') ? startX : rand(16, Math.max(40, r.width - w - 16));
  const startY = -120; // spawn below bottom (so arc upward)
  img.style.left = x + 'px';
  img.style.bottom = (startY - 20) + 'px';
  img.dataset.type = name;
  area.appendChild(img);

  // initial velocities tuned so fruits arc but not too high
  const vy = 10 + Math.random()*6 + Math.min(6, r.height/200);
  const vx = rand(-2.2, 2.2);
  const rot = rand(-25, 25);
  active.push({ el: img, x:x, y:startY, vx: vx, vy: vy, rot: rot, type: name });
}

/* remove active mapping */
function removeActiveEl(el){
  for(let i=active.length-1;i>=0;i--){
    if(active[i].el === el){ active.splice(i,1); return; }
  }
}

/* split into halves with combo logic */
function splitFruit(el){
  if(!el) return;
  const now = Date.now();
  // combo update
  if(now - lastSliceAt <= COMBO_WINDOW){
    comboCount++;
  } else {
    comboCount = 1;
  }
  lastSliceAt = now;

  // points calculation: base + combo bonus
  const base = (el.dataset.type === BOMB) ? 0 : 10;
  const bonus = Math.max(0, (comboCount - 1) * COMBO_BONUS);
  const points = base + bonus;

  if(el.dataset.type === BOMB){
    lives = Math.max(0, lives-1); playBombSound();
    if(lives <= 0) endGame();
  } else {
    score += points;
    coins += 1 + Math.floor(comboCount/2); // extra coins on combo
    playSliceSound();
  }
  updateHUD();

  // remove original img
  if(el.parentNode) el.parentNode.removeChild(el);
  removeActiveEl(el);

  // halves visual pieces
  const rect = el.getBoundingClientRect();
  const parent = area.getBoundingClientRect();
  const cx = rect.left + rect.width/2 - parent.left;
  const cy = parent.bottom - (rect.top + rect.height/2);

  const left = document.createElement('img');
  const right = document.createElement('img');
  left.className = 'piece'; right.className = 'piece';
  left.src = right.src = el.src;
  left.style.width = rect.width + 'px'; left.style.height = rect.height + 'px';
  left.style.left = cx + 'px'; left.style.top = (parent.height - cy) + 'px';
  right.style.left = cx + 'px'; right.style.top = (parent.height - cy) + 'px';
  left.style.clipPath = 'inset(0 50% 0 0)'; right.style.clipPath = 'inset(0 0 0 50%)';
  area.appendChild(left); area.appendChild(right);

  let l = { el:left, x:cx, y:cy, vx:-2 - Math.random()*2, vy:8 + Math.random()*3, rot:-rand(10,60) };
  let r = { el:right, x:cx, y:cy, vx:2 + Math.random()*2, vy:8 + Math.random()*3, rot:rand(10,60) };
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

/* pointer slicing detection (approx) + trail handling */
let isDown=false, points=[];
function addPointToTrail(x,y){
  const r = area.getBoundingClientRect();
  const px = x - r.left;
  const py = y - r.top;
  trailPoints.push({x: px, y: py, t: Date.now()});
  if(trailPoints.length > TRAIL_MAX_POINTS) trailPoints.shift();
}
function drawTrail(){
  if(!ctx) return;
  ctx.clearRect(0,0,trailCanvas.width, trailCanvas.height);
  const now = Date.now();
  for(let i=0;i<trailPoints.length-1;i++){
    const a = trailPoints[i], b = trailPoints[i+1];
    const age = now - a.t;
    const alpha = Math.max(0, 1 - age / TRAIL_LIFE);
    ctx.strokeStyle = `rgba(255,255,255,${0.18*alpha})`;
    ctx.lineWidth = 12 * alpha;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // remove old
  while(trailPoints.length && now - trailPoints[0].t > TRAIL_LIFE) trailPoints.shift();
  requestAnimationFrame(drawTrail);
}
requestAnimationFrame(drawTrail);

function addPoint(x,y){
  points.push({x,y,ts:Date.now()});
  if(points.length>18) points.shift();
  addPointToTrail(x,y);
  if(points.length>=2){
    const p1 = points[points.length-2], p2 = points[points.length-1];
    for(const f of Array.from(active)){
      const r = f.el.getBoundingClientRect();
      if(lineIntersectsRect(p1,p2,r)) splitFruit(f.el);
    }
  }
}
function onDown(e){ isDown=true; points=[]; addPoint(e.clientX,e.clientY); e.preventDefault && e.preventDefault(); }
function onMove(e){ if(!isDown) return; addPoint(e.clientX,e.clientY); e.preventDefault && e.preventDefault(); }
function onUp(e){ isDown=false; points=[]; /* fade trail will clear */ }
function lineIntersectsRect(p1,p2,rect){
  if((p1.x<rect.left && p2.x<rect.left) || (p1.x>rect.right && p2.x>rect.right) || (p1.y<rect.top && p2.y<rect.top) || (p1.y>rect.bottom && p2.y>rect.bottom)) return false;
  return true;
}
window.addEventListener('pointerdown', onDown, {passive:false});
window.addEventListener('pointermove', onMove, {passive:false});
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

/* controls */
function startGame(){
  if(running) return;
  running = true;
  document.getElementById('bigStart').style.display = 'none';
  if(spawnTimer) clearInterval(spawnTimer);
  spawnTimer = setInterval(()=> spawnFruit(), Math.max(380, spawnInterval - level*30));
  spawnFruit();
  updateHUD();
}
function pauseGame(){
  running = !running;
  if(!running && spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  if(running && !spawnTimer){ spawnTimer = setInterval(()=> spawnFruit(), Math.max(380, spawnInterval - level*30)); }
  updateHUD();
}
function restartGame(){
  for(const f of Array.from(active)) if(f.el.parentNode) f.el.parentNode.removeChild(f.el);
  active.length = 0;
  score = 0; lives = 3; coins = 0; level = 1; running = false;
  document.getElementById('bigStart').style.display = 'block';
  if(spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  comboCount = 0; lastSliceAt = 0;
  updateHUD();
}
function endGame(){
  running = false;
  if(spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  alert('Game Over! Score: ' + score);
  restartGame();
}

/* sound */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audio = AudioCtx ? new AudioCtx() : null;
function playTone(freq, type='sine', dur=0.08, vol=0.08){
  if(!audio) return;
  try{
    const now = audio.currentTime;
    const o = audio.createOscillator(); const g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now+dur);
    o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now+dur+0.02);
  }catch(e){}
}
function playSliceSound(){ playTone(rand(520,760),'sine',0.06,0.06); }
function playBombSound(){ playTone(120,'sawtooth',0.12,0.14); setTimeout(()=>playTone(80,'sine',0.09,0.06),60); }

/* Shop UI */
const shopModal = document.getElementById('shopModal');
const shopList = document.getElementById('shopList');
function openShop(){
  shopList.innerHTML = '';
  SHOP_ITEMS.forEach(item => {
    const div = document.createElement('div'); div.className = 'shop-item';
    div.innerHTML = `<div style="height:70px;background:#f3f3f3;border-radius:6px;display:flex;align-items:center;justify-content:center">${item.name}</div>
      <div style="margin-top:6px">Price: ${item.price}</div>`;
    const btn = document.createElement('button');
    btn.textContent = owned[item.id] ? 'Apply' : `Buy ${item.price}`;
    btn.onclick = ()=> {
      if(owned[item.id]){
        // apply
        document.getElementById('gameWrapper').className = item.className;
        shopModal.classList.add('hidden');
      } else {
        if(coins < item.price){ alert('Not enough coins'); return; }
        coins -= item.price; owned[item.id] = true;
        updateHUD(); openShop();
      }
    };
    div.appendChild(btn);
    shopList.appendChild(div);
  });
  shopModal.classList.remove('hidden');
}
document.getElementById('shopBtn').addEventListener('click', openShop);
document.getElementById('shopClose').addEventListener('click', ()=> shopModal.classList.add('hidden'));

/* wire UI buttons */
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('pauseBtn').addEventListener('click', pauseGame);
document.getElementById('restartBtn').addEventListener('click', restartGame);
document.getElementById('bigStart').addEventListener('click', startGame);

/* heartbeat debug (optional) */
setInterval(()=>{ updateHUD(); }, 900);

/* initial resize and HUD */
setTimeout(()=>{ resize(); updateHUD(); }, 200);
