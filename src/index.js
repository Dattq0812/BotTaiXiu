const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  REST,
  Routes,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const config = require('./config');
const { slashCommands } = require('./commands');
const { loadState, getGuildStateSnapshot, updateGuildState } = require('./storage');
const { rollDice, formatSide, formatDice, randomInteger } = require('./game');

if (!config.token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill in your token.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    ...(config.useMessageContentIntent ? [GatewayIntentBits.MessageContent] : [])
  ]
});

const roundTimers = new Map();

async function registerSlashCommands() {
  if (!config.clientId) {
    console.warn('Missing DISCORD_CLIENT_ID. Slash commands were not registered.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body: slashCommands });
  console.log(`Registered ${slashCommands.length} slash command(s)${config.guildId ? ` for guild ${config.guildId}` : ' globally'}.`);
}

function formatBalance(amount) {
  return `${amount.toLocaleString('vi-VN')} xu`;
}

function getDisplayName(message, user = message.author) {
  if (user.id === message.author.id) {
    return message.member?.displayName ?? message.author.username;
  }

  const member = message.guild?.members?.cache.get(user.id);
  return member?.displayName ?? user.username;
}

function getTodayKey() {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: config.timeZone
  });
}

function parseAmount(raw) {
  if (!raw) {
    return null;
  }

  const normalized = String(raw).replace(/[,_\s]/g, '');
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const amount = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

function ensureBalance(guild, userId) {
  if (typeof guild.balances[userId] !== 'number') {
    guild.balances[userId] = config.startingBalance;
  }

  return guild.balances[userId];
}

function getCurrentBalance(guild, userId) {
  return typeof guild.balances[userId] === 'number' ? guild.balances[userId] : config.startingBalance;
}

function getTargetMentionedUser(message) {
  const botId = client.user?.id;
  return message.mentions.users.find((user) => user.id !== botId && !user.bot) ?? null;
}

function buildTransferUsage(commandName) {
  return `Cú pháp: ${config.prefix}${commandName} @user <so_tien>.`;
}

async function handleTransfer(message, sourceUser, recipientUser, amount, actionLabel) {
  const result = updateGuildState(message.guild.id, (guild) => {
    const sourceBalance = ensureBalance(guild, sourceUser.id);
    const recipientBalance = ensureBalance(guild, recipientUser.id);

    if (sourceBalance < amount) {
      return {
        ok: false,
        reason: `${getDisplayName(message, sourceUser)} chỉ có ${formatBalance(sourceBalance)} nên không thể ${actionLabel} ${formatBalance(amount)}.`
      };
    }

    guild.balances[sourceUser.id] = sourceBalance - amount;
    guild.balances[recipientUser.id] = recipientBalance + amount;

    return {
      ok: true,
      sourceBalance: guild.balances[sourceUser.id],
      recipientBalance: guild.balances[recipientUser.id]
    };
  });

  if (!result.ok) {
    await reply(message, result.reason);
    return;
  }

  const sourceName = getDisplayName(message, sourceUser);
  const recipientName = getDisplayName(message, recipientUser);

  await reply(message, [
    `💸 ${sourceName} đã ${actionLabel} ${formatBalance(amount)} cho ${recipientName}.`,
    `${sourceName}: ${formatBalance(result.sourceBalance)}.`,
    `${recipientName}: ${formatBalance(result.recipientBalance)}.`
  ].join('\n'));
}

function getPendingXinRequest(guild, targetUserId) {
  return guild.pendingXinRequests?.[targetUserId] ?? null;
}

function cleanupExpiredXinRequests(guild, now = Date.now()) {
  if (!guild.pendingXinRequests || typeof guild.pendingXinRequests !== 'object') {
    guild.pendingXinRequests = {};
    return;
  }

  for (const [targetUserId, request] of Object.entries(guild.pendingXinRequests)) {
    if (!request || typeof request !== 'object' || Number(request.expiresAt) <= now) {
      delete guild.pendingXinRequests[targetUserId];
    }
  }
}

function buildXinDecisionUsage(commandName) {
  return `Cú pháp: ${config.prefix}${commandName} [@user].`;
}

function formatUserNameById(message, userId, fallbackName) {
  return message.guild?.members?.cache.get(userId)?.displayName ?? fallbackName ?? `<@${userId}>`;
}

function formatDiscordRelativeTimestamp(timestampMs) {
  return `<t:${Math.floor(timestampMs / 1000)}:R>`;
}

function formatDiscordFullTimestamp(timestampMs) {
  return `<t:${Math.floor(timestampMs / 1000)}:F>`;
}

function buildXinRequestEmbed(requesterName, targetName, amount, expiresAt) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Yêu cầu xin xu')
    .setDescription(`${requesterName} đang xin ${formatBalance(amount)} từ ${targetName}.`)
    .addFields(
      { name: 'Người xin', value: requesterName, inline: true },
      { name: 'Người bị xin', value: targetName, inline: true },
      { name: 'Số tiền', value: formatBalance(amount), inline: true },
      { name: 'Hết hạn', value: `${formatDiscordRelativeTimestamp(expiresAt)}\n${formatDiscordFullTimestamp(expiresAt)}`, inline: false }
    )
    .setFooter({ text: 'Bấm Đồng ý hoặc Từ chối bên dưới.' });
}

function buildXinDecisionComponents(guildId, targetUserId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`xin_accept:${guildId}:${targetUserId}`)
        .setLabel('Đồng ý')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`xin_decline:${guildId}:${targetUserId}`)
        .setLabel('Từ chối')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildGamePanel() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎲 Bảng điều khiển Tài Xỉu')
        .setDescription([
          'Chọn một nút bên dưới để thao tác.',
          `Phiên cược chung kéo dài ${Math.round(config.roundBettingWindowMs / 1000)} giây.`,
          'Khi cược, bot sẽ mở ô nhập số xu.'
        ].join('\n'))
        .setFooter({ text: 'Luật: tổng từ 11 là Tài, tổng từ 10 trở xuống là Xỉu.' })
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('game_bet:tai')
          .setLabel('Đặt Tài')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('game_bet:xiu')
          .setLabel('Đặt Xỉu')
          .setStyle(ButtonStyle.Danger)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('game_daily')
          .setLabel('Điểm danh')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('game_balance')
          .setLabel('Số dư')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('game_history')
          .setLabel('Lịch sử')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function buildInteractionMessageContext(interaction, targetUser = null, ephemeral = false) {
  return {
    author: interaction.user,
    guild: interaction.guild,
    member: interaction.member,
    channel: interaction.channel,
    mentions: {
      users: {
        find: (predicate) => targetUser && predicate(targetUser) ? targetUser : null
      }
    },
    reply: (options) => interaction.reply({
      ...options,
      ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {})
    })
  };
}

function isUnknownInteractionError(error) {
  return error?.code === 10062;
}

function buildBetModal(choice) {
  return new ModalBuilder()
    .setCustomId(`game_bet_modal:${choice}`)
    .setTitle(`Đặt ${formatSide(choice)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Số xu muốn cược')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`Tối thiểu ${config.betMin}`)
          .setRequired(true)
          .setMinLength(1)
      )
    );
}

function parseXinDecisionButtonId(customId) {
  const [action, guildId, targetUserId] = String(customId).split(':');

  if ((action !== 'xin_accept' && action !== 'xin_decline') || !guildId || !targetUserId) {
    return null;
  }

  return {
    accept: action === 'xin_accept',
    guildId,
    targetUserId
  };
}

function clearRoundTimer(guildId) {
  const timer = roundTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
  }

  roundTimers.delete(guildId);
}

function scheduleRoundTimer(guildId, closeAt) {
  clearRoundTimer(guildId);

  const delay = Math.max(0, closeAt - Date.now());
  const timer = setTimeout(() => {
    resolveRound(guildId, 'timer').catch((error) => {
      console.error(`Failed to resolve shared round for guild ${guildId}:`, error);
    });
  }, delay);

  roundTimers.set(guildId, timer);
}

function buildRoundStatusEmbed(round) {
  const closeAtSeconds = Math.floor(Number(round.closeAt) / 1000);
  const participantCount = Object.keys(round.bets ?? {}).length;
  const totalBet = sumRoundBets(round.bets ?? {});

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎲 Phiên #${round.id} đang mở`)
    .setDescription([
      `**Thời gian còn lại:** <t:${closeAtSeconds}:R>`,
      `**Đóng lúc:** <t:${closeAtSeconds}:T>`,
      '',
      'Bấm nút bên dưới để đặt Tài hoặc Xỉu.'
    ].join('\n'))
    .addFields(
      { name: 'Người tham gia', value: `**${participantCount} người**`, inline: true },
      { name: 'Tổng cược', value: `**${formatBalance(totalBet)}**`, inline: true }
    )
    .setFooter({ text: 'Mỗi người có thể cược thêm cùng lựa chọn trong phiên.' });
}

async function getTextChannel(channelId) {
  const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
  return channel && channel.isTextBased?.() ? channel : null;
}

async function updateRoundPanel(guildId) {
  const state = getGuildStateSnapshot(guildId);
  const round = state.activeRound;

  if (!round?.statusMessageId || Number(round.closeAt) <= Date.now()) {
    return;
  }

  const channel = await getTextChannel(round.channelId);
  if (!channel?.messages?.fetch) {
    return;
  }

  const panelMessage = await channel.messages.fetch(round.statusMessageId).catch(() => null);
  if (!panelMessage) {
    return;
  }

  await panelMessage.edit({
    content: '',
    embeds: [buildRoundStatusEmbed(round)],
    components: buildGamePanel().components
  });
}

async function createRoundPanel(message, roundId, closeAt) {
  if (!message.channel?.send) {
    return;
  }

  const state = getGuildStateSnapshot(message.guild.id);
  const round = state.activeRound;
  if (!round || Number(round.id) !== Number(roundId)) {
    return;
  }

  try {
    const panelMessage = await message.channel.send({
      embeds: [buildRoundStatusEmbed(round)],
      components: buildGamePanel().components,
      allowedMentions: {
        parse: []
      }
    });

    updateGuildState(message.guild.id, (guild) => {
      if (guild.activeRound && Number(guild.activeRound.id) === Number(roundId)) {
        guild.activeRound.statusMessageId = panelMessage.id;
      }
    });

  } catch (error) {
    console.error(`Failed to create round panel for guild ${message.guild.id}:`, error);
  }
}

function sumRoundBets(bets) {
  return Object.values(bets).reduce((total, bet) => total + bet.amount, 0);
}

function formatRemainingSeconds(closeAt) {
  return Math.max(0, Math.ceil((closeAt - Date.now()) / 1000));
}

function buildRoundResultEmbed(summary) {
  const resultColor = summary.result === 'tai' ? 0x2ECC71 : 0xE74C3C;
  const playerResults = summary.bets.map((bet) => {
    const outcome = bet.win ? '✅ **Thắng**' : '❌ **Thua**';
    const net = `${bet.net >= 0 ? '+' : '-'}${formatBalance(Math.abs(bet.net))}`;
    return `**${bet.playerName ?? `<@${bet.userId}>`}** — ${outcome} **${net}** | Số dư: **${formatBalance(bet.balanceAfter)}**`;
  });
  let playerResultText = playerResults.join('\n');

  if (playerResultText.length > 1024) {
    playerResultText = `${playerResultText.slice(0, 930)}\n*Danh sách quá dài, xem chi tiết bằng lịch sử.*`;
  }

  return new EmbedBuilder()
    .setColor(resultColor)
    .setTitle(`🎲 Phiên #${summary.roundId} đã chốt`)
    .setDescription(`Kết quả: **${formatDice(summary.dice)} = ${summary.total} → ${formatSide(summary.result)}**`)
    .addFields(
      { name: 'Số người tham gia', value: `**${summary.participantCount} người**`, inline: true },
      { name: 'Tổng cược', value: `**${formatBalance(summary.totalBet)}**`, inline: true },
      { name: 'Thống kê', value: `**${summary.winnerCount} thắng** · **${summary.loserCount} thua**`, inline: false },
      { name: 'Chi tiết người chơi', value: playerResultText || 'Không có dữ liệu cược.', inline: false }
    )
    .setFooter({ text: 'Bấm nút bên dưới để tham gia phiên tiếp theo.' });
}

function formatHistoryEntry(entry, index) {
  if (entry && Array.isArray(entry.bets)) {
    return `${index + 1}. Phiên #${entry.roundId} | ${formatSide(entry.result)} | ${formatDice(entry.dice)} = ${entry.total} | ${entry.participantCount} người | ${formatBalance(entry.totalBet)} | ${entry.winnerCount} thắng`;
  }

  const outcomeLabel = formatSide(entry.result);
  const diceText = Array.isArray(entry.dice) ? formatDice(entry.dice) : 'N/A';
  const playerName = entry.playerName ?? `<@${entry.userId}>`;
  const balanceText = entry.win ? `+${formatBalance(entry.amount)}` : `-${formatBalance(entry.amount)}`;

  return `${index + 1}. [Cũ] ${outcomeLabel} | ${diceText} = ${entry.total} | ${playerName} | ${entry.win ? 'Thắng' : 'Thua'} ${balanceText}`;
}

async function sendRoundResult(channelId, summary) {
  if (!channelId) {
    return;
  }

  const channel = await getTextChannel(channelId);
  if (!channel) {
    return;
  }

  const resultPayload = {
    content: '',
    embeds: [buildRoundResultEmbed(summary)],
    components: buildGamePanel().components,
    allowedMentions: {
      parse: []
    }
  };

  if (summary.statusMessageId && channel.messages?.fetch) {
    const panelMessage = await channel.messages.fetch(summary.statusMessageId).catch(() => null);
    if (panelMessage) {
      await panelMessage.edit(resultPayload);
      return;
    }
  }

  await channel.send({
    ...resultPayload
  });
}

async function resolveRound(guildId, reason = 'timer') {
  let summary = null;
  const now = Date.now();

  updateGuildState(guildId, (guild) => {
    const round = guild.activeRound;
    if (!round) {
      return null;
    }

    if (reason !== 'force' && Number(round.closeAt) > now) {
      return null;
    }

    const bets = Object.values(round.bets ?? {});
    if (bets.length === 0) {
      guild.activeRound = null;
      return null;
    }

    const roll = rollDice();
    const resolvedBets = bets.map((bet) => {
      const currentBalance = getCurrentBalance(guild, bet.userId);
      const win = bet.choice === roll.result;
      const balanceAfter = win ? currentBalance + (bet.amount * 2) : currentBalance;

      guild.balances[bet.userId] = balanceAfter;

      return {
        userId: bet.userId,
        playerName: bet.playerName,
        choice: bet.choice,
        amount: bet.amount,
        win,
        net: win ? bet.amount : -bet.amount,
        balanceAfter
      };
    });

    summary = {
      roundId: Number(round.id),
      openedAt: round.openedAt,
      closedAt: new Date().toISOString(),
      channelId: round.channelId,
      statusMessageId: round.statusMessageId,
      dice: roll.dice,
      total: roll.total,
      result: roll.result,
      participantCount: resolvedBets.length,
      totalBet: resolvedBets.reduce((total, bet) => total + bet.amount, 0),
      winnerCount: resolvedBets.filter((bet) => bet.win).length,
      loserCount: resolvedBets.filter((bet) => !bet.win).length,
      bets: resolvedBets
    };

    guild.history.unshift(summary);
    guild.history = guild.history.slice(0, config.historyLimit);
    guild.activeRound = null;
    return summary;
  });

  if (!summary) {
    return null;
  }

  clearRoundTimer(guildId);

  await sendRoundResult(summary.channelId, summary).catch((error) => {
    console.error(`Failed to send round result for guild ${guildId}:`, error);
  });

  return summary;
}

async function resolveDueRound(guildId) {
  const state = getGuildStateSnapshot(guildId);
  if (state.activeRound && Number(state.activeRound.closeAt) <= Date.now()) {
    return resolveRound(guildId, 'force');
  }

  return null;
}

function rehydrateRoundSchedulers() {
  const state = loadState();
  const guilds = state.guilds ?? {};

  for (const [guildId, guild] of Object.entries(guilds)) {
    if (!guild.activeRound) {
      continue;
    }

    const closeAt = Number(guild.activeRound.closeAt);
    if (!Number.isFinite(closeAt)) {
      continue;
    }

    if (closeAt <= Date.now()) {
      resolveRound(guildId, 'startup').catch((error) => {
        console.error(`Failed to resolve overdue shared round for guild ${guildId}:`, error);
      });
      continue;
    }

    scheduleRoundTimer(guildId, closeAt);
  }
}

function buildHelpText() {
  return [
    'Bot Tài Xỉu',
    config.useMessageContentIntent
      ? `${config.prefix}daily - nhận thưởng điểm danh mỗi ngày`
      : 'nhắc bot rồi nhập daily - nhận thưởng điểm danh mỗi ngày',
    config.useMessageContentIntent
      ? `${config.prefix}balance [@user] - xem số dư`
      : 'nhắc bot rồi nhập balance [@user] - xem số dư',
    config.useMessageContentIntent
      ? `${config.prefix}gift @user <so_tien> - gift xu cho người khác`
      : 'nhắc bot rồi nhập gift @user <so_tien> - gift xu cho người khác',
    config.useMessageContentIntent
      ? `${config.prefix}xin @user <so_tien> - gửi yêu cầu xin xu, target bấm nút Đồng ý/Từ chối`
      : 'nhắc bot rồi nhập xin @user <so_tien> - gửi yêu cầu xin xu, target bấm nút Đồng ý/Từ chối',
    config.useMessageContentIntent
      ? `${config.prefix}dongy [@user] - đồng ý yêu cầu xin xu đang chờ (fallback)`
      : 'nhắc bot rồi nhập dongy [@user] - đồng ý yêu cầu xin xu đang chờ (fallback)',
    config.useMessageContentIntent
      ? `${config.prefix}tuchoi [@user] - từ chối yêu cầu xin xu đang chờ (fallback)`
      : 'nhắc bot rồi nhập tuchoi [@user] - từ chối yêu cầu xin xu đang chờ (fallback)',
    config.useMessageContentIntent
      ? `${config.prefix}tai <so_tien> - đặt cược tài`
      : 'nhắc bot rồi nhập tai <so_tien> - đặt cược tài',
    config.useMessageContentIntent
      ? `${config.prefix}xiu <so_tien> - đặt cược xỉu`
      : 'nhắc bot rồi nhập xiu <so_tien> - đặt cược xỉu',
    config.useMessageContentIntent
      ? `${config.prefix}history - xem 10 kết quả gần nhất`
      : 'nhắc bot rồi nhập history - xem 10 kết quả gần nhất',
    '',
    `Mỗi phiên cược chung kéo dài ${Math.round(config.roundBettingWindowMs / 1000)} giây và chốt đồng bộ cho toàn server.`,
    `Thưởng chat được cộng tự động từ ${formatBalance(config.chatRewardMin)} đến ${formatBalance(config.chatRewardMax)} sau mỗi ${Math.round(config.chatRewardCooldownMs / 1000)} giây nếu tin nhắn đủ dài.`,
    config.useMessageContentIntent
      ? `Lệnh prefix đang bật với tiền tố ${config.prefix}.`
      : 'Server chưa bật Message Content Intent thì hãy nhắc bot để dùng lệnh.',
    'Luật tài xỉu: tung 3 xúc xắc, tổng >= 11 là tài, tổng <= 10 là xỉu.'
  ].join('\n');
}

async function reply(message, content, options = {}) {
  try {
    return await message.reply({
      content,
      ...options,
      allowedMentions: {
        repliedUser: false,
        ...(options.allowedMentions ?? {})
      }
    });
  } catch (error) {
    console.error('Failed to send reply:', error);
    return null;
  }
}

async function handleHelp(message) {
  await reply(message, buildHelpText());
}

function extractCommandInput(message) {
  const content = message.content?.trim() ?? '';
  if (!content) {
    return null;
  }

  const botId = client.user?.id;
  const mentionPattern = botId ? new RegExp(`^<@!?${botId}>\\s*`, 'i') : null;
  let commandText = content;
  let invokedByMention = false;

  if (mentionPattern && mentionPattern.test(commandText)) {
    commandText = commandText.replace(mentionPattern, '').trim();
    invokedByMention = true;
  }

  if (commandText.startsWith(config.prefix)) {
    commandText = commandText.slice(config.prefix.length).trim();
  } else if (!invokedByMention && !config.useMessageContentIntent) {
    return null;
  } else if (!invokedByMention && !commandText.startsWith(config.prefix)) {
    return null;
  }

  if (!commandText) {
    return { command: null, args: [], invokedByMention };
  }

  const [rawCommand, ...args] = commandText.split(/\s+/);
  return {
    command: rawCommand.toLowerCase(),
    args,
    invokedByMention
  };
}

async function handleBalance(message, args) {
  const targetUser = getTargetMentionedUser(message) ?? message.author;
  const state = getGuildStateSnapshot(message.guild.id);
  const balance = typeof state.balances[targetUser.id] === 'number' ? state.balances[targetUser.id] : config.startingBalance;
  const name = getDisplayName(message, targetUser);

  await reply(message, `${name} đang có ${formatBalance(balance)}.`);
}

async function handleGift(message, args) {
  const targetUser = getTargetMentionedUser(message);

  if (!targetUser) {
    await reply(message, buildTransferUsage('gift'));
    return;
  }

  if (targetUser.id === message.author.id) {
    await reply(message, 'Bạn không thể gift xu cho chính mình.');
    return;
  }

  const amount = parseAmount(args[1]);
  if (!amount) {
    await reply(message, buildTransferUsage('gift'));
    return;
  }

  await handleTransfer(message, message.author, targetUser, amount, 'gift');
}

async function handleXin(message, args) {
  const targetUser = getTargetMentionedUser(message);

  if (!targetUser) {
    await reply(message, buildTransferUsage('xin'));
    return;
  }

  if (targetUser.id === message.author.id) {
    await reply(message, 'Bạn không thể xin xu từ chính mình.');
    return;
  }

  const amount = parseAmount(args[1]);
  if (!amount) {
    await reply(message, buildTransferUsage('xin'));
    return;
  }

  const result = updateGuildState(message.guild.id, (guild) => {
    cleanupExpiredXinRequests(guild);

    const existingRequest = getPendingXinRequest(guild, targetUser.id);
    if (existingRequest) {
      return {
        ok: false,
        reason: `${formatUserNameById(message, targetUser.id, targetUser.username)} đang có một yêu cầu xin xu chờ xử lý từ ${formatUserNameById(message, existingRequest.requesterId, existingRequest.requesterName)}.`
      };
    }

    const now = Date.now();
    guild.pendingXinRequests[targetUser.id] = {
      requesterId: message.author.id,
      requesterName: getDisplayName(message),
      targetId: targetUser.id,
      targetName: getDisplayName(message, targetUser),
      amount,
      createdAt: now,
      expiresAt: now + config.xinRequestTimeoutMs,
      channelId: message.channel.id
    };

    return {
      ok: true,
      request: guild.pendingXinRequests[targetUser.id]
    };
  });

  if (!result.ok) {
    await reply(message, result.reason);
    return;
  }

  const requesterName = getDisplayName(message);
  const targetName = getDisplayName(message, targetUser);
  const timeoutMinutes = Math.max(1, Math.ceil(config.xinRequestTimeoutMs / 60000));

  await reply(message, [
    `🙋 ${requesterName} đã xin ${formatBalance(amount)} từ ${targetName}.`,
    `${targetName} bấm nút Đồng ý hoặc Từ chối trong ${timeoutMinutes} phút để phản hồi.`
  ].join('\n'), {
    embeds: [buildXinRequestEmbed(requesterName, targetName, amount, result.request.expiresAt)],
    components: buildXinDecisionComponents(message.guild.id, targetUser.id)
  });
}

async function handleXinDecision(message, accept) {
  const mentionedRequester = getTargetMentionedUser(message);

  const result = updateGuildState(message.guild.id, (guild) => {
    cleanupExpiredXinRequests(guild);

    const request = getPendingXinRequest(guild, message.author.id);
    if (!request) {
      return {
        ok: false,
        reason: accept ? 'Không có yêu cầu xin xu nào đang chờ đồng ý.' : 'Không có yêu cầu xin xu nào đang chờ từ chối.'
      };
    }

    if (mentionedRequester && mentionedRequester.id !== request.requesterId) {
      return {
        ok: false,
        reason: `Yêu cầu đang chờ là của ${formatUserNameById(message, request.requesterId, request.requesterName)}.`
      };
    }

    if (!accept) {
      delete guild.pendingXinRequests[message.author.id];
      return {
        ok: true,
        request,
        declined: true
      };
    }

    const targetBalance = ensureBalance(guild, message.author.id);
    if (targetBalance < request.amount) {
      delete guild.pendingXinRequests[message.author.id];
      return {
        ok: false,
        reason: `Bạn chỉ có ${formatBalance(targetBalance)} nên không thể đồng ý yêu cầu ${formatBalance(request.amount)}.`
      };
    }

    const requesterBalance = ensureBalance(guild, request.requesterId);
    guild.balances[message.author.id] = targetBalance - request.amount;
    guild.balances[request.requesterId] = requesterBalance + request.amount;
    delete guild.pendingXinRequests[message.author.id];

    return {
      ok: true,
      request,
      declined: false,
      sourceBalance: guild.balances[message.author.id],
      recipientBalance: guild.balances[request.requesterId]
    };
  });

  if (!result.ok) {
    await reply(message, result.reason);
    return;
  }

  const targetName = getDisplayName(message);
  const requesterName = formatUserNameById(message, result.request.requesterId, result.request.requesterName);

  if (result.declined) {
    await reply(message, `❎ ${targetName} đã từ chối yêu cầu xin ${formatBalance(result.request.amount)} từ ${requesterName}.`);
    return;
  }

  await reply(message, [
    `✅ ${targetName} đã đồng ý xin ${formatBalance(result.request.amount)} của ${requesterName}.`,
    `${targetName}: ${formatBalance(result.sourceBalance)}.`,
    `${requesterName}: ${formatBalance(result.recipientBalance)}.`
  ].join('\n'));
}

async function handleXinButtonInteraction(interaction, accept, parsedButton) {
  if (!interaction.inGuild() || interaction.guildId !== parsedButton.guildId) {
    await interaction.reply({
      content: 'Nút bấm không hợp lệ cho server này.',
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (interaction.user.id !== parsedButton.targetUserId) {
    await interaction.reply({
      content: 'Chỉ người bị xin mới có thể bấm nút này.',
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const result = updateGuildState(interaction.guildId, (guild) => {
    cleanupExpiredXinRequests(guild);

    const request = getPendingXinRequest(guild, parsedButton.targetUserId);
    if (!request) {
      return {
        ok: false,
        reason: 'Yêu cầu xin xu đã hết hạn hoặc không còn tồn tại.'
      };
    }

    if (!accept) {
      delete guild.pendingXinRequests[parsedButton.targetUserId];
      return {
        ok: true,
        request,
        declined: true
      };
    }

    const targetBalance = ensureBalance(guild, request.targetId);
    if (targetBalance < request.amount) {
      delete guild.pendingXinRequests[parsedButton.targetUserId];
      return {
        ok: false,
        reason: `Bạn chỉ có ${formatBalance(targetBalance)} nên không thể đồng ý yêu cầu ${formatBalance(request.amount)}.`
      };
    }

    const requesterBalance = ensureBalance(guild, request.requesterId);
    guild.balances[request.targetId] = targetBalance - request.amount;
    guild.balances[request.requesterId] = requesterBalance + request.amount;
    delete guild.pendingXinRequests[parsedButton.targetUserId];

    return {
      ok: true,
      request,
      declined: false,
      sourceBalance: guild.balances[request.targetId],
      recipientBalance: guild.balances[request.requesterId]
    };
  });

  const targetName = interaction.guild.members.cache.get(parsedButton.targetUserId)?.displayName ?? interaction.user.username;

  if (!result.ok) {
    await interaction.update({
      content: `⏳ ${result.reason}`,
      embeds: [],
      components: []
    });
    return true;
  }

  const requesterName = interaction.guild.members.cache.get(result.request.requesterId)?.displayName ?? result.request.requesterName ?? `<@${result.request.requesterId}>`;

  if (result.declined) {
    await interaction.update({
      content: `❎ ${targetName} đã từ chối yêu cầu xin ${formatBalance(result.request.amount)} từ ${requesterName}.`,
      embeds: [],
      components: []
    });
    return true;
  }

  await interaction.update({
    content: [
      `✅ ${targetName} đã đồng ý xin ${formatBalance(result.request.amount)} của ${requesterName}.`,
      `${targetName}: ${formatBalance(result.sourceBalance)}.`,
      `${requesterName}: ${formatBalance(result.recipientBalance)}.`
    ].join('\n'),
    embeds: [],
    components: []
  });

  return true;
}

async function handleDaily(message) {
  const todayKey = getTodayKey();

  const result = updateGuildState(message.guild.id, (guild) => {
    const balance = ensureBalance(guild, message.author.id);

    if (guild.lastCheckin[message.author.id] === todayKey) {
      return {
        ok: false,
        balance
      };
    }

    guild.lastCheckin[message.author.id] = todayKey;
    guild.balances[message.author.id] = balance + config.dailyReward;

    return {
      ok: true,
      reward: config.dailyReward,
      balance: guild.balances[message.author.id]
    };
  });

  if (result.ok) {
    await reply(message, `${getDisplayName(message)} đã nhận ${formatBalance(result.reward)} từ điểm danh. Số dư hiện tại: ${formatBalance(result.balance)}.`);
    return;
  }

  await reply(message, `Hôm nay bạn đã điểm danh rồi. Số dư hiện tại: ${formatBalance(result.balance)}.`);
}

async function handleBet(message, choice, rawAmount) {
  const amount = parseAmount(rawAmount);

  if (!amount) {
    await reply(message, `Số tiền không hợp lệ. Số tiền phải là số nguyên dương và tối thiểu ${formatBalance(config.betMin)}.`);
    return;
  }

  if (amount < config.betMin) {
    await reply(message, `Mức cược tối thiểu là ${formatBalance(config.betMin)}.`);
    return;
  }

  await resolveDueRound(message.guild.id);

  const result = updateGuildState(message.guild.id, (guild) => {
    const now = Date.now();
    const balance = ensureBalance(guild, message.author.id);
    let round = guild.activeRound;

    if (round && Number(round.closeAt) <= now) {
      guild.activeRound = null;
      round = null;
    }

    if (amount > balance) {
      return {
        ok: false,
        reason: `Bạn chỉ có ${formatBalance(balance)} nên không thể cược ${formatBalance(amount)}.`
      };
    }

    const existingBet = round?.bets?.[message.author.id];
    if (existingBet && existingBet.choice !== choice) {
      return {
        ok: false,
        reason: `Bạn đã cược ${formatSide(existingBet.choice)} trong phiên #${round.id}. Bạn chỉ có thể cược thêm cùng lựa chọn.`
      };
    }

    let openedNewRound = false;
    if (!round) {
      round = {
        id: guild.nextRoundId,
        openedAt: new Date().toISOString(),
        closeAt: now + config.roundBettingWindowMs,
        channelId: message.channel.id,
        bets: {}
      };
      guild.nextRoundId = round.id + 1;
      guild.activeRound = round;
      openedNewRound = true;
    }

    guild.balances[message.author.id] = balance - amount;
    if (existingBet) {
      existingBet.amount += amount;
      existingBet.playerName = getDisplayName(message);
    } else {
      round.bets[message.author.id] = {
        userId: message.author.id,
        playerName: getDisplayName(message),
        choice,
        amount
      };
    }

    guild.activeRound = round;

    return {
      ok: true,
      roundId: round.id,
      openedNewRound,
      closeAt: Number(round.closeAt),
      participantCount: Object.keys(round.bets).length,
      totalBet: sumRoundBets(round.bets),
      userTotalBet: round.bets[message.author.id].amount,
      balance: guild.balances[message.author.id]
    };
  });

  if (!result.ok) {
    await reply(message, result.reason);
    return;
  }

  if (result.openedNewRound) {
    scheduleRoundTimer(message.guild.id, result.closeAt);
  }

  const remainingSeconds = formatRemainingSeconds(result.closeAt);
  const lines = [
    `🎲 ${getDisplayName(message)} đã cược thêm ${formatBalance(amount)} vào ${formatSide(choice)} trong phiên #${result.roundId}.`,
    `Tổng cược của bạn trong phiên: ${formatBalance(result.userTotalBet)}.`,
    `Phiên này sẽ chốt sau ${remainingSeconds} giây.`,
    `Hiện có ${result.participantCount} người tham gia với tổng cược ${formatBalance(result.totalBet)}.`,
    `Số dư hiện tại: ${formatBalance(result.balance)}.`
  ];

  await reply(message, lines.join('\n'));

  if (result.openedNewRound) {
    await createRoundPanel(message, result.roundId, result.closeAt);
    return;
  }

  await updateRoundPanel(message.guild.id).catch((error) => {
    console.error(`Failed to refresh round panel for guild ${message.guild.id}:`, error);
  });
}

async function handleHistory(message) {
  const state = getGuildStateSnapshot(message.guild.id);
  const history = Array.isArray(state.history) ? state.history : [];

  if (history.length === 0) {
    await reply(message, 'Chưa có phiên nào để hiển thị.');
    return;
  }

  const lines = history.slice(0, config.historyLimit).map((entry, index) => formatHistoryEntry(entry, index));

  await reply(message, ['Lịch sử 10 phiên gần nhất:', ...lines].join('\n'));
}

function shouldGrantChatReward(message) {
  if (!message.guild || message.author.bot) {
    return false;
  }

  if (client.user && message.mentions.has(client.user)) {
    return false;
  }

  const content = message.content?.trim() ?? '';
  if (content.length > 0 && content.length < config.chatRewardMinMessageLength) {
    return false;
  }

  if (content.startsWith(config.prefix)) {
    return false;
  }

  return true;
}

function grantChatReward(message) {
  const now = Date.now();
  const snapshot = getGuildStateSnapshot(message.guild.id);
  const lastRewardAt = snapshot.lastChatRewardAt?.[message.author.id] ?? 0;

  if (now - lastRewardAt < config.chatRewardCooldownMs) {
    return;
  }

  const reward = randomInteger(config.chatRewardMin, config.chatRewardMax);

  const granted = updateGuildState(message.guild.id, (guild) => {
    const previousRewardAt = guild.lastChatRewardAt[message.author.id] ?? 0;
    if (now - previousRewardAt < config.chatRewardCooldownMs) {
      return false;
    }

    const balance = ensureBalance(guild, message.author.id);
    guild.balances[message.author.id] = balance + reward;
    guild.lastChatRewardAt[message.author.id] = now;
    return true;
  });

  return granted ? reward : 0;
}

async function handleSlashCommand(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'Lệnh này chỉ dùng được trong server.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const targetUser = interaction.options.getUser('user');
  const message = buildInteractionMessageContext(interaction, targetUser);
  const amount = interaction.options.getInteger('amount');

  switch (interaction.commandName) {
    case 'help':
      await handleHelp(message);
      return;
    case 'daily':
      await handleDaily(message);
      return;
    case 'balance':
      await handleBalance(message, []);
      return;
    case 'gift':
      await handleGift(message, [targetUser?.id, String(amount)]);
      return;
    case 'xin':
      await handleXin(message, [targetUser?.id, String(amount)]);
      return;
    case 'tai':
      await handleBet(message, 'tai', String(amount));
      return;
    case 'xiu':
      await handleBet(message, 'xiu', String(amount));
      return;
    case 'history':
      await handleHistory(message);
      return;
    case 'game':
      await interaction.reply(buildGamePanel());
      return;
    default:
      await interaction.reply({
        content: 'Lệnh slash chưa được hỗ trợ.',
        flags: MessageFlags.Ephemeral
      });
  }
}

async function handleGameButtonInteraction(interaction) {
  if (interaction.customId === 'game_bet:tai' || interaction.customId === 'game_bet:xiu') {
    await interaction.showModal(buildBetModal(interaction.customId.split(':')[1]));
    return true;
  }

  if (interaction.customId === 'game_daily') {
    await handleDaily(buildInteractionMessageContext(interaction, null, true));
    return true;
  }

  if (interaction.customId === 'game_balance') {
    await handleBalance(buildInteractionMessageContext(interaction, null, true), []);
    return true;
  }

  if (interaction.customId === 'game_history') {
    await handleHistory(buildInteractionMessageContext(interaction, null, true));
    return true;
  }

  return false;
}

async function handleBetModalInteraction(interaction) {
  const [, choice] = interaction.customId.split(':');
  if (choice !== 'tai' && choice !== 'xiu') {
    return false;
  }

  const amount = interaction.fields.getTextInputValue('amount');
  await handleBet(buildInteractionMessageContext(interaction), choice, amount);
  return true;
}

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  registerSlashCommands().catch((error) => {
    console.error('Failed to register slash commands:', error);
  });
  rehydrateRoundSchedulers();
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (await handleBetModalInteraction(interaction)) {
        return;
      }
    }

    if (interaction.isButton() && await handleGameButtonInteraction(interaction)) {
      return;
    }
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      console.warn('Interaction expired before it could be handled.');
    } else {
      console.error('Failed to handle slash interaction:', error);
    }

    if (!isUnknownInteractionError(error) && !interaction.deferred && !interaction.replied) {
      await interaction.reply({
        content: 'Đã xảy ra lỗi khi xử lý thao tác.',
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
    }
  }

  if (!interaction.isButton()) {
    return;
  }

  const parsed = parseXinDecisionButtonId(interaction.customId);
  if (!parsed) {
    return;
  }

  try {
    await handleXinButtonInteraction(interaction, parsed.accept, parsed);
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      console.warn('Xin decision interaction expired before it could be handled.');
    } else {
      console.error('Failed to handle xin button interaction:', error);
    }

    if (!isUnknownInteractionError(error) && !interaction.deferred && !interaction.replied) {
      await interaction.reply({
        content: 'Đã xảy ra lỗi khi xử lý nút bấm.',
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
    }
  }
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) {
    return;
  }

  const commandInput = extractCommandInput(message);
  if (commandInput) {
    const { command, args } = commandInput;

    if (!command) {
      return;
    }

    switch (command) {
      case 'help':
        await handleHelp(message);
        return;
      case 'balance':
        await handleBalance(message, args);
        return;
      case 'gift':
        await handleGift(message, args);
        return;
      case 'xin':
        await handleXin(message, args);
        return;
      case 'dongy':
        await handleXinDecision(message, true);
        return;
      case 'tuchoi':
        await handleXinDecision(message, false);
        return;
      case 'daily':
        await handleDaily(message);
        return;
      case 'tai':
        await handleBet(message, 'tai', args[0]);
        return;
      case 'xiu':
        await handleBet(message, 'xiu', args[0]);
        return;
      case 'history':
        await handleHistory(message);
        return;
      default:
        await reply(message, config.useMessageContentIntent
          ? `Lệnh không hợp lệ. Gõ ${config.prefix}help để xem hướng dẫn.`
          : 'Lệnh không hợp lệ. Hãy nhắc bot rồi nhập help để xem hướng dẫn.');
        return;
    }
  }

  if (shouldGrantChatReward(message)) {
    grantChatReward(message);
  }
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

client.login(config.token).catch((error) => {
  console.error('Failed to login:', error);
  process.exit(1);
});