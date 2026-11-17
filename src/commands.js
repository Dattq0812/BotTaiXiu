const { SlashCommandBuilder } = require('discord.js');

const slashCommands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Xem hướng dẫn sử dụng bot')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Nhận thưởng điểm danh hôm nay')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Xem số dư xu')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Người muốn xem số dư')
      .setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('gift')
    .setDescription('Tặng xu cho người khác')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Người nhận xu')
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName('amount')
      .setDescription('Số xu muốn tặng')
      .setMinValue(1)
      .setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('xin')
    .setDescription('Gửi yêu cầu xin xu')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Người được xin xu')
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName('amount')
      .setDescription('Số xu muốn xin')
      .setMinValue(1)
      .setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tai')
    .setDescription('Đặt cược Tài')
    .addIntegerOption((option) => option
      .setName('amount')
      .setDescription('Số xu muốn cược')
      .setMinValue(1)
      .setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('xiu')
    .setDescription('Đặt cược Xỉu')
    .addIntegerOption((option) => option
      .setName('amount')
      .setDescription('Số xu muốn cược')
      .setMinValue(1)
      .setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('history')
    .setDescription('Xem lịch sử 10 phiên gần nhất')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('game')
    .setDescription('Mở bảng điều khiển Tài Xỉu bằng nút bấm')
    .toJSON()
];

module.exports = {
  slashCommands
};
