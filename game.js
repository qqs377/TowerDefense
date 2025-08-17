// == Tower Defense - Floors with Auto Map ==
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
    floor: 1,
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
    pathCells: [],
    pathPoints: [],
    pathSet: new Set(),
  };

  // Tower defs
  const TOWER_DEFS = {
    basic:  { cost: 100, range: 140, fireRate: 0.8, damage: 10, bulletSpeed: 420, color: '#4f7cff' },
    sniper: { cost: 150, range: 260, fireRate: 1.8, damage: 28, bulletSpeed: 700, color: '#ffd166' },
    slow:   { cost: 120, range: 120, fireRate: 1.1, damage: 6,  bulletSpeed: 360, color: '#8de86e', slow: 0.55, slowSecs: 1.2 },
  };

  // === Automatic Path Generation ===
  function generatePath() {
    const path = [];
    let c = 0, r = Math.floor(ROWS/2); // start left middle
    path.push([c,r]);
    while (c < COLS-1) {
      const dirOptions = [];
      if (c < COLS-1) dirOptions.push([1,0]); // right
      if (r > 1) dirOptions.push([0,-1]);     // up
      if (r < ROWS-2) dirOptions.push([0,1]); // down

      let moved = false;
      while (!moved && dirOptions.length > 0) {
        const choice = dirOptions[Math.floor(Math.random()*dirOptions.length)];
        const nc = c + choice[0];
        const nr = r + choice[1];
        if (!path.find(([pc,pr]) => pc===nc && pr===nr)) {
          c = nc; r = nr;
          path.push([c,r]);
          moved = true;
        } else {
          dirOptions.splice(dirOptions.indexOf(choice),1);
        }
      }
      if (!moved) break;
    }

    state.pathCells = path;
    state.pathSet = new Set(path.map(([c,r]) => `${c},${r}`));
    state.pathPoints = path.map(([c,r]) => ({ x: c*GRID+GRID/2, y: r*GRID+GRID/2 }));
  }

  // === Waves per floor ===
  function scheduleWave(n) {
    state.wave = n;
    const difficulty = (state.floor-1)*3 + n; // increases with floor + wave
    const count = 6 + difficulty * 2;
    const hp = 40 + difficulty * 15;
    const speed = 70 + Math.min(80, difficulty*5);
    const reward = 10 + Math.floor(difficulty*2.5); // more powerful enemy → more money

    state.spawnQueue = Array.from({length: count}, () => ({ hp, speed, reward }));
    state.spawnTimer = 0.0;
    uiSync();
  }

  function nextFloor() {
    state.floor++;
    state.wave = 0;
    state.towers = [];
    state.enemies = [];
    state.bullets = [];
    generatePath();
    alert(`Floor ${state.floor}! New map generated.`);
    uiSync();
  }

  // === Sync UI ===
  function uiSync() {
    elMoney.textContent = state.money;
    elLives.textContent = state.lives;
    elWave.textContent = `${state.wave} / 3 (Floor ${state.floor})`;
    pauseBtn.textContent = state.running ? 'Pause' : 'Resume';
    sellBtn.textContent = `Sell Mode: ${state.sellMode ? 'On' : 'Off'}`;
    towerButtons.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.type === state.placingType);
    });
  }

  // === Enemy, Tower, Bullet classes remain the same ===
  // (Keep them from the earlier version)

  // (… keep Enemy, Bullet, Tower class code exactly as before …)

  // === Spawning logic ===
  function updateSpawn(dt) {
    if (state.spawnQueue.length === 0) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      const spec = state.spawnQueue.shift();
      const e = new Enemy(spec.hp, spec.speed, spec.reward);
      state.enemies.push(e);
      state.spawnTimer = 0.6;
    }
  }

  // === Game Loop additions ===
  function frame(now) {
    const dt = state.running ? Math.min(0.05, (now - last)/1000) : 0;
    last = now;

    if (state.running) {
      updateSpawn(dt);
      state.towers.forEach(t => t.update(dt));
      state.bullets.forEach(b => b.update(dt));
      state.enemies.forEach(e => e.update(dt));

      state.bullets = state.bullets.filter(b => !b.dead);
      state.enemies = state.enemies.filter(e => !(e.dead && e.hp<=0));

      if (state.lives <= 0) {
        gameOver(false);
      }

      if (state.spawnQueue.length === 0 && state.enemies.every(e => e.dead)) {
        if (state.wave === 3) {
          nextFloor();
        }
      }
    }

    // Draw
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawGrid();
    state.enemies.forEach(e => e.draw());
    state.towers.forEach(t => t.draw());
    state.bullets.forEach(b => b.draw());

    requestAnimationFrame(frame);
  }

  function drawGrid() {
    for (const [c,r] of state.pathCells) {
      ctx.fillStyle = '#2a5f3b';
      ctx.fillRect(c*GRID, r*GRID, GRID, GRID);
      ctx.strokeStyle = '#1b3d27';
      ctx.strokeRect(c*GRID+0.5, r*GRID+0.5, GRID-1, GRID-1);
    }
  }

  function gameOver(win) {
    state.running = false;
    ctx.fillStyle = win ? '#8de86e' : '#ff5c7a';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(win ? 'You Win!' : 'Game Over', canvas.width/2, canvas.height/2);
  }

  // === UI events ===
  startBtn.addEventListener('click', () => {
    if (state.spawnQueue.length > 0) return;
    if (state.wave < 3) {
      scheduleWave(state.wave + 1);
    }
  });

  pauseBtn.addEventListener('click', () => {
    state.running = !state.running;
    uiSync();
  });

  sellBtn.addEventListener('click', () => {
    state.sellMode = !state.sellMode;
    uiSync();
  });

  towerButtons.forEach(btn => btn.addEventListener('click', () => {
    state.placingType = btn.dataset.type;
    state.sellMode = false;
    uiSync();
  }));

  // === Init ===
  let last = performance.now();
  generatePath();
  uiSync();
  requestAnimationFrame(frame);
})();
