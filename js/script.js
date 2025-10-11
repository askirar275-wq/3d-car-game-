const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let carY = 500;
let carX = 175;
const carWidth = 50;
const carHeight = 80;

document.addEventListener("keydown", moveCar);

function moveCar(e) {
  if (e.key === "ArrowLeft" && carX > 0) carX -= 20;
  if (e.key === "ArrowRight" && carX < canvas.width - carWidth) carX += 20;
}

function draw() {
  ctx.fillStyle = "#333";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "red";
  ctx.fillRect(carX, carY, carWidth, carHeight);

  requestAnimationFrame(draw);
}
draw();
