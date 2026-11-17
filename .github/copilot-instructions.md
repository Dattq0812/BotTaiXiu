# Bot Tài Xỉu Discord

## Stack

- Node.js 18+.
- `discord.js` v14.
- `dotenv` for environment variables.

## Project Shape

- Entry point: `src/index.js`.
- State file: `data/state.json`.
- Per-guild data: balances, daily check-in, chat reward cooldown, and the last 10 game results.

## Game Rules

- Roll 3 dice for every bet.
- Total >= 11 is `tài`.
- Total <= 10 is `xỉu`.

## Behavior

- Keep all user-facing replies in Vietnamese.
- Use prefix commands only unless the user explicitly asks for slash commands.
- Chat rewards should be automatic and low-noise.
- Preserve the latest 10 bet results in history.

## Commands

- `!help`
- `!daily`
- `!balance [@user]`
- `!tai <so_tien>`
- `!xiu <so_tien>`
- `!history`

## Editing Rules

- Prefer small, focused changes.
- Use `apply_patch` for file edits.
- Validate code changes with `get_errors` or `npm start` when relevant.