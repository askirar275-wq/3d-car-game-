/* js/game.js - Final updated game
   Requirements: place transparency-capable PNGs in /images/ with exact filenames used in window.USER_IMGS.
   This file auto-preloads, auto-starts with a fallback, draws blade trail, juice splats, and a debug console.
*/

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
  const consoleBtn = document.getElementById('consoleBtn');

  // config
  const USER_IMGS = Array.isArray(window.USER_IMGS) ? window.USER_IMGS.slice() : [];
  const BOMB_IMG = (typeof window.USER_BOMB === 'string') ? window.USER_BOMB : 'bomb.png';
  const IMGS = USER_IMGS.length ? USER_IMGS.slice() : ["apple.png","banana.png","mango.png","orange.png","watermelon.png","strawberry.png","pineapple.png","papaya.png","pomegranate.png"];
  const ALL_IMAGES = IMGS.concat([BOMB_IMG]);
  const PRELOAD_TIMEOUT = 2500;
  const GRAVITY = 0.16;
  const SPAWN_INTERVAL = 700; // quicker spawns
  const MAX_ACTIVE = 10;

  // state
  let score=0, lives=3, coins=0, level=1;
  let running=false;
  const active = []; // active fruit objects
  const CACHE = {}; // filename -> HTMLImageElement
  let areaW=480, areaH=520;

  // canvas contexts
  const bladeCtx = bladeCanvas.getContext('2d');
  const splatCtx = splatCanvas.getContext('2d');

  // resize handler
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
  window.addEventListener('resize', () => setTimeout(resizeAll,60));
  setTimeout(resizeAll,60);

  // debug helper (shows overlay)
  function debug(...args){
    try{ console.log('[FruitCut]',...args); if(debugBox){ const d=document.createElement('div'); d.className='debugLine'; d.textContent = args.join(' '); debugBox.appendChild(d); while(debugBox.childElementCount>250) debugBox.removeChild(debugBox.firstChild); } }catch(e){}
  }

  // preload images with timeout but continue
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
        if(result === '__timeout__'){ debug('[FruitCut] preload timed out — continuing, background will finish soon'); Promise.all(prom).then(()=> debug('[FruitCut] background preload finished')); }
        const missing = ALL_IMAGES.filter(n => !CACHE[n]);
        if(missing.length){ debug('[FruitCut] Missing images:', missing.join(', ')); } else debug('[FruitCut] Preload complete');
      });
  }

  // spawn logic
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
    img.style.width = Math.max(46, Math.floor(areaW * 0.12)) + 'px';
    img.style.height = 'auto';
    img.style.userSelect = 'none';

    // safe src assignment
    if(CACHE[name] && CACHE[name].src){
      img.src = CACHE[name].src;
      el.appendChild(img);
    } else {
      // fallback: keep img element (src may be empty) and show emoji box for now
      img.src = '';
      const fb = document.createElement('div');
      fb.style.width = img.style.width;
      fb.style.height = img.style.width;
      fb.style.display = 'flex';
      fb.style.alignItems = 'center';
      fb.style.justifyContent = 'center';
      fb.style.fontSize = Math.max(28, Math.floor(areaW * 0.06)) + 'px';
      fb.textContent = emojiFor(name);
      el.appendChild(img);
      el.appendChild(fb);
    }

    const w = parseInt(img.style.width,10) || Math.max(46, Math.floor(areaW * 0.12));
    const left = Math.floor(Math.random() * Math.max(1, areaW - w - 24)) + 12;
    el.style.left = left + 'px';
    // spawn from bottom (below visible area), travel upwards then fall
    el.style.bottom = '-40px';
    gameArea.appendChild(el);

    // physics
    const vx = (Math.random()-0.5) * 1.6;
    const vy = 8.8 + Math.random()*1.6; // upward impulse
    const rot = (Math.random()-0.5) * 18;

    active.push({el, x:left, y:-40, vx, vy, rot, type:name, cut:false, w});
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
    for(let i = active.length-1;i>=0;i--){
      const f = active[i];
      f.vy -= GRAVITY * dt;
      f.x += f.vx * dt * 1.1;
      f.y += f.vy * dt;
      f.rot += f.vx * dt;
      f.el.style.transform = `translate3d(${f.x}px, ${-f.y}px, 0) rotate(${f.rot}deg)`;
      // remove if gone too far
      if(f.x < -400 || f.x > areaW + 400 || f.y < -900){
        try{ f.el.remove(); }catch(e){}
        active.splice(i,1);
      }
    }
    drawBlade();
    drawJuice();
    requestAnimationFrame(step);
  }

  // juice splats
  const juice = [];
  function addJuice(x,y,color){
    juice.push({x,y,c:color,a:1,r:7+Math.random()*9,vy:-2-Math.random()*2,vx:(Math.random()-0.5)*3,t:0});
  }
  function drawJuice(){
    splatCtx.clearRect(0,0,splatCanvas.width,splatCanvas.height);
    for(let i=juice.length-1;i>=0;i--){
      const p = juice[i];
      splatCtx.beginPath();
      splatCtx.fillStyle = `rgba(${p.c.r},${p.c.g},${p.c.b},${p.a})`;
      splatCtx.arc(p.x, p.y + p.t*0.4, p.r, 0, Math.PI*2);
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
  function addBladePoint(x,y){ const r = gameArea.getBoundingClientRect(); bladePoints.push({x:x-r.left, y:y-r.top, t:Date.now()}); if(bladePoints.length>20) bladePoints.shift(); }
  function drawBlade(){
    bladeCtx.clearRect(0,0,bladeCanvas.width,bladeCanvas.height);
    if(bladePoints.length < 2) return;
    bladeCtx.lineJoin = 'round'; bladeCtx.lineCap = 'round';
    for(let i=0;i<bladePoints.length-1;i++){
      const p1 = bladePoints[i], p2 = bladePoints[i+1];
      const age = Date.now() - p1.t; const alpha = Math.max(0,1 - age/420);
      bladeCtx.strokeStyle = `rgba(34,197,94,${0.95*alpha})`;
      bladeCtx.lineWidth = 8*alpha + 2;
      bladeCtx.beginPath(); bladeCtx.moveTo(p1.x,p1.y); bladeCtx.lineTo(p2.x,p2.y); bladeCtx.stroke();
    }
    bladePoints = bladePoints.filter(p => (Date.now() - p.t) < 520);
  }

  // pointer events and slicing
  let isDown=false, history=[];
  window.addEventListener('pointerdown', e => { isDown=true; history=[]; addBladePoint(e.clientX,e.clientY); e.preventDefault && e.preventDefault(); }, {passive:false});
  window.addEventListener('pointermove', e => {
    if(!isDown) return;
    addBladePoint(e.clientX,e.clientY);
    history.push({x:e.clientX,y:e.clientY});
    if(history.length>18) history.shift();
    if(history.length>=2){
      const p1 = history[history.length-2], p2 = history[history.length-1];
      for(const f of active.slice()){
        try{
          const r = f.el.getBoundingClientRect();
          if(lineIntersectsRect(p1,p2,r)) sliceFruit(f);
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

  function sliceFruit(f){
    if(!f || f.cut) return; f.cut = true;
    if(f.type === BOMB_IMG){
      lives = Math.max(0, lives - 1);
      debug('[FruitCut] Bomb sliced. lives='+lives);
      updateHUD();
      try{ f.el.remove(); }catch(e){}
      const idx = active.indexOf(f); if(idx>=0) active.splice(idx,1);
      return;
    }
    try{
      const rect = f.el.getBoundingClientRect();
      const cx = rect.left + rect.width/2 - gameArea.getBoundingClientRect().left;
      const cy = rect.top + rect.height/2 - gameArea.getBoundingClientRect().top;
      addJuice(cx, cy, colorFor(f.type));
    }catch(e){}
    try{ f.el.remove(); }catch(e){}
    const idx = active.indexOf(f); if(idx>=0) active.splice(idx,1);
    score += 10; coins += 1; updateHUD();
    debug('[FruitCut] Fruit sliced:', f.type);
  }

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
    spawnTimer = setInterval(spawnOne, SPAWN_INTERVAL);
    debug('[FruitCut] Game started');
    bigStart && (bigStart.style.display = 'none');
    updateHUD();
  }
  function pauseGame(){ running = !running; if(!running && spawnTimer){ clearInterval(spawnTimer); spawnTimer = null; } else if(running && !spawnTimer) spawnTimer = setInterval(spawnOne, SPAWN_INTERVAL); debug('[FruitCut] Pause toggled', running); updateHUD(); }
  function restartGame(){ location.reload(); }

  startBtn && startBtn.addEventListener('click', startGame);
  pauseBtn && pauseBtn.addEventListener('click', pauseGame);
  restartBtn && restartBtn.addEventListener('click', restartGame);
  bigStart && (bigStart.addEventListener('click', startGame));
  consoleBtn && consoleBtn.addEventListener('click', ()=> {
    if(debugBox.style.display === 'block'){ debugBox.style.display='none'; } else { debugBox.style.display='block'; }
  });

  // loader & init
  (async function init(){
    debug('[FruitCut] script init');
    await preloadImages(PRELOAD_TIMEOUT);
    resizeAll();
    requestAnimationFrame(step);
    // auto-start fallback: if not started quickly, start anyway
    setTimeout(()=>{ if(!running){ debug('[FruitCut] Auto-start fallback'); startGame(); } }, 150);
  })();

  // expose small API
  window.FruitCut = {
    setImageList(names){ if(Array.isArray(names) && names.length){ window.USER_IMGS = names.slice(); debug('[FruitCut] user set images'); location.reload(); } },
    debug
  };

})();
