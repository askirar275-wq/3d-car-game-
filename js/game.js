/* js/game.js - Final updated: bigger fruit + split-into-halves on slice + smoother */
(function(){
  // DOM
  const gameArea = document.getElementById('gameArea');
  const bladeCanvas = document.getElementById('bladeCanvas');
  const splatCanvas = document.getElementById('splatCanvas');
  const scoreEl = document.getElementById('scoreEl');
  const livesEl = document.getElementById('livesEl');
  const coinsEl = document.getElementById('coinsEl');
  const levelEl = document.getElementById('levelEl');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const restartBtn = document.getElementById('restartBtn');
  const bigStart = document.getElementById('bigStart');
  const debugBox = document.getElementById('debug');

  // config (tweak here)
  const USER_IMGS = Array.isArray(window.USER_IMGS) ? window.USER_IMGS.slice() : [];
  const BOMB_IMG = (typeof window.USER_BOMB === 'string') ? window.USER_BOMB : 'bomb.png';
  const IMGS = USER_IMGS.length ? USER_IMGS.slice() : ["apple.png","banana.png","mango.png","orange.png","watermelon.png","strawberry.png"];
  const ALL_IMAGES = IMGS.concat([BOMB_IMG]);
  const PRELOAD_TIMEOUT = 2200;
  const GRAVITY = 0.14;
  const SPAWN_INTERVAL = 600; // lower -> more frequent spawn
  const MAX_ACTIVE = 10;

  // state
  let score=0, lives=3, coins=0, level=1;
  let running=false;
  const active = []; // active fruit objects
  const halves = []; // active half pieces after cut
  const CACHE = {}; // filename -> HTMLImageElement
  let areaW=480, areaH=520;

  // contexts
  const bladeCtx = bladeCanvas.getContext('2d');
  const splatCtx = splatCanvas.getContext('2d');

  // resize
  function resizeAll(){
    const r = gameArea.getBoundingClientRect();
    areaW = Math.max(1, Math.floor(r.width));
    areaH = Math.max(1, Math.floor(r.height));
    bladeCanvas.width = areaW;
    bladeCanvas.height = areaH;
    splatCanvas.width = areaW;
    splatCanvas.height = areaH;
    debug('[FruitCut] Area size:', areaW+'x'+areaH);
  }
  window.addEventListener('resize', ()=> setTimeout(resizeAll,60));
  setTimeout(resizeAll,60);

  // debug overlay
  function debug(...args){ try{ console.log('[FruitCut]',...args); if(debugBox){ const d=document.createElement('div'); d.className='debugLine'; d.textContent = args.join(' '); debugBox.appendChild(d); while(debugBox.childElementCount>250) debugBox.removeChild(debugBox.firstChild); } }catch(e){} }

  // preload
  function preloadImages(timeoutMs = PRELOAD_TIMEOUT){
    debug('[FruitCut] Preload start', ALL_IMAGES.join(','));
    const prom = ALL_IMAGES.map(name => new Promise(resolve => {
      try{
        const img = new Image();
        img.onload = () => { CACHE[name] = img; debug('[FruitCut] loaded', name); resolve({name,ok:true}); };
        img.onerror = () => { debug('[FruitCut] failed:', name); resolve({name,ok:false}); };
        img.src = 'images/' + name;
      }catch(e){ debug('[FruitCut] preload err', name, e); resolve({name,ok:false}); }
    }));
    return Promise.race([ Promise.all(prom), new Promise(res => setTimeout(()=>res('__timeout__'), timeoutMs)) ])
      .then(result => {
        if(result === '__timeout__'){ debug('[FruitCut] preload timed out — continuing'); Promise.all(prom).then(()=> debug('[FruitCut] background preload finished')); }
        const missing = ALL_IMAGES.filter(n => !CACHE[n]);
        if(missing.length){ debug('[FruitCut] Missing images:', missing.join(', ')); } else debug('[FruitCut] Preload complete');
      });
  }

  // spawn
  function spawnOne(){
    if(!running) return;
    if(active.length >= MAX_ACTIVE) return;

    const isBomb = Math.random() < 0.06;
    const name = isBomb ? BOMB_IMG : IMGS[Math.floor(Math.random() * IMGS.length)];
    const el = document.createElement('div');
    el.className = 'fruit';
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.willChange = 'transform,opacity';

    const img = document.createElement('img');
    img.draggable = false;
    img.style.display = 'block';
    // **BIGGER FRUIT**: use 16% of area width (min 64)
    const imgWidth = Math.max(64, Math.floor(areaW * 0.16));
    img.style.width = imgWidth + 'px';
    img.style.height = 'auto';
    img.style.userSelect = 'none';

    if(CACHE[name] && CACHE[name].src){
      img.src = CACHE[name].src;
      el.appendChild(img);
    } else {
      // fallback emoji if missing
      const fb = document.createElement('div');
      fb.style.width = img.style.width;
      fb.style.height = img.style.width;
      fb.style.display = 'flex';
      fb.style.alignItems = 'center';
      fb.style.justifyContent = 'center';
      fb.style.fontSize = Math.max(28, Math.floor(areaW * 0.06)) + 'px';
      fb.textContent = emojiFor(name);
      el.appendChild(fb);
    }

    // position: spawn from BOTTOM below view, so it travels up then falls
    const w = imgWidth;
    const left = Math.floor(Math.random() * Math.max(1, areaW - w - 24)) + 12;
    el.style.left = left + 'px';
    el.style.bottom = '-48px';
    gameArea.appendChild(el);

    // physics: upward impulse
    const vx = (Math.random()-0.5) * 1.8;
    const vy = 9 + Math.random() * 2.4; // stronger upward
    const rot = (Math.random()-0.5) * 22;

    active.push({el, x:left, y:-48, vx, vy, rot, type:name, cut:false, w});
    debug('[FruitCut] spawned', name, CACHE[name] ? '(cached)' : '(fallback)');
  }

  function emojiFor(name){
    if(!name) return '🍇';
    if(name.includes('apple')) return '🍎';
    if(name.includes('banana')) return '🍌';
    if(name.includes('mango')) return '🥭';
    if(name.includes('orange')) return '🍊';
    if(name.includes('watermelon')) return '🍉';
    if(name.includes('strawberry')) return '🍓';
    if(name.includes('pineapple')) return '🍍';
    if(name.includes('papaya')) return '🟠';
    if(name.includes('pomegranate')) return '🔴';
    if(name.includes('pear')) return '🍐';
    if(name.includes('plum')) return '🍑';
    return '🍇';
  }

  // main loop
  let last = performance.now();
  function step(now){
    const dt = Math.min(40, now - last) / 16.666; last = now;

    // update fruits
    for(let i = active.length-1;i>=0;i--){
      const f = active[i];
      f.vy -= GRAVITY * dt;
      f.x += f.vx * dt * 1.2;
      f.y += f.vy * dt;
      f.rot += f.vx * dt * 1.2;
      f.el.style.transform = `translate3d(${f.x}px, ${-f.y}px, 0) rotate(${f.rot}deg)`;
      if(f.x < -400 || f.x > areaW + 400 || f.y < -900){
        try{ f.el.remove(); }catch(e){}
        active.splice(i,1);
      }
    }

    // update halves
    for(let i = halves.length-1;i>=0;i--){
      const h = halves[i];
      h.vy -= GRAVITY * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.rot += h.vr * dt;
      h.el.style.transform = `translate3d(${h.x}px, ${-h.y}px, 0) rotate(${h.rot}deg)`;
      h.life -= dt;
      h.el.style.opacity = Math.max(0, h.life/60);
      if(h.y < -900 || h.x < -600 || h.x > areaW + 600 || h.life <= 0){
        try{ h.el.remove(); }catch(e){}
        halves.splice(i,1);
      }
    }

    drawBlade();
    drawJuice();
    requestAnimationFrame(step);
  }

  // juice splats
  const juice = [];
  function addJuice(x,y,color){
    juice.push({x,y,c:color,a:1,r:9+Math.random()*8,vy:-2-Math.random()*2,vx:(Math.random()-0.5)*3,t:0});
  }
  function drawJuice(){
    splatCtx.clearRect(0,0,splatCanvas.width,splatCanvas.height);
    for(let i=juice.length-1;i>=0;i--){
      const p = juice[i];
      splatCtx.beginPath();
      splatCtx.fillStyle = `rgba(${p.c.r},${p.c.g},${p.c.b},${p.a})`;
      splatCtx.arc(p.x, p.y + p.t*0.3, p.r, 0, Math.PI*2);
      splatCtx.fill();
      p.t++; p.y += p.vy; p.x += p.vx; p.a -= 0.03;
      if(p.a <= 0) juice.splice(i,1);
    }
  }
  function colorFor(name){
    if(name.includes('apple')) return {r:220,g:60,b:70};
    if(name.includes('banana')) return {r:240,g:210,b:50};
    if(name.includes('orange')) return {r:245,g:140,b:40};
    if(name.includes('mango')) return {r:255,g:150,b:40};
    if(name.includes('strawberry')) return {r:230,g:80,b:90};
    return {r:240,g:120,b:100};
  }

  // blade trail
  let bladePoints = [];
  function addBladePoint(x,y){ const r = gameArea.getBoundingClientRect(); bladePoints.push({x:x-r.left, y:y-r.top, t:Date.now()}); if(bladePoints.length>24) bladePoints.shift(); }
  function drawBlade(){
    bladeCtx.clearRect(0,0,bladeCanvas.width,bladeCanvas.height);
    if(bladePoints.length < 2) return;
    bladeCtx.lineJoin = 'round'; bladeCtx.lineCap = 'round';
    for(let i=0;i<bladePoints.length-1;i++){
      const p1 = bladePoints[i], p2 = bladePoints[i+1];
      const age = Date.now() - p1.t; const alpha = Math.max(0,1 - age/420);
      bladeCtx.strokeStyle = `rgba(34,197,94,${0.95*alpha})`;
      bladeCtx.lineWidth = 10*alpha + 3;
      bladeCtx.beginPath(); bladeCtx.moveTo(p1.x,p1.y); bladeCtx.lineTo(p2.x,p2.y); bladeCtx.stroke();
    }
    bladePoints = bladePoints.filter(p => (Date.now() - p.t) < 520);
  }

  // pointer / slicing
  let isDown=false, history=[];
  window.addEventListener('pointerdown', e => { isDown=true; history=[]; addBladePoint(e.clientX,e.clientY); e.preventDefault && e.preventDefault(); }, {passive:false});
  window.addEventListener('pointermove', e => {
    if(!isDown) return;
    addBladePoint(e.clientX,e.clientY);
    history.push({x:e.clientX,y:e.clientY});
    if(history.length>22) history.shift();
    if(history.length>=2){
      const p1 = history[history.length-2], p2 = history[history.length-1];
      for(const f of active.slice()){
        try{
          const r = f.el.getBoundingClientRect();
          if(lineIntersectsRect(p1,p2,r)) sliceFruit(f, p1, p2);
        }catch(e){}
      }
    }
  }, {passive:true});
  window.addEventListener('pointerup', ()=>{ isDown=false; history=[]; bladePoints=[]; });

  function lineIntersectsRect(p1,p2,rect){
    if((p1.x < rect.left && p2.x < rect.left) || (p1.x > rect.right && p2.x > rect.right) ||
       (p1.y < rect.top && p2.y < rect.top) || (p1.y > rect.bottom && p2.y > rect.bottom)) return false;
    return true;
  }

  // slice behavior: create two half elements and animate them
  function sliceFruit(f, p1, p2){
    if(!f || f.cut) return; f.cut = true;
    // bomb behavior
    if(f.type === BOMB_IMG){
      lives = Math.max(0, lives - 1);
      debug('[FruitCut] Bomb sliced. lives='+lives);
      updateHUD();
      try{ f.el.remove(); }catch(e){}
      const idx = active.indexOf(f); if(idx>=0) active.splice(idx,1);
      return;
    }

    // compute screen rect & center
    const rect = f.el.getBoundingClientRect();
    const areaRect = gameArea.getBoundingClientRect();
    const cx = rect.left + rect.width/2 - areaRect.left;
    const cy = rect.top + rect.height/2 - areaRect.top;

    // create two halves
    const src = (f.el.querySelector('img') && f.el.querySelector('img').src) ? f.el.querySelector('img').src : (CACHE[f.type] && CACHE[f.type].src) || '';
    createHalf(src, rect.left - areaRect.left, areaRect.bottom - rect.bottom, rect.width, rect.height, 'left');
    createHalf(src, rect.left - areaRect.left, areaRect.bottom - rect.bottom, rect.width, rect.height, 'right');

    // juice + cleanup
    addJuice(cx, cy, colorFor(f.type));
    try{ f.el.remove(); }catch(e){}
    const idx = active.indexOf(f); if(idx>=0) active.splice(idx,1);
    score += 10; coins += 1; updateHUD();
    debug('[FruitCut] Fruit sliced:', f.type);
  }

  // create half piece element and animate physics
  function createHalf(src, left, bottom, fullW, fullH, side){
    const half = document.createElement('div');
    half.className = 'half';
    half.style.left = left + 'px';
    half.style.bottom = bottom + 'px';
    half.style.width = (fullW/2) + 'px';
    half.style.height = fullH + 'px';
    half.style.transformOrigin = '50% 50%';
    // child crop which shows either left or right half via background-position
    const crop = document.createElement('div');
    crop.className = 'crop';
    crop.style.width = '200%';
    crop.style.height = '100%';
    crop.style.backgroundImage = src ? `url(${src})` : 'none';
    crop.style.backgroundSize = `${fullW*2}px ${fullH}px`;
    if(side === 'left'){
      crop.style.left = '0px';
    } else {
      // shift left so right half shows inside half box
      crop.style.left = `-${fullW}px`;
    }
    half.appendChild(crop);
    gameArea.appendChild(half);

    // initial physics
    const dir = (side === 'left') ? -1 : 1;
    const vx = (0.9 + Math.random()*1.2) * dir;
    const vy = 6 + Math.random()*2;
    const vr = (Math.random()*6 + 4) * dir;
    halves.push({el:half,x:left,y:-bottom,vx,vy,rot: (Math.random()-0.5)*20,vr,life:90});
  }

  // HUD
  function updateHUD(){
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    coinsEl.textContent = coins;
    levelEl.textContent = level;
    pauseBtn.disabled = !running;
  }

  // scheduler
  let spawnTimer = null;
  function startGame(){
    if(running) return;
    running = true;
    if(!spawnTimer) spawnTimer = setInterval(spawnOne, SPAWN_INTERVAL);
    bigStart && (bigStart.style.display='none');
    debug('[FruitCut] Game started');
    updateHUD();
  }
  function pauseGame(){ running = !running; if(!running && spawnTimer){ clearInterval(spawnTimer); spawnTimer=null; } else if(running && !spawnTimer) spawnTimer = setInterval(spawnOne, SPAWN_INTERVAL); debug('[FruitCut] Pause toggled', running); updateHUD(); }
  function restartGame(){ location.reload(); }

  startBtn && startBtn.addEventListener('click', startGame);
  pauseBtn && pauseBtn.addEventListener('click', pauseGame);
  restartBtn && restartBtn.addEventListener('click', restartGame);
  bigStart && (bigStart.addEventListener('click', startGame));
  document.getElementById('consoleBtn').addEventListener('click', ()=> { debugBox.style.display = (debugBox.style.display==='block'?'none':'block'); });

  // loader & loop
  (async function init(){
    debug('[FruitCut] script init');
    await preloadImages(PRELOAD_TIMEOUT);
    resizeAll();
    requestAnimationFrame(step);
    // auto start fallback
    setTimeout(()=>{ if(!
