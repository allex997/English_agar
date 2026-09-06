// public/ui.js - Модуль управления UI и модальными окнами

const UI = {
  init() {
    // Обработка всех кнопок закрытия модальных окон
    document.querySelectorAll('.btn-back').forEach(btn => {
      btn.addEventListener('click', () => {
        this.hideModal('stats-modal');
        this.hideModal('mistakes-modal');
        this.hideModal('friends-modal');
        this.hideModal('game-over-modal');
      });
    });
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