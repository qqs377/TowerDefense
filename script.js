const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let enemies = [];
let towers = [];
let bullets = [];

class Enemy {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = 20;
    this.speed = 1;
  }

  update() {
    this.x += this.speed;
  }

  draw() {
    ctx.fillStyle = "red";
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

class Tower {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.range = 100;
    this.fireRate = 60;
    this.cooldown = 0;
  }

  update() {
    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }

    for (let enemy of enemies) {
      const dx = enemy.x - this.x;
      const dy = enemy.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < this.range) {
        bullets.push(new Bullet(this.x, this.y, enemy));
        this.cooldown = this.fireRate;
        break;
      }
    }
  }

  draw() {
    ctx.fillStyle = "blue";
    ctx.beginPath();
    ctx.arc(this.x, this.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Bullet {
  constructor(x, y, target) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.speed = 4;
  }

  update() {
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.x += (dx / dist) * this.speed;
    this.y += (dy / dist) * this.speed;

    if (dist < 5) {
      const index = enemies.indexOf(this.target);
      if (index > -1) enemies.splice(index, 1);
    }
  }

  draw() {
    ctx.fillStyle = "yellow";
    ctx.beginPath();
    ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function spawnEnemy() {
  enemies.push(new Enemy(0, Math.random() * canvas.height));
}

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  towers.push(new Tower(x, y));
});

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  enemies.forEach((enemy) => {
    enemy.update();
    enemy.draw();
  });

  towers.forEach((tower) => {
    tower.update();
    tower.draw();
  });

  bullets.forEach((bullet, index) => {
    bullet.update();
    bullet.draw();
    if (bullet.x < 0 || bullet.x > canvas.width || bullet.y < 0 || bullet.y > canvas.height) {
      bullets.splice(index, 1);
    }
  });

  requestAnimationFrame(gameLoop);
}

setInterval(spawnEnemy, 2000);
gameLoop();
