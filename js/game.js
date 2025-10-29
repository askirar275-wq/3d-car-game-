/* js/game.js — Debug / robust build
   Put this file in /js/game.js and images in /images/
   Edit ALL_IMAGES if needed.
*/
(() => {
  // Config
  const IMG_PATH = 'images/';
  const ALL_IMAGES = [
    'apple.png','banana.png','cantaloupe.png','guava.png','mango.png',
    'orange.png','papaya.png','pear.png','pineapple.png','plum.png',
    'pomegranate.png','strawberry.png','watermelon.png','bomb.png'
  ];
  const PRELOAD_TIMEOUT = 3500; // ms
  const SPAWN_INTERVAL_INIT = 900; // ms
  const FRUIT_SIZE = 84; // px base (we'll scale)
  const GRAVITY = 0.28;
  const THROW_VY_MIN = 12;
  const THROW_VY_MAX = 18;
  const VX_MAX = 2.2;

  // DOM
  const area = document.getElementById('gameArea');
  const bladeCanvas = document.getElementById('bladeCanvas');
  const scoreEl = document.getElementById('scoreEl');
  const livesEl = document.getElementById('livesEl');
  const coinsEl = document.getElementById('coinsEl');
  const levelEl = document.getElementById('levelEl');
  const bigStart = document.getElementById('bigStart');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const restartBtn = document.getElementById('restartBtn');
  const toggleDbg = document.getElementById('toggleDbg');
  const dbgLog = document.getElementById('dbgLog');
  const dbgClear = document.getElementById('dbgClear');
  const debugConsole = document.getElementById('debugConsole');
  const missingBox = document.getElementById('missingBox');

  // Canvas
  const bctx = bladeCanvas.getContext('2d');

  // State
  let CACHE = {}; // filename -> HTMLImageElement
  let missing = [];
  let running = false;
  let spawnInterval = SPAWN_INTERVAL_INIT;
  let spawnTimer = null;
  let fruits = []; // active fruit objects
  let score = 0, lives = 3, coins = 0, level = 1;
  let bladePoints = [];

  // Utilities (debug)
  function dbg(msg, kind='info'){
    const ts = new Date().toTimeString().slice(0,8);
    const line = `[${ts}] ${msg}`;
    const el = document.createElement('div');
    el.textContent = line;
    if(kind === 'err') el.style.color = '#ff6b6b';
    dbgLog.appendChild(el);
    dbgLog.scrollTop = dbgLog.scrollHeight;
    console.log('[FruitCut]', msg);
  }
  dbgClear && dbgClear.addEventListener('click', ()=> dbgLog.innerHTML = '');

  // Preload with fallback + timeout
  function tryLoad(filename, timeout=PRELOAD_TIMEOUT){
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      img.onload = () => { if(!settled){ settled=true; resolve({ok:true, img, name:filename}); } };
      img.onerror = () => { if(!settled){ settled=true; resolve({ok:false, name:filename}); } };
      img.src = IMG_PATH + filename;
      // timeout fallback
      setTimeout(()=>{ if(!settled){ settled=true; resolve({ok:false, name:filename}); } }, timeout);
    });
  }

  async function preloadAll(){
    dbg('Preload start: ' + ALL_IMAGES.join(','));
    const results = [];
    for(const name of ALL_IMAGES){
      // quick attempt
      const res = await tryLoad(name);
      if(res.ok){
        CACHE[name] = res.img;
        dbg(`loaded ${name}`);
      } else {
        // final fallback: try relative path with ./images/
        const res2 = await tryLoad(name);
        if(res2.ok){
          CACHE[name] = res2.img;
          dbg(`loaded (fallback) ${name}`);
        } else {
          missing.push(name);
          dbg(`failed: ${name}`, 'err');
        }
      }
      results.push(res);
    }
    if(missing.length) {
      missingBox.classList.add('visible');
      missingBox.innerHTML = '<strong>Missing images:</strong><br>' + missing.join('<br>');
      dbg('[FruitCut] Missing images: ' + missing.join(', '), 'err');
    } else {
      missingBox.classList.remove('visible');
    }
    dbg('Preload finished');
    return results;
  }

  // Resize canvas
  function resizeCanvas(){
    const r = area.getBoundingClientRect();
    bladeCanvas.width = Math.max(1, Math.floor(r.width));
    bladeCanvas.height = Math.max(1, Math.floor(r.height));
  }
  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 40);

  // Blade trail
  function addBladePoint(x,y){
    const r = area.getBoundingClientRect();
    bladePoints.push({x: x - r.left, y: y - r.top, t: Date.now()});
    if(bladePoints.length > 30) bladePoints.shift();
  }
  function drawBlade(){
    bctx.clearRect(0,0,bladeCanvas.width, bladeCanvas.height);
    if(bladePoints.length<2){
      requestAnimationFrame(drawBlade);
      return;
    }
    bctx.lineJoin='round'; bctx.lineCap='round';
    for(let i=0;i<bladePoints.length-1;i++){
      const p1 = bladePoints[i], p2 = bladePoints[i+1];
      const age = Date.now() - p1.t;
      const alpha = Math.max(0, 1 - age/350);
      bctx.strokeStyle = `rgba(34,197,94,${0.9*alpha})`;
      bctx.lineWidth = 18 * alpha;
      bctx.beginPath(); bctx.moveTo(p1.x,p1.y); bctx.lineTo(p2.x,p2.y); bctx.stroke();
    }
    bladePoints = bladePoints.filter(p => (Date.now() - p.t) < 450);
    requestAnimationFrame(drawBlade);
  }
  drawBlade();

  // Pointer events (throttled)
  let lastPointerTime = 0;
  function onPointerMove(e){
    const now = Date.now();
    if(now - lastPointerTime < 16) return; // ~60fps throttle
    lastPointerTime = now;
    if(e.isPrimary !== false) addBladePoint(e.clientX, e.clientY);
    checkSliceLine(); // detect slices per move
  }
  function onPointerDown(e){
    addBladePoint(e.clientX, e.clientY);
  }
  function onPointerUp(e){
    bladePoints = [];
  }
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // Fruit spawn / physics
  function rand(min,max){ return Math.random()*(max-min)+min; }

  function spawnFruit(){
    if(!running) return;
    // choose random image from cached (exclude missing)
    const available = ALL_IMAGES.filter(n => CACHE[n]);
    if(available.length === 0) {
      dbg('[FruitCut] no images available to spawn', 'err');
      return;
    }
    const name = available[Math.floor(Math.random()*available.length)];
    const img = CACHE[name];
    const r = area.getBoundingClientRect();
    const baseSize = FRUIT_SIZE;
    // spawn near bottom, with random x
    const x = rand(40, r.width - 40);
    const y = r.height + 20; // start a bit below bottom
    const vx = rand(-VX_MAX, VX_MAX);
    const vy = -rand(THROW_VY_MIN, THROW_VY_MAX); // negative vy to go up first
    const rot = rand(-40,40);
    const spin = rand(-3,3);

    // Create DOM sprite
    const el = document.createElement('img');
    el.src = img.src;
    el.className = 'fruit-sprite';
    el.style.width = (baseSize) + 'px';
    el.style.left = (x - baseSize/2) + 'px';
    el.style.top = (y - baseSize/2) + 'px';
    el.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
    el.dataset.name = name;
    area.appendChild(el);

    const obj = {
      name, el, x, y, vx, vy, rot, spin, size: baseSize, sliced: false
    };
    fruits.push(obj);
    dbg(`spawned ${name} (cached)`);

    return obj;
  }

  function updatePhysics(){
    const r = area.getBoundingClientRect();
    for(let i = fruits.length -1; i>=0; i--){
      const f = fruits[i];
      if(f.sliced){ // halves handled separately
        // let halves continue physics (we will remove when out)
        continue;
      }
      f.vy += GRAVITY;
      f.x += f.vx;
      f.y += f.vy;
      f.rot += f.spin;
      // update DOM
      f.el.style.left = (f.x) + 'px';
      f.el.style.top = (f.y) + 'px';
      f.el.style.transform = `translate(-50%,-50%) rotate(${f.rot}deg)`;
      // check out-of-bounds (fell below)
      if(f.y - f.size/2 > r.height + 120){
        // remove and deduct life (if not bomb)
        if(!f.sliced){
          if(f.name !== 'bomb.png'){ lives = Math.max(0, lives - 1); updateHUD(); dbg(`missed ${f.name} -> lives=${lives}`); }
        }
        removeFruit(i);
      }
    }
  }

  function removeFruit(index){
    const f = fruits[index];
    if(!f) return;
    try{ f.el.remove(); }catch(e){}
    fruits.splice(index,1);
  }

  // slice detection: check current blade segment against fruit bounding boxes
  function checkSliceLine(){
    if(bladePoints.length < 2) return;
    const p1 = bladePoints[bladePoints.length-2];
    const p2 = bladePoints[bladePoints.length-1];
    for(let i=0;i<fruits.length;i++){
      const f = fruits[i];
      if(f.sliced) continue;
      const r = f.el.getBoundingClientRect();
      const rect = {left:r.left, top:r.top, right:r.right, bottom:r.bottom};
      if(lineIntersectsRect(p1, p2, rect)){
        sliceFruit(i, p1, p2);
      }
    }
  }

  function lineIntersectsRect(p1,p2,rect){
    // trivial bounding check: if either endpoint inside rect -> intersect
    if(pointInRect(p1,rect) || pointInRect(p2,rect)) return true;
    // else check if segment intersects any rect edge
    const edges = [
      [{x:rect.left,y:rect.top},{x:rect.right,y:rect.top}],
      [{x:rect.right,y:rect.top},{x:rect.right,y:rect.bottom}],
      [{x:rect.right,y:rect.bottom},{x:rect.left,y:rect.bottom}],
      [{x:rect.left,y:rect.bottom},{x:rect.left,y:rect.top}]
    ];
    for(const [a,b] of edges){
      if(segSegIntersect(p1,p2,a,b)) return true;
    }
    return false;
  }
  function pointInRect(p,rect){ return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom; }
  function segSegIntersect(p1,p2,p3,p4){
    // standard segment intersection
    function orient(a,b,c){ return (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x); }
    const o1 = orient(p1,p2,p3), o2 = orient(p1,p2,p4), o3 = orient(p3,p4,p1), o4 = orient(p3,p4,p2);
    if(o1*o2 < 0 && o3*o4 < 0) return true;
    return false;
  }

  // slicing: remove fruit element and spawn two halves
  function sliceFruit(index, p1, p2){
    const f = fruits[index];
    if(!f || f.sliced) return;
    f.sliced = true;
    dbg(`Fruit sliced: ${f.name}`);
    // score / bomb handling
    if(f.name === 'bomb.png'){
      lives = Math.max(0, lives - 1);
      updateHUD();
      // bomb explosion visual (simple)
      const expl = document.createElement('div');
      expl.textContent = '💥';
      expl.style.position = 'absolute';
      expl.style.left = f.x + 'px';
      expl.style.top = f.y + 'px';
      expl.style.transform = 'translate(-50%,-50%)';
      expl.style.fontSize = '28px';
      area.appendChild(expl);
      setTimeout(()=>expl.remove(),600);
      removeFruit(index);
      return;
    }
    // normal fruit: +score + coin
    score += 10; coins += 1; updateHUD();

    // create halves (two img elements with clip + transform)
    const halfA = document.createElement('img');
    const halfB = document.createElement('img');
    halfA.src = f.el.src;
    halfB.src = f.el.src;
    halfA.className = halfB.className = 'fruit-sprite';
    const size = f.size;
    halfA.style.width = halfB.style.width = (size) + 'px';

    // place both at same center
    halfA.style.left = halfB.style.left = f.x + 'px';
    halfA.style.top = halfB.style.top = f.y + 'px';

    // simple mask by using CSS clip-path to show halves
    halfA.style.clipPath = 'polygon(0 0, 60% 0, 60% 100%, 0% 100%)';
    halfB.style.clipPath = 'polygon(40% 0, 100% 0, 100% 100%, 40% 100%)';

    area.appendChild(halfA);
    area.appendChild(halfB);
    // remove original
    try{ f.el.remove(); }catch(e){}
    fruits.splice(index,1);

    // animate halves physics
    const a = {x:f.x, y:f.y, vx: f.vx - 1.4, vy: f.vy - 2, rot: f.rot - 12};
    const b = {x:f.x, y:f.y, vx: f.vx + 1.6, vy: f.vy - 1.6, rot: f.rot + 12};
    const start = Date.now();
    const animateHalves = () => {
      a.vy += GRAVITY; b.vy += GRAVITY;
      a.x += a.vx; b.x += b.vx;
      a.y += a.vy; b.y += b.vy;
      a.rot += 2; b.rot -= 2;
      halfA.style.left = a.x + 'px';
      halfA.style.top = a.y + 'px';
      halfA.style.transform = `translate(-50%,-50%) rotate(${a.rot}deg)`;
      halfB.style.left = b.x + 'px';
      halfB.style.top = b.y + 'px';
      halfB.style.transform = `translate(-50%,-50%) rotate(${b.rot}deg)`;
      // fade out after 1.5s
      const t = Date.now() - start;
      const alpha = Math.max(0, 1 - t/1400);
      halfA.style.opacity = halfB.style.opacity = alpha;
      if(t < 1800 && (a.y < area.clientHeight + 200 || b.y < area.clientHeight + 200)){
        requestAnimationFrame(animateHalves);
      } else {
        try{ halfA.remove(); halfB.remove(); }catch(e){}
      }
    };
    requestAnimationFrame(animateHalves);
  }

  // HUD
  function updateHUD(){
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    coinsEl.textContent = coins;
    levelEl.textContent = level;
    if(lives <= 0){
      stopGame();
      dbg('[FruitCut] Game Over');
      bigStart.textContent = 'RESTART';
      bigStart.style.display = 'block';
    }
  }

  // game loop
  let loopId = null;
  function gameTick(){
    updatePhysics();
    loopId = requestAnimationFrame(gameTick);
  }

  // start / stop / pause
  async function startGame(auto=false){
    if(running) return;
    dbg('[FruitCut] start requested');
    // preload if not done
    if(Object.keys(CACHE).length === 0 && missing.length === 0){
      await preloadAll();
    }
    // if major images missing, still continue but notify
    if(missing.length) dbg('[FruitCut] continuing despite missing images', 'err');
    running = true;
    bigStart.style.display = 'none';
    pauseBtn.disabled = false;
    dbg('[FruitCut] Game started');
    // spawn timer
    if(spawnTimer) clearInterval(spawnTimer);
    spawnTimer = setInterval(spawnFruit, spawnInterval);
    // immediate spawn for quick feedback
    spawnFruit();
    // start physics loop
    if(!loopId) loopId = requestAnimationFrame(gameTick);
  }
  function stopGame(){
    running = false;
    if(spawnTimer) { clearInterval(spawnTimer); spawnTimer = null; }
    if(loopId) { cancelAnimationFrame(loopId); loopId = null; }
    pauseBtn.disabled = true;
  }
  function pauseGame(){
    if(!running) return;
    stopGame();
    dbg('[FruitCut] Paused');
  }
  function restartGame(){
    // cleanup sprites
    document.querySelectorAll('.fruit-sprite').forEach(el => el.remove());
    fruits = [];
    score = 0; lives = 3; coins = 0; level = 1;
    updateHUD();
    stopGame();
    setTimeout(()=> startGame(), 120);
    dbg('[FruitCut] Restarted');
  }

  // Toggle console
  toggleDbg.addEventListener('click', ()=> {
    debugConsole.classList.toggle('hidden');
  });

  // Button wiring
  startBtn.addEventListener('click', ()=> startGame());
  pauseBtn.addEventListener('click', ()=> pauseGame());
  restartBtn.addEventListener('click', ()=> restartGame());
  bigStart.addEventListener('click', ()=> { startGame(); bigStart.style.display='none'; });

  // slice detection also on touchend to capture quick swipes
  window.addEventListener('touchend', (e) => checkSliceLine(), {passive:true});

  // Auto-start fallback: try to auto start, if not working user can press Start
  (async function init(){
    dbg('[FruitCut] script init');
    // small attempt to prefill CACHE with direct images (helps in some hosting setups)
    for(const name of ALL_IMAGES){
      const tmp = new Image();
      tmp.src = IMG_PATH + name;
      // don't await here; these will populate browser cache for subsequent loads
      // but we still run full preload below to verify.
    }
    await preloadAll();
    resizeCanvas();
    // auto start after preload: but if any missing, we still try fallback start
    try {
      startGame(true);
    } catch(e){
      dbg('[FruitCut] Auto-start failed: ' + (e && e.message), 'err');
    }
  })();

})();
