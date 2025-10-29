/* js/game.js - Stable Fruit Cut
   Put transparent PNGs in images/ with names exactly as in IMGS.
*/

(function(){
  // DOM
  const debugBox = document.getElementById('debug');
  function dbg(msg, level='log'){ const d = document.createElement('div'); d.className='debugLine'; d.textContent = '['+new Date().toLocaleTimeString()+'] '+msg; if(level==='error') d.style.color='#f88'; debugBox.appendChild(d); while(debugBox.childElementCount>200) debugBox.removeChild(debugBox.firstChild); (console[level]||console.log)('[FruitCut]',msg); }

  document.getElementById('toggleConsole').addEventListener('click', ()=> {
    debugBox.style.display = (debugBox.style.display === 'none' ? 'block' : 'none');
  });

  // try to load eruda (non-blocking)
  (function(){ try{ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/eruda'; s.onload = ()=> { try{ eruda.init(); dbg('eruda loaded'); } catch(e){ dbg('eruda init failed: '+e,'error'); } }; s.onerror = ()=> dbg('eruda failed to load'); document.head.appendChild(s); } catch(e){ dbg('eruda inject failed: '+e,'error'); } })();

  // Elements
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

  // Config
  const IMGS = ["apple.png","banana.png","mango.png","orange.png","watermelon.png","strawberry.png","pineapple.png","papaya.png","pomegranate.png"];
  const BOMB = "bomb.png";
  const ALL = IMGS.concat([BOMB]);
  const PRELOAD_TIMEOUT = 3000;
  const GRAVITY = 0.18;
  const SPAWN_INTERVAL = 1800;
  const MAX_ACTIVE = 5;

  // State
  let score = 0, lives = 3, coins = 0, level = 1, running = false;
  const active = [];
  const CACHE = {};
  let areaW = 480, areaH = 520;
  let bladeCtx = bladeCanvas.getContext('2d'), splatCtx = splatCanvas.getContext('2d');

  function resizeAll(){
    const r = gameArea.getBoundingClientRect();
    areaW = Math.max(1, Math.floor(r.width));
    areaH = Math.max(1, Math.floor(r.height));
    bladeCanvas.width = areaW; bladeCanvas.height = areaH;
    splatCanvas.width = areaW; splatCanvas.height = areaH;
    dbg('Area size: ' + areaW + 'x' + areaH);
  }
  window.addEventListener('resize', resizeAll);
  setTimeout(resizeAll, 60);

  // Preload images with timeout
  async function preload(timeoutMs = PRELOAD_TIMEOUT){
    dbg('Preloading images (timeout '+timeoutMs+'ms) ...');
    const tasks = ALL.map(name => new Promise(res => {
      try{
        const img = new Image();
        img.onload = ()=>{ CACHE[name] = img; dbg('loaded ' + name); res({name,ok:true}); };
        img.onerror = ()=>{ dbg('failed: ' + name); res({name,ok:false}); };
        img.src = 'images/' + name;
      }catch(e){ dbg('preload err ' + name + ': ' + e, 'error'); res({name,ok:false}); }
    }));
    const all = Promise.all(tasks);
    const t = new Promise(r => setTimeout(()=> r('__timeout__'), timeoutMs));
    const result = await Promise.race([all, t]);
    if(result === '__timeout__'){ dbg('Preload timed out — continuing (waiting in background)'); try{ await all; } catch(e){} }
    const missing = ALL.filter(n => !CACHE[n]);
    if(missing.length){ dbg('Missing images: ' + missing.join(', '), 'error'); } else { dbg('Preload finished — all images available'); }
  }

  // spawn robust function (always creates <img> element to avoid null)
  function spawnOne(){
    if(!running) return;
    if(active.length >= MAX_ACTIVE) return;

    const isBomb = Math.random() < 0.06;
    const name = isBomb ? BOMB : IMGS[Math.floor(Math.random() * IMGS.length)];

    const wrapper = document.createElement('div');
    wrapper.className = 'fruit';
    wrapper.style.position = 'absolute';
    wrapper.style.pointerEvents = 'none';

    const img = document.createElement('img');
    img.className = 'fruit-img';
    img.draggable = false;
    img.style.display = 'block';

    const targetW = Math.max(40, Math.min(96, Math.floor(areaW * 0.09)));

    if(CACHE[name]){
      img.src = CACHE[name].src;
      img.style.width = targetW + 'px';
      img.style.height = 'auto';
      wrapper.appendChild(img);
    } else {
      // keep img element (empty src) to avoid null later; show emoji fallback
      img.src = ''; img.style.width = targetW + 'px'; img.style.height = 'auto';
      const emo = document.createElement('div');
      emo.style.width = targetW + 'px';
      emo.style.height = (targetW) + 'px';
      emo.style.display = 'flex';
      emo.style.alignItems = 'center';
      emo.style.justifyContent = 'center';
      emo.style.fontSize = Math.max(28, Math.floor(targetW * 0.8)) + 'px';
      emo.textContent = emojiFor(name);
      wrapper.appendChild(img);
      wrapper.appendChild(emo);
    }

    wrapper.dataset.type = name;
    const leftPos = Math.floor(Math.random() * Math.max(1, areaW - targetW - 20)) + 10;
    wrapper.style.left = leftPos + 'px';
    wrapper.style.bottom = '-28px';
    gameArea.appendChild(wrapper);

    const vx = (Math.random() - 0.5) * 1.2;
    const vy = 7.0 + Math.random() * 1.0; // slower
    const rot = (Math.random() - 0.5) * 20;
    active.push({el: wrapper, x: leftPos, y: -28, vx, vy, rot, type: name, cut: false, w: targetW});
    dbg('spawned ' + name + (CACHE[name] ? ' (cached)' : ' (fallback)'));
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
    if(name.includes('bomb')) return '💣';
    return '🍇';
  }

  // animation & physics
  let last = performance.now();
  function step(now){
    const dt = Math.min(40, now - last) / 16.666; last = now;
    for(let i = active.length - 1; i >= 0; i--){
      const f = active[i];
      f.vy -= GRAVITY * dt;
      f.x += f.vx * dt * 1.2;
      f.y += f.vy * dt;
      f.rot += f.vx * dt;
      f.el.style.transform = `translate3d(${f.x}px, ${-f.y}px, 0) rotate(${f.rot}deg)`;
      if(f.x < -300 || f.x > areaW + 300 || f.y < -800){
        try{ if(f.el.parentNode) f.el.parentNode.removeChild(f.el); } catch(e){}
        active.splice(i,1);
      }
    }
    drawBlade();
    drawJuice();
    requestAnimationFrame(step);
  }

  // juice particles
  const juice = [];
  function addJuice(x,y,color){
    juice.push({x,y,c:color,a:1,r:8 + Math.random()*6,vy:-3 - Math.random()*2, vx:(Math.random()-0.5)*4, t:0});
  }
  function drawJuice(){
    if(!splatCtx) return;
    splatCtx.clearRect(0,0,splatCanvas.width,splatCanvas.height);
    for(let i=juice.length-1;i>=0;i--){
      const p = juice[i];
      splatCtx.beginPath();
      splatCtx.fillStyle = `rgba(${p.c.r},${p.c.g},${p.c.b},${p.a})`;
      splatCtx.arc(p.x, p.y + p.t*0.6, p.r, 0, Math.PI*2);
      splatCtx.fill();
      p.t += 1; p.y += p.vy; p.x += p.vx; p.a -= 0.03;
      if(p.a <= 0) juice.splice(i,1);
    }
  }

  function colorFor(name){
    if(name.includes('apple')) return {r:220,g:50,b:60};
    if(name.includes('banana')) return {r:240,g:210,b:60};
    if(name.includes('orange')) return {r:245,g:140,b:40};
    if(name.includes('mango')) return {r:255,g:160,b:40};
    if(name.includes('strawberry')) return {r:230,g:80,b:90};
    if(name.includes('pineapple')) return {r:245,g:180,b:70};
    return {r:240,g:120,b:100};
  }

  // blade visuals
  let bladePoints = [];
  function addBladePoint(x,y){ const r=gameArea.getBoundingClientRect(); bladePoints.push({x:x-r.left,y:y-r.top,t:Date.now()}); if(bladePoints.length>12) bladePoints.shift(); }
  function drawBlade(){
    if(!bladeCtx) return;
    bladeCtx.clearRect(0,0,bladeCanvas.width,bladeCanvas.height);
    if(bladePoints.length<2) return;
    bladeCtx.lineJoin='round'; bladeCtx.lineCap='round';
    for(let i=0;i<bladePoints.length-1;i++){
      const p1 = bladePoints[i], p2 = bladePoints[i+1], age = Date.now()-p1.t, alpha = Math.max(0,1-age/420);
      bladeCtx.strokeStyle = `rgba(34,197,94,${0.9*alpha})`;
      bladeCtx.lineWidth = 6*alpha+2;
      bladeCtx.beginPath(); bladeCtx.moveTo(p1.x,p1.y); bladeCtx.lineTo(p2.x,p2.y); bladeCtx.stroke();
    }
    bladePoints = bladePoints.filter(p => (Date.now() - p.t) < 520);
  }

  // pointer handling & slicing
  let isDown = false, pointerHistory = [];
  window.addEventListener('pointerdown', e => { isDown = true; pointerHistory = []; addBladePoint(e.clientX,e.clientY); e.preventDefault && e.preventDefault(); }, {passive:false});
  window.addEventListener('pointermove', e => {
    if(!isDown) return;
    addBladePoint(e.clientX,e.clientY);
    pointerHistory.push({x:e.clientX,y:e.clientY});
    if(pointerHistory.length > 14) pointerHistory.shift();
    if(pointerHistory.length >= 2){
      const p1 = pointerHistory[pointerHistory.length-2], p2 = pointerHistory[pointerHistory.length-1];
      for(const f of active.slice()){
        try{
          const r = f.el.getBoundingClientRect();
          if(lineIntersectsRect(p1,p2,r)) sliceFruit(f);
        }catch(e){}
      }
    }
  }, {passive:true});
  window.addEventListener('pointerup', ()=>{ isDown=false; pointerHistory=[]; bladePoints=[]; });

  function lineIntersectsRect(p1,p2,rect){
    if((p1.x < rect.left && p2.x < rect.left) || (p1.x > rect.right && p2.x > rect.right) ||
       (p1.y < rect.top && p2.y < rect.top) || (p1.y > rect.bottom && p2.y > rect.bottom)) return false;
    return true;
  }

  function sliceFruit(f){
    if(!f || f.cut) return; f.cut = true;
    if(f.type === BOMB){
      lives = Math.max(0, lives - 1);
      dbg('Bomb sliced. lives=' + lives, 'error');
      updateHUD();
      try{ if(f.el.parentNode) f.el.parentNode.removeChild(f.el); }catch(e){}
      const idx = active.indexOf(f); if(idx>=0) active.splice(idx,1);
      return;
    }
    // create halves + juice
    try{
      const rect = f.el.getBoundingClientRect();
      const cx = rect.left + rect.width/2 - gameArea.getBoundingClientRect().left;
      const cy = rect.top + rect.height/2 - gameArea.getBoundingClientRect().top;
      const color = colorFor(f.type);
      addJuice(cx, cy, color);
    }catch(e){ dbg('slice create halves err:'+e,'error'); }
    try{ if(f.el.parentNode) f.el.parentNode.removeChild(f.el); }catch(e){}
    const idx = active.indexOf(f); if(idx>=0) active.splice(idx,1);
    score += 10; coins += 1; updateHUD();
    dbg('Fruit sliced: ' + f.type);
  }

  function updateHUD(){ scoreEl.textContent = score; livesEl.textContent = lives; coinsEl.textContent = coins; levelEl.textContent = level; pauseBtn.disabled = !running; }

  // spawn timer
  let spawnHandle = null;
  function startGame(){
    if(running) return;
    running = true;
    if(spawnHandle) clearInterval(spawnHandle);
    spawnHandle = setInterval(spawnOne, SPAWN_INTERVAL);
    dbg('Game started');
  }
  function pauseGame(){ running = !running; if(!running && spawnHandle){ clearInterval(spawnHandle); spawnHandle = null; } else if(running && !spawnHandle) spawnHandle = setInterval(spawnOne, SPAWN_INTERVAL); dbg('Pause toggled: ' + running); }
  function restartGame(){ // simple reload for clean state
    location.reload();
  }
  startBtn && startBtn.addEventListener('click', startGame);
  pauseBtn && pauseBtn.addEventListener('click', pauseGame);
  restartBtn && restartBtn.addEventListener('click', restartGame);
  bigStart && bigStart.addEventListener('click', startGame);

  // init
  (async function init(){
    dbg('Script loaded');
    await preload(PRELOAD_TIMEOUT);
    resizeAll();
    requestAnimationFrame(step);
    updateHUD();
    // auto-start fallback
    setTimeout(()=>{ if(!running){ dbg('Auto-start fallback'); startGame(); } }, 160);
  })();

  // expose small debug
  window.FruitCut = {
    dbg,
    preload,
    active
  };

})();
