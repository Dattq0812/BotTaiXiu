const path = require('path');
require('dotenv').config();

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const chatRewardMinRaw = parseInteger(process.env.CHAT_REWARD_MIN, 3);
const chatRewardMaxRaw = parseInteger(process.env.CHAT_REWARD_MAX, 8);
const chatRewardMin = Math.min(chatRewardMinRaw, chatRewardMaxRaw);
const chatRewardMax = Math.max(chatRewardMinRaw, chatRewardMaxRaw);

module.exports = {
  token: process.env.DISCORD_TOKEN ?? '',
  clientId: (process.env.DISCORD_CLIENT_ID ?? '').trim(),
  guildId: (process.env.DISCORD_GUILD_ID ?? '').trim(),
  prefix: (process.env.PREFIX ?? '!').trim() || '!',
  useMessageContentIntent: process.env.ENABLE_MESSAGE_CONTENT_INTENT === 'true',
  roundBettingWindowMs: Math.max(1000, parseInteger(process.env.ROUND_BETTING_WINDOW_MS, 30000)),
  xinRequestTimeoutMs: Math.max(60000, parseInteger(process.env.XIN_REQUEST_TIMEOUT_MS, 600000)),
  dataFilePath: path.resolve(process.cwd(), process.env.DATA_FILE ?? 'data/state.json'),
  startingBalance: Math.max(0, parseInteger(process.env.STARTING_BALANCE, 0)),
  dailyReward: Math.max(0, parseInteger(process.env.DAILY_REWARD, 100)),
  chatRewardMin,
  chatRewardMax,
  chatRewardCooldownMs: Math.max(0, parseInteger(process.env.CHAT_REWARD_COOLDOWN_MS, 45000)),
  chatRewardMinMessageLength: Math.max(0, parseInteger(process.env.CHAT_REWARD_MIN_MESSAGE_LENGTH, 12)),
  betMin: Math.max(1, parseInteger(process.env.BET_MIN, 1)),
  timeZone: (process.env.TIME_ZONE ?? 'Asia/Ho_Chi_Minh').trim() || 'Asia/Ho_Chi_Minh',
  historyLimit: 10
};