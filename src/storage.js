const fs = require('fs');
const path = require('path');
const { dataFilePath } = require('./config');

function createDefaultGuildState() {
  return {
    balances: {},
    lastCheckin: {},
    lastChatRewardAt: {},
    history: [],
    pendingXinRequests: {},
    activeRound: null,
    nextRoundId: 1
  };
}

function createDefaultState() {
  return {
    guilds: {}
  };
}

function ensureDirectoryExists() {
  fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
}

function normalizeGuildState(guild) {
  const nextRoundId = Number.parseInt(String(guild.nextRoundId ?? 1), 10);

  return {
    balances: guild.balances && typeof guild.balances === 'object' ? guild.balances : {},
    lastCheckin: guild.lastCheckin && typeof guild.lastCheckin === 'object' ? guild.lastCheckin : {},
    lastChatRewardAt: guild.lastChatRewardAt && typeof guild.lastChatRewardAt === 'object' ? guild.lastChatRewardAt : {},
    history: Array.isArray(guild.history) ? guild.history : [],
    pendingXinRequests: guild.pendingXinRequests && typeof guild.pendingXinRequests === 'object' ? guild.pendingXinRequests : {},
    activeRound: guild.activeRound && typeof guild.activeRound === 'object' ? guild.activeRound : null,
    nextRoundId: Number.isFinite(nextRoundId) && nextRoundId > 0 ? nextRoundId : 1
  };
}

function loadState() {
  ensureDirectoryExists();

  if (!fs.existsSync(dataFilePath)) {
    return createDefaultState();
  }

  try {
    const raw = fs.readFileSync(dataFilePath, 'utf8');
    if (!raw.trim()) {
      return createDefaultState();
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return createDefaultState();
    }

    if (!parsed.guilds || typeof parsed.guilds !== 'object') {
      parsed.guilds = {};
    }

    return parsed;
  } catch (error) {
    console.warn(`[storage] Could not read state file: ${error.message}`);
    return createDefaultState();
  }
}

function saveState(state) {
  ensureDirectoryExists();
  fs.writeFileSync(dataFilePath, JSON.stringify(state, null, 2), 'utf8');
}

function getGuildStateSnapshot(guildId) {
  const state = loadState();
  const guild = state.guilds[guildId];
  if (!guild) {
    return createDefaultGuildState();
  }

  return normalizeGuildState(guild);
}

function updateGuildState(guildId, updater) {
  const state = loadState();

  if (!state.guilds[guildId]) {
    state.guilds[guildId] = createDefaultGuildState();
  }

  state.guilds[guildId] = normalizeGuildState(state.guilds[guildId]);
  const result = updater(state.guilds[guildId], state);
  saveState(state);
  return result;
}

module.exports = {
  createDefaultGuildState,
  createDefaultState,
  loadState,
  saveState,
  getGuildStateSnapshot,
  updateGuildState
};