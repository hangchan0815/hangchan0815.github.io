(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  const canvas = document.querySelector('#game-canvas');
  const ctx = canvas?.getContext('2d');
  const overlay = document.querySelector('#game-overlay');
  const overlayTitle = document.querySelector('#overlay-title');
  const overlayMessage = document.querySelector('#overlay-message');
  const startButton = document.querySelector('#start-button');
  const pauseButton = document.querySelector('#pause-button');
  const restartButton = document.querySelector('#restart-button');
  const scoreValue = document.querySelector('#score');
  const highScoreValue = document.querySelector('#high-score');
  const foodValue = document.querySelector('#food-count');
  const statusValue = document.querySelector('#game-status');
  const directionButtons = document.querySelectorAll('[data-direction]');
  const CELL = 24;
  const COLS = canvas ? canvas.width / CELL : 30;
  const ROWS = canvas ? canvas.height / CELL : 20;
  const MOVE_MS = 145;
  const ENEMY_MOVE_MS = 330;
  const EXPLOSION_MS = 1100;
  const RESPAWN_MS = 2000;
  const ENEMY_COUNT = 5;
  const MAX_FOOD = 10;
  const HIGH_SCORE_KEY = 'hangchan-worm-high-score';
  const directions = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  };
  const game = { snake: [], direction: { x: 1, y: 0 }, nextDirection: { x: 1, y: 0 }, food: null, enemies: [], score: 0, foodCount: 0, highScore: readHighScore(), running: false, paused: false, gameOver: false, completed: false, frame: 0, lastTime: 0, moveElapsed: 0, enemyElapsed: 0, nextExplosionAt: 0 };

  function readHighScore() {
    try { return Number.parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10) || 0; } catch { return 0; }
  }

  function writeHighScore() {
    try { localStorage.setItem(HIGH_SCORE_KEY, String(game.highScore)); } catch { /* storage can be unavailable */ }
  }

  function samePosition(a, b) { return a.x === b.x && a.y === b.y; }
  function randomCell() { return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; }
  function isOccupied(position) {
    return game.snake.some((part) => samePosition(part, position)) ||
      (game.food && samePosition(game.food, position)) ||
      game.enemies.some((enemy) => enemy.active && samePosition(enemy, position));
  }
  function randomFreeCell() {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const position = randomCell();
      if (!isOccupied(position)) return position;
    }
    return { x: 1, y: 1 };
  }

  function resetGame() {
    if (game.frame) cancelAnimationFrame(game.frame);
    game.snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
    game.direction = { x: 1, y: 0 };
    game.nextDirection = { x: 1, y: 0 };
    game.food = { x: 18, y: 10 };
    game.enemies = [];
    for (let i = 0; i < ENEMY_COUNT; i += 1) game.enemies.push({ ...randomFreeCell(), dx: i % 2 ? -1 : 1, dy: 0, active: true, exploding: false, respawnAt: 0, blastUntil: 0 });
    game.score = 0;
    game.foodCount = 0;
    game.running = false;
    game.paused = false;
    game.gameOver = false;
    game.completed = false;
    game.moveElapsed = 0;
    game.enemyElapsed = 0;
    updateHud('READY');
    draw();
  }

  function updateHud(status) {
    if (scoreValue) scoreValue.textContent = String(game.score).padStart(4, '0');
    if (highScoreValue) highScoreValue.textContent = String(game.highScore).padStart(4, '0');
    if (foodValue) foodValue.textContent = `${game.foodCount}/${MAX_FOOD}`;
    if (statusValue) statusValue.textContent = status;
    if (pauseButton) pauseButton.disabled = !game.running || game.gameOver || game.completed;
  }

  function setOverlay(title, message, buttonText) {
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    startButton.textContent = buttonText;
    overlay.classList.remove('is-hidden');
  }

  function hideOverlay() { overlay.classList.add('is-hidden'); }

  function startGame() {
    resetGame();
    game.running = true;
    game.lastTime = performance.now();
    game.nextExplosionAt = game.lastTime + 5000;
    hideOverlay();
    updateHud('RUNNING');
    game.frame = requestAnimationFrame(gameLoop);
  }

  function endGame(reason) {
    game.running = false;
    game.gameOver = true;
    game.completed = false;
    if (game.frame) cancelAnimationFrame(game.frame);
    if (game.score > game.highScore) { game.highScore = game.score; writeHighScore(); }
    updateHud('GAME OVER');
    setOverlay('Game over.', reason, '다시 시작');
  }

  function completeGame() {
    game.running = false;
    game.gameOver = false;
    game.completed = true;
    if (game.frame) cancelAnimationFrame(game.frame);
    if (game.score > game.highScore) { game.highScore = game.score; writeHighScore(); }
    updateHud('COMPLETE');
    setOverlay('Complete!', '먹이 10개를 모두 먹었습니다.', '다시 시작');
  }

  function setDirection(name) {
    const next = directions[name];
    if (!next || (next.x + game.direction.x === 0 && next.y + game.direction.y === 0)) return;
    game.nextDirection = { ...next };
  }

  function moveSnake() {
    game.direction = { ...game.nextDirection };
    const head = game.snake[0];
    const nextHead = { x: head.x + game.direction.x, y: head.y + game.direction.y };
    if (nextHead.x < 0 || nextHead.x >= COLS || nextHead.y < 0 || nextHead.y >= ROWS || game.snake.some((part, index) => index > 0 && samePosition(part, nextHead))) {
      endGame('벽이나 자신의 몸에 부딪혔습니다.');
      return;
    }
    game.snake.unshift(nextHead);
    if (samePosition(nextHead, game.food)) {
      game.score += 10;
      game.foodCount += 1;
      updateHud('RUNNING');
      if (game.foodCount >= MAX_FOOD) { completeGame(); return; }
      game.food = randomFreeCell();
    } else game.snake.pop();
  }

  function moveEnemies() {
    game.enemies.forEach((enemy) => {
      if (!enemy.active) return;
      if (Math.random() < 0.35) {
        const options = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].filter((direction) => direction.x !== -enemy.dx || direction.y !== -enemy.dy);
        const chosen = options[Math.floor(Math.random() * options.length)];
        enemy.dx = chosen.x; enemy.dy = chosen.y;
      }
      const next = { x: enemy.x + enemy.dx, y: enemy.y + enemy.dy };
      if (next.x < 0 || next.x >= COLS) enemy.dx *= -1;
      if (next.y < 0 || next.y >= ROWS) enemy.dy *= -1;
      enemy.x += enemy.dx; enemy.y += enemy.dy;
    });
  }

  function explodeEnemies(now) {
    game.enemies.forEach((enemy) => {
      if (!enemy.active) return;
      enemy.active = false;
      enemy.exploding = true;
      enemy.blastUntil = now + EXPLOSION_MS;
      enemy.respawnAt = now + RESPAWN_MS;
    });
    game.nextExplosionAt = now + 5000;
  }

  function respawnEnemies(now) {
    game.enemies.forEach((enemy) => {
      if (enemy.exploding && now >= enemy.respawnAt) {
        const position = randomFreeCell();
        Object.assign(enemy, position, { active: true, exploding: false, blastUntil: 0, respawnAt: 0 });
      }
    });
  }

  function checkHazards(now) {
    const head = game.snake[0];
    const enemyHit = game.enemies.some((enemy) => enemy.active && samePosition(enemy, head));
    const blastHit = game.enemies.some((enemy) => enemy.exploding && now < enemy.blastUntil && Math.hypot(enemy.x - head.x, enemy.y - head.y) <= 2.2);
    if (enemyHit || blastHit) endGame(enemyHit ? '움직이는 적과 충돌했습니다.' : '폭발 범위에 들어갔습니다.');
  }

  function gameLoop(now) {
    if (!game.running) return;
    game.frame = requestAnimationFrame(gameLoop);
    if (game.paused) return;
    const elapsed = Math.min(now - game.lastTime, 250);
    game.lastTime = now;
    game.moveElapsed += elapsed;
    game.enemyElapsed += elapsed;
    if (game.moveElapsed >= MOVE_MS) { game.moveElapsed = 0; moveSnake(); }
    if (game.enemyElapsed >= ENEMY_MOVE_MS) { game.enemyElapsed = 0; moveEnemies(); }
    if (now >= game.nextExplosionAt) explodeEnemies(now);
    respawnEnemies(now);
    checkHazards(now);
    if (game.running) updateHud('RUNNING');
    draw();
  }

  function drawCell(position, color, inset = 2) {
    ctx.fillStyle = color;
    ctx.fillRect(position.x * CELL + inset, position.y * CELL + inset, CELL - inset * 2, CELL - inset * 2);
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#06130d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(99, 255, 155, 0.08)'; ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x += 1) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y += 1) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke(); }
    if (game.food) { ctx.fillStyle = '#b4ffd0'; ctx.beginPath(); ctx.arc(game.food.x * CELL + CELL / 2, game.food.y * CELL + CELL / 2, CELL * 0.34, 0, Math.PI * 2); ctx.fill(); }
    game.enemies.forEach((enemy) => {
      if (enemy.active) drawCell(enemy, '#ff6d7a', 4);
      if (enemy.exploding) { ctx.strokeStyle = '#ffb36b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(enemy.x * CELL + CELL / 2, enemy.y * CELL + CELL / 2, CELL * 2.1, 0, Math.PI * 2); ctx.stroke(); }
    });
    game.snake.forEach((part, index) => drawCell(part, index === 0 ? '#b4ffd0' : '#63ff9b', index === 0 ? 2 : 4));
  }

  toggle?.addEventListener('click', () => { const isOpen = nav.classList.toggle('is-open'); toggle.setAttribute('aria-expanded', String(isOpen)); });
  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { nav.classList.remove('is-open'); toggle?.setAttribute('aria-expanded', 'false'); }));
  startButton?.addEventListener('click', () => { if (game.paused) { game.paused = false; hideOverlay(); updateHud('RUNNING'); return; } startGame(); });
  restartButton?.addEventListener('click', startGame);
  pauseButton?.addEventListener('click', () => { if (!game.running) return; game.paused = !game.paused; updateHud(game.paused ? 'PAUSED' : 'RUNNING'); if (game.paused) setOverlay('Paused.', '잠시 쉬어가세요.', '계속하기'); else hideOverlay(); });
  directionButtons.forEach((button) => button.addEventListener('click', () => setDirection(button.dataset.direction)));
  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const keyDirections = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
    if (keyDirections[key]) { event.preventDefault(); setDirection(keyDirections[key]); }
    if (key === ' ') { event.preventDefault(); pauseButton?.click(); }
  });
  resetGame();
})();
