// == Tower Defense - Plain JS Canvas ==
// Grid is 50px. Canvas 900x600 => 18 cols x 12 rows.
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const GRID = 50;
  const COLS = Math.floor(canvas.width / GRID);
  const ROWS = Math.floor(canvas.height / GRID);

  // UI elements
  const elMoney = document.getElementById('money');
  const elLives = document.getElementById('lives');
  const elWave = document.getElementById('wave');
  const tooltip = document.getElementById('tooltip');
  const startBtn = document.getElementById('startWave');
  const pauseBtn = document.getElementById('pauseResume');
  const sellBtn = document.getElementById('sellMode');
  const towerButtons = [...document.querySelectorAll('.tower-btn')];

  // Game state
  const state = {
    money: 200,
    lives: 20,
    wave: 0,
    running: true,
    placingType: 'basic',
    sellMode: false,
    towers: [],
    enemies: [],
    bullets: [],
    spawnQueue: [],
    spawnTimer: 0,
    timeScale: 1,
  };

  // Map & path definition (cells)
  // Simple path: enter left, go right, down, right, up, right to exit
  const pathCells = [
    // Row 5, col 0 -> 5
    [0,5],[1,5],[2,5],[3,5],[4,5],[5,5],
    // Down to row 8
    [5,6],[5,7],[5,8],
    // Right to col 11
    [6,8],[7,8],[8,8],[9,8],[10,8],[11,8],
    // Up to row 3
    [11,7],[11,6],[11,5],[11,4],[11,3],
    // Right to exit
    [12,3],[13,3],[14,3],[15,3],[16,3],[17,3]
  ];
  const pathSet = new Set(pathCells.map(([c,r]) => `${c},${r}`));
  const pathPoints = pathCells.map(([c,r]) => ({
    x: c*GRID + GRID/2,
    y: r*GRID + GRID/2
  }));

  // Tower defs
  const TOWER_DEFS = {
    basic:  { cost: 100, range: 140, fireRate: 0.8, damage: 10, bulletSpeed: 420, color: '#4f7cff' },
    sniper: { cost: 150, range: 260, fireRate: 1.8, damage: 28, bulletSpeed: 700, color: '#ffd166' },
    slow:   { cost: 120, range: 120, fireRate: 1.1, damage: 6,  bulletSpeed: 360, color: '#8de86e', slow: 0.55, slowSecs: 1.2 },
  };

  function uiSync() {
    elMoney.textContent = state.money;
    elLives.textContent = state.lives;
    elWave.textContent = state.wave;
    pauseBtn.textContent = state.running ? 'Pause' : 'Resume';
    sellBtn.textContent = `Sell Mode: ${state.sellMode ? 'On' : 'Off'}`;
    towerButtons.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === state.placingType);
    });
  }

  // Utility
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);

  // Entities
  class Enemy {
    constructor(hp, speed, reward) {
      this.maxHp = hp;
      this.hp = hp;
      this.baseSpeed = speed;
      this.speed = speed;
      this.reward = reward;
      this.pathIndex = 0;
      this.pos = { x: pathPoints[0].x, y: pathPoints[0].y };
      this.slowTimer = 0;
      this.radius = 14;
    }
    applySlow(mult, secs) {
      this.speed = this.baseSpeed * mult;
      this.slowTimer = Math.max(this.slowTimer, secs);
    }
    update(dt) {
      if (this.slowTimer > 0) {
        this.slowTimer -= dt;
        if (this.slowTimer <= 0) this.speed = this.baseSpeed;
      }
      const target = pathPoints[this.pathIndex+1];
      if (!target) {
        // Reached end
        this.hp = 0;
        this.dead = true;
        state.lives = Math.max(0, state.lives - 1);
        uiSync();
        return;
      }
      const toT = { x: target.x - this.pos.x, y: target.y - this.pos.y };
      const len = Math.hypot(toT.x, toT.y);
      if (len < 1) {
        this.pathIndex++;
        return;
      }
      const step = (this.speed * dt);
      this.pos.x += (toT.x / len) * step;
      this.pos.y += (toT.y / len) * step;
    }
    draw() {
      // body
      ctx.fillStyle = '#e06666';
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI*2);
      ctx.fill();
      // hp bar
      const w = 26, h = 5, x = this.pos.x - w/2, y = this.pos.y - this.radius - 10;
      ctx.fillStyle = '#1b1f2d';
      ctx.fillRect(x, y, w, h);
      const pct = clamp(this.hp/this.maxHp, 0, 1);
      ctx.fillStyle = '#8de86e';
      ctx.fillRect(x, y, w*pct, h);
      // slow overlay
      if (this.speed < this.baseSpeed) {
        ctx.strokeStyle = '#8de86e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius+2, 0, Math.PI*2);
        ctx.stroke();
      }
    }
  }

  class Bullet {
    constructor(x, y, target, dmg, speed, color, slowEffect) {
      this.pos = { x, y };
      this.target = target;
      this.dmg = dmg;
      this.speed = speed;
      this.color = color;
      this.radius = 4;
      this.dead = false;
      this.slowEffect = slowEffect; // {mult, secs} or null
    }
    update(dt) {
      if (!this.target || this.target.dead) { this.dead = true; return; }
      const toT = { x: this.target.pos.x - this.pos.x, y: this.target.pos.y - this.pos.y };
      const len = Math.hypot(toT.x, toT.y);
      if (len < 6) {
        this.target.hp -= this.dmg;
        if (this.slowEffect) this.target.applySlow(this.slowEffect.mult, this.slowEffect.secs);
        if (this.target.hp <= 0 && !this.target.dead) {
          this.target.dead = true;
          state.money += this.target.reward;
          uiSync();
        }
        this.dead = true;
        return;
      }
      const step = this.speed * dt;
      this.pos.x += (toT.x / len) * step;
      this.pos.y += (toT.y / len) * step;
    }
    draw() {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI*2);
      ctx.fill();
    }
  }

  class Tower {
    constructor(cellC, cellR, def, type) {
      this.c = cellC; this.r = cellR;
      this.x = cellC*GRID + GRID/2;
      this.y = cellR*GRID + GRID/2;
      this.range = def.range;
      this.fireRate = def.fireRate; // seconds per shot
      this.damage = def.damage;
      this.bulletSpeed = def.bulletSpeed;
      this.color = def.color;
      this.timer = 0;
      this.type = type;
      this.slow = def.slow || null;
      this.slowSecs = def.slowSecs || 0;
      this.sellValue = Math.floor((def.cost) * 0.65);
    }
    update(dt) {
      this.timer -= dt;
      if (this.timer <= 0) {
        // find target in range (first by path index, then nearest)
        let best = null, bestScore = -1;
        for (const e of state.enemies) {
          if (e.dead) continue;
          if (dist({x:this.x,y:this.y}, e.pos) <= this.range) {
            const score = e.pathIndex + dist(pathPoints[e.pathIndex]||e.pos, e.pos)*0.0001;
            if (score > bestScore) { bestScore = score; best = e; }
          }
        }
        if (best) {
          const slowEffect = this.slow ? { mult: this.slow, secs: this.slowSecs } : null;
          state.bullets.push(new Bullet(this.x, this.y, best, this.damage, this.bulletSpeed, this.color, slowEffect));
          this.timer = this.fireRate;
        } else {
          this.timer = Math.min(0.1, this.fireRate*0.4); // check again soon
        }
      }
    }
    draw() {
      // base
      ctx.fillStyle = this.color;
      const s = GRID*0.64;
      ctx.fillRect(this.x - s/2, this.y - s/2, s, s);
      // barrel indicator
      ctx.strokeStyle = '#ffffff22';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  // Spawning waves
  function scheduleWave(n) {
    state.wave = n;
    const count = 6 + n * 2;
    const hp = 40 + n * 12;
    const speed = 70 + Math.min(60, n * 6);
    const reward = 8 + Math.floor(n * 0.8);
    state.spawnQueue = Array.from({length: count}, () => ({ hp, speed, reward }));
    state.spawnTimer = 0.0;
    uiSync();
  }

  function updateSpawn(dt) {
    if (state.spawnQueue.length === 0) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      const spec = state.spawnQueue.shift();
      const e = new Enemy(spec.hp, spec.speed, spec.reward);
      state.enemies.push(e);
      // next in 0.7s (faster later waves)
      state.spawnTimer = clamp(0.7 - state.wave*0.02, 0.25, 0.7);
    }
  }

  // Input handling
  let hoverCell = { c: -1, r: -1 };
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    hoverCell = { c: Math.floor(mx/GRID), r: Math.floor(my/GRID) };

    // Tooltip
    tooltip.hidden = true;
    if (state.sellMode) {
      const t = towerAt(hoverCell.c, hoverCell.r);
      if (t) {
        tooltip.textContent = `Sell for ${t.sellValue}`;
        tooltip.style.left = `${t.x}px`;
        tooltip.style.top = `${t.y}px`;
        tooltip.hidden = false;
      }
    }
  });

  canvas.addEventListener('mouseleave', () => {
    hoverCell = { c: -1, r: -1 };
    tooltip.hidden = true;
  });

  canvas.addEventListener('click', () => {
    const { c, r } = hoverCell;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;

    if (state.sellMode) {
      const t = towerAt(c, r);
      if (t) {
        state.money += t.sellValue;
        state.towers = state.towers.filter(x => x !== t);
        uiSync();
      }
      return;
    }

    if (pathSet.has(`${c},${r}`)) return; // can't build on path
    if (towerAt(c, r)) return; // occupied
    const def = TOWER_DEFS[state.placingType];
    if (!def) return;
    if (state.money < def.cost) return;

    state.money -= def.cost;
    state.towers.push(new Tower(c, r, def, state.placingType));
    uiSync();
  });

  function towerAt(c, r) {
    return state.towers.find(t => t.c === c && t.r === r);
  }

  // UI events
  towerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.placingType = btn.dataset.type;
      state.sellMode = false;
      uiSync();
    });
  });

  startBtn.addEventListener('click', () => {
    if (state.spawnQueue.length > 0) return; // already spawning
    scheduleWave(state.wave + 1);
  });

  pauseBtn.addEventListener('click', () => {
    state.running = !state.running;
    uiSync();
  });

  sellBtn.addEventListener('click', () => {
    state.sellMode = !state.sellMode;
    uiSync();
  });

  // Draw grid, path, hover
  function drawGrid() {
    // path tiles
    for (const [c,r] of pathCells) {
      ctx.fillStyle = '#2a5f3b';
      ctx.fillRect(c*GRID, r*GRID, GRID, GRID);
      // subtle edge
      ctx.strokeStyle = '#1b3d27';
      ctx.strokeRect(c*GRID+0.5, r*GRID+0.5, GRID-1, GRID-1);
    }

    // hover
    if (hoverCell.c >= 0 && hoverCell.r >= 0) {
      const canBuild = !pathSet.has(`${hoverCell.c},${hoverCell.r}`) && !towerAt(hoverCell.c, hoverCell.r);
      ctx.fillStyle = canBuild ? 'rgba(79,124,255,0.18)' : 'rgba(255,92,122,0.18)';
      ctx.fillRect(hoverCell.c*GRID, hoverCell.r*GRID, GRID, GRID);
    }
  }

  // Game loop
  let last = performance.now();
  function frame(now) {
    const dt = state.running ? Math.min(0.05, (now - last)/1000) * state.timeScale : 0;
    last = now;

    // Update
    if (state.running) {
      updateSpawn(dt);
      state.towers.forEach(t => t.update(dt));
      state.bullets.forEach(b => b.update(dt));
      state.enemies.forEach(e => e.update(dt));

      // Cleanup
      state.bullets = state.bullets.filter(b => !b.dead);
      const before = state.enemies.length;
      state.enemies = state.enemies.filter(e => !e.dead || e.hp > 0); // keep those not yet removed by reaching end
      // remove those that died (hp<=0) but didn't reach end
      const removed = before - state.enemies.length;
      // Check lose
      if (state.lives <= 0) {
        gameOver(false);
      }
      // If wave cleared and no spawn pending -> allow next wave
      if (state.spawnQueue.length === 0 && state.enemies.every(e => e.dead)) {
        // do nothing special; player can start next wave
      }
    }

    // Render
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawGrid();
    // towers on bottom? draw enemies under towers to see bullets over
    state.enemies.forEach(e => e.draw());
    state.towers.forEach(t => t.draw());
    state.bullets.forEach(b => b.draw());

    requestAnimationFrame(frame);
  }

  function gameOver(win) {
    state.running = false;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.restore();

    ctx.fillStyle = win ? '#8de86e' : '#ff5c7a';
    ctx.font = 'bold 42px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(win ? 'You Win!' : 'Game Over', canvas.width/2, canvas.height/2 - 10);
    ctx.fillStyle = '#e7eaf0';
    ctx.font = '16px ui-sans-serif, system-ui';
    ctx.fillText('Refresh the page to play again', canvas.width/2, canvas.height/2 + 24);
  }

  // Initial UI
  uiSync();
  requestAnimationFrame(frame);

  // Basic victory condition example (optional)
  // If player reaches wave 15 and clears it, they win.
  const winCheckInterval = setInterval(() => {
    if (state.wave >= 15 && state.spawnQueue.length === 0 && state.enemies.length === 0) {
      clearInterval(winCheckInterval);
      gameOver(true);
    }
  }, 500);

})();
