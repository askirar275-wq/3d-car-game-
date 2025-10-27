/* game.js - final integrated, robust & performance-tuned version
   Put this file in js/ and keep images/ at project root.
   If you keep game.js at root, IMG_PATHS still tries many candidates.
*/

/* ---------------- CONFIG ---------------- */
const IMG_PATHS = ["images/", "../images/", "./images/"]; // tried in order
const FRUITS = [
  "apple.png","banana.png","orange.png","strawberry.png",
  "watermelon.png","mango.png","papaya.png","pineapple.png","pomegranate.png"
];
const BOMB = "bomb.png";

/* --------- tuning -------- */
const GRAVITY = 0.28;
const THROW_VY_MIN = 18;
const THROW_VY_MAX = 22;
const VX_MAX = 2.2;
let SPAWN_INTERVAL = 900;

/* ---------- state & DOM ---------- */
let score = 0, lives = 3, coins = 0, level = 1;
let running = false, spawnTimer = null;
const active = [];
const area = document.getElementById('gameArea');
const statusText = document.getElementById('statusText');
const IMAGE_CACHE = {}; // filename -> loaded Image element

/* ---------- utility: try load image from many paths ---------- */
function loadImageFromCandidates(filename){
  return new Promise(async (resolve)=>{
    // try each candidate synchronously in order
    for(const base of IMG_PATHS){
      try {
        const url = base + filename;
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        resolve(img);
        return;
      } catch(e){}
    }
    // last: try filename directly
    try {
      const img = new Image();
      await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src = filename; });
      resolve(img);
      return;
    } catch(e){}
    resolve(null);
  });
}

/* ---------- preload all images (fast) ---------- */
async function preloadAllImages(){
  const list = FRUITS.concat([BOMB]);
  const promises = list.map(async (name)=>{
    if(IMAGE_CACHE[name]) return;
    const img = await loadImageFromCandidates(name);
    if(img) IMAGE_CACHE[name] = img;
  });
  await Promise.all(promises);
  console.log("Preload done:", Object.keys(IMAGE_CACHE));
}

/* ---------- optional: make near-white pixels transparent (same-origin) ---------- */
function tryMakeTransparent(img){
  return new Promise((resolve)=>{
    if(!img.complete){ img.addEventListener('load', ()=> tryMakeTransparent(img).then(resolve)); return; }
    try {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if(!w || !h){ resolve(false); return; }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img,0,0,w,h);
      const id = ctx.getImageData(0,0,w,h);
      const data = id.data;
      const tol = 230;
      for(let i=0;i<data.length;i+=4){
        if(data[i] >= tol && data[i+1] >= tol && data[i+2] >= tol) data[i+3] = 0;
      }
      ctx.putImageData(id,0,0);
      const url = c.toDataURL('image/png');
      img.src = url;
      resolve(true);
    } catch(e){
      // fails on CORS; just continue without conversion
      resolve(false);
    }
  });
}

/* ---------- layout cache ---------- */
let areaWidth = 0, areaHeight = 0;
function recalcArea(){
  const r = area.getBoundingClientRect();
  areaWidth = Math.max(1, Math.floor(r.width));
  areaHeight = Math.max(1, Math.floor(r.height));
  const trail = document.getElementById('trailCanvas');
  if(trail){
    trail.width = areaWidth;
    trail.height = areaHeight;
    trail.style.width = areaWidth + 'px';
    trail.style.height = areaHeight + 'px';
  }
}
window.addEventListener('resize', ()=> recalcArea());
setTimeout(recalcArea, 120);

/* ---------- rendering loop ---------- */
let last = performance.now();
function loop(now){
  const dt = Math.min(40, now - last) / 16.666;
  last = now;
  const maxY = areaHeight - 36;
  for(let i = active.length - 1; i >= 0; i--){
    const f = active[i];
    f.vy -= GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.vx * 0.7 * dt;

    if(f.y > maxY){
      f.y = maxY;
      f.vy = -Math.abs(f.vy) * 0.5;
    }

    f.el.style.transform = `translate3d(${f.x}px, ${-f.y}px, 0) rotate(${f.rot}deg)`;

    if(f.x < -300 || f.x > areaWidth + 300 || f.y < -500){
      if(f.el.parentNode) f.el.parentNode.removeChild(f.el);
      active.splice(i,1);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- spawn fruit ---------- */
function spawnFruit(specName, startX){
  if(!running) return;
  const name = specName || (Math.random() < 0.9 ? FRUITS[Math.floor(Math.random()*FRUITS.length)] : BOMB);
  const el = document.createElement('img');
  el.className = 'fruit';
  el.draggable = false;
  el.dataset.type = name;

  const size = Math.max(84, Math.min(140, areaWidth * 0.22));
  el.style.width = size + 'px';
  el.style.height = 'auto';

  const x = (typeof startX === 'number') ? startX : rand(40, Math.max(40, areaWidth - size - 40));
  const startY = -150;
  el.style.left = x + 'px';
  el.style.bottom = startY + 'px';

  // use preloaded image if available
  const cached = IMAGE_CACHE[name];
  if(cached){
    el.src = cached.src;
    // attempt one transparent conversion per cache item
    if(!cached.__transparentTried){
      cached.__transparentTried = true;
      tryMakeTransparent(cached).then(ok=>{
        if(ok){
          // update existing cache src (dataURL)
          IMAGE_CACHE[name] = cached;
        }
      });
    }
  } else {
    // fallback: try to load quickly (non-blocking)
    (async ()=>{
      const img = await loadImageFromCandidates(name);
      if(img) el.src = img.src;
    })();
  }

  area.appendChild(el);

  const vy = THROW_VY_MIN + Math.random() * (THROW_VY_MAX - THROW_VY_MIN);
  const vx = rand(-VX_MAX, VX_MAX);
  const rot = rand(-22,22);
  active.push({ el, x, y: startY, vx, vy, rot, type: name });
}

/* ---------- slicing detection & trail ---------- */
let isDown = false, points = [];
const MAX_POINTS = 20;
let lastPointerTime = 0;
const POINTER_THROTTLE = 16;
const trailCanvas = document.getElementById('trailCanvas');
const tctx = trailCanvas && trailCanvas.getContext ? trailCanvas.getContext('2d') : null;
let trailPoints = [];
const TRAIL_LIFE = 360;

function addTrailPoint(cx, cy){
  const r = area.getBoundingClientRect();
  const px = cx - r.left;
  const py = cy - r.top;
  trailPoints.push({ x: px, y: py, t: Date.now() });
  if(trailPoints.length > 40) trailPoints.shift();
}
function drawTrail(){
  if(!tctx){ requestAnimationFrame(drawTrail); return; }
  tctx.clearRect(0,0, trailCanvas.width, trailCanvas.height);
  const now = Date.now();
  for(let i=0;i<trailPoints.length-1;i++){
    const a = trailPoints[i], b = trailPoints[i+1];
    const age = now - a.t;
    const alpha = Math.max(0, 1 - age / TRAIL_LIFE);
    tctx.strokeStyle = `rgba(255,255,255,${0.18 * alpha})`;
    tctx.lineWidth = 10 * alpha + 2;
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

function addPointer(cx, cy){
  const now = Date.now();
  if(now - lastPointerTime < POINTER_THROTTLE) return;
  lastPointerTime = now;
  points.push({ x: cx, y: cy });
  if(points.length > MAX_POINTS) points.shift();
  addTrailPoint(cx, cy);
  if(points.length >= 2){
    const p1 = points[points.length - 2], p2 = points[points.length - 1];
    const snapshot = Array.from(active);
    for(const f of snapshot){
      const r = f.el.getBoundingClientRect();
      if(lineIntersectsRect(p1, p2, r)) splitFruit(f.el);
    }
  }
}

function onDown(e){ isDown = true; points = []; addPointer(e.clientX, e.clientY); e.preventDefault && e.preventDefault(); }
function onMove(e){ if(!isDown) return; addPointer(e.clientX, e.clientY); e.preventDefault && e.preventDefault(); }
function onUp(){ isDown = false; points = []; }
window.addEventListener('pointerdown', onDown, {passive:false});
window.addEventListener('pointermove', onMove, {passive:false});
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

/* ---------- split behavior ---------- */
function splitFruit(el){
  if(!el) return;
  const t = el.dataset.type;
  if(t === BOMB){
    lives = Math.max(0, lives - 1);
    playBombSound();
    if(lives <= 0) endGame();
  } else {
    score += 10; coins += 2;
    playSliceSound();
  }
  updateHUD();
  if(el.parentNode) el.parentNode.removeChild(el);
  for(let i=active.length-1;i>=0;i--) if(active[i].el === el) active.splice(i,1);
}

/* ---------- controls ---------- */
function updateHUD(){
  document.getElementById('score').textContent = score;
  document.getElementById('lives').textContent = lives;
  document.getElementById('coins').textContent = coins;
  document.getElementById('level').textContent = level;
  const c = document.getElementById('combo'); if(c) c.textContent = 'x1';
  statusText.textContent = running ? 'Running: YES' : 'Running: NO';
}

function startGame(){
  if(running) return;
  running = true;
  document.getElementById('bigStart').style.display = 'none';
  if(spawnTimer) clearInterval(spawnTimer);
  spawnTimer = setInterval(()=> spawnFruit(), Math.max(700, SPAWN_INTERVAL - level * 20));
  spawnFruit();
  updateHUD();
}
function pauseGame(){
  running = !running;
  if(!running && spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  if(running && !spawnTimer){ spawnTimer = setInterval(()=> spawnFruit(), Math.max(700, SPAWN_INTERVAL - level * 20)); }
  updateHUD();
}
function restartGame(){
  for(const f of Array.from(active)) if(f.el.parentNode) f.el.parentNode.removeChild(f.el);
  active.length = 0;
  score = 0; lives = 3; coins = 0; level = 1; running = false;
  document.getElementById('bigStart').style.display = 'block';
  if(spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  updateHUD();
}
function endGame(){
  running = false;
  if(spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  alert('Game Over! Score: ' + score);
  restartGame();
}

/* ---------- audio ---------- */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audio = AudioCtx ? new AudioCtx() : null;
function playTone(freq, type='sine', dur=0.06, vol=0.07){
  if(!audio) return;
  try{
    const now = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now + dur + 0.02);
  }catch(e){}
}
function playSliceSound(){ playTone(rand(520,760),'sine',0.05,0.06); }
function playBombSound(){ playTone(120,'sawtooth',0.12,0.14); setTimeout(()=>playTone(80,'sine',0.09,0.06),60); }

/* ---------- utils ---------- */
function rand(a,b){ return Math.random()*(b-a)+a; }
function lineIntersectsRect(p1,p2,rect){
  if((p1.x < rect.left && p2.x < rect.left) || (p1.x > rect.right && p2.x > rect.right) || (p1.y < rect.top && p2.y < rect.top) || (p1.y > rect.bottom && p2.y > rect.bottom)) return false;
  return true;
}

/* ---------- initialization ---------- */
(async function init(){
  // show debug in console
  console.log("game.js started — preloading images");
  await preloadAllImages();
  recalcArea();
  requestAnimationFrame(loop);
  drawTrail();

  // wire UI
  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('pauseBtn').addEventListener('click', pauseGame);
  document.getElementById('restartBtn').addEventListener('click', restartGame);
  document.getElementById('bigStart').addEventListener('click', startGame);

  updateHUD();
})();
