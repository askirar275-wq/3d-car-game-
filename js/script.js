/* script.js — pseudo-3D look (replace your old script.js) */

/* ----------------- helpers ----------------- */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a,b,t){ return a + (b-a)*t; }

/* Diagnostic (हटाना optional) */
console.log("script.js (3D) loaded");

/* canvas setup */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

/* HUD + DOM */
const scoreEl = document.getElementById("score");
const speedEl = document.getElementById("speed");
const overlay = document.getElementById("overlay");
const finalScore = document.getElementById("finalScore");
const restartBtn = document.getElementById("restartBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");

if (!canvas || !ctx) {
  console.error("Canvas missing");
  if (overlay) {
    overlay.classList.remove("hidden");
    document.getElementById("overlayTitle").textContent = "Error: Canvas missing";
    finalScore.textContent = "Canvas नहीं मिला";
  }
  throw new Error("Canvas missing");
}

/* player car */
const car = {
  baseW: 50,
  baseH: 90,
  x: (W - 50) / 2,
  y: H - 120,
  color: "#ff4d4d",
  speedX: 6
};

/* enemies */
let enemies = [];
let spawnTimer = 0;
let spawnInterval = 90;
let gameSpeed = 1;
let score = 0;
let running = true;

/* perspective settings */
const road = {
  leftX: 40,         // bottom-left x
  rightX: W - 40,   // bottom-right x
  topLeftX: W*0.35, // top-left x (vanishing narrow)
  topRightX: W*0.65 // top-right x
};
const vanishingY = 60; // top y coordinate for road apex

/* controls */
document.addEventListener("keydown", (e) => {
  if (!running) return;
  if (e.key === "ArrowLeft") moveLeft();
  if (e.key === "ArrowRight") moveRight();
});
if (leftBtn && rightBtn) {
  leftBtn.addEventListener("touchstart", (e)=>{ e.preventDefault(); moveLeft(); });
  rightBtn.addEventListener("touchstart", (e)=>{ e.preventDefault(); moveRight(); });
  leftBtn.addEventListener("mousedown", moveLeft);
  rightBtn.addEventListener("mousedown", moveRight);
}
restartBtn && restartBtn.addEventListener("click", resetGame);

function moveLeft(){ car.x -= car.speedX * 1.6; if (car.x < 10) car.x = 10; }
function moveRight(){ car.x += car.speedX * 1.6; if (car.x > W - car.baseW - 10) car.x = W - car.baseW - 10; }

function spawnEnemy(){
  const baseW = 40 + Math.random()*30; // base width at bottom
  const x = lerp(road.topLeftX, road.leftX, Math.random()*0.9); // spawn somewhere across perspective
  const y = -80;
  const speed = 1.5 + Math.random()*1.4 + gameSpeed*0.1;
  enemies.push({ x, y, baseW, h: 70, speed, color: "#2ea6ff" });
}

/* compute x position based on perspective:
   For a given 'screen x' in road coords (relative left->right at bottom), 
   we map to actual canvas x at given y by linear interpolation between top and bottom edges.
   But here we keep enemies anchored by a relative lane position (rx between 0..1) */
function worldXFromRel(rel, y){
  // rel 0..1 across road width
  // compute left and right edge at this y via interpolation between top and bottom
  const t = clamp((y - vanishingY) / (H - vanishingY), 0, 1);
  const leftEdge = lerp(road.topLeftX, road.leftX, t);
  const rightEdge = lerp(road.topRightX, road.rightX, t);
  return lerp(leftEdge, rightEdge, rel);
}

/* draw road with perspective */
function drawRoad(){
  // background around road
  ctx.fillStyle = "#1b1b1b";
  ctx.fillRect(0, 0, W, H);

  // draw grass/shoulder
  ctx.fillStyle = "#0f6620";
  ctx.fillRect(0, 0, road.leftX, H);
  ctx.fillRect(road.rightX, 0, W - road.rightX, H);

  // draw road trapezoid
  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.moveTo(road.leftX, H);
  ctx.lineTo(road.rightX, H);
  ctx.lineTo(road.topRightX, vanishingY);
  ctx.lineTo(road.topLeftX, vanishingY);
  ctx.closePath();
  ctx.fill();

  // lane center dashed lines (multiple segments scaled by y)
  ctx.strokeStyle = "#dddddd";
  ctx.lineWidth = 3;
  ctx.setLineDash([20, 18]);
  // draw center line from vanishing to bottom using path aligned with road center
  const centerBottom = (road.leftX + road.rightX)/2;
  const centerTop = (road.topLeftX + road.topRightX)/2;
  ctx.beginPath();
  ctx.moveTo(centerTop, vanishingY);
  ctx.lineTo(centerBottom, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // subtle side lines
  ctx.strokeStyle = "#2f2f2f";
  ctx.lineWidth = 2;
  // left edge
  ctx.beginPath();
  ctx.moveTo(road.topLeftX, vanishingY);
  ctx.lineTo(road.leftX, H);
  ctx.stroke();
  // right edge
  ctx.beginPath();
  ctx.moveTo(road.topRightX, vanishingY);
  ctx.lineTo(road.rightX, H);
  ctx.stroke();
}

/* draw a car with perspective scaling and shadow
   params:
     cx, cy = center position on canvas
     baseW, baseH = base dimensions (at bottom scale)
     scale = 0.3..1
*/
function drawCarAt(cx, cy, baseW, baseH, color, scale, tilt=0){
  const w = baseW * scale;
  const h = baseH * scale;
  const x = cx - w/2;
  const y = cy - h/2;

  // shadow
  const shadowW = w * 1.1;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, y + h + 6, shadowW/2, 8*scale, 0, 0, Math.PI*2);
  ctx.fill();

  // body with slight tilt (use skew via path)
  ctx.save();
  ctx.translate(cx, y + h/2);
  ctx.rotate(tilt * Math.PI/180);
  ctx.fillStyle = color;
  roundRect(ctx, -w/2, -h/2, w, h, 6*scale, true, true);
  // windows
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(-w*0.32, -h*0.28, w*0.64, h*0.28);
  ctx.restore();
}

/* rounded rect helper */
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) { ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.stroke(); }
}

/* collision detection in screen-space box */
function isColliding(a,b){
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

/* main loop */
function loop(){
  if (!running) return;

  // clear + draw road
  drawRoad();

  // spawn logic
  spawnTimer++;
  if (spawnTimer > spawnInterval){
    spawnEnemy();
    spawnTimer = 0;
    if (spawnInterval > 40) spawnInterval -= 2;
    //console.log("spawned enemy, spawnInterval:", spawnInterval, "enemies:", enemies.length);
  }

  // draw and update enemies
  for (let i = enemies.length - 1; i >= 0; i--){
    const e = enemies[i];
    e.y += e.speed * (1 + gameSpeed*0.2);

    // compute normalized depth factor (0 at top, 1 at bottom)
    let norm = clamp((e.y + e.h) / (H - vanishingY), 0, 1);
    const scale = 0.4 + 0.6 * norm; // top small (0.4) bottom large (1.0)

    // convert e.x (we stored as bottom-relative x near left) to a rel across road edges
    // We'll compute relative position across bottom road width:
    const bottomLeft = road.leftX;
    const bottomRight = road.rightX;
    const rel = clamp((e.x - road.topLeftX) / (road.leftX - road.topLeftX + 0.0001), 0, 1);
    // actual canvas x for this y:
    const cx = worldXFromRel(rel, e.y + e.h/2);
    const cy = e.y + e.h * scale/2 + 20; // adjust a bit downward for perspective

    // draw enemy as car
    drawCarAt(cx, cy, e.baseW, e.h, e.color, scale, 0);

    // approximate bounding box in screen space for collision detection
    const bw = e.baseW * scale;
    const bh = e.h * scale;
    const bx = cx - bw/2;
    const by = cy - bh/2;

    // player bounding box (scaled based on player's vertical position)
    const playerNorm = clamp((car.y + car.baseH) / (H - vanishingY), 0, 1);
    const playerScale = 0.4 + 0.6 * playerNorm;
    const playerCx = car.x + car.baseW/2;
    const playerCy = car.y + car.baseH/2;
    const pw = car.baseW * playerScale;
    const ph = car.baseH * playerScale;
    const px = playerCx - pw/2;
    const py = playerCy - ph/2;

    if (isColliding({x: px, y: py, w: pw, h: ph}, {x: bx, y: by, w: bw, h: bh})){
      running = false;
      console.log("Collision detected", {score});
      showGameOver();
    }

    if (e.y > H + 80){
      enemies.splice(i,1);
      score += 10 + Math.floor(gameSpeed*2);
      if (score % 100 === 0) gameSpeed += 0.5;
    }
  }

  // draw player car with perspective at bottom
  // compute player scale using its y
  const playerNorm2 = clamp((car.y + car.baseH) / (H - vanishingY), 0, 1);
  const playerScale2 = 0.4 + 0.6 * playerNorm2;
  const playerCx = car.x + car.baseW/2;
  const playerCy = car.y + car.baseH/2;
  drawCarAt(playerCx, playerCy, car.baseW, car.baseH, car.color, playerScale2, 0);

  // HUD update
  scoreEl.textContent = "स्कोर: " + score;
  speedEl.textContent = "स्पीड: " + gameSpeed.toFixed(1);

  if (running) requestAnimationFrame(loop);
}

/* reset / game over */
function resetGame(){
  enemies = [];
  spawnTimer = 0;
  spawnInterval = 90;
  gameSpeed = 1;
  score = 0;
  running = true;
  car.x = (W - car.baseW) / 2;
  overlay.classList.add("hidden");
  loop();
}

function showGameOver(){
  overlay.classList.remove("hidden");
  finalScore.textContent = "तुम्हारा स्कोर: " + score;
  document.getElementById("overlayTitle").textContent = "गेम ओवर";
}

/* start */
loop();
