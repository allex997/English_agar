// public/game.js - Плавное сглаживание и обновление таблицы лидеров

const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

let screenWidth = canvas ? (canvas.width = window.innerWidth) : window.innerWidth;
let screenHeight = canvas ? (canvas.height = window.innerHeight) : window.innerHeight;

window.addEventListener('resize', () => {
  if (!canvas) return;
  screenWidth = canvas.width = window.innerWidth;
  screenHeight = canvas.height = window.innerHeight;
});

let myId = null;
let worldWidth = 4500;
let worldHeight = 4500;

let players = {};
let renderPlayers = {}; // Локальные позиции для плавного отображения
let foodItems = [];
let floatingTexts = [];
let audioBiomes = [];

let localPlayerPos = { x: 2250, y: 2250, radius: 45 };

let hint2Active = false;
let hint2Interval = null;
let hint2TimeLeft = 20;
let hintTargetArea = { x: 0, y: 0 };

const mouse = { x: screenWidth / 2, y: screenHeight / 2 };

window.addEventListener('mousemove', (e) => { 
  mouse.x = e.clientX; 
  mouse.y = e.clientY; 
});

window.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
  }
}, { passive: true });

function speakEnText(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function updateQuestionUI(phrase, isSpeedMode) {
  const targetEl = document.getElementById('target-word');
  if (targetEl && phrase) {
    targetEl.textContent = phrase.ru;
  }

  const speedBadgeEl = document.getElementById('speed-mode-badge');
  if (speedBadgeEl) {
    speedBadgeEl.style.display = isSpeedMode ? 'inline-block' : 'none';
  }
}

function updateLeaderboard() {
  const leaderboardList = document.getElementById('leaderboard-list');
  if (!leaderboardList) return;

  const sortedPlayers = Object.values(players).sort((a, b) => b.score - a.score).slice(0, 5);

  leaderboardList.innerHTML = '';
  sortedPlayers.forEach((p, index) => {
    const li = document.createElement('li');
    if (p.id === myId) li.classList.add('me');
    li.innerHTML = `<span>${index + 1}. ${p.name || 'Игрок'}</span><span>${p.score}</span>`;
    leaderboardList.appendChild(li);
  });
}

// Socket Events
socket.on('init', (data) => {
  myId = data.id;
  worldWidth = data.worldWidth;
  worldHeight = data.worldHeight;
  audioBiomes = data.audioBiomes;
  
  updateQuestionUI(data.currentPhrase, data.isSpeedMode);
});

socket.on('newQuestion', (data) => {
  resetHint2();
  
  const phrase = data.phrase || data;
  const isSpeedMode = !!data.isSpeedMode;
  
  updateQuestionUI(phrase, isSpeedMode);

  if (isSpeedMode) {
    addFloatingText(localPlayerPos.x, localPlayerPos.y - 120, "⚡ РЕЖИМ НА СКОРОСТЬ!", "#fabe2c");
  }
});

socket.on('roundTick', (data) => {
  const roundTimerContainer = document.getElementById('round-timer-container');
  const roundTimerEl = document.getElementById('round-timer');
  
  if (data.isSpeedMode) {
    if (roundTimerContainer) roundTimerContainer.style.display = 'flex';
    if (roundTimerEl) roundTimerEl.textContent = data.timer;
  } else {
    if (roundTimerContainer) roundTimerContainer.style.display = 'none';
  }
});

socket.on('roundWinner', (data) => {
  if (players[myId]) {
    addFloatingText(
      localPlayerPos.x, 
      localPlayerPos.y - 80, 
      `🏆 ${data.winnerName} отгадал: "${data.phrase}"!`, 
      "#38ef7d"
    );
  }
});

socket.on('gameState', (state) => {
  players = state.players;
  foodItems = state.foodItems;

  if (players[myId]) {
    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.textContent = players[myId].score;
  }

  updateLeaderboard();
});

socket.on('playAudio', (data) => {
  speakEnText(data.text);
});

socket.on('floatingText', (data) => {
  addFloatingText(data.x, data.y, data.text, data.color);
});

socket.on('activateLocator', (targetPos) => {
  activateHint2(targetPos);
});

function resetHint2() {
  hint2Active = false;
  if (hint2Interval) clearInterval(hint2Interval);
  const hint2TimerContainer = document.getElementById('hint2-timer-container');
  if (hint2TimerContainer) hint2TimerContainer.style.display = 'none';
}

function activateHint2(targetPos) {
  hintTargetArea = targetPos;
  hint2Active = true;
  hint2TimeLeft = 20;

  const hint2TimerContainer = document.getElementById('hint2-timer-container');
  const hint2TimerEl = document.getElementById('hint2-timer');

  if (hint2TimerContainer) {
    if (hint2TimerEl) hint2TimerEl.textContent = hint2TimeLeft;
    hint2TimerContainer.style.display = 'flex';
  }

  if (hint2Interval) clearInterval(hint2Interval);

  hint2Interval = setInterval(() => {
    hint2TimeLeft--;
    if (hint2TimerEl) hint2TimerEl.textContent = hint2TimeLeft;
    if (hint2TimeLeft <= 0) resetHint2();
  }, 1000);
}

function addFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color, alpha: 1, life: 100 });
}

function drawDiamond(ctx, x, y, radius, color, strokeColor = '#38bdf8') {
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawLocatorArrow(ctx, screenCenterX, screenCenterY, angle) {
  ctx.save();
  ctx.translate(screenCenterX, screenCenterY);
  ctx.rotate(angle);

  const arrowDistance = 140;
  ctx.translate(arrowDistance, 0);

  ctx.beginPath();
  ctx.moveTo(25, 0);
  ctx.lineTo(-15, -15);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-15, 15);
  ctx.closePath();

  ctx.fillStyle = '#c084fc';
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 15;
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function update() {
  // Плавная сглаженная интерполяция движений локального и других игроков
  Object.keys(players).forEach(id => {
    const serverP = players[id];
    if (!renderPlayers[id]) {
      renderPlayers[id] = { x: serverP.x, y: serverP.y, radius: serverP.radius };
    } else {
      renderPlayers[id].x += (serverP.x - renderPlayers[id].x) * 0.2;
      renderPlayers[id].y += (serverP.y - renderPlayers[id].y) * 0.2;
      renderPlayers[id].radius += (serverP.radius - renderPlayers[id].radius) * 0.2;
    }
  });

  // Удаляем отсоединившихся игроков из объектов рендера
  Object.keys(renderPlayers).forEach(id => {
    if (!players[id]) delete renderPlayers[id];
  });

  if (renderPlayers[myId]) {
    localPlayerPos = renderPlayers[myId];

    const targetWorldX = localPlayerPos.x + (mouse.x - screenWidth / 2);
    const targetWorldY = localPlayerPos.y + (mouse.y - screenHeight / 2);

    socket.emit('playerMove', { x: targetWorldX, y: targetWorldY });
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    let ft = floatingTexts[i];
    ft.y -= 1.0;
    ft.alpha -= 0.01;
    ft.life--;
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  }
}

function draw() {
  if (!ctx) return;

  ctx.clearRect(0, 0, screenWidth, screenHeight);
  
  const me = localPlayerPos;

  ctx.save();
  ctx.translate(screenWidth / 2 - me.x, screenHeight / 2 - me.y);

  // Сетка игрового поля
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, worldWidth, worldHeight);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 2;
  const gridSize = 60;
  for (let x = 0; x <= worldWidth; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, worldHeight); ctx.stroke();
  }
  for (let y = 0; y <= worldHeight; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(worldWidth, y); ctx.stroke();
  }

  // Аудио-биомы
  audioBiomes.forEach(biome => {
    ctx.beginPath();
    ctx.arc(biome.x, biome.y, biome.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14, 165, 233, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 12]);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Зона локатора
  if (hint2Active) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(hintTargetArea.x, hintTargetArea.y, 450, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.8)';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Еда / Варианты ответов
  foodItems.forEach(food => {
    if (food.hintType === 1) {
      drawDiamond(ctx, food.x, food.y, food.radius, '#f59e0b', '#fbbf24');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("💡", food.x, food.y);
    } else if (food.hintType === 2) {
      drawDiamond(ctx, food.x, food.y, food.radius, '#a855f7', '#c084fc');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("🧭", food.x, food.y);
    } else if (food.inAudioBiome) {
      drawDiamond(ctx, food.x, food.y, food.radius, '#475569');

      ctx.beginPath();
      ctx.arc(food.x, food.y, food.audioTriggerRadius || 180, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("?", food.x, food.y);
    } else {
      ctx.beginPath();
      ctx.arc(food.x, food.y, food.radius, 0, Math.PI * 2);
      ctx.fillStyle = food.color;
      ctx.shadowColor = food.color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lineHeight = 18;
      const totalHeight = (food.textLines ? food.textLines.length : 1) * lineHeight;
      let startY = food.y - (totalHeight / 2) + (lineHeight / 2);

      if (food.textLines) {
        food.textLines.forEach((line, index) => {
          ctx.fillText(line, food.x, startY + (index * lineHeight));
        });
      }
    }
  });

  // Игроки с плавной отрисовкой
  Object.keys(renderPlayers).forEach(id => {
    const p = renderPlayers[id];
    const serverP = players[id];
    if (!serverP) return;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = id === myId ? '#00f2fe' : serverP.color;
    ctx.shadowColor = serverP.color;
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${Math.max(14, p.radius / 2.5)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(serverP.name || (id === myId ? "ВЫ" : "Игрок"), p.x, p.y);
  });

  // Всплывающие тексты
  floatingTexts.forEach(ft => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, ft.alpha);
    ctx.fillStyle = ft.color;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  });

  ctx.restore();

  // Стрелка локатора
  if (hint2Active) {
    const dx = hintTargetArea.x - me.x;
    const dy = hintTargetArea.y - me.y;
    const angle = Math.atan2(dy, dx);
    drawLocatorArrow(ctx, screenWidth / 2, screenHeight / 2, angle);
  }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);