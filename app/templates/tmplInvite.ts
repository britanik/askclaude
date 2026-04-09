import { IUser } from "../interfaces/users";
import { sendMessage } from "./sendMessage";
import TelegramBot from "node-telegram-bot-api";
import Dict from "../helpers/dict";
import { generateInviteCode } from "../controllers/invites";

export async function tmplInvite(user: IUser, bot: TelegramBot, dict: Dict) {
  // Get or generate an invite code for this user
  const inviteCode = await generateInviteCode(user);

  // Create the invitation message with the user's unique code
  const text = `Попробуй AskClaude AI в Telegram. Общайся текстом, голосовыми сообщениям, фотографиями. Ищи в интернете. Генерируй картинки. Ссылка: https://t.me/${process.env.CLIENT_BOT_NAME}?start=${inviteCode}`;

  const appUrl = `https://askclaude.ru/app?code=${inviteCode}`;
  const buttons = [[
    { text: '🎁 Пригласить в сторис', web_app: { url: appUrl } } as any
  ]];

  await sendMessage({ text: 'ℹ️ <b>Увеличение лимита токенов (в день):</b>\nСторис +6000 (20%) в день\nРегистрация +20000 (60%) в день', user, bot });
  await sendMessage({ text, user, bot, buttons });
}