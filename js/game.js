/* game.js - debug-friendly auto-start version
   Replace your current js/game.js with this file (paste entire content).
   Make sure index.html includes: <script src="js/game.js"></script>
*/

const IMG_PATHS = ["images/", "../images/", "./images/"];
const FRUITS = ["apple.png","banana.png","orange.png","strawberry.png","watermelon.png","mango.png","papaya.png","pineapple.png","pomegranate.png"];
const BOMB = "bomb.png";

/* ---- basic state ---- */
let score = 0, lives = 3, coins = 0, level = 1;
let running = false, spawnTimer = null;
const active = [];
const IMAGE_CACHE = {};

const area = document.getElementById('gameArea');
const statusText = document.getElementById('statusText');

if(!area){
  console.error("gameArea element not found! Check index.html for <div id='gameArea'>");
}
if(!statusText){
  console.warn("statusText element not found. Add <span id='statusText'>Running: NO</span> in index.html");
}

/* ---------- helpers ---------- */
function rand(a,b){ return Math.random()*(b-a)+a; }

function tryLoadImage(filename){
  return new Promise(async (resolve)=>{
    for(const base of IMG_PATHS){
      try {
        const url = base + filename;
        const img = new Image();
        await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=url; });
        console.log("Loaded", filename, "from", url);
        resolve(img);
        return;
      } catch(e){}
    }
    // try direct filename
    try {
      const img = new Image();
      await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=filename; });
      console.log("Loaded", filename, "from direct", filename);
      resolve(img);
      return;
    } catch(e){}
    console.warn("Failed to load image:", filename);
    resolve(null);
  });
}

async function preloadAll(){
  const files = FRUITS.concat([BOMB]);
  const promises = files.map(async f=>{
    if(IMAGE_CACHE[f]) return;
    const img = await tryLoadImage(f);
    if(img) IMAGE_CACHE[f] = img;
  });
  await Promise.all(promises);
  console.log("Preload complete:", Object.keys(IMAGE_CACHE));
}

/* ---------- layout cache ---------- */
let areaW=320, areaH=480;
function recalcArea(){
  if(!area) return;
  const r = area.getBoundingClientRect();
  areaW = Math.max(1, Math.floor(r.width));
  areaH = Math.max(1, Math.floor(r.height));
  const canvas = document.getElementById('trailCanvas');
  if(canvas){ canvas.width = areaW; canvas.height = areaH; }
}
window.addEventListener('resize', ()=> recalcArea());
setTimeout(recalcArea, 120);

/* ---------- physics loop ---------- */
let last = performance.now();
function loop(t){
  const dt = Math.min(40, t-last)/16.666;
  last = t;
  for(let i=active.length-1;i>=0;i--){
    const f = active[i];
    f.vy -= 0.28 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.vx * 0.7 * dt;
    const maxY = areaH - 36;
    if(f.y > maxY){ f.y = maxY; f.vy = -Math.abs(f.vy) * 0.5; }
    f.el.style.transform = `translate3d(${f.x}px, ${-f.y}px, 0) rotate(${f.rot}deg)`;
    if(f.x < -300 || f.x > areaW + 300 || f.y < -500){
      if(f.el.parentNode) f.el.parentNode.removeChild(f.el);
      active.splice(i,1);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- spawn ---------- */
function spawnFruit(specName, startX){
  if(!running) return;
  const name = specName || (Math.random()<0.92? FRUITS[Math.floor(Math.random()*FRUITS.length)]: BOMB);
  const el = document.createElement('img');
  el.className = 'fruit';
  el.draggable = false;
  el.dataset.type = name;

  const size = Math.max(84, Math.min(140, areaW*0.22));
  el.style.width = size + 'px';
  el.style.height = 'auto';

  const x = (typeof startX==='number')? startX : rand(40, Math.max(40, areaW - size - 40));
  const startY = -140;
  el.style.left = x + 'px';
  el.style.bottom = startY + 'px';

  // use cached image if available
  const cached = IMAGE_CACHE[name];
  if(cached){
    el.src = cached.src;
  } else {
    // try load quickly (non-blocking)
    tryLoadImage(name).then(img=>{
      if(img) el.src = img.src;
    });
  }

  area.appendChild(el);
  const vy = 18 + Math.random()*4;
  const vx = rand(-2.4,2.4);
  const rot = rand(-22,22);
  active.push({ el, x, y: startY, vx, vy, rot, type: name });
}

/* ---------- slicing (simple) ---------- */
let isDown=false, points=[];
function addPoint(x,y){
  points.push({x,y});
  if(points.length>18) points.shift();
  if(points.length>=2){
    const p1 = points[points.length-2], p2 = points[points.length-1];
    const snapshot = Array.from(active);
    for(const f of snapshot){
      const r = f.el.getBoundingClientRect();
      if(lineIntersectsRect(p1,p2,r)) splitFruit(f.el);
    }
  }
}
function onDown(e){ isDown=true; points=[]; addPoint(e.clientX,e.clientY); e.preventDefault && e.preventDefault(); }
function onMove(e){ if(!isDown) return; addPoint(e.clientX,e.clientY); e.preventDefault && e.preventDefault(); }
function onUp(e){ isDown=false; points=[]; }
window.addEventListener('pointerdown', onDown, {passive:false});
window.addEventListener('pointermove', onMove, {passive:false});
window.addEventListener('pointerup', onUp);

function lineIntersectsRect(p1,p2,rect){
  if((p1.x < rect.left && p2.x < rect.left) || (p1.x > rect.right && p2.x > rect.right) || (p1.y < rect.top && p2.y < rect.top) || (p1.y > rect.bottom && p2.y > rect.bottom)) return false;
  return true;
}

/* ---------- split ---------- */
function splitFruit(el){
  if(!el) return;
  if(el.dataset.type === BOMB){
    lives = Math.max(0, lives-1);
    console.log("Bomb hit! Lives:", lives);
    if(lives<=0) endGame();
  } else {
    score += 10; coins += 2;
    console.log("Fruit sliced. Score:", score);
  }
  updateHUD();
  if(el.parentNode) el.parentNode.removeChild(el);
  for(let i=active.length-1;i>=0;i--) if(active[i].el===el) active.splice(i,1);
}

/* ---------- controls ---------- */
function updateHUD(){
  const s = document.getElementById('score'); if(s) s.textContent = score;
  const l = document.getElementById('lives'); if(l) l.textContent = lives;
  const c = document.getElementById('coins'); if(c) c.textContent = coins;
  const lv = document.getElementById('level'); if(lv) lv.textContent = level;
  const combo = document.getElementById('combo'); if(combo) combo.textContent = 'x1';
  if(statusText) statusText.textContent = running? 'Running: YES' : 'Running: NO';
}

function startGame(){
  if(running) return;
  console.log("startGame called");
  running = true;
  const big = document.getElementById('bigStart'); if(big) big.style.display='none';
  if(spawnTimer) clearInterval(spawnTimer);
  spawnTimer = setInterval(()=> spawnFruit(), 900);
  spawnFruit();
  updateHUD();
}
function pauseGame(){
  running = !running;
  if(!running && spawnTimer){ clearInterval(spawnTimer); spawnTimer=null; }
  if(running && !spawnTimer){ spawnTimer = setInterval(()=> spawnFruit(), 900); }
  updateHUD();
}
function restartGame(){
  for(const f of Array.from(active)) if(f.el.parentNode) f.el.parentNode.removeChild(f.el);
  active.length = 0;
  score=0; lives=3; coins=0; level=1; running=false;
  const big = document.getElementById('bigStart'); if(big) big.style.display='block';
  if(spawnTimer){ clearInterval(spawnTimer); spawnTimer=null; }
  updateHUD();
}
function endGame(){
  running=false;
  if(spawnTimer){ clearInterval(spawnTimer); spawnTimer=null; }
  alert("Game Over! Score: "+score);
  restartGame();
}

/* ---------- audio (optional minimal) ---------- */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx? new AudioCtx(): null;
function playTone(f){ if(!audioCtx) return; try{ const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='sine'; o.frequency.value = f; g.gain.value=0.06; o.connect(g); g.connect(audioCtx.destination); o.start(); setTimeout(()=>{o.stop();},80); }catch(e){} }
function playSlice(){ playTone(600); }
function playBomb(){ playTone(120); }

/* ---------- utils ---------- */
function rand(a,b){ return Math.random()*(b-a)+a; }

/* ---------- init: preload + wire UI + autostart ---------- */
(async function init(){
  console.log("game.js init — preloading images");
  await preloadImagesForInit();
  recalcArea();
  requestAnimationFrame(loop);

  // wire UI if present
  const sBtn = document.getElementById('startBtn'); if(sBtn) sBtn.addEventListener('click', startGame);
  const pBtn = document.getElementById('pauseBtn'); if(pBtn) pBtn.addEventListener('click', pauseGame);
  const rBtn = document.getElementById('restartBtn'); if(rBtn) rBtn.addEventListener('click', restartGame);
  const big = document.getElementById('bigStart'); if(big) big.addEventListener('click', startGame);

  updateHUD();

  // autostart — if you want manual start, comment this line
  console.log("Auto-starting game in 300ms...");
  setTimeout(()=> startGame(), 300);
})();

/* small helper used above (keeps file small) */
async function preloadImagesForInit(){
  const files = FRUITS.concat([BOMB]);
  for(const f of files){
    try{
      const img = await tryLoadImage(f);
      if(img) IMAGE_CACHE[f] = img;
    }catch(e){}
  }
  console.log("Preload attempt done:", Object.keys(IMAGE_CACHE));
                     }
