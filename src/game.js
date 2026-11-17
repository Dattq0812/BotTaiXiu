function rollDice() {
  const dice = Array.from({ length: 3 }, () => Math.floor(Math.random() * 6) + 1);
  const total = dice.reduce((sum, value) => sum + value, 0);
  const result = total >= 11 ? 'tai' : 'xiu';

  return {
    dice,
    total,
    result
  };
}

function formatSide(side) {
  return side === 'tai' ? 'Tài' : 'Xỉu';
}

function formatDice(dice) {
  return dice.join(' - ');
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  rollDice,
  formatSide,
  formatDice,
  randomInteger
};