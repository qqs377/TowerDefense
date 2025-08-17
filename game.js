// Supabase configuration
const SUPABASE_URL = 'https://dpopxtljjdkkzcnxwyfx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwb3B4dGxqamRra3pjbnh3eWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODAyMjIsImV4cCI6MjA2OTY1NjIyMn0.udAGcJa2CjZfKec34_QL-uBymgu2g9x9mWRrelwr11I';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Game initialization
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
  const elFloor = document.getElementById('floor');
  const elScore = document.getElementById('score');
  const tooltip = document.getElementById('tooltip');
  const startBtn = document.getElementById('startWave');
  const pauseBtn = document.getElementById('pauseResume');
  const sellBtn = document.getElementById('sellMode');
  const nextFloorBtn = document.getElementById('nextFloor');
  const towerButtons = [...document.querySelectorAll('.tower-btn')];
  const upgradePanel = document.getElementById('upgradePanel');
  const gameOverModal = document.getElementById('gameOverModal');

  // Game state
  const state = {
    money: 250,
    lives: 25,
    wave: 0,
    floor: 1,
    score: 0,
    running: true,
    placingType: 'basic',
    sellMode: false,
    selectedTower: null,
    towers: [],
    enemies: [],
    bullets: [],
    spawnQueue: [],
    spawnTimer: 0,
    timeScale: 1,
    pathCells: [],
    pathSet: new Set(),
    pathPoints: [],
  };

  // Tower definitions with upgrade costs
  const TOWER_DEFS = {
    basic: { 
      cost: 30, range: 140, fireRate: 0.8, damage: 10, bulletSpeed: 420, 
      color: '#4f7cff', name: 'Basic Tower'
    },
    sniper: { 
      cost: 50, range: 260, fireRate: 1.8, damage: 28, bulletSpeed: 700, 
      color: '#ffd166', name: 'Sniper Tower'
    },
    slow: { 
      cost: 40, range: 120, fireRate: 1.1, damage: 6, bulletSpeed: 360, 
      color: '#8de86e', slow: 0.55, slowSecs: 1.2, name: 'Frost Tower'
    },
    splash: { 
      cost: 70, range: 100, fireRate: 1.5, damage: 15, bulletSpeed: 300, 
      color: '#ff6b6b', splashRadius: 60, name: 'Splash Tower'
    },
    laser: { 
      cost: 90, range: 180, fireRate: 0.3, damage: 8, bulletSpeed: 1000, 
      color: '#ff9f43', piercing: true, name: 'Laser Tower'
    },
  };

  // Map generation
  function generateRandomMap() {
    const pathCells = [];
    const visited = new Set();
    
    // Start from left side
    let startRow = Math.floor(ROWS / 3) + Math.floor(Math.random() * (ROWS / 3));
    let currentCol = 0;
    let currentRow = startRow;
    
    pathCells.push([currentCol, currentRow]);
    visited.add(`${currentCol},${currentRow}`);
    
    while (currentCol < COLS - 1) {
      const moves = [];
      
      // Prefer moving right
      if (currentCol < COLS - 1) moves.push([1, 0]);
      
      // Sometimes move up/down
      if (currentRow > 1 && Math.random() < 0.3) moves.push([0, -1]);
      if (currentRow < ROWS - 2 && Math.random() < 0.3) moves.push([0, 1]);
      
      // Force right movement if stuck
      if (moves.length === 0 || Math.random() < 0.7) {
        moves.length = 0;
        moves.push([1, 0]);
      }
      
      const [dx, dy] = moves[Math.floor(Math.random() * moves.length)];
      currentCol += dx;
      currentRow += dy;
      
      // Ensure we don't go out of bounds
      currentCol = Math.max(0, Math.min(COLS - 1, currentCol));
      currentRow = Math.max(1, Math.min(ROWS - 2, currentRow));
      
      pathCells.push([currentCol, currentRow]);
      visited.add(`${currentCol},${currentRow}`);
    }
    
    return pathCells;
  }

  function initializeFloor() {
    // Generate new map
    state.pathCells = generateRandomMap();
    state.pathSet = new Set(state.pathCells.map(([c,r]) => `${c},${r}`));
    state.pathPoints = state.pathCells.map(([c,r]) => ({
      x: c * GRID + GRID/2,
      y: r * GRID + GRID/2
    }));
    
    // Clear entities but keep towers if advancing floors
    state.enemies = [];
    state.bullets = [];
    state.spawnQueue = [];
    state.wave = 0;
    
    // If starting new game, clear towers too
    if (state.floor === 1) {
      state.towers = [];
      state.money = 250;
      state.lives = 25;
      state.score = 0;
    } else {
      // Bonus money for advancing floors
      state.money += 100 + state.floor * 20;
    }
    
    uiSync();
  }

  function uiSync() {
    elMoney.textContent = state.money;
    elLives.textContent = state.lives;
    elWave.textContent = state.wave;
    elFloor.textContent = state.floor;
    elScore.textContent = state.score;
    pauseBtn.textContent = state.running ? 'Pause' : 'Resume';
    sellBtn.textContent = `Sell Mode: ${state.sellMode ? 'On' : 'Off'}`;
    sellBtn.classList.toggle('active', state.sellMode);
    
    towerButtons.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === state.placingType);
      const def = TOWER_DEFS[btn.dataset.type];
      btn.disabled = state.money < def.cost;
    });
    
    updateUpgradePanel();
    
    // Show next floor button if wave is complete
    const canAdvance = state.wave >= 5 && state.spawnQueue.length === 0 && 
                      state.enemies.length === 0;
    nextFloorBtn.hidden = !canAdvance;
  }

  function updateUpgradePanel() {
    if (!state.selectedTower) {
      upgradePanel.hidden = true;
      return;
    }
    
    upgradePanel.hidden = false;
    const tower = state.selectedTower;
    const def = TOWER_DEFS[tower.type];
    
    document.getElementById('selectedTowerType').textContent = def.name;
    document.getElementById('towerLevel').textContent = tower.level || 1;
    document.getElementById('towerDamage').textContent = Math.round(tower.damage);
    document.getElementById('towerRange').textContent = Math.round(tower.range);
    document.getElementById('towerFireRate').textContent = (1/tower.fireRate).toFixed(1) + '/s';
    document.getElementById('towerSellValue').textContent = tower.sellValue;
    
    const level = tower.level || 1;
    const baseCost = def.cost;
    
    const damageCost = Math.floor(baseCost * 0.6 * Math.pow(1.5, level - 1));
    const rangeCost = Math.floor(baseCost * 0.4 * Math.pow(1.4, level - 1));
    const speedCost = Math.floor(baseCost * 0.5 * Math.pow(1.6, level - 1));
    
    document.getElementById('damageCost').textContent = damageCost;
    document.getElementById('rangeCost').textContent = rangeCost;
    document.getElementById('speedCost').textContent = speedCost;
    
    document.getElementById('upgradeDamage').disabled = state.money < damageCost;
    document.getElementById('upgradeRange').disabled = state.money < rangeCost;
    document.getElementById('upgradeSpeed').disabled = state.money < speedCost;
  }

  // Utility functions
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // Enemy class
  class Enemy {
    constructor(hp, speed, reward, type = 'normal') {
      this.maxHp = hp;
      this.hp = hp;
      this.baseSpeed = speed;
      this.speed = speed;
      this.reward = reward;
      this.type = type;
      this.pathIndex = 0;
      this.pos = { x: state.pathPoints[0].x, y: state.pathPoints[0].y };
      this.slowTimer = 0;
      this.radius = type === 'boss' ? 20 : type === 'fast' ? 10 : 14;
      this.dead = false;
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

      const target = state.pathPoints[this.pathIndex + 1];
      if (!target) {
        this.hp = 0;
        this.dead = true;
        state.lives = Math.max(0, state.lives - (this.type === 'boss' ? 3 : 1));
        uiSync();
        return;
      }

      const toT = { x: target.x - this.pos.x, y: target.y - this.pos.y };
      const len = Math.hypot(toT.x, toT.y);
      if (len < 1) {
        this.pathIndex++;
        return;
      }

      const step = this.speed * dt;
      this.pos.x += (toT.x / len) * step;
      this.pos.y += (toT.y / len) * step;
    }

    draw() {
      // Body color based on type
      let bodyColor = '#e06666';
      if (this.type === 'fast') bodyColor = '#ffaa44';
      else if (this.type === 'tank') bodyColor = '#666666';
      else if (this.type === 'boss') bodyColor = '#aa0000';

      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
      ctx.fill();

      // Boss special effect
      if (this.type === 'boss') {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // HP bar
      const w = 26, h = 5, x = this.pos.x - w/2, y = this.pos.y - this.radius - 10;
      ctx.fillStyle = '#1b1f2d';
      ctx.fillRect(x, y, w, h);
      const pct = clamp(this.hp / this.maxHp, 0, 1);
      ctx.fillStyle = pct > 0.6 ? '#8de86e' : pct > 0.3 ? '#ffd166' : '#ff5c7a';
      ctx.fillRect(x, y, w * pct, h);

      // Slow overlay
      if (this.speed < this.baseSpeed) {
        ctx.strokeStyle = '#8de86e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Bullet class
  class Bullet {
    constructor(x, y, target, dmg, speed, color, effects = {}) {
      this.pos = { x, y };
      this.target = target;
      this.dmg = dmg;
      this.speed = speed;
      this.color = color;
      this.radius = 4;
      this.dead = false;
      this.slowEffect = effects.slow;
      this.splashRadius = effects.splash;
      this.piercing = effects.piercing;
      this.piercedEnemies = new Set();
    }

    update(dt) {
      if (!this.target || this.target.dead) {
        this.dead = true;
        return;
      }

      const toT = { x: this.target.pos.x - this.pos.x, y: this.target.pos.y - this.pos.y };
      const len = Math.hypot(toT.x, toT.y);

      if (len < 6 || (this.piercing && len < 15)) {
        this.dealDamage(this.target);
        
        if (!this.piercing) {
          this.dead = true;
          return;
        } else {
          // Piercing bullets continue through enemies
          this.piercedEnemies.add(this.target);
          
          // Find next target
          let nextTarget = null;
          let minDist = Infinity;
          
          for (const enemy of state.enemies) {
            if (enemy.dead || this.piercedEnemies.has(enemy)) continue;
            const d = dist(this.pos, enemy.pos);
            if (d < minDist && d < 100) {
              minDist = d;
              nextTarget = enemy;
            }
          }
          
          if (nextTarget) {
            this.target = nextTarget;
          } else {
            this.dead = true;
            return;
          }
        }
      }

      const step = this.speed * dt;
      this.pos.x += (toT.x / len) * step;
      this.pos.y += (toT.y / len) * step;
    }

    dealDamage(target) {
      target.hp -= this.dmg;
      
      if (this.slowEffect) {
        target.applySlow(this.slowEffect.mult, this.slowEffect.secs);
      }

      if (target.hp <= 0 && !target.dead) {
        target.dead = true;
        state.money += target.reward;
        state.score += target.reward * state.floor;
        uiSync();
      }

      // Splash damage
      if (this.splashRadius) {
        for (const enemy of state.enemies) {
          if (enemy === target || enemy.dead) continue;
          if (dist(target.pos, enemy.pos) <= this.splashRadius) {
            enemy.hp -= this.dmg * 0.6; // Reduced splash damage
            if (enemy.hp <= 0 && !enemy.dead) {
              enemy.dead = true;
              state.money += enemy.reward;
              state.score += enemy.reward * state.floor;
            }
          }
        }
      }
    }

    draw() {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
      ctx.fill();

      // Laser trail effect
      if (this.piercing) {
        ctx.strokeStyle = this.color + '44';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Tower class
  class Tower {
    constructor(cellC, cellR, def, type) {
      this.c = cellC;
      this.r = cellR;
      this.x = cellC * GRID + GRID/2;
      this.y = cellR * GRID + GRID/2;
      this.type = type;
      this.level = 1;
      
      // Base stats
      this.baseRange = def.range;
      this.baseFireRate = def.fireRate;
      this.baseDamage = def.damage;
      this.bulletSpeed = def.bulletSpeed;
      this.color = def.color;
      
      // Current stats (can be upgraded)
      this.range = def.range;
      this.fireRate = def.fireRate;
      this.damage = def.damage;
      
      this.timer = 0;
      this.slow = def.slow || null;
      this.slowSecs = def.slowSecs || 0;
      this.splashRadius = def.splashRadius || 0;
      this.piercing = def.piercing || false;
      
      this.sellValue = Math.floor(def.cost * 0.65);
    }

    upgrade(type) {
      const def = TOWER_DEFS[this.type];
      const baseCost = def.cost;
      let cost = 0;
      
      switch(type) {
        case 'damage':
          cost = Math.floor(baseCost * 0.6 * Math.pow(1.5, this.level - 1));
          if (state.money >= cost) {
            state.money -= cost;
            this.damage = Math.floor(this.damage * 1.3);
            this.sellValue += Math.floor(cost * 0.7);
          }
          break;
        case 'range':
          cost = Math.floor(baseCost * 0.4 * Math.pow(1.4, this.level - 1));
          if (state.money >= cost) {
            state.money -= cost;
            this.range = Math.floor(this.range * 1.2);
            this.sellValue += Math.floor(cost * 0.7);
          }
          break;
        case 'speed':
          cost = Math.floor(baseCost * 0.5 * Math.pow(1.6, this.level - 1));
          if (state.money >= cost) {
            state.money -= cost;
            this.fireRate = Math.max(0.1, this.fireRate * 0.8);
            this.sellValue += Math.floor(cost * 0.7);
          }
          break;
      }
      
      if (state.money !== (state.money + cost)) { // If money was spent
        this.level++;
      }
    }

    update(dt) {
      this.timer -= dt;
      if (this.timer <= 0) {
        // Find target in range (prioritize by path progress)
        let best = null, bestScore = -1;
        for (const e of state.enemies) {
          if (e.dead) continue;
          if (dist({x: this.x, y: this.y}, e.pos) <= this.range) {
            const score = e.pathIndex + dist(state.pathPoints[e.pathIndex] || e.pos, e.pos) * 0.0001;
            if (score > bestScore) {
              bestScore = score;
              best = e;
            }
          }
        }

        if (best) {
          const effects = {};
          if (this.slow) effects.slow = { mult: this.slow, secs: this.slowSecs };
          if (this.splashRadius) effects.splash = this.splashRadius;
          if (this.piercing) effects.piercing = true;

          state.bullets.push(new Bullet(this.x, this.y, best, this.damage, this.bulletSpeed, this.color, effects));
          this.timer = this.fireRate;
        } else {
          this.timer = Math.min(0.1, this.fireRate * 0.4);
        }
      }
    }

    draw() {
      // Base
      ctx.fillStyle = this.color;
      const s = GRID * 0.64;
      ctx.fillRect(this.x - s/2, this.y - s/2, s, s);

      // Level indicator
      if (this.level > 1) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.level, this.x, this.y - s/2 - 5);
      }

      // Range indicator when selected
      if (state.selectedTower === this) {
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Wave spawning
  function scheduleWave(n) {
    state.wave = n;
    const waveConfig = getWaveConfig(n, state.floor);
    state.spawnQueue = [...waveConfig];
    state.spawnTimer = 0.0;
    uiSync();
  }

  function getWaveConfig(wave, floor) {
    const enemies = [];
    const baseCount = 8 + wave * 2;
    const floorMultiplier = 1 + (floor - 1) * 0.3;
    
    // Normal enemies
    const normalCount = Math.floor(baseCount * 0.6);
    const normalHp = Math.floor((30 + wave * 8) * floorMultiplier);
    const normalSpeed = 60 + Math.min(40, wave * 4);
    const normalReward = 15 + Math.floor(wave * 0.6);
    
    for (let i = 0; i < normalCount; i++) {
      enemies.push({ hp: normalHp, speed: normalSpeed, reward: normalReward, type: 'normal' });
    }
    
    // Fast enemies
    if (wave >= 2) {
      const fastCount = Math.floor(baseCount * 0.25);
      const fastHp = Math.floor((20 + wave * 5) * floorMultiplier);
      const fastSpeed = 100 + Math.min(60, wave * 6);
      const fastReward = 12 + Math.floor(wave * 0.4);
      
      for (let i = 0; i < fastCount; i++) {
        enemies.push({ hp: fastHp, speed: fastSpeed, reward: fastReward, type: 'fast' });
      }
    }
    
    // Tank enemies
    if (wave >= 3) {
      const tankCount = Math.floor(baseCount * 0.15);
      const tankHp = Math.floor((80 + wave * 20) * floorMultiplier);
      const tankSpeed = 30 + Math.min(20, wave * 2);
      const tankReward = 25 + Math.floor(wave * 1.2);
      
      for (let i = 0; i < tankCount; i++) {
        enemies.push({ hp: tankHp, speed: tankSpeed, reward: tankReward, type: 'tank' });
      }
    }
    
    // Boss enemy
    if (wave === 5) {
      const bossHp = Math.floor((200 + floor * 50) * floorMultiplier);
      const bossSpeed = 40;
      const bossReward = 100 + floor * 20;
      enemies.push({ hp: bossHp, speed: bossSpeed, reward: bossReward, type: 'boss' });
    }
    
    return enemies;
  }

  function updateSpawn(dt) {
    if (state.spawnQueue.length === 0) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      const spec = state.spawnQueue.shift();
      const e = new Enemy(spec.hp, spec.speed, spec.reward, spec.type);
      state.enemies.push(e);
      
      // Spawn timing based on enemy type
      let spawnDelay = 0.8;
      if (spec.type === 'fast') spawnDelay = 0.6;
      else if (spec.type === 'tank') spawnDelay = 1.2;
      else if (spec.type === 'boss') spawnDelay = 2.0;
      
      state.spawnTimer = Math.max(0.3, spawnDelay - state.wave * 0.05);
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
        tooltip.textContent = `Sell ${TOWER_DEFS[t.type].name} (Level ${t.level}) for ${t.sellValue}`;
        tooltip.style.left = `${e.clientX + 10}px`;
        tooltip.style.top = `${e.clientY - 10}px`;
        tooltip.hidden = false;
      }
    } else if (!state.sellMode && hoverCell.c >= 0 && hoverCell.r >= 0) {
      const def = TOWER_DEFS[state.placingType];
      if (def && !state.pathSet.has(`${hoverCell.c},${hoverCell.r}`) && !towerAt(hoverCell.c, hoverCell.r)) {
        tooltip.textContent = `Place ${def.name} (Cost: ${def.cost})`;
        tooltip.style.left = `${e.clientX + 10}px`;
        tooltip.style.top = `${e.clientY - 10}px`;
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
        if (state.selectedTower === t) {
          state.selectedTower = null;
        }
        uiSync();
      }
      return;
    }

    // Select tower for upgrades
    const existingTower = towerAt(c, r);
    if (existingTower) {
      state.selectedTower = existingTower;
      uiSync();
      return;
    }

    // Place new tower
    if (state.pathSet.has(`${c},${r}`)) return;
    const def = TOWER_DEFS[state.placingType];
    if (!def || state.money < def.cost) return;

    state.money -= def.cost;
    state.towers.push(new Tower(c, r, def, state.placingType));
    uiSync();
  });

  function towerAt(c, r) {
    return state.towers.find(t => t.c === c && t.r === r);
  }

  // UI Events
  towerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.placingType = btn.dataset.type;
      state.sellMode = false;
      uiSync();
    });
  });

  startBtn.addEventListener('click', () => {
    if (state.spawnQueue.length > 0) return;
    scheduleWave(state.wave + 1);
  });

  pauseBtn.addEventListener('click', () => {
    state.running = !state.running;
    uiSync();
  });

  sellBtn.addEventListener('click', () => {
    state.sellMode = !state.sellMode;
    state.selectedTower = null;
    uiSync();
  });

  nextFloorBtn.addEventListener('click', () => {
    state.floor++;
    initializeFloor();
    nextFloorBtn.hidden = true;
  });

  // Upgrade button events
  document.getElementById('upgradeDamage').addEventListener('click', () => {
    if (state.selectedTower) {
      state.selectedTower.upgrade('damage');
      uiSync();
    }
  });

  document.getElementById('upgradeRange').addEventListener('click', () => {
    if (state.selectedTower) {
      state.selectedTower.upgrade('range');
      uiSync();
    }
  });

  document.getElementById('upgradeSpeed').addEventListener('click', () => {
    if (state.selectedTower) {
      state.selectedTower.upgrade('speed');
      uiSync();
    }
  });

  // Drawing functions
  function drawGrid() {
    // Clear canvas
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw buildable tiles
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (!state.pathSet.has(`${c},${r}`)) {
          ctx.fillStyle = '#1a1d23';
          ctx.fillRect(c * GRID, r * GRID, GRID, GRID);
          ctx.strokeStyle = '#2a2d33';
          ctx.strokeRect(c * GRID + 0.5, r * GRID + 0.5, GRID - 1, GRID - 1);
        }
      }
    }

    // Draw path tiles
    for (const [c, r] of state.pathCells) {
      ctx.fillStyle = '#2a5f3b';
      ctx.fillRect(c * GRID, r * GRID, GRID, GRID);
      ctx.strokeStyle = '#1b3d27';
      ctx.strokeRect(c * GRID + 0.5, r * GRID + 0.5, GRID - 1, GRID - 1);
    }

    // Draw path direction arrows
    for (let i = 0; i < state.pathPoints.length - 1; i++) {
      const current = state.pathPoints[i];
      const next = state.pathPoints[i + 1];
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      const angle = Math.atan2(dy, dx);
      
      ctx.save();
      ctx.translate(current.x, current.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#4a7c59';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Hover indicator
    if (hoverCell.c >= 0 && hoverCell.r >= 0) {
      const canBuild = !state.pathSet.has(`${hoverCell.c},${hoverCell.r}`) && 
                      !towerAt(hoverCell.c, hoverCell.r);
      
      if (state.sellMode) {
        const tower = towerAt(hoverCell.c, hoverCell.r);
        ctx.fillStyle = tower ? 'rgba(255,92,122,0.3)' : 'rgba(255,255,255,0.1)';
      } else {
        ctx.fillStyle = canBuild ? 'rgba(79,124,255,0.3)' : 'rgba(255,92,122,0.2)';
      }
      
      ctx.fillRect(hoverCell.c * GRID, hoverCell.r * GRID, GRID, GRID);
    }
  }

  // Game loop
  let last = performance.now();
  function frame(now) {
    const dt = state.running ? Math.min(0.05, (now - last) / 1000) * state.timeScale : 0;
    last = now;

    // Update
    if (state.running) {
      updateSpawn(dt);
      state.towers.forEach(t => t.update(dt));
      state.bullets.forEach(b => b.update(dt));
      state.enemies.forEach(e => e.update(dt));

      // Cleanup
      state.bullets = state.bullets.filter(b => !b.dead);
      state.enemies = state.enemies.filter(e => !e.dead);

      // Check game over
      if (state.lives <= 0) {
        gameOver();
      }
    }

    // Render
    drawGrid();
    state.enemies.forEach(e => e.draw());
    state.towers.forEach(t => t.draw());
    state.bullets.forEach(b => b.draw());

    requestAnimationFrame(frame);
  }

  // Game over and leaderboard
  async function gameOver() {
    state.running = false;
    
    document.getElementById('finalScore').textContent = state.score;
    document.getElementById('finalFloor').textContent = state.floor;
    gameOverModal.hidden = false;
    
    // Auto-focus name input
    document.getElementById('playerName').focus();
  }

  async function submitScore() {
    const playerName = document.getElementById('playerName').value.trim();
    if (!playerName) {
      alert('Please enter your name!');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .insert([
          {
            player_name: playerName,
            score: state.score,
            floor_reached: state.floor,
            created_at: new Date().toISOString()
          }
        ]);

      if (error) throw error;
      
      await loadLeaderboard();
      alert('Score submitted successfully!');
      restartGame();
    } catch (error) {
      console.error('Error submitting score:', error);
      alert('Failed to submit score. Please try again.');
    }
  }

  async function loadLeaderboard() {
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('score', { ascending: false })
        .limit(10);

      if (error) throw error;

      const leaderboardEl = document.getElementById('leaderboard');
      if (data && data.length > 0) {
        leaderboardEl.innerHTML = data.map((entry, index) => 
          `<div class="leaderboard-entry">
            <span>#${index + 1} ${entry.player_name}</span>
            <span>${entry.score} (F${entry.floor_reached})</span>
          </div>`
        ).join('');
      } else {
        leaderboardEl.innerHTML = '<div class="loading">No scores yet</div>';
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      document.getElementById('leaderboard').innerHTML = '<div class="loading">Failed to load</div>';
    }
  }

  function restartGame() {
    // Reset all game state
    state.money = 250;
    state.lives = 25;
    state.wave = 0;
    state.floor = 1;
    state.score = 0;
    state.running = true;
    state.selectedTower = null;
    state.towers = [];
    state.enemies = [];
    state.bullets = [];
    state.spawnQueue = [];
    
    // Hide modal and initialize first floor
    gameOverModal.hidden = true;
    initializeFloor();
  }

  // Modal event listeners
  document.getElementById('submitScore').addEventListener('click', submitScore);
  document.getElementById('restartGame').addEventListener('click', restartGame);
  
  // Allow enter key to submit score
  document.getElementById('playerName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      submitScore();
    }
  });

  // Initialize game
  initializeFloor();
  loadLeaderboard();
  requestAnimationFrame(frame);
})();
