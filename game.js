// =========================
// Tower Defense Game Logic
// =========================

// Canvas setup
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const gridSize = 20; // size of each cell
const mapWidth = 18;
const mapHeight = 12;

let pathCells = [];
let towers = [];
let enemies = [];
let bullets = [];
let money = 100;
let lives = 10;
let wave = 0;
let floor = 1;

// =========================
// Enemy & Path
// =========================
function generatePath() {
  pathCells = [];
  let row = Math.floor(Math.random() * mapHeight);
  pathCells.push([0, row]);
  let col = 0;

  while (col < mapWidth - 1) {
    let direction = Math.random() < 0.5 ? "right" : (Math.random() < 0.5 ? "up" : "down");
    if (direction === "right" && col < mapWidth - 1) {
      col++;
    } else if (direction === "up" && row > 0) {
      row--;
    } else if (direction === "down" && row < mapHeight - 1) {
      row++;
    } else {
      col++;
    }
    if (!pathCells.find(p => p[0] === col && p[1] === row)) {
      pathCells.push([col, row]);
    }
  }
}

// Enemy class
class Enemy {
  constructor(hp, speed) {
    this.hp = hp;
    this.speed = speed;
    this.pathIndex = 0;
    this.x = pathCells[0][0] * gridSize + gridSize/2;
    this.y = pathCells[0][1] * gridSize + gridSize/2;
  }

  update() {
    if (this.pathIndex < pathCells.length - 1) {
      const [tx, ty] = pathCells[this.pathIndex+1];
      const targetX = tx*gridSize + gridSize/2;
      const targetY = ty*gridSize + gridSize/2;
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist < this.speed) {
        this.x = targetX;
        this.y = targetY;
        this.pathIndex++;
      } else {
        this.x += (dx/dist) * this.speed;
        this.y += (dy/dist) * this.speed;
      }
    } else {
      lives--;
      enemies.splice(enemies.indexOf(this), 1);
    }
  }

  draw() {
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(this.x, this.y, 8, 0, Math.PI*2);
    ctx.fill();
  }
}

// =========================
// Tower & Bullets
// =========================
class Tower {
  constructor(x, y, type="basic") {
    this.x = x;
    this.y = y;
    this.range = 80;
    this.fireRate = 60;
    this.fireCooldown = 0;
    this.level = 1;
    this.damage = 10;
    this.type = type;
  }

  upgrade() {
    if (money >= 50) {
      money -= 50;
      this.level++;
      this.damage += 5;
      this.range += 10;
      this.fireRate = Math.max(20, this.fireRate - 5);
    }
  }

  update() {
    if (this.fireCooldown > 0) this.fireCooldown--;
    else {
      let target = enemies.find(e => Math.hypot(e.x-this.x, e.y-this.y) <= this.range);
      if (target) {
        this.fireCooldown = this.fireRate;
        bullets.push(new Bullet(this.x, this.y, target, this.damage, this.level, this.type));
      }
    }
  }

  draw() {
    // Tower visual changes with level
    ctx.fillStyle = this.level < 2 ? "blue" : this.level === 2 ? "green" : "gold";
    ctx.beginPath();
    ctx.arc(this.x, this.y, 10 + this.level*2, 0, Math.PI*2);
    ctx.fill();
  }
}

class Bullet {
  constructor(x, y, target, damage, level, type) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = 5 + level; 
    this.level = level;
    this.type = type;
  }

  update() {
    if (!enemies.includes(this.target)) return bullets.splice(bullets.indexOf(this), 1);
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < this.speed) {
      // Hit effect
      this.applyEffect();
      bullets.splice(bullets.indexOf(this), 1);
    } else {
      this.x += (dx/dist) * this.speed;
      this.y += (dy/dist) * this.speed;
    }
  }

  applyEffect() {
    if (this.level >= 3 && this.type === "basic") {
      // Splash damage
      enemies.forEach(e => {
        if (Math.hypot(e.x - this.x, e.y - this.y) < 30) {
          e.hp -= this.damage;
          if (e.hp <= 0) {
            money += 10 * floor;
            enemies.splice(enemies.indexOf(e), 1);
          }
        }
      });
    } else if (this.level >= 3 && this.type === "piercing") {
      // Piercing shot
      this.target.hp -= this.damage;
      // Bullet continues through enemy (don’t destroy yet)
      if (this.target.hp <= 0) {
        money += 10 * floor;
        enemies.splice(enemies.indexOf(this.target), 1);
      }
    } else {
      // Normal damage
      this.target.hp -= this.damage;
      if (this.target.hp <= 0) {
        money += 10 * floor;
        enemies.splice(enemies.indexOf(this.target), 1);
      }
    }
  }

  draw() {
    ctx.fillStyle = this.level < 2 ? "white" : this.level === 2 ? "cyan" : "magenta";
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3 + this.level, 0, Math.PI*2);
    ctx.fill();
  }
}

// =========================
// Game Flow
// =========================
function startWave() {
  wave++;
  if (wave > 3) {
    wave = 1;
    floor++;
    generatePath();
    // unlock new tower type per floor
    if (floor === 2) {
      towers.push(new Tower(200, 200, "piercing"));
    }
  }
  for (let i=0; i<5+floor; i++) {
    setTimeout(() => enemies.push(new Enemy(20+floor*10, 1+floor*0.2)), i*1000);
  }
}

canvas.addEventListener("click", (e) => {
  const x = Math.floor(e.offsetX/gridSize)*gridSize + gridSize/2;
  const y = Math.floor(e.offsetY/gridSize)*gridSize + gridSize/2;

  // If tower exists, upgrade it
  let existing = towers.find(t => t.x === x && t.y === y);
  if (existing) {
    existing.upgrade();
  } else {
    // Place new tower if not on path
    if (!pathCells.find(p => p[0]*gridSize+gridSize/2===x && p[1]*gridSize+gridSize/2===y)) {
      if (money >= 50) {
        towers.push(new Tower(x, y));
        money -= 50;
      }
    }
  }
});

function gameLoop() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Draw grid
  ctx.strokeStyle = "#555";
  for (let i=0;i<mapWidth;i++) {
    for (let j=0;j<mapHeight;j++) {
      ctx.strokeRect(i*gridSize,j*gridSize,gridSize,gridSize);
    }
  }

  // Draw path
  ctx.fillStyle = "#888";
  pathCells.forEach(([c,r]) => {
    ctx.fillRect(c*gridSize,r*gridSize,gridSize,gridSize);
  });

  // Update & draw towers
  towers.forEach(t => {t.update();t.draw();});

  // Update & draw bullets
  bullets.forEach(b => {b.update();b.draw();});

  // Update & draw enemies
  enemies.forEach(e => {e.update();e.draw();});

  // UI
  ctx.fillStyle = "white";
  ctx.fillText(`Money: ${money}`,10,15);
  ctx.fillText(`Lives: ${lives}`,10,30);
  ctx.fillText(`Floor: ${floor} Wave: ${wave}/3`,10,45);

  requestAnimationFrame(gameLoop);
}

// Init
generatePath();
gameLoop();
document.getElementById("startWaveBtn").addEventListener("click", startWave);
