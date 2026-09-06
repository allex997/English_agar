// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const phrases = require('./phrases');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const WORLD_WIDTH = 4500;
const WORLD_HEIGHT = 4500;
const MAX_FOOD_COUNT = 40;
const MIN_DIST_BETWEEN_FOOD = 200;
const WIN_SCORE = 400;

const audioBiomes = [
  { x: 1000, y: 1000, radius: 650 },
  { x: 3200, y: 1200, radius: 700 },
  { x: 2200, y: 3200, radius: 750 }
];

let foodItems = [];
let players = {};

let isSpeedMode = false;
let globalSpeedPhrase = null;
let roundTimer = 25;
let roundInterval = null;
let isGameOver = false;

function getRandomColor() {
  const colors = ['#ff4b5c', '#ff758c', '#ff8e53', '#fabe2c', '#a855f7', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getRandomPhrase() {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function wrapText(text, maxCharsPerLine = 12) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  words.forEach(word => {
    if ((currentLine + word).length > maxCharsPerLine && currentLine !== '') {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  });
  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines;
}

function isInsideAudioBiome(x, y) {
  return audioBiomes.some(b => Math.hypot(x - b.x, y - b.y) < b.radius);
}

function getValidSpawnPosition() {
  let x, y, tooClose;
  let attempts = 0;
  do {
    x = Math.random() * (WORLD_WIDTH - 300) + 150;
    y = Math.random() * (WORLD_HEIGHT - 300) + 150;
    tooClose = foodItems.some(f => Math.hypot(x - f.x, y - f.y) < MIN_DIST_BETWEEN_FOOD);
    attempts++;
  } while (tooClose && attempts < 100);

  return { x, y };
}

function createFoodItem(phraseObj, isCorrect = false, hintType = 0, forceBiome = false) {
  let pos = getValidSpawnPosition();

  if (forceBiome && audioBiomes.length > 0) {
    const randomBiome = audioBiomes[Math.floor(Math.random() * audioBiomes.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (randomBiome.radius - 100);
    pos.x = randomBiome.x + Math.cos(angle) * dist;
    pos.y = randomBiome.y + Math.sin(angle) * dist;
  }

  const inAudioBiome = isInsideAudioBiome(pos.x, pos.y);

  return {
    id: 'f_' + Math.random().toString(36).substr(2, 9),
    phraseData: phraseObj,
    textLines: wrapText(phraseObj.en),
    isCorrect: isCorrect,
    hintType: hintType,
    inAudioBiome: inAudioBiome,
    audioTriggeredPlayers: {},
    audioTriggerRadius: 180,
    x: pos.x,
    y: pos.y,
    radius: hintType > 0 ? 30 : 42,
    color: hintType === 1 ? '#f59e0b' : (hintType === 2 ? '#a855f7' : (inAudioBiome ? '#64748b' : getRandomColor())),
    vx: inAudioBiome ? 0 : (Math.random() - 0.5) * 1.2,
    vy: inAudioBiome ? 0 : (Math.random() - 0.5) * 1.2
  };
}

function fillMapWithFood() {
  while (foodItems.length < MAX_FOOD_COUNT) {
    foodItems.push(createFoodItem(getRandomPhrase(), false));
  }
}

function addTargetFoodForPlayer(phrase) {
  // 1. Обычный видимый вариант
  foodItems.push(createFoodItem(phrase, true, 0, false));
  // 2. Вариант в аудио-биоме (не привязан к позиции игрока)
  foodItems.push(createFoodItem(phrase, true, 0, true));
}

function startSpeedEvent() {
  isSpeedMode = true;
  globalSpeedPhrase = getRandomPhrase();
  roundTimer = 25;

  foodItems = foodItems.filter(f => !f.isCorrect);
  addTargetFoodForPlayer(globalSpeedPhrase);

  io.emit('eventStarted', {
    type: 'speedMode',
    phrase: globalSpeedPhrase,
    timer: roundTimer
  });

  if (roundInterval) clearInterval(roundInterval);
  roundInterval = setInterval(() => {
    roundTimer--;
    io.emit('roundTick', { isSpeedMode: true, timer: roundTimer });

    if (roundTimer <= 0) {
      clearInterval(roundInterval);
      isSpeedMode = false;
      io.emit('eventEnded', { message: "Время события истекло!" });
    }
  }, 1000);
}

function checkWinCondition(player) {
  if (player.score >= WIN_SCORE && !isGameOver) {
    isGameOver = true;
    if (roundInterval) clearInterval(roundInterval);

    const leaderBoard = Object.values(players)
      .sort((a, b) => b.score - a.score)
      .map(p => ({ name: p.name, score: p.score }));

    io.emit('gameOver', {
      winner: player.name,
      leaderBoard: leaderBoard
    });

    setTimeout(() => {
      resetGame();
    }, 10000);
  }
}

function resetGame() {
  isGameOver = false;
  isSpeedMode = false;
  foodItems = [];
  fillMapWithFood();

  Object.values(players).forEach(p => {
    p.score = 0;
    p.radius = p.baseRadius;
    p.currentPhrase = getRandomPhrase();
    p.x = WORLD_WIDTH / 2 + (Math.random() - 0.5) * 500;
    p.y = WORLD_HEIGHT / 2 + (Math.random() - 0.5) * 500;
  });

  io.emit('gameRestarted');
}

// Заполнение карты при старте
fillMapWithFood();

// Периодический запуск события "Режим скорости"
setInterval(() => {
  if (!isGameOver && !isSpeedMode && Object.keys(players).length > 0) {
    startSpeedEvent();
  }
}, 60000);

io.on('connection', (socket) => {
  const initialPhrase = getRandomPhrase();
  
  players[socket.id] = {
    id: socket.id,
    name: 'Игрок',
    x: WORLD_WIDTH / 2 + (Math.random() - 0.5) * 500,
    y: WORLD_HEIGHT / 2 + (Math.random() - 0.5) * 500,
    targetX: WORLD_WIDTH / 2,
    targetY: WORLD_HEIGHT / 2,
    radius: 45,
    baseRadius: 45,
    score: 0,
    color: getRandomColor(),
    speed: 0.08,
    hasBoughtSpeed: false,
    currentPhrase: initialPhrase
  };

  // Добавляем цели для индивидуального режима
  addTargetFoodForPlayer(initialPhrase);

  socket.emit('init', {
    id: socket.id,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    audioBiomes: audioBiomes,
    currentPhrase: initialPhrase,
    isSpeedMode: isSpeedMode
  });

  socket.on('setNickname', (name) => {
    if (players[socket.id]) players[socket.id].name = name || 'Игрок';
  });

  socket.on('playerMove', (target) => {
    const p = players[socket.id];
    if (!p || isGameOver) return;
    p.targetX = target.x;
    p.targetY = target.y;
  });

  socket.on('useAbility', (data) => {
    const p = players[socket.id];
    if (!p || isGameOver) return;

    if (data.type === 'speed') {
      if (p.hasBoughtSpeed) return;
      if (p.score >= 40) {
        p.score -= 40;
        p.hasBoughtSpeed = true;
        p.speed = 0.16;
        io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: "⚡ Ускорение куплено!", color: "#38bdf8" });
      }
    } else if (data.type === 'locator_friend') {
      // 5. Локатор для поиска близлежащего игрока
      if (p.score >= 30) {
        let nearestFriend = null;
        let minDist = Infinity;

        Object.values(players).forEach(other => {
          if (other.id !== p.id) {
            let d = Math.hypot(p.x - other.x, p.y - other.y);
            if (d < minDist) {
              minDist = d;
              nearestFriend = other;
            }
          }
        });

        if (nearestFriend) {
          p.score -= 30;
          io.to(socket.id).emit('activateLocator', { x: nearestFriend.x, y: nearestFriend.y });
          io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: `🧭 Друг ${nearestFriend.name} найден!`, color: "#a855f7" });
        } else {
          io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: "Других игроков нет!", color: "#ff4b5c" });
        }
      }
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
  });
});

// Игровой цикл (60 FPS)
setInterval(() => {
  if (isGameOver) return;

  const playerList = Object.values(players);

  // Движение игроков и проверка съедения других игроков (1)
  playerList.forEach(p => {
    p.x += (p.targetX - p.x) * p.speed;
    p.y += (p.targetY - p.y) * p.speed;

    p.x = Math.max(p.radius, Math.min(WORLD_WIDTH - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(WORLD_HEIGHT - p.radius, p.y));

    // Поедание игроков при разнице >= 50 очков
    playerList.forEach(other => {
      if (p.id !== other.id && p.score >= other.score + 50) {
        let dist = Math.hypot(p.x - other.x, p.y - other.y);
        if (dist < p.radius) {
          p.score += Math.floor(other.score / 2) + 20;
          p.radius += 4;

          other.score = 0;
          other.radius = other.baseRadius;
          other.x = WORLD_WIDTH / 2 + (Math.random() - 0.5) * 500;
          other.y = WORLD_HEIGHT / 2 + (Math.random() - 0.5) * 500;

          io.to(p.id).emit('floatingText', { x: p.x, y: p.y, text: `⚔️ Вы съели ${other.name}!`, color: "#38ef7d" });
          io.to(other.id).emit('floatingText', { x: other.x, y: other.y, text: `💀 Вас съел ${p.name}!`, color: "#ff4b5c" });

          checkWinCondition(p);
        }
      }
    });
  });

  // Проверка поедания шариков (6)
  for (let i = foodItems.length - 1; i >= 0; i--) {
    let food = foodItems[i];

    food.x += food.vx;
    food.y += food.vy;

    if (food.x - food.radius < 0 || food.x + food.radius > WORLD_WIDTH) food.vx *= -1;
    if (food.y - food.radius < 0 || food.y + food.radius > WORLD_HEIGHT) food.vy *= -1;

    playerList.forEach(p => {
      let dx = p.x - food.x;
      let dy = p.y - food.y;
      let distance = Math.hypot(dx, dy);

      // Логика звуковых биомов
      if (food.inAudioBiome) {
        if (distance < food.audioTriggerRadius && !food.audioTriggeredPlayers[p.id]) {
          food.audioTriggeredPlayers[p.id] = true;
          io.to(p.id).emit('playAudio', { text: food.phraseData.en });
        } else if (distance >= food.audioTriggerRadius + 50) {
          food.audioTriggeredPlayers[p.id] = false;
        }
      }

      // Касание шарика
      if (distance < p.radius + food.radius) {
        let activeTargetPhrase = isSpeedMode ? globalSpeedPhrase : p.currentPhrase;

        if (food.phraseData.id === activeTargetPhrase.id) {
          // ПРАВИЛЬНЫЙ ОТВЕТ
          p.score += isSpeedMode ? 25 : 10;
          p.radius += 2;

          io.to(p.id).emit('floatingText', { x: food.x, y: food.y, text: "Верно! +10", color: "#38ef7d" });
          
          // Лопаем съеденный шарик и локально спавним новую пару целей
          foodItems.splice(i, 1);
          
          if (!isSpeedMode) {
            p.currentPhrase = getRandomPhrase();
            io.to(p.id).emit('newIndividualPhrase', { phrase: p.currentPhrase });
            addTargetFoodForPlayer(p.currentPhrase);
          }

          checkWinCondition(p);
        } else {
          // НЕПРАВИЛЬНЫЙ ОТВЕТ
          p.score = Math.max(0, p.score - 5);
          p.radius = Math.max(p.baseRadius, p.radius - 1);
          io.to(p.id).emit('floatingText', { x: food.x, y: food.y, text: "Ошибка! -5", color: "#ff4b5c" });

          // Лопаем ошибочный шарик и заменяем его новым обычным
          foodItems.splice(i, 1);
          foodItems.push(createFoodItem(getRandomPhrase(), false));
        }
      }
    });
  }

  // Поддержание минимального числа шариков на карте
  fillMapWithFood();
}, 1000 / 60);

// Отправка состояния всем клиентам
setInterval(() => {
  io.emit('gameState', { players, foodItems });
}, 1000 / 25);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});