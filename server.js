// server.js - Исправлено дергание и добавлена отправка таблицы лидеров

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const phrases = require('./phrases');
console.log(`Загружено фраз: ${phrases.length}`);
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const WORLD_WIDTH = 4500;
const WORLD_HEIGHT = 4500;
const MAX_FOOD_COUNT = 35;
const MIN_DIST_BETWEEN_FOOD = 220;

/*const phrases = [
  { id: "p1", en: "Apple", ru: "Яблоко" },
  { id: "p2", en: "Cat", ru: "Кошка" },
  { id: "p3", en: "Dog", ru: "Собака" },
  { id: "p4", en: "Sun", ru: "Солнце" },
  { id: "p5", en: "It is cloudy outside today", ru: "Сегодня на улице пасмурно" }
];*/

const audioBiomes = [
  { x: 1000, y: 1000, radius: 650 },
  { x: 3200, y: 1200, radius: 700 },
  { x: 2200, y: 3200, radius: 750 }
];

let currentPhrase = null;
let foodItems = [];
let players = {};

let isSpeedMode = false;
let roundTimer = 25;
let roundInterval = null;

function getRandomColor() {
  const colors = ['#ff4b5c', '#ff758c', '#ff8e53', '#fabe2c', '#a855f7', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16'];
  return colors[Math.floor(Math.random() * colors.length)];
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
  let x, y, tooCloseToOthers;
  let attempts = 0;
  do {
    x = Math.random() * (WORLD_WIDTH - 300) + 150;
    y = Math.random() * (WORLD_HEIGHT - 300) + 150;
    tooCloseToOthers = foodItems.some(f => Math.hypot(x - f.x, y - f.y) < MIN_DIST_BETWEEN_FOOD);
    attempts++;
  } while (tooCloseToOthers && attempts < 200);

  return { x, y };
}

function createFoodItem(phraseObj, isCorrect, hintType = 0) {
  const lines = wrapText(phraseObj.en);
  const pos = getValidSpawnPosition();
  const inAudioBiome = isInsideAudioBiome(pos.x, pos.y);

  return {
    id: 'f_' + Math.random().toString(36).substr(2, 9),
    phraseData: phraseObj,
    textLines: lines,
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

function spawnFood() {
  foodItems = [];
  if (!currentPhrase) return;

  let correctFood = createFoodItem(currentPhrase, true);
  correctFood.inAudioBiome = false; 
  foodItems.push(correctFood);
  
  let audioPos = { x: audioBiomes[0]?.x || 1000, y: audioBiomes[0]?.y || 1000 };
  let correctAudioFood = createFoodItem(currentPhrase, true);
  correctAudioFood.x = audioPos.x + (Math.random() - 0.5) * 400;
  correctAudioFood.y = audioPos.y + (Math.random() - 0.5) * 400;
  correctAudioFood.inAudioBiome = true;
  correctAudioFood.vx = 0; correctAudioFood.vy = 0;
  correctAudioFood.color = '#64748b';
  foodItems.push(correctAudioFood);

  foodItems.push(createFoodItem(currentPhrase, true, 1));
  foodItems.push(createFoodItem(currentPhrase, true, 2));

  const wrongPhrases = phrases.filter(p => p.id !== currentPhrase.id);
  for (let i = 0; i < MAX_FOOD_COUNT - 4; i++) {
    const randomWrong = wrongPhrases.length > 0 
      ? wrongPhrases[Math.floor(Math.random() * wrongPhrases.length)] 
      : currentPhrase;
    foodItems.push(createFoodItem(randomWrong, false));
  }
}

function stopSpeedModeTimer() {
  if (roundInterval) {
    clearInterval(roundInterval);
    roundInterval = null;
  }
}

function startSpeedModeTimer() {
  stopSpeedModeTimer();
  roundTimer = 25;
  
  roundInterval = setInterval(() => {
    roundTimer--;
    io.emit('roundTick', { isSpeedMode: true, timer: roundTimer });
    
    if (roundTimer <= 0) {
      io.emit('roundWinner', { winnerName: "Никто не успел", phrase: currentPhrase.en });
      nextQuestion();
    }
  }, 1000);
}

function nextQuestion() {
  stopSpeedModeTimer();

  const randomIndex = Math.floor(Math.random() * phrases.length);
  currentPhrase = phrases[randomIndex];
  spawnFood();

  isSpeedMode = Math.random() < 0.30; 

  io.emit('newQuestion', {
    phrase: currentPhrase,
    isSpeedMode: isSpeedMode
  });

  if (isSpeedMode) {
    startSpeedModeTimer();
  } else {
    io.emit('roundTick', { isSpeedMode: false, timer: 0 });
  }
}

nextQuestion();

io.on('connection', (socket) => {
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
    hasBoughtSpeed: false
  };

  socket.emit('init', {
    id: socket.id,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    audioBiomes: audioBiomes,
    currentPhrase: currentPhrase,
    isSpeedMode: isSpeedMode
  });

  socket.on('setNickname', (name) => {
    if (players[socket.id]) {
      players[socket.id].name = name || 'Игрок';
    }
  });

  socket.on('playerMove', (target) => {
    const p = players[socket.id];
    if (!p) return;
    p.targetX = target.x;
    p.targetY = target.y;
  });

  socket.on('useAbility', (data) => {
    const p = players[socket.id];
    if (!p) return;

    if (data.type === 'speed') {
      if (p.hasBoughtSpeed) {
        io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: "Уже куплено!", color: "#fabe2c" });
        return;
      }
      const speedCost = 40;
      if (p.score >= speedCost) {
        p.score -= speedCost;
        p.hasBoughtSpeed = true;
        p.speed = 0.16;
        io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: "⚡ Ускорение куплено!", color: "#38bdf8" });
      } else {
        io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: `Нужно ${speedCost} очков!`, color: "#ff4b5c" });
      }
    } else if (data.type === 'audio') {
      if (p.score >= 30) {
        p.score -= 30;
        io.to(socket.id).emit('playAudio', { text: currentPhrase.en });
        io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: "💡 Произношение!", color: "#fabe2c" });
      } else {
        io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: "Нужно 30 очков!", color: "#ff4b5c" });
      }
    } else if (data.type === 'locator') {
      if (p.score >= 50) {
        p.score -= 50;
        const correctVisibleFood = foodItems.find(f => f.isCorrect && !f.inAudioBiome && f.hintType === 0);
        if (correctVisibleFood) {
          io.to(socket.id).emit('activateLocator', { x: correctVisibleFood.x, y: correctVisibleFood.y });
        }
        io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: "🧭 Область найдена!", color: "#a855f7" });
      } else {
        io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: "Нужно 50 очков!", color: "#ff4b5c" });
      }
    }
  });

  socket.on('requestFriendHint', (data) => {
    const p = players[socket.id];
    if (!p) return;
    io.to(socket.id).emit('floatingText', { x: p.x, y: p.y, text: `📩 Запрос отправлен ${data.friendName}`, color: "#38bdf8" });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
  });
});

// Игровой цикл обновления физики сервера
setInterval(() => {
  // Движение игроков
  Object.values(players).forEach(p => {
    p.x += (p.targetX - p.x) * p.speed;
    p.y += (p.targetY - p.y) * p.speed;

    p.x = Math.max(p.radius, Math.min(WORLD_WIDTH - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(WORLD_HEIGHT - p.radius, p.y));
  });

  // Движение и столкновения еды
  for (let i = foodItems.length - 1; i >= 0; i--) {
    let food = foodItems[i];

    food.x += food.vx;
    food.y += food.vy;

    if (food.x - food.radius < 0 || food.x + food.radius > WORLD_WIDTH) food.vx *= -1;
    if (food.y - food.radius < 0 || food.y + food.radius > WORLD_HEIGHT) food.vy *= -1;

    Object.values(players).forEach(p => {
      let dx = p.x - food.x;
      let dy = p.y - food.y;
      let distance = Math.hypot(dx, dy);

      if (food.inAudioBiome) {
        if (distance < food.audioTriggerRadius && !food.audioTriggeredPlayers[p.id]) {
          food.audioTriggeredPlayers[p.id] = true;
          io.to(p.id).emit('playAudio', { text: food.phraseData.en });
        } else if (distance >= food.audioTriggerRadius + 50) {
          food.audioTriggeredPlayers[p.id] = false;
        }
      }

      if (distance < p.radius + food.radius) {
        if (food.hintType === 1) {
          io.to(p.id).emit('playAudio', { text: food.phraseData.en });
          io.to(p.id).emit('floatingText', { x: food.x, y: food.y, text: "💡 Подсказка!", color: "#fabe2c" });
          foodItems.splice(i, 1);
          return;
        }

        if (food.hintType === 2) {
          const correctVisibleFood = foodItems.find(f => f.isCorrect && !f.inAudioBiome && f.hintType === 0);
          if (correctVisibleFood) {
            io.to(p.id).emit('activateLocator', { x: correctVisibleFood.x, y: correctVisibleFood.y });
          }
          io.to(p.id).emit('floatingText', { x: food.x, y: food.y, text: "🧭 Область найдена!", color: "#a855f7" });
          foodItems.splice(i, 1);
          return;
        }

        if (food.isCorrect) {
          const bonusScore = isSpeedMode ? 25 : 10;
          p.score += bonusScore;
          p.radius += 3;
          
          io.emit('playAudio', { text: currentPhrase.en });
          
          if (isSpeedMode) {
            io.emit('roundWinner', { winnerName: p.name, phrase: currentPhrase.en });
          } else {
            io.to(p.id).emit('floatingText', { x: food.x, y: food.y, text: `+${bonusScore} Верно!`, color: "#38ef7d" });
          }

          nextQuestion();
        } else {
          p.score = Math.max(0, p.score - 5);
          p.radius = Math.max(p.baseRadius, p.radius - 2);
          io.to(p.id).emit('floatingText', { x: food.x, y: food.y, text: "-5 Ошибка!", color: "#ff4b5c" });
          foodItems.splice(i, 1);
        }
      }
    });
  }
}, 1000 / 60);

// Рассылка состояния клиентам со сниженной частотой для предотвращения дерганий
setInterval(() => {
  io.emit('gameState', { players, foodItems });
}, 1000 / 25);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});