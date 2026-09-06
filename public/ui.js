// public/ui.js - Модуль управления UI, авторизацией и способностями

const UI = {
  init() {
    document.querySelectorAll('.btn-back').forEach(btn => {
      btn.addEventListener('click', () => {
        this.hideModal('stats-modal');
        this.hideModal('mistakes-modal');
        this.hideModal('friends-modal');
      });
    });

    // Обработка формы авторизации
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', () => {
        const usernameInput = document.getElementById('username-input');
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (username) {
          socket.emit('setNickname', username);
          const loginOverlay = document.getElementById('login-overlay');
          if (loginOverlay) loginOverlay.style.display = 'none';
        }
      });
    }

    // Кнопка открытия подсказки от друзей
    const btnFriends = document.getElementById('btn-friends');
    if (btnFriends) {
      btnFriends.addEventListener('click', () => {
        this.showModal('friends-modal');
      });
    }

    // Отправка запроса другу
    const sendFriendHintBtn = document.getElementById('send-friend-hint-btn');
    if (sendFriendHintBtn) {
      sendFriendHintBtn.addEventListener('click', () => {
        const friendInput = document.getElementById('friend-nickname-input');
        const friendName = friendInput ? friendInput.value.trim() : '';
        if (friendName) {
          socket.emit('requestFriendHint', { friendName });
          alert(`Запрос о помощи отправлен другу: ${friendName}`);
          if (friendInput) friendInput.value = '';
          this.hideModal('friends-modal');
        }
      });
    }

    // Обработка способностей из нижней панели
    const btnSpeed = document.getElementById('btn-speed');
    const btnAudio = document.getElementById('btn-audio');
    const btnLocator = document.getElementById('btn-locator');

    if (btnSpeed) {
      btnSpeed.addEventListener('click', () => {
        socket.emit('useAbility', { type: 'speed' });
      });
    }

    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        socket.emit('useAbility', { type: 'audio' });
      });
    }

    if (btnLocator) {
      btnLocator.addEventListener('click', () => {
        socket.emit('useAbility', { type: 'locator' });
      });
    }
  },

  showModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  },

  hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
};

window.addEventListener('DOMContentLoaded', () => UI.init());