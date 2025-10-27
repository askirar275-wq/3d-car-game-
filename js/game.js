/* game.js - Smooth version
   - object pooling for fruit DOM elements
   - cached layout, throttled pointer events
   - limited active objects, light trail
   - put this file in js/ replacing the old one
*/

/* ------------- Config (tweak these) ------------- */
const IMG_PATHS = ["images/", "../images/", "./images/"];
const FRUITS = ["apple.png","banana.png","orange.png","strawberry.png","watermelon.png","mango.png","papaya.png","pineapple.png","pomegranate.png"];
const BOMB = "bomb.png";

const MAX_ACTIVE = 9;        // max fruits on screen simultaneously (lower -> smoother)
const SPAWN_INTERVAL = 900;  // ms between spawns (increase if device slow)
const POINTER_THROTTLE = 22; // ms between pointer sampled positions (22 ms ~ 45 Hz)
const TRAIL_MAX = 28;        // trail points (lower -> less draw)
const TRAIL_LIFE = 320;      // ms trail fade
const GRAVITY = 0.28;
const VY_MIN = 18, VY_MAX = 22, VX_MAX = 2.1;

/* ----------------- State & DOM ------------------ */
const area = document.getElementById('gameArea');
const statusText = document.getElementById('statusText');

let score = 0, lives = 3, coins = 0, level = 1;
let running = false, spawnTimer = null;
const active = [];  // active fruit objects (pool references)
const pool = [];    // pooled DOM img elements (reusable)
const IMAGE_CACHE = {};

/* ------------- helper: preload images ------------- */
function loadImage(url){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(url);
    img.src = url;
  });
}
async function loadFromCandidates(filename){
  for(const base of IMG_PATHS){
    try {
      const img = await loadImage(base + filename);
      return img;
    } catch(e){}
  }
  // try direct name
  try{ const img = await loadImage(filename); return img; } catch(e){}
  return null;
}
async function preloadAll(){
  const list = FRUITS.concat([BOMB]);
  const tasks = list.map(async name => {
    if(IMAGE_CACHE[name]) return;
    const img = await loadFromCandidates(name);
    if(img) IMAGE_CACHE[name] = img;
  });
  await Promise.all(tasks);
  console.log('Images preloaded:', Object.keys(IMAGE_CACHE));
}

/* --------------- Layout cache ---------------- */
let areaW = 400, areaH = 540;
function recalcArea(){
  if(!area) return;
  const r = area.getBoundingClientRect();
  areaW = Math.max(1, Math.floor(r.width));
  areaH = Math.max(1, Math.floor(r.height));
  const canvas = document.getElementById('trailCanvas');
  if(canvas){ canvas.width = areaW; canvas.height = areaH; canvas.style.width = areaW + 'px'; canvas.style.height = areaH + 'px'; }
}
window.addEventListener('resize', ()=> recalcArea());
setTimeout(recalcArea, 120);

/* ---------------- pooling ---------------- */
function makePoolItem(){
  const el = document.createElement('img');
  el.className = 'fruit';
  el.draggable = false;
  el.style.position = 'absolute';
  el.style.willChange = 'transform,opacity';
  el.style.pointerEvents = 'none';
  el.style.background = 'transparent';
  return el;
}
function getPooledElement(){
  if(pool.length) return pool.pop();
  return makePoolItem();
}
function releaseElement(el){
  // cleanup styling and put back to pool
  el.style.transform = '';
  el.style.left = '0px';
  el.style.bottom = '0px';
  el.src = '';
  if(el.parentNode) el.parentNode.removeChild(el);
  pool.push(el);
}

/* ---------------- physics loop ---------------- */
let last = performance.now();
function loop(now){
  const dt = Math.min(40, now - last) / 16.666;
  last = now;
  const maxY = areaH - 36;

  // update active objects
  for(let i = active.length - 1; i >= 0; i--){
    const obj = active[i];
    obj.vy -= GRAVITY * dt;
    obj.x += obj.vx * dt;
    obj.y += obj.vy * dt;
    obj.rot += obj.vx * 0.7 * dt;

    if(obj.y > maxY){
      obj.y = maxY;
      obj.vy = -Math.abs(obj.vy) * 0.5;
    }

    // apply fast GPU transform (translate3d)
    obj.el.style.transform = `translate3d(${obj.x}px, ${-obj.y}px, 0) rotate(${obj.rot}deg)`;

    // cleanup off-screen
    if(obj.x < -300 || obj.x > areaW + 300 || obj.y < -500){
      releaseElement(obj.el);
      active.splice(i,1);
    }
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------------- spawn fruit ---------------- */
function spawnFruit(specName, startX){
  if(!running) return;
  if(active.length >= MAX_ACTIVE) return; // limit active count for smoothness

  const name = specName || (Math.random() < 0.92 ? FRUITS[Math.floor(Math.random()*FRUITS.length)] : BOMB);
  const el = getPooledElement();
  el.dataset.type = name;

  // choose size based on area width (keeps rendering predictable)
  const size = Math.max(78, Math.min(140, areaW * 0.22));
  el.style.width = size + 'px';
  el.style.height = 'auto';

  const x = (typeof startX === 'number') ? startX : rand(40, Math.max(40, areaW - size - 40));
  const startY = -140;
  el.style.left = x + 'px';
  el.style.bottom = startY + 'px';

  // set src from cache (fast) or fallback (non-blocking)
  const cached = IMAGE_CACHE[name];
  if(cached){
    el.src = cached.src;
  } else {
    // try quick load but do not block spawn
    loadFromCandidates(name).then(img=>{
      if(img) el.src = img.src;
    });
  }

  area.appendChild(el);

  const vy = VY_MIN + Math.random() * (VY_MAX - VY_MIN);
  const vx = rand(-VX_MAX, VX_MAX);
  const rot = rand(-20,20);
  active.push({ el, x, y: startY, vx, vy, rot, type: name });
}

/* ---------------- pointer / trail (throttled) ---------------- */
let isDown = false;
let pointerPoints = [];
let lastPointer = 0;
const trailCanvas = document.getElementById('trailCanvas');
const tctx = trailCanvas && trailCanvas.getContext ? trailCanvas.getContext('2d') : null;
let trailPoints = [];

function addTrailPoint(x,y){
  const rect = area.getBoundingClientRect();
  const px = x - rect.left;
  const py = y - rect.top;
  trailPoints.push({ x:px, y:py, t:Date.now() });
  if(trailPoints.length > TRAIL_MAX) trailPoints.shift();
}

function drawTrail(){
  if(!tctx){ requestAnimationFrame(drawTrail); return; }
  tctx.clearRect(0,0, trailCanvas.width, trailCanvas.height);
  const now = Date.now();
  for(let i=0;i<trailPoints.length-1;i++){
    const a = trailPoints[i], b = trailPoints[i+1];
    const age = now - a.t;
    const alpha = Math.max(0, 1 - age / TRAIL_LIFE);
    tctx.strokeStyle = `rgba(255,255,255,${0.14 * alpha})`;
    tctx.lineWidth = 8 * alpha + 2;
    tctx.lineCap = 'round';
    tctx.beginPath();
    tctx.moveTo(a.x, a.y);
    tctx.lineTo(b.x, b.y);
    tctx.stroke();
  }
  while(trailPoints.length && now - trailPoints[0].t > TRAIL_LIFE) trailPoints.shift();
  requestAnimationFrame(drawTrail);
}
requestAnimationFrame(drawTrail);

function handlePointer(clientX, clientY){
  const now = Date.now();
  if(now - lastPointer < POINTER_THROTTLE) return;
  lastPointer = now;
  pointerPoints.push({x:clientX,y:clientY});
  if(pointerPoints.length > 18) pointerPoints.shift();
  addTrailPoint(clientX, clientY);

  if(pointerPoints.length >= 2){
    const p1 = pointerPoints[pointerPoints.length - 2], p2 = pointerPoints[pointerPoints.length - 1];
    const snapshot = Array.from(active);
    for(const f of snapshot){
      const r = f.el.getBoundingClientRect();
      if(lineIntersectsRect(p1,p2,r)) splitFruit(f.el);
    }
  }
}

function onDown(e){ isDown = true; pointerPoints = []; handlePointer(e.clientX, e.clientY); e.preventDefault && e.preventDefault(); }
function onMove(e){ if(!isDown) return; handlePointer(e.clientX, e.clientY); e.preventDefault && e.preventDefault(); }
function onUp(){ isDown = false; pointerPoints = []; }
window.addEventListener('pointerdown', onDown, {passive:false});
window.addEventListener('pointermove', onMove, {passive:false});
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

/* ---------------- split logic ---------------- */
function splitFruit(el){
  if(!el) return;
  const type = el.dataset.type;
  if(type === BOMB){
    lives = Math.max(0, lives - 1);
    playBombSound();
    if(lives <= 0) endGame();
  } else {
    score += 10; coins += 2;
    playSliceSound();
  }
  updateHUD();
  // remove from active and release element back to pool
  for(let i=active.length-1;i>=0;i--) if(active[i].el === el){
    const obj = active.splice(i,1)[0];
    releaseElement(obj.el);
    break;
  }
}

/* ---------------- HUD, controls ---------------- */
function updateHUD(){
  const s = document.getElementById('score'); if(s) s.textContent = score;
  const l = document.getElementById('lives'); if(l) l.textContent = lives;
  const c = document.getElementById('coins'); if(c) c.textContent = coins;
  const lv = document.getElementById('level'); if(lv) lv.textContent = level;
  const cb = document.getElementById('combo'); if(cb) cb.textContent = 'x1';
  if(statusText) statusText.textContent = running ? 'Running: YES' : 'Running: NO';
}

function startGame(){
  if(running) return;
  running = true;
  const big = document.getElementById('bigStart'); if(big) big.style.display = 'none';
  if(spawnTimer) clearInterval(spawnTimer);
  spawnTimer = setInterval(()=> spawnFruit(), SPAWN_INTERVAL);
  spawnFruit();
  updateHUD();
}
function pauseGame(){
  running = !running;
  if(!running && spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  if(running && !spawnTimer){ spawnTimer = setInterval(()=> spawnFruit(), SPAWN_INTERVAL); }
  updateHUD();
}
function restartGame(){
  for(const obj of Array.from(active)) if(obj.el.parentNode) obj.el.parentNode.removeChild(obj.el);
  active.length = 0;
  score = 0; lives = 3; coins = 0; level = 1; running = false;
  const big = document.getElementById('bigStart'); if(big) big.style.display = 'block';
  if(spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  updateHUD();
}
function endGame(){
  running = false;
  if(spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  alert('Game Over! Score: ' + score);
  restartGame();
}

/* ---------------- audio ---------------- */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audio = AudioCtx ? new AudioCtx() : null;
function playTone(freq, type='sine', dur=0.06, vol=0.07){
  if(!audio) return;
  try{
    const now = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now+dur);
    o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now + dur + 0.02);
  } catch(e){}
}
function playSliceSound(){ playTone(rand(520,760),'sine',0.05,0.06); }
function playBombSound(){ playTone(120,'sawtooth',0.12,0.14); setTimeout(()=>playTone(80,'sine',0.09,0.06),60); }

/* ---------------- utils ---------------- */
function rand(a,b){ return Math.random()*(b-a)+a; }
function lineIntersectsRect(p1,p2,rect){
  if((p1.x < rect.left && p2.x < rect.left) || (p1.x > rect.right && p2.x > rect.right) || (p1.y < rect.top && p2.y < rect.top) || (p1.y > rect.bottom && p2.y > rect.bottom)) return false;
  return true;
}

/* ---------------- initialization ---------------- */
(async function init(){
  // preload images
  await preloadAll();
  // warm pool with a few elements to avoid allocation spikes
  for(let i=0;i<6;i++) pool.push(makePoolItem());
  recalcArea();
  requestAnimationFrame(loop);

  // wire UI
  const startBtn = document.getElementById('startBtn'); if(startBtn) startBtn.addEventListener('click', startGame);
  const pauseBtn = document.getElementById('pauseBtn'); if(pauseBtn) pauseBtn.addEventListener('click', pauseGame);
  const restartBtn = document.getElementById('restartBtn'); if(restartBtn) restartBtn.addEventListener('click', restartGame);
  const big = document.getElementById('bigStart'); if(big) big.addEventListener('click', startGame);

  updateHUD();
})();
