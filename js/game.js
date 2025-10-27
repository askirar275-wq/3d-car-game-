/* Updated game.js
   - tries multiple image paths so images show reliably
   - slower, smoother fruit motion but still reach top
   - keeps transparent conversion attempt (if same-origin)
*/

/* possible image paths to try (in order) */
const IMG_PATHS = ["images/", "../images/", "./images/"];

/* fruit filenames (english) */
const FRUITS = [
  "apple.png","banana.png","orange.png","strawberry.png",
  "watermelon.png","mango.png","papaya.png","pineapple.png","pomegranate.png"
];
const BOMB = "bomb.png";

/* state */
let score = 0, lives = 3, coins = 0, level = 1;
let running = false, spawnTimer = null, spawnInterval = 1000; // spawn every 1s
const active = [];
const area = document.getElementById('gameArea');
const statusText = document.getElementById('statusText');

/* helper to try load image from multiple base paths */
function tryLoadSrc(imgElement, relativePathList, filename, callback){
  // attempts sequentially until one loads
  let i = 0;
  function tryOnce(){
    if(i >= relativePathList.length){
      callback(false); // failed all
      return;
    }
    const base = relativePathList[i++];
    const url = base + filename;
    imgElement.onload = ()=> { imgElement.onload = null; callback(true, url); };
    imgElement.onerror = ()=> {
      imgElement.onerror = null;
      // try next after short delay
      setTimeout(tryOnce, 20);
    };
    // set src (this triggers load/error)
    imgElement.src = url;
  }
  tryOnce();
}

/* convert near-white pixels to transparent when same-origin */
function makeImageTransparent(img, callback){
  if(!img.complete){ img.addEventListener('load', ()=> makeImageTransparent(img, callback), {once:true}); return; }
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if(!w || !h){ if(callback) callback(null); return; }
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(img,0,0,w,h);
    const id = ctx.getImageData(0,0,w,h);
    const data = id.data;
    const tol = 225;
    for(let p=0;p<data.length;p+=4){
      const r=data[p], g=data[p+1], b=data[p+2];
      if(r>=tol && g>=tol && b>=tol){ data[p+3] = 0; }
    }
    ctx.putImageData(id,0,0);
    const url = tmp.toDataURL('image/png');
    img.src = url;
    if(callback) callback(url);
  } catch(e) {
    // CORS or other error
    console.warn('makeImageTransparent failed:', e);
    if(callback) callback(null);
  }
}

/* HUD */
function updateHUD(){
  document.getElementById('score').textContent = score;
  document.getElementById('lives').textContent = lives;
  document.getElementById('coins').textContent = coins;
  document.getElementById('level').textContent = level;
  const comboEl = document.getElementById('combo');
  if(comboEl) comboEl.textContent = 'x1';
  statusText.textContent = running ? 'Running: YES' : 'Running: NO';
}

/* physics params tuned for slower smoother motion */
const GRAVITY = 0.26; // smaller gravity => slower fall
const THROW_VY_MIN = 16; // smaller throw so movement slower but still reach top
const THROW_VY_MAX = 20;
const VX_MAX = 2.2;

/* physics loop */
let last = performance.now();
function loop(t){
  const dt = Math.min(40, t-last)/16.666;
  last = t;
  const areaRect = area.getBoundingClientRect();
  const maxY = areaRect.height - 30;
  for(let i=active.length-1;i>=0;i--){
    const f = active[i];
    f.vy -= GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.vx * 0.8 * dt;

    // clamp to top area with slight bounce
    if(f.y > maxY){
      f.y = maxY;
      f.vy = -Math.abs(f.vy) * 0.45; // smaller bounce, gentler
    }

    f.el.style.transform = `translate(${f.x}px, ${-f.y}px) rotate(${f.rot}deg)`;

    // cleanup off-screen
    if(f.x < -300 || f.x > areaRect.width + 300 || f.y < -500){
      if(f.el.parentNode) f.el.parentNode.removeChild(f.el);
      active.splice(i,1);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* spawnFruit tries multiple paths automatically */
function spawnFruit(specKey, startX){
  if(!running) return;
  const nameKey = specKey || (Math.random() < 0.9 ? FRUITS[Math.floor(Math.random()*FRUITS.length)] : BOMB);
  const img = document.createElement('img');
  img.className = 'fruit';
  img.draggable = false;
  img.dataset.type = nameKey;

  // display size bigger
  const ar = area.getBoundingClientRect();
  const size = Math.max(84, Math.min(140, ar.width * 0.22));
  img.style.width = size + 'px';
  img.style.height = 'auto';

  // pick initial x and y (spawn below)
  const x = (typeof startX === 'number') ? startX : rand(40, Math.max(40, ar.width - size - 40));
  const startY = -150;
  img.style.left = x + 'px';
  img.style.bottom = startY + 'px';

  // first try to load image via multiple candidate paths
  tryLoadSrc(img, IMG_PATHS, nameKey, function(ok, usedUrl){
    if(!ok){
      // failed all tries — show small red square as placeholder and still create entity
      img.style.background = '#f8cccc';
      img.style.width = size + 'px';
      img.alt = nameKey;
    } else {
      // image loaded successfully (usedUrl available)
      // attempt to make near-white transparent (same-origin)
      makeImageTransparent(img, function(result){
        // if result null -> conversion failed due to CORS; image remains original
      });
    }
  });

  area.appendChild(img);

  // slower upward throw but enough to reach top
  const vy = THROW_VY_MIN + Math.random() * (THROW_VY_MAX - THROW_VY_MIN);
  const vx = rand(-VX_MAX, VX_MAX);
  const rot = rand(-22,22);
  active.push({ el: img, x: x, y: startY, vx: vx, vy: vy, rot: rot, type: nameKey });
  updateHUD();
}

/* slicing detection with trail points (simple) */
let isDown = false, points = [];
const trailCanvas = document.getElementById('trailCanvas');
const ctx = trailCanvas.getContext && trailCanvas.getContext('2d');
let trailPoints = [];
const TRAIL_LIFE = 320;
const TRAIL_MAX_POINTS = 40;

function resizeCanvas(){
  const r = area.getBoundingClientRect();
  if(!trailCanvas) return;
  trailCanvas.width = Math.max(1, Math.floor(r.width));
  trailCanvas.height = Math.max(1, Math.floor(r.height));
  trailCanvas.style.left = '0';
  trailCanvas.style.top = '0';
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 150);

function drawTrail(){
  if(!ctx){ requestAnimationFrame(drawTrail); return; }
  ctx.clearRect(0,0,trailCanvas.width, trailCanvas.height);
  const now = Date.now();
  for(let i=0;i<trailPoints.length-1;i++){
    const a = trailPoints[i], b = trailPoints[i+1];
    const age = now - a.t;
    const alpha = Math.max(0, 1 - age / TRAIL_LIFE);
    ctx.strokeStyle = `rgba(255,255,255,${0.18 * alpha})`;
    ctx.lineWidth = 10 * alpha + 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  while(trailPoints.length && now - trailPoints[0].t > TRAIL_LIFE) trailPoints.shift();
  requestAnimationFrame(drawTrail);
}
requestAnimationFrame(drawTrail);

function addPointToTrail(x,y){
  const r = area.getBoundingClientRect();
  const px = x - r.left;
  const py = y - r.top;
  trailPoints.push({x:px, y:py, t: Date.now()});
  if(trailPoints.length > TRAIL_MAX_POINTS) trailPoints.shift();
}

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
function onDown(e){ isDown=true; points=[]; addPoint(e.clientX, e.clientY); e.preventDefault && e.preventDefault(); }
function onMove(e){ if(!isDown) return; addPoint(e.clientX, e.clientY); e.preventDefault && e.preventDefault(); }
function onUp(e){ isDown=false; points=[]; }
function lineIntersectsRect(p1,p2,rect){
  if((p1.x < rect.left && p2.x < rect.left) || (p1.x > rect.right && p2.x > rect.right) || (p1.y < rect.top && p2.y < rect.top) || (p1.y > rect.bottom && p2.y > rect.bottom)) return false;
  return true;
}
window.addEventListener('pointerdown', onDown, {passive:false});
window.addEventListener('pointermove', onMove, {passive:false});
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

/* split behavior */
function splitFruit(el){
  if(!el) return;
  if(el.dataset.type === BOMB){
    lives = Math.max(0, lives - 1);
    playBombSound();
    if(lives <= 0) endGame();
  } else {
    score += 10;
    coins += 2;
    playSliceSound();
  }
  updateHUD();
  if(el.parentNode) el.parentNode.removeChild(el);
  for(let i=active.length-1;i>=0;i--) if(active[i].el === el) active.splice(i,1);
}

/* controls */
function startGame(){
  if(running) return;
  running = true;
  document.getElementById('bigStart').style.display = 'none';
  if(spawnTimer) clearInterval(spawnTimer);
  spawnTimer = setInterval(()=> spawnFruit(), Math.max(800, spawnInterval - level*20));
  spawnFruit();
  updateHUD();
}
function pauseGame(){
  running = !running;
  if(!running && spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  if(running && !spawnTimer){ spawnTimer = setInterval(()=> spawnFruit(), Math.max(800, spawnInterval - level*20)); }
  updateHUD();
}
function restartGame(){
  for(const f of Array.from(active)){ if(f.el.parentNode) f.el.parentNode.removeChild(f.el); }
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

/* audio */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audio = AudioCtx ? new AudioCtx() : null;
function playTone(freq, type='sine', dur=0.07, vol=0.08){
  if(!audio) return;
  try{
    const now = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(audio.destination);
    o.start(now); o.stop(now + dur + 0.02);
  }catch(e){}
}
function playSliceSound(){ playTone(rand(520,760),'sine',0.06,0.06); }
function playBombSound(){ playTone(120,'sawtooth',0.12,0.14); setTimeout(()=>playTone(80,'sine',0.09,0.06),60); }

/* utils */
function rand(a,b){ return Math.random()*(b-a)+a; }

/* ui wiring */
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('pauseBtn').addEventListener('click', pauseGame);
document.getElementById('restartBtn').addEventListener('click', restartGame);
document.getElementById('bigStart').addEventListener('click', startGame);

/* heartbeat + init */
setInterval(()=> updateHUD(), 800);
setTimeout(()=>{ resizeCanvas(); updateHUD(); }, 200);
