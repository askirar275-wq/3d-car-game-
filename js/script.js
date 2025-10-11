/* Debug-enabled script.js — अतिरिक्त console.logs और diag messages दिए गए हैं */

// Diagnostic helper: page पर छोटा संदेश और console log दोनों भेजना
function diagLog(...args) {
  console.log(...args);
  const d = document.getElementById("diag");
  if (d) d.textContent = "DEBUG: " + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' | ');
}

// सूचित करें कि script लोड हुआ
diagLog("script.js loaded");

// Network / resource quick-check
function checkResources() {
  const resources = ["style.css", "script.js"];
  resources.forEach(r => {
    fetch(r, { method: 'HEAD' }).then(res => {
      diagLog(`RESOURCE ${r}:`, res.status);
      console.log(`RESOURCE ${r}:`, res);
    }).catch(err => {
      diagLog(`RESOURCE ${r} fetch failed: ${err}`);
      console.error(err);
    });
  });
}
checkResources();

// DOM elements diagnostic
diagLog("elements:", {
  canvas: document.getElementById("gameCanvas"),
  leftBtn: document.getElementById("leftBtn"),
  rightBtn: document.getElementById("rightBtn"),
  overlay: document.getElementById("overlay")
});

// अगर कोई element null है तो console में दिखाओ
if (!document.getElementById("gameCanvas")) {
  console.error("ERROR: gameCanvas element not found!");
}

// --- गेम कोड (पहले जैसा) ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

const scoreEl = document.getElementById("score");
const speedEl = document.getElementById("speed");
const overlay = document.getElementById("overlay");
const finalScore = document.getElementById("finalScore");
const restartBtn = document.getElementById("restartBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");

if (!canvas || !ctx) {
  diagLog("Canvas or context missing — aborting game loop.");
  // अगर canvas नहीं है तो overlay में error दिखाओ
  if (overlay) {
    overlay.classList.remove("hidden");
    document.getElementById("overlayTitle").textContent = "Error: Canvas missing";
    finalScore.textContent = "Console में देखें: canvas नहीं मिला";
  }
  throw new Error("Canvas missing");
}

// कैनवास साइज constants
const W = canvas.width;
const H = canvas.height;

// खिलाड़ी की कार
const car = {
  w: 50,
  h: 90,
  x: (W - 50) / 2,
  y: H - 120,
  color: "#ff4d4d",
  speedX: 6
};

let enemies = [];
let spawnTimer = 0;
let spawnInterval = 90;
let gameSpeed = 1;
let score = 0;
let running = true;

// कीबोर्ड कंट्रोल
document.addEventListener("keydown", (e) => {
  if (!running) return;
  if (e.key === "ArrowLeft") moveLeft();
  if (e.key === "ArrowRight") moveRight();
});

// टच/माउस ईवेंट
if (leftBtn && rightBtn) {
  leftBtn.addEventListener("touchstart", (e) => { e.preventDefault(); moveLeft(); });
  rightBtn.addEventListener("touchstart", (e) => { e.preventDefault(); moveRight(); });
  leftBtn.addEventListener("mousedown", moveLeft);
  rightBtn.addEventListener("mousedown", moveRight);
} else {
  diagLog("Touch buttons not found:", {leftBtn: !!leftBtn, rightBtn: !!rightBtn});
}

restartBtn && restartBtn.addEventListener("click", () => {
  resetGame();
});

// move functions
function moveLeft() {
  car.x -= car.speedX * 1.6;
  if (car.x < 10) car.x = 10;
}
function moveRight() {
  car.x += car.speedX * 1.6;
  if (car.x > W - car.w - 10) car.x = W - car.w - 10;
}

function spawnEnemy() {
  const w = 40 + Math.random() * 40;
  const x = 10 + Math.random() * (W - w - 20);
  const h = 70;
  const speed = 1.5 + Math.random() * (1.8 + gameSpeed*0.2);
  enemies.push({ x, y: -h, w, h, speed, color: "#2ea6ff" });
}

function isColliding(a, b) {
  return !(a.x + a.w < b.x ||
           a.x > b.x + b.w ||
           a.y + a.h < b.y ||
           a.y > b.y + b.h);
}

function resetGame() {
  diagLog("resetGame called");
  enemies = [];
  spawnTimer = 0;
  spawnInterval = 90;
  gameSpeed = 1;
  score = 0;
  running = true;
  car.x = (W - car.w) / 2;
  overlay.classList.add("hidden");
  loop();
}

function drawRoad() {
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(20, 0, W - 40, H);

  ctx.strokeStyle = "#bbbbbb";
  ctx.lineWidth = 4;
  ctx.setLineDash([20, 20]);
  ctx.beginPath();
  ctx.moveTo(W/2, -100);
  ctx.lineTo(W/2, H + 100);
  ctx.stroke();
  ctx.setLineDash([]);
}

function loop() {
  if (!running) return;

  ctx.clearRect(0, 0, W, H);
  drawRoad();

  // player
  ctx.fillStyle = car.color;
  roundRect(ctx, car.x, car.y, car.w, car.h, 8, true, false);

  // spawn logic
  spawnTimer++;
  if (spawnTimer > spawnInterval) {
    spawnEnemy();
    spawnTimer = 0;
    if (spawnInterval > 40) spawnInterval -= 2;
    diagLog("spawned enemy, spawnInterval:", spawnInterval, "enemies:", enemies.length);
  }

  // update enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.y += e.speed * (1 + gameSpeed*0.2);

    ctx.fillStyle = e.color;
    roundRect(ctx, e.x, e.y, e.w, e.h, 6, true, false);

    if (isColliding(car, e)) {
      running = false;
      showGameOver();
      console.error("Collision detected", {car, enemy: e, score});
    }

    if (e.y > H + 50) {
      enemies.splice(i, 1);
      score += 10 + Math.floor(gameSpeed * 2);
      if (score % 100 === 0) gameSpeed += 0.5;
    }
  }

  // HUD
  scoreEl.textContent = "स्कोर: " + score;
  speedEl.textContent = "स्पीड: " + gameSpeed.toFixed(1);

  if (running) requestAnimationFrame(loop);
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (typeof stroke === 'undefined') stroke = true;
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.strokeStyle = "rgba(0,0,0,0.2)", ctx.stroke();
}

function showGameOver() {
  console.warn("Game Over called", {score, enemies});
  overlay.classList.remove("hidden");
  finalScore.textContent = "तुम्हारा स्कोर: " + score;
  document.getElementById("overlayTitle").textContent = "गेम ओवर";
  diagLog("Game Over displayed, score:", score);
}

// स्टार्ट
diagLog("Starting game loop...");
loop();
