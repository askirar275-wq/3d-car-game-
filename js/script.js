console.log("DEBUG: script.js loaded");
console.log("DEBUG: elements:", {
  canvas: document.getElementById("gameCanvas"),
  leftBtn: document.getElementById("leftBtn"),
  rightBtn: document.getElementById("rightBtn"),
  overlay: document.getElementById("overlay")
});
// सरल कार रेसिंग — टिप्पणी हिंदी में
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// स्कोर और HUD
const scoreEl = document.getElementById("score");
const speedEl = document.getElementById("speed");
const overlay = document.getElementById("overlay");
const finalScore = document.getElementById("finalScore");
const restartBtn = document.getElementById("restartBtn");

// टच बटन
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");

// कैनवास की आंतरिक रचना (रीसाइज़िंग के लिए)
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

// सामने आने वाली (enemy) कारें
let enemies = [];
let spawnTimer = 0;
let spawnInterval = 90; // फ्रेम्स के हिसाब से
let gameSpeed = 1; // जितना बड़ा होगा, कठिनाई उतनी
let score = 0;
let running = true;

// रोड लाइन्स के लिए
const lanes = [W/4 - 20, W/2 - 25, 3*W/4 - 30]; // optional visual lanes

// कीबोर्ड कंट्रोल
document.addEventListener("keydown", (e) => {
  if (!running) return;
  if (e.key === "ArrowLeft") moveLeft();
  if (e.key === "ArrowRight") moveRight();
});

// टच बटन ईवेंट्स (mobile friendly)
leftBtn.addEventListener("touchstart", (e) => { e.preventDefault(); moveLeft(); });
rightBtn.addEventListener("touchstart", (e) => { e.preventDefault(); moveRight(); });
leftBtn.addEventListener("mousedown", moveLeft);
rightBtn.addEventListener("mousedown", moveRight);

// रीस्टार्ट बटन
restartBtn.addEventListener("click", () => {
  resetGame();
});

// बाएँ / दाएँ मूव फंक्शन
function moveLeft() {
  car.x -= car.speedX * 1.6;
  if (car.x < 10) car.x = 10;
}
function moveRight() {
  car.x += car.speedX * 1.6;
  if (car.x > W - car.w - 10) car.x = W - car.w - 10;
}

// enemy बनाओ
function spawnEnemy() {
  // चौड़ाई और x-position random पर
  const w = 40 + Math.random() * 40;
  const x = 10 + Math.random() * (W - w - 20);
  const h = 70;
  const speed = 1.5 + Math.random() * (1.8 + gameSpeed*0.2);
  enemies.push({ x, y: -h, w, h, speed, color: "#2ea6ff" });
}

// collision check (AABB)
function isColliding(a, b) {
  return !(a.x + a.w < b.x ||
           a.x > b.x + b.w ||
           a.y + a.h < b.y ||
           a.y > b.y + b.h);
}

// गेम रिसेट
function resetGame() {
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

// मुख्य ड्रॉ फंक्शन
function drawRoad() {
  // सड़क बैकग्राउंड
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(20, 0, W - 40, H);

  // बीच की डिवाइडर लाइनें
  ctx.strokeStyle = "#bbbbbb";
  ctx.lineWidth = 4;
  ctx.setLineDash([20, 20]);
  ctx.beginPath();
  ctx.moveTo(W/2, -100);
  ctx.lineTo(W/2, H + 100);
  ctx.stroke();
  ctx.setLineDash([]);
}

// खेल का मुख्य लूप
function loop() {
  if (!running) return;

  // बैकग्राउंड
  ctx.clearRect(0, 0, W, H);
  drawRoad();

  // खिलाड़ी कार ड्रॉ
  ctx.fillStyle = car.color;
  roundRect(ctx, car.x, car.y, car.w, car.h, 8, true, false);

  // enemy spawn logic
  spawnTimer++;
  if (spawnTimer > spawnInterval) {
    spawnEnemy();
    spawnTimer = 0;
    // धीरे-धीरे spawn तेज करें
    if (spawnInterval > 40) spawnInterval -= 2;
  }

  // enemies अपडेट और ड्रॉ
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.y += e.speed * (1 + gameSpeed*0.2);

    // ड्रॉ enemy
    ctx.fillStyle = e.color;
    roundRect(ctx, e.x, e.y, e.w, e.h, 6, true, false);

    // टक्कर जाँच
    if (isColliding(car, e)) {
      // गेम ओवर
      running = false;
      showGameOver();
    }

    // स्क्रीन के बाहर जाने पर हटाओ और स्कोर बढ़ाओ
    if (e.y > H + 50) {
      enemies.splice(i, 1);
      score += 10 + Math.floor(gameSpeed * 2);
      // धीरे-धीरे स्पीड बढ़ाओ
      if (score % 100 === 0) gameSpeed += 0.5;
    }
  }

  // HUD अपडेट
  scoreEl.textContent = "स्कोर: " + score;
  speedEl.textContent = "स्पीड: " + gameSpeed.toFixed(1);

  // अगला फ्रेम
  if (running) requestAnimationFrame(loop);
}

// गोल किनारे वाली रेक्ट (सहायक)
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

// गेम ओवर दिखाओ
function showGameOver() {
  overlay.classList.remove("hidden");
  finalScore.textContent = "तुम्हारा स्कोर: " + score;
  document.getElementById("overlayTitle").textContent = "गेम ओवर";
}

// शुरू करें
loop();
