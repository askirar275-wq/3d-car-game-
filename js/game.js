/* game.js - Full integrated version
   - English image names (apple.png etc.)
   - converts near-white bg -> transparent when possible (same-origin)
   - big fruits, go up to top then fall/bounce
   - trail + slicing detection + shop (basic)
*/

/* ---------------- CONFIG ---------------- */
const IMG_PATH = "../images/"; // if js/ is inside root; if you kept js at root use "images/"
/* If your index.html is root and js is in js/, then "../images/" is correct.
   If you put game.js at root, change to "images/". */

const FRUITS = [
  "apple.png","banana.png","orange.png","strawberry.png",
  "watermelon.png","mango.png","papaya.png","pineapple.png","pomegranate.png"
];
const BOMB = "bomb.png";

/* --------------- STATE ------------------ */
let score = 0, lives = 3, coins = 0, level = 1;
let running = false, spawnTimer = null, spawnInterval = 900;
const active = [];
const area = document.getElementById('gameArea');
const statusText = document.getElementById('statusText');

/* --------- helper: convert white -> transparent ---------- */
function makeImageTransparent(img, callback){
  // works only if image is same-origin (images in your local images/ folder)
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
    const tol = 225; // tolerance for near-white
    for(let i=0;i<data.length;i+=4){
      const r = data[i], g = data[i+1], b = data[i+2];
      if(r >= tol && g >= tol && b >= tol){
        data[i+3] = 0;
      }
    }
    ctx.putImageData(id,0,0);
    const url = tmp.toDataURL('image/png');
    img.src = url;
    if(callback) callback(url);
  } catch(e) {
    // CORS or security error -> cannot access pixels
    console.warn('makeImageTransparent failed (CORS or other):', e);
    if(callback) callback(null);
  }
}

/* ----------------- HUD ------------------ */
function updateHUD(){
  document.getElementById('score').textContent = score;
  document.getElementById('lives').textContent = lives;
  document.getElementById('coins').textContent = coins;
  document.getElementById('level').textContent = level;
  // combo shown but basic in this version
  document.getElementById('combo').textContent = 'x1';
  statusText.textContent = running ? 'Running: YES' : 'Running: NO';
}

/* ------------ trail canvas ------------- */
const trailCanvas = document.getElementById('trailCanvas');
const ctx = trailCanvas.getContext && trailCanvas.getContext('2d');
let trailPoints = [];
const TRAIL_LIFE = 360; // ms
const TRAIL_MAX_POINTS = 40;

function resizeCanvas(){
  const r = area.getBoundingClientRect();
  trailCanvas.width = Math.max(1, Math.floor(r.width));
  trailCanvas.height = Math.max(1, Math.floor(r.height));
  trailCanvas.style.left = '0';
  trailCanvas.style.top = '0';
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 120);

/* draw trail */
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

/* ---------- physics loop ---------- */
let last = performance.now();
function loop(t){
  const dt = Math.min(40, t-last)/16.666;
  last = t;
  const areaRect = area.getBoundingClientRect();
  const maxY = areaRect.height - 30;
  for(let i=active.length-1;i>=0;i--){
    const f = active[i];
    f.vy -= 0.38 * dt; // gravity
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.vx * 0.8 * dt;

    // keep inside top with small bounce
    if(f.y > maxY){
      f.y = maxY;
      f.vy = -Math.abs(f.vy) * 0.55;
    }

    f.el.style.transform = `translate(${f.x}px, ${-f.y}px) rotate(${f.rot}deg)`;

    if(f.x < -200 || f.x > areaRect.width + 200 || f.y < -400){
      if(f.el.parentNode) f.el.parentNode.removeChild(f.el);
      active.splice(i,1);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- spawnFruit (big + transparency convert) ---------- */
function spawnFruit(specKey, startX){
  if(!running) return;
  const nameKey = specKey || (Math.random() < 0.9 ? FRUITS[Math.floor(Math.random()*FRUITS.length)] : BOMB);
  const img = document.createElement('img');
  img.className = 'fruit';
  img.draggable = false;
  img.dataset.type = nameKey;
  img.src = IMG_PATH + nameKey; // initial

  const areaRect = area.getBoundingClientRect();
  const size = Math.max(90, Math.min(140, areaRect.width * 0.22));
  img.style.width = size + 'px';
  img.style.height = 'auto';

  const x = (typeof startX === 'number') ? startX : rand(40, Math.max(40, areaRect.width - size - 40));
  const startY = -150;
  img.style.left = x + 'px';
  img.style.bottom = startY + 'px';
  area.appendChild(img);

  // attempt to remove near-white background (if same-origin)
  makeImageTransparent(img, function(result){
    // result is dataURL (or null if failed). no-op
  });

  // initial throw upwards to reach top area
  const vy = 22 + Math.random()*6;
  const vx = rand(-3.2, 3.2);
  const rot = rand(-25,25);
  active.push({ el: img, x: x, y: startY, vx: vx, vy: vy, rot: rot, type: nameKey });
  updateHUD();
}

/* ---------- slice logic (approx line vs rect) ---------- */
let isDown = false, points = [];
function addPointToTrail(x,y){
  const r = area.getBoundingClientRect();
  const px = x - r.left;
  const py = y - r.top;
  trailPoints.push({ x: px, y: py, t: Date.now() });
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
function onDown(e){ isDown=true; points=[]; addPoint(e.clientX,e.clientY); e.preventDefault && e.preventDefault(); }
function onMove(e){ if(!isDown) return; addPoint(e.clientX,e.clientY); e.preventDefault && e.preventDefault(); }
function onUp(){ isDown=false; points=[]; }
function lineIntersectsRect(p1,p2,rect){
  if((p1.x < rect.left && p2.x < rect.left) || (p1.x > rect.right && p2.x > rect.right) || (p1.y < rect.top && p2.y < rect.top) || (p1.y > rect.bottom && p2.y > rect.bottom)) return false;
  return true;
}
window.addEventListener('pointerdown', onDown, {passive:false});
window.addEventListener('pointermove', onMove, {passive:false});
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

/* ---------- split behavior ---------- */
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

  // remove element + active entry
  if(el.parentNode) el.parentNode.removeChild(el);
  for(let i=active.length-1;i>=0;i--) if(active[i].el === el) active.splice(i,1);
}

/* ---------- controls ---------- */
function startGame(){
  if(running) return;
  running = true;
  document.getElementById('bigStart').style.display = 'none';
  if(spawnTimer) clearInterval(spawnTimer);
  spawnTimer = setInterval(()=> spawnFruit(), Math.max(420, spawnInterval - level*30));
  spawnFruit();
  updateHUD();
}
function pauseGame(){
  running = !running;
  if(!running && spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; }
  if(running && !spawnTimer){ spawnTimer = setInterval(()=> spawnFruit(), Math.max(420, spawnInterval - level*30)); }
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

/* ---------- audio ---------- */
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

/* ---------- shop (basic) ---------- */
const SHOP_ITEMS = [
  { id:'bg-wood', name:'Wood', price:30, className:'bg-wood' },
  { id:'bg-lake', name:'Lake', price:50, className:'bg-lake' },
  { id:'bg-mountain', name:'Mountains', price:80, className:'bg-mountain' }
];
let owned = {};
const shopModal = document.getElementById('shopModal');
const shopList = document.getElementById('shopList');
function openShop(){
  shopList.innerHTML = '';
  SHOP_ITEMS.forEach(item=>{
    const div = document.createElement('div'); div.className='shop-item';
    div.innerHTML = `<div style="height:64px;background:#f3f3f3;border-radius:6px;display:flex;align-items:center;justify-content:center">${item.name}</div>
      <div style="margin-top:6px">Price: ${item.price}</div>`;
    const btn = document.createElement('button');
    btn.textContent = owned[item.id] ? 'Apply' : `Buy ${item.price}`;
    btn.onclick = ()=> {
      if(owned[item.id]){
        document.getElementById('gameWrapper').className = item.className;
        shopModal.classList.add('hidden');
      } else {
        if(coins < item.price){ alert('Not enough coins'); return; }
        coins -= item.price; owned[item.id] = true; updateHUD(); openShop();
      }
    };
    div.appendChild(btn);
    shopList.appendChild(div);
  });
  shopModal.classList.remove('hidden');
}
document.getElementById('shopBtn').addEventListener('click', openShop);
document.getElementById('shopClose').addEventListener('click', ()=> shopModal.classList.add('hidden'));

/* ---------- utilities ---------- */
function rand(a,b){ return Math.random()*(b-a)+a; }

/* ---------- wire UI ---------- */
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('pauseBtn').addEventListener('click', pauseGame);
document.getElementById('restartBtn').addEventListener('click', restartGame);
document.getElementById('bigStart').addEventListener('click', startGame);

/* heartbeat */
setInterval(()=> updateHUD(), 800);
setTimeout(()=>{ resizeCanvas(); updateHUD(); }, 200);
