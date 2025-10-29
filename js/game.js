/* js/game.js — Final update with:
   - Bomb cuts reduce life
   - Missing fruit does nothing
   - Game Over overlay
*/
(() => {
  const IMG_PATH = 'images/';
  const ALL_IMAGES = [
    'apple.png','banana.png','cantaloupe.png','guava.png','mango.png',
    'orange.png','papaya.png','pear.png','pineapple.png','plum.png',
    'pomegranate.png','strawberry.png','watermelon.png','bomb.png'
  ];
  const PRELOAD_TIMEOUT = 3500;
  const SPAWN_INTERVAL_INIT = 900;
  const FRUIT_SIZE = 100;
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
  const debugConsole = document.getElementById('debugConsole');
  const missingBox = document.getElementById('missingBox');

  // Canvas
  const bctx = bladeCanvas.getContext('2d');

  // State
  let CACHE = {};
  let missing = [];
  let running = false;
  let spawnTimer = null;
  let fruits = [];
  let score = 0, lives = 3, coins = 0, level = 1;
  let bladePoints = [];

  // Game Over overlay
  let gameOverOverlay = null;

  function dbg(msg, kind='info'){
    const ts = new Date().toTimeString().slice(0,8);
    const el = document.createElement('div');
    el.textContent = `[${ts}] ${msg}`;
    if(kind === 'err') el.style.color = '#ff6b6b';
    dbgLog.appendChild(el);
    dbgLog.scrollTop = dbgLog.scrollHeight;
    console.log('[FruitCut]', msg);
  }

  async function tryLoad(name){
    return new Promise(res=>{
      const img = new Image();
      let done = false;
      img.onload = ()=>{ if(!done){done=true;res({ok:true,img,name});}};
      img.onerror = ()=>{ if(!done){done=true;res({ok:false,name});}};
      img.src = IMG_PATH + name;
      setTimeout(()=>{ if(!done){done=true;res({ok:false,name});}}, PRELOAD_TIMEOUT);
    });
  }

  async function preloadAll(){
    dbg('Preload start...');
    for(const n of ALL_IMAGES){
      const r = await tryLoad(n);
      if(r.ok){ CACHE[n] = r.img; dbg('loaded '+n); }
      else { missing.push(n); dbg('missing '+n,'err'); }
    }
    if(missing.length){
      missingBox.classList.add('visible');
      missingBox.innerHTML = `<strong>Missing:</strong><br>${missing.join('<br>')}`;
    }
    dbg('Preload finished');
  }

  function resizeCanvas(){
    const r = area.getBoundingClientRect();
    bladeCanvas.width = Math.floor(r.width);
    bladeCanvas.height = Math.floor(r.height);
  }
  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 50);

  function addBladePoint(x,y){
    const r = area.getBoundingClientRect();
    bladePoints.push({x:x-r.left,y:y-r.top,t:Date.now()});
    if(bladePoints.length>30) bladePoints.shift();
  }

  function drawBlade(){
    bctx.clearRect(0,0,bladeCanvas.width,bladeCanvas.height);
    if(bladePoints.length<2){
      requestAnimationFrame(drawBlade);
      return;
    }
    bctx.lineJoin='round'; bctx.lineCap='round';
    for(let i=0;i<bladePoints.length-1;i++){
      const p1=bladePoints[i], p2=bladePoints[i+1];
      const age = Date.now()-p1.t;
      const alpha = Math.max(0,1-age/350);
      bctx.strokeStyle=`rgba(34,197,94,${alpha})`;
      bctx.lineWidth=14*alpha;
      bctx.beginPath();bctx.moveTo(p1.x,p1.y);bctx.lineTo(p2.x,p2.y);bctx.stroke();
    }
    bladePoints = bladePoints.filter(p=>(Date.now()-p.t)<450);
    requestAnimationFrame(drawBlade);
  }
  drawBlade();

  // pointer controls
  window.addEventListener('pointerdown',e=>addBladePoint(e.clientX,e.clientY));
  window.addEventListener('pointermove',e=>{addBladePoint(e.clientX,e.clientY);checkSlice();});
  window.addEventListener('pointerup',()=>bladePoints=[]);

  function spawnFruit(){
    if(!running) return;
    const avail = ALL_IMAGES.filter(n=>CACHE[n]);
    if(!avail.length) return;
    const name = avail[Math.floor(Math.random()*avail.length)];
    const img = CACHE[name];
    const r = area.getBoundingClientRect();
    const x = Math.random()*(r.width-60)+30;
    const y = r.height + 40;
    const vx = (Math.random()-0.5)*VX_MAX*2;
    const vy = - (Math.random()*(THROW_VY_MAX-THROW_VY_MIN)+THROW_VY_MIN);
    const rot = Math.random()*360;
    const el = document.createElement('img');
    el.src = img.src;
    el.className='fruit-sprite';
    el.style.width=FRUIT_SIZE+'px';
    el.style.left=x+'px';
    el.style.top=y+'px';
    el.style.transform=`translate(-50%,-50%) rotate(${rot}deg)`;
    el.dataset.name=name;
    area.appendChild(el);
    fruits.push({name,el,x,y,vx,vy,rot,spin:(Math.random()-0.5)*6,sliced:false});
  }

  function updatePhysics(){
    const r = area.getBoundingClientRect();
    for(let i=fruits.length-1;i>=0;i--){
      const f=fruits[i];
      if(f.sliced) continue;
      f.vy += GRAVITY;
      f.x += f.vx;
      f.y += f.vy;
      f.rot += f.spin;
      f.el.style.left=f.x+'px';
      f.el.style.top=f.y+'px';
      f.el.style.transform=`translate(-50%,-50%) rotate(${f.rot}deg)`;
      if(f.y - FRUIT_SIZE/2 > r.height+100){
        // fruit miss -> nothing happens now
        try{f.el.remove();}catch(e){}
        fruits.splice(i,1);
      }
    }
  }

  function pointInRect(p,r){
    return p.x>=r.left && p.x<=r.right && p.y>=r.top && p.y<=r.bottom;
  }

  function checkSlice(){
    if(bladePoints.length<2) return;
    const p1=bladePoints[bladePoints.length-2];
    const p2=bladePoints[bladePoints.length-1];
    for(let i=0;i<fruits.length;i++){
      const f=fruits[i];
      if(f.sliced) continue;
      const rect=f.el.getBoundingClientRect();
      if(pointInRect(p1,rect)||pointInRect(p2,rect)){
        sliceFruit(i);
      }
    }
  }

  function sliceFruit(i){
    const f=fruits[i];
    if(!f||f.sliced) return;
    f.sliced=true;
    if(f.name==='bomb.png'){
      lives=Math.max(0,lives-1);
      updateHUD();
      showExplosion(f.x,f.y);
      try{f.el.remove();}catch(e){}
      fruits.splice(i,1);
      if(lives<=0) gameOver();
      return;
    }
    // normal fruit
    score+=10; coins+=1;
    updateHUD();
    makeHalves(f);
  }

  function showExplosion(x,y){
    const boom=document.createElement('div');
    boom.textContent='💥';
    boom.style.position='absolute';
    boom.style.left=x+'px';
    boom.style.top=y+'px';
    boom.style.transform='translate(-50%,-50%)';
    boom.style.fontSize='40px';
    area.appendChild(boom);
    setTimeout(()=>boom.remove(),600);
  }

  function makeHalves(f){
    const a=document.createElement('img'), b=document.createElement('img');
    a.src=b.src=f.el.src;
    a.className=b.className='fruit-sprite';
    a.style.width=b.style.width=FRUIT_SIZE+'px';
    a.style.left=b.style.left=f.x+'px';
    a.style.top=b.style.top=f.y+'px';
    a.style.clipPath='polygon(0 0,55% 0,55% 100%,0 100%)';
    b.style.clipPath='polygon(45% 0,100% 0,100% 100%,45% 100%)';
    area.appendChild(a); area.appendChild(b);
    try{f.el.remove();}catch(e){}
    fruits.splice(i,1);
    const va={x:f.x,y:f.y,vx:f.vx-1.4,vy:f.vy-1.6,rot:f.rot-10};
    const vb={x:f.x,y:f.y,vx:f.vx+1.4,vy:f.vy-1.6,rot:f.rot+10};
    const start=Date.now();
    const anim=()=>{
      va.vy+=GRAVITY;vb.vy+=GRAVITY;
      va.x+=va.vx;vb.x+=vb.vx;va.y+=va.vy;vb.y+=vb.vy;
      va.rot+=2;vb.rot-=2;
      a.style.left=va.x+'px';a.style.top=va.y+'px';
      a.style.transform=`translate(-50%,-50%) rotate(${va.rot}deg)`;
      b.style.left=vb.x+'px';b.style.top=vb.y+'px';
      b.style.transform=`translate(-50%,-50%) rotate(${vb.rot}deg)`;
      const t=Date.now()-start;
      const alpha=Math.max(0,1-t/1200);
      a.style.opacity=b.style.opacity=alpha;
      if(t<1400){requestAnimationFrame(anim);}else{a.remove();b.remove();}
    };
    requestAnimationFrame(anim);
  }

  function updateHUD(){
    scoreEl.textContent=score;
    livesEl.textContent=lives;
    coinsEl.textContent=coins;
    levelEl.textContent=level;
  }

  function gameTick(){
    updatePhysics();
    if(running) requestAnimationFrame(gameTick);
  }

  function startGame(){
    if(running) return;
    running=true;
    bigStart.style.display='none';
    if(spawnTimer) clearInterval(spawnTimer);
    spawnTimer=setInterval(spawnFruit,SPAWN_INTERVAL_INIT);
    spawnFruit();
    requestAnimationFrame(gameTick);
  }

  function pauseGame(){
    running=!running;
    if(!running && spawnTimer){clearInterval(spawnTimer);spawnTimer=null;}
    else if(running && !spawnTimer){spawnTimer=setInterval(spawnFruit,SPAWN_INTERVAL_INIT);requestAnimationFrame(gameTick);}
  }

  function restartGame(){
    area.querySelectorAll('.fruit-sprite,div').forEach(el=>{if(el.id!=='debugConsole'&&el.id!=='missingBox')el.remove();});
    fruits=[];
    score=0;lives=3;coins=0;level=1;
    updateHUD();
    if(gameOverOverlay){gameOverOverlay.remove();gameOverOverlay=null;}
    startGame();
  }

  function gameOver(){
    running=false;
    if(spawnTimer){clearInterval(spawnTimer);spawnTimer=null;}
    dbg('[FruitCut] Game Over');
    showGameOverScreen();
  }

  function showGameOverScreen(){
    gameOverOverlay=document.createElement('div');
    gameOverOverlay.style.position='absolute';
    gameOverOverlay.style.left='0';gameOverOverlay.style.top='0';
    gameOverOverlay.style.width='100%';gameOverOverlay.style.height='100%';
    gameOverOverlay.style.background='rgba(0,0,0,0.8)';
    gameOverOverlay.style.display='flex';gameOverOverlay.style.flexDirection='column';
    gameOverOverlay.style.alignItems='center';gameOverOverlay.style.justifyContent='center';
    gameOverOverlay.style.zIndex='2000';gameOverOverlay.style.color='#fff';
    gameOverOverlay.innerHTML=`
      <h2 style="font-size:32px;margin-bottom:12px;">Game Over</h2>
      <p style="font-size:18px;margin-bottom:20px;">Final Score: ${score}</p>
      <button id="goRestart" style="padding:10px 16px;font-size:16px;border-radius:8px;border:0;background:#fff;color:#111;cursor:pointer;">Restart</button>
    `;
    area.appendChild(gameOverOverlay);
    document.getElementById('goRestart').addEventListener('click',restartGame);
  }

  startBtn.addEventListener('click',startGame);
  pauseBtn.addEventListener('click',pauseGame);
  restartBtn.addEventListener('click',restartGame);
  bigStart.addEventListener('click',startGame);
  toggleDbg.addEventListener('click',()=>debugConsole.classList.toggle('hidden'));

  (async function init(){
    dbg('[FruitCut] init');
    await preloadAll();
    resizeCanvas();
    startGame();
  })();
})();
